import { createServer } from 'node:http';
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  keccak256,
  parseSignature,
  verifyTypedData,
  type TypedData,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem';
import { foundry } from 'viem/chains';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme as ClientScheme } from '@x402/evm/exact/client';
import { ExactEvmScheme as FacilitatorScheme } from '@x402/evm/exact/facilitator';
import { toFacilitatorEvmSigner, eip3009ABI, type ExactEIP3009Payload } from '@x402/evm';
import type { PaymentRequired, PaymentRequirements, PaymentPayload } from '@x402/core/types';
import { authorizationFromPayload, jobFromRequirements, SDK_REVISION } from '../adapters/exact.js';
import { digest, jobHash } from '../core/hash.js';
import {
  parseTrace,
  type ExecutionTrace,
  type ExecutionEvent,
  type Evidence,
} from '../contracts/index.js';
import artifact from './contracts/artifact.json' with { type: 'json' };
import { startAnvil } from './anvil.js';

export const LOCAL_CASES = [
  'success',
  'timeout-late-confirmation',
  'duplicate-business-payment',
  'repeated-authorization',
  'verify-then-revert',
  'tampered-authorization',
  'expired-authorization',
  'cancelled-authorization',
] as const;
export type LocalCase = (typeof LOCAL_CASES)[number];
export class LocalRunError extends Error {
  constructor(
    message: string,
    readonly trace: ExecutionTrace | undefined,
  ) {
    super(message);
  }
}

