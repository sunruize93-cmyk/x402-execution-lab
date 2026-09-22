import { createHash } from 'node:crypto';
import canonicalizeModule from 'canonicalize';
import type { PaymentJob } from '../contracts/index.js';

/** RFC 8785 canonical JSON, domain separated; NOT an x402 signed field. */
export function digest(value: unknown): `0x${string}` {
  const canonicalize = canonicalizeModule as unknown as (value: unknown) => string | undefined;
  return `0x${createHash('sha256')
    .update(canonicalize(value) ?? 'null')
    .digest('hex')}`;
}
export function jobHash(job: PaymentJob): `0x${string}` {
  return digest({ domain: 'execution-lab/job/v1', job });
}
