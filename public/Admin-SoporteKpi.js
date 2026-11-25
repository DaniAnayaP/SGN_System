// ---------------------------------------------------------------------------
// Servicio a Cliente › Soporte › pestaña «KPI del Nivel 4» (lado SaaS, el proveedor): los indicadores de los casos de TODAS las empresas que llegaron al Nivel 4, sin capturar nada aparte (salen del recorrido de cada caso). Cada sección se ve
// con su botón del árbol de accesos de la cuenta (Equipo SaaS): Indicadores, Casos sin tomar, Por empresa, Por persona y Por qué llegan. Periodo (este mes, el mes pasado, el trimestre, todo), tipo (todos, Correctivo, Preventivo) y empresa.
// Los datos salen de GET /api/admin/support-kpi. Admin-SoporteCasos.js muestra y oculta esta pestaña (window.SaasSupportKpi.show).
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
const DEPT_KEYS = { marketing: 'menu.marketing', commercial: 'menu.commercial', purchasing: 'menu.purchasing', 'supply-chain': 'menu.supplyChain', 'management-control': 'menu.managementControl', 'general-management': 'menu.generalManagement', 'steering-committee': 'menu.steeringCommittee', certifications: 'menu.certifications', 'information-technology': 'menu.informationTechnology', analysis: 'menu.analysis', 'human-resources': 'menu.humanResources', accounting: 'menu.accounting', finance: 'menu.finance' };
const state = { period: 'month', type: 'all', clientId: '', data: null, loading: false, shown: false };
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
const okText = (x) => (x && x.of ? `${x.pct} % (${x.n}/${x.of})` : '—');
const starsText = (v) => (v === null || v === undefined ? '—' : `${v} ★`);
const priTag = (p) => `<span class="sp-tag sp-pri" data-k="${p}">${esc(t(`main.msPri_${p}`))}</span>`;
const bar = (label, pct, n, cls) => `<div class="kp-bar-row"><div class="kp-bar-top"><span>${esc(label)}</span><b>${esc(n)}</b></div><div class="kp-bar"><i class="${cls || ''}" style="width:${Math.max(0, Math.min(100, pct || 0))}%"></i></div></div>`;
const deptName = (id) => (id ? t(DEPT_KEYS[id] || id) : t('main.kpNone'));
const sectorName = (name) => name || t('main.kpNone');

