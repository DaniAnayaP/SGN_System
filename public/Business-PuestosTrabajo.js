// ---------------------------------------------------------------------------
// "Puestos de Trabajo" — Administración de Personal (human-resources área):
// the client's own catalog of job titles. Only 'active' ones show up in Mi
// Recurso Humano's Puesto dropdown (see OpRRHHMiRecursoHumano.js) — a
// position is deactivated, never deleted, so it never breaks the label on a
// worker already using it. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

const form = document.getElementById('jp-form');
const nameField = document.getElementById('jp-name');
const abbreviationField = document.getElementById('jp-abbreviation');
const statusField = document.getElementById('jp-status');
const errorBanner = document.getElementById('jp-form-error');
const submitBtn = document.getElementById('jp-form-submit');
const tableBody = document.getElementById('jp-table-body');
const emptyMsg = document.getElementById('jp-empty');

let jobPositions = [];
let costCenters = [];

async function loadCostCenters() {
    try {
        const res = await fetch('/api/business/cost-centers', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        costCenters = data.costCenters || [];
    } catch (err) {
        console.error('Puestos de Trabajo: failed to load cost centers', err);
        costCenters = [];
    }
}
// Centro Costos Habilitados — a Puesto can be enabled for one, several, or
// every active cost center (confirmed with the user), set from its own
// click-to-edit table column (see openCostCenterModal below), never from
// the creation form — a new Puesto always starts at "Todos" and gets
// narrowed down afterward, same reasoning as Mi Recurso Humano's own
// Departamento checklist column. "Todos" is a distinct scope value ('all',
// stored as-is) rather than "every box happens to be checked" — a newly
// created cost center should automatically be covered by a Puesto already
// set to "Todos", not left out until someone re-checks it by hand.
function parseCostCenterScope(raw) {
    if (!raw || raw === 'all') return 'all';
    try {
        const ids = JSON.parse(raw);
        return Array.isArray(ids) ? ids.map(Number) : 'all';
    } catch {
        return 'all';
    }
}
function buildCostCenterScopeChecklist(container, scope) {
    container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'hr-department-checklist-header';
    header.textContent = Dashboard.t('business.jobPositionCostCenters');
    container.appendChild(header);

    const isAll = scope === 'all';
    const selectedIds = new Set(Array.isArray(scope) ? scope : []);

    const allLabel = document.createElement('label');
    const allInput = document.createElement('input');
    allInput.type = 'checkbox';
    allInput.className = 'jp-cc-all-checkbox';
    allInput.checked = isAll;
    const allSpan = document.createElement('span');
    allSpan.textContent = Dashboard.t('main.filterAll');
    allLabel.append(allInput, allSpan);
    container.appendChild(allLabel);

    const individualInputs = [];
    costCenters.forEach((cc) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = cc.id;
        input.checked = isAll || selectedIds.has(cc.id);
        input.disabled = isAll;
        const span = document.createElement('span');
        span.textContent = `${cc.code} - ${cc.name}`;
        label.append(input, span);
        container.appendChild(label);
        individualInputs.push(input);
    });

    allInput.addEventListener('change', () => {
        individualInputs.forEach((input) => {
            input.disabled = allInput.checked;
            if (allInput.checked) input.checked = true;
        });
    });
}
// Returns 'all' or a (possibly empty — caller validates) array of ids.
function readCostCenterScope(container) {
    if (container.querySelector('.jp-cc-all-checkbox')?.checked) return 'all';
    return Array.from(container.querySelectorAll('input[type="checkbox"]:not(.jp-cc-all-checkbox):checked'))
        .map((input) => Number(input.value));
}
function costCenterScopeLabel(raw) {
    const scope = parseCostCenterScope(raw);
    if (scope === 'all') return Dashboard.t('main.filterAll');
    if (!scope.length) return '—';
    return scope
        .map((id) => costCenters.find((c) => c.id === id))
        .filter(Boolean)
        .map((cc) => cc.code)
        .join(', ') || '—';
}

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}
function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
}

function resetForm() {
    form.reset();
    statusField.value = 'active';
    clearError();
}

