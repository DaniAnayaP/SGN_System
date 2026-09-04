// ---------------------------------------------------------------------------
// Flujo Sistema (Material Apoyo) — document library scoped to the
// client's own current Departamento/Área (the areaCategories template every
// department shares, see menu.json's cat-material-apoyo). Both GEIPSA and
// the client itself can upload here: Ver y Operar/Editar on
// colMaterialApoyoFuncionalidad unlocks Subir/Eliminar, Solo Ver (the
// always-true floor) is enough to see the list and download — see
// server.js's canOperateMaterialApoyo for the real gate; this file doesn't
// try to predict it, it just tries the action and shows the 403 toast if
// the server says no (same convention BaseDatos-Respaldos.js uses).
// ---------------------------------------------------------------------------
const CATEGORY = 'flujo-sistema';

let currentScope = { department: '', area: '', departmentLabel: '', areaLabel: '' };

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

function renderEmptyState() {
    const tbody = getTbody();
    if (!tbody) return;
    tbody.innerHTML = `<tr><td class="data-table-empty-cell" colspan="17"><div class="data-table-empty-inner" data-i18n="main.emptyStateText">${Dashboard.t('main.emptyStateText')}</div></td></tr>`;
}

async function downloadMaterial(material, btn) {
    btn.disabled = true;
    try {
        const res = await fetch(`/api/business/material-apoyo/download-url?id=${material.id}`, { credentials: 'include' });
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
        console.error('Material Apoyo: download failed', err);
        Dashboard.showToast(Dashboard.t('main.backupDownloadError'), 'error');
    } finally {
        btn.disabled = false;
    }
}

async function deleteMaterial(material, btn) {
    if (!(await Dashboard.confirm(Dashboard.t('main.materialApoyoDeleteConfirm')))) return;
    btn.disabled = true;
    try {
        const res = await fetch(`/api/business/material-apoyo/${material.id}`, { method: 'DELETE', credentials: 'include' });
        if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
        if (!res.ok) throw new Error('delete failed');
        document.querySelector(`tr[data-material-id="${material.id}"]`)?.remove();
        if (!getTbody()?.querySelector('tr')) renderEmptyState();
    } catch (err) {
        console.error('Material Apoyo: delete failed', err);
        Dashboard.showToast(Dashboard.t('main.materialApoyoDeleteError'), 'error');
    } finally {
        btn.disabled = false;
    }
}

async function loadMaterials() {
    const tbody = getTbody();
    if (!tbody || !currentScope.department || !currentScope.area) return;
    try {
        const params = new URLSearchParams({ department: currentScope.department, area: currentScope.area, category: CATEGORY });
        const res = await fetch(`/api/business/material-apoyo?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { files } = await res.json();
        tbody.innerHTML = '';
        if (!files.length) { renderEmptyState(); return; }
        files.forEach((material) => tbody.appendChild(buildRow(material)));
    } catch (err) {
        console.error('Material Apoyo: failed to load files', err);
    }
}

function refreshScope() {
    currentScope = Dashboard.currentDepartmentArea();
}

async function uploadFile(file) {
    const titleInput = document.getElementById('material-title-input');
    const title = (titleInput?.value || '').trim();
    const blob = await Dashboard.compressImageToBlob(file);
    const contentType = blob.type || file.type || 'application/octet-stream';
    const urlRes = await fetch('/api/business/material-apoyo/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ department: currentScope.department, area: currentScope.area, category: CATEGORY, contentType }),
    });
    if (urlRes.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
    if (!urlRes.ok) throw new Error('upload-url failed');
    const { uploadUrl, key } = await urlRes.json();
    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    if (!putRes.ok) throw new Error('R2 upload failed');
    const confirmRes = await fetch('/api/business/material-apoyo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            department: currentScope.department, area: currentScope.area,
            departmentLabel: currentScope.departmentLabel, areaLabel: currentScope.areaLabel,
            category: CATEGORY, key, title, originalFilename: file.name, contentType, fileSize: blob.size || file.size,
        }),
    });
    if (!confirmRes.ok) throw new Error('confirm failed');
    const { material } = await confirmRes.json();
    getTbody()?.querySelector('.data-table-empty-cell')?.closest('tr')?.remove();
    getTbody()?.prepend(buildRow(material));
    if (titleInput) titleInput.value = '';
}

const uploadBtn = document.getElementById('material-upload-btn');
const fileInput = document.getElementById('material-file-input');
uploadBtn?.addEventListener('click', () => fileInput.click());
fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    uploadBtn.disabled = true;
    try {
        await uploadFile(file);
    } catch (err) {
        console.error('Material Apoyo: upload failed', err);
        Dashboard.showToast(Dashboard.t('main.materialApoyoUploadError'), 'error');
    } finally {
        uploadBtn.disabled = false;
    }
});

document.addEventListener('dashboard:area-changed', () => {
    refreshScope();
    loadMaterials();
});

(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'cat-material-apoyo-flujo' });
        refreshScope();
        await loadMaterials();
    } catch (err) {
        console.error('Material Apoyo (Flujo Sistema) failed to initialize:', err);
    }
})();
