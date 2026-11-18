// ---------------------------------------------------------------------------
// TI › Operaciones TI › Operaciones › Habilitación de Códigos: TI ve TODOS los códigos de Alta Artículos y decide DÓNDE vale cada uno: en qué departamento, área, sitio y centro de costos (Sitio > Centro de costos: un sitio puede tener varios centros).
// Cada renglón trae sus habilitaciones en forma de resumen («C. Distribución · todos los sitios», «Punto Venta · 5 de 7 sitios + 1 centro»); al tocar el renglón (o su botón) se abre una ventana con la matriz Área × (Sitio y sus centros). Arriba de la tabla, «Habilitar lo
// que se ve…» aplica la misma habilitación (o la quita) a todos los códigos de la lista filtrada, para habilitar muchos de una vez. Cada sitio verá solo lo habilitado; aquí se ve todo. Todo cambio queda en el historial del código.
// Los renglones salen del servidor (GET /api/business/sku-enablements) y se dibujan por tandas (con miles de códigos no se congela la pantalla).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'habilitacion-codigos';
const API = '/api/business/sku-enablements';
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

let codes = []; // [{ id, sku, upc, description, status, enabled: [{ department, area, siteCode, costCenterId }], ...columnas de Control Interno }]
let options = { areas: [], sites: [] }; // las áreas reales de los departamentos contratados y los sitios del cliente, cada uno con sus centros: [{ code, sucursal, centers: [{ id, code, name }] }]
let canEdit = false;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Habilitación de Códigos failed to initialize:', err);
    }
})();

// ---- nombres ---------------------------------------------------------------------------------------------------------------------------
function deptLabel(key) {
    try {
        const d = DEPARTMENTS.find((x) => x.key === key);
        return d ? Dashboard.t(d.labelKey) : key;
    } catch { return key; }
}
const areaOf = (department, area) => options.areas.find((a) => a.department === department && a.area === area);
const areaLabel = (department, area) => { const a = areaOf(department, area); return a && a.labelKey ? Dashboard.t(a.labelKey) : area; };
// El nombre del sitio es su sucursal, igual que en el selector de la barra de arriba.
const siteLabel = (site) => (site.sucursal ? `${site.code} - ${site.sucursal}` : site.code);
const siteByCode = (code) => options.sites.find((s) => s.code === code);
const siteOfCenter = (id) => options.sites.find((s) => s.centers.some((c) => c.id === id));
// Una habilitación de un centro en un sitio que solo tiene ese centro es lo mismo que el sitio completo: así se muestra y se guarda.
function normalizeTarget(r) {
    if (r.siteCode === '') return { all: true };
    const site = siteByCode(r.siteCode);
    if (r.costCenterId > 0 && site && site.centers.length > 1) return { center: r.costCenterId };
    return { site: r.siteCode };
}

// Lo habilitado de un código, agrupado por área: [{ department, area, all, sites: Set (sitios completos), centers: Set (centros sueltos) }] en el orden de las áreas del cliente.
function groupEnabled(list) {
    const by = new Map();
    (list || []).forEach((r) => {
        const key = `${r.department}/${r.area}`;
        if (!by.has(key)) by.set(key, { department: r.department, area: r.area, all: false, sites: new Set(), centers: new Set() });
        const g = by.get(key);
        const target = normalizeTarget(r);
        if (target.all) g.all = true; else if (target.center) g.centers.add(target.center); else g.sites.add(target.site);
    });
    const order = options.areas.map((a) => `${a.department}/${a.area}`);
    return [...by.values()].sort((a, b) => {
        const ia = order.indexOf(`${a.department}/${a.area}`); const ib = order.indexOf(`${b.department}/${b.area}`);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
}
function chipText(g) {
    const parts = [];
    if (g.all) parts.push(t('main.habAllSites'));
    else {
        if (g.sites.size) parts.push(t('main.habSitesCount', { n: g.sites.size, total: options.sites.length }));
        if (g.centers.size) parts.push(t(g.centers.size === 1 ? 'main.habCenter1' : 'main.habCentersN', { n: g.centers.size }));
    }
    return `${areaLabel(g.department, g.area)} · ${parts.join(' + ')}`;
}

// ---- tabla --------------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function enabledCell(code) {
    const td = document.createElement('td');
    td.dataset.col = 'colHabHabilitado';
    const groups = groupEnabled(code.enabled);
    td.innerHTML = groups.length
        ? `<div class="hab-chips">${groups.map((g) => `<span class="hab-chip">${esc(chipText(g))}</span>`).join('')}</div>`
        : `<span class="hab-chip none">${esc(t('main.habNone'))}</span>`;
    if (canEdit) { td.classList.add('hab-click'); td.addEventListener('click', () => openModal({ mode: 'one', code })); }
    return td;
}
function actionsCell(code) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'admin-icon-btn';
    edit.setAttribute('data-help-key', 'habMatriz');
    edit.setAttribute('aria-label', t('main.habEditOpen'));
    edit.title = t('main.habEditOpen');
    edit.innerHTML = `<i class="bx ${canEdit ? 'bx-check-shield' : 'bx-show'}" aria-hidden="true"></i>`;
    edit.addEventListener('click', () => openModal({ mode: 'one', code }));
    td.appendChild(edit);
    const history = document.createElement('button');
    history.type = 'button';
    history.className = 'admin-icon-btn';
    history.setAttribute('data-help-key', 'changeHistory');
    history.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
    history.title = Dashboard.t('main.changeHistoryTitleRecord');
    history.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    history.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, code.id));
    td.appendChild(history);
    return td;
}
function buildRow(code) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(code.id);
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, code[key], 'col-system')),
        cell('colCatRegistroUnico', code.registroUnico, 'col-system'),
        cell('colHabSku', code.sku), cell('colHabDescripcion', code.description), cell('colHabUpc', code.upc),
        enabledCell(code),
        cell('colHabEstatus', t(code.status === 'inactive' ? 'main.habInactive' : 'main.habActive')),
        actionsCell(code),
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

