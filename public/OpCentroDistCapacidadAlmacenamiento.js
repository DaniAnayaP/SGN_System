// ---------------------------------------------------------------------------
// Capacidad Almacenamiento (Operaciones, C. Distribución): una fila por LUGAR de almacenamiento del Layout de cada centro de costos (un hueco: activo × nivel × columna; un activo con un solo hueco es un solo renglón; los
// activos que se miden en m², como el mobiliario operativo, no guardan inventario y no salen). Aquí se elige qué CÓDIGO va en cada lugar y el sistema calcula su capacidad con las medidas del lugar (Layout) y los datos del código
// (Alta Artículos): huellas = cuántas tarimas del código caben en el piso del lugar; capacidad por pallet = cantidad por cama (TI) × camas por pallet (HI); por huella = máxima estiba × por pallet; máxima = huellas × por huella.
// Todavía no hay cantidades en existencia: vendrán de la sección de existencias y transacciones. Las filas salen del servidor (GET /api/business/storage-capacity, que hace las cuentas con LayoutCalc.capacityOf).
// Elegir, cambiar o quitar el código pasa por la tubería de cambios de toda la plataforma: Ver y Operar llena un lugar vacío; cambiarlo o quitarlo pide Modificar (con autorización del jefe cuando toca).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'capacidad-almacenamiento';
const API = '/api/business/storage-capacity';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['colSysCentroCostos', 'colCapUbicacion', 'colCapActivo', 'colCapCodigo', 'colCapDescripcion', 'colCapUdm', 'colCapTipoAlm'];

const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const locale = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, digits = 2) => Number(n).toLocaleString(locale(), { maximumFractionDigits: digits });
// Lo que el servidor dice que puede hacer quien ve la pantalla (viene con la lista).
let canFill = false;
let canChange = false;
let centers = {};
let allRows = [];

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Capacidad Almacenamiento failed to initialize:', err);
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
const intText = (n) => (n > 0 ? num(n, 0) : null);
// La celda del código: quien puede llenarla (o cambiarla) la ve como un botón que abre la búsqueda de códigos; los demás ven el SKU.
function codeCell(r, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'colCapCodigo';
    td.className = 'cap-pick';
    const may = r.code ? canChange : canFill;
    if (!may) {
        td.textContent = r.code ? r.code.sku : '—';
        if (r.code) td.title = `${r.code.upc ? `${r.code.upc} · ` : ''}${r.code.description}`;
        return td;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cap-pick-btn${r.code ? '' : ' empty'}`;
    btn.setAttribute('data-help-key', 'colCapCodigo');
    btn.textContent = r.code ? r.code.sku : t('main.capSinCodigo');
    btn.title = r.code ? t('main.capVerCodigo') : t('main.capElegirCodigo');
    btn.addEventListener('click', () => openPicker(r, tr));
    td.appendChild(btn);
    if (r.assignedBy) td.title = `${r.assignedBy}${r.assignedAt ? ` · ${new Date(r.assignedAt).toLocaleString(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`;
    return td;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id || '');
    tr.dataset.key = r.key;
    tr.dataset.cc = String(r.cc);
    const system = (centers[r.cc] && centers[r.cc].system) || {};
    const c = r.code;
    const k = r.calc;
    const missing = k ? k.missing : [];
    const calcCell = (col, value) => {
        const td = cell(col, value, 'col-number cap-calc');
        if (c && value === null && missing.length) td.title = t('main.capFaltan', { datos: missing.map((m) => t(`main.capFalta_${m}`)).join(', ') });
        return td;
    };
    const huellasText = !k || k.huellas === null ? null : (k.huellas === 0 ? t('main.capNoCabe') : num(k.huellas, 0));
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, system[key], 'col-system')),
        cell('colCatRegistroUnico', r.locator, 'col-system'),
        cell('colCapUbicacion', r.locator), cell('colCapActivo', r.typeName), cell('colCapLargo', num(r.l), 'col-number'), cell('colCapFondo', num(r.w), 'col-number'), cell('colCapAlto', r.h > 0 ? num(r.h) : null, 'col-number'), cell('colCapM2', num(r.m2), 'col-number'),
        codeCell(r, tr), cell('colCapDescripcion', c ? c.description : null), cell('colCapUdm', c ? c.uom : null),
        cell('colCapTipoAlm', c && ((c.storageTypes && c.storageTypes.length) || c.storageType) ? ((c.storageTypes && c.storageTypes.length) ? c.storageTypes : [c.storageType]).map((k) => t(`main.storageType_${k}`)).join(' · ') : null), cell('colCapBase', c && c.length > 0 && c.width > 0 ? `${num(c.length, 1)} × ${num(c.width, 1)}` : null, 'col-number'),
        cell('colCapTi', c ? intText(c.ti) : null, 'col-number'), cell('colCapHi', c ? intText(c.hi) : null, 'col-number'), cell('colCapEstiba', c ? intText(c.stack) : null, 'col-number'),
        calcCell('colCapHuellas', huellasText),
        calcCell('colCapPorPallet', k && k.perPallet !== null ? num(k.perPallet, 0) : null), calcCell('colCapPorHuella', k && k.perHuella !== null ? num(k.perHuella, 0) : null), calcCell('colCapMaxima', k && k.max !== null ? num(k.max, 0) : null),
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
    inner.textContent = t('main.capSinLugares');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}
