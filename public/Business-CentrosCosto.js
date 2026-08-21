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

// Mirrors db.js's own padAccountNumber -- the raw accountNumber field is
// just an integer, padded to 6 digits only for display here.
function padAccountNumber(n) {
    return String(n).padStart(6, '0');
}

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

const CONTROL_INTERNO_COLS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];

function renderCostCenters() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = costCenters.length > 0;
    costCenters.forEach((cc) => {
        const tr = document.createElement('tr');
        // This whole screen is admin-only (see Dashboard.js's "pantalla
        // habilitada" gate) and every row here is editable via the form
        // above (startEdit) — no per-column permission model like the
        // operational tables, so every row qualifies for the legend.
        tr.classList.add('data-table-row-editable');

        CONTROL_INTERNO_COLS.forEach((col) => {
            const td = document.createElement('td');
            td.dataset.col = col;
            td.className = 'col-system';
            td.textContent = cc[col] || '—';
            tr.appendChild(td);
        });

        const tdCode = document.createElement('td');
        tdCode.dataset.col = 'ccCode';
        tdCode.textContent = cc.code;
        const tdName = document.createElement('td');
        tdName.dataset.col = 'ccName';
        tdName.textContent = cc.name;
        const tdResponsible = document.createElement('td');
        tdResponsible.dataset.col = 'ccResponsible';
        tdResponsible.textContent = cc.responsible || '—';
        const tdDescription = document.createElement('td');
        tdDescription.dataset.col = 'ccDescription';
        tdDescription.textContent = cc.description || '—';
        const tdAccountNumber = document.createElement('td');
        tdAccountNumber.dataset.col = 'ccAccountNumber';
        tdAccountNumber.textContent = padAccountNumber(cc.accountNumber);
        const tdRecordCode = document.createElement('td');
        tdRecordCode.dataset.col = 'ccRecordCode';
        tdRecordCode.textContent = cc.recordCode;
        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'ccStatus';
        const statusBadge = document.createElement('span');
        statusBadge.className = `admin-badge admin-badge-${cc.status === 'inactive' ? 'inactivo' : 'activo'}`;
        statusBadge.textContent = Dashboard.t(cc.status === 'inactive' ? 'main.filterInactive' : 'main.filterActive');
        tdStatus.appendChild(statusBadge);

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openChangeHistory('centros-costo', cc.id));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => startEdit(cc));
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'admin-icon-btn';
        toggleBtn.innerHTML = `<i class="bx ${cc.status === 'inactive' ? 'bx-check-circle' : 'bx-x-circle'}" aria-hidden="true"></i>`;
        toggleBtn.setAttribute('aria-label', Dashboard.t(cc.status === 'inactive' ? 'admin.activate' : 'admin.deactivate'));
        toggleBtn.title = Dashboard.t(cc.status === 'inactive' ? 'admin.activate' : 'admin.deactivate');
        toggleBtn.addEventListener('click', () => toggleCostCenterStatus(cc));
        tdActions.append(historyBtn, editBtn, toggleBtn);

        tr.append(tdCode, tdName, tdResponsible, tdDescription, tdAccountNumber, tdRecordCode, tdStatus, tdActions);
        tableBody.appendChild(tr);
    });
    refreshLimitStatus();
    applyCcFilters();
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the field means).
// Client-side row hiding, re-applied after every renderCostCenters() so a
// filter stays active across edits instead of silently resetting.
function applyCcFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    tableBody.querySelectorAll('tr').forEach((tr) => {
        if (!text) { tr.hidden = false; return; }
        const haystack = ['ccCode', 'ccName', 'ccResponsible', 'ccDescription']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !haystack.includes(text);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyCcFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyCcFilters);

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

// No delete -- account_number/record_code are a permanent accounting
// sequence (see db.js's own migration comment), only Activar/Desactivar.
async function toggleCostCenterStatus(cc) {
    const nextStatus = cc.status === 'inactive' ? 'active' : 'inactive';
    try {
        const res = await fetch(`/api/business/cost-centers/${cc.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: nextStatus }),
        });
        if (!res.ok) throw new Error('save failed');
        const { costCenter } = await res.json();
        costCenters = costCenters.map((c) => (c.id === costCenter.id ? costCenter : c));
        renderCostCenters();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
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
        Dashboard.showToast(Dashboard.t(editingId ? 'main.changeSaved' : 'main.recordSaved'), 'success');
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
