/* Generated from report.schema.json. Run npm run schema:generate. */

/**
 * This interface was referenced by `Report`'s JSON-Schema
 * via the `definition` "Status".
 */
export type Status = "pass" | "fail" | "inconclusive" | "not_applicable";
/**
 * This interface was referenced by `Report`'s JSON-Schema
 * via the `definition` "EnforcementLevel".
 */
export type EnforcementLevel =
  "onchain_enforced" | "signer_checked" | "application_checked" | "advisory" | "unsupported" | "unknown";

export interface Report {
  schemaVersion: "1.0.0";
  toolVersion: "0.1.0";
  traceId: string;
  traceDigest: string;
  scope: {
    adapter: string;
    revision: string;
    network: string;
    tokenLabel: string;
    jobId: string;
  };
  status: Status;
  coverage: {
    evaluated: number;
    pass: number;
    fail: number;
    inconclusive: number;
    not_applicable: number;
  };
  findings: Finding[];
  replay: {
    authorization: {
      [k: string]: string;
    };
    execution: {
      [k: string]: string;
    };
    application: string;
    settlement: string;
    budget: {
      available: string;
      reserved: string;
      spent: string;
      refunds_received: string;
      conserved: boolean;
    };
    journal: JournalEntry[];
    confirmedTransactions: string[];
  };
  fees: {
    payerDebitAtomic: string | null;
    merchantCreditAtomic: string | null;
    merchantNetAtomic: string | null;
    nativeGasCostAtomic: string | null;
    extraChainFeesAtomic: string | null;
    costCoverage: "complete" | "partial" | "unknown";
  };
  evidence: Evidence[];
  limitations: string[];
}
/**
 * This interface was referenced by `Report`'s JSON-Schema
 * via the `definition` "Finding".
 */
export interface Finding {
  ruleId: string;
  severity: "error" | "warning" | "info";
  status: Status;
  evidenceRefs: string[];
  explanation: string;
  scope: string;
  enforcement: {
    level: EnforcementLevel;
    basis: string;
  };
}
/**
 * This interface was referenced by `Report`'s JSON-Schema
 * via the `definition` "JournalEntry".
 */
export interface JournalEntry {
  eventId: string;
  debit: "available" | "reserved" | "spent";
  credit: "available" | "reserved" | "spent" | "funding" | "refunds_received";
  amountAtomic: string;
}
/**
 * This interface was referenced by `Report`'s JSON-Schema
 * via the `definition` "Evidence".
 */
export interface Evidence {
  id: string;
  provenance: "synthetic" | "local_chain" | "testnet_observed" | "mainnet_observed" | "provider_reported";
  digest: string;
  description: string;
}
/**
 * This interface was referenced by `Report`'s JSON-Schema
 * via the `definition` "ReplayResult".
 */
export interface ReplayResult {
  authorization: {
    [k: string]: string;
  };
  execution: {
    [k: string]: string;
  };
  application: string;
  settlement: string;
  budget: {
    available: string;
    reserved: string;
    spent: string;
    refunds_received: string;
    conserved: boolean;
  };
  journal: JournalEntry[];
  confirmedTransactions: string[];
  findings: Finding[];
}
