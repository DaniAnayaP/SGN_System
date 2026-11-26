// ---------------------------------------------------------------------------
// Registros Información (App) — la misma pantalla de la Web (Cargas Manuales > Registros Información) hecha para el celular, sin tablas (Daniel, 2026-11-25, «Sí a las propuestas»: tipo banco, intuitivo, pocos toques). PIEZA A (solo ver):
//   · Lista: un registro por tarjeta (los dos de siempre y los que agregó la empresa): su nombre, si es Mensual o Diario, cuándo se cargó por última vez y su tira de periodos (verde = cargado, ámbar punteado = falta en medio);
//   · Un registro: la última carga (fecha, hora, quién y de qué archivo), la tira de periodos, el buscador (la sintaxis de siempre: $ antes, @ después, la coma separa), dos filtros (categoría y unidad) y una tarjeta por código y unidad con su último valor;
//   · Un código: sus datos, las barras de sus valores por mes (o por día) con los periodos que faltan, la lista de periodos y Control Interno plegado;
//   · Pestaña Cargas (pieza B): las cargas del registro (lo más reciente arriba, con su estado Vigente / Anulada), el detalle de una carga con sus cifras y «Anular esta carga» (con motivo y confirmación; necesita señal y el botón del árbol).
// Mismos datos y mismos permisos que la Web (las rutas son las de la Web: ver los datos es de quien tiene la pantalla); en la App la da la «Visión APP». Sin señal se ve lo último que se bajó (guardado en el celular, por empresa).
//   · Pieza C: «Cargar registro» en tres pasos (cuatro con «Con mi Excel»): cómo (plantilla o mi Excel; y el día si el registro es diario) → el archivo (el del teléfono) → emparejar sus columnas (solo mi Excel) → la revisión sin guardar
//     nada y «Confirmar carga»; y «Plantilla», que se comparte con la hoja del teléfono. Mismas rutas y reglas de la Web (inspect / import en preview y commit; el servidor decide). Necesita señal y un centro de costos completo.
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
const MAX_ROWS = 40;                           // las tarjetas que se dibujan a la vez: «Mostrar más» y el buscador traen el resto
const SHOWN_PERIODS = 12;                      // los periodos que salen en la lista del detalle de un código (los demás con «Ver todos»)
const BAR_PERIODS = { month: 24, day: 30 };    // los periodos que dibujan las barras
const STRIP_DAYS = 45;                         // la tira de un registro diario cubre hasta los últimos 45 días
const DAY_MS = 86400000;
let currentUser = null;
let registries = [];          // los registros de la empresa (con sus periodos y su última carga)
let dataByKey = {};           // registro -> lo que el servidor contestó de sus datos
let dataState = 'loading';    // 'online' | 'cached' | 'none'
let view = 'list';            // 'list' | 'registry' | 'code' | 'load' | 'wizard' (Cargar registro)
let regKey = null;
let rowId = null;
let search = '';
let catFilter = '';
let unitFilter = '';
let shown = MAX_ROWS;
let allPeriods = false;       // el detalle de un código lista todos sus periodos
let listScroll = 0;
let regScroll = 0;
let tab = 'data';             // en un registro: 'data' (sus códigos) | 'loads' (sus cargas)
let loadsByKey = {};          // registro -> { loads, canAnnul, state } lo que el servidor contestó de sus cargas
let loadId = null;
let loadSearch = '';
let loadsScroll = 0;

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
const kindText = (reg) => t(reg.kind === 'month' ? 'main.regKindMonth' : reg.kind === 'tabla' ? 'main.regKindTablaPill' : 'main.regKindDay');
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
        const value = { clientId: currentUser ? (currentUser.clientId ?? null) : null, registries, data: dataByKey, loads: loadsByKey, at: Date.now() };
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
            // lo guardado de la vez pasada solo completa lo que todavía no se bajó en esta sesión; sus cargas se ven pero no se anulan
            if (saved) {
                Object.values(saved.loads || {}).forEach((v) => { v.state = 'cached'; v.canAnnul = false; });
                dataByKey = { ...(saved.data || {}), ...dataByKey };
                loadsByKey = { ...(saved.loads || {}), ...loadsByKey };
            }
            cacheSave();
            return;
        }
    } catch { /* sin señal: se usa lo guardado */ }
    const saved = await savedForThisClient();
    if (saved) {
        registries = saved.registries || [];
        dataByKey = saved.data || {};
        loadsByKey = saved.loads || {};
        Object.values(loadsByKey).forEach((v) => { v.state = 'cached'; v.canAnnul = false; });
        dataState = 'cached';
        return;
    }
    registries = [];
    dataState = 'none';
}
// Los datos de un registro (sus periodos, su última carga y un renglón por unidad y código); sin señal se usa lo guardado.
async function loadRegistryData(key) {
    try {
        const res = await fetch(apiUrl(`${API}/${encodeURIComponent(key)}/data?lang=${currentLang()}&tz=${new Date().getTimezoneOffset()}`), { credentials: 'include' });
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

// Las cargas de un registro (con quién y cuándo, lo que trajeron y su estado); sin señal se usan las guardadas y entonces no se puede anular.
async function loadRegistryLoads(key) {
    try {
        const res = await fetch(apiUrl(`${API}/${encodeURIComponent(key)}/loads`), { credentials: 'include' });
        if (res.status === 401) { window.location.replace('Login.html'); return false; }
        if (res.ok) {
            const body = await res.json();
            loadsByKey[key] = { loads: body.loads || [], canAnnul: !!body.canAnnul, state: 'online' };
            cacheSave();
            return true;
        }
    } catch { /* sin señal: se usa lo guardado */ }
    if (loadsByKey[key]) { loadsByKey[key].state = 'cached'; loadsByKey[key].canAnnul = false; return true; }
    return false;
}

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    bodyEl.innerHTML = '';
    if (view !== 'wizard') setProgress(null);
    if (view === 'wizard') { titleEl.textContent = t('main.regImport'); if (siteBlocked) window.AppSiteGate.show(bodyEl, t); else renderWizard(); }
    else if (view === 'load') renderLoad();
    else if (view === 'code') renderCode();
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
    registries.filter((reg) => !reg.obsolete).forEach((reg) => list.appendChild(registryCard(reg)));
    bodyEl.appendChild(list);
    // los registros que ya no se usan, en su apartado «Obsoletos» (cerrado)
    const old = registries.filter((reg) => reg.obsolete);
    if (old.length) {
        const det = el('details', 'aa-app-control rg-app-obsol');
        det.setAttribute('data-help-key', 'appRegObsoletos');
        det.appendChild(el('summary', '', `${t('home.regObsoleteTitle')} (${old.length})`));
        const oldList = el('div', 'cal-app-list');
        old.forEach((reg) => oldList.appendChild(registryCard(reg)));
        det.appendChild(oldList);
        bodyEl.appendChild(det);
    }
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
    search = ''; catFilter = ''; unitFilter = ''; shown = MAX_ROWS; tab = 'data'; loadSearch = '';
    const [dataOk] = await Promise.all([loadRegistryData(key), loadRegistryLoads(key)]);
    if (!dataOk) { showToast(t('main.regLoadError')); return; }
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
    if (reg.kind === 'tabla') { renderFlexRegistry(reg, data); return; }
    const periods = data.periods || [];
    const loadsCount = loadsByKey[regKey] ? loadsByKey[regKey].loads.length : 0;
    // sin ninguna carga (ni siquiera una anulada) no hay nada que resumir, que buscar ni que anular
    if (!periods.length && !loadsCount) { bodyEl.appendChild(el('p', 'home-carga-empty-note', t('main.regCardNone'))); appendActions(); return; }
    if (tab === 'loads') { renderLoadsTab(); return; }
    // con todas las cargas anuladas ya no hay periodos: queda la pestaña para verlas
    if (!periods.length) { appendActions(); bodyEl.appendChild(tabsNode(loadsCount)); bodyEl.appendChild(el('p', 'home-carga-empty-note', t('main.regCardNone'))); return; }
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
    appendActions();
    bodyEl.appendChild(tabsNode(loadsCount));

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
    if (currentReg() && currentReg().kind === 'tabla') { renderFlexRow(); return; }
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

}

// --- Registros de TABLA LIBRE (Daniel, 2026-11-26): cada carga lleva su propia elección de columnas; la tabla es el Excel en su orden y con sus nombres ---------------------------------------------------
// Los datos llegan como columnas + renglones (cada renglón es una lista de celdas); la búsqueda se hace en el servidor (busca en TODOS los renglones, no solo en los que llegaron).
let flexFound = null;   // lo que trajo el servidor para lo que se buscó
let flexRow = null;     // el renglón abierto: { columns, row }
const flexText = (v) => (v === null || v === undefined || v === '' ? '' : String(v));
const flexModeText = (l) => t(l.flexMode === 'roles' ? 'home.flexWithRoles' : 'main.flexRole_asis');
const flexStampText = (l) => [dayText(l.stamp), timeText(l.stamp)].filter(Boolean).join(' · ');
function flexSource() { return search.trim() && flexFound ? flexFound : currentData(); }
// Sin señal solo se puede buscar en los renglones que hay guardados.
function flexLocal(text) {
    const data = currentData();
    const test = window.SearchSyntax ? window.SearchSyntax.compile('contains', text) : (v) => String(v).toLowerCase().includes(text.toLowerCase());
    const rows = (data.rows || []).filter((r) => test(r.map(flexText).join(' ')));
    return { ...data, rows, total: rows.length, truncated: false };
}
async function flexSearch(text, listEl) {
    const q = text.trim();
    if (!q) { flexFound = null; drawFlexRows(listEl); return; }
    if (dataState !== 'online') { flexFound = flexLocal(q); drawFlexRows(listEl); return; }
    try {
        const params = new URLSearchParams({ lang: currentLang(), tz: String(new Date().getTimezoneOffset()), text: q });
        const res = await fetch(apiUrl(`${API}/${encodeURIComponent(regKey)}/data?${params}`), { credentials: 'include' });
        if (!res.ok) throw new Error('search failed');
        const body = await res.json();
        if (search.trim() !== q) return; // llegó una búsqueda más nueva
        flexFound = body;
    } catch { flexFound = flexLocal(q); }
    drawFlexRows(listEl);
}
// El registro: la última carga, las acciones, las pestañas, el buscador y los renglones como tarjetas.
function renderFlexRegistry(reg, data) {
    const loadsCount = loadsByKey[regKey] ? loadsByKey[regKey].loads.length : 0;
    if (!data.lastLoad && !loadsCount) { bodyEl.appendChild(el('p', 'home-carga-empty-note', t('main.regCardNone'))); appendActions(); return; }
    if (tab === 'loads') { renderLoadsTab(); return; }
    const load = data.lastLoad;
    if (load) {
        const hero = el('div', 'pm-app-card rg-app-hero');
        hero.setAttribute('data-help-key', 'appRegHero');
        const heroTop = el('span', 'rg-app-top');
        heroTop.append(el('span', 'rg-app-lbl', t('home.regLastLoad')), el('i', 'rg-app-pill', kindText(reg)));
        hero.appendChild(heroTop);
        hero.appendChild(el('b', 'rg-app-big', dayText(load.createdAt)));
        hero.appendChild(el('span', 'rg-app-sub', [timeText(load.createdAt), load.loadedBy, load.fileName].filter(Boolean).join(' · ')));
        bodyEl.appendChild(hero);
    }
    appendActions();
    bodyEl.appendChild(tabsNode(loadsCount));
    const input = el('input', 'pm-app-input seg-app-search');
    input.type = 'search';
    input.placeholder = t('main.filterRegSearchHint');
    input.setAttribute('aria-label', t('main.aaBuscar'));
    input.setAttribute('data-help-key', 'appRegBuscar');
    input.value = search;
    bodyEl.appendChild(input);
    const listEl = el('div', 'cal-app-list');
    listEl.setAttribute('data-help-key', 'appRegLista');
    bodyEl.appendChild(listEl);
    let timer = 0;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { search = input.value; shown = MAX_ROWS; flexSearch(search, listEl); }, 400); });
    if (search.trim()) flexSearch(search, listEl); else drawFlexRows(listEl);
}
function drawFlexRows(listEl) {
    listEl.innerHTML = '';
    const body = flexSource();
    const rows = body.rows || [];
    if (!rows.length) { listEl.appendChild(el('p', 'home-carga-empty-note', t(search.trim() ? 'home.regNoMatch' : 'main.emptyStateText'))); return; }
    rows.slice(0, shown).forEach((r) => listEl.appendChild(flexCard(body.columns, r)));
    if (rows.length > shown) {
        const more = el('button', 'home-carga-secondary-btn');
        more.type = 'button';
        more.textContent = t('home.regShowMore', { n: rows.length - shown });
        more.addEventListener('click', () => { shown += MAX_ROWS; drawFlexRows(listEl); });
        listEl.appendChild(more);
    }
    if (body.truncated) listEl.appendChild(el('p', 'rg-app-note', t('main.regTruncated', { shown: num(rows.length), total: num(body.total) })));
}
// Un renglón: lo primero que trae (la llave), dos datos más y, a la derecha, su último valor con el nombre de su columna; un toque abre todo lo que trae.
function flexCard(columns, row) {
    const cellIdx = columns.map((c, i) => i).filter((i) => columns[i].group !== 'value' && columns[i].group !== 'load' && flexText(row[i]) !== '');
    // el valor de la derecha: el último de la PRIMERA columna con valor (p. ej. la existencia de la carga más reciente), no el de la última (el importe)
    const firstValue = columns.find((c) => c.group === 'value');
    const family = firstValue ? columns.map((c, i) => i).filter((i) => columns[i].group === 'value' && columns[i].name === firstValue.name && typeof row[i] === 'number') : [];
    const valueIdx = family.length ? family : columns.map((c, i) => i).filter((i) => (columns[i].group === 'value' || columns[i].num) && typeof row[i] === 'number');
    const card = el('button', 'pm-app-card rg-app-row');
    card.type = 'button';
    card.setAttribute('data-help-key', 'appRegRow');
    const main = el('span', 'rg-app-main');
    main.appendChild(el('b', '', cellIdx.length ? flexText(row[cellIdx[0]]) : '—'));
    const rest = cellIdx.slice(1, 3).map((i) => flexText(row[i])).filter(Boolean);
    if (rest.length) main.appendChild(el('span', 'rg-app-sub', rest.join(' · ')));
    const val = el('span', 'rg-app-val');
    const last = valueIdx[valueIdx.length - 1];
    val.append(el('b', '', last === undefined ? '—' : num(row[last])), el('span', '', last === undefined ? '' : columns[last].label));
    card.append(main, val);
    card.addEventListener('click', () => { regScroll = getScroll(); flexRow = { columns, row }; view = 'code'; render(); setScroll(0); });
    return card;
}
// El detalle de un renglón: todas sus columnas, en el orden del Excel.
function renderFlexRow() {
    if (!flexRow) { view = 'registry'; render(); return; }
    const { columns, row } = flexRow;
    const first = columns.findIndex((c, i) => c.group !== 'value' && c.group !== 'load' && flexText(row[i]) !== '');
    titleEl.textContent = first >= 0 ? flexText(row[first]) : regName(currentReg());
    const meta = el('div', 'pm-app-meta rg-app-plist');
    columns.forEach((c, i) => {
        const v = row[i];
        const div = el('div', v === null || v === undefined || v === '' ? 'rg-app-none' : '');
        div.append(el('span', '', c.label), el('b', '', v === null || v === undefined || v === '' ? '—' : (typeof v === 'number' ? String(v) : v)));
        meta.appendChild(div);
    });
    bodyEl.appendChild(meta);
}

