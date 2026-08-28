// ---------------------------------------------------------------------------
// Carga Combustible — sibling of Registro Combustible (same shell via
// Dashboard.initDashboard, same "+ Nuevo Registro" toolbar-button pattern).
//
// "+ Nuevo Registro" only asks for the 5 fields that identify the loading
// event (Fecha Registro, Sitio Carga, Operador, Coordinador, Económico
// Unidad) plus Centro de Costos — everything else (Trip antes/después +
// their photo evidence, Costo Total + its ticket evidence) starts empty and
// gets filled in later by clicking directly on that cell in the table (see
// Dashboard.attachInlineEdit / attachEvidenceControl below).
//
// Persisted via /api/business/fuel-loading-records (see server.js + db.js
// fuel_loading_records table): POST on "+ Nuevo Registro", PATCH per field
// the moment an inline edit or a photo upload commits.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-transporte-vol-carga-combustible' });
        if (!role) return;
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Carga Combustible failed to initialize:', err);
    }
})();

function formatMoney(n) {
    return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatKm(n) {
    return `${(Number(n) || 0).toLocaleString()} km`;
}

function textCell(key, value) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value || '—';
    return td;
}

// The 13 "Control Interno" columns — same as textCell, plus the muted
// col-system class (see Inicio-en.css) that visually sets them apart from
// this screen's own columns.
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

