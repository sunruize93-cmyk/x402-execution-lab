import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkTrace, digest, jobHash, reportExitCode } from '../packages/core/index.js';
import { parseTrace, TraceValidationError } from '../packages/contracts/index.js';
import { CASES, scriptedCase } from '../packages/local-driver/scripted.js';

const report = (name: string) => checkTrace(scriptedCase(name));
const has = (name: string, rule: string, status = 'fail') =>
  assert.ok(
    report(name).findings.some((f) => f.ruleId === rule && f.status === status),
    `${name}: expected ${rule}:${status}`,
  );

test('timeout reconciles once and keeps double-entry conservation', () => {
  const trace = scriptedCase('timeout-late-confirmation');
  const pending = checkTrace({ ...trace, events: trace.events.slice(0, 4), costs: [] });
  assert.deepEqual(pending.replay.budget, {
    available: '40000',
    reserved: '10000',
    spent: '0',
    refunds_received: '0',
    conserved: true,
  });
  const final = checkTrace(trace);
  assert.deepEqual(final.replay.budget, {
    available: '40000',
    reserved: '0',
    spent: '10000',
    refunds_received: '0',
    conserved: true,
  });
  assert.equal(final.replay.confirmedTransactions.length, 1);
  assert.equal(final.replay.settlement, 'inventory_committed');
});
test('merchant invoice is separate from payer debit and native gas', () => {
  const r = report('success');
  assert.equal(r.fees.payerDebitAtomic, '10000');
  assert.equal(r.fees.merchantCreditAtomic, '10000');
  assert.equal(r.fees.merchantNetAtomic, '9000');
  assert.equal(r.fees.nativeGasCostAtomic, '55000000000000');
  const trace = scriptedCase('success');
  trace.quotes[0]!.feeComponents![0]!.status = 'quoted';
  assert.equal(checkTrace(trace).fees.merchantNetAtomic, null);
});
const violations: [string, string, string?][] = [
  ['expired-quote', 'Q_EXPIRY'],
  ['identity-mismatch', 'Q_IDENTITY'],
  ['decimal-mismatch', 'Q_UNITS'],
  ['merchant-fee-double-count', 'F_PAYER_TOTAL'],
  ['undisclosed-fee', 'F_DISCLOSURE', 'inconclusive'],
  ['tampered-authorization', 'A_SIGNATURE'],
  ['unsupported-signature', 'A_SCHEME', 'inconclusive'],
  ['duplicate-business-payment', 'X_DUPLICATE_BUSINESS_PAYMENT'],
  ['expiry-cancel-race', 'B_UNSAFE_RELEASE'],
  ['gas-limit-as-cost', 'C_GAS_MEASUREMENT'],
  ['missing-chain-fee', 'C_CHAIN_FEES', 'inconclusive'],
  ['refund-pending', 'R_REFUND_PENDING', 'inconclusive'],
  ['confirmed-uncommitted', 'R_CONFIRMED_UNCOMMITTED', 'inconclusive'],
  ['unsafe-release', 'B_UNSAFE_RELEASE'],
  ['reorg', 'X_REORG', 'inconclusive'],
  ['provider-only-confirmation', 'X_CONFIRMATION_EVIDENCE', 'inconclusive'],
];
for (const [name, rule, status] of violations)
  test(`${CASES[name as keyof typeof CASES]} ${name}`, () => has(name, rule, status));
