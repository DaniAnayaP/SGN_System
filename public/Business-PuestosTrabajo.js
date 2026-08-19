// ---------------------------------------------------------------------------
// "Puestos de Trabajo" — Administración de Personal (human-resources área):
// the client's own catalog of job titles. Only 'active' ones show up in Mi
// Recurso Humano's Puesto dropdown (see OpRRHHMiRecursoHumano.js) — a
// position is deactivated, never deleted, so it never breaks the label on a
// worker already using it. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

const form = document.getElementById('jp-form');
const idField = document.getElementById('jp-id');
const nameField = document.getElementById('jp-name');
const abbreviationField = document.getElementById('jp-abbreviation');
const costCenterChecklist = document.getElementById('jp-cost-center-checklist');
const statusField = document.getElementById('jp-status');
const errorBanner = document.getElementById('jp-form-error');
const submitBtn = document.getElementById('jp-form-submit');
const cancelBtn = document.getElementById('jp-form-cancel');
const tableBody = document.getElementById('jp-table-body');
const emptyMsg = document.getElementById('jp-empty');

let jobPositions = [];
let costCenters = [];

async function loadCostCenters() {
    try {
        const res = await fetch('/api/business/cost-centers', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        costCenters = data.costCenters || [];
    } catch (err) {
        console.error('Puestos de Trabajo: failed to load cost centers', err);
        costCenters = [];
    }
}
// Centro Costos Habilitados — a Puesto can be enabled for one, several, or
// every active cost center (confirmed with the user), so this is a
// checklist (like Mi Recurso Humano's own Departamento checklist) instead
// of a plain single-value <select>. "Todos" is a distinct scope value
// ('all', stored as-is) rather than "every box happens to be checked" —
// a newly created cost center should automatically be covered by a Puesto
// already set to "Todos", not left out until someone re-checks it by hand.
function parseCostCenterScope(raw) {
    if (!raw || raw === 'all') return 'all';
    try {
        const ids = JSON.parse(raw);
        return Array.isArray(ids) ? ids.map(Number) : 'all';
    } catch {
        return 'all';
    }
}
function buildCostCenterScopeChecklist(container, scope) {
    container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'hr-department-checklist-header';
    header.textContent = Dashboard.t('business.jobPositionCostCenters');
    container.appendChild(header);

    const isAll = scope === 'all';
    const selectedIds = new Set(Array.isArray(scope) ? scope : []);

    const allLabel = document.createElement('label');
    const allInput = document.createElement('input');
    allInput.type = 'checkbox';
    allInput.className = 'jp-cc-all-checkbox';
    allInput.checked = isAll;
    const allSpan = document.createElement('span');
    allSpan.textContent = Dashboard.t('main.filterAll');
    allLabel.append(allInput, allSpan);
    container.appendChild(allLabel);

    const individualInputs = [];
    costCenters.forEach((cc) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = cc.id;
        input.checked = isAll || selectedIds.has(cc.id);
        input.disabled = isAll;
        const span = document.createElement('span');
        span.textContent = `${cc.code} - ${cc.name}`;
        label.append(input, span);
        container.appendChild(label);
        individualInputs.push(input);
    });

    allInput.addEventListener('change', () => {
        individualInputs.forEach((input) => {
            input.disabled = allInput.checked;
            if (allInput.checked) input.checked = true;
        });
    });
}
// Returns 'all' or a (possibly empty — caller validates) array of ids.
function readCostCenterScope(container) {
    if (container.querySelector('.jp-cc-all-checkbox')?.checked) return 'all';
    return Array.from(container.querySelectorAll('input[type="checkbox"]:not(.jp-cc-all-checkbox):checked'))
        .map((input) => Number(input.value));
}
function costCenterScopeLabel(raw) {
    const scope = parseCostCenterScope(raw);
    if (scope === 'all') return Dashboard.t('main.filterAll');
    if (!scope.length) return '—';
    return scope
        .map((id) => costCenters.find((c) => c.id === id))
        .filter(Boolean)
        .map((cc) => cc.code)
        .join(', ') || '—';
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
    buildCostCenterScopeChecklist(costCenterChecklist, 'all');
    statusField.value = 'active';
    submitBtn.textContent = Dashboard.t('business.addJobPosition');
    cancelBtn.hidden = true;
    clearError();
}

