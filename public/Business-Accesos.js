// ---------------------------------------------------------------------------
// "Accesos y Permisos" — Administración del Negocio: grant a specific user
// extra modules/apartados/pantallas on top of whatever their assigned
// profile(s) already give them. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

const userSelect = document.getElementById('access-user-select');
const hint = document.getElementById('access-hint');
const panel = document.getElementById('access-panel');
const treeContainer = document.getElementById('permission-tree-container');
const saveBtn = document.getElementById('access-save');
const saveStatus = document.getElementById('access-save-status');

let tree = null;
let allowedSectionIds = null;

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

async function loadUserOptions() {
    try {
        const res = await fetch('/api/business/users', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        (data.users || []).forEach((user) => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.name} (${user.username})`;
            userSelect.appendChild(option);
        });
    } catch {
        hint.textContent = Dashboard.t('admin.loadError');
        hint.hidden = false;
    }
}

async function loadGrantsForUser(userId) {
    saveStatus.textContent = '';
    try {
        const res = await fetch(`/api/business/users/${userId}/grants`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        tree = window.PermissionTree.create(treeContainer, { allowedSectionIds });
        await tree.init(data.grants || []);
        panel.hidden = false;
        hint.hidden = true;
    } catch {
        panel.hidden = true;
        hint.textContent = Dashboard.t('admin.loadError');
        hint.hidden = false;
    }
}

userSelect.addEventListener('change', () => {
    const userId = userSelect.value;
    if (!userId) {
        panel.hidden = true;
        hint.textContent = Dashboard.t('business.noUserSelected');
        hint.hidden = false;
        return;
    }
    loadGrantsForUser(userId);
});

saveBtn.addEventListener('click', async () => {
    const userId = userSelect.value;
    if (!userId || !tree) return;
    saveBtn.disabled = true;
    try {
        const res = await fetch(`/api/business/users/${userId}/grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: tree.getGrants() }),
        });
        if (!res.ok) throw new Error('save failed');
        saveStatus.textContent = Dashboard.t('business.accessSaved');
    } catch {
        saveStatus.textContent = Dashboard.t('admin.saveError');
    } finally {
        saveBtn.disabled = false;
    }
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'business-accesos' });
        if (!role) return;
        await Promise.all([loadUserOptions(), loadContractedModules()]);
    } catch (err) {
        console.error('Business (Accesos) failed to initialize:', err);
    }
})();
