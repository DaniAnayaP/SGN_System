// ---------------------------------------------------------------------------
// "Equipo SaaS" — GEIPSA's own staff accounts (role='admin'). Before this
// screen, the ONLY way to have a role='admin' account was the seeded
// admin/admin user — no endpoint ever created another one, and no admin
// could be restricted from anything. This screen: (1) lets an admin create
// more admin accounts, (2) lets an admin configure another account's access
// to the 3 SaaS screens (Nuestros Clientes / Nuestros Planes / Costos de
// Módulos), including the granular "Autorizar Planes" permission under
// Nuestros Planes. CORRECTED 2026-09-28: an account with NO grants at all
// used to mean unrestricted (sees/does everything); confirmed live that's
// wrong for anyone except the one designated super-admin (users.
// is_saas_super_admin, only admin_saas and the Pruebas_SGN training
// account have it) -- a brand-new "+ Nuevo Admin SaaS" account starts with
// zero grants same as always, but now that correctly means it sees/does
// NOTHING until this screen's own tree below grants it something, same
// "empty = no access" the client side's own profiles already had. Shell
// comes from Dashboard.js.
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
// Same role as Business-Usuarios.js's own pendingVisibleStatuses -- where
// the chip row's current selection lives while this modal is open.
let pendingVisibleStatuses = ['habilitado'];

let saasUsers = [];
let selectedUserId = null;