// La pantalla lista TODOS los códigos desde el inicio: se dibujan los primeros al entrar y el resto sale al bajar (o con «Mostrar más» / «Mostrar todos»). Todo lo que llegó del servidor queda en memoria: la búsqueda de texto trabaja
// sobre esos datos y no sobre los renglones dibujados, y lo que lee todas las filas del DOM (ordenar o filtrar por columna) pide primero dibujar el resto (Dashboard.registerPartialTable).
const FIRST_ROWS = 100; // los que se dibujan al entrar
const NEXT_ROWS = 200; // los que se agregan al bajar o con «Mostrar más»
let codeView = []; // los que cumplen la búsqueda de texto (todos, si no hay búsqueda)
let codeDrawn = 0; // cuántos de codeView ya están dibujados
let codeDrawing = null; // la tanda que se está dibujando (promesa)
let codeToken = 0; // una recarga o una búsqueda nueva cancela la tanda anterior
let fetchToken = 0;
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function indexSearch(code) {
    code._search = [code.sku, code.upc, code.description, ...groupEnabled(code.enabled).map(chipText)].filter(Boolean).join(' ').toLowerCase();
}
function computeView() {
    const text = searchText();
    codeView = text ? codes.filter((c) => SearchSyntax.matches('contains', text, c._search || '')) : codes.slice();
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
    updateBulkButton();
    if (!codeView.length) { ensureEmptyState(); updateMoreBar(); return Promise.resolve(true); }
    return drawCodeRows(FIRST_ROWS);
}
const tableToolbar = () => document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling || null;
// «Mostrando X de Y» con los botones para dibujar más; solo sale cuando falta algo por dibujar.
function updateMoreBar() {
    const toolbar = tableToolbar();
    if (!toolbar) return;
    let bar = toolbar.querySelector('.sku-more-bar');
    if (codeDrawn >= codeView.length) { if (bar) bar.remove(); return; }
    if (!bar) {
        bar = document.createElement('span');
        bar.className = 'sku-more-bar tpl-muted';
        bar.innerHTML = '<span class="sku-more-text" aria-live="polite"></span><button type="button" class="btn btn-secondary sku-more-btn" data-hab-more></button><button type="button" class="btn btn-secondary sku-more-btn" data-hab-all></button>';
        bar.querySelector('[data-hab-more]').addEventListener('click', () => drawCodeRows(NEXT_ROWS));
        bar.querySelector('[data-hab-all]').addEventListener('click', () => drawAllCodeRows());
        toolbar.prepend(bar);
    }
    bar.querySelector('.sku-more-text').textContent = Dashboard.t('main.skuMostrando').replace('{shown}', String(codeDrawn)).replace('{total}', String(codeView.length));
    bar.querySelector('[data-hab-more]').textContent = Dashboard.t('main.skuMostrarMas');
    bar.querySelector('[data-hab-all]').textContent = Dashboard.t('main.skuMostrarTodos');
}
// «Habilitar lo que se ve…»: aplica una habilitación (o la quita) a todos los códigos de la lista filtrada. Solo sale para quien puede habilitar y cuando hay códigos en la lista.
function updateBulkButton() {
    const toolbar = tableToolbar();
    if (!toolbar) return;
    let btn = toolbar.querySelector('.hab-bulk-btn');
    if (!canEdit || !codeView.length) { if (btn) btn.remove(); return; }
    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn hab-bulk-btn';
        btn.setAttribute('data-help-key', 'habMasivo');
        btn.addEventListener('click', () => { if (codeView.length) openModal({ mode: 'bulk', ids: codeView.map((c) => c.id) }); });
        toolbar.prepend(btn);
    }
    btn.textContent = `${t('main.habBulkOpen')} (${codeView.length})`;
}
// Al bajar casi hasta el final de lo dibujado, se dibujan más renglones.
function watchCodeScroll() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    if (!wrapper || wrapper.dataset.habScrollBound) return;
    wrapper.dataset.habScrollBound = '1';
    wrapper.addEventListener('scroll', () => {
        if (codeDrawing || codeDrawn >= codeView.length) return;
        if (wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 800) drawCodeRows(NEXT_ROWS);
    }, { passive: true });
}
async function refreshTable() {
    const token = ++fetchToken;
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== fetchToken) return; // llegó otra recarga después de esta
        options = { areas: body.areas || [], sites: body.sites || [] };
        canEdit = !!body.canEdit;
        codes = body.codes || [];
        codes.forEach(indexSearch);
        computeView();
        watchCodeScroll();
        const finished = await resetCodeRows();
        if (finished && token === fetchToken && Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
    } catch (err) {
        console.error('Habilitación de Códigos: failed to load records', err);
        Dashboard.showToast(t('main.habLoadError'), 'error');
    }
}
function applyFilters() {
    computeView();
    resetCodeRows().then((finished) => { if (finished && Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY); });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);
