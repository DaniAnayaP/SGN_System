// ---------------------------------------------------------------------------
// Cadena de Suministro › Centro de Distribución › Cargas Manuales › Registros Información (Daniel, 2026-11-25, «Sí a las propuestas, con la opción B»): el histórico de lo que se carga a mano.
// Un registro es un tipo de dato con su plantilla y su periodicidad: «Cargos por sitio mensuales» (un mes por columna) y «Existencias actuales diarias» (una foto por día). Las cargas SOLO AGREGAN:
// un mes nuevo entra como columna nueva, un código nuevo como renglón nuevo y nada de lo ya cargado se modifica; una carga equivocada se anula (no se borra).
// Dos tablas estándar: «Datos» (un renglón por unidad y código, con un mes —o un día— por columna) y «Cargas» (el historial). «Cargar registro» abre la ventana de carga: con la plantilla (las columnas se reconocen solas)
// o con mi Excel (tal como sale del otro sistema; se emparejan sus columnas una vez); las dos terminan en la misma revisión. Los botones son del árbol (colRegCargarPlantillaAuth, colRegCargarExcelAuth, colRegAnularAuth).
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/manual-registries';
const DATA_TABLE = 'registros';
const LOADS_TABLE = 'registros-cargas';
const DIM_COLUMNS = [
    { col: 'colRegUnidad', field: 'unidad', dim: 'unidad' }, { col: 'colRegUnidadNombre', field: 'unidadNombre', dim: 'unidadNombre' }, { col: 'colRegCodigo', field: 'codigo', dim: 'codigo' },
    { col: 'colRegDescripcion', field: 'descripcion', dim: 'descripcion' }, { col: 'colRegCategoria', field: 'categoria', dim: 'categoria' }, { col: 'colRegUdm', field: 'udm', dim: 'udm' },
];
const LOAD_COLUMNS = ['colRegCargaArchivo', 'colRegCargaOrigen', 'colRegCargaFechaHora', 'colRegCargaPor', 'colRegCargaPeriodos', 'colRegCargaRenglones', 'colRegCargaNuevos', 'colRegCargaAgregados', 'colRegCargaYaEstaba', 'colRegCargaDistintos', 'colRegCargaErrores', 'colRegCargaEstado'];
const ISSUES_SHOWN = 200;
// la paleta de las clasificaciones de columnas (el color de la banda de cada clasificación y los círculos de la ventana de cargar)
const CLASS_COLORS = ['#3f78ad', '#b23fb8', '#2b8456', '#b57a05', '#4f58c2', '#c4473a'];
const FIRST_ROWS = 100; // los renglones que se dibujan al entrar
const NEXT_ROWS = 200; // los que se agregan al bajar o con «Mostrar más»
const t = (key, params) => Dashboard.t(key, params);
const lang = () => (localStorage.getItem('lang') === 'en' ? 'en' : 'es');
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// un solo formateador por idioma: toLocaleString con opciones arma uno nuevo en cada llamada, y la tabla de datos formatea decenas de miles de celdas
const NUM_FORMATS = {};
const num = (n) => {
    const l = lang() === 'en' ? 'en-US' : 'es-MX';
    return (NUM_FORMATS[l] || (NUM_FORMATS[l] = new Intl.NumberFormat(l, { maximumFractionDigits: 3 }))).format(Number(n || 0));
};
const MONTH_ABBR = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] };
function periodLabel(period) {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(period || '');
    if (!m) return String(period || '');
    const abbr = MONTH_ABBR[lang()][Number(m[2]) - 1];
    return m[3] ? `${m[3]}/${abbr}/${m[1]}` : `${abbr}-${m[1].slice(2)}`;
}
const periodKey = (period) => `p_${String(period).replace(/-/g, '_')}`;
const todayStamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const st = { drawn: 0, cf: null, seq: 0, lastLoadId: null, registries: [], key: null, tab: 'data', data: null, loads: null, canTemplate: false, canExcel: false, canAnnul: false, canCreateRegistry: false, text: '', loadsInit: false, loadPick: new Set() };
// El nombre de un registro: los dos de siempre se traducen; los que agregó el cliente llevan el nombre que él les puso.
const regName = (reg) => (reg && (reg.name || (reg.nameKey ? t(reg.nameKey) : ''))) || t('menu.cmRegistrosInformacion');
const currentRegistry = () => st.registries.find((r) => r.key === st.key) || null;
const wrapperOf = (tableId) => document.querySelector(`[data-table-id="${tableId}"]`);
const tableOf = (tableId) => wrapperOf(tableId)?.querySelector('table.data-table');

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await loadRegistries();
        // cada registro agregado tiene su propia pantalla en el menú (?registry=); sin él, el último que se vio
        const wanted = new URLSearchParams(location.search).get('registry') || sessionStorage.getItem('regCurrent');
        st.key = (st.registries.find((r) => r.key === wanted) || st.registries[0] || {}).key || null;
        if (st.key) { try { sessionStorage.setItem('regCurrent', st.key); } catch { /* sin almacenamiento */ } }
        renderManage();
        await refreshData();
        wireStatic();
        openNewFromMenu();
    } catch (err) {
        console.error('Registros Información: failed to initialize', err);
    }
})();

async function loadRegistries() {
    const res = await fetch(API, { credentials: 'include' });
    if (!res.ok) throw new Error('load failed');
    const body = await res.json();
    st.registries = body.registries || [];
    st.canTemplate = !!body.canTemplate; st.canExcel = !!body.canExcel; st.canAnnul = !!body.canAnnul; st.canCreateRegistry = !!body.canCreateRegistry;
}

// Cambiar nombre y desactivar/activar: solo para los registros que agregó el cliente (los dos de siempre no se tocan) y para quien tiene el botón «Crear registro».
function renderManage() {
    let bar = document.getElementById('reg-manage');
    const reg = currentRegistry();
    const show = !!(reg && st.canCreateRegistry); // los de siempre solo traen «Pasar a obsoletos»; los agregados, además, cambiar nombre, convertir y desactivar
    if (!show) { if (bar) bar.remove(); return; }
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'reg-manage';
        bar.className = 'reg-manage';
        bar.setAttribute('data-help-key', 'regManage');
        const row = document.querySelector('.reg-row');
        if (row) row.before(bar); else document.querySelector('.page-content').prepend(bar);
    }
    bar.textContent = '';
    if (reg.status !== 'active') { const off = document.createElement('span'); off.className = 'reg-pill reg-pill-off'; off.textContent = t('main.regStatus_inactive'); bar.appendChild(off); }
    if (reg.obsolete) { const ob = document.createElement('span'); ob.className = 'reg-pill reg-pill-off'; ob.textContent = t('main.regStatus_obsolete'); bar.appendChild(ob); }
    const make = (icon, key, onClick) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-secondary reg-manage-btn';
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i> <span>${esc(t(key))}</span>`;
        btn.addEventListener('click', onClick);
        bar.appendChild(btn);
    };
    if (reg.custom) make('bx-edit', 'main.regRename', () => openRenameRegistry(reg));
    if (reg.custom && reg.kind !== 'tabla' && !reg.lastLoad && !reg.obsolete) make('bx-table', 'main.regToTabla', () => openConvertRegistry(reg)); // solo mientras no tenga cargas
    make(reg.obsolete ? 'bx-archive-out' : 'bx-archive-in', reg.obsolete ? 'main.regRestoreObsolete' : 'main.regMakeObsolete', () => toggleObsolete(reg));
    if (reg.custom) make(reg.status === 'active' ? 'bx-hide' : 'bx-show', reg.status === 'active' ? 'main.regDeactivate' : 'main.regActivate', () => toggleRegistry(reg));
}
// La opción «＋ Agregar nuevo registro» del menú lateral abre esta pantalla con ?nuevo=1: se muestra la ventana de alta (solo con el botón «Crear registro») y se limpia la dirección.
function openNewFromMenu() {
    const params = new URLSearchParams(location.search);
    if (params.get('nuevo') !== '1') return;
    params.delete('nuevo');
    history.replaceState(null, '', params.toString() ? `${location.pathname}?${params}` : location.pathname);
    if (st.canCreateRegistry) openCreateRegistry();
}
function regErrorText(body) {
    const code = body && body.code;
    return ['REG_NAME_REQUIRED', 'REG_NAME_TAKEN', 'REG_KIND', 'REG_FORBIDDEN', 'REG_STATUS', 'REG_BUILTIN', 'REG_HAS_DATA', 'REG_OBSOLETE'].includes(code) ? t(`main.regErr_${code}`) : t('admin.saveError');
}
function openModal(html, helpKey, onReady) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel" role="dialog" aria-modal="true" data-help-key="${helpKey}">${html}</div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    overlay.querySelectorAll('[data-reg-close]').forEach((b) => b.addEventListener('click', close));
    onReady(overlay, close);
}
async function sendRegistry(method, url, body) {
    const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
    return out;
}
// Registro nuevo: nombre, cada cuánto se carga y qué mide. Siempre lleva las mismas columnas de referencia (Unidad, Descripción Unidad, Código, Descripción, Categoría y UDM); al crearlo se abre su pantalla.
function openCreateRegistry() {
    openModal(`<h3>${esc(t('main.regNewTitle'))}</h3>
        <label for="reg-n-name">${esc(t('main.regNewName'))}</label><input type="text" id="reg-n-name" maxlength="80" autocomplete="off">
        <p class="reg-field-label">${esc(t('main.regNewKind'))}</p>
        <div class="an-checks"><label><input type="radio" name="reg-n-kind" value="month" checked> <span>${esc(t('main.regKindMonth'))}</span></label>
        <label><input type="radio" name="reg-n-kind" value="day"> <span>${esc(t('main.regKindDay'))}</span></label>
        <label><input type="radio" name="reg-n-kind" value="tabla"> <span>${esc(t('main.regKindTabla'))}</span></label></div>
        <div id="reg-n-value-wrap"><label for="reg-n-value">${esc(t('main.regNewValue'))}</label><input type="text" id="reg-n-value" maxlength="40" autocomplete="off" placeholder="${esc(t('main.regNewValueDefault'))}"></div>
        <p class="admin-error" id="reg-n-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-reg-go>${esc(t('main.regNewCreate'))}</button><button type="button" class="btn btn-secondary" data-reg-close>${esc(t('main.regCancel'))}</button></div>`, 'regNewDialog', (overlay) => {
        overlay.querySelector('#reg-n-name').focus();
        // una tabla libre no mide un solo valor: lo que mide lo decides al cargar cada archivo
        overlay.addEventListener('change', (event) => { if (event.target.name === 'reg-n-kind') overlay.querySelector('#reg-n-value-wrap').hidden = event.target.value === 'tabla'; });
        overlay.querySelector('[data-reg-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget;
            const el = overlay.querySelector('#reg-n-error');
            btn.disabled = true; el.hidden = true;
            try {
                const out = await sendRegistry('POST', API, { name: overlay.querySelector('#reg-n-name').value, kind: overlay.querySelector('input[name="reg-n-kind"]:checked').value, valueName: overlay.querySelector('#reg-n-value').value });
                sessionStorage.setItem('regCurrent', out.registry.key);
                location.href = `CmRegistrosInformacion.html?registry=${encodeURIComponent(out.registry.key)}`; // el menú ya la trae como pantalla nueva
            } catch (e) { btn.disabled = false; el.textContent = regErrorText(e.body); el.hidden = false; }
        });
    });
}
function openRenameRegistry(reg) {
    openModal(`<h3>${esc(t('main.regRename'))}</h3><label for="reg-r-name">${esc(t('main.regNewName'))}</label><input type="text" id="reg-r-name" maxlength="80" value="${esc(reg.name)}" autocomplete="off">
        <p class="admin-error" id="reg-r-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-reg-go>${esc(t('main.regRename'))}</button><button type="button" class="btn btn-secondary" data-reg-close>${esc(t('main.regCancel'))}</button></div>`, 'regRenameDialog', (overlay) => {
        overlay.querySelector('#reg-r-name').focus();
        overlay.querySelector('[data-reg-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget; btn.disabled = true;
            try {
                await sendRegistry('PATCH', `${API}/${encodeURIComponent(reg.key)}`, { name: overlay.querySelector('#reg-r-name').value });
                location.reload(); // el menú trae el nombre nuevo
            } catch (e) { btn.disabled = false; const el = overlay.querySelector('#reg-r-error'); el.textContent = regErrorText(e.body); el.hidden = false; }
        });
    });
}
// Convertir un registro vacío (mensual o diario) en tabla libre: cualquier Excel, eligiendo el papel de sus columnas en cada carga. Solo se puede mientras no tenga cargas.
function openConvertRegistry(reg) {
    openModal(`<h3>${esc(t('main.regToTablaTitle'))}</h3><p>${esc(t('main.regToTablaText', { name: regName(reg) }))}</p>
        <p class="admin-error" id="reg-c-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-reg-go>${esc(t('main.regToTablaGo'))}</button><button type="button" class="btn btn-secondary" data-reg-close>${esc(t('main.regCancel'))}</button></div>`, 'regToTablaDialog', (overlay) => {
        overlay.querySelector('[data-reg-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget; btn.disabled = true;
            try {
                await sendRegistry('PATCH', `${API}/${encodeURIComponent(reg.key)}`, { kind: 'tabla' });
                location.reload();
            } catch (e) { btn.disabled = false; const el = overlay.querySelector('#reg-c-error'); el.textContent = regErrorText(e.body); el.hidden = false; }
        });
    });
}
// Pasar a «Obsoletos» (o sacarlo de ahí): sus datos y cargas se conservan, ya no recibe cargas y sale en el apartado Obsoletos del menú.
async function toggleObsolete(reg) {
    try {
        await sendRegistry('PATCH', `${API}/${encodeURIComponent(reg.key)}`, { obsolete: !reg.obsolete });
        location.reload(); // el menú lo cambia de apartado
    } catch (e) { Dashboard.showToast(regErrorText(e.body), 'error'); }
}
async function toggleRegistry(reg) {
    try {
        await sendRegistry('PATCH', `${API}/${encodeURIComponent(reg.key)}`, { status: reg.status === 'active' ? 'inactive' : 'active' });
        location.reload(); // sale del menú (o vuelve a salir)
    } catch (e) { Dashboard.showToast(regErrorText(e.body), 'error'); }
}

