// ---------------------------------------------------------------------------
// "Roles" — Administración del Negocio: configure what each Puesto de
// Trabajo (job_positions, catalog owned by Business-PuestosTrabajo.html)
// grants by default, using the shared PermissionTree component. Anyone
// hired into a Puesto (Mi Recurso Humano) inherits exactly this set the
// moment their account activates — see hr_workers.job_position_id and
// getUserEffectiveGrants in db.js. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

const tableBody = document.getElementById('job-positions-table-body');
const emptyMsg = document.getElementById('job-positions-empty');

const permissionsHeading = document.getElementById('permissions-heading');
const permissionsHint = document.getElementById('permissions-hint');
const permissionsPanel = document.getElementById('permissions-panel');
const treeContainer = document.getElementById('permission-tree-container');
const permissionsSaveBtn = document.getElementById('permissions-save');
const permissionsSaveStatus = document.getElementById('permissions-save-status');

let jobPositions = [];
let selectedJobPositionId = null;
let tree = null;
let allowedSectionIds = null;
let costCenters = [];

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

function renderJobPositions() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = jobPositions.length > 0;
    jobPositions.forEach((jp) => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = jp.name;
        const tdAbbreviation = document.createElement('td');
        tdAbbreviation.textContent = jp.abbreviation || '—';
        const tdStatus = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `admin-badge admin-badge-${jp.status === 'inactive' ? 'inactivo' : 'activo'}`;
        badge.textContent = Dashboard.t(jp.status === 'inactive' ? 'main.filterInactive' : 'main.filterActive');
        tdStatus.appendChild(badge);

        const tdActions = document.createElement('td');
        tdActions.className = 'admin-table-actions';
        const configureBtn = document.createElement('button');
        configureBtn.type = 'button';
        configureBtn.className = 'admin-icon-btn';
        configureBtn.setAttribute('aria-label', Dashboard.t('business.permissionsTitle'));
        configureBtn.innerHTML = '<i class="bx bx-shield" aria-hidden="true"></i>';
        configureBtn.addEventListener('click', () => selectJobPositionForPermissions(jp));
        tdActions.appendChild(configureBtn);

        tr.append(tdName, tdAbbreviation, tdStatus, tdActions);
        tableBody.appendChild(tr);
    });
}

async function loadJobPositions() {
    try {
        const res = await fetch('/api/business/job-positions', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        jobPositions = data.jobPositions || [];
        renderJobPositions();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.loadError'), 'error');
    }
}

async function selectJobPositionForPermissions(jp) {
    selectedJobPositionId = jp.id;
    permissionsHeading.textContent = `${Dashboard.t('business.permissionsTitle')} — ${jp.name}`;
    permissionsSaveStatus.textContent = '';
    try {
        const res = await fetch(`/api/business/job-positions/${jp.id}/grants`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        tree = window.PermissionTree.create(treeContainer, { allowedSectionIds, costCenters, showAppTab: true });
        await tree.init(data.grants || []);
        permissionsPanel.hidden = false;
        permissionsHint.hidden = true;
        permissionsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
        permissionsHint.textContent = Dashboard.t('admin.loadError');
        permissionsHint.hidden = false;
        permissionsPanel.hidden = true;
    }
}

permissionsSaveBtn.addEventListener('click', async () => {
    if (!selectedJobPositionId || !tree) return;
    permissionsSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/business/job-positions/${selectedJobPositionId}/grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: tree.getGrants() }),
        });
        if (!res.ok) throw new Error('save failed');
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        permissionsSaveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', () => {
    renderJobPositions();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'business-roles' });
        if (!role) return;
        await Promise.all([loadJobPositions(), loadContractedModules(), loadCostCentersForTree()]);
    } catch (err) {
        console.error('Business (Roles) failed to initialize:', err);
    }
})();
