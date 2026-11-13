// ---------------------------------------------------------------------------
// Mantenimiento Correctivo — Operaciones > Mtto. de activos > Correctivo (C. Distribución).
// Un renglón por FALLA (folio MC-0001…): se REPORTA (activo, qué falló, prioridad, si dejó de operar y hasta 3 fotos), se ATIENDE (pasa a En reparación con quién la atiende: una persona o un proveedor) y se CIERRA (causa, qué se hizo, quién la reparó,
// fecha de cierre y costo opcional). Si el activo dejó de operar cuenta los días fuera de servicio hasta que se cierra. Las fallas no se eliminan. Cada acción pide su hoja del árbol (Reportar falla, Atender, Cerrar falla).
// Una falla de prioridad Alta avisa al jefe directo en la campana, igual que una que sigue abierta 7 días. Persistido en /api/business/maintenance/faults.
// ---------------------------------------------------------------------------
const TABLE_KEY = 'mtto-correctivo';
const ACTIVE_PAGE = 'cat-operaciones-centro-dist-mtto-correctivo';
const COLUMN_COUNT = 25;
const API = '/api/business/maintenance/faults';
const MT = window.AssetMaintenance;

let faults = [];
let assets = [];
let people = [];
let providers = [];
let priorities = ['high', 'medium', 'low'];
let canCreate = false;
let canAttend = false;
let canClose = false;
let maxPhotos = 3;
let drawToken = 0;
let loadToken = 0;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: ACTIVE_PAGE });
        if (!role) return;
        await refreshTable();
        renderNewRecordButton();
        if (Dashboard.ensureColumnMinWidth) [['colMcActivo', 160], ['colMcFalla', 240], ['colMcPrioridad', 130], ['colMcEstatus', 150], ['colMcAtiende', 160]].forEach(([col, px]) => Dashboard.ensureColumnMinWidth(TABLE_KEY, col, px));
    } catch (err) {
        console.error('Mantenimiento Correctivo failed to initialize:', err);
    }
})();

