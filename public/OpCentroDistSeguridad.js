// ---------------------------------------------------------------------------
// Seguridad (Operaciones, C. Distribución): la BASE DE REGISTROS (con usuario) de las revisiones que se hacen con el QR de cada elemento de Seguridad del Layout (extintor, hidrante, puerta de emergencia,
// botiquín…): quién revisó, si el elemento quedó BIEN o CON FALLA, la nota que dejó, la hora (se guarda en UTC y aquí se ve en tu hora, con el UTC al pasar el cursor) y la foto de la revisión, tomada con la cámara
// en vivo. Trae las columnas de Control Interno (empresa, área, módulo, pantalla y centro de costos…) para distinguir cuando se juntan varios sitios. Lo que llega del QR no se puede cambiar de lugar ni de hora ni
// de resultado ni de foto; sí se puede CORREGIR quién revisó con el lápiz de cada renglón, según el permiso Modificar de esa columna en el árbol (con autorización del jefe cuando toca): el registro queda marcado
// «Editado» y el valor de antes queda en el historial de cambios. Con el permiso Eliminar se puede quitar un registro (el estado del elemento en el Layout se vuelve a calcular con las revisiones que quedan).
// Las filas salen del servidor (GET /api/business/safety-checks, la corrección es PATCH /api/business/safety-checks/:id) y las fotos de GET /api/business/safety-checks/:id/photo.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'seguridad';
const API = '/api/business/safety-checks';
const DELETE_AUTH_COL = 'colSgDeleteAuth';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['colSysCentroCostos', 'colSgZona', 'colSgElemento', 'colSgNombre', 'colSgLocalizador', 'colSgQuien', 'colSgResultado', 'colSgNota', 'colSgOrigen'];

const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
// Lo que el servidor dice que puede hacer quien ve la pantalla (viene con la lista): qué columnas puede corregir y si puede eliminar.
let editable = {};
let canDelete = false;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Seguridad failed to initialize:', err);
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
// El resultado de la revisión: Bien (verde) o Con falla (rojo, el mismo estilo de «Fuera de rango» en Temperaturas).
function resultCell(col, r) {
    const td = document.createElement('td');
    td.dataset.col = col;
    const tag = document.createElement('span');
    tag.className = 'rel-tag';
    if (r.result === 'fail') { tag.classList.add('rel-class-cuarentena'); tag.textContent = t('main.sgResultadoFalla'); } else { tag.classList.add('rel-tag-ok'); tag.textContent = t('main.sgResultadoBien'); }
    td.appendChild(tag);
    return td;
}
function photoCell(col, r) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (!r.hasPhoto) { td.textContent = '—'; return td; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lim-photo';
    btn.setAttribute('aria-label', t('main.sgFotoVer'));
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = `${API}/${r.id}/photo?thumb=1`; // la miniatura; el visor abre la foto completa
    btn.appendChild(img);
    btn.addEventListener('click', () => openViewer(r));
    td.appendChild(btn);
    return td;
}
// El elemento con su tipo (E001 · Extintor); un tipo que la pantalla no conoce se muestra tal cual.
function elementText(r) {
    if (!r.elementCode) return '';
    // un hidrante se nombra por su modelo (Hidrante de columna, Gabinete contra incendio…); sin modelo, solo «Hidrante»
    if (r.elementType === 'hydrant' && r.elementModel) {
        const mk = `main.layoutType_hydrant_${r.elementModel}`;
        const ml = Dashboard.t(mk);
        if (ml && ml !== mk) return `${r.elementCode} · ${ml}`;
    }
    const key = `main.layoutType_safety_${r.elementType}`;
    const label = Dashboard.t(key);
    return `${r.elementCode} · ${label && label !== key ? label : (r.elementType || '')}`;
}

// Los datos que se pueden corregir de una revisión: solo quién la hizo (el resultado, la hora, la nota y la foto son la prueba de lo que pasó). Si el usuario no puede modificarlo según el árbol aparece apagado.
function editFields(r) {
    return [{ key: 'name', label: t('main.colSgQuien'), kind: 'text', value: r.name, enabled: !!editable.name, hint: editable.name ? '' : t('main.recEditSinPermiso') }];
}
// El origen de la revisión; si ya se corrigió lleva la marca «Editado» (al pasar el cursor: quién y cuándo).
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
        cell('colCatRegistroUnico', `SEG-${r.id}`, 'col-system'),
        cell('colSgZona', r.zoneName), cell('colSgElemento', elementText(r)), cell('colSgNombre', r.elementName), cell('colSgLocalizador', r.locator, 'rel-locator'), cell('colSgQuien', r.name),
        timeCell('colSgMomento', r.checkedAt), resultCell('colSgResultado', r), cell('colSgNota', r.note), photoCell('colSgFoto', r),
        originCell('colSgOrigen', r.source === 'app' ? t('main.sgOrigenApp') : t('main.sgOrigenQr'), r),
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
        // Solo las revisiones de los centros de costos marcados arriba.
        const selected = Dashboard.getSelectedCostCenterIds();
        const rows = body.checks.filter((r) => !selected || !r.cc || selected.includes(r.cc));
        tbody.innerHTML = '';
        const note = body.truncated ? t('main.sgCortado', { n: body.max }) : '';
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
        console.error('Seguridad: failed to load records', err);
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

// Corregir una revisión: abre la ventanita con lo que se puede corregir (quién revisó) y manda al servidor SOLO lo que cambió. El servidor decide: lo aplica, lo manda a autorizar o avisa que no hay permiso.
function editRecord(r, tr) {
    RecordEdit.open({ title: t('main.recEditTitulo'), subtitle: `SEG-${r.id} · ${r.elementCode || ''}`, fields: editFields(r), save: (patch) => saveEdit(r, tr, patch) });
}
async function saveEdit(r, tr, patch) {
    const res = await fetch(`${API}/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: RecordEdit.errorText(body.code) };
    const names = (list) => list.map((fk) => t(fk)).join(', ');
    if (body.rejectedFields && body.rejectedFields.length) Dashboard.showToast(`${t('main.fieldLocked')}: ${names(body.rejectedFields)}`, 'warning');
    if (body.pendingFields && body.pendingFields.length) Dashboard.showToast(`${t('main.changePending')}: ${names(body.pendingFields)}`, 'info');
    if (!(body.rejectedFields && body.rejectedFields.length) && !(body.pendingFields && body.pendingFields.length)) Dashboard.showToast(t('main.recEditGuardado'), 'success');
    if (body.check) {
        const next = buildRow(body.check);
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
        console.error('Seguridad: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// ---- visor de la foto de la revisión -----------------------------------------------------------------------------------------------------
let viewerEl = null;
function openViewer(r) {
    if (!viewerEl) {
        viewerEl = document.createElement('div');
        viewerEl.className = 'modal-overlay';
        viewerEl.hidden = true;
        viewerEl.innerHTML = '<div class="modal-panel lim-viewer" role="dialog" aria-modal="true"><h3 id="sg-viewer-title"></h3><img id="sg-viewer-img" alt=""></div>';
        document.body.appendChild(viewerEl);
        viewerEl.addEventListener('click', (event) => { if (event.target === viewerEl) viewerEl.hidden = true; });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') viewerEl.hidden = true; });
    }
    viewerEl.querySelector('#sg-viewer-title').textContent = `${r.elementCode || ''} · ${r.result === 'fail' ? t('main.sgResultadoFalla') : t('main.sgResultadoBien')} · ${r.name || ''}`;
    viewerEl.querySelector('#sg-viewer-img').src = `${API}/${r.id}/photo`;
    viewerEl.hidden = false;
}
})();
