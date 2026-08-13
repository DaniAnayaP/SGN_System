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
        await loadRecords();
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
        if (!res.ok) throw new Error('patch failed');
    } catch (err) {
        console.error('Registro Combustible: failed to save change', err);
        alert(Dashboard.t('admin.saveError'));
    }
}

// --- Inline cell editing (Placas/Subtotal/IVA/consecutivos) ------------------
// Click a cell to turn it into an <input>; Enter or blur commits back to
// plain text, Escape discards. Returns a small controller so callers that
// need to react to a value (Total recompute) or toggle availability (the
// Motivo Carga <-> consecutivos relationship) can do so without re-querying
// the DOM.
function attachInlineEdit(td, { value = '', inputType = 'text', formatDisplay, onCommit, disabled = false, disabledText } = {}) {
    let current = value;
    let isDisabled = disabled;

    function renderDisplay() {
        td.innerHTML = '';
        td.classList.toggle('editable-cell', !isDisabled);
        td.classList.toggle('editable-cell-disabled', isDisabled);
        if (isDisabled) {
            td.textContent = disabledText ?? '—';
            return;
        }
        const span = document.createElement('span');
        const hasValue = current !== '' && current != null;
        span.className = hasValue ? 'editable-cell-value' : 'editable-cell-value editable-cell-placeholder';
        span.textContent = hasValue ? (formatDisplay ? formatDisplay(current) : current) : Dashboard.t('main.fuelAddValue');
        td.title = Dashboard.t('main.fuelClickToEdit');
        td.appendChild(span);
        td.onclick = enterEditMode;
    }

    function enterEditMode() {
        td.onclick = null;
        td.innerHTML = '';
        const input = document.createElement('input');
        input.type = inputType;
        input.className = 'editable-cell-input';
        input.value = current;
        if (inputType === 'number') { input.step = '0.01'; input.min = '0'; }
        td.appendChild(input);
        input.focus();
        input.select();
        const commit = () => {
            current = input.value;
            if (onCommit) onCommit(current);
            renderDisplay();
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') input.blur();
            if (event.key === 'Escape') renderDisplay();
        });
    }

    renderDisplay();
    return {
        getValue: () => current,
        setDisabled(next, text) {
            isDisabled = next;
            if (isDisabled) current = '';
            disabledText = text ?? disabledText;
            renderDisplay();
        },
    };
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
    tdReason.appendChild(select);

    const tdTransfer = document.createElement('td');
    tdTransfer.dataset.col = 'colFuelTransferService';
    const tdInternal = document.createElement('td');
    tdInternal.dataset.col = 'colFuelInternalMovement';

    const transferCtrl = attachInlineEdit(tdTransfer, {
        value: record.transferService || '',
        disabled: record.reason !== 'traslado',
        disabledText: 'N/A',
        onCommit: (val) => patchFuelRecord(record.id, { transferService: val }),
    });
    const internalCtrl = attachInlineEdit(tdInternal, {
        value: record.internalMovement || '',
        disabled: record.reason !== 'interno',
        disabledText: 'N/A',
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
    function render() {
        btn.innerHTML = `<i class="bx ${dataUrl ? 'bx-receipt' : 'bx-image-add'}" aria-hidden="true"></i>`;
        btn.setAttribute('aria-label', Dashboard.t(dataUrl ? 'main.colFuelTicketEvidence' : 'main.fuelUploadTicket'));
        btn.title = Dashboard.t(dataUrl ? 'main.colFuelTicketEvidence' : 'main.fuelUploadTicket');
    }
    btn.addEventListener('click', () => {
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
    attachInlineEdit(tdPlates, {
        value: record.plates || '',
        onCommit: (val) => patchFuelRecord(record.id, { plates: val }),
    });

    const tdSubtotal = document.createElement('td');
    tdSubtotal.dataset.col = 'colFuelSubtotal';
    const subtotalCtrl = attachInlineEdit(tdSubtotal, {
        value: record.subtotal ? String(record.subtotal) : '',
        inputType: 'number',
        formatDisplay: formatMoney,
        onCommit: (val) => { recomputeTotal(); patchFuelRecord(record.id, { subtotal: parseFloat(val) || 0 }); },
    });

    const tdVat = document.createElement('td');
    tdVat.dataset.col = 'colFuelVat';
    const vatCtrl = attachInlineEdit(tdVat, {
        value: record.vat ? String(record.vat) : '',
        inputType: 'number',
        formatDisplay: formatMoney,
        onCommit: (val) => { recomputeTotal(); patchFuelRecord(record.id, { vat: parseFloat(val) || 0 }); },
    });

    const { tdReason, tdTransfer, tdInternal } = buildReasonCells(record);

    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
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
        tdSubtotal,
        tdVat,
        tdTotal,
        tdReason,
        tdTransfer,
        tdInternal,
    );
    return tr;
}

function getTbody() {
    return document.querySelector('[data-table-id="registro-combustible"] table.data-table').tBodies[0];
}

async function loadRecords() {
    try {
        const res = await fetch('/api/business/fuel-records', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { records } = await res.json();
        if (!records.length) return;
        const tbody = getTbody();
        const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
        if (emptyRow) emptyRow.remove();
        records.forEach((record) => tbody.appendChild(buildRow(record)));
    } catch (err) {
        console.error('Registro Combustible: failed to load records', err);
    }
}

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
