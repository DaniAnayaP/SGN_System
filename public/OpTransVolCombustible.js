// ---------------------------------------------------------------------------
// Registro Combustible — same shell as every other dashboard page
// (Dashboard.initDashboard handles sidebar/i18n/settings/etc.), plus the
// page-specific "+ Nuevo Registro" button injected into this table's own
// zoom/pin/visibility toolbar (see Inicio-en.css .data-table-new-record-btn
// and Dashboard.js renderDataTableZoomControls — that toolbar is generic and
// shared by every .data-table, this button is not, so it's added here
// instead of in Dashboard.js).
//
// "+ Nuevo Registro" only asks for the 4 fields that make a record
// identifiable (Fecha, # Eco Unidad, Chofer, Coordinador) — everything else
// (Placas, Evidencia Ticket, Subtotal, IVA, Motivo Carga and its two
// consecutivos) starts empty and gets filled in later by clicking directly
// on that cell in the table (see attachInlineEdit below).
//
// Persisted via /api/business/fuel-records (see server.js + db.js
// fuel_records table): POST on "+ Nuevo Registro", PATCH per field the
// moment an inline edit commits. year/month/week/day/dayText are NOT stored
// server-side — they're derived from record_date on every render, here.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-transporte-vol-combustible' });
        if (!role) return;
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Registro Combustible failed to initialize:', err);
    }
})();

const MONTH_ABBR = {
    es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const DAY_ABBR = {
    es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

function pad(n, len = 2) {
    return String(n).padStart(len, '0');
}

// Not ISO-8601 strict (doesn't handle the Dec 29-31 / Jan 1-3 edge weeks
// specially) — good enough for "which week of the year is this", which is
// all # Semana needs.
function weekOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - start) / 86400000);
    return Math.ceil((days + start.getDay() + 1) / 7);
}

function formatMoney(n) {
    return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatKm(n) {
    return `${(Number(n) || 0).toLocaleString()} km`;
}

function formatLiters(n) {
    return `${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
}

function formatCostPerLiter(n) {
    return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/L`;
}

function textCell(key, value) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value || '—';
    return td;
}

