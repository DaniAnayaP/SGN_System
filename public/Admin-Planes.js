// ---------------------------------------------------------------------------
// "Planes y Paquetes" — GEIPSA's own catalog of plan/package types, managed
// from the SaaS admin sidebar. These names are what populate the "Plan /
// paquete" select on Clientes Nuevos (Admin-SaaS.html). Shell (sidebar,
// i18n, settings, logout) comes from Dashboard.js.
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

let plans = [];
let moduleCatalog = []; // { key, labelKey } — same catalog Contrataciones uses

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

function resetForm() {
    form.reset();
    idField.value = '';
    costCentersLimitField.value = 0;
    renderModuleToggles([]);
    submitBtn.textContent = Dashboard.t('admin.addPlan');
    cancelBtn.hidden = true;
    clearError();
}

function renderPlans() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = plans.length > 0;
    plans.forEach((plan) => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = plan.name;
        const tdDescription = document.createElement('td');
        tdDescription.textContent = plan.description || '—';

        const tdActions = document.createElement('td');
        tdActions.className = 'admin-table-actions';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => startEdit(plan));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removePlan(plan));
        tdActions.append(editBtn, deleteBtn);

        tr.append(tdName, tdDescription, tdActions);
        tableBody.appendChild(tr);
    });
}

function startEdit(plan) {
    idField.value = plan.id;
    nameField.value = plan.name;
    descriptionField.value = plan.description || '';
    costCentersLimitField.value = plan.costCentersLimit || 0;
    renderModuleToggles(plan.modules || []);
    submitBtn.textContent = Dashboard.t('admin.save');
    cancelBtn.hidden = false;
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
    const url = editingId ? `/api/admin/plans/${editingId}` : '/api/admin/plans';
    const method = editingId ? 'PATCH' : 'POST';

    submitBtn.disabled = true;
    try {
        const res = await fetch(url, {
            method,
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
        if (editingId) {
            plans = plans.map((p) => (p.id === plan.id ? plan : p));
        } else {
            plans = [...plans, plan].sort((a, b) => a.name.localeCompare(b.name));
        }
        renderPlans();
        resetForm();
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

cancelBtn.addEventListener('click', resetForm);

document.addEventListener('dashboard:language-changed', () => {
    if (!idField.value) submitBtn.textContent = Dashboard.t('admin.addPlan');
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
