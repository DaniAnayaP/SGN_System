// ---------------------------------------------------------------------------
// Unidad de Medida por Distribución (Operaciones, C. Distribución): las presentaciones en que se distribuye cada código, en cadena. Nivel 0 = el material principal (su unidad, sus medidas y su peso son los de Alta
// Artículos; aquí solo su forma y si se puede acostar) y de ahí hasta 6 empaques. Cada empaque tiene su unidad del catálogo Nuestras Unidad Medida, cuántas del nivel anterior contiene y SUS PROPIAS medidas (cm) y
// peso (g): nada se calcula multiplicando. «Equivale a» sí se calcula (cuántas unidades principales trae). Cada presentación depende de la anterior: no se crea una sin la de abajo ni se quita una de en medio.
// Arriba de la tabla, con un solo código a la vista, se dibuja la secuencia. De aquí leen Relación Código («Se acomoda») y el Layout (piezas que caben).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'udm-distribucion';
const API = '/api/business/sku-distribution';
const SKU_API = '/api/business/code-relations/skus';
const CREATE_AUTH_COL = 'colUdmDCreateAuth';
const DELETE_AUTH_COL = 'colUdmDDeleteAuth';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const COLS = { uom: 'colUdmDUnidad', contains: 'colUdmDContiene', shape: 'colUdmDForma', length: 'colUdmDLargo', width: 'colUdmDAncho', height: 'colUdmDAlto', weightG: 'colUdmDPeso', canLay: 'colUdmDAcostar', storageTypes: 'colUdmDTipo', unitsPerLayer: 'colUdmDCantidadCama', layersPerPallet: 'colUdmDCamasPallet', maxStack: 'colUdmDMaxEstiba' };
// Tipo de almacenamiento de cada presentación (una, varias o todas): para qué se puede acomodar; solo las que tienen alguno se ofrecen al relacionar un código con una posición. El orden es el de la lista.
const STORAGE_KEYS = ['principal', 'original', 'almacenamiento', 'compra', 'empaque', 'pallet'];
const typeName = (k) => Dashboard.t(`main.storageType_${k}`);
const EDITABLE_COLS = Object.values(COLS);

const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const fmt = (v) => (v === null || v === undefined || v === '' ? '' : String(Math.round(Number(v) * 10000) / 10000));
// El peso se captura en gramos; arriba de 1,000 g se ve también en kg.
const fmtWeight = (g) => { const n = Number(g) || 0; if (!n) return ''; return n >= 1000 ? `${fmt(n)} g (${fmt(n / 1000)} kg)` : `${fmt(n)} g`; };
const levelName = (level) => t(`main.pkLevel${level}`);

let rows = [];
let uoms = [];
let maxExtra = 6;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Unidad de Medida por Distribución failed to initialize:', err);
    }
})();

