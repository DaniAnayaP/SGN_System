// ---------------------------------------------------------------------------
// Presentaciones de Distribución (Operaciones, C. Distribución): las presentaciones en que se distribuye cada código, en ÁRBOL. La raíz (nivel 0) es el material principal (su unidad, sus medidas y su peso son los de
// Alta Artículos; aquí solo su forma y si se puede acostar) y cada presentación dice de cuál sale («Sale de»): de una misma pueden salir varias (hasta 10) y hay hasta 10 niveles. Cada una tiene su unidad del catálogo
// Nuestras Unidad Medida, cuántas de la que la contiene lleva y SUS PROPIAS medidas (cm) y peso (g): nada se calcula multiplicando. «Equivale a» sí se calcula (cuántas unidades principales trae, por su camino).
// La columna «Ramificación» dibuja el árbol y, arriba de la tabla, con un solo código a la vista, se dibuja completo. De aquí leen Relación Código («Se acomoda») y el Layout (piezas que caben).
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
const COLS = { classification: 'colUdmDClasificacion', brandId: 'colUdmDMarca', uom: 'colUdmDUnidad', contains: 'colUdmDContiene', shape: 'colUdmDForma', length: 'colUdmDLargo', width: 'colUdmDAncho', height: 'colUdmDAlto', weightG: 'colUdmDPeso', canLay: 'colUdmDAcostar', storageTypes: 'colUdmDTipo', shipTo: 'colUdmDEnvios', unitsPerLayer: 'colUdmDCantidadCama', layersPerPallet: 'colUdmDCamasPallet', maxStack: 'colUdmDMaxEstiba' };
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
let maxDepth = 10;
let maxChildren = 10;
let brands = []; // las marcas activas del catálogo Nuestras Marcas: [{ id, name }]
let places = []; // los lugares de envío del catálogo Lugares de Envío: [{ id, name, active }] (los inactivos solo para nombrar los que una presentación ya traía)
const placeName = (id) => (places.find((p) => p.id === id) || {}).name || `#${id}`;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Presentaciones de Distribución failed to initialize:', err);
    }
})();

