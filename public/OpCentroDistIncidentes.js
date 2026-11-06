// ---------------------------------------------------------------------------
// Incidentes (Operaciones, C. Distribución): la BASE DE REPORTES (con usuario) que llegan del QR de cada centro de costos. Quien escanea el QR escribe su nombre, elige la zona donde pasó, la categoría (No conformidad
// Mayor, No conformidad Menor o Recomendación) y el criterio de esa categoría (catálogo «Criterios de Incidentes»), cuenta la situación con sus palabras y sube sus evidencias (fotos, mínimo una y sin máximo). Aquí cada
// reporte es un renglón con su folio (INC-0001). La hora la pone el servidor en UTC y aquí se ve en tu hora (con el UTC al pasar el cursor). Trae las columnas de Control Interno. El estatus (Abierto / En atención / Cerrado)
// lo cambia quien tiene Ver y Operar en la columna Estatus; quién reporta, el detalle del lugar y la situación se pueden CORREGIR con el lápiz según el permiso Modificar de cada columna (con autorización del jefe
// cuando toca) y el renglón queda marcado «Editado». Las evidencias se ven en miniatura y se abren grandes con un toque (solo con la columna Evidencias en el árbol). Con el permiso Eliminar se puede quitar un reporte.
// El botón QR (con el permiso de su columna) muestra el QR del centro de costos marcado y los candados de ese QR. Las filas salen del servidor (GET /api/business/incidentes).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'incidentes';
const API = '/api/business/incidentes';
const DELETE_AUTH_COL = 'colIncDeleteAuth';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['colSysCentroCostos', 'colIncFolio', 'colIncQuien', 'colIncLugar', 'colIncDetalle', 'colIncCategoria', 'colIncCriterio', 'colIncDescripcion', 'colIncEstatus', 'colIncOrigen'];
const STATUSES = ['open', 'in_progress', 'closed'];
const THUMBS_SHOWN = 3; // miniaturas que se ven en la celda; lo demás sale como «+N»

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
let canPhotos = false;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Incidentes failed to initialize:', err);
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
// La categoría del reporte (la que tenía el criterio al reportar), con su color.
function categoryCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colIncCategoria';
    if (!r.category) { td.textContent = '—'; return td; }
    const tag = document.createElement('span');
    tag.className = 'rel-tag inc-cat';
    tag.dataset.k = r.category;
    tag.textContent = t(`main.incKind_${r.category}`);
    td.appendChild(tag);
    return td;
}
function placeCell(r) {
    const text = [r.zoneCode, r.zoneName].filter(Boolean).join(' · ');
    return cell('colIncLugar', text);
}
// La situación, tal como la escribió quien reportó (con sus saltos de renglón); en la tabla se ven unas líneas y completa al pasar el cursor.
function descriptionCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colIncDescripcion';
    if (!r.description) { td.textContent = '—'; return td; }
    const box = document.createElement('div');
    box.className = 'inc-desc';
    box.textContent = r.description;
    box.title = r.description;
    td.appendChild(box);
    return td;
}
// El estatus: quien puede cambiarlo ve un selector; los demás, el nombre. Al pasar el cursor: quién y cuándo lo cambió por última vez.
function statusCell(r, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'colIncEstatus';
    const title = r.statusAt ? `${r.statusBy || '—'} · ${new Date(r.statusAt).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (UTC ${r.statusAt.replace('T', ' ').replace('Z', '')})` : '';
    if (!canStatus) {
        const tag = document.createElement('span');
        tag.className = 'rel-tag inc-status-tag';
        tag.dataset.s = r.status;
        tag.textContent = t(`main.incEstatus_${r.status}`);
        if (title) tag.title = title;
        td.appendChild(tag);
        return td;
    }
    const select = document.createElement('select');
    select.className = 'inc-status';
    select.dataset.s = r.status;
    select.setAttribute('data-help-key', 'incEstatus');
    select.setAttribute('aria-label', t('main.colIncEstatus'));
    if (title) select.title = title;
    STATUSES.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = t(`main.incEstatus_${s}`);
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
        if (!res.ok || !body.incident) { select.value = r.status; Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'warning'); return; }
        const row = buildRow(body.incident);
        row.hidden = tr.hidden;
        tr.replaceWith(row);
        Dashboard.showToast(t('main.incEstatusCambiado'), 'success');
    } catch (err) {
        console.error('Incidentes: failed to change status', err);
        select.value = r.status;
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        select.disabled = false;
    }
}