// ---- datos de cada código --------------------------------------------------------------------------------------------------------------
const rowsOfSku = (skuId) => rows.filter((r) => r.skuItemId === skuId).sort((a, z) => a.level - z.level);
const mainUomOf = (skuId) => (rowsOfSku(skuId)[0] || {}).uom || '';
const prevRowOf = (r) => rowsOfSku(r.skuItemId).find((x) => x.level === r.level - 1);

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
function canTouchAnyColumn() {
    return EDITABLE_COLS.some((col) => Dashboard.canEditField(TABLE_KEY, col, '') || Dashboard.canEditField(TABLE_KEY, col, '1'));
}
function actionsCell(r, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    td.appendChild(iconButton('admin-icon-btn', 'bx-history', t('main.changeHistoryTitleRecord'), 'changeHistory', () => Dashboard.openChangeHistory(TABLE_KEY, r.id)));
    if (canTouchAnyColumn()) td.appendChild(iconButton('admin-icon-btn', 'bx-edit', t('main.udmEdit'), 'udmEdit', () => openDialog(r)));
    if (Dashboard.hasColumnDeleteGrant(TABLE_KEY, DELETE_AUTH_COL)) td.appendChild(iconButton('admin-icon-btn admin-icon-btn-danger', 'bx-trash', t('admin.delete'), 'delete', () => deletePresentation(r)));
    return td;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    tr.dataset.sku = String(r.skuItemId);
    const principal = r.level === 0;
    const fromArticle = principal ? t('main.udmFromArticle') : '';
    const mainUom = mainUomOf(r.skuItemId);
    const prev = prevRowOf(r);
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, r[key], 'col-system')),
        cell('colCatRegistroUnico', r.registroUnico, 'col-system'),
        cell('colUdmDSku', r.sku), cell('colUdmDUpc', r.upc), cell('colUdmDDescripcion', r.description),
        cell('colUdmDNivel', levelName(r.level)),
        cell('colUdmDUnidad', r.uom, principal ? 'udm-ro' : '', fromArticle),
        cell('colUdmDContiene', principal ? '' : `${r.contains} ${prev ? prev.uom : ''}`.trim()),
        cell('colUdmDEquivale', `${r.equivalent} ${mainUom}`.trim()),
        cell('colUdmDForma', t(r.shape === 'cilindrica' ? 'main.pkCyl' : 'main.pkRect')),
        cell('colUdmDLargo', fmt(r.length), principal ? 'udm-ro' : '', fromArticle),
        cell('colUdmDAncho', r.shape === 'cilindrica' ? '= Ø' : fmt(r.width), principal ? 'udm-ro' : '', fromArticle),
        cell('colUdmDAlto', fmt(r.height), principal ? 'udm-ro' : '', fromArticle),
        cell('colUdmDPeso', fmtWeight(r.weightG), principal ? 'udm-ro' : '', fromArticle),
        cell('colUdmDAcostar', t(r.canLay ? 'main.udmYes' : 'main.udmNo')),
        cell('colUdmDTipo', (r.storageTypes || []).length ? r.storageTypes.map(typeName).join(' · ') : t('main.udmTipoNinguno'), (r.storageTypes || []).length ? '' : 'udm-ro'),
        cell('colUdmDCantidadCama', r.unitsPerLayer || ''), cell('colUdmDCamasPallet', r.layersPerPallet || ''), cell('colUdmDMaxEstiba', r.maxStack || ''),
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
async function refreshTable() {
    const tbody = getTbody();
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        rows = body.rows || [];
        uoms = body.uoms || [];
        maxExtra = body.maxExtra || 6;
        tbody.innerHTML = '';
        if (!rows.length) { ensureEmptyState(); renderChain(); return; }
        const fragment = document.createDocumentFragment();
        rows.forEach((r) => fragment.appendChild(buildRow(r)));
        tbody.appendChild(fragment);
        applyFilters();
    } catch (err) {
        console.error('Unidad de Medida por Distribución: failed to load records', err);
    }
}
function applyFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = ['colUdmDSku', 'colUdmDUpc', 'colUdmDDescripcion', 'colUdmDNivel', 'colUdmDUnidad']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !SearchSyntax.matches('contains', text, haystack);
    });
    renderChain();
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);

// ---- la secuencia (arriba de la tabla, con UN código a la vista) ------------------------------------------------------------------------
function renderChain() {
    const box = $('udm-chain');
    if (!box) return;
    const ids = [...new Set([...getTbody().querySelectorAll('tr[data-sku]')].filter((tr) => !tr.hidden).map((tr) => Number(tr.dataset.sku)))];
    if (ids.length !== 1) { box.hidden = true; box.innerHTML = ''; return; }
    const list = rowsOfSku(ids[0]);
    if (!list.length) { box.hidden = true; return; }
    box.innerHTML = Dashboard.udmChainHtml(list, maxExtra); // la misma secuencia que se ve desde Alta Artículos (Ver UDM de distribución)
    box.hidden = false;
}

