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
const treeVisibleStatuses = document.getElementById('saas-user-tree-visible-statuses');
const treeError = document.getElementById('saas-user-tree-error');
const treeSaveBtn = document.getElementById('saas-user-tree-save');
const treeCloseBtn = document.getElementById('saas-user-tree-close');
const treeSaveStatus = document.getElementById('saas-user-tree-save-status');
// Same role as Business-Usuarios.js's own pendingVisibleStatuses -- where
// the chip row's current selection lives while this modal is open.
let pendingVisibleStatuses = ['habilitado'];

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
            // Deliberately its own leaf, separate from editar/activar --
            // hard-deletes a client and everything under it (see POST
            // /api/admin/clients/:id/reset), only for resetting a TEST
            // client back to zero. Nobody gets this just by already having
            // Editar/Activar.
            { subItemId: 'reset', labelKey: 'admin.saasActionReset' },
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
    {
        // Ver = puede entrar a la pantalla y ver la lista de archivos;
        // Descargar es su propio leaf, separado, igual que "reset" en
        // saas-clients -- ver QUÉ evidencia existe es mucho menos sensible
        // que poder abrir la foto/documento real.
        itemId: 'saas-backups', labelKey: 'menu.ourBackups',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'descargar', labelKey: 'admin.saasActionDownload' },
        ],
    },
    {
        // Ver = puede ver el listado de material de apoyo de cualquier
        // cliente y descargarlo (leer un manual no es sensible); Subir es
        // su propio leaf, ya que ese sí modifica el material real que ve
        // el cliente -- misma separación que saas-backups arriba usa entre
        // Ver y Descargar.
        itemId: 'saas-material-apoyo', labelKey: 'menu.ourSupportMaterial',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'subir', labelKey: 'admin.saasActionUpload' },
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

        // Estatus -- confirmed live, 2026-09-28: "ningún usuario se puede
        // eliminar, solo se pueden colocar en estatus diferente", same rule
        // already established for client business users (users.active).
        // GEIPSA staff have no HR module behind them, so this is that same
        // idea in its plain binary form: tap to flip Activo/Inactivo via
        // users.active, nothing ever deleted.
        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'status';
        const statusBtn = document.createElement('button');
        statusBtn.type = 'button';
        statusBtn.className = `admin-badge admin-badge-${user.active ? 'activo' : 'inactivo'}`;
        statusBtn.style.cursor = 'pointer';
        statusBtn.style.border = 'none';
        statusBtn.textContent = Dashboard.t(user.active ? 'business.hrStatusEffectActive' : 'business.hrStatusEffectInactive');
        statusBtn.addEventListener('click', async () => {
            const nextActive = !user.active;
            const confirmKey = nextActive ? 'admin.saasActivateUserConfirm' : 'admin.saasDeactivateUserConfirm';
            if (!(await Dashboard.confirm(Dashboard.t(confirmKey, { name: user.name })))) return;
            try {
                const res = await fetch(`/api/admin/saas-users/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ active: nextActive }),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message || 'update failed');
                }
                Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
                await loadSaasUsers();
            } catch (err) {
                Dashboard.showToast(err.message === "You can't deactivate your own account." ? Dashboard.t('admin.saasCantDeactivateSelf') : Dashboard.t('admin.saveError'), 'error');
            }
        });
        tdStatus.appendChild(statusBtn);

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';

        // Editar nombre -- confirmed live, 2026-09-28: the seeded admin/admin
        // account's name started as the placeholder "Admin" and needed a
        // real display name. window.prompt, same lightweight single-value-
        // edit pattern as reset password below (no separate modal just for
        // one text field).
        const editNameBtn = document.createElement('button');
        editNameBtn.type = 'button';
        editNameBtn.className = 'admin-icon-btn';
        editNameBtn.setAttribute('aria-label', Dashboard.t('admin.saasEditName'));
        editNameBtn.title = Dashboard.t('admin.saasEditName');
        editNameBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editNameBtn.addEventListener('click', async () => {
            const nextName = window.prompt(Dashboard.t('admin.saasEditNamePrompt'), user.name);
            if (nextName == null) return; // cancelled
            const trimmed = nextName.trim();
            if (!trimmed || trimmed === user.name) return;
            try {
                const res = await fetch(`/api/admin/saas-users/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ name: trimmed }),
                });
                if (!res.ok) throw new Error('update failed');
                Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
                await loadSaasUsers();
            } catch {
                Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
            }
        });
        tdActions.appendChild(editNameBtn);

        const treeBtn = document.createElement('button');
        treeBtn.type = 'button';
        treeBtn.className = 'admin-icon-btn';
        treeBtn.setAttribute('aria-label', Dashboard.t('admin.saasTreeTitle'));
        treeBtn.title = Dashboard.t('admin.saasTreeTitle');
        treeBtn.innerHTML = '<i class="bx bx-shield" aria-hidden="true"></i>';
        treeBtn.addEventListener('click', () => openTreeModal(user));
        tdActions.appendChild(treeBtn);

        // Reset password -- for exactly the case that came up live,
        // 2026-09-28: an auto-generated account (Pruebas_SGN) whose
        // password nobody ever wrote down (it's only ever logged once, to
        // the server console, at creation time -- password_hash itself is
        // one-way, there's no "recover" path, only "replace").
        const resetPwBtn = document.createElement('button');
        resetPwBtn.type = 'button';
        resetPwBtn.className = 'admin-icon-btn';
        resetPwBtn.setAttribute('aria-label', Dashboard.t('admin.saasResetPassword'));
        resetPwBtn.title = Dashboard.t('admin.saasResetPassword');
        resetPwBtn.innerHTML = '<i class="bx bx-key" aria-hidden="true"></i>';
        resetPwBtn.addEventListener('click', async () => {
            if (!(await Dashboard.confirm(Dashboard.t('admin.saasResetPasswordConfirm', { name: user.name })))) return;
            try {
                const res = await fetch(`/api/admin/saas-users/${user.id}/reset-password`, { method: 'POST', credentials: 'include' });
                if (!res.ok) throw new Error('reset failed');
                const { password } = await res.json();
                // A one-time reveal, same reason a native prompt (not a
                // toast) is used for Admin-SaaS.js's own generated-client-
                // password flow -- it stays on screen, selected, until the
                // admin dismisses it, instead of disappearing on its own.
                window.prompt(Dashboard.t('admin.saasResetPasswordResult', { username: user.username }), password);
            } catch {
                Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
            }
        });
        tdActions.appendChild(resetPwBtn);

        // Cambios (per-row) -- see openSaasUserChanges below; the toolbar's
        // own #saas-team-history-btn is the generic/whole-screen version of
        // the exact same dialog.
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => openSaasUserChanges(user.id));
        tdActions.appendChild(historyBtn);

        tr.append(tdUsername, tdName, tdEmail, tdCreatedAt, tdStatus, tdActions);
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

