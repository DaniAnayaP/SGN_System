// ---------------------------------------------------------------------------
// "Centros de Costo" — Administración del Negocio: the client's own admin
// manages their cost center catalog (código, nombre, responsable,
// descripción), capped by clients.cost_centers_limit — set by GEIPSA from
// Contrataciones (Admin-SaaS). Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

const form = document.getElementById('cc-form');
const idField = document.getElementById('cc-id');
const codeField = document.getElementById('cc-code');
const nameField = document.getElementById('cc-name');
const responsibleField = document.getElementById('cc-responsible');
const descriptionField = document.getElementById('cc-description');
const errorBanner = document.getElementById('cc-form-error');
const submitBtn = document.getElementById('cc-form-submit');
const cancelBtn = document.getElementById('cc-form-cancel');
const tableBody = document.getElementById('cc-table-body');
const emptyMsg = document.getElementById('cc-empty');
const limitStatus = document.getElementById('cc-limit-status');

let costCenters = [];
let limit = 0;

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}
function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
}

function isAtLimit() {
    return costCenters.length >= limit;
}

function refreshLimitStatus() {
    limitStatus.textContent = isAtLimit()
        ? Dashboard.t('business.ccLimitReached', { count: costCenters.length, limit })
        : Dashboard.t('business.ccLimitStatus', { count: costCenters.length, limit });
    submitBtn.disabled = isAtLimit() && !idField.value;
}

function resetForm() {
    form.reset();
    idField.value = '';
    submitBtn.textContent = Dashboard.t('business.addCostCenter');
    cancelBtn.hidden = true;
    clearError();
    refreshLimitStatus();
}

function renderCostCenters() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = costCenters.length > 0;
    costCenters.forEach((cc) => {
        const tr = document.createElement('tr');

        const tdCode = document.createElement('td');
        tdCode.textContent = cc.code;
        const tdName = document.createElement('td');
        tdName.textContent = cc.name;
        const tdResponsible = document.createElement('td');
        tdResponsible.textContent = cc.responsible || '—';
        const tdDescription = document.createElement('td');
        tdDescription.textContent = cc.description || '—';

        const tdActions = document.createElement('td');
        tdActions.className = 'admin-table-actions';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => startEdit(cc));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removeCostCenter(cc));
        tdActions.append(editBtn, deleteBtn);

        tr.append(tdCode, tdName, tdResponsible, tdDescription, tdActions);
        tableBody.appendChild(tr);
    });
    refreshLimitStatus();
}

function startEdit(cc) {
    idField.value = cc.id;
    codeField.value = cc.code;
    nameField.value = cc.name;
    responsibleField.value = cc.responsible || '';
    descriptionField.value = cc.description || '';
    submitBtn.textContent = Dashboard.t('admin.save');
    submitBtn.disabled = false;
    cancelBtn.hidden = false;
    clearError();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function removeCostCenter(cc) {
    if (!confirm(Dashboard.t('business.ccDeleteConfirm'))) return;
    try {
        const res = await fetch(`/api/business/cost-centers/${cc.id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        if (!res.ok) throw new Error('delete failed');
        costCenters = costCenters.filter((c) => c.id !== cc.id);
        renderCostCenters();
    } catch {
        alert(Dashboard.t('admin.saveError'));
    }
}

async function loadCostCenters() {
    try {
        const res = await fetch('/api/business/cost-centers', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        costCenters = data.costCenters || [];
        limit = data.limit || 0;
        renderCostCenters();
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const code = codeField.value.trim();
    const name = nameField.value.trim();
    if (!code || !name) {
        showError(Dashboard.t('admin.requiredFields'));
        return;
    }
    const responsible = responsibleField.value.trim();
    const description = descriptionField.value.trim();

    const editingId = idField.value;
    const url = editingId ? `/api/business/cost-centers/${editingId}` : '/api/business/cost-centers';
    const method = editingId ? 'PATCH' : 'POST';

    submitBtn.disabled = true;
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code, name, responsible, description }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            if (body.message === 'Cost center limit reached for this client.') {
                showError(Dashboard.t('business.ccLimitReached', { count: costCenters.length, limit }));
            } else if (body.message === 'A cost center with that code already exists.') {
                showError(Dashboard.t('business.ccCodeExists'));
            } else {
                showError(body.message || Dashboard.t('admin.saveError'));
            }
            return;
        }
        const { costCenter } = await res.json();
        if (editingId) {
            costCenters = costCenters.map((c) => (c.id === costCenter.id ? costCenter : c));
        } else {
            costCenters = [...costCenters, costCenter].sort((a, b) => a.code.localeCompare(b.code));
        }
        renderCostCenters();
        resetForm();
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = isAtLimit() && !idField.value;
    }
});

cancelBtn.addEventListener('click', resetForm);

document.addEventListener('dashboard:language-changed', () => {
    if (!idField.value) submitBtn.textContent = Dashboard.t('business.addCostCenter');
    renderCostCenters();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'business-centros-costo' });
        if (!role) return;
        await loadCostCenters();
    } catch (err) {
        console.error('Business (Centros de Costo) failed to initialize:', err);
    }
})();
