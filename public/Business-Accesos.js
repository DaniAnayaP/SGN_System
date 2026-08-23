// ---------------------------------------------------------------------------
// "Accesos y Permisos" — Administración del Negocio: a table of business
// users with 3 separate actions per row:
//   - Permisos Activados (read-only): what this user can ACTUALLY see today,
//     profile-derived (green) + extra (yellow) + neither (red/locked) — same
//     PermissionCostTree "clientTricolor" tree Nuestros Clientes' own
//     "Permisos Contratados" modal already uses, just against this user's
//     own profile/extra grants instead of a client's plan/extras.
//   - Permisos (editable): the ORIGINAL single-tree flow this screen used to
//     have inline — grant extra modules/apartados/pantallas on top of
//     whatever the user's profile(s) already give them. Never removes
//     access, only adds.
//   - Editar (profiles): which profile(s) this user is assigned — same
//     concept Business-Usuarios.js's own always-visible panel already has,
//     just moved into a modal here.
// Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

let users = [];
let allProfiles = [];
let allowedSectionIds = null;
let costCenters = [];
let activeUserId = null;
let grantTree = null;

const tableBody = document.getElementById('access-table-body');
const emptyMsg = document.getElementById('access-empty');

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

async function loadProfiles() {
    try {
        const res = await fetch('/api/business/profiles', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        allProfiles = data.profiles || [];
    } catch {
        allProfiles = [];
    }
}

// --- Permisos Activados (read-only, profile vs. extra vs. none) ------------
const activePermsModal = document.getElementById('active-perms-modal');
const activePermsSubtitle = document.getElementById('active-perms-subtitle');
const activePermsContainer = document.getElementById('active-perms-container');
const activePermsError = document.getElementById('active-perms-error');

async function openActivePermsModal(user) {
    activePermsSubtitle.textContent = `${user.name} (${user.username})`;
    activePermsError.hidden = true;
    activePermsContainer.innerHTML = '';
    activePermsModal.hidden = false;
    try {
        const res = await fetch(`/api/business/users/${user.id}/grants`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        const tree = window.PermissionCostTree.create(activePermsContainer, { mode: 'clientTricolor', interactive: false });
        await tree.init(data.profileGrants || [], [], data.grants || []);
    } catch {
        activePermsError.textContent = Dashboard.t('admin.loadError');
        activePermsError.hidden = false;
    }
}

function closeActivePermsModal() {
    activePermsModal.hidden = true;
}

document.getElementById('active-perms-close').addEventListener('click', closeActivePermsModal);
activePermsModal.addEventListener('click', (event) => { if (event.target === activePermsModal) closeActivePermsModal(); });

// --- Permisos (editable extra grants) ---------------------------------------
const grantAccessModal = document.getElementById('grant-access-modal');
const grantAccessSubtitle = document.getElementById('grant-access-subtitle');
const grantAccessContainer = document.getElementById('grant-access-container');
const grantAccessError = document.getElementById('grant-access-error');
const grantAccessSaveBtn = document.getElementById('grant-access-save');

async function openGrantAccessModal(user) {
    activeUserId = user.id;
    grantAccessSubtitle.textContent = `${user.name} (${user.username})`;
    grantAccessError.hidden = true;
    grantAccessContainer.innerHTML = '';
    grantAccessModal.hidden = false;
    try {
        const res = await fetch(`/api/business/users/${user.id}/grants`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        grantTree = window.PermissionTree.create(grantAccessContainer, { allowedSectionIds, costCenters, showAppTab: true });
        await grantTree.init(data.grants || []);
    } catch {
        grantAccessError.textContent = Dashboard.t('admin.loadError');
        grantAccessError.hidden = false;
    }
}

function closeGrantAccessModal() {
    grantAccessModal.hidden = true;
    grantTree = null;
    activeUserId = null;
}

document.getElementById('grant-access-cancel').addEventListener('click', closeGrantAccessModal);
grantAccessModal.addEventListener('click', (event) => { if (event.target === grantAccessModal) closeGrantAccessModal(); });

grantAccessSaveBtn.addEventListener('click', async () => {
    if (!activeUserId || !grantTree) return;
    grantAccessSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/business/users/${activeUserId}/grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: grantTree.getGrants() }),
        });
        if (!res.ok) throw new Error('save failed');
        closeGrantAccessModal();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        grantAccessError.textContent = Dashboard.t('admin.saveError');
        grantAccessError.hidden = false;
    } finally {
        grantAccessSaveBtn.disabled = false;
    }
});

