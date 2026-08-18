// ---------------------------------------------------------------------------
// "Costo Accesos-Permisos" — GEIPSA-only pricing screen, one row per plan
// (same plans/GET /api/admin/plans as Nuestros Planes, never a separate
// catalog). Lets GEIPSA attach a price to every node of a plan's own access
// tree (Departamento/Área/Categoría/Pantalla/Columna, each priced and
// summed independently — see db.js computeAccessCostTotal) plus a flat
// "Costo Por Centro de Costos" rate and a currency, both always editable
// regardless of the plan's Activo/bloqueado lock (pricing is an ongoing
// commercial concern, separate from the frozen access-tree definition).
//
// Replaces the old flat "Costos de Módulos" screen (module_costs,
// MODULE_CATALOG) — that backend/table stays intact but has no UI to edit
// it anymore; "Pago por Anexos" was removed from Nuestros Clientes for now.
// Shell (sidebar, i18n, settings, logout) comes from Dashboard.js.
// ---------------------------------------------------------------------------

const tableBody = document.getElementById('pct-table-body');
const emptyMsg = document.getElementById('pct-empty');

const costModal = document.getElementById('pct-cost-modal');
const costModalTitle = document.getElementById('pct-cost-modal-title');
const costContainer = document.getElementById('pct-cost-container');
const currencySelect = document.getElementById('pct-currency');
const costSaveBtn = document.getElementById('pct-save');
const costCancelBtn = document.getElementById('pct-cancel');
const costSaveStatus = document.getElementById('pct-save-status');
const costError = document.getElementById('pct-cost-error');

let plans = [];
let selectedPlanId = null;
let tree = null;

function formatDate(value) {
    return value ? String(value).slice(0, 10) : '—';
}

function renderPlans() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = plans.length > 0;
    plans.forEach((plan) => {
        const tr = document.createElement('tr');
        tr.dataset.planStatus = !plan.locked ? 'revision' : (plan.status || 'active');
        // This whole screen is admin-only, and pricing is always editable
        // (never lock-gated) — every row qualifies for the legend.
        tr.classList.add('data-table-row-editable');

        const tdName = document.createElement('td');
        tdName.dataset.col = 'name';
        tdName.textContent = plan.name;

        const tdCreatedAt = document.createElement('td');
        tdCreatedAt.dataset.col = 'createdAt';
        tdCreatedAt.textContent = formatDate(plan.created_at);

        const tdCost = document.createElement('td');
        tdCost.dataset.col = 'accessPermCost';
        tdCost.className = 'editable-cell';
        tdCost.textContent = Dashboard.formatCurrency(plan.accessPermissionsCost, plan.currency);
        tdCost.title = Dashboard.t('main.fuelClickToEdit');
        tdCost.onclick = () => openCostModal(plan);

        const tdCostPerCC = document.createElement('td');
        tdCostPerCC.dataset.col = 'costPerCostCenter';
        Dashboard.attachInlineEdit(tdCostPerCC, {
            value: plan.costPerCostCenter ? String(plan.costPerCostCenter) : '',
            inputType: 'number',
            formatDisplay: (v) => Dashboard.formatCurrency(v, plan.currency),
            onCommit: (val) => patchPlanField(plan, { costPerCostCenter: Math.max(0, Number(val) || 0) }),
        });

        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'status';
        tdStatus.textContent = !plan.locked
            ? Dashboard.t('admin.planStatusRevision')
            : Dashboard.t(plan.status === 'inactive' ? 'admin.planStatusInactive' : 'admin.planStatusActive');

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.title = Dashboard.t('admin.edit');
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => openCostModal(plan));
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('admin.planChangeHistory'));
        historyBtn.title = Dashboard.t('admin.planChangeHistory');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openPlanChangeHistory(plan));
        tdActions.append(editBtn, historyBtn);

        tr.append(tdName, tdCreatedAt, tdCost, tdCostPerCC, tdStatus, tdActions);
        tableBody.appendChild(tr);
    });
    applyPlanFilters();
}

async function patchPlanField(plan, patch) {
    try {
        const res = await fetch(`/api/admin/plans/${plan.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error('save failed');
        const { plan: updated } = await res.json();
        plans = plans.map((p) => (p.id === updated.id ? updated : p));
        renderPlans();
    } catch {
        alert(Dashboard.t('admin.saveError'));
        await loadPlans();
    }
}

async function loadPlans() {
    try {
        const res = await fetch('/api/admin/plans', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        plans = data.plans || [];
        renderPlans();
    } catch (err) {
        console.error('Costo Accesos-Permisos: failed to load plans', err);
    }
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the fields mean).
function applyPlanFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    const status = document.getElementById('filter-status')?.value || '';
    tableBody.querySelectorAll('tr').forEach((tr) => {
        let visible = true;
        if (text && !(tr.querySelector('[data-col="name"]')?.textContent || '').toLowerCase().includes(text)) visible = false;
        if (status && tr.dataset.planStatus !== status) visible = false;
        tr.hidden = !visible;
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyPlanFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyPlanFilters);

// --- Cost tree modal (costEdit mode — see PermissionCostTree.js) ----------
async function openCostModal(plan) {
    selectedPlanId = plan.id;
    costModalTitle.textContent = `${Dashboard.t('admin.accessPermCostColumn')} — ${plan.name}`;
    costSaveStatus.textContent = '';
    costError.hidden = true;
    currencySelect.value = plan.currency || 'MXN';
    try {
        const res = await fetch(`/api/admin/plans/${plan.id}/permission-costs`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        tree = window.PermissionCostTree.create(costContainer, { mode: 'costEdit', currency: data.currency || 'MXN' });
        await tree.init([], data.costs || []);
        costModal.hidden = false;
    } catch {
        alert(Dashboard.t('admin.loadError'));
    }
}
function closeCostModal() {
    costModal.hidden = true;
}
costCancelBtn.addEventListener('click', closeCostModal);
costModal.addEventListener('click', (event) => { if (event.target === costModal) closeCostModal(); });
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !costModal.hidden) closeCostModal();
});

costSaveBtn.addEventListener('click', async () => {
    if (!selectedPlanId || !tree) return;
    costError.hidden = true;
    costSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/plans/${selectedPlanId}/permission-costs`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ costs: tree.getCosts(), currency: currencySelect.value }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            costError.textContent = body.message || Dashboard.t('admin.saveError');
            costError.hidden = false;
            return;
        }
        const { plan: updated } = await res.json();
        plans = plans.map((p) => (p.id === updated.id ? updated : p));
        renderPlans();
        costSaveStatus.textContent = Dashboard.t('admin.accessPermCostsSaved');
    } catch {
        costError.textContent = Dashboard.t('admin.saveError');
        costError.hidden = false;
    } finally {
        costSaveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', () => {
    if (plans.length) renderPlans();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-costos-modulos' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await loadPlans();
    } catch (err) {
        console.error('Costo Accesos-Permisos failed to initialize:', err);
    }
})();
