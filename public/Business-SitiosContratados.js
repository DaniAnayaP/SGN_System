// ---------------------------------------------------------------------------
// Administración del Negocio › Servicio Contratado › Sitios Contratados: los sitios (lugares físicos) del cliente, cada uno con los centros de costos que tiene dentro (Sitio > Centro de costos), y arriba cuántos sitios y centros usa contra lo
// contratado (el contrato lleva dos límites: sitios y centros de costos). La tabla es de solo lectura: los sitios se crean al darle su código de sitio a un centro de costos (Nuestros Centros Costos); el botón «+ Nuevo sitio» (administrador del cliente) lleva
// directo a ese formulario. Los renglones salen de GET /api/business/sites.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'sitios-contratados';
const API = '/api/business/sites';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};

let sites = [];
let limits = { sitesLimit: 0, sitesUsed: 0, costCentersLimit: 0, costCentersUsed: 0, withoutSite: 0 };

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Sitios Contratados failed to initialize:', err);
    }
})();

function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function actionsCell(site) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const history = document.createElement('button');
    history.type = 'button';
    history.className = 'admin-icon-btn';
    history.setAttribute('data-help-key', 'changeHistory');
    history.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitle'));
    history.title = Dashboard.t('main.changeHistoryTitle');
    history.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    // el código de un sitio vive en sus centros de costos: se ve el historial de Nuestros Centros Costos
    history.addEventListener('click', () => Dashboard.openChangeHistory('centros-costo'));
    td.appendChild(history);
    return td;
}
function buildRow(site) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = site.code;
    const centersText = site.centers.map((c) => `${c.code} · ${c.name}`).join(', ');
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, site[key], 'col-system')),
        cell('colSitCodigo', site.code), cell('colSitSucursal', site.sucursal), cell('colSitUbicacion', [site.state, site.locality].filter(Boolean).join(' · ')),
        cell('colSitCentros', centersText), cell('colSitNumCentros', site.centers.length),
        cell('colSitEstatus', t(site.status === 'inactive' ? 'main.habInactive' : 'main.habActive')),
        actionsCell(site),
    );
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
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function visibleSites() {
    const text = searchText();
    if (!text) return sites;
    return sites.filter((s) => SearchSyntax.matches('contains', text, [s.code, s.sucursal, s.state, s.locality, ...s.centers.map((c) => `${c.code} ${c.name}`)].filter(Boolean).join(' ').toLowerCase()));
}
// Lo contratado contra lo usado, junto a las herramientas de la tabla: «Sitios 2 de 5» y «Centros de costos 3 de 10».
function updateLimitsBar() {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar) return;
    let bar = toolbar.querySelector('.sit-limits');
    if (!bar) {
        bar = document.createElement('span');
        bar.className = 'sit-limits';
        bar.setAttribute('data-help-key', 'sitLimits');
        toolbar.prepend(bar);
    }
    const over = (used, limit) => (used > limit ? ' sit-limit-over' : '');
    bar.innerHTML = `<span class="sit-limit${over(limits.sitesUsed, limits.sitesLimit)}">${t('main.sitLimitSites', { used: limits.sitesUsed, limit: limits.sitesLimit })}</span>`
        + `<span class="sit-limit${over(limits.costCentersUsed, limits.costCentersLimit)}">${t('main.sitLimitCenters', { used: limits.costCentersUsed, limit: limits.costCentersLimit })}</span>`;
}
// «+ Nuevo sitio» (el mismo botón que «+ Nuevo Centro Costos»): un sitio nace con su primer centro de costos (el código del sitio vive en el centro), así que el botón lleva a Nuestros Centros Costos con «Nuevo Centro Costos» ya abierto y el cursor en
// «Código del sitio» (ver ?nuevo=sitio en Business-CentrosCosto.js). Solo lo ve el administrador del cliente (el servidor también lo exige) y se apaga si ya se usan todos los sitios o todos los centros de costos contratados.
function renderNewSiteButton() {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar || !Dashboard.isClientAdmin) return;
    toolbar.classList.add('sit-toolbar');
    let btn = toolbar.querySelector('.data-table-new-record-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'data-table-new-record-btn';
        btn.id = 'sit-new-btn';
        btn.setAttribute('data-help-key', 'sitNew');
        btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('main.sitNew')}</span>`;
        btn.addEventListener('click', () => { if (!btn.disabled) window.location.href = 'Business-CentrosCosto.html?nuevo=sitio'; });
        toolbar.prepend(btn);
    }
    const sitesFull = limits.sitesUsed >= limits.sitesLimit;
    const centersFull = limits.costCentersUsed >= limits.costCentersLimit;
    btn.disabled = sitesFull || centersFull;
    btn.title = sitesFull ? t('main.sitNewSitesFull', { limit: limits.sitesLimit }) : (centersFull ? t('business.ccLimitReached', { limit: limits.costCentersLimit }) : t('main.sitNew'));
}
function redraw() {
    const tbody = getTbody();
    tbody.innerHTML = '';
    const list = visibleSites();
    list.forEach((site) => tbody.appendChild(buildRow(site)));
    if (!list.length) ensureEmptyState();
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
}
async function refreshTable() {
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        sites = body.sites || [];
        limits = { ...limits, ...(body.limits || {}) };
        updateLimitsBar();
        renderNewSiteButton();
        redraw();
    } catch (err) {
        console.error('Sitios Contratados: failed to load records', err);
        Dashboard.showToast(t('main.sitLoadError'), 'error');
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', redraw);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', redraw);
})();
