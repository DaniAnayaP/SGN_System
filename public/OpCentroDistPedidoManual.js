// ---------------------------------------------------------------------------
// Pedido Manual (Operaciones, C. Distribución): la BASE DE PEDIDOS (con usuario) que llegan del QR de cada centro de costos. Quien escanea el QR busca el artículo (código, descripción, unidad de medida o categoría),
// pone la cantidad y envía; aquí cada artículo pedido es un renglón con su folio (un pedido con varios artículos comparte folio, quién lo pidió y la hora). La hora la pone el servidor en UTC y aquí se ve en tu
// hora (con el UTC al pasar el cursor). Trae las columnas de Control Interno. El estatus (Pendiente / Surtido) lo cambia quien tiene Ver y Operar en la columna Estatus; quién pidió y la cantidad se pueden
// CORREGIR con el lápiz según el permiso Modificar de cada columna (con autorización del jefe cuando toca) y el renglón queda marcado «Editado». Con el permiso Eliminar se puede quitar un renglón. El botón QR
// (con el permiso de su columna) muestra el QR del centro de costos marcado y los candados de ese QR. Las filas salen del servidor (GET /api/business/pedido-manual).
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
const SEARCH_COLUMNS = ['colSysCentroCostos', 'colPmFolio', 'colPmSolicitante', 'colPmCodigo', 'colPmDescripcion', 'colPmUdm', 'colPmCategoria', 'colPmEstatus', 'colPmOrigen'];
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

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Pedido Manual failed to initialize:', err);
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
// Fecha y hora en la zona de quien la ve; al pasar el cursor, el UTC con el que se guardó.
function timeCell(col, iso, receivedIso) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (!iso) { td.textContent = '—'; return td; }
    const d = new Date(iso);
    td.textContent = d.toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    td.title = `UTC ${iso.replace('T', ' ').replace('Z', '')}`;
    // un pedido que se mandó sin señal desde la App trae la hora del celular; el servidor lo recibió más tarde
    if (receivedIso) td.title += ` · ${t('main.pmRecibido')}: UTC ${receivedIso.replace('T', ' ').replace('Z', '')}`;
    return td;
}
function quantityText(q) {
    return Number(q).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 3 });
}
// El estatus: quien puede cambiarlo ve un selector; los demás, el nombre. Al pasar el cursor: quién y cuándo lo cambió por última vez.
function statusCell(r, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'colPmEstatus';
    const title = r.statusAt ? `${r.statusBy || '—'} · ${new Date(r.statusAt).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (UTC ${r.statusAt.replace('T', ' ').replace('Z', '')})` : '';
    if (!canStatus) {
        const tag = document.createElement('span');
        tag.className = 'rel-tag';
        tag.textContent = t(`main.pmEstatus_${r.status}`);
        if (title) tag.title = title;
        td.appendChild(tag);
        return td;
    }
    const select = document.createElement('select');
    select.className = 'pm-status';
    select.dataset.s = r.status;
    select.setAttribute('data-help-key', 'pmEstatus');
    select.setAttribute('aria-label', t('main.colPmEstatus'));
    if (title) select.title = title;
    STATUSES.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = t(`main.pmEstatus_${s}`);
        if (s === r.status) opt.selected = true;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => changeStatus(r, tr, select));
    td.appendChild(select);
    return td;
}
async function changeStatus(r, tr, select) {
    const next = select.value;
    select.disabled = true;
    try {
        const res = await fetch(`${API}/${r.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status: next }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.order) { select.value = r.status; Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'warning'); return; }
        const row = buildRow(body.order);
        row.hidden = tr.hidden;
        tr.replaceWith(row);
        Dashboard.showToast(t('main.pmEstatusCambiado'), 'success');
    } catch (err) {
        console.error('Pedido Manual: failed to change status', err);
        select.value = r.status;
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        select.disabled = false;
    }
}
// Lo que se puede corregir: quién pidió (vale para todo el pedido) y la cantidad; la hora, el artículo y el centro nunca cambian. Apagado si la persona no puede modificar esa columna según el árbol.
function editFields(r) {
    return [
        { key: 'name', label: t('main.colPmSolicitante'), kind: 'text', value: r.name, enabled: !!editable.name, hint: editable.name ? '' : t('main.recEditSinPermiso') },
        { key: 'quantity', label: t('main.colPmCantidad'), kind: 'number', value: r.quantity, enabled: !!editable.quantity, hint: editable.quantity ? '' : t('main.recEditSinPermiso') },
    ];
}
// El origen (QR o con sesión); si ya se corrigió lleva la marca «Editado» (al pasar el cursor: quién y cuándo).
function originCell(col, text, r) {
    const td = cell(col, text);
    if (r.editedAt) {
        const tag = document.createElement('span');
        tag.className = 'rel-tag rec-edit-tag';
        tag.setAttribute('data-help-key', 'recEditTag');
        tag.textContent = t('main.recEditado');
        const when = new Date(r.editedAt).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        tag.title = `${t('main.recEditadoPor', { who: r.editedBy || '—', when })} (UTC ${r.editedAt.replace('T', ' ').replace('Z', '')})`;
        td.appendChild(tag);
    }
    return td;
}
function actionsCell(r, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    if (editFields(r).some((f) => f.enabled)) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'admin-icon-btn';
        edit.setAttribute('data-help-key', 'recEdit');
        edit.setAttribute('aria-label', t('main.recEditBoton'));
        edit.title = t('main.recEditBoton');
        edit.innerHTML = '<i class="bx bx-edit-alt" aria-hidden="true"></i>';
        edit.addEventListener('click', () => editRecord(r, tr));
        td.appendChild(edit);
    }
    if (canDelete || Dashboard.hasColumnDeleteGrant(TABLE_KEY, DELETE_AUTH_COL)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'admin-icon-btn admin-icon-btn-danger';
        btn.setAttribute('data-help-key', 'delete');
        btn.setAttribute('aria-label', t('admin.delete'));
        btn.title = t('admin.delete');
        btn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        btn.addEventListener('click', () => deleteRecord(r, tr));
        td.appendChild(btn);
    }
    return td;
}
// Para cuándo se quiere ese renglón: un día (AAAA-MM-DD, sin hora ni zona) o «Lo antes posible».
function needByText(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return t('main.pmLoAntesPosible');
    const d = new Date(`${day}T00:00:00Z`);
    const mon = new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-US' : 'es-MX', { timeZone: 'UTC', month: 'short' }).format(d).replace('.', '');
    return `${String(d.getUTCDate()).padStart(2, '0')}/${mon}/${d.getUTCFullYear()}`;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    const system = r.system || {};
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, system[key], 'col-system')),
        cell('colCatRegistroUnico', `${r.folio}-${r.lineNo}`, 'col-system'),
        cell('colPmFolio', r.folio), timeCell('colPmFechaHora', r.requestedAt, r.receivedAt), cell('colPmSolicitante', r.name), cell('colPmCodigo', r.code), cell('colPmDescripcion', r.description), cell('colPmUdm', r.uom),
        cell('colPmCategoria', r.categories), cell('colPmCantidad', quantityText(r.quantity), 'col-number'), cell('colPmFechaRequerida', needByText(r.needBy)), statusCell(r, tr),
        originCell('colPmOrigen', t(r.source === 'qr' ? 'main.pmOrigenQr' : (r.source === 'app' ? 'main.pmOrigenApp' : 'main.pmOrigenUsuario')), r),
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
        document.getElementById('pm-qr-btn').hidden = !canQr;
        // Solo los pedidos de los centros de costos marcados arriba.
        const selected = Dashboard.getSelectedCostCenterIds();
        const rows = body.orders.filter((r) => !selected || !r.cc || selected.includes(r.cc));
        tbody.innerHTML = '';
        const note = body.truncated ? t('main.pmCortado', { n: body.max }) : '';
        if (!rows.length) { setNote(note); ensureEmptyState(); return; }
        for (let from = 0; from < rows.length; from += ROW_CHUNK) {
            if (token !== renderToken) return;
            const fragment = document.createDocumentFragment();
            rows.slice(from, from + ROW_CHUNK).forEach((r) => fragment.appendChild(buildRow(r)));
            tbody.appendChild(fragment);
            if (from + ROW_CHUNK < rows.length) {
                setNote(t('main.relLoadingRows', { done: Math.min(from + ROW_CHUNK, rows.length), total: rows.length }));
                await nextTurn();
            }
        }
        if (token !== renderToken) return;
        setNote(note);
        applyFilters();
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
        const haystack = SEARCH_COLUMNS.map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '').join(' ');
        tr.hidden = !SearchSyntax.matches('contains', text, haystack);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);

// Corregir quién pidió o la cantidad: manda al servidor SOLO lo que cambió. El servidor decide: lo aplica, lo manda a autorizar o avisa que no hay permiso.
function editRecord(r, tr) {
    RecordEdit.open({ title: t('main.recEditTitulo'), subtitle: `${r.folio} · ${r.code}`, fields: editFields(r), save: (patch) => saveEdit(r, tr, patch) });
}
async function saveEdit(r, tr, patch) {
    const res = await fetch(`${API}/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: RecordEdit.errorText(body.code) };
    const names = (list) => list.map((fk) => t(fk)).join(', ');
    if (body.rejectedFields && body.rejectedFields.length) Dashboard.showToast(`${t('main.fieldLocked')}: ${names(body.rejectedFields)}`, 'warning');
    if (body.pendingFields && body.pendingFields.length) Dashboard.showToast(`${t('main.changePending')}: ${names(body.pendingFields)}`, 'info');
    if (!(body.rejectedFields && body.rejectedFields.length) && !(body.pendingFields && body.pendingFields.length)) Dashboard.showToast(t('main.recEditGuardado'), 'success');
    if (body.order) {
        const next = buildRow(body.order);
        next.hidden = tr.hidden;
        tr.replaceWith(next);
    }
    return { ok: true };
}
async function deleteRecord(r, tr) {
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
        console.error('Pedido Manual: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// ---- el QR del centro de costos y sus candados ------------------------------------------------------------------------------------------
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
