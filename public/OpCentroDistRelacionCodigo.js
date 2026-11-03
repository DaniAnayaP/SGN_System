// ---------------------------------------------------------------------------
// Relación Código (Operaciones, C. Distribución): dónde vive cada código. Una fila por LUGAR (un mismo código puede tener varios):
// centro de costos > almacén > sub almacén > zona > estante (anaquel) > nivel > espacio. Se captura en la ventana "Nueva relación", donde cada lista
// se abre al elegir la anterior y solo ofrece lo que existe dentro de ella; el estante se ve de frente para tocar un hueco libre (nivel + espacio de un golpe).
// Los almacenes y sub almacenes salen de sus catálogos; zonas, estantes, niveles y espacios por nivel salen del Layout; un espacio solo puede tener UN código.
// Todas las validaciones se repiten en el servidor (routes /api/business/code-relations).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'relacion-codigo';
const API = '/api/business/code-relations';
const CREATE_AUTH_COL = 'colRelCreateAuth';
const DELETE_AUTH_COL = 'colRelDeleteAuth';
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

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Relación Código failed to initialize:', err);
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

function classCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colRelClasificacion';
    const key = CLASS_KEYS.includes(r.classification) ? r.classification : 'activo';
    const tag = document.createElement('span');
    tag.className = `rel-tag rel-class-${key}`;
    tag.textContent = t(`main.relClass_${key}`);
    td.appendChild(tag);
    return td;
}

function statusCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colRelEstado';
    const tag = document.createElement('span');
    tag.className = `rel-tag ${r.status === 'located' ? 'rel-tag-ok' : 'rel-tag-partial'}`;
    tag.textContent = t(r.status === 'located' ? 'main.relStatusLocated' : 'main.relStatusPartial');
    td.appendChild(tag);
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

const EDITABLE_COLS = ['colRelSku', 'colRelCentroCostos', 'colRelAlmacen', 'colRelSubAlmacen', 'colRelZona', 'colRelEstante', 'colRelNivel', 'colRelEspacio', 'colRelFila', 'colRelProfundidad', 'colRelClasificacion'];
const CLASS_KEYS = ['activo', 'cuarentena', 'aclaracion', 'consigna'];
function canTouchAnyColumn() {
    return EDITABLE_COLS.some((col) => Dashboard.canEditField(TABLE_KEY, col, '') || Dashboard.canEditField(TABLE_KEY, col, '1'));
}

function actionsCell(r, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    td.appendChild(iconButton('admin-icon-btn', 'bx-history', t('main.changeHistoryTitleRecord'), 'changeHistory', () => Dashboard.openChangeHistory(TABLE_KEY, r.id)));
    // Sin ninguna hoja para llenar o cambiar datos de esta tabla no se ofrece Editar (el servidor también lo rechaza).
    if (canTouchAnyColumn()) td.appendChild(iconButton('admin-icon-btn', 'bx-edit', t('main.relEdit'), 'relEdit', () => openDialog(r)));
    if (Dashboard.hasColumnDeleteGrant(TABLE_KEY, DELETE_AUTH_COL)) {
        td.appendChild(iconButton('admin-icon-btn admin-icon-btn-danger', 'bx-trash', t('admin.delete'), 'delete', () => deleteRelation(r, tr)));
    }
    return td;
}

function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, r[key], 'col-system')),
        cell('colCatRegistroUnico', r.registroUnico, 'col-system'),
        cell('colRelSku', r.sku), cell('colRelUpc', r.upc), cell('colRelDescripcion', r.description),
        cell('colRelCentroCostos', r.centroCostos), cell('colRelAlmacen', r.warehouseName), cell('colRelSubAlmacen', r.subWarehouseName),
        cell('colRelZona', r.zoneName), cell('colRelHuella', r.footprintCode), cell('colRelEstante', r.spaceCode), cell('colRelNivel', r.level), cell('colRelEspacio', r.slot), cell('colRelFila', r.row), cell('colRelProfundidad', r.depth), cell('colRelLocalizador', r.locator, 'rel-locator'),
        classCell(r),
        statusCell(r),
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