// ---- datos de cada código --------------------------------------------------------------------------------------------------------------
// Los códigos que todavía no tienen presentaciones salen igual, con su material principal (virtual = renglón sin guardar): para el árbol y las reglas del código cuentan solo los renglones guardados.
let rowsBySku = new Map(); // los renglones de cada código, en el orden del árbol que manda el servidor (cada una antes de las que salen de ella)
let presCounts = new Map(); // cuántas presentaciones tiene cada código
const rowsOfSku = (skuId) => (rowsBySku.get(skuId) || []).filter((r) => !r.virtual);
const mainUomOf = (skuId) => ((rowsBySku.get(skuId) || []).find((r) => r.level === 0) || {}).uom || '';
const parentRowOf = (r) => rows.find((x) => x.id === r.parentId);
const childCountOf = (id) => rows.filter((r) => r.parentId === id).length;
// El rótulo del nivel de un renglón: «Marca» para el de una marca; para las demás, «Empaque primario»… (el nivel entre las presentaciones: la marca no cuenta).
const rowLevelName = (r) => (r.isBrand ? t('main.udmMarcaNode') : levelName(r.packLevel));
const claseName = (c) => (c ? t(`main.udmClase_${c}`) : '');

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
    // Un código sin presentaciones guardadas (renglón virtual): no tiene historial ni se borra; el lápiz abre la captura de su material principal.
    if (r.virtual) {
        if (Dashboard.canEditField(TABLE_KEY, CREATE_AUTH_COL, '')) td.appendChild(iconButton('admin-icon-btn', 'bx-edit', t('main.udmCapture'), 'udmCapture', () => openForCode(r, null)));
        return td;
    }
    td.appendChild(iconButton('admin-icon-btn', 'bx-history', t('main.changeHistoryTitleRecord'), 'changeHistory', () => Dashboard.openChangeHistory(TABLE_KEY, r.id)));
    if (!r.isBrand && canTouchAnyColumn()) td.appendChild(iconButton('admin-icon-btn', 'bx-edit', t('main.udmEdit'), 'udmEdit', () => openDialog(r)));
    // «+»: agregar una presentación que sale de este renglón (el código ya viene elegido)
    if (Dashboard.canEditField(TABLE_KEY, CREATE_AUTH_COL, '')) td.appendChild(iconButton('admin-icon-btn', 'bx-plus', t('main.udmAddUnder'), 'udmAddUnder', () => openForCode(r, r)));
    if (Dashboard.hasColumnDeleteGrant(TABLE_KEY, DELETE_AUTH_COL)) td.appendChild(iconButton('admin-icon-btn admin-icon-btn-danger', 'bx-trash', t('admin.delete'), 'delete', () => deletePresentation(r)));
    return td;
}
// Cuántas presentaciones (sin contar el material principal ni los renglones de marca) tiene un código.
const presCountOf = (skuId) => presCounts.get(skuId) || 0;
// Ramificación: un resumen del código (su material principal y cuántas presentaciones tiene); al tocar la celda se abre el árbol completo en una pantalla flotante, donde se ven, se agregan, se editan y se quitan las presentaciones.
function treeCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colUdmDRamificacion';
    td.className = 'udm-tree-cell';
    const n = presCountOf(r.skuItemId);
    td.title = t('main.udmTreeOpen');
    td.innerHTML = `<div class="udm-tree"><span class="udm-tnode root">${esc(r.name || r.uom || rowLevelName(r))}</span><span class="udm-tcount${n ? '' : ' none'}">${esc(n ? t('main.udmNPres', { n }) : t('main.udmNPres0'))}</span><button type="button" class="udm-tree-open" data-help-key="udmArbol" aria-label="${esc(t('main.udmTreeOpen'))}" title="${esc(t('main.udmTreeOpen'))}"><i class="bx bx-sitemap" aria-hidden="true"></i></button></div>`;
    td.addEventListener('click', () => openTreeModal(r.skuItemId)); // tocar la columna abre el árbol completo del código en una pantalla flotante
    return td;
}
// UN renglón por código (r = su material principal, guardado o no): su unidad de medida principal, su forma, medidas y peso (de Alta), para qué se usa y a dónde se envía; las presentaciones que salen de él se ven, se agregan
// y se editan en el árbol flotante de la columna Ramificación.
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    tr.dataset.sku = String(r.skuItemId);
    tr.dataset.skuCode = r.sku || '';
    tr.dataset.upc = r.upc || '';
    const fromArticle = t('main.udmFromArticle');
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, r[key], 'col-system')),
        cell('colCatRegistroUnico', r.registroUnico, 'col-system'),
        cell('colUdmDDescripcion', r.description), treeCell(r),
        cell('colUdmDUnidad', r.uom, 'udm-ro', fromArticle),
        cell('colUdmDForma', t(r.shape === 'cilindrica' ? 'main.pkCyl' : 'main.pkRect')),
        cell('colUdmDLargo', fmt(r.length), 'udm-ro', fromArticle),
        cell('colUdmDAncho', r.shape === 'cilindrica' ? '= Ø' : fmt(r.width), 'udm-ro', fromArticle),
        cell('colUdmDAlto', fmt(r.height), 'udm-ro', fromArticle),
        cell('colUdmDPeso', fmtWeight(r.weightG), 'udm-ro', fromArticle),
        cell('colUdmDAcostar', t(r.canLay ? 'main.udmYes' : 'main.udmNo')),
        cell('colUdmDTipo', (r.storageTypes || []).length ? r.storageTypes.map(typeName).join(' · ') : t('main.udmTipoNinguno'), (r.storageTypes || []).length ? '' : 'udm-ro'),
        cell('colUdmDEnvios', (r.shipTo || []).length ? r.shipTo.map(placeName).join(' · ') : t('main.udmEnviosNinguno'), (r.shipTo || []).length ? '' : 'udm-ro'),
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
// La pantalla lista TODOS los códigos de Alta desde el inicio: con miles, dibujar todos los renglones de un golpe congelaba la página. Se dibujan los primeros al entrar y el resto sale al bajar (o con «Mostrar más» /
// «Mostrar todos»), igual que en Alta Artículos. Todo lo que llegó del servidor queda en memoria: la búsqueda de texto trabaja sobre esos datos y no sobre los renglones dibujados, y lo que lee todas las filas del DOM
// (ordenar o filtrar por columna) pide primero dibujar el resto (Dashboard.registerPartialTable). Al guardar, solo se vuelve a leer y a dibujar el código que cambió.
const UDM_FIRST_ROWS = 100; // los que se dibujan al entrar
const UDM_NEXT_ROWS = 200; // los que se agregan al bajar o con «Mostrar más»
let codeList = []; // el renglón del material principal de cada código (guardado o no)
let codeView = []; // los que cumplen la búsqueda de texto (todos, si no hay búsqueda)
let codeDrawn = 0; // cuántos de codeView ya están dibujados
let codeDrawing = null; // la tanda que se está dibujando (promesa)
let codeToken = 0; // una recarga o una búsqueda nueva cancela la tanda anterior
let fetchToken = 0;
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function indexRows() {
    rowsBySku = new Map();
    presCounts = new Map();
    rows.forEach((r) => {
        if (!rowsBySku.has(r.skuItemId)) rowsBySku.set(r.skuItemId, []);
        rowsBySku.get(r.skuItemId).push(r);
        if (r.level >= 1 && !r.isBrand) presCounts.set(r.skuItemId, (presCounts.get(r.skuItemId) || 0) + 1);
    });
    codeList = rows.filter((r) => r.level === 0);
    // para buscar: el código, su descripción, su unidad y todo lo que cuelga de él (presentaciones, marcas y clasificaciones)
    codeList.forEach((m) => { m._search = [m.sku, m.upc, m.description, m.uom, ...(rowsBySku.get(m.skuItemId) || []).filter((x) => x.level >= 1).flatMap((x) => [x.name, x.brand, claseName(x.classification)])].filter(Boolean).join(' ').toLowerCase(); });
}
function computeView() {
    const text = searchText();
    codeView = text ? codeList.filter((m) => SearchSyntax.matches('contains', text, m._search || '')) : codeList.slice();
}
function drawCodeRows(count) {
    if (codeDrawing) return codeDrawing;
    if (codeDrawn >= codeView.length) return Promise.resolve(true);
    const token = codeToken;
    const from = codeDrawn;
    const slice = codeView.slice(from, from + count);
    const run = (async () => {
        const finished = await Dashboard.renderTableRowsInChunks({ tableKey: TABLE_KEY, tbody: getTbody(), records: slice, buildRow, isStale: () => token !== codeToken });
        if (token === codeToken) {
            if (finished) codeDrawn = from + slice.length;
            codeDrawing = null;
            updateMoreBar();
        }
        return finished;
    })();
    codeDrawing = run;
    return run;
}
// Dibuja todo lo que falta (para ordenar o filtrar por columna, o con «Mostrar todos»).
async function drawAllCodeRows() {
    while (codeDrawn < codeView.length) {
        const ok = await drawCodeRows(codeView.length - codeDrawn);
        if (!ok) return false;
    }
    return true;
}
function resetCodeRows() {
    codeToken += 1;
    codeDrawing = null;
    codeDrawn = 0;
    getTbody().innerHTML = '';
    if (!codeView.length) { ensureEmptyState(); updateMoreBar(); return Promise.resolve(true); }
    return drawCodeRows(UDM_FIRST_ROWS);
}
const udmToolbar = () => document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling || null;
// «Mostrando X de Y» con los botones para dibujar más; solo sale cuando falta algo por dibujar.
function updateMoreBar() {
    const toolbar = udmToolbar();
    if (!toolbar) return;
    let bar = toolbar.querySelector('.sku-more-bar');
    if (codeDrawn >= codeView.length) { if (bar) bar.remove(); return; }
    if (!bar) {
        bar = document.createElement('span');
        bar.className = 'sku-more-bar tpl-muted';
        bar.innerHTML = '<span class="sku-more-text" aria-live="polite"></span><button type="button" class="btn btn-secondary sku-more-btn" data-udm-more></button><button type="button" class="btn btn-secondary sku-more-btn" data-udm-all></button>';
        bar.querySelector('[data-udm-more]').addEventListener('click', () => drawCodeRows(UDM_NEXT_ROWS));
        bar.querySelector('[data-udm-all]').addEventListener('click', () => drawAllCodeRows());
        toolbar.prepend(bar);
    }
    bar.querySelector('.sku-more-text').textContent = Dashboard.t('main.skuMostrando').replace('{shown}', String(codeDrawn)).replace('{total}', String(codeView.length));
    bar.querySelector('[data-udm-more]').textContent = Dashboard.t('main.skuMostrarMas');
    bar.querySelector('[data-udm-all]').textContent = Dashboard.t('main.skuMostrarTodos');
}
// Al bajar casi hasta el final de lo dibujado, se dibujan más renglones.
function watchCodeScroll() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    if (!wrapper || wrapper.dataset.udmScrollBound) return;
    wrapper.dataset.udmScrollBound = '1';
    wrapper.addEventListener('scroll', () => {
        if (codeDrawing || codeDrawn >= codeView.length) return;
        if (wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 800) drawCodeRows(UDM_NEXT_ROWS);
    }, { passive: true });
}
function applyServerData(body) {
    rows = body.rows || [];
    uoms = body.uoms || [];
    brands = body.brands || [];
    places = body.places || [];
    maxDepth = body.maxDepth || 10;
    maxChildren = body.maxChildren || 10;
    indexRows();
}
async function refreshTable() {
    const token = ++fetchToken;
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== fetchToken) return; // llegó otra recarga después de esta
        applyServerData(body);
        computeView();
        watchCodeScroll();
        const finished = await resetCodeRows();
        if (finished && token === fetchToken && Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
        renderTreeModal(); // si el árbol flotante está abierto, se pone al día con lo que se acaba de leer
    } catch (err) {
        console.error('Presentaciones de Distribución: failed to load records', err);
    }
}
// Después de guardar o quitar una presentación solo se vuelve a leer (y a dibujar) ese código, no toda la tabla.
async function refreshCode(skuId) {
    try {
        const res = await fetch(`${API}?skuItemId=${encodeURIComponent(skuId)}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        const at = rows.findIndex((r) => r.skuItemId === skuId);
        if (!(body.rows || []).length || at < 0) { await refreshTable(); return; } // ya no tiene renglones guardados (vuelve a salir como renglón sin guardar) o es nuevo: se lee todo
        const rest = rows.filter((r) => r.skuItemId !== skuId);
        rows = [...rest.slice(0, at), ...body.rows, ...rest.slice(at)]; // los renglones de un código van juntos y en su lugar
        places = body.places || places;
        brands = body.brands || brands;
        indexRows();
        const before = codeView.length;
        computeView();
        const main = codeList.find((m) => m.skuItemId === skuId);
        const tr = getTbody().querySelector(`tr[data-sku="${skuId}"]`);
        if (tr && main) tr.replaceWith(buildRow(main));
        else if (codeView.length !== before) { await resetCodeRows(); }
        renderTreeModal();
    } catch (err) {
        console.error('Presentaciones de Distribución: failed to refresh a code', err);
        await refreshTable();
    }
}
function applyFilters() {
    computeView();
    resetCodeRows().then((finished) => { if (finished && Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY); });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);
if (window.Dashboard && Dashboard.registerPartialTable) Dashboard.registerPartialTable(TABLE_KEY, { isComplete: () => codeDrawn >= codeView.length, loadAll: drawAllCodeRows });

// ---- el árbol del código en una pantalla flotante (se abre desde la columna Ramificación) ------------------------------------------------------------
// Es donde se trabaja con las presentaciones de un código: el material principal a la izquierda y, de él, todas las que salen; cada nodo trae sus datos y sus botones (historial, editar, agregar una que salga de él, quitar).
let treeModalEl = null;
let treeSku = null; // el código cuyo árbol está abierto
function nodeExtraHtml(r) {
    const act = (name, icon, label, danger) => `<button type="button" class="udm-nact${danger ? ' danger' : ''}" data-act="${name}" data-id="${r.id}" title="${esc(label)}" aria-label="${esc(label)}"><i class="bx ${icon}" aria-hidden="true"></i></button>`;
    const canCreate = Dashboard.canEditField(TABLE_KEY, CREATE_AUTH_COL, '');
    const buttons = [];
    if (r.virtual) { if (canCreate) buttons.push(act('capture', 'bx-edit', t('main.udmCapture'))); } else {
        buttons.push(act('hist', 'bx-history', t('main.changeHistoryTitleRecord')));
        if (!r.isBrand && canTouchAnyColumn()) buttons.push(act('edit', 'bx-edit', t('main.udmEdit')));
        if (canCreate) buttons.push(act('add', 'bx-plus', t('main.udmAddUnder')));
        if (Dashboard.hasColumnDeleteGrant(TABLE_KEY, DELETE_AUTH_COL)) buttons.push(act('del', 'bx-trash', t('admin.delete'), true));
    }
    let lines = '';
    if (!r.isBrand) {
        const types = (r.storageTypes || []).length ? r.storageTypes.map(typeName).join(' · ') : t('main.udmTipoNinguno');
        const ships = (r.shipTo || []).length ? r.shipTo.map(placeName).join(' · ') : t('main.udmEnviosNinguno');
        const stack = [r.unitsPerLayer && `TI ${r.unitsPerLayer}`, r.layersPerPallet && `HI ${r.layersPerPallet}`, r.maxStack && `${t('main.colUdmDMaxEstiba')} ${r.maxStack}`].filter(Boolean).join(' · ');
        lines = `<span class="udm-nx"><b>${esc(t('main.colUdmDTipo'))}:</b> ${esc(types)}</span><span class="udm-nx"><b>${esc(t('main.colUdmDEnvios'))}:</b> ${esc(ships)}</span>${stack ? `<span class="udm-nx">${esc(stack)}</span>` : ''}`;
    }
    return `${lines}${buttons.length ? `<div class="udm-nacts">${buttons.join('')}</div>` : ''}`;
}
function renderTreeModal() {
    if (!treeModalEl || treeModalEl.hidden || treeSku === null) return;
    const list = rows.filter((r) => r.skuItemId === treeSku); // con el material principal aunque todavía no se guarde (renglón virtual)
    if (!list.length) { treeModalEl.hidden = true; return; }
    const main = list.find((r) => r.level === 0) || list[0];
    $('udm-tree-title').textContent = t('main.udmTreeTitle', { sku: main.sku });
    $('udm-tree-body').innerHTML = Dashboard.udmChainHtml(list, { extra: nodeExtraHtml });
    $('udm-tree-note').textContent = list.every((r) => r.virtual) ? t('main.udmTreeNone') : '';
    $('udm-tree-add').hidden = !Dashboard.canEditField(TABLE_KEY, CREATE_AUTH_COL, '');
}
function openTreeModal(skuId) {
    if (!rows.some((r) => r.skuItemId === skuId)) return;
    if (!treeModalEl) {
        treeModalEl = document.createElement('div');
        treeModalEl.className = 'modal-overlay';
        treeModalEl.id = 'udm-tree-modal';
        treeModalEl.hidden = true;
        treeModalEl.innerHTML = `<div class="modal-panel udm-tree-panel" role="dialog" aria-modal="true" aria-labelledby="udm-tree-title">
            <h3 id="udm-tree-title"></h3>
            <div class="udm-chain udm-chain-float" id="udm-tree-body"></div>
            <div class="rel-foot"><span class="rel-muted" id="udm-tree-note"></span><button type="button" class="btn" id="udm-tree-add" data-help-key="udmNew"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.udmNew'))}</button><button type="button" class="btn btn-secondary" id="udm-tree-close">${esc(t('main.whClose'))}</button></div>
        </div>`;
        document.body.appendChild(treeModalEl);
        treeModalEl.addEventListener('click', (event) => {
            if (event.target === treeModalEl || event.target.closest('#udm-tree-close')) { treeModalEl.hidden = true; return; }
            if (event.target.closest('#udm-tree-add')) { // una presentación que sale del material principal (con el código ya elegido)
                const main = rows.find((r) => r.skuItemId === treeSku && r.level === 0);
                if (main) openForCode(main, main.virtual ? null : main);
                return;
            }
            const btn = event.target.closest('[data-act]');
            if (!btn) return;
            const r = rows.find((x) => String(x.id) === btn.dataset.id);
            if (!r) return;
            const act = btn.dataset.act;
            if (act === 'hist') Dashboard.openChangeHistory(TABLE_KEY, r.id);
            else if (act === 'edit') openDialog(r);
            else if (act === 'add') openForCode(r, r);
            else if (act === 'capture') openForCode(r, null);
            else if (act === 'del') deletePresentation(r);
        });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && treeModalEl && !treeModalEl.hidden && (!modalEl || modalEl.hidden)) treeModalEl.hidden = true; }, true); // en la fase de captura: si la ventana de editar está abierta, el Esc es de ella y no cierra el árbol
    }
    treeSku = skuId;
    treeModalEl.hidden = false;
    renderTreeModal();
    $('udm-tree-close').focus();
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
        if (el.id === 'udm-code') { f.sku = null; f.level = null; f.parentId = null; f.classification = ''; f.brandId = null; clearTimeout(searchTimer); searchTimer = setTimeout(searchCodes, 220); renderForm(); return; }
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
        // las casillas de «Envíos a»: «Todos» marca o quita todos los lugares activos; cada una se suma o se quita
        if (f && el.dataset && (el.dataset.ship || el.dataset.shipAll)) {
            const activeIds = places.filter((p) => p.active).map((p) => p.id);
            if (el.dataset.shipAll) f.shipTo = el.checked ? [...new Set([...f.shipTo, ...activeIds])].sort((a, z) => a - z) : f.shipTo.filter((id) => !activeIds.includes(id)); // quitar «Todos» deja solo los inactivos que ya traía
            else { const set = new Set(f.shipTo); const id = Number(el.dataset.ship); if (el.checked) set.add(id); else set.delete(id); f.shipTo = [...set].sort((a, z) => a - z); }
            renderForm();
            return;
        }
        if (f && el.dataset && el.dataset.parent) { f.parentId = el.value === '' ? null : Number(el.value); recompute(); renderForm(); return; } // «Sale de»
        if (f && el.dataset && el.dataset.cls) { // clasificación: Patente o Genérico (o sin marca)
            f.classification = el.value;
            const patente = rowsOfSku(f.sku.id).find((r) => r.isBrand && r.classification === 'patente');
            f.brandId = el.value === 'patente' && patente ? patente.brandId : null; // de una patente solo hay una marca por código
            f.parentId = null;
            recompute(); renderForm(); return;
        }
        if (f && el.dataset && el.dataset.brand) { f.brandId = el.value === '' ? null : Number(el.value); f.parentId = null; recompute(); renderForm(); return; } // marca
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
        rec: record, sku, level: record ? record.level : null, parentId: record ? record.parentId : null, pLevel: record ? record.packLevel : 0, noRoom: false,
        classification: record ? (record.classification || '') : '', brandId: record ? (record.brandId || null) : null,
        uom: record ? record.uom : '', contains: record && record.contains != null ? record.contains : '', shape: record ? record.shape : 'rectangular',
        length: record ? record.length : '', width: record ? record.width : '', height: record ? record.height : '', weightG: record ? record.weightG : '', canLay: record ? record.canLay : false,
        storageTypes: record ? [...(record.storageTypes || [])] : [],
        shipTo: record ? [...(record.shipTo || [])] : [],
        unitsPerLayer: record && record.unitsPerLayer ? record.unitsPerLayer : '', layersPerPallet: record && record.layersPerPallet ? record.layersPerPallet : '', maxStack: record && record.maxStack ? record.maxStack : '',
    };
    $('udm-title').textContent = t(record ? 'main.udmDialogEdit' : 'main.udmDialogNew');
    $('udm-code').value = record ? record.description : ''; // el código se ve solo por su descripción única
    $('udm-code').disabled = !!record;
    $('udm-results').hidden = true;
    if (!record) f.level = null;
    renderForm();
    modalEl.hidden = false;
    if (!record) $('udm-code').focus();
}
function closeDialog() { if (modalEl) modalEl.hidden = true; f = null; }
// Desde un renglón de la tabla: se abre «Nueva presentación» con el código ya elegido. parentRow = el renglón del que sale la nueva (null = la captura del material principal de un código sin presentaciones).
function openForCode(r, parentRow) {
    const main = rows.find((x) => x.skuItemId === r.skuItemId && x.level === 0) || r;
    openDialog(null);
    pickSku({ id: r.skuItemId, sku: r.sku, description: r.description, uom: main.uom || '', length: main.length || 0, width: main.width || 0, height: main.height || 0 });
    if (parentRow && !parentRow.virtual && f && f.level !== 0) {
        if (parentRow.isBrand) { f.classification = parentRow.classification; f.brandId = parentRow.brandId; f.parentId = null; } // directo de la marca
        else { f.classification = parentRow.classification || ''; f.brandId = parentRow.brandId || null; f.parentId = parentRow.id; }
        recompute();
        renderForm();
    }
    $('udm-save').focus();
}

async function searchCodes() {
    const q = $('udm-code').value.trim();
    const box = $('udm-results');
    if (!q || f.rec) { box.hidden = true; return; }
    try {
        const res = await fetch(`${SKU_API}?q=${encodeURIComponent(q)}&mode=${Dashboard.searchModeOf($('udm-code'))}`, { credentials: 'include' });
        if (!res.ok) return;
        const { skus } = await res.json();
        box.innerHTML = skus.length
            ? skus.map((s) => `<button type="button" class="rel-result" data-sku="${s.id}" data-sku-code="${esc(s.sku)}" data-desc="${esc(s.description)}" data-uom="${esc(s.uom)}" data-length="${esc(s.length)}" data-width="${esc(s.width)}" data-height="${esc(s.height)}"><b>${esc(s.description)}</b></button>`).join('')
            : `<span class="rel-muted">${esc(t('main.relNoMatches'))}</span>`;
        box.hidden = false;
    } catch (err) {
        console.error('Presentaciones de Distribución: code search failed', err);
    }
}
// Al elegir el código: si todavía no tiene presentaciones, la primera es el material principal; si ya tiene, la nueva sale (de partida) del material principal (sin marca) y se puede cambiar eligiendo clasificación y marca o «Sale de».
function pickSku(s) {
    f.sku = s;
    $('udm-code').value = s.description;
    $('udm-results').hidden = true;
    f.classification = '';
    f.brandId = null;
    f.parentId = null;
    f.storageTypes = [rowsOfSku(s.id).length ? 'empaque' : 'principal']; // de partida el de siempre; se puede cambiar abajo
    recompute();
    renderForm();
}
// De cuál renglón sale la nueva y en qué nivel queda. Con clasificación y marca sale de esa marca (si todavía no está en el código, se crea sola con esta presentación); sin ellas, de una presentación sin marca
// (de partida, el material principal). f.parentId = null con marca = directo de la marca. f.level: 0 = el material principal (la primera), null = ya no hay dónde ponerla, 1 = una presentación; f.pLevel = su nivel entre las presentaciones.
function recompute() {
    if (!f || !f.sku || f.rec) return;
    const have = rowsOfSku(f.sku.id);
    if (!have.length) { f.level = 0; f.pLevel = 0; f.noRoom = false; f.parentId = null; return; }
    const full = (r) => r.packLevel >= maxDepth || childCountOf(r.id) >= maxChildren;
    let room = true;
    if (f.classification && f.brandId) {
        const bn = have.find((r) => r.isBrand && r.brandId === f.brandId);
        if (bn) {
            const chosen = f.parentId ? have.find((r) => r.id === f.parentId && !r.isBrand && r.brandId === f.brandId) : null;
            if (!chosen) f.parentId = null;
            const parent = chosen || bn;
            room = !full(parent);
            f.pLevel = parent.packLevel + 1;
        } else { f.parentId = null; f.pLevel = 1; room = have.filter((r) => r.isBrand).length < maxChildren; }
    } else {
        const plain = have.filter((r) => !r.isBrand && !r.brandId);
        let chosen = f.parentId ? plain.find((r) => r.id === f.parentId) : null;
        if (!chosen) chosen = plain.find((r) => r.level === 0 && !full(r)) || plain.find((r) => !full(r)) || null;
        f.parentId = chosen ? chosen.id : null;
        room = !!chosen;
        f.pLevel = chosen ? chosen.packLevel + 1 : 1;
    }
    f.noRoom = !room;
    f.level = room ? 1 : null;
}

const canField = (col, value) => Dashboard.canEditField(TABLE_KEY, col, f.rec ? String(value ?? '') : '');
function fieldHtmlText(key, labelText, inner) {
    return `<div class="rel-fld"><label for="udm-f-${key}">${esc(labelText)}</label>${inner}</div>`;
}
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
    if (!f.rec && f.level === null) { info.textContent = t('main.udmNoParentRoom', { d: maxDepth, c: maxChildren }); box.innerHTML = ''; save.disabled = true; return; }
    const principal = f.level === 0;
    info.innerHTML = `<b>${esc(f.sku.description)}</b><span>${esc(levelName(f.rec ? f.pLevel : (f.level === 0 ? 0 : f.pLevel)))}${principal ? ` · ${esc(t('main.udmFromArticleLong'))}` : ''}</span>`;
    const dis = (col, key) => (canField(col, f.rec ? f.rec[key] : '') ? '' : ' disabled');
    const shapeSel = `<select id="udm-f-shape" data-k="shape"${dis(COLS.shape, 'shape')}><option value="rectangular"${f.shape === 'rectangular' ? ' selected' : ''}>${esc(t('main.pkRect'))}</option><option value="cilindrica"${f.shape === 'cilindrica' ? ' selected' : ''}>${esc(t('main.pkCyl'))}</option></select>`;
    const layBox = `<label class="udm-check"><input type="checkbox" id="udm-f-canLay" data-k="canLay"${f.canLay ? ' checked' : ''}${dis(COLS.canLay, 'canLay')}> ${esc(t('main.colUdmDAcostar'))}</label>`;
    const typesDis = dis(COLS.storageTypes, 'storageTypes');
    const shipDis = dis(COLS.shipTo, 'shipTo');
    // «Envíos a»: los lugares activos del catálogo Lugares de Envío (más los que la presentación ya traía aunque hayan quedado inactivos), con «Todos» arriba
    const shipChoices = places.filter((p) => p.active || f.shipTo.includes(p.id));
    const shipActive = places.filter((p) => p.active);
    const shipField = `<div class="rel-fld" data-help-key="udmEnvios"><label>${esc(t('main.colUdmDEnvios'))}</label>${shipChoices.length ? `<div class="udm-types"><label class="udm-check udm-check-all"><input type="checkbox" data-ship-all="1"${shipActive.length && shipActive.every((p) => f.shipTo.includes(p.id)) ? ' checked' : ''}${shipDis}> <b>${esc(t('main.udmEnviosTodos'))}</b></label>${shipChoices.map((p) => `<label class="udm-check"><input type="checkbox" data-ship="${p.id}"${f.shipTo.includes(p.id) ? ' checked' : ''}${shipDis}> ${esc(p.name)}${p.active ? '' : ' ·'}</label>`).join('')}</div>` : `<span class="rel-muted">${esc(t('main.udmEnviosVacio'))}</span>`}</div>`;
    const intInput = (key) => `<input type="number" id="udm-f-${key}" data-k="${key}" step="1" min="0" value="${esc(f[key])}"${dis(COLS[key], key)}>`;
    const estibaField = `<div class="rel-three" data-help-key="udmEstiba">${fieldHtml('unitsPerLayer', 'main.colUdmDCantidadCama', intInput('unitsPerLayer'))}${fieldHtml('layersPerPallet', 'main.colUdmDCamasPallet', intInput('layersPerPallet'))}${fieldHtml('maxStack', 'main.colUdmDMaxEstiba', intInput('maxStack'))}</div>`;
    const typesField = `<div class="rel-fld" data-help-key="udmTipo"><label>${esc(t('main.colUdmDTipo'))}</label><div class="udm-types"><label class="udm-check udm-check-all"><input type="checkbox" data-type-all="1"${STORAGE_KEYS.every((k) => f.storageTypes.includes(k)) ? ' checked' : ''}${typesDis}> <b>${esc(t('main.udmTiposTodos'))}</b></label>${STORAGE_KEYS.map((k) => `<label class="udm-check"><input type="checkbox" data-type="${k}"${f.storageTypes.includes(k) ? ' checked' : ''}${typesDis}> ${esc(typeName(k))}</label>`).join('')}</div></div>`;
    if (principal) {
        box.innerHTML = `<div class="rel-two">${fieldHtml('shape', 'main.colUdmDForma', shapeSel)}<div class="rel-fld"><label>&nbsp;</label>${layBox}</div></div>
            <div class="rel-muted">${esc(t('main.udmMainMeasures', { uom: f.sku.uom || '—', l: fmt(f.sku.length) || '—', w: fmt(f.sku.width) || '—', h: fmt(f.sku.height) || '—' }))}</div>
            ${typesField}
            ${shipField}
            ${estibaField}`;
        save.disabled = false;
        return;
    }
    const prev = have.find((r) => r.id === f.parentId);
    const prevName = prev ? (prev.isBrand ? t('main.udmDirectoMarca', { b: prev.name }) : (prev.name || prev.uom || rowLevelName(prev))) : '';
    // Clasificación y marca (opcionales): Patente o Genérico y la marca del catálogo; de una patente solo una marca por código, de genéricos las que sean. Con marcas, todas las presentaciones del código van en una marca.
    const brandNodes = have.filter((r) => r.isBrand);
    const usesBrands = brandNodes.length > 0;
    const hasDirect = have.some((r) => !r.isBrand && r.depth === 1 && !r.brandId); // ya tiene presentaciones sin marca (salen directo del principal)
    const patente = brandNodes.find((r) => r.classification === 'patente');
    const clsOff = hasDirect || !Dashboard.canEditField(TABLE_KEY, COLS.classification, '');
    const brandOff = !Dashboard.canEditField(TABLE_KEY, COLS.brandId, '');
    const choices = [...brands, ...brandNodes.filter((b) => !brands.some((x) => x.id === b.brandId)).map((b) => ({ id: b.brandId, name: b.name }))];
    const clsSel = `<select id="udm-f-cls" data-cls="1"${clsOff ? ' disabled' : ''}><option value="">${esc(t(usesBrands ? 'main.udmElige' : 'main.udmSinMarca'))}</option><option value="patente"${f.classification === 'patente' ? ' selected' : ''}>${esc(claseName('patente'))}</option><option value="generico"${f.classification === 'generico' ? ' selected' : ''}>${esc(claseName('generico'))}</option></select>`;
    const brandSel = `<select id="udm-f-brand" data-brand="1"${brandOff || !f.classification ? ' disabled' : ''}><option value="">${esc(t('main.articleTypeSelect'))}</option>${choices.map((b) => {
        const used = brandNodes.find((r) => r.brandId === b.id);
        const off = (f.classification === 'patente' && patente && patente.brandId !== b.id) || (f.classification === 'generico' && patente && patente.brandId === b.id) || (used && used.classification !== f.classification);
        return `<option value="${b.id}"${b.id === f.brandId ? ' selected' : ''}${off && b.id !== f.brandId ? ' disabled' : ''}>${esc(b.name)}</option>`;
    }).join('')}</select>`;
    const brandHint = hasDirect ? t('main.udmMarcaMezcla') : (!choices.length ? t('main.udmMarcasVacio') : '');
    const brandFields = f.rec
        ? (f.brandId ? `<div class="rel-two"><div class="rel-fld"><label>${esc(t('main.colUdmDClasificacion'))}</label><div class="udm-from">${esc(claseName(f.classification))}</div></div><div class="rel-fld"><label>${esc(t('main.colUdmDMarca'))}</label><div class="udm-from">${esc((have.find((r) => r.isBrand && r.brandId === f.brandId) || {}).name || '')}</div></div></div>` : '')
        : `<div class="rel-two"><div class="rel-fld" data-help-key="udmClasificacion"><label for="udm-f-cls">${esc(t('main.colUdmDClasificacion'))}</label>${clsSel}</div><div class="rel-fld" data-help-key="udmMarca"><label for="udm-f-brand">${esc(t('main.colUdmDMarca'))}</label>${brandSel}</div></div>${brandHint ? `<div class="rel-muted">${esc(brandHint)}</div>` : ''}`;
    // «Sale de»: con marca, directo de la marca o de una presentación de esa marca; sin marca, cualquiera de las que no tienen marca (en el orden del árbol); se quitan las que ya tienen el máximo de ramificaciones o están en el último nivel
    const optFull = (r) => r.packLevel >= maxDepth || childCountOf(r.id) >= maxChildren;
    const brandName = (choices.find((b) => b.id === f.brandId) || {}).name || '';
    const withBrand = !!(f.classification && f.brandId);
    const bnode = withBrand ? have.find((r) => r.isBrand && r.brandId === f.brandId) : null;
    const parentRows = withBrand ? have.filter((r) => !r.isBrand && r.brandId === f.brandId) : have.filter((r) => !r.isBrand && !r.brandId);
    const parentOpts = (withBrand ? `<option value=""${f.parentId === null ? ' selected' : ''}${bnode && optFull(bnode) ? ' disabled' : ''}>${esc(t('main.udmDirectoMarca', { b: brandName }))}</option>` : '')
        + parentRows.map((r) => `<option value="${r.id}"${r.id === f.parentId ? ' selected' : ''}${optFull(r) && r.id !== f.parentId ? ' disabled' : ''}>${'\u00a0\u00a0'.repeat(r.packLevel)}${r.packLevel ? '└ ' : ''}${esc(rowLevelName(r))} · ${esc(r.name || r.uom)}</option>`).join('');
    // de cuál UDM viene (para decir cuántas lleva y cómo queda): la unidad en la que se cuenta «cuántas lleva» es la de la UDM elegida; si sale directo de la marca o del principal, la unidad principal del producto
    const countUnit = (prev && !prev.isBrand) ? (prev.name || prev.uom || rowLevelName(prev)) : mainUomOf(f.sku.id);
    const parentField = f.rec
        ? `<div class="rel-fld"><label>${esc(t('main.udmSaleDe'))}</label><div class="udm-from">${esc(prevName)}</div></div>`
        : `<div class="rel-fld" data-help-key="udmSaleDe"><label for="udm-f-parent">${esc(t('main.udmSaleDeAdd'))}</label><select id="udm-f-parent" data-parent="1">${parentOpts}</select><span class="rel-muted">${esc(t('main.udmQuedaComo', { l: levelName(f.pLevel) }))}</span></div>`;
    const uomOptions = [...new Set([...(f.uom ? [f.uom] : []), ...uoms])];
    const uomSel = `<select id="udm-f-uom" data-k="uom"${dis(COLS.uom, 'uom')}><option value="">${esc(t('main.articleTypeSelect'))}</option>${uomOptions.map((u) => `<option value="${esc(u)}"${u === f.uom ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select>`;
    const num = (key, col, step) => `<input type="number" id="udm-f-${key}" data-k="${key}" step="${step || 'any'}" min="0" value="${esc(f[key])}"${dis(col, key)}>`;
    const cyl = f.shape === 'cilindrica';
    box.innerHTML = `${brandFields}${parentField}
        <div class="rel-two">${fieldHtml('uom', 'main.colUdmDUnidad', uomSel)}${fieldHtmlText('contains', t('main.udmContainsDyn', { p: countUnit }), num('contains', COLS.contains, '1'))}</div>
        <div class="rel-muted" id="udm-equiv"></div>
        <div class="rel-two">${fieldHtml('shape', 'main.colUdmDForma', shapeSel)}<div class="rel-fld"><label>&nbsp;</label>${layBox}</div></div>
        <div class="rel-three">${fieldHtml('length', 'main.colUdmDLargo', num('length', COLS.length))}${cyl ? '<div class="rel-fld"><label>&nbsp;</label><span class="rel-muted">= Ø</span></div>' : fieldHtml('width', 'main.colUdmDAncho', num('width', COLS.width))}${fieldHtml('height', 'main.colUdmDAlto', num('height', COLS.height))}</div>
        ${fieldHtml('weightG', 'main.colUdmDPeso', num('weightG', COLS.weightG), 'main.udmWeightHint')}
        ${typesField}
        ${shipField}
        ${estibaField}`;
    $('udm-fields').dataset.prev = prevName;
    updateEquivalence();
    // con marcas, la presentación va en una marca: sin elegirla no se guarda
    save.disabled = !f.rec && ((usesBrands && !f.classification) || (!!f.classification && !f.brandId));
}
// «Equivale a»: cuántas unidades principales trae esta presentación (lo que contiene × lo que equivale la de abajo).
function updateEquivalence() {
    const el = $('udm-equiv');
    if (!el || !f || !f.sku || f.level === 0) return;
    const prev = rowsOfSku(f.sku.id).find((r) => r.id === f.parentId);
    const base = prev && !prev.isBrand ? prev : null; // la marca no multiplica: lo que sale directo de ella (o del principal) cuenta unidades principales
    const n = Number(f.contains);
    el.textContent = Number.isInteger(n) && n >= 1 ? t('main.udmEquiv', { n: n * (base ? base.equivalent : 1), u: mainUomOf(f.sku.id), c: n, p: base ? (base.name || base.uom || rowLevelName(base)) : mainUomOf(f.sku.id) }) : '';
}

async function save() {
    if (!f || !f.sku) return;
    const principal = f.level === 0;
    const estibaBody = { unitsPerLayer: f.unitsPerLayer === '' ? 0 : Number(f.unitsPerLayer), layersPerPallet: f.layersPerPallet === '' ? 0 : Number(f.layersPerPallet), maxStack: f.maxStack === '' ? 0 : Number(f.maxStack) };
    const body = principal ? { shape: f.shape, canLay: !!f.canLay, storageTypes: f.storageTypes.join(','), shipTo: f.shipTo.join(','), ...estibaBody } : {
        uom: f.uom, contains: f.contains === '' ? null : Number(f.contains), shape: f.shape, length: f.length === '' ? null : Number(f.length),
        width: f.shape === 'cilindrica' ? (f.length === '' ? null : Number(f.length)) : (f.width === '' ? null : Number(f.width)), height: f.height === '' ? null : Number(f.height),
        weightG: f.weightG === '' ? null : Number(f.weightG), canLay: !!f.canLay, storageTypes: f.storageTypes.join(','), shipTo: f.shipTo.join(','), ...estibaBody,
    };
    let method = 'POST';
    let url = API;
    let payload = { skuItemId: f.sku.id, ...(f.level >= 1 && f.parentId != null ? { parentId: f.parentId } : {}), ...(f.level >= 1 && f.classification && f.brandId ? { classification: f.classification, brandId: f.brandId } : {}), ...body };
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
        const savedSku = f.sku.id;
        closeDialog();
        await refreshCode(savedSku);
    } catch (err) {
        console.error('Presentaciones de Distribución: failed to save', err);
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
        await refreshCode(r.skuItemId);
    } catch (err) {
        console.error('Presentaciones de Distribución: failed to delete', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
})();
