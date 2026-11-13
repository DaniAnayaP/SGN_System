// ---------------------------------------------------------------------------
// Compra Pedido Manual (Operaciones > QR's, C. Distribución): lo que hay que COMPRAR de todos los pedidos que se hicieron con el QR del Pedido Manual.
//   - Arriba, los TOTALES POR CÓDIGO: una fila por código y presentación, con la cantidad que se pidió, lo que equivale en la unidad principal y en cuántos pedidos salió.
//   - Abajo, el DESGLOSE: de cada código, quién lo pidió (pedido, fecha y hora, solicitante, lugar que solicita, presentación, cantidad, equivale a, día requerido y estatus).
//   - Filtros: Pedido (uno o varios), Fecha desde–hasta (la fecha en que se hizo el pedido, en tu hora), Lugar que solicita (uno o varios) y Estatus del pedido (Todos, Pendiente, Parcial, Surtido).
//     Los filtros mandan sobre las dos tablas y sobre lo que se descarga: lo que se ve es lo que baja.
//   - Descargar PDF y Excel (con el permiso de cada botón): las dos partes, los totales y debajo el desglose (en Excel, en dos hojas).
// Los renglones salen del mismo servidor del Pedido Manual (GET /api/business/pedido-manual, uno por artículo pedido) y aquí se juntan por pedido; solo se ven los pedidos de los centros de costos marcados arriba.
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/pedido-manual';
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const localeOf = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const STATUS_FILTERS = ['all', 'pending', 'partial', 'supplied'];

let lines = []; // los renglones (un artículo pedido) de los centros de costos marcados
let orders = []; // los pedidos juntos: { orderId, folio, name, placeName, requestedAt, lines: [] } del más viejo al más nuevo
let canPdf = false;
let canExcel = false;
let truncated = false;
let maxLines = 0;
const filters = { orders: null, from: '', to: '', places: null, status: 'all' }; // null = todos

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        buildPage();
        await load();
    } catch (err) {
        console.error('Compra Pedido Manual failed to initialize:', err);
    }
})();
document.addEventListener('sgn:cost-centers-changed', () => { load(); });