export async function runLocalCase(
  name: string,
  options: { timeoutMs?: number; checkpoint?: (trace: ExecutionTrace) => Promise<void> } = {},
): Promise<ExecutionTrace> {
  if (!LOCAL_CASES.includes(name as LocalCase))
    throw new Error(`Local case unsupported: ${name}. Supported: ${LOCAL_CASES.join(', ')}`);
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300_000)
    throw new Error('timeoutMs must be between 1000 and 300000');
  const node = await startAnvil(timeoutMs);
  let trace: ExecutionTrace | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  let releaseReceipt: (() => void) | undefined;
  try {
    const transport = http(node.url, { timeout: 3000, retryCount: 0 });
    const publicClient = createPublicClient({ chain: foundry, transport, pollingInterval: 20 });
    const testClient = createTestClient({ chain: foundry, transport, mode: 'anvil' });
    if ((await publicClient.getChainId()) !== 31337)
      throw new Error('Local driver refuses a non-31337 chain');
    // Random, short-lived accounts: no environment wallet, seed, or private key is read or exported.
    const payer = privateKeyToAccount(generatePrivateKey());
    const provider = privateKeyToAccount(generatePrivateKey());
    const payee = privateKeyToAccount(generatePrivateKey()).address;
    await testClient.setBalance({ address: provider.address, value: 10n ** 20n });
    await testClient.setBalance({ address: payer.address, value: 10n ** 20n });
    const wallet = createWalletClient({ chain: foundry, transport, account: provider });
    const deployHash = await wallet.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode as Hex,
      args: [payer.address],
    });
    const deployReceipt = await publicClient.waitForTransactionReceipt({
      hash: deployHash,
      timeout: 5000,
    });
    const asset = deployReceipt.contractAddress!;
    const bytecode = await publicClient.getCode({ address: asset });
    if (!bytecode || keccak256(bytecode) !== artifact.codeHash)
      throw new Error('Local token bytecode mismatch');
    const now = () => Math.floor(Date.now() / 1000);
    const t = now();
    const requirements: PaymentRequirements = {
      scheme: 'exact',
      network: 'eip155:31337',
      asset,
      amount: '10000',
      payTo: payee,
      maxTimeoutSeconds: 300,
      extra: { name: 'Local Test Token', version: '1', assetTransferMethod: 'eip3009' },
    };
    const challenge: PaymentRequired = {
      x402Version: 2,
      resource: {
        url: 'http://localhost/resource',
        description: 'Local execution lab resource',
        mimeType: 'application/json',
      },
      accepts: [requirements],
    };
    const job = jobFromRequirements(requirements, {
      jobId: 'local-job-001',
      merchantId: 'local-merchant',
      decimals: 6,
      deadline: t + 300,
    });
    trace = {
      schemaVersion: '1.0.0',
      traceId: `local-${name}`,
      adapter: { name: 'x402-exact-evm-local', revision: SDK_REVISION },
      tokenLabel: 'local-test-token',
      capturedAt: t,
      confirmationPolicy: { minConfirmations: 1, chainSpecificFees: 'none' },
      initialBudgetAtomic: '50000',
      job,
      quotes: [],
      authorizations: [],
      attempts: [],
      events: [],
      costs: [],
      evidence: [],
      deployments: [],
    };
    const tr = trace;
    function evidence(
      id: string,
      provenance: Evidence['provenance'],
      raw: unknown,
      description: string,
    ) {
      tr.evidence.push({
        id,
        provenance,
        digest: digest(
          JSON.parse(JSON.stringify(raw, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))),
        ),
        description,
      });
      return id;
    }
    function event(
      type: ExecutionEvent['type'],
      evidenceRef: string,
      extra: Partial<ExecutionEvent> = {},
    ) {
      tr.events.push({
        id: `event-${tr.events.length + 1}`,
        type,
        at: now(),
        evidenceRef,
        rawStatus: type,
        ...extra,
      });
      tr.capturedAt = now();
    }
    const deployRef = evidence(
      'deployment',
      'local_chain',
      { deployHash, deployReceipt, codeHash: artifact.codeHash },
      'Owned Anvil deployment and runtime bytecode check.',
    );
    tr.deployments.push({
      network: job.network,
      contract: asset,
      codeHash: artifact.codeHash,
      transactionHash: deployHash,
      evidenceRef: deployRef,
      call: 'transferWithAuthorization',
    });
    const quoteRef = evidence(
      'quote',
      'synthetic',
      requirements,
      'Explicit zero-fee local facilitator configuration; not a production provider quote.',
    );
    tr.quotes.push({
      quoteId: 'quote-001',
      jobHash: jobHash(job),
      providerId: 'owned-local-facilitator',
      network: job.network,
      assetId: asset,
      decimals: 6,
      payee,
      serviceAmountAtomic: '10000',
      feePayer: 'provider',
      feeComponents: [],
      payerTotalMaxAtomic: '10000',
      expiresAt: t + 120,
      failureFeePolicy: 'none',
      sourceRevision: SDK_REVISION,
      evidenceRef: quoteRef,
    });
    event('quote_selected', quoteRef, { quoteId: 'quote-001' });
    event('reserve', quoteRef, { amountAtomic: '10000' });
    const client = x402Client.fromConfig({
      schemes: [{ network: 'eip155:31337', client: new ClientScheme(payer) }],
      spendControls: {
        allowedAssets: [{ network: 'eip155:31337', asset, maxAmountPerPayment: '10000' }],
      },
    });
    const receiptGate = new Promise<void>((resolve) => {
      releaseReceipt = resolve;
    });
    let pauseReceipt = name === 'timeout-late-confirmation';
    let abortPayment: AbortController | undefined;
    const signer = toFacilitatorEvmSigner(
      {
        ...publicClient,
        ...wallet,
        address: provider.address,
        verifyTypedData: (args) => verifyTypedData({ ...args, types: args.types as TypedData }),
        // Provide explicit gas so revert scenarios broadcast a transaction and preserve real gas evidence.
        writeContract: (args) => wallet.writeContract({ ...args, gas: 200000n }),
        waitForTransactionReceipt: async (args) => {
          if (pauseReceipt) {
            pauseReceipt = false;
            setTimeout(
              () => abortPayment?.abort(new Error('Injected HTTP timeout after broadcast')),
              20,
            );
            await receiptGate;
          }
          return publicClient.waitForTransactionReceipt({ ...args, timeout: 5000 });
        },
      },
      { confirmationTimeoutMs: 5000 },
    );
    const facilitator = new FacilitatorScheme(signer);
    let settleDone: Promise<unknown> = Promise.resolve();
    server = createServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/resource') {
        res.writeHead(402, {
          'content-type': 'application/json',
          'payment-required': Buffer.from(JSON.stringify(challenge)).toString('base64'),
        });
        res.end(JSON.stringify(challenge));
        return;
      }
      if (req.method === 'POST' && req.url === '/settle') {
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 16384) throw new Error('Request too large');
            chunks.push(chunk);
          }
          const payload = JSON.parse(Buffer.concat(chunks).toString()) as PaymentPayload;
          settleDone = facilitator.settle(payload, requirements);
          const result = await settleDone;
          if (!res.destroyed) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(result));
          }
        } catch {
          if (!res.destroyed) {
            res.writeHead(500);
            res.end('local settlement failed');
          }
        }
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const serverAddress = server.address();
    if (!serverAddress || typeof serverAddress === 'string') throw new Error('No local HTTP port');
    const origin = `http://127.0.0.1:${serverAddress.port}`;
    const response = await fetch(`${origin}/resource`);
    if (response.status !== 402) throw new Error('Expected HTTP 402');
    const receivedChallenge = (await response.json()) as PaymentRequired;
    const payload = await client.createPaymentPayload(receivedChallenge);
    evidence(
      'challenge',
      'provider_reported',
      receivedChallenge,
      'Actual HTTP 402 challenge from the owned local resource server.',
    );
    async function addAuthorization(p: PaymentPayload, id: string) {
      const ref = evidence(
        `signature-${id}`,
        'synthetic',
        p,
        'Locally generated EOA signature checked offline; raw signature omitted.',
      );
      const auth = await authorizationFromPayload(p, requirements, {
        jobId: job.jobId,
        quoteId: 'quote-001',
        authorizationRef: id,
        observedAt: now(),
        evidenceRef: ref,
      });
      tr.authorizations.push(auth);
      return auth;
    }
    if (name === 'tampered-authorization')
      (payload.payload as ExactEIP3009Payload).authorization.value = '20000';
    const auth = await addAuthorization(payload, 'auth-001');
    const verification = await facilitator.verify(payload, requirements);
    const verifyRef = evidence(
      'verify',
      'provider_reported',
      verification,
      'Local x402 facilitator verification; not settlement.',
    );
    const balance = (address: Address) =>
      publicClient.readContract({
        address: asset,
        abi: artifact.abi,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>;
    async function recordReceipt(
      id: string,
      authId: string,
      txHash: Hex,
      receipt: TransactionReceipt,
      payerBefore: bigint,
      payeeBefore: bigint,
    ) {
      let attempt = tr.attempts.find((a) => a.attemptId === id);
      if (!attempt) {
        attempt = {
          attemptId: id,
          jobId: job.jobId,
          quoteId: 'quote-001',
          authorizationRef: authId,
          network: job.network,
          txHash,
        };
        tr.attempts.push(attempt);
      }
      attempt.txHash = txHash;
      const payerAfter = await balance(payer.address),
        payeeAfter = await balance(payee);
      const ref = evidence(
        `receipt-${id}`,
        'local_chain',
        { receipt, payerBefore, payerAfter, payeeBefore, payeeAfter },
        'Anvil receipt plus token balance deltas; one confirmation policy.',
      );
      event(receipt.status === 'success' ? 'chain_confirmed' : 'chain_failed', ref, {
        attemptId: id,
        block: {
          number: Number(receipt.blockNumber),
          hash: receipt.blockHash,
          confirmations: 1,
          canonical: true,
        },
      });
      tr.costs.push({
        attemptId: id,
        gasUsed: receipt.gasUsed.toString(),
        gasLimit: '200000',
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        gasMeasurement: 'receipt',
        extraChainFeesAtomic: null,
        extraChainFeesStatus: 'not_applicable',
        actualDebitAtomic: (payerBefore - payerAfter).toString(),
        actualCreditAtomic: (payeeAfter - payeeBefore).toString(),
        assetId: asset,
        network: job.network,
        evidenceRef: ref,
      });
    }
    if (!verification.isValid) {
      if (name !== 'tampered-authorization')
        throw new Error(`SDK verification failed: ${verification.invalidReason}`);
      tr.capturedAt = now();
      return parseTrace(tr);
    }
    const payerBefore = await balance(payer.address),
      payeeBefore = await balance(payee);
    tr.attempts.push({
      attemptId: 'attempt-001',
      jobId: job.jobId,
      quoteId: 'quote-001',
      authorizationRef: auth.authorizationRef,
      network: job.network,
      txHash: null,
    });
    event('verify_success', verifyRef, { attemptId: 'attempt-001' });
    if (name === 'expired-authorization') {
      await testClient.setNextBlockTimestamp({ timestamp: BigInt(auth.validBefore + 1) });
    }
    if (name === 'cancelled-authorization') {
      const payerWallet = createWalletClient({ chain: foundry, transport, account: payer });
      const cancelHash = await payerWallet.writeContract({
        address: asset,
        abi: artifact.abi,
        functionName: 'cancel',
        args: [auth.nonce],
      });
      await publicClient.waitForTransactionReceipt({ hash: cancelHash, timeout: 5000 });
    }
    if (name === 'verify-then-revert') {
      // Consume the nonce via an independent relayer between verify and settle.
      const a = payload.payload as ExactEIP3009Payload;
      const sig = parseSignature(a.signature!);
      const raceHash = await wallet.writeContract({
        address: asset,
        abi: eip3009ABI,
        functionName: 'transferWithAuthorization',
        args: [
          a.authorization.from,
          a.authorization.to,
          BigInt(a.authorization.value),
          BigInt(a.authorization.validAfter),
          BigInt(a.authorization.validBefore),
          a.authorization.nonce,
          Number(sig.v),
          sig.r,
          sig.s,
        ],
        gas: 200000n,
      });
      const raceReceipt = await publicClient.waitForTransactionReceipt({
        hash: raceHash,
        timeout: 5000,
      });
      await recordReceipt(
        'race-payment',
        'auth-001',
        raceHash,
        raceReceipt,
        payerBefore,
        payeeBefore,
      );
    }
    const beforeSettlePayer = await balance(payer.address),
      beforeSettlePayee = await balance(payee);
    event('submitted', verifyRef, { attemptId: 'attempt-001' });
    abortPayment = new AbortController();
    const requestTimeout = setTimeout(() => abortPayment!.abort(), 10_000);
    let settlement: { transaction?: string; success?: boolean; errorReason?: string };
    try {
      const result = await fetch(`${origin}/settle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortPayment.signal,
      });
      settlement = (await result.json()) as typeof settlement;
    } catch (err) {
      if (name !== 'timeout-late-confirmation') throw err;
      const timeoutRef = evidence(
        'http-timeout',
        'provider_reported',
        { aborted: true, attemptId: 'attempt-001' },
        'Actual client HTTP abort injected after transaction broadcast, before returning the receipt.',
      );
      event('submission_unknown', timeoutRef, {
        attemptId: 'attempt-001',
        rawStatus: 'HTTP timeout after broadcast',
      });
      await options.checkpoint?.(parseTrace(tr));
      releaseReceipt!();
      settlement = (await settleDone) as typeof settlement;
    } finally {
      clearTimeout(requestTimeout);
    }
    if (!settlement.transaction || !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction))
      throw new Error(`No transaction returned by SDK: ${settlement.errorReason}`);
    const hash = settlement.transaction as Hex;
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 5000 });
    await recordReceipt(
      'attempt-001',
      'auth-001',
      hash,
      receipt,
      beforeSettlePayer,
      beforeSettlePayee,
    );
    if (name === 'duplicate-business-payment' || name === 'repeated-authorization') {
      let next = payload;
      let authId = 'auth-001';
      if (name === 'duplicate-business-payment') {
        next = await client.createPaymentPayload(receivedChallenge);
        authId = 'auth-002';
        await addAuthorization(next, authId);
      }
      const bp = await balance(payer.address),
        bm = await balance(payee);
      tr.attempts.push({
        attemptId: 'attempt-002',
        jobId: job.jobId,
        quoteId: 'quote-001',
        authorizationRef: authId,
        network: job.network,
        txHash: null,
      });
      event('submitted', verifyRef, { attemptId: 'attempt-002' });
      const result = await facilitator.settle(next, requirements);
      if (!result.transaction)
        throw new Error(`Second settlement lacked transaction: ${result.errorReason}`);
      const r = await publicClient.waitForTransactionReceipt({
        hash: result.transaction as Hex,
        timeout: 5000,
      });
      await recordReceipt('attempt-002', authId, result.transaction as Hex, r, bp, bm);
    }
    if (receipt.status === 'success') {
      const appRef = evidence(
        'application',
        'synthetic',
        { delivered: true, inventoryCommitted: true },
        'Local simulated resource delivery and inventory commit, separate from real chain execution.',
      );
      event('delivered', appRef);
      event('inventory_committed', appRef);
    }
    tr.capturedAt = now();
    await options.checkpoint?.(parseTrace(tr));
    return parseTrace(tr);
  } catch (err) {
    if (trace) trace.capturedAt = Math.floor(Date.now() / 1000);
    throw new LocalRunError(err instanceof Error ? err.message : 'Local driver failed', trace);
  } finally {
    releaseReceipt?.();
    server?.closeAllConnections();
    server?.close();
    await node.stop();
  }
}
