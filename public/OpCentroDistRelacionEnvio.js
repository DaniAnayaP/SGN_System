// ---------------------------------------------------------------------------
// Relación Código Envío (Operaciones, C. Distribución): qué código (su descripción) se habilita para enviar a qué LUGAR DE ENVÍO (el catálogo Lugares de Envío: hospitales y otros sitios fuera del CEDIS), por centro de
// costos. Es la relación de los pedidos manuales EXTERNOS; la Relación Código de siempre es la de los códigos internos (dónde está cada uno dentro del CEDIS). Un renglón = un código enviado a un lugar; «+ Nueva
// relación de envío» relaciona un código con uno o varios lugares a la vez y «Cargar por plantilla» (Excel o filas pegadas) relaciona muchos de una sola vez. Los renglones salen del servidor
// (GET /api/business/code-ship-relations) y se dibujan por tandas (con miles no se congela la pantalla).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'relacion-envio';
const API = '/api/business/code-ship-relations';
const SKU_API = '/api/business/code-relations/skus';
const CREATE_AUTH_COL = 'colEnvCreateAuth';
const DELETE_AUTH_COL = 'colEnvDeleteAuth';
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
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);

let relations = [];
let codes = [];    // [{ id, sku, upc, description }]: todos los códigos de Alta Artículos (descripción única)
let places = [];   // [{ id, name, active }]: el catálogo Lugares de Envío
let centers = [];  // [{ id, name, code }]
let loadToken = 0;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        renderNewRecordButton();
        if (Dashboard.ensureColumnMinWidth) Dashboard.ensureColumnMinWidth(TABLE_KEY, 'colEnvSku', 150); // el SKU de 12 caracteres cabe completo
        await refreshTable();
    } catch (err) {
        console.error('Relación Código Envío failed to initialize:', err);
    }
})();

