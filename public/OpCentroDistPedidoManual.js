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
function timeCell(col, iso) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (!iso) { td.textContent = '—'; return td; }
    const d = new Date(iso);
    td.textContent = d.toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    td.title = `UTC ${iso.replace('T', ' ').replace('Z', '')}`;
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
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    const system = r.system || {};
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, system[key], 'col-system')),
        cell('colCatRegistroUnico', `${r.folio}-${r.lineNo}`, 'col-system'),
        cell('colPmFolio', r.folio), timeCell('colPmFechaHora', r.requestedAt), cell('colPmSolicitante', r.name), cell('colPmCodigo', r.code), cell('colPmDescripcion', r.description), cell('colPmUdm', r.uom),
        cell('colPmCategoria', r.categories), cell('colPmCantidad', quantityText(r.quantity), 'col-number'), statusCell(r, tr),
        originCell('colPmOrigen', t(r.source === 'qr' ? 'main.pmOrigenQr' : 'main.pmOrigenUsuario'), r),
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
function qrSvg(rows) {
    const n = rows.length;
    const quiet = 4;
    let path = '';
    rows.forEach((row, y) => { for (let x = 0; x < n; x++) if (row[x] === '1') path += `M${x + quiet} ${y + quiet}h1v1h-1z`; });
    return `<svg viewBox="0 0 ${n + quiet * 2} ${n + quiet * 2}" role="img" aria-label="QR" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
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
// La imagen que se descarga: el nombre de la empresa y del sitio, el QR grande, el centro de costos y la dirección.
function downloadQrPng() {
    if (!qrState) return;
    const { rows, companyName, siteName, costCenter, url } = qrState;
    const n = rows.length;
    const W = 720; const pad = 50;
    const cell = Math.floor((W - pad * 2) / (n + 8));
    const side = cell * (n + 8);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = side + 250;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#2a1b30';
    g.textAlign = 'center';
    g.font = '600 30px sans-serif';
    g.fillText(companyName || '', W / 2, 52);
    g.font = '400 22px sans-serif';
    g.fillText(siteName || '', W / 2, 86);
    g.font = '700 30px sans-serif';
    g.fillText(t('main.pmQrEscanea'), W / 2, 130);
    const ox = (W - side) / 2; const oy = 150;
    g.fillStyle = '#fff';
    g.fillRect(ox, oy, side, side);
    g.fillStyle = '#000';
    rows.forEach((row, y) => { for (let x = 0; x < n; x++) if (row[x] === '1') g.fillRect(ox + (x + 4) * cell, oy + (y + 4) * cell, cell, cell); });
    g.fillStyle = '#2a1b30';
    g.font = '600 28px sans-serif';
    g.fillText(`${costCenter.code ? `${costCenter.code} · ` : ''}${costCenter.name}`, W / 2, oy + side + 44);
    g.font = '400 16px sans-serif';
    g.fillStyle = '#5a4a62';
    g.fillText(url, W / 2, oy + side + 80);
    canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `QR-Pedido-Manual-${(costCenter.code || costCenter.name || 'centro').replace(/[^A-Za-z0-9_-]+/g, '-')}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
}
function renderQrBody() {
    const { rows, companyName, siteName, costCenter, url, locks } = qrState;
    const body = qrOverlay.querySelector('#pm-qr-body');
    body.innerHTML = `<div class="pm-qr-box">${qrSvg(rows)}<b>${esc(t('main.pmQrEscanea'))}</b><span>${esc([companyName, siteName].filter(Boolean).join(' · '))}</span><span>${esc(`${costCenter.code ? `${costCenter.code} · ` : ''}${costCenter.name}`)}</span><small>${esc(url)}</small></div>
        <div class="pm-qr-actions"><button type="button" class="btn" id="pm-qr-download">${esc(t('main.pmQrDescargar'))}</button><button type="button" class="btn btn-secondary" id="pm-qr-copy">${esc(t('main.pmQrCopiar'))}</button><button type="button" class="btn btn-secondary" id="pm-qr-close">${esc(t('main.pmQrCerrar'))}</button></div>
        ${qrState.canLock ? `<div><h4>${esc(t('main.pmCandadoTitulo'))}</h4><label class="pm-qr-lock"><input type="checkbox" id="pm-lock-register"${locks.register ? ' checked' : ''}> ${esc(t('main.pmCandadoRegistrar'))}</label><label class="pm-qr-lock"><input type="checkbox" id="pm-lock-signin"${locks.signin ? ' checked' : ''}> ${esc(t('main.pmCandadoSesion'))}</label></div>` : ''}`;
    body.querySelector('#pm-qr-download').addEventListener('click', downloadQrPng);
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
        qrState = { rows: body.qrRows, companyName: body.companyName, siteName: body.siteName, costCenter: body.costCenter, url: body.url, locks: body.locks, canLock: !!body.canLock };
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
