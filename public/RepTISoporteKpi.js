// ---------------------------------------------------------------------------
// TI > Operaciones TI > Reportes > KPI de Soporte: los indicadores de Soporte, sin capturar nada aparte (salen del recorrido de cada caso). Cada sección se ve con su hoja del árbol:
//   · Indicadores: casos, resueltos en el primer nivel, primera respuesta, tiempo de resolución, calificaciones, devueltos, plazos cumplidos, Urgentes en su plazo, casos sin tomar, cierres y conformidad.
//   · Casos que no se están tomando: cuántos, desde cuándo y por nivel, y si el sistema ya avisó.
//   · Cierres confiables: por quien cerró (conformes, sin respuesta, no conformes y reabiertos).
//   · KPI por prioridad: casos, primera respuesta, resolución, plazos y pausas por prioridad; el impacto más reportado.
//   · Desglose: dónde están los problemas, paso por paso (departamento → pantalla → categoría → causa), por departamento de quien reporta, por equipo (jefe directo) o por departamento del sistema.
// Periodo (este mes, el mes pasado, el trimestre, todo) y tipo (todos, Correctivo, Preventivo). Los datos salen de GET /api/business/support-kpi.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const locale = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const DEPT_KEYS = { marketing: 'menu.marketing', commercial: 'menu.commercial', purchasing: 'menu.purchasing', 'supply-chain': 'menu.supplyChain', 'management-control': 'menu.managementControl', 'general-management': 'menu.generalManagement', 'steering-committee': 'menu.steeringCommittee', certifications: 'menu.certifications', 'information-technology': 'menu.informationTechnology', 'human-resources': 'menu.humanResources', accounting: 'menu.accounting', finance: 'menu.finance' };
const state = { period: 'month', type: 'all', data: null, dim: 'dept', picks: [], loading: false };
// Minutos → «38 min», «9 h 24», «1 d 4 h»
function dur(min) {
    if (min === null || min === undefined) return '—';
    const n = Math.max(0, Number(min) || 0);
    if (n < 1) return '< 1 min';
    if (n < 60) return `${n} min`;
    if (n < 1440) return `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60}` : ''}`;
    return `${Math.floor(n / 1440)} d${Math.floor((n % 1440) / 60) ? ` ${Math.floor((n % 1440) / 60)} h` : ''}`;
}
const pctText = (v) => (v === null || v === undefined ? '—' : `${v} %`);
const starsText = (v) => (v === null || v === undefined ? '—' : `${v} ★`);
const priTag = (p) => `<span class="sp-tag sp-pri" data-k="${p}">${esc(t(`main.msPri_${p}`))}</span>`;
const lvTag = (l) => `<span class="sc-lv ${esc(l)}">${esc(String(l).toUpperCase())}</span>`;
const bar = (label, pct, n, cls) => `<div class="kp-bar-row"><div class="kp-bar-top"><span>${esc(label)}</span><b>${esc(n)}</b></div><div class="kp-bar"><i class="${cls || ''}" style="width:${Math.max(0, Math.min(100, pct || 0))}%"></i></div></div>`;

async function load() {
    state.loading = true;
    try {
        const res = await fetch(`/api/business/support-kpi?period=${state.period}&type=${state.type}`, { credentials: 'include' });
        if (!res.ok) { $('kp-root').innerHTML = `<p class="sp-muted">${esc(t('main.kpNoAccess'))}</p>`; return; }
        state.data = await res.json();
        render();
    } catch (err) {
        console.error('KPI de Soporte failed to load:', err);
        $('kp-root').innerHTML = `<p class="sp-muted">${esc(t('admin.saveError'))}</p>`;
    } finally { state.loading = false; }
}
function controlsHtml() {
    const periods = ['month', 'prev', 'quarter', 'all'].map((p) => `<button type="button" class="sp-chip${state.period === p ? ' on' : ''}" data-kp-period="${p}">${esc(t(`main.kpPeriod_${p}`))}</button>`).join('');
    const types = [['all', t('main.kpTypeAll')], ['c', t('main.spType_c')], ['p', t('main.spType_p')]].map(([k, label]) => `<button type="button" class="sp-chip${state.type === k ? ' on' : ''}" data-kp-type="${k}">${esc(label)}</button>`).join('');
    return `<div class="kp-controls"><div class="sp-chips" role="group" aria-label="${esc(t('main.kpPeriodLabel'))}">${periods}</div><div class="sp-chips" role="group" aria-label="${esc(t('main.kpTypeLabel'))}">${types}</div></div>`;
}
function tilesHtml(d) {
    const i = d.indicators;
    const tile = (label, value, detail) => `<div class="kp-tile"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(detail || '')}</small></div>`;
    const tiles = [
        tile(t('main.kpOpened'), i.opened, t('main.kpOpenedDetail', { open: i.inProgress, closed: i.closed })),
        ...(i.n0 ? [tile(t('main.kpN0'), pctText(i.n0.pct), t('main.kpN0Detail', { n: i.n0.n, of: i.n0.of }))] : []),
        tile(t('main.kpFirstLevel'), pctText(i.firstLevel.pct), t('main.kpFirstLevelDetail', { n: i.firstLevel.n, of: i.firstLevel.of })),
        tile(t('main.kpFirstResponse'), dur(i.firstResponseMin), t('main.kpAverage')),
        tile(t('main.kpResolution'), dur(i.resolutionMin), t('main.kpResolutionDetail')),
        tile(t('main.kpUserRating'), starsText(i.userRating.avg), t('main.kpUserRatingDetail', { n: i.userRating.n, of: i.userRating.of })),
        tile(t('main.kpTransferRating'), starsText(i.transferRating.avg), t('main.kpTransferRatingDetail', { n: i.transferRating.n })),
        tile(t('main.kpReturned'), i.returned.n, t('main.kpReturnedDetail', { pct: pctText(i.returned.pct) })),
        tile(t('main.kpOnTime'), pctText(i.onTime.pct), t('main.kpOnTimeDetail', { n: i.onTime.n, of: i.onTime.of })),
        tile(t('main.kpUrgentOnTime'), pctText(i.urgentOnTime.pct), t('main.kpUrgentOnTimeDetail', { n: i.urgentOnTime.n, of: i.urgentOnTime.of, pauses: i.urgentOnTime.pauses })),
        tile(t('main.kpUntaken'), i.untaken.n, t('main.kpUntakenDetail', { late: i.untaken.late })),
        tile(t('main.kpEvidence'), pctText(i.evidenceClosed.pct), t('main.kpEvidenceDetail', { n: i.evidenceClosed.n, of: i.evidenceClosed.of })),
        tile(t('main.kpConform'), pctText(i.conform.pct), t('main.kpConformDetail', { n: i.conform.n, of: i.conform.of, bad: i.conform.notConform, none: i.conform.noReply })),
    ];
    return `<section class="sc-card" data-help-key="kpIndicadores"><div class="sc-card-head"><h3>${esc(t('main.colKpIndicadores'))}</h3></div><div class="kp-tiles">${tiles.join('')}</div></section>`;
}
function untakenHtml(u) {
    const total = Object.values(u.byLevel).reduce((a, b) => a + b, 0);
    const funnel = ['n1', 'n2', 'n3', 'n4'].map((l) => bar(t(`main.sopLevel_${l}`), total ? Math.round((u.byLevel[l] / total) * 100) : 0, u.byLevel[l], `lv-${l}`)).join('');
    const rows = u.rows.map((r) => {
        const resp = r.overdueMin ? `<span class="sp-tag per-expired">${esc(t('main.kpOverdue', { time: dur(r.overdueMin) }))}</span>` : (r.dueAt ? `<span class="sp-tag per-confirmed">${esc(t('main.kpInTime'))}</span>` : '—');
        return `<tr><td><a href="OpTISoporteCaso.html?id=${r.id}"><b>${esc(r.folio)}</b></a></td><td>${priTag(r.priority)}</td><td>${lvTag(r.level)} ${esc(t(`main.sopLevel_${r.level}`))}</td><td>${esc(t('main.kpAgo', { time: dur(r.waitingMin) }))}</td><td>${resp}</td><td>${r.alerted ? esc(t('main.kpAlerted')) : '—'}</td></tr>`;
    }).join('');
    return `<section class="sc-card" data-help-key="kpSinTomar"><div class="sc-card-head"><h3>${esc(t('main.colKpSinTomar'))}</h3></div>
        ${u.rows.length ? `<div class="sc-sg-table"><table class="ms-table"><thead><tr><th>${esc(t('main.colScFolio'))}</th><th>${esc(t('main.colScPrioridad'))}</th><th>${esc(t('main.kpLevel'))}</th><th>${esc(t('main.kpWaiting'))}</th><th>${esc(t('main.kpFirstResponseCol'))}</th><th>${esc(t('main.kpSystemDid'))}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="sp-muted">${esc(t('main.kpNoUntaken'))}</p>`}
        <div class="kp-bars">${funnel}</div><p class="sp-muted">${esc(t('main.kpUntakenHint', { avg: dur(u.avgWaitMin) }))}</p></section>`;
}
function closersHtml(rows) {
    const body = rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.closes}</td><td class="num">${r.ok}</td><td class="num">${r.noReply}</td><td class="num">${r.notConform}</td><td class="num">${r.reopened}</td></tr>`).join('');
    return `<section class="sc-card" data-help-key="kpCierres"><div class="sc-card-head"><h3>${esc(t('main.colKpCierres'))}</h3></div>
        <ul class="kp-list"><li>${esc(t('main.kpTrust1'))}</li><li>${esc(t('main.kpTrust2'))}</li><li>${esc(t('main.kpTrust3'))}</li><li>${esc(t('main.kpTrust4'))}</li></ul>
        ${rows.length ? `<div class="sc-sg-table"><table class="ms-table"><thead><tr><th>${esc(t('main.kpCloser'))}</th><th>${esc(t('main.kpCloses'))}</th><th>${esc(t('main.kpConformCol'))}</th><th>${esc(t('main.kpNoReplyCol'))}</th><th>${esc(t('main.kpNotConformCol'))}</th><th>${esc(t('main.kpReopenedCol'))}</th></tr></thead><tbody>${body}</tbody></table></div>` : `<p class="sp-muted">${esc(t('main.kpNoClosures'))}</p>`}</section>`;
}
function priorityHtml(p) {
    const colors = { 1: 'bad', 2: 'warn', 3: 'blue', 4: 'grey' };
    const bars = p.rows.map((r) => bar(t(`main.msPri_${r.priority}`), r.pct, r.cases, colors[r.priority])).join('');
    const body = p.rows.map((r) => `<tr><td>${priTag(r.priority)}</td><td class="num">${r.cases}</td><td class="num">${dur(r.firstResponseMin)}</td><td class="num">${dur(r.resolutionMin)}</td><td class="num">${pctText(r.onTimePct)}</td><td class="num">${r.pauses || '—'}</td></tr>`).join('');
    const top = p.impacts.length ? Math.max(...p.impacts.map((i) => i.n)) : 1;
    const impacts = p.impacts.map((i) => bar(i.name, Math.round((i.n / top) * 100), i.n, 'blue')).join('');
    return `<section class="sc-card" data-help-key="kpPrioridad"><div class="sc-card-head"><h3>${esc(t('main.colKpPrioridad'))}</h3></div>
        <div class="kp-two"><div class="kp-bars">${bars}</div><div class="sc-sg-table"><table class="ms-table"><thead><tr><th>${esc(t('main.colScPrioridad'))}</th><th>${esc(t('main.kpCases'))}</th><th>${esc(t('main.kpFirstResponse'))}</th><th>${esc(t('main.kpResolutionCol'))}</th><th>${esc(t('main.kpOnTimeCol'))}</th><th>${esc(t('main.kpPauses'))}</th></tr></thead><tbody>${body}</tbody></table></div></div>
        <h4>${esc(t('main.kpImpacts'))}</h4>${impacts ? `<div class="kp-bars">${impacts}</div>` : `<p class="sp-muted">${esc(t('main.kpNoImpacts'))}</p>`}
        <p class="sp-muted">${esc(t('main.kpPausedHint', { n: p.pausedCases, avg: dur(p.avgPausedMin) }))}</p></section>`;
}
// ---- el desglose: cada columna se toca para bajar un nivel
const DRILL_FIELDS = ['dim', 'screen', 'category', 'cause'];
function dimValue(c) {
    if (state.dim === 'boss') return c.boss;
    if (state.dim === 'sys') return c.sysDept ? t(DEPT_KEYS[c.sysDept] || c.sysDept) : '';
    return c.dept;
}
function drillValue(c, level) {
    if (level === 0) return dimValue(c) || t('main.kpNone');
    if (level === 1) return c.screen || t('main.kpNone');
    if (level === 2) return c.category || t('main.kpNone');
    return c.closed ? (c.cause || t('main.kpNone')) : t('main.kpInProgress');
}
function drillHtml(d) {
    let rows = d.cases;
    const cols = [];
    for (let level = 0; level < 4; level += 1) {
        if (level > state.picks.length) break;
        const counts = new Map();
        rows.forEach((c) => { const k = drillValue(c, level); counts.set(k, (counts.get(k) || 0) + 1); });
        const list = [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
        const top = list.length ? list[0][1] : 1;
        const picked = state.picks[level];
        cols.push(`<div class="kp-dcol"><h4>${level + 1} · ${esc(t(`main.kpDrill_${level}`))}</h4>${list.map(([k, n]) => `<button type="button" class="kp-drow${picked === k ? ' sel' : ''}" data-kp-pick="${level}" data-v="${esc(k)}"><span>${esc(k)}</span><b>${n}</b><i style="width:${Math.round((n / top) * 100)}%"></i></button>`).join('')}</div>`);
        if (picked !== undefined) rows = rows.filter((c) => drillValue(c, level) === picked);
        else break;
    }
    const path = [t('main.kpAll', { n: d.cases.length }), ...state.picks.map((p, i) => `${p}`)].map((p, i, arr) => `<span class="kp-crumb${i === arr.length - 1 ? ' last' : ''}">${esc(p)}</span>`).join('<span class="kp-sep">›</span>');
    const final = state.picks.length >= 1 ? `<p class="sp-muted">${esc(t('main.kpDrillCases', { n: rows.length }))} ${rows.slice(0, 30).map((c) => `<a href="OpTISoporteCaso.html?id=${c.id}"><b>${esc(c.folio)}</b></a>`).join(' · ')}${rows.length > 30 ? ' …' : ''}</p>` : '';
    const dims = [['dept', t('main.kpDimDept')], ['boss', t('main.kpDimBoss')], ['sys', t('main.kpDimSys')]].map(([k, label]) => `<button type="button" class="sp-chip${state.dim === k ? ' on' : ''}" data-kp-dim="${k}">${esc(label)}</button>`).join('');
    return `<section class="sc-card" data-help-key="kpDesglose"><div class="sc-card-head"><h3>${esc(t('main.colKpDesglose'))}</h3><div class="sp-chips" role="group">${dims}</div></div>
        <div class="kp-path">${path}</div><div class="kp-drill">${cols.join('')}</div>${final}<p class="sp-muted">${esc(t('main.kpDrillHint'))}</p></section>`;
}
function render() {
    const d = state.data; if (!d) return;
    const s = d.sections;
    $('kp-root').innerHTML = `${controlsHtml()}${s.indicators ? tilesHtml(d) : ''}${s.untaken ? untakenHtml(d.untaken) : ''}${s.closers ? closersHtml(d.closers) : ''}${s.priority ? priorityHtml(d.priority) : ''}${s.drill ? drillHtml(d.drill) : ''}`;
}
$('kp-root').addEventListener('click', (event) => {
    const p = event.target.closest('[data-kp-period]');
    if (p) { state.period = p.dataset.kpPeriod; state.picks = []; load(); return; }
    const ty = event.target.closest('[data-kp-type]');
    if (ty) { state.type = ty.dataset.kpType; state.picks = []; load(); return; }
    const dim = event.target.closest('[data-kp-dim]');
    if (dim) { state.dim = dim.dataset.kpDim; state.picks = []; render(); return; }
    const pick = event.target.closest('[data-kp-pick]');
    if (pick) { const level = Number(pick.dataset.kpPick); state.picks = [...state.picks.slice(0, level), pick.dataset.v]; render(); }
});
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await load();
    } catch (err) {
        console.error('KPI de Soporte failed to initialize:', err);
    }
})();
})();
