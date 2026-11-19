// ---------------------------------------------------------------------------
// TI › Implementación Inicial › Cronograma (solo consulta): todo lo que hay que dejar listo cuando SGN entra a la compañía, por NIVELES EN ORDEN y con cronograma (una fila por nivel, una columna por semana). El implementador de SaaS inicia la
// implementación, pone las fechas de cada nivel y marca lo terminado (Servicio a Cliente › Implementaciones); aquí se ve la semana en que va, el avance general y el nivel que sigue. Las fechas son de calendario (sin hora). Ruta en server.js
// (GET /api/business/implementation). Los renglones de cada nivel y el cierre llegan en las piezas siguientes.
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/implementation';
const MAX_WEEKS = 104; // el dibujo se limita a dos años; lo demás se recorta
const $ = (id) => document.getElementById(id);
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
// «2026-03-16» → fecha de calendario sin correrla por zonas horarias.
const dayOf = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
const shortDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '');
const longDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const levelName = (key) => { const name = t(`main.implLevelName_${key}`); return name.startsWith('main.') ? key : name; };
const levelSub = (key) => { const sub = t(`main.implLevelSub_${key}`); return sub.startsWith('main.') ? '' : sub; };
// «2026-03-18 15:04:05» (UTC) → el día en la hora de quien lo ve.
const stampDay = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }); };
let state = null;

