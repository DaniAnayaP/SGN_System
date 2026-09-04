// ---------------------------------------------------------------------------
// Material Apoyo (GEIPSA/SaaS side) — same document library as the client-
// side MaterialApoyo-*.js screens, but for ANY client/department/área
// picked from the selects above the table. Gated by the saas-material-apoyo
// grant (Equipo SaaS); Ver and Subir are separate leaves there (see
// Admin-EquipoSaaS.js's SAAS_PERMISSION_CATALOG) -- the list can load for a
// staff member who still gets a 403 trying to upload/delete.
// ---------------------------------------------------------------------------
let currentClientId = '';
let currentDepartment = '';
let currentArea = '';

const clientSelect = document.getElementById('material-client-select');
const departmentSelect = document.getElementById('material-department-select');
const areaSelect = document.getElementById('material-area-select');
const categorySelect = document.getElementById('material-category-select');
const uploadBtn = document.getElementById('material-upload-btn');
const fileInput = document.getElementById('material-file-input');
const titleInput = document.getElementById('material-title-input');

function textCell(value) {
    const td = document.createElement('td');
    td.textContent = value || '—';
    return td;
}

const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
function buildSystemCells(material) {
    return SYSTEM_COLUMN_KEYS.map((key) => {
        const td = textCell(material[key]);
        td.classList.add('col-system');
        return td;
    });
}

function buildActionsCell(material) {
    const td = document.createElement('td');
    td.className = 'admin-table-actions';

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'admin-icon-btn';
    downloadBtn.setAttribute('aria-label', Dashboard.t('main.saasActionDownload'));
    downloadBtn.title = Dashboard.t('main.saasActionDownload');
    downloadBtn.innerHTML = '<i class="bx bx-download" aria-hidden="true"></i>';
    downloadBtn.addEventListener('click', () => downloadMaterial(material, downloadBtn));
    td.appendChild(downloadBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'admin-icon-btn';
    deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
    deleteBtn.title = Dashboard.t('admin.delete');
    deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
    deleteBtn.addEventListener('click', () => deleteMaterial(material, deleteBtn));
    td.appendChild(deleteBtn);

    return td;
}

function buildRow(material) {
    const tr = document.createElement('tr');
    tr.dataset.materialId = material.id;
    tr.append(
        ...buildSystemCells(material),
        textCell(material.title),
        textCell(material.originalFilename),
        textCell(material.uploadedByName),
        textCell(material.createdAt),
        buildActionsCell(material),
    );
    return tr;
}

function getTbody() {
    return document.getElementById('material-table-body');
}

function renderEmptyState(messageKey) {
    const tbody = getTbody();
    if (!tbody) return;
    tbody.innerHTML = `<tr><td class="data-table-empty-cell" colspan="17"><div class="data-table-empty-inner" data-i18n="${messageKey}">${Dashboard.t(messageKey)}</div></td></tr>`;
}

async function downloadMaterial(material, btn) {
    btn.disabled = true;
    try {
        const res = await fetch(`/api/admin/clients/${currentClientId}/material-apoyo/download-url?id=${material.id}`, { credentials: 'include' });
        if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
        if (!res.ok) throw new Error('download-url failed');
        const { url } = await res.json();
        const a = document.createElement('a');
        a.href = url;
        a.download = material.title || material.originalFilename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        console.error('Material Apoyo (SaaS): download failed', err);
        Dashboard.showToast(Dashboard.t('main.backupDownloadError'), 'error');
    } finally {
        btn.disabled = false;
    }
}

async function deleteMaterial(material, btn) {
    if (!(await Dashboard.confirm(Dashboard.t('main.materialApoyoDeleteConfirm')))) return;
    btn.disabled = true;
    try {
        const res = await fetch(`/api/admin/clients/${currentClientId}/material-apoyo/${material.id}`, { method: 'DELETE', credentials: 'include' });
        if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
        if (!res.ok) throw new Error('delete failed');
        document.querySelector(`tr[data-material-id="${material.id}"]`)?.remove();
        if (!getTbody()?.querySelector('tr')) renderEmptyState('main.emptyStateText');
    } catch (err) {
        console.error('Material Apoyo (SaaS): delete failed', err);
        Dashboard.showToast(Dashboard.t('main.materialApoyoDeleteError'), 'error');
    } finally {
        btn.disabled = false;
    }
}

function currentScopeReady() {
    return !!(currentClientId && currentDepartment && currentArea && categorySelect.value);
}

async function loadMaterials() {
    if (!currentScopeReady()) { renderEmptyState('main.backupsClientSelectPlaceholder'); return; }
    try {
        const params = new URLSearchParams({ department: currentDepartment, area: currentArea, category: categorySelect.value });
        const res = await fetch(`/api/admin/clients/${currentClientId}/material-apoyo?${params}`, { credentials: 'include' });
        if (res.status === 403) { renderEmptyState('main.fieldLocked'); return; }
        if (!res.ok) throw new Error('load failed');
        const { files } = await res.json();
        const tbody = getTbody();
        if (!files.length) { renderEmptyState('main.emptyStateText'); return; }
        tbody.innerHTML = '';
        files.forEach((material) => tbody.appendChild(buildRow(material)));
    } catch (err) {
        console.error('Material Apoyo (SaaS): failed to load files', err);
    }
}

function updateUploadEnabled() {
    uploadBtn.disabled = !currentScopeReady();
}

function populateDepartmentSelect() {
    departmentSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = Dashboard.t('main.materialApoyoSelectDepartment');
    departmentSelect.appendChild(placeholder);
    Dashboard.DEPARTMENTS.forEach((dept) => {
        const option = document.createElement('option');
        option.value = dept.key;
        option.textContent = Dashboard.t(dept.labelKey);
        departmentSelect.appendChild(option);
    });
    departmentSelect.disabled = false;
}

function populateAreaSelect(departmentKey) {
    areaSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = Dashboard.t('main.materialApoyoSelectArea');
    areaSelect.appendChild(placeholder);
    const areas = Dashboard.AREAS_BY_DEPARTMENT[departmentKey] || [];
    areas.forEach((area) => {
        const option = document.createElement('option');
        option.value = area.key;
        option.textContent = Dashboard.t(area.labelKey, area.labelParams || {});
        areaSelect.appendChild(option);
    });
    areaSelect.disabled = false;
}

function placeholderOption(labelKey) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = Dashboard.t(labelKey);
    return option;
}

