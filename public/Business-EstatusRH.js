// ---------------------------------------------------------------------------
// "Estatus RH" — Administración de Personal (human-resources área): the
// client's own catalog of HR status options (Activo, De vacaciones,
// Rescisión de Contrato...), each carrying its own "Efecto en Estatus
// Operativo" (Activo/Suspendido/Inactivo) so Mi Recurso Humano's Estatus
// column and Accesos y Permisos' derived Estatus Operativo column both stay
// correct without any code change when a client adds a new status later.
// Only 'active' entries show up in Mi Recurso Humano's Estatus dropdown
// (see OpRRHHMiRecursoHumano.js) — an entry is deactivated, never deleted,
// so it never breaks the label on a worker already using it. Shell comes
// from Dashboard.js.
// ---------------------------------------------------------------------------

const form = document.getElementById('hs-form');
const nameField = document.getElementById('hs-name');
const effectField = document.getElementById('hs-effect');
const statusField = document.getElementById('hs-status');
const errorBanner = document.getElementById('hs-form-error');
const submitBtn = document.getElementById('hs-form-submit');
const tableBody = document.getElementById('hs-table-body');
const emptyMsg = document.getElementById('hs-empty');

let hrStatuses = [];

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
    effectField.value = 'suspended';
    statusField.value = 'active';
    clearError();
}

function effectBadgeClass(effect) {
    if (effect === 'active') return 'admin-badge-activo';
    if (effect === 'inactive') return 'admin-badge-inactivo';
    return 'admin-badge-suspendido';
}
function effectLabelKey(effect) {
    if (effect === 'active') return 'business.hrStatusEffectActive';
    if (effect === 'inactive') return 'business.hrStatusEffectInactive';
    return 'business.hrStatusEffectSuspended';
}

function renderHrStatuses() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = hrStatuses.length > 0;
    hrStatuses.forEach((hs) => {
        const tr = document.createElement('tr');
        tr.dataset.status = hs.status;

        const tdName = document.createElement('td');
        tdName.dataset.col = 'hsName';
        tdName.textContent = hs.name;

        const tdEffect = document.createElement('td');
        tdEffect.dataset.col = 'hsEffect';
        const effectBadge = document.createElement('span');
        effectBadge.className = `admin-badge ${effectBadgeClass(hs.operational_effect)}`;
        effectBadge.textContent = Dashboard.t(effectLabelKey(hs.operational_effect));
        tdEffect.appendChild(effectBadge);

        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'hsStatus';
        const statusBadge = document.createElement('span');
        statusBadge.className = `admin-badge admin-badge-${hs.status === 'active' ? 'activo' : 'inactivo'}`;
        statusBadge.textContent = Dashboard.t(hs.status === 'active' ? 'main.filterActive' : 'main.filterInactive');
        tdStatus.appendChild(statusBadge);

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openChangeHistory('estatus-rh', hs.id));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => openEditModal(hs));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removeHrStatus(hs));
        tdActions.append(historyBtn, editBtn, deleteBtn);

        tr.append(tdName, tdEffect, tdStatus, tdActions);
        tableBody.appendChild(tr);
    });
}

async function removeHrStatus(hs) {
    if (!(await Dashboard.confirm(Dashboard.t('business.hrStatusDeleteConfirm')))) return;
    try {
        const res = await fetch(`/api/business/hr-status-catalog/${hs.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        hrStatuses = hrStatuses.filter((s) => s.id !== hs.id);
        renderHrStatuses();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function loadHrStatuses() {
    try {
        const res = await fetch('/api/business/hr-status-catalog', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        hrStatuses = data.hrStatuses || [];
        renderHrStatuses();
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

// --- "Agregar Estatus RH" — creation only.
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const name = nameField.value.trim();
    if (!name) {
        showError(Dashboard.t('admin.requiredFields'));
        return;
    }
    const operationalEffect = effectField.value;
    const status = statusField.value;

    submitBtn.disabled = true;
    try {
        const res = await fetch('/api/business/hr-status-catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, operationalEffect, status }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            if (body.message === 'An HR status with that name already exists.') {
                showError(Dashboard.t('business.hrStatusNameExists'));
            } else {
                showError(body.message || Dashboard.t('admin.saveError'));
            }
            return;
        }
        const { hrStatus } = await res.json();
        hrStatuses = [...hrStatuses, hrStatus];
        renderHrStatuses();
        resetForm();
        Dashboard.showToast(Dashboard.t('main.recordSaved'), 'success');
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

// --- Editar Estatus RH — a real modal (pantalla alterna) opened from the
// pencil icon, same pattern as Puestos de Trabajo's own edit modal.
const editModal = document.getElementById('hs-edit-modal');
const editIdField = document.getElementById('hs-edit-id');
const editNameField = document.getElementById('hs-edit-name');
const editEffectField = document.getElementById('hs-edit-effect');
const editStatusField = document.getElementById('hs-edit-status');
const editError = document.getElementById('hs-edit-error');
const editSaveBtn = document.getElementById('hs-edit-save');
const editCancelBtn = document.getElementById('hs-edit-cancel');

function openEditModal(hs) {
    editIdField.value = hs.id;
    editNameField.value = hs.name;
    editEffectField.value = hs.operational_effect;
    editStatusField.value = hs.status;
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
        const res = await fetch(`/api/business/hr-status-catalog/${editIdField.value}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                name, operationalEffect: editEffectField.value, status: editStatusField.value,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            editError.textContent = body.message === 'An HR status with that name already exists.'
                ? Dashboard.t('business.hrStatusNameExists')
                : (body.message || Dashboard.t('admin.saveError'));
            editError.hidden = false;
            return;
        }
        const { hrStatus } = await res.json();
        hrStatuses = hrStatuses.map((s) => (s.id === hrStatus.id ? hrStatus : s));
        renderHrStatuses();
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

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!editModal.hidden) closeEditModal();
});

document.addEventListener('dashboard:language-changed', renderHrStatuses);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-catalogos-estatus-rh' });
        if (!role) return;
        await loadHrStatuses();
    } catch (err) {
        console.error('Business (Estatus RH) failed to initialize:', err);
    }
})();
