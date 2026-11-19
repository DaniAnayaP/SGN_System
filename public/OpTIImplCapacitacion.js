// ---------------------------------------------------------------------------
// TI › Implementación Inicial › 8 · Capacitación (solo consulta): un CUMPLIMIENTO por cada módulo (departamento) que la compañía tiene habilitado. De cada uno se ve cuántas personas lo usan, cuántas sesiones de capacitación lleva (las que registra
// el implementador en Servicio a Cliente › Sesiones de capacitación; aquí se consultan en TI › Configuración Compañía › Sesiones de capacitación), cuántas de esas personas ya asistieron y su cumplimiento: Cumplido (lo marca el implementador, y pide
// al menos una sesión realizada del módulo con sus asistentes), En curso (ya tiene sesiones realizadas) o Pendiente. Si la compañía habilita un módulo nuevo, aparece aquí como un cumplimiento más. Datos: GET /api/business/implementation/training y
// /implementation (server.js).
// ---------------------------------------------------------------------------
(function () {
const TRAIN_API = '/api/business/implementation/training';
const IMPL_API = '/api/business/implementation';
const $ = (id) => document.getElementById(id);
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const dayOf = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
const shortDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '');
let modules = [];
let implementation = null;
let clientName = '';

async function getJson(path) {
    const res = await fetch(path, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'request failed');
    return body;
}
const chip = (state) => `<span class="exp-chip exp-chip-${{ done: 'approved', in_progress: 'negotiating', pending: 'pending', na: 'cancelled' }[state] || 'cancelled'}">${esc(t(`main.implTrainState_${state}`))}</span>`;
function head() {
    const level = implementation && implementation.levels.find((l) => l.key === 'training');
    const dates = level && level.startDate ? `${shortDate(level.startDate)} – ${shortDate(level.endDate)}` : t('main.implNoLevelDates');
    const locked = level && level.state === 'locked' && implementation.currentKey ? (() => { const cur = implementation.levels.find((l) => l.key === implementation.currentKey); return cur ? `<span class="impl-sub">${esc(t('main.implLocked', { n: cur.position }))}</span>` : ''; })() : '';
    let pill = '';
    if (level) {
        const tone = { done: 'approved', current: 'negotiating', locked: 'cancelled', na: 'cancelled' }[level.state] || 'cancelled';
        const label = level.state === 'current' && level.taskProgress !== null ? t('main.implStateProgress', { pct: level.taskProgress }) : t(`main.implState_${level.state}`);
        pill = `<span class="exp-chip exp-chip-${tone}">${esc(label)}</span>${level.late ? ` <span class="exp-chip exp-chip-pending">${esc(t('main.implState_late'))}</span>` : ''}`;
    }
    return `<div class="impl-head"><div><h3>${esc(t('menu.implLevel_training'))}</h3><span class="impl-sub">${esc(dates)}</span>${implementation ? `<span class="impl-sub">${esc(implementation.implementer ? t('main.implImplementer', { name: implementation.implementer }) : t('main.implNoImplementer'))}</span>` : ''}${locked}</div><div>${pill}</div></div>`;
}
function table() {
    if (!modules.length) return `<p class="impl-empty">${esc(t('main.implTrainNoModules'))}</p>`;
    const rows = modules.map((m) => {
        const sessions = [t('main.implTrainSessionsDone', { n: m.sessionsDone }), m.sessionsScheduled ? t(m.sessionsScheduled === 1 ? 'main.implTrainScheduledOne' : 'main.implTrainScheduledMany', { n: m.sessionsScheduled }) : ''].filter(Boolean).join(' · ');
        const when = m.status === 'done' && m.doneAt ? `<span class="impl-task-meta">${esc(t('main.implTaskBy', { by: m.doneBy || '—' }))}</span>` : '';
        return `<tr><td><b>${esc(t(m.labelKey))}</b></td><td>${m.users}</td><td>${esc(sessions)}</td><td>${esc(t('main.implTrainOf', { n: m.trained, total: m.users }))}</td><td>${chip(m.state)}${when}</td></tr>`;
    }).join('');
    return `<div class="impl-table-wrap" data-help-key="implTrain"><table class="impl-table"><thead><tr><th>${esc(t('main.implTrainModule'))}</th><th>${esc(t('main.implTrainUsers'))}</th><th>${esc(t('main.implTrainSessions'))}</th><th>${esc(t('main.implTrainTrained'))}</th><th>${esc(t('main.implTrainCompliance'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p><a class="impl-go" href="OpTICapacitacion.html">${esc(t('main.implTrainOpenSessions'))}</a></p>`;
}
function render() {
    if (!implementation) { $('impl-root').innerHTML = `<p class="impl-empty">${esc(t('main.implNotStarted'))}</p>`; return; }
    $('impl-root').innerHTML = `${head()}${table()}`;
}
async function refresh(quiet) {
    try {
        const [train, impl] = await Promise.all([getJson(TRAIN_API), getJson(IMPL_API)]);
        modules = train.modules; implementation = impl.implementation; clientName = impl.clientName;
        $('impl-error').hidden = true;
        render();
    } catch (err) {
        console.error('Implementación Inicial (capacitación): failed to load', err);
        if (!quiet) { $('impl-error').textContent = t('main.implLoadError'); $('impl-error').hidden = false; }
    }
}
document.addEventListener('dashboard:language-changed', () => { if (implementation) render(); });
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refresh();
        setInterval(() => { if (!document.hidden) refresh(true); }, 60000); // el implementador registra sesiones y marca módulos: se vuelve a leer cada minuto
    } catch (err) {
        console.error('Implementación Inicial (capacitación) failed to initialize:', err);
    }
})();
})();
