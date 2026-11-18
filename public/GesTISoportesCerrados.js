// ---------------------------------------------------------------------------
// TI > Operaciones TI > Gestión > Soportes cerrados: los casos de soporte ya terminados (Terminado o Cerrado sin respuesta). Los casos en curso se atienden en Operaciones › Casos de soporte; al cerrarse
// pasan aquí con la causa, qué se hizo, quién lo cerró, cuánto tardó, cuántas veces se reabrió y la calificación del usuario. Solo se ve (cada caso se abre en su propia pantalla, con su chat y su
// recorrido). Trae las columnas de Control Interno. Las filas salen del servidor (GET /api/business/support-closed).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'soportes-cerrados';
const API = '/api/business/support-closed';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['colScFolio', 'colScReporto', 'colScPantalla', 'colScResumen', 'colScCategoria', 'colScTipo', 'colScGeneral', 'colScPrioridad', 'colScEstatus', 'colScCausa', 'colScQueSeHizo', 'colScCerro'];
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const locale = () => (lang() === 'en' ? 'en-US' : 'es-MX');
// Cuánto tardó, en palabras cortas: «45 min», «3 h 20 min», «1 d 5 h».
function duration(min) {
    const n = Math.max(0, Number(min) || 0);
    if (n < 1) return '< 1 min';
    if (n < 60) return `${n} min`;
    if (n < 1440) return `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}`;
    return `${Math.floor(n / 1440)} d${Math.floor((n % 1440) / 60) ? ` ${Math.floor((n % 1440) / 60)} h` : ''}`;
}

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Soportes cerrados failed to initialize:', err);
    }
})();

// ---- tabla --------------------------------------------------------------------------------------------------------------------------
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
function timeCell(col, iso) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (!iso) { td.textContent = '—'; return td; }
    td.textContent = new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    td.title = `UTC ${iso.replace('T', ' ').replace('Z', '')}`;
    return td;
}
const openViewer = (caseId) => { location.href = `OpTISoporteCaso.html?id=${caseId}`; };
function filesCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colScEvidencias';
    if (!r.fileCount) { td.textContent = '0'; td.className = 'sp-muted'; return td; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-files-btn';
    btn.innerHTML = `<i class="bx bx-paperclip" aria-hidden="true"></i> ${r.fileCount}`;
    btn.setAttribute('aria-label', t('main.spViewFiles'));
    btn.addEventListener('click', () => openViewer(r.id));
    td.appendChild(btn);
    return td;
}
function actionsCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'admin-icon-btn';
    view.setAttribute('data-help-key', 'spVer');
    view.setAttribute('aria-label', t('main.spViewCase'));
    view.title = t('main.spViewCase');
    view.innerHTML = '<i class="bx bx-show" aria-hidden="true"></i>';
    view.addEventListener('click', () => openViewer(r.id));
    td.appendChild(view);
    return td;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    const system = r.system || {};
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, system[key], 'col-system')),
        cell('colCatRegistroUnico', r.folio, 'col-system'),
        cell('colScFolio', r.folio), timeCell('colScFechaHora', r.createdAt), timeCell('colScCerrado', r.closedAt), cell('colScReporto', r.reporter), cell('colScPantalla', r.screen), cell('colScResumen', r.summary), cell('colScCategoria', r.category),
        tagCell('colScTipo', 'sp-tag sp-type', r.type, t(`main.spType_${r.type}`)),
        r.general ? tagCell('colScGeneral', 'sp-tag sp-general', null, r.general.folio) : cell('colScGeneral', '—'),
        tagCell('colScPrioridad', 'sp-tag sp-pri', String(r.priority), t(`main.msPri_${r.priority}`)),
        tagCell('colScEstatus', 'sp-tag sp-status', r.status, t(`main.spStatus_${r.status}`)),
        cell('colScCausa', r.causeName), cell('colScQueSeHizo', r.closeDid), cell('colScCerro', r.closedBy), cell('colScTiempo', duration(r.totalMinutes)), cell('colScReabierto', r.reopenedCount || 0),
        cell('colScCalificacion', r.userStars ? '★'.repeat(r.userStars) + '☆'.repeat(5 - r.userStars) : '—'),
        filesCell(r),
    );
    tr.appendChild(actionsCell(r));
    return tr;
}
function getTbody() {
    return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
}
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
const ROW_CHUNK = 100;
let renderToken = 0;
const nextTurn = () => (window.scheduler && window.scheduler.yield ? window.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
async function refreshTable() {
    const tbody = getTbody();
    const token = ++renderToken;
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== renderToken) return;
        tbody.innerHTML = '';
        if (!body.cases.length) { ensureEmptyState(); return; }
        for (let from = 0; from < body.cases.length; from += ROW_CHUNK) {
            if (token !== renderToken) return;
            const fragment = document.createDocumentFragment();
            body.cases.slice(from, from + ROW_CHUNK).forEach((r) => fragment.appendChild(buildRow(r)));
            tbody.appendChild(fragment);
            if (from + ROW_CHUNK < body.cases.length) await nextTurn();
        }
        if (token !== renderToken) return;
        applyFilters();
    } catch (err) {
        console.error('Soportes cerrados: failed to load cases', err);
    }
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
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);
})();
