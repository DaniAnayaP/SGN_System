// ---------------------------------------------------------------------------
// Surtido Pedido Manual (Operaciones > QR's, C. Distribución): aquí quien surte ve lo que falta por entregar de los pedidos hechos con el QR del Pedido Manual y va anotando lo que surte.
//   - Un renglón por artículo pedido: pedido, fecha y hora, solicitante, lugar, código, descripción, presentación, lo PEDIDO, lo ya SURTIDO, lo que FALTA, el día requerido y el estatus.
//   - Con el botón Surtir (Ver y Operar en el botón del árbol) se anota una ENTREGA del renglón: cuánto surte ahora (ya viene con lo que falta; si es menos, queda Parcial), quién recibe (obligatorio), y si se quiere lote, caducidad y
//     observaciones. Un renglón se puede surtir en varias entregas; cada una guarda su lote, su caducidad y quién recibió. Solo se marca: no mueve existencias (no toca Relación Código).
//   - El estatus ya no se escribe a mano: Pendiente = nada surtido, Parcial = una parte, Surtido = lo surtido cubre lo pedido.
//   - Una entrega equivocada NO se borra: se anula (con el permiso Eliminar del botón Anular entrega) y queda tachada en el historial; lo surtido se recalcula.
//   - Filtros: Pedido, Fecha desde–hasta (la fecha en que se hizo el pedido, en tu hora), Lugar que solicita y Estatus (por defecto «Por surtir»: Pendiente y Parcial).
// Los renglones salen del mismo servidor del Pedido Manual (GET /api/business/pedido-manual); solo se ven los pedidos de los centros de costos marcados arriba.
// ---------------------------------------------------------------------------
(function () {
const TABLE_KEY = 'surtido-pedido-manual';
const API = '/api/business/pedido-manual';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const STATUS_FILTERS = ['open', 'all', 'pending', 'partial', 'supplied'];

const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const localeOf = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

let lines = []; // los renglones (un artículo pedido) de los centros de costos marcados
let canSurtir = false;
let canAnular = false;
let truncated = false;
let maxLines = 0;
const filters = { orders: null, from: '', to: '', places: null, status: 'open' }; // null = todos

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        buildFilters();
        await load();
    } catch (err) {
        console.error('Surtido Pedido Manual failed to initialize:', err);
    }
})();
document.addEventListener('sgn:cost-centers-changed', () => { load(); });

