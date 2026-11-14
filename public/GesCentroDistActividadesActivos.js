// ---------------------------------------------------------------------------
// Actividades Activos (Gestión > C. Distribución, 2026-11-13): lo que se registró de cada activo. Por lo mientras, los llenados de los QR de sensores y de refrigeradores (lecturas de temperatura y humedad).
// Solo lectura: lo que se corrige se corrige donde se registró (el QR u Operaciones > Temperaturas).
//   - Un cuadro tipo Gantt con dos formas de verlo («Ver como»): «Lista de activos» (los activos hacia abajo y las fechas en columnas) y «Lista de fechas» (las fechas hacia abajo y los activos en columnas).
//     «Clasificación activo» es una columna propia (en la lista de fechas es la fila que agrupa a los activos). Cada marca es una actividad: la hora y un color (verde dentro de su rango, rojo fuera, gris sin límite).
//     Varias en el mismo día se apilan (hasta 3 y luego «+N»). Una fecha en la que ningún activo registró nada se puede ocultar (queda una franja angosta que se vuelve a mostrar al tocarla).
//   - Se abre con los últimos 7 días y se cargan 7 días más al llegar al final (o con el filtro de fechas): así no se baja toda la historia de golpe.
//   - Filtros: búsqueda (la sintaxis de siempre: $ antes, @ después, coma separa), Clasificación activo, Tipo de activo, Quién registró, Resultado, Fechas, Tiempo que demoró y Evidencias.
//   - Tocar una marca abre su detalle: quién, resultado, fecha y hora, cuánto tardó y la foto, con el Control Interno. Las fechas se ven en tu hora (se guardan en UTC).
// El servidor manda los activos que se llenan por QR y las actividades de un rango (GET /api/business/asset-activities) y el detalle de una (GET /api/business/asset-activities/:id).
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/asset-activities';
const TABLE_KEY = 'actividades-activos';
const PAGE_DAYS = 7;
const MAX_STACK = 3;
const VIEWS = ['assets', 'dates'];
const tx = (key, params) => Dashboard.t(key, params);
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const localeOf = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* sin almacenamiento */ } },
};

let items = new Map(); // id -> actividad
let assets = new Map(); // id -> activo (fila del cuadro)
let loadedFromDay = ''; // el día más viejo ya cargado (AAAA-MM-DD, en tu hora)
let hasOlder = false;
let loading = false;
let truncated = false;
let view = VIEWS.includes(store.get('aa_view')) ? store.get('aa_view') : 'assets';
const revealed = new Set(); // fechas vacías que se volvieron a mostrar
const filters = { text: '', cls: null, type: null, who: null, result: 'all', from: '', to: '', time: 'any', evid: 'any', hideEmpty: true }; // null = todos

// ---- fechas en tu hora --------------------------------------------------------------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOfIso = (iso) => dayKey(new Date(iso));
const startOfDay = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (key, n) => { const d = startOfDay(key); d.setDate(d.getDate() + n); return dayKey(d); };
const todayKey = () => dayKey(new Date());
const timeText = (iso) => new Date(iso).toLocaleTimeString(localeOf(), { hour: '2-digit', minute: '2-digit', hour12: false });
const whenText = (iso) => new Date(iso).toLocaleString(localeOf(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayText = (key) => startOfDay(key).toLocaleDateString(localeOf(), { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '');
const dayShort = (key) => startOfDay(key).toLocaleDateString(localeOf(), { day: '2-digit', month: 'short' }).replace(/\./g, '');
function durationText(seconds) {
    if (seconds === null || seconds === undefined) return '—';
    if (seconds < 60) return `${seconds} s`;
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    if (min < 60) return sec ? `${min} min ${sec} s` : `${min} min`;
    const h = Math.floor(min / 60);
    return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}
const resultText = (r) => tx(r === 'out' ? 'main.aaResultadoFuera' : (r === 'ok' ? 'main.aaResultadoDentro' : 'main.aaResultadoSin'));
const numText = (n) => Number(n).toLocaleString(localeOf(), { maximumFractionDigits: 2 });
function limitText(l) {
    if (!l) return '';
    const hasMin = l.min !== null && l.min !== undefined;
    const hasMax = l.max !== null && l.max !== undefined;
    if (hasMin && hasMax) return tx('main.aaLimRango', { min: numText(l.min), max: numText(l.max) });
    if (hasMax) return tx('main.aaLimMax', { max: numText(l.max) });
    if (hasMin) return tx('main.aaLimMin', { min: numText(l.min) });
    return '';
}

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        buildPage();
        await loadInitial();
    } catch (err) {
        console.error('Actividades Activos failed to initialize:', err);
    }
})();
document.addEventListener('sgn:cost-centers-changed', () => { if (host) render(); });

