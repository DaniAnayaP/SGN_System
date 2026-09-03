// ---------------------------------------------------------------------------
// Nuestros Respaldos (GEIPSA/SaaS side) — same evidence-file list as the
// client-side screen, but for ANY client picked from the dropdown above the
// table. Gated by the 'saas-backups' grant (Equipo SaaS); Ver and Descargar
// are separate leaves there, so the list can load for a staff member who
// still gets a 403 on the download click.
// ---------------------------------------------------------------------------

let currentClientId = '';

function textCell(value) {
    const td = document.createElement('td');
    td.textContent = value || '—';
    return td;
}

// Same 13 Control Interno columns every other table carries (see
// getSystemColumnsForRecord in db.js) -- these are what let a future
// Reportes screen relate a backed-up file to every other table by Empresa/
// Área/Módulo/Pantalla/Centro Costos/Fecha, so they stay even on a
// file-listing view that otherwise has nothing else in common with them.
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
function buildSystemCells(file) {
    return SYSTEM_COLUMN_KEYS.map((key) => {
        const td = textCell(file[key]);
        td.classList.add('col-system');
        return td;
    });
}

function buildDownloadCell(file) {
    const td = document.createElement('td');
    td.className = 'admin-table-actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-icon-btn';
    btn.setAttribute('aria-label', Dashboard.t('main.saasActionDownload'));
    btn.title = Dashboard.t('main.saasActionDownload');
    btn.innerHTML = '<i class="bx bx-download" aria-hidden="true"></i>';
    btn.addEventListener('click', () => downloadFile(file, btn));
    td.appendChild(btn);
    return td;
}

async function downloadFile(file, btn) {
    btn.disabled = true;
    try {
        const params = new URLSearchParams({ tableKey: file.tableKey, recordId: file.recordId, fieldKey: file.fieldKey });
        const res = await fetch(`/api/admin/clients/${currentClientId}/backups/download-url?${params}`, { credentials: 'include' });
        if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
        if (!res.ok) throw new Error('download-url failed');
        const { url } = await res.json();
        const a = document.createElement('a');
        a.href = url;
        a.download = file.displayName;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        console.error('Nuestros Respaldos (SaaS): download failed', err);
        Dashboard.showToast(Dashboard.t('main.backupDownloadError'), 'error');
    } finally {
        btn.disabled = false;
    }
}

function buildRow(file) {
    const tr = document.createElement('tr');
    tr.append(
        ...buildSystemCells(file),
        textCell(file.displayName),
        textCell(Dashboard.t(file.screenLabelKey)),
        textCell(Dashboard.t(file.typeLabelKey)),
        textCell(file.recordDate),
        buildDownloadCell(file),
    );
    return tr;
}

function getTbody() {
    return document.getElementById('backups-table-body');
}

function renderEmptyState(messageKey) {
    const tbody = getTbody();
    if (!tbody) return;
    tbody.innerHTML = `<tr><td class="data-table-empty-cell" colspan="18"><div class="data-table-empty-inner" data-i18n="${messageKey}">${Dashboard.t(messageKey)}</div></td></tr>`;
}

async function loadFilesForClient(clientId) {
    const tbody = getTbody();
    if (!tbody) return;
    if (!clientId) { renderEmptyState('main.backupsClientSelectPlaceholder'); return; }
    try {
        const res = await fetch(`/api/admin/clients/${clientId}/backups`, { credentials: 'include' });
        if (res.status === 403) { renderEmptyState('main.fieldLocked'); return; }
        if (!res.ok) throw new Error('load failed');
        const { files } = await res.json();
        if (!files.length) { renderEmptyState('main.emptyStateText'); return; }
        tbody.innerHTML = '';
        files.forEach((file) => tbody.appendChild(buildRow(file)));
    } catch (err) {
        console.error('Nuestros Respaldos (SaaS): failed to load files', err);
    }
}

async function loadClientOptions() {
    const select = document.getElementById('backups-client-select');
    if (!select) return;
    try {
        const res = await fetch('/api/admin/clients', { credentials: 'include' });
        if (!res.ok) throw new Error('load clients failed');
        const { clients } = await res.json();
        clients.forEach((client) => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.company_nickname || client.company_name;
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Nuestros Respaldos (SaaS): failed to load clients', err);
    }
}

document.getElementById('backups-client-select')?.addEventListener('change', (e) => {
    currentClientId = e.target.value;
    loadFilesForClient(currentClientId);
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-nuestros-respaldos' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await loadClientOptions();
    } catch (err) {
        console.error('Nuestros Respaldos (SaaS) failed to initialize:', err);
    }
})();