// ---- textos y formatos (los mismos de la pantalla Pedido Manual) -------------------------------------------------------------------------------
const quantityText = (q) => Number(q).toLocaleString(localeOf(), { maximumFractionDigits: 3 });
const whenText = (iso) => (iso ? new Date(iso).toLocaleString(localeOf(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
function needByText(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return t('main.pmLoAntesPosible');
    const d = new Date(`${day}T00:00:00Z`);
    const mon = new Intl.DateTimeFormat(localeOf(), { timeZone: 'UTC', month: 'short' }).format(d).replace('.', '');
    return `${String(d.getUTCDate()).padStart(2, '0')}/${mon}/${d.getUTCFullYear()}`;
}
const statusText = (s) => t(`main.pmEstatus_${s}`);
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const round3 = (n) => Math.round(Number(n) * 1000) / 1000;
// «2028-03» -> «03/2028» (la caducidad es mes y año; también acepta un día completo)
function expiryText(value) {
    if (/^\d{4}-\d{2}$/.test(value || '')) return `${value.slice(5)}/${value.slice(0, 4)}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return `${value.slice(8)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
    return value || '';
}
const packName = (l) => l.packName || '';

// ---- carga -------------------------------------------------------------------------------------------------------------------------------------------
async function load() {
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        canSurtir = !!body.canSurtir;
        canAnular = !!body.canAnular;
        truncated = !!body.truncated;
        maxLines = body.max || 0;
        const selected = Dashboard.getSelectedCostCenterIds();
        lines = (body.orders || []).filter((r) => !selected || !r.cc || selected.includes(r.cc));
        const folios = new Map();
        lines.forEach((l) => { if (!folios.has(l.folio)) folios.set(l.folio, { orderId: l.orderId, name: l.name }); });
        pedidoSel.setOptions([...folios.entries()].sort((a, z) => z[1].orderId - a[1].orderId).map(([folio, o]) => ({ value: folio, label: `${folio} · ${o.name || '—'}` })));
        const places = [...new Set(lines.map((l) => l.placeName || ''))].sort((a, z) => a.localeCompare(z, localeOf()));
        lugarSel.setOptions(places.map((p) => ({ value: p, label: p || t('main.cpSinLugar') })));
        const note = document.getElementById('sur-note');
        note.hidden = !truncated;
        if (truncated) note.textContent = t('main.pmCortado', { n: maxLines });
        await render();
    } catch (err) {
        console.error('Surtido Pedido Manual: no se pudieron cargar los pedidos', err);
        Dashboard.showToast(t('admin.saveError'), 'error');
    }
}

// ---- filtros (los mismos de Compra Pedido Manual) ----------------------------------------------------------------------------------------------------
const panels = [];
function closePanels() { panels.forEach((p) => p._close && p._close()); }
document.addEventListener('click', (event) => { if (!event.target.closest('.cp-multi')) closePanels(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanels(); });
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
let pedidoSel;
let lugarSel;
function dateField(labelKey, helpKey, onChange) {
    const field = el('div', 'cp-field');
    const id = `sur-${labelKey.split('.').pop()}`;
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
function buildFilters() {
    const bar = document.getElementById('sur-filters');
    bar.innerHTML = '';
    pedidoSel = makeMultiSelect('main.cpFiltroPedido', 'cpFiltroPedido');
    lugarSel = makeMultiSelect('main.cpFiltroLugar', 'cpFiltroLugar');
    pedidoSel.onChange(() => { filters.orders = pedidoSel.get(); render(); });
    lugarSel.onChange(() => { filters.places = lugarSel.get(); render(); });
    const statusField = el('div', 'cp-field');
    const statusLabel = el('label', '', t('main.cpFiltroEstatus'));
    statusLabel.htmlFor = 'sur-status';
    const statusSelect = el('select', 'cp-box');
    statusSelect.id = 'sur-status';
    statusSelect.setAttribute('data-help-key', 'surFiltroEstatus');
    STATUS_FILTERS.forEach((s) => {
        const label = s === 'open' ? t('main.surFiltroPorSurtir') : (s === 'all' ? t('main.cpTodos') : statusText(s));
        const opt = el('option', '', label);
        opt.value = s;
        statusSelect.appendChild(opt);
    });
    statusSelect.value = filters.status;
    statusSelect.addEventListener('change', () => { filters.status = statusSelect.value; render(); });
    statusField.append(statusLabel, statusSelect);
    bar.append(
        pedidoSel.field,
        dateField('main.cpFiltroDesde', 'cpFiltroDesde', (v) => { filters.from = v; render(); }),
        dateField('main.cpFiltroHasta', 'cpFiltroHasta', (v) => { filters.to = v; render(); }),
        lugarSel.field, statusField,
    );
}
function passes(l) {
    if (filters.orders && !filters.orders.has(l.folio)) return false;
    if (filters.places && !filters.places.has(l.placeName || '')) return false;
    const day = l.requestedAt ? localDay(l.requestedAt) : '';
    if (filters.from && (!day || day < filters.from)) return false;
    if (filters.to && (!day || day > filters.to)) return false;
    if (filters.status === 'open') return l.status === 'pending' || l.status === 'partial';
    if (filters.status !== 'all' && l.status !== filters.status) return false;
    return true;
}

// ---- la tabla (un renglón por artículo pedido) ------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function timeCell(col, iso, receivedIso) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (!iso) { td.textContent = '—'; return td; }
    const d = new Date(iso);
    td.textContent = d.toLocaleString(localeOf(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    td.title = `UTC ${iso.replace('T', ' ').replace('Z', '')}`;
    if (receivedIso) td.title += ` · ${t('main.pmRecibido')}: UTC ${receivedIso.replace('T', ' ').replace('Z', '')}`;
    return td;
}
function statusCell(l) {
    const td = document.createElement('td');
    td.dataset.col = 'colSurEstatus';
    const tag = el('span', 'sur-tag', statusText(l.status));
    tag.dataset.s = l.status;
    tag.setAttribute('data-help-key', 'surEstatus');
    if (l.statusAt) tag.title = `${l.statusBy || '—'} · ${whenText(l.statusAt)} (UTC ${l.statusAt.replace('T', ' ').replace('Z', '')})`;
    td.appendChild(tag);
    return td;
}
function iconButton(icon, label, helpKey, onClick) {
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
function actionsCell(l) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    td.appendChild(iconButton('bx-history', t('main.changeHistoryTitleRecord'), 'changeHistory', () => Dashboard.openChangeHistory(TABLE_KEY, l.id)));
    if (canSurtir && l.missingQty > 0) td.appendChild(iconButton('bx-package', t('main.surBotonSurtir'), 'surSurtir', () => openDialog(l.id)));
    if (l.suppliedQty > 0 && !(canSurtir && l.missingQty > 0)) td.appendChild(iconButton('bx-list-ul', t('main.surVerSurtidos'), 'surVerSurtidos', () => openDialog(l.id)));
    return td;
}
function searchTextOf(l) {
    return [l.folio, l.name, l.placeName, l.centroCostos, l.code, l.description, l.uom, l.categories, l.packName, statusText(l.status)].filter(Boolean).join(' ').toLowerCase();
}
function buildRow(l) {
    const tr = document.createElement('tr');
    tr.dataset.lineId = String(l.id);
    tr.dataset.search = searchTextOf(l);
    const system = l.system || {};
    const num = (col, value, extra) => cell(col, quantityText(value), `col-number${extra ? ` ${extra}` : ''}`);
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, system[key], 'col-system')),
        cell('colCatRegistroUnico', `${l.folio}-${l.lineNo}`, 'col-system'),
        cell('colSurFolio', l.folio), timeCell('colSurFechaHora', l.requestedAt, l.receivedAt), cell('colSurSolicitante', l.name), cell('colSurLugar', l.placeName),
        cell('colSurCodigo', l.code), cell('colSurDescripcion', l.description), cell('colSurPresentacion', packName(l)),
        num('colSurPedido', l.quantity), num('colSurSurtido', l.suppliedQty), num('colSurFalta', l.missingQty, l.missingQty > 0 ? 'sur-falta' : ''),
        cell('colSurFechaRequerida', needByText(l.needBy)), statusCell(l), actionsCell(l),
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
    inner.textContent = t(lines.length ? 'main.surVacio' : 'main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}
// Las filas se dibujan por tandas (con miles no se congela la pantalla) y un dibujo que llega a la mitad cancela el anterior.
const ROW_CHUNK = 100;
let renderToken = 0;
const nextTurn = () => (window.scheduler && window.scheduler.yield ? window.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
function setNote(text) {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar) return;
    let node = toolbar.querySelector('.rel-loading-rows');
    if (!text) { if (node) node.remove(); return; }
    if (!node) {
        node = document.createElement('span');
        node.className = 'rel-loading-rows tpl-muted';
        node.setAttribute('aria-live', 'polite');
        toolbar.prepend(node);
    }
    node.textContent = text;
}
async function render() {
    const tbody = getTbody();
    const token = ++renderToken;
    const list = lines.filter(passes);
    tbody.innerHTML = '';
    if (!list.length) { setNote(''); ensureEmptyState(); return; }
    for (let from = 0; from < list.length; from += ROW_CHUNK) {
        if (token !== renderToken) return;
        const fragment = document.createDocumentFragment();
        list.slice(from, from + ROW_CHUNK).forEach((l) => fragment.appendChild(buildRow(l)));
        tbody.appendChild(fragment);
        if (from + ROW_CHUNK < list.length) {
            setNote(t('main.relLoadingRows', { done: Math.min(from + ROW_CHUNK, list.length), total: list.length }));
            await nextTurn();
        }
    }
    if (token !== renderToken) return;
    setNote('');
    applyTextFilter();
}
function applyTextFilter() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        tr.hidden = !SearchSyntax.matches('contains', text, tr.dataset.search || '');
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyTextFilter);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyTextFilter);
// Pone al día un renglón con lo que contestó el servidor: se vuelve a dibujar, o se quita si con el cambio ya no pasa los filtros (por ejemplo, quedó Surtido y se ve «Por surtir»).
function applyLine(updated) {
    const i = lines.findIndex((x) => x.id === updated.id);
    if (i < 0) return;
    lines[i] = { ...lines[i], ...updated };
    const l = lines[i];
    const tbody = getTbody();
    const tr = tbody.querySelector(`tr[data-line-id="${l.id}"]`);
    if (!tr) return;
    if (!passes(l)) { tr.remove(); ensureEmptyState(); return; }
    const next = buildRow(l);
    next.hidden = tr.hidden;
    tr.replaceWith(next);
}

// ---- la ventana «Surtir» --------------------------------------------------------------------------------------------------------------------------------
let overlay = null;
let current = null; // { line, deliveries } del renglón que está abierto
function ensureDialog() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'sur-modal';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="modal-panel sur-panel" role="dialog" aria-modal="true" aria-labelledby="sur-title"><h3 id="sur-title"></h3><div class="sur-body" id="sur-body"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeDialog(); });
    // en la fase de captura: si hay otra ventana encima (historial, confirmar), el Esc es de ella y no cierra esta
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !overlay || overlay.hidden) return;
        if (document.querySelector('.modal-overlay:not([hidden]):not(#sur-modal)')) return;
        closeDialog();
    }, true);
}
function closeDialog() { if (overlay) overlay.hidden = true; current = null; }
async function openDialog(lineId) {
    ensureDialog();
    try {
        const res = await fetch(`${API}/${lineId}/deliveries`, { credentials: 'include' });
        if (!res.ok) throw new Error('deliveries load failed');
        const body = await res.json();
        current = { line: body.order, deliveries: body.deliveries || [], canSurtir: !!body.canSurtir, canAnular: !!body.canAnular };
        applyLine(body.order);
        overlay.hidden = false;
        renderDialog();
        overlay.querySelector('#sur-qty, #sur-close')?.focus();
    } catch (err) {
        console.error('Surtido Pedido Manual: no se pudieron cargar las entregas', err);
        Dashboard.showToast(t('admin.saveError'), 'error');
    }
}
function fact(label, value, hot) {
    const box = el('div', `sur-fact${hot ? ' sur-fact-hot' : ''}`);
    box.append(el('span', '', label), el('b', '', value));
    return box;
}
function field(id, labelKey, helpKey, input) {
    const wrap = el('div', 'cp-field');
    const label = el('label', '', t(labelKey));
    label.htmlFor = id;
    input.id = id;
    input.setAttribute('data-help-key', helpKey);
    wrap.append(label, input);
    return wrap;
}
function deliveryRow(d) {
    const row = el('div', `sur-delivery${d.voidedAt ? ' sur-voided' : ''}`);
    const main = el('div', 'sur-delivery-main');
    const parts = [`${quantityText(d.quantity)}${packName(current.line) ? ` ${packName(current.line)}` : ''}`];
    if (d.lot) parts.push(t('main.surLoteDe', { lot: d.lot }));
    if (d.expiry) parts.push(t('main.surCaduca', { date: expiryText(d.expiry) }));
    if (d.receivedBy) parts.push(t('main.surRecibio', { who: d.receivedBy }));
    main.appendChild(el('b', '', parts.join(' · ')));
    row.appendChild(main);
    if (d.notes) row.appendChild(el('div', 'sur-delivery-notes', d.notes));
    const meta = el('div', 'sur-delivery-meta', t('main.surEntregaDe', { who: d.deliveredBy || '—', when: whenText(d.deliveredAt) }));
    meta.title = `UTC ${String(d.deliveredAt || '').replace('T', ' ').replace('Z', '')}`;
    row.appendChild(meta);
    if (d.voidedAt) {
        const tag = el('span', 'sur-tag', t('main.surAnulada'));
        tag.dataset.s = 'voided';
        tag.title = `${d.voidedBy || '—'} · ${whenText(d.voidedAt)}`;
        row.appendChild(tag);
    } else if (current.canAnular) {
        row.appendChild(iconButton('bx-block', t('main.surAnularEntrega'), 'surAnular', () => voidDelivery(d)));
    }
    return row;
}
function renderDialog() {
    if (!overlay || overlay.hidden || !current) return;
    const l = current.line;
    overlay.querySelector('#sur-title').textContent = t('main.surDlgTitulo', { folio: l.folio });
    const body = overlay.querySelector('#sur-body');
    body.innerHTML = '';
    body.appendChild(el('p', 'sur-who', [l.code, l.description, packName(l), l.placeName ? `${l.placeName}` : '', l.name ? `(${l.name})` : ''].filter(Boolean).join(' · ')));
    const facts = el('div', 'sur-facts');
    facts.append(fact(t('main.colSurPedido'), quantityText(l.quantity)), fact(t('main.surDlgYaSurtido'), quantityText(l.suppliedQty)), fact(t('main.colSurFalta'), quantityText(l.missingQty), l.missingQty > 0));
    body.appendChild(facts);
    const missing = l.missingQty;
    let confirmBtn = null;
    if (current.canSurtir && missing > 0) {
        const grid = el('div', 'sur-grid');
        const qty = el('input', 'cp-box');
        qty.type = 'number'; qty.min = '0'; qty.step = 'any'; qty.max = String(missing); qty.value = String(missing); qty.inputMode = 'decimal';
        const who = el('input', 'cp-box');
        who.type = 'text'; who.maxLength = 60; who.value = l.name || ''; who.autocomplete = 'off';
        const lot = el('input', 'cp-box');
        lot.type = 'text'; lot.maxLength = 60; lot.autocomplete = 'off';
        const expiry = el('input', 'cp-box');
        expiry.type = 'month';
        const notes = el('textarea', 'cp-box sur-notes');
        notes.rows = 2; notes.maxLength = 300;
        grid.append(field('sur-qty', 'main.surDlgCantidad', 'surDlgCantidad', qty), field('sur-who', 'main.surDlgRecibe', 'surDlgRecibe', who), field('sur-lot', 'main.surDlgLote', 'surDlgLote', lot), field('sur-expiry', 'main.surDlgCaducidad', 'surDlgCaducidad', expiry));
        const notesField = field('sur-notes', 'main.surDlgNotas', 'surDlgNotas', notes);
        notesField.classList.add('sur-wide');
        body.append(grid, notesField, el('p', 'sur-hint', t('main.surDlgObligatorio')));
        const error = el('p', 'sur-error');
        error.setAttribute('role', 'alert');
        error.hidden = true;
        body.appendChild(error);
        const q = () => { const n = Number(qty.value); return Number.isFinite(n) ? round3(n) : NaN; };
        confirmBtn = el('button', 'btn');
        confirmBtn.type = 'button';
        confirmBtn.setAttribute('data-help-key', 'surSurtir');
        const sync = () => {
            const n = q();
            const valid = n > 0 && n <= missing && who.value.trim();
            confirmBtn.disabled = !valid;
            confirmBtn.textContent = t('main.surDlgConfirmar', { n: Number.isFinite(n) && n > 0 ? quantityText(n) : '' }).trim();
        };
        [qty, who].forEach((input) => input.addEventListener('input', sync));
        const showError = (text) => { error.textContent = text; error.hidden = !text; };
        confirmBtn.addEventListener('click', async () => {
            const n = q();
            if (!(n > 0)) { showError(t('main.surErrQty')); return; }
            if (n > missing) { showError(t('main.surErrMax', { n: quantityText(missing) })); return; }
            if (!who.value.trim()) { showError(t('main.surErrRecibe')); return; }
            showError('');
            confirmBtn.disabled = true;
            const ok = await postDelivery(l.id, { quantity: n, receivedBy: who.value.trim(), lot: lot.value.trim(), expiry: expiry.value, notes: notes.value.trim() }, showError);
            if (!ok) sync();
        });
        sync();
    } else if (missing <= 0) {
        body.appendChild(el('p', 'sur-hint', t('main.surDlgYaCompleto')));
    }
    const listTitle = el('h4', 'sur-subtitle', t('main.surDlgEntregas'));
    body.appendChild(listTitle);
    const list = el('div', 'sur-deliveries');
    if (!current.deliveries.length) list.appendChild(el('p', 'sur-hint', t('main.surDlgSinEntregas')));
    current.deliveries.forEach((d) => list.appendChild(deliveryRow(d)));
    body.appendChild(list);
    const foot = el('div', 'sur-foot');
    const close = el('button', 'btn btn-secondary', t('main.surDlgCerrar'));
    close.type = 'button';
    close.id = 'sur-close';
    close.addEventListener('click', closeDialog);
    foot.appendChild(close);
    if (confirmBtn) foot.appendChild(confirmBtn);
    body.appendChild(foot);
}
function errorText(body) {
    if (body && body.code === 'QTY') return t('main.surErrQty');
    if (body && body.code === 'MAX') return t('main.surErrMax', { n: quantityText(body.missing || 0) });
    if (body && body.code === 'RECEIVER') return t('main.surErrRecibe');
    if (body && body.code === 'EXPIRY') return t('main.surErrCaducidad');
    if (body && body.code === 'DONE') return t('main.surDlgYaCompleto');
    if (body && body.code === 'DENIED') return t('main.surErrSinPermiso');
    return (body && body.message) || t('admin.saveError');
}
// Anota la entrega; true si se guardó (el renglón se pone al día y la ventana se vuelve a dibujar con la entrega nueva).
async function postDelivery(lineId, payload, showError) {
    try {
        const res = await fetch(`${API}/${lineId}/deliveries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.order) { showError(errorText(body)); if (body && body.code === 'DONE') await openDialog(lineId); return false; }
        if (current && current.line.id === lineId) { current.line = body.order; current.deliveries = [...current.deliveries, body.delivery]; }
        applyLine(body.order);
        Dashboard.showToast(t('main.surSurtido'), 'success');
        renderDialog();
        return true;
    } catch (err) {
        console.error('Surtido Pedido Manual: no se pudo guardar la entrega', err);
        showError(t('admin.saveError'));
        return false;
    }
}
async function voidDelivery(d) {
    const text = `${quantityText(d.quantity)}${packName(current.line) ? ` ${packName(current.line)}` : ''}${d.lot ? ` · ${t('main.surLoteDe', { lot: d.lot })}` : ''}`;
    if (!(await Dashboard.confirm(t('main.surAnularConfirm', { text }), { accept: t('main.surAnularAceptar') }))) return;
    try {
        const res = await fetch(`${API}/deliveries/${d.id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.order) { Dashboard.showToast(errorText(body), 'warning'); return; }
        if (current && current.line.id === body.order.id) {
            current.line = body.order;
            current.deliveries = current.deliveries.map((x) => (x.id === d.id ? body.delivery : x));
        }
        applyLine(body.order);
        Dashboard.showToast(t('main.surAnuladoAviso'), 'success');
        renderDialog();
    } catch (err) {
        console.error('Surtido Pedido Manual: no se pudo anular la entrega', err);
        Dashboard.showToast(t('admin.saveError'), 'error');
    }
}
})();
