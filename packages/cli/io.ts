import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseTrace, type ExecutionTrace } from '../contracts/index.js';
const MAX_BYTES = 10 * 1024 * 1024;

export async function readJson(path: string): Promise<unknown> {
  if ((await stat(path)).size > MAX_BYTES) throw new Error('Input exceeds 10 MiB');
  return JSON.parse(await readFile(path, 'utf8'));
}
/** JSONL: one header {type:"trace",trace:<trace with events:[]>}, then {type:"event",event:...}. */
export async function readTrace(path: string): Promise<ExecutionTrace> {
  if (!path.endsWith('.jsonl')) return parseTrace(await readJson(path));
  if ((await stat(path)).size > MAX_BYTES) throw new Error('Input exceeds 10 MiB');
  const lines = (await readFile(path, 'utf8'))
    .split(/\r?\n/)
    .filter((x) => x.trim())
    .map((x) => JSON.parse(x));
  const header = lines.shift();
  if (
    header?.type !== 'trace' ||
    !header.trace ||
    !Array.isArray(header.trace.events) ||
    header.trace.events.length
  )
    throw new Error('JSONL requires a trace header with an empty events array');
  if (lines.some((x) => x.type !== 'event' || !x.event))
    throw new Error('JSONL contains an unsupported record');
  return parseTrace({ ...header.trace, events: lines.map((x) => x.event) });
}
export async function save(path: string, data: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data, { mode: 0o600 });
}
