import type { CombinedSummary } from './summary.js';
import { formatAtomic } from '../cli/report.js';

type Locale = 'en' | 'zh-CN';

const escapeHtml = (value: unknown): string =>
  String(value ?? '—').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );

const copy = {
  en: {
    title: 'Compare decisions. Diagnose payments.',
    subtitle:
      'Compare agent decisions in simulation, then inspect payment behavior on a local chain.',
    language: '中文',
    languageFile: './report.zh-CN.html',
    benchmark: 'DECISION BENCHMARK',
    local: 'LOCAL TEST CHAIN',
    episodes: 'replayed and verified episodes',
    conditions: 'conditions',
    seeds: 'seeds per condition',
    retryCount: '+ 2 retry episodes',
    retryProtocol: 'naive-retry · late-unknown-dev · seed 7 · one episode per track',
    timeout: 'Timeout recovery',
    duplicate: 'Duplicate-payment case',
    confirmed: 'confirmed payment(s)',
    debit: 'test-token debit',
    pass: 'PASS',
    fail: 'FAIL',
    inconclusive: 'INCONCLUSIVE',
    compare: 'Did a different policy help?',
    compareNote: 'Mean utility · synthetic units · higher is better',
    scenario: 'Scenario',
    delta: 'Difference',
    pairs: 'Pairs',
    exploratory: 'Exploratory comparison; a few seeds do not establish a better policy.',
    direction:
      'Difference = right policy − left policy. Each pair uses the same scenario and seed.',
    retry: 'What happens when an agent retries?',
    guarded: 'Guarded simulation',
    diagnostic: 'Unsafe retry simulation',
    duplicates: 'duplicate payments',
    utility: 'utility',
    next: 'What to inspect next',
    verify: 'Verify the change',
    noIssue: 'No diagnostic issue was recorded for this case.',
    advice: 'Rule-based guidance for your integration; no automatic code changes.',
    fullDiagnosis: 'Full payment diagnosis',
    evidence: 'Open the underlying evidence',
    comparison: 'Paired comparison',
    leftReport: 'Left policy report',
    rightReport: 'Right policy report',
    json: 'Summary JSON',
    provenance: 'Methods, intervals and source digests',
    generated: 'Generated',
    engine: 'Benchmark engine',
    schema: 'Benchmark schema',
    intervals: '95% paired bootstrap intervals for the difference',
    method: 'Method',
    limits:
      'Benchmark results are synthetic; local payments use disposable test tokens and simulated delivery. Their units and outcomes are kept separate. No production provider or live-model performance is measured.',
  },
  'zh-CN': {
    title: '先比较决策，再看付款出了什么问题。',
    subtitle: '在模拟环境里对比 Agent 策略，再用本地链检查超时与重复付款。',
    language: 'English',
    languageFile: './report.en.html',
    benchmark: '决策基准 · 合成模拟',
    local: '付款测试 · 本地链',
    episodes: '个模拟回合已重放验证',
    conditions: '种条件',
    seeds: '个 seed / 条件',
    retryCount: '+ 2 个重试对照回合',
    retryProtocol: 'naive-retry · late-unknown-dev · seed 7 · 每条轨道 1 回合',
    timeout: '超时恢复',
    duplicate: '重复付款案例',
    confirmed: '笔已确认付款',
    debit: '测试代币扣款',
    pass: '通过',
    fail: '发现问题',
    inconclusive: '证据不足',
    compare: '换个策略，有没有改善？',
    compareNote: '平均效用 · 模拟单位 · 越高越好',
    scenario: '场景',
    delta: '差值',
    pairs: '配对数',
    exploratory: '这是探索性对照；少量 seed 的结果不足以证明某个策略更优。',
    direction: '差值 = 右侧策略 − 左侧策略。每一对使用相同场景与 seed。',
    retry: 'Agent 重试时，会发生什么？',
    guarded: '有保护的模拟',
    diagnostic: '放行危险重试的模拟',
    duplicates: '次重复付款',
    utility: '效用',
    next: '下一步先检查这里',
    verify: '修改后怎么验证',
    noIssue: '这条案例没有记录诊断问题。',
    advice: '根据规则结果提供排查建议，需要结合应用代码核对；不会自动改代码。',
    fullDiagnosis: '查看完整付款诊断',
    evidence: '查看原始报告',
    comparison: '配对比较',
    leftReport: '左侧策略报告',
    rightReport: '右侧策略报告',
    json: '汇总 JSON',
    provenance: '统计方法、区间与来源指纹',
    generated: '生成时间',
    engine: '基准引擎',
    schema: '基准契约',
    intervals: '效用差值的 95% 配对 Bootstrap 区间',
    method: '方法',
    limits:
      '决策结果来自合成模拟；本地链使用临时测试币，业务交付为模拟。两者的单位与结果分别展示，未测量生产服务商或真实模型表现。',
  },
} as const;

