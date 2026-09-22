import { Ajv } from 'ajv';
import schema from './trace.schema.json' with { type: 'json' };
import reportSchema from './report.schema.json' with { type: 'json' };
import type { Report } from './report-generated.js';
import type { ExecutionTrace } from './generated.js';
export type * from './generated.js';
export { schema };
export { reportSchema };
export type { Report, Finding } from './report-generated.js';

const validator = new Ajv({ allErrors: true, strict: false }).compile<ExecutionTrace>(schema);
const reportValidator = new Ajv({ allErrors: true, strict: false }).compile<Report>(reportSchema);
export class TraceValidationError extends Error {}
export function parseReport(value: unknown): Report {
  if (!reportValidator(value))
    throw new TraceValidationError(
      reportValidator.errors?.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; '),
    );
  return value;
}

/** Validate without coercion, defaults, or network access. */
export function parseTrace(value: unknown): ExecutionTrace {
  if (!validator(value)) {
    throw new TraceValidationError(
      validator.errors?.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; '),
    );
  }
  const unique = (items: string[], label: string) => {
    if (new Set(items).size !== items.length) throw new TraceValidationError(`Duplicate ${label}`);
  };
  unique(
    value.quotes.map((x) => x.quoteId),
    'quoteId',
  );
  unique(
    value.authorizations.map((x) => x.authorizationRef),
    'authorizationRef',
  );
  unique(
    value.attempts.map((x) => x.attemptId),
    'attemptId',
  );
  unique(
    value.events.map((x) => x.id),
    'event id',
  );
  unique(
    value.evidence.map((x) => x.id),
    'evidence id',
  );
  unique(
    value.costs.map((x) => x.attemptId),
    'cost attemptId',
  );
  const evidence = new Set(value.evidence.map((x) => x.id));
  const quotes = new Set(value.quotes.map((x) => x.quoteId));
  const auths = new Set(value.authorizations.map((x) => x.authorizationRef));
  const attempts = new Set(value.attempts.map((x) => x.attemptId));
  const requireRef = (set: Set<string>, id: string, label: string) => {
    if (!set.has(id)) throw new TraceValidationError(`Unresolved ${label}: ${id}`);
  };
  for (const x of [
    ...value.quotes,
    ...value.authorizations,
    ...value.events,
    ...value.costs,
    ...value.deployments,
  ])
    requireRef(evidence, x.evidenceRef, 'evidenceRef');
  for (const q of value.quotes)
    for (const fee of q.feeComponents ?? [])
      if (fee.evidenceRef) requireRef(evidence, fee.evidenceRef, 'fee evidenceRef');
  for (const a of [...value.authorizations, ...value.attempts])
    requireRef(quotes, a.quoteId, 'quoteId');
  for (const a of value.attempts) requireRef(auths, a.authorizationRef, 'authorizationRef');
  for (const e of value.events) {
    if (e.attemptId) requireRef(attempts, e.attemptId, 'attemptId');
    if (e.authorizationRef) requireRef(auths, e.authorizationRef, 'authorizationRef');
    if (e.quoteId) requireRef(quotes, e.quoteId, 'quoteId');
    if (e.at > value.capturedAt) throw new TraceValidationError('Event occurs after capturedAt');
  }
  for (const c of value.costs) requireRef(attempts, c.attemptId, 'cost attemptId');
  for (let i = 1; i < value.events.length; i++) {
    if (value.events[i]!.at < value.events[i - 1]!.at)
      throw new TraceValidationError('Events must be ordered by observation time');
  }
  return value;
}