// t(clave, { parámetros }) es la de Dashboard.js (global); aquí no se vuelve a declarar
const isPending = (record, key) => (record.pendingFields || []).includes(key);
const getTbody = () => document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
const dayDisplay = (iso) => MT.dateText(iso) || iso;
const money = (n) => (Number(n) > 0 ? `$ ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '');
const priorityLabel = (p) => t(`main.mtPriority_${p}`);

// --- Celdas ----------------------------------------------------------------------------------------------------------------------------------------------------
function textCell(key, value, helpKey) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value === 0 || value ? String(value) : '—';
    if (helpKey) td.setAttribute('data-help-key', helpKey);
    return td;
}
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const buildSystemCells = (record) => SYSTEM_COLUMN_KEYS.map((key) => { const td = textCell(key, record[key]); td.classList.add('col-system'); return td; });
function assetCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colMcActivo';
    td.setAttribute('data-help-key', 'mtAsset');
    const code = document.createElement('b');
    code.textContent = record.assetCode || '—';
    td.title = [record.assetName, record.typeName].filter(Boolean).join(' · ');
    td.appendChild(code);
    if (record.assetName) { const sub = document.createElement('small'); sub.className = 'cal-serial'; sub.textContent = record.assetName; td.append(document.createElement('br'), sub); }
    return td;
}
function descriptionCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colMcFalla';
    td.setAttribute('data-help-key', 'mtFault');
    if (record.status === 'closed') {
        // cerrada: ya no se cambia; su causa y lo que se hizo salen al pasar el cursor
        td.textContent = record.description;
        td.classList.add('editable-cell-disabled');
        td.title = [record.cause && `${t('main.colMcCausa')}: ${record.cause}`, record.actionDone && `${t('main.colMcQueSeHizo')}: ${record.actionDone}`, record.repairedBy && `${t('main.colMcReparo')}: ${record.repairedBy}`, record.closedOn && `${t('main.colMcCierre')}: ${dayDisplay(record.closedOn)}`].filter(Boolean).join('\n');
        return td;
    }
    Dashboard.attachInlineEdit(td, {
        value: record.description, inputType: 'text', tableKey: TABLE_KEY, colKey: 'colMcFalla', pending: isPending(record, 'description'),
        onCommit: (val) => patchFault(record, { description: val.trim() }),
    });
    return td;
}
function priorityCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colMcPrioridad';
    td.setAttribute('data-help-key', 'mtPriority');
    if (record.status === 'closed') { td.appendChild(MT.chip(record.priority, priorityLabel(record.priority))); return td; }
    const select = document.createElement('select');
    select.className = 'editable-cell-select asset-select';
    priorities.forEach((p) => { const opt = document.createElement('option'); opt.value = p; opt.textContent = priorityLabel(p); select.appendChild(opt); });
    select.value = record.priority;
    select.disabled = isPending(record, 'priority') || !Dashboard.canEditField(TABLE_KEY, 'colMcPrioridad', priorityLabel(record.priority));
    if (select.disabled) select.title = t(isPending(record, 'priority') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => patchFault(record, { priority: select.value }));
    td.appendChild(select);
    return td;
}
function statusCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colMcEstatus';
    td.setAttribute('data-help-key', 'mtFaultStatus');
    td.appendChild(MT.chip(record.status, t(`main.mtStatus_${record.status}`)));
    return td;
}
function buildActionsCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const btnText = (cls, help, label, onClick) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = cls; b.setAttribute('data-help-key', help); b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    };
    if (canAttend && record.status === 'open') td.appendChild(btnText('btn mt-register', 'mtAttend', t('main.mtAttend'), () => openAttendDialog(record)));
    if (canClose && record.status !== 'closed') td.appendChild(btnText('btn mt-register', 'mtClose', t('main.mtCloseFault'), () => openCloseDialog(record)));
    if ((record.photos || []).length) {
        const ph = document.createElement('button');
        ph.type = 'button'; ph.className = 'admin-icon-btn'; ph.setAttribute('data-help-key', 'mtFaultPhotos');
        ph.setAttribute('aria-label', t('main.mtPhotosOpen', { n: record.photos.length })); ph.title = t('main.mtPhotosOpen', { n: record.photos.length });
        ph.innerHTML = `<i class="bx bx-image" aria-hidden="true"></i>`;
        ph.addEventListener('click', () => MT.openPhotoViewer(record.photos.map((n) => MT.photoUrl('fault', record.id, n))));
        td.appendChild(ph);
    }
    const hist = document.createElement('button');
    hist.type = 'button'; hist.className = 'admin-icon-btn'; hist.setAttribute('data-help-key', 'changeHistory');
    hist.setAttribute('aria-label', t('main.changeHistoryTitleRecord')); hist.title = t('main.changeHistoryTitleRecord');
    hist.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    hist.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, record.id));
    td.appendChild(hist);
    return td;
}
function buildRow(record) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
    if (record.status === 'closed') tr.classList.add('cal-row-history');
    const registro = textCell('colMcRegistroUnico', record.registroUnico);
    registro.classList.add('col-system');
    const folio = textCell('colMcFolio', record.folio, 'mtFolio');
    folio.style.fontWeight = '600';
    const down = textCell('colMcFuera', record.downDays === null ? '' : t(record.downDays === 1 ? 'main.mtDays1' : 'main.mtDays', { n: record.downDays }), 'mtDown');
    tr.append(
        ...buildSystemCells(record), registro,
        folio,
        textCell('colMcFecha', dayDisplay(record.reportedOn), 'mtReportedOn'),
        assetCell(record),
        descriptionCell(record),
        priorityCell(record),
        statusCell(record),
        textCell('colMcReporto', record.reportedBy, 'mtReportedBy'),
        textCell('colMcAtiende', record.assignedTo, 'mtAssigned'),
        down,
        textCell('colMcCosto', money(record.cost), 'mtCost'),
        buildActionsCell(record),
    );
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    return tr;
}
function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = COLUMN_COUNT;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

// --- Guardar --------------------------------------------------------------------------------------------------------------------------------------------------
async function patchFault(record, patch) {
    try {
        const body = await MT.sendJson('PATCH', `${API}/${record.id}`, patch);
        if (body.rejectedFields?.length) Dashboard.showToast(`${t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'warning');
        else if (body.pendingFields?.length) Dashboard.showToast(`${t('main.changePending')}: ${body.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'info');
        await refreshTable();
        return !body.rejectedFields?.length && !body.pendingFields?.length;
    } catch (err) {
        Dashboard.showToast(err.message || t('admin.saveError'), err.status === 403 ? 'warning' : 'error');
        await refreshTable();
        return false;
    }
}

// --- Qué se ve -------------------------------------------------------------------------------------------------------------------------------------------------
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function visibleRows() {
    const selected = Dashboard.getSelectedCostCenterIds();
    const text = searchText();
    return faults.filter((f) => {
        if (selected && !selected.includes(f.costCenterId)) return false;
        if (!text) return true;
        const haystack = [f.folio, f.assetCode, f.assetSerial, f.assetName, f.description, f.reportedBy, f.assignedTo, f.cause, f.repairedBy].map((v) => String(v || '')).join(' ').toLowerCase();
        return SearchSyntax.matches('contains', text, haystack);
    });
}
async function drawRows() {
    const token = ++drawToken;
    const tbody = getTbody();
    tbody.innerHTML = '';
    const records = visibleRows();
    if (!records.length) { ensureEmptyState(); return; }
    const finished = await Dashboard.renderTableRowsInChunks({ tableKey: TABLE_KEY, tbody, records, buildRow, isStale: () => token !== drawToken });
    if (finished && token === drawToken && Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
}
async function refreshTable() {
    const tbody = getTbody();
    if (tbody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const token = ++loadToken;
    try {
        const res = await fetch(`${API}?today=${MT.today()}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (token !== loadToken) return;
        faults = data.faults || [];
        assets = data.assets || [];
        people = data.people || [];
        providers = data.providers || [];
        priorities = data.priorities || priorities;
        canCreate = !!data.canCreate;
        canAttend = !!data.canAttend;
        canClose = !!data.canClose;
        maxPhotos = data.maxPhotos || 3;
        await drawRows();
    } catch (err) {
        console.error('Mantenimiento Correctivo: failed to load records', err);
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', drawRows);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', drawRows);
document.addEventListener('sgn:cost-centers-changed', drawRows);

// --- «+ Reportar falla» ------------------------------------------------------------------------------------------------------------------------------------------
function renderNewRecordButton() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (!canCreate || toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.setAttribute('data-help-key', 'mtReport');
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.mtReport">${t('main.mtReport')}</span>`;
    btn.addEventListener('click', openReportDialog);
    toolbar.prepend(btn);
}
async function openReportDialog() {
    await refreshTable();
    const selected = Dashboard.getSelectedCostCenterIds();
    const pick = assets.filter((a) => !selected || selected.includes(a.costCenterId));
    MT.dialog({
        title: t('main.mtReport'), subtitle: t('main.mtReportHint'), saveLabel: t('main.mtReportSave'),
        fields: [
            { name: 'assetId', label: t('main.colMcActivo'), type: 'select', full: true, options: [{ value: '', label: t(pick.length ? 'main.mtPickAsset' : 'main.mtNoAssets') }, ...pick.map((a) => ({ value: a.id, label: [a.code, a.name || a.typeName, a.serialNumber ? `S/N ${a.serialNumber}` : ''].filter(Boolean).join(' · ') }))] },
            { name: 'description', label: t('main.colMcFalla'), type: 'text', full: true, maxLength: 300 },
            { name: 'priority', label: t('main.colMcPrioridad'), type: 'select', options: priorities.map((p) => ({ value: p, label: priorityLabel(p) })), value: 'medium', hint: t('main.mtPriorityHint') },
            { name: 'outOfService', label: t('main.mtOutOfServiceQ'), type: 'select', options: [{ value: '0', label: t('main.assetNo') }, { value: '1', label: t('main.assetYes') }], value: '0', hint: t('main.mtOutOfServiceHint') },
            { name: 'photos', label: t('main.mtPhotosOpt'), type: 'photos', full: true, max: maxPhotos },
        ],
        onSubmit: async (v, api) => {
            if (!v.assetId) throw new Error(t('main.mtPickAsset'));
            if (!v.description) throw new Error(t('main.mtNeedFault'));
            const body = await MT.sendJson('POST', API, { assetId: Number(v.assetId), description: v.description, priority: v.priority, outOfService: v.outOfService === '1', reportedOn: MT.today() });
            const files = api.photos();
            let failed = 0;
            if (files.length) failed = await MT.uploadPhotos('fault', body.fault.id, files);
            Dashboard.showToast(failed ? t('main.mtFaultSavedPhotosFailed', { folio: body.fault.folio, n: failed }) : t('main.mtFaultSaved', { folio: body.fault.folio }), failed ? 'warning' : 'success');
            await refreshTable();
            return true;
        },
    });
}

// --- «Atender» y «Cerrar falla» -----------------------------------------------------------------------------------------------------------------------------------
function openAttendDialog(fault) {
    MT.dialog({
        title: t('main.mtAttendTitle'), subtitle: `${fault.folio} · ${fault.assetCode} · ${fault.description}`, saveLabel: t('main.mtAttendSave'),
        fields: [
            { name: 'assignedTo', label: t('main.colMcAtiende'), type: 'text', full: true, maxLength: 120, list: [...people.map((p) => p.name), ...providers], hint: t('main.mtAttendHint') },
        ],
        onSubmit: async (v) => {
            if (!v.assignedTo) throw new Error(t('main.mtNeedAssigned'));
            await MT.sendJson('POST', `${API}/${fault.id}/attend`, { assignedTo: v.assignedTo });
            Dashboard.showToast(t('main.mtAttended', { folio: fault.folio }), 'success');
            await refreshTable();
            return true;
        },
    });
}
function openCloseDialog(fault) {
    MT.dialog({
        title: t('main.mtCloseTitle'), subtitle: `${fault.folio} · ${fault.assetCode} · ${fault.description}`, saveLabel: t('main.mtCloseSave'),
        fields: [
            { name: 'cause', label: t('main.colMcCausa'), type: 'text', full: true, maxLength: 300 },
            { name: 'actionDone', label: t('main.colMcQueSeHizo'), type: 'text', full: true, maxLength: 300 },
            { name: 'repairedBy', label: t('main.colMcReparo'), type: 'text', value: fault.assignedTo || '', maxLength: 120, list: [...people.map((p) => p.name), ...providers] },
            { name: 'closedOn', label: t('main.colMcCierre'), type: 'date', value: MT.today() },
            { name: 'cost', label: t('main.mtCostOpt'), type: 'number', step: '0.01', min: 0 },
            { name: 'down', label: t('main.colMcFuera'), type: 'static', value: fault.downDays === null ? t('main.mtDownNone') : t(fault.downDays === 1 ? 'main.mtDays1' : 'main.mtDays', { n: fault.downDays }), hint: t('main.mtDownCalc') },
        ],
        onSubmit: async (v) => {
            if (!v.cause) throw new Error(t('main.mtNeedCause'));
            if (!v.actionDone) throw new Error(t('main.mtNeedAction'));
            if (!v.repairedBy) throw new Error(t('main.mtNeedRepairedBy'));
            if (!v.closedOn) throw new Error(t('main.mtNeedClosedOn'));
            await MT.sendJson('POST', `${API}/${fault.id}/close`, { cause: v.cause, actionDone: v.actionDone, repairedBy: v.repairedBy, closedOn: v.closedOn, cost: v.cost === '' ? 0 : Number(v.cost) });
            Dashboard.showToast(t('main.mtClosed', { folio: fault.folio }), 'success');
            await refreshTable();
            return true;
        },
    });
}
