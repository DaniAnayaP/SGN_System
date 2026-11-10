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

// «Ubicar»: un botón por renglón que abre una ventanita para ponerle lugar al código sin abrir Editar. Se ofrece a quien puede llenar o cambiar el lugar (Zona, Activo, Nivel, Espacio o Posición).
const PLACE_COLS = ['colRelZona', 'colRelEstante', 'colRelNivel', 'colRelEspacio', 'colRelProfundidad'];
const canPlace = () => PLACE_COLS.some((col) => Dashboard.canEditField(TABLE_KEY, col, '') || Dashboard.canEditField(TABLE_KEY, col, '1'));
function ubicarCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colRelUbicar';
    td.className = 'rel-ubicar';
    if (canPlace()) td.appendChild(iconButton('admin-icon-btn', 'bx-map-pin', t('main.relUbicar'), 'relUbicar', () => openLocate(r)));
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

const EDITABLE_COLS = ['colRelSku', 'colRelCentroCostos', 'colRelAlmacen', 'colRelSubAlmacen', 'colRelZona', 'colRelEstante', 'colRelNivel', 'colRelEspacio', 'colRelProfundidad', 'colRelClasificacion'];
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
        cell('colRelZona', r.zoneName), cell('colRelHuella', r.footprintCode), cell('colRelEstante', r.spaceCode), cell('colRelNivel', r.level), cell('colRelEspacio', r.slot), cell('colRelProfundidad', r.position), cell('colRelLocalizador', r.locator, 'rel-locator'),
        ubicarCell(r),
        classCell(r),
        cell('colRelSeAcomoda', r.packLevel != null ? `${t(`main.pkLevel${r.packLevel}`)}${r.packName ? ` · ${r.packName}` : ''}` : ''),
        cell('colRelForma', r.packShape ? t(r.packShape === 'cilindrica' ? 'main.pkCyl' : 'main.pkRect') : ''),
        cell('colRelCaben', r.packCount != null ? `${r.packCount} ${t(r.packLevel === 0 ? 'main.relPackUnitMain' : 'main.relPackUnitPack')}` : ''),
        cell('colRelCapacidad', r.packCapacity != null ? `${r.packCapacity} ${t('main.relPackPz')}` : ''),
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
const blankState = () => ({ sku: null, centro: opts && centerChoices().length === 1 ? centerChoices()[0].id : '', alm: '', sub: '', zona: '', hue: '', est: '', niv: '', esp: '', pos: '', clas: 'activo', pack: '' });
const skuCache = new Map(); // los códigos del buscador con sus medidas y empaques (para «Se acomoda»)
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
                    <div class="rel-four">${field('rel-niv', 'main.colRelNivel', 'relLevel')}${field('rel-esp', 'main.colRelEspacio', 'relSlot')}${field('rel-pos', 'main.colRelProfundidad', 'relPosition')}</div>
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
        <div class="rel-pack" id="rel-pack" data-help-key="relSeAcomoda">
            <div class="rel-fld"><label>${esc(t('main.relPackTitle'))}</label></div>
            <div class="rel-muted" id="rel-pack-hint"></div>
            <div class="rel-pack-opts" id="rel-pack-opts"></div>
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
            // si el espacio tiene más de una posición se propone la primera libre
            const rack = derived().rack;
            const nums = rack ? positionsAt(rack, st.niv, st.esp) : [1];
            const free = nums.find((p) => !occupiedBy(rack.id, st.niv, st.esp, p));
            st.pos = nums.length > 1 && free ? free : '';
            renderForm();
            return;
        }
        const packCard = event.target.closest('[data-pack]');
        if (packCard && !packCard.disabled) {
            const lv = Number(packCard.dataset.pack);
            st.pack = st.pack === lv ? '' : lv; // volver a tocar el elegido lo quita
            renderForm();
            return;
        }
        const pick = event.target.closest('[data-sku]');
        if (pick) {
            const full = skuCache.get(Number(pick.dataset.sku)) || {};
            st.sku = { id: Number(pick.dataset.sku), sku: pick.dataset.skuCode, description: pick.dataset.desc, upc: pick.dataset.upc, uom: pick.dataset.uom, length: full.length, width: full.width, height: full.height, packaging: full.packaging };
            if (!packLevelsOf(st.sku)[Number(st.pack)]) st.pack = '';
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
    bind('rel-est', 'est'); bind('rel-niv', 'niv', true); bind('rel-esp', 'esp', true); bind('rel-pos', 'pos', true);
    $m('rel-clas').addEventListener('change', (event) => { st.clas = event.target.value; renderForm(); });
    $m('rel-code').addEventListener('input', () => {
        st.sku = null;
        renderForm();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(searchCodes, 220);
    });
}