// ---- la fecha de la última actualización: en la fila de las pestañas, a la derecha; el detalle (quién y de qué archivo) está en la pestaña Cargas ---------------------------------------
function renderUpdated() {
    const box = document.getElementById('reg-updated');
    if (!box) return;
    box.textContent = '';
    const reg = currentRegistry();
    const load = reg && reg.lastLoad;
    box.hidden = !load;
    if (!load) return;
    const label = document.createElement('b');
    label.textContent = `${t('main.regUpdated')} `;
    const when = document.createElement('span');
    Dashboard.renderTimeStamp(when, load.createdAt);
    box.append(label, when);
}

// ---- las tablas ----------------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function stampCell(col, value) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (value) { const span = document.createElement('span'); Dashboard.renderTimeStamp(span, value); td.appendChild(span); } else td.textContent = '—';
    return td;
}
function headerCell(col, group, label, labelKey, extraClass, groupTable) {
    const th = document.createElement('th');
    th.dataset.col = col;
    if (group) th.dataset.group = group;
    if (groupTable) th.dataset.groupTable = groupTable; // la clasificación que le puso la persona (banda de arriba, con su color)
    if (labelKey) { th.dataset.i18n = labelKey; th.textContent = t(labelKey); } else th.textContent = label;
    if (extraClass) th.className = extraClass;
    return th;
}
// La fila de títulos se arma al cargar (los meses cambian con los datos) y recién entonces se le entrega al motor de tablas; una tabla que ya se inició no cambia sus columnas.
function buildHeader(tableId, columns) {
    const table = tableOf(tableId);
    if (!table || table.dataset.colInit) return false;
    const row = table.tHead.rows[0] || table.tHead.insertRow();
    row.textContent = '';
    columns.forEach((c) => row.appendChild(headerCell(c.col, c.group, c.label, c.labelKey, c.cls, c.groupTable)));
    return true;
}
function ensureEmpty(tableId, span) {
    const tbody = tableOf(tableId).tBodies[0];
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = span;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = t('main.emptyStateText');
    td.appendChild(inner); tr.appendChild(td); tbody.appendChild(tr);
}
// Un registro de tabla libre trae sus columnas del servidor (las de su Excel, en su orden, cada una con su papel); los demás tienen las de siempre.
const isFlex = (body) => !!(body && Array.isArray(body.columns));
const FLEX_GROUPS = { key: 'main.regGroupKey', data: 'main.regGroupData', value: 'main.regGroupNew', load: 'main.regGroupLoad' };
const flexColumns = (body) => body.columns.map((c) => {
    let groupTable;
    if (c.cls) { groupTable = `regcls:${c.cls.toLowerCase().replace(/\s+/g, '-')}`; if (Dashboard.setColumnClassMeta) Dashboard.setColumnClassMeta(groupTable, c.cls, CLASS_COLORS[c.color] || CLASS_COLORS[0]); }
    return { col: c.key, group: FLEX_GROUPS[c.group] || FLEX_GROUPS.data, groupTable, label: c.label, cls: c.num ? 'col-num' : '' };
});
const tzOffset = () => new Date().getTimezoneOffset(); // minutos que la hora de quien mira va detrás de UTC: las etiquetas de día y hora de las cargas salen en su hora
function dataColumns(periods) {
    return [
        ...DIM_COLUMNS.map((c) => ({ col: c.col, group: 'menu.cmRegistrosInformacion', labelKey: `main.${c.col}` })),
        ...periods.map((p) => ({ col: periodKey(p), group: 'menu.cmRegistrosInformacion', label: periodLabel(p), cls: 'col-num' })),
    ];
}
function drawData() {
    const body = st.data;
    if (!body) return;
    const wrapper = wrapperOf(DATA_TABLE);
    const flex = isFlex(body);
    const first = buildHeader(DATA_TABLE, flex ? flexColumns(body) : dataColumns(body.periods));
    const table = tableOf(DATA_TABLE);
    const tbody = table.tBodies[0];
    tbody.innerHTML = '';
    st.drawn = 0;
    drawRows(FIRST_ROWS);
    ensureEmpty(DATA_TABLE, flex ? body.columns.length : DIM_COLUMNS.length + body.periods.length);
    if (first && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper, 0);
    // la banda con la clasificación que puso la persona (nombre y color) va ARRIBA y la del tipo de columna (Llave, Dato, Columna nueva) debajo
    if (first && flex && table.tHead) { const mine = table.tHead.querySelector('tr.data-table-group-band-table'); const type = table.tHead.querySelector('tr.data-table-group-band-classification'); if (mine && type) table.tHead.insertBefore(mine, type); }
    if (first && Dashboard.registerServerFilteredTable) Dashboard.registerServerFilteredTable(DATA_TABLE, { onChange: (spec) => { st.cf = spec; refreshData(); }, getValues: fetchColumnValues });
    if (first && Dashboard.registerPartialTable) Dashboard.registerPartialTable(DATA_TABLE, { isComplete: () => !st.data || st.drawn >= st.data.rows.length, loadAll: drawAllRows });
    watchScroll(wrapper);
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(DATA_TABLE);
    wrapper.setAttribute('data-help-key', flex ? 'regTableLibre' : 'regTable');
    if (Dashboard.attachTableDownloadButton) {
        Dashboard.attachTableDownloadButton(DATA_TABLE, { getTitle: () => `${regName(currentRegistry())}_${todayStamp()}`, getNotice: () => (st.data && st.data.truncated ? t('main.regDownloadTruncated', { shown: st.data.rows.length, total: st.data.total }) : ''),
            getFullDownload: (format) => (st.data && (st.data.truncated || isFlex(st.data)) ? `${API}/${encodeURIComponent(st.key)}/export?format=${format}&lang=${lang()}&tz=${tzOffset()}&text=${encodeURIComponent(st.text || '')}${st.cf ? `&cf=${encodeURIComponent(JSON.stringify(st.cf))}` : ''}${visibleColsParam()}&file=${encodeURIComponent(`${regName(currentRegistry())}_${todayStamp()}`)}` : null) });
    }
    updateNote();
    renderButtons();
}
// las columnas que la persona dejó visibles (las ocultas o difuminadas no se bajan), para que la descarga completa del servidor traiga las mismas que la pantalla
function visibleColsParam() {
    const keys = Dashboard.getVisibleColumnKeys ? Dashboard.getVisibleColumnKeys(DATA_TABLE) : null;
    return keys && keys.length ? `&cols=${encodeURIComponent(keys.join(','))}` : '';
}
// Los renglones de la tabla de datos se dibujan por partes: dibujarlos todos de un golpe (hasta 2,000 x 36 columnas) congelaba el navegador varios segundos. Cada parte se arma como UN bloque de HTML.
function rowsHtml(body, from, to) {
    const periodKeys = body.periods.map(periodKey);
    const td = (col, value, cls) => `<td data-col="${col}"${cls ? ` class="${cls}"` : ''}>${value === null || value === undefined || value === '' ? '—' : esc(value)}</td>`;
    const html = [];
    if (isFlex(body)) {
        // tabla libre: cada renglón es una lista de celdas en el orden de las columnas (texto, número o nada)
        for (let i = from; i < to; i += 1) {
            const row = body.rows[i];
            let tr = '<tr>';
            body.columns.forEach((c, k) => { tr += td(c.key, row[k], c.num ? 'col-num' : ''); });
            html.push(`${tr}</tr>`);
        }
        return html.join('');
    }
    for (let i = from; i < to; i += 1) {
        const row = body.rows[i];
        let tr = `<tr data-record-id="${row.id}">`;
        DIM_COLUMNS.forEach((c) => { tr += td(c.col, row[c.field]); });
        body.periods.forEach((p, k) => { tr += td(periodKeys[k], row.values[p] === undefined ? '' : num(row.values[p]), 'col-num'); });
        html.push(`${tr}</tr>`);
    }
    return html.join('');
}
function drawRows(count) {
    const body = st.data;
    const table = tableOf(DATA_TABLE);
    if (!body || !table) return 0;
    const to = Math.min(body.rows.length, st.drawn + count);
    if (to <= st.drawn) return 0;
    table.tBodies[0].insertAdjacentHTML('beforeend', rowsHtml(body, st.drawn, to));
    const added = to - st.drawn;
    st.drawn = to;
    updateNote();
    return added;
}
// Dibuja todo lo que falta (para ordenar, filtrar por columna o descargar lo que se ve).
function drawAllRows() { drawRows(Infinity); return Promise.resolve(true); }
function watchScroll(wrapper) {
    if (!wrapper || wrapper.dataset.regScroll) return;
    wrapper.dataset.regScroll = '1';
    wrapper.addEventListener('scroll', () => {
        if (st.data && st.drawn < st.data.rows.length && wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 800) drawRows(NEXT_ROWS);
    }, { passive: true });
}
// El aviso de abajo: «Mostrando X de Y» con los botones para dibujar más mientras falten renglones por dibujar; si ya están todos los que llegaron pero el registro tiene más, avisa que se acote con el Filtro.
function updateNote() {
    const body = st.data;
    const wrapper = wrapperOf(DATA_TABLE);
    let note = document.getElementById('reg-truncated');
    const partial = !!body && st.drawn < body.rows.length;
    if (!body || !wrapper || (!partial && !body.truncated)) { if (note) note.remove(); return; }
    if (!note) { note = document.createElement('p'); note.id = 'reg-truncated'; note.className = 'admin-hint reg-more'; note.hidden = st.tab !== 'data'; wrapper.after(note); }
    note.textContent = '';
    const text = document.createElement('span');
    text.textContent = partial ? t('main.regShowing', { shown: num(st.drawn), total: num(body.total) }) : t('main.regTruncated', { shown: num(body.rows.length), total: num(body.total) });
    note.appendChild(text);
    if (partial) {
        [['main.regShowMore', () => drawRows(NEXT_ROWS)], ['main.regShowAll', () => drawAllRows()]].forEach(([key, action]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-secondary reg-more-btn';
            btn.setAttribute('data-help-key', 'regShowMore');
            btn.textContent = t(key);
            btn.addEventListener('click', action);
            note.appendChild(btn);
        });
    }
}
// ---- Cargas de una tabla libre: «Sí considerar / No considerar» (la carga que no se considera se ve sombreada), elegir varias a la vez y eliminar los DATOS de las que ya no se ocupan ----
const isFlexReg = () => !!(currentRegistry() && currentRegistry().kind === 'tabla');
// on = se considera; off = una persona dejó de considerarla (sus datos siguen ahí); failed = se cayó (no tiene datos); deleted = sus datos se eliminaron (la línea queda en el historial)
const loadState = (l) => (l.dataDeleted ? 'deleted' : (l.status === 'vigente' ? 'on' : (l.annulledBy === 'sistema' ? 'failed' : 'off')));
async function postLoadAction(loadId, action, body) {
    const res = await fetch(`${API}/${st.key}/loads/${loadId}/${action}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; throw err; }
    return out;
}
const loadActionError = (err) => {
    const code = err && err.body && err.body.code;
    return ['LOAD_ACTIVE', 'LOAD_DATA_DELETED', 'LOAD_FAILED', 'LOAD_NOT_ACTIVE', 'LOAD_NOT_FOUND', 'REG_BUSY', 'DELETE_ERROR', 'REG_FORBIDDEN'].includes(code) ? t(`main.regLoadErr_${code}`) : t('admin.saveError');
};
async function reloadAfterLoadAction() {
    st.loadPick.clear();
    await loadRegistries();
    await Promise.all([refreshData(), refreshLoads()]);
}
// «Sí considerar»: no pide nada, se puede deshacer con «No considerar»
async function considerLoads(loads) {
    let done = 0;
    try {
        for (const l of loads) { await postLoadAction(l.id, 'reconsider'); done += 1; }
        Dashboard.showToast(t('main.regConsiderDone', { n: num(done) }), 'success');
    } catch (err) { Dashboard.showToast(loadActionError(err), 'error'); }
    await reloadAfterLoadAction();
}
// «No considerar» y «Eliminar datos»: una ventana que explica lo que pasa y lo hace carga por carga
function openLoadActionModal({ loads, kind }) {
    const del = kind === 'delete';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    const rowsTotal = loads.reduce((n, l) => n + Number(l.newRows || 0), 0);
    const valuesTotal = loads.reduce((n, l) => n + Number(l.valuesAdded || 0), 0);
    const title = loads.length === 1 ? t(del ? 'main.regDeleteTitle1' : 'main.regNoConsiderTitle1', { file: loads[0].fileName || '' }) : t(del ? 'main.regDeleteTitleN' : 'main.regNoConsiderTitleN', { n: num(loads.length) });
    const files = loads.length > 1 ? `<ul class="reg-lam-files">${loads.slice(0, 8).map((l) => `<li>${esc(l.fileName || '')}</li>`).join('')}${loads.length > 8 ? `<li>…</li>` : ''}</ul>` : '';
    overlay.innerHTML = `<div class="modal-panel exp-panel" role="dialog" aria-modal="true" aria-labelledby="reg-lam-title" data-help-key="${del ? 'regDeleteData' : 'regNoConsider'}">
        <h3 id="reg-lam-title">${esc(title)}</h3>
        ${files}
        <p class="admin-hint">${esc(t(del ? 'main.regDeleteHint' : 'main.regNoConsiderHint'))}</p>
        ${del ? `<p class="reg-lam-sum">${esc(t('main.regDeleteSummary', { rows: num(rowsTotal), values: num(valuesTotal) }))}</p>` : `<label for="reg-lam-note">${esc(t('main.regAnnulNote'))}</label><textarea id="reg-lam-note" rows="3" maxlength="300"></textarea>`}
        <p class="admin-error" id="reg-lam-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn${del ? ' reg-btn-danger' : ''}" data-reg-lam="ok">${esc(t(del ? 'main.regDeleteConfirm' : 'main.regNoConsider'))}</button><button type="button" class="btn btn-secondary" data-reg-lam="cancel">${esc(t('main.regCancel'))}</button></div></div>`;
    document.body.appendChild(overlay);
    let busy = false;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape' && !busy) close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay && !busy) close(); });
    overlay.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-reg-lam]');
        if (!btn || busy) return;
        if (btn.dataset.regLam === 'cancel') { close(); return; }
        busy = true;
        const ok = overlay.querySelector('[data-reg-lam="ok"]');
        ok.disabled = true;
        const err = overlay.querySelector('#reg-lam-error');
        const note = del ? '' : String((overlay.querySelector('#reg-lam-note') || {}).value || '');
        let done = 0;
        try {
            for (const l of loads) {
                ok.textContent = t('main.regLoadWorking', { done: num(done + 1), total: num(loads.length) });
                await postLoadAction(l.id, del ? 'delete-data' : 'annul', del ? {} : { note });
                done += 1;
            }
            close();
            Dashboard.showToast(t(del ? 'main.regDeleteDone' : 'main.regNoConsiderDone', { n: num(done) }), 'success');
            await reloadAfterLoadAction();
        } catch (e) {
            busy = false; ok.disabled = false; ok.textContent = t(del ? 'main.regDeleteConfirm' : 'main.regNoConsider');
            err.textContent = loadActionError(e); err.hidden = false;
            if (done) await reloadAfterLoadAction();
        }
    });
}
// la barra de las cargas elegidas (arriba de la tabla de Cargas)
function renderLoadsBulk() {
    const wrapper = wrapperOf(LOADS_TABLE);
    if (!wrapper) return;
    let bar = document.getElementById('reg-loads-bulk');
    const usable = st.loads ? st.loads.loads.filter((l) => ['on', 'off'].includes(loadState(l))) : [];
    if (!isFlexReg() || !st.canAnnul || !usable.length) { if (bar) bar.remove(); return; }
    const chosen = usable.filter((l) => st.loadPick.has(l.id));
    const on = chosen.filter((l) => loadState(l) === 'on');
    const off = chosen.filter((l) => loadState(l) === 'off');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'reg-loads-bulk';
        bar.className = 'reg-loads-bulk';
        bar.setAttribute('data-help-key', 'regLoadsBulk');
        const zoom = wrapper.previousElementSibling;
        (zoom && zoom.classList.contains('data-table-zoom') ? zoom : wrapper).before(bar);
        bar.addEventListener('click', (event) => {
            const b = event.target.closest('[data-bulk]');
            if (!b) return;
            const usableNow = st.loads ? st.loads.loads.filter((l) => ['on', 'off'].includes(loadState(l))) : [];
            const pickedNow = usableNow.filter((l) => st.loadPick.has(l.id));
            const v = b.dataset.bulk;
            if (v === 'all') { usableNow.forEach((l) => st.loadPick.add(l.id)); drawLoads(); }
            else if (v === 'none') { st.loadPick.clear(); drawLoads(); }
            else if (v === 'no') openLoadActionModal({ loads: pickedNow.filter((l) => loadState(l) === 'on'), kind: 'no' });
            else if (v === 'yes') considerLoads(pickedNow.filter((l) => loadState(l) === 'off'));
            else if (v === 'delete') openLoadActionModal({ loads: pickedNow.filter((l) => loadState(l) === 'off'), kind: 'delete' });
        });
    }
    bar.hidden = st.tab !== 'loads';
    const btn = (v, label, n, danger) => `<button type="button" data-bulk="${v}"${n ? '' : ' disabled'}${danger ? ' class="reg-bulk-danger"' : ''}>${esc(label)}${n ? ` (${num(n)})` : ''}</button>`;
    bar.innerHTML = `<span class="reg-loads-bulk-n">${esc(t('main.regLoadsBulkCount', { n: num(chosen.length) }))}</span><button type="button" class="reg-cd-link-btn" data-bulk="all">${esc(t('main.regLoadsBulkAll'))}</button><button type="button" class="reg-cd-link-btn" data-bulk="none">${esc(t('main.regLoadsBulkNone'))}</button>${chosen.length ? `<span class="reg-seg" role="group">${btn('no', t('main.regNoConsider'), on.length)}${btn('yes', t('main.regConsider'), off.length)}${btn('delete', t('main.regDeleteData'), off.length, true)}</span>` : ''}`;
}
function drawLoads() {
    const body = st.loads;
    if (!body) return;
    const wrapper = wrapperOf(LOADS_TABLE);
    const columns = [
        ...LOAD_COLUMNS.map((c) => ({ col: c, group: 'menu.cmRegistrosInformacion', labelKey: `main.${c}` })),
        { col: 'actions', labelKey: 'main.colActions' },
    ];
    const first = buildHeader(LOADS_TABLE, columns);
    const tbody = tableOf(LOADS_TABLE).tBodies[0];
    tbody.innerHTML = '';
    body.loads.forEach((l) => {
        const tr = document.createElement('tr');
        tr.dataset.recordId = l.id;
        // en una tabla libre: «Sí se considera» / «No se considera» (sombreada) / «Falló» / «Datos eliminados»
        const flexReg = isFlexReg();
        const state = flexReg ? loadState(l) : null;
        if (flexReg && state !== 'on') tr.classList.add('reg-load-off');
        const status = document.createElement('td');
        status.dataset.col = 'colRegCargaEstado';
        if (flexReg) status.innerHTML = `<span class="reg-pill reg-pill-${state === 'on' ? 'ok' : 'off'}">${esc(t(`main.regLoadState_${state}`))}</span>${l.annulNote && state === 'off' ? ` <small>${esc(l.annulNote)}</small>` : ''}`;
        else status.innerHTML = `<span class="reg-pill reg-pill-${l.status === 'vigente' ? 'ok' : 'off'}">${esc(t(l.status === 'vigente' ? 'main.regStatus_vigente' : 'main.regStatus_anulada'))}</span>${l.annulNote ? ` <small>${esc(l.annulNote)}</small>` : ''}`;
        const actions = document.createElement('td');
        actions.dataset.col = 'actions';
        actions.className = 'admin-table-actions';
        const iconBtn = (icon, helpKey, label, onClick, extra) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `admin-icon-btn${extra ? ` ${extra}` : ''}`;
            b.setAttribute('data-help-key', helpKey);
            b.setAttribute('aria-label', label);
            b.title = label;
            b.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
            b.addEventListener('click', onClick);
            return b;
        };
        if (flexReg && st.canAnnul && (state === 'on' || state === 'off')) {
            const pick = document.createElement('input');
            pick.type = 'checkbox';
            pick.className = 'reg-load-pick';
            pick.checked = st.loadPick.has(l.id);
            pick.setAttribute('data-help-key', 'regLoadsBulk');
            pick.setAttribute('aria-label', t('main.regLoadPick', { file: l.fileName || '' }));
            pick.addEventListener('change', () => { if (pick.checked) st.loadPick.add(l.id); else st.loadPick.delete(l.id); renderLoadsBulk(); });
            // la casilla lleva su palabra («Elegir») para que se entienda sin conocerla
            const pickLabel = document.createElement('label');
            pickLabel.className = 'reg-load-pick-l';
            pickLabel.setAttribute('data-help-key', 'regLoadsBulk');
            const pickText = document.createElement('span');
            pickText.textContent = t('main.regLoadPickShort');
            pickLabel.append(pick, pickText);
            actions.appendChild(pickLabel);
        }
        actions.appendChild(iconBtn('bx-history', 'changeHistory', t('main.changeHistoryTitleRecord'), () => Dashboard.openChangeHistory(LOADS_TABLE, l.id)));
        if (flexReg && st.canAnnul) {
            if (state === 'on') actions.appendChild(iconBtn('bx-block', 'regNoConsider', t('main.regNoConsider'), () => openLoadActionModal({ loads: [l], kind: 'no' })));
            if (state === 'off') {
                actions.appendChild(iconBtn('bx-check-circle', 'regConsider', t('main.regConsider'), () => considerLoads([l])));
                actions.appendChild(iconBtn('bx-trash', 'regDeleteData', t('main.regDeleteData'), () => openLoadActionModal({ loads: [l], kind: 'delete' }), 'reg-icon-danger'));
            }
        } else if (st.canAnnul && l.status === 'vigente') {
            actions.appendChild(iconBtn('bx-block', 'regAnnul', t('main.regAnnul'), () => openAnnulModal(l)));
        }
        tr.append(
            cell('colRegCargaArchivo', l.fileName), cell('colRegCargaOrigen', t(`main.regSource_${l.source}`)), stampCell('colRegCargaFechaHora', l.createdAt), cell('colRegCargaPor', l.loadedBy),
            cell('colRegCargaPeriodos', l.newPeriods.map(periodLabel).join(', ')), cell('colRegCargaRenglones', num(l.rowsInFile), 'col-num'), cell('colRegCargaNuevos', num(l.newRows), 'col-num'),
            cell('colRegCargaAgregados', num(l.valuesAdded), 'col-num'), cell('colRegCargaYaEstaba', num(l.untouched), 'col-num'), cell('colRegCargaDistintos', num(l.different), 'col-num'), cell('colRegCargaErrores', num(l.errors), 'col-num'),
            status, actions,
        );
        tbody.appendChild(tr);
    });
    ensureEmpty(LOADS_TABLE, LOAD_COLUMNS.length + 1);
    if (first && st.tab === 'loads' && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper, 1);
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(LOADS_TABLE);
    wrapper.setAttribute('data-help-key', 'regLoadsTable');
    if (Dashboard.attachTableDownloadButton) Dashboard.attachTableDownloadButton(LOADS_TABLE, { getTitle: () => `${regName(currentRegistry())}_${t('main.regTabLoads')}_${todayStamp()}` });
    renderLoadsBulk();
}
// Los filtros por columna (st.cf) los resuelve el servidor sobre TODOS los renglones: la tabla solo dibuja los primeros. Cada petición lleva un número: si llega una más nueva, la vieja se descarta.
async function refreshData() {
    if (!st.key) return;
    const seq = ++st.seq;
    const wrapper = wrapperOf(DATA_TABLE);
    wrapper?.classList.add('reg-busy');
    try {
        const params = new URLSearchParams({ lang: lang(), tz: String(tzOffset()) });
        if (st.text) params.set('text', st.text);
        if (st.cf) params.set('cf', JSON.stringify(st.cf));
        const res = await fetch(`${API}/${st.key}/data?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (seq !== st.seq) return; // llegó una búsqueda más nueva
        st.data = body;
        const lastId = body.lastLoad ? body.lastLoad.id : null;
        if (lastId !== st.lastLoadId) { st.lastLoadId = lastId; if (Dashboard.resetServerFilterValues) Dashboard.resetServerFilterValues(DATA_TABLE); } // llegaron datos nuevos: las listas de valores ya no valen
        const reg = currentRegistry();
        if (reg) { reg.periods = st.data.periods; reg.lastLoad = st.data.lastLoad; }
        st.canTemplate = st.data.canTemplate; st.canExcel = st.data.canExcel; st.canAnnul = st.data.canAnnul;
        renderManage();
        renderUpdated();
        drawData();
    } catch (err) {
        console.error('Registros: failed to load data', err);
        Dashboard.showToast(t('main.regLoadError'), 'error');
    } finally {
        if (seq === st.seq) wrapper?.classList.remove('reg-busy');
    }
}
// La lista de valores de una columna para su filtro: los de TODO el registro (no los dibujados).
async function fetchColumnValues(col) {
    const res = await fetch(`${API}/${encodeURIComponent(st.key)}/values?col=${encodeURIComponent(col)}&lang=${lang()}&tz=${tzOffset()}`, { credentials: 'include' });
    if (!res.ok) throw new Error('values failed');
    return res.json();
}
async function refreshLoads() {
    if (!st.key) return;
    try {
        const res = await fetch(`${API}/${st.key}/loads`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        st.loads = await res.json();
        st.canAnnul = st.loads.canAnnul;
        drawLoads();
    } catch (err) {
        console.error('Registros: failed to load the loads list', err);
        Dashboard.showToast(t('main.regLoadError'), 'error');
    }
}
function showTab(tab) {
    st.tab = tab;
    document.querySelectorAll('[data-reg-tab]').forEach((btn) => { const on = btn.dataset.regTab === tab; btn.classList.toggle('reg-tab-on', on); btn.setAttribute('aria-selected', on ? 'true' : 'false'); });
    const dataWrapper = wrapperOf(DATA_TABLE); const loadsWrapper = wrapperOf(LOADS_TABLE);
    const dataBar = dataWrapper.previousElementSibling; const loadsBar = loadsWrapper.previousElementSibling;
    [dataWrapper, document.getElementById('filter-bar'), document.getElementById('reg-truncated')].forEach((el) => { if (el) el.hidden = tab !== 'data'; });
    if (dataBar && dataBar.classList.contains('data-table-zoom')) dataBar.hidden = tab !== 'data';
    loadsWrapper.hidden = tab !== 'loads';
    const bulkBar = document.getElementById('reg-loads-bulk'); if (bulkBar) bulkBar.hidden = tab !== 'loads';
    if (loadsBar && loadsBar.classList.contains('data-table-zoom')) loadsBar.hidden = tab !== 'loads';
    if (tab === 'loads') refreshLoads().then(() => window.dispatchEvent(new Event('resize')));
    else window.dispatchEvent(new Event('resize'));
}
// «Cargar registro» y «Descargar plantilla» (junto a las herramientas de la tabla de datos): del botón del árbol; el servidor también lo exige.
function renderButtons() {
    const toolbar = wrapperOf(DATA_TABLE)?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    const reg = currentRegistry();
    if (toolbar.querySelector('#reg-import-btn') || !(st.canTemplate || st.canExcel) || (reg && (reg.status !== 'active' || reg.obsolete))) return; // un obsoleto ya no recibe cargas
    const make = (id, icon, key, helpKey, onClick) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'data-table-new-record-btn';
        btn.id = id;
        btn.setAttribute('data-help-key', helpKey);
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i><span>${esc(t(key))}</span>`;
        btn.addEventListener('click', onClick);
        return btn;
    };
    toolbar.classList.add('ven-toolbar');
    if (!reg || reg.kind !== 'tabla') toolbar.prepend(make('reg-template-btn', 'bx-download', 'main.regTemplate', 'regTemplate', downloadTemplate)); // un registro libre no tiene plantilla: se carga tu propio Excel
    toolbar.prepend(make('reg-import-btn', 'bx-upload', 'main.regImport', 'regImport', openLoadModal));
}
function wireStatic() {
    document.querySelectorAll('[data-reg-tab]').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.regTab)));
    const bar = document.getElementById('filter-bar');
    const apply = () => { st.text = (document.getElementById('filter-search-text')?.value || '').trim(); refreshData(); };
    bar?.addEventListener('data-table:filter-apply', apply);
    bar?.addEventListener('data-table:filter-clear', () => { st.text = ''; refreshData(); });
    showTab('data');
    document.addEventListener('dashboard:language-changed', () => { renderManage(); renderUpdated(); });
}

// Lo pegado de Excel (celdas separadas por tabulador) se vuelve un .xlsx de una hoja: el servidor lo lee igual que un archivo elegido.
function pastedFile(text) {
    const T = window.SkuTemplate;
    const X = window.SimpleXlsx;
    if (!T || !X) return null;
    const rows = T.parseDelimited(text);
    if (!rows.length) return null;
    return new File([X.writeXlsx([{ name: t('main.regPastedName'), rows }])], `${t('main.regPastedName')}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function saveFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function downloadTemplate() {
    try {
        const res = await fetch(`${API}/${st.key}/template?lang=${lang()}`, { credentials: 'include' });
        if (!res.ok) throw new Error('template failed');
        saveFile(await res.blob(), `${lang() === 'en' ? 'Template' : 'Plantilla'}-${st.key}.xlsx`);
    } catch (err) {
        console.error('Registros: la plantilla no se pudo bajar', err);
        Dashboard.showToast(t('main.regTplError'), 'error');
    }
}

// ---- anular una carga -----------------------------------------------------------------------------------------------------------------------------
function openAnnulModal(load) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel" role="dialog" aria-modal="true" aria-labelledby="reg-a-title" data-help-key="regAnnul">
        <h3 id="reg-a-title">${esc(t('main.regAnnulTitle', { file: load.fileName || '' }))}</h3>
        <p class="admin-hint">${esc(t('main.regAnnulHint'))}</p>
        <label for="reg-a-note">${esc(t('main.regAnnulNote'))}</label><textarea id="reg-a-note" rows="3" maxlength="300"></textarea>
        <p class="admin-error" id="reg-a-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-reg-a="ok">${esc(t('main.regAnnul'))}</button><button type="button" class="btn btn-secondary" data-reg-a="cancel">${esc(t('main.regCancel'))}</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-reg-a]');
        if (!btn) return;
        if (btn.dataset.regA === 'cancel') { close(); return; }
        btn.disabled = true;
        try {
            const res = await fetch(`${API}/${st.key}/loads/${load.id}/annul`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: overlay.querySelector('#reg-a-note').value }) });
            if (!res.ok) throw new Error('annul failed');
            close();
            await loadRegistries();
            await Promise.all([refreshData(), refreshLoads()]);
            Dashboard.showToast(t('main.regAnnulled'), 'success');
        } catch (err) {
            btn.disabled = false;
            const el = overlay.querySelector('#reg-a-error'); el.textContent = t('admin.saveError'); el.hidden = false;
        }
    });
}

