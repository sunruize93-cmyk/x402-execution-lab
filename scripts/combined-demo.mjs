import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Always run this checkout's benchmark, even if another AEB version is installed.
const env = {
  ...process.env,
  PYTHONPATH: [resolve(root, 'bench/src'), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
};
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: 'artifacts/combined' },
      lang: { type: 'string', default: 'en' },
      python: { type: 'string', default: process.env.AEB_PYTHON || 'python3' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(
      'npm run demo:combined -- [--out NEW_DIRECTORY] [--lang en|zh-CN] [--python PYTHON]\nRuns 50 synthetic episodes and two local Anvil cases, without keys or paid model calls.',
    );
    return;
  }
  if (!['en', 'zh-CN'].includes(values.lang)) throw new Error('Use --lang en or zh-CN');
  await access(resolve(root, 'dist/packages/cli/index.js')).catch(() => {
    throw new Error('Build the payment module first: npm run build');
  });
  await exec(
    values.python,
    ['-c', 'import sys; assert sys.version_info >= (3, 10); import aeb, jsonschema'],
    { timeout: 15_000, env },
  ).catch(() => {
    throw new Error(
      'Activate Python 3.10+ with ./bench installed, or use --python PATH. See README.md.',
    );
  });
  const { buildCombinedSummary } = await import('../dist/packages/workbench/summary.js');
  const { renderCombinedHtml } = await import('../dist/packages/workbench/report.js');
  const out = resolve(values.out);
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out); // Never overwrite recorded evidence or follow an existing directory.
  const steps = [];
  const record = async (status) =>
    writeFile(
      resolve(out, 'run.json'),
      JSON.stringify(
        {
          schemaVersion: 'execution-lab-combined-run/1',
          status,
          steps,
        },
        null,
        2,
      ) + '\n',
    );
  async function run(name, executable, args, expectedCode) {
    console.log(`${name}…`);
    let code = 0,
      stdout = '',
      stderr = '';
    try {
      ({ stdout, stderr } = await exec(executable, args, {
        cwd: root,
        env,
        timeout: 300_000,
        maxBuffer: 8 * 1024 * 1024,
      }));
    } catch (err) {
      code = typeof err.code === 'number' ? err.code : -1;
      stdout = err.stdout ?? '';
      stderr = err.stderr ?? String(err.message);
    }
    await writeFile(resolve(out, `${name}.log`), `${stdout}\n${stderr}`);
    steps.push({ name, exitCode: code, expectedExitCode: expectedCode });
    await record('running');
    if (code !== expectedCode) throw new Error(`${name} exited ${code}; see ${name}.log`);
  }
  await record('running');
  try {
    await run(
      'benchmark',
      values.python,
      [resolve(root, 'scripts/combined-bench.py'), '--out', resolve(out, 'bench')],
      0,
    );
    for (const [name, caseName, exitCode] of [
      ['timeout', 'timeout-late-confirmation', 0],
      ['duplicate', 'duplicate-business-payment', 1],
    ]) {
      await run(
        name,
        process.execPath,
        [
          resolve(root, 'dist/packages/cli/index.js'),
          'run',
          '--case',
          caseName,
          '--driver',
          'local',
          '--out',
          resolve(out, `lab/${name}`),
          '--lang',
          values.lang,
        ],
        exitCode,
      );
    }
    const benchmark = await readJson(resolve(out, 'bench/combined.json'));
    const timeout = await readJson(resolve(out, 'lab/timeout/findings.json'));
    const duplicate = await readJson(resolve(out, 'lab/duplicate/findings.json'));
    const summary = buildCombinedSummary(benchmark, timeout, duplicate, values.lang);
    await writeFile(resolve(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    await writeFile(resolve(out, 'report.html'), renderCombinedHtml(summary, values.lang));
    for (const locale of ['en', 'zh-CN']) {
      const localized = buildCombinedSummary(benchmark, timeout, duplicate, locale);
      localized.generatedAt = summary.generatedAt;
      await writeFile(resolve(out, `report.${locale}.html`), renderCombinedHtml(localized, locale));
    }
    await record('complete');
    console.log(
      `50 verified synthetic episodes · 2 local-chain cases\n${resolve(out, 'report.html')}\nDuplicate-payment FAIL is the expected diagnostic result.`,
    );
  } catch (err) {
    await record('failed');
    throw err;
  }
}

main().catch((err) => {
  console.error(`combined-demo: ${err.message}`);
  process.exitCode = 3;
});
