// ---------------------------------------------------------------------------
// "Nuestros Planes" (formerly "Planes Registrados"/"Mis Planes") — view/
// edit/delete GEIPSA's existing plan/package catalog, plus configure each
// plan's OWN access tree (which departamentos/áreas/apartados/pantallas/
// columnas it bundles in — same PermissionTree.js component
// Business-Roles.js already uses for a client's profiles, mounted here
// against a plan instead). These names are what populate the "Plan /
// paquete" select on Clientes Nuevos (Admin-SaaS.html). Creating a brand
// new plan lives on its own page instead (+ Agregar Plan Nuevo,
// Admin-PlanNuevo.js). Shell (sidebar, i18n, settings, logout) comes from
// Dashboard.js.
//
// Lifecycle: a new plan starts in Revisión. Its access tree is editable
// (any number of saves) while it stays in Revisión. Moving to Activo only
// happens through the dedicated "Activar" action (POST .../activate),
// gated server-side by the 'activate' SaaS grant under 'saas-plans' (see
// Admin-EquipoSaaS.js) — NOT a plain status edit. The moment a plan goes
// Activo, its definition (name/description/modules/costCentersLimit) AND
// its access tree lock for good (`locked`) — status can still freely
// toggle Activo <-> Inactivo afterward (a lifecycle flag, not a
// redefinition), but the tree/definition never unlock again. While the
// project is still in development, the server relaxes the lock itself
// (see DEV_MODE_ALLOW_LOCKED_PLAN_EDITS in server.js) — `devModeOverride`
// (from GET /api/admin/plans) reflects that here so the UI can say so
// instead of silently allowing edits with no explanation.
//
// "Editar" only ever touches ROW DATA (name/description/costCentersLimit/
// modules) — the access tree is a completely separate flow (the shield
// icon), never reachable from the edit form. Both open as their own modal
// ("pantalla alterna"), not a panel stacked under the table — same pattern
// as "Accesos del Administrador" on Nuestros Clientes.
//
// Access note: the sidebar only shows this page's link to admins with the
// 'saas-clients'/'saas-plans' grant (see SAAS_SCREEN_GRANT_PATHS in
// Dashboard.js), and initDashboard() redirects anyone who lands here
// directly without it — real enforcement either way is server-side
// (requireAdmin + the grant checks on every /api/admin/* route below).
// ---------------------------------------------------------------------------

const editModal = document.getElementById('plan-edit-modal');
const form = document.getElementById('plan-form');
const idField = document.getElementById('plan-id');
const nameField = document.getElementById('plan-name');
const descriptionField = document.getElementById('plan-description');
const costCentersLimitField = document.getElementById('plan-cost-centers-limit');
const modulesList = document.getElementById('plan-modules-list');
const errorBanner = document.getElementById('plan-form-error');
const submitBtn = document.getElementById('plan-form-submit');
const cancelBtn = document.getElementById('plan-form-cancel');
const tableBody = document.getElementById('plan-table-body');
const emptyMsg = document.getElementById('plan-empty');

const treeModal = document.getElementById('plan-tree-modal');
const treeModalTitle = document.getElementById('plan-tree-modal-title');
const treeContainer = document.getElementById('plan-tree-container');
const treeLockedNote = document.getElementById('plan-tree-locked-note');
const treeError = document.getElementById('plan-tree-error');
const treeSaveBtn = document.getElementById('plan-tree-save');
const treeCloseBtn = document.getElementById('plan-tree-close');
const treeSaveStatus = document.getElementById('plan-tree-save-status');

let plans = [];
let moduleCatalog = []; // { key, labelKey } — same catalog Contrataciones uses
let devModeOverride = false;
let selectedPlanId = null;
let tree = null;

