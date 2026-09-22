import { isAddress, verifyTypedData, type Address, type Hex } from 'viem';
import { authorizationTypes } from '@x402/evm';
import type { PaymentRequirements, PaymentPayload } from '@x402/core/types';
import type { AuthorizationEvidence, PaymentJob } from '../contracts/index.js';

export const SDK_REVISION = '@x402/core@2.26.0+@x402/evm@2.26.0';
const atomic = (x: unknown): x is string =>
  typeof x === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(x);
const address = (x: unknown): x is Address =>
  typeof x === 'string' && isAddress(x, { strict: false });
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);

export function jobFromRequirements(
  input: unknown,
  context: { jobId: string; merchantId: string; decimals: number; deadline: number },
): PaymentJob {
  if (
    !record(input) ||
    input.scheme !== 'exact' ||
    typeof input.network !== 'string' ||
    !/^eip155:[1-9][0-9]*$/.test(input.network) ||
    !address(input.asset) ||
    !address(input.payTo) ||
    !atomic(input.amount)
  )
    throw new Error('Unsupported x402 v2 exact EVM requirements');
  if (
    !Number.isInteger(context.decimals) ||
    context.decimals < 0 ||
    context.decimals > 255 ||
    !Number.isSafeInteger(context.deadline) ||
    context.deadline < 0
  )
    throw new Error('Invalid job context');
  return {
    schemaVersion: '1.0.0',
    ...context,
    network: input.network,
    assetId: input.asset,
    payee: input.payTo,
    serviceAmountAtomic: input.amount,
  };
}

/** Verify an EOA signature locally. Deliberately drops the signature from normalized output. */
export async function authorizationFromPayload(
  input: unknown,
  requirements: PaymentRequirements,
  context: {
    jobId: string;
    quoteId: string;
    authorizationRef: string;
    observedAt: number;
    evidenceRef: string;
  },
): Promise<AuthorizationEvidence> {
  if (
    !record(input) ||
    input.x402Version !== 2 ||
    !record(input.payload) ||
    !record(input.accepted) ||
    input.accepted.scheme !== 'exact' ||
    !record(input.payload.authorization)
  )
    throw new Error('Unsupported x402 payment envelope or signature structure');
  const accepted = input.accepted;
  if (
    ['network', 'asset', 'payTo', 'amount', 'scheme'].some(
      (k) => accepted[k] !== requirements[k as keyof PaymentRequirements],
    )
  )
    throw new Error('Payload accepted requirements differ from challenge');
  const a = input.payload.authorization;
  if (
    Object.keys(a).sort().join(',') !==
      ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'].sort().join(',') ||
    !address(a.from) ||
    !address(a.to) ||
    !atomic(a.value) ||
    !atomic(a.validAfter) ||
    !atomic(a.validBefore) ||
    typeof a.nonce !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(a.nonce) ||
    typeof input.payload.signature !== 'string' ||
    !/^0x[0-9a-fA-F]{130}$/.test(input.payload.signature)
  )
    throw new Error('Unsupported EIP-3009 authorization (EOA, 65-byte signature only)');
  const chainId = Number(requirements.network.split(':')[1]);
  const name = requirements.extra?.name;
  const version = requirements.extra?.version;
  if (
    !Number.isSafeInteger(chainId) ||
    chainId <= 0 ||
    typeof name !== 'string' ||
    typeof version !== 'string' ||
    !address(requirements.asset) ||
    !Number.isSafeInteger(Number(a.validBefore)) ||
    !Number.isSafeInteger(Number(a.validAfter))
  )
    throw new Error('Invalid EIP-712 domain or validity');
  const domain = { name, version, chainId, verifyingContract: requirements.asset };
  const signatureValid = await verifyTypedData({
    address: a.from,
    domain,
    types: authorizationTypes,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: a.from,
      to: a.to,
      value: BigInt(a.value),
      validAfter: BigInt(a.validAfter),
      validBefore: BigInt(a.validBefore),
      nonce: a.nonce as Hex,
    },
    signature: input.payload.signature as Hex,
  }).catch(() => false);
  return {
    ...context,
    scheme: 'eip3009',
    fromAddress: a.from,
    payee: a.to,
    amountAtomic: a.value,
    nonce: a.nonce,
    domain,
    validAfter: Number(a.validAfter),
    validBefore: Number(a.validBefore),
    signatureValid,
  };
}
export type { PaymentRequirements, PaymentPayload };