// ---- botón «Nueva presentación» ----------------------------------------------------------------------------------------------------------
function renderNewRecordButton() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    // Sin la hoja «Nueva Presentación» del árbol el botón no sale (el servidor también lo rechaza).
    if (!Dashboard.canEditField(TABLE_KEY, CREATE_AUTH_COL, '')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.setAttribute('data-help-key', 'udmNew');
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('main.udmNew'))}</span>`;
    btn.addEventListener('click', () => openDialog(null));
    toolbar.prepend(btn);
}

// ---- ventana «Nueva presentación» / «Editar» ----------------------------------------------------------------------------------------------
let modalEl = null;
let f = null; // { rec, sku: { id, sku, description, uom, length, width, height }, level, uom, contains, shape, length, width, height, weightG, canLay }
let searchTimer = null;

function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = 'modal-overlay';
    modalEl.id = 'udm-modal';
    modalEl.hidden = true;
    modalEl.innerHTML = `<div class="modal-panel rel-dialog udm-dialog" role="dialog" aria-modal="true" aria-labelledby="udm-title">
        <h3 id="udm-title"></h3>
        <div class="rel-fld">
            <label for="udm-code">${esc(t('main.udmCode'))}</label>
            <input type="search" id="udm-code" autocomplete="off" placeholder="${esc(t('main.relSearchPlaceholder'))}" data-help-key="relCodeSearch">
            <div class="rel-results" id="udm-results" hidden></div>
        </div>
        <div class="rel-art" id="udm-info"></div>
        <div id="udm-fields"></div>
        <div class="rel-foot">
            <span class="rel-muted" id="udm-msg"></span>
            <button type="button" class="btn" id="udm-save">${esc(t('main.udmSave'))}</button>
            <button type="button" class="btn btn-secondary" id="udm-close">${esc(t('main.whClose'))}</button>
        </div>
    </div>`;
    document.body.appendChild(modalEl);
    Dashboard.attachSearchOptions($('udm-code')); // Inicia con / Contiene / Igual que y los signos $ @ coma, como en las tablas
    modalEl.addEventListener('click', (event) => {
        if (event.target === modalEl || event.target.closest('#udm-close')) { closeDialog(); return; }
        if (event.target.closest('#udm-save')) { save(); return; }
        const pick = event.target.closest('[data-sku]');
        if (pick) { pickSku({ id: Number(pick.dataset.sku), sku: pick.dataset.skuCode, description: pick.dataset.desc, uom: pick.dataset.uom, length: Number(pick.dataset.length) || 0, width: Number(pick.dataset.width) || 0, height: Number(pick.dataset.height) || 0 }); }
    });
    modalEl.addEventListener('input', (event) => {
        const el = event.target;
        if (el.id === 'udm-code') { f.sku = null; f.level = null; clearTimeout(searchTimer); searchTimer = setTimeout(searchCodes, 220); renderForm(); return; }
        const k = el.dataset && el.dataset.k;
        if (!k || !f) return;
        f[k] = el.type === 'checkbox' ? el.checked : el.value;
        if (k === 'shape') renderForm(); else updateEquivalence();
    });
    modalEl.addEventListener('change', (event) => {
        const el = event.target;
        // las casillas del tipo de almacenamiento: «Todos» marca o quita todas; cada una se suma o se quita (siempre en el orden de la lista)
        if (f && el.dataset && (el.dataset.type || el.dataset.typeAll)) {
            if (el.dataset.typeAll) f.storageTypes = el.checked ? [...STORAGE_KEYS] : [];
            else { const set = new Set(f.storageTypes); if (el.checked) set.add(el.dataset.type); else set.delete(el.dataset.type); f.storageTypes = STORAGE_KEYS.filter((k) => set.has(k)); }
            renderForm();
            return;
        }
        const k = el.dataset && el.dataset.k;
        if (!k || !f || el.type === 'checkbox') return;
        f[k] = el.value;
        if (k === 'shape') renderForm(); else updateEquivalence();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modalEl && !modalEl.hidden) closeDialog(); });
}

function openDialog(record) {
    ensureModal();
    const sku = record ? { id: record.skuItemId, sku: record.sku, description: record.description, uom: mainUomOf(record.skuItemId), length: 0, width: 0, height: 0 } : null;
    f = {
        rec: record, sku, level: record ? record.level : null,
        uom: record ? record.uom : '', contains: record && record.contains != null ? record.contains : '', shape: record ? record.shape : 'rectangular',
        length: record ? record.length : '', width: record ? record.width : '', height: record ? record.height : '', weightG: record ? record.weightG : '', canLay: record ? record.canLay : false,
        storageTypes: record ? [...(record.storageTypes || [])] : [],
        unitsPerLayer: record && record.unitsPerLayer ? record.unitsPerLayer : '', layersPerPallet: record && record.layersPerPallet ? record.layersPerPallet : '', maxStack: record && record.maxStack ? record.maxStack : '',
    };
    $('udm-title').textContent = t(record ? 'main.udmDialogEdit' : 'main.udmDialogNew');
    $('udm-code').value = record ? `${record.sku} · ${record.description}` : '';
    $('udm-code').disabled = !!record;
    $('udm-results').hidden = true;
    if (!record) f.level = null;
    renderForm();
    modalEl.hidden = false;
    if (!record) $('udm-code').focus();
}
function closeDialog() { if (modalEl) modalEl.hidden = true; f = null; }

async function searchCodes() {
    const q = $('udm-code').value.trim();
    const box = $('udm-results');
    if (!q || f.rec) { box.hidden = true; return; }
    try {
        const res = await fetch(`${SKU_API}?q=${encodeURIComponent(q)}&mode=${Dashboard.searchModeOf($('udm-code'))}`, { credentials: 'include' });
        if (!res.ok) return;
        const { skus } = await res.json();
        box.innerHTML = skus.length
            ? skus.map((s) => `<button type="button" class="rel-result" data-sku="${s.id}" data-sku-code="${esc(s.sku)}" data-desc="${esc(s.description)}" data-uom="${esc(s.uom)}" data-length="${esc(s.length)}" data-width="${esc(s.width)}" data-height="${esc(s.height)}"><b>${esc(s.sku)}</b> ${esc(s.description)} <span class="rel-muted">${esc(s.upc)}</span></button>`).join('')
            : `<span class="rel-muted">${esc(t('main.relNoMatches'))}</span>`;
        box.hidden = false;
    } catch (err) {
        console.error('Unidad de Medida por Distribución: code search failed', err);
    }
}
// Al elegir el código, la presentación que sigue es la de arriba de las que ya tiene (el material principal si todavía no tiene ninguna).
function pickSku(s) {
    f.sku = s;
    $('udm-code').value = `${s.sku} · ${s.description}`;
    $('udm-results').hidden = true;
    const have = rowsOfSku(s.id);
    f.level = have.length ? Math.max(...have.map((r) => r.level)) + 1 : 0;
    f.storageTypes = [f.level === 0 ? 'principal' : 'empaque']; // de partida el de siempre; se puede cambiar abajo
    renderForm();
}

const canField = (col, value) => Dashboard.canEditField(TABLE_KEY, col, f.rec ? String(value ?? '') : '');
function fieldHtml(key, labelKey, inner, hintKey) {
    return `<div class="rel-fld"><label for="udm-f-${key}">${esc(t(labelKey))}</label>${inner}${hintKey ? `<span class="rel-muted">${esc(t(hintKey))}</span>` : ''}</div>`;
}
function renderForm() {
    const box = $('udm-fields');
    const info = $('udm-info');
    const msg = $('udm-msg');
    const save = $('udm-save');
    msg.textContent = '';
    if (!f.sku) { info.textContent = t('main.udmNoCode'); box.innerHTML = ''; save.disabled = true; return; }
    const have = rowsOfSku(f.sku.id);
    if (!f.rec && f.level > maxExtra) { info.textContent = t('main.udmMaxLevels', { n: maxExtra }); box.innerHTML = ''; save.disabled = true; return; }
    const principal = f.level === 0;
    info.innerHTML = `<b>${esc(f.sku.sku)} · ${esc(f.sku.description)}</b><span>${esc(levelName(f.level))}${principal ? ` · ${esc(t('main.udmFromArticleLong'))}` : ''}</span>`;
    const dis = (col, key) => (canField(col, f.rec ? f.rec[key] : '') ? '' : ' disabled');
    const shapeSel = `<select id="udm-f-shape" data-k="shape"${dis(COLS.shape, 'shape')}><option value="rectangular"${f.shape === 'rectangular' ? ' selected' : ''}>${esc(t('main.pkRect'))}</option><option value="cilindrica"${f.shape === 'cilindrica' ? ' selected' : ''}>${esc(t('main.pkCyl'))}</option></select>`;
    const layBox = `<label class="udm-check"><input type="checkbox" id="udm-f-canLay" data-k="canLay"${f.canLay ? ' checked' : ''}${dis(COLS.canLay, 'canLay')}> ${esc(t('main.colUdmDAcostar'))}</label>`;
    const typesDis = dis(COLS.storageTypes, 'storageTypes');
    const intInput = (key) => `<input type="number" id="udm-f-${key}" data-k="${key}" step="1" min="0" value="${esc(f[key])}"${dis(COLS[key], key)}>`;
    const estibaField = `<div class="rel-three" data-help-key="udmEstiba">${fieldHtml('unitsPerLayer', 'main.colUdmDCantidadCama', intInput('unitsPerLayer'))}${fieldHtml('layersPerPallet', 'main.colUdmDCamasPallet', intInput('layersPerPallet'))}${fieldHtml('maxStack', 'main.colUdmDMaxEstiba', intInput('maxStack'))}</div>`;
    const typesField = `<div class="rel-fld" data-help-key="udmTipo"><label>${esc(t('main.colUdmDTipo'))}</label><div class="udm-types"><label class="udm-check udm-check-all"><input type="checkbox" data-type-all="1"${STORAGE_KEYS.every((k) => f.storageTypes.includes(k)) ? ' checked' : ''}${typesDis}> <b>${esc(t('main.udmTiposTodos'))}</b></label>${STORAGE_KEYS.map((k) => `<label class="udm-check"><input type="checkbox" data-type="${k}"${f.storageTypes.includes(k) ? ' checked' : ''}${typesDis}> ${esc(typeName(k))}</label>`).join('')}</div></div>`;
    if (principal) {
        box.innerHTML = `<div class="rel-two">${fieldHtml('shape', 'main.colUdmDForma', shapeSel)}<div class="rel-fld"><label>&nbsp;</label>${layBox}</div></div>
            <div class="rel-muted">${esc(t('main.udmMainMeasures', { uom: f.sku.uom || '—', l: fmt(f.sku.length) || '—', w: fmt(f.sku.width) || '—', h: fmt(f.sku.height) || '—' }))}</div>
            ${typesField}
            ${estibaField}`;
        save.disabled = false;
        return;
    }
    const prev = have.find((r) => r.level === f.level - 1);
    const prevName = prev ? (prev.uom || levelName(prev.level)) : '';
    const uomOptions = [...new Set([...(f.uom ? [f.uom] : []), ...uoms])];
    const uomSel = `<select id="udm-f-uom" data-k="uom"${dis(COLS.uom, 'uom')}><option value="">${esc(t('main.articleTypeSelect'))}</option>${uomOptions.map((u) => `<option value="${esc(u)}"${u === f.uom ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select>`;
    const num = (key, col, step) => `<input type="number" id="udm-f-${key}" data-k="${key}" step="${step || 'any'}" min="0" value="${esc(f[key])}"${dis(col, key)}>`;
    const cyl = f.shape === 'cilindrica';
    box.innerHTML = `<div class="rel-two">${fieldHtml('uom', 'main.colUdmDUnidad', uomSel)}${fieldHtml('contains', 'main.udmContainsLbl', num('contains', COLS.contains, '1'))}</div>
        <div class="rel-muted" id="udm-equiv"></div>
        <div class="rel-two">${fieldHtml('shape', 'main.colUdmDForma', shapeSel)}<div class="rel-fld"><label>&nbsp;</label>${layBox}</div></div>
        <div class="rel-three">${fieldHtml('length', 'main.colUdmDLargo', num('length', COLS.length))}${cyl ? '<div class="rel-fld"><label>&nbsp;</label><span class="rel-muted">= Ø</span></div>' : fieldHtml('width', 'main.colUdmDAncho', num('width', COLS.width))}${fieldHtml('height', 'main.colUdmDAlto', num('height', COLS.height))}</div>
        ${fieldHtml('weightG', 'main.colUdmDPeso', num('weightG', COLS.weightG), 'main.udmWeightHint')}
        ${typesField}
        ${estibaField}`;
    $('udm-fields').dataset.prev = prevName;
    updateEquivalence();
    save.disabled = false;
}
// «Equivale a»: cuántas unidades principales trae esta presentación (lo que contiene × lo que equivale la de abajo).
function updateEquivalence() {
    const el = $('udm-equiv');
    if (!el || !f || !f.sku || f.level === 0) return;
    const have = rowsOfSku(f.sku.id);
    const prev = have.find((r) => r.level === f.level - 1);
    const n = Number(f.contains);
    el.textContent = prev && Number.isInteger(n) && n >= 1 ? t('main.udmEquiv', { n: n * prev.equivalent, u: have[0].uom || '', c: n, p: prev.uom || levelName(prev.level) }) : '';
}

async function save() {
    if (!f || !f.sku) return;
    const principal = f.level === 0;
    const estibaBody = { unitsPerLayer: f.unitsPerLayer === '' ? 0 : Number(f.unitsPerLayer), layersPerPallet: f.layersPerPallet === '' ? 0 : Number(f.layersPerPallet), maxStack: f.maxStack === '' ? 0 : Number(f.maxStack) };
    const body = principal ? { shape: f.shape, canLay: !!f.canLay, storageTypes: f.storageTypes.join(','), ...estibaBody } : {
        uom: f.uom, contains: f.contains === '' ? null : Number(f.contains), shape: f.shape, length: f.length === '' ? null : Number(f.length),
        width: f.shape === 'cilindrica' ? (f.length === '' ? null : Number(f.length)) : (f.width === '' ? null : Number(f.width)), height: f.height === '' ? null : Number(f.height),
        weightG: f.weightG === '' ? null : Number(f.weightG), canLay: !!f.canLay, storageTypes: f.storageTypes.join(','), ...estibaBody,
    };
    let method = 'POST';
    let url = API;
    let payload = { skuItemId: f.sku.id, ...body };
    if (f.rec) {
        const before = f.rec;
        const changed = {};
        Object.keys(body).forEach((key) => { if (String(body[key] ?? '') !== String(before[key] ?? '')) changed[key] = body[key]; });
        if (!Object.keys(changed).length) { closeDialog(); return; }
        method = 'PATCH';
        url = `${API}/${f.rec.id}`;
        payload = changed;
    }
    $('udm-save').disabled = true;
    try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            Dashboard.showToast(json.message || Dashboard.t('admin.saveError'), res.status === 403 ? 'warning' : 'error');
            $('udm-save').disabled = false;
            return;
        }
        if (json.rejectedFields?.length) Dashboard.showToast(`${Dashboard.t('main.fieldLocked')}: ${json.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'warning');
        else if (json.pendingFields?.length) Dashboard.showToast(`${Dashboard.t('main.changePending')}: ${json.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'info');
        else Dashboard.showToast(t('main.udmSaved'), 'success');
        closeDialog();
        await refreshTable();
    } catch (err) {
        console.error('Unidad de Medida por Distribución: failed to save', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        $('udm-save').disabled = false;
    }
}

async function deletePresentation(r) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`${API}/${r.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(body.message || Dashboard.t('main.fieldLocked'), 'warning');
            return;
        }
        await refreshTable();
    } catch (err) {
        console.error('Unidad de Medida por Distribución: failed to delete', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
})();