// The real access tree (replaces the old flat SAAS_PERMISSION_CATALOG,
// 2026-10-02): walks window.SAAS_ADMIN_CATALOG (SaasAdminCatalog.js), the
// SAME deep catalog Admin-ArbolMaestroSaaS.js uses for its own Estatus
// tree, down to real columns/acciones/tableActions. A leaf's sub_item_id
// is "<apartadoId>::<sufijo>" (c#/ta#/a# by position, same leafKey
// convention that file already uses, minus its itemId prefix since itemId
// is saas_user_grants' own column) -- see db.js's one-time migration
// comment for the full old->new mapping and why the ORDER of
// columnas/acciones/tableActions in SaasAdminCatalog.js must not change in
// production (same accepted risk as the Estatus tree).

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
        editNameBtn.setAttribute('data-help-key', 'saasEditName');
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

        // Editar usuario -- same pattern as Editar nombre above, confirmed
        // live, 2026-09-28: renaming the seeded admin account's username to
        // admin_saas. Own icon (bx-user, not bx-edit) so the two edit
        // actions read as distinct controls, not duplicates.
        const editUsernameBtn = document.createElement('button');
        editUsernameBtn.type = 'button';
        editUsernameBtn.className = 'admin-icon-btn';
        editUsernameBtn.setAttribute('aria-label', Dashboard.t('admin.saasEditUsername'));
        editUsernameBtn.title = Dashboard.t('admin.saasEditUsername');
        editUsernameBtn.setAttribute('data-help-key', 'saasEditUsername');
        editUsernameBtn.innerHTML = '<i class="bx bx-user" aria-hidden="true"></i>';
        editUsernameBtn.addEventListener('click', async () => {
            const nextUsername = window.prompt(Dashboard.t('admin.saasEditUsernamePrompt'), user.username);
            if (nextUsername == null) return; // cancelled
            const trimmed = nextUsername.trim();
            if (!trimmed || trimmed === user.username) return;
            try {
                const res = await fetch(`/api/admin/saas-users/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ username: trimmed }),
                });
                if (!res.ok) throw new Error(res.status === 409 ? 'taken' : 'update failed');
                Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
                await loadSaasUsers();
            } catch (err) {
                Dashboard.showToast(err.message === 'taken' ? Dashboard.t('admin.saasUsernameTaken') : Dashboard.t('admin.saveError'), 'error');
            }
        });
        tdActions.appendChild(editUsernameBtn);

        const treeBtn = document.createElement('button');
        treeBtn.type = 'button';
        treeBtn.className = 'admin-icon-btn';
        treeBtn.setAttribute('aria-label', Dashboard.t('admin.saasTreeTitle'));
        treeBtn.title = Dashboard.t('admin.saasTreeTitle');
        treeBtn.setAttribute('data-help-key', 'saasAccountAccess');
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
        resetPwBtn.setAttribute('data-help-key', 'saasResetPassword');
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
        historyBtn.setAttribute('data-help-key', 'changeHistory');
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
// Mismo diálogo de Historial de cambios que todas las pantallas (Dashboard.js,
// openChangeHistoryWithRows): tabla del sistema con su barra de iconos y los
// embudos de cada columna. Aquí solo se piden los datos de esta pantalla
// (/api/admin/saas-users/..., sin cliente) y la franja de color de la
// clasificación de cada campo.
//
// Classification color stripe -- fixed, param-less endpoint (only 3 of the
// 6 possible field_keys ever resolve, see getEffectiveSaasUserFieldClassifications
// in db.js), so one cached promise is enough.
let saasUserFieldClassificationsPromise = null;
function fetchSaasUserFieldClassifications() {
    if (!saasUserFieldClassificationsPromise) {
        saasUserFieldClassificationsPromise = fetch('/api/admin/saas-user-field-classifications', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : { fields: {} }))
            .catch(() => ({ fields: {} }));
    }
    return saasUserFieldClassificationsPromise;
}
// De una fila del árbol de accesos ("saas-clients::tabla::ta2") a su camino legible:
// "Nuestros Clientes › Tabla principal › Editar".
function describeGrantNode(nodeKey) {
    const [itemId, apartadoId, suffix] = String(nodeKey || '').split('::');
    const generalItem = GENERAL_ACCESS_ITEMS.find((i) => i.itemId === itemId);
    if (generalItem) return [Dashboard.t('admin.saasMasterTreeGeneral'), Dashboard.t('sidebar.generalAccess'), Dashboard.t(generalItem.labelKey)].join(' › ');
    const navItem = NAV_ACCESS_ITEMS.find((i) => i.itemId === itemId);
    if (navItem) return [Dashboard.t('admin.saasMasterTreeGeneral'), Dashboard.t('menu.navIcons'), Dashboard.t(navItem.labelKey)].join(' › ');
    for (const group of (window.SAAS_ADMIN_CATALOG || [])) {
        const screen = group.screens.find((s) => s.itemId === itemId);
        if (!screen) continue;
        const parts = [Dashboard.t(screen.labelKey)];
        const apartado = apartadoId ? screen.apartados.find((a) => a.id === apartadoId) : null;
        if (apartado) {
            parts.push(apartado.label);
            const leaf = suffix ? buildRealLeaves(apartado).find((l) => l.suffix === suffix) : null;
            if (leaf) parts.push(leaf.label);
        }
        return parts.join(' › ');
    }
    return nodeKey;
}

// nodeKey (opcional): solo los cambios de esa fila del árbol de accesos y de lo que cuelga de ella.
async function loadSaasUserChangeRows(userId, nodeKey) {
    const base = userId ? `/api/admin/saas-users/${userId}/changes` : '/api/admin/saas-users/changes';
    const url = nodeKey ? `${base}?nodeKey=${encodeURIComponent(nodeKey)}` : base;
    const [res, classifications] = await Promise.all([fetch(url, { credentials: 'include' }), fetchSaasUserFieldClassifications()]);
    if (!res.ok) throw new Error('load failed');
    const { changes } = await res.json();
    const fieldClassifications = classifications.fields || {};
    return (changes || []).map((change) => {
        let description;
        let stripe = '';
        if (change.action === 'create') {
            description = Dashboard.t('main.changeHistoryCreated');
        } else if (change.field_key === 'business.saasUserPassword') {
            description = Dashboard.t('admin.saasResetPassword');
        } else if (change.field_key === 'business.saasUserGrant') {
            const yesNo = (v) => Dashboard.t(v === 'true' ? 'admin.saasAccessYes' : 'admin.saasAccessNo');
            description = Dashboard.t('admin.saasAccessChange', { node: describeGrantNode(change.node_key), from: yesNo(change.old_value), to: yesNo(change.new_value) });
            stripe = fieldClassifications[change.field_key]?.color || '';
        } else {
            description = `${Dashboard.t(change.field_key)}: "${change.old_value || '—'}" → "${change.new_value || '—'}"`;
            stripe = fieldClassifications[change.field_key]?.color || '';
        }
        return {
            cells: [
                change.changed_at, change.changed_by || '—', change.record_label || '—', description,
                change.requested_by || '—', change.authorized_by || '—',
            ],
            stripe,
        };
    });
}
// userId omitted = every account's history (toolbar button); passed = just
// that one account's (per-row button).
function openSaasUserChanges(userId) {
    return Dashboard.openChangeHistoryWithRows(
        Dashboard.t(userId ? 'main.changeHistoryTitleRecord' : 'main.changeHistoryTitle'),
        () => loadSaasUserChangeRows(userId),
    );
}
// El reloj de una fila del árbol de accesos: solo lo que se dio o se quitó en esa fila.
function openSaasAccessNodeHistory(nodeKeys, label) {
    return Dashboard.openChangeHistoryWithRows(
        `${Dashboard.t('main.changeHistory')} — ${label}`,
        () => loadSaasUserChangeRows(selectedUserId, nodeKeys),
    );
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
// Same .perm-tree-row markup PermissionTree.js/PermissionCostTree.js/
// Admin-ArbolMaestroSaaS.js use for every other checkbox/chevron tree in
// the app (chevron toggle + checkbox, indented by depth) -- NOT those
// components themselves, same "small purpose-built renderer, not the
// bigger shared machinery" reasoning Admin-ArbolMaestroSaaS.js's own
// header comment gives for not reusing PermissionTree.js. hasGrant/
// setGrant/buildPermTreeRow stay generic over plain {itemId, subItemId}
// pairs regardless of which catalog is walked -- only renderTreeList and
// its helpers below changed when this moved from the flat catalog to the
// real tree.
let treeGrants = [];
let expandedRealNodes = new Set();
// Igual que el Árbol Maestro, el diálogo abre todo contraído (General, Servicio a Cliente y
// Configuración SaaS incluidos); aquí se anotan los que se abren, y se recuerdan mientras el
// diálogo siga abierto para que guardar o marcar una casilla no los pliegue.
let expandedAccessGroups = new Set();
function toggleAccessGroup(key) {
    if (expandedAccessGroups.has(key)) expandedAccessGroups.delete(key); else expandedAccessGroups.add(key);
    renderTreeList();
}
// Orden real del Árbol Maestro SaaS (saas_master_order): {groups, screensByGroup, apartadosByScreen,
// leavesByApartado}. El Maestro es quien manda el orden; la barra lateral ya lo aplica y este diálogo
// también, para que una cuenta vea sus accesos en el mismo orden que el Maestro y que la barra.
// Sin él (no cargó o nunca se reordenó) cada nivel queda en el orden del catálogo.
let masterOrder = null;
// Estatus de cada nodo en el Árbol Maestro SaaS, solo los que no son Habilitado (sin fila = Habilitado):
// [{ itemId, status }]. Solo lo Habilitado se le puede dar a una cuenta (también a las de prueba):
// lo que está en otro estatus se muestra en tono suave y con la casilla bloqueada.
let masterStatusOverrides = [];
const MASTER_STATUS_LABEL_KEYS = {
    habilitado: 'admin.masterTreeStatusHabilitadoMed',
    inhabilitado: 'admin.masterTreeStatusInhabilitado',
    construccion: 'admin.masterTreeStatusConstruccion',
    mejoras: 'admin.masterTreeStatusMejoras',
};
function statusLabel(status) {
    return Dashboard.t(MASTER_STATUS_LABEL_KEYS[status] || MASTER_STATUS_LABEL_KEYS.inhabilitado);
}
// Mismo cálculo que resolveSaasNodeStatus de Dashboard.js: gana el estatus del primer ancestro
// (o del propio nodo) que el Maestro tenga fuera de Habilitado.
function resolveMasterStatus(key) {
    if (!masterStatusOverrides.length) return 'habilitado';
    const parts = String(key).split('::');
    for (let i = 1; i <= parts.length; i += 1) {
        const prefix = parts.slice(0, i).join('::');
        const hit = masterStatusOverrides.find((r) => r.itemId === prefix);
        if (hit) return hit.status;
    }
    return 'habilitado';
}
function groupIdOfScreen(itemId) {
    const group = (window.SAAS_ADMIN_CATALOG || []).find((g) => g.screens.some((s) => s.itemId === itemId));
    return group ? group.groupId : null;
}
// El estatus que impide darle este acceso a la cuenta (el del propio nodo o el de su grupo, que
// esconde todo lo que lleva dentro), o null si está Habilitado.
function blockingStatus(pair) {
    const key = pair.subItemId ? `${pair.itemId}::${pair.subItemId}` : pair.itemId;
    const own = resolveMasterStatus(key);
    if (own !== 'habilitado') return own;
    const groupId = groupIdOfScreen(pair.itemId);
    if (groupId) {
        const groupStatus = resolveMasterStatus(groupId);
        if (groupStatus !== 'habilitado') return groupStatus;
    }
    return null;
}

function hasGrant(itemId, subItemId) {
    return treeGrants.some((g) => g.itemId === itemId && (subItemId ? g.subItemId === subItemId : !g.subItemId));
}
function setGrant(itemId, subItemId, checked) {
    treeGrants = treeGrants.filter((g) => !(g.itemId === itemId && (subItemId ? g.subItemId === subItemId : !g.subItemId)));
    if (checked) treeGrants.push({ itemId, subItemId: subItemId || null });
}

// --- Filas con las mismas clases del Árbol de Permisos Maestro SaaS -----------------
// Admin-ArbolMaestroSaaS.js arma cada fila como: espacio de arrastre + chevron +
// iconos + nombre + contador + celdas de control (Clasificación, Estatus, Aplicar a
// anidados, ..., Cambios). Aquí es lo mismo, con la casilla de acceso donde el Maestro
// pone los iconos Web/App y la pastilla de Acceso donde pone el Estatus; sin las
// columnas Web · App y Navegar, que hablan de cómo está publicada una pantalla.
// "General" del Maestro: lo que se ve en toda pantalla (Inicio, Tablero, Buscar y los iconos de
// la barra superior). Dashboard.js lo controla por cuenta con hasSaasScreenGrant(itemId): sin su
// acceso, la cuenta no ve ese elemento. Son accesos sueltos (itemId, sin subItemId). Panel y las
// opciones del menú de Configuración que el Maestro también lista no se piden aquí: ninguna de las
// dos se controla por cuenta (Configuración entra o sale completa, con su icono).
const GENERAL_ACCESS_ITEMS = [
    { itemId: 'saas-home', labelKey: 'menu.home' },
    { itemId: 'saas-board', labelKey: 'menu.dashboard' },
    { itemId: 'saas-search', labelKey: 'main.search' },
];
const NAV_ACCESS_ITEMS = [
    { itemId: 'saas-nav-messages', labelKey: 'main.messages' },
    { itemId: 'saas-nav-chatbot', labelKey: 'main.chatbot' },
    { itemId: 'saas-nav-notifications', labelKey: 'main.notifications' },
    { itemId: 'saas-nav-bookmarks', labelKey: 'main.bookmarks' },
    { itemId: 'saas-nav-ui-scale', labelKey: 'main.uiScale' },
    { itemId: 'saas-nav-settings', labelKey: 'main.settings' },
    { itemId: 'saas-nav-user', labelKey: 'main.userInfo' },
    { itemId: 'saas-nav-business', labelKey: 'main.businessProfile' },
    { itemId: 'saas-nav-help', labelKey: 'main.helpMode' },
];
const looseGrantPairs = (items) => items.map((i) => ({ itemId: i.itemId, subItemId: null }));
const GENERAL_NAV_KEY = 'general:nav';

const ACCESS_LEVELS = {
    general: { labelKey: 'admin.masterTreeGeneralClassification', color: '#9A6B00' },
    icon: { labelKey: 'admin.masterTreeLevelIcono', color: '#B3261E' },
    group: { labelKey: 'admin.masterTreeLevelApartado', color: '#9A6B00' },
    screen: { labelKey: 'main.colSysPantalla', color: '#3A4BC9' },
    tabla: { labelKey: 'main.tablePrefix', color: '#5C6079' },
    modal: { labelKey: 'admin.masterTreeLevelApartado', color: '#9A6B00' },
    column: { labelKey: 'admin.saasAccessLevelColumn', color: '#5C6079' },
    action: { labelKey: 'admin.saasAccessLevelAction', color: '#0E7C86' },
};

function accessSpacer() {
    const s = document.createElement('span');
    s.className = 'perm-tree-toggle-spacer';
    return s;
}
function accessToggleBtn(expanded, onToggle) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'perm-tree-toggle';
    btn.setAttribute('aria-expanded', String(expanded));
    btn.innerHTML = '<i class="bx bx-chevron-down" aria-hidden="true"></i>';
    btn.addEventListener('click', onToggle);
    return btn;
}
function accessHistoryButton(historyKeys, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'perm-tree-mstatus-nest-btn';
    btn.title = Dashboard.t('main.changeHistory');
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('data-help-key', 'changeHistory');
    btn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openSaasAccessNodeHistory(historyKeys, label);
    });
    return btn;
}

// pairs: [{ itemId, subItemId }] de todo lo que cuelga de la fila (o solo ella, si es una hoja).
function buildAccessRow({ depth, label, level, pairs, toggle, nodeKey, isLeaf, historyKeys }) {
    // Lo que el Maestro no tiene Habilitado no se puede dar: se cuenta aparte y su casilla queda
    // bloqueada (un acceso viejo ya guardado sí se puede quitar).
    const blockedStatuses = pairs.map(blockingStatus);
    const openPairs = pairs.filter((_, i) => !blockedStatuses[i]);
    const blockedCount = pairs.length - openPairs.length;
    const fullyBlocked = openPairs.length === 0;
    // El total cuenta TODO lo que hay en la fila, también lo bloqueado (que no se puede dar): una fila con
    // 9 opciones de las que solo 1 está Habilitada dice 1/9 y queda en Parcial, no 1/1.
    const total = pairs.length;
    const granted = pairs.filter((p) => hasGrant(p.itemId, p.subItemId)).length;
    const state = total > 0 && granted === total ? 'all' : (granted > 0 ? 'part' : 'none');
    // Ya está dado todo lo que se puede dar: tocar la casilla lo quita (en vez de no hacer nada).
    const openAllGranted = openPairs.length > 0 && openPairs.every((p) => hasGrant(p.itemId, p.subItemId));
    const locked = fullyBlocked && granted === 0;
    const lockedStatuses = [...new Set(blockedStatuses.filter(Boolean))];
    const lockTitle = fullyBlocked ? Dashboard.t('admin.saasAccessBlocked', { status: lockedStatuses.map(statusLabel).join(' / ') }) : '';
    const row = document.createElement('div');
    row.className = `perm-tree-row perm-tree-depth-${depth}`;
    if (fullyBlocked) row.classList.add('saas-access-row-blocked');
    row.dataset.nodeKey = nodeKey;
    row.appendChild(accessSpacer());
    row.appendChild(toggle ? accessToggleBtn(toggle.expanded, toggle.onToggle) : accessSpacer());

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'saas-access-check';
    check.checked = state === 'all';
    check.indeterminate = state === 'part';
    check.disabled = locked;
    if (fullyBlocked) check.title = lockTitle;
    check.setAttribute('aria-label', label);
    check.setAttribute('data-help-key', 'saasAccessCheck');
    check.addEventListener('change', () => {
        // Tocarla da lo que está abierto; si ya está dado todo eso (o solo queda un acceso viejo bloqueado),
        // quita todo lo de la fila.
        if (!fullyBlocked && !openAllGranted) openPairs.forEach((p) => setGrant(p.itemId, p.subItemId, true));
        else pairs.forEach((p) => setGrant(p.itemId, p.subItemId, false));
        renderTreeList();
    });
    row.appendChild(check);

    const labelNode = document.createElement('span');
    labelNode.className = 'perm-tree-mstatus-label';
    labelNode.textContent = label;
    labelNode.title = label;
    labelNode.setAttribute('data-help-key', 'saasAccessCheck');
    row.appendChild(labelNode);
    const count = document.createElement('span');
    count.className = 'perm-tree-mstatus-count-badge';
    count.textContent = isLeaf ? '1' : `${granted}/${Math.max(1, total)}`;
    if (!fullyBlocked && blockedCount > 0) count.title = Dashboard.t('admin.saasAccessBlockedSome', { n: blockedCount });
    count.setAttribute('data-help-key', 'saasAccessCount');
    count.setAttribute('aria-label', Dashboard.t('admin.masterTreeColCount'));
    row.appendChild(count);

    const controls = document.createElement('div');
    controls.className = 'perm-tree-mstatus-controls';

    const classCell = document.createElement('div');
    classCell.className = 'perm-tree-mstatus-class-cell';
    const badgeInfo = ACCESS_LEVELS[level];
    const badge = document.createElement('span');
    badge.className = 'perm-tree-mstatus-class-badge';
    badge.textContent = Dashboard.t(badgeInfo.labelKey);
    badge.style.color = badgeInfo.color;
    badge.style.borderColor = badgeInfo.color;
    badge.style.backgroundColor = `color-mix(in srgb, ${badgeInfo.color} 14%, var(--color-bg))`;
    classCell.appendChild(badge);
    controls.appendChild(classCell);

    const statusCell = document.createElement('div');
    statusCell.className = 'perm-tree-mstatus-status-cell';
    const pill = document.createElement('span');
    pill.className = `saas-access-pill saas-access-pill-${state}`;
    pill.textContent = Dashboard.t(isLeaf
        ? (state === 'all' ? 'admin.saasAccessYes' : 'admin.saasAccessNo')
        : (state === 'all' ? 'admin.saasAccessAll' : (state === 'part' ? 'admin.saasAccessPartial' : 'admin.saasAccessNone')));
    if (fullyBlocked) {
        pill.className = 'saas-access-pill saas-access-pill-blocked';
        pill.textContent = lockedStatuses.length === 1 ? statusLabel(lockedStatuses[0]) : Dashboard.t('admin.saasAccessBlockedShort');
        pill.title = lockTitle;
    }
    pill.setAttribute('data-help-key', 'saasAccessState');
    pill.setAttribute('aria-label', pill.textContent);
    statusCell.appendChild(pill);
    controls.appendChild(statusCell);

    const nestCell = document.createElement('div');
    nestCell.className = 'perm-tree-mstatus-status-nest-cell';
    if (!isLeaf && total > 0) {
        const nest = document.createElement('div');
        nest.className = 'saas-access-nest';
        [['admin.saasAccessAllBtn', 'admin.saasAccessAllTitle', true], ['admin.saasAccessNoneBtn', 'admin.saasAccessNoneTitle', false]].forEach(([textKey, titleKey, value]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'saas-access-nest-btn';
            btn.textContent = Dashboard.t(textKey);
            btn.title = Dashboard.t(titleKey);
            btn.setAttribute('data-help-key', 'saasAccessAllNone');
            // "Todo" solo da lo abierto; "Nada" quita todo lo de la fila (y no hace falta si no hay nada).
            btn.disabled = value ? fullyBlocked : locked;
            btn.addEventListener('click', () => { (value ? openPairs : pairs).forEach((p) => setGrant(p.itemId, p.subItemId, value)); renderTreeList(); });
            nest.appendChild(btn);
        });
        nestCell.appendChild(nest);
    }
    controls.appendChild(nestCell);

    const historyCell = document.createElement('div');
    historyCell.className = 'perm-tree-mstatus-history-cell';
    historyCell.appendChild(accessHistoryButton(historyKeys || nodeKey, label));
    controls.appendChild(historyCell);

    row.appendChild(controls);
    return row;
}

function buildAccessHeader() {
    const header = document.createElement('div');
    header.className = 'perm-tree-mstatus-header';
    const spacerEl = document.createElement('span');
    spacerEl.className = 'perm-tree-mstatus-header-spacer';
    header.appendChild(spacerEl);
    const labelHeader = document.createElement('span');
    labelHeader.className = 'perm-tree-mstatus-header-label';
    const labelText = document.createElement('span');
    labelText.textContent = Dashboard.t('admin.masterTreeColScreenApartadoColumn');
    labelText.setAttribute('data-help-key', 'saasAccessDialog');
    const labelCount = document.createElement('span');
    labelCount.className = 'perm-tree-mstatus-header-count';
    labelCount.setAttribute('data-help-key', 'saasAccessCount');
    labelCount.textContent = Dashboard.t('admin.masterTreeColCount');
    labelHeader.append(labelText, labelCount);
    header.appendChild(labelHeader);
    const controls = document.createElement('div');
    controls.className = 'perm-tree-mstatus-header-controls';
    const cols = [
        ['perm-tree-mstatus-header-class', `<i class="bx bx-purchase-tag-alt" aria-hidden="true"></i> ${Dashboard.t('admin.masterTreeColClassification')}`],
        ['perm-tree-mstatus-header-status', Dashboard.t('admin.saasAccessCol')],
        ['perm-tree-mstatus-header-status-nest', `<i class="bx bx-copy" aria-hidden="true"></i> ${Dashboard.t('admin.masterTreeColApplyNested')}`],
        ['perm-tree-mstatus-header-history', `<i class="bx bx-history" aria-hidden="true"></i> ${Dashboard.t('admin.masterTreeColHistory')}`],
    ];
    cols.forEach(([cls, html]) => {
        const col = document.createElement('span');
        col.className = `perm-tree-mstatus-header-col ${cls}`;
        const helpKey = { 'perm-tree-mstatus-header-status': 'saasAccessState', 'perm-tree-mstatus-header-status-nest': 'saasAccessAllNone' }[cls];
        if (helpKey) col.setAttribute('data-help-key', helpKey);
        col.innerHTML = html;
        controls.appendChild(col);
    });
    header.appendChild(controls);
    return header;
}

// Mismo ajuste que alignLabelColumnWidth en Admin-ArbolMaestroSaaS.js: el nombre + el
// contador de todas las filas visibles terminan en la misma x, sin importar la sangría.
let accessMeasureCtx = null;
function measureAccessText(text, font) {
    if (!accessMeasureCtx) accessMeasureCtx = document.createElement('canvas').getContext('2d');
    accessMeasureCtx.font = font;
    return accessMeasureCtx.measureText(text).width;
}
function alignAccessLabelColumn() {
    const labels = treeList.querySelectorAll('.perm-tree-mstatus-label');
    if (!labels.length) return;
    const treeLeft = treeList.getBoundingClientRect().left;
    let maxRightEdge = 0;
    const measured = [];
    labels.forEach((label) => {
        const labelRect = label.getBoundingClientRect();
        const offsetLeft = labelRect.left - treeLeft;
        const badge = label.nextElementSibling && label.nextElementSibling.classList.contains('perm-tree-mstatus-count-badge')
            ? label.nextElementSibling : null;
        const trailing = badge ? badge.getBoundingClientRect().right - labelRect.right : 0;
        const rightEdge = offsetLeft + measureAccessText(label.textContent, getComputedStyle(label).font) + trailing;
        if (rightEdge > maxRightEdge) maxRightEdge = rightEdge;
        measured.push({ label, offsetLeft, trailing });
    });
    const target = Math.ceil(maxRightEdge) + 8;
    const headerLabel = treeList.querySelector('.perm-tree-mstatus-header-label');
    const headerOffsetLeft = headerLabel ? headerLabel.getBoundingClientRect().left - treeLeft : 0;
    treeList.style.setProperty('--perm-tree-label-col-width', `${Math.max(0, target - headerOffsetLeft)}px`);
    measured.forEach(({ label, offsetLeft, trailing }) => {
        label.style.width = `${Math.max(0, target - offsetLeft - trailing)}px`;
    });
}

// --- Real-tree walking helpers ------------------------------------------
// Pure functions over SAAS_ADMIN_CATALOG -- same algorithm
// Admin-ArbolMaestroSaaS.js already uses for its own Estatus tree
// (nestedChildrenOf/buildNestedByColumn there), copied rather than
// imported since that file is deliberately its own small renderer with no
// shared module to pull from (see its own header comment). A modal
// apartado only ever nests under the real column/acción that pops it up
// (nestUnder.column, matched by exact label) -- the rare
// nestUnder.classification case (just modal-tipo-giro today) has no
// classification bands in THIS simpler tree, so it renders as a plain
// extra child at the end of its host apartado's own leaf list instead.
function nestedChildrenOf(screen, apartado) {
    return screen.apartados.filter((a) => a.nestUnder && a.nestUnder.host === apartado.id);
}
function buildNestedByColumn(screen, apartado) {
    const map = new Map();
    nestedChildrenOf(screen, apartado).forEach((child) => {
        if (!child.nestUnder.column) return;
        const arr = map.get(child.nestUnder.column) || [];
        arr.push(child);
        map.set(child.nestUnder.column, arr);
    });
    return map;
}
function nestedWithoutColumn(screen, apartado) {
    return nestedChildrenOf(screen, apartado).filter((a) => !a.nestUnder.column);
}
// columnas/tableActions/acciones each get their own position-stable suffix
// prefix (c#/ta#/a#) -- same shape leafKey builds in Admin-ArbolMaestroSaaS.js.
function buildRealLeaves(apartado) {
    const leaves = [];
    (apartado.columnas || []).forEach((label, idx) => leaves.push({ suffix: `c${idx}`, label }));
    (apartado.tableActions || []).forEach((label, idx) => leaves.push({ suffix: `ta${idx}`, label }));
    (apartado.acciones || []).forEach((label, idx) => leaves.push({ suffix: `a${idx}`, label }));
    return leaves;
}
function realLeafSubItemId(apartado, leaf) {
    return `${apartado.id}::${leaf.suffix}`;
}
// Recurses into nested modals so a host apartado's own rollup checkbox
// covers everything nested under it too (same "a container's checkbox
// reflects its whole subtree" expectation every other tree in this app
// already has).
function collectRealSubItemIds(screen, apartado) {
    const own = buildRealLeaves(apartado).map((leaf) => realLeafSubItemId(apartado, leaf));
    const nested = nestedChildrenOf(screen, apartado).flatMap((child) => collectRealSubItemIds(screen, child));
    return [...own, ...nested];
}

// Lo guardado en el Maestro va primero y en su orden; lo que el Maestro no menciona (algo nuevo del
// catálogo) se queda al final en su posición original -- nunca se pierde nada.
function applySavedOrder(items, savedIds, idOf) {
    if (!Array.isArray(savedIds) || !savedIds.length) return items;
    const byId = new Map(items.map((item) => [idOf(item), item]));
    const first = savedIds.map((id) => byId.get(id)).filter(Boolean);
    const used = new Set(first);
    return [...first, ...items.filter((item) => !used.has(item))];
}
function orderedGroups() {
    return applySavedOrder(window.SAAS_ADMIN_CATALOG || [], masterOrder?.groups, (g) => g.groupId);
}
function orderedScreens(group) {
    return applySavedOrder(group.screens, masterOrder?.screensByGroup?.[group.groupId], (s) => s.itemId);
}
function orderedApartados(screen, apartados) {
    return applySavedOrder(apartados, masterOrder?.apartadosByScreen?.[screen.itemId], (a) => a.id);
}
function orderedRealLeaves(screen, apartado) {
    return applySavedOrder(buildRealLeaves(apartado), masterOrder?.leavesByApartado?.[`${screen.itemId}::${apartado.id}`], (l) => l.suffix);
}

// Pares { itemId, subItemId } de todo lo que cuelga de una pantalla (o de uno de sus apartados).
function pairsOfApartados(screen, apartados) {
    return apartados.flatMap((a) => collectRealSubItemIds(screen, a)).map((subItemId) => ({ itemId: screen.itemId, subItemId }));
}
function apartadoLevel(apartado) {
    return (apartado.id === 'tabla' || apartado.controlInterno) ? 'tabla' : 'modal';
}
function toggleAccessNode(nodeKey) {
    if (expandedRealNodes.has(nodeKey)) expandedRealNodes.delete(nodeKey); else expandedRealNodes.add(nodeKey);
    renderTreeList();
}

// Renders `apartado`'s own row (chevron + casilla de acceso del apartado completo) into
// `rows`, recursing into its body when expanded. Used identically for a screen's top-level
// apartados and for a nested modal popping up from one of their columns/acciones.
function renderApartadoNode(screen, apartado, depth, rows) {
    const nodeKey = `${screen.itemId}::${apartado.id}`;
    const expanded = expandedRealNodes.has(nodeKey);
    rows.push(buildAccessRow({
        depth, label: apartado.label, level: apartadoLevel(apartado),
        pairs: pairsOfApartados(screen, [apartado]), nodeKey,
        toggle: { expanded, onToggle: () => toggleAccessNode(nodeKey) },
    }));
    if (!expanded) return;
    renderApartadoLeaves(screen, apartado, depth + 1, rows);
}

function renderApartadoLeaves(screen, apartado, depth, rows) {
    const nestedByColumn = buildNestedByColumn(screen, apartado);
    orderedRealLeaves(screen, apartado).forEach((leaf) => {
        const subItemId = realLeafSubItemId(apartado, leaf);
        const childApartados = nestedByColumn.get(leaf.label) || [];
        const nodeKey = `${screen.itemId}::${subItemId}`;
        const hasChildren = childApartados.length > 0;
        const expanded = expandedRealNodes.has(nodeKey);
        // Una columna que abre una ventana (modal) suma lo de esa ventana a su propia casilla.
        const pairs = hasChildren
            ? [{ itemId: screen.itemId, subItemId }, ...pairsOfApartados(screen, childApartados)]
            : [{ itemId: screen.itemId, subItemId }];
        rows.push(buildAccessRow({
            depth, label: leaf.label, level: leaf.suffix.startsWith('c') ? 'column' : 'action',
            pairs, nodeKey, isLeaf: !hasChildren,
            toggle: hasChildren ? { expanded, onToggle: () => toggleAccessNode(nodeKey) } : null,
        }));
        if (hasChildren && expanded) {
            childApartados.forEach((child) => renderApartadoNode(screen, child, depth + 1, rows));
        }
    });
    nestedWithoutColumn(screen, apartado).forEach((child) => renderApartadoNode(screen, child, depth, rows));
}

// Líneas punteadas que unen una fila abierta con lo que cuelga de ella -- las mismas que
// dibuja drawGuides en Admin-ArbolMaestroSaaS.js.
function drawAccessGuides() {
    treeList.querySelectorAll('.perm-tree-nest-guide').forEach((el) => el.remove());
    const rows = Array.from(treeList.children).filter((el) => el.classList.contains('perm-tree-row'));
    const containerRect = treeList.getBoundingClientRect();
    const depthOf = (el) => {
        const m = el.className.match(/perm-tree-depth-(\d+)/);
        return m ? Number(m[1]) : -1;
    };
    rows.forEach((row, i) => {
        const toggle = row.querySelector(':scope > .perm-tree-toggle[aria-expanded="true"]');
        if (!toggle) return;
        const depth = depthOf(row);
        let last = null;
        for (let j = i + 1; j < rows.length; j++) {
            if (depthOf(rows[j]) <= depth) break;
            last = rows[j];
        }
        if (!last) return;
        const anchorRect = toggle.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const guide = document.createElement('div');
        guide.className = 'perm-tree-nest-guide';
        guide.style.left = `${anchorRect.left - containerRect.left - 4 + treeList.scrollLeft}px`;
        guide.style.top = `${rowRect.bottom - containerRect.top + treeList.scrollTop}px`;
        guide.style.height = `${Math.max(0, last.getBoundingClientRect().bottom - rowRect.bottom)}px`;
        treeList.appendChild(guide);
    });
}

// General > Accesos Generales > Inicio / Tablero / Buscar + Iconos de Navegación > los iconos de
// la barra superior: el mismo orden y los mismos nombres que la fila General del Maestro.
function renderGeneralRows(rows) {
    const generalKey = 'general:main';
    const accessKey = 'general:access';
    const allPairs = [...looseGrantPairs(GENERAL_ACCESS_ITEMS), ...looseGrantPairs(NAV_ACCESS_ITEMS)];
    const allKeys = allPairs.map((p) => p.itemId);
    const generalExpanded = expandedAccessGroups.has(generalKey);
    rows.push(buildAccessRow({
        depth: 0, label: Dashboard.t('admin.saasMasterTreeGeneral'), level: 'general', pairs: allPairs, nodeKey: generalKey, historyKeys: allKeys.join(','),
        toggle: { expanded: generalExpanded, onToggle: () => toggleAccessGroup(generalKey) },
    }));
    if (!generalExpanded) return;
    const accessExpanded = expandedAccessGroups.has(accessKey);
    rows.push(buildAccessRow({
        depth: 1, label: Dashboard.t('sidebar.generalAccess'), level: 'group', pairs: allPairs, nodeKey: accessKey, historyKeys: allKeys.join(','),
        toggle: { expanded: accessExpanded, onToggle: () => toggleAccessGroup(accessKey) },
    }));
    if (!accessExpanded) return;
    GENERAL_ACCESS_ITEMS.forEach((item) => {
        rows.push(buildAccessRow({
            depth: 2, label: Dashboard.t(item.labelKey), level: 'screen', pairs: looseGrantPairs([item]), nodeKey: item.itemId, isLeaf: true,
        }));
    });
    const navExpanded = expandedRealNodes.has(GENERAL_NAV_KEY);
    rows.push(buildAccessRow({
        depth: 2, label: Dashboard.t('menu.navIcons'), level: 'icon', pairs: looseGrantPairs(NAV_ACCESS_ITEMS), nodeKey: GENERAL_NAV_KEY,
        historyKeys: NAV_ACCESS_ITEMS.map((i) => i.itemId).join(','),
        toggle: { expanded: navExpanded, onToggle: () => toggleAccessNode(GENERAL_NAV_KEY) },
    }));
    if (!navExpanded) return;
    NAV_ACCESS_ITEMS.forEach((item) => {
        rows.push(buildAccessRow({
            depth: 3, label: Dashboard.t(item.labelKey), level: 'icon', pairs: looseGrantPairs([item]), nodeKey: item.itemId, isLeaf: true,
        }));
    });
}

function renderTreeList() {
    treeList.innerHTML = '';
    treeList.appendChild(buildAccessHeader());
    const rows = [];
    renderGeneralRows(rows);
    orderedGroups().forEach((group) => {
        const groupKey = `group:${group.groupId}`;
        const groupExpanded = expandedAccessGroups.has(groupKey);
        const groupPairs = group.screens.flatMap((screen) => pairsOfApartados(screen, screen.apartados.filter((a) => !a.nestUnder)));
        rows.push(buildAccessRow({
            depth: 0, label: Dashboard.t(group.labelKey), level: 'group', pairs: groupPairs, nodeKey: groupKey,
            toggle: { expanded: groupExpanded, onToggle: () => toggleAccessGroup(groupKey) },
        }));
        if (!groupExpanded) return;
        orderedScreens(group).forEach((screen) => {
            const nodeKey = screen.itemId;
            const expanded = expandedRealNodes.has(nodeKey);
            const topApartados = orderedApartados(screen, screen.apartados.filter((a) => !a.nestUnder));
            rows.push(buildAccessRow({
                depth: 1, label: Dashboard.t(screen.labelKey), level: 'screen',
                pairs: pairsOfApartados(screen, topApartados), nodeKey,
                toggle: { expanded, onToggle: () => toggleAccessNode(nodeKey) },
            }));
            if (expanded) topApartados.forEach((apartado) => renderApartadoNode(screen, apartado, 2, rows));
        });
    });
    rows.forEach((row) => treeList.appendChild(row));
    // Alinear y dibujar las guías solo con el diálogo a la vista (medir un diálogo oculto da 0).
    if (!treeModal.hidden) { alignAccessLabelColumn(); drawAccessGuides(); }
}

async function openTreeModal(user) {
    selectedUserId = user.id;
    document.getElementById('saas-user-tree-modal-title').textContent = `${Dashboard.t('admin.saasTreeTitle')} — ${user.name}`;
    clearError(treeError);
    try {
        const [res, orderRes, statusRes] = await Promise.all([
            fetch(`/api/admin/saas-users/${user.id}/grants`, { credentials: 'include' }),
            fetch('/api/admin/saas-master-order', { credentials: 'include' }).catch(() => null),
            fetch('/api/admin/saas-master-status', { credentials: 'include' }).catch(() => null),
        ]);
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        masterStatusOverrides = [];
        if (statusRes && statusRes.ok) {
            const statusData = await statusRes.json().catch(() => null);
            masterStatusOverrides = (statusData?.statuses || [])
                .filter((s) => s && s.status !== 'habilitado')
                .map((s) => ({ itemId: s.itemId, status: s.status }));
        }
        masterOrder = null;
        if (orderRes && orderRes.ok) {
            const orderData = await orderRes.json().catch(() => null);
            if (orderData?.order && typeof orderData.order === 'object' && !Array.isArray(orderData.order)) masterOrder = orderData.order;
        }
        treeGrants = data.grants || [];
        pendingVisibleStatuses = data.visibleStatuses && data.visibleStatuses.length ? data.visibleStatuses : ['habilitado'];
        expandedRealNodes = new Set();
        expandedAccessGroups = new Set();
        treeModal.hidden = false;
        renderTreeList();
        window.VisibleStatusesChips.render(treeVisibleStatuses, pendingVisibleStatuses, (next) => { pendingVisibleStatuses = next; }, { hint: false, helpKey: 'visibleStatuses' });
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
