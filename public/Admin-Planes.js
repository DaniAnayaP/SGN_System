// ---------------------------------------------------------------------------
// "Mis Planes" (formerly "Planes Registrados") — view/edit/delete GEIPSA's
// existing plan/package catalog, plus configure each plan's OWN access tree
// (which departamentos/áreas/apartados/pantallas/columnas it bundles in —
// same PermissionTree.js component Business-Roles.js already uses for a
// client's profiles, mounted here against a plan instead). These names are
// what populate the "Plan / paquete" select on Clientes Nuevos
// (Admin-SaaS.html). Creating a brand new plan lives on its own page
// instead (+ Agregar Plan Nuevo, Admin-PlanNuevo.js) — the edit form here
// only ever appears via startEdit(). Shell (sidebar, i18n, settings,
// logout) comes from Dashboard.js.
//
// Locking: the FIRST time a plan's access tree is saved, the plan locks —
// name/description/modules/costCentersLimit and the tree itself become
// read-only from then on (a plan's definition is meant to be final once
// clients start getting assigned to it). Status/end date are lifecycle
// fields and stay editable regardless. While the project is still in
// development, the server relaxes this (see DEV_MODE_ALLOW_LOCKED_PLAN_EDITS
// in server.js) — `devModeOverride` (from GET /api/admin/plans) reflects
// that here so the UI can say so instead of silently allowing edits with no
// explanation.
//
// Access note: the sidebar only shows this page's link to admins, and the
// redirect below covers anyone who lands here directly without the role —
// but the actual enforcement is server-side (requireAdmin on every
// /api/admin/* route in server.js). This redirect is UX only.
// ---------------------------------------------------------------------------

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

const treeHeading = document.getElementById('plan-tree-heading');
const treeHint = document.getElementById('plan-tree-hint');
const treePanel = document.getElementById('plan-tree-panel');
const treeContainer = document.getElementById('plan-tree-container');
const treeLockedNote = document.getElementById('plan-tree-locked-note');
const treeSaveBtn = document.getElementById('plan-tree-save');
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

// This form is edit-only here (creating a plan lives on its own page, +
// Agregar Plan Nuevo) — it only ever appears via startEdit, and hides
// again once you're done with it.
function resetForm() {
    form.reset();
    form.hidden = true;
    idField.value = '';
    costCentersLimitField.value = 0;
    renderModuleToggles([]);
    clearError();
}

function formatDate(value) {
    if (!value) return '—';
    return value.slice(0, 10);
}

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
    } catch {
        alert(Dashboard.t('admin.saveError'));
        await loadPlans();
    }
}

function buildStatusCell(plan) {
    const td = document.createElement('td');
    td.dataset.col = 'status';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    [['active', 'admin.planStatusActive'], ['inactive', 'admin.planStatusInactive']].forEach(([val, key]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = Dashboard.t(key);
        select.appendChild(opt);
    });
    select.value = plan.status || 'active';
    // Status is a lifecycle field — always editable, even on a locked plan.
    select.addEventListener('change', () => patchPlanField(plan, { status: select.value }).then(renderPlans));
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

function renderPlans() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = plans.length > 0;
    plans.forEach((plan) => {
        const tr = document.createElement('tr');

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
            editBtn.addEventListener('click', () => startEdit(plan));
        }
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removePlan(plan));
        tdActions.append(treeBtn, historyBtn, editBtn, deleteBtn);

        tr.append(tdName, tdDescription, tdCreatedAt, tdCreatedBy, buildEndDateCell(plan), buildStatusCell(plan), buildLockedCell(plan), tdActions);
        tableBody.appendChild(tr);
    });
}

function startEdit(plan) {
    idField.value = plan.id;
    nameField.value = plan.name;
    descriptionField.value = plan.description || '';
    costCentersLimitField.value = plan.costCentersLimit || 0;
    renderModuleToggles(plan.modules || []);
    form.hidden = false;
    clearError();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            treePanel.hidden = true;
            treeHint.hidden = false;
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
        resetForm();
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

cancelBtn.addEventListener('click', resetForm);

// --- Access tree per plan (mirrors Business-Roles.js's per-profile panel) --
async function selectPlanForTree(plan) {
    selectedPlanId = plan.id;
    treeHeading.textContent = `${Dashboard.t('admin.planTreeTitle')} — ${plan.name}`;
    treeSaveStatus.textContent = '';
    const locked = isHardLocked(plan);
    treeLockedNote.hidden = !plan.locked;
    if (plan.locked) {
        treeLockedNote.textContent = Dashboard.t(locked ? 'admin.planLockedHardNote' : 'admin.planLockedDevNote');
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
        tree = window.PermissionTree.create(treeContainer, { allowedSectionIds: null, costCenters: [] });
        await tree.init(data.grants || []);
        treeContainer.classList.toggle('perm-tree-view-only', locked);
        treePanel.hidden = false;
        treeHint.hidden = true;
        treePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
        treeHint.textContent = Dashboard.t('admin.loadError');
        treeHint.hidden = false;
        treePanel.hidden = true;
    }
}

treeSaveBtn.addEventListener('click', async () => {
    if (!selectedPlanId || !tree) return;
    treeSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/plans/${selectedPlanId}/grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: tree.getGrants() }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            treeSaveStatus.textContent = body.message || Dashboard.t('admin.saveError');
            return;
        }
        treeSaveStatus.textContent = Dashboard.t('admin.planTreeSaved');
        await loadPlans();
        const plan = plans.find((p) => p.id === selectedPlanId);
        if (plan) selectPlanForTree(plan);
    } catch {
        treeSaveStatus.textContent = Dashboard.t('admin.saveError');
    } finally {
        treeSaveBtn.disabled = false;
    }
});

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
        await Promise.all([loadPlans(), loadModuleCatalog()]);
    } catch (err) {
        console.error('Admin (Planes) failed to initialize:', err);
    }
})();
