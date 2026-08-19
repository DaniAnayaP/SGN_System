// ---------------------------------------------------------------------------
// Mi Recurso Humano — same shell as every other dashboard page
// (Dashboard.initDashboard handles sidebar/i18n/settings/etc.), plus the
// page-specific "+ Nuevo Registro" button injected into this table's own
// zoom/pin/visibility toolbar (see Inicio-en.css .data-table-new-record-btn
// and Dashboard.js renderDataTableZoomControls — that toolbar is generic and
// shared by every .data-table, this button is not, so it's added here
// instead of in Dashboard.js).
//
// "+ Nuevo Registro" asks for Nombre(s)/Apellidos (separate, not one "Nombre
// Completo" — the auto-generated username needs to know exactly which words
// are given names vs. apellidos), Correo, Puesto, Fecha de Ingreso, and at
// least one Departamento; Centro de Costos is optional. Teléfono and Estatus
// still start empty and get filled in later from the table row.
//
// Persisted via /api/business/hr-workers (see server.js + db.js hr_workers
// table): POST on "+ Nuevo Registro" ALSO creates this worker's own login
// account in the same step (see createHrWorker in db.js) — inactive, with
// an auto-generated username, until "Activar" is clicked from the Estado de
// Usuario column (POST .../activate-user), which is the only place a real,
// usable password ever gets issued (shown once). Business-Usuarios.html no
// longer creates users directly — this screen is the only place that
// happens now.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-rrhh-mi-recurso-humano' });
        if (!role) return;
        renderNewRecordButton();
        await Promise.all([loadCostCenters(), loadJobPositions()]);
        await refreshTable();
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
const DEPARTMENT_OPTIONS = Object.entries(DEPARTMENT_LABEL_KEYS).map(([value, labelKey]) => ({ value, labelKey }));

function pad(n, len = 2) {
    return String(n).padStart(len, '0');
}

function textCell(key, value) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value || '—';
    return td;
}

const TABLE_KEY = 'mi-recurso-humano';

// Whether `key` (a PATCH bodyKey, e.g. "area") has an outstanding approval
// request on this specific worker — comes straight from the server's GET
// response (see getPendingColumnsByRecord in db.js), never decided
// client-side.
function isPending(worker, key) {
    return (worker.pendingFields || []).includes(key);
}

async function patchWorker(id, patch) {
    try {
        const res = await fetch(`/api/business/hr-workers/${id}`, {
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
        await refreshTable();
    } catch (err) {
        console.error('Mi Recurso Humano: failed to save change', err);
        alert(Dashboard.t('admin.saveError'));
        await refreshTable();
    }
}

// --- Centros de Costo (for the Cost Center column/field — reused catalog,
// not owned by this screen) --------------------------------------------
let costCenters = [];
async function loadCostCenters() {
    try {
        const res = await fetch('/api/business/cost-centers', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        costCenters = data.costCenters || [];
    } catch (err) {
        console.error('Mi Recurso Humano: failed to load cost centers', err);
        costCenters = [];
    }
}
function populateCostCenterSelect(select, selectedId) {
    select.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = Dashboard.t('main.hrNoCostCenter');
    select.appendChild(noneOpt);
    costCenters.forEach((cc) => {
        const opt = document.createElement('option');
        opt.value = cc.id;
        opt.textContent = `${cc.code} - ${cc.name}`;
        select.appendChild(opt);
    });
    select.value = selectedId ? String(selectedId) : '';
}

// --- Puestos de Trabajo (for the Puesto field — reused catalog, managed
// from Business-PuestosTrabajo.html, not owned by this screen). Only
// 'active' positions are offered here — a retired one stays on whichever
// worker already had it (position isn't inline-editable after creation),
// it just stops being selectable for anyone new.
let jobPositions = [];
async function loadJobPositions() {
    try {
        const res = await fetch('/api/business/job-positions', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        jobPositions = (data.jobPositions || []).filter((jp) => jp.status === 'active');
    } catch (err) {
        console.error('Mi Recurso Humano: failed to load job positions', err);
        jobPositions = [];
    }
}
function populateJobPositionSelect(select) {
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = Dashboard.t('main.fuelSelectReason');
    select.appendChild(placeholder);
    jobPositions.forEach((jp) => {
        const opt = document.createElement('option');
        opt.value = jp.name;
        opt.textContent = jp.name;
        select.appendChild(opt);
    });
}

// --- Departamento(s) Asignado(s) — multi-select checklist, shared by the
// "+ Nuevo Registro" modal and the click-to-edit modal on an existing row.
function buildDepartmentChecklist(container, selectedValues) {
    container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'hr-department-checklist-header';
    header.textContent = Dashboard.t('main.colHrDepartment');
    container.appendChild(header);
    const selected = new Set(selectedValues || []);
    DEPARTMENT_OPTIONS.forEach((opt) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = opt.value;
        input.checked = selected.has(opt.value);
        const span = document.createElement('span');
        span.textContent = Dashboard.t(opt.labelKey);
        label.append(input, span);
        container.appendChild(label);
    });
}
function getChecklistValues(container) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
}
function formatDepartments(departments) {
    if (!departments || !departments.length) return '—';
    return departments.map((d) => Dashboard.t(DEPARTMENT_LABEL_KEYS[d] || d)).join(', ');
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
    td.colSpan = 14;
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
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'admin-icon-btn';
    historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
    historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
    historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    historyBtn.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, worker.id));
    td.appendChild(historyBtn);
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

// Estatus — a real <select>, always live in the cell (not click-to-edit),
// defaulting to Activo since a worker is, by definition, active the moment
// they're registered — still changeable inline afterwards. Flipping this to
// Inactivo also revokes the worker's own login (see updateHrWorker's status
// cascade in db.js) — the row refresh after the PATCH picks up the new
// Estado de Usuario automatically.
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
    select.disabled = isPending(worker, 'status') || !Dashboard.canEditField(TABLE_KEY, 'colHrStatus', worker.status || '');
    if (select.disabled) select.title = Dashboard.t(isPending(worker, 'status') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => patchWorker(worker.id, { status: select.value }));
    td.appendChild(select);
    return td;
}