function cutBelow(key) {
    const order = ['centro', 'alm', 'sub', 'zona', 'hue', 'est', 'niv', 'esp', 'pos'];
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
        skus.forEach((s) => skuCache.set(s.id, s));
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

// Una posición es activo + nivel + espacio + posición (sin posición cuenta como la 1: un espacio con una sola posición no la pide).
function occupiedBy(spaceId, level, slot, position) {
    const hit = opts.occupied.find((o) => o.spaceId === spaceId && o.level === level && o.slot === slot && (o.position || 1) === (position || 1) && !(editing && o.id === editing.id));
    return hit ? hit.sku : '';
}
// Los números de las posiciones de un espacio (nivel × espacio) de un activo (Layout > Posiciones); sin datos propios (una copia vieja de las opciones), solo la 1.
// Cuántas posiciones (columnas) tiene un nivel del anaquel: las que se le pusieron en Layout > Niveles (slotsByLevel) o, de una lista vieja sin ellas, las del anaquel.
const slotsAt = (rack, level) => (Array.isArray(rack.slotsByLevel) && rack.slotsByLevel[level - 1]) || rack.slots || 1;
function positionsAt(rack, level, column) {
    const g = ((rack && rack.positions) || []).find((x) => x.n === Number(level) && x.c === Number(column));
    return g && Array.isArray(g.nums) && g.nums.length ? g.nums : [1];
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
    fillSelect('rel-esp', d.rack && st.niv ? range(slotsAt(d.rack, st.niv)).map((n) => ({ value: n, label: n })) : [], d.rack ? t('main.relSlotShort') : '—', st.esp, !(d.rack && st.niv));
    // Dentro del espacio (nivel × espacio) están sus posiciones: solo se pide una si tiene más de una, y se ofrecen las libres (más la de esta misma relación, que occupiedBy no cuenta).
    const hasBay = !!(d.rack && st.niv && st.esp);
    const nums = hasBay ? positionsAt(d.rack, st.niv, st.esp) : [1];
    const freeNums = hasBay && nums.length > 1 ? nums.filter((p) => !occupiedBy(d.rack.id, Number(st.niv), Number(st.esp), p)) : [];
    fillSelect('rel-pos', freeNums.map((n) => ({ value: n, label: n })), nums.length > 1 ? t('main.relPositionShort') : '—', st.pos, !freeNums.length);
    drawRack(d.rack);
    drawPath(d);
    const packState = renderPack(d, hasBay ? nums : []);
    const ready = st.sku && st.centro && st.alm && !packState.blocked;
    $m('rel-save').disabled = !ready;
    const missing = [];
    if (!st.sku) missing.push(t('main.relMissingCode'));
    if (!st.centro) missing.push(t('main.relMissingCost')); else if (!st.alm) missing.push(t('main.relMissingWarehouse'));
    const located = (d.sub && d.sub.kind === 'virtual') || (st.est && st.niv && st.esp && (st.pos || nums.length <= 1));
    $m('rel-msg').textContent = packState.blocked ? t('main.relPackBlocked') : (ready ? t(located ? 'main.relReady' : 'main.relReadyPartial') : t('main.relMissing', { x: missing.join(' / ') }));
}

// ---- «Se acomoda»: qué empaque se pone en la posición (el material principal, el primario, el secundario…) y cuántas piezas caben (public/PackCalc.js) ------------------------------------
// Los empaques y sus medidas salen de Alta Artículos; la posición (largo × fondo × alto) sale del Layout. Cada opción se ve desde arriba con las piezas de una capa; la sugerida es la que acomoda más piezas.
function packLevelsOf(sku) {
    return window.PackCalc && sku ? window.PackCalc.levelsOf({ length: sku.length, width: sku.width, height: sku.height, packaging: sku.packaging }).filter((lv) => lv.l > 0 && lv.w > 0 && lv.h > 0) : [];
}
function packBoxCm(rack, niv, esp, pos) {
    if (!rack || !niv || !esp) return null;
    const g = (rack.positions || []).find((x) => x.n === Number(niv) && x.c === Number(esp));
    if (!g || !Array.isArray(g.boxes) || !g.boxes.length) return null;
    const b = g.boxes.find((x) => x.num === Number(pos)) || (g.boxes.length === 1 ? g.boxes[0] : null);
    if (!b || !(b.l > 0) || !(b.w > 0)) return null;
    const h = b.h > 0 ? Math.min(b.h, g.bh || b.h) : (g.bh || 0);
    return { l: Math.round(b.l * 1000) / 10, w: Math.round(b.w * 1000) / 10, h: Math.round(h * 1000) / 10 };
}
const packName = (lv) => `${t(`main.pkLevel${lv.level}`)}${lv.name ? ` · ${lv.name}` : ''}`;
function packTopSvg(box, f, level) {
    const cls = `lv${Math.min(level, 2)}`;
    const body = f.cells.map((c) => (c.r ? `<circle cx="${c.cx.toFixed(2)}" cy="${c.cy.toFixed(2)}" r="${(c.r - 0.15).toFixed(2)}" class="pk-c ${cls}"/>` : `<rect x="${(c.x + 0.2).toFixed(2)}" y="${(c.y + 0.2).toFixed(2)}" width="${Math.max(c.l - 0.4, 0.1).toFixed(2)}" height="${Math.max(c.w - 0.4, 0.1).toFixed(2)}" class="pk-b ${cls}"/>`)).join('');
    return `<svg viewBox="-1 -1 ${box.l + 2} ${box.w + 2}" class="rel-pack-svg" role="img" aria-label="${esc(t('main.relPackTop'))}"><rect x="0" y="0" width="${box.l}" height="${box.w}" class="pk-pos"/>${body}</svg>`;
}
// Devuelve { blocked }: true cuando el empaque elegido no cabe en la posición (no se guarda).
function renderPack(d, nums) {
    const opts2 = $m('rel-pack-opts');
    const hint = $m('rel-pack-hint');
    const levels = packLevelsOf(st.sku);
    const out = { blocked: false };
    opts2.innerHTML = '';
    if (!st.sku) { hint.textContent = t('main.relPackNoCode'); return out; }
    if (!levels.length || (levels.length === 1 && !levels[0].l)) { hint.textContent = t('main.relPackNoData'); return out; }
    const hasBay = !!(d.rack && st.niv && st.esp);
    const box = hasBay ? packBoxCm(d.rack, st.niv, st.esp, st.pos) : null;
    if (!box) {
        hint.textContent = t('main.relPackNoPlace');
        // sin lugar todavía se puede elegir qué se acomoda; solo falta el cálculo
        opts2.innerHTML = levels.map((lv) => `<button type="button" class="rel-pack-card${Number(st.pack) === lv.level && st.pack !== '' ? ' sel' : ''}" data-pack="${lv.level}"><span class="rel-pack-h"><b>${esc(packName(lv))}</b></span><span class="rel-pack-m">${esc(t(lv.shape === 'cilindrica' ? 'main.pkCyl' : 'main.pkRect'))} · ${esc(lv.shape === 'cilindrica' ? `Ø ${lv.l}` : `${lv.l} × ${lv.w}`)} × ${esc(lv.h)} cm</span></button>`).join('');
        return out;
    }
    hint.textContent = t('main.relPackBox', { l: box.l, w: box.w, h: box.h });
    const fits = levels.map((lv) => ({ lv, f: window.PackCalc.fit(box, lv) }));
    const best = fits.filter((x) => x.f.capacity > 0).sort((a, b) => b.f.capacity - a.f.capacity || b.lv.level - a.lv.level)[0];
    opts2.innerHTML = fits.map(({ lv, f }) => {
        const sel = st.pack !== '' && Number(st.pack) === lv.level;
        if (sel && !f.count) out.blocked = true;
        const unit = t(lv.level === 0 ? 'main.relPackUnitMain' : 'main.relPackUnitPack');
        const detail = f.count
            ? `${t('main.relPackLayers', { k: f.layers, m: f.perLayer })}. ${t('main.relPackLeft', { h: f.leftH, d: f.leftD })}.`
            : '';
        return `<button type="button" class="rel-pack-card${sel ? ' sel' : ''}" data-pack="${lv.level}"${f.count ? '' : ' title="' + esc(t('main.relPackNoFit')) + '"'}>
            <span class="rel-pack-h"><b>${esc(packName(lv))}</b>${best && best.lv.level === lv.level ? `<span class="rel-tag rel-tag-ok">${esc(t('main.relPackSuggested'))}</span>` : ''}</span>
            <span class="rel-pack-m">${esc(t(lv.shape === 'cilindrica' ? 'main.pkCyl' : 'main.pkRect'))} · ${esc(lv.shape === 'cilindrica' ? `Ø ${lv.l}` : `${lv.l} × ${lv.w}`)} × ${esc(lv.h)} cm</span>
            ${f.count ? packTopSvg(box, f, lv.level) : ''}
            <span class="rel-pack-n">${f.count ? `<b>${f.capacity}</b><span class="rel-muted">${esc(t('main.relPackPieces'))}</span>` : `<span class="rel-pack-warn">${esc(t('main.relPackNoFit'))}</span>`}</span>
            ${f.count ? `<span class="rel-pack-d">${esc(t('main.relPackFitsN', { n: f.count, u: unit }))}. ${esc(detail)}</span>` : ''}
        </button>`;
    }).join('');
    return out;
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
        html += `<div class="rel-lv" style="--cols:${slotsAt(rack, n)}"><span class="rel-ln">${esc(t('main.relLevelN', { n }))}</span>`;
        for (let e = 1; e <= slotsAt(rack, n); e += 1) {
            // el espacio está ocupado cuando lo están todas sus posiciones
            const occs = positionsAt(rack, n, e).map((p) => occupiedBy(rack.id, n, e, p));
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
        [t('main.colRelProfundidad'), st.pos ? t('main.relPositionN', { n: st.pos }) : ''],
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
            sku: { id: record.skuItemId, sku: record.sku, description: record.description, upc: record.upc, uom: '', length: record.skuLength, width: record.skuWidth, height: record.skuHeight, packaging: record.skuPackaging },
            centro: record.costCenterId || '', alm: record.warehouseId || '', sub: record.subWarehouseId || '', zona: record.zoneId || '', hue: record.footprintId || '', est: record.spaceId || '',
            niv: record.level || '', esp: record.slot || '', pos: record.position || '', clas: record.classification || 'activo', pack: record.packLevel == null ? '' : record.packLevel,
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
        zoneId: st.zona || '', spaceId: st.est || '', level: st.niv || null, slot: st.esp || null, position: st.pos || null, classification: st.clas || 'activo', packLevel: st.pack === '' ? null : Number(st.pack),
    };
    let method = 'POST';
    let url = API;
    let body = values;
    if (editing) {
        const before = {
            skuItemId: editing.skuItemId, costCenterId: editing.costCenterId, warehouseId: editing.warehouseId, subWarehouseId: editing.subWarehouseId,
            zoneId: editing.zoneId || '', spaceId: editing.spaceId || '', level: editing.level, slot: editing.slot, position: editing.position, classification: editing.classification || 'activo', packLevel: editing.packLevel ?? null,
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

// ---- «Ubicar» ------------------------------------------------------------------------------------------------------------------------
// Ventanita con dos formas de elegir el lugar de un renglón (el centro de costos, el almacén y el sub almacén ya vienen del renglón, de ahí salen las zonas y los activos):
//   · Paso a paso: Zona > Huella > Activo > Nivel > Espacio > Posición, cada lista con lo que hay dentro de la anterior (las mismas reglas de la ventana de Editar).
//   · Buscar: un solo buscador (con $ antes, @ después y coma, como los demás) sobre los localizadores libres de este sub almacén; al elegir uno se llenan solos los campos y se pasa a «Paso a paso» para verlos.
// Se llena y se guarda con «Guardar» (el mismo PATCH de Editar: las mismas validaciones del servidor, el mismo registro de cambios y las hojas del árbol de cada dato).
let locEl = null;
let locTab = 'steps';
let locCands = null;     // los lugares que ofrece Buscar (se arman una vez por ventana)
let locShown = [];       // los resultados que se ven ahora
const LOC_MAX = 40;

function ensureLocModal() {
    if (locEl) return;
    locEl = document.createElement('div');
    locEl.className = 'modal-overlay';
    locEl.id = 'rel-loc-modal';
    locEl.hidden = true;
    const field = (id, labelKey, helpKey) => `<div class="rel-fld"><label for="${id}">${esc(t(labelKey))}</label><select id="${id}" data-help-key="${helpKey}"></select></div>`;
    locEl.innerHTML = `<div class="modal-panel rel-dialog rel-loc" role="dialog" aria-modal="true" aria-labelledby="loc-title">
        <h3 id="loc-title">${esc(t('main.relUbicarTitle'))}</h3>
        <div class="rel-art" id="loc-art"></div>
        <div class="rel-loc-tabs" role="tablist">
            <button type="button" class="rel-loc-tab" role="tab" data-tab="steps" data-help-key="relUbicarSteps">${esc(t('main.relUbicarTabSteps'))}</button>
            <button type="button" class="rel-loc-tab" role="tab" data-tab="search" data-help-key="relUbicarSearch">${esc(t('main.relUbicarTabSearch'))}</button>
        </div>
        <div class="rel-loc-pane" id="loc-steps">
            <div class="rel-two">${field('loc-zona', 'main.colRelZona', 'relZone')}${field('loc-hue', 'main.colRelHuella', 'relFootprint')}</div>
            ${field('loc-est', 'main.colRelEstante', 'relRack')}
            <div class="rel-three">${field('loc-niv', 'main.colRelNivel', 'relLevel')}${field('loc-esp', 'main.colRelEspacio', 'relSlot')}${field('loc-pos', 'main.colRelProfundidad', 'relPosition')}</div>
        </div>
        <div class="rel-loc-pane" id="loc-search" hidden>
            <div class="rel-fld"><label for="loc-q">${esc(t('main.relUbicarTabSearch'))}</label><input type="search" id="loc-q" autocomplete="off" placeholder="${esc(t('main.relUbicarSearchPh'))}" data-help-key="relUbicarSearch"></div>
            <div class="rel-results rel-loc-results" id="loc-results"></div>
        </div>
        <div class="rel-fld"><label>${esc(t('main.relUbicarPlace'))}</label><div class="rel-path" id="loc-path"></div></div>
        <div class="rel-foot">
            <span class="rel-muted" id="loc-msg"></span>
            <button type="button" class="btn" id="loc-save" data-help-key="relUbicarSave">${esc(t('main.relUbicarSave'))}</button>
            <button type="button" class="btn btn-secondary" id="loc-close">${esc(t('main.whClose'))}</button>
        </div>
    </div>`;
    document.body.appendChild(locEl);
    locEl.addEventListener('click', (event) => {
        if (event.target === locEl || event.target.closest('#loc-close')) { closeLocate(); return; }
        if (event.target.closest('#loc-save')) { saveLocate(); return; }
        const tab = event.target.closest('.rel-loc-tab');
        if (tab && !tab.disabled) { locTab = tab.dataset.tab; locRender(); if (locTab === 'search') $m('loc-q').focus(); return; }
        const pick = event.target.closest('[data-loc-i]');
        if (pick) locPick(locShown[Number(pick.dataset.locI)]);
    });
    // Al elegir algo, lo que solo tiene una opción (la única huella de la zona, el único activo de la huella) se elige solo.
    const autoPick = () => {
        let d = derived();
        if (d.zone && !st.hue && d.footprints.length === 1) { st.hue = d.footprints[0].id; d = derived(); }
        if (d.footprint && !st.est && d.racks.length === 1) st.est = d.racks[0].id;
    };
    const bindSel = (id, key, numeric) => $m(id).addEventListener('change', (event) => {
        const v = event.target.value;
        st[key] = numeric && v !== '' ? Number(v) : v;
        cutBelow(key);
        if (key === 'zona' || key === 'hue') autoPick();
        locRender();
    });
    bindSel('loc-zona', 'zona'); bindSel('loc-hue', 'hue'); bindSel('loc-est', 'est'); bindSel('loc-niv', 'niv', true); bindSel('loc-esp', 'esp', true); bindSel('loc-pos', 'pos', true);
    $m('loc-q').addEventListener('input', locRenderResults);
    // Con Enter se elige el primer lugar libre de la lista: así se captura sin tocar el mouse.
    $m('loc-q').addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const first = locShown.find((c) => !c.occ);
        if (first) locPick(first);
    });
}

async function openLocate(record) {
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
    ensureLocModal();
    editing = record;
    locCands = null;
    locShown = [];
    locTab = 'steps';
    st = {
        sku: { id: record.skuItemId, sku: record.sku, description: record.description, upc: record.upc, uom: '' },
        centro: record.costCenterId || '', alm: record.warehouseId || '', sub: record.subWarehouseId || '', zona: record.zoneId || '', hue: record.footprintId || '', est: record.spaceId || '',
        niv: record.level || '', esp: record.slot || '', pos: record.position || '', clas: record.classification || 'activo',
    };
    $m('loc-q').value = '';
    locRender();
    locEl.hidden = false;
}

function closeLocate() {
    if (locEl) locEl.hidden = true;
    editing = null;
    locCands = null;
}
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && locEl && !locEl.hidden) closeLocate(); });

