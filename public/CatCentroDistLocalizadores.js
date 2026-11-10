// ---------------------------------------------------------------------------
// Localizadores (Catálogos, C. Distribución): la lista de TODOS los localizadores que el Layout de cada centro de costos va creando, completos o a medias
// (una fila por zona, por huella, por activo y por cada posición completa de 6 piezas), con toda la estructura: compañía, centro de costos, almacén, sub almacén,
// zona, huella, activo, nivel, espacio y posición. Es SOLO LECTURA: un localizador se modifica únicamente desde el Layout (por eso aquí no hay Nuevo ni
// Editar); el paso «Localizadores» del Layout trae a esta pantalla. Las filas salen del servidor (GET /api/business/locators).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'localizadores';
const API = '/api/business/locators';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['colLocCompania', 'colLocCentroCostos', 'colLocAlmacen', 'colLocSubAlmacen', 'colLocZona', 'colLocHuella', 'colLocActivo', 'colLocLocalizador', 'colLocAlcance', 'colLocEstado'];

const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Localizadores failed to initialize:', err);
    }
})();

// ---- tabla --------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' || value === 0 ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}

function tagCell(col, className, text) {
    const td = document.createElement('td');
    td.dataset.col = col;
    const tag = document.createElement('span');
    tag.className = `rel-tag ${className}`;
    tag.textContent = text;
    td.appendChild(tag);
    return td;
}

// «Zona 6 (Z006)», «H003 · Frente», «A003 · Anaquel»: el código que va en el localizador y, al lado, cómo se llama o qué es.
const zoneText = (r) => (r.zoneCode ? (r.zoneName ? `${r.zoneName} (${r.zoneCode})` : r.zoneCode) : '');
const footprintText = (r) => (r.footprintCode ? (r.footprintName ? `${r.footprintCode} · ${r.footprintName}` : r.footprintCode) : '');
const assetText = (r) => (r.spaceCode ? `${r.spaceCode} · ${t(`main.layoutType_space_${r.spaceType || 'rack'}`)}` : '');

function buildRow(r, center, index) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = `${r.cc}:${index}`;
    const system = center.system || {};
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, system[key], 'col-system')),
        cell('colCatRegistroUnico', `L${r.cc}-${r.locator || r.footprintId || index}`, 'col-system'),
        cell('colLocCompania', center.company), cell('colLocCentroCostos', center.name), cell('colLocAlmacen', r.warehouse), cell('colLocSubAlmacen', r.subWarehouse),
        cell('colLocZona', zoneText(r)), cell('colLocHuella', footprintText(r)), cell('colLocActivo', assetText(r)),
        cell('colLocNivel', r.level), cell('colLocColumna', r.slot), cell('colLocProfundidad', r.position),
        cell('colLocLocalizador', r.locator, 'rel-locator'),
        cell('colLocAlcance', t(`main.locAlcance_${r.scope}`)),
        tagCell('colLocEstado', r.complete ? 'rel-tag-ok' : 'rel-tag-partial', t(r.complete ? 'main.locEstadoCompleto' : 'main.locEstadoAMedias')),
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

// Las filas se dibujan por tandas cediéndole el control al navegador entre una y otra (con miles de localizadores dibujarlos de un golpe congelaría la pantalla) y una recarga que llega a la mitad
// cancela la anterior (renderToken). Mientras se llena sale «Cargando filas… X de Y» y, si el servidor cortó la lista, el aviso de que se muestran solo los primeros.
const ROW_CHUNK = 200;
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
        if (token !== renderToken) return; // llegó otra recarga después de esta
        // Solo los localizadores de los centros de costos marcados arriba.
        const selected = Dashboard.getSelectedCostCenterIds();
        const rows = body.locators.filter((r) => !selected || selected.includes(r.cc));
        tbody.innerHTML = '';
        const note = body.truncated ? t('main.locTruncated', { n: body.max }) : '';
        if (!rows.length) { setNote(note); ensureEmptyState(); return; }
        for (let from = 0; from < rows.length; from += ROW_CHUNK) {
            if (token !== renderToken) return;
            const fragment = document.createDocumentFragment();
            rows.slice(from, from + ROW_CHUNK).forEach((r, i) => fragment.appendChild(buildRow(r, body.centers[r.cc] || {}, from + i)));
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
        console.error('Localizadores: failed to load records', err);
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
})();