async function patchFuelRecord(id, patch) {
    try {
        const res = await fetch(`/api/business/fuel-records/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            alert(body.message || Dashboard.t('admin.saveError'));
            await refreshTable();
            return;
        }
        const body = await res.json().catch(() => ({}));
        if (body.rejectedFields?.length) {
            alert(`${Dashboard.t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`);
        } else if (body.pendingFields?.length) {
            alert(`${Dashboard.t('main.changePending')}: ${body.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`);
        }
        // No longer optimistic-only: the cell may have just been diverted to
        // a pending approval (still showing the OLD value) or partially
        // rejected — reload the table from the server so the UI always
        // reflects what actually got written, not what the user typed.
        await refreshTable();
    } catch (err) {
        console.error('Registro Combustible: failed to save change', err);
        alert(Dashboard.t('admin.saveError'));
        await refreshTable();
    }
}

// Empty-state row shown when the table has zero records — mirrors the
// static placeholder from OpTransVolCombustible.html so deleting the last
// remaining row doesn't leave a headerless-looking empty tbody.
function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = 20;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

async function deleteFuelRecord(id, tr) {
    if (!confirm(Dashboard.t('main.recordDeleteConfirm'))) return;
    try {
        const res = await fetch(`/api/business/fuel-records/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Registro Combustible: failed to delete record', err);
        alert(Dashboard.t('admin.saveError'));
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
    deleteBtn.addEventListener('click', () => deleteFuelRecord(record.id, tr));
    td.appendChild(deleteBtn);
    return td;
}

const TABLE_KEY = 'registro-combustible';

// Whether `key` (a PATCH bodyKey, e.g. "subtotal") has an outstanding
// approval request on this specific record — comes straight from the
// server's GET response (see getPendingColumnsByRecord in db.js), never
// decided client-side.
function isPending(record, key) {
    return (record.pendingFields || []).includes(key);
}

// Motivo Carga (a real <select>, always live in the cell — not click-to-edit
// like the plain text/number ones) plus its two mutually exclusive
// consecutivos: only the one matching the selected reason is editable, the
// other locks to N/A. Built together since they share state.
function buildReasonCells(record) {
    const tdReason = document.createElement('td');
    tdReason.dataset.col = 'colFuelReason';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    const options = [
        ['', 'main.fuelSelectReason'],
        ['traslado', 'main.colFuelTransferService'],
        ['interno', 'main.colFuelInternalMovement'],
    ];
    options.forEach(([val, key]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = Dashboard.t(key);
        select.appendChild(opt);
    });
    select.value = record.reason || '';
    select.disabled = isPending(record, 'reason') || !Dashboard.canEditField(TABLE_KEY, 'colFuelReason', record.reason || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'reason') ? 'main.changePending' : 'main.fieldLocked');
    tdReason.appendChild(select);

    const tdTransfer = document.createElement('td');
    tdTransfer.dataset.col = 'colFuelTransferService';
    const tdInternal = document.createElement('td');
    tdInternal.dataset.col = 'colFuelInternalMovement';

    const transferCtrl = Dashboard.attachInlineEdit(tdTransfer, {
        value: record.transferService || '',
        disabled: record.reason !== 'traslado',
        disabledText: 'N/A',
        tableKey: TABLE_KEY,
        colKey: 'colFuelTransferService',
        pending: isPending(record, 'transferService'),
        onCommit: (val) => patchFuelRecord(record.id, { transferService: val }),
    });
    const internalCtrl = Dashboard.attachInlineEdit(tdInternal, {
        value: record.internalMovement || '',
        disabled: record.reason !== 'interno',
        disabledText: 'N/A',
        tableKey: TABLE_KEY,
        colKey: 'colFuelInternalMovement',
        pending: isPending(record, 'internalMovement'),
        onCommit: (val) => patchFuelRecord(record.id, { internalMovement: val }),
    });

    select.addEventListener('change', () => {
        transferCtrl.setDisabled(select.value !== 'traslado');
        internalCtrl.setDisabled(select.value !== 'interno');
        patchFuelRecord(record.id, {
            reason: select.value,
            transferService: select.value === 'traslado' ? transferCtrl.getValue() : '',
            internalMovement: select.value === 'interno' ? internalCtrl.getValue() : '',
        });
    });

    return { tdReason, tdTransfer, tdInternal };
}

// Evidencia Ticket — an icon button, always clickable (unlike a disabled
// placeholder icon): with no photo yet, it opens the file picker; once one
// is attached, it opens it in a new tab instead. Persisted as a data: URL
// via PATCH the moment a photo is picked.
function buildTicketCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colFuelTicketEvidence';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-icon-btn';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;

    let dataUrl = record.ticketEvidence || null;
    const pending = isPending(record, 'ticketEvidence');
    function render() {
        btn.innerHTML = `<i class="bx ${pending ? 'bx-time-five' : (dataUrl ? 'bx-receipt' : 'bx-image-add')}" aria-hidden="true"></i>`;
        const label = pending ? 'main.changePending' : (dataUrl ? 'main.colFuelTicketEvidence' : 'main.fuelUploadTicket');
        btn.setAttribute('aria-label', Dashboard.t(label));
        btn.title = Dashboard.t(label);
    }
    btn.addEventListener('click', () => {
        if (pending) return;
        if (dataUrl) window.open(dataUrl, '_blank');
        else fileInput.click();
    });
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            dataUrl = reader.result;
            render();
            patchFuelRecord(record.id, { ticketEvidence: dataUrl });
        };
        reader.readAsDataURL(file);
    });
    render();
    td.append(btn, fileInput);
    return td;
}