// Las evidencias: unas miniaturas y «+N»; un toque abre la evidencia grande. Sin la columna Evidencias en el árbol no llegan ni los ids.
function photosCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colIncEvidencias';
    const ids = canPhotos ? (r.photoIds || []) : [];
    if (!ids.length) { td.textContent = canPhotos && r.photoCount ? String(r.photoCount) : '—'; return td; }
    const wrap = document.createElement('div');
    wrap.className = 'inc-photos';
    wrap.setAttribute('data-help-key', 'incEvidencias');
    ids.slice(0, THUMBS_SHOWN).forEach((id, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lim-photo';
        btn.setAttribute('aria-label', t('main.incFotoVer'));
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = '';
        img.src = `${API}/${r.id}/photo/${id}?thumb=1`; // la miniatura; el visor abre la foto completa
        btn.appendChild(img);
        btn.addEventListener('click', () => openViewer(r, i));
        wrap.appendChild(btn);
    });
    if (ids.length > THUMBS_SHOWN) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'inc-photo-more';
        more.setAttribute('aria-label', t('main.incFotoVer'));
        more.textContent = t('main.incFotoMas', { n: ids.length - THUMBS_SHOWN });
        more.addEventListener('click', () => openViewer(r, THUMBS_SHOWN));
        wrap.appendChild(more);
    }
    td.appendChild(wrap);
    return td;
}
let viewerEl = null;
let viewerState = null;
function showViewerPhoto() {
    const { record, index } = viewerState;
    const ids = record.photoIds || [];
    viewerEl.querySelector('#inc-viewer-title').textContent = `${record.folio} · ${record.criterion || ''}`;
    viewerEl.querySelector('#inc-viewer-img').src = `${API}/${record.id}/photo/${ids[index]}`;
    viewerEl.querySelector('#inc-viewer-count').textContent = t('main.incFotoDe', { n: index + 1, total: ids.length });
    viewerEl.querySelector('#inc-viewer-prev').disabled = index <= 0;
    viewerEl.querySelector('#inc-viewer-next').disabled = index >= ids.length - 1;
}
function stepViewer(delta) {
    if (!viewerState) return;
    const next = viewerState.index + delta;
    if (next < 0 || next >= (viewerState.record.photoIds || []).length) return;
    viewerState.index = next;
    showViewerPhoto();
}
function closeViewer() {
    if (viewerEl) viewerEl.hidden = true;
    viewerState = null;
}
function openViewer(record, index) {
    if (!viewerEl) {
        viewerEl = document.createElement('div');
        viewerEl.className = 'modal-overlay';
        viewerEl.hidden = true;
        viewerEl.innerHTML = `<div class="modal-panel lim-viewer" role="dialog" aria-modal="true" aria-labelledby="inc-viewer-title"><h3 id="inc-viewer-title"></h3><img id="inc-viewer-img" alt="">
            <div class="inc-viewer-nav"><button type="button" class="btn btn-secondary" id="inc-viewer-prev"></button><span id="inc-viewer-count" class="tpl-muted"></span><button type="button" class="btn btn-secondary" id="inc-viewer-next"></button></div>
            <div class="admin-form-actions"><button type="button" class="btn btn-secondary" id="inc-viewer-close"></button></div></div>`;
        document.body.appendChild(viewerEl);
        viewerEl.addEventListener('click', (event) => {
            if (event.target === viewerEl || event.target.closest('#inc-viewer-close')) closeViewer();
            else if (event.target.closest('#inc-viewer-prev')) stepViewer(-1);
            else if (event.target.closest('#inc-viewer-next')) stepViewer(1);
        });
        document.addEventListener('keydown', (event) => {
            if (!viewerState) return;
            if (event.key === 'Escape') closeViewer();
            else if (event.key === 'ArrowLeft') stepViewer(-1);
            else if (event.key === 'ArrowRight') stepViewer(1);
        });
    }
    viewerEl.querySelector('#inc-viewer-prev').textContent = t('main.incFotoAnterior');
    viewerEl.querySelector('#inc-viewer-next').textContent = t('main.incFotoSiguiente');
    viewerEl.querySelector('#inc-viewer-close').textContent = t('main.incFotoCerrar');
    viewerState = { record, index };
    showViewerPhoto();
    viewerEl.hidden = false;
}

