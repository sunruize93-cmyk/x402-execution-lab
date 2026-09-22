import type { Report } from '../core/types.js';
const esc = (v: unknown) =>
  String(v ?? 'unknown').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const display = (v: string | null) => (v === null ? 'Unknown' : v);

/** Static, offline HTML. All source text is escaped; there are no scripts or remote assets. */
export function renderHtml(report: Report): string {
  const rows = report.findings
    .map(
      (f) =>
        `<tr><td><code>${esc(f.ruleId)}</code><small>${esc(f.scope)}</small></td><td><span class="status ${esc(f.status)}">${esc(f.status)}</span></td><td>${esc(f.explanation)}<small>${esc(f.evidenceRefs.join(', ') || 'No evidence reference')}</small></td><td><code>${esc(f.enforcement.level)}</code><small>${esc(f.enforcement.basis)}</small></td></tr>`,
    )
    .join('');
  const important = report.findings.filter(
    (f) => f.status === 'fail' || f.status === 'inconclusive',
  );
  const stats = [
    ['Rules evaluated', report.coverage.evaluated],
    ['Failed', report.coverage.fail],
    ['Incomplete', report.coverage.inconclusive],
    ['Chain payments', report.replay.confirmedTransactions.length],
  ];
  const fees = [
    ['Payer debit', display(report.fees.payerDebitAtomic)],
    ['Merchant credit', display(report.fees.merchantCreditAtomic)],
    ['Merchant net', display(report.fees.merchantNetAtomic)],
    ['Native gas (wei)', display(report.fees.nativeGasCostAtomic)],
    ['Extra chain fees (wei)', display(report.fees.extraChainFeesAtomic)],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>x402 Execution Lab — ${esc(report.traceId)}</title><style>
  :root{color-scheme:dark;--bg:#101718;--panel:#172225;--line:#334548;--text:#e6f0ee;--muted:#9cbbba;--accent:#adf4cc}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 ui-sans-serif,system-ui,sans-serif}main{max-width:1280px;margin:auto;padding:48px 32px 80px}header{border-bottom:1px solid var(--line);padding-bottom:32px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}h1{font-size:clamp(30px,5vw,52px);letter-spacing:-.04em;line-height:1.12;margin:16px 0}h2{font-size:22px;font-weight:500;margin:38px 0 16px}p{max-width:85ch}small{display:block;color:var(--muted);font-size:12px;margin-top:7px;overflow-wrap:anywhere}.muted{color:var(--muted)}.topline{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.status{display:inline-block;border:1px solid var(--line);padding:4px 10px;border-radius:4px;font:12px ui-monospace,monospace;white-space:nowrap}.pass{color:#a6ebc7;background:#17382c}.fail{color:#ffb8a9;background:#402723}.inconclusive{color:#f5d78c;background:#393323}.not_applicable{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-top:28px}.stat{background:var(--panel);padding:20px}.stat strong{display:block;font-size:30px;font-weight:500}.stat label{color:var(--muted);font-size:12px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.card{background:var(--panel);border:1px solid var(--line);padding:18px}.card strong{display:block;margin-top:9px;overflow-wrap:anywhere}code{font:12px/1.6 ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}.table-wrap{overflow:auto;border:1px solid var(--line)}table{border-collapse:collapse;width:100%;min-width:820px;text-align:left}td,th{padding:16px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--muted);font-weight:500;background:var(--panel)}td:first-child{min-width:185px}td:nth-child(3){width:40%}ul{padding-left:22px}li{margin:8px 0}.callout{border-left:3px solid var(--accent);padding:12px 20px;background:var(--panel)}details{border:1px solid var(--line);padding:16px;margin-top:20px}summary{cursor:pointer;color:var(--accent)}.evidence{padding:12px 0;border-bottom:1px solid var(--line)}footer{margin-top:40px;color:var(--muted);font-size:12px}@media(max-width:650px){main{padding:28px 18px}.grid{grid-template-columns:repeat(2,1fr)}.stat{padding:14px}}@media print{body{background:white;color:#111}main{padding:0}.card,.stat,th,.callout{background:#eee;color:#111}.muted,small{color:#555}table{min-width:0}details{display:block}}
  </style></head><body><main><header><div class="eyebrow">x402 Execution Lab / evidence report / v${esc(report.toolVersion)}</div><h1>${esc(report.traceId)}</h1><div class="topline"><span class="status ${esc(report.status)}">${esc(report.status)}</span><span>${esc(report.scope.network)} · ${esc(report.scope.tokenLabel)}</span></div><p class="muted">${esc(report.scope.adapter)} · ${esc(report.scope.revision)}<br>Job: ${esc(report.scope.jobId)}</p><div class="grid">${stats.map(([label, n]) => `<div class="stat"><label>${esc(label)}</label><strong>${esc(n)}</strong></div>`).join('')}</div></header>
  <h2>What happened</h2><div class="callout"><strong>${esc(report.replay.settlement)}</strong><br>Application: ${esc(report.replay.application)}. Cost evidence: ${esc(report.fees.costCoverage)}.<br>Evidence sources: ${esc([...new Set(report.evidence.map((e) => e.provenance))].join(', '))}.</div>
  <h2>Money and responsibility</h2><p class="muted">Token amounts are atomic integers. Native chain fees are separate; no FX estimate is inferred.</p><div class="cards">${fees.map(([label, v]) => `<div class="card"><span class="muted">${esc(label)}</span><strong><code>${esc(v)}</code></strong></div>`).join('')}</div>
  <h2>Budget ledger</h2><div class="cards">${Object.entries(report.replay.budget)
    .map(
      ([label, v]) =>
        `<div class="card"><span class="muted">${esc(label)}</span><strong>${esc(v)}</strong></div>`,
    )
    .join('')}</div>
  <h2>Needs attention</h2>${important.length ? `<ul>${important.map((f) => `<li><code>${esc(f.ruleId)}</code> — ${esc(f.explanation)}</li>`).join('')}</ul>` : '<p>No failed or incomplete rules in this report.</p>'}
  <h2>Rule coverage</h2><p class="muted">${report.coverage.pass} pass · ${report.coverage.fail} fail · ${report.coverage.inconclusive} inconclusive · ${report.coverage.not_applicable} not applicable</p><div class="table-wrap"><table><thead><tr><th>Rule / scope</th><th>Result</th><th>Finding / evidence</th><th>Enforcement / basis</th></tr></thead><tbody>${rows}</tbody></table></div>
  <details><summary>Evidence references and digests</summary>${report.evidence.map((e) => `<div class="evidence"><code>${esc(e.id)}</code> · ${esc(e.provenance)}<small>${esc(e.description)}</small><code>${esc(e.digest)}</code></div>`).join('')}</details>
  <details><summary>Double-entry journal</summary><div class="table-wrap"><table><thead><tr><th>Event</th><th>Debit</th><th>Credit</th><th>Atomic amount</th></tr></thead><tbody>${report.replay.journal.map((j) => `<tr><td>${esc(j.eventId)}</td><td>${esc(j.debit)}</td><td>${esc(j.credit)}</td><td>${esc(j.amountAtomic)}</td></tr>`).join('')}</tbody></table></div></details>
  <h2>Scope and limitations</h2><ul>${report.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><footer>Trace SHA-256: <code>${esc(report.traceDigest)}</code><br>Signatures and private request payloads are omitted. This report does not authorize payment.</footer></main></body></html>`;
}
