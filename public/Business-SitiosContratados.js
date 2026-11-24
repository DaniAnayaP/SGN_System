// ---------------------------------------------------------------------------
// Administración del Negocio › Servicio Contratado › Sitios Contratados: los sitios (lugares físicos) del cliente. Cada sitio es un registro propio con su código de 5 letras, su sucursal y toda su ubicación (País, Estado, Municipio, Localidad y Calle),
// y tiene adentro los centros de costos que cuelgan de él (Sitio > Centro de costos: un sitio tiene varios centros y cada centro es de un solo sitio). Arriba, cuántos sitios y centros usa contra lo contratado (el contrato lleva dos límites).
// «+ Nuevo sitio» (administrador del cliente) abre el formulario del sitio: guardarlo NO crea ningún centro de costos (esos se dan de alta en Nuestros Centros Costos, eligiendo el sitio). Los renglones salen de GET /api/business/sites.
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
let cascade = null;
let newBtn = null;
let loaded = false; // ya se leyeron los sitios (antes de eso no hay nada que redibujar)

const modal = document.getElementById('sit-modal');
const modalTitle = document.getElementById('sit-modal-title');
const idField = document.getElementById('sit-id');
const companyDisplay = document.getElementById('sit-company-display');
const sucursalField = document.getElementById('sit-sucursal');
const siteCodeField = document.getElementById('sit-site-code');
const modalError = document.getElementById('sit-modal-error');
const modalSaveBtn = document.getElementById('sit-modal-save');
const modalCancelBtn = document.getElementById('sit-modal-cancel');

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        cascade = GeoCascade.create('sit');
        GeoCascade.bindShortCodeInput(siteCodeField, 5);
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
function iconButton({ icon, helpKey, label, onClick }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-icon-btn';
    btn.setAttribute('data-help-key', helpKey);
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
    btn.addEventListener('click', onClick);
    return btn;
}
function actionsCell(site) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    td.appendChild(iconButton({
        icon: 'bx-history', helpKey: 'changeHistory', label: Dashboard.t('main.changeHistoryTitleRecord'),
        onClick: () => Dashboard.openChangeHistory(TABLE_KEY, site.id),
    }));
    // Crear, editar y activar/desactivar son del administrador del cliente (el servidor también lo exige).
    if (Dashboard.isClientAdmin) {
        td.appendChild(iconButton({ icon: 'bx-edit', helpKey: 'edit', label: Dashboard.t('admin.edit'), onClick: () => openModal(site) }));
        const inactive = site.status === 'inactive';
        td.appendChild(iconButton({
            icon: inactive ? 'bx-check-circle' : 'bx-x-circle', helpKey: inactive ? 'activate' : 'deactivate',
            label: Dashboard.t(inactive ? 'admin.activate' : 'admin.deactivate'), onClick: () => toggleStatus(site),
        }));
    }
    return td;
}
function buildRow(site) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = site.id;
    const centersText = site.centers.map((c) => `${c.code} · ${c.name}`).join(', ');
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, site[key], 'col-system')),
        cell('colSitCodigo', site.code), cell('colSitSucursal', site.sucursal),
        cell('colSitEstado', site.state), cell('colSitMunicipio', site.municipality), cell('colSitLocalidad', site.locality), cell('colSitCalle', site.street),
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
    return sites.filter((s) => SearchSyntax.matches('contains', text, [s.code, s.sucursal, s.country, s.state, s.municipality, s.locality, s.street, ...s.centers.map((c) => `${c.code} ${c.name}`)].filter(Boolean).join(' ').toLowerCase()));
}
// Lo contratado contra lo usado, junto a las herramientas de la tabla: «Sitios 2 de 5» y «Centros de costos 3 de 10».
function updateLimitsBar() {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
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
// «+ Nuevo sitio» (el mismo botón que «+ Nuevo Centro Costos»): abre el formulario del sitio. Un sitio nuevo gasta uno de los sitios contratados (y nada de los centros de costos), así que el botón solo se apaga cuando ya se usan todos los sitios.
// Solo lo ve el administrador del cliente (el servidor también lo exige).
function renderNewSiteButton() {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom') || !Dashboard.isClientAdmin) return;
    toolbar.classList.add('sit-toolbar');
    newBtn = toolbar.querySelector('.data-table-new-record-btn');
    if (!newBtn) {
        newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.className = 'data-table-new-record-btn';
        newBtn.id = 'sit-new-btn';
        newBtn.setAttribute('data-help-key', 'sitNew');
        newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('main.sitNew')}</span>`;
        newBtn.addEventListener('click', () => { if (!newBtn.disabled) openModal(null); });
        toolbar.prepend(newBtn);
    }
    const sitesFull = limits.sitesUsed >= limits.sitesLimit;
    newBtn.disabled = sitesFull;
    newBtn.title = sitesFull ? t('main.sitNewSitesFull', { limit: limits.sitesLimit }) : t('main.sitNew');
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
        loaded = true;
        updateLimitsBar();
        renderNewSiteButton();
        redraw();
    } catch (err) {
        console.error('Sitios Contratados: failed to load records', err);
        Dashboard.showToast(t('main.sitLoadError'), 'error');
    }
}

// Lo que dicen los errores del servidor (traen un `code`, no un texto en español).
function errorText(body) {
    const keys = {
        SITE_CODE_TAKEN: 'main.sitCodeTaken',
        SITE_CODE_INVALID: 'business.ccSiteCodeInvalid',
        GEO_STATE_CODE_MISSING: 'business.ccNeedGeoCodes',
        GEO_LOCALITY_CODE_MISSING: 'business.ccNeedGeoCodes',
        SITE_HAS_ACTIVE_CENTERS: 'main.sitHasActiveCenters',
    };
    if (body && body.code === 'SITE_LIMIT') return t('main.sitNewSitesFull', { limit: limits.sitesLimit });
    return Dashboard.t(keys[body && body.code] || 'admin.saveError');
}

// Un sitio no se borra (lo llevan sus centros, las habilitaciones y los layouts): solo se activa o se desactiva. Con centros de costos activos no se desactiva.
async function toggleStatus(site) {
    const nextStatus = site.status === 'inactive' ? 'active' : 'inactive';
    try {
        const res = await fetch(`${API}/${site.id}/status`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status: nextStatus }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(errorText(body), 'error');
            return;
        }
        await refreshTable();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// --- Formulario «Nuevo sitio» / «Editar sitio» ------------------------------
async function openModal(site) {
    if (!cascade) return;
    idField.value = site ? site.id : '';
    modalTitle.textContent = t(site ? 'main.sitModalTitleEdit' : 'main.sitModalTitleNew');
    companyDisplay.textContent = (typeof clientBranding !== 'undefined' && clientBranding && clientBranding.companyName) || '—';
    sucursalField.value = site ? site.sucursal : '';
    siteCodeField.value = site ? site.code : '';
    siteCodeField.disabled = !!site; // el código del sitio ya no se cambia una vez guardado
    modalError.hidden = true;
    await cascade.load(site ? { countryId: site.countryId, stateId: site.stateId, municipalityId: site.municipalityId, localityId: site.localityId, streetId: site.streetId } : null);
    modal.hidden = false;
    (site ? sucursalField : siteCodeField).focus();
}
function closeModal() {
    modal.hidden = true;
}
function showModalError(text) {
    modalError.textContent = text;
    modalError.hidden = false;
}
async function saveModal() {
    modalError.hidden = true;
    const sucursal = sucursalField.value.trim();
    const siteCode = GeoCascade.cleanShortCode(siteCodeField.value, 5);
    const editingId = idField.value;
    const missing = cascade.missingText(sucursal ? [] : [t('business.ccBranch')]);
    if (missing) { showModalError(missing); return; }
    if (!cascade.hasGeoCodes()) { showModalError(t('business.ccNeedGeoCodes')); return; }
    if (!editingId && siteCode.length !== 5) { showModalError(t('business.ccSiteCodeInvalid')); siteCodeField.focus(); return; }
    modalSaveBtn.disabled = true;
    try {
        const res = await fetch(editingId ? `${API}/${editingId}` : API, {
            method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ ...cascade.values(), sucursal, siteCode }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showModalError(errorText(body));
            return;
        }
        closeModal();
        await refreshTable();
        Dashboard.showToast(Dashboard.t(editingId ? 'main.changeSaved' : 'main.recordSaved'), 'success');
    } catch {
        showModalError(Dashboard.t('admin.saveError'));
    } finally {
        modalSaveBtn.disabled = false;
    }
}
modalSaveBtn.addEventListener('click', saveModal);
modalCancelBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });

document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', redraw);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', redraw);
document.addEventListener('dashboard:language-changed', () => {
    if (cascade) cascade.refreshLanguage();
    if (!loaded) return;
    updateLimitsBar();
    redraw();
});
})();
