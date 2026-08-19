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
const statusField = document.getElementById('jp-status');
const errorBanner = document.getElementById('jp-form-error');
const submitBtn = document.getElementById('jp-form-submit');
const cancelBtn = document.getElementById('jp-form-cancel');
const tableBody = document.getElementById('jp-table-body');
const emptyMsg = document.getElementById('jp-empty');

let jobPositions = [];

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

        tr.append(tdName, tdStatus, tdActions);
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
        if (text && !(tr.querySelector('[data-col="jpName"]')?.textContent || '').toLowerCase().includes(text)) visible = false;
        if (status && tr.dataset.status !== status) visible = false;
        tr.hidden = !visible;
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyJpFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyJpFilters);

function startEdit(jp) {
    idField.value = jp.id;
    nameField.value = jp.name;
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
            body: JSON.stringify({ name, status }),
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
        await loadJobPositions();
    } catch (err) {
        console.error('Business (Puestos de Trabajo) failed to initialize:', err);
    }
})();
