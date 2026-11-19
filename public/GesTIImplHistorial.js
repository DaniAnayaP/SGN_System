// ---------------------------------------------------------------------------
// Implementación Inicial › Gestión › Historial de la implementación (solo consulta): todo lo que ha pasado en la implementación de la compañía, del más nuevo al más viejo (la fecha y la hora, en las columnas de Control Interno, en tu
// zona). De cada evento se ve el nivel, el renglón del sistema (si fue de uno), qué pasó, el detalle que dejó y quién lo hizo. Sale de implementation_events: lo escribe el Cronograma y nadie lo cambia. Ruta en server.js
// (/api/business/implementation/history).
// ---------------------------------------------------------------------------
(function () {
const TABLE_KEY = 'implementacion-historial';
const API = '/api/business/implementation/history';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const tOr = (key, fallback) => { const text = Dashboard.t(key); return !text || text === key ? fallback : text; };
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
let state = { events: [] };
let timer = null;

async function api(path) {
    const res = await fetch(path, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(body.message || 'request failed'); err.status = res.status; err.body = body; throw err; }
    return body;
}
// «2026-11-02» → fecha corta en el idioma de quien mira (sin pasar por la zona horaria: es una fecha, no una hora).
const dateText = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) return iso; return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale(), { dateStyle: 'medium' }); };
const levelText = (e) => (e.levelKey ? tOr(`main.implLevelName_${e.levelKey}`, e.levelKey) : t('main.implHistGeneral'));
const taskText = (e) => (!e.taskKey ? '' : (e.taskLabelKey ? tOr(e.taskLabelKey, e.taskKey) : tOr(`main.implTask_${e.levelKey}_${e.taskKey}`, e.taskKey)));
const eventText = (e) => tOr(`main.implEv_${e.event}`, e.event);
const sideText = (side) => tOr(`main.implHistSide_${side}`, side);
// El detalle como lo dejó el evento; algunos eventos guardan datos (fechas, el lado que confirmó) que aquí se dicen en palabras.
function detailText(e) {
    const d = String(e.detail || '');
    if (e.event === 'dates') return d.split(' → ').map(dateText).join(' → ');
    if (e.event === 'finish_confirmed') return sideText(d);
    if (e.event === 'finish_rejected') { const i = d.indexOf(': '); return i > 0 ? `${sideText(d.slice(0, i))}: ${d.slice(i + 2)}` : d; }
    return d;
}

// ---- la tabla -----------------------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function buildRow(e) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(e.id);
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, e[key], 'col-system')),
        cell('colImplHNivel', levelText(e)), cell('colImplHRenglon', taskText(e)), cell('colImplHEvento', eventText(e)), cell('colImplHDetalle', detailText(e)), cell('colImplHQuien', e.byLabel),
    );
    return tr;
}
function getTbody() { return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0]; }
function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
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
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function redraw() {
    const tbody = getTbody();
    tbody.innerHTML = '';
    const text = searchText();
    const haystack = (e) => [levelText(e), taskText(e), eventText(e), detailText(e), e.byLabel, e.colSysFecha].filter(Boolean).join(' ').toLowerCase();
    const list = text ? state.events.filter((e) => SearchSyntax.matches('contains', text, haystack(e))) : state.events;
    list.forEach((e) => tbody.appendChild(buildRow(e)));
    if (!list.length) ensureEmptyState();
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
}
async function refreshTable(quiet) {
    try {
        state = await api(API);
        redraw();
    } catch (err) {
        console.error('Historial de la implementación: failed to load records', err);
        if (!quiet) Dashboard.showToast(t('main.implHistLoadError'), 'error');
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', redraw);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', redraw);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
        timer = setInterval(() => { if (!document.hidden) refreshTable(true); }, 60000); // el Cronograma lo alimenta todo el día: se vuelve a leer cada minuto
    } catch (err) {
        console.error('Historial de la implementación failed to initialize:', err);
    }
})();
})();
