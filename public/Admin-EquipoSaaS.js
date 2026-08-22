// ---------------------------------------------------------------------------
// "Equipo SaaS" — GEIPSA's own staff accounts (role='admin'). Before this
// screen, the ONLY way to have a role='admin' account was the seeded
// admin/admin user — no endpoint ever created another one, and no admin
// could be restricted from anything. This screen: (1) lets an admin create
// more admin accounts, (2) lets an admin configure another account's access
// to the 3 SaaS screens (Nuestros Clientes / Nuestros Planes / Costos de
// Módulos), including the granular "Autorizar Planes" permission under
// Nuestros Planes. An account with NO grants at all is unrestricted (sees/
// does everything) — same convention as isUnrestrictedClientAdmin on the
// client side, so admin/admin itself (which starts with zero rows here)
// never gets accidentally locked out. Shell comes from Dashboard.js.
//
// Deliberately NOT the full PermissionTree.js component — the SaaS tree is
// just 3 flat screens (one with a single nested permission), a plain
// checkbox list is proportional to that, not the department/área/apartado/
// pantalla/columna machinery built for the much bigger client-side tree.
// ---------------------------------------------------------------------------

const tableBody = document.getElementById('saas-user-table-body');
const emptyMsg = document.getElementById('saas-user-empty');

const newModal = document.getElementById('saas-user-new-modal');
const newForm = document.getElementById('saas-user-form');
const nameField = document.getElementById('saas-user-name');
const usernameField = document.getElementById('saas-user-username');
const emailField = document.getElementById('saas-user-email');
const passwordField = document.getElementById('saas-user-password');
const newFormError = document.getElementById('saas-user-form-error');
const newFormSubmit = document.getElementById('saas-user-form-submit');
const newFormCancel = document.getElementById('saas-user-form-cancel');

const treeModal = document.getElementById('saas-user-tree-modal');
const treeList = document.getElementById('saas-user-tree-list');
const treeError = document.getElementById('saas-user-tree-error');
const treeSaveBtn = document.getElementById('saas-user-tree-save');
const treeCloseBtn = document.getElementById('saas-user-tree-close');
const treeSaveStatus = document.getElementById('saas-user-tree-save-status');

let saasUsers = [];
let selectedUserId = null;

// The SaaS permission catalog: one branch per SaaS screen (kept in sync by
// hand with SAAS_SCREEN_GRANT_PATHS in Dashboard.js), each with its own
// independent per-action leaves — same itemId/subItemId tuples
// hasSaasGrant checks server-side throughout server.js. A bare
// {itemId, subItemId: null} row (the "Ver" leaf here) is what
// hasSaasScreenGrant in Dashboard.js also checks for sidebar/page
// visibility — granting ANY other leaf under a screen implies Ver too (see
// hasSaasGrant's own comment), so Ver alone means "can see it, nothing
// else". Costo Accesos-Permisos has no Crear/Activar leaves — there's
// nothing to create or activate on that screen, plans are created and
// activated from Nuestros Planes. Nuestros Planes' Activar leaf keeps the
// pre-existing 'activate' subItemId (not 'activar') since it's the same
// grant POST /api/admin/plans/:id/activate already checks — renamed only
// in its on-screen label ("Autorizar Planes" -> "Activar/Desactivar") to
// match the other 2 screens' naming.
const SAAS_PERMISSION_CATALOG = [
    {
        itemId: 'saas-clients', labelKey: 'menu.clientesRegistrados',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'editar', labelKey: 'admin.saasActionEdit' },
            { subItemId: 'crear', labelKey: 'admin.saasActionCreate' },
            { subItemId: 'activar', labelKey: 'admin.saasActionActivate' },
        ],
    },
    {
        itemId: 'saas-plans', labelKey: 'menu.plansRegistered',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'editar', labelKey: 'admin.saasActionEdit' },
            { subItemId: 'crear', labelKey: 'admin.saasActionCreate' },
            { subItemId: 'activate', labelKey: 'admin.saasActionActivate' },
        ],
    },
    {
        itemId: 'saas-module-costs', labelKey: 'menu.moduleCosts',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'editar', labelKey: 'admin.saasActionEdit' },
        ],
    },
    {
        itemId: 'saas-apps', labelKey: 'menu.ourApps',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'editar', labelKey: 'admin.saasActionEdit' },
            { subItemId: 'crear', labelKey: 'admin.saasActionCreate' },
        ],
    },
];

