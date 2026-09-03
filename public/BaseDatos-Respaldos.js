// ---------------------------------------------------------------------------
// Nuestros Respaldos (client side) — read-only list of every evidence photo/
// document this client has generated (Registro Combustible, Carga
// Combustible), one row per FILE with a self-explaining display name, so a
// client doing a manual backup can identify every file. List loads with
// just requireAuth (same convention as every other screen — 'solo-ver' is
// getColumnGrantLevel's own always-true floor, so it can't gate visibility;
// see db.js's TABLE_GRANT_PATHS['respaldos'] comment); Descargar is the
// real gate, checked server-side per click.
// ---------------------------------------------------------------------------

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
        const res = await fetch(`/api/business/evidence-download-url?${params}`, { credentials: 'include' });
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
        console.error('Nuestros Respaldos: download failed', err);
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

function ensureEmptyState() {
    const tbody = getTbody();
    if (!tbody || tbody.querySelector('tr')) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="data-table-empty-cell" colspan="18"><div class="data-table-empty-inner" data-i18n="main.emptyStateText">${Dashboard.t('main.emptyStateText')}</div></td>`;
    tbody.appendChild(tr);
}

async function loadFiles() {
    const tbody = getTbody();
    if (!tbody) return;
    try {
        const res = await fetch('/api/business/base-datos-respaldos', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { files } = await res.json();
        tbody.innerHTML = '';
        if (!files.length) { ensureEmptyState(); return; }
        files.forEach((file) => tbody.appendChild(buildRow(file)));
    } catch (err) {
        console.error('Nuestros Respaldos: failed to load files', err);
    }
}

(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'btn-base-datos' });
        await loadFiles();
    } catch (err) {
        console.error('Nuestros Respaldos failed to initialize:', err);
    }
})();
