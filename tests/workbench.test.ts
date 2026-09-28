import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTrace } from '../packages/core/index.js';
import { scriptedCase } from '../packages/local-driver/scripted.js';
import { renderCombinedHtml } from '../packages/workbench/report.js';
import {
  buildCombinedSummary,
  summarizePayment,
  type CombinedSummary,
} from '../packages/workbench/summary.js';

// Presentation fixture only. Real local evidence is exercised in tests/local.
function sample(): CombinedSummary {
  const payment = {
    status: 'fail' as const,
    confirmedPayments: 2,
    payerDebitAtomic: '20000',
    decimals: 6,
    traceDigest: 'trace',
    failedRules: ['X_DUPLICATE_BUSINESS_PAYMENT'],
    issues: [
      {
        id: 'duplicate-payment',
        title: 'Check retry',
        why: 'Two payments',
        steps: ['Reconcile the original transaction'],
        verify: 'Capture a fresh trace',
      },
    ],
  };
  return {
    schemaVersion: 'execution-lab-combined/1',
    generatedAt: '2026-09-29T00:00:00Z',
    benchmark: {
      source: 'synthetic',
      schemaVersion: 'aeb-provisional-0.1',
      engineDigest: 'digest',
      verifiedEpisodes: 50,
      seeds: [0, 1, 2],
      comparison: {
        left_policy: 'cheapest',
        right_policy: 'expected-cost',
        method: 'paired bootstrap',
        results: {
          example: {
            mean: -10,
            ci95: [-10, -10],
            n: 1,
            pairs: [{ seed: 0, left: 30, right: 20, difference: -10 }],
          },
        },
      },
      retry: {
        guarded: { utility: 30, duplicatePayments: 0 },
        diagnostic: { utility: -20, duplicatePayments: 1 },
      },
    },
    payments: {
      source: 'local_chain',
      timeout: {
        ...payment,
        status: 'pass',
        confirmedPayments: 1,
        payerDebitAtomic: '10000',
        failedRules: [],
        issues: [],
      },
      duplicate: payment,
    },
  };
}

test('combined overview cannot label scripted findings as local-chain execution', () => {
  const report = checkTrace(scriptedCase('duplicate-business-payment'));
  assert.throws(() => summarizePayment(report, 'en'), /local-chain/);
});

test('combined demo rejects incomplete benchmark evidence before publishing an overview', () => {
  const benchmark = sample().benchmark;
  benchmark.verifiedEpisodes = 49;
  assert.throws(() => buildCombinedSummary(benchmark, null, null), /Incomplete/);
});

test('dashboard preserves failed payment, separate units, signed differences and safe HTML', () => {
  const summary = sample();
  const attack = '<img src=x onerror="alert(1)">';
  summary.benchmark.comparison.left_policy = attack;
  summary.payments.duplicate.issues[0]!.steps = [attack];
  summary.benchmark.engineDigest = attack;
  for (const locale of ['en', 'zh-CN'] as const) {
    const html = renderCombinedHtml(summary, locale);
    assert.equal(html.includes(attack), false);
    assert.ok(html.includes('&lt;img'));
    assert.equal(html.includes('<script'), false);
    assert.ok(html.includes('0.02'));
    assert.ok(html.includes('-10'));
    assert.ok(html.includes('status fail'));
    assert.ok(html.includes('./lab/duplicate/report.html'));
    assert.ok(html.includes(locale === 'en' ? 'synthetic' : '模拟'));
    assert.ok(html.includes(locale === 'en' ? 'test-token debit' : '测试代币扣款'));
  }
});
