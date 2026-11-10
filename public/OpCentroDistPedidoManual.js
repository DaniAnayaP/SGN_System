// ---------------------------------------------------------------------------
// Pedido Manual (Operaciones, C. Distribución): la BASE DE PEDIDOS (con usuario) que llegan del QR de cada centro de costos. Quien escanea el QR busca el artículo (código, descripción, unidad de medida o categoría),
// pone la cantidad y envía; aquí cada PEDIDO es un renglón (folio, quién lo pidió, lugar que solicita, hora, cuántos artículos y su estatus) y la columna «Ver SKU solicitado» abre, en una pantalla aparte, la lista de
// material que pidió con el día para el que lo pidió. La hora la pone el servidor en UTC y aquí se ve en tu hora (con el UTC al pasar el cursor). Trae las columnas de Control Interno. El estatus (Pendiente / Surtido /
// Parcial) del pedido, o el de cada artículo en su lista, lo cambia quien tiene Ver y Operar en la columna Estatus; quién pidió (en el pedido) y la cantidad (en cada artículo) se pueden CORREGIR con el lápiz según el
// permiso Modificar de cada columna (con autorización del jefe cuando toca) y queda marcado «Editado». Con el permiso Eliminar se puede quitar un pedido o un artículo. «Descargar» baja la lista de un pedido, o la
// lista de pedidos, en Excel, PDF, CSV, texto o JSON (con el permiso del botón Descargar lista del pedido). El botón QR (con el permiso de su columna) muestra el QR del centro de costos marcado y los candados de ese QR.
// Los renglones salen del servidor (GET /api/business/pedido-manual), uno por artículo, y aquí se juntan por pedido.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'pedido-manual';
const API = '/api/business/pedido-manual';
const DELETE_AUTH_COL = 'colPmDeleteAuth';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const STATUSES = ['pending', 'supplied'];

const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
// Lo que el servidor dice que puede hacer quien ve la pantalla (viene con la lista).
let editable = {};
let canDelete = false;
let canQr = false;
let canLock = false;
let canStatus = false;
let canDownload = false;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Pedido Manual failed to initialize:', err);
    }
})();

