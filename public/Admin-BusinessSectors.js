// ---------------------------------------------------------------------------
// "Nuestros Sectores de Negocio" — the catalog Nuestras APPs' own Sector de
// Negocio field picks from (see Admin-NuestrasApps.js's populateSectorSelect).
// Flat list, no edit — a sector's name is either right or you delete it and
// add the correct one, same reasoning as not letting Sector de Negocio drift
// out of sync between a client and an app on a typo. Shell (sidebar, i18n,
// settings, logout) comes from Dashboard.js.
// ---------------------------------------------------------------------------

// The 13 "Control Interno" system columns (see getSystemColumnsForRecord
// in db.js) — same key order as the table's own <th data-col="colSys...">.
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];

const tableBody = document.getElementById('sectors-table-body');
const emptyMsg = document.getElementById('sectors-empty');

const addModal = document.getElementById('sector-add-modal');
const form = document.getElementById('sector-form');
const nameField = document.getElementById('sector-name');
const formError = document.getElementById('sector-form-error');
const submitBtn = document.getElementById('sector-form-submit');
const cancelBtn = document.getElementById('sector-form-cancel');

let sectors = [];

function showError(message) {
    formError.textContent = message;
    formError.hidden = false;
}
function clearError() {
    formError.hidden = true;
    formError.textContent = '';
}

function renderSectors() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = sectors.length > 0;
    sectors.forEach((sector) => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.dataset.col = 'name';
        tdName.textContent = sector.name;
        const tdPermissions = document.createElement('td');
        tdPermissions.dataset.col = 'permissions';
        const treeBtn = document.createElement('button');
        treeBtn.type = 'button';
        treeBtn.className = 'admin-icon-btn';
        treeBtn.setAttribute('aria-label', Dashboard.t('admin.sectorTreeTitle'));
        treeBtn.title = Dashboard.t('admin.sectorTreeTitle');
        treeBtn.innerHTML = '<i class="bx bx-shield" aria-hidden="true"></i>';
        treeBtn.addEventListener('click', () => openSectorTreeModal(sector));
        tdPermissions.appendChild(treeBtn);
        const tdCreatedAt = document.createElement('td');
        tdCreatedAt.dataset.col = 'createdAt';
        tdCreatedAt.textContent = sector.createdAt ? sector.createdAt.slice(0, 10) : '—';
        const tdCreatedBy = document.createElement('td');
        tdCreatedBy.dataset.col = 'createdBy';
        tdCreatedBy.textContent = sector.createdBy || '—';
        const systemCols = SYSTEM_COLUMN_KEYS.map((k) => {
            const td = document.createElement('td');
            td.className = 'col-system';
            td.dataset.col = k;
            td.textContent = sector[k] || '—';
            return td;
        });
        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removeSector(sector));
        tdActions.append(deleteBtn);
        tr.append(tdName, tdPermissions, tdCreatedAt, tdCreatedBy, ...systemCols, tdActions);
        tableBody.appendChild(tr);
    });
}

async function loadSectors() {
    try {
        const res = await fetch('/api/admin/business-sectors', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        sectors = data.sectors || [];
        renderSectors();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.loadError'), 'error');
    }
}

async function removeSector(sector) {
    if (!(await Dashboard.confirm(Dashboard.t('admin.confirmDeleteBusinessSector')))) return;
    try {
        const res = await fetch(`/api/admin/business-sectors/${sector.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        sectors = sectors.filter((s) => s.id !== sector.id);
        renderSectors();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

function openAddModal() {
    form.reset();
    clearError();
    addModal.hidden = false;
    nameField.focus();
}
function closeAddModal() {
    addModal.hidden = true;
}
cancelBtn.addEventListener('click', closeAddModal);
addModal.addEventListener('click', (event) => { if (event.target === addModal) closeAddModal(); });

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    const name = nameField.value.trim();
    if (!name) {
        showError(Dashboard.t('admin.requiredFields'));
        return;
    }
    submitBtn.disabled = true;
    try {
        const res = await fetch('/api/admin/business-sectors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const { sector } = await res.json();
        sectors = [...sectors, sector].sort((a, b) => a.name.localeCompare(b.name));
        renderSectors();
        closeAddModal();
        Dashboard.showToast(Dashboard.t('main.recordSaved'), 'success');
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

// "+ Crear Nuevo Sector" — same toolbar-button placement/style as "+ Nuevo
// Plan"/"+ Crear Nueva App" (see renderNewAppButton in Admin-NuestrasApps.js).
function renderNewSectorButton() {
    const wrapper = document.querySelector('[data-table-id="business-sectors"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="menu.addBusinessSectorNew">${Dashboard.t('menu.addBusinessSectorNew')}</span>`;
    btn.addEventListener('click', openAddModal);
    toolbar.prepend(btn);
}

// --- Default access tree per sector (mirrors Business-Roles.js's per-
// Puesto panel, opened as a modal instead of an inline panel — same
// "pantalla alterna" idea Nuestros Planes' own tree modal already uses) ---
const sectorTreeModal = document.getElementById('sector-tree-modal');
const sectorTreeModalTitle = document.getElementById('sector-tree-modal-title');
const sectorTreeContainer = document.getElementById('sector-tree-container');
const sectorTreeError = document.getElementById('sector-tree-error');
const sectorTreeSaveBtn = document.getElementById('sector-tree-save');
const sectorTreeCloseBtn = document.getElementById('sector-tree-close');

let sectorTree = null;
let selectedSectorId = null;

async function openSectorTreeModal(sector) {
    selectedSectorId = sector.id;
    sectorTreeModalTitle.textContent = `${Dashboard.t('admin.sectorTreeTitle')} — ${sector.name}`;
    sectorTreeError.hidden = true;
    sectorTreeContainer.innerHTML = '';
    sectorTreeModal.hidden = false;
    try {
        const res = await fetch(`/api/admin/business-sectors/${sector.id}/grants`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        sectorTree = window.PermissionTree.create(sectorTreeContainer, { showAppTab: true });
        await sectorTree.init(data.grants || []);
    } catch {
        sectorTreeError.textContent = Dashboard.t('admin.loadError');
        sectorTreeError.hidden = false;
    }
}

function closeSectorTreeModal() {
    sectorTreeModal.hidden = true;
    sectorTree = null;
    selectedSectorId = null;
}
sectorTreeCloseBtn.addEventListener('click', closeSectorTreeModal);
sectorTreeModal.addEventListener('click', (event) => { if (event.target === sectorTreeModal) closeSectorTreeModal(); });

sectorTreeSaveBtn.addEventListener('click', async () => {
    if (!selectedSectorId || !sectorTree) return;
    sectorTreeSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/business-sectors/${selectedSectorId}/grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: sectorTree.getGrants() }),
        });
        if (!res.ok) throw new Error('save failed');
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        sectorTreeSaveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', renderSectors);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-business-sectors' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        renderNewSectorButton();
        await loadSectors();
    } catch (err) {
        console.error('Admin (Business Sectors) failed to initialize:', err);
    }
})();
