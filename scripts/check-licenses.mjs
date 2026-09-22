import { readFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const allowed = new Set([
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'MIT OR Apache-2.0',
  '(MIT OR Apache-2.0)',
  '(MIT AND BSD-3-Clause)',
  'BlueOak-1.0.0',
  'Python-2.0',
]);
const counts = {};
const problems = [];
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path) continue;
  if (!pkg.license) {
    const installed = JSON.parse(
      await readFile(new URL('../' + path + '/package.json', import.meta.url), 'utf8'),
    );
    // Older npm metadata uses the legacy licenses array; verify its distributed notice exists.
    if (installed.licenses?.length === 1) {
      await readFile(new URL('../' + path + '/LICENSE', import.meta.url), 'utf8');
      pkg.license = installed.licenses[0].type;
    }
  }
  counts[pkg.license ?? 'unknown'] = (counts[pkg.license ?? 'unknown'] ?? 0) + 1;
  if (!allowed.has(pkg.license)) problems.push(`${path}: ${pkg.license ?? 'missing license'}`);
}
console.log(JSON.stringify(counts, null, 2));
if (problems.length) throw new Error(problems.join('\n'));
