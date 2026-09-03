// ---------------------------------------------------------------------------
// Carga Combustible — sibling of Registro Combustible (same shell via
// Dashboard.initDashboard).
//
// "+ Nuevo Registro" creates a real, blank record immediately (see db.js's
// createFuelLoadingRecord) — every field, identifying ones included, is then
// filled in one at a time by clicking directly on that cell in the table
// (Dashboard.attachInlineEdit / attachEvidenceControl / the <select> cells
// below), same convention as the App's own field-by-field form. Centro de
// Costos auto-assigns right after creation when this user has exactly one
// (mirrors AppCargaCombustible.js's own createNewCarga); "+ Nuevo Registro"
// is blocked outright with a toast when they have none.
//
// Persisted via /api/business/fuel-loading-records (see server.js + db.js
// fuel_loading_records table): POST on "+ Nuevo Registro", PATCH per field
// the moment an inline edit, a <select> change, or a photo upload commits.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-transporte-vol-carga-combustible' });
        if (!role) return;
        renderNewRecordButton();
        await Promise.all([refreshTable(), loadFleetFuelSuggestions()]);
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
// `overrides[key]`, when given, builds that one system column's cell instead
// of the plain read-only default — used for colSysCentroCostos below, the
// one system column this table lets you edit after creation.
function buildSystemCells(record, overrides = {}) {
    return SYSTEM_COLUMN_KEYS.map((key) => (overrides[key] ? overrides[key](record) : textCellSystem(key, record[key])));
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
    td.colSpan = 26;
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
        if (!res.ok) {
            if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
            throw new Error('delete failed');
        }
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
    if (Dashboard.hasColumnDeleteGrant(TABLE_KEY, 'colCargaDeleteAuth')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.title = Dashboard.t('admin.delete');
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => deleteFuelLoadingRecord(record.id, tr));
        td.appendChild(deleteBtn);
    }
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
// preview modal instead. Uploads go straight to R2 via Dashboard.uploadEvidenceFile
// (compressed client-side, never through this Node server) and the record is
// PATCHed with the short storage key it returns, not the file itself. `value`
// may still be a legacy base64 data: URL for a record not yet migrated (see
// db.js's own migrated/not-migrated comment) — handled either way.
function attachEvidenceControl(td, { value, pending, uploadLabelKey, viewLabelKey, tableKey, recordId, fieldKey, onCommit }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-icon-btn';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;

    let stored = value || null;
    let busy = false;
    function render() {
        const icon = busy ? 'bx-loader-alt bx-spin' : (pending ? 'bx-time-five' : (stored ? 'bx-receipt' : 'bx-image-add'));
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
        const label = pending ? 'main.changePending' : (stored ? viewLabelKey : uploadLabelKey);
        btn.setAttribute('aria-label', Dashboard.t(label));
        btn.title = Dashboard.t(label);
        // Icon-only cell -- textContent alone can't tell empty from filled
        // (see Reglas de Orden de Llenado's applyFieldFillRules), so this
        // marks it explicitly, same convention as Dashboard.attachInlineEdit.
        td.dataset.dtEmpty = stored ? '' : '1';
    }
    btn.addEventListener('click', async () => {
        if (pending || busy) return;
        if (stored) {
            try {
                const url = stored.startsWith('data:') ? stored : await Dashboard.getEvidenceDownloadUrl({ tableKey, recordId, fieldKey });
                openEvidencePreview(url);
            } catch (err) {
                console.error('evidence preview failed', err);
                Dashboard.showToast(Dashboard.t('main.backupDownloadError'), 'error');
            }
        } else fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        busy = true;
        render();
        try {
            const key = await Dashboard.uploadEvidenceFile(file, { tableKey, recordId, fieldKey });
            stored = key;
            onCommit(key);
            applyFieldFillRules(TABLE_KEY);
        } catch (err) {
            console.error('evidence upload failed', err);
            Dashboard.showToast(Dashboard.t(err.status === 403 ? 'main.fieldLocked' : 'admin.saveError'), err.status === 403 ? 'warning' : 'error');
        } finally {
            busy = false;
            render();
        }
    });
    render();
    td.append(btn, fileInput);
}

