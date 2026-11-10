// ---------------------------------------------------------------------------
// Catálogos > Presentaciones Distribución (C. Distribución): el CATÁLOGO, solo para ver, de lo que ya se registró en Operaciones > Presentaciones de Distribución: un renglón por código de Alta Artículos con su unidad de medida
// principal y la columna «Ramificación», que resume cuántas presentaciones tiene y, al tocarla, abre en una pantalla flotante el árbol completo (de cuál sale cada una, cuántas lleva, medidas, peso, para qué se usa, a dónde se
// envía y su estiba). Los códigos que todavía no tienen presentaciones salen como «Sin presentaciones». Aquí no se agrega ni se edita nada: eso se hace en Operaciones. Los renglones salen del servidor (GET
// /api/business/sku-distribution?catalog=1) y se dibujan por tandas (con miles de códigos no se congela la pantalla).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'presentaciones-distribucion';
const API = '/api/business/sku-distribution';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
// Tipo de almacenamiento de cada presentación (una, varias o todas): para qué se puede acomodar; solo las que tienen alguno se ofrecen al relacionar un código con una posición. El orden es el de la lista.
const STORAGE_KEYS = ['principal', 'original', 'almacenamiento', 'compra', 'empaque', 'pallet'];
const typeName = (k) => Dashboard.t(`main.storageType_${k}`);

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
        await refreshTable();
    } catch (err) {
        console.error('Presentaciones Distribución (catálogo) failed to initialize:', err);
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
        const res = await fetch(`${API}?catalog=1`, { credentials: 'include' });
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
        console.error('Presentaciones Distribución: failed to load records', err);
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
// El árbol del código, solo para verlo: el material principal a la izquierda y, de él, todas las presentaciones que salen; cada nodo trae sus datos (tipo, a dónde se envía y estiba). Se agrega y se edita en Operaciones.
let treeModalEl = null;
let treeSku = null; // el código cuyo árbol está abierto
function nodeExtraHtml(r) {
    if (r.isBrand) return '';
    const types = (r.storageTypes || []).length ? r.storageTypes.map(typeName).join(' · ') : t('main.udmTipoNinguno');
    const ships = (r.shipTo || []).length ? r.shipTo.map(placeName).join(' · ') : t('main.udmEnviosNinguno');
    const stack = [r.unitsPerLayer && `TI ${r.unitsPerLayer}`, r.layersPerPallet && `HI ${r.layersPerPallet}`, r.maxStack && `${t('main.colUdmDMaxEstiba')} ${r.maxStack}`].filter(Boolean).join(' · ');
    return `<span class="udm-nx"><b>${esc(t('main.colUdmDTipo'))}:</b> ${esc(types)}</span><span class="udm-nx"><b>${esc(t('main.colUdmDEnvios'))}:</b> ${esc(ships)}</span>${stack ? `<span class="udm-nx">${esc(stack)}</span>` : ''}`;
}
function renderTreeModal() {
    if (!treeModalEl || treeModalEl.hidden || treeSku === null) return;
    const list = rows.filter((r) => r.skuItemId === treeSku); // con el material principal aunque todavía no se guarde (renglón virtual)
    if (!list.length) { treeModalEl.hidden = true; return; }
    const main = list.find((r) => r.level === 0) || list[0];
    $('udm-tree-title').textContent = t('main.udmTreeTitle', { sku: main.sku });
    $('udm-tree-body').innerHTML = Dashboard.udmChainHtml(list, { extra: nodeExtraHtml });
    $('udm-tree-note').textContent = list.every((r) => r.virtual) ? t('main.udmTreeNone') : '';
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
            <div class="rel-foot"><span class="rel-muted" id="udm-tree-note"></span><button type="button" class="btn btn-secondary" id="udm-tree-close">${esc(t('main.whClose'))}</button></div>
        </div>`;
        document.body.appendChild(treeModalEl);
        treeModalEl.addEventListener('click', (event) => {
            if (event.target === treeModalEl || event.target.closest('#udm-tree-close')) { treeModalEl.hidden = true; return; }
        });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && treeModalEl && !treeModalEl.hidden) treeModalEl.hidden = true; });
    }
    treeSku = skuId;
    treeModalEl.hidden = false;
    renderTreeModal();
    $('udm-tree-close').focus();
}

})();