// ---- tabla --------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass, title) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    if (title) td.title = title;
    return td;
}
function iconButton(className, icon, label, helpKey, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.setAttribute('data-help-key', helpKey);
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
    btn.addEventListener('click', onClick);
    return btn;
}
function actionsCell(r, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    // Un código que todavía no tiene lugares (renglón virtual): no tiene historial ni se elimina; solo se puede relacionar.
    if (r.virtual) {
        if (Dashboard.canEditField(TABLE_KEY, CREATE_AUTH_COL, '')) td.appendChild(iconButton('admin-icon-btn', 'bx-plus', t('main.envRelateRow'), 'envRelateRow', () => relateCode(r)));
        return td;
    }
    td.appendChild(iconButton('admin-icon-btn', 'bx-history', t('main.changeHistoryTitleRecord'), 'changeHistory', () => Dashboard.openChangeHistory(TABLE_KEY, r.id)));
    if (Dashboard.canEditField(TABLE_KEY, CREATE_AUTH_COL, '')) td.appendChild(iconButton('admin-icon-btn', 'bx-plus', t('main.envRelateMore'), 'envRelateMore', () => relateCode(r)));
    if (Dashboard.hasColumnDeleteGrant(TABLE_KEY, DELETE_AUTH_COL)) td.appendChild(iconButton('admin-icon-btn admin-icon-btn-danger', 'bx-trash', t('admin.delete'), 'delete', () => deleteRelation(r, tr)));
    return td;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    if (r.virtual) tr.dataset.virtual = '1';
    tr.dataset.search = [r.sku, r.upc, r.description, r.centroCostos, r.place].filter(Boolean).join(' ').toLowerCase();
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, r[key], 'col-system')),
        cell('colCatRegistroUnico', r.registroUnico, 'col-system'),
        cell('colEnvSku', r.sku), cell('colEnvUpc', r.upc), cell('colEnvDescripcion', r.description), cell('colEnvCentroCostos', r.centroCostos),
        r.virtual ? placePickCell(r) : cell('colEnvLugar', r.place, r.placeActive ? '' : 'udm-ro', r.placeActive ? '' : t('main.envLugarInactivo')),
    );
    tr.appendChild(actionsCell(r, tr));
    return tr;
}
// Un código que todavía no tiene lugares: en su celda «Lugar de envío» se eligen, de los lugares ACTIVOS del catálogo Lugares de Envío, a cuál se envía; al elegirlo se crea la relación (en el centro de costos marcado arriba, o el único que
// hay) y el renglón pasa a ser esa relación. Sin la hoja de crear solo se ve en blanco. Si no hay un solo centro marcado, se abre «Nueva relación de envío» con el código y el lugar ya elegidos para escoger el centro.
function placePickCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colEnvLugar';
    if (!Dashboard.canEditField(TABLE_KEY, CREATE_AUTH_COL, '')) { td.textContent = '—'; return td; }
    const active = places.filter((p) => p.active);
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.setAttribute('data-help-key', 'envPlacePick');
    select.setAttribute('aria-label', t('main.envPlacePick'));
    select.innerHTML = `<option value="">${esc(active.length ? t('main.envPlacePick') : t('main.envPlacePickNone'))}</option>${active.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}`;
    select.disabled = !active.length;
    select.addEventListener('change', () => { if (select.value) relateCodePlace(r, Number(select.value), select); });
    td.appendChild(select);
    return td;
}
async function relateCodePlace(r, placeId, select) {
    const centerId = singleCenterId();
    if (!centerId) {
        openDialog();
        pickSku({ id: r.skuItemId, sku: r.sku, description: r.description });
        f.placeIds.add(placeId);
        renderForm();
        return;
    }
    select.disabled = true;
    try {
        const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ skuItemId: r.skuItemId, placeIds: [placeId], costCenterId: centerId }) });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(res.status === 403 ? Dashboard.t('main.fieldLocked') : (body.message || Dashboard.t('admin.saveError')), res.status === 403 ? 'warning' : 'error');
            select.value = '';
            select.disabled = false;
            return;
        }
        await refreshTable();
    } catch (err) {
        console.error('Relación Código Envío: failed to relate the code from its row', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        select.value = '';
        select.disabled = false;
    }
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
// Solo lo de los centros de costos marcados arriba.
function visibleRelations() {
    const selected = Dashboard.getSelectedCostCenterIds();
    return relations.filter((r) => !selected || !r.costCenterId || selected.includes(r.costCenterId));
}
// Lo que se dibuja: las relaciones de los centros marcados y, de cada código de Alta Artículos que no tiene ninguna ahí, un renglón con su descripción única (los demás datos en blanco); todo por código.
function visibleRows() {
    const list = visibleRelations();
    const related = new Set(list.map((r) => r.skuItemId));
    const open = codes.filter((c) => !related.has(c.id)).map((c) => ({ id: -c.id, virtual: true, skuItemId: c.id, sku: c.sku, upc: c.upc, description: c.description }));
    return [...list, ...open].sort((a, b) => String(a.sku).localeCompare(String(b.sku), undefined, { numeric: true }) || String(a.place || '').localeCompare(String(b.place || '')));
}
async function refreshTable() {
    const token = ++loadToken;
    const tbody = getTbody();
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== loadToken) return;
        relations = body.relations || [];
        places = body.places || [];
        centers = body.costCenters || [];
        codes = body.codes || [];
        tbody.innerHTML = '';
        const list = visibleRows();
        if (!list.length) { ensureEmptyState(); return; }
        const finished = await Dashboard.renderTableRowsInChunks({ tableKey: TABLE_KEY, tbody, records: list, buildRow, isStale: () => token !== loadToken });
        if (finished) applyFilters();
    } catch (err) {
        console.error('Relación Código Envío: failed to load records', err);
    }
}
document.addEventListener('sgn:cost-centers-changed', () => refreshTable());
function applyFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        tr.hidden = !SearchSyntax.matches('contains', text, tr.dataset.search || '');
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);

