// ---------------------------------------------------------------------------
// "Roles" — Administración del Negocio: create/edit/delete profiles
// (perfiles) and configure their access to módulos/apartados/pantallas using
// the shared PermissionTree component. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

const form = document.getElementById('profile-form');
const idField = document.getElementById('profile-id');
const nameField = document.getElementById('profile-name');
const descriptionField = document.getElementById('profile-description');
const errorBanner = document.getElementById('profile-form-error');
const submitBtn = document.getElementById('profile-form-submit');
const cancelBtn = document.getElementById('profile-form-cancel');
const tableBody = document.getElementById('profiles-table-body');
const emptyMsg = document.getElementById('profiles-empty');

const permissionsHeading = document.getElementById('permissions-heading');
const permissionsHint = document.getElementById('permissions-hint');
const permissionsPanel = document.getElementById('permissions-panel');
const treeContainer = document.getElementById('permission-tree-container');
const permissionsSaveBtn = document.getElementById('permissions-save');
const permissionsSaveStatus = document.getElementById('permissions-save-status');

let profiles = [];
let selectedProfileId = null;
let tree = null;
let allowedSectionIds = null;
let costCenters = [];

async function loadContractedModules() {
    try {
        const res = await fetch('/api/business/contracted-modules', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        allowedSectionIds = data.moduleKeys || [];
    } catch {
        allowedSectionIds = [];
    }
}

async function loadCostCentersForTree() {
    try {
        const res = await fetch('/api/business/cost-centers', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        costCenters = data.costCenters || [];
    } catch {
        costCenters = [];
    }
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
    idField.value = '';
    submitBtn.textContent = Dashboard.t('business.addProfile');
    cancelBtn.hidden = true;
    clearError();
}

function renderProfiles() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = profiles.length > 0;
    profiles.forEach((profile) => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = profile.name;
        const tdDescription = document.createElement('td');
        tdDescription.textContent = profile.description || '—';

        const tdActions = document.createElement('td');
        tdActions.className = 'admin-table-actions';
        const configureBtn = document.createElement('button');
        configureBtn.type = 'button';
        configureBtn.className = 'admin-icon-btn';
        configureBtn.setAttribute('aria-label', Dashboard.t('business.permissionsTitle'));
        configureBtn.innerHTML = '<i class="bx bx-shield" aria-hidden="true"></i>';
        configureBtn.addEventListener('click', () => selectProfileForPermissions(profile));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => startEdit(profile));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removeProfile(profile));
        tdActions.append(configureBtn, editBtn, deleteBtn);

        tr.append(tdName, tdDescription, tdActions);
        tableBody.appendChild(tr);
    });
}

function startEdit(profile) {
    idField.value = profile.id;
    nameField.value = profile.name;
    descriptionField.value = profile.description || '';
    submitBtn.textContent = Dashboard.t('admin.save');
    cancelBtn.hidden = false;
    clearError();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function removeProfile(profile) {
    if (!confirm(Dashboard.t('business.confirmDeleteProfile'))) return;
    try {
        const res = await fetch(`/api/business/profiles/${profile.id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        if (!res.ok) throw new Error('delete failed');
        profiles = profiles.filter((p) => p.id !== profile.id);
        renderProfiles();
        if (selectedProfileId === profile.id) {
            selectedProfileId = null;
            permissionsPanel.hidden = true;
            permissionsHint.hidden = false;
        }
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function loadProfiles() {
    try {
        const res = await fetch('/api/business/profiles', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        profiles = data.profiles || [];
        renderProfiles();
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const name = nameField.value.trim();
    if (!name) {
        showError(Dashboard.t('admin.requiredFields'));
        return;
    }
    const description = descriptionField.value.trim();

    const editingId = idField.value;
    const url = editingId ? `/api/business/profiles/${editingId}` : '/api/business/profiles';
    const method = editingId ? 'PATCH' : 'POST';

    submitBtn.disabled = true;
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, description }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const { profile } = await res.json();
        if (editingId) {
            profiles = profiles.map((p) => (p.id === profile.id ? profile : p));
        } else {
            profiles = [profile, ...profiles];
        }
        renderProfiles();
        resetForm();
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

cancelBtn.addEventListener('click', resetForm);

async function selectProfileForPermissions(profile) {
    selectedProfileId = profile.id;
    permissionsHeading.textContent = `${Dashboard.t('business.permissionsTitle')} — ${profile.name}`;
    permissionsSaveStatus.textContent = '';
    try {
        const res = await fetch(`/api/business/profiles/${profile.id}/grants`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        tree = window.PermissionTree.create(treeContainer, { allowedSectionIds, costCenters });
        await tree.init(data.grants || []);
        permissionsPanel.hidden = false;
        permissionsHint.hidden = true;
        permissionsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
        permissionsHint.textContent = Dashboard.t('admin.loadError');
        permissionsHint.hidden = false;
        permissionsPanel.hidden = true;
    }
}

permissionsSaveBtn.addEventListener('click', async () => {
    if (!selectedProfileId || !tree) return;
    permissionsSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/business/profiles/${selectedProfileId}/grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: tree.getGrants() }),
        });
        if (!res.ok) throw new Error('save failed');
        permissionsSaveStatus.textContent = Dashboard.t('business.profileSaved');
    } catch {
        permissionsSaveStatus.textContent = Dashboard.t('admin.saveError');
    } finally {
        permissionsSaveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', () => {
    if (!idField.value) submitBtn.textContent = Dashboard.t('business.addProfile');
    renderProfiles();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'business-roles' });
        if (!role) return;
        await Promise.all([loadProfiles(), loadContractedModules(), loadCostCentersForTree()]);
    } catch (err) {
        console.error('Business (Roles) failed to initialize:', err);
    }
})();
