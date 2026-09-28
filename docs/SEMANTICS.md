# Execution and economic semantics

## Scope and time

`execution_market_v1` models one buyer, one merchant, fixed facilitator-like execution providers, and a network sink on an abstract rail. It is a procurement environment, not a blockchain or x402 implementation. Prices and cash are integer simulated atomic units, unrelated to actual USDC. One job may be delivered once for utility even if Diagnostic authorizes multiple payments.

At epoch `t`, the engine processes due events, produces an observation, accepts one action batch, and advances to `t+1`. Equal-time events use stable insertion order. Zero-delay execution is processed after the current batch, so its proceeds cannot fund another action within that same batch. After `epochs` decisions, no new actions are accepted. Outstanding events drain until the inclusive time `epochs + drain_epochs`; remaining events are censored and reservations remain visible.

Outcomes are indexed by `(world_id, seed, job_id, logical_provider_id, provider_attempt_ordinal, event_type)`. The implementation hashes that tuple into a uniform variate. A policy's extra queries or random calls cannot alter another provider's or job's outcomes. A genuine new authorization intentionally receives another per-job/provider attempt ordinal. Rebroadcast does not.

## Four kinds of state

| Dimension | Representation |
| --- | --- |
| Authorization | Unique attempt; same-authorization rebroadcast versus a new authorization |
| Execution truth | Rejected before submission, hidden submitted outcome, chain confirmed or failed |
| Delivery | Delivered service, delivery failure, optional refund claim and receipt |
| Buyer budget knowledge | Known available/reserved/spent/receivable projection |

The authoritative ledger moves cash at virtual chain confirmation. Public postings can be delayed. A buyer therefore cannot infer an undisclosed settlement from its observation: the public ledger retains the earlier reservation. `query` can expose an already resolved outcome; it emits `query_pending` if the outcome is still unknown. It never rolls another outcome or accelerates execution.

Known submission and unknown submission can share identical actual timing and confirmation-disclosure delay. Known submission exposes its submitted-attempt fee; unknown submission holds that fee in the visible reservation until evidence arrives. Both have identical available balances before disclosure. This difference in knowledge follows the fee rule; the underlying cash outcomes are identical under identical actions.

Confirmation and service delivery are separate. `chain_confirmed` alone does not add job value. A service failure can create a receivable if the scenario promises a refund. Only the scheduled refund transfer makes that claim spendable. The simulator does not physically delete historical attempts.

## Accounting

Each cash transfer contains two postings whose deltas sum to zero. All cash accounts stay nonnegative and their sum equals the initial buyer budget. Merchant/provider/network cash starts at zero.

```text
reserve:     buyer.available -> buyer.reserved
attempt fee: buyer.reserved  -> provider.available
network:     provider.available -> network.available
success:     buyer.reserved  -> merchant.available
safe release: buyer.reserved -> buyer.available
refund:      merchant.available -> buyer.available
```

`spent = initial_budget - available - reserved` is cumulative net outflow, not a cash account. `receivable` is a memo claim, not an asset that can fund actions. Public and hidden ledgers each conserve cash; they can differ temporarily because evidence is delayed. In the standard suite, all outcomes are disclosed within the drain and their final buyer views agree.

Both supported fee rules reserve `job.amount + provider.fee` before an attempt. Under `on_submission`, every submitted attempt pays its fee, including a revert. Rejection before submission pays nothing. Under `on_success`, only a confirmed attempt pays its fee; failed attempts release the fee reservation. A provider transfers its declared network cost when its fee is charged. This is the modeled fee contract, not an estimate of gas actually paid by a real provider. v0.1 requires `network_cost <= fee` and has no provider credit line.

## Utility and failure

```text
utility = value of distinct delivered jobs
        - service payments + refunds
        - buyer execution fees
        - explicit late-delivery costs
        - explicit unsuccessful-execution costs
        - explicit non-execution costs
```

Delay cost is `max(0, actual_delivery_epoch - deadline) * delay_cost`. Value is credited when the public trace contains delivery evidence; the event states the actual virtual delivery epoch. A job still undelivered by the drain incurs `failure_cost` if at least one attempt was submitted, otherwise `non_execution_cost`. These two costs are mutually exclusive. Zero is the default in most scenarios. Not receiving the service already means no delivered value; its full value is not subtracted again.

Risk-threshold jobs have `value == amount` and an explicit non-execution cost of 2000 to model a required procurement decision. This makes skipping the job economically different from choosing a provider and receiving an execution failure. The cost is disclosed in the observation and counted in utility. Without that contract, rejecting a procurement with no positive service surplus could be optimal, invalidating the provider-selection threshold exercise.

Metrics estimate **observed evidence at the finite drain horizon**. They are not estimates of eventual undisclosed settlement. `pending_attempts`, `unrecovered_unknowns`, and `complete_outcome_coverage` expose censoring. Hidden truth remains in the evaluator artifact. Do not interpret zero *observed* duplicate payments in a censored episode as proof that no duplicate occurred on the hidden rail.

## Guards and opportunities

Guarded blocks a new authorization while an earlier authorization is unresolved or has confirmed/possibly delivered. It also blocks plain `select` from bypassing that rule. Diagnostic allows an explicitly requested `retry(new_authorization)` to pass that authorization guard. A confirmed service failure remains conservatively protected in v0.1; automatic re-purchasing after a refund is not modeled.

Budget checks apply in both tracks. A buyer can spend only its public known available cash. A local timeout, job deadline, repeated action ID, and malformed action do not release a reservation. A declined job cannot later be selected. Confirmed rail failures can be retried with a new authorization, subject to remaining time and budget.

Invalid batches are rejected as a whole, consume one epoch and are not repaired. Semantic errors reject the affected action within a valid batch; later actions are processed in order. Repeated action IDs are rejected. At most 64 actions fit one batch.

## Policy interpretation

`expected-cost` maximizes a one-attempt expected net utility, including explicit losses and fee rules. It does not solve all future liquidity or censored-refund dynamics. `bayesian` uses the same estimator with a Beta(1,1) failure posterior when failure probabilities are hidden; public probabilities take precedence. Thus the two policies intentionally coincide in the supplied public track. `thompson` samples that posterior only when probabilities are hidden, using a separate deterministic policy RNG.

The hidden-probability suite varies rail failure probability, with no unobserved service failure or rejection. General custom hidden scenarios would need additional posteriors: current rules assume zero unknown service-failure/rejection probabilities. This is a baseline limitation, not privileged access.

`budget-aware` heuristically reserves funds for the earliest disclosed, positive-surplus future job, using the lowest currently visible fee as an estimate. It never consults undisclosed jobs. `exact-dp` is exact only for a single public job, immediate outcomes, no service failure or pre-submission rejection, submission fees, and at most 30 remaining decisions. It includes repeat attempts after failure and can choose to stop. It refuses asynchronous/multi-job worlds.
