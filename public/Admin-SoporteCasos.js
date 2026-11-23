// ---------------------------------------------------------------------------
// Servicio a Cliente › Soporte (lado SaaS, Nivel 4 · el proveedor): la bandeja con los casos de soporte de TODOS los clientes que llegaron hasta GEIPSA (los que subió el Nivel 3 de la empresa, o que entraron directo porque
// la empresa no contrató TI). Pestañas: «Mis casos» (los que yo tomé y siguen en el Nivel 4), «Sin asignar» (esperan a que alguien los tome) y «Todos» (también los que ya regresaron a la empresa). Cada renglón trae el cliente, su giro,
// de dónde viene el caso y por qué, prioridad, estatus y quién lo atiende; «Tomar» lo pone a mi nombre y «Abrir» lleva al caso (chat, recorrido y evidencias: Admin-SoporteCaso.js). Cada columna y botón se da en el árbol de
// accesos de la cuenta (Equipo SaaS). Las filas salen del servidor (GET /api/admin/support-cases). Trae las columnas de Control Interno. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'soporte-saas';
const API = '/api/admin/support-cases';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['folio', 'client', 'sector', 'from', 'reason', 'priority', 'status', 'assignee'];
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const locale = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const fmtTime = (iso) => new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const state = { cases: [], counts: { mine: 0, free: 0, all: 0 }, me: null, tab: 'mine', canTake: false, canEvidence: false, canChat: false, canKpi: false, canRules: false, scope: null };

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-soporte-saas' });
        if (!role) return;
        await load();
        document.querySelector('.ss-tabs').addEventListener('click', (event) => {
            const btn = event.target.closest('[data-ss-tab]');
            if (!btn) return;
            state.tab = btn.dataset.ssTab;
            renderTabs();
            renderRows();
            syncKpiTab();
        });
        document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
        document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);
        setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 30000);
    } catch (err) {
        console.error('Soporte (SaaS) failed to initialize:', err);
    }
})();