function showError(el, message) {
    el.textContent = message;
    el.hidden = false;
}
function clearError(el) {
    el.hidden = true;
    el.textContent = '';
}

function renderSaasUsers() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = saasUsers.length > 0;
    saasUsers.forEach((user) => {
        const tr = document.createElement('tr');
        // This whole screen is admin-only (role check in init() below) and
        // every row's access tree is always open to edit — no per-row lock
        // like Nuestros Planes has.
        tr.classList.add('data-table-row-editable');

        const tdUsername = document.createElement('td');
        tdUsername.dataset.col = 'username';
        tdUsername.textContent = user.username;
        const tdName = document.createElement('td');
        tdName.dataset.col = 'name';
        tdName.textContent = user.name;
        const tdEmail = document.createElement('td');
        tdEmail.dataset.col = 'email';
        tdEmail.textContent = user.email;
        const tdCreatedAt = document.createElement('td');
        tdCreatedAt.dataset.col = 'createdAt';
        tdCreatedAt.textContent = (user.created_at || '').slice(0, 10) || '—';

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const treeBtn = document.createElement('button');
        treeBtn.type = 'button';
        treeBtn.className = 'admin-icon-btn';
        treeBtn.setAttribute('aria-label', Dashboard.t('admin.saasTreeTitle'));
        treeBtn.title = Dashboard.t('admin.saasTreeTitle');
        treeBtn.innerHTML = '<i class="bx bx-shield" aria-hidden="true"></i>';
        treeBtn.addEventListener('click', () => openTreeModal(user));
        tdActions.appendChild(treeBtn);

        tr.append(tdUsername, tdName, tdEmail, tdCreatedAt, tdActions);
        tableBody.appendChild(tr);
    });
    applySaasTeamFilters();
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the field means).
// Client-side row hiding, re-applied after every renderSaasUsers() so a
// filter stays active across edits instead of silently resetting.
function applySaasTeamFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    tableBody.querySelectorAll('tr').forEach((tr) => {
        if (!text) { tr.hidden = false; return; }
        const haystack = ['username', 'name', 'email']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !haystack.includes(text);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applySaasTeamFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applySaasTeamFilters);

async function loadSaasUsers() {
    try {
        const res = await fetch('/api/admin/saas-users', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        saasUsers = data.users || [];
        renderSaasUsers();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.loadError'), 'error');
    }
}

// --- "+ Nuevo Admin SaaS" -----------------------------------------------
function renderNewUserButton() {
    const wrapper = document.querySelector('[data-table-id="equipo-saas"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="admin.saasUserNewTitle">${Dashboard.t('admin.saasUserNewTitle')}</span>`;
    btn.addEventListener('click', openNewModal);
    toolbar.prepend(btn);
}

function openNewModal() {
    newForm.reset();
    clearError(newFormError);
    newModal.hidden = false;
}
function closeNewModal() {
    newModal.hidden = true;
}
newFormCancel.addEventListener('click', closeNewModal);
newModal.addEventListener('click', (event) => { if (event.target === newModal) closeNewModal(); });

newForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(newFormError);
    const name = nameField.value.trim();
    const username = usernameField.value.trim();
    const email = emailField.value.trim();
    const password = passwordField.value;
    if (!name || !username || !email || !password || password.length < 8) {
        showError(newFormError, Dashboard.t('admin.requiredFields'));
        return;
    }
    newFormSubmit.disabled = true;
    try {
        const res = await fetch('/api/admin/saas-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, username, email, password }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(newFormError, body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const { user } = await res.json();
        saasUsers = [...saasUsers, user];
        renderSaasUsers();
        closeNewModal();
        Dashboard.showToast(Dashboard.t('main.recordSaved'), 'success');
    } catch {
        showError(newFormError, Dashboard.t('admin.saveError'));
    } finally {
        newFormSubmit.disabled = false;
    }
});

// --- Access tree per SaaS account ----------------------------------------
// Same .perm-tree-row markup PermissionTree.js/PermissionCostTree.js use
// for every other checkbox tree in the app (chevron toggle + checkbox,
// indented by depth) — NOT that component itself, since this tree's shape
// is fixed (3 screens, up to 4 actions each) rather than read from
// menu.json, so a small purpose-built renderer is simpler here than
// reusing the department/área/apartado/pantalla/columna machinery built
// for the much bigger client-side tree. Depth 0 = screen (its checkbox
// checks/unchecks every action under it at once, indeterminate when only
// some are), depth 1 = one action leaf.
let treeGrants = [];
let expandedScreens = new Set();

function hasGrant(itemId, subItemId) {
    return treeGrants.some((g) => g.itemId === itemId && (subItemId ? g.subItemId === subItemId : !g.subItemId));
}
function setGrant(itemId, subItemId, checked) {
    treeGrants = treeGrants.filter((g) => !(g.itemId === itemId && (subItemId ? g.subItemId === subItemId : !g.subItemId)));
    if (checked) treeGrants.push({ itemId, subItemId: subItemId || null });
}

function buildPermTreeRow(labelText, depth, toggle, checked, indeterminate, onChange) {
    const row = document.createElement('div');
    row.className = `perm-tree-row perm-tree-depth-${depth}`;

    if (toggle) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'perm-tree-toggle';
        btn.setAttribute('aria-expanded', String(toggle.expanded));
        const icon = document.createElement('i');
        icon.className = 'bx bx-chevron-down';
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
        btn.addEventListener('click', () => { toggle.onToggle(); renderTreeList(); });
        row.appendChild(btn);
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'perm-tree-toggle-spacer';
        row.appendChild(spacer);
    }

    const label = document.createElement('label');
    label.className = 'perm-tree-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.indeterminate = !!indeterminate;
    input.addEventListener('change', () => { onChange(input.checked); renderTreeList(); });
    const span = document.createElement('span');
    span.textContent = labelText;
    label.append(input, span);
    row.appendChild(label);

    return row;
}

function renderTreeList() {
    treeList.innerHTML = '';
    SAAS_PERMISSION_CATALOG.forEach((screen) => {
        const subItemIds = screen.actions.map((a) => a.subItemId);
        const checkedCount = subItemIds.filter((subItemId) => hasGrant(screen.itemId, subItemId)).length;
        const expanded = expandedScreens.has(screen.itemId);
        treeList.appendChild(buildPermTreeRow(
            Dashboard.t(screen.labelKey), 0,
            { expanded, onToggle: () => (expanded ? expandedScreens.delete(screen.itemId) : expandedScreens.add(screen.itemId)) },
            checkedCount === subItemIds.length, checkedCount > 0 && checkedCount < subItemIds.length,
            (checked) => subItemIds.forEach((subItemId) => setGrant(screen.itemId, subItemId, checked)),
        ));
        if (!expanded) return;
        screen.actions.forEach((action) => {
            treeList.appendChild(buildPermTreeRow(
                Dashboard.t(action.labelKey), 1, null,
                hasGrant(screen.itemId, action.subItemId), false,
                (checked) => setGrant(screen.itemId, action.subItemId, checked),
            ));
        });
    });
}

async function openTreeModal(user) {
    selectedUserId = user.id;
    document.getElementById('saas-user-tree-modal-title').textContent = `${Dashboard.t('admin.saasTreeTitle')} — ${user.name}`;
    treeSaveStatus.textContent = '';
    clearError(treeError);
    try {
        const res = await fetch(`/api/admin/saas-users/${user.id}/grants`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        treeGrants = data.grants || [];
        expandedScreens = new Set();
        renderTreeList();
        treeModal.hidden = false;
    } catch {
        Dashboard.showToast(Dashboard.t('admin.loadError'), 'error');
    }
}
function closeTreeModal() {
    treeModal.hidden = true;
}
treeCloseBtn.addEventListener('click', closeTreeModal);
treeModal.addEventListener('click', (event) => { if (event.target === treeModal) closeTreeModal(); });

treeSaveBtn.addEventListener('click', async () => {
    if (!selectedUserId) return;
    treeSaveBtn.disabled = true;
    clearError(treeError);
    try {
        const res = await fetch(`/api/admin/saas-users/${selectedUserId}/grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: treeGrants }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(treeError, body.message || Dashboard.t('admin.saveError'));
            return;
        }
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        showError(treeError, Dashboard.t('admin.saveError'));
    } finally {
        treeSaveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', () => {
    renderSaasUsers();
    if (!treeModal.hidden) renderTreeList();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-equipo-saas' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        renderNewUserButton();
        await loadSaasUsers();
    } catch (err) {
        console.error('Admin (Equipo SaaS) failed to initialize:', err);
    }
})();
