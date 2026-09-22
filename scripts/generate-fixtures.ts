import { writeFile, mkdir } from 'node:fs/promises';
import { CASES, scriptedCase } from '../packages/local-driver/scripted.js';
import { checkTrace } from '../packages/core/index.js';
await mkdir('fixtures/v1', { recursive: true });
const manifest = [];
for (const [name, matrixId] of Object.entries(CASES)) {
  const trace = scriptedCase(name);
  const report = checkTrace(trace);
  await writeFile(`fixtures/v1/${name}.json`, JSON.stringify(trace, null, 2) + '\n');
  manifest.push({
    name,
    matrixId,
    status: report.status,
    findings: report.findings
      .filter((f) => f.status === 'fail' || f.status === 'inconclusive')
      .map((f) => `${f.ruleId}:${f.status}`),
    traceDigest: report.traceDigest,
  });
}
await writeFile('fixtures/v1/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