// El localizador completo de lo que está elegido ('' mientras falte alguna pieza).
function locLocator(d) {
    if (!(d.zone && d.footprint && d.rack && st.niv && st.esp) || !window.RelTemplate) return '';
    const nums = positionsAt(d.rack, st.niv, st.esp);
    if (nums.length > 1 && !st.pos) return '';
    return window.RelTemplate.formatLocator({ zoneCode: d.zone.code, zoneName: d.zone.name, footprintCode: d.footprint.code, spaceCode: d.rack.code, spaceType: d.rack.type, level: Number(st.niv), slot: Number(st.esp), position: Number(st.pos) || 1 });
}

// ¿Lo elegido cambia el lugar que ya tenía el renglón?
function locChanged() {
    const same = (a, b) => String(a ?? '') === String(b ?? '');
    return !(same(st.zona, editing.zoneId) && same(st.est, editing.spaceId) && same(st.niv, editing.level) && same(st.esp, editing.slot) && same(st.pos, editing.position));
}

function locRender() {
    const d = derived();
    const usable = d.physical && d.zones.length > 0;
    $m('loc-art').innerHTML = `<b>${esc(editing.sku)} · ${esc(editing.description)}</b><span>${esc(editing.locator ? t('main.relUbicarNow', { x: editing.locator }) : t('main.relUbicarNowNone'))}</span>`;
    locEl.querySelectorAll('.rel-loc-tab').forEach((tab) => { tab.setAttribute('aria-selected', String(tab.dataset.tab === locTab)); tab.disabled = !usable; });
    $m('loc-steps').hidden = !(usable && locTab === 'steps');
    $m('loc-search').hidden = !(usable && locTab === 'search');
    if (!usable) {
        $m('loc-path').innerHTML = '';
        $m('loc-msg').textContent = t('main.relUbicarNoSub');
        $m('loc-save').disabled = true;
        return;
    }
    fillSelect('loc-zona', d.zones.map((z) => ({ value: z.id, label: z.name })), t('main.relChooseZone'), st.zona, !d.zones.length);
    fillSelect('loc-hue', d.footprints.map((f) => ({ value: f.id, label: f.code })), d.zone ? t('main.relChooseFootprint') : t('main.relFirstZone'), st.hue, !d.footprints.length);
    fillSelect('loc-est', d.racks.map((r) => ({ value: r.id, label: r.code })), d.footprint ? t('main.relChooseRack') : t('main.relFirstFootprint'), st.est, !d.racks.length);
    fillSelect('loc-niv', d.rack ? range(d.rack.levels).map((n) => ({ value: n, label: n })) : [], d.rack ? t('main.relLevelShort') : '—', st.niv, !d.rack);
    fillSelect('loc-esp', d.rack && st.niv ? range(slotsAt(d.rack, st.niv)).map((n) => ({ value: n, label: n })) : [], d.rack ? t('main.relSlotShort') : '—', st.esp, !(d.rack && st.niv));
    const hasBay = !!(d.rack && st.niv && st.esp);
    const nums = hasBay ? positionsAt(d.rack, st.niv, st.esp) : [1];
    const freeNums = hasBay && nums.length > 1 ? nums.filter((p) => !occupiedBy(d.rack.id, Number(st.niv), Number(st.esp), p)) : [];
    fillSelect('loc-pos', freeNums.map((n) => ({ value: n, label: n })), nums.length > 1 ? t('main.relPositionShort') : '—', st.pos, !freeNums.length);
    const locator = locLocator(d);
    const parts = [
        [t('main.colRelZona'), d.zone && d.zone.name],
        [t('main.colRelHuella'), d.footprint && d.footprint.code],
        [t('main.colRelEstante'), d.rack && d.rack.code],
        [t('main.colRelNivel'), st.niv ? t('main.relLevelN', { n: st.niv }) : ''],
        [t('main.colRelEspacio'), st.esp ? t('main.relSlotN', { n: st.esp }) : ''],
        [t('main.colRelProfundidad'), st.pos ? t('main.relPositionN', { n: st.pos }) : ''],
    ];
    $m('loc-path').innerHTML = parts.map(([label, value], i) => `${i ? '<span class="rel-arrow">›</span>' : ''}<span class="rel-step${value ? ' rel-step-on' : ''}">${esc(value || label)}</span>`).join('')
        + (locator ? `<span class="rel-arrow">=</span><span class="rel-step rel-step-on rel-locator">${esc(locator)}</span>` : '');
    const changed = locChanged();
    $m('loc-save').disabled = !changed;
    $m('loc-msg').textContent = !changed ? t('main.relUbicarSame') : (locator ? t('main.relUbicarReady') : t('main.relUbicarPartial'));
    if (locTab === 'search') locRenderResults();
}

