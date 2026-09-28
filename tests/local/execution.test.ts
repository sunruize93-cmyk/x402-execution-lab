import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTrace } from '../../packages/core/index.js';
import { parseReport } from '../../packages/contracts/index.js';
import { runLocalCase } from '../../packages/local-driver/local.js';
import { summarizePayment } from '../../packages/workbench/summary.js';

test(
  'HTTP timeout after real broadcast preserves reservation, then settles exactly once',
  { timeout: 60_000 },
  async () => {
    let pendingObserved = false;
    const trace = await runLocalCase('timeout-late-confirmation', {
      checkpoint: async (t) => {
        if (t.events.at(-1)?.type === 'submission_unknown') {
          pendingObserved = true;
          const r = checkTrace(t);
          assert.equal(r.replay.budget.reserved, '10000');
          assert.equal(r.replay.budget.spent, '0');
        }
      },
    });
    assert.equal(pendingObserved, true);
    const r = parseReport(checkTrace(trace));
    assert.equal(r.status, 'pass');
    assert.equal(r.replay.budget.spent, '10000');
    assert.equal(r.replay.confirmedTransactions.length, 1);
    assert.equal(r.fees.payerDebitAtomic, '10000');
    assert.ok(r.findings.some((f) => f.enforcement.level === 'onchain_enforced'));
    assert.equal(JSON.stringify(trace).includes('"signature"'), false);
    const summary = summarizePayment(r, 'en');
    assert.equal(summary.status, 'pass');
    assert.equal(summary.confirmedPayments, 1);
    assert.equal(summary.payerDebitAtomic, '10000');
  },
);
test(
  'two valid SDK authorizations can double-pay one business job; checker catches it',
  { timeout: 60_000 },
  async () => {
    const trace = await runLocalCase('duplicate-business-payment');
    assert.notEqual(trace.authorizations[0]!.nonce, trace.authorizations[1]!.nonce);
    const r = checkTrace(trace);
    assert.equal(r.fees.payerDebitAtomic, '20000');
    assert.equal(r.replay.confirmedTransactions.length, 2);
    assert.ok(
      r.findings.some((f) => f.ruleId === 'X_DUPLICATE_BUSINESS_PAYMENT' && f.status === 'fail'),
    );
    const summary = summarizePayment(r, 'zh-CN');
    assert.equal(summary.status, 'fail');
    assert.equal(summary.confirmedPayments, 2);
    assert.ok(summary.issues.some((issue) => issue.id === 'duplicate-payment'));
    assert.ok(summary.failedRules.includes('X_DUPLICATE_BUSINESS_PAYMENT'));
  },
);
test(
  'same EIP-3009 nonce on a second transaction reverts and costs native gas',
  { timeout: 60_000 },
  async () => {
    const trace = await runLocalCase('repeated-authorization');
    const r = checkTrace(trace);
    assert.equal(r.status, 'pass');
    assert.equal(trace.costs.length, 2);
    assert.equal(trace.costs[1]!.actualDebitAtomic, '0');
    assert.ok(BigInt(trace.costs[1]!.gasUsed!) > 0n);
    assert.equal(r.fees.payerDebitAtomic, '10000');
    assert.equal(r.replay.execution['attempt-002'], 'chain_failed');
  },
);
test(
  'valid verification can race an independent relayer; rejected second tx never settles twice',
  { timeout: 60_000 },
  async () => {
    const trace = await runLocalCase('verify-then-revert');
    const r = checkTrace(trace);
    assert.equal(r.replay.execution['attempt-001'], 'chain_failed');
    assert.equal(r.replay.confirmedTransactions.length, 1);
    assert.equal(r.replay.budget.spent, '10000');
    assert.equal(r.replay.application, 'not_delivered');
  },
);
test(
  'tampered signed amount fails offline EIP-712 verification and SDK verify',
  { timeout: 60_000 },
  async () => {
    const trace = await runLocalCase('tampered-authorization');
    assert.equal(trace.authorizations[0]!.signatureValid, false);
    assert.equal(trace.attempts.length, 0);
    assert.equal(checkTrace(trace).status, 'fail');
  },
);
for (const name of ['expired-authorization', 'cancelled-authorization'])
  test(`${name}: on-chain rejection retains reserve`, { timeout: 60_000 }, async () => {
    const trace = await runLocalCase(name);
    const r = checkTrace(trace);
    assert.equal(r.replay.execution['attempt-001'], 'chain_failed');
    assert.equal(r.replay.budget.spent, '0');
    assert.equal(r.replay.budget.reserved, '10000');
    assert.equal(trace.costs[0]!.actualDebitAtomic, '0');
  });
test(
  'normal local payment passes with zero provider fee and exact merchant credit',
  { timeout: 60_000 },
  async () => {
    const r = checkTrace(await runLocalCase('success'));
    assert.equal(r.status, 'pass');
    assert.equal(r.fees.merchantNetAtomic, '10000');
    assert.equal(r.fees.costCoverage, 'complete');
  },
);