function renderJobPositions() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = jobPositions.length > 0;
    jobPositions.forEach((jp) => {
        const tr = document.createElement('tr');
        tr.dataset.status = jp.status;
        // Admin-only screen, every row editable via the form above
        // (startEdit) — no per-column permission model, same reasoning as
        // Centros de Costo.
        tr.classList.add('data-table-row-editable');

        const tdName = document.createElement('td');
        tdName.dataset.col = 'jpName';
        tdName.textContent = jp.name;

        const tdAbbreviation = document.createElement('td');
        tdAbbreviation.dataset.col = 'jpAbbreviation';
        tdAbbreviation.textContent = jp.abbreviation || '—';

        const tdCostCenter = document.createElement('td');
        tdCostCenter.dataset.col = 'jpCostCenter';
        tdCostCenter.textContent = costCenterScopeLabel(jp.cost_center_scope);

        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'jpStatus';
        const badge = document.createElement('span');
        badge.className = `admin-badge admin-badge-${jp.status === 'active' ? 'activo' : 'inactivo'}`;
        badge.textContent = Dashboard.t(jp.status === 'active' ? 'main.filterActive' : 'main.filterInactive');
        tdStatus.appendChild(badge);

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openChangeHistory('puestos-trabajo', jp.id));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => startEdit(jp));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removeJobPosition(jp));
        tdActions.append(historyBtn, editBtn, deleteBtn);

        tr.append(tdName, tdAbbreviation, tdCostCenter, tdStatus, tdActions);
        tableBody.appendChild(tr);
    });
    applyJpFilters();
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the fields mean).
function applyJpFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    const status = document.getElementById('filter-status')?.value || '';
    tableBody.querySelectorAll('tr').forEach((tr) => {
        let visible = true;
        if (text) {
            const haystack = ['jpName', 'jpAbbreviation']
                .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
                .join(' ');
            if (!haystack.includes(text)) visible = false;
        }
        if (status && tr.dataset.status !== status) visible = false;
        tr.hidden = !visible;
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyJpFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyJpFilters);

function startEdit(jp) {
    idField.value = jp.id;
    nameField.value = jp.name;
    abbreviationField.value = jp.abbreviation || '';
    buildCostCenterScopeChecklist(costCenterChecklist, parseCostCenterScope(jp.cost_center_scope));
    statusField.value = jp.status;
    submitBtn.textContent = Dashboard.t('admin.save');
    cancelBtn.hidden = false;
    clearError();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function removeJobPosition(jp) {
    if (!confirm(Dashboard.t('business.jobPositionDeleteConfirm'))) return;
    try {
        const res = await fetch(`/api/business/job-positions/${jp.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        jobPositions = jobPositions.filter((p) => p.id !== jp.id);
        renderJobPositions();
    } catch {
        alert(Dashboard.t('admin.saveError'));
    }
}

async function loadJobPositions() {
    try {
        const res = await fetch('/api/business/job-positions', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        jobPositions = data.jobPositions || [];
        renderJobPositions();
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
    const abbreviation = abbreviationField.value.trim();
    const costCenterScope = readCostCenterScope(costCenterChecklist);
    if (Array.isArray(costCenterScope) && !costCenterScope.length) {
        showError(Dashboard.t('business.jobPositionCostCentersRequired'));
        return;
    }
    const status = statusField.value;

    const editingId = idField.value;
    const url = editingId ? `/api/business/job-positions/${editingId}` : '/api/business/job-positions';
    const method = editingId ? 'PATCH' : 'POST';

    submitBtn.disabled = true;
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, abbreviation, costCenterScope, status }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            if (body.message === 'A job position with that name already exists.') {
                showError(Dashboard.t('business.jobPositionNameExists'));
            } else {
                showError(body.message || Dashboard.t('admin.saveError'));
            }
            return;
        }
        const { jobPosition } = await res.json();
        if (editingId) {
            jobPositions = jobPositions.map((p) => (p.id === jobPosition.id ? jobPosition : p));
        } else {
            jobPositions = [...jobPositions, jobPosition].sort((a, b) => a.name.localeCompare(b.name));
        }
        renderJobPositions();
        resetForm();
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

cancelBtn.addEventListener('click', resetForm);

document.addEventListener('dashboard:language-changed', () => {
    if (!idField.value) submitBtn.textContent = Dashboard.t('business.addJobPosition');
    renderJobPositions();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-catalogos-puestos-trabajo' });
        if (!role) return;
        await loadCostCenters();
        buildCostCenterScopeChecklist(costCenterChecklist, 'all');
        await loadJobPositions();
    } catch (err) {
        console.error('Business (Puestos de Trabajo) failed to initialize:', err);
    }
})();