// Los lugares que ofrece Buscar: cada posición de cada activo de las zonas de este sub almacén, con su localizador; los ocupados salen apagados con el código que los ocupa.
function locCandidates() {
    if (locCands) return locCands;
    const d = derived();
    const entries = d.sub ? d.sub.locations : [];
    const out = [];
    d.zones.forEach((zone) => {
        const entry = entries.find((e) => e.zoneId === zone.id);
        (zone.spaces || []).filter((s) => !entry || !entry.spaceIds.length || entry.spaceIds.includes(s.id)).forEach((s) => {
            const fp = byId(zone.footprints, s.footprintId);
            if (!fp) return;
            for (let n = 1; n <= s.levels; n += 1) {
                for (let c = 1; c <= slotsAt(s, n); c += 1) {
                    const nums = positionsAt(s, n, c);
                    nums.forEach((p) => {
                        const text = window.RelTemplate ? window.RelTemplate.formatLocator({ zoneCode: zone.code, zoneName: zone.name, footprintCode: fp.code, spaceCode: s.code, spaceType: s.type, level: n, slot: c, position: p }) : '';
                        out.push({ text: text || `${zone.name} ${fp.code} ${s.code} N${n} E${c} P${p}`, hay: `${text} ${zone.name} ${fp.code} ${s.code}`, zona: zone.id, hue: fp.id, est: s.id, niv: n, esp: c, pos: nums.length > 1 ? p : '', occ: occupiedBy(s.id, n, c, p) });
                    });
                }
            }
        });
    });
    locCands = out;
    return out;
}