test('verify then revert cannot consume budget or commit inventory', () => {
  const r = report('verify-then-revert');
  assert.equal(r.replay.budget.spent, '0');
  assert.equal(r.replay.budget.reserved, '10000');
  assert.equal(r.replay.settlement, 'chain_failed');
});
test('same authorization resubmission counts one debit and both gas costs', () => {
  const r = report('repeated-authorization');
  assert.equal(r.replay.budget.spent, '10000');
  assert.equal(r.fees.nativeGasCostAtomic, '81000000000000');
  assert.equal(r.replay.confirmedTransactions.length, 1);
});
test('duplicate business payment reflects both real debits', () => {
  assert.equal(report('duplicate-business-payment').replay.budget.spent, '20000');
});
test('reorg rolls confirmation back into reservation and invalidates inventory result', () => {
  const r = report('reorg');
  assert.equal(r.replay.settlement, 'reconciliation');
  assert.equal(r.replay.budget.spent, '0');
  assert.equal(r.replay.budget.reserved, '10000');
  assert.equal(r.fees.payerDebitAtomic, null);
});
test('refund promise never reduces spend; received refund has separate contra account', () => {
  const trace = scriptedCase('refund-pending');
  assert.equal(checkTrace(trace).replay.budget.refunds_received, '0');
  trace.events.push({
    id: 'refund',
    type: 'refund_received',
    at: 2_000_000_009,
    rawStatus: 'confirmed',
    evidenceRef: 'synthetic',
    amountAtomic: '10000',
    transactionHash: digest('refund-tx'),
    block: { number: 4, hash: digest('refund'), confirmations: 1, canonical: true },
  });
  const r = checkTrace(trace);
  assert.equal(r.replay.budget.spent, '10000');
  assert.equal(r.replay.budget.refunds_received, '10000');
  assert.equal(r.replay.budget.available, '50000');
  assert.equal(r.replay.budget.conserved, true);
});
test('proven expired unused authorization permits release after bounded reconciliation', () => {
  const trace = scriptedCase('unsafe-release');
  trace.events.pop();
  trace.events.push(
    {
      id: 'close',
      type: 'authorization_closed',
      at: 2_000_000_301,
      rawStatus: 'expired-unused',
      evidenceRef: 'synthetic',
      authorizationRef: 'auth-001',
      closure: {
        reason: 'expired',
        blockTimestamp: 2_000_000_301,
        nonceUnused: true,
        pendingAttemptsReconciled: true,
        block: { number: 9, hash: digest('close'), confirmations: 1, canonical: true },
      },
    },
    {
      id: 'release',
      type: 'release',
      at: 2_000_000_302,
      rawStatus: 'release',
      evidenceRef: 'synthetic',
      amountAtomic: '10000',
    },
  );
  assert.equal(checkTrace(trace).replay.budget.available, '50000');
});
test('receipt observations are idempotent by transaction, not attempt count', () => {
  const trace = scriptedCase('success');
  trace.events.push({ ...trace.events[3]!, id: 'observed-again', at: 2_000_000_008 });
  assert.equal(checkTrace(trace).replay.budget.spent, '10000');
});
test('quote expiration after submission does not undo a late confirmation', () => {
  const trace = scriptedCase('timeout-late-confirmation');
  trace.quotes[0]!.expiresAt = 2_000_000_004;
  assert.ok(checkTrace(trace).findings.some((f) => f.ruleId === 'Q_EXPIRY' && f.status === 'pass'));
});
test('canonical hash ignores object key order, binds amount, and separates digest domains', () => {
  const job = scriptedCase('success').job;
  assert.equal(
    jobHash(job),
    jobHash(Object.fromEntries(Object.entries(job).reverse()) as typeof job),
  );
  assert.notEqual(jobHash(job), jobHash({ ...job, serviceAmountAtomic: '10001' }));
  assert.notEqual(jobHash(job), digest(job));
});
test('malformed traces fail closed: version, integers, references, ordering and duplicate IDs', () => {
  for (const mutate of [
    (t: any) => (t.schemaVersion = '2'),
    (t: any) => (t.job.serviceAmountAtomic = 10000),
    (t: any) => (t.job.serviceAmountAtomic = '1.1'),
    (t: any) => (t.job.serviceAmountAtomic = '-1'),
    (t: any) => (t.events[0].evidenceRef = 'missing'),
    (t: any) => (t.events[0].at = t.capturedAt + 1),
    (t: any) => t.events.push(t.events[0]),
    (t: any) => t.events.reverse(),
    (t: any) => delete t.events[3].block,
    (t: any) => t.costs.push(t.costs[0]),
  ]) {
    const t = scriptedCase('success');
    mutate(t);
    assert.throws(() => parseTrace(t), TraceValidationError);
  }
});
test('arbitrary signature validity never becomes onchain enforcement', () => {
  assert.ok(!report('success').findings.some((f) => f.enforcement.level === 'onchain_enforced'));
});
test('CI distinguishes failures, incomplete evidence and coverage requirements', () => {
  const r = report('success');
  assert.equal(reportExitCode(r), 2);
  assert.equal(reportExitCode(r, { allowIncomplete: true }), 0);
  assert.equal(reportExitCode(r, { allowIncomplete: true, requireRules: ['NONEXISTENT'] }), 2);
  assert.equal(reportExitCode(report('expired-quote'), { allowIncomplete: true }), 1);
});
test('published fixtures and manifest are deterministic and all conserve the ledger', async () => {
  const manifest = JSON.parse(await readFile('fixtures/v1/manifest.json', 'utf8'));
  for (const item of manifest) {
    const saved = JSON.parse(await readFile(`fixtures/v1/${item.name}.json`, 'utf8'));
    assert.deepEqual(saved, scriptedCase(item.name));
    const r = checkTrace(saved);
    assert.equal(r.traceDigest, item.traceDigest);
    assert.equal(r.status, item.status);
    assert.equal(r.replay.budget.conserved, true);
  }
});