// ---- carga --------------------------------------------------------------------------------------------------------------------------------------------
async function fetchRange(fromDay, untilDay) {
    const url = `${API}?since=${encodeURIComponent(startOfDay(fromDay).toISOString())}&until=${encodeURIComponent(startOfDay(untilDay).toISOString())}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('load failed');
    const body = await res.json();
    (body.items || []).forEach((it) => items.set(it.id, it));
    (body.assets || []).forEach((a) => assets.set(a.id, a));
    truncated = truncated || !!body.truncated;
    return body;
}
async function loadInitial() {
    try {
        loadedFromDay = addDays(todayKey(), -(PAGE_DAYS - 1));
        const body = await fetchRange(loadedFromDay, addDays(todayKey(), 1));
        hasOlder = !!body.hasOlder;
        syncOptions();
        render({ scrollToToday: true });
    } catch (err) {
        console.error('Actividades Activos: no se pudieron cargar', err);
        Dashboard.showToast(tx('admin.saveError'), 'error');
    }
}
// Carga hacia atrás hasta cubrir el día pedido (o 7 días más cuando no se pide un día).
async function loadOlder(untilDay) {
    if (loading || !hasOlder) return;
    loading = true;
    setLoadMoreBusy(true);
    const before = tableHost.scrollWidth;
    try {
        let target = untilDay && untilDay < loadedFromDay ? untilDay : addDays(loadedFromDay, -PAGE_DAYS);
        while (target < loadedFromDay && hasOlder) {
            const chunkFrom = target < addDays(loadedFromDay, -120) ? addDays(loadedFromDay, -120) : target;
            const body = await fetchRange(chunkFrom, loadedFromDay);
            loadedFromDay = chunkFrom;
            hasOlder = !!body.hasOlder;
        }
        syncOptions();
        render({ keepScrollFrom: before });
    } catch (err) {
        console.error('Actividades Activos: no se pudieron cargar más días', err);
        Dashboard.showToast(tx('admin.saveError'), 'error');
    } finally {
        loading = false;
        setLoadMoreBusy(false);
    }
}

// ---- filtros ------------------------------------------------------------------------------------------------------------------------------------------
const panels = [];
function closePanels() { panels.forEach((p) => p._close && p._close()); }
document.addEventListener('click', (event) => { if (!event.target.closest('.cp-multi')) closePanels(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanels(); });
// Una lista desplegable con casillas (uno, varios o Todos) con su buscador; selected = null: todos.
function makeMultiSelect(labelKey, helpKey) {
    const field = el('div', 'cp-field');
    const label = el('label', '', tx(labelKey));
    const wrap = el('div', 'cp-multi');
    const btn = el('button', 'cp-box cp-multi-btn');
    btn.type = 'button';
    btn.setAttribute('data-help-key', helpKey);
    btn.setAttribute('aria-haspopup', 'listbox');
    const panel = el('div', 'cp-panel');
    panel.hidden = true;
    wrap.append(btn, panel);
    field.append(label, wrap);
    let options = [];
    let selected = null;
    let search = '';
    let onChange = () => {};
    const btnText = () => {
        if (selected === null) return tx('main.cpTodosN', { n: options.length });
        if (selected.size === 1) { const only = options.find((o) => selected.has(o.value)); return only ? only.label : tx('main.cpNdeM', { n: 1, m: options.length }); }
        return tx('main.cpNdeM', { n: selected.size, m: options.length });
    };
    const refreshButton = () => { btn.textContent = btnText(); };
    function setSelected(next) {
        selected = next && next.size && next.size < options.length ? next : null; // todas las casillas = Todos
        refreshButton();
        renderPanel();
        onChange();
    }
    function renderPanel() {
        panel.innerHTML = '';
        const box = el('input', 'cp-search');
        box.type = 'search';
        box.placeholder = tx('main.cpBuscar');
        box.value = search;
        box.addEventListener('input', () => { search = box.value; renderList(); });
        const all = el('label', 'cp-opt cp-opt-all');
        const allBox = el('input');
        allBox.type = 'checkbox';
        allBox.checked = selected === null;
        allBox.addEventListener('change', () => { setSelected(null); });
        all.append(allBox, el('span', '', tx('main.cpTodos')));
        const list = el('div', 'cp-opts');
        function renderList() {
            list.innerHTML = '';
            const text = search.trim().toLowerCase();
            options.filter((o) => !text || o.label.toLowerCase().includes(text)).forEach((o) => {
                const row = el('label', 'cp-opt');
                const cb = el('input');
                cb.type = 'checkbox';
                cb.checked = selected !== null && selected.has(o.value);
                cb.addEventListener('change', () => {
                    const set = selected === null ? new Set() : new Set(selected);
                    if (cb.checked) set.add(o.value); else set.delete(o.value);
                    setSelected(set.size ? set : null);
                });
                row.append(cb, el('span', '', o.label));
                list.appendChild(row);
            });
            if (!list.children.length) list.appendChild(el('div', 'cp-opt-empty', tx('main.cpSinOpciones')));
        }
        panel.append(box, all, list);
        renderList();
    }
    btn.addEventListener('click', () => {
        const opening = panel.hidden;
        closePanels();
        panel.hidden = !opening;
        btn.setAttribute('aria-expanded', String(opening));
        if (opening) { search = ''; renderPanel(); panel.querySelector('.cp-search')?.focus(); }
    });
    panel._close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    panels.push(panel);
    return {
        field,
        get: () => selected,
        setOptions(next) {
            options = next;
            if (selected) { const keep = new Set([...selected].filter((v) => options.some((o) => o.value === v))); selected = keep.size ? keep : null; }
            refreshButton();
            if (!panel.hidden) renderPanel();
        },
        onChange(fn) { onChange = fn; },
    };
}
function makeSelect(labelKey, helpKey, id, options, onChange) {
    const field = el('div', 'cp-field');
    const label = el('label', '', tx(labelKey));
    label.htmlFor = id;
    const select = el('select', 'cp-box');
    select.id = id;
    select.setAttribute('data-help-key', helpKey);
    options.forEach(([value, key]) => { const o = el('option', '', tx(key)); o.value = value; select.appendChild(o); });
    select.addEventListener('change', () => onChange(select.value));
    field.append(label, select);
    return field;
}
function dateField(labelKey, helpKey, id, onChange) {
    const field = el('div', 'cp-field');
    const label = el('label', '', tx(labelKey));
    label.htmlFor = id;
    const input = el('input', 'cp-box');
    input.type = 'date';
    input.id = id;
    input.setAttribute('data-help-key', helpKey);
    input.max = todayKey();
    input.addEventListener('change', () => onChange(input.value));
    field.append(label, input);
    return field;
}

let host;
let clsSel;
let typeSel;
let whoSel;
let summaryEl;
let tableHost;
let moreBtn;
let viewButtons = {};
// ¿Puede esta persona usar el filtro de esa columna? (hojas buscar-filtrar del árbol; el administrador del cliente siempre)
const canFilter = (col) => !Dashboard.hasColumnSearchGrant || Dashboard.hasColumnSearchGrant(TABLE_KEY, col, 'filter');
function buildPage() {
    host = document.querySelector('.page-content');
    host.innerHTML = '';
    const root = el('div', 'cp aa');
    const bar = el('div', 'cp-filters');
    const searchField = el('div', 'cp-field aa-search-field');
    const searchLabel = el('label', '', tx('main.aaBuscar'));
    searchLabel.htmlFor = 'aa-search';
    const search = el('input', 'cp-box aa-search');
    search.type = 'search';
    search.id = 'aa-search';
    search.placeholder = tx('main.aaBuscarHint');
    search.setAttribute('data-help-key', 'aaBuscar');
    let searchTimer = 0;
    search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { filters.text = search.value; render(); }, 180); });
    searchField.append(searchLabel, search);
    // Ver como
    const viewField = el('div', 'cp-field');
    viewField.appendChild(el('label', '', tx('main.aaVerComo')));
    const seg = el('div', 'aa-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('data-help-key', 'aaVerComo');
    VIEWS.forEach((v) => {
        const b = el('button', 'aa-seg-btn', tx(v === 'assets' ? 'main.aaVistaActivos' : 'main.aaVistaFechas'));
        b.type = 'button';
        b.addEventListener('click', () => { if (view === v) return; view = v; store.set('aa_view', v); refreshViewButtons(); render({ scrollToToday: true }); });
        viewButtons[v] = b;
        seg.appendChild(b);
    });
    viewField.appendChild(seg);
    clsSel = makeMultiSelect('main.aaFiltroClasificacion', 'aaFiltroClasificacion');
    typeSel = makeMultiSelect('main.aaFiltroTipo', 'aaFiltroTipo');
    whoSel = makeMultiSelect('main.aaFiltroQuien', 'aaFiltroQuien');
    clsSel.onChange(() => { filters.cls = clsSel.get(); render(); });
    typeSel.onChange(() => { filters.type = typeSel.get(); render(); });
    whoSel.onChange(() => { filters.who = whoSel.get(); render(); });
    const resultField = makeSelect('main.aaFiltroResultado', 'aaFiltroResultado', 'aa-result', [['all', 'main.cpTodos'], ['ok', 'main.aaResultadoDentro'], ['out', 'main.aaResultadoFuera'], ['none', 'main.aaResultadoSin']], (v) => { filters.result = v; render(); });
    const timeField = makeSelect('main.aaFiltroTiempo', 'aaFiltroTiempo', 'aa-time', [['any', 'main.aaCualquiera'], ['lt1', 'main.aaTiempoMenos1'], ['1to5', 'main.aaTiempo1a5'], ['gt5', 'main.aaTiempoMas5'], ['none', 'main.aaTiempoSinDato']], (v) => { filters.time = v; render(); });
    const evidField = makeSelect('main.aaFiltroEvidencias', 'aaFiltroEvidencias', 'aa-evid', [['any', 'main.aaConYSin'], ['with', 'main.aaConEvidencia'], ['without', 'main.aaSinEvidencia']], (v) => { filters.evid = v; render(); });
    const fromField = dateField('main.cpFiltroDesde', 'aaFiltroFechas', 'aa-from', async (v) => { filters.from = v; await ensureFrom(v); render({ scrollToToday: true }); });
    const toField = dateField('main.cpFiltroHasta', 'aaFiltroFechas', 'aa-to', (v) => { filters.to = v; render({ scrollToToday: true }); });
    bar.append(searchField, viewField);
    if (canFilter('colAaClasificacion')) bar.appendChild(clsSel.field);
    if (canFilter('colAaActivo')) bar.appendChild(typeSel.field);
    if (canFilter('colAaQuien')) bar.appendChild(whoSel.field);
    if (canFilter('colAaResultado')) bar.appendChild(resultField);
    if (canFilter('colAaFecha')) bar.append(fromField, toField);
    if (canFilter('colAaTiempo')) bar.appendChild(timeField);
    if (canFilter('colAaEvidencias')) bar.appendChild(evidField);
    // fila de abajo: ocultar fechas sin actividad y el resumen
    const sub = el('div', 'aa-subbar');
    const toggle = el('label', 'aa-toggle');
    toggle.setAttribute('data-help-key', 'aaOcultarVacias');
    const check = el('input');
    check.type = 'checkbox';
    check.checked = filters.hideEmpty;
    check.addEventListener('change', () => { filters.hideEmpty = check.checked; revealed.clear(); render(); });
    toggle.append(check, el('span', '', tx('main.aaOcultarVacias')));
    summaryEl = el('span', 'cp-note aa-summary');
    sub.append(toggle, summaryEl);
    tableHost = el('div', 'aa-scroll');
    tableHost.setAttribute('data-help-key', 'aaCuadro');
    tableHost.addEventListener('scroll', onScroll, { passive: true });
    moreBtn = el('button', 'btn btn-secondary aa-more', tx('main.aaCargarMas', { n: PAGE_DAYS }));
    moreBtn.type = 'button';
    moreBtn.hidden = true;
    moreBtn.addEventListener('click', () => loadOlder());
    root.append(bar, sub, tableHost, moreBtn);
    host.appendChild(root);
    refreshViewButtons();
}
function refreshViewButtons() { VIEWS.forEach((v) => { viewButtons[v].classList.toggle('on', view === v); viewButtons[v].setAttribute('aria-pressed', String(view === v)); }); }
function setLoadMoreBusy(busy) { if (moreBtn) { moreBtn.disabled = busy; moreBtn.textContent = busy ? tx('main.aaCargando') : tx('main.aaCargarMas', { n: PAGE_DAYS }); } }
async function ensureFrom(day) {
    if (!day || day >= loadedFromDay) return;
    await loadOlder(day);
}
// Al llegar al final se cargan más días: en la lista de activos el final es el borde izquierdo (lo más viejo), en la lista de fechas es abajo.
function onScroll() {
    if (!hasOlder || loading || filters.from) return;
    const nearEnd = view === 'assets' ? (tableHost.scrollWidth > tableHost.clientWidth + 8 && tableHost.scrollLeft <= 24) : tableHost.scrollTop + tableHost.clientHeight >= tableHost.scrollHeight - 40;
    if (nearEnd) loadOlder();
}
// Las opciones de los filtros salen de lo que hay cargado.
function syncOptions() {
    const list = [...assets.values()];
    const clsNames = [...new Set(list.map((a) => a.className || ''))].sort((a, z) => a.localeCompare(z, localeOf()));
    clsSel.setOptions(clsNames.map((c) => ({ value: c, label: c || tx('main.aaSinClasificacion') })));
    const typeNames = [...new Set(list.map((a) => a.typeName || ''))].sort((a, z) => a.localeCompare(z, localeOf()));
    typeSel.setOptions(typeNames.map((c) => ({ value: c, label: c || '—' })));
    const people = [...new Set([...items.values()].map((i) => i.person || ''))].sort((a, z) => a.localeCompare(z, localeOf()));
    whoSel.setOptions(people.map((p) => ({ value: p, label: p || '—' })));
}

// ---- lo que se ve --------------------------------------------------------------------------------------------------------------------------------------
const itemFiltersActive = () => !!(filters.text.trim() || filters.who || filters.result !== 'all' || filters.time !== 'any' || filters.evid !== 'any');
function timeMatches(seconds) {
    if (filters.time === 'any') return true;
    if (filters.time === 'none') return seconds === null || seconds === undefined;
    if (seconds === null || seconds === undefined) return false;
    if (filters.time === 'lt1') return seconds < 60;
    if (filters.time === '1to5') return seconds >= 60 && seconds <= 300;
    return seconds > 300;
}
function compute() {
    const selectedCenters = Dashboard.getSelectedCostCenterIds ? Dashboard.getSelectedCostCenterIds() : null;
    const matchText = filters.text.trim() ? SearchSyntax.compile('contains', filters.text) : null;
    const assetList = [...assets.values()].filter((a) => {
        if (selectedCenters && a.costCenterId && !selectedCenters.includes(a.costCenterId)) return false;
        if (filters.cls && !filters.cls.has(a.className || '')) return false;
        if (filters.type && !filters.type.has(a.typeName || '')) return false;
        return true;
    }).sort((a, z) => (a.className || '').localeCompare(z.className || '', localeOf()) || a.code.localeCompare(z.code, localeOf(), { numeric: true }));
    const assetById = new Map(assetList.map((a) => [a.id, a]));
    const start = filters.from || loadedFromDay;
    const today = todayKey();
    let end = filters.to && filters.to < today ? filters.to : today;
    const days = [];
    for (let d = start; d <= end && days.length < 800; d = addDays(d, 1)) days.push(d);
    const inRange = new Set(days);
    const cell = new Map(); // `${assetId}|${day}` -> actividades de la más vieja a la más nueva
    let count = 0;
    items.forEach((it) => {
        const asset = assetById.get(it.assetId);
        if (!asset) return;
        const day = dayOfIso(it.at);
        if (!inRange.has(day)) return;
        if (filters.who && !filters.who.has(it.person || '')) return;
        if (filters.result !== 'all' && it.result !== filters.result) return;
        if (!timeMatches(it.durationS)) return;
        if (filters.evid === 'with' && !it.hasPhoto) return;
        if (filters.evid === 'without' && it.hasPhoto) return;
        if (matchText) {
            const hay = [asset.code, asset.name, asset.typeName, asset.className, asset.costCenterName, it.person, resultText(it.result), dayText(day), timeText(it.at), it.temperature, it.humidity].filter((x) => x !== null && x !== undefined).join(' ');
            if (!matchText(hay)) return;
        }
        const key = `${it.assetId}|${day}`;
        if (!cell.has(key)) cell.set(key, []);
        cell.get(key).push(it);
        count += 1;
    });
    cell.forEach((list) => list.sort((a, z) => (a.at < z.at ? -1 : a.at > z.at ? 1 : a.id - z.id)));
    const shownAssets = itemFiltersActive() ? assetList.filter((a) => days.some((d) => cell.has(`${a.id}|${d}`))) : assetList;
    const shownIds = new Set(shownAssets.map((a) => a.id));
    const active = new Set();
    cell.forEach((list, key) => { const [id, day] = key.split('|'); if (shownIds.has(Number(id))) active.add(day); });
    const dayInfo = days.map((d) => ({ key: d, today: d === today, hidden: filters.hideEmpty && !active.has(d) && d !== today && !revealed.has(d) }));
    return { assets: shownAssets, days: dayInfo, cell, count };
}

// ---- dibujo -------------------------------------------------------------------------------------------------------------------------------------------
function markButton(it, asset) {
    const b = el('button', `aa-m aa-m-${it.result}`, timeText(it.at));
    b.type = 'button';
    const parts = [asset.code, resultText(it.result)];
    if (it.temperature !== null && it.temperature !== undefined) parts.push(`${numText(it.temperature)} °C`);
    if (it.humidity !== null && it.humidity !== undefined) parts.push(`${numText(it.humidity)} %`);
    b.title = parts.join(' · ');
    b.addEventListener('click', () => openDetail(it.id));
    return b;
}
function cellContent(list, asset, day) {
    const box = el('div', 'aa-cell');
    list.slice(0, list.length > MAX_STACK ? MAX_STACK : list.length).forEach((it) => box.appendChild(markButton(it, asset)));
    if (list.length > MAX_STACK) {
        const more = el('button', 'aa-m aa-m-more', tx('main.aaMasN', { n: list.length - MAX_STACK }));
        more.type = 'button';
        more.addEventListener('click', () => openDayList(asset, day, list));
        box.appendChild(more);
    }
    return box;
}
function dayHeaderContent(info) {
    const wrap = el('div', 'aa-dayh');
    wrap.appendChild(el('b', '', dayText(info.key)));
    if (info.today) wrap.appendChild(el('small', '', tx('main.aaHoy')));
    return wrap;
}
function gapHeader(info) {
    const th = el('th', 'aa-gap');
    th.dataset.col = 'colAaFecha';
    const b = el('button', 'aa-gap-btn');
    b.type = 'button';
    b.title = tx('main.aaMostrarFecha');
    b.appendChild(el('span', 'aa-gap-label', tx('main.aaSinActividadDia', { date: dayShort(info.key) })));
    b.addEventListener('click', () => { revealed.add(info.key); render(); });
    th.appendChild(b);
    return th;
}
function assetCell(a, className) {
    const td = el('td', `aa-stick2 ${className || ''}`.trim());
    td.dataset.col = 'colAaActivo';
    td.appendChild(el('b', '', a.code));
    td.appendChild(el('small', 'aa-sub', [a.typeName, a.name && a.name !== a.typeName ? a.name : ''].filter(Boolean).join(' · ')));
    td.title = [a.code, a.name, a.typeName, a.costCenterName].filter(Boolean).join(' · ');
    return td;
}
function renderAssetsView(model) {
    const table = el('table', 'aa-table aa-gantt');
    const thead = el('thead');
    const head = el('tr');
    const thC = el('th', 'aa-stick', tx('main.colAaClasificacion'));
    thC.dataset.col = 'colAaClasificacion';
    const thA = el('th', 'aa-stick2', tx('main.colAaActivo'));
    thA.dataset.col = 'colAaActivo';
    head.append(thC, thA);
    model.days.forEach((d) => {
        if (d.hidden) { head.appendChild(gapHeader(d)); return; }
        const th = el('th', d.today ? 'aa-today' : '');
        th.dataset.col = 'colAaFecha';
        th.appendChild(dayHeaderContent(d));
        head.appendChild(th);
    });
    thead.appendChild(head);
    const tbody = el('tbody');
    // los activos juntos por clasificación: la clasificación va una vez por grupo (celda combinada)
    const groups = [];
    model.assets.forEach((a) => { const name = a.className || ''; const last = groups[groups.length - 1]; if (last && last.name === name) last.list.push(a); else groups.push({ name, list: [a] }); });
    groups.forEach((g) => {
        g.list.forEach((a, index) => {
            const tr = el('tr', index === 0 ? 'aa-first' : '');
            if (index === 0) {
                const td = el('td', 'aa-stick aa-cls-cell');
                td.dataset.col = 'colAaClasificacion';
                td.rowSpan = g.list.length;
                td.appendChild(el('b', '', g.name || tx('main.aaSinClasificacion')));
                td.appendChild(el('small', 'aa-sub', tx(g.list.length === 1 ? 'main.aaUnActivo' : 'main.aaNActivos', { n: g.list.length })));
                tr.appendChild(td);
            }
            tr.appendChild(assetCell(a));
            model.days.forEach((d) => {
                const td = el('td', d.hidden ? 'aa-gap' : (d.today ? 'aa-today' : ''));
                td.dataset.col = 'colAaFecha';
                if (!d.hidden) td.appendChild(cellContent(model.cell.get(`${a.id}|${d.key}`) || [], a, d.key));
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    });
    table.append(thead, tbody);
    return table;
}
function renderDatesView(model) {
    const table = el('table', 'aa-table aa-gantt aa-bydate');
    const thead = el('thead');
    // fila de arriba: «Clasificación activo» agrupa a los activos
    const classRow = el('tr', 'aa-cls');
    const corner = el('th', 'aa-stick', tx('main.colAaClasificacion'));
    corner.dataset.col = 'colAaClasificacion';
    classRow.appendChild(corner);
    const groups = [];
    model.assets.forEach((a) => { const name = a.className || ''; const last = groups[groups.length - 1]; if (last && last.name === name) last.list.push(a); else groups.push({ name, list: [a] }); });
    groups.forEach((g) => { const th = el('th', 'aa-cls-head', g.name || tx('main.aaSinClasificacion')); th.colSpan = g.list.length; th.dataset.col = 'colAaClasificacion'; classRow.appendChild(th); });
    const assetRow = el('tr');
    const dateHead = el('th', 'aa-stick', tx('main.aaFechaActivo'));
    dateHead.dataset.col = 'colAaFecha';
    assetRow.appendChild(dateHead);
    model.assets.forEach((a) => {
        const th = el('th', 'aa-asset-head');
        th.dataset.col = 'colAaActivo';
        th.appendChild(el('b', '', a.code));
        th.appendChild(el('small', 'aa-sub', a.typeName || a.name || ''));
        th.title = [a.code, a.name, a.typeName, a.costCenterName].filter(Boolean).join(' · ');
        assetRow.appendChild(th);
    });
    thead.append(classRow, assetRow);
    const tbody = el('tbody');
    const span = model.assets.length + 1;
    model.days.slice().reverse().forEach((d) => {
        if (d.hidden) {
            const tr = el('tr', 'aa-gaprow');
            const td = el('td', 'aa-stick');
            td.colSpan = span;
            const b = el('button', 'aa-gap-btn aa-gap-row');
            b.type = 'button';
            b.title = tx('main.aaMostrarFecha');
            b.appendChild(el('span', 'aa-gap-label', tx('main.aaSinActividadDiaOculta', { date: dayShort(d.key) })));
            b.addEventListener('click', () => { revealed.add(d.key); render(); });
            td.appendChild(b);
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }
        const tr = el('tr', d.today ? 'aa-today' : '');
        const dateCell = el('td', 'aa-stick');
        dateCell.dataset.col = 'colAaFecha';
        dateCell.appendChild(dayHeaderContent(d));
        tr.appendChild(dateCell);
        model.assets.forEach((a) => {
            const td = el('td', '');
            td.dataset.col = 'colAaFecha';
            td.appendChild(cellContent(model.cell.get(`${a.id}|${d.key}`) || [], a, d.key));
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    return table;
}
function render(opts = {}) {
    if (!tableHost) return;
    const model = compute();
    const before = tableHost.scrollLeft;
    tableHost.innerHTML = '';
    if (!model.assets.length || !model.days.length) {
        tableHost.appendChild(el('div', 'aa-empty', tx(assets.size ? 'main.aaVacioFiltros' : 'main.aaVacio')));
    } else {
        tableHost.appendChild(view === 'assets' ? renderAssetsView(model) : renderDatesView(model));
    }
    const hidden = model.days.filter((d) => d.hidden).length;
    summaryEl.textContent = [tx(model.count === 1 ? 'main.aaResumen1' : 'main.aaResumenN', { n: model.count }), hidden ? tx(hidden === 1 ? 'main.aaOcultaUna' : 'main.aaOcultasN', { n: hidden }) : '', truncated ? tx('main.aaCortado') : ''].filter(Boolean).join(' · ');
    moreBtn.hidden = !hasOlder || !!filters.from;
    // en la lista de activos se abre con lo más nuevo (hoy) a la vista; al cargar días más viejos se queda donde estaba
    if (view === 'assets') {
        if (opts.keepScrollFrom !== undefined) tableHost.scrollLeft = before + (tableHost.scrollWidth - opts.keepScrollFrom);
        else if (opts.scrollToToday) tableHost.scrollLeft = tableHost.scrollWidth;
        else tableHost.scrollLeft = before;
    } else if (opts.scrollToToday) tableHost.scrollTop = 0;
}

// ---- ventanas -----------------------------------------------------------------------------------------------------------------------------------------
function openDialog(title, subtitle) {
    const overlay = el('div', 'modal-overlay');
    const panel = el('div', 'modal-panel sku-edit-win asset-crit-win aa-win');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.appendChild(el('h3', '', title));
    if (subtitle) panel.appendChild(el('p', 'sku-edit-who', subtitle));
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    return { panel, close };
}
function dlgButton(label, { primary = false, onClick } = {}) {
    const b = el('button', primary ? 'btn' : 'btn btn-secondary', label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
}
function openDayList(asset, day, list) {
    const dlg = openDialog(tx('main.aaDiaTitulo', { code: asset.code }), dayText(day));
    const body = el('div', 'asset-crit-body');
    list.forEach((it) => {
        const row = el('div', 'asset-crit-row');
        const main = el('div', 'asset-crit-main');
        main.appendChild(el('span', `aa-m aa-m-${it.result}`, timeText(it.at)));
        main.appendChild(el('small', '', [it.person, resultText(it.result)].filter(Boolean).join(' · ')));
        row.appendChild(main);
        row.appendChild(dlgButton(tx('main.aaVerDetalle'), { onClick: () => { dlg.close(); openDetail(it.id); } }));
        body.appendChild(row);
    });
    dlg.panel.appendChild(body);
    const actions = el('div', 'admin-form-actions');
    actions.appendChild(dlgButton(tx('main.aaCerrar'), { primary: true, onClick: dlg.close }));
    dlg.panel.appendChild(actions);
}
const SYSTEM_KEYS = ['colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos', 'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto', 'colSysAnio', 'colSysSemana', 'colSysHora'];
function kvRow(labelKey, valueNode) {
    const row = el('div', 'aa-kv-row');
    row.appendChild(el('span', '', tx(labelKey)));
    const value = el('b');
    if (typeof valueNode === 'string') value.textContent = valueNode; else value.appendChild(valueNode);
    row.appendChild(value);
    return row;
}
function measureNode(value, unit, status, limit) {
    const wrap = document.createElement('span');
    wrap.appendChild(document.createTextNode(`${numText(value)} ${unit}`));
    if (status) {
        const chip = el('span', `aa-m aa-m-${status === 'ok' ? 'ok' : 'out'}`, tx(status === 'ok' ? 'main.aaResultadoDentro' : 'main.aaResultadoFuera'));
        wrap.append(' ', chip);
        const text = limitText(limit);
        if (text) wrap.appendChild(el('small', 'aa-sub', ` (${text})`));
    }
    return wrap;
}
async function openDetail(id) {
    const dlg = openDialog(tx('main.aaDetalleCargando'), '');
    const actions = el('div', 'admin-form-actions');
    actions.appendChild(dlgButton(tx('main.aaCerrar'), { primary: true, onClick: dlg.close }));
    try {
        const res = await fetch(`${API}/${id}`, { credentials: 'include' });
        if (!res.ok) throw new Error('detail');
        const d = await res.json();
        dlg.panel.querySelector('h3').textContent = tx('main.aaDetalleTitulo', { code: d.assetCode, name: d.assetName });
        const body = el('div', 'aa-kv');
        body.appendChild(kvRow('main.colAaQuien', d.person || '—'));
        const result = el('span');
        result.appendChild(el('span', `aa-m aa-m-${d.result}`, resultText(d.result)));
        body.appendChild(kvRow('main.colAaResultado', result));
        if (d.temperature !== null && d.temperature !== undefined) body.appendChild(kvRow('main.aaDTemperatura', measureNode(d.temperature, '°C', d.tempStatus, d.tempLimit)));
        if (d.humidity !== null && d.humidity !== undefined) body.appendChild(kvRow('main.aaDHumedad', measureNode(d.humidity, '%', d.humStatus, d.humLimit)));
        body.appendChild(kvRow('main.colAaFecha', whenText(d.at)));
        body.appendChild(kvRow('main.colAaTiempo', durationText(d.durationS)));
        body.appendChild(kvRow('main.aaDOrigen', tx(`main.aaOrigen_${d.source}`) === `main.aaOrigen_${d.source}` ? d.source : tx(`main.aaOrigen_${d.source}`)));
        body.appendChild(kvRow('main.aaDActivo', [d.assetCode, d.typeName, d.className, d.costCenterName].filter(Boolean).join(' · ')));
        dlg.panel.appendChild(body);
        const evid = el('div', 'aa-evid');
        evid.appendChild(el('p', 'aa-evid-title', tx('main.colAaEvidencias')));
        if (d.hasPhoto) {
            const link = el('a', 'aa-photo');
            link.href = `/api/business/temperatures/${d.id}/photo`;
            link.target = '_blank';
            link.rel = 'noopener';
            const img = el('img');
            img.alt = tx('main.aaFotoLectura');
            img.loading = 'lazy';
            img.src = `/api/business/temperatures/${d.id}/photo?thumb=1`;
            link.append(img, el('span', '', tx('main.aaFotoLectura')));
            evid.appendChild(link);
        } else evid.appendChild(el('p', 'asset-crit-empty', tx('main.aaSinFoto')));
        dlg.panel.appendChild(evid);
        const control = el('details', 'aa-control');
        control.appendChild(el('summary', '', tx('menu.classControlInterno')));
        const list = el('div', 'aa-kv');
        SYSTEM_KEYS.forEach((key) => list.appendChild(kvRow(`main.${key}`, d[key] === undefined || d[key] === '' ? '—' : String(d[key]))));
        control.appendChild(list);
        dlg.panel.appendChild(control);
        actions.insertBefore(dlgButton(tx('main.aaVerActivo'), { onClick: () => { window.location.href = 'GesCentroDistActivos.html'; } }), actions.firstChild);
    } catch (err) {
        dlg.panel.querySelector('h3').textContent = tx('main.aaDetalleTitulo', { code: '', name: '' }).trim();
        dlg.panel.appendChild(el('p', 'asset-crit-empty', tx('admin.loadError')));
    }
    dlg.panel.appendChild(actions);
}
})();
