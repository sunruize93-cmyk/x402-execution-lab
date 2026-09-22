import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTrace, digest } from '../packages/core/index.js';
import { scriptedCase } from '../packages/local-driver/scripted.js';

test('zero or excess debit contradicts exact authorization and blocks business completion', () => {
  for (const debit of ['0', '12000']) {
    const t = scriptedCase('success');
    t.costs[0]!.actualDebitAtomic = debit;
    const r = checkTrace(t);
    assert.equal(r.status, 'fail');
    assert.equal(r.replay.budget.spent, debit);
    assert.equal(r.replay.settlement, 'reconciliation');
    assert.ok(r.findings.some((f) => f.ruleId === 'C_EXACT_DEBIT' && f.status === 'fail'));
  }
});
test('failed transaction with absent costs cannot be counted as zero gas or complete coverage', () => {
  const t = scriptedCase('repeated-authorization');
  t.costs.pop();
  const r = checkTrace(t);
  assert.equal(r.fees.nativeGasCostAtomic, null);
  assert.equal(r.fees.costCoverage, 'partial');
  assert.ok(r.findings.some((f) => f.ruleId === 'C_MISSING_RECEIPT'));
});
test('unrelated new nonce cannot clear an unresolved payment reorg', () => {
  const t = scriptedCase('duplicate-business-payment');
  t.events.splice(-1, 0, {
    id: 'reorg',
    type: 'reorg',
    at: 2_000_000_007,
    attemptId: 'attempt-001',
    rawStatus: 'reorg',
    evidenceRef: 'synthetic',
    block: { number: 3, hash: digest('orphan'), confirmations: 0, canonical: false },
  });
  t.events.push(
    {
      id: 'deliver-after',
      type: 'delivered',
      at: 2_000_000_009,
      rawStatus: 'delivered',
      evidenceRef: 'synthetic',
    },
    {
      id: 'commit-after',
      type: 'inventory_committed',
      at: 2_000_000_010,
      rawStatus: 'inventory_committed',
      evidenceRef: 'synthetic',
    },
  );
  const r = checkTrace(t);
  assert.equal(r.replay.execution['attempt-001'], 'unresolved');
  assert.equal(r.replay.settlement, 'reconciliation');
  assert.ok(r.findings.some((f) => f.ruleId === 'X_PREMATURE_COMMIT' && f.status === 'fail'));
});
test('unknown component fee payer leaves merchant net unknown', () => {
  const t = scriptedCase('success');
  t.quotes[0]!.feeComponents![0]!.payer = 'unknown';
  assert.equal(checkTrace(t).fees.merchantNetAtomic, null);
});
test('cost evidence captured on a retry alias accounts debit once against the transaction', () => {
  const t = scriptedCase('success');
  t.attempts.push({ ...t.attempts[0]!, attemptId: 'alias' });
  t.costs[0]!.attemptId = 'alias';
  t.costs[0]!.actualDebitAtomic = '12000';
  t.events.push({ ...t.events[3]!, id: 'alias-confirm', at: 2_000_000_008, attemptId: 'alias' });
  const r = checkTrace(t);
  assert.equal(r.fees.payerDebitAtomic, '12000');
  assert.equal(r.replay.budget.spent, '12000');
  assert.ok(r.findings.some((f) => f.ruleId === 'B_UNRESERVED_SPEND'));
  assert.equal(r.replay.confirmedTransactions.length, 1);
});
test('conflicting successful/failed receipts fail in either observation order', () => {
  for (const failureFirst of [true, false]) {
    const t = scriptedCase('success');
    const failure = { ...t.events[3]!, id: 'conflicting-failure', type: 'chain_failed' as const };
    if (failureFirst) t.events.splice(3, 0, failure);
    else t.events.splice(4, 0, failure);
    const r = checkTrace(t);
    assert.ok(r.findings.some((f) => f.ruleId === 'X_CONFLICTING_RECEIPT' && f.status === 'fail'));
    assert.notEqual(r.replay.settlement, 'inventory_committed');
  }
});
test('aliases of the same receipt cannot double-count native gas', () => {
  const t = scriptedCase('success');
  t.attempts.push({ ...t.attempts[0]!, attemptId: 'alias' });
  t.costs.push({ ...t.costs[0]!, attemptId: 'alias' });
  t.events.push({ ...t.events[3]!, id: 'alias-confirm', attemptId: 'alias', at: 2_000_000_008 });
  assert.equal(checkTrace(t).fees.nativeGasCostAtomic, '55000000000000');
});
test('orphaned receipt gas cannot remain a verified cost total after reorg', () => {
  const r = checkTrace(scriptedCase('reorg'));
  assert.equal(r.fees.nativeGasCostAtomic, null);
  assert.equal(r.fees.costCoverage, 'partial');
});
test('reconfirming through a retry alias reconciles every alias without spending twice', () => {
  const t = scriptedCase('reorg');
  t.attempts.push({ ...t.attempts[0]!, attemptId: 'alias' });
  t.events.push(
    { ...t.events[3]!, id: 'alias-reconfirm', attemptId: 'alias', at: 2_000_000_009 },
    {
      id: 'redeliver',
      type: 'delivered',
      at: 2_000_000_010,
      rawStatus: 'delivered',
      evidenceRef: 'synthetic',
    },
    {
      id: 'recommit',
      type: 'inventory_committed',
      at: 2_000_000_011,
      rawStatus: 'committed',
      evidenceRef: 'synthetic',
    },
  );
  const r = checkTrace(t);
  assert.equal(r.replay.execution['attempt-001'], 'chain_confirmed');
  assert.equal(r.replay.execution.alias, 'chain_confirmed');
  assert.equal(r.replay.budget.spent, '10000');
  assert.equal(r.replay.settlement, 'inventory_committed');
  assert.ok(!r.findings.some((f) => f.ruleId === 'X_UNRESOLVED'));
});