async function deleteRelation(r, tr) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`${API}/${r.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(body.message || Dashboard.t('main.fieldLocked'), 'warning');
            return;
        }
        relations = relations.filter((x) => x.id !== r.id);
        await refreshTable(); // si era el último lugar del código, el código vuelve a salir sin lugares
    } catch (err) {
        console.error('Relación Código Envío: failed to delete', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// ---- botones «+ Nueva relación de envío» y «Cargar por plantilla» ---------------------------------------------------------------------------
function renderNewRecordButton() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    let btn = null;
    // Sin la hoja «Nueva relación» del árbol el botón no sale (el servidor también lo rechaza).
    if (Dashboard.canEditField(TABLE_KEY, CREATE_AUTH_COL, '')) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'data-table-new-record-btn';
        btn.setAttribute('data-help-key', 'envNew');
        btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('main.envNew'))}</span>`;
        btn.addEventListener('click', openDialog);
        toolbar.prepend(btn);
    }
    if (window.EnvTemplateUi) window.EnvTemplateUi.mount(toolbar, btn, refreshTable);
}

// ---- ventana «Nueva relación de envío» --------------------------------------------------------------------------------------------------
let modalEl = null;
let f = null; // { sku: { id, sku, description } | null, placeIds: Set, centerId }
let searchTimer = null;
const singleCenterId = () => {
    const selected = Dashboard.getSelectedCostCenterIds();
    if (selected && selected.length === 1 && centers.some((c) => c.id === selected[0])) return selected[0];
    return !selected || !selected.length ? (centers.length === 1 ? centers[0].id : null) : null;
};

function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = 'modal-overlay';
    modalEl.id = 'env-modal';
    modalEl.hidden = true;
    modalEl.innerHTML = `<div class="modal-panel rel-dialog udm-dialog" role="dialog" aria-modal="true" aria-labelledby="env-title">
        <h3 id="env-title">${esc(t('main.envDialogTitle'))}</h3>
        <div class="rel-fld">
            <label for="env-code">${esc(t('main.envCode'))}</label>
            <input type="search" id="env-code" autocomplete="off" placeholder="${esc(t('main.envSearchPlaceholder'))}" data-help-key="envCodeSearch">
            <div class="rel-results rel-results-tall" id="env-results" hidden></div>
        </div>
        <div class="rel-art" id="env-info"></div>
        <div id="env-fields"></div>
        <div class="rel-foot">
            <span class="rel-muted" id="env-msg"></span>
            <button type="button" class="btn" id="env-save">${esc(t('main.envSave'))}</button>
            <button type="button" class="btn btn-secondary" id="env-close">${esc(t('main.whClose'))}</button>
        </div>
    </div>`;
    document.body.appendChild(modalEl);
    Dashboard.attachSearchOptions($('env-code')); // Inicia con / Contiene / Igual que y los signos $ @ coma, como en las tablas
    modalEl.addEventListener('click', (event) => {
        if (event.target === modalEl || event.target.closest('#env-close')) { closeDialog(); return; }
        if (event.target.closest('#env-save')) { save(); return; }
        if (event.target.closest('[data-more]')) { shown += CODES_PAGE; drawCodeList(); return; }
        const pick = event.target.closest('[data-sku]');
        if (pick) { pickSku({ id: Number(pick.dataset.sku), sku: pick.dataset.skuCode, description: pick.dataset.desc }); }
    });
    modalEl.addEventListener('input', (event) => {
        if (event.target.id === 'env-code') { f.sku = null; filterCodes(); renderForm(); }
    });
    modalEl.addEventListener('change', (event) => {
        const el = event.target;
        if (!f || !el.dataset) return;
        if (el.dataset.placeAll) { f.placeIds = el.checked ? new Set(places.filter((p) => p.active).map((p) => p.id)) : new Set(); renderForm(); return; }
        if (el.dataset.place) { const id = Number(el.dataset.place); if (el.checked) f.placeIds.add(id); else f.placeIds.delete(id); renderForm(); return; }
        if (el.id === 'env-center') { f.centerId = el.value ? Number(el.value) : null; renderForm(); }
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modalEl && !modalEl.hidden) closeDialog(); });
}
function openDialog() {
    ensureModal();
    f = { sku: null, placeIds: new Set(), centerId: singleCenterId() };
    $('env-code').value = '';
    renderForm();
    modalEl.hidden = false;
    $('env-code').focus();
    loadAllCodes();
}
function closeDialog() { if (modalEl) modalEl.hidden = true; f = null; }
// El «+» de un código sin lugares: abre la misma ventana con ese código ya elegido.
function relateCode(r) {
    openDialog();
    pickSku({ id: r.skuItemId, sku: r.sku, description: r.description });
}