// --- Pestañas: Datos | Cargas -----------------------------------------------------------------------------------------------------------------
function tabsNode(loadsCount) {
    const seg = el('div', 'rg-app-seg');
    seg.setAttribute('role', 'tablist');
    seg.setAttribute('data-help-key', 'appRegTabs');
    [['data', 'main.regTabData', 0], ['loads', 'main.regTabLoads', loadsCount]].forEach(([key, labelKey, count]) => {
        const btn = el('button', `rg-app-seg-btn${tab === key ? ' rg-app-seg-on' : ''}`);
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', tab === key ? 'true' : 'false');
        btn.append(t(labelKey));
        if (count) btn.appendChild(el('em', '', String(count)));
        btn.addEventListener('click', () => { if (tab === key) return; tab = key; render(); setScroll(0); });
        seg.appendChild(btn);
    });
    return seg;
}

// --- Las cargas de un registro: lo más reciente arriba ----------------------------------------------------------------------------------------------
const newRowsText = (n) => t(n === 1 ? 'home.regNewRowOne' : 'home.regNewRowMany', { n: num(n) });
const errorsText = (n) => t(n === 1 ? 'home.regErrOne' : 'home.regErrMany', { n: num(n) });
function newPeriodsText(reg, l) {
    const n = (l.newPeriods || []).length;
    if (!n) return t('home.regNoNewPeriods');
    const day = !!reg && reg.kind === 'day';
    if (n === 1) return t(day ? 'home.regNewDayOne' : 'home.regNewMonthOne', { list: periodLabel(l.newPeriods[0]) });
    return t(day ? 'home.regNewDayMany' : 'home.regNewMonthMany', { n });
}
const whenText = (l) => [dayText(l.createdAt), timeText(l.createdAt), l.loadedBy].filter(Boolean).join(' · ');
const statusPill = (l) => el('i', `rg-app-pill ${l.status === 'vigente' ? 'rg-app-pill-ok' : 'rg-app-pill-off'}`, t(l.status === 'vigente' ? 'main.regStatus_vigente' : 'main.regStatus_anulada'));
function renderLoadsTab() {
    const info = loadsByKey[regKey] || { loads: [] };
    bodyEl.appendChild(tabsNode(info.loads.length));
    const input = el('input', 'pm-app-input seg-app-search');
    input.type = 'search';
    input.placeholder = t('home.regLoadsSearch');
    input.setAttribute('aria-label', t('main.aaBuscar'));
    input.setAttribute('data-help-key', 'appRegBuscarCargas');
    input.value = loadSearch;
    bodyEl.appendChild(input);
    const listEl = el('div', 'cal-app-list');
    listEl.setAttribute('data-help-key', 'appRegCargas');
    bodyEl.appendChild(listEl);
    let timer = 0;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { loadSearch = input.value; drawLoads(listEl); }, 150); });
    drawLoads(listEl);
}
function loadHaystack(l) {
    return [l.fileName, l.loadedBy, t(`main.regSource_${l.source}`), t(l.status === 'vigente' ? 'main.regStatus_vigente' : 'main.regStatus_anulada'), l.annulNote, ...(l.newPeriods || []).map(periodLabel)].join(' ');
}
function drawLoads(listEl) {
    listEl.innerHTML = '';
    const info = loadsByKey[regKey] || { loads: [] };
    const text = loadSearch.trim();
    const test = window.SearchSyntax ? window.SearchSyntax.compile('contains', text) : (v) => String(v).toLowerCase().includes(text.toLowerCase());
    const items = info.loads.filter((l) => !text || test(loadHaystack(l)));
    if (!items.length) { listEl.appendChild(el('p', 'home-carga-empty-note', t(text ? 'home.regNoMatchLoads' : 'home.regLoadsNone'))); return; }
    items.forEach((l) => listEl.appendChild(loadCard(l)));
}
// Una carga: el archivo y su estado, cuándo y quién la hizo, cómo se cargó y lo que trajo; un toque abre su detalle.
function loadCard(l) {
    const reg = currentReg();
    const off = l.status !== 'vigente';
    const card = el('button', `pm-app-card rg-app-load${off ? ' rg-app-off' : ''}`);
    card.type = 'button';
    card.setAttribute('data-help-key', 'appRegCarga');
    const top = el('span', 'rg-app-top');
    const name = el('span', 'rg-app-fname');
    name.innerHTML = '<i class="bx bx-file" aria-hidden="true"></i>';
    name.appendChild(el('b', '', l.fileName || '—'));
    top.append(name, statusPill(l));
    card.appendChild(top);
    card.appendChild(el('span', 'rg-app-sub', whenText(l)));
    card.appendChild(el('span', 'rg-app-sub', t(`main.regSource_${l.source}`)));
    if (reg && reg.kind === 'tabla' && l.stamp) card.appendChild(el('span', 'rg-app-sub', t('home.flexLoadOf', { when: flexStampText(l) })));
    const chips = el('span', 'rg-app-chips');
    chips.append(el('i', 'rg-app-chip', reg && reg.kind === 'tabla' ? flexModeText(l) : newPeriodsText(reg, l)), el('i', 'rg-app-chip', newRowsText(l.newRows || 0)), el('i', `rg-app-chip ${l.errors ? 'rg-app-chip-bad' : 'rg-app-chip-ok'}`, errorsText(l.errors || 0)));
    card.appendChild(chips);
    if (off && l.annulNote) card.appendChild(el('span', 'rg-app-note', l.annulNote));
    card.addEventListener('click', () => openLoad(l.id));
    return card;
}
function openLoad(id) {
    loadsScroll = getScroll();
    loadId = id;
    view = 'load';
    render();
    setScroll(0);
}