// Las filas se dibujan por tandas (ROW_CHUNK) cediéndole el control al navegador entre una y otra: con 1,200 filas dibujarlas todas de un golpe congelaba la pantalla varios segundos (y el navegador
// avisaba que la página no respondía). Así la tabla se puede ver y usar mientras termina de llenarse, y una recarga que llega a la mitad cancela la anterior (renderToken).
const ROW_CHUNK = 150;
let renderToken = 0;
const nextTurn = () => (window.scheduler && window.scheduler.yield ? window.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
function setLoadingRows(done, total) {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar) return;
    let el = toolbar.querySelector('.rel-loading-rows');
    if (done == null) { if (el) el.remove(); return; }
    if (!el) {
        el = document.createElement('span');
        el.className = 'rel-loading-rows tpl-muted';
        el.setAttribute('aria-live', 'polite');
        toolbar.prepend(el);
    }
    el.textContent = t('main.relLoadingRows', { done, total });
}

async function refreshTable() {
    const tbody = getTbody();
    const token = ++renderToken;
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== renderToken) return; // llegó otra recarga después de esta
        // Solo las relaciones de los centros de costos marcados arriba (una sin centro se ve siempre, para poder asignárselo).
        const selected = Dashboard.getSelectedCostCenterIds();
        const relations = body.relations.filter((r) => !selected || !r.costCenterId || selected.includes(r.costCenterId));
        tbody.innerHTML = '';
        if (!relations.length) { setLoadingRows(null); ensureEmptyState(); return; }
        for (let from = 0; from < relations.length; from += ROW_CHUNK) {
            if (token !== renderToken) return;
            const fragment = document.createDocumentFragment();
            relations.slice(from, from + ROW_CHUNK).forEach((r) => fragment.appendChild(buildRow(r)));
            tbody.appendChild(fragment);
            if (from + ROW_CHUNK < relations.length) {
                setLoadingRows(Math.min(from + ROW_CHUNK, relations.length), relations.length);
                await nextTurn();
            }
        }
        if (token !== renderToken) return;
        setLoadingRows(null);
        applyFilters();
    } catch (err) {
        if (token === renderToken) setLoadingRows(null);
        console.error('Relación Código: failed to load records', err);
    }
}

document.addEventListener('sgn:cost-centers-changed', () => refreshTable());

function applyFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = ['colRelSku', 'colRelUpc', 'colRelDescripcion', 'colRelCentroCostos', 'colRelAlmacen', 'colRelSubAlmacen', 'colRelZona', 'colRelHuella', 'colRelEstante', 'colRelLocalizador', 'colRelClasificacion']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !SearchSyntax.matches('contains', text, haystack);
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
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Relación Código: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

function renderNewRecordButton() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    // Sin la hoja "Nueva Relación" del árbol el botón no sale (el servidor también lo rechaza); "Cargar por plantilla" tiene su propia hoja.
    if (!Dashboard.canEditField(TABLE_KEY, CREATE_AUTH_COL, '')) { if (window.RelTemplateUi) window.RelTemplateUi.mount(toolbar, null, refreshTable); return; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newRelation">${esc(t('main.newRelation'))}</span>`;
    btn.addEventListener('click', () => openDialog(null));
    toolbar.prepend(btn);
    if (window.RelTemplateUi) window.RelTemplateUi.mount(toolbar, btn, refreshTable);
}

// ---- ventana "Nueva relación" --------------------------------------------------------------------------------------------------------
let opts = null;        // GET /api/business/code-relations/options (se pide cada vez que se abre la ventana)
let editing = null;     // la relación que se está editando (null = nueva)
let st = null;          // { sku: {id, sku, description, upc, uom} | null, centro, alm, sub, zona, est, niv, esp }
let modalEl = null;
let searchTimer = null;