// --- Control de Cambios -- generic (whole screen) + per-row -------------
// Same 6-column dialog every other admin screen already shows
// (Dashboard.js's own ensureChangeHistoryModal/openChangeHistory), rebuilt
// here as its own small singleton instead of reused directly: that shared
// one is hardwired to /api/business/table-changes/... (client-scoped, see
// saas_user_changes' own DDL comment in db.js), which 404s for this
// admin-only screen. Confirmed live, 2026-09-28: "debe tener los mismos
// [campos] que todos los demás registros de cambios" -- same columns, same
// look, just pointed at this screen's own /api/admin/saas-users/... routes.
let saasChangesModal = null;
let saasChangesList = null;
let saasChangesFilterInput = null;
function ensureSaasChangesModal() {
    if (saasChangesModal) return;
    saasChangesModal = document.createElement('div');
    saasChangesModal.className = 'modal-overlay';
    saasChangesModal.hidden = true;
    saasChangesModal.innerHTML = `
        <div class="modal-panel" style="max-width: 40rem;" role="dialog" aria-modal="true" aria-labelledby="saas-user-history-title">
            <h3 id="saas-user-history-title"></h3>
            <div class="admin-field">
                <label for="saas-changes-filter" data-i18n="main.filterSaasChangesSearchHint">${Dashboard.t('main.filterSaasChangesSearchHint')}</label>
                <input type="search" id="saas-changes-filter" data-i18n-placeholder="main.filterSaasChangesSearchHint" placeholder="${Dashboard.t('main.filterSaasChangesSearchHint')}">
            </div>
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>${Dashboard.t('main.changeHistoryDate')}</th>
                            <th>${Dashboard.t('main.changeHistoryUser')}</th>
                            <th>${Dashboard.t('main.changeHistoryRecord')}</th>
                            <th>${Dashboard.t('main.changeHistoryChange')}</th>
                            <th>${Dashboard.t('main.changeHistoryRequestedBy')}</th>
                            <th>${Dashboard.t('main.changeHistoryAuthorizedBy')}</th>
                        </tr>
                    </thead>
                    <tbody data-role="list"></tbody>
                </table>
            </div>
            <div class="admin-form-actions" style="margin-top: 1.25rem;">
                <button type="button" class="btn btn-secondary" data-role="close">${Dashboard.t('admin.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(saasChangesModal);
    saasChangesList = saasChangesModal.querySelector('[data-role="list"]');
    saasChangesFilterInput = saasChangesModal.querySelector('#saas-changes-filter');
    saasChangesFilterInput.addEventListener('input', applySaasChangesFilter);
    const close = () => { saasChangesModal.hidden = true; };
    saasChangesModal.querySelector('[data-role="close"]').addEventListener('click', close);
    saasChangesModal.addEventListener('click', (event) => { if (event.target === saasChangesModal) close(); });
}

// Client-side filter across every visible cell (Usuario/Registro/Cambio/
// Solicitó/Autorizó) — the modal's own dataset is already fetched and small
// enough that no server round-trip is needed, same "hide rows that don't
// match" approach as applySaasTeamFilters above.
function applySaasChangesFilter() {
    const text = (saasChangesFilterInput?.value || '').trim().toLowerCase();
    saasChangesList.querySelectorAll('tr').forEach((tr) => {
        tr.hidden = !!text && !tr.textContent.toLowerCase().includes(text);
    });
}
function renderSaasChangeRow(cells) {
    const tr = document.createElement('tr');
    cells.forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
    });
    return tr;
}
// userId omitted = every account's history (toolbar button); passed = just
// that one account's (per-row button) -- same "narrower scope, same
// endpoint family" idea as Dashboard.js's own openChangeHistory.
async function openSaasUserChanges(userId) {
    ensureSaasChangesModal();
    saasChangesModal.hidden = false;
    saasChangesModal.querySelector('#saas-user-history-title').textContent = userId ? Dashboard.t('main.changeHistoryTitleRecord') : Dashboard.t('main.changeHistoryTitle');
    if (saasChangesFilterInput) saasChangesFilterInput.value = '';
    saasChangesList.innerHTML = '';
    saasChangesList.appendChild(renderSaasChangeRow([Dashboard.t('main.changeHistoryEmpty'), '', '', '', '', '']));
    try {
        const url = userId ? `/api/admin/saas-users/${userId}/changes` : '/api/admin/saas-users/changes';
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const { changes } = await res.json();
        if (!changes || !changes.length) return;
        saasChangesList.innerHTML = '';
        changes.forEach((change) => {
            let description;
            if (change.action === 'create') description = Dashboard.t('main.changeHistoryCreated');
            else if (change.field_key === 'business.saasUserPassword') description = Dashboard.t('admin.saasResetPassword');
            else description = `${Dashboard.t(change.field_key)}: "${change.old_value || '—'}" → "${change.new_value || '—'}"`;
            saasChangesList.appendChild(renderSaasChangeRow([
                change.changed_at, change.changed_by || '—', change.record_label || '—', description,
                change.requested_by || '—', change.authorized_by || '—',
            ]));
        });
    } catch {
        // Leave the empty-state row in place, same as the shared modal.
    }
}
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
        pendingVisibleStatuses = data.visibleStatuses && data.visibleStatuses.length ? data.visibleStatuses : ['habilitado'];
        expandedScreens = new Set();
        renderTreeList();
        window.VisibleStatusesChips.render(treeVisibleStatuses, pendingVisibleStatuses, (next) => { pendingVisibleStatuses = next; });
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
        // Same one-Guardar-saves-both idea as Business-Usuarios.js's own
        // grant-access-save (confirmed live, 2026-09-27: "Sí, ahí mismo en
        // el modal").
        const [grantsRes, statusesRes] = await Promise.all([
            fetch(`/api/admin/saas-users/${selectedUserId}/grants`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ grants: treeGrants }),
            }),
            fetch(`/api/admin/saas-users/${selectedUserId}/visible-statuses`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ statuses: pendingVisibleStatuses }),
            }),
        ]);
        if (!grantsRes.ok || !statusesRes.ok) {
            const body = await (!grantsRes.ok ? grantsRes : statusesRes).json().catch(() => ({}));
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
        // Wired here (after loadSaasUsers, not right after initDashboard
        // above) -- Dashboard.t()'s language dict apparently isn't fully
        // populated the instant initDashboard's own promise resolves, only
        // a few ticks later; loadSaasUsers' own network round trip is
        // what gives it time to catch up before any OTHER Dashboard.t call
        // in this file runs, which is why only this one (placed right after
        // the bare await) ever showed the raw key instead of translated
        // text.
        const historyToolbarBtn = document.getElementById('saas-team-history-btn');
        if (historyToolbarBtn) {
            historyToolbarBtn.title = Dashboard.t('main.changeHistory');
            historyToolbarBtn.addEventListener('click', () => openSaasUserChanges());
        }
    } catch (err) {
        console.error('Admin (Equipo SaaS) failed to initialize:', err);
    }
})();
