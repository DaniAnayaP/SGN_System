// ---------------------------------------------------------------------------
// Mi Recurso Humano — same shell as every other dashboard page
// (Dashboard.initDashboard handles sidebar/i18n/settings/etc.), plus the
// page-specific "+ Nuevo Registro" button injected into this table's own
// zoom/pin/visibility toolbar (see Inicio-en.css .data-table-new-record-btn
// and Dashboard.js renderDataTableZoomControls — that toolbar is generic and
// shared by every .data-table, this button is not, so it's added here
// instead of in Dashboard.js).
//
// "+ Nuevo Registro" only asks for what actually identifies a new hire
// (Nombre completo, Puesto, Fecha de Ingreso, Departamento asignado) —
// everything else (Área, Correo, Teléfono, Estatus) starts empty and gets
// filled in later by clicking directly on that cell in the table (same
// attachInlineEdit pattern as Registro Combustible — see
// OpTransVolCombustible.js for the original).
//
// Persisted via /api/business/hr-workers (see server.js + db.js hr_workers
// table): POST on "+ Nuevo Registro", PATCH per field the moment an inline
// edit commits. This does NOT yet create an actual system user (that's the
// eventual goal per "los Usuarios se deben crear desde que se da de alta en
// Recursos Humanos" — a separate, bigger step once this screen's shape is
// confirmed).
// ---------------------------------------------------------------------------
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-rrhh-mi-recurso-humano' });
        if (!role) return;
        renderNewRecordButton();
        await loadWorkers();
    } catch (err) {
        console.error('Mi Recurso Humano failed to initialize:', err);
    }
})();

const DEPARTMENT_LABEL_KEYS = {
    'steering-committee': 'menu.steeringCommittee',
    'general-management': 'menu.generalManagement',
    'management-control': 'menu.managementControl',
    'supply-chain': 'menu.supplyChain',
    purchasing: 'menu.purchasing',
    commercial: 'menu.commercial',
    marketing: 'menu.marketing',
    'human-resources': 'menu.humanResources',
    accounting: 'menu.accounting',
    finance: 'menu.finance',
    certifications: 'menu.certifications',
};

function pad(n, len = 2) {
    return String(n).padStart(len, '0');
}

function textCell(key, value) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value || '—';
    return td;
}