if (window.Dashboard && Dashboard.registerPartialTable) Dashboard.registerPartialTable(TABLE_KEY, { isComplete: () => codeDrawn >= codeView.length, loadAll: drawAllCodeRows });

// ---- la ventana: la matriz Área × (Sitio y sus centros) ------------------------------------------------------------------------------------------------------------------
// Un código (mode 'one'): sus habilitaciones tal cual están, para dejarlas como queden. Varios (mode 'bulk', la lista filtrada): se elige «Habilitar en lo marcado» o «Quitar de lo marcado» y se marcan los lugares.
// Por cada área: «Todos los sitios» (vale también para los que se creen después), un sitio completo (todos sus centros, también los nuevos) o centros sueltos de un sitio que tiene varios. Al quitar «Todos» quedan marcados todos los
// sitios de hoy, y al quitar un sitio completo quedan marcados sus centros de hoy, para ir quitando los que no.
let modalEl = null;
let modal = null; // { mode, code?, ids?, grid: Map('departamento/área' -> { all, sites: Set, centers: Set }), action: 'add' | 'remove' }
const gridKey = (a) => `${a.department}/${a.area}`;
function buildGrid(list) {
    const grid = new Map();
    options.areas.forEach((a) => grid.set(gridKey(a), { all: false, sites: new Set(), centers: new Set() }));
    (list || []).forEach((r) => {
        const g = grid.get(`${r.department}/${r.area}`);
        if (!g) return;
        const target = normalizeTarget(r);
        if (target.all) g.all = true; else if (target.center) g.centers.add(target.center); else g.sites.add(target.site);
    });
    return grid;
}
function gridRows() {
    const rows = [];
    options.areas.forEach((a) => {
        const g = modal.grid.get(gridKey(a));
        if (!g) return;
        if (g.all) { rows.push({ department: a.department, area: a.area, siteCode: '', costCenterId: 0 }); return; }
        g.sites.forEach((code) => rows.push({ department: a.department, area: a.area, siteCode: code, costCenterId: 0 }));
        g.centers.forEach((id) => { const site = siteOfCenter(id); if (site) rows.push({ department: a.department, area: a.area, siteCode: site.code, costCenterId: id }); });
    });
    return rows;
}
// Las columnas: un sitio con un solo centro es UNA columna (el sitio completo); uno con varios trae su columna «Todo el sitio» y una por cada centro.
function matrixColumns() {
    const cols = [];
    options.sites.forEach((s) => {
        const multi = s.centers.length > 1;
        cols.push({ kind: 'site', site: s, multi });
        if (multi) s.centers.forEach((c) => cols.push({ kind: 'center', site: s, center: c, multi }));
    });
    return cols;
}
function columnHead(col) {
    if (col.kind === 'center') {
        const full = `${siteLabel(col.site)} › ${col.center.name || col.center.code}`;
        return `<th class="hab-col-center" title="${esc(full)}"><span class="hab-site-code">${esc(col.center.name || col.center.code)}</span><span class="hab-site-name">${esc(col.site.code)}</span></th>`;
    }
    const name = col.multi ? t('main.habWholeSite') : (col.site.sucursal || (col.site.centers[0] && col.site.centers[0].name) || '');
    return `<th class="hab-col-site${col.multi ? ' hab-site-start' : ''}" title="${esc(siteLabel(col.site))}"><span class="hab-site-code">${esc(col.site.code)}</span><span class="hab-site-name">${esc(name)}</span></th>`;
}
function columnCell(col, key, g, readOnly) {
    if (col.kind === 'center') {
        const covered = g.all || g.sites.has(col.site.code);
        const on = covered || g.centers.has(col.center.id);
        const full = `${siteLabel(col.site)} › ${col.center.name || col.center.code}`;
        return `<td class="hab-col-center"><input type="checkbox" data-hab-center="${esc(key)}" data-center="${col.center.id}" data-site="${esc(col.site.code)}"${on ? ' checked' : ''}${covered || readOnly ? ' disabled' : ''} aria-label="${esc(full)}"></td>`;
    }
    return `<td class="${col.multi ? 'hab-site-start' : ''}"><input type="checkbox" data-hab-site="${esc(key)}" data-site="${esc(col.site.code)}"${g.all || g.sites.has(col.site.code) ? ' checked' : ''}${g.all || readOnly ? ' disabled' : ''} aria-label="${esc(siteLabel(col.site))}"></td>`;
}
function renderMatrix() {
    const readOnly = !canEdit;
    const cols = matrixColumns();
    const head = `<thead><tr><th>${esc(t('main.habAreaCol'))}</th><th>${esc(t('main.habAllSitesNew'))}</th>${cols.map(columnHead).join('')}</tr></thead>`;
    let body = '';
    let lastDept = null;
    options.areas.forEach((a) => {
        if (a.department !== lastDept) {
            lastDept = a.department;
            body += `<tr class="hab-dept"><td colspan="${2 + cols.length}">${esc(deptLabel(a.department))}</td></tr>`;
        }
        const g = modal.grid.get(gridKey(a));
        const dis = readOnly ? ' disabled' : '';
        body += `<tr data-key="${esc(gridKey(a))}"><td>${esc(areaLabel(a.department, a.area))}</td>
            <td><input type="checkbox" data-hab-all="${esc(gridKey(a))}"${g.all ? ' checked' : ''}${dis} aria-label="${esc(t('main.habAllSites'))}"></td>
            ${cols.map((col) => columnCell(col, gridKey(a), g, readOnly)).join('')}</tr>`;
    });
    $('hab-table').innerHTML = `${head}<tbody>${body}</tbody>`;
}
function renderModal() {
    const bulk = modal.mode === 'bulk';
    $('hab-title').textContent = bulk ? t('main.habBulkTitle', { n: modal.ids.length }) : t('main.habEditTitle', { sku: modal.code.sku });
    $('hab-sub').textContent = bulk ? '' : (modal.code.description || '');
    $('hab-modes').hidden = !bulk;
    modalEl.querySelectorAll('input[name="hab-action"]').forEach((r) => { r.checked = r.value === modal.action; });
    const none = !options.areas.length;
    $('hab-none').hidden = !none;
    $('hab-wrap').hidden = none;
    if (!none) renderMatrix();
    const save = $('hab-save');
    save.hidden = !canEdit || none;
    save.textContent = bulk ? t('main.habApply', { n: modal.ids.length }) : t('main.habSave');
}
function openModal(state) {
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.className = 'modal-overlay';
        modalEl.id = 'hab-modal';
        modalEl.hidden = true;
        modalEl.innerHTML = `<div class="modal-panel hab-panel" role="dialog" aria-modal="true" aria-labelledby="hab-title">
            <h3 id="hab-title"></h3>
            <p class="admin-hint" id="hab-sub"></p>
            <div class="hab-modes" id="hab-modes" hidden>
                <label><input type="radio" name="hab-action" value="add"> <span id="hab-mode-add"></span></label>
                <label><input type="radio" name="hab-action" value="remove"> <span id="hab-mode-remove"></span></label>
            </div>
            <p class="admin-hint" id="hab-none" hidden></p>
            <div class="hab-wrap" id="hab-wrap" data-help-key="habMatriz"><table class="hab-table" id="hab-table"></table></div>
            <div class="admin-form-actions">
                <button type="button" class="btn" id="hab-save"></button>
                <button type="button" class="btn btn-secondary" id="hab-close"></button>
            </div>
        </div>`;
        document.body.appendChild(modalEl);
        modalEl.addEventListener('click', onModalClick);
        modalEl.addEventListener('change', onModalChange);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modalEl && !modalEl.hidden) modalEl.hidden = true; });
    }
    modal = { ...state, action: 'add', grid: buildGrid(state.mode === 'one' ? state.code.enabled : []) };
    $('hab-mode-add').textContent = t('main.habModeAdd');
    $('hab-mode-remove').textContent = t('main.habModeRemove');
    $('hab-none').textContent = t('main.habNoAreas');
    $('hab-close').textContent = t('main.habClose');
    renderModal();
    modalEl.hidden = false;
    $('hab-close').focus();
}
function onModalChange(event) {
    if (!modal) return;
    const el = event.target;
    if (el.name === 'hab-action') { modal.action = el.value; return; }
    const allKey = el.dataset.habAll;
    if (allKey) {
        const g = modal.grid.get(allKey);
        if (el.checked) { g.all = true; g.sites.clear(); g.centers.clear(); } else { g.all = false; g.sites = new Set(options.sites.map((s) => s.code)); }
        renderMatrix();
        return;
    }
    const siteKey = el.dataset.habSite;
    if (siteKey) {
        const g = modal.grid.get(siteKey);
        const site = siteByCode(el.dataset.site);
        if (el.checked) {
            g.sites.add(el.dataset.site);
            (site ? site.centers : []).forEach((c) => g.centers.delete(c.id)); // el sitio completo ya incluye a todos sus centros
        } else {
            g.sites.delete(el.dataset.site);
            if (site && site.centers.length > 1) site.centers.forEach((c) => g.centers.add(c.id)); // quedan marcados sus centros de hoy, para ir quitando los que no
        }
        renderMatrix();
        return;
    }
    const centerKey = el.dataset.habCenter;
    if (centerKey) {
        const g = modal.grid.get(centerKey);
        const id = Number(el.dataset.center);
        if (el.checked) g.centers.add(id); else g.centers.delete(id);
    }
}
async function onModalClick(event) {
    if (event.target === modalEl || event.target.closest('#hab-close')) { modalEl.hidden = true; return; }
    if (!event.target.closest('#hab-save') || !modal) return;
    const rows = gridRows();
    const save = $('hab-save');
    if (modal.mode === 'bulk' && !rows.length) { Dashboard.showToast(t('main.habPickSomething'), 'warning'); return; }
    save.disabled = true;
    try {
        if (modal.mode === 'one') {
            const res = await fetch(`${API}/${modal.code.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ rows }) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { Dashboard.showToast(body.message || t('main.habSaveError'), 'warning'); return; }
            const code = codes.find((c) => c.id === modal.code.id);
            if (code) {
                code.enabled = body.enabled || [];
                indexSearch(code);
                const tr = getTbody().querySelector(`tr[data-record-id="${code.id}"]`);
                if (tr) tr.replaceWith(buildRow(code));
            }
            modalEl.hidden = true;
            Dashboard.showToast(t('main.habSavedOk'), 'success');
        } else {
            const res = await fetch(`${API}/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ skuItemIds: modal.ids, mode: modal.action, rows }) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { Dashboard.showToast(body.message || t('main.habSaveError'), 'warning'); return; }
            modalEl.hidden = true;
            await refreshTable();
            Dashboard.showToast(body.changed ? t('main.habBulkDone', { changed: body.changed, total: body.total }) : t('main.habBulkNoChange'), body.changed ? 'success' : 'info');
        }
    } catch (err) {
        console.error('Habilitación de Códigos: failed to save', err);
        Dashboard.showToast(t('main.habSaveError'), 'error');
    } finally {
        save.disabled = false;
    }
}

})();