// ecoUnit -> fuelType lookup (Nuestras Unidades), loaded once at init — open/
// never blocking (confirmed product decision): an Económico with no match
// just yields no suggestion. Mirrors AppCargaCombustible.js's own.
let fleetFuelSuggestions = {};
async function loadFleetFuelSuggestions() {
    try {
        const res = await fetch('/api/business/fleet-units', { credentials: 'include' });
        if (!res.ok) return;
        const { fleetUnits } = await res.json();
        const map = {};
        (fleetUnits || []).forEach((u) => {
            if (u.ecoId && u.fuelType) map[u.ecoId.trim().toLowerCase()] = u.fuelType;
        });
        fleetFuelSuggestions = map;
    } catch {
        fleetFuelSuggestions = {};
    }
}

// Tipo Combustible — a real <select>, always live in the cell, same pattern
// as Registro Combustible's own colFuelType. Suggested (never forced) from
// Nuestras Unidades when Económico is confirmed and matches a registered
// fleet unit (see the Económico cell in buildRow below) — still just a
// normal editable field otherwise, like any other.
function buildFuelTypeCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colFuelType';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.innerHTML = `
        <option value="" data-i18n="main.fuelTypeSelect">${Dashboard.t('main.fuelTypeSelect')}</option>
        <optgroup label="${Dashboard.t('main.fuelTypeGasolineGroup')}">
            <option value="magna" data-i18n="main.fuelTypeMagna">${Dashboard.t('main.fuelTypeMagna')}</option>
            <option value="premium" data-i18n="main.fuelTypePremium">${Dashboard.t('main.fuelTypePremium')}</option>
        </optgroup>
        <option value="diesel" data-i18n="main.fuelTypeDiesel">${Dashboard.t('main.fuelTypeDiesel')}</option>
    `;
    select.value = record.fuelType || '';
    select.disabled = isPending(record, 'fuelType') || !Dashboard.canEditField(TABLE_KEY, 'colFuelType', record.fuelType || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'fuelType') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => patchFuelLoadingRecord(record.id, { fuelType: select.value }));
    td.appendChild(select);
    return td;
}

// Centro de Costos — the one Control Interno column this table lets you
// edit after creation (see FUEL_LOADING_PATCHABLE_FIELDS in db.js). A real
// <select> populated from this user's own sidebarCostCenters (Dashboard.js's
// top-level `let`, same list the top-bar cc-picker itself reads from), same
// pattern as Tipo Combustible above.
function buildCentroCostosCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colSysCentroCostos';
    td.classList.add('col-system');
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = Dashboard.t('main.newRecordCostCenterPlaceholder');
    select.appendChild(placeholder);
    (typeof sidebarCostCenters !== 'undefined' ? sidebarCostCenters : []).forEach((cc) => {
        const label = `${cc.code} - ${cc.name}`;
        const opt = document.createElement('option');
        opt.value = label;
        opt.textContent = label;
        select.appendChild(opt);
    });
    const currentValue = record.colSysCentroCostos || '';
    select.value = currentValue;
    select.disabled = isPending(record, 'centroCostos') || !Dashboard.canEditField(TABLE_KEY, 'colSysCentroCostos', currentValue);
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'centroCostos') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => patchFuelLoadingRecord(record.id, { centroCostos: select.value }));
    td.appendChild(select);
    return td;
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
        tableKey: TABLE_KEY,
        recordId: record.id,
        fieldKey: apiField,
        onCommit: (key) => patchFuelLoadingRecord(record.id, { [apiField]: key }),
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

    const tdDate = document.createElement('td');
    tdDate.dataset.col = 'colCargaFechaRegistro';
    Dashboard.attachInlineEdit(tdDate, {
        value: record.date || '',
        inputType: 'date',
        tableKey: TABLE_KEY,
        colKey: 'colCargaFechaRegistro',
        pending: isPending(record, 'date'),
        onCommit: (val) => patchFuelLoadingRecord(record.id, { date: val }),
    });

    const tdLoadSite = document.createElement('td');
    tdLoadSite.dataset.col = 'colCargaSitio';
    Dashboard.attachInlineEdit(tdLoadSite, {
        value: record.loadSite || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCargaSitio',
        pending: isPending(record, 'loadSite'),
        onCommit: (val) => patchFuelLoadingRecord(record.id, { loadSite: val.trim() }),
    });

    const tdOperator = document.createElement('td');
    tdOperator.dataset.col = 'colCargaOperador';
    Dashboard.attachInlineEdit(tdOperator, {
        value: record.operator || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCargaOperador',
        pending: isPending(record, 'operator'),
        onCommit: (val) => patchFuelLoadingRecord(record.id, { operator: val.trim() }),
    });

    const tdCoordinator = document.createElement('td');
    tdCoordinator.dataset.col = 'colCargaCoordinador';
    Dashboard.attachInlineEdit(tdCoordinator, {
        value: record.coordinator || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCargaCoordinador',
        pending: isPending(record, 'coordinator'),
        onCommit: (val) => patchFuelLoadingRecord(record.id, { coordinator: val.trim() }),
    });

    // Confirming Económico also bundles a Tipo Combustible SUGGESTION in the
    // same PATCH when Nuestras Unidades has a match and the field is still
    // empty — same rule as AppCargaCombustible.js's own commitFieldValue:
    // still goes through the normal empty->filled permission check, never
    // overwrites a value already set.
    const tdEcoUnit = document.createElement('td');
    tdEcoUnit.dataset.col = 'colCargaEcoUnidad';
    Dashboard.attachInlineEdit(tdEcoUnit, {
        value: record.ecoUnit || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCargaEcoUnidad',
        pending: isPending(record, 'ecoUnit'),
        onCommit: (val) => {
            const ecoUnit = val.trim();
            const patch = { ecoUnit };
            const suggestion = fleetFuelSuggestions[ecoUnit.toLowerCase()];
            if (suggestion && !record.fuelType) patch.fuelType = suggestion;
            patchFuelLoadingRecord(record.id, patch);
        },
    });

    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
    tr.dataset.recordDate = record.date;
    tr.append(
        ...buildSystemCells(record, { colSysCentroCostos: buildCentroCostosCell }),
        tdDate,
        tdLoadSite,
        tdOperator,
        tdCoordinator,
        tdEcoUnit,
        buildFuelTypeCell(record),
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

// "+ Nuevo Registro" — creates a blank record right away (same reasoning as
// the App's own createNewCarga in AppCargaCombustible.js): blocked outright
// with a toast when this user has zero cost centers (nothing meaningful to
// assign), auto-assigned right after creation when they have exactly one,
// left for a manual pick via the Centro de Costos cell otherwise. Dashboard.js
// and this page share one global scope (plain <script> tags, not modules) --
// sidebarCostCenters is Dashboard.js's own top-level `let`, same one the
// top-bar cc-picker itself reads from.
async function createNewRecord() {
    const costCenters = typeof sidebarCostCenters !== 'undefined' ? sidebarCostCenters : [];
    if (!costCenters.length) {
        Dashboard.showToast(Dashboard.t('admin.costCenterRequiredForRecord'), 'error');
        return;
    }
    try {
        const res = await fetch('/api/business/fuel-loading-records', { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('save failed');
        const { record } = await res.json();
        const tbody = getTbody();
        const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
        if (emptyRow) emptyRow.remove();
        tbody.appendChild(buildRow(record));
        if (costCenters.length === 1) {
            const cc = costCenters[0];
            await patchFuelLoadingRecord(record.id, { centroCostos: `${cc.code} - ${cc.name}` });
        }
        Dashboard.showToast(Dashboard.t('main.recordSaved'), 'success');
    } catch (err) {
        console.error('Carga Combustible: failed to create record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

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
    btn.addEventListener('click', createNewRecord);
    toolbar.prepend(btn);
}