// --- El detalle de una carga y «Anular esta carga» ---------------------------------------------------------------------------------------------------
function renderLoad() {
    const reg = currentReg();
    const info = loadsByKey[regKey];
    const l = info && info.loads.find((x) => x.id === loadId);
    if (!reg || !l) { view = 'registry'; tab = 'loads'; render(); return; }
    titleEl.textContent = l.fileName || regName(reg);
    if (dataState === 'cached' || info.state === 'cached') bodyEl.appendChild(el('p', 'pm-app-note', t('home.regCached')));
    const off = l.status !== 'vigente';
    const head = el('div', 'rg-app-top');
    head.append(el('span', 'rg-app-sub', whenText(l)), statusPill(l));
    bodyEl.appendChild(head);
    const grid = el('div', 'rg-app-grid2');
    grid.setAttribute('data-help-key', 'appRegCargaCifras');
    const cnt = (value, labelKey, cls) => { const box = el('div', `rg-app-cnt${cls ? ` rg-app-cnt-${cls}` : ''}`); box.append(el('b', '', num(value)), el('span', '', t(labelKey))); return box; };
    grid.append(
        reg.kind === 'tabla' ? cnt(l.rowsInFile, 'main.colRegCargaRenglones') : cnt((l.newPeriods || []).length, 'main.colRegCargaPeriodos'), cnt(l.newRows, 'main.colRegCargaNuevos'), cnt(l.valuesAdded, 'main.colRegCargaAgregados'),
        cnt(l.untouched, 'main.colRegCargaYaEstaba'), cnt(l.different, 'main.colRegCargaDistintos'), cnt(l.errors, 'main.colRegCargaErrores', l.errors ? 'bad' : 'ok'),
    );
    bodyEl.appendChild(grid);
    const meta = el('div', 'pm-app-meta');
    const metaRow = (label, value) => { const div = el('div'); div.append(el('span', '', label), el('b', '', value || '—')); meta.appendChild(div); };
    if (reg.kind === 'tabla') { metaRow(t('main.flexWhen'), flexStampText(l)); metaRow(t('main.flexModeLabel'), flexModeText(l)); } else metaRow(t('main.colRegCargaPeriodos'), (l.newPeriods || []).map(periodLabel).join(', '));
    metaRow(t('main.colRegCargaOrigen'), t(`main.regSource_${l.source}`));
    metaRow(t('main.colRegCargaRenglones'), num(l.rowsInFile));
    if (off) {
        metaRow(t('home.regAnnulledOn'), [dayText(l.annulledAt), timeText(l.annulledAt)].filter(Boolean).join(' · '));
        metaRow(t('home.regAnnulledBy'), l.annulledBy);
        if (l.annulNote) metaRow(t('home.regReason'), l.annulNote);
    }
    bodyEl.appendChild(meta);
    // anular: solo una carga vigente, con el botón del árbol y con señal (la decide el servidor, que también lo revisa)
    if (!off && info.canAnnul && info.state === 'online') {
        const btn = el('button', 'home-carga-secondary-btn rg-app-danger');
        btn.type = 'button';
        btn.setAttribute('data-help-key', 'appRegAnular');
        btn.innerHTML = `<i class="bx bx-block" aria-hidden="true"></i> <span>${esc(t('home.regAnnulThis'))}</span>`;
        btn.addEventListener('click', () => openAnnulSheet(l));
        bodyEl.appendChild(btn);
    }
}
// La hoja de confirmación: el motivo (opcional) y dos botones. Anular no borra nada: la carga deja de contar y queda en el historial.
function openAnnulSheet(l) {
    const backdrop = el('div', 'rg-app-sheet');
    const panel = el('div', 'rg-app-sheet-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('data-help-key', 'appRegAnular');
    panel.append(el('h3', '', t('main.regAnnulTitle', { file: l.fileName || '' })), el('p', 'pm-app-note', t('main.regAnnulHint')));
    const label = el('label', 'aa-app-field');
    const note = el('textarea', 'pm-app-input seg-app-note-area');
    note.maxLength = 300;
    label.append(el('span', '', t('main.regAnnulNote')), note);
    panel.appendChild(label);
    const ok = el('button', 'home-carga-new-btn rg-app-danger-fill');
    ok.type = 'button';
    ok.innerHTML = `<i class="bx bx-block" aria-hidden="true"></i><span>${esc(t('main.regAnnul'))}</span>`;
    const cancel = el('button', 'home-carga-secondary-btn', t('main.regCancel'));
    cancel.type = 'button';
    panel.append(ok, cancel);
    backdrop.appendChild(panel);
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
    cancel.addEventListener('click', close);
    ok.addEventListener('click', () => submitAnnul(l, note.value, ok, close));
    document.body.appendChild(backdrop);
    note.focus();
}
async function refreshAfterAnnul() {
    await Promise.all([loadRegistries(), loadRegistryData(regKey), loadRegistryLoads(regKey)]);
    render();
}
async function submitAnnul(l, noteText, okBtn, close) {
    okBtn.disabled = true;
    let res;
    try {
        res = await fetch(apiUrl(`${API}/${encodeURIComponent(regKey)}/loads/${l.id}/annul`), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: noteText }) });
    } catch {
        showToast(t('home.regNeedSignal'));
        okBtn.disabled = false;
        return;
    }
    if (res.status === 401) { window.location.replace('Login.html'); return; }
    if (res.ok) { close(); await refreshAfterAnnul(); showToast(t('main.regAnnulled')); return; }
    okBtn.disabled = false;
    if (res.status === 409) { close(); await refreshAfterAnnul(); showToast(t('home.regLoadNotActive')); return; }
    showToast(t(res.status === 403 ? 'main.regErr_REG_FORBIDDEN' : 'admin.saveError'));
}