// Los centros que se pueden elegir: los completos que están marcados arriba (más el de la relación que se edita, aunque ya no esté marcado). Con uno solo, la relación nueva arranca en él.
function centerChoices() {
    const selected = Dashboard.getSelectedCostCenterIds();
    const list = opts.costCenters.filter((c) => !selected || selected.includes(c.id));
    if (editing && editing.costCenterId && !list.some((c) => c.id === editing.costCenterId)) list.push({ id: editing.costCenterId, name: editing.centroCostos });
    return list;
}
const blankState = () => ({ sku: null, centro: opts && centerChoices().length === 1 ? centerChoices()[0].id : '', alm: '', sub: '', zona: '', hue: '', est: '', niv: '', esp: '', fila: '', prof: '', clas: 'activo' });
const $m = (id) => document.getElementById(id);
const byId = (list, id) => (list || []).find((x) => String(x.id) === String(id));
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = 'modal-overlay';
    modalEl.id = 'rel-modal';
    modalEl.hidden = true;
    const field = (id, labelKey, helpKey) => `<div class="rel-fld"><label for="${id}">${esc(t(labelKey))}</label><select id="${id}" data-help-key="${helpKey}"></select></div>`;
    modalEl.innerHTML = `<div class="modal-panel rel-dialog" role="dialog" aria-modal="true" aria-labelledby="rel-title">
        <h3 id="rel-title"></h3>
        <div class="rel-split">
            <div class="rel-col">
                <div class="rel-fld">
                    <label for="rel-code">${esc(t('main.relCode'))}</label>
                    <input type="search" id="rel-code" autocomplete="off" data-help-key="relCodeSearch" placeholder="${esc(t('main.relSearchPlaceholder'))}">
                    <div class="rel-results" id="rel-results" hidden></div>
                </div>
                <div class="rel-art" id="rel-art"></div>
                ${field('rel-clas', 'main.colRelClasificacion', 'relClass')}
                ${field('rel-centro', 'main.colRelCentroCostos', 'relCostCenter')}
                <div class="rel-two">${field('rel-alm', 'main.colRelAlmacen', 'relWarehouse')}${field('rel-sub', 'main.colRelSubAlmacen', 'relSubWarehouse')}</div>
                <div class="rel-two">${field('rel-zona', 'main.colRelZona', 'relZone')}${field('rel-hue', 'main.colRelHuella', 'relFootprint')}</div>
                <div class="rel-two">
                    ${field('rel-est', 'main.colRelEstante', 'relRack')}
                    <div class="rel-four">${field('rel-niv', 'main.colRelNivel', 'relLevel')}${field('rel-esp', 'main.colRelEspacio', 'relSlot')}${field('rel-fila', 'main.colRelFila', 'relRow')}${field('rel-prof', 'main.colRelProfundidad', 'relDepth')}</div>
                </div>
            </div>
            <div class="rel-col">
                <div class="rel-rack">
                    <div class="rel-rack-head"><b id="rel-rack-title"></b><span id="rel-rack-sub" class="rel-muted"></span></div>
                    <div class="rel-frame" id="rel-frame"></div>
                    <div class="rel-legend"><span><i class="rel-lg-free"></i>${esc(t('main.relFree'))}</span><span><i class="rel-lg-occ"></i>${esc(t('main.relOccupied'))}</span><span><i class="rel-lg-sel"></i>${esc(t('main.relSelected'))}</span></div>
                </div>
                <div class="rel-fld"><label>${esc(t('main.relPath'))}</label><div class="rel-path" id="rel-path" data-help-key="relPath"></div></div>
            </div>
        </div>
        <div class="rel-foot">
            <span class="rel-muted" id="rel-msg"></span>
            <button type="button" class="btn btn-secondary" id="rel-clear">${esc(t('main.relClear'))}</button>
            <button type="button" class="btn" id="rel-save" data-help-key="relSave">${esc(t('main.relSave'))}</button>
            <button type="button" class="btn btn-secondary" id="rel-close">${esc(t('main.whClose'))}</button>
        </div>
    </div>`;
    document.body.appendChild(modalEl);

    modalEl.addEventListener('click', (event) => {
        if (event.target === modalEl || event.target.closest('#rel-close')) { closeDialog(); return; }
        if (event.target.closest('#rel-save')) { save(); return; }
        if (event.target.closest('#rel-clear')) { st = blankState(); $m('rel-code').value = ''; renderForm(); return; }
        const cellBtn = event.target.closest('.rel-cell[data-n]');
        if (cellBtn) {
            st.niv = Number(cellBtn.dataset.n);
            st.esp = Number(cellBtn.dataset.e);
            // si el hueco tiene más de una fila o profundidad se propone la primera combinación libre
            const rack = derived().rack;
            const bay = rack ? bayInfo(rack, st.niv, st.esp) : { rows: 1, depth: 1 };
            let free = null;
            for (let r = 1; r <= bay.rows && !free; r += 1) for (let dd = 1; dd <= bay.depth && !free; dd += 1) if (!occupiedBy(rack.id, st.niv, st.esp, r, dd)) free = { r, dd };
            st.fila = bay.rows > 1 && free ? free.r : '';
            st.prof = bay.depth > 1 && free ? free.dd : '';
            renderForm();
            return;
        }
        const pick = event.target.closest('[data-sku]');
        if (pick) {
            st.sku = { id: Number(pick.dataset.sku), sku: pick.dataset.skuCode, description: pick.dataset.desc, upc: pick.dataset.upc, uom: pick.dataset.uom };
            $m('rel-code').value = `${st.sku.sku} · ${st.sku.description}`;
            $m('rel-results').hidden = true;
            renderForm();
        }
    });
    const bind = (id, key, numeric) => $m(id).addEventListener('change', (event) => {
        const v = event.target.value;
        st[key] = numeric && v !== '' ? Number(v) : v;
        cutBelow(key);
        renderForm();
    });
    bind('rel-centro', 'centro', true); bind('rel-alm', 'alm', true); bind('rel-sub', 'sub', true);
    // Al elegir la zona o la huella, lo que solo tiene una opción (la única huella de la zona, el único activo de la huella) se elige solo: en el caso normal huella y activo son lo mismo.
    const autoPick = () => {
        let d = derived();
        if (d.zone && !st.hue && d.footprints.length === 1) { st.hue = d.footprints[0].id; d = derived(); }
        if (d.footprint && !st.est && d.racks.length === 1) st.est = d.racks[0].id;
    };
    $m('rel-zona').addEventListener('change', (event) => { st.zona = event.target.value; cutBelow('zona'); autoPick(); renderForm(); });
    $m('rel-hue').addEventListener('change', (event) => { st.hue = event.target.value; cutBelow('hue'); autoPick(); renderForm(); });
    bind('rel-est', 'est'); bind('rel-niv', 'niv', true); bind('rel-esp', 'esp', true); bind('rel-fila', 'fila', true); bind('rel-prof', 'prof', true);
    $m('rel-clas').addEventListener('change', (event) => { st.clas = event.target.value; renderForm(); });
    $m('rel-code').addEventListener('input', () => {
        st.sku = null;
        renderForm();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(searchCodes, 220);
    });
}

