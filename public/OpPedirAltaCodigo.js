// ---------------------------------------------------------------------------
// Operaciones › Pedir alta de código (existe en cada área): quien necesita un código nuevo lo pide y llena TODA la información que conoce (lo que no sabe se marca «lo llena TI», con fotos). TI la ve desde el primer registro; aquí se ven
// las solicitudes propias con su estatus, de quién es el turno (quien pidió o TI), el avance (24 datos) y el reloj (total y en la etapa). «Completar datos» abre el formulario mientras la solicitud está en manos de quien pidió; al terminar
// se manda a TI. Las rutas están en server.js (/api/business/sku-requests); el formulario y la ventana de detalle son de SolicitudesCodigo.js.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'pedir-alta-codigo';
const HISTORY_KEY = 'solicitudes-codigo';
const SC = window.SolicitudesCodigo;
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
let requests = [];
let timer = null;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        mountNewButton();
        await refreshTable();
        timer = setInterval(() => { if (!document.querySelector('.sol-overlay')) refreshTable(true); }, 60000); // el reloj sigue corriendo: se vuelve a leer cada minuto
    } catch (err) {
        console.error('Pedir alta de código failed to initialize:', err);
    }
})();

function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function iconButton(icon, title, helpKey, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-icon-btn';
    if (helpKey) btn.setAttribute('data-help-key', helpKey);
    btn.setAttribute('aria-label', title);
    btn.title = title;
    btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
    btn.addEventListener('click', onClick);
    return btn;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    const status = document.createElement('td');
    status.dataset.col = 'colSolEstatus';
    status.innerHTML = SC.statusChip(r.status);
    const actions = document.createElement('td');
    actions.dataset.col = 'actions';
    actions.className = 'admin-table-actions';
    if (r.canEdit) actions.appendChild(iconButton('bx-edit', Dashboard.t('main.solComplete'), null, () => openEdit(r)));
    actions.appendChild(iconButton('bx-show', Dashboard.t('main.solView'), null, () => openDetail(r)));
    actions.appendChild(iconButton('bx-history', Dashboard.t('main.solHistory'), 'changeHistory', () => Dashboard.openChangeHistory(HISTORY_KEY, r.id)));
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, r[key], 'col-system')),
        cell('colSolFolio', r.label), cell('colSolDescripcion', r.uniqueDescription), cell('colSolUpc', r.data.upc),
        cell('colSolLugar', `${r.areaLabel}${r.siteCode ? ` · ${r.siteCode}` : ''}`), status, cell('colSolEnManos', SC.holderText(r.holder)),
        cell('colSolAvance', SC.progressText(r.progress)), cell('colSolTotal', SC.duration(r.times.totalMs)), cell('colSolEtapa', r.times.open ? SC.duration(r.times.stageMs) : ''),
        cell('colSolNota', r.tiNote), actions,
    );
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
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function redraw() {
    const tbody = getTbody();
    tbody.innerHTML = '';
    const text = searchText();
    const list = text ? requests.filter((r) => SearchSyntax.matches('contains', text, [r.label, r.uniqueDescription, r.data.upc, r.areaLabel, r.siteCode, r.tiNote, SC.t(`main.solStatus_${r.status}`)].filter(Boolean).join(' ').toLowerCase())) : requests;
    list.forEach((r) => tbody.appendChild(buildRow(r)));
    if (!list.length) ensureEmptyState();
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
}
async function refreshTable(quiet) {
    try {
        const body = await SC.api(SC.API);
        requests = body.requests || [];
        redraw();
    } catch (err) {
        console.error('Pedir alta de código: failed to load records', err);
        if (!quiet) Dashboard.showToast(SC.t('main.solLoadError'), 'error');
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', redraw);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', redraw);

// «+ Pedir alta de código»: el área es la que está elegida arriba (Departamento › Área); el sitio y el centro son opcionales.
function mountNewButton() {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar || toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${SC.esc(Dashboard.t('main.solNew'))}</span>`;
    btn.addEventListener('click', openNew);
    toolbar.prepend(btn);
}
async function openNew() {
    const department = localStorage.getItem('department') || '';
    const area = localStorage.getItem('area') || '';
    if (!department || !area) { Dashboard.showToast(SC.t('main.solChooseArea'), 'warning'); return; }
    try {
        const ctx = await SC.api(`${SC.API}/options?department=${encodeURIComponent(department)}&area=${encodeURIComponent(area)}`);
        if (!ctx.validArea) { Dashboard.showToast(SC.t('main.solChooseArea'), 'warning'); return; }
        if (!ctx.canRequest) { Dashboard.showToast(SC.t('main.solNoPermission'), 'warning'); return; }
        await SC.openForm({ ctx, onDone: () => refreshTable() });
    } catch (err) {
        Dashboard.showToast(err.message || SC.t('main.solSaveError'), 'error');
    }
}
async function openEdit(r) {
    await SC.openForm({ request: r, onDone: () => refreshTable() });
}
function openDetail(r) {
    SC.openDetail(r, r.canEdit ? { actions: [{ label: Dashboard.t('main.solComplete'), className: 'btn', onClick: (req, close) => { close(); openEdit(req); } }] } : {});
}
})();