// --- Editar (profile assignment) --------------------------------------------
const editProfilesModal = document.getElementById('edit-profiles-modal');
const editProfilesSubtitle = document.getElementById('edit-profiles-subtitle');
const editProfilesList = document.getElementById('edit-profiles-list');
const editProfilesError = document.getElementById('edit-profiles-error');
const editProfilesSaveBtn = document.getElementById('edit-profiles-save');

function renderProfilesChecklist(assignedIds) {
    editProfilesList.innerHTML = '';
    if (!allProfiles.length) {
        const p = document.createElement('p');
        p.className = 'admin-hint';
        p.textContent = Dashboard.t('business.noProfilesYet');
        editProfilesList.appendChild(p);
        return;
    }
    allProfiles.forEach((profile) => {
        const row = document.createElement('div');
        row.className = 'admin-module-row';
        const name = document.createElement('span');
        name.className = 'admin-module-name';
        name.textContent = profile.name;
        const label = document.createElement('label');
        label.className = 'admin-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = assignedIds.includes(profile.id);
        input.dataset.profileId = profile.id;
        const track = document.createElement('span');
        track.className = 'admin-switch-track';
        label.append(input, track);
        row.append(name, label);
        editProfilesList.appendChild(row);
    });
}

async function openEditProfilesModal(user) {
    activeUserId = user.id;
    editProfilesSubtitle.textContent = `${user.name} (${user.username})`;
    editProfilesError.hidden = true;
    editProfilesList.innerHTML = '';
    editProfilesModal.hidden = false;
    try {
        const res = await fetch(`/api/business/users/${user.id}/profiles`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        renderProfilesChecklist((data.profiles || []).map((p) => p.id));
    } catch {
        editProfilesError.textContent = Dashboard.t('admin.loadError');
        editProfilesError.hidden = false;
    }
}

function closeEditProfilesModal() {
    editProfilesModal.hidden = true;
    activeUserId = null;
}

document.getElementById('edit-profiles-cancel').addEventListener('click', closeEditProfilesModal);
editProfilesModal.addEventListener('click', (event) => { if (event.target === editProfilesModal) closeEditProfilesModal(); });

editProfilesSaveBtn.addEventListener('click', async () => {
    if (!activeUserId) return;
    const profileIds = Array.from(editProfilesList.querySelectorAll('input[type="checkbox"]:checked'))
        .map((input) => Number(input.dataset.profileId));
    editProfilesSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/business/users/${activeUserId}/profiles`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ profileIds }),
        });
        if (!res.ok) throw new Error('save failed');
        closeEditProfilesModal();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        editProfilesError.textContent = Dashboard.t('admin.saveError');
        editProfilesError.hidden = false;
    } finally {
        editProfilesSaveBtn.disabled = false;
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!activePermsModal.hidden) closeActivePermsModal();
    if (!grantAccessModal.hidden) closeGrantAccessModal();
    if (!editProfilesModal.hidden) closeEditProfilesModal();
});

// --- Activar / Inactivar -----------------------------------------------------
async function toggleUserActive(user) {
    try {
        const res = await fetch(`/api/business/users/${user.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ active: !user.active }),
        });
        if (!res.ok) throw new Error('save failed');
        await loadUsers();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// --- Table --------------------------------------------------------------
function operationalBadgeClass(status) {
    if (status === 'active') return 'admin-badge-activo';
    if (status === 'inactive') return 'admin-badge-inactivo';
    return 'admin-badge-suspendido';
}
function operationalLabelKey(status) {
    if (status === 'active') return 'business.hrStatusEffectActive';
    if (status === 'inactive') return 'business.hrStatusEffectInactive';
    return 'business.hrStatusEffectSuspended';
}