function cutBelow(key) {
    const order = ['centro', 'alm', 'sub', 'zona', 'hue', 'est', 'niv', 'esp', 'fila', 'prof'];
    for (let i = order.indexOf(key) + 1; i < order.length; i += 1) st[order[i]] = '';
}

async function searchCodes() {
    const q = $m('rel-code').value.trim();
    const box = $m('rel-results');
    if (!q || (st.sku && q === `${st.sku.sku} · ${st.sku.description}`)) { box.hidden = true; return; }
    try {
        const res = await fetch(`${API}/skus?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        if (!res.ok) return;
        const { skus } = await res.json();
        box.innerHTML = skus.length
            ? skus.map((s) => `<button type="button" class="rel-result" data-sku="${s.id}" data-sku-code="${esc(s.sku)}" data-desc="${esc(s.description)}" data-upc="${esc(s.upc)}" data-uom="${esc(s.uom)}"><b>${esc(s.sku)}</b> ${esc(s.description)} <span class="rel-muted">${esc(s.upc)}</span></button>`).join('')
            : `<span class="rel-muted">${esc(t('main.relNoMatches'))}</span>`;
        box.hidden = false;
    } catch (err) {
        console.error('Relación Código: code search failed', err);
    }
}

function fillSelect(id, items, placeholder, current, disabled) {
    const sel = $m(id);
    sel.innerHTML = `<option value="">${esc(placeholder)}</option>${items.map((i) => `<option value="${esc(i.value)}"${String(i.value) === String(current) ? ' selected' : ''}>${esc(i.label)}</option>`).join('')}`;
    sel.disabled = disabled !== undefined ? disabled : !items.length;
}

// Las lista de abajo se arman con lo que existe dentro de lo elegido arriba.
function derived() {
    const sub = byId(opts.subWarehouses, st.sub);
    const physical = !!sub && sub.kind === 'physical';
    const zoneEntries = physical ? sub.locations : [];
    // Las zonas y los anaqueles son los del Layout del centro de costos elegido.
    const zones = ((opts.zonesByCenter && opts.zonesByCenter[st.centro]) || []).filter((z) => zoneEntries.some((e) => e.zoneId === z.id));
    const zone = byId(zones, st.zona);
    const entry = zone ? zoneEntries.find((e) => e.zoneId === zone.id) : null;
    // Zona > Huella > Activo: se ofrecen las huellas que tienen algún activo de ese sub almacén, y los activos de la huella elegida.
    const allowed = zone ? zone.spaces.filter((s) => !entry.spaceIds.length || entry.spaceIds.includes(s.id)) : [];
    const footprints = zone ? (zone.footprints || []).filter((f) => allowed.some((s) => s.footprintId === f.id)) : [];
    const footprint = byId(footprints, st.hue);
    const racks = footprint ? allowed.filter((s) => s.footprintId === footprint.id) : [];
    const rack = byId(racks, st.est);
    return { sub, physical, zones, zone, footprints, footprint, racks, rack };
}

// Un espacio es anaquel + nivel + columna + fila + profundidad (sin fila o sin profundidad cuenta como la 1).
function occupiedBy(spaceId, level, slot, row, depth) {
    const hit = opts.occupied.find((o) => o.spaceId === spaceId && o.level === level && o.slot === slot && (o.row || 1) === (row || 1) && (o.depth || 1) === (depth || 1) && !(editing && o.id === editing.id));
    return hit ? hit.sku : '';
}
// Cuántas filas y cuántas profundidades tiene el hueco (nivel × columna) de un estante (Layout > Posiciones); sin datos propios, 1 y 1.
function bayInfo(rack, level, column) {
    const b = ((rack && rack.bays) || []).find((x) => x.n === Number(level) && x.c === Number(column)) || {};
    return { rows: b.rows || 1, depth: b.depth || 1 };
}

function renderForm() {
    const keepWh = editing ? editing.warehouseId : null;
    const keepSub = editing ? editing.subWarehouseId : null;
    $m('rel-art').innerHTML = st.sku
        ? `<b>${esc(st.sku.sku)} · ${esc(st.sku.description)}</b><span>${esc([st.sku.upc ? `UPC ${st.sku.upc}` : '', st.sku.uom].filter(Boolean).join(' · '))}</span>`
        : `<span>${esc(t('main.relPickCode'))}</span>`;
    // la clasificación del producto en este lugar (sin decir nada es Producto Activo)
    $m('rel-clas').innerHTML = CLASS_KEYS.map((k) => `<option value="${k}"${st.clas === k ? ' selected' : ''}>${esc(t(`main.relClass_${k}`))}</option>`).join('');
    fillSelect('rel-centro', centerChoices().map((c) => ({ value: c.id, label: c.name })), t('main.relChooseCost'), st.centro, false);
    const whs = opts.warehouses.filter((w) => w.parentId === st.centro && (w.status === 'active' || w.id === keepWh));
    fillSelect('rel-alm', whs.map((w) => ({ value: w.id, label: w.name })), st.centro ? t('main.relChooseWarehouse') : t('main.relFirstCost'), st.alm, !st.centro || !whs.length);
    const subs = opts.subWarehouses.filter((s) => s.parentId === st.alm && (s.status === 'active' || s.id === keepSub));
    fillSelect('rel-sub', subs.map((s) => ({ value: s.id, label: s.name })), st.alm ? t('main.relChooseSub') : t('main.relFirstWarehouse'), st.sub, !st.alm || !subs.length);
    const d = derived();
    const zonePlaceholder = !st.sub ? t('main.relFirstSub') : (d.sub && d.sub.kind === 'virtual' ? t('main.relSubVirtual') : (d.physical && !d.zones.length ? t('main.relNoZonesForSub') : (d.physical ? t('main.relChooseZone') : t('main.relSubNoKind'))));
    fillSelect('rel-zona', d.zones.map((z) => ({ value: z.id, label: z.name })), zonePlaceholder, st.zona, !d.zones.length);
    fillSelect('rel-hue', d.footprints.map((f) => ({ value: f.id, label: f.code })), d.zone ? t('main.relChooseFootprint') : t('main.relFirstZone'), st.hue, !d.footprints.length);
    fillSelect('rel-est', d.racks.map((r) => ({ value: r.id, label: r.code })), d.footprint ? t('main.relChooseRack') : t('main.relFirstFootprint'), st.est, !d.racks.length);
    fillSelect('rel-niv', d.rack ? range(d.rack.levels).map((n) => ({ value: n, label: n })) : [], d.rack ? t('main.relLevelShort') : '—', st.niv, !d.rack);
    fillSelect('rel-esp', d.rack && st.niv ? range(d.rack.slots).map((n) => ({ value: n, label: n })) : [], d.rack ? t('main.relSlotShort') : '—', st.esp, !(d.rack && st.niv));
    // Dentro del hueco (nivel × columna) están sus filas y sus profundidades: solo se piden si tiene más de una, y se ofrecen las que están libres (más las de esta misma relación, que occupiedBy no cuenta).
    const hasBay = !!(d.rack && st.niv && st.esp);
    const bay = hasBay ? bayInfo(d.rack, st.niv, st.esp) : { rows: 1, depth: 1 };
    const slotFree = (r, dd) => !occupiedBy(d.rack.id, Number(st.niv), Number(st.esp), r, dd);
    const freeRows = hasBay && bay.rows > 1 ? range(bay.rows).filter((r) => range(bay.depth).some((dd) => slotFree(r, dd))) : [];
    const freeDepths = hasBay && bay.depth > 1 ? range(bay.depth).filter((dd) => range(bay.rows).some((r) => (!st.fila || r === Number(st.fila)) && slotFree(r, dd))) : [];
    fillSelect('rel-fila', freeRows.map((n) => ({ value: n, label: n })), bay.rows > 1 ? t('main.relRowShort') : '—', st.fila, !freeRows.length);
    fillSelect('rel-prof', freeDepths.map((n) => ({ value: n, label: n })), bay.depth > 1 ? t('main.relDepthShort') : '—', st.prof, !freeDepths.length);
    drawRack(d.rack);
    drawPath(d);
    const ready = st.sku && st.centro && st.alm;
    $m('rel-save').disabled = !ready;
    const missing = [];
    if (!st.sku) missing.push(t('main.relMissingCode'));
    if (!st.centro) missing.push(t('main.relMissingCost')); else if (!st.alm) missing.push(t('main.relMissingWarehouse'));
    const located = (d.sub && d.sub.kind === 'virtual') || (st.est && st.niv && st.esp && (st.fila || bay.rows <= 1) && (st.prof || bay.depth <= 1));
    $m('rel-msg').textContent = ready ? t(located ? 'main.relReady' : 'main.relReadyPartial') : t('main.relMissing', { x: missing.join(' / ') });
}

function drawRack(rack) {
    const frame = $m('rel-frame');
    if (!rack) {
        $m('rel-rack-title').textContent = t('main.colRelEstante');
        $m('rel-rack-sub').textContent = t('main.relRackPick');
        frame.innerHTML = `<div class="rel-muted rel-frame-empty">${esc(t('main.relRackEmpty'))}</div>`;
        return;
    }
    $m('rel-rack-title').textContent = t('main.relRackTitle', { code: rack.code });
    $m('rel-rack-sub').textContent = t('main.relRackSub', { levels: rack.levels, slots: rack.slots });
    let html = '';
    for (let n = rack.levels; n >= 1; n -= 1) {
        html += `<div class="rel-lv" style="--cols:${rack.slots}"><span class="rel-ln">${esc(t('main.relLevelN', { n }))}</span>`;
        for (let e = 1; e <= rack.slots; e += 1) {
            // el hueco está ocupado cuando lo están todas sus filas y profundidades
            const bay = bayInfo(rack, n, e);
            const occs = [];
            for (let r = 1; r <= bay.rows; r += 1) for (let dd = 1; dd <= bay.depth; dd += 1) occs.push(occupiedBy(rack.id, n, e, r, dd));
            const occ = occs.every(Boolean) ? occs[0] : '';
            const sel = Number(st.niv) === n && Number(st.esp) === e;
            html += occ
                ? `<button type="button" class="rel-cell rel-occ" disabled title="${esc(t('main.relOccupiedBy', { sku: occ }))}">${esc(occ.slice(-3))}</button>`
                : `<button type="button" class="rel-cell${sel ? ' rel-sel' : ''}" data-n="${n}" data-e="${e}" title="${esc(t('main.relLevelN', { n }))} · ${esc(t('main.relSlotN', { n: e }))}">${e}</button>`;
        }
        html += '</div>';
    }
    frame.innerHTML = html;
}

function drawPath(d) {
    const parts = [
        [t('main.colRelCentroCostos'), (byId(opts.costCenters, st.centro) || {}).name],
        [t('main.colRelAlmacen'), (byId(opts.warehouses, st.alm) || {}).name],
        [t('main.colRelSubAlmacen'), d.sub && d.sub.name],
        [t('main.colRelZona'), d.zone && d.zone.name],
        [t('main.colRelHuella'), d.footprint && d.footprint.code],
        [t('main.colRelEstante'), d.rack && d.rack.code],
        [t('main.colRelNivel'), st.niv ? t('main.relLevelN', { n: st.niv }) : ''],
        [t('main.colRelEspacio'), st.esp ? t('main.relSlotN', { n: st.esp }) : ''],
        [t('main.colRelFila'), st.fila ? t('main.relRowN', { n: st.fila }) : ''],
        [t('main.colRelProfundidad'), st.prof ? t('main.relDepthN', { n: st.prof }) : ''],
    ];
    $m('rel-path').innerHTML = parts.map(([label, value], i) => `${i ? '<span class="rel-arrow">›</span>' : ''}<span class="rel-step${value ? ' rel-step-on' : ''}">${esc(value || label)}</span>`).join('');
}

async function openDialog(record) {
    let res;
    try {
        res = await fetch(`${API}/options`, { credentials: 'include' });
        if (!res.ok) throw new Error('options failed');
        opts = await res.json();
    } catch (err) {
        console.error('Relación Código: failed to load options', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        return;
    }
    ensureModal();
    editing = record;
    st = record
        ? {
            sku: { id: record.skuItemId, sku: record.sku, description: record.description, upc: record.upc, uom: '' },
            centro: record.costCenterId || '', alm: record.warehouseId || '', sub: record.subWarehouseId || '', zona: record.zoneId || '', hue: record.footprintId || '', est: record.spaceId || '',
            niv: record.level || '', esp: record.slot || '', fila: record.row || '', prof: record.depth || '', clas: record.classification || 'activo',
        }
        : blankState();
    $m('rel-title').textContent = t(record ? 'main.relDialogEdit' : 'main.relDialogNew');
    $m('rel-code').value = st.sku ? `${st.sku.sku} · ${st.sku.description}` : '';
    $m('rel-results').hidden = true;
    renderForm();
    modalEl.hidden = false;
}

function closeDialog() {
    if (modalEl) modalEl.hidden = true;
    editing = null;
}
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modalEl && !modalEl.hidden) closeDialog(); });

async function save() {
    const values = {
        skuItemId: st.sku ? st.sku.id : null, costCenterId: st.centro || null, warehouseId: st.alm || null, subWarehouseId: st.sub || null,
        zoneId: st.zona || '', spaceId: st.est || '', level: st.niv || null, slot: st.esp || null, row: st.fila || null, depth: st.prof || null, classification: st.clas || 'activo',
    };
    let method = 'POST';
    let url = API;
    let body = values;
    if (editing) {
        const before = {
            skuItemId: editing.skuItemId, costCenterId: editing.costCenterId, warehouseId: editing.warehouseId, subWarehouseId: editing.subWarehouseId,
            zoneId: editing.zoneId || '', spaceId: editing.spaceId || '', level: editing.level, slot: editing.slot, row: editing.row, depth: editing.depth, classification: editing.classification || 'activo',
        };
        body = {};
        Object.keys(values).forEach((key) => { if (String(values[key] ?? '') !== String(before[key] ?? '')) body[key] = values[key]; });
        if (!Object.keys(body).length) { closeDialog(); return; }
        method = 'PATCH';
        url = `${API}/${editing.id}`;
    }
    $m('rel-save').disabled = true;
    try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            Dashboard.showToast(json.message || Dashboard.t('admin.saveError'), res.status === 403 ? 'warning' : 'error');
            $m('rel-save').disabled = false;
            return;
        }
        if (json.rejectedFields?.length) Dashboard.showToast(`${Dashboard.t('main.fieldLocked')}: ${json.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'warning');
        else if (json.pendingFields?.length) Dashboard.showToast(`${Dashboard.t('main.changePending')}: ${json.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'info');
        else Dashboard.showToast(t('main.relSaved'), 'success');
        closeDialog();
        await refreshTable();
    } catch (err) {
        console.error('Relación Código: failed to save', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        $m('rel-save').disabled = false;
    }
}
})();