// --- Cargar registro: tres pasos (cuatro con «Con mi Excel») -----------------------------------------------------------------------------------------
// start (cómo: plantilla o mi Excel; y el día si el registro es diario) → file (elegir el archivo) → map (solo «Con mi Excel»: emparejar sus columnas) → review (la revisión, sin guardar nada) → done.
// Mismas rutas y mismas reglas de la Web (inspect, import en modo preview y commit): el servidor decide. Todo esto necesita señal.
const MAX_FILE_BYTES = 60 * 1024 * 1024;       // el servidor acepta hasta 60 MB
const ISSUES_SHOWN = 200;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_ACCEPT = `.xlsx,${XLSX_MIME}`;
const DIM_KEYS = ['unidad', 'unidadNombre', 'codigo', 'descripcion', 'categoria', 'udm'];
let wiz = null;
let siteBlocked = false;
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const abilities = () => { const d = currentData() || {}; const reg = currentReg(); return { template: !!d.canTemplate, excel: !!d.canExcel, active: !!reg && reg.status === 'active' && !reg.obsolete }; };
const progTrack = document.getElementById('carga-progress-track');
const progFill = document.getElementById('carga-progress-fill');
const progLabel = document.getElementById('carga-progress-label');
function setProgress(pct, label) {
    const on = pct !== null;
    progTrack.hidden = !on;
    progLabel.hidden = !on;
    if (on) { progFill.style.width = `${pct}%`; progLabel.textContent = label; }
}
const wizSteps = () => (currentReg() && currentReg().kind === 'tabla' ? ['file', 'map', 'review'] : wiz.source === 'excel' ? ['start', 'file', 'map', 'review'] : ['start', 'file', 'review']);