function renderJobPositions() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = jobPositions.length > 0;
    jobPositions.forEach((jp) => {
        const tr = document.createElement('tr');
        tr.dataset.status = jp.status;

        const tdName = document.createElement('td');
        tdName.dataset.col = 'jpName';
        tdName.textContent = jp.name;

        const tdAbbreviation = document.createElement('td');
        tdAbbreviation.dataset.col = 'jpAbbreviation';
        tdAbbreviation.textContent = jp.abbreviation || '—';

        // Centros de Costo Habilitados — click-to-edit, opens
        // jp-cost-center-modal (a plain text cell can't represent "more
        // than one selected" well), same pattern as Mi Recurso Humano's
        // own Departamento(s) column.
        const tdCostCenter = document.createElement('td');
        tdCostCenter.dataset.col = 'jpCostCenter';
        tdCostCenter.textContent = costCenterScopeLabel(jp.cost_center_scope);
        tdCostCenter.classList.add('editable-cell');
        tdCostCenter.title = Dashboard.t('main.fuelClickToEdit');
        tdCostCenter.onclick = () => openCostCenterModal(jp);

        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'jpStatus';
        const badge = document.createElement('span');
        badge.className = `admin-badge admin-badge-${jp.status === 'active' ? 'activo' : 'inactivo'}`;
        badge.textContent = Dashboard.t(jp.status === 'active' ? 'main.filterActive' : 'main.filterInactive');
        tdStatus.appendChild(badge);

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openChangeHistory('puestos-trabajo', jp.id));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => openEditModal(jp));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removeJobPosition(jp));
        tdActions.append(historyBtn, editBtn, deleteBtn);

        tr.append(tdName, tdAbbreviation, tdCostCenter, tdStatus, tdActions);
        tableBody.appendChild(tr);
    });
    applyJpFilters();
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the fields mean).
function applyJpFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    const status = document.getElementById('filter-status')?.value || '';
    tableBody.querySelectorAll('tr').forEach((tr) => {
        let visible = true;
        if (text) {
            const haystack = ['jpName', 'jpAbbreviation']
                .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
                .join(' ');
            if (!haystack.includes(text)) visible = false;
        }
        if (status && tr.dataset.status !== status) visible = false;
        tr.hidden = !visible;
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyJpFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyJpFilters);

async function removeJobPosition(jp) {
    if (!(await Dashboard.confirm(Dashboard.t('business.jobPositionDeleteConfirm')))) return;
    try {
        const res = await fetch(`/api/business/job-positions/${jp.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        jobPositions = jobPositions.filter((p) => p.id !== jp.id);
        renderJobPositions();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function loadJobPositions() {
    try {
        const res = await fetch('/api/business/job-positions', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        jobPositions = data.jobPositions || [];
        renderJobPositions();
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

// --- "Agregar puesto" — creation only; a new Puesto starts at cost-center
// scope 'all' (see createJobPosition's own default in db.js) and gets
// narrowed down afterward via the table column, not here.
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const name = nameField.value.trim();
    if (!name) {
        showError(Dashboard.t('admin.requiredFields'));
        return;
    }
    const abbreviation = abbreviationField.value.trim();
    const status = statusField.value;

    submitBtn.disabled = true;
    try {
        const res = await fetch('/api/business/job-positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, abbreviation, status }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            if (body.message === 'A job position with that name already exists.') {
                showError(Dashboard.t('business.jobPositionNameExists'));
            } else {
                showError(body.message || Dashboard.t('admin.saveError'));
            }
            return;
        }
        const { jobPosition } = await res.json();
        jobPositions = [...jobPositions, jobPosition].sort((a, b) => a.name.localeCompare(b.name));
        renderJobPositions();
        resetForm();
        Dashboard.showToast(Dashboard.t('main.recordSaved'), 'success');
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

// --- Editar Puesto — a real modal (pantalla alterna) opened from the
// pencil icon, instead of reusing/scrolling to the creation form above.
// Only Nombre/Abrev/Estatus live here; Centros de Costo Habilitados has
// its own modal below.
const editModal = document.getElementById('jp-edit-modal');
const editIdField = document.getElementById('jp-edit-id');
const editNameField = document.getElementById('jp-edit-name');
const editAbbreviationField = document.getElementById('jp-edit-abbreviation');
const editStatusField = document.getElementById('jp-edit-status');
const editError = document.getElementById('jp-edit-error');
const editSaveBtn = document.getElementById('jp-edit-save');
const editCancelBtn = document.getElementById('jp-edit-cancel');

function openEditModal(jp) {
    editIdField.value = jp.id;
    editNameField.value = jp.name;
    editAbbreviationField.value = jp.abbreviation || '';
    editStatusField.value = jp.status;
    editError.hidden = true;
    editModal.hidden = false;
}
function closeEditModal() {
    editModal.hidden = true;
}
async function saveEditModal() {
    const name = editNameField.value.trim();
    if (!name) {
        editError.textContent = Dashboard.t('admin.requiredFields');
        editError.hidden = false;
        return;
    }
    editSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/business/job-positions/${editIdField.value}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                name, abbreviation: editAbbreviationField.value.trim(), status: editStatusField.value,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            editError.textContent = body.message === 'A job position with that name already exists.'
                ? Dashboard.t('business.jobPositionNameExists')
                : (body.message || Dashboard.t('admin.saveError'));
            editError.hidden = false;
            return;
        }
        const { jobPosition } = await res.json();
        jobPositions = jobPositions.map((p) => (p.id === jobPosition.id ? jobPosition : p));
        renderJobPositions();
        closeEditModal();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        editError.textContent = Dashboard.t('admin.saveError');
        editError.hidden = false;
    } finally {
        editSaveBtn.disabled = false;
    }
}
editSaveBtn.addEventListener('click', saveEditModal);
editCancelBtn.addEventListener('click', closeEditModal);
editModal.addEventListener('click', (event) => {
    if (event.target === editModal) closeEditModal();
});

// --- Centros de Costo Habilitados — click-to-edit modal from the table
// column.
const ccModal = document.getElementById('jp-cost-center-modal');
const ccModalList = document.getElementById('jp-cost-center-modal-list');
const ccModalError = document.getElementById('jp-cost-center-modal-error');
const ccModalSaveBtn = document.getElementById('jp-cost-center-modal-save');
const ccModalCancelBtn = document.getElementById('jp-cost-center-modal-cancel');
let editingCostCenterJpId = null;

function openCostCenterModal(jp) {
    editingCostCenterJpId = jp.id;
    buildCostCenterScopeChecklist(ccModalList, parseCostCenterScope(jp.cost_center_scope));
    ccModalError.hidden = true;
    ccModal.hidden = false;
}
function closeCostCenterModal() {
    ccModal.hidden = true;
    editingCostCenterJpId = null;
}
async function saveCostCenterModal() {
    const costCenterScope = readCostCenterScope(ccModalList);
    if (Array.isArray(costCenterScope) && !costCenterScope.length) {
        ccModalError.textContent = Dashboard.t('business.jobPositionCostCentersRequired');
        ccModalError.hidden = false;
        return;
    }
    ccModalSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/business/job-positions/${editingCostCenterJpId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ costCenterScope }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            ccModalError.textContent = body.message || Dashboard.t('admin.saveError');
            ccModalError.hidden = false;
            return;
        }
        const { jobPosition } = await res.json();
        jobPositions = jobPositions.map((p) => (p.id === jobPosition.id ? jobPosition : p));
        renderJobPositions();
        closeCostCenterModal();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        ccModalError.textContent = Dashboard.t('admin.saveError');
        ccModalError.hidden = false;
    } finally {
        ccModalSaveBtn.disabled = false;
    }
}
ccModalSaveBtn.addEventListener('click', saveCostCenterModal);
ccModalCancelBtn.addEventListener('click', closeCostCenterModal);
ccModal.addEventListener('click', (event) => {
    if (event.target === ccModal) closeCostCenterModal();
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!editModal.hidden) closeEditModal();
    if (!ccModal.hidden) closeCostCenterModal();
});

document.addEventListener('dashboard:language-changed', renderJobPositions);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-catalogos-puestos-trabajo' });
        if (!role) return;
        await loadCostCenters();
        await loadJobPositions();
    } catch (err) {
        console.error('Business (Puestos de Trabajo) failed to initialize:', err);
    }
})();
