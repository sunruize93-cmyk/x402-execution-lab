import type { Report } from '../core/types.js';
import { diagnoseReport, type ReportLocale } from '../core/diagnostics.js';
const esc = (v: unknown) =>
  String(v ?? 'unknown').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Exact decimal display: never round monetary strings through Number. */
export function formatAtomic(value: string | null, decimals: number): string {
  if (value === null) return '—';
  const negative = value.startsWith('-');
  const digits = (negative ? value.slice(1) : value).padStart(decimals + 1, '0');
  const whole = decimals === 0 ? digits : digits.slice(0, -decimals);
  const fraction = decimals === 0 ? '' : digits.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

const labels = {
  en: {
    title: 'Payment diagnosis',
    confirmed: 'Confirmed payments',
    debit: 'Token debit',
    failed: 'Failed checks',
    incomplete: 'Incomplete checks',
    next: 'Where to start',
    fix: 'Suggested changes',
    verify: 'How to verify',
    rules: 'Related rules',
    repair: 'Investigate / repair',
    evidence: 'Collect evidence',
    empty: 'No failed or incomplete findings',
    emptyText:
      'Keep this trace as a regression reference. A passing supplied trace does not establish production readiness.',
    note: 'Guidance is based on rule findings. Verify it against your application; no code or payment is changed.',
    rerun: 'After changing your app, capture a fresh trace and recheck it:',
    fresh:
      'Replace path/to/new-trace.json with that new capture. Rechecking the old trace or passing a built-in demo does not verify your fix.',
    money: 'Money and responsibility',
    coverage: 'All checks and evidence references',
    context: 'Source context and limitations',
    journal: 'Double-entry journal',
    quote: 'Quote and fee allocation',
    payer: 'Payer debit (atomic)',
    merchant: 'Merchant credit (atomic)',
    net: 'Merchant net (atomic)',
    gas: 'Native gas (wei)',
    extra: 'Extra chain fees (wei)',
    unit: 'Token amounts above use the recorded decimals. Native gas is a separate asset; no fiat conversion is implied.',
    rule: 'Rule / scope',
    result: 'Result',
    finding: 'Finding / evidence',
    enforcement: 'Enforcement / basis',
    event: 'Event',
    debitCol: 'Debit',
    credit: 'Credit',
    amount: 'Atomic amount',
    ledger: 'Budget ledger',
    sources: 'Evidence sources',
    status: 'Application / settlement',
  },
  'zh-CN': {
    title: '付款问题诊断',
    confirmed: '已确认付款',
    debit: '代币扣款',
    failed: '失败检查',
    incomplete: '证据不足',
    next: '先处理什么',
    fix: '建议检查与修改',
    verify: '修后怎么验证',
    rules: '关联规则',
    repair: '定位 / 修复',
    evidence: '补充证据',
    empty: '没有失败或证据不足的检查',
    emptyText: '可以保留这份记录作为回归参考。当前记录通过检查，不代表生产集成已验证。',
    note: '建议由规则结果生成，需要结合应用代码核对；不会自动修改代码或执行付款。',
    rerun: '修改应用后，重新采集执行记录，再运行：',
    fresh:
      '将 path/to/new-trace.json 换成新记录路径。重复检查旧记录或跑通内置演示，不能证明应用已修复。',
    money: '金额与费用明细',
    coverage: '完整检查与证据引用',
    context: '来源信息与适用范围',
    journal: '双重记账明细',
    quote: '报价与费用归属',
    payer: '付款人扣款（最小单位）',
    merchant: '商户入账（最小单位）',
    net: '商户净收入（最小单位）',
    gas: '原生币 Gas（wei）',
    extra: '额外链费用（wei）',
    unit: '上方代币金额按记录的小数位显示。原生币 Gas 单独计量，不折算为法币。',
    rule: '规则 / 范围',
    result: '结果',
    finding: '说明 / 证据',
    enforcement: '检查层级 / 依据',
    event: '事件',
    debitCol: '借方',
    credit: '贷方',
    amount: '最小单位金额',
    ledger: '预算账本',
    sources: '证据来源',
    status: '应用 / 结算状态',
  },
};

/** Static offline HTML. Detail panels are collapsed, not redacted; all source text is escaped. */
export function renderHtml(report: Report, locale: ReportLocale = 'en'): string {
  const t = labels[locale];
  const diagnostics = diagnoseReport(report, locale);
  const rows = report.findings
    .map(
      (f) =>
        `<tr><td><code>${esc(f.ruleId)}</code><small>${esc(f.scope)}</small></td><td><span class="status ${esc(f.status)}">${esc(f.status)}</span></td><td>${esc(f.explanation)}<small>${esc(f.evidenceRefs.join(', '))}</small></td><td>${esc(f.enforcement.level)}<small>${esc(f.enforcement.basis)}</small></td></tr>`,
    )
    .join('');
  const stats = [
    [t.confirmed, report.replay.confirmedTransactions.length],
    [t.debit, formatAtomic(report.fees.payerDebitAtomic, report.scope.decimals)],
    [t.failed, report.coverage.fail],
    [t.incomplete, report.coverage.inconclusive],
  ];
  const issues = diagnostics.issues
    .map((issue, index) => {
      const badge = `<span class="status ${issue.kind === 'repair' ? 'fail' : 'inconclusive'}">${esc(t[issue.kind])}</span>`;
      const body = `<p class="muted">${esc(issue.why)}</p><div class="fix-grid"><section><h4>${t.fix}</h4><ol>${issue.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></section><section class="verify"><h4>${t.verify}</h4><p>${esc(issue.verify)}</p></section></div><small>${t.rules}: <code>${esc(issue.rules.join(' · '))}</code></small>`;
      return index === 0
        ? `<article class="issue primary"><div class="topline"><h3>${esc(issue.title)}</h3>${badge}</div>${body}</article>`
        : `<details class="issue"><summary>${esc(issue.title)} ${badge}</summary>${body}</details>`;
    })
    .join('');
  const fees = [
    [t.payer, report.fees.payerDebitAtomic],
    [t.merchant, report.fees.merchantCreditAtomic],
    [t.net, report.fees.merchantNetAtomic],
    [t.gas, report.fees.nativeGasCostAtomic],
    [t.extra, report.fees.extraChainFeesAtomic],
  ];
  const allocations = report.fees.allocations
    .map(
      (q) =>
        `<li><code>${esc(q.quoteId)}</code> · ${esc(q.providerId)} · ${esc(q.feePayer)}<small>${esc(q.sourceRevision)}</small><pre>${esc(JSON.stringify(q.components, null, 2))}</pre></li>`,
    )
    .join('');
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>x402 Execution Lab — ${t.title}</title><style>
:root{color-scheme:dark;--bg:#101718;--panel:#172225;--line:#334548;--text:#e6f0ee;--muted:#a7bcbb;--accent:#adf4cc}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 ui-sans-serif,system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:26px 28px 48px}.eyebrow{font:11px ui-monospace,monospace;letter-spacing:.13em;color:var(--accent)}h1{font-size:32px;line-height:1.2;letter-spacing:-.025em;margin:12px 0}h2{font-size:17px;margin:22px 0 10px;font-weight:500}h3{font-size:19px;line-height:1.35;margin:0}h4{font-size:13px;margin:0 0 6px;color:var(--accent)}p{margin:8px 0}.muted,small{color:var(--muted)}small{display:block;font-size:11px;margin-top:8px;overflow-wrap:anywhere}.topline{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.status{display:inline-block;border:1px solid var(--line);padding:2px 8px;border-radius:4px;font:11px/1.6 ui-monospace,monospace;white-space:nowrap}.pass{color:#a6ebc7;background:#17382c}.fail{color:#ffb8a9;background:#402723}.inconclusive{color:#f5d78c;background:#393323}.not_applicable{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:16px 0 8px}.stat{background:var(--panel);padding:12px 16px}.stat strong{display:block;font-size:27px;line-height:1.3;font-weight:500;overflow-wrap:anywhere}.stat span{color:var(--muted);font-size:12px}.issue{background:var(--panel);border:1px solid var(--line);padding:16px 18px;margin:10px 0}.primary{border-left:3px solid var(--accent)}.fix-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:24px;margin-top:14px}.verify{border-left:1px solid var(--line);padding-left:20px}.fix-grid p,.fix-grid li{font-size:13px}.fix-grid ol{padding-left:18px;margin:0}.fix-grid li+li{margin-top:6px}code,pre{font:11px/1.6 ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:var(--bg);padding:12px}details{border:1px solid var(--line);padding:13px 16px;margin-top:10px}summary{cursor:pointer;font-weight:500}summary .status{margin-left:10px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:760px;text-align:left;font-size:12px}td,th{padding:12px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted)}ul{padding-left:20px}.money-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.money-list div{padding:10px;border:1px solid var(--line)}.money-list strong{display:block}.rerun{margin-top:20px}.note{font-size:12px;color:var(--muted)}footer{margin-top:22px;font-size:11px;color:var(--muted)}@media(max-width:650px){main{padding:20px 16px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fix-grid{grid-template-columns:1fr;gap:14px}.verify{border-left:0;border-top:1px solid var(--line);padding:12px 0 0}.topline{gap:8px}h1{font-size:27px}}@media print{body{background:white;color:#111}.issue,.stat{background:#eee;color:#111}.muted,small,.note{color:#555}}
</style></head><body><main><header><div class="eyebrow">X402 EXECUTION LAB / v${esc(report.toolVersion)}</div><div class="topline"><h1>${t.title}</h1><span class="status ${esc(report.status)}">${esc(report.status)}</span></div><div class="grid">${stats.map(([label, n]) => `<div class="stat"><span>${esc(label)}</span><strong>${esc(n)}</strong></div>`).join('')}</div><p class="note">${t.unit}</p></header>
<h2>${t.next} · ${diagnostics.issues.length}</h2>${issues || `<article class="issue"><h3>${t.empty}</h3><p>${t.emptyText}</p></article>`}<p class="note">${t.note}</p>
${diagnostics.issues.length ? `<section class="rerun"><p>${t.rerun}</p><pre>node dist/packages/cli/index.js check --trace path/to/new-trace.json --out artifacts/recheck${locale === 'zh-CN' ? ' --lang zh-CN' : ''}</pre><p class="note">${t.fresh}</p></section>` : ''}
<details><summary>${t.money}</summary><div class="money-list">${fees.map(([label, v]) => `<div><small>${esc(label)}</small><strong>${esc(v ?? 'unknown')}</strong></div>`).join('')}</div><h4>${t.ledger}</h4><pre>${esc(JSON.stringify(report.replay.budget, null, 2))}</pre><h4>${t.quote}</h4><ul>${allocations}</ul></details>
<details><summary>${t.coverage} · ${report.coverage.evaluated}</summary><div class="table-wrap"><table><thead><tr><th>${t.rule}</th><th>${t.result}</th><th>${t.finding}</th><th>${t.enforcement}</th></tr></thead><tbody>${rows}</tbody></table></div></details>
<details><summary>${t.journal}</summary><div class="table-wrap"><table><thead><tr><th>${t.event}</th><th>${t.debitCol}</th><th>${t.credit}</th><th>${t.amount}</th></tr></thead><tbody>${report.replay.journal.map((j) => `<tr><td>${esc(j.eventId)}</td><td>${esc(j.debit)}</td><td>${esc(j.credit)}</td><td>${esc(j.amountAtomic)}</td></tr>`).join('')}</tbody></table></div></details>
<details><summary>${t.context}</summary><pre>${esc(JSON.stringify(report.scope, null, 2))}</pre><p>${t.status}: ${esc(report.replay.application)} / ${esc(report.replay.settlement)}</p><h4>${t.sources}</h4>${report.evidence.map((e) => `<p><code>${esc(e.id)}</code> · ${esc(e.provenance)}<small>${esc(e.description)}</small><small>${esc(e.digest)}</small></p>`).join('')}<ul>${report.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><small>Trace: ${esc(report.traceId)} · SHA-256: ${esc(report.traceDigest)}</small></details>
<footer>x402 Execution Lab · ${locale === 'zh-CN' ? '离线诊断 / 明细展开查看' : 'Offline diagnosis / expand for details'}</footer></main></body></html>`;
}
