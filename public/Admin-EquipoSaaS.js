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
const treeSaveStatus = document.getElementById('saas-user-tree-save-status');
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
// Column keys, in the same order renderSaasChangeRow's cells array is always
// built -- shared by ensureSaasChangesModal (headers), renderSaasChangeRow
// (cells) and the column-filter functions below (which column of a <tr> to
// read). 'date' is the only one treated as a date range; every other column
// gets the text mode+search filter, same split real .data-table columns use
// (see isDateColumn/openColumnFilterMenu in Dashboard.js).
const SAAS_CHANGES_COLUMNS = ['date', 'user', 'record', 'change', 'requestedBy', 'authorizedBy'];
function ensureSaasChangesModal() {
    if (saasChangesModal) return;
    saasChangesModal = document.createElement('div');
    saasChangesModal.className = 'modal-overlay';
    saasChangesModal.hidden = true;
    const headerCells = [
        ['date', 'main.changeHistoryDate'], ['user', 'main.changeHistoryUser'], ['record', 'main.changeHistoryRecord'],
        ['change', 'main.changeHistoryChange'], ['requestedBy', 'main.changeHistoryRequestedBy'], ['authorizedBy', 'main.changeHistoryAuthorizedBy'],
    ].map(([col, key]) => `<th data-col="${col}" class="saas-changes-th">${Dashboard.t(key)}</th>`).join('');
    saasChangesModal.innerHTML = `
        <div class="modal-panel" style="max-width: 40rem;" role="dialog" aria-modal="true" aria-labelledby="saas-user-history-title">
            <h3 id="saas-user-history-title"></h3>
            <div class="admin-table-wrap saas-changes-table-wrap">
                <table class="admin-table">
                    <thead>
                        <tr>${headerCells}</tr>
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
    saasChangesModal.querySelectorAll('th[data-col]').forEach((th) => attachSaasChangesFilterTrigger(th, th.dataset.col));
    const close = () => { saasChangesModal.hidden = true; closeSaasChangesFilterMenu(); };
    saasChangesModal.querySelector('[data-role="close"]').addEventListener('click', close);
    saasChangesModal.addEventListener('click', (event) => { if (event.target === saasChangesModal) close(); });
}

// stripeColor: same convention as Dashboard.js's own renderChangeHistoryRow
// -- a hex string, '' for the neutral "sin clasificar" fallback, or
// undefined to skip the stripe (the empty-state placeholder row).
function renderSaasChangeRow(cells, stripeColor) {
    const tr = document.createElement('tr');
    if (stripeColor !== undefined) {
        tr.classList.add('change-history-row');
        tr.style.setProperty('--change-history-stripe-color', stripeColor || 'var(--color-border)');
    }
    cells.forEach((text, i) => {
        const td = document.createElement('td');
        td.dataset.col = SAAS_CHANGES_COLUMNS[i];
        td.textContent = text;
        tr.appendChild(td);
    });
    return tr;
}

// --- Per-column filter (Fecha = rango; el resto = modo + buscador + lista
// de valores) -- mismo mecanismo visual y las mismas clases CSS que ya usa
// cualquier .data-table del sitio (ver openColumnFilterMenu en Dashboard.js),
// reimplementado aquí en chico porque este modal no es una tabla registrada
// en dataTableColumnState (sin pin/orden/ancho -- solo filtrar, que es lo
// único que tiene sentido en un historial de 6 columnas fijas). Confirmado
// visualmente con el usuario, 2026-09-28, antes de construirlo.
let saasChangesColumnFilters = new Map(); // colKey -> Set of selected values (ausente = todos seleccionados)
let saasChangesFilterMenuEl = null;
let saasChangesFilterMenuCol = null;
const SAAS_CHANGES_DATE_COLUMNS = new Set(['date']);

function getSaasChangesDistinctValues(colKey) {
    const values = new Set();
    saasChangesList.querySelectorAll(`td[data-col="${colKey}"]`).forEach((td) => values.add(td.textContent.trim()));
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function applySaasChangesColumnFilters() {
    const rows = Array.from(saasChangesList.rows);
    if (!saasChangesColumnFilters.size) {
        rows.forEach((tr) => { tr.hidden = false; });
        return;
    }
    rows.forEach((tr) => {
        let visible = true;
        saasChangesColumnFilters.forEach((selectedSet, key) => {
            const td = tr.querySelector(`[data-col="${key}"]`);
            if (!selectedSet.has(td ? td.textContent.trim() : '')) visible = false;
        });
        tr.hidden = !visible;
    });
}

function closeSaasChangesFilterMenu() {
    saasChangesFilterMenuEl?.remove();
    saasChangesFilterMenuEl = null;
    saasChangesFilterMenuCol = null;
    document.removeEventListener('click', handleSaasChangesFilterOutsideClick, true);
}
function handleSaasChangesFilterOutsideClick(event) {
    if (saasChangesFilterMenuEl && !saasChangesFilterMenuEl.contains(event.target) && !event.target.closest('.data-table-col-filter-trigger')) {
        closeSaasChangesFilterMenu();
    }
}
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && saasChangesFilterMenuEl) closeSaasChangesFilterMenu();
});

// Adapted from openColumnFilterMenu in Dashboard.js -- same structure/CSS
// classes, trimmed to just this modal's own state (saasChangesColumnFilters)
// instead of dataTableColumnState, since there's no pin/reorder/width to
// track here.
function openSaasChangesFilterMenu(th, colKey) {
    const reopening = saasChangesFilterMenuCol === colKey;
    closeSaasChangesFilterMenu();
    if (reopening) return;

    const distinctValues = getSaasChangesDistinctValues(colKey);
    const selected = saasChangesColumnFilters.get(colKey) || new Set(distinctValues);

    const menu = document.createElement('div');
    menu.className = 'data-table-col-filter-menu';

    const searchRow = document.createElement('div');
    searchRow.className = 'data-table-col-filter-search-row';
    let applyRowSearch = () => true;

    if (SAAS_CHANGES_DATE_COLUMNS.has(colKey)) {
        const fromField = document.createElement('input');
        fromField.type = 'date';
        fromField.className = 'data-table-col-filter-date';
        fromField.setAttribute('aria-label', Dashboard.t('main.filterDateFrom'));
        fromField.addEventListener('click', (event) => event.stopPropagation());
        const toField = document.createElement('input');
        toField.type = 'date';
        toField.className = 'data-table-col-filter-date';
        toField.setAttribute('aria-label', Dashboard.t('main.filterDateTo'));
        toField.addEventListener('click', (event) => event.stopPropagation());

        const fromLabel = document.createElement('span');
        fromLabel.className = 'data-table-col-filter-date-label';
        fromLabel.textContent = Dashboard.t('main.filterDateFrom');
        const toLabel = document.createElement('span');
        toLabel.className = 'data-table-col-filter-date-label';
        toLabel.textContent = Dashboard.t('main.filterDateTo');
        searchRow.append(fromLabel, fromField, toLabel, toField);

        applyRowSearch = (row) => {
            const value = row.dataset.searchValue;
            if (fromField.value && value < fromField.value) return false;
            if (toField.value && value > toField.value) return false;
            return true;
        };
        fromField.addEventListener('input', () => searchInputChanged());
        toField.addEventListener('input', () => searchInputChanged());
    } else {
        const FILTER_MODES = [
            { id: 'startsWith', labelKey: 'main.filterModeStartsWith' },
            { id: 'contains', labelKey: 'main.filterModeContains' },
            { id: 'equals', labelKey: 'main.filterModeEquals' },
        ];
        let searchMode = 'contains';

        const modeCurrentLabel = document.createElement('div');
        modeCurrentLabel.className = 'data-table-col-filter-mode-current';
        modeCurrentLabel.textContent = Dashboard.t('main.filterModeContains');
        menu.appendChild(modeCurrentLabel);

        const modeBtn = document.createElement('button');
        modeBtn.type = 'button';
        modeBtn.className = 'data-table-col-filter-mode-btn';
        modeBtn.setAttribute('aria-label', Dashboard.t('main.filterModeLabel'));
        modeBtn.title = Dashboard.t('main.filterModeLabel');
        modeBtn.innerHTML = '<i class="bx bx-slider-alt" aria-hidden="true"></i>';
        searchRow.appendChild(modeBtn);

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'data-table-col-filter-search';
        searchInput.placeholder = Dashboard.t('main.filterSearchPlaceholder');
        searchInput.addEventListener('click', (event) => event.stopPropagation());
        searchRow.appendChild(searchInput);

        const modeMenu = document.createElement('div');
        modeMenu.className = 'data-table-col-filter-mode-menu';
        modeMenu.hidden = true;
        const modeButtons = FILTER_MODES.map((mode) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'data-table-col-filter-mode-option';
            btn.textContent = Dashboard.t(mode.labelKey);
            btn.classList.toggle('data-table-col-filter-mode-option-active', mode.id === searchMode);
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                searchMode = mode.id;
                modeButtons.forEach((b) => b.classList.remove('data-table-col-filter-mode-option-active'));
                btn.classList.add('data-table-col-filter-mode-option-active');
                modeCurrentLabel.textContent = Dashboard.t(mode.labelKey);
                modeMenu.hidden = true;
                searchInputChanged();
            });
            modeMenu.appendChild(btn);
            return btn;
        });
        searchRow.appendChild(modeMenu);

        modeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            modeMenu.hidden = !modeMenu.hidden;
        });
        menu.addEventListener('click', (event) => {
            if (!modeMenu.hidden && event.target !== modeBtn && !modeMenu.contains(event.target)) modeMenu.hidden = true;
        });

        applyRowSearch = (row) => {
            const query = searchInput.value.trim().toLowerCase();
            if (query === '') return true;
            const value = row.dataset.searchValue;
            if (searchMode === 'equals') return value === query;
            return searchMode === 'startsWith' ? value.startsWith(query) : value.includes(query);
        };
        searchInput.addEventListener('input', () => searchInputChanged());
    }
    menu.appendChild(searchRow);

    const allRow = document.createElement('label');
    allRow.className = 'data-table-col-filter-option data-table-col-filter-all';
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.checked = selected.size === distinctValues.length;
    allCheckbox.indeterminate = selected.size > 0 && selected.size < distinctValues.length;
    const allLabel = document.createElement('span');
    allLabel.textContent = Dashboard.t('main.filterAll');
    allRow.append(allCheckbox, allLabel);
    menu.appendChild(allRow);

    const list = document.createElement('div');
    list.className = 'data-table-col-filter-list';
    const checkboxes = [];

    function syncAllCheckbox() {
        const current = saasChangesColumnFilters.get(colKey) || new Set(distinctValues);
        allCheckbox.checked = current.size === distinctValues.length;
        allCheckbox.indeterminate = current.size > 0 && current.size < distinctValues.length;
    }

    distinctValues.forEach((value) => {
        const row = document.createElement('label');
        row.className = 'data-table-col-filter-option';
        row.dataset.searchValue = (value || '').toLowerCase();
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.has(value);
        cb.addEventListener('change', () => {
            const current = new Set(saasChangesColumnFilters.get(colKey) || new Set(distinctValues));
            if (cb.checked) current.add(value); else current.delete(value);
            if (current.size === distinctValues.length) saasChangesColumnFilters.delete(colKey);
            else saasChangesColumnFilters.set(colKey, current);
            applySaasChangesColumnFilters();
            th.classList.toggle('data-table-col-filter-active', saasChangesColumnFilters.has(colKey));
            syncAllCheckbox();
        });
        const span = document.createElement('span');
        span.textContent = value || '—';
        row.append(cb, span);
        list.appendChild(row);
        checkboxes.push(cb);
    });
    menu.appendChild(list);

    function searchInputChanged() {
        list.querySelectorAll('.data-table-col-filter-option').forEach((row) => {
            row.hidden = !applyRowSearch(row);
        });
    }

    allCheckbox.addEventListener('change', () => {
        checkboxes.forEach((cb) => { cb.checked = allCheckbox.checked; });
        if (allCheckbox.checked) saasChangesColumnFilters.delete(colKey);
        else saasChangesColumnFilters.set(colKey, new Set());
        applySaasChangesColumnFilters();
        th.classList.toggle('data-table-col-filter-active', saasChangesColumnFilters.has(colKey));
        allCheckbox.indeterminate = false;
    });

    document.body.appendChild(menu);
    const rect = th.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const left = Math.min(rect.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - menuWidth - 8);
    menu.style.position = 'absolute';
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.max(8, left)}px`;
    // .data-table-col-filter-menu's own z-index (50) is fine on a normal
    // page, but this table lives INSIDE .modal-overlay (z-index: 100) --
    // found live just now: the menu opened but rendered invisibly behind
    // the modal. Bumped just for this instance, comfortably clear of the
    // modal's own 100 without reaching into the 900+ range other portaled
    // panels (perm-tree-color-popover, Vista Previa) use, since none of
    // those can ever be open at the same time as this modal anyway.
    menu.style.zIndex = '150';
    saasChangesFilterMenuEl = menu;
    saasChangesFilterMenuCol = colKey;
    searchRow.querySelector('input')?.focus();
    setTimeout(() => document.addEventListener('click', handleSaasChangesFilterOutsideClick, true), 0);
}

