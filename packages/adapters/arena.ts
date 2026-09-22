import { parseTrace, type ExecutionTrace } from '../contracts/index.js';

/** Read-only interchange envelope. The Arena backend must explicitly export this version. */
export function importArenaTrace(input: unknown): ExecutionTrace {
  if (
    !input ||
    typeof input !== 'object' ||
    !('exportVersion' in input) ||
    input.exportVersion !== 'arena-lab-export/1' ||
    !('trace' in input)
  )
    throw new Error('Expected arena-lab-export/1; raw backend events are not inferred');
  const trace = parseTrace(input.trace);
  return { ...trace, adapter: { name: 'arena-readonly-export', revision: 'arena-lab-export/1' } };
}
