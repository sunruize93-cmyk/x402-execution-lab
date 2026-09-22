/* Generated from trace.schema.json. Run npm run schema:generate. */

/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "ExecutionEvent".
 */
export type ExecutionEvent = {
  id: string;
  type:
    | "quote_selected"
    | "reserve"
    | "submitted"
    | "submission_unknown"
    | "verify_success"
    | "chain_confirmed"
    | "chain_failed"
    | "reorg"
    | "authorization_closed"
    | "delivered"
    | "inventory_committed"
    | "application_failed"
    | "release"
    | "refund_promised"
    | "refund_received";
  at: number;
  evidenceRef: string;
  attemptId?: string;
  authorizationRef?: string;
  amountAtomic?: string;
  block?: BlockEvidence;
  closure?: ClosureEvidence;
  rawStatus: string;
  quoteId?: string;
  transactionHash?: string;
};

export interface ExecutionTrace {
  schemaVersion: "1.0.0";
  traceId: string;
  adapter: {
    name: string;
    revision: string;
  };
  tokenLabel: "local-test-token" | "external-asset";
  capturedAt: number;
  confirmationPolicy: {
    minConfirmations: number;
    chainSpecificFees: "none" | "required" | "unknown";
  };
  initialBudgetAtomic: string;
  job: PaymentJob;
  /**
   * @maxItems 10000
   */
  quotes: ExecutionQuote[];
  /**
   * @maxItems 10000
   */
  authorizations: AuthorizationEvidence[];
  /**
   * @maxItems 10000
   */
  attempts: ExecutionAttempt[];
  /**
   * @maxItems 10000
   */
  events: ExecutionEvent[];
  /**
   * @maxItems 10000
   */
  costs: CostEvidence[];
  /**
   * @maxItems 10000
   */
  evidence: Evidence[];
  /**
   * @maxItems 10000
   */
  deployments: DeploymentEvidence[];
}
/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "PaymentJob".
 */
export interface PaymentJob {
  schemaVersion: "1.0.0";
  jobId: string;
  merchantId: string;
  network: string;
  assetId: string;
  decimals: number;
  payee: string;
  serviceAmountAtomic: string;
  deadline: number;
}
/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "ExecutionQuote".
 */
export interface ExecutionQuote {
  quoteId: string;
  jobHash: string;
  providerId: string;
  network: string;
  assetId: string;
  decimals: number;
  payee: string;
  serviceAmountAtomic: string;
  feePayer: "payer" | "merchant" | "provider" | "unknown";
  feeComponents: FeeComponent[] | null;
  payerTotalMaxAtomic: string | null;
  expiresAt: number;
  failureFeePolicy: "none" | "charged" | "unknown";
  sourceRevision: string;
  evidenceRef: string;
}
/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "FeeComponent".
 */
export interface FeeComponent {
  kind: "execution" | "service" | "markup";
  payer: "payer" | "merchant" | "provider" | "unknown";
  assetId: string;
  amountAtomic: string | null;
  status: "quoted" | "paid" | "unknown";
  evidenceRef: string | null;
}
/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "AuthorizationEvidence".
 */
export interface AuthorizationEvidence {
  authorizationRef: string;
  jobId: string;
  quoteId: string;
  scheme: "eip3009" | "unsupported";
  fromAddress: string;
  payee: string;
  amountAtomic: string;
  nonce: string;
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  validAfter: number;
  validBefore: number;
  signatureValid: boolean | null;
  observedAt: number;
  evidenceRef: string;
}
/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "ExecutionAttempt".
 */
export interface ExecutionAttempt {
  attemptId: string;
  jobId: string;
  quoteId: string;
  authorizationRef: string;
  network: string;
  txHash: string | null;
}
/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "BlockEvidence".
 */
export interface BlockEvidence {
  number: number;
  hash: string;
  confirmations: number;
  canonical: boolean;
}
/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "ClosureEvidence".
 */
export interface ClosureEvidence {
  reason: "expired" | "cancelled";
  blockTimestamp: number;
  nonceUnused: boolean;
  pendingAttemptsReconciled: boolean;
  block: BlockEvidence;
}
/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "CostEvidence".
 */
export interface CostEvidence {
  attemptId: string;
  gasUsed: string | null;
  gasLimit: string | null;
  effectiveGasPrice: string | null;
  gasMeasurement: "receipt" | "gas_limit" | "unknown";
  extraChainFeesAtomic: string | null;
  extraChainFeesStatus: "complete" | "not_applicable" | "unknown";
  actualDebitAtomic: string | null;
  actualCreditAtomic: string | null;
  assetId: string;
  network: string;
  evidenceRef: string;
}
/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "Evidence".
 */
export interface Evidence {
  id: string;
  provenance: "synthetic" | "local_chain" | "testnet_observed" | "mainnet_observed" | "provider_reported";
  digest: string;
  description: string;
}
/**
 * This interface was referenced by `ExecutionTrace`'s JSON-Schema
 * via the `definition` "DeploymentEvidence".
 */
export interface DeploymentEvidence {
  network: string;
  contract: string;
  codeHash: string;
  transactionHash: string;
  evidenceRef: string;
  call: "transferWithAuthorization";
}
