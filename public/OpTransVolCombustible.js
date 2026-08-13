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

const MONTH_NAMES = {
    es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const DAY_NAMES = {
    es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

function generateBigDateId() {
    const d = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
}

const newRecordModal = document.getElementById('new-record-modal');
const newRecordDateInput = document.getElementById('new-record-date');
const newRecordWeekInput = document.getElementById('new-record-week');
const newRecordServiceTypeInput = document.getElementById('new-record-service-type');
const newRecordStatusSelect = document.getElementById('new-record-status');
const newRecordError = document.getElementById('new-record-error');
const newRecordSaveBtn = document.getElementById('new-record-save');
const newRecordCancelBtn = document.getElementById('new-record-cancel');

function closeNewRecordModal() {
    newRecordModal.hidden = true;
}

function openNewRecordModal() {
    newRecordDateInput.value = '';
    newRecordWeekInput.value = '';
    newRecordServiceTypeInput.value = '';
    newRecordStatusSelect.value = 'active';
    newRecordError.hidden = true;
    newRecordModal.hidden = false;
    newRecordDateInput.focus();
}

function textCell(key, value) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value || '—';
    return td;
}

function saveNewRecord() {
    if (!newRecordDateInput.value) {
        newRecordError.textContent = Dashboard.t('login.fieldRequired');
        newRecordError.hidden = false;
        return;
    }
    const lang = Dashboard.lang === 'es' ? 'es' : 'en';
    const [year, month, day] = newRecordDateInput.value.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);

    const table = document.querySelector('[data-table-id="registro-combustible"] table.data-table');
    const tbody = table.tBodies[0];
    const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
    if (emptyRow) emptyRow.remove();

    const recordNumber = tbody.querySelectorAll('tr').length + 1;
    const statusLabel = Dashboard.t(newRecordStatusSelect.value === 'inactive' ? 'main.filterInactive' : 'main.filterActive');

    const tr = document.createElement('tr');
    tr.append(
        textCell('colUniqueBigDate', generateBigDateId()),
        textCell('colRegistro', String(recordNumber)),
        textCell('colAnio', String(year)),
        textCell('colMes', MONTH_NAMES[lang][month - 1]),
        textCell('colDiaNum', String(day)),
        textCell('colDiaTexto', DAY_NAMES[lang][dateObj.getDay()]),
        textCell('colNoSemCobro', newRecordWeekInput.value),
        textCell('colFecha', newRecordDateInput.value.split('-').reverse().join('/')),
        textCell('colTipoServicios', newRecordServiceTypeInput.value),
        textCell('colEstatus', statusLabel),
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