function attachSaasChangesFilterTrigger(th, colKey) {
    if (th.querySelector('.data-table-col-filter-trigger')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-col-filter-trigger';
    btn.setAttribute('aria-label', Dashboard.t('main.filterColumn'));
    btn.innerHTML = '<i class="bx bx-filter-alt" aria-hidden="true"></i>';
    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openSaasChangesFilterMenu(th, colKey);
    });
    th.appendChild(btn);
}
// Classification color stripe -- fixed, param-less endpoint (only 3 of the
// 6 possible field_keys ever resolve, see getEffectiveSaasUserFieldClassifications
// in db.js), so one cached promise is enough, no per-tableKey Map like
// Dashboard.js's own fetchTableClassifications needs.
let saasUserFieldClassificationsPromise = null;
function fetchSaasUserFieldClassifications() {
    if (!saasUserFieldClassificationsPromise) {
        saasUserFieldClassificationsPromise = fetch('/api/admin/saas-user-field-classifications', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : { fields: {} }))
            .catch(() => ({ fields: {} }));
    }
    return saasUserFieldClassificationsPromise;
}
// userId omitted = every account's history (toolbar button); passed = just
// that one account's (per-row button) -- same "narrower scope, same
// endpoint family" idea as Dashboard.js's own openChangeHistory.
async function openSaasUserChanges(userId) {
    ensureSaasChangesModal();
    saasChangesModal.hidden = false;
    saasChangesModal.querySelector('#saas-user-history-title').textContent = userId ? Dashboard.t('main.changeHistoryTitleRecord') : Dashboard.t('main.changeHistoryTitle');
    // Fresh state every time it opens -- same convention the old search box
    // used, avoids a stale filter silently hiding rows on a later open.
    saasChangesColumnFilters = new Map();
    closeSaasChangesFilterMenu();
    saasChangesModal.querySelectorAll('th.data-table-col-filter-active').forEach((th) => th.classList.remove('data-table-col-filter-active'));
    saasChangesList.innerHTML = '';
    saasChangesList.appendChild(renderSaasChangeRow([Dashboard.t('main.changeHistoryEmpty'), '', '', '', '', '']));
    try {
        const url = userId ? `/api/admin/saas-users/${userId}/changes` : '/api/admin/saas-users/changes';
        const classificationsPromise = fetchSaasUserFieldClassifications();
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const { changes } = await res.json();
        if (!changes || !changes.length) return;
        const fieldClassifications = (await classificationsPromise).fields || {};
        saasChangesList.innerHTML = '';
        changes.forEach((change) => {
            let description;
            let stripeColor = '';
            if (change.action === 'create') {
                description = Dashboard.t('main.changeHistoryCreated');
            } else if (change.field_key === 'business.saasUserPassword') {
                description = Dashboard.t('admin.saasResetPassword');
            } else {
                description = `${Dashboard.t(change.field_key)}: "${change.old_value || '—'}" → "${change.new_value || '—'}"`;
                stripeColor = fieldClassifications[change.field_key]?.color || '';
            }
            saasChangesList.appendChild(renderSaasChangeRow([
                change.changed_at, change.changed_by || '—', change.record_label || '—', description,
                change.requested_by || '—', change.authorized_by || '—',
            ], stripeColor));
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

// Renders `apartado`'s own header row (chevron + rollup checkbox) into
// `rows`, recursing into its body when expanded. Used identically for a
// screen's top-level apartados and for a nested modal popping up from one
// of their columns/acciones -- both are just "an apartado with a label".
function renderApartadoNode(screen, apartado, depth, rows) {
    const nodeKey = `${screen.itemId}::${apartado.id}`;
    const expanded = expandedRealNodes.has(nodeKey);
    const subItemIds = collectRealSubItemIds(screen, apartado);
    const checkedCount = subItemIds.filter((s) => hasGrant(screen.itemId, s)).length;
    rows.push(buildPermTreeRow(
        apartado.label, depth,
        { expanded, onToggle: () => { if (expanded) expandedRealNodes.delete(nodeKey); else expandedRealNodes.add(nodeKey); renderTreeList(); } },
        subItemIds.length > 0 && checkedCount === subItemIds.length, checkedCount > 0 && checkedCount < subItemIds.length,
        (checked) => subItemIds.forEach((s) => setGrant(screen.itemId, s, checked)),
    ));
    if (!expanded) return;
    renderApartadoLeaves(screen, apartado, depth + 1, rows);
}

function renderApartadoLeaves(screen, apartado, depth, rows) {
    const nestedByColumn = buildNestedByColumn(screen, apartado);
    buildRealLeaves(apartado).forEach((leaf) => {
        const subItemId = realLeafSubItemId(apartado, leaf);
        const childApartados = nestedByColumn.get(leaf.label) || [];
        const nodeKey = `${screen.itemId}::${subItemId}`;
        const hasChildren = childApartados.length > 0;
        const expanded = expandedRealNodes.has(nodeKey);
        rows.push(buildPermTreeRow(
            leaf.label, depth,
            hasChildren ? { expanded, onToggle: () => { if (expanded) expandedRealNodes.delete(nodeKey); else expandedRealNodes.add(nodeKey); renderTreeList(); } } : null,
            hasGrant(screen.itemId, subItemId), false,
            (checked) => setGrant(screen.itemId, subItemId, checked),
        ));
        if (hasChildren && expanded) {
            childApartados.forEach((child) => renderApartadoNode(screen, child, depth + 1, rows));
        }
    });
    nestedWithoutColumn(screen, apartado).forEach((child) => renderApartadoNode(screen, child, depth, rows));
}

function renderTreeList() {
    treeList.innerHTML = '';
    const rows = [];
    (window.SAAS_ADMIN_CATALOG || []).forEach((group) => {
        const groupHeader = document.createElement('div');
        groupHeader.className = 'perm-tree-row perm-tree-depth-0 perm-tree-row-static';
        const groupLabel = document.createElement('span');
        groupLabel.className = 'perm-tree-static-label';
        groupLabel.textContent = Dashboard.t(group.labelKey);
        groupHeader.appendChild(groupLabel);
        rows.push(groupHeader);

        group.screens.forEach((screen) => {
            const nodeKey = screen.itemId;
            const expanded = expandedRealNodes.has(nodeKey);
            const topApartados = screen.apartados.filter((a) => !a.nestUnder);
            const subItemIds = topApartados.flatMap((a) => collectRealSubItemIds(screen, a));
            const checkedCount = subItemIds.filter((s) => hasGrant(screen.itemId, s)).length;
            rows.push(buildPermTreeRow(
                Dashboard.t(screen.labelKey), 1,
                { expanded, onToggle: () => { if (expanded) expandedRealNodes.delete(nodeKey); else expandedRealNodes.add(nodeKey); renderTreeList(); } },
                subItemIds.length > 0 && checkedCount === subItemIds.length, checkedCount > 0 && checkedCount < subItemIds.length,
                (checked) => subItemIds.forEach((s) => setGrant(screen.itemId, s, checked)),
            ));
            if (expanded) topApartados.forEach((apartado) => renderApartadoNode(screen, apartado, 2, rows));
        });
    });
    rows.forEach((row) => treeList.appendChild(row));
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
        expandedRealNodes = new Set();
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