// Departamento(s) — click-to-edit, opens edit-departments-modal (a plain
// text cell can't represent "more than one selected" well, so this isn't
// the usual attachInlineEdit text-input pattern).
function buildDepartmentCell(worker) {
    const td = document.createElement('td');
    td.dataset.col = 'colHrDepartment';
    td.textContent = formatDepartments(worker.departments);
    const editable = Dashboard.canEditField(TABLE_KEY, 'colHrDepartment', (worker.departments || []).join(','));
    if (isPending(worker, 'departments')) {
        td.classList.add('editable-cell-pending');
        td.title = Dashboard.t('main.changePending');
    } else if (!editable) {
        td.classList.add('editable-cell-locked');
        td.title = Dashboard.t('main.fieldLocked');
    } else {
        td.classList.add('editable-cell');
        td.title = Dashboard.t('main.fuelClickToEdit');
        td.onclick = () => openEditDepartmentsModal(worker);
    }
    return td;
}

// Centro de Costos — a real <select>, always live in the cell, same pattern
// as Estatus/Tipo Combustible elsewhere in this app.
function buildCostCenterCell(worker) {
    const td = document.createElement('td');
    td.dataset.col = 'colHrCostCenter';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    populateCostCenterSelect(select, worker.costCenterId);
    select.disabled = isPending(worker, 'costCenterId') || !Dashboard.canEditField(TABLE_KEY, 'colHrCostCenter', worker.costCenterId ? String(worker.costCenterId) : '');
    if (select.disabled) select.title = Dashboard.t(isPending(worker, 'costCenterId') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => patchWorker(worker.id, { costCenterId: select.value ? Number(select.value) : null }));
    td.appendChild(select);
    return td;
}

// Usuario / Estado de Usuario — the login account auto-created alongside
// this worker (see createHrWorker). Estado de Usuario shows Activo/
// Inactivo plus an "Activar" icon that issues a brand-new password (see
// activateHrWorkerUser) — the only place that ever happens, shown exactly
// once in hr-credentials-modal.
function buildUserStatusCell(worker) {
    const td = document.createElement('td');
    td.dataset.col = 'colHrUserStatus';
    const badge = document.createElement('span');
    badge.className = `admin-badge admin-badge-${worker.userActive ? 'activo' : 'inactivo'}`;
    badge.textContent = Dashboard.t(worker.userActive ? 'main.filterActive' : 'main.filterInactive');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-icon-btn';
    btn.innerHTML = `<i class="bx ${worker.userActive ? 'bx-key' : 'bx-check-shield'}" aria-hidden="true"></i>`;
    btn.setAttribute('aria-label', Dashboard.t(worker.userActive ? 'main.hrResetPassword' : 'main.hrActivateUser'));
    btn.title = Dashboard.t(worker.userActive ? 'main.hrResetPassword' : 'main.hrActivateUser');
    btn.addEventListener('click', () => activateWorkerUser(worker.id));
    td.append(badge, btn);
    return td;
}