async function patchWorker(id, patch) {
    try {
        const res = await fetch(`/api/business/hr-workers/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error('patch failed');
    } catch (err) {
        console.error('Mi Recurso Humano: failed to save change', err);
        alert(Dashboard.t('admin.saveError'));
    }
}

// Empty-state row shown when the table has zero workers — mirrors the
// static placeholder from OpRRHHMiRecursoHumano.html so deleting the last
// remaining row doesn't leave a headerless-looking empty tbody.
function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = 11;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

async function deleteWorker(id, tr) {
    if (!confirm(Dashboard.t('main.recordDeleteConfirm'))) return;
    try {
        const res = await fetch(`/api/business/hr-workers/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Mi Recurso Humano: failed to delete record', err);
        alert(Dashboard.t('admin.saveError'));
    }
}

function buildActionsCell(worker, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
    deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
    deleteBtn.title = Dashboard.t('admin.delete');
    deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
    deleteBtn.addEventListener('click', () => deleteWorker(worker.id, tr));
    td.appendChild(deleteBtn);
    return td;
}

// --- Inline cell editing (Área/Correo/Teléfono) ------------------------------
// Click a cell to turn it into an <input>; Enter or blur commits back to
// plain text, Escape discards. Same mechanism as Registro Combustible's
// attachInlineEdit — kept as its own copy here rather than a shared file
// since this is only the second screen using it; worth factoring out once a
// third one needs it too.
function attachInlineEdit(td, { value = '', inputType = 'text', onCommit } = {}) {
    let current = value;

    function renderDisplay() {
        td.innerHTML = '';
        td.classList.add('editable-cell');
        const span = document.createElement('span');
        const hasValue = current !== '' && current != null;
        span.className = hasValue ? 'editable-cell-value' : 'editable-cell-value editable-cell-placeholder';
        span.textContent = hasValue ? current : Dashboard.t('main.fuelAddValue');
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
}

// Estatus — a real <select>, always live in the cell (not click-to-edit),
// defaulting to Activo since a worker is, by definition, active the moment
// they're registered — still changeable inline afterwards.
function buildStatusCell(worker) {
    const td = document.createElement('td');
    td.dataset.col = 'colHrStatus';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    [['active', 'main.filterActive'], ['inactive', 'main.filterInactive']].forEach(([val, key]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = Dashboard.t(key);
        select.appendChild(opt);
    });
    select.value = worker.status || 'active';
    select.addEventListener('change', () => patchWorker(worker.id, { status: select.value }));
    td.appendChild(select);
    return td;
}

// Builds one <tr> from a worker record as returned by the API (GET, POST or
// freshly created) — the single source of truth for row markup.
function buildRow(worker) {
    const [year, month, day] = worker.startDate.split('-').map(Number);

    const tdArea = document.createElement('td');
    tdArea.dataset.col = 'colHrArea';
    attachInlineEdit(tdArea, { value: worker.area || '', onCommit: (val) => patchWorker(worker.id, { area: val }) });

    const tdEmail = document.createElement('td');
    tdEmail.dataset.col = 'colHrEmail';
    attachInlineEdit(tdEmail, { value: worker.email || '', inputType: 'email', onCommit: (val) => patchWorker(worker.id, { email: val }) });

    const tdPhone = document.createElement('td');
    tdPhone.dataset.col = 'colHrPhone';
    attachInlineEdit(tdPhone, { value: worker.phone || '', inputType: 'tel', onCommit: (val) => patchWorker(worker.id, { phone: val }) });

    const tr = document.createElement('tr');
    tr.dataset.recordId = String(worker.id);
    tr.append(
        textCell('colHrDbId', worker.dbId),
        textCell('colHrRecordId', String(worker.recordNumber)),
        textCell('colHrFullName', worker.fullName),
        textCell('colHrPosition', worker.position),
        textCell('colHrStartDate', `${pad(day)}/${pad(month)}/${year}`),
        textCell('colHrDepartment', Dashboard.t(DEPARTMENT_LABEL_KEYS[worker.department] || worker.department)),
        tdArea,
        tdEmail,
        tdPhone,
        buildStatusCell(worker),
        buildActionsCell(worker, tr),
    );
    return tr;
}

function getTbody() {
    return document.querySelector('[data-table-id="mi-recurso-humano"] table.data-table').tBodies[0];
}

async function loadWorkers() {
    try {
        const res = await fetch('/api/business/hr-workers', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { workers } = await res.json();
        if (!workers.length) return;
        const tbody = getTbody();
        const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
        if (emptyRow) emptyRow.remove();
        workers.forEach((worker) => tbody.appendChild(buildRow(worker)));
    } catch (err) {
        console.error('Mi Recurso Humano: failed to load records', err);
    }
}

const newRecordModal = document.getElementById('new-record-modal');
const fullNameInput = document.getElementById('new-record-full-name');
const positionInput = document.getElementById('new-record-position');
const startDateInput = document.getElementById('new-record-start-date');
const departmentSelect = document.getElementById('new-record-department');
const newRecordError = document.getElementById('new-record-error');
const newRecordSaveBtn = document.getElementById('new-record-save');
const newRecordCancelBtn = document.getElementById('new-record-cancel');

function closeNewRecordModal() {
    newRecordModal.hidden = true;
}

function openNewRecordModal() {
    fullNameInput.value = '';
    positionInput.value = '';
    startDateInput.value = '';
    departmentSelect.value = '';
    newRecordError.hidden = true;
    newRecordModal.hidden = false;
    fullNameInput.focus();
}

async function saveNewRecord() {
    const missing = [fullNameInput, positionInput, startDateInput, departmentSelect].some((el) => !el.value.trim());
    if (missing) {
        newRecordError.textContent = Dashboard.t('login.fieldRequired');
        newRecordError.hidden = false;
        return;
    }
    newRecordError.hidden = true;
    newRecordSaveBtn.disabled = true;
    try {
        const res = await fetch('/api/business/hr-workers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                fullName: fullNameInput.value.trim(),
                position: positionInput.value.trim(),
                startDate: startDateInput.value,
                department: departmentSelect.value,
            }),
        });
        if (!res.ok) throw new Error('save failed');
        const { worker } = await res.json();
        const tbody = getTbody();
        const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
        if (emptyRow) emptyRow.remove();
        tbody.appendChild(buildRow(worker));
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
    const wrapper = document.querySelector('[data-table-id="mi-recurso-humano"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newHireRecord">${Dashboard.t('main.newHireRecord')}</span>`;
    btn.addEventListener('click', openNewRecordModal);
    toolbar.prepend(btn);
}
