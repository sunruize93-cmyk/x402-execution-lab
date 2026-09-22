import { digest, jobHash } from '../core/hash.js';
import { parseTrace, type ExecutionTrace, type ExecutionEvent } from '../contracts/index.js';

export const CASES = {
  success: 'S00',
  'expired-quote': 'Q01',
  'identity-mismatch': 'Q02',
  'decimal-mismatch': 'Q03',
  'merchant-fee-double-count': 'F01',
  'undisclosed-fee': 'F02',
  'tampered-authorization': 'A01',
  'unsupported-signature': 'A02',
  'verify-then-revert': 'X01',
  'timeout-late-confirmation': 'X02',
  'duplicate-business-payment': 'X03',
  'repeated-authorization': 'X04',
  'expiry-cancel-race': 'X05',
  'gas-limit-as-cost': 'C01',
  'missing-chain-fee': 'C02',
  'refund-pending': 'R01',
  'confirmed-uncommitted': 'R02',
  'unsafe-release': 'B01',
  reorg: 'X06',
  'provider-only-confirmation': 'X07',
} as const;
export type CaseName = keyof typeof CASES;
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

export function scriptedCase(name: string): ExecutionTrace {
  if (!(name in CASES)) throw new Error(`Unknown case: ${name}. Use x402-lab list.`);
  const t = 2_000_000_000;
  const job = {
    schemaVersion: '1.0.0' as const,
    jobId: 'job-001',
    merchantId: 'demo-merchant',
    network: 'eip155:31337',
    assetId: addr(100),
    decimals: 6,
    payee: addr(2),
    serviceAmountAtomic: '10000',
    deadline: t + 120,
  };
  const block = { number: 3, hash: hash(3), confirmations: 1, canonical: true };
  const e = (
    type: ExecutionEvent['type'],
    offset: number,
    extra: Partial<ExecutionEvent> = {},
  ): ExecutionEvent => ({
    id: `event-${offset}`,
    type,
    at: t + offset,
    evidenceRef: 'synthetic',
    rawStatus: type,
    ...extra,
  });
  const trace: ExecutionTrace = {
    schemaVersion: '1.0.0',
    traceId: name,
    adapter: { name: 'scripted', revision: 'fixtures-v1' },
    tokenLabel: 'local-test-token',
    capturedAt: t + 400,
    confirmationPolicy: { minConfirmations: 1, chainSpecificFees: 'none' },
    initialBudgetAtomic: '50000',
    job,
    quotes: [
      {
        quoteId: 'quote-001',
        jobHash: jobHash(job),
        providerId: 'scripted-provider',
        network: job.network,
        assetId: job.assetId,
        decimals: 6,
        payee: job.payee,
        serviceAmountAtomic: '10000',
        feePayer: 'merchant',
        feeComponents: [
          {
            kind: 'execution',
            payer: 'merchant',
            assetId: job.assetId,
            amountAtomic: '1000',
            status: 'paid',
            evidenceRef: 'synthetic',
          },
        ],
        payerTotalMaxAtomic: '10000',
        expiresAt: t + 90,
        failureFeePolicy: 'none',
        sourceRevision: 'scripted-v1',
        evidenceRef: 'synthetic',
      },
    ],
    authorizations: [
      {
        authorizationRef: 'auth-001',
        jobId: job.jobId,
        quoteId: 'quote-001',
        scheme: 'eip3009',
        fromAddress: addr(1),
        payee: job.payee,
        amountAtomic: '10000',
        nonce: hash(101),
        domain: {
          name: 'Local Test Token',
          version: '1',
          chainId: 31337,
          verifyingContract: job.assetId,
        },
        validAfter: t - 60,
        validBefore: t + 300,
        signatureValid: true,
        observedAt: t,
        evidenceRef: 'synthetic',
      },
    ],
    attempts: [
      {
        attemptId: 'attempt-001',
        jobId: job.jobId,
        quoteId: 'quote-001',
        authorizationRef: 'auth-001',
        network: job.network,
        txHash: hash(201),
      },
    ],
    events: [
      e('quote_selected', 0, { quoteId: 'quote-001' }),
      e('reserve', 1, { amountAtomic: '10000' }),
      e('submitted', 2, { attemptId: 'attempt-001' }),
      e('chain_confirmed', 5, { attemptId: 'attempt-001', block }),
      e('delivered', 6),
      e('inventory_committed', 7),
    ],
    costs: [
      {
        attemptId: 'attempt-001',
        gasUsed: '55000',
        gasLimit: '100000',
        effectiveGasPrice: '1000000000',
        gasMeasurement: 'receipt',
        extraChainFeesAtomic: null,
        extraChainFeesStatus: 'not_applicable',
        actualDebitAtomic: '10000',
        actualCreditAtomic: '10000',
        assetId: job.assetId,
        network: job.network,
        evidenceRef: 'synthetic',
      },
    ],
    evidence: [
      {
        id: 'synthetic',
        provenance: 'synthetic',
        digest: digest({ name, revision: 'fixtures-v1' }),
        description: 'Scripted scenario, not a wallet signature or an observed chain transaction.',
      },
    ],
    deployments: [],
  };
  switch (name) {
    case 'expired-quote':
      trace.quotes[0]!.expiresAt = t;
      break;
    case 'identity-mismatch':
      trace.quotes[0]!.network = 'eip155:1';
      trace.quotes[0]!.payee = addr(9);
      trace.quotes[0]!.assetId = addr(99);
      break;
    case 'decimal-mismatch':
      trace.quotes[0]!.decimals = 18;
      break;
    case 'merchant-fee-double-count':
      trace.quotes[0]!.payerTotalMaxAtomic = '11000';
      break;
    case 'undisclosed-fee':
      trace.quotes[0]!.feeComponents = null;
      trace.quotes[0]!.feePayer = 'unknown';
      break;
    case 'tampered-authorization':
      trace.authorizations[0]!.amountAtomic = '20000';
      trace.authorizations[0]!.signatureValid = false;
      break;
    case 'unsupported-signature':
      trace.authorizations[0]!.scheme = 'unsupported';
      trace.authorizations[0]!.signatureValid = null;
      break;
    case 'verify-then-revert':
      trace.events = [
        ...trace.events.slice(0, 3),
        e('verify_success', 3, { attemptId: 'attempt-001' }),
        e('chain_failed', 5, { attemptId: 'attempt-001', block }),
      ];
      trace.costs[0]!.actualDebitAtomic = '0';
      trace.costs[0]!.actualCreditAtomic = '0';
      break;
    case 'timeout-late-confirmation':
      trace.events.splice(
        3,
        0,
        e('submission_unknown', 3, {
          attemptId: 'attempt-001',
          rawStatus: 'HTTP timeout after broadcast',
        }),
      );
      break;
    case 'duplicate-business-payment':
      trace.authorizations.push({
        ...trace.authorizations[0]!,
        authorizationRef: 'auth-002',
        nonce: hash(102),
        observedAt: t + 4,
      });
      trace.attempts.push({
        ...trace.attempts[0]!,
        attemptId: 'attempt-002',
        authorizationRef: 'auth-002',
        txHash: hash(202),
      });
      trace.events.splice(
        3,
        0,
        e('submission_unknown', 3, { attemptId: 'attempt-001' }),
        e('submitted', 4, { attemptId: 'attempt-002' }),
      );
      trace.events.push(
        e('chain_confirmed', 8, {
          attemptId: 'attempt-002',
          block: { ...block, number: 4, hash: hash(4) },
        }),
      );
      trace.costs.push({ ...trace.costs[0]!, attemptId: 'attempt-002' });
      break;
    case 'repeated-authorization':
      trace.attempts.push({ ...trace.attempts[0]!, attemptId: 'attempt-002', txHash: hash(202) });
      trace.events.push(
        e('submitted', 8, { attemptId: 'attempt-002' }),
        e('chain_failed', 9, {
          attemptId: 'attempt-002',
          block: { ...block, number: 4, hash: hash(4) },
        }),
      );
      trace.costs.push({
        ...trace.costs[0]!,
        attemptId: 'attempt-002',
        actualDebitAtomic: '0',
        actualCreditAtomic: '0',
        gasUsed: '26000',
      });
      break;
    case 'expiry-cancel-race':
      trace.events = [
        ...trace.events.slice(0, 3),
        e('submission_unknown', 3, { attemptId: 'attempt-001' }),
        e('release', 301, { amountAtomic: '10000' }),
        e('chain_confirmed', 302, { attemptId: 'attempt-001', block }),
        e('authorization_closed', 303, {
          authorizationRef: 'auth-001',
          closure: {
            reason: 'cancelled',
            blockTimestamp: t + 303,
            nonceUnused: false,
            pendingAttemptsReconciled: true,
            block,
          },
        }),
      ];
      break;
    case 'gas-limit-as-cost':
      trace.costs[0]!.gasMeasurement = 'gas_limit';
      trace.costs[0]!.gasUsed = '100000';
      break;
    case 'missing-chain-fee':
      trace.confirmationPolicy.chainSpecificFees = 'required';
      trace.costs[0]!.extraChainFeesStatus = 'unknown';
      break;
    case 'refund-pending':
      trace.events.push(e('refund_promised', 8, { amountAtomic: '10000' }));
      break;
    case 'confirmed-uncommitted':
      trace.events = [...trace.events.slice(0, 4), e('application_failed', 6)];
      break;
    case 'unsafe-release':
      trace.events = [
        ...trace.events.slice(0, 3),
        e('submission_unknown', 3, { attemptId: 'attempt-001' }),
        e('release', 4, { amountAtomic: '10000' }),
      ];
      trace.attempts[0]!.txHash = null;
      trace.costs = [];
      break;
    case 'reorg':
      trace.events.push(
        e('reorg', 8, { attemptId: 'attempt-001', block: { ...block, canonical: false } }),
      );
      break;
    case 'provider-only-confirmation':
      trace.evidence[0]!.provenance = 'provider_reported';
      trace.events = trace.events.slice(0, 4);
      break;
  }
  return parseTrace(trace);
}