// Builds one <tr> from a worker record as returned by the API (GET, POST or
// freshly created) — the single source of truth for row markup.
function buildRow(worker) {
    const [year, month, day] = worker.startDate.split('-').map(Number);

    const tdArea = document.createElement('td');
    tdArea.dataset.col = 'colHrArea';
    Dashboard.attachInlineEdit(tdArea, {
        value: worker.area || '', tableKey: TABLE_KEY, colKey: 'colHrArea',
        pending: isPending(worker, 'area'),
        onCommit: (val) => patchWorker(worker.id, { area: val }),
    });

    const tdEmail = document.createElement('td');
    tdEmail.dataset.col = 'colHrEmail';
    Dashboard.attachInlineEdit(tdEmail, {
        value: worker.email || '', inputType: 'email', tableKey: TABLE_KEY, colKey: 'colHrEmail',
        pending: isPending(worker, 'email'),
        onCommit: (val) => patchWorker(worker.id, { email: val }),
    });

    const tdPhone = document.createElement('td');
    tdPhone.dataset.col = 'colHrPhone';
    Dashboard.attachInlineEdit(tdPhone, {
        value: worker.phone || '', inputType: 'tel', tableKey: TABLE_KEY, colKey: 'colHrPhone',
        pending: isPending(worker, 'phone'),
        onCommit: (val) => patchWorker(worker.id, { phone: val }),
    });

    const tr = document.createElement('tr');
    tr.dataset.recordId = String(worker.id);
    tr.dataset.departments = JSON.stringify(worker.departments || []);
    tr.dataset.status = worker.status || 'active';
    tr.append(
        textCell('colHrDbId', worker.dbId),
        textCell('colHrRecordId', String(worker.recordNumber)),
        textCell('colHrFullName', worker.fullName),
        textCell('colHrPosition', worker.position),
        textCell('colHrStartDate', `${pad(day)}/${pad(month)}/${year}`),
        buildDepartmentCell(worker),
        tdArea,
        buildCostCenterCell(worker),
        tdEmail,
        tdPhone,
        buildStatusCell(worker),
        textCell('colHrUsername', worker.username),
        buildUserStatusCell(worker),
        buildActionsCell(worker, tr),
    );
    // Row-editable legend (see Dashboard.js renderDataTableColumnControls) —
    // same reasoning as OpTransVolCombustible.js: a row counts as editable
    // if attachInlineEdit resolved at least one cell as unlocked, or a
    // <select>/click-to-edit cell isn't disabled/locked.
    tr.classList.toggle(
        'data-table-row-editable',
        !!tr.querySelector('td.editable-cell') || !!tr.querySelector('select:not(:disabled)'),
    );
    return tr;
}

function getTbody() {
    return document.querySelector('[data-table-id="mi-recurso-humano"] table.data-table').tBodies[0];
}