// Same switches as Contrataciones (per-client module toggles): a plan is
// just a reusable preset of that same { key, enabled } shape, applied to a
// client's own Contrataciones automatically when that plan is selected for
// them in Clientes Nuevos (see applyPlanToClient in server.js).
function renderModuleToggles(checkedKeys) {
    modulesList.innerHTML = '';
    moduleCatalog.forEach((mod) => {
        const row = document.createElement('div');
        row.className = 'admin-module-row';

        const name = document.createElement('span');
        name.className = 'admin-module-name';
        name.textContent = Dashboard.t(mod.labelKey);

        const label = document.createElement('label');
        label.className = 'admin-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checkedKeys.includes(mod.key);
        input.dataset.moduleKey = mod.key;
        const track = document.createElement('span');
        track.className = 'admin-switch-track';
        label.append(input, track);

        row.append(name, label);
        modulesList.appendChild(row);
    });
}

function getCheckedModuleKeys() {
    return Array.from(modulesList.querySelectorAll('input[type="checkbox"]:checked')).map((i) => i.dataset.moduleKey);
}

async function loadModuleCatalog() {
    const res = await fetch('/api/admin/modules', { credentials: 'include' });
    if (!res.ok) throw new Error('load failed');
    const data = await res.json();
    moduleCatalog = data.modules || [];
    renderModuleToggles([]);
}

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}
function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
}

function closeEditModal() {
    editModal.hidden = true;
    form.reset();
    idField.value = '';
    costCentersLimitField.value = 0;
    renderModuleToggles([]);
    clearError();
}

function formatDate(value) {
    if (!value) return '—';
    return value.slice(0, 10);
}

// A plan's definition/tree is frozen for good once `locked` — dev mode
// (DEV_MODE_ALLOW_LOCKED_PLAN_EDITS in server.js) relaxes that server-side
// while the project's still being built, `devModeOverride` mirrors it here.
function isHardLocked(plan) {
    return plan.locked && !devModeOverride;
}

