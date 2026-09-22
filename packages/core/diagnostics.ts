import type { Finding, Report } from './types.js';

export type ReportLocale = 'en' | 'zh-CN';
type Copy = { title: string; why: string; steps: string[]; verify: string };
type Guide = { id: string; rules: string[]; en: Copy; 'zh-CN': Copy };
export type DiagnosticIssue = Copy & {
  id: string;
  kind: 'repair' | 'evidence';
  rules: string[];
  evidenceRefs: string[];
  occurrences: number;
};
export type Diagnostics = {
  schemaVersion: '1.0.0';
  locale: ReportLocale;
  sourceTraceDigest: string;
  sourceStatus: Report['status'];
  advisory: true;
  issues: DiagnosticIssue[];
};

// Guidance describes integration checkpoints, not a proven root cause or an automatic fix.
const guides: Guide[] = [
  {
    id: 'duplicate-payment',
    rules: ['X_DUPLICATE_BUSINESS_PAYMENT', 'X_BUSINESS_IDEMPOTENCY'],
    en: {
      title: 'One job was paid more than once',
      why: 'Valid authorizations can still pay the same job twice. Check retry and concurrent-submission paths.',
      steps: [
        'Use an atomic claim keyed by job ID; persist its authorization and transaction hash across retries.',
        'On timeout, reconcile the original transaction before issuing another authorization. Review any already duplicated charge separately.',
      ],
      verify:
        'Capture a fresh trace from your app after a timeout and concurrent retry. Expect one confirmed payment and X_BUSINESS_IDEMPOTENCY to pass.',
    },
    'zh-CN': {
      title: '同一个任务付了不止一次钱',
      why: '授权分别有效，仍可能重复付款。优先检查超时重试和并发提交路径。',
      steps: [
        '以业务任务 ID 原子地占用付款任务，持久化对应的授权与交易哈希，重试时复用这份记录。',
        '超时后先核对原交易，再决定是否需要新授权；已经多付的款项另行核对处理。',
      ],
      verify:
        '修改应用后，重新触发超时和并发重试并导出记录：应只有 1 笔确认付款，且 X_BUSINESS_IDEMPOTENCY 通过。',
    },
  },
  {
    id: 'budget-reservation',
    rules: [
      'B_RESERVE',
      'B_UNRESERVED_SUBMISSION',
      'B_UNRESERVED_SPEND',
      'B_CONSERVATION',
      'B_RELEASE_EXCESS',
    ],
    en: {
      title: 'Budget transitions need reconciliation',
      why: 'The recorded submission, spend, or release does not match the reserved budget.',
      steps: [
        'Reserve budget atomically before submission; reconcile duplicate callbacks by transaction identity.',
        'Record observed spending even when it exceeds a reservation. Rebuild the ledger from receipts rather than deleting the excess.',
      ],
      verify:
        'Capture reserve, submit, confirm, and release events from a new run. Reservation findings should pass and the budget must remain conserved.',
    },
    'zh-CN': {
      title: '付款与预算预留没有对上',
      why: '记录中的提交、扣款或释放金额与预留预算不一致。',
      steps: [
        '提交前原子地预留预算；同一交易的重复回调只记账一次。',
        '超出预留的实际支出也要入账，按回执重建账本，不要直接抹掉多出的扣款。',
      ],
      verify: '新一轮测试导出预留、提交、确认和释放事件，检查预算告警消失，且账本仍守恒。',
    },
  },
  {
    id: 'authorization-closure',
    rules: ['B_UNSAFE_CLOSURE', 'B_UNSAFE_RELEASE', 'A_CLOSURE_CONFLICT'],
    en: {
      title: 'Budget was released before payment was resolved',
      why: 'A timeout, failed attempt, or local clock does not prove every authorization is unusable.',
      steps: [
        'Keep unresolved funds reserved and reconcile every associated transaction.',
        'Release only after canonical evidence establishes consumed or closed authorizations and no unresolved reorg.',
      ],
      verify:
        'Exercise a late receipt and cancellation race. An unknown submission must keep its reservation until reconciliation.',
    },
    'zh-CN': {
      title: '付款未查清，预算已被释放',
      why: '请求超时、单次失败或本地时间到期，都不能证明所有授权已失效。',
      steps: [
        '保留未查清付款的预留预算，逐笔核对关联交易。',
        '确认授权已使用或有链上关闭证据，且没有未解决的重组，再释放预算。',
      ],
      verify: '重现延迟回执和取消竞争；提交结果未知时，预算应持续预留到核对完成。',
    },
  },
  {
    id: 'payment-amount',
    rules: [
      'F_PAYER_TOTAL',
      'C_EXACT_DEBIT',
      'C_DEBIT_CAP',
      'C_MERCHANT_CREDIT',
      'C_FAILED_DEBIT',
      'Q_UNITS',
    ],
    en: {
      title: 'Payment amounts or units do not agree',
      why: 'Quote, authorization, and observed token movements must use the same atomic units and fee responsibility.',
      steps: [
        'Compare quote, signed amount, and isolated balance deltas as integer atomic units; check asset decimals.',
        'Separate payer fees, merchant fees, and native gas. Retain the actual observed debit while reconciling a mismatch.',
      ],
      verify:
        'Replay a fresh trace with observed debit and credit. Exact transfer and cap checks should pass without hiding excess spending.',
    },
    'zh-CN': {
      title: '付款金额或计量单位不一致',
      why: '报价、授权与实际转账需要使用一致的最小单位和费用承担方式。',
      steps: [
        '用整数最小单位对照报价、签名金额和独立余额变动，检查代币小数位。',
        '分开核算付款人费用、商户费用与原生币 Gas；核对差额时保留实际扣款。',
      ],
      verify: '导出包含实际扣款和入账的新记录，金额和上限检查应通过，多付金额不能从记录中删去。',
    },
  },
  {
    id: 'cost-evidence',
    rules: [
      'F_DISCLOSURE',
      'C_PRESENT',
      'C_MISSING_RECEIPT',
      'C_UNRESOLVED_RECEIPT',
      'C_RECEIPT_ASSOCIATION',
      'C_IDENTITY',
      'C_GAS_MEASUREMENT',
      'C_CHAIN_FEES',
    ],
    en: {
      title: 'Cost evidence is missing or inconsistent',
      why: 'Unknown costs are not zero, and a gas limit is not the amount of gas actually spent.',
      steps: [
        'Capture receipts for successful and failed attempts; join observations by chain and transaction hash.',
        'Use receipt gasUsed × effectiveGasPrice; record fee payer, asset, and chain-specific fees explicitly.',
      ],
      verify:
        'Recheck with the missing receipts and fee evidence. Do not use --allow-incomplete as proof that the cost issue is resolved.',
    },
    'zh-CN': {
      title: '费用证据缺失或互相矛盾',
      why: '未知费用不能算作零，Gas 上限也不等于实际消耗。',
      steps: [
        '收集成功和失败交易的回执，按链与交易哈希关联重复观察。',
        '用回执的 gasUsed × effectiveGasPrice 计算 Gas，并明确记录费用承担方、资产和额外链费用。',
      ],
      verify: '补齐回执与费用证据后再检查；--allow-incomplete 不能作为费用问题已修复的证据。',
    },
  },
  {
    id: 'quote',
    rules: ['Q_PRESENT', 'Q_JOB_HASH', 'Q_IDENTITY', 'Q_EXPIRY'],
    en: {
      title: 'Check the quote against the business job',
      why: 'The job association, asset, recipient, or quote validity does not match the supplied evidence.',
      steps: [
        'Map the quote to the intended job, chain, token, and payee; preserve the original selection time.',
        'Validate expiry before signing. Reconcile any existing submission before replacing an expired quote.',
      ],
      verify:
        'Capture the original quote and signing time in a new trace, then rerun the affected quote checks.',
    },
    'zh-CN': {
      title: '报价与业务任务没有匹配',
      why: '任务关联、资产、收款方或报价有效期与记录不一致。',
      steps: [
        '对照任务、链、代币和收款方，保留真实的报价选取时间。',
        '签名前检查有效期；更换过期报价前，先核对已经提交的交易。',
      ],
      verify: '在新记录中保留原始报价与签名时间，再检查对应的报价规则。',
    },
  },
  {
    id: 'contract-evidence',
    rules: ['A_CONTRACT_ENFORCEMENT', 'F_SECOND_AUTHORIZATION'],
    en: {
      title: 'This execution path lacks supported evidence',
      why: 'A signature or scripted record alone cannot establish contract enforcement or an unsupported fee transfer.',
      steps: [
        'For a local reproduction, use the supported local driver and retain deployment and call evidence.',
        'For an external integration, add independently verified adapter support; never label an unknown contract supported to clear the warning.',
      ],
      verify:
        'Require the affected rule to pass with applicable evidence. A different passing demo does not verify your integration.',
    },
    'zh-CN': {
      title: '这条执行路径缺少受支持的证据',
      why: '仅凭签名或脚本记录，无法证明合约实际执行了约束，或支持额外费用转账。',
      steps: [
        '本地复现可使用已支持的 local 执行器，保留部署与调用证据。',
        '外部集成需要补充经过验证的适配支持，不能为消除告警而把未知合约标记为已支持。',
      ],
      verify: '要求相关规则在适用证据下通过；另一个演示通过，不代表自己的集成已验证。',
    },
  },
  {
    id: 'authorization',
    rules: [
      'A_PRESENT',
      'A_SCHEME',
      'A_BINDING',
      'A_SIGNATURE',
      'A_VALIDITY',
      'A_CAP',
      'A_NONCE_REUSE',
    ],
    en: {
      title: 'Inspect the original payment authorization',
      why: 'The authorization is absent, unsupported, invalid, or inconsistent with its use.',
      steps: [
        'Verify original EIP-712 fields against the expected chain, token, payee, amount, nonce, and validity.',
        'Check nonce state and pending attempts before authorizing another payment; do not repair a signature by editing the signed payload.',
      ],
      verify:
        'Capture verified authorization evidence and test tampering, expiry, and replay. Unsupported paths must remain explicit.',
    },
    'zh-CN': {
      title: '核对原始付款授权',
      why: '授权可能缺失、不受支持、无效，或与实际使用方式不一致。',
      steps: [
        '对照预期链、代币、收款方、金额、nonce 和有效期，验证原始 EIP-712 字段。',
        '生成新授权前核对 nonce 与待处理交易，不要通过修改已签名字段来“修复”签名。',
      ],
      verify: '导出已验证的授权证据，测试篡改、过期与重放；不受支持的路径应继续明确标识。',
    },
  },
  {
    id: 'delivery',
    rules: ['X_PREMATURE_COMMIT', 'R_CONFIRMED_UNCOMMITTED'],
    en: {
      title: 'Payment and delivery states disagree',
      why: 'Chain confirmation and application delivery are separate events.',
      steps: [
        'Gate business completion on both canonical payment evidence and the application delivery record.',
        'Reconcile the existing payment before retrying delivery; make delivery processing idempotent.',
      ],
      verify:
        'Test payment-confirmed/delivery-failed and delivery-before-confirmation paths. Completion must wait for both sides.',
    },
    'zh-CN': {
      title: '付款与交付状态没有对齐',
      why: '链上确认和应用交付是两件独立的事。',
      steps: [
        '业务完成状态同时要求有效的付款确认与应用交付记录。',
        '重试交付前核对已有付款，并让交付处理本身具备幂等性。',
      ],
      verify: '测试“已付款但交付失败”和“先交付后确认”；只有双方条件满足才能标记业务完成。',
    },
  },
  {
    id: 'refund',
    rules: ['R_REFUND_EVIDENCE', 'R_REFUND_PENDING'],
    en: {
      title: 'Refund receipt needs verification',
      why: 'A promised or provider-reported refund is not an observed return of funds.',
      steps: [
        'Match the refund receipt to this job, asset, and transaction.',
        'Credit received refunds once; keep the original spend and pending refund history.',
      ],
      verify:
        'Test pending and confirmed refunds separately. Available funds should increase only with observed refund evidence.',
    },
    'zh-CN': {
      title: '退款还需要到账证据',
      why: '承诺退款或服务商自报退款，不等于已经收到资金。',
      steps: [
        '将退款回执与当前任务、资产和交易关联。',
        '已收到的退款只记账一次，保留原支出与退款处理中记录。',
      ],
      verify: '分别测试待退款和已到账情况；只有取得到账证据后，可用预算才应增加。',
    },
  },
  {
    id: 'confirmation',
    rules: [
      'X_PRESENT',
      'X_ASSOCIATION',
      'X_CONFIRMATION_EVIDENCE',
      'X_TX_ASSOCIATION',
      'X_CONFLICTING_RECEIPT',
      'X_FAILURE_EVIDENCE',
      'X_REORG_EVIDENCE',
      'X_REORG',
      'X_UNRESOLVED',
    ],
    en: {
      title: 'Reconcile transaction observations',
      why: 'The supplied observations are missing, conflicting, or affected by a reorg.',
      steps: [
        'Match attempts to their chain, transaction, and canonical block; do not treat provider success as chain evidence.',
        'Refresh the original transaction receipt and related retry aliases. Keep unresolved spending reserved.',
      ],
      verify:
        'Record fresh canonical observations and rerun the checks. Preserve reorg history; do not erase a past event to obtain PASS.',
    },
    'zh-CN': {
      title: '重新核对交易观察记录',
      why: '记录可能缺失、相互矛盾，或受到区块重组影响。',
      steps: [
        '按链、交易和有效区块匹配各次尝试，不能把服务商返回成功直接当作链上证据。',
        '更新原交易回执及相关重试记录，未查清的支出继续占用预留预算。',
      ],
      verify: '取得新的有效区块证据后再检查；保留重组历史，不要删掉历史事件来获得 PASS。',
    },
  },
];