// ---- la lista de códigos: TODO el catálogo de códigos, solo con su descripción única, desde que se abre la ventana (sin tener que escribir). Se baja una vez al abrir y se filtra aquí mismo con el motor de búsqueda de todo el
// sistema (código, UPC y descripción única); se dibuja por tandas para que miles de códigos no congelen la ventana.
const CODES_PAGE = 60;
const CODES_CAP = 5000; // lo que entrega el servidor de una vez; si el catálogo es más grande, al escribir se busca en el servidor
let allCodes = [];      // [{ id, sku, upc, unique }]
let filtered = [];
let shown = CODES_PAGE;
let codesCapped = false;
let codesToken = 0;
async function loadAllCodes() {
    const token = ++codesToken;
    const box = $('env-results');
    allCodes = []; filtered = [];
    box.innerHTML = `<span class="rel-muted">${esc(t('main.envListLoading'))}</span>`;
    box.hidden = false;
    try {
        const res = await fetch(`${SKU_API}?all=1`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { skus } = await res.json();
        if (token !== codesToken || !f) return; // se cerró la ventana o se abrió otra vez
        allCodes = (skus || []).map((s) => ({ id: s.id, sku: s.sku, upc: s.upc || '', unique: s.unique || '' }));
        codesCapped = allCodes.length >= CODES_CAP;
        filterCodes();
    } catch (err) {
        console.error('Relación Código Envío: failed to load the code list', err);
        if (token === codesToken) box.innerHTML = `<span class="rel-muted">${esc(t('admin.loadError'))}</span>`;
    }
}
// Lo escrito en la caja acota la lista (código, UPC y descripción única); sin escribir, o con algo todavía muy corto, salen todos.
async function filterCodes() {
    const input = $('env-code');
    const q = input.value.trim();
    const mode = Dashboard.searchModeOf(input);
    shown = CODES_PAGE;
    if (q && codesCapped) { await searchCodesOnServer(q, mode); return; }
    if (!q || !SearchSyntax.ready(mode, q)) filtered = allCodes;
    else {
        const test = SearchSyntax.compile(mode, q);
        filtered = allCodes.filter((c) => [c.sku, c.upc, c.unique].some((v) => !!v && test(v)));
    }
    drawCodeList();
}
// Un catálogo de más de 5,000 códigos: al escribir se busca en el servidor (hasta 20 resultados).
async function searchCodesOnServer(q, mode) {
    try {
        const res = await fetch(`${SKU_API}?q=${encodeURIComponent(q)}&mode=${mode}`, { credentials: 'include' });
        if (!res.ok) return;
        const { skus } = await res.json();
        if ($('env-code').value.trim() !== q) return; // ya se escribió otra cosa
        filtered = (skus || []).map((s) => ({ id: s.id, sku: s.sku, upc: s.upc || '', unique: s.unique || '' }));
        drawCodeList();
    } catch (err) {
        console.error('Relación Código Envío: code search failed', err);
    }
}
function drawCodeList() {
    const box = $('env-results');
    if (!box || !f) return;
    if (f.sku) { box.hidden = true; return; } // ya hay un código elegido
    const rows = filtered.slice(0, shown);
    const count = `<div class="rel-count rel-muted">${esc(t('main.envListCount', { n: rows.length, m: filtered.length }))}</div>`;
    const list = rows.length
        ? rows.map((c) => `<button type="button" class="rel-result" data-sku="${c.id}" data-sku-code="${esc(c.sku)}" data-desc="${esc(c.unique)}"><b>${c.unique ? esc(c.unique) : `<i class="rel-muted">${esc(t('main.envNoUnique'))}</i>`}</b> <small>${esc(c.sku)}</small></button>`).join('')
        : `<span class="rel-muted">${esc(t('main.relNoMatches'))}</span>`;
    const more = filtered.length > shown ? `<button type="button" class="rel-more" data-more="1">${esc(t('main.envShowMore'))}</button>` : '';
    box.innerHTML = count + list + more;
    box.hidden = false;
}
function pickSku(s) {
    f.sku = s;
    $('env-code').value = s.description || s.sku;
    $('env-results').hidden = true;
    renderForm();
}
function renderForm() {
    if (!f) return;
    const info = $('env-info');
    const box = $('env-fields');
    const save = $('env-save');
    $('env-msg').textContent = '';
    if (!f.sku) { info.textContent = t('main.envNoCode'); box.innerHTML = ''; save.disabled = true; return; }
    info.innerHTML = `<b>${esc(f.sku.description || t('main.envNoUnique'))}</b><span>${esc(f.sku.sku)}</span>`;
    const active = places.filter((p) => p.active);
    const placesField = active.length
        ? `<div class="udm-types"><label class="udm-check udm-check-all"><input type="checkbox" data-place-all="1"${active.every((p) => f.placeIds.has(p.id)) ? ' checked' : ''}> <b>${esc(t('main.envPlacesAll'))}</b></label>${active.map((p) => `<label class="udm-check"><input type="checkbox" data-place="${p.id}"${f.placeIds.has(p.id) ? ' checked' : ''}> ${esc(p.name)}</label>`).join('')}</div>`
        : `<span class="rel-muted">${esc(t('main.envPlacesEmpty'))}</span>`;
    const fixedCenter = singleCenterId();
    const centerField = fixedCenter
        ? `<div class="rel-fld"><label>${esc(t('main.colEnvCentroCostos'))}</label><div class="udm-from">${esc((centers.find((c) => c.id === fixedCenter) || {}).name || '')}</div></div>`
        : `<div class="rel-fld"><label for="env-center">${esc(t('main.colEnvCentroCostos'))}</label><select id="env-center"><option value="">${esc(t('main.articleTypeSelect'))}</option>${centers.map((c) => `<option value="${c.id}"${c.id === f.centerId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`;
    box.innerHTML = `<div class="rel-fld" data-help-key="envPlace"><label>${esc(t('main.envPlaces'))}</label>${placesField}</div>${centerField}`;
    if (fixedCenter) f.centerId = fixedCenter;
    save.disabled = !(f.placeIds.size && f.centerId);
}
async function save() {
    if (!f || !f.sku || !f.placeIds.size || !f.centerId) return;
    $('env-save').disabled = true;
    try {
        const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ skuItemId: f.sku.id, placeIds: [...f.placeIds], costCenterId: f.centerId }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            Dashboard.showToast(json.message || Dashboard.t('admin.saveError'), res.status === 403 ? 'warning' : 'error');
            $('env-save').disabled = false;
            return;
        }
        const n = (json.created || []).length;
        const extra = json.existing ? t('main.envExisting', { n: json.existing }) : '';
        Dashboard.showToast(n ? `${t(n === 1 ? 'main.envSaved' : 'main.envSavedN', { n })}${extra}` : t('main.envNothingNew'), n ? 'success' : 'info');
        closeDialog();
        await refreshTable();
    } catch (err) {
        console.error('Relación Código Envío: failed to save', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        $('env-save').disabled = false;
    }
}
})();
