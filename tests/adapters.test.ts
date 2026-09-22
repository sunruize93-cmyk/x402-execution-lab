import test from 'node:test';
import assert from 'node:assert/strict';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
  authorizationFromPayload,
  jobFromRequirements,
  type PaymentRequirements,
} from '../packages/adapters/exact.js';
import { feeProposalQuote, FEE_PROPOSAL_REVISION } from '../packages/adapters/fee-proposal.js';
import { importArenaTrace } from '../packages/adapters/arena.js';
import { scriptedCase } from '../packages/local-driver/scripted.js';

test('offline exact adapter binds canonical EIP-712 fields and discards signature', async () => {
  const job = scriptedCase('success').job;
  const req: PaymentRequirements = {
    scheme: 'exact',
    network: 'eip155:31337',
    amount: '10000',
    asset: job.assetId,
    payTo: job.payee,
    maxTimeoutSeconds: 300,
    extra: { name: 'Local Test Token', version: '1' },
  };
  const client = new ExactEvmScheme(privateKeyToAccount(generatePrivateKey()));
  const signed = await client.createPaymentPayload(2, req);
  const payload = { ...signed, accepted: req };
  const context = {
    jobId: 'job-001',
    quoteId: 'quote-001',
    authorizationRef: 'auth-001',
    observedAt: Math.floor(Date.now() / 1000),
    evidenceRef: 'sig',
  };
  const normalized = await authorizationFromPayload(payload, req, context);
  assert.equal(normalized.signatureValid, true);
  assert.equal('signature' in normalized, false);
  for (const field of ['value', 'to'] as const) {
    const changed = structuredClone(payload);
    (changed.payload.authorization as Record<string, string>)[field] =
      field === 'value' ? '20000' : `0x${'9'.repeat(40)}`;
    assert.equal((await authorizationFromPayload(changed, req, context)).signatureValid, false);
  }
  const forged = structuredClone(payload);
  (forged.payload.authorization as Record<string, string>).maxFee = '1';
  await assert.rejects(authorizationFromPayload(forged, req, context), /Unsupported EIP-3009/);
  assert.equal(
    jobFromRequirements(req, { jobId: 'x', merchantId: 'm', decimals: 6, deadline: 123 })
      .serviceAmountAtomic,
    '10000',
  );
  assert.throws(
    () =>
      jobFromRequirements(
        { ...req, scheme: 'upto' },
        { jobId: 'x', merchantId: 'm', decimals: 6, deadline: 123 },
      ),
    /Unsupported/,
  );
});
test('fee proposal is revision-pinned, flat-only, advisory, and never invents who pays', () => {
  const job = scriptedCase('success').job;
  const response = {
    facilitatorFeeQuote: {
      quoteId: 'draft',
      facilitatorAddress: job.payee,
      network: job.network,
      asset: job.assetId,
      model: 'flat',
      flatFee: '1000',
      expiry: 2_000_000_030,
      signature: 'unverified-provider-signature',
      signatureScheme: 'eip191',
    },
  };
  const context = {
    revision: FEE_PROPOSAL_REVISION,
    job,
    feePayer: 'merchant' as const,
    failureFeePolicy: 'none' as const,
    evidenceRef: 'draft',
  };
  const r = feeProposalQuote(response, context);
  assert.equal(r.quote.payerTotalMaxAtomic, '10000');
  assert.equal(r.quote.feeComponents![0]!.amountAtomic, '1000');
  assert.equal(r.preferencesEnforcement, 'advisory');
  assert.ok(r.unsupported.includes('provider quote signature verification'));
  assert.equal(
    feeProposalQuote(response, { ...context, feePayer: 'unknown' }).quote.payerTotalMaxAtomic,
    null,
  );
  assert.throws(() => feeProposalQuote(response, { ...context, revision: 'main' }), /revision/);
  response.facilitatorFeeQuote.model = 'bps';
  const bps = feeProposalQuote(response, context);
  assert.equal(bps.quote.feeComponents![0]!.amountAtomic, null);
  assert.ok(bps.unsupported.some((x) => x.includes('bps')));
});
test('Arena importer requires versioned backend export and preserves original status/provenance', () => {
  const original = scriptedCase('timeout-late-confirmation');
  const imported = importArenaTrace({ exportVersion: 'arena-lab-export/1', trace: original });
  assert.deepEqual(imported.events, original.events);
  assert.deepEqual(imported.evidence, original.evidence);
  assert.throws(() => importArenaTrace({ status: 'accepted_pending_settlement' }), /export/);
});
