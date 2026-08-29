// ---------------------------------------------------------------------------
// "Usuarios" — Administración del Negocio: every account auto-created from
// Mi Recurso Humano (never from here), with 2 actions per row:
//   - Permisos Activados (read-only): what this user can ACTUALLY see today
//     — their own Puesto de Trabajo's default grants (green) + Permisos
//     Adicionales (yellow) + neither (red/locked), same PermissionCostTree
//     "clientTricolor" tree Nuestros Clientes' own "Permisos Contratados"
//     modal already uses.
//   - Permisos Adicionales (editable): grant extra modules/apartados/
//     pantallas on top of whatever this user's Puesto already gives them —
//     same idea as a client's own Permisos Adicionales in Admin-SaaS. Never
//     removes access, only adds.
// No profile-assignment UI here anymore: a user's baseline access comes
// straight from the Puesto they were hired into (see Roles). This screen
// used to be split across Usuarios + Accesos y Permisos; they're merged
// here now, one table instead of two showing overlapping data.
// Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

let users = [];
let allowedSectionIds = null;
let costCenters = [];
let activeUserId = null;
let grantTree = null;

const tableBody = document.getElementById('users-table-body');
const emptyMsg = document.getElementById('users-empty');

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

// --- Permisos Activados (read-only, Puesto vs. adicional vs. ninguno) ------
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
        await tree.init(data.jobPositionGrants || [], [], data.grants || []);
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

// --- Permisos Adicionales (editable extra grants) ---------------------------
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
        // Tricolor, same as Nuestros Clientes' own Permisos Adicionales
        // (Admin-SaaS.js): what the Puesto already grants shows green/locked
        // instead of an indistinguishable blank checklist, so this reads as
        // "add something EXTRA" rather than "reassign everything from
        // scratch" -- restricted to allowedSectionIds so a user can never be
        // offered a módulo their own client hasn't contracted.
        grantTree = window.PermissionCostTree.create(grantAccessContainer, { mode: 'clientTricolor', interactive: true, allowedSectionIds });
        await grantTree.init(data.jobPositionGrants || [], [], data.grants || []);
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
            body: JSON.stringify({ grants: grantTree.getClientGrants() }),
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

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!activePermsModal.hidden) closeActivePermsModal();
    if (!grantAccessModal.hidden) closeGrantAccessModal();
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
        const tdEmail = document.createElement('td');
        tdEmail.dataset.col = 'accEmail';
        tdEmail.textContent = user.email;
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
        tdActions.appendChild(grantBtn);

        tr.append(tdUsername, tdName, tdEmail, tdCreated, tdHrStatus, tdOperationalStatus, tdActivePerms, tdActions);
        tableBody.appendChild(tr);
    });
    applyUsersFilters();
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the fields mean).
function applyUsersFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    const operationalStatus = document.getElementById('filter-operational-status')?.value || '';
    tableBody.querySelectorAll('tr').forEach((tr) => {
        let visible = true;
        if (text) {
            const haystack = ['accUsername', 'accName', 'accEmail']
                .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
                .join(' ');
            if (!haystack.includes(text)) visible = false;
        }
        if (operationalStatus && tr.dataset.operationalStatus !== operationalStatus) visible = false;
        tr.hidden = !visible;
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyUsersFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyUsersFilters);

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
        const role = await Dashboard.initDashboard({ activePage: 'business-users' });
        if (!role) return;
        await Promise.all([loadUsers(), loadContractedModules(), loadCostCentersForTree()]);
    } catch (err) {
        console.error('Business (Usuarios) failed to initialize:', err);
    }
})();