async function patchPlanField(plan, patch) {
    try {
        const res = await fetch(`/api/admin/plans/${plan.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            alert(body.message || Dashboard.t('admin.saveError'));
            await loadPlans();
            return;
        }
        const { plan: updated } = await res.json();
        plans = plans.map((p) => (p.id === updated.id ? updated : p));
        renderPlans();
    } catch {
        alert(Dashboard.t('admin.saveError'));
        await loadPlans();
    }
}

// A plan still in Revisión has no status cell to edit directly — just a
// static badge. Only a plan that's already gone through Activar at least
// once (`locked`) gets the free-toggling Activo/Inactivo <select> (its
// definition is already final by then, so this is a lifecycle flag, not a
// new decision needing authorization — see server.js's PATCH guard).
function buildStatusCell(plan) {
    const td = document.createElement('td');
    td.dataset.col = 'status';
    if (!plan.locked) {
        const badge = document.createElement('span');
        badge.textContent = Dashboard.t('admin.planStatusRevision');
        td.appendChild(badge);
        return td;
    }
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    [['active', 'admin.planStatusActive'], ['inactive', 'admin.planStatusInactive']].forEach(([val, key]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = Dashboard.t(key);
        select.appendChild(opt);
    });
    select.value = plan.status || 'active';
    select.addEventListener('change', () => patchPlanField(plan, { status: select.value }));
    td.appendChild(select);
    return td;
}

function buildEndDateCell(plan) {
    const td = document.createElement('td');
    td.dataset.col = 'endDate';
    Dashboard.attachInlineEdit(td, {
        value: plan.endDate || '',
        inputType: 'date',
        formatDisplay: formatDate,
        onCommit: (val) => patchPlanField(plan, { endDate: val || null }),
    });
    return td;
}

function buildLockedCell(plan) {
    const td = document.createElement('td');
    td.dataset.col = 'locked';
    const span = document.createElement('span');
    const icon = document.createElement('i');
    icon.className = plan.locked ? 'bx bx-lock-alt' : 'bx bx-lock-open-alt';
    icon.setAttribute('aria-hidden', 'true');
    span.append(icon, document.createTextNode(` ${Dashboard.t(plan.locked ? 'admin.planLockedYes' : 'admin.planLockedNo')}`));
    if (plan.locked && devModeOverride) span.title = Dashboard.t('admin.planLockedDevNote');
    td.appendChild(span);
    return td;
}

async function activatePlan(plan) {
    if (!confirm(Dashboard.t('admin.planActivateConfirm'))) return;
    try {
        const res = await fetch(`/api/admin/plans/${plan.id}/activate`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            alert(body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const { plan: updated } = await res.json();
        plans = plans.map((p) => (p.id === updated.id ? updated : p));
        renderPlans();
    } catch {
        alert(Dashboard.t('admin.saveError'));
    }
}

function renderPlans() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = plans.length > 0;
    const canActivate = Dashboard.hasSaasScreenGrant('saas-plans', 'activate');
    plans.forEach((plan) => {
        const tr = document.createElement('tr');
        tr.dataset.planStatus = !plan.locked ? 'revision' : (plan.status || 'active');
        // Mirrors editBtn's own disabled condition below (isHardLocked) —
        // that's the one real "can this row still be edited" signal on this
        // screen; everything else here is either always-on or gated by a
        // per-action grant (Activar) rather than per-row editability.
        tr.classList.toggle('data-table-row-editable', !isHardLocked(plan));

        const tdName = document.createElement('td');
        tdName.dataset.col = 'name';
        tdName.textContent = plan.name;
        const tdDescription = document.createElement('td');
        tdDescription.dataset.col = 'description';
        tdDescription.textContent = plan.description || '—';
        const tdCreatedAt = document.createElement('td');
        tdCreatedAt.dataset.col = 'createdAt';
        tdCreatedAt.textContent = formatDate(plan.created_at);
        const tdCreatedBy = document.createElement('td');
        tdCreatedBy.dataset.col = 'createdBy';
        tdCreatedBy.textContent = plan.createdBy || '—';

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const treeBtn = document.createElement('button');
        treeBtn.type = 'button';
        treeBtn.className = 'admin-icon-btn';
        treeBtn.setAttribute('aria-label', Dashboard.t('admin.planTreeTitle'));
        treeBtn.title = Dashboard.t('admin.planTreeTitle');
        treeBtn.innerHTML = '<i class="bx bx-shield" aria-hidden="true"></i>';
        treeBtn.addEventListener('click', () => selectPlanForTree(plan));
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('admin.planChangeHistory'));
        historyBtn.title = Dashboard.t('admin.planChangeHistory');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => openPlanChangeHistory(plan));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        if (isHardLocked(plan)) {
            editBtn.disabled = true;
            editBtn.title = Dashboard.t('admin.planLockedHardNote');
        } else {
            editBtn.addEventListener('click', () => openEditModal(plan));
        }
        tdActions.append(treeBtn, historyBtn, editBtn);

        if (!plan.locked) {
            const activateBtn = document.createElement('button');
            activateBtn.type = 'button';
            activateBtn.className = 'admin-icon-btn';
            activateBtn.innerHTML = '<i class="bx bx-check-shield" aria-hidden="true"></i>';
            if (canActivate) {
                activateBtn.setAttribute('aria-label', Dashboard.t('admin.planActivate'));
                activateBtn.title = Dashboard.t('admin.planActivate');
                activateBtn.addEventListener('click', () => activatePlan(plan));
            } else {
                activateBtn.disabled = true;
                activateBtn.title = Dashboard.t('admin.planActivateNoPermission');
            }
            tdActions.appendChild(activateBtn);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removePlan(plan));
        tdActions.appendChild(deleteBtn);

        tr.append(tdName, tdDescription, tdCreatedAt, tdCreatedBy, buildEndDateCell(plan), buildStatusCell(plan), buildLockedCell(plan), tdActions);
        tableBody.appendChild(tr);
    });
    applyPlanFilters();
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the fields mean).
// Client-side row hiding, re-applied after every renderPlans() so a filter
// stays active across edits instead of silently resetting.
function applyPlanFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    const status = document.getElementById('filter-status')?.value || '';
    tableBody.querySelectorAll('tr').forEach((tr) => {
        let visible = true;
        if (text) {
            const haystack = ['name', 'description', 'createdBy']
                .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
                .join(' ');
            if (!haystack.includes(text)) visible = false;
        }
        if (status && tr.dataset.planStatus !== status) visible = false;
        tr.hidden = !visible;
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyPlanFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyPlanFilters);

function openEditModal(plan) {
    idField.value = plan.id;
    nameField.value = plan.name;
    descriptionField.value = plan.description || '';
    costCentersLimitField.value = plan.costCentersLimit || 0;
    renderModuleToggles(plan.modules || []);
    clearError();
    editModal.hidden = false;
}

async function removePlan(plan) {
    if (!confirm(Dashboard.t('admin.confirmDeletePlan'))) return;
    try {
        const res = await fetch(`/api/admin/plans/${plan.id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        if (!res.ok) throw new Error('delete failed');
        plans = plans.filter((p) => p.id !== plan.id);
        renderPlans();
        if (selectedPlanId === plan.id) {
            selectedPlanId = null;
            treeModal.hidden = true;
        }
    } catch {
        alert(Dashboard.t('admin.saveError'));
    }
}

async function loadPlans() {
    try {
        const res = await fetch('/api/admin/plans', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        plans = data.plans || [];
        devModeOverride = !!data.devModeOverride;
        renderPlans();
    } catch {
        alert(Dashboard.t('admin.loadError'));
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
    const modules = getCheckedModuleKeys();
    const costCentersLimit = Math.max(0, parseInt(costCentersLimitField.value, 10) || 0);

    const editingId = idField.value;

    submitBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/plans/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, description, modules, costCentersLimit }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            if (body.message === 'A plan with that name already exists.') {
                showError(Dashboard.t('admin.planNameExists'));
            } else {
                showError(body.message || Dashboard.t('admin.saveError'));
            }
            return;
        }
        const { plan } = await res.json();
        plans = plans.map((p) => (p.id === plan.id ? plan : p));
        renderPlans();
        closeEditModal();
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

cancelBtn.addEventListener('click', closeEditModal);
editModal.addEventListener('click', (event) => { if (event.target === editModal) closeEditModal(); });

// --- Access tree per plan (mirrors Business-Roles.js's per-profile panel,
// opened as a modal instead of an inline panel — "pantalla alterna") ------
async function selectPlanForTree(plan) {
    selectedPlanId = plan.id;
    treeModalTitle.textContent = `${Dashboard.t('admin.planTreeTitle')} — ${plan.name}`;
    treeSaveStatus.textContent = '';
    treeError.hidden = true;
    const locked = isHardLocked(plan);
    treeLockedNote.hidden = !plan.locked;
    if (plan.locked) {
        treeLockedNote.textContent = Dashboard.t(locked ? 'admin.planTreeLockedActive' : 'admin.planLockedDevNote');
    }
    treeSaveBtn.hidden = locked;
    try {
        const res = await fetch(`/api/admin/plans/${plan.id}/grants`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        // A plan's tree covers the FULL catalog, not just one client's
        // contracted subset (allowedSectionIds: null), and has no notion of
        // a client's own named cost centers (costCenters: []) — it only
        // needs the static Centro de Costo leaf (ccCode/ccName/...), same
        // as any other table's columns. NOT mounted with readOnly:true —
        // that mode shows a contracted/blocked module badge instead of the
        // actual grantSet checked-state, which is the opposite of what a
        // locked plan needs to display (exactly what it grants, just
        // non-editable) — so it stays fully interactive and a CSS class
        // disables interaction instead, when locked.
        treeContainer.innerHTML = '';
        tree = window.PermissionTree.create(treeContainer, { allowedSectionIds: null, costCenters: [] });
        await tree.init(data.grants || []);
        treeContainer.classList.toggle('perm-tree-view-only', locked);
        treeModal.hidden = false;
    } catch {
        alert(Dashboard.t('admin.loadError'));
    }
}

function closeTreeModal() {
    treeModal.hidden = true;
}
treeCloseBtn.addEventListener('click', closeTreeModal);
treeModal.addEventListener('click', (event) => { if (event.target === treeModal) closeTreeModal(); });

treeSaveBtn.addEventListener('click', async () => {
    if (!selectedPlanId || !tree) return;
    treeSaveBtn.disabled = true;
    treeError.hidden = true;
    try {
        const res = await fetch(`/api/admin/plans/${selectedPlanId}/grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: tree.getGrants() }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showTreeError(treeError, body.message || Dashboard.t('admin.saveError'));
            return;
        }
        await loadPlans();
        treeSaveStatus.textContent = Dashboard.t('admin.planTreeSaved');
    } catch {
        showTreeError(treeError, Dashboard.t('admin.saveError'));
    } finally {
        treeSaveBtn.disabled = false;
    }
});

function showTreeError(el, message) {
    el.textContent = message;
    el.hidden = false;
}

// --- Per-plan change history (plans are GEIPSA-wide, not client-scoped, so
// they can't use Dashboard's client-scoped table-changes modal/endpoint) ---
let planHistoryModal = null;
let planHistoryList = null;

function ensurePlanHistoryModal() {
    if (planHistoryModal) return;
    planHistoryModal = document.createElement('div');
    planHistoryModal.className = 'modal-overlay';
    planHistoryModal.hidden = true;
    planHistoryModal.innerHTML = `
        <div class="modal-panel" style="max-width: 40rem;" role="dialog" aria-modal="true" aria-labelledby="plan-history-title">
            <h3 id="plan-history-title">${Dashboard.t('admin.planChangeHistory')}</h3>
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>${Dashboard.t('main.changeHistoryDate')}</th>
                            <th>${Dashboard.t('main.changeHistoryUser')}</th>
                            <th>${Dashboard.t('main.changeHistoryChange')}</th>
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
    document.body.appendChild(planHistoryModal);
    planHistoryList = planHistoryModal.querySelector('[data-role="list"]');
    const close = () => { planHistoryModal.hidden = true; };
    planHistoryModal.querySelector('[data-role="close"]').addEventListener('click', close);
    planHistoryModal.addEventListener('click', (event) => { if (event.target === planHistoryModal) close(); });
}

function historyRow(cells) {
    const tr = document.createElement('tr');
    cells.forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
    });
    return tr;
}

async function openPlanChangeHistory(plan) {
    ensurePlanHistoryModal();
    planHistoryModal.hidden = false;
    planHistoryList.innerHTML = '';
    planHistoryList.appendChild(historyRow([Dashboard.t('main.changeHistoryEmpty'), '', '']));
    try {
        const res = await fetch(`/api/admin/plans/${plan.id}/changes`, { credentials: 'include' });
        if (!res.ok) return;
        const { changes } = await res.json();
        if (!changes || !changes.length) return;
        planHistoryList.innerHTML = '';
        changes.forEach((change) => {
            let description;
            if (change.action === 'create') description = Dashboard.t('main.changeHistoryCreated');
            else if (change.action === 'delete') description = Dashboard.t('main.changeHistoryDeleted');
            else if (change.field_key === 'admin.activeTree') description = `${Dashboard.t('admin.planTreeTitle')}: ${change.new_value} permisos`;
            else description = `${Dashboard.t(change.field_key) || change.field_key}: "${change.old_value || '—'}" → "${change.new_value || '—'}"`;
            planHistoryList.appendChild(historyRow([change.changed_at, change.changed_by || '—', description]));
        });
    } catch {
        // Leave the empty-state row in place — no network/parse errors surfaced here.
    }
}

// "+ Nuevo Plan" — same toolbar-button placement/style as "+ Nuevo
// Registro" on Registro Combustible (Inicio-en.css .data-table-new-record-btn,
// prepended into the .data-table-zoom bar Dashboard.js already renders for
// every .data-table-wrapper), but this one just navigates to the existing
// dedicated creation page (Admin-PlanNuevo.html) instead of opening a
// modal — Nuestros Planes never had an inline create flow, no reason to
// build one now just for this button.
function renderNewPlanButton() {
    const wrapper = document.querySelector('[data-table-id="mis-planes"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="menu.addPlanNew">${Dashboard.t('menu.addPlanNew')}</span>`;
    btn.addEventListener('click', () => { window.location.href = 'Admin-PlanNuevo.html'; });
    toolbar.prepend(btn);
}

document.addEventListener('dashboard:language-changed', () => {
    renderPlans();
    renderModuleToggles(getCheckedModuleKeys());
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-planes' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        renderNewPlanButton();
        await Promise.all([loadPlans(), loadModuleCatalog()]);
    } catch (err) {
        console.error('Admin (Planes) failed to initialize:', err);
    }
})();