function displayNumber(value: number, locale: Locale): string {
  return Number.isFinite(value) ? value.toLocaleString(locale, { maximumFractionDigits: 2 }) : '—';
}

/** Offline presentation only: every result comes from the supplied combined summary. */
export function renderCombinedHtml(summary: CombinedSummary, locale: Locale = 'en'): string {
  const t = copy[locale];
  const benchmark = summary.benchmark;
  const comparison = benchmark.comparison;
  const conditions = Object.entries(comparison.results);
  const issue =
    summary.payments.duplicate.issues.find((candidate) => candidate.id === 'duplicate-payment') ??
    summary.payments.duplicate.issues[0];
  const number = (value: number): string => escapeHtml(displayNumber(value, locale));
  const statusLabel = (status: CombinedSummary['payments']['timeout']['status']): string =>
    t[status];
  const paymentCard = (
    payment: CombinedSummary['payments']['timeout'],
    title: string,
    path: string,
  ): string => `<article class="metric payment"><div class="eyebrow">${t.local}</div>
    <div class="metric-heading"><a href="${path}">${title}</a><span class="status ${payment.status === 'pass' ? 'pass' : payment.status === 'fail' ? 'fail' : 'inconclusive'}">${escapeHtml(statusLabel(payment.status))}</span></div>
    <p class="metric-value">${number(payment.confirmedPayments)} <span>${t.confirmed}</span></p>
    <p class="muted">${t.debit}: <strong>${escapeHtml(formatAtomic(payment.payerDebitAtomic, payment.decimals))}</strong></p></article>`;
  const rows = conditions
    .map(([scenario, result]) => {
      const count = result.pairs.length;
      const left = count ? result.pairs.reduce((total, pair) => total + pair.left, 0) / count : NaN;
      const right = count
        ? result.pairs.reduce((total, pair) => total + pair.right, 0) / count
        : NaN;
      return `<tr><th scope="row">${escapeHtml(scenario)}</th><td>${number(left)}</td><td>${number(right)}</td><td class="delta ${result.mean > 0 ? 'positive' : result.mean < 0 ? 'negative' : 'neutral'}">${result.mean > 0 ? '+' : ''}${number(result.mean)}</td><td>${number(result.n)}</td></tr>`;
    })
    .join('');
  const intervals = conditions
    .map(
      ([scenario, result]) =>
        `<li><code>${escapeHtml(scenario)}</code>: ${result.ci95 ? `[${number(result.ci95[0])}, ${number(result.ci95[1])}]` : '—'} · n=${number(result.n)}</li>`,
    )
    .join('');
  const diagnosis = issue
    ? `<h3>${escapeHtml(issue.title)}</h3><ol>${issue.steps
        .slice(0, 2)
        .map((step) => `<li>${escapeHtml(step)}</li>`)
        .join(
          '',
        )}</ol><div class="verify"><strong>${t.verify}</strong><p>${escapeHtml(issue.verify)}</p></div>`
    : `<p>${t.noIssue}</p>`;

  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>x402 Execution Lab — ${t.title}</title><style>
:root{color-scheme:light;--ink:#172d2b;--muted:#607370;--paper:#f3f6f3;--line:#d9e3dc;--green:#13644a;--orange:#a64b28}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:13px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1240px;margin:auto;padding:24px 28px 22px}a{color:var(--green);text-underline-offset:3px}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:18px}.brand{font:11px/1.4 ui-monospace,monospace;letter-spacing:.13em;color:var(--green);margin-bottom:8px}h1{font-size:30px;line-height:1.2;letter-spacing:-.035em;margin:0 0 6px;font-weight:650}header p{margin:0;color:var(--muted)}.language{white-space:nowrap;font-size:12px;margin-top:4px}.eyebrow{font-size:10px;letter-spacing:.1em;font-weight:650;color:var(--muted)}.metrics{display:grid;grid-template-columns:1.08fr 1fr 1fr;gap:12px;margin-bottom:16px}.metric{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 18px}.metric-heading{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:6px;font-weight:600}.metric-heading a{text-decoration:none;color:var(--ink)}.metric-value{font-size:30px;line-height:1.15;letter-spacing:-.035em;margin:8px 0 6px;font-weight:650}.metric-value span{font-size:12px;font-weight:400;letter-spacing:0;color:var(--muted)}.muted{color:var(--muted);font-size:11px;margin:0}.status{font-size:10px;font-weight:650;border-radius:4px;padding:3px 7px;white-space:nowrap}.pass{background:#e4f3e9;color:#276242}.fail{background:#fff0e7;color:var(--orange)}.inconclusive{background:#f7f0d8;color:#826719}.content{display:grid;grid-template-columns:1.14fr 1fr;gap:16px;align-items:start}.panel{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px}h2{font-size:16px;margin:0 0 3px;line-height:1.35}h3{font-size:13px;margin:8px 0 6px;line-height:1.4}.table-wrap{overflow:auto;margin-top:12px}table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}th,td{padding:8px 7px;text-align:right;border-bottom:1px solid #edf1ed}thead th{font-size:10px;color:var(--muted);font-weight:500}th:first-child{text-align:left;padding-left:0}tbody th{font:11px/1.4 ui-monospace,monospace;font-weight:400;white-space:nowrap}tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}.delta{font-weight:650}.positive{color:var(--green)}.negative{color:var(--orange)}.neutral{color:var(--muted)}.table-note{font-size:10px;color:var(--muted);margin:9px 0 0}.stack{display:grid;gap:12px}.stack>.panel:first-child{padding:12px 16px}.stack>.panel:first-child h2{font-size:14px}.retry-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:7px}.retry-grid>div+div{border-left:1px solid var(--line);padding-left:14px}.retry-grid p{font-size:10px;margin:0;color:var(--muted)}.retry-grid strong{font-size:22px;line-height:1.2;font-weight:650;margin-right:4px;color:var(--ink)}.retry-grid .retry-value{margin:4px 0}.diagnosis{padding:12px 16px;border-top:3px solid #9abbaa}.diagnosis ol{margin:8px 0 12px;padding-left:18px;font-size:11px;line-height:1.55}.diagnosis li+li{margin-top:6px}.verify{background:#f2f6f2;border-radius:6px;padding:9px 11px;font-size:11px}.verify strong{font-size:10px;color:var(--green)}.verify p{margin:3px 0 0}.advice{font-size:10px;color:var(--muted);margin:9px 0 4px}.diagnosis>a{font-size:11px}.evidence{display:flex;gap:10px 18px;flex-wrap:wrap;align-items:center;margin:14px 0 10px;font-size:11px}.evidence strong{font-weight:500;color:var(--muted)}details{border-top:1px solid var(--line);padding-top:10px;font-size:11px;color:var(--muted)}summary{cursor:pointer;display:list-item}details dl{display:grid;grid-template-columns:130px minmax(0,1fr);gap:6px}details dt{font-weight:600}details dd{margin:0;overflow-wrap:anywhere}details ul{padding-left:18px}code{font:10px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}footer{font-size:10px;line-height:1.5;color:var(--muted);margin-top:10px;max-width:1050px}@media(max-width:850px){main{padding:20px}.metrics{grid-template-columns:1fr 1fr}.metric:first-child{grid-column:1/-1}.content{grid-template-columns:1fr}.table-wrap{margin-top:10px}h1{font-size:26px}}@media(max-width:480px){main{padding:16px 12px}.metrics{gap:8px}.metric{padding:12px}.metric-heading{align-items:flex-start;flex-direction:column;gap:5px}.metric-value{font-size:26px}.metric-value span{display:block;margin-top:5px}.panel{padding:14px}header{gap:10px}h1{font-size:23px}.metric:first-child .metric-value span{display:inline}.table-wrap table{min-width:440px}details dl{grid-template-columns:1fr}details dd{margin-bottom:7px}}@media print{body{background:white}main{max-width:none}.metric,.panel{break-inside:avoid}.language{display:none}}
</style></head><body><main>
<header><div><div class="brand">X402 EXECUTION LAB / WORKBENCH</div><h1>${t.title}</h1><p>${t.subtitle}</p></div><a class="language" href="${t.languageFile}" lang="${locale === 'en' ? 'zh-CN' : 'en'}">${t.language}</a></header>
<section class="metrics" aria-label="${escapeHtml(t.evidence)}"><article class="metric"><div class="eyebrow">${t.benchmark}</div><p class="metric-value">${number(benchmark.verifiedEpisodes)} <span>${t.episodes}</span></p><p class="muted">${number(conditions.length)} ${t.conditions} · ${number(benchmark.seeds.length)} ${t.seeds} · ${t.retryCount}</p></article>${paymentCard(summary.payments.timeout, t.timeout, './lab/timeout/report.html')}${paymentCard(summary.payments.duplicate, t.duplicate, './lab/duplicate/report.html')}</section>
<section class="content"><article class="panel"><h2>${t.compare}</h2><p class="muted">${t.compareNote}</p><div class="table-wrap"><table><thead><tr><th scope="col">${t.scenario}</th><th scope="col">${escapeHtml(comparison.left_policy)}</th><th scope="col">${escapeHtml(comparison.right_policy)}</th><th scope="col">${t.delta}</th><th scope="col">${t.pairs}</th></tr></thead><tbody>${rows}</tbody></table></div><p class="table-note">${t.direction}</p><p class="table-note">${t.exploratory}</p></article>
<div class="stack"><article class="panel"><h2>${t.retry}</h2><p class="muted">${t.retryProtocol}</p><div class="retry-grid"><div><p>${t.guarded}</p><p class="retry-value"><strong>${number(benchmark.retry.guarded.duplicatePayments)}</strong>${t.duplicates} · ${t.utility} ${number(benchmark.retry.guarded.utility)}</p></div><div><p>${t.diagnostic}</p><p class="retry-value"><strong>${number(benchmark.retry.diagnostic.duplicatePayments)}</strong>${t.duplicates} · ${t.utility} ${number(benchmark.retry.diagnostic.utility)}</p></div></div></article><article class="panel diagnosis"><div class="eyebrow">${t.next}</div>${diagnosis}<p class="advice">${t.advice}</p><a href="./lab/duplicate/report.html">${t.fullDiagnosis} →</a></article></div></section>
<nav class="evidence" aria-label="${t.evidence}"><strong>${t.evidence}</strong><a href="./bench/comparison/report.md">${t.comparison}</a><a href="./bench/cheapest/report.md">${t.leftReport}</a><a href="./bench/expected-cost/report.md">${t.rightReport}</a><a href="./summary.json">${t.json}</a></nav>
<details><summary>${t.provenance}</summary><dl><dt>${t.generated}</dt><dd>${escapeHtml(summary.generatedAt)}</dd><dt>${t.schema}</dt><dd>${escapeHtml(benchmark.schemaVersion)}</dd><dt>${t.engine}</dt><dd><code>${escapeHtml(benchmark.engineDigest)}</code></dd><dt>${t.timeout}</dt><dd><code>${escapeHtml(summary.payments.timeout.traceDigest)}</code></dd><dt>${t.duplicate}</dt><dd><code>${escapeHtml(summary.payments.duplicate.traceDigest)}</code></dd><dt>${t.method}</dt><dd>${escapeHtml(comparison.method)}</dd></dl><p>${t.intervals}</p><ul>${intervals}</ul></details>
<footer>${t.limits}</footer></main></body></html>`;
}