// ---- textos y formatos (los mismos de la pantalla Pedido Manual) -------------------------------------------------------------------------------
const quantityText = (q) => Number(q).toLocaleString(localeOf(), { maximumFractionDigits: 3 });
const equivOf = (l) => Math.round(Number(l.quantity) * (Number(l.packPieces) > 0 ? Number(l.packPieces) : 1) * 1000) / 1000;
const whenText = (iso) => (iso ? new Date(iso).toLocaleString(localeOf(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
function needByText(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return t('main.pmLoAntesPosible');
    const d = new Date(`${day}T00:00:00Z`);
    const mon = new Intl.DateTimeFormat(localeOf(), { timeZone: 'UTC', month: 'short' }).format(d).replace('.', '');
    return `${String(d.getUTCDate()).padStart(2, '0')}/${mon}/${d.getUTCFullYear()}`;
}
const statusText = (s) => t(`main.pmEstatus_${s}`);
// Pendiente si ningún artículo se surtió, Surtido si todos y Parcial si solo algunos.
const orderStatus = (o) => { const set = new Set(o.lines.map((l) => l.status)); return set.size === 1 ? [...set][0] : 'partial'; };
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = () => localDay(new Date().toISOString());
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

// ---- carga -------------------------------------------------------------------------------------------------------------------------------------------
async function load() {
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        canPdf = !!body.canBuyPdf;
        canExcel = !!body.canBuyExcel;
        truncated = !!body.truncated;
        maxLines = body.max || 0;
        const selected = Dashboard.getSelectedCostCenterIds();
        lines = (body.orders || []).filter((r) => !selected || !r.cc || selected.includes(r.cc));
        const map = new Map();
        lines.forEach((r) => {
            if (!map.has(r.orderId)) map.set(r.orderId, { orderId: r.orderId, folio: r.folio, name: r.name, placeName: r.placeName || '', requestedAt: r.requestedAt, lines: [] });
            map.get(r.orderId).lines.push(r);
        });
        orders = [...map.values()].sort((a, z) => a.orderId - z.orderId);
        orders.forEach((o) => o.lines.sort((a, z) => (a.lineNo || 0) - (z.lineNo || 0) || a.id - z.id));
        pedidoSel.setOptions(orders.slice().reverse().map((o) => ({ value: o.folio, label: `${o.folio} · ${o.name || '—'}` })));
        const places = [...new Set(orders.map((o) => o.placeName))].sort((a, z) => a.localeCompare(z, localeOf()));
        lugarSel.setOptions(places.map((p) => ({ value: p, label: p || t('main.cpSinLugar') })));
        pdfBtn.hidden = !canPdf;
        excelBtn.hidden = !canExcel;
        render();
    } catch (err) {
        console.error('Compra Pedido Manual: no se pudieron cargar los pedidos', err);
        Dashboard.showToast(t('admin.saveError'), 'error');
    }
}

// ---- filtros -----------------------------------------------------------------------------------------------------------------------------------------
// Una lista desplegable con casillas (uno, varios o Todos). selected = null: todos.
function makeMultiSelect(labelKey, helpKey) {
    const field = el('div', 'cp-field');
    const label = el('label', '', t(labelKey));
    const wrap = el('div', 'cp-multi');
    const btn = el('button', 'cp-box cp-multi-btn');
    btn.type = 'button';
    btn.setAttribute('data-help-key', helpKey);
    btn.setAttribute('aria-haspopup', 'listbox');
    const panel = el('div', 'cp-panel');
    panel.hidden = true;
    wrap.append(btn, panel);
    field.append(label, wrap);
    let options = [];
    let selected = null;
    let search = '';
    let onChange = () => {};
    const btnText = () => {
        if (selected === null) return t('main.cpTodosN', { n: options.length });
        if (selected.size === 1) { const only = options.find((o) => selected.has(o.value)); return only ? only.label : t('main.cpNdeM', { n: 1, m: options.length }); }
        return t('main.cpNdeM', { n: selected.size, m: options.length });
    };
    const refreshButton = () => { btn.textContent = btnText(); };
    function setSelected(next) {
        selected = next && next.size && next.size < options.length ? next : null; // todas las casillas = Todos
        refreshButton();
        renderPanel();
        onChange();
    }
    function renderPanel() {
        panel.innerHTML = '';
        const box = el('input', 'cp-search');
        box.type = 'search';
        box.placeholder = t('main.cpBuscar');
        box.value = search;
        box.addEventListener('input', () => { search = box.value; renderList(); });
        const all = el('label', 'cp-opt cp-opt-all');
        const allBox = el('input');
        allBox.type = 'checkbox';
        allBox.checked = selected === null;
        allBox.addEventListener('change', () => { setSelected(null); });
        all.append(allBox, el('span', '', t('main.cpTodos')));
        const list = el('div', 'cp-opts');
        function renderList() {
            list.innerHTML = '';
            const text = search.trim().toLowerCase();
            options.filter((o) => !text || o.label.toLowerCase().includes(text)).forEach((o) => {
                const row = el('label', 'cp-opt');
                const cb = el('input');
                cb.type = 'checkbox';
                // con «Todos» activo las demás casillas van sin marcar: al marcar una se elige solo esa (y las que se vayan sumando); sin ninguna marcada se regresa a «Todos»
                cb.checked = selected !== null && selected.has(o.value);
                cb.addEventListener('change', () => {
                    const set = selected === null ? new Set() : new Set(selected);
                    if (cb.checked) set.add(o.value); else set.delete(o.value);
                    setSelected(set.size ? set : null);
                });
                row.append(cb, el('span', '', o.label));
                list.appendChild(row);
            });
            if (!list.children.length) list.appendChild(el('div', 'cp-opt-empty', t('main.cpSinOpciones')));
        }
        panel.append(box, all, list);
        renderList();
    }
    btn.addEventListener('click', () => {
        const opening = panel.hidden;
        closePanels();
        panel.hidden = !opening;
        btn.setAttribute('aria-expanded', String(opening));
        if (opening) { search = ''; renderPanel(); panel.querySelector('.cp-search')?.focus(); }
    });
    panel._close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    panels.push(panel);
    return {
        field,
        get: () => selected,
        setOptions(next) {
            options = next;
            if (selected) { const keep = new Set([...selected].filter((v) => options.some((o) => o.value === v))); selected = keep.size ? keep : null; }
            refreshButton();
            if (!panel.hidden) renderPanel();
        },
        onChange(fn) { onChange = fn; },
    };
}
const panels = [];
function closePanels() { panels.forEach((p) => p._close && p._close()); }
document.addEventListener('click', (event) => { if (!event.target.closest('.cp-multi')) closePanels(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanels(); });

let pedidoSel;
let lugarSel;
let pdfBtn;
let excelBtn;
let totalsHost;
let detailHost;
let noteEl;
function dateField(labelKey, helpKey, onChange) {
    const field = el('div', 'cp-field');
    const id = `cp-${labelKey.split('.').pop()}`;
    const label = el('label', '', t(labelKey));
    label.htmlFor = id;
    const input = el('input', 'cp-box');
    input.type = 'date';
    input.id = id;
    input.setAttribute('data-help-key', helpKey);
    input.addEventListener('change', () => onChange(input.value));
    field.append(label, input);
    return field;
}
function buildPage() {
    const host = document.querySelector('.page-content');
    host.innerHTML = '';
    const root = el('div', 'cp');
    const bar = el('div', 'cp-filters');
    pedidoSel = makeMultiSelect('main.cpFiltroPedido', 'cpFiltroPedido');
    lugarSel = makeMultiSelect('main.cpFiltroLugar', 'cpFiltroLugar');
    pedidoSel.onChange(() => { filters.orders = pedidoSel.get(); render(); });
    lugarSel.onChange(() => { filters.places = lugarSel.get(); render(); });
    const statusField = el('div', 'cp-field');
    const statusLabel = el('label', '', t('main.cpFiltroEstatus'));
    statusLabel.htmlFor = 'cp-status';
    const statusSelect = el('select', 'cp-box');
    statusSelect.id = 'cp-status';
    statusSelect.setAttribute('data-help-key', 'cpFiltroEstatus');
    STATUS_FILTERS.forEach((s) => { const opt = el('option', '', s === 'all' ? t('main.cpTodos') : statusText(s)); opt.value = s; statusSelect.appendChild(opt); });
    statusSelect.addEventListener('change', () => { filters.status = statusSelect.value; render(); });
    statusField.append(statusLabel, statusSelect);
    const buttons = el('div', 'cp-downloads');
    pdfBtn = el('button', 'btn');
    pdfBtn.type = 'button';
    pdfBtn.setAttribute('data-help-key', 'cpPdf');
    pdfBtn.innerHTML = `<i class="bx bxs-file-pdf" aria-hidden="true"></i> ${t('main.colCpPdf')}`;
    pdfBtn.hidden = true;
    pdfBtn.addEventListener('click', () => download('pdf'));
    excelBtn = el('button', 'btn');
    excelBtn.type = 'button';
    excelBtn.setAttribute('data-help-key', 'cpExcel');
    excelBtn.innerHTML = `<i class="bx bx-spreadsheet" aria-hidden="true"></i> ${t('main.colCpExcel')}`;
    excelBtn.hidden = true;
    excelBtn.addEventListener('click', () => download('xlsx'));
    buttons.append(pdfBtn, excelBtn);
    bar.append(
        pedidoSel.field,
        dateField('main.cpFiltroDesde', 'cpFiltroDesde', (v) => { filters.from = v; render(); }),
        dateField('main.cpFiltroHasta', 'cpFiltroHasta', (v) => { filters.to = v; render(); }),
        lugarSel.field, statusField, buttons,
    );
    noteEl = el('p', 'cp-note');
    noteEl.hidden = true;
    const totalsTitle = el('h3', 'cp-title', t('main.cpTotalesTitulo'));
    totalsTitle.setAttribute('data-help-key', 'cpTotales');
    totalsHost = el('div', 'cp-scroll');
    const detailTitle = el('h3', 'cp-title', t('main.cpDesgloseTitulo'));
    detailTitle.setAttribute('data-help-key', 'cpDesglose');
    detailHost = el('div', 'cp-scroll');
    root.append(bar, noteEl, totalsTitle, totalsHost, detailTitle, detailHost);
    host.appendChild(root);
}

// ---- lo que se ve: los pedidos que pasan los filtros -------------------------------------------------------------------------------------
function visibleOrders() {
    return orders.filter((o) => {
        if (filters.orders && !filters.orders.has(o.folio)) return false;
        if (filters.places && !filters.places.has(o.placeName)) return false;
        const day = o.requestedAt ? localDay(o.requestedAt) : '';
        if (filters.from && (!day || day < filters.from)) return false;
        if (filters.to && (!day || day > filters.to)) return false;
        if (filters.status !== 'all' && orderStatus(o) !== filters.status) return false;
        return true;
    });
}
// Los totales: una fila por código y presentación, con la cantidad pedida, lo que equivale en la unidad principal y en cuántos pedidos salió.
function totalsOf(list) {
    const map = new Map();
    list.forEach((o) => o.lines.forEach((l) => {
        const key = `${l.code}\u0001${l.packName || ''}`;
        if (!map.has(key)) map.set(key, { code: l.code, description: l.description, uom: l.uom, pack: l.packName || '', quantity: 0, equivalent: 0, orders: new Set() });
        const row = map.get(key);
        row.quantity += Number(l.quantity) || 0;
        row.equivalent += equivOf(l);
        row.orders.add(o.orderId);
    }));
    return [...map.values()].sort((a, z) => String(a.code).localeCompare(String(z.code), localeOf(), { numeric: true }) || a.pack.localeCompare(z.pack, localeOf()));
}
// El desglose agrupado por código: cada código con lo que se pidió en total y, debajo, cada renglón con quién lo pidió.
function breakdownOf(list) {
    const groups = new Map();
    list.forEach((o) => o.lines.forEach((l) => {
        if (!groups.has(l.code)) groups.set(l.code, { code: l.code, description: l.description, uom: l.uom, rows: [] });
        groups.get(l.code).rows.push({ o, l });
    }));
    return [...groups.values()].sort((a, z) => String(a.code).localeCompare(String(z.code), localeOf(), { numeric: true }));
}
const round3 = (n) => Math.round(n * 1000) / 1000;
// «10 Caja con 20 + 12 Tableta (suelta) = 212 Tableta»: lo pedido por presentación y lo que equivale en la unidad principal.
function groupSummary(group) {
    const byPack = new Map();
    let equivalent = 0;
    group.rows.forEach(({ l }) => {
        const pack = l.packName || '';
        byPack.set(pack, (byPack.get(pack) || 0) + (Number(l.quantity) || 0));
        equivalent += equivOf(l);
    });
    const total = `${quantityText(round3(equivalent))}${group.uom ? ` ${group.uom}` : ''}`;
    const parts = [...byPack.entries()].filter(([pack]) => pack);
    return parts.length ? `${parts.map(([pack, q]) => `${quantityText(round3(q))} ${pack}`).join(' + ')} = ${total}` : total;
}

// ---- las tablas --------------------------------------------------------------------------------------------------------------------------------
const TOTAL_COLUMNS = () => [t('main.colPmCodigo'), t('main.colPmDescripcion'), t('main.colPmUdm'), t('main.colPmPresentacion'), t('main.colPmCantidad'), t('main.colPmEquivale'), t('main.cpPedidos')];
// El desglose agrupa por código: la primera columna lleva el código, su descripción y su total en UNA celda combinada (sin franjas); las demás son lo que se pidió, renglón por renglón.
const DETAIL_COLUMNS = () => [t('main.colPmCodigo'), t('main.colPmFolio'), t('main.colPmFechaHora'), t('main.colPmSolicitante'), t('main.colPmLugar'), t('main.colPmPresentacion'), t('main.colPmCantidad'), t('main.colPmEquivale'), t('main.colPmFechaRequerida'), t('main.colPmEstatus')];
// Las llaves de las columnas (para el embudo de filtros de cada encabezado: el mismo de todas las tablas, ver Dashboard.bindExternalColumnFilters).
const TOTAL_KEYS = ['cpTCodigo', 'cpTDescripcion', 'cpTUdm', 'cpTPresentacion', 'cpTCantidad', 'cpTEquivale', 'cpTPedidos'];
const DETAIL_KEYS = ['cpDCodigo', 'cpDFolio', 'cpDFecha', 'cpDSolicitante', 'cpDLugar', 'cpDPresentacion', 'cpDCantidad', 'cpDEquivale', 'cpDRequerida', 'cpDEstatus'];
const ordersText = (n) => t(n === 1 ? 'main.cpUnPedido' : 'main.cpNPedidos', { n });
const equivText = (value, uom) => `${quantityText(round3(value))}${uom ? ` ${uom}` : ''}`;
function totalValues(row) { return [row.code, row.description, row.uom || '—', row.pack || '—', quantityText(round3(row.quantity)), equivText(row.equivalent, row.uom), ordersText(row.orders.size)]; }
// Lo de cada renglón (sin el código, que va en la celda del grupo).
function detailCells(o, l) { return [o.folio, whenText(o.requestedAt), o.name || '—', o.placeName || '—', l.packName || '—', quantityText(l.quantity), equivText(equivOf(l), l.uom), needByText(l.needBy), statusText(l.status)]; }
// Con qué se ordena cada columna dentro de cada código (el orden de los códigos se queda).
const DETAIL_SORT = {
    cpDFolio: (o) => o.orderId, cpDFecha: (o) => o.requestedAt || '', cpDSolicitante: (o) => o.name || '', cpDLugar: (o) => o.placeName || '',
    cpDPresentacion: (o, l) => l.packName || '', cpDCantidad: (o, l) => Number(l.quantity) || 0, cpDEquivale: (o, l) => equivOf(l), cpDRequerida: (o, l) => l.needBy || '', cpDEstatus: (o, l) => statusText(l.status),
};
let detailSort = { key: null, dir: 'asc' };
let detailState = []; // lo dibujado del desglose: [{ group, rows: [{ tr, o, l }], cell, totalEl }]
let totalsState = []; // lo dibujado de los totales: [{ row, tr }]
// Cada código muestra su celda combinada en el primer renglón que el filtro deja a la vista, con las filas que quedan y su total; un código sin renglones a la vista desaparece completo.
function syncDetailGroups() {
    detailState.forEach((g) => {
        const visible = g.rows.filter((r) => !r.tr.classList.contains('data-table-row-col-filtered'));
        g.rows.forEach((r) => r.tr.classList.toggle('cp-first', visible[0] === r));
        if (!visible.length) { g.cell.remove(); return; }
        const target = visible[0].tr;
        if (g.cell.parentElement !== target) target.insertBefore(g.cell, target.firstChild);
        g.cell.rowSpan = visible.length;
        g.totalEl.textContent = t('main.cpTotalGrupo', { total: groupSummary({ ...g.group, rows: visible.map(({ o, l }) => ({ o, l })) }) });
    });
}
function buildTable(columns, numericFrom, keys, { noSort = false, onSort = null } = {}) {
    const table = el('table', 'data-table cp-table');
    const thead = el('thead');
    const headRow = el('tr');
    columns.forEach((label, i) => {
        const th = el('th', numericFrom.includes(i) ? 'cp-num' : '', label);
        if (keys && keys[i]) th.dataset.col = keys[i];
        if (noSort) th.dataset.sortBound = '1'; // el desglose se ordena por su cuenta: dentro de cada código (ordenar toda la tabla desarmaría los grupos)
        if (onSort && keys && DETAIL_SORT[keys[i]]) {
            th.classList.add('data-table-col-sortable'); // mismo aspecto (hueco del embudo y flecha) que el orden de las demás tablas
            th.addEventListener('click', (event) => { if (!event.target.closest('.data-table-col-filter-trigger')) onSort(keys[i]); });
        }
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    const tbody = el('tbody');
    table.append(thead, tbody);
    return { table, tbody };
}
function emptyRow(tbody, span) {
    const tr = el('tr');
    const td = el('td', 'data-table-empty-cell');
    td.colSpan = span;
    td.appendChild(el('div', 'data-table-empty-inner', t('main.cpVacio')));
    tr.appendChild(td);
    tbody.appendChild(tr);
}
function render() {
    const list = visibleOrders();
    const totals = totalsOf(list);
    const groups = breakdownOf(list);
    // totales
    totalsHost.innerHTML = '';
    totalsState = [];
    const totalsTable = buildTable(TOTAL_COLUMNS(), [4, 5], TOTAL_KEYS);
    if (!totals.length) emptyRow(totalsTable.tbody, TOTAL_COLUMNS().length);
    else {
        totals.forEach((row) => {
            const tr = el('tr');
            totalValues(row).forEach((value, i) => { const td = el('td', [0].includes(i) ? 'cp-code' : ([4, 5].includes(i) ? 'cp-num' : ''), value); td.dataset.col = TOTAL_KEYS[i]; tr.appendChild(td); });
            totalsTable.tbody.appendChild(tr);
            totalsState.push({ row, tr });
        });
        const foot = el('tr', 'cp-sum');
        const codes = new Set(totals.map((r) => r.code)).size;
        const cell = el('td', '', t('main.cpTotalFila', { codigos: codes, renglones: totals.length }));
        cell.colSpan = 6;
        foot.append(cell, el('td', '', ordersText(list.length)));
        const tfoot = el('tfoot'); // el total va aparte de las filas para que los filtros no lo quiten
        tfoot.appendChild(foot);
        totalsTable.table.appendChild(tfoot);
    }
    totalsHost.appendChild(totalsTable.table);
    if (window.Dashboard && Dashboard.bindExternalColumnFilters) Dashboard.bindExternalColumnFilters('cp-totales', totalsTable.table);
    // desglose: agrupado por código, con el código y su descripción en UNA celda combinada (sin franjas)
    detailHost.innerHTML = '';
    detailState = [];
    const toggleSort = (key) => { detailSort = detailSort.key !== key ? { key, dir: 'asc' } : (detailSort.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }); render(); };
    const detailTable = buildTable(DETAIL_COLUMNS(), [6, 7], DETAIL_KEYS, { noSort: true, onSort: toggleSort });
    if (!groups.length) emptyRow(detailTable.tbody, DETAIL_COLUMNS().length);
    else {
        const sorter = detailSort.key ? DETAIL_SORT[detailSort.key] : null;
        groups.forEach((group) => {
            const entries = group.rows.slice();
            if (sorter) {
                entries.sort((a, b) => {
                    const x = sorter(a.o, a.l);
                    const y = sorter(b.o, b.l);
                    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), localeOf(), { numeric: true });
                    return detailSort.dir === 'desc' ? -c : c;
                });
            }
            const rows = entries.map(({ o, l }) => {
                const tr = el('tr');
                const hiddenCode = el('td', '', group.code);
                hiddenCode.dataset.col = DETAIL_KEYS[0];
                hiddenCode.hidden = true; // la celda del grupo ocupa su lugar; esta lleva el valor del código para los filtros
                tr.appendChild(hiddenCode);
                detailCells(o, l).forEach((value, i) => { const td = el('td', [5, 6].includes(i) ? 'cp-num' : '', value); td.dataset.col = DETAIL_KEYS[i + 1]; tr.appendChild(td); });
                detailTable.tbody.appendChild(tr);
                return { tr, o, l };
            });
            const cell = el('td', 'cp-gcell');
            cell.dataset.col = DETAIL_KEYS[0];
            cell.dataset.filterFrom = '.cp-gcode';
            const totalEl = el('em', 'cp-gtotal');
            const inner = el('div', 'cp-ginner'); // se queda pegado arriba mientras se recorren los renglones del grupo
            inner.append(el('b', 'cp-gcode', group.code), el('span', 'cp-gdesc', group.description || ''), totalEl);
            cell.appendChild(inner);
            detailState.push({ group, rows, cell, totalEl });
        });
    }
    detailHost.appendChild(detailTable.table);
    if (window.Dashboard && Dashboard.bindExternalColumnFilters) Dashboard.bindExternalColumnFilters('cp-desglose', detailTable.table);
    // la flecha del orden de esta tabla (el motor de filtros borra las suyas al enlazar, así que se pone después)
    if (detailSort.key) Array.from(detailTable.table.tHead.rows[0].cells).filter((th) => th.dataset.col === detailSort.key).forEach((th) => th.classList.add(detailSort.dir === 'desc' ? 'data-table-col-sort-desc' : 'data-table-col-sort-asc'));
    syncDetailGroups();
    new MutationObserver(syncDetailGroups).observe(detailTable.tbody, { attributes: true, attributeFilter: ['class'], subtree: true });
    noteEl.hidden = !truncated;
    if (truncated) noteEl.textContent = t('main.pmCortado', { n: maxLines });
}

// ---- descargar PDF y Excel (lo que se ve: los dos bloques con los filtros puestos) ----------------------------------------------------------
function filterHeader(list) {
    const centers = [...new Set(list.flatMap((o) => o.lines.map((l) => l.centroCostos)).filter(Boolean))];
    const clip = (text) => (text.length > 380 ? `${text.slice(0, 377)}…` : text);
    const pick = (sel, all) => (sel === null ? t('main.cpTodos') : clip([...sel].map((v) => v || t('main.cpSinLugar')).join(', ')) || all);
    const head = [];
    if (centers.length) head.push([t('main.cpHdrCentro'), clip(centers.join(', '))]);
    head.push([t('main.cpFiltroPedido'), pick(filters.orders, t('main.cpTodos'))]);
    head.push([t('main.cpFiltroDesde'), filters.from || '—']);
    head.push([t('main.cpFiltroHasta'), filters.to || '—']);
    head.push([t('main.cpFiltroLugar'), pick(filters.places, t('main.cpTodos'))]);
    head.push([t('main.cpFiltroEstatus'), filters.status === 'all' ? t('main.cpTodos') : statusText(filters.status)]);
    head.push([t('main.cpHdrGenerado'), new Date().toLocaleString(localeOf())]);
    return head;
}
function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function download(format) {
    const list = visibleOrders();
    if (!list.length) { Dashboard.showToast(t('main.cpVacio'), 'warning'); return; }
    // lo que se ve: los filtros de arriba y también los embudos de las columnas; el desglose va agrupado (el código una vez por grupo, con su descripción y su total)
    const shown = (tr) => !tr.classList.contains('data-table-row-col-filtered');
    const totalsRows = totalsState.filter((x) => shown(x.tr)).map((x) => totalValues(x.row));
    const detailRows = [];
    detailState.forEach((g) => {
        const vis = g.rows.filter((r) => shown(r.tr));
        const label = `${g.group.code}\n${g.group.description || ''}\n${t('main.cpTotalGrupo', { total: groupSummary({ ...g.group, rows: vis.map(({ o, l }) => ({ o, l })) }) })}`;
        vis.forEach((r, i) => detailRows.push([i === 0 ? label : '', ...detailCells(r.o, r.l)]));
    });
    if (!totalsRows.length && !detailRows.length) { Dashboard.showToast(t('main.cpVacio'), 'warning'); return; }
    const sections = [
        { title: t('main.cpTotalesTitulo'), columns: TOTAL_COLUMNS().map((label) => ({ label })), rows: totalsRows, widths: [1.2, 3.2, 0.8, 1.6, 0.9, 1.2, 0.9] },
        { title: t('main.cpDesgloseTitulo'), columns: DETAIL_COLUMNS().map((label) => ({ label })), rows: detailRows, widths: [2.4, 0.8, 1.7, 1.4, 1.2, 1.2, 0.8, 1.1, 0.9, 0.9], groupFirst: true },
    ];
    // el formato de la compañía (logo o iniciales, «Pedido Manual», sitio y empresa) lo pone el servidor arriba del archivo, como en los demás reportes; con un solo centro de costos sale también su sitio
    const centers = [...new Set(list.flatMap((o) => o.lines.map((l) => l.cc)).filter(Boolean))];
    const brand = { kind: t('menu.opCentroDistPedidoManual'), docTitle: t('menu.opCentroDistCompraPedidoManual'), costCenterId: centers.length === 1 ? centers[0] : 0 };
    const base = `${t('menu.opCentroDistCompraPedidoManual').replace(/[^\p{L}\p{N}]+/gu, '-')}_${today()}`;
    const btn = format === 'pdf' ? pdfBtn : excelBtn;
    btn.disabled = true;
    try {
        const body = { brand, title: t('menu.opCentroDistCompraPedidoManual'), filename: base, header: filterHeader(list), columns: sections[0].columns, rows: sections[0].rows, sections, wrap: true, widths: sections[0].widths };
        const res = await fetch(`/api/business/export/${format}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`export ${format} failed`);
        saveBlob(await res.blob(), `${base}.${format === 'xlsx' ? 'xlsx' : 'pdf'}`);
        Dashboard.showToast(t('main.layoutDescargaLista'), 'success');
    } catch (err) {
        console.error('Compra Pedido Manual: la descarga no se pudo preparar', err);
        Dashboard.showToast(t('main.layoutDescargaError'), 'error');
    } finally {
        btn.disabled = false;
    }
}
})();