// Un archivo se comparte con la hoja del teléfono (WhatsApp, correo, Drive…); si el sistema no puede compartir archivos se intenta bajar directo.
async function shareFile(file) {
    try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: file.name }); return; }
    } catch (err) {
        if (err && err.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(t('home.tplappDownloadHint'));
}
async function shareTemplate(btn) {
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(apiUrl(`${API}/${encodeURIComponent(regKey)}/template?lang=${currentLang()}`), { credentials: 'include' });
        if (!res.ok) throw new Error('template failed');
        const blob = await res.blob();
        await shareFile(new File([blob], `${currentLang() === 'en' ? 'Template' : 'Plantilla'}-${regKey}.xlsx`, { type: XLSX_MIME }));
    } catch {
        showToast(t('main.regTplError'));
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Los dos botones del registro: «Cargar registro» y «Plantilla» (solo con el botón del árbol, un registro activo y señal).
function appendActions() {
    const reg = currentReg();
    const a = abilities();
    if (!reg || !a.active || dataState === 'cached' || !(a.template || a.excel)) return;
    const row = el('div', 'rg-app-acts');
    const load = el('button', 'rg-app-act rg-app-act-pri');
    load.type = 'button';
    load.setAttribute('data-help-key', 'appRegCargar');
    load.innerHTML = `<i class="bx bx-upload" aria-hidden="true"></i> <span>${esc(t('main.regImport'))}</span>`;
    load.addEventListener('click', startLoad);
    const tpl = el('button', 'rg-app-act');
    tpl.type = 'button';
    tpl.setAttribute('data-help-key', 'appRegPlantilla');
    tpl.innerHTML = `<i class="bx bx-download" aria-hidden="true"></i> <span>${esc(t('home.regTemplateShort'))}</span>`;
    tpl.addEventListener('click', () => shareTemplate(tpl));
    if (reg.kind === 'tabla') row.append(load); else row.append(load, tpl); // un registro libre no tiene plantilla: se carga tu propio Excel
    bodyEl.appendChild(row);
}
async function startLoad() {
    const reg = currentReg();
    const a = abilities();
    if (!reg || !(a.template || a.excel)) return;
    regScroll = getScroll();
    // toda operación va ligada a un centro de costos completo (como en las demás pantallas de la App)
    siteBlocked = await window.AppSiteGate.blocked();
    // una tabla libre se carga siempre con tu Excel: no hay paso de «cómo» y se va directo al archivo
    const flexReg = reg.kind === 'tabla';
    wiz = { step: flexReg ? 'file' : 'start', source: a.template && !flexReg ? 'plantilla' : 'excel', file: null, buffer: null, info: null, sheet: null, include: new Set(), picks: {}, day: todayText(), preview: null, result: null, busy: false, error: '', mode: 'file', pasteText: '', fmode: 'asis', cols: [], time: nowTime() };
    view = 'wizard';
    render();
    setScroll(0);
}
function leaveWizard() {
    wiz = null;
    view = 'registry';
    tab = 'data';
    render();
    setScroll(regScroll);
}
function wizardBack() {
    if (!wiz) { leaveWizard(); return; }
    if (wiz.busy) return;
    if (wiz.step === 'done') { leaveWizard(); return; }
    const order = wizSteps();
    const i = order.indexOf(wiz.step);
    if (i <= 0) { leaveWizard(); return; }
    wiz.step = order[i - 1];
    wiz.error = '';
    wiz.preview = null;
    if (wiz.step === 'file') { wiz.file = null; wiz.buffer = null; wiz.info = null; }
    render();
    setScroll(0);
}

// --- Hablar con el servidor ------------------------------------------------------------------------------------------------------------------------
function errorTextOf(err) {
    const body = (err && err.body) || {};
    if (!err || !err.body) return t('home.regLoadNeedSignal');
    if (body.code === 'IMPORT_HEADERS') return t('main.regErr_IMPORT_HEADERS', { missing: (body.missing || []).map((k) => (k === 'value' ? t('main.regValueColumn') : t(`main.regDim_${k}`))).join(', ') });
    return ['IMPORT_FILE', 'IMPORT_EMPTY', 'IMPORT_TOO_BIG', 'IMPORT_DAY', 'IMPORT_DAY_FUTURE', 'REG_FORBIDDEN', 'REG_BUSY', 'COST_CENTER_REQUIRED', 'IMPORT_ERROR', 'FLEX_CONFIG', 'FLEX_DUP_NAME', 'FLEX_NO_KEY', 'IMPORT_STAMP', 'IMPORT_TOO_MANY_COLUMNS'].includes(body.code) ? t(`main.regErr_${body.code}`) : t('admin.saveError');
}
const problemText = (issue) => t(`main.regProb_${issue.problem}`);
async function post(path, query, body) {
    let res;
    try {
        res = await fetch(apiUrl(`${API}/${encodeURIComponent(regKey)}/${path}?${new URLSearchParams(query).toString()}`), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body });
    } catch {
        throw new Error('network');
    }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
function currentMapping() {
    const reg = currentReg();
    const dims = {};
    Object.entries(wiz.picks).forEach(([col, dim]) => { if (dim && dim !== 'value' && dims[dim] === undefined) dims[dim] = Number(col); });
    const mapping = { dims, valueCols: [], valueCol: null };
    if (reg.kind === 'month') (wiz.info.mapping.valueCols || []).forEach((v) => { if (wiz.include.has(v.col)) mapping.valueCols.push(v); });
    else { const at = Object.entries(wiz.picks).find(([, dim]) => dim === 'value'); if (at) mapping.valueCol = Number(at[0]); }
    return mapping;
}
function importQuery(mode) {
    const reg = currentReg();
    if (reg.kind === 'tabla') return { mode, header: String(wiz.info.headerRow), sheet: wiz.sheet || '', file: wiz.file ? wiz.file.name : '', cfg: JSON.stringify(flexConfig()), stamp: flexStampIso() };
    const q = { mode, source: wiz.source, file: wiz.file ? wiz.file.name : '' };
    if (wiz.sheet) q.sheet = wiz.sheet;
    if (reg.kind === 'day') q.day = wiz.day;
    if (wiz.source === 'excel') { q.mapping = JSON.stringify(currentMapping()); q.header = String(wiz.info.headerRow); }
    return q;
}
async function inspect(sheet) {
    const reg = currentReg();
    const q = {};
    if (sheet) q.sheet = sheet;
    wiz.info = await post('inspect', q, wiz.buffer);
    wiz.sheet = wiz.info.sheet;
    if (reg.kind === 'tabla') { wiz.cols = wiz.info.headers.map((h, k) => ({ i: h.index, text: h.text, name: h.text, example: wiz.info.sample[0] ? wiz.info.sample[0].values[k] : '', role: h.suggest.role, agg: h.suggest.agg, stampName: h.suggest.stampName !== false })); return; }
    wiz.include = new Set((wiz.info.mapping.valueCols || []).map((v) => v.col));
    wiz.picks = {};
    Object.entries(wiz.info.mapping.dims || {}).forEach(([dim, col]) => { wiz.picks[col] = dim; });
    if (reg.kind === 'day' && wiz.info.mapping.valueCol !== null && wiz.info.mapping.valueCol !== undefined) wiz.picks[wiz.info.mapping.valueCol] = 'value';
}
function failFile(text) {
    wiz.error = text;
    wiz.busy = false;
    wiz.step = 'file';
    wiz.file = null; wiz.buffer = null; wiz.info = null;
    render();
}
async function chooseFile(file) {
    if (!file || wiz.busy) return;
    wiz.error = '';
    if (file.size > MAX_FILE_BYTES) { wiz.error = t('main.regErr_IMPORT_TOO_BIG'); render(); return; }
    wiz.file = file;
    wiz.busy = true;
    render();
    try { wiz.buffer = await file.arrayBuffer(); } catch { failFile(t('main.regErr_IMPORT_FILE')); return; }
    try {
        await inspect(null);
        if (wiz.info.missing && wiz.info.missing.length && wiz.source === 'plantilla') { const err = new Error('headers'); err.body = { code: 'IMPORT_HEADERS', missing: wiz.info.missing }; throw err; }
        if (wiz.source === 'excel') { wiz.step = 'map'; wiz.busy = false; render(); setScroll(0); return; }
        await review();
    } catch (err) {
        failFile(errorTextOf(err));
    }
}
// La revisión: lo que haría la carga, sin guardar nada.
async function review() {
    const reg = currentReg();
    if (reg.kind === 'tabla') {
        const bad = flexProblem();
        if (bad) { wiz.error = bad; wiz.busy = false; render(); return; }
    } else if (wiz.source === 'excel') {
        const m = currentMapping();
        const noValue = reg.kind === 'month' ? !m.valueCols.length : m.valueCol === null;
        if (m.dims.unidad === undefined || m.dims.codigo === undefined || noValue) {
            wiz.error = t('main.regErr_IMPORT_HEADERS', { missing: [m.dims.unidad === undefined ? t('main.regDim_unidad') : '', m.dims.codigo === undefined ? t('main.regDim_codigo') : '', noValue ? t('main.regValueColumn') : ''].filter(Boolean).join(', ') });
            wiz.busy = false;
            render();
            return;
        }
    }
    wiz.busy = true;
    wiz.error = '';
    render();
    try {
        wiz.preview = await post('import', importQuery('preview'), wiz.buffer);
        wiz.step = 'review';
        wiz.busy = false;
        render();
        setScroll(0);
    } catch (err) {
        wiz.error = errorTextOf(err);
        wiz.busy = false;
        if (wiz.step === 'file') failFile(wiz.error); else render();
    }
}
async function commitLoad() {
    wiz.busy = true;
    wiz.error = '';
    render();
    try {
        wiz.result = await post('import', importQuery('commit'), wiz.buffer);
        await Promise.all([loadRegistries(), loadRegistryData(regKey), loadRegistryLoads(regKey)]);
        wiz.step = 'done';
        wiz.busy = false;
        render();
        setScroll(0);
    } catch (err) {
        wiz.error = errorTextOf(err);
        wiz.busy = false;
        render();
    }
}
async function downloadIssues() {
    const L = currentLang();
    const heads = L === 'en' ? ['Row', 'Unit', 'Code', 'Period', 'In the file', 'Saved', 'What happens'] : ['Fila', 'Unidad', 'Código', 'Periodo', 'En el archivo', 'Guardado', 'Qué pasa'];
    const rows = wiz.preview.issues.map((i) => [i.line, i.unidad, i.codigo, i.period ? periodLabel(i.period) : '', i.file === undefined ? '' : i.file, i.saved === undefined ? '' : i.saved, problemText(i)]);
    try {
        const filename = `${t('main.regIssuesFile')}_${todayText()}`;
        const res = await fetch(apiUrl('/api/business/export/xlsx'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t('main.regIssuesFile'), filename, columns: heads.map((label) => ({ label })), rows }) });
        if (!res.ok) throw new Error('export failed');
        await shareFile(new File([await res.blob()], `${filename}.xlsx`, { type: XLSX_MIME }));
    } catch {
        showToast(t('main.regTplError'));
    }
}