/** Deterministic, offline advice derived only from failed or incomplete findings. */
export function diagnoseReport(report: Report, locale: ReportLocale = 'en'): Diagnostics {
  const pending = report.findings.filter((f) => f.status === 'fail' || f.status === 'inconclusive');
  const buckets = new Map<string, { guide: Guide; findings: Finding[] }>();
  for (const f of pending) {
    const guide = guides.find((g) => g.rules.includes(f.ruleId)) ?? {
      id: `unmapped:${f.ruleId}`,
      rules: [f.ruleId],
      en: {
        title: 'Inspect an unrecognized finding',
        why: 'No specific repair guide exists for this rule.',
        steps: [
          'Read the original finding, its scope, and evidence references in the detailed checks.',
          'Verify the producer version and source records before changing application behavior.',
        ],
        verify:
          'Capture a fresh trace after investigation and rerun the affected rule; do not discard the finding.',
      },
      'zh-CN': {
        title: '检查未收录的规则',
        why: '这条规则还没有专门的修复指南。',
        steps: [
          '展开完整检查，查看原始说明、影响范围和证据引用。',
          '修改应用前先核对记录生成器版本与原始证据。',
        ],
        verify: '定位后导出新记录并重跑相关规则，不要直接丢弃这条告警。',
      },
    };
    const bucket = buckets.get(guide.id) ?? { guide, findings: [] };
    bucket.findings.push(f);
    buckets.set(guide.id, bucket);
  }
  const issues = [...buckets.values()].map(
    ({ guide, findings }): DiagnosticIssue => ({
      id: guide.id,
      kind: findings.some((f) => f.status === 'fail') ? 'repair' : 'evidence',
      ...guide[locale],
      rules: [...new Set(findings.map((f) => f.ruleId))],
      evidenceRefs: [...new Set(findings.flatMap((f) => f.evidenceRefs))],
      occurrences: findings.length,
    }),
  );
  // Repairs precede evidence collection; catalog order is stable within each severity.
  const rank = (id: string) => {
    const index = guides.findIndex((g) => g.id === id);
    return index < 0 ? guides.length : index;
  };
  issues.sort(
    (a, b) =>
      Number(a.kind === 'evidence') - Number(b.kind === 'evidence') ||
      rank(a.id) - rank(b.id) ||
      a.id.localeCompare(b.id),
  );
  return {
    schemaVersion: '1.0.0',
    locale,
    sourceTraceDigest: report.traceDigest,
    sourceStatus: report.status,
    advisory: true,
    issues,
  };
}