// Tipo Combustible — a real <select>, always live in the cell (not
// click-to-edit), same pattern as Motivo Carga.
function buildFuelTypeCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colFuelType';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    const options = [
        ['', 'main.fuelTypeSelect'],
        ['diesel', 'main.fuelTypeDiesel'],
        ['magna', 'main.fuelTypeMagna'],
        ['premium', 'main.fuelTypePremium'],
    ];
    options.forEach(([val, key]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = Dashboard.t(key);
        select.appendChild(opt);
    });
    select.value = record.fuelType || '';
    select.disabled = isPending(record, 'fuelType') || !Dashboard.canEditField(TABLE_KEY, 'colFuelType', record.fuelType || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'fuelType') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => patchFuelRecord(record.id, { fuelType: select.value }));
    td.appendChild(select);
    return td;
}

// Builds one <tr> from a fuel record as returned by the API (GET, POST or
// freshly created) — the single source of truth for row markup, used both
// for records loaded at page load and for one just saved via "+ Nuevo
// Registro".
function buildRow(record) {
    const lang = Dashboard.lang === 'es' ? 'es' : 'en';
    const [year, month, day] = record.date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);

    const tdTotal = textCell('colFuelTotal', formatMoney((parseFloat(record.subtotal) || 0) + (parseFloat(record.vat) || 0)));
    function recomputeTotal() {
        const subtotal = parseFloat(subtotalCtrl.getValue()) || 0;
        const vat = parseFloat(vatCtrl.getValue()) || 0;
        tdTotal.textContent = formatMoney(subtotal + vat);
    }

    const tdPlates = document.createElement('td');
    tdPlates.dataset.col = 'colFuelPlates';
    Dashboard.attachInlineEdit(tdPlates, {
        value: record.plates || '',
        tableKey: TABLE_KEY,
        colKey: 'colFuelPlates',
        pending: isPending(record, 'plates'),
        onCommit: (val) => patchFuelRecord(record.id, { plates: val }),
    });

    const tdTripKmTotal = textCell('colFuelTripKmTotal', formatKm(Math.max((parseFloat(record.tripKmAfter) || 0) - (parseFloat(record.tripKmBefore) || 0), 0)));
    function recomputeTripKm() {
        const before = parseFloat(tripKmBeforeCtrl.getValue()) || 0;
        const after = parseFloat(tripKmAfterCtrl.getValue()) || 0;
        tdTripKmTotal.textContent = formatKm(Math.max(after - before, 0));
    }

    const tdTripKmBefore = document.createElement('td');
    tdTripKmBefore.dataset.col = 'colFuelTripKmBefore';
    const tripKmBeforeCtrl = Dashboard.attachInlineEdit(tdTripKmBefore, {
        value: record.tripKmBefore ? String(record.tripKmBefore) : '',
        inputType: 'number',
        formatDisplay: formatKm,
        tableKey: TABLE_KEY,
        colKey: 'colFuelTripKmBefore',
        pending: isPending(record, 'tripKmBefore'),
        onCommit: (val) => { recomputeTripKm(); patchFuelRecord(record.id, { tripKmBefore: parseFloat(val) || 0 }); },
    });

    const tdTripKmAfter = document.createElement('td');
    tdTripKmAfter.dataset.col = 'colFuelTripKmAfter';
    const tripKmAfterCtrl = Dashboard.attachInlineEdit(tdTripKmAfter, {
        value: record.tripKmAfter ? String(record.tripKmAfter) : '',
        inputType: 'number',
        formatDisplay: formatKm,
        tableKey: TABLE_KEY,
        colKey: 'colFuelTripKmAfter',
        pending: isPending(record, 'tripKmAfter'),
        onCommit: (val) => { recomputeTripKm(); patchFuelRecord(record.id, { tripKmAfter: parseFloat(val) || 0 }); },
    });

    const tdCostPerLiter = textCell('colFuelCostPerLiter', formatCostPerLiter(
        (parseFloat(record.liters) || 0) > 0 ? (parseFloat(record.subtotal) || 0) / parseFloat(record.liters) : 0,
    ));
    function recomputeCostPerLiter() {
        const subtotal = parseFloat(subtotalCtrl.getValue()) || 0;
        const liters = parseFloat(litersCtrl.getValue()) || 0;
        tdCostPerLiter.textContent = formatCostPerLiter(liters > 0 ? subtotal / liters : 0);
    }

    const tdLiters = document.createElement('td');
    tdLiters.dataset.col = 'colFuelLiters';
    const litersCtrl = Dashboard.attachInlineEdit(tdLiters, {
        value: record.liters ? String(record.liters) : '',
        inputType: 'number',
        formatDisplay: formatLiters,
        tableKey: TABLE_KEY,
        colKey: 'colFuelLiters',
        pending: isPending(record, 'liters'),
        onCommit: (val) => { recomputeCostPerLiter(); patchFuelRecord(record.id, { liters: parseFloat(val) || 0 }); },
    });

    const tdSubtotal = document.createElement('td');
    tdSubtotal.dataset.col = 'colFuelSubtotal';
    const subtotalCtrl = Dashboard.attachInlineEdit(tdSubtotal, {
        value: record.subtotal ? String(record.subtotal) : '',
        inputType: 'number',
        formatDisplay: formatMoney,
        tableKey: TABLE_KEY,
        colKey: 'colFuelSubtotal',
        pending: isPending(record, 'subtotal'),
        onCommit: (val) => { recomputeTotal(); recomputeCostPerLiter(); patchFuelRecord(record.id, { subtotal: parseFloat(val) || 0 }); },
    });

    const tdVat = document.createElement('td');
    tdVat.dataset.col = 'colFuelVat';
    const vatCtrl = Dashboard.attachInlineEdit(tdVat, {
        value: record.vat ? String(record.vat) : '',
        inputType: 'number',
        formatDisplay: formatMoney,
        tableKey: TABLE_KEY,
        colKey: 'colFuelVat',
        pending: isPending(record, 'vat'),
        onCommit: (val) => { recomputeTotal(); patchFuelRecord(record.id, { vat: parseFloat(val) || 0 }); },
    });

    const { tdReason, tdTransfer, tdInternal } = buildReasonCells(record);

    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
    tr.dataset.recordDate = record.date;
    tr.append(
        textCell('colFuelDbId', record.dbId),
        textCell('colFuelRecordId', String(record.recordNumber)),
        textCell('colFuelDate', `${pad(day)}-${pad(month)}-${pad(year % 100)}`),
        textCell('colFuelYear', String(year)),
        textCell('colFuelMonth', MONTH_ABBR[lang][month - 1]),
        textCell('colFuelWeek', `Sem${weekOfYear(dateObj)}+${year}`),
        textCell('colFuelDayNum', String(day)),
        textCell('colFuelDayText', DAY_ABBR[lang][dateObj.getDay()]),
        textCell('colFuelEcoUnit', record.ecoUnit),
        tdPlates,
        textCell('colFuelDriver', record.driver),
        textCell('colFuelCoordinator', record.coordinator),
        buildTicketCell(record),
        tdTripKmBefore,
        tdTripKmAfter,
        tdTripKmTotal,
        buildFuelTypeCell(record),
        tdLiters,
        tdCostPerLiter,
        tdSubtotal,
        tdVat,
        tdTotal,
        tdReason,
        tdTransfer,
        tdInternal,
        buildActionsCell(record, tr),
    );
    // Row-editable legend (see Dashboard.js renderDataTableColumnControls) —
    // a row counts as "editable by you" if at least one of its cells ended
    // up unlocked: attachInlineEdit only adds the plain .editable-cell class
    // (no -locked/-disabled/-pending suffix) once it's already resolved
    // canEditField for that cell, and Motivo Carga/Tipo Combustible are raw
    // <select> elements outside attachInlineEdit that disable themselves the
    // same way — checking both after the row is fully built covers every
    // editable field on this table without re-deriving permissions here.
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell') || !!tr.querySelector('select:not(:disabled)'));
    return tr;
}