async function refreshTable() {
    // Skip while the user has an <input> open in a different cell — this now
    // runs after every patch (not just failures), see OpTransVolCombustible.js's
    // refreshTable for the full rationale.
    const tbody = getTbody();
    if (tbody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    try {
        const res = await fetch('/api/business/hr-workers', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { workers } = await res.json();
        tbody.innerHTML = '';
        if (!workers.length) { ensureEmptyState(); return; }
        workers.forEach((worker) => tbody.appendChild(buildRow(worker)));
        applyHrFilters();
    } catch (err) {
        console.error('Mi Recurso Humano: failed to load records', err);
    }
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the fields mean).
// Client-side row hiding, re-applied after every refreshTable() so a filter
// stays active across inline edits instead of silently resetting.
function getHrFilterValues() {
    return {
        text: (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase(),
        department: document.getElementById('filter-department')?.value || '',
        status: document.getElementById('filter-status')?.value || '',
    };
}
function hrRowMatchesFilters(tr, filters) {
    if (filters.text) {
        const haystack = ['colHrFullName', 'colHrPosition', 'colHrEmail', 'colHrPhone']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        if (!haystack.includes(filters.text)) return false;
    }
    if (filters.department) {
        const departments = JSON.parse(tr.dataset.departments || '[]');
        if (!departments.includes(filters.department)) return false;
    }
    if (filters.status && tr.dataset.status !== filters.status) return false;
    return true;
}
function applyHrFilters() {
    const filters = getHrFilterValues();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        tr.hidden = !hrRowMatchesFilters(tr, filters);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyHrFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyHrFilters);

// --- "+ Nuevo Registro" ---------------------------------------------------
const newRecordModal = document.getElementById('new-record-modal');
const givenNamesInput = document.getElementById('new-record-given-names');
const surnamesInput = document.getElementById('new-record-surnames');
const emailInput = document.getElementById('new-record-email');
const positionInput = document.getElementById('new-record-position');
const startDateInput = document.getElementById('new-record-start-date');
const costCenterSelect = document.getElementById('new-record-cost-center');
const departmentsChecklist = document.getElementById('new-record-departments');
const newRecordError = document.getElementById('new-record-error');
const newRecordSaveBtn = document.getElementById('new-record-save');
const newRecordCancelBtn = document.getElementById('new-record-cancel');

function closeNewRecordModal() {
    newRecordModal.hidden = true;
}

function openNewRecordModal() {
    givenNamesInput.value = '';
    surnamesInput.value = '';
    emailInput.value = '';
    populateJobPositionSelect(positionInput);
    startDateInput.value = '';
    populateCostCenterSelect(costCenterSelect, null);
    buildDepartmentChecklist(departmentsChecklist, []);
    newRecordError.hidden = true;
    newRecordModal.hidden = false;
    givenNamesInput.focus();
}

async function saveNewRecord() {
    const departments = getChecklistValues(departmentsChecklist);
    const missing = [givenNamesInput, surnamesInput, emailInput, positionInput, startDateInput].some((el) => !el.value.trim())
        || !departments.length;
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
                givenNames: givenNamesInput.value.trim(),
                surnames: surnamesInput.value.trim(),
                email: emailInput.value.trim(),
                position: positionInput.value.trim(),
                startDate: startDateInput.value,
                departments,
                costCenterId: costCenterSelect.value ? Number(costCenterSelect.value) : null,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            newRecordError.textContent = body.message || Dashboard.t('admin.saveError');
            newRecordError.hidden = false;
            return;
        }
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

// --- Departamento(s) click-to-edit ----------------------------------------
const editDepartmentsModal = document.getElementById('edit-departments-modal');
const editDepartmentsList = document.getElementById('edit-departments-list');
const editDepartmentsError = document.getElementById('edit-departments-error');
const editDepartmentsSaveBtn = document.getElementById('edit-departments-save');
const editDepartmentsCancelBtn = document.getElementById('edit-departments-cancel');
let editingDepartmentsWorkerId = null;

function openEditDepartmentsModal(worker) {
    editingDepartmentsWorkerId = worker.id;
    buildDepartmentChecklist(editDepartmentsList, worker.departments || []);
    editDepartmentsError.hidden = true;
    editDepartmentsModal.hidden = false;
}
function closeEditDepartmentsModal() {
    editDepartmentsModal.hidden = true;
    editingDepartmentsWorkerId = null;
}
editDepartmentsCancelBtn.addEventListener('click', closeEditDepartmentsModal);
editDepartmentsModal.addEventListener('click', (event) => {
    if (event.target === editDepartmentsModal) closeEditDepartmentsModal();
});
editDepartmentsSaveBtn.addEventListener('click', async () => {
    const departments = getChecklistValues(editDepartmentsList);
    if (!departments.length) {
        editDepartmentsError.textContent = Dashboard.t('login.fieldRequired');
        editDepartmentsError.hidden = false;
        return;
    }
    editDepartmentsSaveBtn.disabled = true;
    try {
        await patchWorker(editingDepartmentsWorkerId, { departments });
        closeEditDepartmentsModal();
    } finally {
        editDepartmentsSaveBtn.disabled = false;
    }
});

// --- Activar Usuario / credenciales generadas -----------------------------
const credentialsModal = document.getElementById('hr-credentials-modal');
const credentialsUsername = document.getElementById('hr-credentials-username');
const credentialsPassword = document.getElementById('hr-credentials-password');
const credentialsCloseBtn = document.getElementById('hr-credentials-close');

async function activateWorkerUser(workerId) {
    try {
        const res = await fetch(`/api/business/hr-workers/${workerId}/activate-user`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            alert(body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const { generated } = await res.json();
        credentialsUsername.textContent = generated.username;
        credentialsPassword.textContent = generated.password;
        credentialsModal.hidden = false;
        await refreshTable();
    } catch (err) {
        console.error('Mi Recurso Humano: failed to activate user', err);
        alert(Dashboard.t('admin.saveError'));
    }
}
credentialsCloseBtn.addEventListener('click', () => { credentialsModal.hidden = true; });
credentialsModal.addEventListener('click', (event) => {
    if (event.target === credentialsModal) credentialsModal.hidden = true;
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