async function patchFuelLoadingRecord(id, patch) {
    try {
        const res = await fetch(`/api/business/fuel-loading-records/${id}`, {
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
        // No longer optimistic-only: the cell may have just been diverted to
        // a pending approval (still showing the OLD value) or partially
        // rejected — reload the table from the server so the UI always
        // reflects what actually got written, not what the user typed.
        await refreshTable();
    } catch (err) {
        console.error('Carga Combustible: failed to save change', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await refreshTable();
    }
}

// Empty-state row shown when the table has zero records — mirrors the
// static placeholder from OpTransVolCargaCombustible.html so deleting the
// last remaining row doesn't leave a headerless-looking empty tbody.
function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = 25;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

async function deleteFuelLoadingRecord(id, tr) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`/api/business/fuel-loading-records/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Carga Combustible: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
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
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
    deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
    deleteBtn.title = Dashboard.t('admin.delete');
    deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
    deleteBtn.addEventListener('click', () => deleteFuelLoadingRecord(record.id, tr));
    td.appendChild(deleteBtn);
    return td;
}

const TABLE_KEY = 'carga-combustible';

// Whether `key` (a PATCH bodyKey, e.g. "totalCost") has an outstanding
// approval request on this specific record — comes straight from the
// server's GET response (see getPendingColumnsByRecord in db.js), never
// decided client-side.
function isPending(record, key) {
    return (record.pendingFields || []).includes(key);
}

// Evidence preview modal — shared by every photo-evidence icon on this page
// (Trip antes/después + Costo Total). NOT window.open(url, '_blank'): modern
// Chrome blocks a top-level navigation to a data: URL (used here since every
// photo is stored/PATCHed as a base64 data URL, no file storage backend), so
// that used to silently do nothing once a photo was already attached. An
// <img> inside our own modal has no such restriction.
const evidencePreviewModal = document.getElementById('evidence-preview-modal');
const evidencePreviewImage = document.getElementById('evidence-preview-image');
const evidencePreviewClose = document.getElementById('evidence-preview-close');
function openEvidencePreview(dataUrl) {
    evidencePreviewImage.src = dataUrl;
    evidencePreviewModal.hidden = false;
}
function closeEvidencePreview() {
    evidencePreviewModal.hidden = true;
    evidencePreviewImage.removeAttribute('src');
}
evidencePreviewClose.addEventListener('click', closeEvidencePreview);
evidencePreviewModal.addEventListener('click', (event) => {
    if (event.target === evidencePreviewModal) closeEvidencePreview();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !evidencePreviewModal.hidden) closeEvidencePreview();
});

// Shared icon-button control for every photo-evidence cell on this page:
// always clickable (unlike a disabled placeholder icon) — with no photo
// yet, it opens the file picker; once one is attached, it opens the shared
// preview modal instead. Persisted as a data: URL via PATCH the moment a
// photo is picked.
function attachEvidenceControl(td, { value, pending, uploadLabelKey, viewLabelKey, onCommit }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-icon-btn';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;

    let dataUrl = value || null;
    function render() {
        btn.innerHTML = `<i class="bx ${pending ? 'bx-time-five' : (dataUrl ? 'bx-receipt' : 'bx-image-add')}" aria-hidden="true"></i>`;
        const label = pending ? 'main.changePending' : (dataUrl ? viewLabelKey : uploadLabelKey);
        btn.setAttribute('aria-label', Dashboard.t(label));
        btn.title = Dashboard.t(label);
        // Icon-only cell -- textContent alone can't tell empty from filled
        // (see Reglas de Orden de Llenado's applyFieldFillRules), so this
        // marks it explicitly, same convention as Dashboard.attachInlineEdit.
        td.dataset.dtEmpty = dataUrl ? '' : '1';
    }
    btn.addEventListener('click', () => {
        if (pending) return;
        if (dataUrl) openEvidencePreview(dataUrl);
        else fileInput.click();
    });
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            dataUrl = reader.result;
            render();
            onCommit(dataUrl);
            applyFieldFillRules(TABLE_KEY);
        };
        reader.readAsDataURL(file);
    });
    render();
    td.append(btn, fileInput);
}

// Trip antes/después carga — a numeric inline-edit cell next to its own
// dedicated evidence column (not inside the same <td>: Dashboard.
// attachInlineEdit does td.innerHTML = '' on every render/commit, which
// would wipe an icon button appended into that same cell).
function buildTripEvidenceCell(record, col, apiField, uploadLabelKey, viewLabelKey) {
    const td = document.createElement('td');
    td.dataset.col = col;
    attachEvidenceControl(td, {
        value: record[apiField] || null,
        pending: isPending(record, apiField),
        uploadLabelKey,
        viewLabelKey,
        onCommit: (dataUrl) => patchFuelLoadingRecord(record.id, { [apiField]: dataUrl }),
    });
    return td;
}

// Builds one <tr> from a fuel loading record as returned by the API (GET,
// POST or freshly created) — the single source of truth for row markup.
function buildRow(record) {
    const tdTripBefore = document.createElement('td');
    tdTripBefore.dataset.col = 'colCargaTripAntes';
    Dashboard.attachInlineEdit(tdTripBefore, {
        value: record.tripBefore ? String(record.tripBefore) : '',
        inputType: 'number',
        formatDisplay: formatKm,
        tableKey: TABLE_KEY,
        colKey: 'colCargaTripAntes',
        pending: isPending(record, 'tripBefore'),
        onCommit: (val) => patchFuelLoadingRecord(record.id, { tripBefore: parseFloat(val) || 0 }),
    });

    const tdTripAfter = document.createElement('td');
    tdTripAfter.dataset.col = 'colCargaTripDespues';
    Dashboard.attachInlineEdit(tdTripAfter, {
        value: record.tripAfter ? String(record.tripAfter) : '',
        inputType: 'number',
        formatDisplay: formatKm,
        tableKey: TABLE_KEY,
        colKey: 'colCargaTripDespues',
        pending: isPending(record, 'tripAfter'),
        onCommit: (val) => patchFuelLoadingRecord(record.id, { tripAfter: parseFloat(val) || 0 }),
    });

    const tdTotalCost = document.createElement('td');
    tdTotalCost.dataset.col = 'colCargaCostoTotal';
    Dashboard.attachInlineEdit(tdTotalCost, {
        value: record.totalCost ? String(record.totalCost) : '',
        inputType: 'number',
        formatDisplay: formatMoney,
        tableKey: TABLE_KEY,
        colKey: 'colCargaCostoTotal',
        pending: isPending(record, 'totalCost'),
        onCommit: (val) => patchFuelLoadingRecord(record.id, { totalCost: parseFloat(val) || 0 }),
    });

    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
    tr.dataset.recordDate = record.date;
    tr.append(
        ...buildSystemCells(record),
        textCell('colCargaFechaRegistro', record.date),
        textCell('colCargaSitio', record.loadSite),
        textCell('colCargaOperador', record.operator),
        textCell('colCargaCoordinador', record.coordinator),
        textCell('colCargaEcoUnidad', record.ecoUnit),
        tdTripBefore,
        buildTripEvidenceCell(record, 'colCargaTripAntesEvidencia', 'tripBeforeEvidence', 'main.cargaUploadTripAntesEvidencia', 'main.colCargaTripAntesEvidencia'),
        tdTripAfter,
        buildTripEvidenceCell(record, 'colCargaTripDespuesEvidencia', 'tripAfterEvidence', 'main.cargaUploadTripDespuesEvidencia', 'main.colCargaTripDespuesEvidencia'),
        tdTotalCost,
        buildTripEvidenceCell(record, 'colCargaCostoTotalEvidencia', 'totalCostEvidence', 'main.cargaUploadCostoTotalEvidencia', 'main.colCargaCostoTotalEvidencia'),
        buildActionsCell(record, tr),
    );
    // Row-editable legend (see Dashboard.js renderDataTableColumnControls) —
    // a row counts as "editable by you" if at least one of its cells ended
    // up unlocked: attachInlineEdit only adds the plain .editable-cell class
    // (no -locked/-disabled/-pending suffix) once it's already resolved
    // canEditField for that cell.
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    return tr;
}

function getTbody() {
    return document.querySelector('[data-table-id="carga-combustible"] table.data-table').tBodies[0];
}

async function refreshTable() {
    // A full tbody rebuild would wipe an <input> the user has open in a
    // DIFFERENT cell mid-edit — this now runs after every patch (not just
    // failures), so that's a realistic case (tabbing through cells in one
    // row faster than each PATCH round-trip resolves). Skip this pass; the
    // next commit/blur elsewhere will trigger another refresh anyway.
    const tbody = getTbody();
    if (tbody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    try {
        const res = await fetch('/api/business/fuel-loading-records', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { records } = await res.json();
        tbody.innerHTML = '';
        if (!records.length) { ensureEmptyState(); return; }
        records.forEach((record) => tbody.appendChild(buildRow(record)));
        applyCargaFilters();
    } catch (err) {
        console.error('Carga Combustible: failed to load records', err);
    }
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the fields mean).
// Client-side row hiding rather than a re-fetch: everything's already loaded
// and rendered, and re-applying after every refreshTable() keeps a filter
// active across inline edits instead of it silently resetting.
function getCargaFilterValues() {
    return {
        text: (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase(),
        dateFrom: document.getElementById('filter-date-from')?.value || '',
        dateTo: document.getElementById('filter-date-to')?.value || '',
    };
}
function cargaRowMatchesFilters(tr, filters) {
    if (filters.text) {
        const haystack = ['colCargaSitio', 'colCargaOperador', 'colCargaCoordinador', 'colCargaEcoUnidad']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        if (!haystack.includes(filters.text)) return false;
    }
    if (filters.dateFrom && tr.dataset.recordDate < filters.dateFrom) return false;
    if (filters.dateTo && tr.dataset.recordDate > filters.dateTo) return false;
    return true;
}
function applyCargaFilters() {
    const filters = getCargaFilterValues();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        tr.hidden = !cargaRowMatchesFilters(tr, filters);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyCargaFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyCargaFilters);

const newRecordModal = document.getElementById('new-record-modal');
const dateInput = document.getElementById('new-record-date');
const loadSiteInput = document.getElementById('new-record-load-site');
const operatorInput = document.getElementById('new-record-operator');
const coordinatorInput = document.getElementById('new-record-coordinator');
const ecoUnitInput = document.getElementById('new-record-eco-unit');
const costCenterSelect = document.getElementById('new-record-cost-center');
const newRecordError = document.getElementById('new-record-error');
const newRecordSaveBtn = document.getElementById('new-record-save');
const newRecordCancelBtn = document.getElementById('new-record-cancel');

// Dashboard.js and this page share one global scope (plain <script> tags,
// not modules) -- sidebarCostCenters is Dashboard.js's own top-level `let`,
// same one the top-bar cc-picker itself reads from.
function populateCostCenterSelect() {
    costCenterSelect.querySelectorAll('option:not([value=""])').forEach((opt) => opt.remove());
    (typeof sidebarCostCenters !== 'undefined' ? sidebarCostCenters : []).forEach((cc) => {
        const option = document.createElement('option');
        option.value = String(cc.id);
        option.textContent = `${cc.code} - ${cc.name}`;
        costCenterSelect.appendChild(option);
    });
    // Preset to the top-bar picker's own current selection when it's
    // unambiguous (exactly one active there) -- same convenience default,
    // just editable here now instead of only settable from the top bar.
    const oneSelected = typeof selectedCostCenterIds !== 'undefined'
        && selectedCostCenterIds instanceof Set && selectedCostCenterIds.size === 1;
    costCenterSelect.value = oneSelected ? String(Array.from(selectedCostCenterIds)[0]) : '';
}

function closeNewRecordModal() {
    newRecordModal.hidden = true;
}

function openNewRecordModal() {
    dateInput.value = '';
    loadSiteInput.value = '';
    operatorInput.value = '';
    coordinatorInput.value = '';
    ecoUnitInput.value = '';
    populateCostCenterSelect();
    newRecordError.hidden = true;
    newRecordModal.hidden = false;
    dateInput.focus();
}

async function saveNewRecord() {
    const missing = [dateInput, loadSiteInput, operatorInput, coordinatorInput, ecoUnitInput].some((el) => !el.value.trim());
    if (missing) {
        newRecordError.textContent = Dashboard.t('login.fieldRequired');
        newRecordError.hidden = false;
        return;
    }
    // Control Interno columns must be filled in from creation, not left
    // blank -- block the save here rather than silently persisting a record
    // with no Centro de Costos.
    const selectedCc = sidebarCostCenters.find((cc) => String(cc.id) === costCenterSelect.value);
    if (!selectedCc) {
        newRecordError.textContent = Dashboard.t('admin.costCenterRequiredForRecord');
        newRecordError.hidden = false;
        return;
    }
    newRecordError.hidden = true;
    newRecordSaveBtn.disabled = true;
    try {
        const res = await fetch('/api/business/fuel-loading-records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                date: dateInput.value,
                loadSite: loadSiteInput.value.trim(),
                operator: operatorInput.value.trim(),
                coordinator: coordinatorInput.value.trim(),
                ecoUnit: ecoUnitInput.value.trim(),
                centroCostos: `${selectedCc.code} - ${selectedCc.name}`,
            }),
        });
        if (!res.ok) throw new Error('save failed');
        const { record } = await res.json();
        const tbody = getTbody();
        const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
        if (emptyRow) emptyRow.remove();
        tbody.appendChild(buildRow(record));
        closeNewRecordModal();
        Dashboard.showToast(Dashboard.t('main.recordSaved'), 'success');
    } catch (err) {
        newRecordError.textContent = Dashboard.t('admin.saveError');
        newRecordError.hidden = false;
    } finally {
        newRecordSaveBtn.disabled = false;
    }
}

newRecordSaveBtn.addEventListener('click', saveNewRecord);
newRecordCancelBtn.addEventListener('click', closeNewRecordModal);
newRecordModal.addEventListener('click', (event) => {
    if (event.target === newRecordModal) closeNewRecordModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !newRecordModal.hidden) closeNewRecordModal();
});

// Inserted at the LEFT of the zoom/pin/visibility toolbar Dashboard.js
// already builds for this table (see renderDataTableZoomControls) — that
// bar is the .data-table-wrapper's previousElementSibling once rendered.
function renderNewRecordButton() {
    const wrapper = document.querySelector('[data-table-id="carga-combustible"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newRecord">${Dashboard.t('main.newRecord')}</span>`;
    btn.addEventListener('click', openNewRecordModal);
    toolbar.prepend(btn);
}