// ---- tabla (UN renglón por pedido) ----------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
const localeOf = () => (lang() === 'en' ? 'en-US' : 'es-MX');
// Fecha y hora en la zona de quien la ve; al pasar el cursor, el UTC con el que se guardó.
function timeCell(col, iso, receivedIso) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (!iso) { td.textContent = '—'; return td; }
    const d = new Date(iso);
    td.textContent = d.toLocaleString(localeOf(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    td.title = `UTC ${iso.replace('T', ' ').replace('Z', '')}`;
    // un pedido que se mandó sin señal desde la App trae la hora del celular; el servidor lo recibió más tarde
    if (receivedIso) td.title += ` · ${t('main.pmRecibido')}: UTC ${receivedIso.replace('T', ' ').replace('Z', '')}`;
    return td;
}
const whenText = (iso) => (iso ? new Date(iso).toLocaleString(localeOf(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
function quantityText(q) {
    return Number(q).toLocaleString(localeOf(), { maximumFractionDigits: 3 });
}
// Para cuándo se quiere ese renglón: un día (AAAA-MM-DD, sin hora ni zona) o «Lo antes posible».
function needByText(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return t('main.pmLoAntesPosible');
    const d = new Date(`${day}T00:00:00Z`);
    const mon = new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-US' : 'es-MX', { timeZone: 'UTC', month: 'short' }).format(d).replace('.', '');
    return `${String(d.getUTCDate()).padStart(2, '0')}/${mon}/${d.getUTCFullYear()}`;
}
const statusText = (s) => t(`main.pmEstatus_${s}`);
const originText = (src) => t(src === 'qr' ? 'main.pmOrigenQr' : (src === 'app' ? 'main.pmOrigenApp' : 'main.pmOrigenUsuario'));
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// El servidor manda un renglón por artículo pedido; aquí se juntan por pedido (folio): el pedido lleva quién lo pidió, el lugar, la hora y la lista de sus artículos.
let orderMap = new Map(); // id del pedido -> { orderId, folio, cc, centroCostos, name, placeName, requestedAt, receivedAt, source, system, lines: [] } (del más nuevo al más viejo)
function groupOrders(list) {
    const map = new Map();
    list.forEach((r) => {
        if (!map.has(r.orderId)) map.set(r.orderId, { orderId: r.orderId, folio: r.folio, cc: r.cc, centroCostos: r.centroCostos, name: r.name, placeName: r.placeName || '', requestedAt: r.requestedAt, receivedAt: r.receivedAt, source: r.source, system: r.system, lines: [] });
        map.get(r.orderId).lines.push(r);
    });
    return map;
}
// Pendiente si ningún artículo se surtió, Surtido si todos y Parcial si solo algunos.
const orderStatus = (o) => { const set = new Set(o.lines.map((l) => l.status)); return set.size === 1 ? [...set][0] : 'partial'; };
const editedInfo = (o) => o.lines.filter((l) => l.editedAt).sort((a, z) => String(z.editedAt).localeCompare(String(a.editedAt)))[0] || null;
function searchTextOf(o) {
    return [o.folio, o.name, o.placeName, o.centroCostos, statusText(orderStatus(o)), originText(o.source), ...o.lines.flatMap((l) => [l.code, l.description, l.uom, l.categories])].filter(Boolean).join(' ').toLowerCase();
}

// El estatus del pedido: quien puede cambiarlo ve un selector (cambia TODOS sus artículos); los demás, el nombre. Para marcar un solo artículo se abre «Ver SKU solicitado».
function statusTag(text, title) {
    const tag = document.createElement('span');
    tag.className = 'rel-tag';
    tag.textContent = text;
    if (title) tag.title = title;
    return tag;
}
function statusSelect(current, extraPartial, helpKey, label, onChange) {
    const select = document.createElement('select');
    select.className = 'pm-status';
    select.dataset.s = current;
    select.setAttribute('data-help-key', helpKey);
    select.setAttribute('aria-label', label);
    (extraPartial ? ['partial', ...STATUSES] : STATUSES).forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = statusText(s);
        if (s === current) opt.selected = true;
        if (s === 'partial') opt.disabled = true; // «Parcial» solo describe; no se elige
        select.appendChild(opt);
    });
    select.addEventListener('change', () => onChange(select));
    return select;
}
function orderStatusControl(o) {
    const current = orderStatus(o);
    if (!canStatus) return statusTag(statusText(current));
    return statusSelect(current, current === 'partial', 'pmEstatusPedido', t('main.colPmEstatus'), (select) => setOrderStatus(o, select));
}
function statusCell(o) {
    const td = document.createElement('td');
    td.dataset.col = 'colPmEstatus';
    td.appendChild(orderStatusControl(o));
    return td;
}
function lineStatusControl(l) {
    const title = l.statusAt ? `${l.statusBy || '—'} · ${whenText(l.statusAt)} (UTC ${l.statusAt.replace('T', ' ').replace('Z', '')})` : '';
    if (!canStatus) return statusTag(statusText(l.status), title);
    const select = statusSelect(l.status, false, 'pmEstatus', t('main.colPmEstatus'), (sel) => setLineStatus(l, sel));
    if (title) select.title = title;
    return select;
}
// Cambia un artículo y deja en memoria lo que contestó el servidor; true si se pudo.
async function postLineStatus(l, next) {
    try {
        const res = await fetch(`${API}/${l.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status: next }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.order) { Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'warning'); return false; }
        applyLineUpdate(body.order);
        return true;
    } catch (err) {
        console.error('Pedido Manual: failed to change status', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        return false;
    }
}
async function setLineStatus(l, select) {
    select.disabled = true;
    const ok = await postLineStatus(l, select.value);
    if (ok) Dashboard.showToast(t('main.pmEstatusCambiado'), 'success');
    refreshOrder(l.orderId);
}
async function setOrderStatus(o, select) {
    const next = select.value;
    if (!STATUSES.includes(next)) return;
    select.disabled = true;
    let ok = true;
    for (const l of o.lines.filter((x) => x.status !== next)) {
        ok = await postLineStatus(l, next);
        if (!ok) break;
    }
    if (ok) Dashboard.showToast(t('main.pmEstatusCambiado'), 'success');
    refreshOrder(o.orderId);
}
// Pone al día un artículo con lo que mandó el servidor.
function applyLineUpdate(updated) {
    const o = orderMap.get(updated.orderId);
    if (!o) return;
    const i = o.lines.findIndex((x) => x.id === updated.id);
    if (i >= 0) o.lines[i] = { ...o.lines[i], ...updated };
}
// Vuelve a dibujar el renglón del pedido (y su lista, si está abierta).
function refreshOrder(orderId) {
    const o = orderMap.get(orderId);
    const tr = getTbody().querySelector(`tr[data-order-id="${orderId}"]`);
    if (o && tr) {
        const next = buildOrderRow(o);
        next.hidden = tr.hidden;
        tr.replaceWith(next);
    }
    renderListModal();
}

// Lo que se puede corregir: quién pidió (vale para todo el pedido, se corrige en el pedido) y la cantidad (de cada artículo, en su lista); la hora, el artículo y el centro nunca cambian.
// Apagado si la persona no puede modificar esa columna según el árbol.
function originCell(col, text, edited) {
    const td = cell(col, text);
    if (edited) {
        const tag = document.createElement('span');
        tag.className = 'rel-tag rec-edit-tag';
        tag.setAttribute('data-help-key', 'recEditTag');
        tag.textContent = t('main.recEditado');
        tag.title = `${t('main.recEditadoPor', { who: edited.editedBy || '—', when: whenText(edited.editedAt) })} (UTC ${edited.editedAt.replace('T', ' ').replace('Z', '')})`;
        td.appendChild(tag);
    }
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
const canDeleteNow = () => canDelete || Dashboard.hasColumnDeleteGrant(TABLE_KEY, DELETE_AUTH_COL);
function actionsCell(o) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    // Descargar la lista de este pedido (sus datos y sus artículos) en el formato que se elija.
    if (canDownload) td.appendChild(iconButton('admin-icon-btn', 'bx-download', t('main.pmDescargarLista'), 'pmDescargar', (event) => openFormatMenu(event.currentTarget, [{ pick: (format) => downloadDataset(format, orderDataset(o)) }])));
    if (editable.name) td.appendChild(iconButton('admin-icon-btn', 'bx-edit-alt', t('main.recEditBoton'), 'recEdit', () => editOrderName(o)));
    if (canDeleteNow()) td.appendChild(iconButton('admin-icon-btn admin-icon-btn-danger', 'bx-trash', t('admin.delete'), 'delete', () => deleteOrder(o)));
    return td;
}
// «Ver SKU solicitado»: abre la pantalla aparte con el material que pidió y el día.
function skuCell(o) {
    const td = document.createElement('td');
    td.dataset.col = 'colPmVerSku';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pm-link';
    btn.setAttribute('data-help-key', 'pmVerLista');
    btn.innerHTML = `<i class="bx bx-list-ul" aria-hidden="true"></i><span>${esc(t('main.colPmVerSku'))}</span>`;
    btn.addEventListener('click', () => openListModal(o.orderId));
    td.appendChild(btn);
    return td;
}
function buildOrderRow(o) {
    const tr = document.createElement('tr');
    tr.dataset.orderId = String(o.orderId);
    tr.dataset.search = searchTextOf(o);
    const system = o.system || {};
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, system[key], 'col-system')),
        cell('colCatRegistroUnico', o.folio, 'col-system'),
        cell('colPmFolio', o.folio), timeCell('colPmFechaHora', o.requestedAt, o.receivedAt), cell('colPmSolicitante', o.name), cell('colPmLugar', o.placeName),
        cell('colPmArticulos', o.lines.length, 'col-number'), skuCell(o), statusCell(o),
        originCell('colPmOrigen', originText(o.source), editedInfo(o)),
    );
    tr.appendChild(actionsCell(o));
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
// Las filas se dibujan por tandas (con miles no se congela la pantalla) y una recarga que llega a la mitad cancela la anterior.
const ROW_CHUNK = 100;
let renderToken = 0;
const nextTurn = () => (window.scheduler && window.scheduler.yield ? window.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
function setNote(text) {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar) return;
    let el = toolbar.querySelector('.rel-loading-rows');
    if (!text) { if (el) el.remove(); return; }
    if (!el) {
        el = document.createElement('span');
        el.className = 'rel-loading-rows tpl-muted';
        el.setAttribute('aria-live', 'polite');
        toolbar.prepend(el);
    }
    el.textContent = text;
}
async function refreshTable() {
    const tbody = getTbody();
    const token = ++renderToken;
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== renderToken) return;
        editable = body.editable || {};
        canDelete = !!body.canDelete;
        canQr = !!body.canQr;
        canLock = !!body.canLock;
        canStatus = !!body.canStatus;
        canDownload = !!body.canDownload;
        document.getElementById('pm-qr-btn').hidden = !canQr;
        document.getElementById('pm-dl-btn').hidden = !canDownload;
        // Solo los pedidos de los centros de costos marcados arriba.
        const selected = Dashboard.getSelectedCostCenterIds();
        orderMap = groupOrders(body.orders.filter((r) => !selected || !r.cc || selected.includes(r.cc)));
        const orders = [...orderMap.values()];
        tbody.innerHTML = '';
        const note = body.truncated ? t('main.pmCortado', { n: body.max }) : '';
        if (!orders.length) { setNote(note); ensureEmptyState(); renderListModal(); return; }
        for (let from = 0; from < orders.length; from += ROW_CHUNK) {
            if (token !== renderToken) return;
            const fragment = document.createDocumentFragment();
            orders.slice(from, from + ROW_CHUNK).forEach((o) => fragment.appendChild(buildOrderRow(o)));
            tbody.appendChild(fragment);
            if (from + ROW_CHUNK < orders.length) {
                setNote(t('main.relLoadingRows', { done: Math.min(from + ROW_CHUNK, orders.length), total: orders.length }));
                await nextTurn();
            }
        }
        if (token !== renderToken) return;
        setNote(note);
        applyFilters();
        renderListModal();
    } catch (err) {
        if (token === renderToken) setNote('');
        console.error('Pedido Manual: failed to load orders', err);
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

// ---- corregir y quitar -----------------------------------------------------------------------------------------------------------------
const toastNames = (list) => list.map((fk) => t(fk)).join(', ');
function saveToasts(body) {
    if (body.rejectedFields && body.rejectedFields.length) Dashboard.showToast(`${t('main.fieldLocked')}: ${toastNames(body.rejectedFields)}`, 'warning');
    if (body.pendingFields && body.pendingFields.length) Dashboard.showToast(`${t('main.changePending')}: ${toastNames(body.pendingFields)}`, 'info');
    if (!(body.rejectedFields && body.rejectedFields.length) && !(body.pendingFields && body.pendingFields.length)) Dashboard.showToast(t('main.recEditGuardado'), 'success');
}
// Quién pidió vale para todo el pedido: se corrige en el pedido (el servidor lo cambia en todos sus artículos).
function editOrderName(o) {
    RecordEdit.open({
        title: t('main.recEditTitulo'), subtitle: o.folio,
        fields: [{ key: 'name', label: t('main.colPmSolicitante'), kind: 'text', value: o.name, enabled: !!editable.name, hint: editable.name ? '' : t('main.recEditSinPermiso') }],
        save: async (patch) => {
            const res = await fetch(`${API}/${o.lines[0].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) return { ok: false, message: RecordEdit.errorText(body.code) };
            saveToasts(body);
            await refreshTable();
            return { ok: true };
        },
    });
}
// La cantidad se corrige por artículo: manda al servidor SOLO lo que cambió. El servidor decide: lo aplica, lo manda a autorizar o avisa que no hay permiso.
function editLineQuantity(o, l) {
    RecordEdit.open({
        title: t('main.recEditTitulo'), subtitle: `${o.folio} · ${l.code}`,
        fields: [{ key: 'quantity', label: t('main.colPmCantidad'), kind: 'number', value: l.quantity, enabled: !!editable.quantity, hint: editable.quantity ? '' : t('main.recEditSinPermiso') }],
        save: async (patch) => {
            const res = await fetch(`${API}/${l.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) return { ok: false, message: RecordEdit.errorText(body.code) };
            saveToasts(body);
            if (body.order) applyLineUpdate(body.order);
            refreshOrder(o.orderId);
            return { ok: true };
        },
    });
}
async function deleteLine(o, l) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`${API}/${l.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(body.message || Dashboard.t('main.fieldLocked'), 'warning');
            return;
        }
        o.lines = o.lines.filter((x) => x.id !== l.id);
        if (!o.lines.length) { // era el último artículo: el pedido se va
            orderMap.delete(o.orderId);
            getTbody().querySelector(`tr[data-order-id="${o.orderId}"]`)?.remove();
            ensureEmptyState();
            if (listOverlay) listOverlay.hidden = true;
            return;
        }
        refreshOrder(o.orderId);
    } catch (err) {
        console.error('Pedido Manual: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
async function deleteOrder(o) {
    if (!(await Dashboard.confirm(t('main.pmEliminarPedido', { folio: o.folio, n: o.lines.length })))) return;
    try {
        for (const l of o.lines) {
            const res = await fetch(`${API}/${l.id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                Dashboard.showToast(body.message || Dashboard.t('main.fieldLocked'), 'warning');
                break;
            }
        }
    } catch (err) {
        console.error('Pedido Manual: failed to delete order', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
    await refreshTable();
}

// ---- «Ver SKU solicitado»: la lista de material y el día que pidió, en una pantalla aparte -----------------------------------------------------
let listOverlay = null;
let listOrderId = null;
function ensureListModal() {
    if (listOverlay) return;
    listOverlay = document.createElement('div');
    listOverlay.className = 'modal-overlay';
    listOverlay.id = 'pm-list-modal';
    listOverlay.hidden = true;
    listOverlay.innerHTML = `<div class="modal-panel pm-list-panel" role="dialog" aria-modal="true" aria-labelledby="pm-list-title">
        <h3 id="pm-list-title"></h3>
        <div class="pm-list-meta" id="pm-list-meta"></div>
        <div class="pm-list-scroll"><table class="pm-list-table"><thead><tr id="pm-list-head"></tr></thead><tbody id="pm-list-body"></tbody></table></div>
        <div class="rel-foot"><div class="pm-list-formats" id="pm-list-formats"></div><button type="button" class="btn btn-secondary" id="pm-list-close">${esc(t('main.pmQrCerrar'))}</button></div>
    </div>`;
    document.body.appendChild(listOverlay);
    listOverlay.addEventListener('click', (event) => { if (event.target === listOverlay || event.target.closest('#pm-list-close')) listOverlay.hidden = true; });
    // en la fase de captura: si hay otra ventana encima (editar, historial, confirmar), el Esc es de ella y no cierra esta
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !listOverlay || listOverlay.hidden) return;
        if (document.querySelector('.modal-overlay:not([hidden]):not(#pm-list-modal)')) return;
        listOverlay.hidden = true;
    }, true);
}
function openListModal(orderId) {
    if (!orderMap.has(orderId)) return;
    ensureListModal();
    listOrderId = orderId;
    listOverlay.hidden = false;
    renderListModal();
    listOverlay.querySelector('#pm-list-close').focus();
}
function renderListModal() {
    if (!listOverlay || listOverlay.hidden) return;
    const o = orderMap.get(listOrderId);
    if (!o) { listOverlay.hidden = true; return; }
    listOverlay.querySelector('#pm-list-title').textContent = t('main.pmListaTitulo', { folio: o.folio });
    const meta = listOverlay.querySelector('#pm-list-meta');
    meta.innerHTML = '';
    const metaItem = (label, content) => {
        const div = document.createElement('div');
        const lab = document.createElement('label');
        lab.textContent = label;
        div.appendChild(lab);
        if (typeof content === 'string') { const span = document.createElement('span'); span.textContent = content || '—'; div.appendChild(span); } else div.appendChild(content);
        meta.appendChild(div);
    };
    metaItem(t('main.colPmSolicitante'), o.name);
    metaItem(t('main.colPmLugar'), o.placeName);
    metaItem(t('main.colPmFechaHora'), whenText(o.requestedAt));
    metaItem(t('main.colPmOrigen'), originText(o.source));
    metaItem(`${t('main.colPmEstatus')} · ${t('main.pmTodoPedido')}`, orderStatusControl(o));
    const head = listOverlay.querySelector('#pm-list-head');
    head.innerHTML = [t('main.pmListaNum'), t('main.colPmCodigo'), t('main.colPmDescripcion'), t('main.colPmUdm'), t('main.colPmCategoria'), t('main.colPmCantidad'), t('main.colPmFechaRequerida'), t('main.colPmEstatus'), t('main.colActions')].map((h) => `<th>${esc(h)}</th>`).join('');
    const body = listOverlay.querySelector('#pm-list-body');
    body.innerHTML = '';
    o.lines.forEach((l, i) => {
        const tr = document.createElement('tr');
        const td = (text, cls) => { const c = document.createElement('td'); c.textContent = text === null || text === undefined || text === '' ? '—' : String(text); if (cls) c.className = cls; return c; };
        tr.append(td(i + 1), td(l.code), td(l.description), td(l.uom), td(l.categories), td(quantityText(l.quantity), 'num'), td(needByText(l.needBy)));
        const statusTd = document.createElement('td');
        statusTd.appendChild(lineStatusControl(l));
        tr.appendChild(statusTd);
        const actions = document.createElement('td');
        actions.className = 'pm-list-actions';
        actions.appendChild(iconButton('admin-icon-btn', 'bx-history', t('main.changeHistoryTitleRecord'), 'changeHistory', () => Dashboard.openChangeHistory(TABLE_KEY, l.id)));
        if (editable.quantity) actions.appendChild(iconButton('admin-icon-btn', 'bx-edit-alt', t('main.recEditBoton'), 'recEdit', () => editLineQuantity(o, l)));
        if (canDeleteNow()) actions.appendChild(iconButton('admin-icon-btn admin-icon-btn-danger', 'bx-trash', t('admin.delete'), 'delete', () => deleteLine(o, l)));
        tr.appendChild(actions);
        body.appendChild(tr);
    });
    const formats = listOverlay.querySelector('#pm-list-formats');
    formats.innerHTML = '';
    if (canDownload) {
        const lab = document.createElement('span');
        lab.className = 'rel-muted';
        lab.textContent = t('main.pmDescargarLista');
        formats.appendChild(lab);
        FORMATS.forEach(([id, icon, key]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-secondary';
            btn.setAttribute('data-help-key', 'pmDescargar');
            btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i> ${esc(t(key))}`;
            btn.addEventListener('click', () => downloadDataset(id, orderDataset(o)));
            formats.appendChild(btn);
        });
    }
}

// ---- descargar: la lista de un pedido y la lista de pedidos, en varios formatos ----------------------------------------------------------------
const FORMATS = [['xlsx', 'bx-spreadsheet', 'main.pmFormatoXlsx'], ['pdf', 'bxs-file-pdf', 'main.pmFormatoPdf'], ['csv', 'bx-table', 'main.pmFormatoCsv'], ['txt', 'bx-file-blank', 'main.pmFormatoTxt'], ['json', 'bx-code-curly', 'main.pmFormatoJson']];
const today = () => new Date().toISOString().slice(0, 10);
const csvCell = (v) => { const s = String(v === null || v === undefined ? '' : v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const orderHeader = (o) => [[t('main.colPmFolio'), o.folio], [t('main.colPmSolicitante'), o.name], [t('main.colPmLugar'), o.placeName || '—'], [t('main.colPmFechaHora'), whenText(o.requestedAt)], [t('main.colPmOrigen'), originText(o.source)], [t('main.colPmEstatus'), statusText(orderStatus(o))], [t('main.colPmArticulos'), o.lines.length]];
const lineColumns = () => [t('main.pmListaNum'), t('main.colPmCodigo'), t('main.colPmDescripcion'), t('main.colPmUdm'), t('main.colPmCategoria'), t('main.colPmCantidad'), t('main.colPmFechaRequerida'), t('main.colPmEstatus')];
const lineValues = (l, i) => [i + 1, l.code, l.description, l.uom, l.categories, quantityText(l.quantity), needByText(l.needBy), statusText(l.status)];
// El mismo renglón con los datos del pedido repetidos (para CSV y para juntar varios pedidos en una sola tabla).
const flatColumns = () => [t('main.colPmFolio'), t('main.colPmSolicitante'), t('main.colPmLugar'), t('main.colPmFechaHora'), t('main.colPmCodigo'), t('main.colPmDescripcion'), t('main.colPmUdm'), t('main.colPmCategoria'), t('main.colPmCantidad'), t('main.colPmFechaRequerida'), t('main.colPmEstatus')];
const flatValues = (o, l) => [o.folio, o.name, o.placeName, whenText(o.requestedAt), l.code, l.description, l.uom, l.categories, quantityText(l.quantity), needByText(l.needBy), statusText(l.status)];
const orderJson = (o) => ({
    folio: o.folio, requestedBy: o.name, place: o.placeName || null, requestedAtUtc: o.requestedAt, receivedAtUtc: o.receivedAt || null, origin: o.source, status: orderStatus(o),
    items: o.lines.map((l, i) => ({ no: i + 1, code: l.code, description: l.description, uom: l.uom, categories: l.categories, quantity: l.quantity, requiredDate: /^\d{4}-\d{2}-\d{2}$/.test(l.needBy || '') ? l.needBy : null, asap: !/^\d{4}-\d{2}-\d{2}$/.test(l.needBy || ''), status: l.status })),
});
function orderTxt(o) {
    const head = orderHeader(o).map(([k, v]) => `${k}: ${v}`);
    const items = o.lines.map((l, i) => `${String(i + 1).padStart(3, ' ')}. ${l.code} | ${l.description} | ${quantityText(l.quantity)} ${l.uom || ''} | ${t('main.colPmFechaRequerida')}: ${needByText(l.needBy)} | ${statusText(l.status)}`.replace(/\s+\|/g, ' |'));
    return [`${t('main.pmPedidoTitulo').toUpperCase()} ${o.folio}`, ...head, '', ...items].join('\r\n');
}
// La lista de UN pedido: los datos del pedido arriba y sus artículos abajo (Excel y PDF); CSV, texto y JSON con la misma información.
function orderDataset(o) {
    return {
        title: `${t('main.pmPedidoTitulo')} ${o.folio}`, filename: `Pedido-${o.folio}_${today()}`, header: orderHeader(o),
        columns: lineColumns(), rows: o.lines.map(lineValues), widths: [0.35, 1.0, 3.4, 0.8, 1.7, 0.8, 1.2, 1.0],
        flat: { columns: flatColumns(), rows: o.lines.map((l) => flatValues(o, l)) }, json: orderJson(o), txt: orderTxt(o),
    };
}
// Los pedidos que se ven ahora en la tabla (con la búsqueda y los filtros puestos), en el orden de la tabla.
function visibleOrders() {
    return [...getTbody().querySelectorAll('tr[data-order-id]')].filter((tr) => !tr.hidden && !tr.classList.contains('data-table-row-col-filtered')).map((tr) => orderMap.get(Number(tr.dataset.orderId))).filter(Boolean);
}
// La lista de pedidos como se ve en la tabla (sus columnas visibles, un renglón por pedido).
function ordersDataset() {
    const snap = Dashboard.getVisibleTableSnapshot(TABLE_KEY);
    const keep = snap.columns.map((c, i) => i).filter((i) => !['actions', 'colPmVerSku'].includes(snap.columns[i].key));
    const columns = keep.map((i) => snap.columns[i].label);
    // el estatus y el origen de la tabla traen texto de sus controles (las opciones del selector, la marca «Editado»): se toman del pedido
    const orders = visibleOrders();
    const textOf = { colPmEstatus: (o) => statusText(orderStatus(o)), colPmOrigen: (o) => originText(o.source) };
    const rows = snap.rows.map((row, r) => keep.map((i) => (textOf[snap.columns[i].key] && orders[r] ? textOf[snap.columns[i].key](orders[r]) : row[i])));
    const objects = rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
    return { title: t('main.pmListaBarra'), filename: `Lista-de-pedidos_${today()}`, columns, rows, flat: { columns, rows }, json: objects, txt: [columns.join(' | '), ...rows.map((r) => r.join(' | '))].join('\r\n') };
}
// Todo el material y el día que pidió, un renglón por SKU, de los pedidos que se ven.
function materialDataset() {
    const orders = visibleOrders();
    const columns = flatColumns();
    const rows = orders.flatMap((o) => o.lines.map((l) => flatValues(o, l)));
    return { title: t('main.pmBajarMaterial'), filename: `Material-solicitado_${today()}`, columns, rows, widths: [0.9, 1.4, 1.2, 1.3, 0.9, 3, 0.7, 1.4, 0.8, 1.1, 0.9], flat: { columns, rows }, json: orders.map(orderJson), txt: orders.map(orderTxt).join('\r\n\r\n') };
}
async function exportToFile(format, ds) {
    const base = ds.filename;
    if (format === 'xlsx' || format === 'pdf') {
        const body = { title: ds.title, filename: base, columns: ds.columns.map((label) => ({ label })), rows: ds.rows };
        if (ds.header) body.header = ds.header;
        if (format === 'pdf') { body.wrap = true; if (ds.widths) body.widths = ds.widths; }
        const res = await fetch(`/api/business/export/${format}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`export ${format} failed`);
        window.LayoutSheet.saveBlob(await res.blob(), `${base}.${format}`);
        return;
    }
    if (format === 'csv') {
        const text = `﻿${[ds.flat.columns, ...ds.flat.rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
        window.LayoutSheet.saveBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${base}.csv`);
        return;
    }
    if (format === 'txt') { window.LayoutSheet.saveBlob(new Blob([`﻿${ds.txt}`], { type: 'text/plain;charset=utf-8' }), `${base}.txt`); return; }
    window.LayoutSheet.saveBlob(new Blob([JSON.stringify(ds.json, null, 2)], { type: 'application/json' }), `${base}.json`);
}
async function downloadDataset(format, ds) {
    try {
        await exportToFile(format, ds);
        Dashboard.showToast(t('main.layoutDescargaLista'), 'success');
    } catch (err) {
        console.error('Pedido Manual: la descarga no se pudo preparar', err);
        Dashboard.showToast(t('main.layoutDescargaError'), 'error');
    }
}
// El menú de formatos (junto al botón que lo abrió). sections = [{ label?, pick(format) }]: cada sección es una lista de los cinco formatos.
let formatMenu = null;
function closeFormatMenu() { if (formatMenu) { formatMenu.remove(); formatMenu = null; } }
function openFormatMenu(anchor, sections) {
    const reopening = !!formatMenu && formatMenu._anchor === anchor;
    closeFormatMenu();
    if (reopening) return;
    const menu = document.createElement('div');
    menu.className = 'pm-dl-menu';
    menu._anchor = anchor;
    sections.forEach((sec) => {
        if (sec.label) { const lab = document.createElement('div'); lab.className = 'pm-dl-label'; lab.textContent = sec.label; menu.appendChild(lab); }
        FORMATS.forEach(([id, icon, key]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i><span>${esc(t(key))}</span>`;
            btn.addEventListener('click', () => { closeFormatMenu(); sec.pick(id); });
            menu.appendChild(btn);
        });
    });
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw))}px`;
    menu.style.top = `${Math.max(8, r.bottom + mh + 8 > window.innerHeight ? r.top - mh - 4 : r.bottom + 4)}px`;
    formatMenu = menu;
}
document.addEventListener('click', (event) => { if (formatMenu && !event.target.closest('.pm-dl-menu') && !event.target.closest('[data-help-key="pmDescargar"]') && !event.target.closest('#pm-dl-btn')) closeFormatMenu(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeFormatMenu(); });
window.addEventListener('resize', closeFormatMenu);
document.getElementById('pm-dl-btn')?.addEventListener('click', (event) => openFormatMenu(event.currentTarget, [
    { label: t('main.pmBajarPedidos'), pick: (format) => downloadDataset(format, ordersDataset()) },
    { label: t('main.pmBajarMaterial'), pick: (format) => downloadDataset(format, materialDataset()) },
]));

// ---- el QR del centro de costos y sus candados ------------------------------------------------------------------------------------------
let qrOverlay = null;
let qrState = null;
function ensureQrOverlay() {
    if (qrOverlay) return;
    qrOverlay = document.createElement('div');
    qrOverlay.className = 'modal-overlay';
    qrOverlay.hidden = true;
    qrOverlay.innerHTML = '<div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="pm-qr-title"><h3 id="pm-qr-title"></h3><div class="pm-qr-panel" id="pm-qr-body"></div></div>';
    document.body.appendChild(qrOverlay);
    qrOverlay.addEventListener('click', (event) => { if (event.target === qrOverlay) qrOverlay.hidden = true; });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && qrOverlay && !qrOverlay.hidden) qrOverlay.hidden = true; });
}
// La tarjeta es la MISMA de los demás QR (LayoutSheet.buildCardSvg): encabezado con el logo (o las iniciales), el Sitio y la empresa, el título, un marco con el centro de costos y el QR grande, con el color de la empresa.
// El tamaño es el último que se eligió en el Layout para sus tarjetas (si no hay, 10.5 × 14.8 cm); la imagen y el PDF son la tarjeta sola, sin hoja ni línea de recorte.
const CARD_SIZE_KEY = 'sgn_layout_card_size';
function cardOptions() {
    let o = { widthCm: 10.5, heightCm: 14.8, cut: false };
    try {
        const raw = JSON.parse(localStorage.getItem(CARD_SIZE_KEY) || 'null');
        if (raw && raw.w >= 6 && raw.w <= 120 && raw.h >= 6 && raw.h <= 120) o = { widthCm: raw.w, heightCm: raw.h, cut: false };
    } catch (err) { /* sin tamaño recordado */ }
    return o;
}
const logoRatioOf = (dataUrl) => (dataUrl ? new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
    img.onerror = () => resolve(1);
    img.src = dataUrl;
}) : Promise.resolve(1));
function qrCardSvg() {
    const { rows, companyName, siteName, costCenter, logoDataUrl, logoRatio, companyColor } = qrState;
    return window.LayoutSheet.buildCardSvg({
        companyName, siteName: siteName || '', logoDataUrl: logoDataUrl || '', logoRatio, theme: window.LayoutMapSvg.theme(companyColor), zoneName: t('menu.opCentroDistPedidoManual'),
        categories: [{ name: costCenter.name, desc: costCenter.code || '', icon: 'cart', color: '#D9527F', qrRows: rows }],
    }, { cardArea: t('main.layoutTarjetaArea'), cardCategory: t('main.pmQrCategoria').toUpperCase(), cardReview: t('main.pmQrEscanea'), cardEmpty: '', cardFooter: '', cutCaption: t('main.layoutHojaRecorte') }, cardOptions());
}
const cardFile = (ext) => `QR-Pedido-Manual_${(qrState.costCenter.code || qrState.costCenter.name || 'centro').replace(/[^A-Za-z0-9_-]+/g, '-')}_${new Date().toISOString().slice(0, 10)}.${ext}`;
async function downloadQrCard(pdf) {
    if (!qrState) return;
    const btn = qrOverlay.querySelector(pdf ? '#pm-qr-pdf' : '#pm-qr-download');
    const label = btn.textContent;
    btn.disabled = true;
    try {
        const svg = qrCardSvg();
        window.LayoutSheet.saveBlob(pdf ? await window.LayoutSheet.renderPdf(svg) : await window.LayoutSheet.renderPng(svg), cardFile(pdf ? 'pdf' : 'png'));
        Dashboard.showToast(t('main.layoutDescargaLista'), 'success');
    } catch (err) {
        console.error('Pedido Manual: la tarjeta del QR no se pudo descargar', err);
        Dashboard.showToast(t('main.layoutDescargaError'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = label;
    }
}
function renderQrBody() {
    const { costCenter, url, locks } = qrState;
    const body = qrOverlay.querySelector('#pm-qr-body');
    body.innerHTML = `<div class="pm-qr-card" aria-label="${esc(`${costCenter.code ? `${costCenter.code} · ` : ''}${costCenter.name}`)}">${qrCardSvg()}</div><small class="pm-qr-url">${esc(url)}</small>
        <div class="pm-qr-actions"><button type="button" class="btn" id="pm-qr-download">${esc(t('main.pmQrDescargar'))}</button><button type="button" class="btn btn-secondary" id="pm-qr-pdf">${esc(t('main.layoutDescargarPdf'))}</button><button type="button" class="btn btn-secondary" id="pm-qr-copy">${esc(t('main.pmQrCopiar'))}</button><button type="button" class="btn btn-secondary" id="pm-qr-close">${esc(t('main.pmQrCerrar'))}</button></div>
        ${qrState.canLock ? `<div><h4>${esc(t('main.pmCandadoTitulo'))}</h4><label class="pm-qr-lock"><input type="checkbox" id="pm-lock-register"${locks.register ? ' checked' : ''}> ${esc(t('main.pmCandadoRegistrar'))}</label><label class="pm-qr-lock"><input type="checkbox" id="pm-lock-signin"${locks.signin ? ' checked' : ''}> ${esc(t('main.pmCandadoSesion'))}</label></div>` : ''}`;
    body.querySelector('#pm-qr-download').addEventListener('click', () => downloadQrCard(false));
    body.querySelector('#pm-qr-pdf').addEventListener('click', () => downloadQrCard(true));
    body.querySelector('#pm-qr-close').addEventListener('click', () => { qrOverlay.hidden = true; });
    body.querySelector('#pm-qr-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); Dashboard.showToast(t('main.pmQrCopiado'), 'success'); } catch (err) { window.prompt(t('main.pmQrCopiar'), url); }
    });
    body.querySelectorAll('#pm-lock-register, #pm-lock-signin').forEach((box) => box.addEventListener('change', saveLocks));
}
async function saveLocks() {
    const locks = { register: qrOverlay.querySelector('#pm-lock-register').checked, signin: qrOverlay.querySelector('#pm-lock-signin').checked };
    try {
        const res = await fetch(`${API}/qr-locks?costCenterId=${qrState.costCenter.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ locks }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'warning'); renderQrBody(); return; }
        qrState.locks = body.locks;
        Dashboard.showToast(t('main.pmCandadoGuardado'), 'success');
    } catch (err) {
        console.error('Pedido Manual: failed to save locks', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
async function openQr() {
    const selected = Dashboard.getSelectedCostCenterIds();
    if (!selected || !selected.length) { Dashboard.showToast(t('main.pmQrElige'), 'warning'); return; }
    if (selected.length > 1) { Dashboard.showToast(t('main.pmQrVarios'), 'warning'); return; }
    try {
        const res = await fetch(`${API}/qr?costCenterId=${selected[0]}`, { credentials: 'include' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(body.code === 'NOLAYOUT' ? t('main.pmQrSinLayout') : (body.message || Dashboard.t('admin.saveError')), 'warning'); return; }
        ensureQrOverlay();
        qrState = { rows: body.qrRows, companyName: body.companyName, siteName: body.siteName, costCenter: body.costCenter, url: body.url, locks: body.locks, canLock: !!body.canLock, logoDataUrl: body.logoDataUrl || '', companyColor: body.companyColor || '', logoRatio: await logoRatioOf(body.logoDataUrl) };
        qrOverlay.querySelector('#pm-qr-title').textContent = t('main.pmQrTitulo');
        renderQrBody();
        qrOverlay.hidden = false;
    } catch (err) {
        console.error('Pedido Manual: failed to load QR', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
document.getElementById('pm-qr-btn')?.addEventListener('click', openQr);
})();