// Las cifras de arriba: lo que se ve (los centros de costos marcados), no toda la empresa.
function renderKpis(rows) {
    const withCode = rows.filter((r) => r.code);
    const incomplete = withCode.filter((r) => r.calc && r.calc.missing.length);
    const tiles = [
        [t('main.capKpiUbicaciones'), num(rows.length, 0), ''],
        [t('main.capKpiM2'), num(rows.reduce((a, r) => a + (r.m2 || 0), 0)), ''],
        [t('main.capKpiConCodigo'), num(withCode.length, 0), ''],
        [t('main.capKpiSinCodigo'), num(rows.length - withCode.length, 0), ' cap-kpi-soft'],
        [t('main.capKpiIncompletos'), num(incomplete.length, 0), incomplete.length ? ' cap-kpi-warn' : ' cap-kpi-soft'],
    ];
    document.getElementById('cap-kpis').innerHTML = tiles.map(([label, value, cls]) => `<div class="cap-kpi${cls}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('');
}
// Las filas se dibujan por tandas (con miles no se congela la pantalla) y una recarga que llega a la mitad cancela la anterior.
const ROW_CHUNK = 100;
let renderToken = 0;
const nextTurn = () => (window.scheduler && window.scheduler.yield ? window.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
function setNote(text) {
    const el = document.getElementById('cap-note');
    if (el) el.textContent = text || '';
}
function visibleRows() {
    const selected = Dashboard.getSelectedCostCenterIds();
    return allRows.filter((r) => !selected || !selected.length || selected.includes(r.cc));
}
async function refreshTable() {
    const tbody = getTbody();
    const token = ++renderToken;
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== renderToken) return;
        canFill = !!body.canFill;
        canChange = !!body.canChange;
        centers = body.centers || {};
        allRows = body.rows || [];
        const rows = visibleRows();
        renderKpis(rows);
        tbody.innerHTML = '';
        const note = body.truncated ? t('main.capCortado', { n: body.max }) : t('main.capNota');
        if (!rows.length) { setNote(t('main.capNota')); ensureEmptyState(); return; }
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
        console.error('Capacidad Almacenamiento: failed to load', err);
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

// ---- elegir el código de un lugar ---------------------------------------------------------------------------------------------------
let overlay = null;
let picking = null; // { r, tr }
let searchSeq = 0;
let searchTimer = null;
function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="modal-panel cap-modal" role="dialog" aria-modal="true" aria-labelledby="cap-modal-title"><h3 id="cap-modal-title"></h3><input type="search" id="cap-q" class="cap-q" autocomplete="off" spellcheck="false"><div id="cap-results" class="cap-results" role="listbox"></div><div class="cap-actions"><button type="button" class="btn btn-secondary" id="cap-remove" hidden></button><button type="button" class="btn btn-secondary" id="cap-close"></button></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closePicker(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && overlay && !overlay.hidden) closePicker(); });
    overlay.querySelector('#cap-close').addEventListener('click', closePicker);
    overlay.querySelector('#cap-remove').addEventListener('click', () => assign(null));
    overlay.querySelector('#cap-q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); });
}
function closePicker() {
    if (overlay) overlay.hidden = true;
    picking = null;
}
function openPicker(r, tr) {
    ensureOverlay();
    picking = { r, tr };
    overlay.querySelector('#cap-modal-title').textContent = t('main.capTituloModal', { lugar: r.locator });
    const q = overlay.querySelector('#cap-q');
    q.value = '';
    q.placeholder = t('main.capBuscarCodigo');
    overlay.querySelector('#cap-close').textContent = t('main.pmQrCerrar');
    const remove = overlay.querySelector('#cap-remove');
    remove.textContent = t('main.capQuitarCodigo');
    remove.hidden = !(r.code && canChange);
    overlay.querySelector('#cap-results').innerHTML = `<p class="cap-hint">${esc(t('main.capEscribe'))}</p>`;
    overlay.hidden = false;
    q.focus();
}
async function runSearch() {
    if (!picking) return;
    const term = overlay.querySelector('#cap-q').value.trim();
    const box = overlay.querySelector('#cap-results');
    const mine = ++searchSeq;
    if (term.length < 2) { box.innerHTML = `<p class="cap-hint">${esc(t('main.capEscribe'))}</p>`; return; }
    try {
        const res = await fetch(`/api/business/code-relations/skus?q=${encodeURIComponent(term)}`, { credentials: 'include' });
        if (mine !== searchSeq || !picking) return;
        if (!res.ok) { box.innerHTML = `<p class="cap-hint">${esc(Dashboard.t('admin.loadError'))}</p>`; return; }
        const { skus } = await res.json();
        if (!skus.length) { box.innerHTML = `<p class="cap-hint">${esc(t('main.capSinResultados'))}</p>`; return; }
        box.innerHTML = skus.map((s) => `<button type="button" class="cap-result" data-id="${s.id}"><b>${esc(s.sku)}</b><span>${esc(s.description)}</span><small>${esc([s.upc, s.uom].filter(Boolean).join(' · '))}</small></button>`).join('');
        box.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => assign(Number(b.dataset.id))));
    } catch (err) {
        console.error('Capacidad Almacenamiento: failed to search codes', err);
    }
}
// Asignar (o quitar con null) el código del lugar: el servidor decide si se aplica, queda pendiente de autorización o no hay permiso, y regresa el renglón ya con la capacidad calculada.
async function assign(skuItemId) {
    if (!picking) return;
    const { r, tr } = picking;
    try {
        const res = await fetch(API, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ costCenterId: r.cc, locationKey: r.key, skuItemId }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'warning'); return; }
        const names = (list) => list.map((fk) => t(fk)).join(', ');
        if (body.rejectedFields && body.rejectedFields.length) Dashboard.showToast(t('main.capSinPermiso'), 'warning');
        else if (body.pendingFields && body.pendingFields.length) Dashboard.showToast(`${t('main.changePending')}: ${names(body.pendingFields)}`, 'info');
        else Dashboard.showToast(t(skuItemId === null ? 'main.capQuitado' : 'main.capGuardado'), 'success');
        closePicker();
        if (body.row) {
            const at = allRows.findIndex((x) => x.cc === r.cc && x.key === r.key);
            if (at >= 0) allRows[at] = body.row;
            const next = buildRow(body.row);
            next.hidden = tr.hidden;
            tr.replaceWith(next);
            renderKpis(visibleRows());
        }
    } catch (err) {
        console.error('Capacidad Almacenamiento: failed to assign the code', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
document.addEventListener('dashboard:language-changed', () => refreshTable());
})();