function getTbody() {
    return document.querySelector('[data-table-id="registro-combustible"] table.data-table').tBodies[0];
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
        const res = await fetch('/api/business/fuel-records', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { records } = await res.json();
        tbody.innerHTML = '';
        if (!records.length) { ensureEmptyState(); return; }
        records.forEach((record) => tbody.appendChild(buildRow(record)));
        applyFuelFilters();
    } catch (err) {
        console.error('Registro Combustible: failed to load records', err);
    }
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the fields mean).
// Client-side row hiding rather than a re-fetch: everything's already loaded
// and rendered, and re-applying after every refreshTable() keeps a filter
// active across inline edits instead of it silently resetting.
function getFuelFilterValues() {
    return {
        text: (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase(),
        dateFrom: document.getElementById('filter-date-from')?.value || '',
        dateTo: document.getElementById('filter-date-to')?.value || '',
        reason: document.getElementById('filter-reason')?.value || '',
    };
}
function fuelRowMatchesFilters(tr, filters) {
    if (filters.text) {
        const haystack = ['colFuelEcoUnit', 'colFuelPlates', 'colFuelDriver', 'colFuelCoordinator']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        if (!haystack.includes(filters.text)) return false;
    }
    if (filters.dateFrom && tr.dataset.recordDate < filters.dateFrom) return false;
    if (filters.dateTo && tr.dataset.recordDate > filters.dateTo) return false;
    if (filters.reason) {
        const select = tr.querySelector('[data-col="colFuelReason"] select');
        if ((select?.value || '') !== filters.reason) return false;
    }
    return true;
}
function applyFuelFilters() {
    const filters = getFuelFilterValues();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        tr.hidden = !fuelRowMatchesFilters(tr, filters);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFuelFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFuelFilters);

const newRecordModal = document.getElementById('new-record-modal');
const dateInput = document.getElementById('new-record-date');
const ecoUnitInput = document.getElementById('new-record-eco-unit');
const driverInput = document.getElementById('new-record-driver');
const coordinatorInput = document.getElementById('new-record-coordinator');
const newRecordError = document.getElementById('new-record-error');
const newRecordSaveBtn = document.getElementById('new-record-save');
const newRecordCancelBtn = document.getElementById('new-record-cancel');

function closeNewRecordModal() {
    newRecordModal.hidden = true;
}

function openNewRecordModal() {
    dateInput.value = '';
    ecoUnitInput.value = '';
    driverInput.value = '';
    coordinatorInput.value = '';
    newRecordError.hidden = true;
    newRecordModal.hidden = false;
    dateInput.focus();
}

async function saveNewRecord() {
    const missing = [dateInput, ecoUnitInput, driverInput, coordinatorInput].some((el) => !el.value.trim());
    if (missing) {
        newRecordError.textContent = Dashboard.t('login.fieldRequired');
        newRecordError.hidden = false;
        return;
    }
    newRecordError.hidden = true;
    newRecordSaveBtn.disabled = true;
    try {
        const res = await fetch('/api/business/fuel-records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                date: dateInput.value,
                ecoUnit: ecoUnitInput.value.trim(),
                driver: driverInput.value.trim(),
                coordinator: coordinatorInput.value.trim(),
            }),
        });
        if (!res.ok) throw new Error('save failed');
        const { record } = await res.json();
        const tbody = getTbody();
        const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
        if (emptyRow) emptyRow.remove();
        tbody.appendChild(buildRow(record));
        closeNewRecordModal();
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
    const wrapper = document.querySelector('[data-table-id="registro-combustible"]');
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
