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
        const order = await fetch(`/api/business/permission-order?level=usuario&entityId=${user.id}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const classOverrides = await fetch(`/api/business/permission-classifications?level=usuario&entityId=${user.id}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => (d && d.overrides) || null).catch(() => null);
        const tree = window.PermissionCostTree.create(activePermsContainer, {
            order, classOverrides, mode: 'clientTricolor', interactive: false, columnLevels: true,
            // Solo lo que la empresa contrató: lo que el perfil o los extras le dan sale normal y el resto de lo contratado, bloqueado.
            visibleGrants: data.contractGrants,
            historyEndpoint: '/api/business/user-grant-change-log', historyParams: { userId: user.id },
        });
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
const grantAccessVisibleStatuses = document.getElementById('grant-access-visible-statuses');
const grantAccessError = document.getElementById('grant-access-error');
const grantAccessSaveBtn = document.getElementById('grant-access-save');
// Tracks the chip row's current selection between renders -- VisibleStatusesChips
// itself is stateless (see its own onChange callback), this is just where
// that state actually lives while the modal is open, same role activeUserId
// plays for which user it's open for.
let pendingVisibleStatuses = ['habilitado'];

async function openGrantAccessModal(user) {
    activeUserId = user.id;
    grantAccessSubtitle.textContent = `${user.name} (${user.username})`;
    grantAccessError.hidden = true;
    grantAccessContainer.innerHTML = '';
    grantAccessVisibleStatuses.innerHTML = '';
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
        const order = await fetch(`/api/business/permission-order?level=usuario&entityId=${user.id}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const classOverrides = await fetch(`/api/business/permission-classifications?level=usuario&entityId=${user.id}`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => (d && d.overrides) || null).catch(() => null);
        grantTree = window.PermissionCostTree.create(grantAccessContainer, {
            order, classOverrides, mode: 'clientTricolor', interactive: true, allowedSectionIds, columnLevels: true,
            grantLimits: Dashboard.buildGrantLimits(data.contractGrants),
            historyEndpoint: '/api/business/user-grant-change-log', historyParams: { userId: user.id },
        });
        await grantTree.init(data.jobPositionGrants || [], [], data.grants || []);
        // Solo los Estatus que la cuenta del administrador puede ver se pueden dar; si el usuario tenía de más, queda en lo permitido.
        const assignable = Array.isArray(data.assignableStatuses) && data.assignableStatuses.length ? data.assignableStatuses : ['habilitado'];
        const currentStatuses = (data.visibleStatuses && data.visibleStatuses.length ? data.visibleStatuses : ['habilitado']).filter((s) => assignable.includes(s));
        pendingVisibleStatuses = currentStatuses.length ? currentStatuses : ['habilitado'];
        window.VisibleStatusesChips.render(grantAccessVisibleStatuses, pendingVisibleStatuses, (next) => { pendingVisibleStatuses = next; }, { allowed: assignable });
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
        // Both saved together under this one Guardar (confirmed live,
        // 2026-09-27: "Sí, ahí mismo en el modal") -- 2 independent rows
        // server-side (user_grants vs. users.visible_statuses), but one
        // save action from here.
        const [grantsRes, statusesRes] = await Promise.all([
            fetch(`/api/business/users/${activeUserId}/grants`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ grants: grantTree.getClientGrants() }),
            }),
            fetch(`/api/business/users/${activeUserId}/visible-statuses`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ statuses: pendingVisibleStatuses }),
            }),
        ]);
        if (!grantsRes.ok || !statusesRes.ok) {
            const failed = !grantsRes.ok ? grantsRes : statusesRes;
            const body = await failed.json().catch(() => ({}));
            const err = new Error('save failed');
            err.limitMessage = Dashboard.limitErrorMessage(body);
            throw err;
        }
        const saved = await grantsRes.json().catch(() => ({}));
        closeGrantAccessModal();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
        const droppedNotice = Dashboard.limitDroppedMessage(saved.dropped);
        if (droppedNotice) Dashboard.showToast(droppedNotice, 'warning');
    } catch (err) {
        grantAccessError.textContent = (err && err.limitMessage) || Dashboard.t('admin.saveError');
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

// --- Reestablecer Rol (individual / masivo) ----------------------------------
// Wipes Permisos Adicionales (user_grants is purely additive — see
// setUserGrants in db.js) so effective access goes back to exactly what
// the user's Puesto de Trabajo (Roles) defines, nothing more.
async function resetUserRole(user) {
    if (!(await Dashboard.confirm(Dashboard.t('business.resetRoleConfirm', { name: user.name })))) return;
    try {
        const res = await fetch(`/api/business/users/${user.id}/reset-role`, { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('reset failed');
        Dashboard.showToast(Dashboard.t('business.resetRoleSuccess'), 'success');
        await loadUsers();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

document.getElementById('reset-all-roles-btn').addEventListener('click', async () => {
    if (!(await Dashboard.confirm(Dashboard.t('business.resetAllRolesConfirm')))) return;
    try {
        const res = await fetch('/api/business/users/reset-all-roles', { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('reset failed');
        const { count } = await res.json();
        Dashboard.showToast(Dashboard.t('business.resetAllRolesSuccess', { count }), 'success');
        await loadUsers();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
});

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

// --- Orden y clasificación de la persona -------------------------------------
// Mismo modal que el de los demás niveles (LevelLayoutModal.js). Lo que se cambia le llega solo a esa persona; restablecer vuelve a lo de su perfil (su puesto). Lo ve el
// administrador del cliente y quien tenga Personalizar para las personas que están debajo de él en el organigrama; sin Autorizar, el cambio se pide a su jefe.
const usuarioLayoutModal = window.LevelLayoutModal.create({
    idPrefix: 'usuario-layout',
    titleKey: 'admin.layoutTitleUsuario',
    stateUrl: (user) => `/api/business/level-layout/usuario/${user.id}`,
    statusUrl: '/api/business/master-permission-status',
    costsUrl: null,
    subtitle: (user) => user.name || '',
    hintKey: 'admin.layoutDownHintUsuario',
    resetBodyKey: 'admin.layoutResetBodyUsuario',
    resetBodyRequestKey: 'admin.layoutResetBodyRequestUsuario',
});
function buildUserLayoutButton(user) {
    const layoutBtn = document.createElement('button');
    layoutBtn.type = 'button';
    layoutBtn.className = 'admin-icon-btn';
    layoutBtn.setAttribute('aria-label', Dashboard.t('admin.layoutTitleUsuario'));
    layoutBtn.title = Dashboard.t('admin.layoutTitleUsuario');
    layoutBtn.setAttribute('data-help-key', 'usuarioReordenPersonalizado');
    layoutBtn.innerHTML = '<i class="bx bx-sort-alt-2" aria-hidden="true"></i>';
    layoutBtn.addEventListener('click', () => usuarioLayoutModal.open(user));
    return layoutBtn;
}

function renderUsersTable() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = users.length > 0;
    users.forEach((user) => {
        const tr = document.createElement('tr');
        if (user.layoutOnly) {
            // Quien no es administrador del cliente: solo el nombre, el puesto y su botón; las demás columnas son del administrador (cada celda lleva su columna para que la tabla las acomode).
            const cell = (col, text) => {
                const td = document.createElement('td');
                td.dataset.col = col;
                td.textContent = text || '—';
                return td;
            };
            const tdLayoutActions = document.createElement('td');
            tdLayoutActions.dataset.col = 'actions';
            tdLayoutActions.className = 'admin-table-actions';
            tdLayoutActions.appendChild(buildUserLayoutButton(user));
            tr.append(
                cell('accUsername', ''), cell('accName', user.name), cell('accEmail', ''), cell('accJobPosition', user.positionName), cell('accCreated', ''),
                cell('accHrStatus', ''), cell('accOperationalStatus', ''), cell('accActivePerms', ''), tdLayoutActions,
            );
            tableBody.appendChild(tr);
            return;
        }
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
        Dashboard.renderLocalDate(tdCreated, user.created_at);

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
            opToggleBtn.setAttribute('data-help-key', 'operationalStatusLocked');
        } else {
            opToggleBtn.innerHTML = `<i class="bx ${user.active ? 'bx-x-circle' : 'bx-check-circle'}" aria-hidden="true"></i>`;
            opToggleBtn.setAttribute('aria-label', Dashboard.t(user.active ? 'admin.deactivate' : 'admin.activate'));
            opToggleBtn.title = Dashboard.t(user.active ? 'admin.deactivate' : 'admin.activate');
            opToggleBtn.setAttribute('data-help-key', user.active ? 'deactivate' : 'activate');
            opToggleBtn.addEventListener('click', () => toggleUserActive(user));
        }
        tdOperationalStatus.append(opBadge, opToggleBtn);

        const tdActivePerms = document.createElement('td');
        tdActivePerms.dataset.col = 'accActivePerms';
        const activePermsBtn = document.createElement('button');
        activePermsBtn.type = 'button';
        activePermsBtn.className = 'admin-icon-btn';
        activePermsBtn.setAttribute('data-help-key', 'activePermissionsTree');
        activePermsBtn.setAttribute('aria-label', Dashboard.t('business.accesosActivePermsBtn'));
        activePermsBtn.title = Dashboard.t('business.accesosActivePermsBtn');
        activePermsBtn.innerHTML = '<i class="bx bx-sitemap" aria-hidden="true"></i>';
        activePermsBtn.addEventListener('click', () => openActivePermsModal(user));
        tdActivePerms.appendChild(activePermsBtn);

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        // Historial de cambios de ESTA fila (el servidor ya registra esta tabla).
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('data-help-key', 'changeHistory');
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openChangeHistory('usuarios', user.id));
        tdActions.appendChild(historyBtn);
        const grantBtn = document.createElement('button');
        grantBtn.type = 'button';
        grantBtn.className = 'admin-icon-btn';
        grantBtn.setAttribute('data-help-key', 'grantAccess');
        grantBtn.setAttribute('aria-label', Dashboard.t('business.accesosGrantTitle'));
        grantBtn.title = Dashboard.t('business.accesosGrantTitle');
        grantBtn.innerHTML = '<i class="bx bx-key" aria-hidden="true"></i>';
        grantBtn.addEventListener('click', () => openGrantAccessModal(user));
        tdActions.appendChild(grantBtn);

        const resetRoleBtn = document.createElement('button');
        resetRoleBtn.type = 'button';
        resetRoleBtn.className = 'admin-icon-btn';
        resetRoleBtn.setAttribute('data-help-key', 'resetRole');
        resetRoleBtn.setAttribute('aria-label', Dashboard.t('business.resetRoleBtn'));
        resetRoleBtn.title = Dashboard.t('business.resetRoleBtn');
        resetRoleBtn.innerHTML = '<i class="bx bx-reset" aria-hidden="true"></i>';
        resetRoleBtn.addEventListener('click', () => resetUserRole(user));
        tdActions.appendChild(resetRoleBtn);
        tdActions.appendChild(buildUserLayoutButton(user));

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
        if (res.status === 403) {
            // No es administrador del cliente: solo las personas a las que puede cambiarles el orden y la clasificación (las de abajo en el organigrama).
            const mine = await fetch('/api/business/layout-targets/usuario', { credentials: 'include' });
            if (!mine.ok) throw new Error('load failed');
            users = ((await mine.json()).users || []).map((u) => ({ ...u, layoutOnly: true }));
            renderUsersTable();
            return;
        }
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