// --- Los pasos ---------------------------------------------------------------------------------------------------------------------------------
const wizBtn = (cls, text, onClick, disabled, iconClass) => {
    const btn = el('button', `rg-app-btn ${cls}`);
    btn.type = 'button';
    if (iconClass) btn.innerHTML = `<i class="bx ${iconClass}" aria-hidden="true"></i> <span>${esc(text)}</span>`; else btn.textContent = text;
    btn.disabled = !!disabled;
    btn.addEventListener('click', onClick);
    return btn;
};
function renderWizard() {
    titleEl.textContent = t('main.regImport');
    const steps = wizSteps();
    const idx = Math.max(0, steps.indexOf(wiz.step));
    const done = wiz.step === 'done';
    setProgress(done ? 100 : Math.round(((idx + 1) / steps.length) * 100), done ? t('home.regReady') : t('home.regStep', { n: idx + 1, total: steps.length }));
    const body = el('div', 'rg-app-wiz');
    const bar = el('div', 'rg-app-bar');
    ({ start: stepStart, file: stepFile, map: stepMap, review: stepReview, done: stepDone })[wiz.step](body, bar);
    if (wiz.error) { const err = el('p', 'rg-app-error', wiz.error); err.setAttribute('role', 'alert'); body.appendChild(err); }
    bodyEl.append(body, bar);
}
// Paso 1: cómo (con la plantilla o con mi Excel) y, si el registro es diario, de qué día son las existencias.
function stepStart(body, bar) {
    const reg = currentReg();
    const a = abilities();
    body.appendChild(el('h3', '', t('home.regWizHow')));
    const opt = (id, labelKey, enabled) => {
        const btn = el('button', `rg-app-opt${wiz.source === id ? ' rg-app-opt-on' : ''}${enabled ? '' : ' rg-app-opt-off'}`);
        btn.type = 'button';
        btn.disabled = !enabled;
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', wiz.source === id ? 'true' : 'false');
        btn.innerHTML = '<span class="rg-app-optic"><i class="bx bxs-file" aria-hidden="true"></i></span>';
        btn.appendChild(el('b', '', t(labelKey)));
        btn.appendChild(el('span', `rg-app-rad${wiz.source === id ? ' rg-app-rad-on' : ''}`)).innerHTML = wiz.source === id ? '<i class="bx bx-check" aria-hidden="true"></i>' : '';
        btn.addEventListener('click', () => { wiz.source = id; wiz.error = ''; render(); });
        return btn;
    };
    const ways = el('div', 'rg-app-ways');
    ways.setAttribute('role', 'radiogroup');
    ways.setAttribute('data-help-key', 'appRegWizComo');
    ways.append(opt('plantilla', 'main.regWayTemplate', a.template), opt('excel', 'main.regWayExcel', a.excel));
    body.appendChild(ways);
    if (wiz.source === 'plantilla') {
        const link = el('button', 'rg-app-link');
        link.type = 'button';
        link.innerHTML = `<i class="bx bx-download" aria-hidden="true"></i> <span>${esc(t('main.regTemplate'))}</span>`;
        link.addEventListener('click', () => shareTemplate(link));
        body.appendChild(link);
    }
    if (reg.kind === 'day') {
        const field = el('label', 'aa-app-field');
        field.setAttribute('data-help-key', 'appRegWizDia');
        const input = el('input', 'pm-app-input');
        input.type = 'date';
        input.value = wiz.day;
        input.max = todayText();
        input.addEventListener('input', () => { wiz.day = input.value; });
        input.addEventListener('change', () => { wiz.day = input.value; });
        field.append(el('span', '', t('main.regDayLabel')), input);
        body.appendChild(field);
    }
    bar.appendChild(wizBtn('rg-app-btn-pri', t('home.regContinue'), () => {
        if (reg.kind === 'day' && !wiz.day) { wiz.error = t('main.regErr_IMPORT_DAY'); render(); return; }
        wiz.error = '';
        wiz.step = 'file';
        render();
        setScroll(0);
    }, !wiz.source || (wiz.source === 'plantilla' ? !a.template : !a.excel)));
}
// Lo pegado de Excel (celdas separadas por tabulador) se vuelve un .xlsx de una hoja y sigue el mismo camino que un archivo elegido (Daniel, 2026-11-25: «como cargábamos la plantilla que la podíamos pegar»).
function pastedFile(text) {
    const T = window.SkuTemplate;
    const X = window.SimpleXlsx;
    if (!T || !X) return null;
    const rows = T.parseDelimited(text);
    if (!rows.length) return null;
    return new File([X.writeXlsx([{ name: t('main.regPastedName'), rows }])], `${t('main.regPastedName')}.xlsx`, { type: XLSX_MIME });
}
function pasteGo() {
    const file = pastedFile(wiz.pasteText);
    if (!file) { wiz.error = t('main.tplNoRows'); render(); return; }
    chooseFile(file);
}
// Paso 2: el archivo. Se elige del teléfono o se pegan las celdas copiadas de Excel; al elegirlo se revisa solo (con la plantilla se pasa directo a la revisión).
function stepFile(body, bar) {
    body.appendChild(el('h3', '', t('home.regWizFile')));
    const seg = el('div', 'tplapp-seg');
    seg.setAttribute('role', 'group');
    [['file', 'main.tplModeFile', 'tplUpload'], ['paste', 'main.tplModePaste', 'tplPaste']].forEach(([mode, labelKey, help]) => {
        const btn = el('button', '', t(labelKey));
        btn.type = 'button';
        btn.setAttribute('aria-pressed', wiz.mode === mode ? 'true' : 'false');
        btn.setAttribute('data-help-key', help);
        btn.disabled = wiz.busy;
        btn.addEventListener('click', () => { wiz.mode = mode; wiz.error = ''; render(); });
        seg.appendChild(btn);
    });
    body.appendChild(seg);
    if (wiz.mode === 'paste') {
        const box = el('textarea', 'relapp-input tplapp-paste');
        box.spellcheck = false;
        box.placeholder = t('main.tplPastePlaceholder');
        box.value = wiz.pasteText;
        box.disabled = wiz.busy;
        box.setAttribute('data-help-key', 'tplPaste');
        box.addEventListener('input', () => { wiz.pasteText = box.value; });
        box.addEventListener('paste', () => setTimeout(() => { wiz.pasteText = box.value; if (wiz.pasteText.trim() && !wiz.busy) pasteGo(); }, 50));
        body.appendChild(box);
        bar.appendChild(wizBtn('rg-app-btn-pri', t(wiz.busy ? 'main.regReading' : 'main.tplPasteGo'), pasteGo, wiz.busy));
    } else {
        const pick = el('label', `rg-app-pick${wiz.busy ? ' rg-app-pick-busy' : ''}`);
        pick.setAttribute('for', 'rg-app-file');
        pick.setAttribute('data-help-key', 'appRegWizArchivo');
        pick.innerHTML = `<i class="bx ${wiz.busy ? 'bx-loader-alt bx-spin' : 'bx-upload'}" aria-hidden="true"></i>`;
        pick.appendChild(el('b', '', t(wiz.busy ? 'main.regReading' : 'home.regTapToPick')));
        const input = el('input');
        input.type = 'file';
        input.id = 'rg-app-file';
        input.accept = XLSX_ACCEPT;
        input.disabled = wiz.busy;
        input.addEventListener('change', () => { const file = (input.files || [])[0]; input.value = ''; chooseFile(file); });
        pick.appendChild(input);
        body.appendChild(pick);
    }
    if (wiz.file) {
        const card = el('div', 'pm-app-card rg-app-filecard');
        card.innerHTML = '<span class="rg-app-optic"><i class="bx bxs-file" aria-hidden="true"></i></span>';
        const text = el('span', 'rg-app-main');
        text.append(el('b', '', wiz.file.name), el('span', 'rg-app-sub', `${Math.max(1, Math.round(wiz.file.size / 1024))} KB`));
        card.appendChild(text);
        body.appendChild(card);
    }
    bar.appendChild(wizBtn('rg-app-btn-tx', t('home.regBack'), wizardBack, wiz.busy));
}
// Paso 3 de «Con mi Excel»: cada columna del archivo y cómo se carga (la unidad, el código y el valor son obligatorios).
function stepMap(body, bar) {
    const reg = currentReg();
    if (reg.kind === 'tabla') { stepMapFlex(body, bar); return; }
    const info = wiz.info;
    body.appendChild(el('h3', '', t('main.regMapTitle')));
    const monthCols = new Map((info.mapping.valueCols || []).map((v) => [v.col, v.period]));
    body.appendChild(el('p', 'pm-app-note', t(reg.kind === 'month' ? 'main.regMapRead' : 'main.regMapReadDay', { cols: info.headers.length, months: monthCols.size, rows: num(info.rowsDeclared) })));
    if ((info.sheets || []).length > 1) {
        const field = el('label', 'aa-app-field');
        const select = el('select', 'pm-app-input');
        info.sheets.forEach((sh) => { const o = el('option', '', sh.name); o.value = sh.name; select.appendChild(o); });
        select.value = wiz.sheet;
        select.addEventListener('change', async () => {
            wiz.busy = true; wiz.error = ''; render();
            try { await inspect(select.value); wiz.busy = false; render(); } catch (err) { wiz.error = errorTextOf(err); wiz.busy = false; render(); }
        });
        field.append(el('span', '', t('main.regSheet')), select);
        body.appendChild(field);
    }
    const list = el('div', 'rg-app-maplist');
    list.setAttribute('data-help-key', 'appRegWizMapeo');
    const dimOptions = (selected, includeValue) => {
        const opts = [['', t('main.regNotLoaded')], ...DIM_KEYS.map((d) => [d, t(`main.regDim_${d}`)])];
        if (includeValue) opts.push(['value', t('main.regValueColumn')]);
        return opts.map(([v, label]) => { const o = el('option', '', label); o.value = v; if (selected === v) o.selected = true; return o; });
    };
    info.headers.forEach((h, i) => {
        const row = el('div', 'rg-app-maprow');
        const name = el('span', 'rg-app-mapname');
        const sample = info.sample && info.sample[0] ? info.sample[0].values[i] : '';
        name.append(el('b', '', h.text), el('small', '', sample === undefined || sample === null ? '' : String(sample)));
        row.appendChild(name);
        if (reg.kind === 'month' && monthCols.has(h.index)) {
            const label = el('label', 'rg-app-switch');
            const box = el('input');
            box.type = 'checkbox';
            box.checked = wiz.include.has(h.index);
            box.addEventListener('change', () => { if (box.checked) wiz.include.add(h.index); else wiz.include.delete(h.index); });
            label.append(box, el('span', '', t('main.regAsMonth', { period: periodLabel(monthCols.get(h.index)) })));
            row.appendChild(label);
        } else {
            const select = el('select', 'pm-app-input rg-app-mapsel');
            select.setAttribute('aria-label', h.text);
            dimOptions(wiz.picks[h.index] || '', reg.kind === 'day').forEach((o) => select.appendChild(o));
            select.addEventListener('change', () => { wiz.picks[h.index] = select.value; });
            row.appendChild(select);
        }
        list.appendChild(row);
    });
    body.appendChild(list);
    bar.append(wizBtn('rg-app-btn-pri', t('main.regReview'), review, wiz.busy), wizBtn('rg-app-btn-tx', t('main.regChooseAnother'), () => { wiz.step = 'file'; wiz.file = null; wiz.buffer = null; wiz.info = null; wiz.error = ''; render(); setScroll(0); }, wiz.busy));
}
// --- Cargar a una TABLA LIBRE: «tal cual» o el papel de cada columna (llave, dato, columna nueva que se suma o se toma uno, no se carga); cada columna se puede renombrar; el día y la hora de la carga se eligen aquí ----------
const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
// lo que se puede revisar sin ir al servidor: un día y una hora válidos, una llave al menos y nombres sin repetir
function flexProblem() {
    const stamp = new Date(`${wiz.day}T${wiz.time || '00:00'}`);
    if (!wiz.day || Number.isNaN(stamp.getTime())) return t('main.regErr_IMPORT_STAMP');
    const used = wiz.cols.filter((c) => wiz.fmode === 'asis' || c.role !== 'skip');
    if (wiz.fmode === 'roles' && !used.some((c) => c.role === 'key')) return t('main.regErr_FLEX_NO_KEY');
    const seen = new Set();
    for (const c of used) { const f = String(c.name || '').trim().toLowerCase(); if (seen.has(f)) return t('main.regErr_FLEX_DUP_NAME'); seen.add(f); }
    return '';
}
const flexConfig = () => ({ mode: wiz.fmode, columns: wiz.cols.map((c) => ({ i: c.i, name: c.name, role: wiz.fmode === 'asis' ? 'data' : c.role, agg: c.agg, stampName: c.stampName })) });
const flexStampIso = () => { const d = new Date(`${wiz.day}T${wiz.time || '00:00'}`); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); };
function stepMapFlex(body, bar) {
    const info = wiz.info;
    const roles = wiz.fmode === 'roles';
    body.appendChild(el('h3', '', t('main.regMapTitle')));
    const ways = el('div', 'rg-app-ways');
    ways.setAttribute('role', 'radiogroup');
    ways.setAttribute('data-help-key', 'appRegFlexModo');
    [['asis', 'main.flexModeAsis'], ['roles', 'main.flexModeRoles']].forEach(([id, labelKey]) => {
        const on = wiz.fmode === id;
        const btn = el('button', `rg-app-opt${on ? ' rg-app-opt-on' : ''}`);
        btn.type = 'button';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        btn.innerHTML = '<span class="rg-app-optic"><i class="bx bxs-file" aria-hidden="true"></i></span>';
        btn.appendChild(el('b', '', t(labelKey)));
        btn.appendChild(el('span', `rg-app-rad${on ? ' rg-app-rad-on' : ''}`)).innerHTML = on ? '<i class="bx bx-check" aria-hidden="true"></i>' : '';
        btn.addEventListener('click', () => { wiz.fmode = id; wiz.error = ''; const y = getScroll(); render(); setScroll(y); });
        ways.appendChild(btn);
    });
    body.appendChild(ways);
    body.appendChild(el('p', 'pm-app-note', t('main.flexRead', { cols: info.headers.length, rows: num(info.rowsDeclared) })));
    if ((info.sheets || []).length > 1) {
        const field = el('label', 'aa-app-field');
        const select = el('select', 'pm-app-input');
        info.sheets.forEach((sh) => { const o = el('option', '', sh.name); o.value = sh.name; select.appendChild(o); });
        select.value = wiz.sheet;
        select.addEventListener('change', async () => {
            wiz.busy = true; wiz.error = ''; render();
            try { await inspect(select.value); wiz.busy = false; render(); } catch (err) { wiz.error = errorTextOf(err); wiz.busy = false; render(); }
        });
        field.append(el('span', '', t('main.regSheet')), select);
        body.appendChild(field);
    }
    const list = el('div', 'rg-app-maplist');
    list.setAttribute('data-help-key', 'appRegFlexMapeo');
    wiz.cols.forEach((c) => {
        const off = roles && c.role === 'skip';
        const row = el('div', `rg-app-maprow${off ? ' rg-app-fxoff' : ''}`);
        const name = el('span', 'rg-app-mapname');
        name.append(el('b', '', c.text), el('small', '', c.example === undefined || c.example === null ? '' : String(c.example)));
        row.appendChild(name);
        if (roles) {
            const select = el('select', 'pm-app-input rg-app-mapsel');
            select.setAttribute('aria-label', c.text);
            ['key', 'data', 'value', 'skip'].forEach((r) => { const o = el('option', '', t(`main.flexRole_${r}`)); o.value = r; if (c.role === r) o.selected = true; select.appendChild(o); });
            select.addEventListener('change', () => { c.role = select.value; const y = getScroll(); render(); setScroll(y); });
            row.appendChild(select);
        } else {
            row.appendChild(el('small', 'rg-app-fxasis', t('main.flexRole_asis')));
        }
        const sub = el('div', 'rg-app-fxsub');
        if (roles && c.role === 'value') {
            const agg = el('select', 'pm-app-input');
            agg.setAttribute('aria-label', t('main.flexColJoin'));
            [['sum', 'main.flexAgg_sum'], ['one', 'main.flexAgg_one']].forEach(([v, k]) => { const o = el('option', '', t(k)); o.value = v; if (c.agg === v) o.selected = true; agg.appendChild(o); });
            agg.addEventListener('change', () => { c.agg = agg.value; });
            sub.appendChild(agg);
        }
        if (!off) {
            const input = el('input', 'pm-app-input');
            input.type = 'text';
            input.maxLength = 60;
            input.value = c.name;
            input.setAttribute('aria-label', t('main.flexColName'));
            input.addEventListener('input', () => { c.name = input.value; });
            sub.appendChild(input);
        }
        if (roles && c.role === 'value') {
            const label = el('label', 'rg-app-switch');
            const box = el('input');
            box.type = 'checkbox';
            box.checked = !!c.stampName;
            box.addEventListener('change', () => { c.stampName = box.checked; });
            label.append(box, el('span', '', t('main.flexStampName')));
            sub.appendChild(label);
        }
        if (sub.childNodes.length) row.appendChild(sub);
        list.appendChild(row);
    });
    body.appendChild(list);
    const when = el('div', 'aa-app-field rg-app-fxwhen');
    when.setAttribute('data-help-key', 'appRegFlexCuando');
    when.appendChild(el('span', '', t('main.flexWhen')));
    const dayInput = el('input', 'pm-app-input');
    dayInput.type = 'date'; dayInput.value = wiz.day; dayInput.max = todayText();
    dayInput.addEventListener('input', () => { wiz.day = dayInput.value; });
    dayInput.addEventListener('change', () => { wiz.day = dayInput.value; });
    const timeInput = el('input', 'pm-app-input');
    timeInput.type = 'time'; timeInput.value = wiz.time;
    timeInput.setAttribute('aria-label', t('main.flexWhenTime'));
    timeInput.addEventListener('input', () => { wiz.time = timeInput.value; });
    timeInput.addEventListener('change', () => { wiz.time = timeInput.value; });
    when.append(dayInput, timeInput);
    body.appendChild(when);
    bar.append(wizBtn('rg-app-btn-pri', t('main.regReview'), review, wiz.busy), wizBtn('rg-app-btn-tx', t('main.regChooseAnother'), () => { wiz.step = 'file'; wiz.file = null; wiz.buffer = null; wiz.info = null; wiz.error = ''; render(); setScroll(0); }, wiz.busy));
}
function stepReviewFlex(body, bar) {
    const sum = wiz.preview.summary;
    const issues = wiz.preview.issues || [];
    const roles = sum.mode === 'roles';
    body.appendChild(el('h3', '', wiz.file ? wiz.file.name : t('main.regImport')));
    body.appendChild(el('p', 'rg-app-sub', t('main.regRowsRead', { rows: num(sum.rowsInFile), sheet: sum.sheet || '' })));
    const grid = el('div', 'rg-app-grid2');
    grid.setAttribute('data-help-key', 'appRegWizRevision');
    const cnt = (value, label, cls) => { const box = el('div', `rg-app-cnt${cls ? ` rg-app-cnt-${cls}` : ''}`); box.append(el('b', '', num(value)), el('span', '', label)); return box; };
    grid.append(cnt(sum.newRows, t('main.colRegCargaNuevos'), sum.newRows ? 'ok' : ''));
    if (roles) grid.append(cnt(sum.valuesAdded, t('home.regToAdd'), sum.valuesAdded ? 'ok' : ''), cnt(sum.merged, t('home.flexMerged')), cnt(sum.untouched, t('main.colRegCargaYaEstaba')), cnt(sum.different, t('main.colRegCargaDistintos'), sum.different ? 'warn' : ''));
    grid.append(cnt(sum.errors, t('main.colRegCargaErrores'), sum.errors ? 'bad' : 'ok'));
    body.appendChild(grid);
    if (sum.blank) body.appendChild(el('p', 'rg-app-sub', t('main.flexSumBlank', { n: num(sum.blank) })));
    if (!sum.added) body.appendChild(el('p', 'rg-app-note', t('main.regSumNothing')));
    if (issues.length) {
        const det = el('details', 'aa-app-control');
        det.setAttribute('open', '');
        det.appendChild(el('summary', '', t('home.regIssuesTitle', { n: num(sum.issuesTotal || issues.length) })));
        issues.slice(0, ISSUES_SHOWN).forEach((i) => {
            const card = el('div', `rg-app-issue rg-app-issue-${i.kind === 'error' ? 'error' : 'warn'}`);
            card.appendChild(el('b', '', [`${t('main.regIssueRow')} ${i.line}`, i.column].filter(Boolean).join(' · ')));
            card.appendChild(el('span', '', t(`main.flexProb_${i.problem}`)));
            if (i.file !== undefined || i.saved !== undefined) card.appendChild(el('small', '', [i.file === undefined ? '' : `${t('main.regIssueFile')}: ${i.file}`, i.saved === undefined ? '' : `${t('main.regIssueSaved')}: ${i.saved}`].filter(Boolean).join(' · ')));
            det.appendChild(card);
        });
        if ((sum.issuesTotal || 0) > ISSUES_SHOWN) det.appendChild(el('p', 'rg-app-sub', t('main.regIssuesMore', { shown: ISSUES_SHOWN, total: num(sum.issuesTotal) })));
        body.appendChild(det);
    }
    bar.appendChild(wizBtn('rg-app-btn-ok', !sum.added ? t('main.regLoadNothing') : t('main.regLoadGo'), commitLoad, !sum.added || wiz.busy, 'bx-upload'));
    bar.appendChild(wizBtn('rg-app-btn-out', t('main.flexBack'), () => { wiz.step = 'map'; wiz.preview = null; wiz.error = ''; render(); setScroll(0); }, wiz.busy));
    bar.appendChild(wizBtn('rg-app-btn-tx', t('main.regChooseAnother'), () => { wiz.step = 'file'; wiz.file = null; wiz.buffer = null; wiz.info = null; wiz.preview = null; wiz.error = ''; render(); setScroll(0); }, wiz.busy));
}

