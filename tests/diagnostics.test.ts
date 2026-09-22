import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkTrace, diagnoseReport } from '../packages/core/index.js';
import { CASES, scriptedCase } from '../packages/local-driver/scripted.js';
import { formatAtomic, renderHtml } from '../packages/cli/report.js';
const exec = promisify(execFile);

test('duplicate diagnosis combines related rules and retains distinct budget and evidence issues', () => {
  const report = checkTrace(scriptedCase('duplicate-business-payment'));
  const before = JSON.stringify(report);
  const d = diagnoseReport(report, 'zh-CN');
  const duplicate = d.issues.find((i) => i.id === 'duplicate-payment')!;
  assert.equal(duplicate.kind, 'repair');
  assert.deepEqual(duplicate.rules.sort(), [
    'X_BUSINESS_IDEMPOTENCY',
    'X_DUPLICATE_BUSINESS_PAYMENT',
  ]);
  assert.ok(duplicate.evidenceRefs.length > 0);
  assert.ok(duplicate.steps.some((s) => s.includes('原子')));
  assert.ok(duplicate.verify.includes('重新触发'));
  assert.ok(d.issues.some((i) => i.id === 'budget-reservation'));
  assert.equal(d.issues[0]!.id, 'duplicate-payment');
  assert.equal(d.advisory, true);
  assert.equal(d.sourceTraceDigest, report.traceDigest);
  assert.equal(JSON.stringify(report), before);
});

test('incomplete evidence produces collection advice, never a claim that a repair was verified', () => {
  const report = checkTrace(scriptedCase('success'));
  const d = diagnoseReport(report);
  assert.equal(d.sourceStatus, 'inconclusive');
  assert.ok(d.issues.length > 0);
  assert.ok(d.issues.every((i) => i.kind === 'evidence'));
  assert.ok(d.issues.some((i) => i.id === 'contract-evidence'));
  assert.match(d.issues[0]!.verify, /does not verify/);
  const covered = {
    ...report,
    status: 'pass' as const,
    findings: report.findings.filter((f) => f.status === 'pass'),
  };
  assert.deepEqual(diagnoseReport(covered).issues, []);
});

test('every actionable fixture finding is accounted for exactly once with its evidence references', () => {
  for (const name of Object.keys(CASES)) {
    const report = checkTrace(scriptedCase(name));
    const pending = report.findings.filter(
      (f) => f.status === 'fail' || f.status === 'inconclusive',
    );
    const d = diagnoseReport(report);
    assert.equal(
      d.issues.reduce((n, i) => n + i.occurrences, 0),
      pending.length,
      name,
    );
    assert.deepEqual(
      new Set(d.issues.flatMap((i) => i.evidenceRefs)),
      new Set(pending.flatMap((f) => f.evidenceRefs)),
      name,
    );
    assert.ok(
      d.issues.every((i) => !i.id.startsWith('unmapped:')),
      name,
    );
    for (const f of pending)
      assert.equal(d.issues.filter((i) => i.rules.includes(f.ruleId)).length, 1, f.ruleId);
  }
});

test('unknown rules remain actionable without fabricated specialized advice; HTML stays escaped', () => {
  const report = checkTrace(scriptedCase('success'));
  report.findings.push({
    ...report.findings[0]!,
    ruleId: '<script>unknown</script>',
    status: 'fail',
    explanation: '<img src=x onerror=alert(1)>',
  });
  const issue = diagnoseReport(report).issues.find((i) => i.id.startsWith('unmapped:'))!;
  assert.match(issue.why, /No specific repair guide/);
  const html = renderHtml(report, 'zh-CN');
  assert.ok(html.includes('&lt;script&gt;unknown&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes("default-src 'none'"));
});

test('compact report keeps identifying context inside collapsed details and supports both languages', () => {
  const report = checkTrace(scriptedCase('duplicate-business-payment'));
  report.traceId = 'private-trace-marker';
  report.scope.jobId = 'private-job-marker';
  report.scope.payee = 'private-payee-marker';
  for (const locale of ['en', 'zh-CN'] as const) {
    const html = renderHtml(report, locale);
    assert.ok(html.includes(`<html lang="${locale}">`));
    assert.ok(html.includes('private-job-marker')); // Collapsed is not redacted.
    const beforeContext = html.slice(0, html.lastIndexOf('<details>'));
    assert.ok(!beforeContext.includes('private-job-marker'));
    assert.ok(!beforeContext.includes('private-payee-marker'));
    assert.ok(!beforeContext.includes('private-trace-marker'));
    assert.ok(!/<details[^>]+\bopen\b/.test(html));
    assert.ok(html.includes('path/to/new-trace.json'));
  }
  assert.match(renderHtml(report, 'zh-CN'), /修后怎么验证/);
  assert.match(renderHtml(report), /How to verify/);
});

test('token display retains integer precision including amounts beyond Number safe range', () => {
  assert.equal(formatAtomic('10000', 6), '0.01');
  assert.equal(formatAtomic('20000', 6), '0.02');
  assert.equal(formatAtomic('9007199254740993123456789', 18), '9007199.254740993123456789');
  assert.equal(formatAtomic('42', 0), '42');
  assert.equal(formatAtomic('0', 6), '0');
  assert.equal(formatAtomic('-1', 6), '-0.000001');
  assert.equal(formatAtomic(null, 6), '—');
});

test('diagnose reads saved reports offline, preserves failure status, and rejects invalid input or language', async () => {
  const out = await mkdtemp(join(tmpdir(), 'x402-diagnosis-'));
  const input = join(out, 'source.json');
  const source = JSON.stringify(checkTrace(scriptedCase('duplicate-business-payment')));
  await writeFile(input, source);
  const run = (args: string[]) =>
    exec(process.execPath, ['--import', 'tsx', 'packages/cli/index.ts', ...args], {
      timeout: 10000,
    });
  await run(['diagnose', '--input', input, '--out', out, '--lang', 'zh-CN']);
  const d = JSON.parse(await readFile(join(out, 'diagnostics.json'), 'utf8'));
  assert.equal(d.sourceStatus, 'fail');
  assert.equal(d.locale, 'zh-CN');
  assert.ok(d.issues.some((i: { id: string }) => i.id === 'duplicate-payment'));
  assert.match(await readFile(join(out, 'report.html'), 'utf8'), /建议检查与修改/);
  assert.equal(await readFile(input, 'utf8'), source);
  await assert.rejects(run(['diagnose', '--input', input, '--lang', 'fr']), { code: 3 });
  await writeFile(input, '{}');
  await assert.rejects(run(['diagnose', '--input', input]), { code: 3 });
});