function renderUsersTable() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = users.length > 0;
    users.forEach((user) => {
        const tr = document.createElement('tr');
        tr.dataset.operationalStatus = user.operationalStatus || 'active';

        const tdUsername = document.createElement('td');
        tdUsername.dataset.col = 'accUsername';
        tdUsername.textContent = user.username;
        const tdName = document.createElement('td');
        tdName.dataset.col = 'accName';
        tdName.textContent = user.name;
        const tdCreated = document.createElement('td');
        tdCreated.dataset.col = 'accCreated';
        tdCreated.textContent = (user.created_at || '').slice(0, 10);

        // Estatus RH — read-only here, sourced from Recursos Humanos /
        // Administración de Personal / Mi Recurso Humano (Business-EstatusRH
        // catalog). Never editable from this screen.
        const tdHrStatus = document.createElement('td');
        tdHrStatus.dataset.col = 'accHrStatus';
        if (user.hrStatusName) {
            const badge = document.createElement('span');
            badge.className = `admin-badge ${operationalBadgeClass(user.hrStatusEffect)}`;
            badge.textContent = user.hrStatusName;
            tdHrStatus.appendChild(badge);
        } else {
            tdHrStatus.textContent = '—';
        }

        // Estatus Operativo — derived from Estatus RH (see
        // computeOperationalStatus in db.js). The manual toggle is only
        // clickable when Estatus RH is Activo (or this user has no HR
        // record at all) — any other Estatus RH value forces Suspendido/
        // Inactivo here and the toggle shows locked instead.
        const tdOperationalStatus = document.createElement('td');
        tdOperationalStatus.dataset.col = 'accOperationalStatus';
        const opBadge = document.createElement('span');
        opBadge.className = `admin-badge ${operationalBadgeClass(user.operationalStatus)}`;
        opBadge.textContent = Dashboard.t(operationalLabelKey(user.operationalStatus));
        const opToggleBtn = document.createElement('button');
        opToggleBtn.type = 'button';
        opToggleBtn.className = 'admin-icon-btn';
        const isForcedByHr = user.hrStatusEffect === 'suspended' || user.hrStatusEffect === 'inactive';
        if (isForcedByHr) {
            opToggleBtn.disabled = true;
            opToggleBtn.innerHTML = '<i class="bx bx-lock-alt" aria-hidden="true"></i>';
            opToggleBtn.setAttribute('aria-label', Dashboard.t('business.accesosOperationalLocked'));
            opToggleBtn.title = Dashboard.t('business.accesosOperationalLocked');
        } else {
            opToggleBtn.innerHTML = `<i class="bx ${user.active ? 'bx-x-circle' : 'bx-check-circle'}" aria-hidden="true"></i>`;
            opToggleBtn.setAttribute('aria-label', Dashboard.t(user.active ? 'admin.deactivate' : 'admin.activate'));
            opToggleBtn.title = Dashboard.t(user.active ? 'admin.deactivate' : 'admin.activate');
            opToggleBtn.addEventListener('click', () => toggleUserActive(user));
        }
        tdOperationalStatus.append(opBadge, opToggleBtn);

        const tdActivePerms = document.createElement('td');
        tdActivePerms.dataset.col = 'accActivePerms';
        const activePermsBtn = document.createElement('button');
        activePermsBtn.type = 'button';
        activePermsBtn.className = 'admin-icon-btn';
        activePermsBtn.setAttribute('aria-label', Dashboard.t('business.accesosActivePermsBtn'));
        activePermsBtn.title = Dashboard.t('business.accesosActivePermsBtn');
        activePermsBtn.innerHTML = '<i class="bx bx-sitemap" aria-hidden="true"></i>';
        activePermsBtn.addEventListener('click', () => openActivePermsModal(user));
        tdActivePerms.appendChild(activePermsBtn);

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const grantBtn = document.createElement('button');
        grantBtn.type = 'button';
        grantBtn.className = 'admin-icon-btn';
        grantBtn.setAttribute('aria-label', Dashboard.t('business.accesosGrantTitle'));
        grantBtn.title = Dashboard.t('business.accesosGrantTitle');
        grantBtn.innerHTML = '<i class="bx bx-key" aria-hidden="true"></i>';
        grantBtn.addEventListener('click', () => openGrantAccessModal(user));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.title = Dashboard.t('admin.edit');
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => openEditProfilesModal(user));
        tdActions.append(grantBtn, editBtn);

        tr.append(tdUsername, tdName, tdCreated, tdHrStatus, tdOperationalStatus, tdActivePerms, tdActions);
        tableBody.appendChild(tr);
    });
    applyAccesosFilters();
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the fields mean).
function applyAccesosFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    const operationalStatus = document.getElementById('filter-operational-status')?.value || '';
    tableBody.querySelectorAll('tr').forEach((tr) => {
        let visible = true;
        if (text) {
            const haystack = ['accUsername', 'accName']
                .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
                .join(' ');
            if (!haystack.includes(text)) visible = false;
        }
        if (operationalStatus && tr.dataset.operationalStatus !== operationalStatus) visible = false;
        tr.hidden = !visible;
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyAccesosFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyAccesosFilters);

async function loadUsers() {
    try {
        const res = await fetch('/api/business/users', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        users = data.users || [];
        renderUsersTable();
    } catch {
        emptyMsg.textContent = Dashboard.t('admin.loadError');
        emptyMsg.hidden = false;
    }
}

document.addEventListener('dashboard:language-changed', () => {
    renderUsersTable();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'business-accesos' });
        if (!role) return;
        await Promise.all([loadUsers(), loadProfiles(), loadContractedModules(), loadCostCentersForTree()]);
    } catch (err) {
        console.error('Business (Accesos) failed to initialize:', err);
    }
})();
