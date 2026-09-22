import { compileFromFile } from 'json-schema-to-typescript';
import { readFile, writeFile } from 'node:fs/promises';
for (const [schema, target] of [
  ['trace.schema.json', 'generated.ts'],
  ['report.schema.json', 'report-generated.ts'],
]) {
  const path = new URL('../packages/contracts/' + target, import.meta.url);
  const output = await compileFromFile(
    new URL('../packages/contracts/' + schema, import.meta.url).pathname,
    {
      bannerComment: `/* Generated from ${schema}. Run npm run schema:generate. */`,
      unreachableDefinitions: true,
    },
  );
  if (process.argv.includes('--check')) {
    if ((await readFile(path, 'utf8')) !== output)
      throw new Error('Schema types have drifted; run npm run schema:generate');
  } else await writeFile(path, output);
}
