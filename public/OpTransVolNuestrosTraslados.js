// ---------------------------------------------------------------------------
// Nuestros Traslados (Operaciones > Cadena de Suministro > Transporte
// Volumen) — manual capture log of what a service request looked like, both
// physically and in the office: 23 own fields across 4 classifications
// (Solicitud/Requisitos/Origen/Destino), all captured up front. Same
// "+ Nuevo" modal pattern as Alta Nuestros Artículos (confirmed appropriate
// here too, given the field count) — nothing reaches the server until
// "Guardar" is pressed, so closing the form never leaves an orphan traslado
// behind. Once created, fields are edited the normal click-the-cell way.
// Tipo Unidad Solicitada reuses Nuestras Unidades' own catalog; Cotización
// reuses Nuestras Cotizaciones' active rates (by Folio) — both plain TEXT
// columns, not foreign keys, so a traslado keeps what it picked even if the
// catalog entry is later renamed/deactivated (same "conserva su valor"
// convention as every other screen's own catalog selects).
//
// NOTE: this is a completely separate build from the pre-existing
// OpTransVolTraslados.html under cat-admin — that page is untouched
// reference material for a future "Administración" screen, never linked
// from here.
// ---------------------------------------------------------------------------

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-transporte-vol-nuestros-traslados' });
        if (!role) return;
        await Promise.all([loadUnitTypeOptions(), loadQuoteOptions()]);
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Nuestros Traslados failed to initialize:', err);
    }
})();

const TABLE_KEY = 'nuestros-traslados';