function locRenderResults() {
    const q = $m('loc-q').value.trim();
    const box = $m('loc-results');
    if (!q) { locShown = []; box.innerHTML = `<span class="rel-muted">${esc(t('main.relUbicarHint'))}</span>`; return; }
    const all = locCandidates().filter((c) => SearchSyntax.matches('contains', q, c.hay));
    all.sort((a, b) => (a.occ ? 1 : 0) - (b.occ ? 1 : 0)); // primero los libres
    locShown = all.slice(0, LOC_MAX);
    if (!all.length) { box.innerHTML = `<span class="rel-muted">${esc(t('main.relUbicarNone'))}</span>`; return; }
    box.innerHTML = locShown.map((c, i) => (c.occ
        ? `<button type="button" class="rel-result rel-loc-occ" disabled><b>${esc(c.text)}</b> <span class="rel-muted">${esc(t('main.relOccupiedBy', { sku: c.occ }))}</span></button>`
        : `<button type="button" class="rel-result" data-loc-i="${i}"><b>${esc(c.text)}</b></button>`)).join('')
        + (all.length > LOC_MAX ? `<span class="rel-muted">${esc(t('main.relUbicarMore', { n: all.length - LOC_MAX }))}</span>` : '');
}

// Elegir un lugar de Buscar llena todos los campos y pasa a «Paso a paso» para verlos; falta pulsar «Guardar».
function locPick(c) {
    if (!c || c.occ) return;
    st.zona = c.zona; st.hue = c.hue; st.est = c.est; st.niv = c.niv; st.esp = c.esp; st.pos = c.pos;
    locTab = 'steps';
    locRender();
    $m('loc-save').focus();
}

