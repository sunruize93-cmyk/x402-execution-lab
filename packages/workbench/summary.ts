import { parseReport } from '../contracts/index.js';
import { diagnoseReport, type ReportLocale } from '../core/diagnostics.js';

export type PaymentSummary = {
  status: 'pass' | 'fail' | 'inconclusive';
  confirmedPayments: number;
  payerDebitAtomic: string;
  decimals: number;
  traceDigest: string;
  failedRules: string[];
  issues: { id: string; title: string; why: string; steps: string[]; verify: string }[];
};
export type BenchmarkSummary = {
  source: 'synthetic';
  schemaVersion: string;
  engineDigest: string;
  verifiedEpisodes: number;
  seeds: number[];
  comparison: {
    left_policy: string;
    right_policy: string;
    method: string;
    results: Record<
      string,
      {
        mean: number;
        ci95: [number, number] | null;
        n: number;
        pairs: { seed: number; left: number; right: number; difference: number }[];
      }
    >;
  };
  retry: Record<'guarded' | 'diagnostic', { utility: number; duplicatePayments: number }>;
};
export type CombinedSummary = {
  schemaVersion: 'execution-lab-combined/1';
  generatedAt: string;
  benchmark: BenchmarkSummary;
  payments: { source: 'local_chain'; timeout: PaymentSummary; duplicate: PaymentSummary };
};

/** The overview retains separate provenance; it never converts benchmark traces. */
export function summarizePayment(value: unknown, locale: ReportLocale): PaymentSummary {
  const report = parseReport(value);
  if (
    report.status === 'not_applicable' ||
    report.fees.payerDebitAtomic === null ||
    report.scope.adapter !== 'x402-exact-evm-local' ||
    report.scope.network !== 'eip155:31337' ||
    !report.evidence.some((e) => e.provenance === 'local_chain')
  )
    throw new Error('Combined demo requires local-chain payment evidence');
  return {
    status: report.status,
    confirmedPayments: report.replay.confirmedTransactions.length,
    payerDebitAtomic: report.fees.payerDebitAtomic,
    decimals: report.scope.decimals,
    traceDigest: report.traceDigest,
    failedRules: [
      ...new Set(report.findings.filter((f) => f.status === 'fail').map((f) => f.ruleId)),
    ],
    issues: diagnoseReport(report, locale).issues.map(({ id, title, why, steps, verify }) => ({
      id,
      title,
      why,
      steps,
      verify,
    })),
  };
}

/** Check the fixed demonstration, including its deliberately failing example. */
export function buildCombinedSummary(
  benchmark: BenchmarkSummary,
  timeout: unknown,
  duplicate: unknown,
  locale: ReportLocale = 'en',
): CombinedSummary {
  if (
    benchmark.source !== 'synthetic' ||
    benchmark.schemaVersion !== 'aeb-provisional-0.1' ||
    benchmark.verifiedEpisodes !== 50 ||
    benchmark.seeds.join(',') !== '0,1,2' ||
    Object.keys(benchmark.comparison.results).length !== 8 ||
    Object.values(benchmark.comparison.results).some((r) => r.n !== 3 || r.pairs.length !== 3)
  )
    throw new Error('Incomplete or unexpected benchmark demonstration');
  const payments = {
    source: 'local_chain' as const,
    timeout: summarizePayment(timeout, locale),
    duplicate: summarizePayment(duplicate, locale),
  };
  if (
    payments.timeout.status !== 'pass' ||
    payments.timeout.confirmedPayments !== 1 ||
    payments.duplicate.status !== 'fail' ||
    payments.duplicate.confirmedPayments !== 2 ||
    !payments.duplicate.failedRules.includes('X_DUPLICATE_BUSINESS_PAYMENT')
  )
    throw new Error('Unexpected local payment result; inspect each findings.json');
  return {
    schemaVersion: 'execution-lab-combined/1',
    generatedAt: new Date().toISOString(),
    benchmark,
    payments,
  };
}
