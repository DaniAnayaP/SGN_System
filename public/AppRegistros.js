// ---------------------------------------------------------------------------
// Registros Información (App) — la misma pantalla de la Web (Cargas Manuales > Registros Información) hecha para el celular, sin tablas (Daniel, 2026-11-25, «Sí a las propuestas»: tipo banco, intuitivo, pocos toques). PIEZA A (solo ver):
//   · Lista: un registro por tarjeta (los dos de siempre y los que agregó la empresa): su nombre, si es Mensual o Diario, cuándo se cargó por última vez y su tira de periodos (verde = cargado, ámbar punteado = falta en medio);
//   · Un registro: la última carga (fecha, hora, quién y de qué archivo), la tira de periodos, el buscador (la sintaxis de siempre: $ antes, @ después, la coma separa), dos filtros (categoría y unidad) y una tarjeta por código y unidad con su último valor;
//   · Un código: sus datos, las barras de sus valores por mes (o por día) con los periodos que faltan, la lista de periodos y Control Interno plegado.
// Mismos datos y mismos permisos que la Web (las rutas son las de la Web: ver los datos es de quien tiene la pantalla); en la App la da la «Visión APP». Sin señal se ve lo último que se bajó (guardado en el celular, por empresa).
// Siguen las piezas B (Cargas y Anular) y C (Cargar registro en tres pasos).
// ---------------------------------------------------------------------------

const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';
let dict = {};