// Lo que se puede corregir: quién reporta, el detalle del lugar y la situación; la hora, la zona, la categoría y el criterio nunca cambian. Apagado si la persona no puede modificar esa columna según el árbol.
function editFields(r) {
    const hint = (key) => (editable[key] ? '' : t('main.recEditSinPermiso'));
    return [
        { key: 'name', label: t('main.colIncQuien'), kind: 'text', value: r.name, enabled: !!editable.name, hint: hint('name') },
        { key: 'placeDetail', label: t('main.colIncDetalle'), kind: 'text', maxLength: 200, optional: true, value: r.placeDetail, enabled: !!editable.placeDetail, hint: hint('placeDetail') },
        { key: 'description', label: t('main.colIncDescripcion'), kind: 'textarea', maxLength: 2000, emptyKey: 'main.recEditError_DESC', value: r.description, enabled: !!editable.description, hint: hint('description') },
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
        cell('colCatRegistroUnico', r.folio, 'col-system'),
        cell('colIncFolio', r.folio), timeCell('colIncFechaHora', r.reportedAt), cell('colIncQuien', r.name), placeCell(r), cell('colIncDetalle', r.placeDetail),
        categoryCell(r), cell('colIncCriterio', r.criterion), descriptionCell(r), photosCell(r), statusCell(r, tr),
        originCell('colIncOrigen', t(r.source === 'qr' ? 'main.incOrigenQr' : 'main.incOrigenUsuario'), r),
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
        canPhotos = !!body.canPhotos;
        document.getElementById('inc-qr-btn').hidden = !canQr;
        // Solo los reportes de los centros de costos marcados arriba.
        const selected = Dashboard.getSelectedCostCenterIds();
        const rows = body.incidents.filter((r) => !selected || !r.cc || selected.includes(r.cc));
        tbody.innerHTML = '';
        const note = body.truncated ? t('main.incCortado', { n: body.max }) : '';
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
        console.error('Incidentes: failed to load reports', err);
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

// Corregir quién reporta, el detalle del lugar o la situación: manda al servidor SOLO lo que cambió. El servidor decide: lo aplica, lo manda a autorizar o avisa que no hay permiso.
function editRecord(r, tr) {
    RecordEdit.open({ title: t('main.recEditTitulo'), subtitle: `${r.folio} · ${r.criterion || ''}`, fields: editFields(r), save: (patch) => saveEdit(r, tr, patch) });
}
async function saveEdit(r, tr, patch) {
    const res = await fetch(`${API}/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: RecordEdit.errorText(body.code) };
    const names = (list) => list.map((fk) => t(fk)).join(', ');
    if (body.rejectedFields && body.rejectedFields.length) Dashboard.showToast(`${t('main.fieldLocked')}: ${names(body.rejectedFields)}`, 'warning');
    if (body.pendingFields && body.pendingFields.length) Dashboard.showToast(`${t('main.changePending')}: ${names(body.pendingFields)}`, 'info');
    if (!(body.rejectedFields && body.rejectedFields.length) && !(body.pendingFields && body.pendingFields.length)) Dashboard.showToast(t('main.recEditGuardado'), 'success');
    if (body.incident) {
        const next = buildRow(body.incident);
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
        console.error('Incidentes: failed to delete record', err);
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
    qrOverlay.innerHTML = '<div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="inc-qr-title"><h3 id="inc-qr-title"></h3><div class="pm-qr-panel" id="inc-qr-body"></div></div>';
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
        companyName, siteName: siteName || '', logoDataUrl: logoDataUrl || '', logoRatio, theme: window.LayoutMapSvg.theme(companyColor), zoneName: t('menu.opCentroDistIncidentes'),
        categories: [{ name: costCenter.name, desc: costCenter.code || '', icon: 'alert', color: '#D9443A', qrRows: rows }],
    }, { cardArea: t('main.layoutTarjetaArea'), cardCategory: t('main.incQrCategoria').toUpperCase(), cardReview: t('main.incQrEscanea'), cardEmpty: '', cardFooter: '', cutCaption: t('main.layoutHojaRecorte') }, cardOptions());
}
const cardFile = (ext) => `QR-Incidentes_${(qrState.costCenter.code || qrState.costCenter.name || 'centro').replace(/[^A-Za-z0-9_-]+/g, '-')}_${new Date().toISOString().slice(0, 10)}.${ext}`;
async function downloadQrCard(pdf) {
    if (!qrState) return;
    const btn = qrOverlay.querySelector(pdf ? '#inc-qr-pdf' : '#inc-qr-download');
    const label = btn.textContent;
    btn.disabled = true;
    try {
        const svg = qrCardSvg();
        window.LayoutSheet.saveBlob(pdf ? await window.LayoutSheet.renderPdf(svg) : await window.LayoutSheet.renderPng(svg), cardFile(pdf ? 'pdf' : 'png'));
        Dashboard.showToast(t('main.layoutDescargaLista'), 'success');
    } catch (err) {
        console.error('Incidentes: la tarjeta del QR no se pudo descargar', err);
        Dashboard.showToast(t('main.layoutDescargaError'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = label;
    }
}
function renderQrBody() {
    const { costCenter, url, locks } = qrState;
    const body = qrOverlay.querySelector('#inc-qr-body');
    body.innerHTML = `<div class="pm-qr-card" aria-label="${esc(`${costCenter.code ? `${costCenter.code} · ` : ''}${costCenter.name}`)}">${qrCardSvg()}</div><small class="pm-qr-url">${esc(url)}</small>
        <div class="pm-qr-actions"><button type="button" class="btn" id="inc-qr-download">${esc(t('main.incQrDescargar'))}</button><button type="button" class="btn btn-secondary" id="inc-qr-pdf">${esc(t('main.layoutDescargarPdf'))}</button><button type="button" class="btn btn-secondary" id="inc-qr-copy">${esc(t('main.incQrCopiar'))}</button><button type="button" class="btn btn-secondary" id="inc-qr-close">${esc(t('main.incQrCerrar'))}</button></div>
        ${qrState.canLock ? `<div><h4>${esc(t('main.incCandadoTitulo'))}</h4><label class="pm-qr-lock"><input type="checkbox" id="inc-lock-register"${locks.register ? ' checked' : ''}> ${esc(t('main.incCandadoRegistrar'))}</label><label class="pm-qr-lock"><input type="checkbox" id="inc-lock-signin"${locks.signin ? ' checked' : ''}> ${esc(t('main.incCandadoSesion'))}</label></div>` : ''}`;
    body.querySelector('#inc-qr-download').addEventListener('click', () => downloadQrCard(false));
    body.querySelector('#inc-qr-pdf').addEventListener('click', () => downloadQrCard(true));
    body.querySelector('#inc-qr-close').addEventListener('click', () => { qrOverlay.hidden = true; });
    body.querySelector('#inc-qr-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); Dashboard.showToast(t('main.incQrCopiado'), 'success'); } catch (err) { window.prompt(t('main.incQrCopiar'), url); }
    });
    body.querySelectorAll('#inc-lock-register, #inc-lock-signin').forEach((box) => box.addEventListener('change', saveLocks));
}
async function saveLocks() {
    const locks = { register: qrOverlay.querySelector('#inc-lock-register').checked, signin: qrOverlay.querySelector('#inc-lock-signin').checked };
    try {
        const res = await fetch(`${API}/qr-locks?costCenterId=${qrState.costCenter.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ locks }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'warning'); renderQrBody(); return; }
        qrState.locks = body.locks;
        Dashboard.showToast(t('main.incCandadoGuardado'), 'success');
    } catch (err) {
        console.error('Incidentes: failed to save locks', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
async function openQr() {
    const selected = Dashboard.getSelectedCostCenterIds();
    if (!selected || !selected.length) { Dashboard.showToast(t('main.incQrElige'), 'warning'); return; }
    if (selected.length > 1) { Dashboard.showToast(t('main.incQrVarios'), 'warning'); return; }
    try {
        const res = await fetch(`${API}/qr?costCenterId=${selected[0]}`, { credentials: 'include' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(body.code === 'NOLAYOUT' ? t('main.incQrSinLayout') : (body.message || Dashboard.t('admin.saveError')), 'warning'); return; }
        ensureQrOverlay();
        qrState = { rows: body.qrRows, companyName: body.companyName, siteName: body.siteName, costCenter: body.costCenter, url: body.url, locks: body.locks, canLock: !!body.canLock, logoDataUrl: body.logoDataUrl || '', companyColor: body.companyColor || '', logoRatio: await logoRatioOf(body.logoDataUrl) };
        qrOverlay.querySelector('#inc-qr-title').textContent = t('main.incQrTitulo');
        renderQrBody();
        qrOverlay.hidden = false;
    } catch (err) {
        console.error('Incidentes: failed to load QR', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
document.getElementById('inc-qr-btn')?.addEventListener('click', openQr);
})();