async function load() {
    const res = await fetch(API, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'request failed');
    return body;
}
function pill(level) {
    const tone = { done: 'approved', current: 'negotiating', locked: 'cancelled', na: 'cancelled' }[level.state] || 'cancelled';
    // el nivel en curso muestra cuánto lleva por sus renglones («En curso · 75%»)
    const label = level.state === 'current' && level.taskProgress !== null ? t('main.implStateProgress', { pct: level.taskProgress }) : t(`main.implState_${level.state}`);
    return `<span class="exp-chip exp-chip-${tone}">${esc(label)}</span>${level.late ? ` <span class="exp-chip exp-chip-pending">${esc(t('main.implState_late'))}</span>` : ''}`;
}
function kpis(impl, clientName) {
    const weeks = impl.weekCount;
    let weekBox;
    if (!weeks) weekBox = `<b>—</b><span>${esc(t('main.implNoLevelDates'))}</span>`;
    else if (!impl.currentWeek) weekBox = `<b>${esc(t('main.implKpiBeforeStart'))}</b><span>${esc(t('main.implKpiOfWeeks', { total: weeks }))}</span>`;
    else if (impl.currentWeek > weeks) weekBox = `<b>${esc(t('main.implKpiAfterEnd'))}</b><span>${esc(t('main.implKpiOfWeeks', { total: weeks }))}</span>`;
    else weekBox = `<b>${esc(t('main.implKpiWeek', { n: impl.currentWeek }))}</b><span>${esc(t('main.implKpiOfWeeks', { total: weeks }))}</span>`;
    const current = impl.levels.find((l) => l.key === impl.currentKey);
    const levelBox = current
        ? `<b>${esc(t('main.implKpiLevel', { n: current.position }))}</b><span>${esc(levelName(current.key))} · ${esc(current.taskProgress !== null ? t('main.implStateProgress', { pct: current.taskProgress }) : t('main.implKpiInProgress'))}</span>`
        : `<b>${esc(t('main.implState_done'))}</b><span>${esc(t('main.implKpiAllDone'))}</span>`;
    return `<div class="impl-kpis" data-help-key="implKpis"><div class="impl-kpi">${weekBox}</div><div class="impl-kpi"><b>${impl.progress}%</b><span>${esc(t('main.implKpiProgress'))} · ${esc(t('main.implProgressOf', { done: impl.done, total: impl.total }))}</span></div><div class="impl-kpi">${levelBox}</div></div>`;
}
function gantt(impl) {
    const weeks = Math.min(impl.weekCount, MAX_WEEKS);
    const cols = `minmax(13rem, 1.4fr) ${weeks ? `repeat(${weeks}, minmax(2.1rem, 1fr))` : ''} minmax(9.5rem, 0.9fr)`;
    const now = impl.currentWeek && impl.currentWeek >= 1 && impl.currentWeek <= weeks ? impl.currentWeek : 0;
    const current = impl.levels.find((l) => l.key === impl.currentKey);
    let html = `<div class="impl-gantt" style="grid-template-columns: ${cols}">`;
    html += `<div class="impl-h impl-l">${esc(t('main.implLevelCol'))}</div>`;
    for (let w = 1; w <= weeks; w += 1) html += `<div class="impl-h${w === now ? ' impl-now' : ''}">${esc(t('main.implWeekShort', { n: w }))}</div>`;
    html += `<div class="impl-h impl-l">${esc(t('main.implDatesCol'))}</div>`;
    impl.levels.forEach((l) => {
        const sub = levelSub(l.key);
        html += `<div class="impl-nm"><span class="impl-n${l.optional ? ' impl-n-opt' : ''}">${l.position}</span><span class="impl-nt"><b>${esc(levelName(l.key))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`;
        const from = l.fromWeek && l.fromWeek >= 1 ? l.fromWeek : 0;
        const to = l.toWeek ? Math.min(l.toWeek, weeks) : 0;
        for (let w = 1; w <= weeks; w += 1) {
            const cls = `impl-c${w === now ? ' impl-now' : ''}`;
            if (from && to && w === from) html += `<div class="${cls}" style="grid-column: span ${Math.max(to - from + 1, 1)}"><div class="impl-bar impl-bar-${l.state}${l.late ? ' impl-bar-late' : ''}"></div></div>`;
            else if (!(from && to && w > from && w <= to)) html += `<div class="${cls}"></div>`;
        }
        const dates = l.startDate ? `${shortDate(l.startDate)} – ${shortDate(l.endDate)}` : t('main.implNoLevelDates');
        const hint = l.state === 'locked' && current ? `<span class="impl-hint">${esc(t('main.implLocked', { n: current.position }))}</span>` : '';
        html += `<div class="impl-st">${pill(l)}<span class="impl-dates">${esc(dates)}</span>${hint}</div>`;
    });
    return `${html}</div>`;
}
// El cierre (pieza 3): lo confirman las dos partes cuando todos los niveles están completos; la segunda confirmación finaliza la implementación. Los botones solo los ve quien tiene «Finalizar implementación» en su árbol.
function finishPanel(impl) {
    const f = impl.finish;
    if (!f) return '';
    const sideName = (side) => t(side === 'client' ? 'main.implSideClient' : 'main.implSideSaas');
    const party = (side) => t(side === 'client' ? 'main.implPartyClient' : 'main.implPartySaas');
    const confirmation = (side) => {
        const at = side === 'client' ? f.clientConfirmedAt : f.saasConfirmedAt;
        const by = side === 'client' ? f.clientConfirmedBy : f.saasConfirmedBy;
        return at ? t('main.implFinishConfirmedBy', { who: party(side), date: stampDay(at), by: by || '—' }) : t('main.implFinishPending', { who: party(side) });
    };
    let status;
    if (f.status === 'closed') status = t('main.implFinishClosed', { date: stampDay(f.closedAt) });
    else if (f.status === 'blocked') status = t('main.implFinishBlocked');
    else if (f.missing.length === 2) status = `${t('main.implFinishReady')} · ${t('main.implFinishAwaitingBoth')}`;
    else status = t(f.missing[0] === 'client' ? 'main.implFinishAwaitingClient' : 'main.implFinishAwaitingSaas');
    const tone = { closed: 'approved', blocked: 'cancelled', ready: 'negotiating', awaiting: 'negotiating' }[f.status] || 'cancelled';
    const lines = f.status === 'blocked' ? '' : `<span class="impl-sub">${esc(confirmation('client'))}</span><span class="impl-sub">${esc(confirmation('saas'))}</span>`;
    const rejection = f.rejection && f.status !== 'closed' ? `<span class="impl-sub impl-rejected">${esc(t('main.implFinishRejected', { who: sideName(f.rejection.side), date: stampDay(f.rejection.at), note: f.rejection.note }))}</span>` : '';
    let buttons = '';
    if (state.canFinalize && f.status !== 'closed') {
        if (f.status === 'blocked') buttons = `<button type="button" class="btn" disabled>${esc(t('main.implFinishTitle'))}</button>`;
        else buttons = `${f.clientConfirmedAt ? '' : `<button type="button" class="btn" data-impl-fin="confirm">${esc(t('main.implFinishConfirm'))}</button>`}<button type="button" class="btn btn-secondary" data-impl-fin="reject">${esc(t('main.implFinishReject'))}</button>`;
    }
    return `<div class="impl-card impl-finish" data-help-key="implFinish"><div class="impl-finish-head"><h4>${esc(t('main.implFinishTitle'))}</h4><span class="exp-chip exp-chip-${tone}">${esc(status)}</span></div>${lines}${rejection}${buttons ? `<div class="admin-form-actions">${buttons}</div>` : ''}</div>`;
}
function render() {
    const root = $('impl-root');
    const impl = state.implementation;
    if (!impl) { root.innerHTML = `<p class="impl-empty">${esc(t('main.implNotStarted'))}</p>`; return; }
    const range = impl.startDate ? t('main.implRange', { from: longDate(impl.startDate), to: longDate(impl.endDate), weeks: impl.weekCount }) : t('main.implNoDates');
    root.innerHTML = `<div class="impl-head"><div><h3>${esc(state.clientName)}</h3><span class="impl-sub">${esc(range)}</span><span class="impl-sub">${esc(impl.implementer ? t('main.implImplementer', { name: impl.implementer }) : t('main.implNoImplementer'))}</span></div>${kpis(impl, state.clientName)}</div>
        <div class="impl-frame" data-help-key="implGantt">${gantt(impl)}</div>${finishPanel(impl)}`;
}
// ---- confirmar o rechazar la finalización ----
async function post(path, body) {
    const res = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; throw err; }
    return out;
}
function finishError(err) {
    const code = err.body && err.body.code;
    const key = `main.implFinishErr_${code}`;
    const text = Dashboard.t(key);
    return text !== key ? text : t('main.implFinishErr_default');
}
function openReject() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel" role="dialog" aria-modal="true"><h3>${esc(t('main.implFinishRejectTitle'))}</h3>
        <div class="admin-field"><label for="impl-reject-note">${esc(t('main.implFinishRejectReason'))}</label><textarea id="impl-reject-note" rows="3" maxlength="600"></textarea></div>
        <p class="admin-error" id="impl-reject-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="impl-reject-ok">${esc(t('main.implFinishSend'))}</button><button type="button" class="btn btn-secondary" id="impl-reject-x">${esc(t('main.implFinishCancel'))}</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.querySelector('#impl-reject-x').addEventListener('click', close);
    overlay.querySelector('#impl-reject-ok').addEventListener('click', async () => {
        const note = overlay.querySelector('#impl-reject-note').value.trim();
        const errorEl = overlay.querySelector('#impl-reject-error');
        if (!note) { errorEl.textContent = t('main.implFinishErr_NOTE'); errorEl.hidden = false; return; }
        overlay.querySelector('#impl-reject-ok').disabled = true;
        try {
            await post('/api/business/implementation/finish/reject', { note });
            close();
            Dashboard.showToast(t('main.implFinishDone'), 'success');
            await refresh(true);
        } catch (err) {
            errorEl.textContent = finishError(err);
            errorEl.hidden = false;
            overlay.querySelector('#impl-reject-ok').disabled = false;
            if (err.body && ['NOT_READY', 'CLOSED'].includes(err.body.code)) refresh(true);
        }
    });
}
document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-impl-fin]');
    if (!btn) return;
    if (btn.dataset.implFin === 'reject') { openReject(); return; }
    btn.disabled = true;
    try {
        await post('/api/business/implementation/finish/confirm');
        Dashboard.showToast(t('main.implFinishDone'), 'success');
        await refresh(true);
    } catch (err) {
        Dashboard.showToast(finishError(err), 'error');
        btn.disabled = false;
        if (err.body && ['NOT_READY', 'ALREADY_CONFIRMED', 'CLOSED'].includes(err.body.code)) refresh(true);
    }
});
async function refresh(quiet) {
    try {
        state = await load();
        $('impl-error').hidden = true;
        render();
    } catch (err) {
        console.error('Implementación Inicial: failed to load', err);
        if (!quiet) { $('impl-error').textContent = t('main.implLoadError'); $('impl-error').hidden = false; }
    }
}
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refresh();
        setInterval(() => { if (!document.hidden) refresh(true); }, 60000); // el implementador fija fechas y marca niveles: se vuelve a leer cada minuto
    } catch (err) {
        console.error('Implementación Inicial failed to initialize:', err);
    }
})();
})();
