import type { ExecutionTrace, ExecutionEvent, BlockEvidence } from '../contracts/index.js';
import type { Finding, ReplayResult, JournalEntry } from './types.js';

export function replay(trace: ExecutionTrace): ReplayResult {
  const findings: Finding[] = [];
  const note = (
    ruleId: string,
    explanation: string,
    e: ExecutionEvent,
    status: Finding['status'] = 'fail',
  ) => {
    findings.push({
      ruleId,
      status,
      severity: status === 'fail' ? 'error' : 'warning',
      explanation,
      evidenceRefs: [e.evidenceRef],
      scope: e.id,
      enforcement: {
        level: 'application_checked',
        basis: 'Offline event replay; source assertions are not independently authenticated.',
      },
    });
  };
  const evidence = new Map(trace.evidence.map((x) => [x.id, x]));
  const attempts = new Map(trace.attempts.map((x) => [x.attemptId, x]));
  const auths = new Map(trace.authorizations.map((x) => [x.authorizationRef, x]));
  const canObserve = (ref: string) => evidence.get(ref)?.provenance !== 'provider_reported';
  // Resolve final supplied cost evidence by transaction before replay, including retry aliases.
  const costsByTransaction = new Map<string, (typeof trace.costs)[number]>();
  for (const cost of trace.costs) {
    const attempt = attempts.get(cost.attemptId)!;
    if (attempt.txHash && canObserve(cost.evidenceRef))
      costsByTransaction.set(`${attempt.network}:${attempt.txHash.toLowerCase()}`, cost);
  }
  const finalBlock = (b: BlockEvidence | undefined) =>
    !!b && b.canonical && b.confirmations >= trace.confirmationPolicy.minConfirmations;
  const balances = { available: 0n, reserved: 0n, spent: 0n, refunds_received: 0n, funding: 0n };
  const journal: JournalEntry[] = [];
  function post(
    eventId: string,
    debit: JournalEntry['debit'],
    credit: JournalEntry['credit'],
    amount: bigint,
  ) {
    balances[debit] += amount;
    balances[credit] -= amount;
    journal.push({ eventId, debit, credit, amountAtomic: amount.toString() });
  }
  post('opening', 'available', 'funding', BigInt(trace.initialBudgetAtomic));
  const authorization = Object.fromEntries(
    trace.authorizations.map((a) => [
      a.authorizationRef,
      a.signatureValid === true ? 'valid' : a.signatureValid === false ? 'invalid' : 'unknown',
    ]),
  );
  const execution = Object.fromEntries(trace.attempts.map((a) => [a.attemptId, 'not_submitted']));
  const successes = new Map<string, { amount: bigint; auth: string; nonceKey: string }>();
  const refunds = new Set<string>();
  const failedTransactions = new Set<string>();
  const unresolvedReorgs = new Set<string>();
  let application = 'not_delivered';
  let promised = 0n;
  let evidenceConflict = false;
  const needsReconciliation = () => evidenceConflict || unresolvedReorgs.size > 0;
  let hadSubmission = false;
  for (const e of trace.events) {
    const attempt = e.attemptId ? attempts.get(e.attemptId)! : undefined;
    const auth = attempt ? auths.get(attempt.authorizationRef)! : undefined;
    const key = attempt?.txHash ? `${attempt.network}:${attempt.txHash.toLowerCase()}` : undefined;
    switch (e.type) {
      case 'reserve': {
        const amount = BigInt(e.amountAtomic!);
        if (amount > balances.available)
          note('B_RESERVE', 'Reservation exceeds available budget.', e);
        else post(e.id, 'reserved', 'available', amount);
        break;
      }
      case 'submitted':
      case 'submission_unknown':
        hadSubmission = true;
        if (!['chain_confirmed', 'chain_failed'].includes(execution[attempt!.attemptId]!))
          execution[attempt!.attemptId] = e.type;
        if (
          balances.reserved < BigInt(auth!.amountAtomic) &&
          authorization[auth!.authorizationRef] !== 'consumed'
        )
          note(
            'B_UNRESERVED_SUBMISSION',
            'Payment submitted without sufficient reserved budget.',
            e,
          );
        break;
      case 'chain_confirmed': {
        if (!canObserve(e.evidenceRef) || !key || !finalBlock(e.block)) {
          note(
            'X_CONFIRMATION_EVIDENCE',
            'Confirmation lacks a canonical block, required confirmations, transaction hash, or chain observation.',
            e,
            'inconclusive',
          );
          break;
        }
        if (successes.has(key)) {
          if (successes.get(key)!.auth !== auth!.authorizationRef)
            note(
              'X_TX_ASSOCIATION',
              'One transaction is attributed to multiple authorizations.',
              e,
            );
          execution[attempt!.attemptId] = 'chain_confirmed';
          unresolvedReorgs.delete(key);
          break;
        }
        if (failedTransactions.has(key)) {
          note(
            'X_CONFLICTING_RECEIPT',
            'A failed transaction cannot confirm successfully without an intervening reorg.',
            e,
          );
          evidenceConflict = true;
          break;
        }
        const nonceKey = `${auth!.domain.chainId}:${auth!.domain.verifyingContract.toLowerCase()}:${auth!.fromAddress.toLowerCase()}:${auth!.nonce.toLowerCase()}`;
        if ([...successes.values()].some((x) => x.nonceKey === nonceKey))
          note(
            'A_NONCE_REUSE',
            'The same token authorization is reported successful in two transactions.',
            e,
          );
        if (successes.size > 0)
          note(
            'X_DUPLICATE_BUSINESS_PAYMENT',
            'This business job has more than one confirmed payment, even if both authorizations are independently valid.',
            e,
          );
        const cost = costsByTransaction.get(key);
        const amount =
          cost?.actualDebitAtomic != null && canObserve(cost.evidenceRef)
            ? BigInt(cost.actualDebitAtomic)
            : BigInt(auth!.amountAtomic);
        if (cost?.actualDebitAtomic != null && amount !== BigInt(auth!.amountAtomic)) {
          note(
            'C_EXACT_DEBIT',
            'Observed debit disagrees with the supported exact-transfer authorization; record the debit but require reconciliation.',
            e,
          );
          evidenceConflict = true;
        }
        const reserved = balances.reserved < amount ? balances.reserved : amount;
        if (reserved > 0n) post(e.id, 'spent', 'reserved', reserved);
        if (amount > reserved) {
          note(
            'B_UNRESERVED_SPEND',
            'Observed debit exceeds the reservation; the excess is accounted against available funds.',
            e,
          );
          post(e.id, 'spent', 'available', amount - reserved);
        }
        successes.set(key, { amount, auth: auth!.authorizationRef, nonceKey });
        for (const alias of trace.attempts.filter(
          (a) =>
            a.network === attempt!.network &&
            a.txHash?.toLowerCase() === attempt!.txHash?.toLowerCase(),
        ))
          execution[alias.attemptId] = 'chain_confirmed';
        authorization[auth!.authorizationRef] = 'consumed';
        unresolvedReorgs.delete(key);
        break;
      }
      case 'chain_failed':
        if (canObserve(e.evidenceRef) && key && finalBlock(e.block)) {
          if (successes.has(key)) {
            note(
              'X_CONFLICTING_RECEIPT',
              'A confirmed transaction cannot fail without a reorg reconciliation.',
              e,
            );
            evidenceConflict = true;
          } else {
            for (const alias of trace.attempts.filter(
              (a) =>
                a.network === attempt!.network &&
                a.txHash?.toLowerCase() === attempt!.txHash?.toLowerCase(),
            ))
              execution[alias.attemptId] = 'chain_failed';
            failedTransactions.add(key);
            unresolvedReorgs.delete(key);
          }
        } else
          note(
            'X_FAILURE_EVIDENCE',
            'Provider failure or insufficient block evidence does not prove a chain failure.',
            e,
            'inconclusive',
          );
        break;
      case 'reorg': {
        if (!canObserve(e.evidenceRef)) {
          note(
            'X_REORG_EVIDENCE',
            'Provider-reported reorg requires chain reconciliation.',
            e,
            'inconclusive',
          );
          unresolvedReorgs.add(key ?? attempt!.attemptId);
          break;
        }
        const prior = key && successes.get(key);
        if (key) failedTransactions.delete(key);
        if (prior) {
          post(e.id, 'reserved', 'spent', prior.amount);
          successes.delete(key!);
          authorization[prior.auth] = 'unknown';
        }
        for (const alias of trace.attempts.filter(
          (a) =>
            a.attemptId === attempt!.attemptId ||
            (key &&
              a.network === attempt!.network &&
              a.txHash?.toLowerCase() === attempt!.txHash?.toLowerCase()),
        ))
          execution[alias.attemptId] = 'unresolved';
        application = 'reconciliation';
        unresolvedReorgs.add(key ?? attempt!.attemptId);
        note(
          'X_REORG',
          'Old confirmation invalidated; budget returned to reserved pending reconciliation.',
          e,
          'inconclusive',
        );
        break;
      }
      case 'authorization_closed': {
        const a = auths.get(e.authorizationRef!)!;
        const c = e.closure!;
        const expired = c.reason !== 'expired' || c.blockTimestamp >= a.validBefore;
        if (authorization[a.authorizationRef] === 'consumed')
          note(
            'A_CLOSURE_CONFLICT',
            'An authorization already consumed in the canonical trace cannot be closed as unused.',
            e,
          );
        else if (
          canObserve(e.evidenceRef) &&
          finalBlock(c.block) &&
          c.nonceUnused &&
          c.pendingAttemptsReconciled &&
          expired
        ) {
          authorization[a.authorizationRef] = c.reason;
          for (const attempt of trace.attempts.filter(
            (x) => x.authorizationRef === a.authorizationRef,
          )) {
            unresolvedReorgs.delete(
              attempt.txHash
                ? `${attempt.network}:${attempt.txHash.toLowerCase()}`
                : attempt.attemptId,
            );
            if (
              ['submitted', 'submission_unknown', 'unresolved'].includes(
                execution[attempt.attemptId]!,
              )
            )
              execution[attempt.attemptId] = 'reconciled_no_payment';
          }
        } else
          note(
            'B_UNSAFE_CLOSURE',
            'Local time, cancellation request, or failed submission alone cannot close an executable authorization.',
            e,
          );
        break;
      }
      case 'release': {
        const allClosed =
          trace.authorizations.length > 0 &&
          trace.authorizations.every((a) =>
            ['expired', 'cancelled', 'consumed'].includes(authorization[a.authorizationRef]!),
          );
        if (
          !allClosed ||
          needsReconciliation() ||
          (!hadSubmission && trace.authorizations.length === 0)
        )
          note(
            'B_UNSAFE_RELEASE',
            'Reservation remains locked until every authorization is consumed or safely closed and reconciliation is complete.',
            e,
          );
        else if (BigInt(e.amountAtomic!) > balances.reserved)
          note('B_RELEASE_EXCESS', 'Release exceeds reserved funds.', e);
        else post(e.id, 'available', 'reserved', BigInt(e.amountAtomic!));
        break;
      }
      case 'delivered':
        if (application !== 'inventory_committed') application = 'delivered';
        break;
      case 'inventory_committed':
        if (!successes.size || needsReconciliation() || application !== 'delivered')
          note(
            'X_PREMATURE_COMMIT',
            'Inventory commit lacks confirmed payment and prior delivery.',
            e,
          );
        else application = 'inventory_committed';
        break;
      case 'application_failed':
        application = 'failed';
        break;
      case 'refund_promised':
        promised += BigInt(e.amountAtomic!);
        break;
      case 'refund_received': {
        const refundKey = e.transactionHash!.toLowerCase();
        if (!canObserve(e.evidenceRef) || !finalBlock(e.block))
          note(
            'R_REFUND_EVIDENCE',
            'A refund claim is not a received refund without chain evidence.',
            e,
            'inconclusive',
          );
        else if (!refunds.has(refundKey)) {
          post(e.id, 'available', 'refunds_received', BigInt(e.amountAtomic!));
          refunds.add(refundKey);
        }
        break;
      }
    }
  }
  const anchor = trace.events.at(-1);
  if (anchor && promised > -balances.refunds_received)
    note(
      'R_REFUND_PENDING',
      'Refund promised but not fully received; actual spend is unchanged.',
      anchor,
      'inconclusive',
    );
  if (
    anchor &&
    Object.values(execution).some((x) =>
      ['submitted', 'submission_unknown', 'unresolved'].includes(x),
    )
  )
    note(
      'X_UNRESOLVED',
      'At least one attempt still requires reconciliation; a timeout is not proof of non-payment.',
      anchor,
      'inconclusive',
    );
  const settlement = needsReconciliation()
    ? 'reconciliation'
    : successes.size
      ? application === 'inventory_committed'
        ? 'inventory_committed'
        : 'confirmed-uncommitted'
      : Object.values(execution).includes('chain_failed')
        ? 'chain_failed'
        : hadSubmission
          ? 'unresolved'
          : 'not_submitted';
  if (anchor && settlement === 'confirmed-uncommitted')
    note(
      'R_CONFIRMED_UNCOMMITTED',
      'Chain payment is confirmed; application inventory commit is not.',
      anchor,
      'inconclusive',
    );
  return {
    authorization,
    execution,
    application,
    settlement,
    journal,
    confirmedTransactions: [...successes.keys()],
    findings,
    budget: {
      available: balances.available.toString(),
      reserved: balances.reserved.toString(),
      spent: balances.spent.toString(),
      refunds_received: (-balances.refunds_received).toString(),
      conserved: Object.values(balances).reduce((a, b) => a + b, 0n) === 0n,
    },
  };
}