async function load() {
    const res = await fetch(API, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    const errEl = document.getElementById('ss-error');
    if (!res.ok) { errEl.textContent = body.message || Dashboard.t('admin.saveError'); errEl.hidden = false; return; }
    errEl.hidden = true;
    state.cases = body.cases; state.counts = body.counts; state.me = body.me; state.canEvidence = !!body.canEvidence; state.canChat = !!body.canChat; state.canTake = !!body.canTake; state.canKpi = !!body.canKpi; state.canRules = !!body.canRules;
    // la pestaña «KPI del Nivel 4» solo la ve quien tiene alguna de sus secciones en el árbol de accesos
    document.getElementById('ss-tab-kpi').hidden = !state.canKpi;
    if (!state.canKpi && state.tab === 'kpi') { state.tab = 'mine'; syncKpiTab(); }
    // la pestaña «Reglas de atención» la ve quien tiene alguno de sus grupos en el árbol de accesos
    document.getElementById('ss-tab-rules').hidden = !state.canRules;
    if (!state.canRules && state.tab === 'rules') { state.tab = 'mine'; syncKpiTab(); }
    // sin elegir giros y departamentos (Equipo SaaS) no llegan casos nuevos a «Sin asignar»
    state.scope = body.scope || null;
    document.getElementById('ss-scope-note').hidden = !state.scope || state.scope.configured;
    renderTabs();
    renderRows();
}
function renderTabs() {
    document.querySelectorAll('[data-ss-tab]').forEach((btn) => {
        const on = btn.dataset.ssTab === state.tab;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-selected', String(on));
    });
    ['mine', 'free', 'all'].forEach((k) => { document.getElementById(`ss-count-${k}`).textContent = String(state.counts[k] || 0); });
}
// Las pestañas «KPI del Nivel 4» y «Reglas de atención» no son la tabla: se esconde la tabla (y su buscador) y se muestran los indicadores (Admin-SoporteKpi.js) o las reglas (Admin-SoporteReglas.js).
function syncKpiTab() {
    const kpi = state.tab === 'kpi';
    const rules = state.tab === 'rules';
    document.getElementById('ss-kpi').hidden = !kpi;
    document.getElementById('ss-rules').hidden = !rules;
    document.querySelector('[data-table-id="soporte-saas"]').hidden = kpi || rules;
    const bar = document.getElementById('filter-bar');
    if (bar) bar.hidden = kpi || rules;
    if (kpi && window.SaasSupportKpi) window.SaasSupportKpi.show();
    if (rules && window.SaasSupportRules) window.SaasSupportRules.show();
}
const visible = () => state.cases.filter((c) => (state.tab === 'mine' ? c.atN4 && c.mine : (state.tab === 'free' ? c.atN4 && !c.assigneeId && c.inScope : true)));

function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function tagCell(col, className, dataKey, text) {
    const td = document.createElement('td');
    td.dataset.col = col;
    const tag = document.createElement('span');
    tag.className = className;
    if (dataKey !== null) tag.dataset.k = dataKey;
    tag.textContent = text;
    td.appendChild(tag);
    return td;
}
// «Viene de»: el nivel de la empresa que lo subió (con quién y cuándo), o «sin TI contratado · directo» si entró directo al Nivel 4.
function fromCell(c) {
    const td = document.createElement('td');
    td.dataset.col = 'from';
    if (!c.from) { td.textContent = t('admin.saasSpDirect'); return td; }
    const b = document.createElement('b');
    b.textContent = t(`main.sopLevel_${c.from.level}`);
    const small = document.createElement('div');
    small.className = 'sp-muted';
    small.textContent = `${c.from.by || '—'} · ${fmtTime(c.from.at)}`;
    td.append(b, small);
    return td;
}
// La prioridad y, si el caso sigue en el Nivel 4 con plazos propios de GEIPSA (Reglas de atención) y nadie ha respondido, cuándo vence su primera respuesta.
function priorityCell(c) {
    const td = tagCell('priority', 'sp-tag sp-pri', String(c.priority), t(`main.msPri_${c.priority}`));
    if (c.atN4 && c.n4 && c.n4.firstDueAt && !c.n4.firstResponseAt) {
        const due = document.createElement('div');
        due.className = 'sp-muted';
        if (new Date(c.n4.firstDueAt).getTime() < Date.now()) due.style.color = 'var(--color-danger, #c0392b)';
        due.textContent = t('admin.saasSpDueShort', { when: fmtTime(c.n4.firstDueAt) });
        td.appendChild(due);
    }
    return td;
}
function assigneeCell(c) {
    const td = document.createElement('td');
    td.dataset.col = 'assignee';
    if (c.assigneeName) { td.textContent = c.assigneeName; return td; }
    if (c.atN4 && c.inScope && state.canTake && ['open', 'review', 'working', 'testing'].includes(c.status)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary sc-mini';
        btn.dataset.ssTake = String(c.id);
        btn.setAttribute('data-help-key', 'saasSpTake');
        btn.textContent = t('main.cpTake');
        td.appendChild(btn);
        return td;
    }
    td.textContent = '—';
    return td;
}
function chatCell(c) {
    const td = document.createElement('td');
    td.dataset.col = 'chat';
    const a = document.createElement('a');
    a.className = 'ss-open';
    a.href = `Admin-SoporteCaso.html?id=${c.id}`;
    a.textContent = `${t('admin.saasSpOpen')} · ${t(c.moves === 1 ? 'admin.saasSpMove1' : 'admin.saasSpMoves', { n: c.moves })}`;
    td.appendChild(a);
    return td;
}
// Las 13 columnas de Control Interno de un caso: la empresa del cliente, el área, el módulo, la pantalla y el momento en que se abrió.
function systemCells(c) {
    const d = new Date(c.createdAt);
    const pad = (n) => String(n).padStart(2, '0');
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const start = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((Math.floor((d - start) / 86400000) + start.getDay() + 1) / 7);
    const values = {
        colSysEmpresa: c.client, colSysArea: 'Operaciones TI', colSysModulo: 'Tecnologías de la Información', colSysPantalla: t('menu.saasSupport'), colSysCentroCostos: '',
        colSysFecha: `${pad(d.getDate())}/${months[d.getMonth()]}/${d.getFullYear()}`, colSysDiaNum: pad(d.getDate()), colSysDiaTexto: days[d.getDay()], colSysMesNum: pad(d.getMonth() + 1), colSysMesTexto: months[d.getMonth()],
        colSysAnio: String(d.getFullYear()), colSysSemana: `Sem${week}_${d.getFullYear()}`, colSysHora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    };
    return SYSTEM_COLUMN_KEYS.map((key) => cell(key, values[key], 'col-system'));
}
function buildRow(c) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(c.id);
    tr.append(
        ...systemCells(c),
        cell('folio', c.folio), cell('client', c.client), cell('sector', c.sector),
        tagCell('type', 'sp-tag sp-type', c.type, t(`main.spType_${c.type}`)),
        fromCell(c),
        cell('reason', c.from && c.from.reason ? t(`main.mvReason_${c.from.reason}`) : ''),
        priorityCell(c),
        tagCell('status', 'sp-tag sp-status', c.status, t(`main.spStatus_${c.status}`)),
        assigneeCell(c),
        cell('evidence', state.canEvidence ? String(c.fileCount) : ''),
        chatCell(c),
    );
    return tr;
}
function getTbody() {
    return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
}
function ensureEmptyState(tbody) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = document.querySelectorAll('table.data-table thead th').length;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}
function renderRows() {
    if (state.tab === 'kpi') return; // la pestaña de KPI no es la tabla
    const tbody = getTbody();
    tbody.innerHTML = '';
    const list = visible();
    if (!list.length) { ensureEmptyState(tbody); return; }
    const fragment = document.createDocumentFragment();
    list.forEach((c) => fragment.appendChild(buildRow(c)));
    tbody.appendChild(fragment);
    applyFilters();
}
function applyFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = SEARCH_COLUMNS.map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '').join(' ');
        tr.hidden = !SearchSyntax.matches('contains', text, haystack);
    });
}
// «Tomar»: el caso queda a mi nombre y sale de «Abierto».
document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-ss-take]');
    if (!btn) return;
    btn.disabled = true;
    try {
        const res = await fetch(`${API}/${btn.dataset.ssTake}/take`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) {
            // calificar cómo llegó el caso es lo primero: se abre el caso para hacerlo ahí
            if (out.code === 'RATE_FIRST') { location.href = `Admin-SoporteCaso.html?id=${btn.dataset.ssTake}`; return; }
            Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning');
            await load();
            return;
        }
        Dashboard.showToast(t('admin.saasSpTaken'), 'success');
        await load();
    } catch (err) {
        console.error('Soporte (SaaS): failed to take', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
});
})();
