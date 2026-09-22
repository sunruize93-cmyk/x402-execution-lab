import type { ExecutionQuote, PaymentJob } from '../contracts/index.js';
import { jobHash } from '../core/hash.js';
export const FEE_PROPOSAL_REVISION = '40af0ef10624a8e08117d2b49cf99787e2bffd49';

/** Narrow flat-fee interpretation of PR #1015. Payer/policy are integration context, NOT draft fields. */
export function feeProposalQuote(
  input: unknown,
  context: {
    revision: string;
    job: PaymentJob;
    feePayer: ExecutionQuote['feePayer'];
    failureFeePolicy: ExecutionQuote['failureFeePolicy'];
    evidenceRef: string;
  },
): { quote: ExecutionQuote; unsupported: string[]; preferencesEnforcement: 'advisory' } {
  if (context.revision !== FEE_PROPOSAL_REVISION)
    throw new Error('Unsupported fee-proposal revision');
  if (!input || typeof input !== 'object' || !('facilitatorFeeQuote' in input))
    throw new Error('Expected draft FeeQuoteResponse');
  const q = input.facilitatorFeeQuote as Record<string, unknown>;
  if (
    !q ||
    typeof q !== 'object' ||
    typeof q.quoteId !== 'string' ||
    typeof q.network !== 'string' ||
    typeof q.asset !== 'string' ||
    typeof q.facilitatorAddress !== 'string' ||
    !Number.isSafeInteger(q.expiry) ||
    Number(q.expiry) < 0 ||
    typeof q.signature !== 'string'
  )
    throw new Error('Invalid draft fee quote');
  const flat =
    q.model === 'flat' && typeof q.flatFee === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(q.flatFee);
  const sameAsset = q.asset.toLowerCase() === context.job.assetId.toLowerCase();
  const fee = flat ? (q.flatFee as string) : null;
  const unsupported = ['provider quote signature verification'];
  if (!flat) unsupported.push(`fee model ${String(q.model)} (amount remains unknown)`);
  if (!sameAsset) unsupported.push('cross-asset fee conversion');
  return {
    quote: {
      quoteId: q.quoteId,
      jobHash: jobHash(context.job),
      providerId: q.facilitatorAddress,
      network: q.network,
      assetId: context.job.assetId,
      decimals: context.job.decimals,
      payee: context.job.payee,
      serviceAmountAtomic: context.job.serviceAmountAtomic,
      feePayer: context.feePayer,
      feeComponents: [
        {
          kind: 'execution',
          payer: context.feePayer,
          assetId: q.asset,
          amountAtomic: fee,
          status: 'quoted',
          evidenceRef: context.evidenceRef,
        },
      ],
      payerTotalMaxAtomic:
        context.feePayer === 'unknown' || (context.feePayer === 'payer' && (!flat || !sameAsset))
          ? null
          : (
              BigInt(context.job.serviceAmountAtomic) +
              (context.feePayer === 'payer' ? BigInt(fee!) : 0n)
            ).toString(),
      expiresAt: Number(q.expiry),
      failureFeePolicy: context.failureFeePolicy,
      sourceRevision: `x402-pr-1015@${context.revision}`,
      evidenceRef: context.evidenceRef,
    },
    unsupported,
    preferencesEnforcement: 'advisory',
  };
}
