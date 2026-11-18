// ---------------------------------------------------------------------------
// TI › Operaciones TI › Solicitudes de alta de código: la bandeja de TI con las solicitudes de código de TODAS las áreas. Cada una aparece desde el primer registro con su estatus, de quién es el turno (quien pidió o TI) y su reloj. Arriba, los contadores
// (por estatus, la más antigua abierta y el tiempo promedio de TI). Al abrir una solicitud, TI la toma en revisión, pide datos a quien la pidió, la rechaza con un motivo o crea el código (su SKU lleva las letras del área que lo pidió y queda
// habilitado donde se pidió). Los relojes solo se miden (sin metas por ahora). Rutas en server.js (/api/business/sku-requests); el formulario y el detalle son de SolicitudesCodigo.js.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'solicitudes-codigo';
const SC = window.SolicitudesCodigo;
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
let requests = [];
let counters = null;
let canManage = false;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
        setInterval(() => { if (!document.querySelector('.sol-overlay')) refreshTable(true); }, 60000); // el reloj sigue corriendo: se vuelve a leer cada minuto
    } catch (err) {
        console.error('Solicitudes de alta de código failed to initialize:', err);
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
    const holder = cell('colSolEnManos', SC.holderText(r.holder));
    holder.setAttribute('data-help-key', 'solEnManos');
    const actions = document.createElement('td');
    actions.dataset.col = 'actions';
    actions.className = 'admin-table-actions';
    actions.appendChild(iconButton('bx-show', Dashboard.t('main.solView'), null, () => openDetail(r)));
    actions.appendChild(iconButton('bx-history', Dashboard.t('main.solHistory'), 'changeHistory', () => Dashboard.openChangeHistory(TABLE_KEY, r.id)));
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, r[key], 'col-system')),
        cell('colSolSolicitante', r.requestedBy), cell('colSolArea', r.areaLabel),
        cell('colSolFolio', r.label), cell('colSolDescripcion', r.uniqueDescription), cell('colSolUpc', r.data.upc),
        cell('colSolLugar', [r.siteCode, r.costCenterName].filter(Boolean).join(' · ')), status, holder,
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
    const list = text ? requests.filter((r) => SearchSyntax.matches('contains', text, [r.label, r.uniqueDescription, r.data.upc, r.areaLabel, r.requestedBy, r.siteCode, r.tiNote, SC.t(`main.solStatus_${r.status}`)].filter(Boolean).join(' ').toLowerCase())) : requests;
    list.forEach((r) => tbody.appendChild(buildRow(r)));
    if (!list.length) ensureEmptyState();
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
}
// Los contadores de la bandeja junto a las herramientas de la tabla.
function updateCounters() {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar || !counters) return;
    let bar = toolbar.querySelector('.sol-counters');
    if (!bar) {
        bar = document.createElement('span');
        bar.className = 'sol-counters';
        bar.setAttribute('data-help-key', 'solBandeja');
        toolbar.prepend(bar);
    }
    const chip = (key, n, status) => `<span class="sol-count sol-chip sol-chip-${status}"><b>${n}</b> ${SC.esc(SC.t(key))}</span>`;
    bar.innerHTML = chip('main.solCountInfo', counters.infoPending, 'info_pending') + chip('main.solCountReview', counters.toReview, 'to_review') + chip('main.solCountAsked', counters.needsInfo, 'needs_info') + chip('main.solCountInReview', counters.inReview, 'in_review')
        + `<span class="sol-count sol-count-time"><b>${SC.esc(SC.duration(counters.oldestOpenMs))}</b> ${SC.esc(SC.t('main.solCountOldest'))}</span><span class="sol-count sol-count-time"><b>${SC.esc(SC.duration(counters.avgTiMs))}</b> ${SC.esc(SC.t('main.solCountAvg'))}</span>`;
}
async function refreshTable(quiet) {
    try {
        const body = await SC.api(`${SC.API}?view=ti`);
        requests = body.requests || [];
        counters = body.counters;
        canManage = !!body.canManage;
        updateCounters();
        redraw();
    } catch (err) {
        console.error('Solicitudes de alta de código: failed to load records', err);
        if (!quiet) Dashboard.showToast(SC.t('main.solLoadError'), 'error');
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', redraw);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', redraw);

// Las acciones de TI según el estatus: por revisar → tomar en revisión / pedir datos / rechazar / crear código; en revisión → editar datos / pedir datos / rechazar / crear código; en manos de quien pidió → solo rechazar.
async function act(request, path, body, doneKey) {
    try {
        const result = await SC.post(`${SC.API}/${request.id}/${path}`, body);
        Dashboard.showToast(path === 'create-code' ? SC.t('main.solCodeCreated', { sku: result.sku }) : SC.t(doneKey || 'main.solActionDone'), 'success');
        await refreshTable();
    } catch (err) {
        Dashboard.showToast(err.body && err.body.code === 'DESCRIPTION_TAKEN' ? SC.t('main.solDescTaken', { owner: err.body.owner || '' }) : (err.message || SC.t('main.solActionError')), 'error');
    }
}
function actionsFor(request) {
    if (!canManage) return [];
    const list = [];
    const open = ['info_pending', 'to_review', 'needs_info', 'in_review'].includes(request.status);
    if (request.status === 'to_review') list.push({ label: SC.t('main.solReview'), className: 'btn', onClick: (r, close) => { close(); act(r, 'review'); } });
    if (request.status === 'in_review') list.push({ label: SC.t('main.solInReviewEdit'), className: 'btn btn-secondary', onClick: async (r, close) => { close(); await SC.openForm({ request: r, asTi: true, onDone: () => refreshTable() }); } });
    if (request.status === 'to_review' || request.status === 'in_review') {
        list.push({ label: SC.t('main.solCreateCode'), className: 'btn', onClick: (r, close) => { close(); act(r, 'create-code'); } });
        list.push({ label: SC.t('main.solRequestInfo'), className: 'btn btn-secondary', onClick: (r, close) => { close(); SC.askText({ title: SC.t('main.solAskNote'), onConfirm: async (note) => { await act(r, 'request-info', { note }); } }); } });
    }
    if (open) list.push({ label: SC.t('main.solReject'), className: 'btn btn-secondary', onClick: (r, close) => { close(); SC.askText({ title: SC.t('main.solAskReason'), onConfirm: async (reason) => { await act(r, 'reject', { reason }); } }); } });
    return list;
}
function openDetail(r) {
    SC.openDetail(r, { actions: actionsFor(r) });
}
})();
