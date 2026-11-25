// ---------------------------------------------------------------------------
// Análisis › Cadena de Suministro › Análisis fijos › Distribución › Pedidos por sitio (Daniel, 2026-11-25, «Sí al primer análisis fijo»).
// Un análisis FIJO: sus columnas ya vienen armadas y toman lo que se captura en Pedido Manual. Un renglón por sitio de los centros de costos marcados arriba (si no hay ninguno marcado, no hay renglones):
// pedidos, renglones, códigos distintos, renglones pendientes / parciales / surtidos, porcentaje surtido, los pedidos «lo antes posible» y el primer y último pedido. Se puede limitar a un periodo (Desde / Hasta).
// Tabla estándar: filtros, ocultar columnas (se difuminan), descargar lo filtrado. El permiso de cada columna y de cada icono es del árbol (Análisis › Cadena de Suministro › Análisis fijos › Distribución).
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/analisis-fijos/pedidos-por-sitio';
const TABLE = 'pedidos-por-sitio';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const COLUMNS = ['colAnpSitio', 'colAnpPedidos', 'colAnpRenglones', 'colAnpCodigos', 'colAnpPendientes', 'colAnpParciales', 'colAnpSurtidos', 'colAnpPctSurtido', 'colAnpAntesPosible', 'colAnpPrimero', 'colAnpUltimo'];
const t = (key, params) => Dashboard.t(key, params);
const lang = () => (localStorage.getItem('lang') === 'en' ? 'en' : 'es');
const num = (n, digits = 0) => Number(n || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: digits });
const st = { rows: [], text: '', from: '', to: '' };
const wrapper = () => document.querySelector(`[data-table-id="${TABLE}"]`);
const table = () => wrapper().querySelector('table.data-table');
let loadToken = 0;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        const bar = document.getElementById('filter-bar');
        bar?.addEventListener('data-table:filter-apply', () => {
            st.text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
            const from = document.getElementById('anp-from')?.value || '';
            const to = document.getElementById('anp-to')?.value || '';
            const periodChanged = from !== st.from || to !== st.to;
            st.from = from; st.to = to;
            if (periodChanged) load(); else draw();
        });
        bar?.addEventListener('data-table:filter-clear', () => {
            const hadPeriod = !!(st.from || st.to);
            st.text = ''; st.from = ''; st.to = '';
            ['anp-from', 'anp-to'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
            if (hadPeriod) load(); else draw();
        });
        // los sitios y centros de costos marcados arriba mandan: al cambiarlos se vuelve a pedir
        document.addEventListener('sgn:cost-centers-changed', () => load());
        await load();
    } catch (err) {
        console.error('Pedidos por sitio: failed to initialize', err);
    }
})();

async function load() {
    const token = ++loadToken;
    try {
        const params = [Dashboard.enabledCodesParam()];
        if (st.from) params.push(`from=${encodeURIComponent(st.from)}`);
        if (st.to) params.push(`to=${encodeURIComponent(st.to)}`);
        const res = await fetch(`${API}?${params.join('&')}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== loadToken) return;
        st.rows = body.rows || [];
        draw();
    } catch (err) {
        if (token !== loadToken) return;
        console.error('Pedidos por sitio: failed to load', err);
        Dashboard.showToast(t('main.anpLoadError'), 'error');
    }
}

const siteLabel = (r) => (r.siteCode ? r.site : t('main.anpNoSite'));
function visible() {
    if (!st.text) return st.rows;
    return st.rows.filter((r) => `${r.siteCode} ${siteLabel(r)}`.toLowerCase().includes(st.text));
}
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function stampCell(col, iso) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (iso) { const span = document.createElement('span'); Dashboard.renderTimeStamp(span, iso); td.appendChild(span); } else td.textContent = '—';
    return td;
}
function draw() {
    const tbl = table();
    let firstDraw = false;
    if (!tbl.dataset.colInit) {
        firstDraw = true;
        const row = tbl.tHead.rows[0] || tbl.tHead.insertRow();
        row.textContent = '';
        const th = (col, group, key, cls) => {
            const el = document.createElement('th');
            el.dataset.col = col; if (group) el.dataset.group = group;
            el.dataset.i18n = key; el.textContent = t(key);
            if (cls) el.className = cls;
            return el;
        };
        SYSTEM_COLUMN_KEYS.forEach((k) => row.appendChild(th(k, 'menu.classControlInterno', `main.${k}`, 'col-system')));
        COLUMNS.forEach((k) => row.appendChild(th(k, 'menu.anPedidosPorSitio', `main.${k}`, k === 'colAnpSitio' ? '' : 'col-num')));
    }
    const tbody = tbl.tBodies[0];
    tbody.innerHTML = '';
    visible().forEach((r) => {
        const tr = document.createElement('tr');
        tr.dataset.recordId = r.siteCode || 'none';
        tr.append(
            ...SYSTEM_COLUMN_KEYS.map((k) => cell(k, r[k], 'col-system')),
            cell('colAnpSitio', siteLabel(r)),
            cell('colAnpPedidos', num(r.orders), 'col-num'), cell('colAnpRenglones', num(r.lines), 'col-num'), cell('colAnpCodigos', num(r.codes), 'col-num'),
            cell('colAnpPendientes', num(r.pending), 'col-num'), cell('colAnpParciales', num(r.partial), 'col-num'), cell('colAnpSurtidos', num(r.supplied), 'col-num'),
            cell('colAnpPctSurtido', r.pctSupplied === null ? '' : `${num(r.pctSupplied, 1)} %`, 'col-num'), cell('colAnpAntesPosible', num(r.asap), 'col-num'),
            stampCell('colAnpPrimero', r.firstAt), stampCell('colAnpUltimo', r.lastAt),
        );
        tbody.appendChild(tr);
    });
    if (!tbody.querySelector('tr')) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.className = 'data-table-empty-cell';
        td.colSpan = SYSTEM_COLUMN_KEYS.length + COLUMNS.length;
        const inner = document.createElement('div');
        inner.className = 'data-table-empty-inner';
        inner.textContent = t('main.emptyStateText');
        td.appendChild(inner); tr.appendChild(td); tbody.appendChild(tr);
    }
    if (firstDraw && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper(), 0);
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE);
    wrapper().setAttribute('data-help-key', 'anpTable');
    if (Dashboard.attachTableDownloadButton) Dashboard.attachTableDownloadButton(TABLE, { getTitle: () => `${t('menu.anPedidosPorSitio')}_${new Date().toISOString().slice(0, 10)}` });
}
})();