async function load() {
    const root = $('ss-kpi');
    if (!root) return;
    state.loading = true;
    try {
        const qs = `period=${state.period}&type=${state.type}${state.clientId ? `&clientId=${encodeURIComponent(state.clientId)}` : ''}`;
        const res = await fetch(`/api/admin/support-kpi?${qs}`, { credentials: 'include' });
        if (!res.ok) { root.innerHTML = `<p class="sp-muted">${esc(t('main.kpNoAccess'))}</p>`; return; }
        state.data = await res.json();
        render();
    } catch (err) {
        console.error('KPI del Nivel 4 failed to load:', err);
        root.innerHTML = `<p class="sp-muted">${esc(t('admin.saveError'))}</p>`;
    } finally { state.loading = false; }
}
function controlsHtml(d) {
    const periods = ['month', 'prev', 'quarter', 'all'].map((p) => `<button type="button" class="sp-chip${state.period === p ? ' on' : ''}" data-sk-period="${p}">${esc(t(`main.kpPeriod_${p}`))}</button>`).join('');
    const types = [['all', t('main.kpTypeAll')], ['c', t('main.spType_c')], ['p', t('main.spType_p')]].map(([k, label]) => `<button type="button" class="sp-chip${state.type === k ? ' on' : ''}" data-sk-type="${k}">${esc(label)}</button>`).join('');
    const options = [`<option value="">${esc(t('admin.saasKpiClientAll'))}</option>`, ...(d.clientsList || []).map((c) => `<option value="${esc(c.id)}"${String(state.clientId) === String(c.id) ? ' selected' : ''}>${esc(c.name)}</option>`)].join('');
    return `<div class="kp-controls"><div class="sp-chips" role="group" aria-label="${esc(t('main.kpPeriodLabel'))}">${periods}</div><div class="sp-chips" role="group" aria-label="${esc(t('main.kpTypeLabel'))}">${types}</div><label class="sp-chips"><span class="sp-muted">${esc(t('admin.saasKpiClientLabel'))}</span> <select id="ss-kpi-client">${options}</select></label></div>`;
}
function tilesHtml(i) {
    const tile = (label, value, detail) => `<div class="kp-tile"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(detail || '')}</small></div>`;
    const tags = i.receiveRating.tags.length ? ` · ${i.receiveRating.tags.map((x) => t(`main.rtTag_receive_${x.tag}`) + (x.n > 1 ? ` (${x.n})` : '')).join(', ')}` : '';
    const tiles = [
        tile(t('admin.saasKpiReceived'), i.received, t('admin.saasKpiReceivedDetail', { company: i.fromCompany, direct: i.direct })),
        tile(t('admin.saasKpiInN4'), i.inN4Now, t('admin.saasKpiInN4Detail')),
        tile(t('admin.saasKpiResolved'), pctText(i.resolved.pct), t('admin.saasKpiResolvedDetail', { n: i.resolved.n, of: i.resolved.of })),
        tile(t('admin.saasKpiReturned'), i.returned.n, t('admin.saasKpiReturnedDetail', { pct: pctText(i.returned.pct) })),
        tile(t('admin.saasKpiFirstReply'), dur(i.firstReplyMin), t('admin.saasKpiFirstReplyDetail')),
        tile(t('admin.saasKpiResolution'), dur(i.resolutionMin), t('admin.saasKpiResolutionDetail')),
        tile(t('admin.saasKpiOnTimeFirst'), pctText(i.deadlines.first.pct), i.deadlines.cases ? t('admin.saasKpiOnTimeDetail', { n: i.deadlines.first.n, of: i.deadlines.first.of, pending: i.deadlines.first.pending }) : t('admin.saasKpiOnTimeNone')),
        tile(t('admin.saasKpiOnTimeResolve'), pctText(i.deadlines.resolve.pct), i.deadlines.cases ? t('admin.saasKpiOnTimeDetail', { n: i.deadlines.resolve.n, of: i.deadlines.resolve.of, pending: i.deadlines.resolve.pending }) : t('admin.saasKpiOnTimeNone')),
        tile(t('main.kpConform'), pctText(i.conform.pct), t('main.kpConformDetail', { n: i.conform.n, of: i.conform.of, bad: i.conform.notConform, none: i.conform.noReply })),
        tile(t('main.kpUserRating'), starsText(i.userRating.avg), t('admin.saasKpiUserRatingDetail', { n: i.userRating.n })),
        tile(t('admin.saasKpiReceiveRating'), starsText(i.receiveRating.avg), `${t('admin.saasKpiReceiveRatingDetail', { n: i.receiveRating.n })}${tags}`),
        tile(t('admin.saasKpiReopened'), i.reopened.n, t('admin.saasKpiReopenedDetail', { pct: pctText(i.reopened.pct) })),
        tile(t('main.kpUntaken'), i.untaken.n, t('main.kpUntakenDetail', { late: i.untaken.late })),
    ];
    // los plazos de GEIPSA por prioridad (solo si hay casos con plazos propios)
    const dlRows = i.deadlines.byPriority.filter((r) => r.cases).map((r) => `<tr><td>${priTag(r.priority)}</td><td class="num">${r.cases}</td><td class="num">${okText(r.first)}</td><td class="num">${okText(r.resolve)}</td></tr>`).join('');
    const dl = dlRows ? `<h4>${esc(t('admin.saasKpiDeadlinesTitle'))}</h4><div class="sc-sg-table"><table class="ms-table"><thead><tr><th>${esc(t('main.colScPrioridad'))}</th><th>${esc(t('admin.saasKpiDeadlineCases'))}</th><th>${esc(t('admin.saasKpiOnTimeFirstShort'))}</th><th>${esc(t('admin.saasKpiOnTimeResolveShort'))}</th></tr></thead><tbody>${dlRows}</tbody></table></div>` : '';
    return `<section class="sc-card" data-help-key="saasKpiIndicadores"><div class="sc-card-head"><h3>${esc(t('admin.saasKpiIndicators'))}</h3></div><div class="kp-tiles">${tiles.join('')}</div>${dl}</section>`;
}
function untakenHtml(u) {
    const total = u.bySector.reduce((a, b) => a + b.n, 0);
    const funnel = u.bySector.map((s) => bar(sectorName(s.name), total ? Math.round((s.n / total) * 100) : 0, s.n, 'blue')).join('');
    const rows = u.rows.map((r) => {
        const resp = r.overdueMin ? `<span class="sp-tag per-expired">${esc(t('main.kpOverdue', { time: dur(r.overdueMin) }))}</span>` : '—';
        return `<tr><td><a href="Admin-SoporteCaso.html?id=${r.id}"><b>${esc(r.folio)}</b></a></td><td>${esc(r.client)}</td><td>${esc(sectorName(r.sector))}</td><td>${priTag(r.priority)}</td><td>${esc(r.direct ? t('admin.saasSpDirect') : t('admin.saasKpiFromCompany'))}</td><td>${esc(t('main.kpAgo', { time: dur(r.waitingMin) }))}</td><td>${resp}</td></tr>`;
    }).join('');
    return `<section class="sc-card" data-help-key="saasKpiSinTomar"><div class="sc-card-head"><h3>${esc(t('admin.saasKpiUntakenTitle'))}</h3></div>
        ${u.rows.length ? `<div class="sc-sg-table"><table class="ms-table"><thead><tr><th>${esc(t('main.colScFolio'))}</th><th>${esc(t('admin.saasSpColClient'))}</th><th>${esc(t('admin.saasSpColSector'))}</th><th>${esc(t('main.colScPrioridad'))}</th><th>${esc(t('admin.saasKpiArrived'))}</th><th>${esc(t('main.kpWaiting'))}</th><th>${esc(t('main.kpFirstResponseCol'))}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="sp-muted">${esc(t('main.kpNoUntaken'))}</p>`}
        ${funnel ? `<h4>${esc(t('admin.saasKpiBySector'))}</h4><div class="kp-bars">${funnel}</div>` : ''}<p class="sp-muted">${esc(t('admin.saasKpiUntakenHint', { avg: dur(u.avgWaitMin) }))}</p></section>`;
}
function clientsHtml(rows) {
    const body = rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(sectorName(r.sector))}</td><td class="num">${r.received}</td><td class="num">${r.direct}</td><td class="num">${r.openNow}</td><td class="num">${r.resolved}</td><td class="num">${r.returned}</td><td class="num">${dur(r.firstReplyMin)}</td><td class="num">${dur(r.resolutionMin)}</td><td class="num">${okText(r.deadlines.first)}</td><td class="num">${okText(r.deadlines.resolve)}</td></tr>`).join('');
    return `<section class="sc-card" data-help-key="saasKpiClientes"><div class="sc-card-head"><h3>${esc(t('admin.saasKpiClients'))}</h3></div>
        ${rows.length ? `<div class="sc-sg-table"><table class="ms-table"><thead><tr><th>${esc(t('admin.saasSpColClient'))}</th><th>${esc(t('admin.saasSpColSector'))}</th><th>${esc(t('admin.saasKpiReceived'))}</th><th>${esc(t('admin.saasKpiDirectCol'))}</th><th>${esc(t('admin.saasKpiInN4'))}</th><th>${esc(t('admin.saasKpiResolvedCol'))}</th><th>${esc(t('admin.saasKpiReturnedCol'))}</th><th>${esc(t('admin.saasKpiFirstReply'))}</th><th>${esc(t('admin.saasKpiResolution'))}</th><th>${esc(t('admin.saasKpiOnTimeFirstShort'))}</th><th>${esc(t('admin.saasKpiOnTimeResolveShort'))}</th></tr></thead><tbody>${body}</tbody></table></div>` : `<p class="sp-muted">${esc(t('admin.saasKpiEmpty'))}</p>`}</section>`;
}
function peopleHtml(rows) {
    const body = rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.taken}</td><td class="num">${dur(r.firstReplyMin)}</td><td class="num">${okText(r.onTime)}</td><td class="num">${r.resolved}</td><td class="num">${r.closed}</td><td class="num">${starsText(r.userRating)}</td></tr>`).join('');
    return `<section class="sc-card" data-help-key="saasKpiPersonas"><div class="sc-card-head"><h3>${esc(t('admin.saasKpiPeople'))}</h3></div>
        ${rows.length ? `<div class="sc-sg-table"><table class="ms-table"><thead><tr><th>${esc(t('admin.saasKpiPerson'))}</th><th>${esc(t('admin.saasKpiTakenCol'))}</th><th>${esc(t('admin.saasKpiFirstReply'))}</th><th>${esc(t('admin.saasKpiOnTimeFirstShort'))}</th><th>${esc(t('admin.saasKpiResolvedCol'))}</th><th>${esc(t('admin.saasKpiClosedCol'))}</th><th>${esc(t('main.kpUserRating'))}</th></tr></thead><tbody>${body}</tbody></table></div>` : `<p class="sp-muted">${esc(t('admin.saasKpiEmpty'))}</p>`}
        <p class="sp-muted">${esc(t('admin.saasKpiPeopleHint'))}</p></section>`;
}
function reasonsHtml(r) {
    const top = r.reasons.length ? Math.max(...r.reasons.map((x) => x.n)) : 1;
    const reasons = r.reasons.map((x) => bar(x.reason === 'direct' ? t('admin.saasSpDirect') : t(`main.mvReason_${x.reason}`), Math.round((x.n / top) * 100), `${x.n} · ${pctText(x.pct)}`, x.reason === 'direct' ? 'warn' : 'blue')).join('');
    const table = (title, list, nameOf) => `<div><h4>${esc(title)}</h4>${list.length ? `<table class="ms-table"><thead><tr><th></th><th>${esc(t('admin.saasKpiReceived'))}</th><th>${esc(t('admin.saasKpiResolvedCol'))}</th></tr></thead><tbody>${list.map((x) => `<tr><td>${esc(nameOf(x.name))}</td><td class="num">${x.n}</td><td class="num">${x.resolved}</td></tr>`).join('')}</tbody></table>` : `<p class="sp-muted">${esc(t('admin.saasKpiEmpty'))}</p>`}</div>`;
    return `<section class="sc-card" data-help-key="saasKpiPorQue"><div class="sc-card-head"><h3>${esc(t('admin.saasKpiReasons'))}</h3></div>
        <h4>${esc(t('admin.saasKpiReasonsHow'))}</h4>${reasons ? `<div class="kp-bars">${reasons}</div>` : `<p class="sp-muted">${esc(t('admin.saasKpiEmpty'))}</p>`}
        <div class="kp-two">${table(t('admin.saasKpiBySector'), r.bySector, sectorName)}${table(t('admin.saasKpiByDepartment'), r.byDepartment, deptName)}${table(t('admin.saasKpiByCategory'), r.byCategory, (n) => n || t('main.kpNone'))}</div></section>`;
}
function render() {
    const d = state.data; if (!d) return;
    const s = d.sections;
    const sel = document.activeElement && document.activeElement.id === 'ss-kpi-client';
    $('ss-kpi').innerHTML = `${controlsHtml(d)}${s.indicators ? tilesHtml(d.indicators) : ''}${s.untaken ? untakenHtml(d.untaken) : ''}${s.clients ? clientsHtml(d.clients) : ''}${s.people ? peopleHtml(d.people) : ''}${s.reasons ? reasonsHtml(d.reasons) : ''}`;
    if (sel) $('ss-kpi-client').focus();
}
document.addEventListener('click', (event) => {
    if (!event.target.closest('#ss-kpi')) return;
    const p = event.target.closest('[data-sk-period]');
    if (p) { state.period = p.dataset.skPeriod; load(); return; }
    const ty = event.target.closest('[data-sk-type]');
    if (ty) { state.type = ty.dataset.skType; load(); }
});
document.addEventListener('change', (event) => {
    if (event.target && event.target.id === 'ss-kpi-client') { state.clientId = event.target.value; load(); }
});
// Admin-SoporteCasos.js lo llama al abrir la pestaña
window.SaasSupportKpi = { show() { state.shown = true; load(); } };
})();
