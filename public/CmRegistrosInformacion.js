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
const t = (key, params) => Dashboard.t(key, params);
const lang = () => (localStorage.getItem('lang') === 'en' ? 'en' : 'es');
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 3 });
const MONTH_ABBR = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] };
function periodLabel(period) {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(period || '');
    if (!m) return String(period || '');
    const abbr = MONTH_ABBR[lang()][Number(m[2]) - 1];
    return m[3] ? `${m[3]}/${abbr}/${m[1]}` : `${abbr}-${m[1].slice(2)}`;
}
const periodKey = (period) => `p_${String(period).replace(/-/g, '_')}`;
const todayStamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const st = { registries: [], key: null, tab: 'data', data: null, loads: null, canTemplate: false, canExcel: false, canAnnul: false, canCreateRegistry: false, text: '', loadsInit: false };
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
        renderCards();
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

// ---- las tarjetas de registros: cuántos periodos hay y cuáles faltan ------------------------------------------------------------------------------
function monthsBetween(from, to) {
    const out = [];
    let [y, m] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m += 1; if (m > 12) { m = 1; y += 1; } }
    return out;
}
function stripCells(reg) {
    const periods = new Set(reg.periods);
    if (!reg.periods.length) return [];
    if (reg.kind === 'month') {
        const all = monthsBetween(reg.periods[0], reg.periods[reg.periods.length - 1]);
        return all.map((p) => ({ label: periodLabel(p), state: periods.has(p) ? 'ok' : 'miss' }));
    }
    // diaria: del primer al último día cargado (hasta los últimos 45 días); solo cuenta como «falta» lo que queda en medio
    const dayMs = 86400000;
    const toMs = (p) => Date.parse(`${p}T00:00:00Z`);
    const last = toMs(reg.periods[reg.periods.length - 1]);
    const first = Math.max(toMs(reg.periods[0]), last - 44 * dayMs);
    const out = [];
    for (let ms = first; ms <= last; ms += dayMs) { const d = new Date(ms).toISOString().slice(0, 10); out.push({ label: periodLabel(d), state: periods.has(d) ? 'ok' : 'miss' }); }
    return out;
}
function renderCards() {
    const host = document.getElementById('reg-cards');
    if (!host) return;
    host.innerHTML = '';
    // Un solo bloque: el registro que se abrió desde el menú (los demás son pantallas anidadas en «Registros Información»). Sin ninguna carga no hay nada que resumir y la tarjeta no sale (su nombre ya está en el menú y la ruta).
    [currentRegistry()].filter((reg) => reg && reg.periods.length).forEach((reg) => {
        const card = document.createElement('div');
        card.className = `reg-card reg-card-on reg-card-static${reg.status === 'active' ? '' : ' reg-card-off'}`;
        card.setAttribute('data-help-key', 'regCard');
        const cells = stripCells(reg);
        const missing = cells.filter((c) => c.state === 'miss').length;
        const summary = !reg.periods.length ? t('main.regCardNone')
            : reg.kind === 'month' ? t('main.regCardMonths', { n: reg.periods.length, from: periodLabel(reg.periods[0]), to: periodLabel(reg.periods[reg.periods.length - 1]) })
                : t('main.regCardDays', { n: reg.periods.length, last: periodLabel(reg.periods[reg.periods.length - 1]) });
        card.innerHTML = `<span class="reg-card-top"><b>${esc(regName(reg))}</b><span class="reg-card-per">${esc(t(reg.kind === 'month' ? 'main.regKindMonth' : 'main.regKindDay'))}</span></span>
            <span class="reg-card-sum">${esc(summary)}</span>
            ${cells.length ? `<span class="reg-strip" aria-hidden="true">${cells.map((c) => `<i class="reg-strip-${c.state}" title="${esc(c.label)}"></i>`).join('')}</span>` : ''}
            ${missing ? `<span class="reg-card-miss">${esc(t(missing === 1 ? 'main.regCardMissOne' : 'main.regCardMiss', { n: missing }))}</span>` : ''}`;
        host.appendChild(card);
    });
    renderManage();
}
// Cambiar nombre y desactivar/activar: solo para los registros que agregó el cliente (los dos de siempre no se tocan) y para quien tiene el botón «Crear registro».
function renderManage() {
    let bar = document.getElementById('reg-manage');
    const reg = currentRegistry();
    const show = !!(reg && reg.custom && st.canCreateRegistry);
    if (!show) { if (bar) bar.remove(); return; }
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'reg-manage';
        bar.className = 'reg-manage';
        bar.setAttribute('data-help-key', 'regManage');
        const cards = document.getElementById('reg-cards');
        (document.getElementById('cm-stamp') || cards).after(bar);
    }
    bar.textContent = '';
    if (reg.status !== 'active') { const off = document.createElement('span'); off.className = 'reg-pill reg-pill-off'; off.textContent = t('main.regStatus_inactive'); bar.appendChild(off); }
    const make = (icon, key, onClick) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-secondary reg-manage-btn';
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i> <span>${esc(t(key))}</span>`;
        btn.addEventListener('click', onClick);
        bar.appendChild(btn);
    };
    make('bx-edit', 'main.regRename', () => openRenameRegistry(reg));
    make(reg.status === 'active' ? 'bx-hide' : 'bx-show', reg.status === 'active' ? 'main.regDeactivate' : 'main.regActivate', () => toggleRegistry(reg));
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
    return ['REG_NAME_REQUIRED', 'REG_NAME_TAKEN', 'REG_KIND', 'REG_FORBIDDEN', 'REG_STATUS', 'REG_BUILTIN'].includes(code) ? t(`main.regErr_${code}`) : t('admin.saveError');
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
        <label><input type="radio" name="reg-n-kind" value="day"> <span>${esc(t('main.regKindDay'))}</span></label></div>
        <label for="reg-n-value">${esc(t('main.regNewValue'))}</label><input type="text" id="reg-n-value" maxlength="40" autocomplete="off" placeholder="${esc(t('main.regNewValueDefault'))}">
        <p class="admin-error" id="reg-n-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-reg-go>${esc(t('main.regNewCreate'))}</button><button type="button" class="btn btn-secondary" data-reg-close>${esc(t('main.regCancel'))}</button></div>`, 'regNewDialog', (overlay) => {
        overlay.querySelector('#reg-n-name').focus();
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
async function toggleRegistry(reg) {
    try {
        await sendRegistry('PATCH', `${API}/${encodeURIComponent(reg.key)}`, { status: reg.status === 'active' ? 'inactive' : 'active' });
        location.reload(); // sale del menú (o vuelve a salir)
    } catch (e) { Dashboard.showToast(regErrorText(e.body), 'error'); }
}

// ---- la franja de «última carga» -----------------------------------------------------------------------------------------------------------------
function renderStamp() {
    let bar = document.getElementById('cm-stamp');
    const content = document.querySelector('.page-content');
    if (!bar) {
        if (!content) return;
        bar = document.createElement('div');
        bar.id = 'cm-stamp';
        bar.className = 'cm-stamp';
        bar.setAttribute('data-help-key', 'cmStamp');
        const cards = document.getElementById('reg-cards');
        if (cards) cards.after(bar); else content.prepend(bar);
    }
    bar.textContent = '';
    const reg = currentRegistry();
    const load = reg && reg.lastLoad;
    // sin ninguna carga la tarjeta de arriba ya dice «Todavía no se ha cargado nada»: la franja no lo repite (Daniel, 2026-11-25)
    bar.hidden = !load;
    if (!load) return;
    const part = (node) => { const span = document.createElement('span'); span.className = 'cm-stamp-part'; span.append(...(Array.isArray(node) ? node : [node])); bar.appendChild(span); return span; };
    const strong = (text) => { const b = document.createElement('b'); b.textContent = text; return b; };
    const when = document.createElement('span');
    Dashboard.renderTimeStamp(when, load.createdAt);
    part([strong(`${t('main.cmStampLast')} `), when]);
    if (load.loadedBy) part([document.createTextNode(`${t('main.cmStampBy')} `), strong(load.loadedBy)]);
    if (load.fileName) part([document.createTextNode(`${t('main.cmStampFile')} `), strong(load.fileName)]);
    const lastPeriod = reg.periods[reg.periods.length - 1];
    if (lastPeriod) part(document.createTextNode(t('main.regStampUntil', { period: periodLabel(lastPeriod) }))).classList.add('cm-stamp-pill');
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
function headerCell(col, group, label, labelKey, extraClass) {
    const th = document.createElement('th');
    th.dataset.col = col;
    if (group) th.dataset.group = group;
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
    columns.forEach((c) => row.appendChild(headerCell(c.col, c.group, c.label, c.labelKey, c.cls)));
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
    const first = buildHeader(DATA_TABLE, dataColumns(body.periods));
    const table = tableOf(DATA_TABLE);
    const tbody = table.tBodies[0];
    tbody.innerHTML = '';
    body.rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.dataset.recordId = row.id;
        tr.append(
            ...DIM_COLUMNS.map((c) => cell(c.col, row[c.field])),
            ...body.periods.map((p) => cell(periodKey(p), row.values[p] === undefined ? '' : num(row.values[p]), 'col-num')),
        );
        tbody.appendChild(tr);
    });
    ensureEmpty(DATA_TABLE, DIM_COLUMNS.length + body.periods.length);
    if (first && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper, 0);
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(DATA_TABLE);
    wrapper.setAttribute('data-help-key', 'regTable');
    if (Dashboard.attachTableDownloadButton) {
        Dashboard.attachTableDownloadButton(DATA_TABLE, { getTitle: () => `${regName(currentRegistry())}_${todayStamp()}`, getNotice: () => (st.data && st.data.truncated ? t('main.regDownloadTruncated', { shown: st.data.rows.length, total: st.data.total }) : '') });
    }
    let note = document.getElementById('reg-truncated');
    if (body.truncated) {
        if (!note) { note = document.createElement('p'); note.id = 'reg-truncated'; note.className = 'admin-hint'; wrapper.after(note); }
        note.textContent = t('main.regTruncated', { shown: body.rows.length, total: body.total });
    } else if (note) note.remove();
    else if (body.total) { /* todo cabe */ }
    renderButtons();
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
        const status = document.createElement('td');
        status.dataset.col = 'colRegCargaEstado';
        status.innerHTML = `<span class="reg-pill reg-pill-${l.status === 'vigente' ? 'ok' : 'off'}">${esc(t(l.status === 'vigente' ? 'main.regStatus_vigente' : 'main.regStatus_anulada'))}</span>${l.annulNote ? ` <small>${esc(l.annulNote)}</small>` : ''}`;
        const actions = document.createElement('td');
        actions.dataset.col = 'actions';
        actions.className = 'admin-table-actions';
        const history = document.createElement('button');
        history.type = 'button';
        history.className = 'admin-icon-btn';
        history.setAttribute('data-help-key', 'changeHistory');
        history.setAttribute('aria-label', t('main.changeHistoryTitleRecord'));
        history.title = t('main.changeHistoryTitleRecord');
        history.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        history.addEventListener('click', () => Dashboard.openChangeHistory(LOADS_TABLE, l.id));
        actions.appendChild(history);
        if (st.canAnnul && l.status === 'vigente') {
            const annul = document.createElement('button');
            annul.type = 'button';
            annul.className = 'admin-icon-btn';
            annul.setAttribute('data-help-key', 'regAnnul');
            annul.setAttribute('aria-label', t('main.regAnnul'));
            annul.title = t('main.regAnnul');
            annul.innerHTML = '<i class="bx bx-block" aria-hidden="true"></i>';
            annul.addEventListener('click', () => openAnnulModal(l));
            actions.appendChild(annul);
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
}
async function refreshData() {
    if (!st.key) return;
    try {
        const qs = st.text ? `?text=${encodeURIComponent(st.text)}` : '';
        const res = await fetch(`${API}/${st.key}/data${qs}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        st.data = await res.json();
        const reg = currentRegistry();
        if (reg) { reg.periods = st.data.periods; reg.lastLoad = st.data.lastLoad; }
        st.canTemplate = st.data.canTemplate; st.canExcel = st.data.canExcel; st.canAnnul = st.data.canAnnul;
        renderCards();
        renderStamp();
        drawData();
    } catch (err) {
        console.error('Registros: failed to load data', err);
        Dashboard.showToast(t('main.regLoadError'), 'error');
    }
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
    if (loadsBar && loadsBar.classList.contains('data-table-zoom')) loadsBar.hidden = tab !== 'loads';
    if (tab === 'loads') refreshLoads().then(() => window.dispatchEvent(new Event('resize')));
    else window.dispatchEvent(new Event('resize'));
}
// «Cargar registro» y «Descargar plantilla» (junto a las herramientas de la tabla de datos): del botón del árbol; el servidor también lo exige.
function renderButtons() {
    const toolbar = wrapperOf(DATA_TABLE)?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    const reg = currentRegistry();
    if (toolbar.querySelector('#reg-import-btn') || !(st.canTemplate || st.canExcel) || (reg && reg.status !== 'active')) return;
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
    toolbar.prepend(make('reg-template-btn', 'bx-download', 'main.regTemplate', 'regTemplate', downloadTemplate));
    toolbar.prepend(make('reg-import-btn', 'bx-upload', 'main.regImport', 'regImport', openLoadModal));
}
function wireStatic() {
    document.querySelectorAll('[data-reg-tab]').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.regTab)));
    const bar = document.getElementById('filter-bar');
    const apply = () => { st.text = (document.getElementById('filter-search-text')?.value || '').trim(); refreshData(); };
    bar?.addEventListener('data-table:filter-apply', apply);
    bar?.addEventListener('data-table:filter-clear', () => { st.text = ''; refreshData(); });
    showTab('data');
    document.addEventListener('dashboard:language-changed', () => { renderCards(); renderStamp(); });
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
    return ['IMPORT_FILE', 'IMPORT_EMPTY', 'IMPORT_TOO_BIG', 'IMPORT_DAY', 'IMPORT_DAY_FUTURE', 'REG_FORBIDDEN', 'REG_BUSY', 'COST_CENTER_REQUIRED', 'IMPORT_ERROR'].includes(body.code) ? t(`main.regErr_${body.code}`) : t('admin.saveError');
}
function openLoadModal() {
    const reg = currentRegistry();
    if (!reg) return;
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
    const paint = () => {
        const wide = s.step === 'preview' || s.step === 'map';
        overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal wp-imp${wide ? ' wp-imp-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="reg-i-title" aria-label="${esc(t('main.regImport'))}" data-help-key="regImport">${s.step === 'preview' ? previewHtml() : s.step === 'map' ? mapHtml() : s.step === 'done' ? doneHtml() : startHtml()}</div>`;
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