// ---- ventana «Cargar registro» -----------------------------------------------------------------------------------------------------------------------
// st2.step: 'start' (elegir la forma y el archivo) → 'map' (solo «con mi Excel»: emparejar columnas) → 'day' (solo existencias con plantilla: el día) → 'preview' (la revisión, sin guardar nada) → 'done'.
function problemText(issue) { return t(`main.regProb_${issue.problem}`); }
function errorTextOf(err) {
    const body = (err && err.body) || {};
    if (body.code === 'IMPORT_HEADERS') return t('main.regErr_IMPORT_HEADERS', { missing: (body.missing || []).map((k) => (k === 'value' ? t('main.regValueColumn') : t(`main.regDim_${k}`))).join(', ') });
    if (body.code === 'DISK_FULL' && Number.isFinite(body.freeMb)) return t('main.regErr_DISK_FULL_N', { free: body.freeMb, reusable: body.reusableMb || 0 });
    return ['IMPORT_FILE', 'IMPORT_EMPTY', 'IMPORT_TOO_BIG', 'IMPORT_DAY', 'IMPORT_DAY_FUTURE', 'REG_FORBIDDEN', 'REG_BUSY', 'COST_CENTER_REQUIRED', 'IMPORT_ERROR', 'DISK_FULL', 'FLEX_CONFIG', 'FLEX_DUP_NAME', 'FLEX_NO_KEY', 'IMPORT_STAMP', 'IMPORT_TOO_MANY_COLUMNS'].includes(body.code) ? t(`main.regErr_${body.code}`) : t('admin.saveError');
}
// ---- Registros de TABLA LIBRE: cada carga lleva su propia elección de columnas (no se recuerda de una carga a otra) ------------------------------------------------------------------------------
// «Guardar tal cual» (todas las columnas del Excel, con su orden y nombres) o «Elegir el papel de cada columna»: llave (va hacia abajo), dato del renglón, columna nueva en cada carga (se suma o se toma uno) o no se carga.
// Cada columna se puede renombrar. El día y la hora de la carga se eligen aquí (el archivo no los trae); cada carga es su propia columna aunque tenga el mismo día y hora.
function openFlexLoadModal() {
    const reg = currentRegistry();
    if (!reg) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    document.body.appendChild(overlay);
    const now = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const todayText = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
    const s = { step: 'start', file: null, buffer: null, info: null, sheet: null, mode: 'asis', cols: [], day: todayText, time: `${p2(now.getHours())}:${p2(now.getMinutes())}`, preview: null, result: null, busy: false, error: '', inputMode: 'file', pasteText: '', classColors: {}, view: 'all', open: {} };
    // las clasificaciones que ya tiene el registro (con su color): al escribir una igual se toma el mismo color
    const foldCls = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    ((st.data && st.data.classes) || []).forEach((x) => { s.classColors[foldCls(x.name)] = x.color; });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); if (s.result) location.reload(); }; // con una carga guardada, la tabla se arma de nuevo (un registro libre puede traer columnas nuevas y uno vacío no tenía ninguna)
    const onKey = (event) => { if (event.key === 'Escape' && !s.busy) close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay && !s.busy) close(); });
    const errBox = () => `<p class="admin-error" id="reg-i-error" role="alert"${s.error ? '' : ' hidden'}>${esc(s.error)}</p>`;
    const nextClassColor = () => { const used = new Set(Object.values(s.classColors)); for (let i = 0; i < CLASS_COLORS.length; i += 1) if (!used.has(i)) return i; return Object.keys(s.classColors).length % CLASS_COLORS.length; };
    const ensureClassColor = (c) => { const f = foldCls(c.cls); if (f && s.classColors[f] === undefined) s.classColors[f] = nextClassColor(); };
    const classList = () => {
        const names = new Map();
        ((st.data && st.data.classes) || []).forEach((x) => names.set(foldCls(x.name), x.name));
        s.cols.forEach((c) => { if (c.cls && !names.has(foldCls(c.cls))) names.set(foldCls(c.cls), c.cls); });
        return `<datalist id="fx-cls-list">${[...names.values()].map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
    };
    const startHtml = () => `<h3 id="reg-i-title">${esc(t('main.flexImpTitle', { name: regName(reg) }))}</h3>
        <div class="tpl-seg" role="group"><button type="button" data-reg-i="mode-file" aria-pressed="${s.inputMode === 'file'}" data-help-key="tplUpload"${s.busy ? ' disabled' : ''}>${esc(t('main.tplModeFile'))}</button><button type="button" data-reg-i="mode-paste" aria-pressed="${s.inputMode === 'paste'}" data-help-key="tplPaste"${s.busy ? ' disabled' : ''}>${esc(t('main.tplModePaste'))}</button></div>
        ${s.inputMode === 'paste' ? `<div class="reg-paste"><textarea id="reg-i-paste" spellcheck="false" placeholder="${esc(t('main.tplPastePlaceholder'))}"${s.busy ? ' disabled' : ''}>${esc(s.pasteText)}</textarea><button type="button" class="btn btn-secondary" data-reg-i="paste-go"${s.busy ? ' disabled' : ''}>${esc(s.busy ? t('main.regReading') : t('main.tplPasteGo'))}</button></div>` : `<label class="wp-imp-drop" id="reg-i-drop" for="reg-i-file" data-help-key="regDrop"><b>${esc(s.busy ? t('main.regReading') : t('main.regDrop'))}</b><span>${esc(t('main.regDropOr'))}</span></label>
        <input type="file" id="reg-i-file" class="wp-imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${s.busy ? ' disabled' : ''}>`}
        ${errBox()}<div class="admin-form-actions"><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    // ---- la ventana de columnas (desde 2026-11-26): una tarjeta por columna del Excel con UNA decisión (ya existe / nueva adicional / no se carga); las ya definidas van en grupos cerrados ----
    const foldName = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const exMap = () => new Map(((s.info && s.info.existing) || []).map((e) => [e.name, e]));
    const hasExisting = () => !!(s.info && s.info.existing && s.info.existing.length);
    const colOf = (i) => s.cols.find((c) => String(c.i) === String(i));
    // lo que de verdad se manda de una columna: lo ya definido si «ya existe», lo que se escribió si es nueva
    const effective = (c) => {
        if (s.mode === 'asis') return { name: c.name, role: 'data', agg: 'sum', stampName: true, cls: c.cls || '', color: c.cls ? s.classColors[foldCls(c.cls)] : null };
        if (c.st === 'skip') return { name: c.text, role: 'skip', agg: 'sum', stampName: true, cls: '', color: null };
        if (c.st === 'exist') {
            const e = exMap().get(c.link);
            if (e) return { name: e.name, role: e.role, agg: e.agg, stampName: e.stampName, cls: e.cls || '', color: Number.isInteger(e.color) ? e.color : null };
        }
        return { name: c.name, role: c.role, agg: c.agg, stampName: c.stampName, cls: c.cls || '', color: c.cls ? s.classColors[foldCls(c.cls)] : null };
    };
    const classBox = (c) => {
        const color = c.cls ? s.classColors[foldCls(c.cls)] : undefined;
        const dots = c.cls ? CLASS_COLORS.map((hex, i) => `<button type="button" class="reg-fx-dot" data-fx-color="${i}" data-fx-for="${c.i}" style="background:${hex}" aria-pressed="${color === i ? 'true' : 'false'}" aria-label="${esc(t(`main.flexColor_${i}`))}"></button>`).join('') : '';
        return `<div class="reg-fx-clsbox"><input type="text" class="reg-fx-cls" list="fx-cls-list" data-fx-cls="${c.i}" maxlength="40" value="${esc(c.cls || '')}" placeholder="${esc(t('main.flexClsNone'))}" aria-label="${esc(t('main.flexColClass'))}">${c.cls ? `<button type="button" class="reg-fx-down" data-fx-down="${c.i}" title="${esc(t('main.flexClsDown'))}" aria-label="${esc(t('main.flexClsDown'))}"><i class="bx bx-down-arrow-alt" aria-hidden="true"></i></button>` : ''}</div><div class="reg-fx-dots">${dots}</div>`;
    };
    const cardHtml = (c) => {
        const roles = s.mode === 'roles';
        const ex = exMap();
        const segBtn = (st, key) => `<button type="button" data-fx-st="${st}" data-fx-for="${c.i}" aria-pressed="${c.st === st ? 'true' : 'false'}">${esc(t(key))}</button>`;
        let choice = '';
        if (roles) {
            choice = `<span class="reg-seg" role="group" aria-label="${esc(c.text)}">${hasExisting() ? segBtn('exist', 'main.flexStExist') : ''}${segBtn('new', 'main.flexStNew')}${segBtn('skip', 'main.flexStSkip')}</span>`;
            if (c.st === 'exist') {
                const opts = [...ex.values()].map((e) => `<option value="${esc(e.name)}"${e.name === c.link ? ' selected' : ''}>${esc(e.name)}</option>`).join('');
                const cur = ex.get(c.link);
                choice += `<span class="reg-cd-link">${esc(t('main.flexLinkTo'))} <select data-fx-link="${c.i}" aria-label="${esc(t('main.flexLinkTo'))}">${c.link ? '' : `<option value="" selected>${esc(t('main.flexLinkPick'))}</option>`}${opts}</select>${cur ? ` · <b>${esc(t(`main.flexRole_${cur.role}`))}</b>` : ''}</span>`;
            }
        }
        const sug = roles && c.st === 'new' && c.sugState === 'pending'
            ? `<div class="reg-cd-sug"><span>${esc(t('main.flexSugAsk', { name: c.sug }))}</span><button type="button" class="btn btn-secondary" data-fx-sug="yes" data-fx-for="${c.i}">${esc(t('main.flexSugYes'))}</button><button type="button" class="btn btn-secondary" data-fx-sug="no" data-fx-for="${c.i}">${esc(t('main.flexSugNo'))}</button></div>` : '';
        let det = '';
        if (!roles || c.st === 'new') {
            const isValue = roles && c.role === 'value';
            const roleRow = roles ? `<div class="reg-cd-row"><b>${esc(t('main.flexColLoadAs'))}</b><span class="reg-seg" role="group">${['key', 'data', 'value'].map((r) => `<button type="button" data-fx-rolebtn="${r}" data-fx-for="${c.i}" aria-pressed="${c.role === r ? 'true' : 'false'}">${esc(t(`main.flexRole_${r}`))}</button>`).join('')}</span></div>` : '';
            const aggRow = isValue ? `<div class="reg-cd-row"><b>${esc(t('main.flexColJoin'))}</b><span class="reg-seg" role="group">${['sum', 'one'].map((a) => `<button type="button" data-fx-aggbtn="${a}" data-fx-for="${c.i}" aria-pressed="${c.agg === a ? 'true' : 'false'}">${esc(t(`main.flexAgg_${a}`))}</button>`).join('')}</span><label class="reg-fx-stamp"><input type="checkbox" data-fx-stamp="${c.i}"${c.stampName ? ' checked' : ''}> <span>${esc(t('main.flexStampName'))}</span></label></div>` : '';
            det = `<div class="reg-cd-det">${roleRow}${aggRow}<div class="reg-cd-row"><b>${esc(t('main.flexColName'))}</b><input type="text" class="reg-fx-name" data-fx-name="${c.i}" maxlength="60" value="${esc(c.name)}" aria-label="${esc(t('main.flexColName'))}"></div><div class="reg-cd-row"><b>${esc(t('main.flexColClass'))}</b>${classBox(c)}</div></div>`;
        }
        const tag = roles && c.isNew && c.st === 'new' ? `<span class="reg-fx-new">${esc(t('main.flexNewCol'))}</span>` : '';
        return `<div class="reg-cd${roles && c.st === 'skip' ? ' reg-cd-off' : ''}${roles && c.isNew && c.st === 'new' ? ' reg-cd-new' : ''}"><div class="reg-cd-name"><label class="reg-cd-pick"><input type="checkbox" data-fx-pick="${c.i}"${c.sel ? ' checked' : ''} aria-label="${esc(t('main.flexPick', { name: c.text }))}"></label><div><b>${esc(c.text)}</b>${tag}<small>${c.example === undefined || c.example === null || c.example === '' ? '' : esc(c.example)}</small></div></div><div class="reg-cd-choice">${choice}</div>${sug}${det}</div>`;
    };
    const inView = (c) => s.view === 'all' || (s.mode === 'roles' && ((s.view === 'new' && c.st === 'new') || (s.view === 'skip' && c.st === 'skip')));
    const groupsHtml = () => {
        const roles = s.mode === 'roles';
        const list = s.cols.filter(inView);
        if (!roles) return `<div class="reg-cd-list">${list.map(cardHtml).join('')}</div>`;
        const ex = exMap();
        const pending = (c) => (c.st === 'new' && c.sugState === 'pending') || (c.st === 'exist' && !c.link);
        const isValueLink = (c) => c.st === 'exist' && ex.get(c.link) && ex.get(c.link).role === 'value';
        const groups = hasExisting() ? [
            { id: 'pending', title: 'main.flexGrpPending', items: list.filter(pending), open: true },
            { id: 'new', title: 'main.flexGrpNew', items: list.filter((c) => c.st === 'new' && !pending(c)), open: true },
            { id: 'existKeys', title: 'main.flexGrpExistKeys', items: list.filter((c) => c.st === 'exist' && !pending(c) && !isValueLink(c)), open: false },
            { id: 'existValues', title: 'main.flexGrpExistValues', items: list.filter((c) => isValueLink(c) && !pending(c)), open: false },
            { id: 'skip', title: 'main.flexGrpSkip', items: list.filter((c) => c.st === 'skip'), open: false },
        ] : [
            { id: 'all', title: 'main.flexGrpAll', items: list.filter((c) => c.st !== 'skip'), open: true },
            { id: 'skip', title: 'main.flexGrpSkip', items: list.filter((c) => c.st === 'skip'), open: true },
        ];
        return groups.filter((g) => g.items.length).map((g) => {
            const open = s.view !== 'all' || g.id === 'pending' || (s.open[g.id] === undefined ? g.open : s.open[g.id]);
            return `<details class="reg-grp" data-grp="${g.id}"${open ? ' open' : ''}><summary>${esc(t(g.title))} <small>${g.items.length}</small></summary><div class="reg-cd-list">${g.items.map(cardHtml).join('')}</div></details>`;
        }).join('');
    };
    const mapHtml = () => {
        const info = s.info;
        const roles = s.mode === 'roles';
        const count = (st) => s.cols.filter((c) => c.st === st).length;
        const pend = s.cols.filter((c) => c.st === 'new' && c.sugState === 'pending').length;
        const pills = roles ? `<div class="reg-cd-sum" aria-live="polite">${hasExisting() ? `<span class="wp-imp-pv wp-imp-pv-ok">${esc(t('main.flexSumExist', { n: num(count('exist')) }))}</span>` : ''}<span class="wp-imp-pv wp-imp-pv-warn">${esc(t('main.flexSumNew', { n: num(count('new') - pend) }))}</span>${pend ? `<span class="wp-imp-pv wp-imp-pv-error">${esc(t('main.flexSumPending', { n: num(pend) }))}</span>` : ''}<span class="wp-imp-pv wp-imp-pv-keep">${esc(t('main.flexSumSkip', { n: num(count('skip')) }))}</span></div>` : '';
        const views = roles && hasExisting() ? `<div class="reg-cd-views" role="group">${[['all', 'main.flexViewAll'], ['new', 'main.flexViewNew'], ['skip', 'main.flexViewSkip']].map(([v, k]) => `<button type="button" data-fx-view="${v}" aria-pressed="${s.view === v ? 'true' : 'false'}">${esc(t(k))}</button>`).join('')}</div>` : '';
        const nSel = s.cols.filter((c) => c.sel).length;
        const bulkBtn = (v, label) => `<button type="button" data-fx-bulk="${v}">${esc(label)}</button>`;
        const bulk = `<div class="reg-cd-bulk"><span class="reg-cd-bulk-n">${esc(t('main.flexBulkCount', { n: num(nSel) }))}</span><button type="button" class="reg-cd-link-btn" data-fx-bulk="all">${esc(t('main.flexBulkAll'))}</button><button type="button" class="reg-cd-link-btn" data-fx-bulk="none">${esc(t('main.flexBulkNone'))}</button>${nSel ? `<span class="reg-seg" role="group" aria-label="${esc(t('main.flexBulkTitle'))}">${roles ? `${bulkBtn('new', t('main.flexStNew'))}${bulkBtn('skip', t('main.flexStSkip'))}${['key', 'data', 'value'].map((r) => bulkBtn(`role:${r}`, t(`main.flexRole_${r}`))).join('')}` : ''}</span><span class="reg-cd-bulk-cls"><input type="text" id="fx-bulk-cls" list="fx-cls-list" maxlength="40" placeholder="${esc(t('main.flexClsNone'))}" aria-label="${esc(t('main.flexColClass'))}">${bulkBtn('cls', t('main.flexBulkApply'))}</span>` : ''}</div>`;
        return `<h3 id="reg-i-title">${esc(t('main.flexImpTitle', { name: regName(reg) }))}</h3>
            <div class="reg-fx-modes" role="radiogroup" data-help-key="regFlexMode"><label class="reg-fx-mode${roles ? '' : ' reg-fx-mode-on'}"><input type="radio" name="fx-mode" value="asis"${roles ? '' : ' checked'}> <span>${esc(t('main.flexModeAsis'))}</span></label><label class="reg-fx-mode${roles ? ' reg-fx-mode-on' : ''}"><input type="radio" name="fx-mode" value="roles"${roles ? ' checked' : ''}> <span>${esc(t('main.flexModeRoles'))}</span></label></div>
            <p class="admin-hint">${esc(t('main.flexRead', { cols: info.headers.length, rows: num(info.rowsDeclared) }))}</p>
            ${info.sheets.length > 1 ? `<div class="reg-sheet"><label for="reg-i-sheet">${esc(t('main.regSheet'))}</label><select id="reg-i-sheet">${info.sheets.map((sh) => `<option value="${esc(sh.name)}"${sh.name === s.sheet ? ' selected' : ''}>${esc(sh.name)}</option>`).join('')}</select></div>` : ''}
            ${pills}${views}${bulk}
            <div class="wp-imp-table-wrap reg-cd-wrap" data-help-key="regFlexMap">${groupsHtml()}</div>${classList()}
            <div class="reg-day" data-help-key="regFlexWhen"><label for="fx-day">${esc(t('main.flexWhen'))}</label><input type="date" id="fx-day" value="${esc(s.day)}" max="${esc(todayText)}"><input type="time" id="fx-time" value="${esc(s.time)}" aria-label="${esc(t('main.flexWhenTime'))}"></div>
            ${errBox()}<div class="admin-form-actions"><button type="button" class="btn" data-reg-i="review"${s.busy ? ' disabled' : ''}>${esc(t('main.regReview'))}</button><button type="button" class="btn btn-secondary" data-reg-i="again"${s.busy ? ' disabled' : ''}>${esc(t('main.regChooseAnother'))}</button><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    };
    const pill = (cls, text) => `<span class="wp-imp-pv wp-imp-pv-${cls}">${esc(text)}</span>`;
    const previewHtml = () => {
        const sum = s.preview.summary;
        const issues = s.preview.issues || [];
        const shown = issues.slice(0, ISSUES_SHOWN);
        const nothing = !sum.added;
        const roles = sum.mode === 'roles';
        const pills = [
            nothing ? pill('warn', t('main.regSumNothing')) : '',
            sum.newRows ? pill('ok', t('main.flexSumNewRows', { n: num(sum.newRows) })) : '',
            roles && sum.valuesAdded ? pill('ok', t('main.regSumAdded', { n: num(sum.valuesAdded) })) : '',
            roles && sum.merged ? pill('keep', t('main.flexSumMerged', { n: num(sum.merged) })) : '',
            sum.untouched ? pill('keep', t('main.regSumUntouched', { n: num(sum.untouched) })) : '',
            sum.different ? pill('warn', t('main.regSumDifferent', { n: num(sum.different) })) : '',
            sum.errors ? pill('error', t(sum.errors === 1 ? 'main.regSumErrorOne' : 'main.regSumError', { n: num(sum.errors) })) : '',
            sum.blank ? pill('keep', t('main.flexSumBlank', { n: num(sum.blank) })) : '',
        ].join('');
        const issueRows = shown.map((i) => `<tr class="wp-imp-row wp-imp-row-${i.kind === 'error' ? 'error' : 'warn'}"><td class="wp-imp-num">${i.line}</td><td>${esc(i.column)}</td><td class="wp-imp-num">${i.file === undefined ? '' : esc(i.file)}</td><td class="wp-imp-num">${i.saved === undefined ? '' : esc(i.saved)}</td><td>${esc(t(`main.flexProb_${i.problem}`))}</td></tr>`).join('');
        return `<h3 id="reg-i-title">${esc(s.file ? s.file.name : t('main.flexImpTitle', { name: regName(reg) }))}</h3>
            <p class="admin-hint">${esc(t('main.regRowsRead', { rows: num(sum.rowsInFile), sheet: sum.sheet || '' }))}</p>
            <div class="wp-imp-sum" data-help-key="regPreview">${pills}</div>
            ${shown.length ? `<div class="wp-imp-table-wrap"><table class="wp-imp-table"><thead><tr><th>${esc(t('main.regIssueRow'))}</th><th>${esc(t('main.flexIssueCol'))}</th><th>${esc(t('main.regIssueFile'))}</th><th>${esc(t('main.regIssueSaved'))}</th><th>${esc(t('main.regIssueWhat'))}</th></tr></thead><tbody>${issueRows}</tbody></table></div>
            ${sum.issuesTotal > shown.length ? `<p class="admin-hint">${esc(t('main.regIssuesMore', { shown: shown.length, total: num(sum.issuesTotal) }))}</p>` : ''}` : ''}
            ${errBox()}<div class="admin-form-actions"><button type="button" class="btn" data-reg-i="load"${nothing || s.busy ? ' disabled' : ''}><i class="bx bx-upload" aria-hidden="true"></i> ${esc(nothing ? t('main.regLoadNothing') : t('main.regLoadGo'))}</button>
            <button type="button" class="btn btn-secondary" data-reg-i="back"${s.busy ? ' disabled' : ''}>${esc(t('main.flexBack'))}</button><button type="button" class="btn btn-secondary" data-reg-i="again"${s.busy ? ' disabled' : ''}>${esc(t('main.regChooseAnother'))}</button><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    };
    const doneHtml = () => {
        const sum = s.result.summary;
        return `<h3 id="reg-i-title">${esc(t('main.regDoneTitle'))}</h3>
            <p>${esc(t('main.flexDoneText', { rows: num(sum.newRows), values: num(sum.mode === 'roles' ? sum.valuesAdded : 0) }))}</p>
            ${sum.different || sum.errors ? `<p class="admin-hint">${esc(t('main.regDoneKept', { n: num(sum.different + sum.errors) }))}</p>` : ''}
            <div class="admin-form-actions"><button type="button" class="btn" data-reg-i="done">${esc(t('main.regDone'))}</button></div>`;
    };
    let paintedStep = null;
    const paint = () => {
        const wide = s.step === 'preview' || s.step === 'map';
        // al volver a dibujar el MISMO paso (por ejemplo al elegir una opción de una columna) la lista de columnas se queda donde iba y el foco en el mismo control: antes regresaba hasta arriba
        const same = paintedStep === s.step;
        const wrapOld = same ? overlay.querySelector('.wp-imp-table-wrap') : null;
        const panelOld = same ? overlay.querySelector('.modal-panel') : null;
        const keep = { wt: wrapOld ? wrapOld.scrollTop : 0, wl: wrapOld ? wrapOld.scrollLeft : 0, pt: panelOld ? panelOld.scrollTop : 0 };
        const active = same && document.activeElement && overlay.contains(document.activeElement) ? document.activeElement : null;
        let focusSel = '';
        if (active) {
            const attrs = [...active.attributes].filter((a) => a.name.startsWith('data-fx-') && a.value !== '');
            if (attrs.length) focusSel = attrs.map((a) => `[${a.name}="${a.value}"]`).join(''); else if (active.id) focusSel = `#${active.id}`;
        }
        overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal wp-imp${wide ? ' wp-imp-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="reg-i-title" aria-label="${esc(t('main.regImport'))}" data-help-key="regFlexImport">${s.step === 'preview' ? previewHtml() : s.step === 'map' ? mapHtml() : s.step === 'done' ? doneHtml() : startHtml()}</div>`;
        if (same) {
            const wrapNew = overlay.querySelector('.wp-imp-table-wrap');
            if (wrapNew) { wrapNew.scrollTop = keep.wt; wrapNew.scrollLeft = keep.wl; }
            const panelNew = overlay.querySelector('.modal-panel');
            if (panelNew) panelNew.scrollTop = keep.pt;
            if (focusSel) { const again = overlay.querySelector(focusSel); if (again && typeof again.focus === 'function') again.focus({ preventScroll: true }); }
        }
        paintedStep = s.step;
    };
    const showError = (text) => { s.error = text; const el = overlay.querySelector('#reg-i-error'); if (el) { el.textContent = text; el.hidden = !text; } };
    const setBusy = (busy) => { s.busy = busy; paint(); if (s.error) showError(s.error); };
    const post = async (path, query, body) => {
        const res = await fetch(`${API}/${st.key}/${path}?${new URLSearchParams(query).toString()}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
        return out;
    };
    const inspect = async (sheet) => {
        const q = {}; if (sheet) q.sheet = sheet;
        s.info = await post('inspect', q, s.buffer);
        s.sheet = s.info.sheet;
        // si el registro ya tuvo cargas, cada título se reconoce solo (por el título que traía en una carga anterior) y toma lo ya definido: «ya existe». Uno que trae otro nombre pero se parece a una columna que ya existe
        // queda «por confirmar» (la persona decide si es esa o una nueva adicional); lo demás es una nueva adicional con la marca «Nueva».
        const prevRoles = s.info.prevMode === 'roles';
        const known = exMap();
        s.cols = s.info.headers.map((h, k) => {
            const p = h.prefill;
            if (p && p.cls && Number.isInteger(p.color) && s.classColors[foldCls(p.cls)] === undefined) s.classColors[foldCls(p.cls)] = p.color;
            const c = { i: h.index, text: h.text, example: s.info.sample[0] ? s.info.sample[0].values[k] : '', st: 'new', link: '', sug: '', sugState: '', isNew: !!s.info.prevMode,
                role: p && prevRoles ? p.role : (prevRoles && h.suggest.role === 'key' ? 'data' : h.suggest.role), agg: p && prevRoles && p.agg ? p.agg : h.suggest.agg, stampName: p && prevRoles ? p.stampName !== false : h.suggest.stampName !== false,
                name: (p && p.name) || h.text, cls: (p && p.cls) || '' };
            if (prevRoles && p && p.role === 'skip') { c.st = 'skip'; c.isNew = false; c.role = h.suggest.role; c.name = h.text; }
            else if (prevRoles && p && known.has(p.name)) { c.st = 'exist'; c.link = p.name; c.isNew = false; }
            else if (prevRoles && p) c.isNew = false;
            else if (prevRoles && h.link && known.has(h.link.name)) {
                if (h.link.score >= 1) { c.st = 'exist'; c.link = h.link.name; c.isNew = false; } else { c.sug = h.link.name; c.sugState = 'pending'; }
            }
            return c;
        });
        if (s.info.prevMode && !s.prevApplied) { s.prevApplied = true; s.mode = s.info.prevMode; }
    };
    const stampIso = () => { const d = new Date(`${s.day}T${s.time || '00:00'}`); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); };
    const readWhen = () => { const d = overlay.querySelector('#fx-day'); const tm = overlay.querySelector('#fx-time'); if (d) s.day = d.value; if (tm) s.time = tm.value; };
    // la elección de esta carga: «tal cual» lleva todas las columnas; con papeles, lo ya definido si «ya existe», lo que se escribió si es nueva, y las que no se cargan van marcadas
    const config = () => ({ mode: s.mode, columns: s.cols.map((c) => { const e = effective(c); return { i: c.i, src: c.text, name: e.name, role: e.role, agg: e.agg, stampName: e.stampName, cls: e.cls, color: e.color }; }) });
    const importQuery = (mode) => ({ mode, header: String(s.info.headerRow), sheet: s.sheet || '', file: s.file ? s.file.name : '', cfg: JSON.stringify(config()), stamp: stampIso() });
    // lo que se puede revisar sin ir al servidor: columnas por confirmar, una llave al menos, nombres sin repetir y un día válido
    const problem = () => {
        readWhen();
        if (!stampIso()) return t('main.regErr_IMPORT_STAMP');
        if (s.mode === 'roles') {
            const pend = s.cols.filter((c) => c.st === 'new' && c.sugState === 'pending');
            if (pend.length) return t('main.flexErrPending', { list: pend.map((c) => `«${c.text}» → «${c.sug}»`).join(', ') });
            const noLink = s.cols.find((c) => c.st === 'exist' && !c.link);
            if (noLink) return t('main.flexErrNoLink', { name: noLink.text });
        }
        const used = s.cols.filter((c) => s.mode === 'asis' || c.st !== 'skip').map(effective);
        if (s.mode === 'roles' && !used.some((c) => c.role === 'key')) return t('main.regErr_FLEX_NO_KEY');
        const seen = new Set();
        for (const c of used) { const f = foldName(c.name); if (seen.has(f)) return t('main.regErr_FLEX_DUP_NAME'); seen.add(f); }
        return '';
    };
    const review = async () => {
        const bad = problem();
        if (bad) { showError(bad); return; }
        setBusy(true); s.error = '';
        try {
            s.preview = await post('import', importQuery('preview'), s.buffer);
            s.step = 'preview'; s.busy = false; paint();
        } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); }
    };
    const chooseFile = async (file) => {
        if (!file) return;
        s.error = '';
        if (file.size > 60 * 1024 * 1024) { s.error = t('main.regErr_IMPORT_TOO_BIG'); paint(); return; }
        s.file = file;
        setBusy(true);
        try { s.buffer = await file.arrayBuffer(); } catch { s.busy = false; s.error = t('main.regErr_IMPORT_FILE'); paint(); return; }
        try { await inspect(null); s.step = 'map'; s.busy = false; paint(); } catch (err) { s.error = errorTextOf(err); s.busy = false; s.step = 'start'; s.file = null; s.buffer = null; paint(); }
    };
    const load = async () => {
        setBusy(true); s.error = '';
        try {
            s.result = await post('import', importQuery('commit'), s.buffer);
            s.step = 'done'; s.busy = false; paint();
        } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); }
    };
    const pasteGo = () => {
        const box = overlay.querySelector('#reg-i-paste');
        if (box) s.pasteText = box.value;
        const file = pastedFile(s.pasteText);
        if (!file) { s.error = t('main.tplNoRows'); paint(); return; }
        chooseFile(file);
    };
    overlay.addEventListener('click', (event) => {
        // el color de una clasificación y «aplicar a las siguientes columnas sin clasificación»
        const dot = event.target.closest('[data-fx-color]');
        if (dot && !s.busy) { const c = s.cols.find((x) => String(x.i) === dot.dataset.fxFor); if (c && c.cls) { readWhen(); s.classColors[foldCls(c.cls)] = Number(dot.dataset.fxColor); paint(); } return; }
        const down = event.target.closest('[data-fx-down]');
        if (down && !s.busy) {
            const at = s.cols.findIndex((x) => String(x.i) === down.dataset.fxDown);
            const from = s.cols[at];
            if (from && from.cls) {
                readWhen();
                for (let k = at + 1; k < s.cols.length; k += 1) { const c = s.cols[k]; if (c.cls || (s.mode === 'roles' && c.role === 'skip')) break; c.cls = from.cls; }
                paint();
            }
            return;
        }
        const col = (i) => s.cols.find((x) => String(x.i) === String(i));
        const pick = event.target.closest('[data-fx-pick]');
        if (pick && !s.busy) {
            const at = s.cols.findIndex((x) => String(x.i) === pick.dataset.fxPick);
            if (at >= 0) {
                if (event.shiftKey && s.lastPick !== undefined) { const lo = Math.min(s.lastPick, at); const hi = Math.max(s.lastPick, at); for (let k = lo; k <= hi; k += 1) if (inView(s.cols[k])) s.cols[k].sel = pick.checked; } else s.cols[at].sel = pick.checked;
                s.lastPick = at; readWhen(); paint();
            }
            return;
        }
        const bulk = event.target.closest('[data-fx-bulk]');
        if (bulk && !s.busy) {
            readWhen();
            const v = bulk.dataset.fxBulk;
            const chosen = s.cols.filter((c) => c.sel);
            if (v === 'all') s.cols.filter(inView).forEach((c) => { c.sel = true; });
            else if (v === 'none') s.cols.forEach((c) => { c.sel = false; });
            else if (v === 'new' || v === 'skip') chosen.forEach((c) => { if (c.sugState === 'pending') c.sugState = 'rejected'; c.st = v; if (v === 'new' && s.info.prevMode) c.isNew = true; });
            else if (v.startsWith('role:')) chosen.forEach((c) => { if (c.sugState === 'pending') c.sugState = 'rejected'; c.st = 'new'; c.role = v.slice(5); if (s.info.prevMode) c.isNew = true; });
            else if (v === 'cls') { const val = String((overlay.querySelector('#fx-bulk-cls') || {}).value || '').replace(/\s+/g, ' ').trim(); chosen.forEach((c) => { if (s.mode === 'asis' || c.st === 'new') { c.cls = val; ensureClassColor(c); } }); }
            s.error = '';
            paint(); return;
        }
        const stBtn = event.target.closest('[data-fx-st]');
        if (stBtn && !s.busy) {
            readWhen();
            const c = col(stBtn.dataset.fxFor); const to = stBtn.dataset.fxSt;
            if (c) {
                if (to === 'exist') { c.st = 'exist'; if (!c.link) c.link = c.sug && exMap().has(c.sug) ? c.sug : ''; if (c.link && c.link === c.sug) c.sugState = 'accepted'; c.isNew = false; }
                else { if (c.sugState === 'pending') c.sugState = 'rejected'; c.st = to; if (to === 'new' && s.info.prevMode) c.isNew = true; }
                s.error = '';
            }
            paint(); return;
        }
        const sugBtn = event.target.closest('[data-fx-sug]');
        if (sugBtn && !s.busy) {
            const c = col(sugBtn.dataset.fxFor);
            if (c) { readWhen(); if (sugBtn.dataset.fxSug === 'yes') { c.st = 'exist'; c.link = c.sug; c.sugState = 'accepted'; c.isNew = false; } else c.sugState = 'rejected'; s.error = ''; paint(); }
            return;
        }
        const roleBtn = event.target.closest('[data-fx-rolebtn]');
        if (roleBtn && !s.busy) { const c = col(roleBtn.dataset.fxFor); if (c) { readWhen(); c.role = roleBtn.dataset.fxRolebtn; paint(); } return; }
        const aggBtn = event.target.closest('[data-fx-aggbtn]');
        if (aggBtn && !s.busy) { const c = col(aggBtn.dataset.fxFor); if (c) { readWhen(); c.agg = aggBtn.dataset.fxAggbtn; paint(); } return; }
        const viewBtn = event.target.closest('[data-fx-view]');
        if (viewBtn && !s.busy) { readWhen(); s.view = viewBtn.dataset.fxView; paint(); return; }
        const btn = event.target.closest('[data-reg-i]');
        if (!btn || s.busy) return;
        const op = btn.dataset.regI;
        if (op === 'cancel') close();
        else if (op === 'mode-file' || op === 'mode-paste') { s.inputMode = op === 'mode-paste' ? 'paste' : 'file'; s.error = ''; paint(); }
        else if (op === 'paste-go') pasteGo();
        else if (op === 'review') review();
        else if (op === 'back') { s.step = 'map'; s.error = ''; paint(); }
        else if (op === 'load') load();
        else if (op === 'again') { s.step = 'start'; s.file = null; s.buffer = null; s.info = null; s.preview = null; s.error = ''; paint(); }
        else if (op === 'done') close(); // cerrar con una carga guardada recarga la tabla
    });
    overlay.addEventListener('change', async (event) => {
        const el = event.target;
        const col = (attr) => s.cols.find((c) => String(c.i) === el.dataset[attr]);
        if (el.id === 'reg-i-file') chooseFile(el.files && el.files[0]);
        else if (el.name === 'fx-mode') { readWhen(); s.mode = el.value; s.error = ''; paint(); }
        else if (el.id === 'fx-day' || el.id === 'fx-time') readWhen();
        else if (el.id === 'reg-i-sheet') { setBusy(true); try { await inspect(el.value); s.busy = false; paint(); } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); } }
        else if (el.dataset.fxLink !== undefined) { const c = col('fxLink'); if (c) { readWhen(); c.link = el.value; if (c.link && c.link === c.sug) c.sugState = 'accepted'; s.error = ''; paint(); } }
        else if (el.dataset.fxStamp !== undefined) { const c = col('fxStamp'); if (c) c.stampName = el.checked; }
        else if (el.dataset.fxCls !== undefined) { const c = col('fxCls'); if (c) { readWhen(); c.cls = el.value.replace(/\s+/g, ' ').trim(); ensureClassColor(c); paint(); } } // al terminar de escribir: toma el color de la clasificación (el de una que ya existe o el siguiente de la paleta)
    });
    overlay.addEventListener('input', (event) => {
        const el = event.target;
        if (el.id === 'reg-i-paste') s.pasteText = el.value;
        else if (el.dataset && el.dataset.fxName !== undefined) { const c = s.cols.find((x) => String(x.i) === el.dataset.fxName); if (c) c.name = el.value; }
        else if (el.dataset && el.dataset.fxCls !== undefined) { const c = s.cols.find((x) => String(x.i) === el.dataset.fxCls); if (c) c.cls = el.value; }
    });
    overlay.addEventListener('paste', (event) => { if (event.target.id !== 'reg-i-paste') return; setTimeout(() => { s.pasteText = event.target.value; if (s.pasteText.trim() && !s.busy) pasteGo(); }, 50); });
    overlay.addEventListener('dragover', (event) => { const zone = event.target.closest && event.target.closest('#reg-i-drop'); if (zone) { event.preventDefault(); zone.classList.add('wp-imp-drop-over'); } });
    overlay.addEventListener('dragleave', (event) => { const zone = event.target.closest && event.target.closest('#reg-i-drop'); if (zone) zone.classList.remove('wp-imp-drop-over'); });
    overlay.addEventListener('drop', (event) => {
        const zone = event.target.closest && event.target.closest('#reg-i-drop');
        if (!zone) return;
        event.preventDefault();
        zone.classList.remove('wp-imp-drop-over');
        chooseFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    });
    overlay.addEventListener('toggle', (event) => { const d = event.target; if (d && d.dataset && d.dataset.grp) s.open[d.dataset.grp] = d.open; }, true);
    paint();
}
function openLoadModal() {
    const reg = currentRegistry();
    if (!reg) return;
    if (reg.kind === 'tabla') { openFlexLoadModal(); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    document.body.appendChild(overlay);
    const today = new Date();
    const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const s = { step: 'start', source: st.canTemplate && !st.canExcel ? 'plantilla' : 'excel', file: null, buffer: null, info: null, sheet: null, include: null, picks: null, day: todayText, preview: null, result: null, busy: false, error: '', reload: false, mode: 'file', pasteText: '' };
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape' && !s.busy) close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay && !s.busy) close(); });
    const errBox = () => `<p class="admin-error" id="reg-i-error" role="alert"${s.error ? '' : ' hidden'}>${esc(s.error)}</p>`;
    const dayField = () => `<div class="reg-day"><label for="reg-i-day">${esc(t('main.regDayLabel'))}</label><input type="date" id="reg-i-day" value="${esc(s.day)}" max="${esc(todayText)}"></div>`;
    const wayCard = (id, titleKey, steps, on, enabled) => `<label class="reg-way${on ? ' reg-way-on' : ''}${enabled ? '' : ' reg-way-off'}"><input type="radio" name="reg-way" value="${id}"${on ? ' checked' : ''}${enabled ? '' : ' disabled'}><b>${esc(t(titleKey))}</b><ol>${steps.map((k) => `<li>${esc(t(k))}</li>`).join('')}</ol></label>`;
    const startHtml = () => `<h3 id="reg-i-title">${esc(t('main.regImpTitle', { name: regName(reg) }))}</h3>
        <p class="admin-hint">${esc(t('main.regImpHint'))}</p>
        <div class="reg-ways" data-help-key="regWays">${wayCard('plantilla', 'main.regWayTemplate', ['main.regWayTemplate1', reg.kind === 'month' ? 'main.regWayTemplate2' : 'main.regWayTemplate2Day', 'main.regWayTemplate3'], s.source === 'plantilla', st.canTemplate)}${wayCard('excel', 'main.regWayExcel', ['main.regWayExcel1', 'main.regWayExcel2', 'main.regWayExcel3'], s.source === 'excel', st.canExcel)}</div>
        ${s.source === 'plantilla' ? `<p><button type="button" class="btn btn-secondary" data-reg-i="template"${s.busy ? ' disabled' : ''}><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.regTemplate'))}</button></p>` : ''}
        ${reg.kind === 'day' && s.source === 'plantilla' ? dayField() : ''}
        <div class="tpl-seg" role="group"><button type="button" data-reg-i="mode-file" aria-pressed="${s.mode === 'file'}" data-help-key="tplUpload"${s.busy ? ' disabled' : ''}>${esc(t('main.tplModeFile'))}</button><button type="button" data-reg-i="mode-paste" aria-pressed="${s.mode === 'paste'}" data-help-key="tplPaste"${s.busy ? ' disabled' : ''}>${esc(t('main.tplModePaste'))}</button></div>
        ${s.mode === 'paste' ? `<div class="reg-paste"><textarea id="reg-i-paste" spellcheck="false" placeholder="${esc(t('main.tplPastePlaceholder'))}"${s.busy ? ' disabled' : ''}>${esc(s.pasteText)}</textarea><button type="button" class="btn btn-secondary" data-reg-i="paste-go"${s.busy ? ' disabled' : ''}>${esc(s.busy ? t('main.regReading') : t('main.tplPasteGo'))}</button></div>` : `<label class="wp-imp-drop" id="reg-i-drop" for="reg-i-file" data-help-key="regDrop"><b>${esc(s.busy ? t('main.regReading') : t('main.regDrop'))}</b><span>${esc(t('main.regDropOr'))}</span></label>
        <input type="file" id="reg-i-file" class="wp-imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${s.busy ? ' disabled' : ''}>`}
        ${errBox()}<div class="admin-form-actions"><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    const dimOptions = (selected, includeValue) => `<option value=""${selected === '' ? ' selected' : ''}>${esc(t('main.regNotLoaded'))}</option>${['unidad', 'unidadNombre', 'codigo', 'descripcion', 'categoria', 'udm'].map((d) => `<option value="${d}"${selected === d ? ' selected' : ''}>${esc(t(`main.regDim_${d}`))}</option>`).join('')}${includeValue ? `<option value="value"${selected === 'value' ? ' selected' : ''}>${esc(t('main.regValueColumn'))}</option>` : ''}`;
    const mapHtml = () => {
        const info = s.info;
        const monthCols = new Map((info.mapping.valueCols || []).map((v) => [v.col, v.period]));
        const rows = info.headers.map((h) => {
            if (reg.kind === 'month' && monthCols.has(h.index)) {
                const period = monthCols.get(h.index);
                return `<tr><td>${esc(h.text)}</td><td class="reg-map-ex">${esc(info.sample[0] ? info.sample[0].values[info.headers.indexOf(h)] : '')}</td><td><label class="reg-map-month"><input type="checkbox" data-reg-month="${h.index}"${s.include.has(h.index) ? ' checked' : ''}> ${esc(t('main.regAsMonth', { period: periodLabel(period) }))}</label></td></tr>`;
            }
            return `<tr><td>${esc(h.text)}</td><td class="reg-map-ex">${esc(info.sample[0] ? info.sample[0].values[info.headers.indexOf(h)] : '')}</td><td><select data-reg-pick="${h.index}">${dimOptions(s.picks[h.index] || '', reg.kind === 'day')}</select></td></tr>`;
        }).join('');
        const nMonths = monthCols.size;
        return `<h3 id="reg-i-title">${esc(t('main.regMapTitle'))}</h3>
            <p class="admin-hint">${esc(t(reg.kind === 'month' ? 'main.regMapRead' : 'main.regMapReadDay', { cols: info.headers.length, months: nMonths, rows: num(info.rowsDeclared) }))}</p>
            ${info.sheets.length > 1 ? `<div class="reg-sheet"><label for="reg-i-sheet">${esc(t('main.regSheet'))}</label><select id="reg-i-sheet">${info.sheets.map((sh) => `<option value="${esc(sh.name)}"${sh.name === s.sheet ? ' selected' : ''}>${esc(sh.name)}</option>`).join('')}</select></div>` : ''}
            <div class="wp-imp-table-wrap"><table class="wp-imp-table reg-map-table"><thead><tr><th>${esc(t('main.regMapYourCol'))}</th><th>${esc(t('main.regMapExample'))}</th><th>${esc(t('main.regMapLoadAs'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
            ${reg.kind === 'day' ? dayField() : ''}
            ${errBox()}<div class="admin-form-actions"><button type="button" class="btn" data-reg-i="review"${s.busy ? ' disabled' : ''}>${esc(t('main.regReview'))}</button><button type="button" class="btn btn-secondary" data-reg-i="again"${s.busy ? ' disabled' : ''}>${esc(t('main.regChooseAnother'))}</button><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    };
    const pill = (cls, text) => `<span class="wp-imp-pv wp-imp-pv-${cls}">${esc(text)}</span>`;
    const previewHtml = () => {
        const sum = s.preview.summary;
        const issues = s.preview.issues;
        const shown = issues.slice(0, ISSUES_SHOWN);
        const nothing = !sum.valuesAdded;
        const pills = [
            sum.valuesAdded ? pill('ok', t('main.regSumAdded', { n: num(sum.valuesAdded) })) : pill('warn', t('main.regSumNothing')),
            sum.newPeriods && sum.newPeriods.length ? pill('ok', t('main.regSumNewPeriods', { periods: sum.newPeriods.map(periodLabel).join(', ') })) : '',
            sum.newRows ? pill('ok', t(sum.newRows === 1 ? 'main.regSumNewRowsOne' : 'main.regSumNewRows', { n: num(sum.newRows) })) : '',
            sum.untouched ? pill('keep', t('main.regSumUntouched', { n: num(sum.untouched) })) : '',
            sum.different ? pill('warn', t('main.regSumDifferent', { n: num(sum.different) })) : '',
            sum.errors ? pill('error', t(sum.errors === 1 ? 'main.regSumErrorOne' : 'main.regSumError', { n: num(sum.errors) })) : '',
            sum.skippedFuture && sum.skippedFuture.length ? pill('warn', t('main.regSumFuture', { periods: sum.skippedFuture.map(periodLabel).join(', ') })) : '',
        ].join('');
        const periodRows = sum.periods.map((p) => `<tr><td>${esc(periodLabel(p.period))}</td><td>${esc(t(p.status === 'new' ? 'main.regPeriodNew' : 'main.regPeriodExisting'))}</td><td class="wp-imp-num">${num(p.added)}</td><td class="wp-imp-num">${num(p.untouched)}</td><td class="wp-imp-num">${num(p.different)}</td></tr>`).join('');
        const issueRows = shown.map((i) => `<tr class="wp-imp-row wp-imp-row-${i.kind === 'error' ? 'error' : 'warn'}"><td class="wp-imp-num">${i.line}</td><td>${esc(i.unidad)}</td><td>${esc(i.codigo)}</td><td>${esc(i.period ? periodLabel(i.period) : '')}</td><td class="wp-imp-num">${i.file === undefined ? '' : esc(typeof i.file === 'number' ? num(i.file) : i.file)}</td><td class="wp-imp-num">${i.saved === undefined ? '' : esc(num(i.saved))}</td><td>${esc(problemText(i))}</td></tr>`).join('');
        return `<h3 id="reg-i-title">${esc(s.file ? s.file.name : t('main.regImpTitle', { name: regName(reg) }))}</h3>
            <p class="admin-hint">${esc(t('main.regRowsRead', { rows: num(sum.rowsInFile), sheet: sum.sheet }))}</p>
            <div class="wp-imp-sum" data-help-key="regPreview">${pills}</div>
            ${periodRows ? `<div class="wp-imp-table-wrap reg-periods"><table class="wp-imp-table"><thead><tr><th>${esc(t('main.regPeriodCol'))}</th><th>${esc(t('main.regPeriodState'))}</th><th>${esc(t('main.regPeriodAdded'))}</th><th>${esc(t('main.regPeriodUntouched'))}</th><th>${esc(t('main.regPeriodDifferent'))}</th></tr></thead><tbody>${periodRows}</tbody></table></div>` : ''}
            ${shown.length ? `<div class="wp-imp-table-wrap"><table class="wp-imp-table"><thead><tr><th>${esc(t('main.regIssueRow'))}</th><th>${esc(t('main.regDim_unidad'))}</th><th>${esc(t('main.regDim_codigo'))}</th><th>${esc(t('main.regIssuePeriod'))}</th><th>${esc(t('main.regIssueFile'))}</th><th>${esc(t('main.regIssueSaved'))}</th><th>${esc(t('main.regIssueWhat'))}</th></tr></thead><tbody>${issueRows}</tbody></table></div>
            ${sum.issuesTotal > shown.length ? `<p class="admin-hint">${esc(t('main.regIssuesMore', { shown: shown.length, total: num(sum.issuesTotal) }))}</p>` : ''}` : ''}
            <p class="admin-hint">${esc(t('main.regOnlyAdds'))}</p>
            ${errBox()}<div class="admin-form-actions"><button type="button" class="btn" data-reg-i="load"${nothing || s.busy ? ' disabled' : ''}><i class="bx bx-upload" aria-hidden="true"></i> ${esc(nothing ? t('main.regLoadNothing') : t('main.regLoadGo'))}</button>
            ${issues.length ? `<button type="button" class="btn btn-secondary" data-reg-i="issues"${s.busy ? ' disabled' : ''}><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.regIssuesDownload'))}</button>` : ''}
            <button type="button" class="btn btn-secondary" data-reg-i="again"${s.busy ? ' disabled' : ''}>${esc(t('main.regChooseAnother'))}</button><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    };
    const doneHtml = () => {
        const sum = s.result.summary;
        return `<h3 id="reg-i-title">${esc(t('main.regDoneTitle'))}</h3>
            <p>${esc(t('main.regDoneText', { n: num(sum.valuesAdded), rows: num(sum.newRows) }))}</p>
            ${sum.newPeriods && sum.newPeriods.length ? `<p class="admin-hint">${esc(t('main.regDoneNewPeriods', { periods: sum.newPeriods.map(periodLabel).join(', ') }))}</p>` : ''}
            ${sum.different || sum.errors ? `<p class="admin-hint">${esc(t('main.regDoneKept', { n: num(sum.different + sum.errors) }))}</p>` : ''}
            <div class="admin-form-actions"><button type="button" class="btn" data-reg-i="done">${esc(t('main.regDone'))}</button></div>`;
    };
    let paintedStep = null;
    const paint = () => {
        const wide = s.step === 'preview' || s.step === 'map';
        // al volver a dibujar el MISMO paso (por ejemplo al elegir una opción de una columna) la lista de columnas se queda donde iba y el foco en el mismo control: antes regresaba hasta arriba
        const same = paintedStep === s.step;
        const wrapOld = same ? overlay.querySelector('.wp-imp-table-wrap') : null;
        const panelOld = same ? overlay.querySelector('.modal-panel') : null;
        const keep = { wt: wrapOld ? wrapOld.scrollTop : 0, wl: wrapOld ? wrapOld.scrollLeft : 0, pt: panelOld ? panelOld.scrollTop : 0 };
        const active = same && document.activeElement && overlay.contains(document.activeElement) ? document.activeElement : null;
        let focusSel = '';
        if (active) {
            const attr = [...active.attributes].find((a) => a.name.startsWith('data-') && a.name !== 'data-help-key' && a.value !== '');
            if (attr) focusSel = `[${attr.name}="${attr.value}"]`; else if (active.id) focusSel = `#${active.id}`;
        }
        overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal wp-imp${wide ? ' wp-imp-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="reg-i-title" aria-label="${esc(t('main.regImport'))}" data-help-key="regImport">${s.step === 'preview' ? previewHtml() : s.step === 'map' ? mapHtml() : s.step === 'done' ? doneHtml() : startHtml()}</div>`;
        if (same) {
            const wrapNew = overlay.querySelector('.wp-imp-table-wrap');
            if (wrapNew) { wrapNew.scrollTop = keep.wt; wrapNew.scrollLeft = keep.wl; }
            const panelNew = overlay.querySelector('.modal-panel');
            if (panelNew) panelNew.scrollTop = keep.pt;
            if (focusSel) { const again = overlay.querySelector(focusSel); if (again && typeof again.focus === 'function') again.focus({ preventScroll: true }); }
        }
        paintedStep = s.step;
    };
    const showError = (text) => { s.error = text; const el = overlay.querySelector('#reg-i-error'); if (el) { el.textContent = text; el.hidden = !text; } };
    const setBusy = (busy) => { s.busy = busy; paint(); if (s.error) showError(s.error); };
    const post = async (path, query, body) => {
        const res = await fetch(`${API}/${st.key}/${path}?${new URLSearchParams(query).toString()}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
        return out;
    };
    const currentMapping = () => {
        const dims = {};
        Object.entries(s.picks).forEach(([col, dim]) => { if (dim && dim !== 'value' && dims[dim] === undefined) dims[dim] = Number(col); });
        const mapping = { dims, valueCols: [], valueCol: null };
        if (reg.kind === 'month') (s.info.mapping.valueCols || []).forEach((v) => { if (s.include.has(v.col)) mapping.valueCols.push(v); });
        else { const at = Object.entries(s.picks).find(([, dim]) => dim === 'value'); if (at) mapping.valueCol = Number(at[0]); }
        return mapping;
    };
    const importQuery = (mode) => {
        const q = { mode, source: s.source, file: s.file ? s.file.name : '' };
        if (s.sheet) q.sheet = s.sheet;
        if (reg.kind === 'day') q.day = s.day;
        if (s.source === 'excel') { q.mapping = JSON.stringify(currentMapping()); q.header = String(s.info.headerRow); }
        return q;
    };
    const inspect = async (sheet) => {
        const q = {}; if (sheet) q.sheet = sheet;
        s.info = await post('inspect', q, s.buffer);
        s.sheet = s.info.sheet;
        s.include = new Set((s.info.mapping.valueCols || []).map((v) => v.col));
        s.picks = {};
        Object.entries(s.info.mapping.dims || {}).forEach(([dim, col]) => { s.picks[col] = dim; });
        if (reg.kind === 'day' && s.info.mapping.valueCol !== null && s.info.mapping.valueCol !== undefined) s.picks[s.info.mapping.valueCol] = 'value';
    };
    const review = async () => {
        if (reg.kind === 'day') { const el = overlay.querySelector('#reg-i-day'); if (el) s.day = el.value; if (!s.day) { showError(t('main.regErr_IMPORT_DAY')); return; } }
        if (s.source === 'excel') {
            const m = currentMapping();
            if (m.dims.unidad === undefined || m.dims.codigo === undefined || (reg.kind === 'month' ? !m.valueCols.length : m.valueCol === null)) {
                showError(t('main.regErr_IMPORT_HEADERS', { missing: [m.dims.unidad === undefined ? t('main.regDim_unidad') : '', m.dims.codigo === undefined ? t('main.regDim_codigo') : '', (reg.kind === 'month' ? !m.valueCols.length : m.valueCol === null) ? t('main.regValueColumn') : ''].filter(Boolean).join(', ') }));
                return;
            }
        }
        setBusy(true); s.error = '';
        try {
            s.preview = await post('import', importQuery('preview'), s.buffer);
            s.step = 'preview'; s.busy = false; paint();
        } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); }
    };
    const chooseFile = async (file) => {
        if (!file) return;
        s.error = '';
        if (file.size > 60 * 1024 * 1024) { s.error = t('main.regErr_IMPORT_TOO_BIG'); paint(); return; }
        s.file = file;
        setBusy(true);
        try { s.buffer = await file.arrayBuffer(); } catch { s.busy = false; s.error = t('main.regErr_IMPORT_FILE'); paint(); return; }
        try {
            await inspect(null);
            if (s.info.missing && s.info.missing.length && s.source === 'plantilla') { const err = new Error('headers'); err.body = { code: 'IMPORT_HEADERS', missing: s.info.missing }; throw err; }
            if (s.source === 'excel') { s.step = 'map'; s.busy = false; paint(); return; }
            if (reg.kind === 'day') { const el = overlay.querySelector('#reg-i-day'); if (el) s.day = el.value; }
            await review();
        } catch (err) { s.error = errorTextOf(err); s.busy = false; s.step = 'start'; s.file = null; s.buffer = null; paint(); }
    };
    const downloadIssues = async () => {
        const L = lang();
        const heads = L === 'en' ? ['Row', 'Unit', 'Code', 'Period', 'In the file', 'Saved', 'What happens'] : ['Fila', 'Unidad', 'Código', 'Periodo', 'En el archivo', 'Guardado', 'Qué pasa'];
        const rows = s.preview.issues.map((i) => [i.line, i.unidad, i.codigo, i.period ? periodLabel(i.period) : '', i.file === undefined ? '' : i.file, i.saved === undefined ? '' : i.saved, problemText(i)]);
        try {
            const d = new Date();
            const filename = `${t('main.regIssuesFile')}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const res = await fetch('/api/business/export/xlsx', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t('main.regIssuesFile'), filename, columns: heads.map((label) => ({ label })), rows }) });
            if (!res.ok) throw new Error('export failed');
            saveFile(await res.blob(), `${filename}.xlsx`);
        } catch (err) { console.error('Registros: errores y diferencias no se pudieron bajar', err); showError(t('main.regTplError')); }
    };
    const load = async () => {
        setBusy(true); s.error = '';
        try {
            const before = (currentRegistry() || { periods: [] }).periods.join();
            s.result = await post('import', importQuery('commit'), s.buffer);
            await loadRegistries();
            const after = (currentRegistry() || { periods: [] }).periods.join();
            s.reload = before !== after; // un mes (o día) nuevo es una columna nueva: la tabla se arma de nuevo
            s.step = 'done'; s.busy = false; paint();
        } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); }
    };
    // lo pegado de Excel se vuelve un archivo y sigue el mismo camino que uno elegido
    const pasteGo = () => {
        const box = overlay.querySelector('#reg-i-paste');
        if (box) s.pasteText = box.value;
        const file = pastedFile(s.pasteText);
        if (!file) { s.error = t('main.tplNoRows'); paint(); return; }
        chooseFile(file);
    };
    overlay.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-reg-i]');
        if (!btn || s.busy) return;
        const op = btn.dataset.regI;
        if (op === 'cancel') close();
        else if (op === 'template') downloadTemplate();
        else if (op === 'mode-file' || op === 'mode-paste') { s.mode = op === 'mode-paste' ? 'paste' : 'file'; s.error = ''; paint(); }
        else if (op === 'paste-go') pasteGo();
        else if (op === 'review') review();
        else if (op === 'issues') downloadIssues();
        else if (op === 'load') load();
        else if (op === 'again') { s.step = 'start'; s.file = null; s.buffer = null; s.info = null; s.preview = null; s.error = ''; paint(); }
        else if (op === 'done') { close(); if (s.reload) location.reload(); else { refreshData(); if (st.tab === 'loads') refreshLoads(); else st.loads = null; Dashboard.showToast(t('main.regDoneToast'), 'success'); } }
    });
    overlay.addEventListener('change', async (event) => {
        const el = event.target;
        if (el.id === 'reg-i-file') chooseFile(el.files && el.files[0]);
        else if (el.name === 'reg-way') { s.source = el.value; s.error = ''; paint(); }
        else if (el.id === 'reg-i-day') s.day = el.value;
        else if (el.id === 'reg-i-sheet') { setBusy(true); try { await inspect(el.value); s.busy = false; paint(); } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); } }
        else if (el.dataset && el.dataset.regPick !== undefined) s.picks[el.dataset.regPick] = el.value;
        else if (el.dataset && el.dataset.regMonth !== undefined) { const col = Number(el.dataset.regMonth); if (el.checked) s.include.add(col); else s.include.delete(col); }
    });
    overlay.addEventListener('input', (event) => { if (event.target.id === 'reg-i-paste') s.pasteText = event.target.value; });
    overlay.addEventListener('paste', (event) => { if (event.target.id !== 'reg-i-paste') return; setTimeout(() => { s.pasteText = event.target.value; if (s.pasteText.trim() && !s.busy) pasteGo(); }, 50); });
    overlay.addEventListener('dragover', (event) => { const zone = event.target.closest && event.target.closest('#reg-i-drop'); if (zone) { event.preventDefault(); zone.classList.add('wp-imp-drop-over'); } });
    overlay.addEventListener('dragleave', (event) => { const zone = event.target.closest && event.target.closest('#reg-i-drop'); if (zone) zone.classList.remove('wp-imp-drop-over'); });
    overlay.addEventListener('drop', (event) => {
        const zone = event.target.closest && event.target.closest('#reg-i-drop');
        if (!zone) return;
        event.preventDefault();
        zone.classList.remove('wp-imp-drop-over');
        chooseFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    });
    paint();
}
})();