let unitTypeOptions = [];
async function loadUnitTypeOptions() {
    try {
        const res = await fetch('/api/business/unit-types', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { unitTypes } = await res.json();
        unitTypeOptions = (unitTypes || []).filter((u) => u.status === 'active' && u.name).map((u) => u.name);
    } catch (err) {
        console.error('Nuestros Traslados: failed to load unit type options', err);
        unitTypeOptions = [];
    }
}

let quoteOptions = []; // [{folio, label}]
async function loadQuoteOptions() {
    try {
        const res = await fetch('/api/business/freight-quotes-active', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { options } = await res.json();
        quoteOptions = options || [];
    } catch (err) {
        console.error('Nuestros Traslados: failed to load quote options', err);
        quoteOptions = [];
    }
}

function textCell(key, value) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value || '—';
    return td;
}

function textCellSystem(key, value) {
    const td = textCell(key, value);
    td.classList.add('col-system');
    return td;
}

const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
function buildSystemCells(record) {
    return SYSTEM_COLUMN_KEYS.map((key) => textCellSystem(key, record[key]));
}

function isPending(record, key) {
    return (record.pendingFields || []).includes(key);
}

// Every row rendered by refreshTable() already exists on the server (see the
// "+ Nuevo Traslado" modal below for how a NEW traslado gets created), so a
// cell edit is always a plain patch.
function ensureCreatedThenPatch(record, patch) {
    return patchTransfer(record.id, patch);
}

async function patchTransfer(id, patch) {
    try {
        const res = await fetch(`/api/business/transfers/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'error');
            await refreshTable();
            return;
        }
        const body = await res.json().catch(() => ({}));
        if (body.rejectedFields?.length) {
            Dashboard.showToast(`${Dashboard.t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'warning');
        } else if (body.pendingFields?.length) {
            Dashboard.showToast(`${Dashboard.t('main.changePending')}: ${body.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'info');
        }
        await refreshTable();
    } catch (err) {
        console.error('Nuestros Traslados: failed to save change', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await refreshTable();
    }
}

function buildUnitTypeCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colTrasladoTipoUnidadSolicitada';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    const current = record.requestedUnitType || '';
    const names = current && !unitTypeOptions.includes(current) ? [current, ...unitTypeOptions] : unitTypeOptions;
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = Dashboard.t('main.articleTypeSelect');
    select.appendChild(blankOption);
    names.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    select.value = current;
    select.disabled = isPending(record, 'requestedUnitType') || !Dashboard.canEditField(TABLE_KEY, 'colTrasladoTipoUnidadSolicitada', current);
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'requestedUnitType') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { requestedUnitType: select.value }));
    td.appendChild(select);
    return td;
}

function buildQuoteCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colTrasladoCotizacion';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    const current = record.quoteFolio || '';
    const currentKnown = quoteOptions.some((q) => q.folio === current);
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = Dashboard.t('main.articleTypeSelect');
    select.appendChild(blankOption);
    if (current && !currentKnown) {
        const opt = document.createElement('option');
        opt.value = current;
        opt.textContent = current;
        select.appendChild(opt);
    }
    quoteOptions.forEach((q) => {
        const opt = document.createElement('option');
        opt.value = q.folio;
        opt.textContent = q.label;
        select.appendChild(opt);
    });
    select.value = current;
    select.disabled = isPending(record, 'quoteFolio') || !Dashboard.canEditField(TABLE_KEY, 'colTrasladoCotizacion', current);
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'quoteFolio') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { quoteFolio: select.value }));
    td.appendChild(select);
    return td;
}

function buildActionsCell(record, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'admin-icon-btn';
    historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
    historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
    historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    historyBtn.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, record.id));
    td.appendChild(historyBtn);
    if (Dashboard.hasColumnDeleteGrant(TABLE_KEY, 'colTrasladoDeleteAuth')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.title = Dashboard.t('admin.delete');
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => deleteTransfer(record.id, tr));
        td.appendChild(deleteBtn);
    }
    return td;
}

async function deleteTransfer(id, tr) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`/api/business/transfers/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
            if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
            throw new Error('delete failed');
        }
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Nuestros Traslados: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// The 21 plain-text own fields -- [colId, apiKey] pairs, same order as the
// table header / menu.json classifications.
const TEXT_CELL_FIELDS = [
    ['colTrasladoFechaSolicitud', 'requestDate'],
    ['colTrasladoQuienSolicita', 'requestedBy'],
    ['colTrasladoTipoCliente', 'clientType'],
    ['colTrasladoContactoSolicita', 'requestContact'],
    ['colTrasladoFechaRequerida', 'neededDate'],
    ['colTrasladoHoraRequerida', 'neededTime'],
    ['colTrasladoClienteServicio', 'serviceClient'],
    ['colTrasladoTipoServicio', 'serviceType'],
];
const TEXT_CELL_FIELDS_REQUISITOS = [
    ['colTrasladoReqServicio', 'serviceRequirements'],
    ['colTrasladoReqSeguridad', 'securityRequirements'],
    ['colTrasladoReqCobro', 'billingRequirements'],
];
const TEXT_CELL_FIELDS_ORIGEN = [
    ['colTrasladoClienteOrigen', 'originClient'],
    ['colTrasladoContactoOrigen', 'originContact'],
    ['colTrasladoSitioOrigen', 'originSite'],
    ['colTrasladoUrlOrigen', 'originUrl'],
    ['colTrasladoApodoOrigen', 'originNickname'],
];
const TEXT_CELL_FIELDS_DESTINO = [
    ['colTrasladoClienteDestino', 'destClient'],
    ['colTrasladoContactoDestino', 'destContact'],
    ['colTrasladoSitioDestino', 'destSite'],
    ['colTrasladoUrlDestino', 'destUrl'],
    ['colTrasladoApodoDestino', 'destNickname'],
];
const ALL_TEXT_CELL_FIELDS = [...TEXT_CELL_FIELDS, ...TEXT_CELL_FIELDS_REQUISITOS, ...TEXT_CELL_FIELDS_ORIGEN, ...TEXT_CELL_FIELDS_DESTINO];

function buildInlineTextCell(record, colId, apiKey, inputType = 'text') {
    const td = document.createElement('td');
    td.dataset.col = colId;
    Dashboard.attachInlineEdit(td, {
        value: record[apiKey] || '',
        inputType,
        tableKey: TABLE_KEY,
        colKey: colId,
        pending: isPending(record, apiKey),
        onCommit: (val) => ensureCreatedThenPatch(record, { [apiKey]: val.trim() }),
    });
    return td;
}

function buildRow(record) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = record.id != null ? String(record.id) : '';
    tr.append(
        ...buildSystemCells(record),
        textCellSystem('colTrasladoRegistroUnico', record.registroUnico),
        buildInlineTextCell(record, 'colTrasladoFechaSolicitud', 'requestDate', 'datetime-local'),
        buildInlineTextCell(record, 'colTrasladoQuienSolicita', 'requestedBy'),
        buildInlineTextCell(record, 'colTrasladoTipoCliente', 'clientType'),
        buildInlineTextCell(record, 'colTrasladoContactoSolicita', 'requestContact'),
        buildInlineTextCell(record, 'colTrasladoFechaRequerida', 'neededDate'),
        buildInlineTextCell(record, 'colTrasladoHoraRequerida', 'neededTime'),
        buildInlineTextCell(record, 'colTrasladoClienteServicio', 'serviceClient'),
        buildInlineTextCell(record, 'colTrasladoTipoServicio', 'serviceType'),
        buildUnitTypeCell(record),
        buildQuoteCell(record),
        buildInlineTextCell(record, 'colTrasladoReqServicio', 'serviceRequirements'),
        buildInlineTextCell(record, 'colTrasladoReqSeguridad', 'securityRequirements'),
        buildInlineTextCell(record, 'colTrasladoReqCobro', 'billingRequirements'),
        buildInlineTextCell(record, 'colTrasladoClienteOrigen', 'originClient'),
        buildInlineTextCell(record, 'colTrasladoContactoOrigen', 'originContact'),
        buildInlineTextCell(record, 'colTrasladoSitioOrigen', 'originSite'),
        buildInlineTextCell(record, 'colTrasladoUrlOrigen', 'originUrl'),
        buildInlineTextCell(record, 'colTrasladoApodoOrigen', 'originNickname'),
        buildInlineTextCell(record, 'colTrasladoClienteDestino', 'destClient'),
        buildInlineTextCell(record, 'colTrasladoContactoDestino', 'destContact'),
        buildInlineTextCell(record, 'colTrasladoSitioDestino', 'destSite'),
        buildInlineTextCell(record, 'colTrasladoUrlDestino', 'destUrl'),
        buildInlineTextCell(record, 'colTrasladoApodoDestino', 'destNickname'),
        buildActionsCell(record, tr),
    );
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    return tr;
}

function getTbody() {
    return document.querySelector('[data-table-id="nuestros-traslados"] table.data-table').tBodies[0];
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = 38;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

async function refreshTable() {
    const tbody = getTbody();
    if (tbody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    try {
        const res = await fetch('/api/business/transfers', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { transfers } = await res.json();
        tbody.innerHTML = '';
        if (!transfers.length) { ensureEmptyState(); return; }
        transfers.forEach((record) => tbody.appendChild(buildRow(record)));
        applyTransferFilters();
    } catch (err) {
        console.error('Nuestros Traslados: failed to load records', err);
    }
}

function applyTransferFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = ['colTrasladoClienteServicio', 'colTrasladoSitioOrigen', 'colTrasladoContactoSolicita']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !haystack.includes(text);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyTransferFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyTransferFilters);

function renderNewRecordButton() {
    const wrapper = document.querySelector('[data-table-id="nuestros-traslados"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newTransfer">${Dashboard.t('main.newTransfer')}</span>`;
    btn.addEventListener('click', openCreateModal);
    toolbar.prepend(btn);
}

// --- "+ Nuevo Traslado" modal ------------------------------------------------
// Same rationale as Alta Nuestros Artículos' own modal: 23 fields is too many
// for click-per-cell creation, so the whole record is captured in one form
// and only reaches the server once "Guardar" succeeds.
const createModal = document.getElementById('new-transfer-modal');
const createForm = document.getElementById('new-transfer-form');
const createFormError = document.getElementById('new-transfer-form-error');

function applyCreateFormFieldPermissions() {
    ALL_TEXT_CELL_FIELDS.forEach(([colId, key]) => {
        const input = createForm.elements.namedItem(key);
        if (input) input.disabled = !Dashboard.canEditField(TABLE_KEY, colId, '');
    });
    const unitInput = createForm.elements.namedItem('requestedUnitType');
    if (unitInput) unitInput.disabled = !Dashboard.canEditField(TABLE_KEY, 'colTrasladoTipoUnidadSolicitada', '');
    const quoteInput = createForm.elements.namedItem('quoteFolio');
    if (quoteInput) quoteInput.disabled = !Dashboard.canEditField(TABLE_KEY, 'colTrasladoCotizacion', '');
}

function populateCreateSelects() {
    const unitSelect = createForm.elements.namedItem('requestedUnitType');
    if (unitSelect) {
        unitSelect.innerHTML = '';
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = Dashboard.t('main.articleTypeSelect');
        unitSelect.appendChild(blank);
        unitTypeOptions.forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            unitSelect.appendChild(opt);
        });
    }
    const quoteSelect = createForm.elements.namedItem('quoteFolio');
    if (quoteSelect) {
        quoteSelect.innerHTML = '';
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = Dashboard.t('main.articleTypeSelect');
        quoteSelect.appendChild(blank);
        quoteOptions.forEach((q) => {
            const opt = document.createElement('option');
            opt.value = q.folio;
            opt.textContent = q.label;
            quoteSelect.appendChild(opt);
        });
    }
}

async function openCreateModal() {
    createForm.reset();
    createFormError.hidden = true;
    await Promise.all([loadUnitTypeOptions(), loadQuoteOptions()]);
    applyCreateFormFieldPermissions();
    populateCreateSelects();
    createModal.hidden = false;
}

function closeCreateModal() {
    createModal.hidden = true;
}

document.getElementById('new-transfer-cancel')?.addEventListener('click', closeCreateModal);
createModal?.addEventListener('click', (event) => { if (event.target === createModal) closeCreateModal(); });

createForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    createFormError.hidden = true;
    const saveBtn = document.getElementById('new-transfer-save');
    saveBtn.disabled = true;
    try {
        const res = await fetch('/api/business/transfers', { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('create failed');
        const { transfer } = await res.json();

        const patch = {};
        ALL_TEXT_CELL_FIELDS.forEach(([, key]) => {
            const input = createForm.elements.namedItem(key);
            if (input && !input.disabled) patch[key] = input.value.trim();
        });
        const unitInput = createForm.elements.namedItem('requestedUnitType');
        if (unitInput && !unitInput.disabled) patch.requestedUnitType = unitInput.value;
        const quoteInput = createForm.elements.namedItem('quoteFolio');
        if (quoteInput && !quoteInput.disabled) patch.quoteFolio = quoteInput.value;

        await fetch(`/api/business/transfers/${transfer.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });

        closeCreateModal();
        await refreshTable();
    } catch (err) {
        console.error('Nuestros Traslados: failed to save new record', err);
        createFormError.textContent = Dashboard.t('admin.saveError');
        createFormError.hidden = false;
    } finally {
        saveBtn.disabled = false;
    }
});
