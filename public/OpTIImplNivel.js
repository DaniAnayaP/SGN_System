// ---------------------------------------------------------------------------
// TI › Implementación Inicial › un NIVEL (2 Diseño, 3 Estructura de Compañía, 4 Organigrama, 5 Layout de sitios, 6 Códigos y catálogos, 7 Asignación de accesos, 9 Conectividad API y 10 Arranque): la lista de lo que hay que dejar listo.
// Cada renglón abre la pantalla de siempre («Abrir ›»); lo que se captura ahí queda en su lugar normal y el implementador de SaaS marca el renglón como listo o «No aplica» (el cliente consulta). El nivel se abre cuando el anterior queda completo.
// Es UNA página para todos los niveles: el nivel sale de ?level=<clave> y de ahí se arma el id de pantalla (data-active-page) que usa el menú y el árbol de accesos. Los niveles 1 y 8 tienen su propia vista más adelante.
// Datos: GET /api/business/implementation (server.js), los mismos del Cronograma.
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/implementation';
const LEVEL_KEYS = ['contracted', 'design', 'structure', 'orgchart', 'layout', 'codes', 'access', 'training', 'api', 'startup'];
const asked = new URLSearchParams(location.search).get('level');
const LEVEL = LEVEL_KEYS.includes(asked) ? asked : 'design';
document.body.dataset.activePage = `cat-operaciones-ti-impl-${LEVEL}`; // antes de que Dashboard.js lea la pantalla activa
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
// «2026-03-18 15:04:05» (UTC) → el día en la hora de quien lo ve.
const stampDay = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }); };
const tr = (key, fallback) => { const text = t(key); return text.startsWith('main.') ? fallback : text; };
let state = null;

async function load() {
    const res = await fetch(API, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'request failed');
    return body;
}
function pill(level) {
    const tone = { done: 'approved', current: 'negotiating', locked: 'cancelled', na: 'cancelled' }[level.state] || 'cancelled';
    const label = level.state === 'current' && level.taskProgress !== null ? t('main.implStateProgress', { pct: level.taskProgress }) : t(`main.implState_${level.state}`);
    return `<span class="exp-chip exp-chip-${tone}">${esc(label)}</span>${level.late ? ` <span class="exp-chip exp-chip-pending">${esc(t('main.implState_late'))}</span>` : ''}`;
}
function taskRow(level, task) {
    const name = tr(`main.implTask_${level.key}_${task.key}`, task.key);
    const meta = task.status === 'done'
        ? [t('main.implTaskDoneOn', { date: stampDay(task.doneAt) }), task.doneBy ? t('main.implTaskBy', { by: task.doneBy }) : ''].filter(Boolean).join(' · ')
        : (task.status === 'na' ? [t('main.implTaskNaOn', { date: stampDay(task.doneAt) }), task.doneBy ? t('main.implTaskBy', { by: task.doneBy }) : ''].filter(Boolean).join(' · ') : '');
    const open = task.href ? `<a class="impl-go" href="${esc(task.href)}">${esc(t('main.implTaskOpen'))}</a>` : '';
    return `<div class="impl-task"><span class="impl-ck impl-ck-${esc(task.status)}" title="${esc(t(`main.implTaskState_${task.status}`))}" aria-label="${esc(t(`main.implTaskState_${task.status}`))}"></span>
        <div><b>${esc(name)}</b>${meta ? `<span class="impl-task-meta">${esc(meta)}</span>` : ''}</div>${open}</div>`;
}
function render() {
    const root = $('impl-root');
    const impl = state.implementation;
    const name = tr(`main.implLevelName_${LEVEL}`, LEVEL);
    const welcome = document.querySelector('.welcome-text');
    if (welcome) welcome.textContent = name;
    if (!impl) { root.innerHTML = `<p class="impl-empty">${esc(t('main.implNotStarted'))}</p>`; return; }
    const level = impl.levels.find((l) => l.key === LEVEL);
    if (!level) { root.innerHTML = `<p class="impl-empty">${esc(t('main.implLevelNotFound'))}</p>`; return; }
    const dates = level.startDate ? `${shortDate(level.startDate)} – ${shortDate(level.endDate)}` : t('main.implNoLevelDates');
    const current = impl.levels.find((l) => l.key === impl.currentKey);
    const locked = level.state === 'locked' && current ? `<span class="impl-sub">${esc(t('main.implLocked', { n: current.position }))}</span>` : '';
    const bar = level.tasksTotal
        ? `<div class="impl-prog"><div class="impl-prog-top"><span>${esc(t('main.implTasksOf', { done: level.tasksDone, total: level.tasksTotal }))}</span></div><div class="impl-prog-bar"><i style="width:${level.taskProgress || 0}%"></i></div></div>`
        : '';
    root.innerHTML = `<div class="impl-head"><div><h3>${level.position} · ${esc(name)}</h3><span class="impl-sub">${esc(dates)}</span><span class="impl-sub">${esc(impl.implementer ? t('main.implImplementer', { name: impl.implementer }) : t('main.implNoImplementer'))}</span>${locked}</div><div>${pill(level)}</div></div>
        ${bar}
        <div class="impl-tasks" data-help-key="implNivel">${level.tasks.map((task) => taskRow(level, task)).join('')}</div>`;
}
document.addEventListener('dashboard:language-changed', () => { if (state) render(); });
async function refresh(quiet) {
    try {
        state = await load();
        $('impl-error').hidden = true;
        render();
    } catch (err) {
        console.error('Implementación Inicial (nivel): failed to load', err);
        if (!quiet) { $('impl-error').textContent = t('main.implLoadError'); $('impl-error').hidden = false; }
    }
}
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refresh();
        setInterval(() => { if (!document.hidden) refresh(true); }, 60000); // el implementador marca los renglones: se vuelve a leer cada minuto
    } catch (err) {
        console.error('Implementación Inicial (nivel) failed to initialize:', err);
    }
})();
})();