// Último paso: la revisión (no se ha guardado nada) y «Confirmar carga».
function stepReview(body, bar) {
    if (currentReg().kind === 'tabla') { stepReviewFlex(body, bar); return; }
    const sum = wiz.preview.summary;
    const issues = wiz.preview.issues || [];
    body.appendChild(el('h3', '', wiz.file ? wiz.file.name : t('main.regImport')));
    body.appendChild(el('p', 'rg-app-sub', t('main.regRowsRead', { rows: num(sum.rowsInFile), sheet: sum.sheet })));
    const grid = el('div', 'rg-app-grid2');
    grid.setAttribute('data-help-key', 'appRegWizRevision');
    const cnt = (value, label, cls) => { const box = el('div', `rg-app-cnt${cls ? ` rg-app-cnt-${cls}` : ''}`); box.append(el('b', '', num(value)), el('span', '', label)); return box; };
    grid.append(
        cnt((sum.newPeriods || []).length, t('main.colRegCargaPeriodos')), cnt(sum.newRows, t('main.colRegCargaNuevos')), cnt(sum.valuesAdded, t('home.regToAdd'), sum.valuesAdded ? 'ok' : ''),
        cnt(sum.untouched, t('main.colRegCargaYaEstaba')), cnt(sum.different, t('main.colRegCargaDistintos'), sum.different ? 'warn' : ''), cnt(sum.errors, t('main.colRegCargaErrores'), sum.errors ? 'bad' : 'ok'),
    );
    body.appendChild(grid);
    if ((sum.newPeriods || []).length) body.appendChild(el('p', 'rg-app-sub', t('main.regSumNewPeriods', { periods: sum.newPeriods.map(periodLabel).join(', ') })));
    if (sum.skippedFuture && sum.skippedFuture.length) body.appendChild(el('p', 'rg-app-note', t('main.regSumFuture', { periods: sum.skippedFuture.map(periodLabel).join(', ') })));
    if (!sum.valuesAdded) body.appendChild(el('p', 'rg-app-note', t('main.regSumNothing')));
    if ((sum.periods || []).length) {
        const det = el('details', 'aa-app-control');
        det.appendChild(el('summary', '', t('home.regByPeriod')));
        const list = el('div', 'pm-app-meta');
        list.innerHTML = sum.periods.map((p) => `<div><span>${esc(periodLabel(p.period))} · ${esc(t(p.status === 'new' ? 'main.regPeriodNew' : 'main.regPeriodExisting'))}</span><b>+${esc(num(p.added))}${p.untouched ? ` · ${esc(num(p.untouched))} =` : ''}${p.different ? ` · ${esc(num(p.different))} ≠` : ''}</b></div>`).join('');
        det.appendChild(list);
        body.appendChild(det);
    }
    if (issues.length) {
        const det = el('details', 'aa-app-control');
        det.setAttribute('open', '');
        det.appendChild(el('summary', '', t('home.regIssuesTitle', { n: num(sum.issuesTotal || issues.length) })));
        issues.slice(0, ISSUES_SHOWN).forEach((i) => {
            const card = el('div', `rg-app-issue rg-app-issue-${i.kind === 'error' ? 'error' : 'warn'}`);
            card.appendChild(el('b', '', [`${t('main.regIssueRow')} ${i.line}`, i.unidad, i.codigo, i.period ? periodLabel(i.period) : ''].filter(Boolean).join(' · ')));
            card.appendChild(el('span', '', problemText(i)));
            if (i.file !== undefined || i.saved !== undefined) card.appendChild(el('small', '', [i.file === undefined ? '' : `${t('main.regIssueFile')}: ${typeof i.file === 'number' ? num(i.file) : i.file}`, i.saved === undefined ? '' : `${t('main.regIssueSaved')}: ${num(i.saved)}`].filter(Boolean).join(' · ')));
            det.appendChild(card);
        });
        if ((sum.issuesTotal || 0) > ISSUES_SHOWN) det.appendChild(el('p', 'rg-app-sub', t('main.regIssuesMore', { shown: ISSUES_SHOWN, total: num(sum.issuesTotal) })));
        body.appendChild(det);
    }
    body.appendChild(el('p', 'rg-app-sub', t('main.regOnlyAdds')));
    const nothing = !sum.valuesAdded;
    bar.appendChild(wizBtn('rg-app-btn-ok', nothing ? t('main.regLoadNothing') : t('main.regLoadGo'), commitLoad, nothing || wiz.busy, 'bx-upload'));
    if (issues.length) bar.appendChild(wizBtn('rg-app-btn-out', t('main.regIssuesDownload'), downloadIssues, wiz.busy, 'bx-download'));
    bar.appendChild(wizBtn('rg-app-btn-tx', t('main.regChooseAnother'), () => { wiz.step = 'file'; wiz.file = null; wiz.buffer = null; wiz.info = null; wiz.preview = null; wiz.error = ''; render(); setScroll(0); }, wiz.busy));
}
function stepDone(body, bar) {
    const sum = wiz.result.summary;
    const big = el('div', 'rg-app-okbig');
    big.innerHTML = '<i class="bx bx-check" aria-hidden="true"></i>';
    body.append(big, el('h3', 'rg-app-center', t('main.regDoneTitle')), el('p', 'rg-app-sub rg-app-center', (currentReg().kind === 'tabla' ? t('main.flexDoneText', { rows: num(sum.newRows), values: num(sum.mode === 'roles' ? sum.valuesAdded : 0) }) : t('main.regDoneText', { n: num(sum.valuesAdded), rows: num(sum.newRows) }))));
    if (sum.newPeriods && sum.newPeriods.length) body.appendChild(el('p', 'rg-app-sub rg-app-center', t('main.regDoneNewPeriods', { periods: sum.newPeriods.map(periodLabel).join(', ') })));
    if (sum.different || sum.errors) body.appendChild(el('p', 'rg-app-sub rg-app-center', t('main.regDoneKept', { n: num(sum.different + sum.errors) })));
    const loadId = wiz.result.loadId;
    if (loadId) bar.appendChild(wizBtn('rg-app-btn-pri', t('home.regSeeLoad'), () => { wiz = null; tab = 'loads'; openLoad(loadId); }));
    bar.appendChild(wizBtn('rg-app-btn-tx', t('home.regBackToRegistry'), leaveWizard));
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'wizard') { wizardBack(); return; }
    if (view === 'load') { view = 'registry'; tab = 'loads'; render(); setScroll(loadsScroll); return; }
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
