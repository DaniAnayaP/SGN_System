// ---------------------------------------------------------------------------
// Registro Combustible — same shell as every other dashboard page
// (Dashboard.initDashboard handles sidebar/i18n/settings/etc.), plus the
// page-specific "+ Nuevo Registro" button injected into this table's own
// zoom/pin/visibility toolbar (see Inicio-en.css .data-table-new-record-btn
// and Dashboard.js renderDataTableZoomControls — that toolbar is generic and
// shared by every .data-table, this button is not, so it's added here
// instead of in Dashboard.js).
//
// There is no backend table/API for fuel records yet — Guardar appends a row
// to THIS table only (client-side), which is enough to exercise the shared
// column reorder/pin/hide/resize/zoom features against real rows instead of
// just the empty-state placeholder. It does not persist across a reload.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-transporte-vol-combustible' });
        if (!role) return;
        renderNewRecordButton();
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

function generateUniqueId() {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
}

// Not ISO-8601 strict (doesn't handle the Dec 29-31 / Jan 1-3 edge weeks
// specially) — good enough for "which week of the year is this", which is
// all # Semana needs.
function weekOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - start) / 86400000);
    return Math.ceil((days + start.getDay() + 1) / 7);
}

const newRecordModal = document.getElementById('new-record-modal');
const dateInput = document.getElementById('new-record-date');
const ecoUnitInput = document.getElementById('new-record-eco-unit');
const platesInput = document.getElementById('new-record-plates');
const driverInput = document.getElementById('new-record-driver');
const coordinatorInput = document.getElementById('new-record-coordinator');
const ticketInput = document.getElementById('new-record-ticket');
const subtotalInput = document.getElementById('new-record-subtotal');
const vatInput = document.getElementById('new-record-vat');
const totalInput = document.getElementById('new-record-total');
const reasonSelect = document.getElementById('new-record-reason');
const transferServiceInput = document.getElementById('new-record-transfer-service');
const internalMovementInput = document.getElementById('new-record-internal-movement');
const newRecordError = document.getElementById('new-record-error');
const newRecordSaveBtn = document.getElementById('new-record-save');
const newRecordCancelBtn = document.getElementById('new-record-cancel');

function formatMoney(n) {
    return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function updateTotal() {
    totalInput.value = formatMoney((parseFloat(subtotalInput.value) || 0) + (parseFloat(vatInput.value) || 0));
}
subtotalInput.addEventListener('input', updateTotal);
vatInput.addEventListener('input', updateTotal);

// Motivo carga is mutually exclusive with its two consecutivo fields — only
// the one matching the selected reason is editable, the other locks with
// N/A (see updateReasonFields / how the table cells read it in
// saveNewRecord below).
function updateReasonFields() {
    const isTraslado = reasonSelect.value === 'traslado';
    transferServiceInput.disabled = !isTraslado;
    internalMovementInput.disabled = isTraslado;
    if (!isTraslado) transferServiceInput.value = '';
    if (isTraslado) internalMovementInput.value = '';
}
reasonSelect.addEventListener('change', updateReasonFields);

function closeNewRecordModal() {
    newRecordModal.hidden = true;
}

function openNewRecordModal() {
    dateInput.value = '';
    ecoUnitInput.value = '';
    platesInput.value = '';
    driverInput.value = '';
    coordinatorInput.value = '';
    ticketInput.value = '';
    subtotalInput.value = '';
    vatInput.value = '';
    reasonSelect.value = 'traslado';
    transferServiceInput.value = '';
    internalMovementInput.value = '';
    updateTotal();
    updateReasonFields();
    newRecordError.hidden = true;
    newRecordModal.hidden = false;
    dateInput.focus();
}

function textCell(key, value) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value || '—';
    return td;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function saveNewRecord() {
    if (!dateInput.value) {
        newRecordError.textContent = Dashboard.t('login.fieldRequired');
        newRecordError.hidden = false;
        return;
    }
    newRecordError.hidden = true;

    const lang = Dashboard.lang === 'es' ? 'es' : 'en';
    const [year, month, day] = dateInput.value.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const isTraslado = reasonSelect.value === 'traslado';

    let ticketDataUrl = null;
    if (ticketInput.files?.[0]) {
        try {
            ticketDataUrl = await readFileAsDataUrl(ticketInput.files[0]);
        } catch {
            ticketDataUrl = null;
        }
    }

    const table = document.querySelector('[data-table-id="registro-combustible"] table.data-table');
    const tbody = table.tBodies[0];
    const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
    if (emptyRow) emptyRow.remove();

    const recordNumber = tbody.querySelectorAll('tr').length + 1;
    const subtotal = parseFloat(subtotalInput.value) || 0;
    const vat = parseFloat(vatInput.value) || 0;

    const tdTicket = document.createElement('td');
    tdTicket.dataset.col = 'colFuelTicketEvidence';
    const ticketBtn = document.createElement('button');
    ticketBtn.type = 'button';
    ticketBtn.className = 'admin-icon-btn';
    ticketBtn.innerHTML = `<i class="bx ${ticketDataUrl ? 'bx-receipt' : 'bx-image'}" aria-hidden="true"></i>`;
    ticketBtn.disabled = !ticketDataUrl;
    ticketBtn.setAttribute('aria-label', Dashboard.t('main.colFuelTicketEvidence'));
    if (ticketDataUrl) {
        ticketBtn.addEventListener('click', () => window.open(ticketDataUrl, '_blank'));
    } else {
        ticketBtn.title = Dashboard.t('main.fuelNoTicket');
    }
    tdTicket.appendChild(ticketBtn);

    const tr = document.createElement('tr');
    tr.append(
        textCell('colFuelDbId', generateUniqueId()),
        textCell('colFuelRecordId', String(recordNumber)),
        textCell('colFuelDate', `${pad(day)}-${pad(month)}-${pad(year % 100)}`),
        textCell('colFuelYear', String(year)),
        textCell('colFuelMonth', MONTH_ABBR[lang][month - 1]),
        textCell('colFuelWeek', `Sem${weekOfYear(dateObj)}+${year}`),
        textCell('colFuelDayNum', String(day)),
        textCell('colFuelDayText', DAY_ABBR[lang][dateObj.getDay()]),
        textCell('colFuelEcoUnit', ecoUnitInput.value),
        textCell('colFuelPlates', platesInput.value),
        textCell('colFuelDriver', driverInput.value),
        textCell('colFuelCoordinator', coordinatorInput.value),
        tdTicket,
        textCell('colFuelSubtotal', formatMoney(subtotal)),
        textCell('colFuelVat', formatMoney(vat)),
        textCell('colFuelTotal', formatMoney(subtotal + vat)),
        textCell('colFuelReason', Dashboard.t(isTraslado ? 'main.colFuelTransferService' : 'main.colFuelInternalMovement')),
        textCell('colFuelTransferService', isTraslado ? transferServiceInput.value : 'N/A'),
        textCell('colFuelInternalMovement', isTraslado ? 'N/A' : internalMovementInput.value),
    );
    tbody.appendChild(tr);
    closeNewRecordModal();
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
