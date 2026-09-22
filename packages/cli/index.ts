#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { checkTrace, reportExitCode, diagnoseReport } from '../core/index.js';
import { parseReport } from '../contracts/index.js';
import { CASES, scriptedCase } from '../local-driver/scripted.js';
import { readJson, readTrace, save } from './io.js';
import { renderHtml } from './report.js';
import { importArenaTrace } from '../adapters/arena.js';

const HELP = `x402 Execution Lab 0.1.0

  x402-lab list
  x402-lab run --case timeout-late-confirmation --driver scripted|local [--out artifacts/run]
  x402-lab check --trace trace.json[l] [--rules fees-and-settlement] [--out artifacts/check]
  x402-lab report --input findings.json --format html [--output report.html]
  x402-lab diagnose --input findings.json [--out artifacts/diagnosis]
  x402-lab import-arena --input export.json --output trace.json

Reports: --lang en|zh-CN (default en). run/check also write diagnostics.json.
CI: --allow-incomplete, --require-rule RULE[,RULE...]
Exit codes: 0 passes chosen policy; 1 conformance failure; 2 incomplete evidence; 3 runner/input error.
Local driver: temporary owned Anvil 31337 only; --timeout-ms 60000 (1000..300000).
Offline check and report never execute payments. JSON/HTML files contain no raw signatures.
`;

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    const { values: v, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        case: { type: 'string' },
        driver: { type: 'string' },
        out: { type: 'string' },
        trace: { type: 'string' },
        input: { type: 'string' },
        output: { type: 'string' },
        format: { type: 'string' },
        lang: { type: 'string' },
        rules: { type: 'string' },
        'timeout-ms': { type: 'string' },
        'allow-incomplete': { type: 'boolean' },
        'require-rule': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    const command = positionals[0];
    if (v.help || !command) {
      console.log(HELP);
      return 0;
    }
    if (positionals.length !== 1) throw new Error('Unexpected positional arguments');
    const locale = v.lang ?? 'en';
    if (locale !== 'en' && locale !== 'zh-CN')
      throw new Error('Unsupported --lang; use en or zh-CN');
    if (command === 'diagnose') {
      if (!v.input) throw new Error('diagnose requires --input findings.json');
      const report = parseReport(await readJson(v.input));
      const out = v.out ?? 'artifacts/diagnosis';
      await save(
        `${out}/diagnostics.json`,
        JSON.stringify(diagnoseReport(report, locale), null, 2) + '\n',
      );
      await save(`${out}/report.html`, renderHtml(report, locale));
      console.log(`${out}/diagnostics.json\n${out}/report.html`);
      return 0; // Advice generation succeeded; original finding status is unchanged.
    }
    if (command === 'list') {
      for (const [name, id] of Object.entries(CASES)) console.log(`${id}\t${name}`);
      return 0;
    }
    if (command === 'report') {
      if (!v.input || (v.format && v.format !== 'html'))
        throw new Error('report requires --input and --format html');
      const r = parseReport(await readJson(v.input));
      const output = v.output ?? 'report.html';
      await save(output, renderHtml(r, locale));
      console.log(output);
      return 0;
    }
    if (command === 'import-arena') {
      if (!v.input || !v.output) throw new Error('import-arena requires --input and --output');
      await save(
        v.output,
        JSON.stringify(importArenaTrace(await readJson(v.input)), null, 2) + '\n',
      );
      return 0;
    }
    if (!['run', 'check'].includes(command)) throw new Error(`Unknown command: ${command}`);
    if (v.rules && v.rules !== 'fees-and-settlement') throw new Error('Unsupported rule set');
    const out = v.out ?? `artifacts/${command}`;
    let trace;
    if (command === 'check') {
      if (!v.trace) throw new Error('check requires --trace');
      trace = await readTrace(v.trace);
    } else {
      if (!v.case) throw new Error('run requires --case');
      if (v.driver === 'local') {
        const { runLocalCase, LocalRunError } = await import('../local-driver/local.js');
        try {
          trace = await runLocalCase(v.case, {
            timeoutMs: Number(v['timeout-ms'] ?? 60_000),
            checkpoint: (t) => save(`${out}/trace.json`, JSON.stringify(t, null, 2) + '\n'),
          });
        } catch (e) {
          if (e instanceof LocalRunError && e.trace)
            await save(`${out}/trace.partial.json`, JSON.stringify(e.trace, null, 2) + '\n');
          throw e;
        }
      } else if (v.driver === undefined || v.driver === 'scripted') trace = scriptedCase(v.case);
      else throw new Error(`Unknown driver: ${v.driver}`);
    }
    const report = checkTrace(trace);
    await save(`${out}/trace.json`, JSON.stringify(trace, null, 2) + '\n');
    await save(`${out}/findings.json`, JSON.stringify(report, null, 2) + '\n');
    await save(
      `${out}/diagnostics.json`,
      JSON.stringify(diagnoseReport(report, locale), null, 2) + '\n',
    );
    await save(`${out}/report.html`, renderHtml(report, locale));
    console.log(
      `${report.status.toUpperCase()} · ${report.traceId}\n${report.coverage.pass} pass / ${report.coverage.fail} fail / ${report.coverage.inconclusive} incomplete\n${report.replay.settlement} · spent ${report.replay.budget.spent} / reserved ${report.replay.budget.reserved}\n${out}/findings.json\n${out}/report.html`,
    );
    return reportExitCode(report, {
      allowIncomplete: v['allow-incomplete'] ?? false,
      requireRules: v['require-rule']?.split(',') ?? [],
    });
  } catch (err) {
    console.error(`x402-lab: ${err instanceof Error ? err.message : 'Runner error'}`);
    return 3;
  }
}
process.exitCode = await main();
