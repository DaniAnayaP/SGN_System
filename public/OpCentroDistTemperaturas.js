// ---------------------------------------------------------------------------
// Temperaturas (Operaciones, C. Distribución): la BASE DE REGISTROS (con usuario) de las lecturas de temperatura que se hacen con el QR de cada refrigerador (activo tipo Frío) del Layout: quién la
// tomó, la temperatura que marcaba (°C), la hora (se guarda en UTC y aquí se ve en tu hora, con el UTC al pasar el cursor) y la foto de la lectura, tomada con la cámara en vivo. Trae las columnas de
// Control Interno (empresa, área, módulo, pantalla y centro de costos…) para distinguir cuando se juntan varios sitios. Lo que llega del QR no se puede cambiar; con usuario y el permiso Eliminar se
// puede quitar un registro. Las filas salen del servidor (GET /api/business/temperatures) y las fotos de GET /api/business/temperatures/:id/photo.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'temperaturas';
const API = '/api/business/temperatures';
const DELETE_AUTH_COL = 'colTmpDeleteAuth';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['colSysCentroCostos', 'colTmpZona', 'colTmpHuella', 'colTmpActivo', 'colTmpLocalizador', 'colTmpQuien', 'colTmpTemperatura', 'colTmpHumedad', 'colTmpOrigen'];

const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Temperaturas failed to initialize:', err);
    }
})();

// ---- tabla --------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
// Fecha y hora en la zona de quien la ve; al pasar el cursor, el UTC con el que se guardó.
function timeCell(col, iso) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (!iso) { td.textContent = '—'; return td; }
    const d = new Date(iso);
    td.textContent = d.toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    td.title = `UTC ${iso.replace('T', ' ').replace('Z', '')}`;
    return td;
}
function temperatureCell(col, value) {
    const td = cell(col, Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '');
    td.classList.add('tmp-value');
    return td;
}
// La humedad (%) que marcaba; las lecturas de antes de agregarla quedan sin ese dato.
function humidityCell(col, value) {
    const td = cell(col, value === null || value === undefined || !Number.isFinite(Number(value)) ? '' : Number(value).toFixed(1));
    td.classList.add('tmp-value');
    return td;
}
function photoCell(col, r) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (!r.hasPhoto) { td.textContent = '—'; return td; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lim-photo';
    btn.setAttribute('aria-label', t('main.tmpFotoVer'));
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = `${API}/${r.id}/photo`;
    btn.appendChild(img);
    btn.addEventListener('click', () => openViewer(r));
    td.appendChild(btn);
    return td;
}
const footprintText = (r) => r.footprintCode || '';
const assetText = (r) => (r.spaceCode ? `${r.spaceCode} · ${t(`main.layoutType_space_${r.spaceType || 'cold'}`)}` : '');

function actionsCell(r, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    if (Dashboard.hasColumnDeleteGrant(TABLE_KEY, DELETE_AUTH_COL)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'admin-icon-btn admin-icon-btn-danger';
        btn.setAttribute('data-help-key', 'delete');
        btn.setAttribute('aria-label', t('admin.delete'));
        btn.title = t('admin.delete');
        btn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        btn.addEventListener('click', () => deleteRecord(r, tr));
        td.appendChild(btn);
    }
    return td;
}

function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    const system = r.system || {};
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, system[key], 'col-system')),
        cell('colCatRegistroUnico', `TMP-${r.id}`, 'col-system'),
        cell('colTmpZona', r.zoneName), cell('colTmpHuella', footprintText(r)), cell('colTmpActivo', assetText(r)), cell('colTmpLocalizador', r.locator, 'rel-locator'), cell('colTmpQuien', r.name),
        timeCell('colTmpMomento', r.checkedAt), temperatureCell('colTmpTemperatura', r.temperature), humidityCell('colTmpHumedad', r.humidity), photoCell('colTmpFoto', r),
        cell('colTmpOrigen', t(r.source === 'qr' ? 'main.tmpOrigenQr' : 'main.tmpOrigenUsuario')),
    );
    tr.appendChild(actionsCell(r, tr));
    return tr;
}

function getTbody() {
    return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
}
function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = document.querySelectorAll('table.data-table thead th').length;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

// Las filas se dibujan por tandas (con miles no se congela la pantalla) y una recarga que llega a la mitad cancela la anterior.
const ROW_CHUNK = 100;
let renderToken = 0;
const nextTurn = () => (window.scheduler && window.scheduler.yield ? window.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
function setNote(text) {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar) return;
    let el = toolbar.querySelector('.rel-loading-rows');
    if (!text) { if (el) el.remove(); return; }
    if (!el) {
        el = document.createElement('span');
        el.className = 'rel-loading-rows tpl-muted';
        el.setAttribute('aria-live', 'polite');
        toolbar.prepend(el);
    }
    el.textContent = text;
}

async function refreshTable() {
    const tbody = getTbody();
    const token = ++renderToken;
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== renderToken) return;
        // Solo las lecturas de los centros de costos marcados arriba.
        const selected = Dashboard.getSelectedCostCenterIds();
        const rows = body.temperatures.filter((r) => !selected || !r.cc || selected.includes(r.cc));
        tbody.innerHTML = '';
        const note = body.truncated ? t('main.tmpCortado', { n: body.max }) : '';
        if (!rows.length) { setNote(note); ensureEmptyState(); return; }
        for (let from = 0; from < rows.length; from += ROW_CHUNK) {
            if (token !== renderToken) return;
            const fragment = document.createDocumentFragment();
            rows.slice(from, from + ROW_CHUNK).forEach((r) => fragment.appendChild(buildRow(r)));
            tbody.appendChild(fragment);
            if (from + ROW_CHUNK < rows.length) {
                setNote(t('main.relLoadingRows', { done: Math.min(from + ROW_CHUNK, rows.length), total: rows.length }));
                await nextTurn();
            }
        }
        if (token !== renderToken) return;
        setNote(note);
        applyFilters();
    } catch (err) {
        if (token === renderToken) setNote('');
        console.error('Temperaturas: failed to load records', err);
    }
}
document.addEventListener('sgn:cost-centers-changed', () => refreshTable());

function applyFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = SEARCH_COLUMNS.map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '').join(' ');
        tr.hidden = !SearchSyntax.matches('contains', text, haystack);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);

async function deleteRecord(r, tr) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`${API}/${r.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(body.message || Dashboard.t('main.fieldLocked'), 'warning');
            return;
        }
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Temperaturas: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// ---- visor de la foto de la lectura ------------------------------------------------------------------------------------------------------
let viewerEl = null;
function openViewer(r) {
    if (!viewerEl) {
        viewerEl = document.createElement('div');
        viewerEl.className = 'modal-overlay';
        viewerEl.hidden = true;
        viewerEl.innerHTML = '<div class="modal-panel lim-viewer" role="dialog" aria-modal="true"><h3 id="tmp-viewer-title"></h3><img id="tmp-viewer-img" alt=""></div>';
        document.body.appendChild(viewerEl);
        viewerEl.addEventListener('click', (event) => { if (event.target === viewerEl) viewerEl.hidden = true; });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') viewerEl.hidden = true; });
    }
    viewerEl.querySelector('#tmp-viewer-title').textContent = `${r.spaceCode || ''} · ${Number(r.temperature).toFixed(1)} °C${r.humidity === null || r.humidity === undefined ? '' : ` · ${Number(r.humidity).toFixed(1)} %`} · ${r.name || ''}`;
    viewerEl.querySelector('#tmp-viewer-img').src = `${API}/${r.id}/photo`;
    viewerEl.hidden = false;
}
})();