async function saveLocate() {
    const values = { zoneId: st.zona || '', spaceId: st.est || '', level: st.niv || null, slot: st.esp || null, position: st.pos || null };
    const before = { zoneId: editing.zoneId || '', spaceId: editing.spaceId || '', level: editing.level, slot: editing.slot, position: editing.position };
    const body = {};
    Object.keys(values).forEach((key) => { if (String(values[key] ?? '') !== String(before[key] ?? '')) body[key] = values[key]; });
    if (!Object.keys(body).length) { closeLocate(); return; }
    const id = editing.id;
    $m('loc-save').disabled = true;
    try {
        const res = await fetch(`${API}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            Dashboard.showToast(json.message || Dashboard.t('admin.saveError'), res.status === 403 ? 'warning' : 'error');
            $m('loc-save').disabled = false;
            return;
        }
        if (json.rejectedFields?.length) Dashboard.showToast(`${Dashboard.t('main.fieldLocked')}: ${json.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'warning');
        else if (json.pendingFields?.length) Dashboard.showToast(`${Dashboard.t('main.changePending')}: ${json.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'info');
        else Dashboard.showToast(t('main.relSaved'), 'success');
        closeLocate();
        await refreshTable();
    } catch (err) {
        console.error('Relación Código: failed to locate', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        $m('loc-save').disabled = false;
    }
}
})();
