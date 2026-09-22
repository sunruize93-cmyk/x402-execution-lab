import { parseTrace, type ExecutionTrace } from '../contracts/index.js';
import knownDeployments from '../contracts/known-deployments.json' with { type: 'json' };
import { digest, jobHash } from './hash.js';
import { replay } from './replay.js';
import type { Finding, Report, Status, EnforcementLevel } from './types.js';
export { digest, jobHash, replay };
export type * from './types.js';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const total = (values: (string | null)[]) =>
  values.length && values.every((x) => x !== null)
    ? values.reduce<bigint>((a, b) => a + BigInt(b!), 0n).toString()
    : null;

/** Pure offline checker. No RPC, HTTP, key loading, signature generation, or execution. */
export function checkTrace(input: unknown): Report {
  const trace: ExecutionTrace = parseTrace(input);
  const findings: Finding[] = [];
  const evidence = new Map(trace.evidence.map((x) => [x.id, x]));
  const observed = (id: string) => evidence.get(id)?.provenance !== 'provider_reported';
  function add(
    ruleId: string,
    status: Status,
    explanation: string,
    scope: string,
    refs: string[],
    level: EnforcementLevel = 'application_checked',
    basis = 'Checked against supplied trace; no network attestation.',
  ) {
    findings.push({
      ruleId,
      status,
      severity: status === 'fail' ? 'error' : status === 'inconclusive' ? 'warning' : 'info',
      explanation,
      scope,
      evidenceRefs: refs,
      enforcement: { level, basis },
    });
  }
  const job = trace.job;
  const quotes = new Map(trace.quotes.map((q) => [q.quoteId, q]));
  if (!trace.quotes.length)
    add('Q_PRESENT', 'inconclusive', 'No quote was supplied.', job.jobId, []);
  if (!trace.authorizations.length)
    add('A_PRESENT', 'inconclusive', 'No authorization was supplied.', job.jobId, []);
  if (!trace.attempts.length)
    add('X_PRESENT', 'inconclusive', 'No execution attempt was supplied.', job.jobId, []);
  for (const q of trace.quotes) {
    const refs = [q.evidenceRef];
    add(
      'Q_JOB_HASH',
      q.jobHash === jobHash(job) ? 'pass' : 'fail',
      'Quote must refer to the domain-separated canonical job hash.',
      q.quoteId,
      refs,
    );
    add(
      'Q_IDENTITY',
      q.network === job.network && same(q.assetId, job.assetId) && same(q.payee, job.payee)
        ? 'pass'
        : 'fail',
      'Quote chain, asset address, and payee must match the job.',
      q.quoteId,
      refs,
    );
    add(
      'Q_UNITS',
      q.decimals === job.decimals && q.serviceAmountAtomic === job.serviceAmountAtomic
        ? 'pass'
        : 'fail',
      'Compare atomic integer amounts and asset decimals, never display-token floats.',
      q.quoteId,
      refs,
    );
    const selectionTimes = trace.events
      .filter((e) => e.type === 'quote_selected' && e.quoteId === q.quoteId)
      .map((e) => e.at);
    const signedTimes = trace.authorizations
      .filter((a) => a.quoteId === q.quoteId)
      .map((a) => a.observedAt);
    const times = [...selectionTimes, ...signedTimes];
    add(
      'Q_EXPIRY',
      !times.length
        ? 'inconclusive'
        : times.every((t) => t < q.expiresAt && t < job.deadline)
          ? 'pass'
          : 'fail',
      'Quote and job deadline are checked when selected or authorized, not when a late receipt arrives.',
      q.quoteId,
      refs,
      'signer_checked',
    );
    const disclosed =
      q.feePayer !== 'unknown' &&
      q.feeComponents !== null &&
      q.feeComponents.every((f) => f.amountAtomic !== null && f.payer !== 'unknown') &&
      q.failureFeePolicy !== 'unknown';
    add(
      'F_DISCLOSURE',
      disclosed ? 'pass' : 'inconclusive',
      'Missing fee amounts, payer, or failure policy remain unknown.',
      q.quoteId,
      refs,
      disclosed ? 'application_checked' : 'unknown',
    );
    const payerFees = q.feeComponents?.filter((f) => f.payer === 'payer') ?? [];
    const unsupportedFee = payerFees.some(
      (f) => !same(f.assetId, job.assetId) || f.amountAtomic === null,
    );
    const expected =
      BigInt(job.serviceAmountAtomic) +
      payerFees.reduce((v, f) => v + BigInt(f.amountAtomic ?? '0'), 0n);
    add(
      'F_PAYER_TOTAL',
      !disclosed || q.payerTotalMaxAtomic === null || unsupportedFee
        ? 'inconclusive'
        : BigInt(q.payerTotalMaxAtomic) === expected
          ? 'pass'
          : 'fail',
      'The disclosed exact payer total includes service and payer fees only. Merchant fees and native gas are separate.',
      q.quoteId,
      refs,
    );
    add(
      'F_SECOND_AUTHORIZATION',
      payerFees.some((f) => BigInt(f.amountAtomic ?? '0') > 0n) ? 'inconclusive' : 'not_applicable',
      'Separate payer fees need an independently verified compatible authorization path; v0.1 does not execute them.',
      q.quoteId,
      refs,
      'unsupported',
    );
  }
  for (const a of trace.authorizations) {
    const q = quotes.get(a.quoteId)!;
    const deployment = trace.deployments.find(
      (d) =>
        trace.tokenLabel === 'local-test-token' &&
        d.network === 'eip155:31337' &&
        d.network === job.network &&
        same(d.contract, job.assetId) &&
        d.codeHash === knownDeployments.localTestTokenCodeHash &&
        evidence.get(d.evidenceRef)?.provenance === 'local_chain',
    );
    const binding =
      a.jobId === job.jobId &&
      same(a.payee, job.payee) &&
      same(a.domain.verifyingContract, job.assetId) &&
      `eip155:${a.domain.chainId}` === job.network &&
      a.amountAtomic === job.serviceAmountAtomic;
    const supported = a.scheme === 'eip3009';
    add(
      'A_SCHEME',
      supported ? 'pass' : 'inconclusive',
      'Only the EIP-3009 TransferWithAuthorization structure is supported.',
      a.authorizationRef,
      [a.evidenceRef],
      supported ? 'application_checked' : 'unsupported',
    );
    add(
      'A_BINDING',
      binding ? 'pass' : 'fail',
      'Authorization binds token, chain, payee, amount, and business association.',
      a.authorizationRef,
      [a.evidenceRef],
      'application_checked',
    );
    add(
      'A_SIGNATURE',
      !supported || a.signatureValid === null ? 'inconclusive' : a.signatureValid ? 'pass' : 'fail',
      'Adapter reports verification of the original EIP-712 signature; unsigned job metadata is not part of that signature.',
      a.authorizationRef,
      [a.evidenceRef],
      a.signatureValid === null ? 'unknown' : 'signer_checked',
    );
    add(
      'A_VALIDITY',
      a.validAfter < a.observedAt && a.observedAt < a.validBefore ? 'pass' : 'fail',
      'Authorization must be usable within its signed validity window at issuance.',
      a.authorizationRef,
      [a.evidenceRef],
      'signer_checked',
    );
    add(
      'A_CAP',
      q.payerTotalMaxAtomic === null
        ? 'inconclusive'
        : BigInt(a.amountAtomic) <= BigInt(q.payerTotalMaxAtomic)
          ? 'pass'
          : 'fail',
      'Signed transfer cannot exceed the disclosed payer cap.',
      a.authorizationRef,
      [a.evidenceRef],
      'signer_checked',
    );
    add(
      'A_CONTRACT_ENFORCEMENT',
      deployment && supported && a.signatureValid === true && binding ? 'pass' : 'inconclusive',
      'On-chain amount, nonce and validity enforcement requires identified bytecode and an applicable token call; a valid signature alone is insufficient.',
      a.authorizationRef,
      [a.evidenceRef, ...(deployment ? [deployment.evidenceRef] : [])],
      deployment && supported && a.signatureValid === true && binding
        ? 'onchain_enforced'
        : 'unknown',
      deployment
        ? `local-test-token ${deployment.contract}; bytecode ${deployment.codeHash}; deployment ${deployment.transactionHash}; transferWithAuthorization`
        : 'No recognized contract deployment in supplied evidence.',
    );
  }
  for (const a of trace.attempts) {
    const auth = trace.authorizations.find((x) => x.authorizationRef === a.authorizationRef)!;
    add(
      'X_ASSOCIATION',
      a.jobId === job.jobId &&
        a.network === job.network &&
        a.quoteId === auth.quoteId &&
        auth.jobId === a.jobId
        ? 'pass'
        : 'fail',
      'Attempt belongs to this job, quote, authorization, and chain.',
      a.attemptId,
      [auth.evidenceRef],
    );
  }
  const state = replay(trace);
  findings.push(...state.findings);
  add(
    'B_CONSERVATION',
    state.budget.conserved ? 'pass' : 'fail',
    'Double-entry journal conserves available + reserved + spent - refunds_received.',
    job.jobId,
    [],
  );
  add(
    'X_BUSINESS_IDEMPOTENCY',
    state.confirmedTransactions.length > 1
      ? 'fail'
      : state.confirmedTransactions.length === 1
        ? 'pass'
        : 'inconclusive',
    'A business job has at most one canonical successful payment; retry observations of the same transaction count once.',
    job.jobId,
    trace.events.filter((e) => e.type === 'chain_confirmed').map((e) => e.evidenceRef),
  );
  const canonicalCosts = trace.costs.filter((c) => {
    const a = trace.attempts.find((x) => x.attemptId === c.attemptId)!;
    return (
      !!a.txHash && state.confirmedTransactions.includes(`${a.network}:${a.txHash.toLowerCase()}`)
    );
  });
  const uniqueCosts = [
    ...new Map(
      canonicalCosts.map((c) => {
        const a = trace.attempts.find((x) => x.attemptId === c.attemptId)!;
        return [`${a.network}:${a.txHash!.toLowerCase()}`, c] as const;
      }),
    ).values(),
  ];
  for (const c of trace.costs) {
    const attemptForCost = trace.attempts.find((a) => a.attemptId === c.attemptId)!;
    const aliases = trace.costs.filter((other) => {
      const otherAttempt = trace.attempts.find((a) => a.attemptId === other.attemptId)!;
      return (
        !!attemptForCost.txHash &&
        otherAttempt.txHash?.toLowerCase() === attemptForCost.txHash.toLowerCase() &&
        otherAttempt.network === attemptForCost.network
      );
    });
    const costFingerprint = ({ attemptId: _a, evidenceRef: _e, ...cost }: typeof c) => digest(cost);
    add(
      'C_RECEIPT_ASSOCIATION',
      !attemptForCost.txHash
        ? 'inconclusive'
        : aliases.some((other) => costFingerprint(other) !== costFingerprint(c))
          ? 'fail'
          : 'pass',
      'Receipt costs need a transaction hash and consistent observations across retry attempts.',
      c.attemptId,
      [c.evidenceRef],
    );
    if (state.execution[c.attemptId] === 'chain_failed')
      add(
        'C_FAILED_DEBIT',
        c.actualDebitAtomic === null || c.actualCreditAtomic === null
          ? 'inconclusive'
          : c.actualDebitAtomic === '0' && c.actualCreditAtomic === '0'
            ? 'pass'
            : 'fail',
        'A reverted token transfer cannot debit or credit token balances; native gas may still be spent.',
        c.attemptId,
        [c.evidenceRef],
      );
    add(
      'C_IDENTITY',
      c.network === job.network && same(c.assetId, job.assetId) ? 'pass' : 'fail',
      'Cost observations must use the same chain and token asset as the payment job.',
      c.attemptId,
      [c.evidenceRef],
    );
    add(
      'C_GAS_MEASUREMENT',
      c.gasMeasurement === 'gas_limit'
        ? 'fail'
        : c.gasMeasurement === 'receipt' && c.gasUsed !== null && c.effectiveGasPrice !== null
          ? c.gasLimit !== null && BigInt(c.gasUsed) > BigInt(c.gasLimit)
            ? 'fail'
            : 'pass'
          : 'inconclusive',
      'Execution cost uses receipt gasUsed × effectiveGasPrice; gas limit is not gas spent.',
      c.attemptId,
      [c.evidenceRef],
    );
    add(
      'C_CHAIN_FEES',
      trace.confirmationPolicy.chainSpecificFees === 'unknown' ||
        c.extraChainFeesStatus === 'unknown' ||
        (trace.confirmationPolicy.chainSpecificFees === 'required' &&
          (c.extraChainFeesStatus !== 'complete' || c.extraChainFeesAtomic === null))
        ? 'inconclusive'
        : 'pass',
      'Chain-specific fees are complete, explicitly inapplicable, or unknown; absence is not zero.',
      c.attemptId,
      [c.evidenceRef],
    );
    const attempt = trace.attempts.find((a) => a.attemptId === c.attemptId)!;
    const q = quotes.get(attempt.quoteId)!;
    add(
      'C_DEBIT_CAP',
      c.actualDebitAtomic === null || q.payerTotalMaxAtomic === null || !observed(c.evidenceRef)
        ? 'inconclusive'
        : BigInt(c.actualDebitAtomic) <= BigInt(q.payerTotalMaxAtomic)
          ? 'pass'
          : 'fail',
      'Actual observed token debit must not exceed the payer cap; native gas is not automatically added.',
      c.attemptId,
      [c.evidenceRef],
    );
    if (uniqueCosts.includes(c))
      add(
        'C_MERCHANT_CREDIT',
        c.actualCreditAtomic === null || !observed(c.evidenceRef)
          ? 'inconclusive'
          : c.actualCreditAtomic === job.serviceAmountAtomic
            ? 'pass'
            : 'fail',
        'Exact payment must credit the merchant the service amount.',
        c.attemptId,
        [c.evidenceRef],
      );
  }
  if (!trace.costs.length)
    add('C_PRESENT', 'inconclusive', 'No receipt or balance-delta costs supplied.', job.jobId, []);
  if (uniqueCosts.length < state.confirmedTransactions.length)
    add(
      'C_MISSING_RECEIPT',
      'inconclusive',
      'A confirmed payment lacks cost and balance-delta evidence.',
      job.jobId,
      [],
    );
  const debit =
    uniqueCosts.length === state.confirmedTransactions.length
      ? total(uniqueCosts.map((c) => (observed(c.evidenceRef) ? c.actualDebitAtomic : null)))
      : null;
  const credit =
    uniqueCosts.length === state.confirmedTransactions.length
      ? total(uniqueCosts.map((c) => (observed(c.evidenceRef) ? c.actualCreditAtomic : null)))
      : null;
  const activeQuotes = [
    ...new Set(
      uniqueCosts.map((c) => trace.attempts.find((a) => a.attemptId === c.attemptId)!.quoteId),
    ),
  ].map((id) => quotes.get(id)!);
  const merchantFees = activeQuotes.flatMap(
    (q) => q.feeComponents?.filter((f) => f.payer === 'merchant') ?? [],
  );
  const merchantKnown =
    activeQuotes.every((q) => q.feeComponents !== null && q.feePayer !== 'unknown') &&
    merchantFees.every(
      (f) =>
        f.status === 'paid' &&
        f.amountAtomic !== null &&
        same(f.assetId, job.assetId) &&
        f.evidenceRef &&
        observed(f.evidenceRef),
    );
  const receiptCosts = [
    ...new Map(
      trace.costs.map((c) => {
        const a = trace.attempts.find((x) => x.attemptId === c.attemptId)!;
        return [`${a.network}:${a.txHash?.toLowerCase() ?? a.attemptId}`, c] as const;
      }),
    ).values(),
  ];
  const native = total(
    receiptCosts.map((c) =>
      observed(c.evidenceRef) &&
      c.gasMeasurement === 'receipt' &&
      c.gasUsed !== null &&
      c.effectiveGasPrice !== null
        ? (BigInt(c.gasUsed) * BigInt(c.effectiveGasPrice)).toString()
        : null,
    ),
  );
  const extra = total(
    receiptCosts.map((c) =>
      c.extraChainFeesStatus === 'not_applicable' &&
      trace.confirmationPolicy.chainSpecificFees === 'none'
        ? '0'
        : c.extraChainFeesStatus === 'complete' && observed(c.evidenceRef)
          ? c.extraChainFeesAtomic
          : null,
    ),
  );
  const coverage = {
    evaluated: findings.filter((f) => f.status !== 'not_applicable').length,
    pass: 0,
    fail: 0,
    inconclusive: 0,
    not_applicable: 0,
  };
  for (const f of findings) coverage[f.status]++;
  const { findings: ignored, ...projection } = state;
  void ignored;
  return {
    schemaVersion: '1.0.0',
    toolVersion: '0.1.0',
    traceId: trace.traceId,
    traceDigest: digest(trace),
    scope: {
      adapter: trace.adapter.name,
      revision: trace.adapter.revision,
      network: job.network,
      tokenLabel: trace.tokenLabel,
      jobId: job.jobId,
    },
    status: coverage.fail ? 'fail' : coverage.inconclusive ? 'inconclusive' : 'pass',
    coverage,
    findings,
    replay: projection,
    fees: {
      payerDebitAtomic: debit,
      merchantCreditAtomic: credit,
      merchantNetAtomic:
        credit !== null && merchantKnown
          ? (
              BigInt(credit) - merchantFees.reduce((n, f) => n + BigInt(f.amountAtomic!), 0n)
            ).toString()
          : null,
      nativeGasCostAtomic: native,
      extraChainFeesAtomic: extra,
      costCoverage: !trace.costs.length
        ? 'unknown'
        : native !== null &&
            extra !== null &&
            !findings.some(
              (f) => f.ruleId.startsWith('C_') && ['fail', 'inconclusive'].includes(f.status),
            )
          ? 'complete'
          : 'partial',
    },
    evidence: trace.evidence,
    limitations: [
      'Offline consistency check of supplied evidence, not independent chain authentication or a security certification.',
      'Synthetic and local-test-token outcomes do not demonstrate production USDC or provider compatibility.',
      'No FX conversion, L2 fee estimation, or separate payer-fee execution is implemented.',
    ],
  };
}

/** 0 conformant under chosen coverage policy; 1 fail; 2 incomplete; 3 runner error. */
export function reportExitCode(
  report: Report,
  options: { allowIncomplete?: boolean; requireRules?: string[] } = {},
): 0 | 1 | 2 {
  if (report.coverage.fail) return 1;
  if (
    options.requireRules?.some(
      (rule) =>
        !report.findings.some((f) => f.ruleId === rule) ||
        report.findings.some(
          (f) => f.ruleId === rule && f.status !== 'pass' && f.status !== 'not_applicable',
        ),
    )
  )
    return 2;
  return report.coverage.inconclusive && !options.allowIncomplete ? 2 : 0;
}