function resetDownstream(from) {
    if (from === 'client') {
        departmentSelect.innerHTML = '';
        departmentSelect.appendChild(placeholderOption('main.materialApoyoSelectDepartment'));
        departmentSelect.disabled = true;
    }
    if (from === 'client' || from === 'department') {
        areaSelect.innerHTML = '';
        areaSelect.appendChild(placeholderOption('main.materialApoyoSelectArea'));
        areaSelect.disabled = true;
        currentArea = '';
    }
    categorySelect.disabled = true;
    updateUploadEnabled();
    renderEmptyState('main.backupsClientSelectPlaceholder');
}

clientSelect?.addEventListener('change', (e) => {
    currentClientId = e.target.value;
    currentDepartment = '';
    currentArea = '';
    if (!currentClientId) { resetDownstream('client'); return; }
    populateDepartmentSelect();
    resetDownstream('department');
});

departmentSelect?.addEventListener('change', (e) => {
    currentDepartment = e.target.value;
    currentArea = '';
    if (!currentDepartment) { resetDownstream('department'); return; }
    populateAreaSelect(currentDepartment);
    categorySelect.disabled = true;
    updateUploadEnabled();
    renderEmptyState('main.backupsClientSelectPlaceholder');
});

areaSelect?.addEventListener('change', (e) => {
    currentArea = e.target.value;
    if (!currentArea) { categorySelect.disabled = true; updateUploadEnabled(); renderEmptyState('main.backupsClientSelectPlaceholder'); return; }
    categorySelect.disabled = false;
    updateUploadEnabled();
    loadMaterials();
});

categorySelect?.addEventListener('change', () => {
    updateUploadEnabled();
    loadMaterials();
});

async function uploadFile(file) {
    const title = (titleInput?.value || '').trim();
    const blob = await Dashboard.compressImageToBlob(file);
    const contentType = blob.type || file.type || 'application/octet-stream';
    const urlRes = await fetch(`/api/admin/clients/${currentClientId}/material-apoyo/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ department: currentDepartment, area: currentArea, category: categorySelect.value, contentType }),
    });
    if (urlRes.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
    if (!urlRes.ok) throw new Error('upload-url failed');
    const { uploadUrl, key } = await urlRes.json();
    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    if (!putRes.ok) throw new Error('R2 upload failed');
    const deptOption = departmentSelect.options[departmentSelect.selectedIndex];
    const areaOption = areaSelect.options[areaSelect.selectedIndex];
    const confirmRes = await fetch(`/api/admin/clients/${currentClientId}/material-apoyo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            department: currentDepartment, area: currentArea,
            departmentLabel: deptOption?.textContent || currentDepartment, areaLabel: areaOption?.textContent || currentArea,
            category: categorySelect.value, key, title, originalFilename: file.name, contentType, fileSize: blob.size || file.size,
        }),
    });
    if (!confirmRes.ok) throw new Error('confirm failed');
    const { material } = await confirmRes.json();
    getTbody()?.querySelector('.data-table-empty-cell')?.closest('tr')?.remove();
    getTbody()?.prepend(buildRow(material));
    if (titleInput) titleInput.value = '';
}

uploadBtn?.addEventListener('click', () => fileInput.click());
fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    uploadBtn.disabled = true;
    try {
        await uploadFile(file);
    } catch (err) {
        console.error('Material Apoyo (SaaS): upload failed', err);
        Dashboard.showToast(Dashboard.t('main.materialApoyoUploadError'), 'error');
    } finally {
        updateUploadEnabled();
    }
});

async function loadClientOptions() {
    if (!clientSelect) return;
    try {
        const res = await fetch('/api/admin/clients', { credentials: 'include' });
        if (!res.ok) throw new Error('load clients failed');
        const { clients } = await res.json();
        clients.forEach((client) => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.company_nickname || client.company_name;
            clientSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Material Apoyo (SaaS): failed to load clients', err);
    }
}

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-material-apoyo' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await loadClientOptions();
    } catch (err) {
        console.error('Material Apoyo (SaaS) failed to initialize:', err);
    }
})();
