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
const permissionsModal = document.getElementById('permissions-modal');
const treeContainer = document.getElementById('permission-tree-container');
const permissionsSaveBtn = document.getElementById('permissions-save');
const permissionsSaveStatus = document.getElementById('permissions-save-status');
const permissionsEqualizeBtn = document.getElementById('permissions-equalize-app');
permissionsEqualizeBtn.addEventListener('click', () => tree?.equalizeAllAppToWeb());
const permissionsFillMissingBtn = document.getElementById('permissions-fill-missing-app');
permissionsFillMissingBtn.addEventListener('click', () => tree?.fillAllMissingAppToWeb());

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

const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];

function renderJobPositions() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = jobPositions.length > 0;
    jobPositions.forEach((jp) => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.dataset.col = 'name';
        tdName.textContent = jp.name;
        const tdAbbreviation = document.createElement('td');
        tdAbbreviation.dataset.col = 'abbreviation';
        tdAbbreviation.textContent = jp.abbreviation || '—';
        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'status';
        const badge = document.createElement('span');
        badge.className = `admin-badge admin-badge-${jp.status === 'inactive' ? 'inactivo' : 'activo'}`;
        badge.textContent = Dashboard.t(jp.status === 'inactive' ? 'main.filterInactive' : 'main.filterActive');
        tdStatus.appendChild(badge);
        const systemCols = SYSTEM_COLUMN_KEYS.map((k) => {
            const td = document.createElement('td');
            td.className = 'col-system';
            td.dataset.col = k;
            td.textContent = jp[k] || '—';
            return td;
        });

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const configureBtn = document.createElement('button');
        configureBtn.type = 'button';
        configureBtn.className = 'admin-icon-btn';
        configureBtn.setAttribute('aria-label', Dashboard.t('business.permissionsTitle'));
        configureBtn.innerHTML = '<i class="bx bx-shield" aria-hidden="true"></i>';
        configureBtn.addEventListener('click', () => selectJobPositionForPermissions(jp));
        tdActions.appendChild(configureBtn);

        tr.append(tdName, tdAbbreviation, tdStatus, ...systemCols, tdActions);
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
    treeContainer.innerHTML = '';
    permissionsModal.hidden = false;
    try {
        const res = await fetch(`/api/business/job-positions/${jp.id}/grants`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        tree = window.PermissionTree.create(treeContainer, { allowedSectionIds, costCenters, showAppTab: true });
        await tree.init(data.grants || []);
    } catch {
        permissionsSaveStatus.textContent = Dashboard.t('admin.loadError');
    }
}

function closePermissionsModal() {
    permissionsModal.hidden = true;
    tree = null;
    selectedJobPositionId = null;
}

document.getElementById('permissions-cancel').addEventListener('click', closePermissionsModal);
permissionsModal.addEventListener('click', (event) => { if (event.target === permissionsModal) closePermissionsModal(); });
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !permissionsModal.hidden) closePermissionsModal();
});

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
        closePermissionsModal();
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
