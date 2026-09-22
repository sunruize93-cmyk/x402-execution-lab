import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkTrace } from '../packages/core/index.js';
import { parseReport } from '../packages/contracts/index.js';
import { scriptedCase } from '../packages/local-driver/scripted.js';
import { renderHtml } from '../packages/cli/report.js';
import { readTrace } from '../packages/cli/io.js';
const exec = promisify(execFile);
async function cli(args: string[]) {
  try {
    return {
      code: 0,
      ...(await exec(process.execPath, ['--import', 'tsx', 'packages/cli/index.ts', ...args], {
        timeout: 10000,
      })),
    };
  } catch (e) {
    const error = e as { code: number; stdout: string; stderr: string };
    return error;
  }
}
test('CLI emits reproducible JSON/HTML, differentiates exit codes and enforces named coverage', async () => {
  const out = await mkdtemp(join(tmpdir(), 'x402-lab-test-'));
  assert.equal((await cli(['run', '--case', 'success', '--out', out])).code, 2);
  const report = parseReport(JSON.parse(await readFile(join(out, 'findings.json'), 'utf8')));
  assert.equal(report.traceId, 'success');
  assert.ok(
    (await readFile(join(out, 'report.html'), 'utf8')).includes('Money and responsibility'),
  );
  assert.equal(
    (await cli(['run', '--case', 'success', '--allow-incomplete', '--out', out])).code,
    0,
  );
  assert.equal(
    (
      await cli([
        'run',
        '--case',
        'success',
        '--allow-incomplete',
        '--require-rule',
        'A_CONTRACT_ENFORCEMENT',
        '--out',
        out,
      ])
    ).code,
    2,
  );
  assert.equal((await cli(['run', '--case', 'expired-quote', '--out', out])).code, 1);
  assert.equal((await cli(['run', '--case', 'missing', '--out', out])).code, 3);
  assert.equal(
    (await cli(['check', '--trace', join(out, 'trace.json'), '--rules', 'typo', '--out', out]))
      .code,
    3,
  );
});
test('JSONL stream format validates header and events; report rendering escapes source HTML', async () => {
  const out = await mkdtemp(join(tmpdir(), 'x402-lab-test-'));
  const trace = scriptedCase('success');
  const path = join(out, 'trace.jsonl');
  await writeFile(
    path,
    [
      JSON.stringify({ type: 'trace', trace: { ...trace, events: [] } }),
      ...trace.events.map((event) => JSON.stringify({ type: 'event', event })),
    ].join('\n'),
  );
  assert.deepEqual(await readTrace(path), trace);
  const r = checkTrace(trace);
  r.traceId = '<img src=x onerror=alert(1)>';
  r.findings[0]!.explanation = '<script>alert(1)</script>';
  const html = renderHtml(r);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes("default-src 'none'"));
  assert.throws(() => parseReport({ ...r, status: 'safe' }));
});