function t(key, params = {}) {
    const value = key.split('.').reduce((obj, part) => obj?.[part], dict);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const currentLang = () => (SUPPORTED_LANGS.includes(localStorage.getItem('lang')) ? localStorage.getItem('lang') : DEFAULT_LANG);

async function loadLanguage() {
    const lang = currentLang();
    try {
        const res = await fetch(`i18n/${lang}.json`);
        if (res.ok) dict = await res.json();
    } catch {
        dict = {};
    }
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    const titleTag = document.querySelector('title[data-i18n]');
    if (titleTag) document.title = t(titleTag.dataset.i18n);
}

function showToast(message, duration = 4000) {
    const container = document.getElementById('home-toast-container');
    const toast = document.createElement('div');
    toast.className = 'home-toast';
    toast.setAttribute('role', 'status');
    const icon = document.createElement('span');
    icon.className = 'home-toast-icon';
    icon.innerHTML = '<i class="bx bx-info-circle" aria-hidden="true"></i>';
    const msgEl = document.createElement('p');
    msgEl.className = 'home-toast-message';
    msgEl.textContent = message;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'home-toast-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
    const progress = document.createElement('div');
    progress.className = 'home-toast-progress';
    let dismissTimer = null;
    const close = () => {
        if (dismissTimer) clearTimeout(dismissTimer);
        toast.classList.remove('home-toast-visible');
        setTimeout(() => toast.remove(), 300);
    };
    closeBtn.addEventListener('click', close);
    toast.append(icon, msgEl, closeBtn, progress);
    container.appendChild(toast);
    void toast.offsetWidth;
    toast.classList.add('home-toast-visible');
    progress.style.transitionDuration = `${duration}ms`;
    progress.style.width = '0';
    dismissTimer = setTimeout(close, duration);
}

// --- Estilo (theme) — el mismo mecanismo de todas las páginas de la App. ----------------------------------------------------------------
let clientColorPalette = null;
let clientPrimaryColor = null;
const INSTITUTIONAL_THEME_PROPS = [
    '--home-bg', '--home-bg-grad-1', '--home-bg-grad-2', '--home-tabbar-bg',
    '--home-surface', '--home-surface-2', '--home-neutral-soft',
    '--home-border', '--home-divider',
    '--home-text-primary', '--home-text-secondary', '--home-text-tertiary', '--home-text-muted',
    '--home-accent', '--home-accent-strong-1', '--home-accent-strong-2', '--home-on-accent',
    '--home-header-grad-1', '--home-header-grad-2', '--home-on-header',
];
function applyInstitutionalTheme() {
    const palette = clientColorPalette
        || (clientPrimaryColor && window.ColorPalette ? window.ColorPalette.suggestPalette(clientPrimaryColor) : null);
    if (!palette) return;
    const root = document.body.style;
    root.setProperty('--home-bg', palette.bg || '#0e1e33');
    root.setProperty('--home-bg-grad-1', palette.bg || '#0e1e33');
    root.setProperty('--home-bg-grad-2', palette.bg || '#0e1e33');
    root.setProperty('--home-tabbar-bg', palette.bg || '#0e1e33');
    root.setProperty('--home-surface', palette.surface || '#16304d');
    root.setProperty('--home-surface-2', palette.surface || '#16304d');
    root.setProperty('--home-neutral-soft', palette.surface || '#16304d');
    root.setProperty('--home-border', palette.border || '#2a4d70');
    root.setProperty('--home-divider', palette.border || '#2a4d70');
    root.setProperty('--home-text-primary', palette.textPrimary || '#ffffff');
    root.setProperty('--home-text-secondary', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-text-tertiary', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-text-muted', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-accent', palette.accent || '#7fd1ff');
    root.setProperty('--home-accent-strong-1', palette.accent || '#2f6fae');
    root.setProperty('--home-accent-strong-2', palette.accent || '#2f6fae');
    root.setProperty('--home-on-accent', palette.accentText || '#ffffff');
    root.setProperty('--home-header-grad-1', palette.tooltipBg || '#1c3a5e');
    root.setProperty('--home-header-grad-2', palette.tooltipBg || '#1c3a5e');
    root.setProperty('--home-on-header', palette.tooltipText || '#ffffff');
}
function getStoredStyle() {
    const stored = localStorage.getItem('style');
    return ['light', 'dark', 'institutional', 'futuristic'].includes(stored) ? stored : 'light';
}
function applyStyle(style) {
    document.body.classList.remove('institutional-mode', 'dark-mode', 'futuristic-mode');
    INSTITUTIONAL_THEME_PROPS.forEach((prop) => document.body.style.removeProperty(prop));
    if (style === 'institutional') { document.body.classList.add('institutional-mode'); applyInstitutionalTheme(); }
    else if (style === 'dark') document.body.classList.add('dark-mode');
    else if (style === 'futuristic') document.body.classList.add('futuristic-mode');
}
async function loadBrandingForTheme() {
    try {
        const res = await fetch(apiUrl('/api/business/branding'), { credentials: 'include' });
        if (!res.ok) return;
        const { branding } = await res.json();
        clientColorPalette = branding.colorPalette || null;
        clientPrimaryColor = branding.primaryColor || null;
        if (getStoredStyle() === 'institutional') applyInstitutionalTheme();
    } catch {
        // Se queda con el estilo fijo de cada tema.
    }
}

// --- Estado ----------------------------------------------------------------------------------------------------------------------------
const API = '/api/business/manual-registries';
const SYSTEM_KEYS = ['colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos', 'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto', 'colSysAnio', 'colSysSemana', 'colSysHora'];
const MAX_ROWS = 40;                           // las tarjetas que se dibujan a la vez: «Mostrar más» y el buscador traen el resto
const SHOWN_PERIODS = 12;                      // los periodos que salen en la lista del detalle de un código (los demás con «Ver todos»)
const BAR_PERIODS = { month: 24, day: 30 };    // los periodos que dibujan las barras
const STRIP_DAYS = 45;                         // la tira de un registro diario cubre hasta los últimos 45 días
const DAY_MS = 86400000;
let currentUser = null;
let registries = [];          // los registros de la empresa (con sus periodos y su última carga)
let dataByKey = {};           // registro -> lo que el servidor contestó de sus datos
let dataState = 'loading';    // 'online' | 'cached' | 'none'
let view = 'list';            // 'list' | 'registry' | 'code'
let regKey = null;
let rowId = null;
let search = '';
let catFilter = '';
let unitFilter = '';
let shown = MAX_ROWS;
let allPeriods = false;       // el detalle de un código lista todos sus periodos
let listScroll = 0;
let regScroll = 0;

const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
// Lo que se desplaza es la página o el cuerpo de la pantalla según el celular: se guarda y se restaura el que se haya movido.
const getScroll = () => Math.max(window.scrollY || 0, bodyEl.scrollTop || 0);
const setScroll = (y) => { bodyEl.scrollTop = y; window.scrollTo(0, y); };

// --- Periodos, fechas y números ---------------------------------------------------------------------------------------------------------------------
const localeOf = () => (currentLang() === 'es' ? 'es-MX' : 'en-US');
const MONTH_ABBR = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] };
// «2026-08» -> «ago-26»; «2026-08-14» -> «14/ago/2026» (igual que la pantalla de la Web)
function periodLabel(period) {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(period || '');
    if (!m) return String(period || '');
    const abbr = MONTH_ABBR[currentLang()][Number(m[2]) - 1];
    return m[3] ? `${m[3]}/${abbr}/${m[1]}` : `${abbr}-${m[1].slice(2)}`;
}
const num = (n) => Number(n || 0).toLocaleString(localeOf(), { maximumFractionDigits: 3 });
// Las horas del servidor son UTC («2026-11-25 16:42:00»): aquí se muestran en la hora de quien mira.
function utcDate(text) {
    const d = new Date(`${String(text || '').replace(' ', 'T')}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}
function dayText(text) {
    const d = utcDate(text);
    return d ? new Intl.DateTimeFormat(localeOf(), { day: '2-digit', month: 'short', year: 'numeric' }).format(d).replace(/\./g, '') : '';
}
function timeText(text) {
    const d = utcDate(text);
    return d ? new Intl.DateTimeFormat(localeOf(), { hour: '2-digit', minute: '2-digit' }).format(d) : '';
}
function monthsBetween(from, to) {
    const out = [];
    let [y, m] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m += 1; if (m > 12) { m = 1; y += 1; } }
    return out;
}
const toMs = (p) => Date.parse(`${p}T00:00:00Z`);
// Todos los periodos del rango del registro (de menor a mayor): los meses entre el primero y el último; los días entre el primero y el último (hasta los últimos 45).
function rangeOf(reg, periods, limitDays) {
    if (!periods.length) return [];
    if (reg.kind === 'month') return monthsBetween(periods[0], periods[periods.length - 1]);
    const last = toMs(periods[periods.length - 1]);
    const first = Math.max(toMs(periods[0]), last - ((limitDays || STRIP_DAYS) - 1) * DAY_MS);
    const out = [];
    for (let ms = first; ms <= last; ms += DAY_MS) out.push(new Date(ms).toISOString().slice(0, 10));
    return out;
}
// Los que faltan en medio: del rango, los que ninguna carga trajo.
function missingOf(reg, periods) {
    const have = new Set(periods);
    return rangeOf(reg, periods).filter((p) => !have.has(p));
}

// --- Registros ---------------------------------------------------------------------------------------------------------------------------
const regName = (reg) => (reg && (reg.name || (reg.nameKey ? t(reg.nameKey) : ''))) || t('menu.cmRegistrosInformacion');
const kindText = (reg) => t(reg.kind === 'month' ? 'main.regKindMonth' : 'main.regKindDay');
const valueLabel = (reg) => (reg && (reg.valueName || (reg.valueNameKey ? t(reg.valueNameKey) : ''))) || '';
const currentReg = () => registries.find((r) => r.key === regKey) || null;
const currentData = () => dataByKey[regKey] || null;

// --- Carga: lo último que se bajó se guarda en el celular (por empresa) para verlo también sin señal ----------------------------------------------------------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-reg-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function cacheSave() {
    try {
        const db = await cacheDb();
        const value = { clientId: currentUser ? (currentUser.clientId ?? null) : null, registries, data: dataByKey, at: Date.now() };
        await new Promise((resolve, reject) => {
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(value, 'data');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch { /* sin almacenamiento: se bajan otra vez la próxima */ }
}
async function cacheRead() {
    const db = await cacheDb();
    return new Promise((resolve, reject) => {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get('data');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}
// Lo guardado solo sirve si es de la misma empresa (otra cuenta en el mismo celular no ve registros ajenos).
async function savedForThisClient() {
    try {
        const saved = await cacheRead();
        if (saved && (saved.clientId ?? null) === (currentUser ? (currentUser.clientId ?? null) : null)) return saved;
    } catch { /* sin datos guardados */ }
    return null;
}
async function loadRegistries() {
    try {
        const res = await fetch(apiUrl(API), { credentials: 'include' });
        if (res.status === 401) { window.location.replace('Login.html'); return; }
        if (res.ok) {
            const body = await res.json();
            registries = body.registries || [];
            dataState = 'online';
            // los datos que ya estaban guardados siguen sirviendo si luego se pierde la señal dentro de la pantalla
            const saved = await savedForThisClient();
            if (saved) dataByKey = { ...(saved.data || {}) };
            cacheSave();
            return;
        }
    } catch { /* sin señal: se usa lo guardado */ }
    const saved = await savedForThisClient();
    if (saved) {
        registries = saved.registries || [];
        dataByKey = saved.data || {};
        dataState = 'cached';
        return;
    }
    registries = [];
    dataState = 'none';
}
// Los datos de un registro (sus periodos, su última carga y un renglón por unidad y código); sin señal se usa lo guardado.
async function loadRegistryData(key) {
    try {
        const res = await fetch(apiUrl(`${API}/${encodeURIComponent(key)}/data`), { credentials: 'include' });
        if (res.status === 401) { window.location.replace('Login.html'); return false; }
        if (res.ok) {
            const body = await res.json();
            dataByKey[key] = body;
            const reg = registries.find((r) => r.key === key);
            if (reg) { reg.periods = body.periods; reg.lastLoad = body.lastLoad; }
            cacheSave();
            return true;
        }
    } catch { /* sin señal: se usa lo guardado */ }
    return !!dataByKey[key];
}

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    bodyEl.innerHTML = '';
    if (view === 'code') renderCode();
    else if (view === 'registry') renderRegistry();
    else renderList();
}
// La tira de periodos: uno verde por cada periodo cargado y uno ámbar con borde punteado por cada uno que falta en medio.
function stripNode(reg, periods) {
    const range = rangeOf(reg, periods);
    const have = new Set(periods);
    const wrap = el('div', 'rg-app-stripwrap');
    wrap.setAttribute('data-help-key', 'appRegStrip');
    const strip = el('div', 'rg-app-strip');
    range.forEach((p) => { const cell = el('i', have.has(p) ? 'rg-app-ok' : 'rg-app-miss'); cell.title = periodLabel(p); strip.appendChild(cell); });
    wrap.appendChild(strip);
    if (range.length > 1) wrap.appendChild(el('div', 'rg-app-stripl')).append(el('span', '', periodLabel(range[0])), el('span', '', periodLabel(range[range.length - 1])));
    const missing = missingOf(reg, periods);
    if (missing.length) {
        const chip = el('span', 'rg-app-warn');
        chip.innerHTML = '<i class="bx bx-error" aria-hidden="true"></i>';
        chip.append(t(missing.length === 1 ? 'home.regMissOne' : 'home.regMissMany', { period: periodLabel(missing[0]), n: missing.length }));
        wrap.appendChild(chip);
    }
    return wrap;
}

// --- La lista de registros -----------------------------------------------------------------------------------------------------------
function renderList() {
    titleEl.textContent = t('menu.cmRegistrosInformacion');
    if (dataState === 'cached') bodyEl.appendChild(el('p', 'pm-app-note', t('home.regCached')));
    if (dataState === 'none' || !registries.length) { bodyEl.appendChild(el('p', 'home-carga-empty-note', t(dataState === 'none' ? 'home.regNoData' : 'main.regCardNone'))); return; }
    const list = el('div', 'cal-app-list');
    list.setAttribute('data-help-key', 'appRegLista');
    registries.forEach((reg) => list.appendChild(registryCard(reg)));
    bodyEl.appendChild(list);
}
// Un registro: su nombre, si es mensual o diario, cuándo se cargó por última vez y su tira de periodos; un toque lo abre.
function registryCard(reg) {
    const periods = reg.periods || [];
    const card = el('button', `pm-app-card rg-app-reg${reg.status === 'active' ? '' : ' rg-app-off'}`);
    card.type = 'button';
    card.setAttribute('data-help-key', 'appRegCard');
    const top = el('span', 'rg-app-top');
    top.append(el('b', '', regName(reg)), el('i', 'rg-app-pill', kindText(reg)));
    if (reg.status !== 'active') top.appendChild(el('i', 'rg-app-pill rg-app-pill-off', t('main.regStatus_inactive')));
    card.appendChild(top);
    const load = reg.lastLoad;
    card.appendChild(el('span', 'rg-app-sub', load ? `${t('home.regLast')} ${dayText(load.createdAt)}${load.loadedBy ? ` · ${load.loadedBy}` : ''}` : t('main.regCardNone')));
    if (periods.length) card.appendChild(stripNode(reg, periods));
    card.addEventListener('click', () => openRegistry(reg.key));
    return card;
}
async function openRegistry(key) {
    listScroll = getScroll();
    regKey = key;
    search = ''; catFilter = ''; unitFilter = ''; shown = MAX_ROWS;
    if (!(await loadRegistryData(key))) { showToast(t('main.regLoadError')); return; }
    view = 'registry';
    render();
    setScroll(0);
}

// --- Un registro: la última carga y sus datos como tarjetas ------------------------------------------------------------------------------
function renderRegistry() {
    const reg = currentReg();
    const data = currentData();
    if (!reg || !data) { view = 'list'; render(); return; }
    titleEl.textContent = regName(reg);
    if (dataState === 'cached') bodyEl.appendChild(el('p', 'pm-app-note', t('home.regCached')));
    const periods = data.periods || [];
    // sin ninguna carga no hay nada que resumir ni que buscar
    if (!periods.length) { bodyEl.appendChild(el('p', 'home-carga-empty-note', t('main.regCardNone'))); return; }
    const load = data.lastLoad;
    const hero = el('div', 'pm-app-card rg-app-hero');
    hero.setAttribute('data-help-key', 'appRegHero');
    const heroTop = el('span', 'rg-app-top');
    heroTop.append(el('span', 'rg-app-lbl', t('home.regLastLoad')), el('i', 'rg-app-pill', kindText(reg)));
    hero.appendChild(heroTop);
    if (load) {
        hero.appendChild(el('b', 'rg-app-big', dayText(load.createdAt)));
        hero.appendChild(el('span', 'rg-app-sub', [timeText(load.createdAt), load.loadedBy, load.fileName].filter(Boolean).join(' · ')));
    }
    hero.appendChild(stripNode(reg, periods));
    bodyEl.appendChild(hero);

    // buscador (la sintaxis de siempre: $ antes, @ después, la coma separa) y los dos filtros
    const input = el('input', 'pm-app-input seg-app-search');
    input.type = 'search';
    input.placeholder = t('main.filterRegSearchHint');
    input.setAttribute('aria-label', t('main.aaBuscar'));
    input.setAttribute('data-help-key', 'appRegBuscar');
    input.value = search;
    bodyEl.appendChild(input);
    const filters = el('div', 'rg-app-filters');
    filters.setAttribute('data-help-key', 'appRegFiltros');
    const filterSelect = (allKey, values, current, onChange) => {
        const select = el('select', 'pm-app-input rg-app-select');
        select.setAttribute('aria-label', t(allKey));
        const all = el('option', '', t(allKey)); all.value = '';
        select.appendChild(all);
        values.forEach((v) => { const o = el('option', '', v); o.value = v; select.appendChild(o); });
        select.value = values.includes(current) ? current : '';
        select.addEventListener('change', () => onChange(select.value));
        return select;
    };
    const rows = data.rows || [];
    const cats = [...new Set(rows.map((r) => r.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, localeOf()));
    const units = [...new Set(rows.map((r) => r.unidad).filter(Boolean))].sort((a, b) => a.localeCompare(b, localeOf()));
    const listEl = el('div', 'cal-app-list');
    listEl.setAttribute('data-help-key', 'appRegLista');
    if (cats.length > 1) filters.appendChild(filterSelect('home.regAllCategories', cats, catFilter, (v) => { catFilter = v; shown = MAX_ROWS; drawRows(listEl); }));
    if (units.length > 1) filters.appendChild(filterSelect('home.regAllUnits', units, unitFilter, (v) => { unitFilter = v; shown = MAX_ROWS; drawRows(listEl); }));
    if (filters.childNodes.length) bodyEl.appendChild(filters);
    bodyEl.appendChild(listEl);
    let timer = 0;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { search = input.value; shown = MAX_ROWS; drawRows(listEl); }, 150); });
    drawRows(listEl);
}
function visibleRows() {
    const data = currentData();
    const text = search.trim();
    const test = window.SearchSyntax ? window.SearchSyntax.compile('contains', text) : (v) => String(v).toLowerCase().includes(text.toLowerCase());
    return (data.rows || []).filter((r) => {
        if (catFilter && r.categoria !== catFilter) return false;
        if (unitFilter && r.unidad !== unitFilter) return false;
        if (!text) return true;
        return test([r.unidad, r.unidadNombre, r.codigo, r.descripcion, r.categoria, r.udm].join(' '));
    });
}
function drawRows(listEl) {
    listEl.innerHTML = '';
    const items = visibleRows();
    if (!items.length) { listEl.appendChild(el('p', 'home-carga-empty-note', t(search.trim() || catFilter || unitFilter ? 'home.regNoMatch' : 'main.emptyStateText'))); return; }
    const periods = (currentData().periods || []).slice().reverse();
    items.slice(0, shown).forEach((r) => listEl.appendChild(rowCard(r, periods)));
    if (items.length > shown) {
        const more = el('button', 'home-carga-secondary-btn');
        more.type = 'button';
        more.textContent = t('home.regShowMore', { n: items.length - shown });
        more.addEventListener('click', () => { shown += MAX_ROWS; drawRows(listEl); });
        listEl.appendChild(more);
    }
}
// Un código en una unidad: su descripción, su categoría y UDM, y su último valor con el periodo; un toque abre el detalle.
function rowCard(r, periodsDesc) {
    const card = el('button', 'pm-app-card rg-app-row');
    card.type = 'button';
    card.setAttribute('data-help-key', 'appRegRow');
    const main = el('span', 'rg-app-main');
    main.appendChild(el('b', '', r.descripcion || r.codigo));
    main.appendChild(el('span', 'rg-app-sub', [r.codigo, [r.unidad, r.unidadNombre].filter(Boolean).join(' ')].filter(Boolean).join(' · ')));
    const pills = el('span', 'rg-app-pills');
    if (r.categoria) pills.appendChild(el('i', 'rg-app-pill', r.categoria));
    if (r.udm) pills.appendChild(el('i', 'rg-app-pill', r.udm));
    if (pills.childNodes.length) main.appendChild(pills);
    const last = periodsDesc.find((p) => r.values && r.values[p] !== undefined);
    const val = el('span', 'rg-app-val');
    val.append(el('b', '', last ? num(r.values[last]) : '—'), el('span', '', last ? periodLabel(last) : ''));
    card.append(main, val);
    card.addEventListener('click', () => openCode(r.id));
    return card;
}
function openCode(id) {
    regScroll = getScroll();
    rowId = id;
    allPeriods = false;
    view = 'code';
    render();
    setScroll(0);
}

// --- El detalle de un código: sus valores por mes (o por día) ----------------------------------------------------------------------------
function renderCode() {
    const reg = currentReg();
    const data = currentData();
    const row = data && (data.rows || []).find((r) => r.id === rowId);
    if (!reg || !row) { view = 'registry'; render(); return; }
    titleEl.textContent = row.descripcion || row.codigo;
    const meta = el('div', 'pm-app-meta');
    const metaRow = (labelKey, value) => { const div = el('div'); div.append(el('span', '', t(labelKey)), el('b', '', value || '—')); return div; };
    meta.append(
        metaRow('main.colRegCodigo', row.codigo), metaRow('main.colRegUnidad', [row.unidad, row.unidadNombre].filter(Boolean).join(' · ')),
        metaRow('main.colRegCategoria', row.categoria), metaRow('main.colRegUdm', row.udm),
    );
    bodyEl.appendChild(meta);

    const range = rangeOf(reg, data.periods || [], BAR_PERIODS.day);
    const barRange = range.slice(-BAR_PERIODS[reg.kind === 'month' ? 'month' : 'day']);
    const values = row.values || {};
    const maxValue = Math.max(0, ...barRange.map((p) => (values[p] === undefined ? 0 : values[p])));
    const card = el('div', 'pm-app-card rg-app-values');
    card.setAttribute('data-help-key', 'appRegValores');
    card.appendChild(el('span', 'rg-app-lbl', valueLabel(reg) || t('home.regValues')));
    const bars = el('div', 'rg-app-bars');
    barRange.forEach((p) => {
        const has = values[p] !== undefined;
        const bar = el('i', has ? '' : 'rg-app-barmiss');
        bar.style.height = `${has ? Math.max(8, maxValue > 0 ? Math.round((values[p] / maxValue) * 100) : 8) : 46}%`;
        bar.title = `${periodLabel(p)}: ${has ? num(values[p]) : t('home.regNoLoad')}`;
        bars.appendChild(bar);
    });
    card.appendChild(bars);
    if (barRange.length > 1) card.appendChild(el('div', 'rg-app-stripl')).append(el('span', '', periodLabel(barRange[0])), el('span', '', periodLabel(barRange[barRange.length - 1])));
    bodyEl.appendChild(card);

    // la lista de periodos, el más reciente arriba
    const listAll = range.slice().reverse();
    const shownPeriods = allPeriods ? listAll : listAll.slice(0, SHOWN_PERIODS);
    const list = el('div', 'pm-app-meta rg-app-plist');
    shownPeriods.forEach((p) => {
        const has = values[p] !== undefined;
        const div = el('div', has ? '' : 'rg-app-none');
        div.append(el('span', '', periodLabel(p)), el('b', '', has ? num(values[p]) : t('home.regNoLoad')));
        list.appendChild(div);
    });
    bodyEl.appendChild(list);
    if (listAll.length > SHOWN_PERIODS) {
        const toggle = el('button', 'home-carga-secondary-btn');
        toggle.type = 'button';
        toggle.textContent = t(allPeriods ? 'home.regShowLess' : 'home.regShowAll', { n: listAll.length });
        toggle.addEventListener('click', () => { allPeriods = !allPeriods; const y = getScroll(); render(); setScroll(y); });
        bodyEl.appendChild(toggle);
    }

    // Control Interno (lo que el servidor guarda de cada renglón)
    const control = el('details', 'aa-app-control');
    control.appendChild(el('summary', '', t('menu.classControlInterno')));
    const ctl = el('div', 'pm-app-meta');
    ctl.innerHTML = SYSTEM_KEYS.map((key) => `<div><span>${esc(t(`main.${key}`))}</span><b>${esc(row[key] === undefined || row[key] === null || row[key] === '' ? '—' : String(row[key]))}</b></div>`).join('');
    control.appendChild(ctl);
    bodyEl.appendChild(control);
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'code') { view = 'registry'; render(); setScroll(regScroll); return; }
    if (view === 'registry') { view = 'list'; render(); setScroll(listScroll); return; }
    window.location.href = 'AppInicio.html';
});

(async function init() {
    await loadLanguage();
    window.HelpMode?.init(t);
    try {
        const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' });
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        await loadBrandingForTheme();
        applyStyle(getStoredStyle());
        await loadRegistries();
        render();
        // ?registry=<llave>: abre ese registro directo (la llave que trae el menú)
        const wanted = new URLSearchParams(location.search).get('registry');
        if (wanted && registries.some((r) => r.key === wanted)) await openRegistry(wanted);
    } catch (err) {
        console.error('Registros (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
