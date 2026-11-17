// ---------------------------------------------------------------------------
// Actividades Activos (App) — la misma pantalla de la Web (Gestión > C. Distribución > Actividades Activos) hecha para el celular: lo que se registró de cada activo (por lo mientras, los llenados de los QR de sensores y de
// refrigeradores, también las lecturas que se tomaron desde la App). Solo lectura: lo que se corrige se corrige donde se registró (el QR u Operaciones > Temperaturas).
//   · «Ver como»: «Lista de activos» (cada activo es una tarjeta con sus días en una tira que se desliza; la clasificación agrupa) y «Lista de fechas» (las fechas hacia abajo y, en cada una, los activos con lo que registraron).
//     Cada marca es una actividad: la hora y un color (verde dentro de su rango, rojo fuera, gris sin límite); varias en el mismo día se apilan (3 y «+N más»). Si el activo tiene Horario de lectura, cada día lleva su contador «3 de 3».
//   · Se abre con los últimos 7 días y se piden 7 más con el botón (o con el filtro de fechas). Las fechas sin actividad se ocultan (una franja que se vuelve a mostrar al tocarla).
//   · Filtros iguales a los de la Web: búsqueda ($ antes, @ después, la coma separa), Clasificación, Tipo de activo, Quién registró, Resultado, Fechas, Tiempo que demoró y Evidencias.
//   · Tocar una marca abre su detalle (quién, resultado, medidas con su rango, fecha y hora, cuánto tardó, origen, activo, la foto a pantalla completa y el Control Interno). Las fechas se ven en tu hora (se guardan en UTC).
// Lo último que se bajó se guarda en el celular, así que sin señal se ve lo que ya se había abierto. El servidor es el mismo de la Web (GET /api/business/asset-activities y /:id); no hay nada que guardar, por eso no usa la cola sin señal.
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
const API = '/api/business/asset-activities';
const PHOTO_API = '/api/business/temperatures';
const PAGE_DAYS = 7;                          // los días que se piden de una vez (los últimos 7 al abrir y 7 más cada vez que se pide)
const MAX_STACK = 3;                          // marcas que se apilan en una casilla antes del «+N más»
const MAX_CARDS = 60;                         // los activos que se dibujan a la vez en «Lista de activos»: el buscador y los filtros traen el resto
const VIEWS = ['assets', 'dates'];
const SYSTEM_KEYS = ['colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos', 'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto', 'colSysAnio', 'colSysSemana', 'colSysHora'];
let currentUser = null;
let isClientAdmin = false;
let effectiveGrants = [];
let costCenters = [];
let items = new Map();        // id -> actividad
let assets = new Map();       // id -> activo
let loadedFromDay = '';       // el día más viejo ya cargado (AAAA-MM-DD, en tu hora)
let hasOlder = false;
let loading = false;
let truncated = false;
let dataState = 'loading';    // 'loading' | 'online' | 'cached' | 'none'
const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ } },
};
let view = VIEWS.includes(store.get('aa_app_view')) ? store.get('aa_app_view') : 'assets';
let screen = 'list';          // 'list' | 'day' | 'detail'
let dayCtx = null;            // { assetId, day } de la lista de un día
let openId = null;            // la actividad abierta
let leaveTo = 'list';         // a dónde regresa el detalle
let listScroll = 0;
let filtersOpen = false;
const filters = { text: '', cls: '', type: '', who: '', result: 'all', from: '', to: '', time: 'any', evid: 'any', hideEmpty: true };
const revealed = new Set();   // fechas vacías que se volvieron a mostrar
const details = new Map();    // id -> detalle que mandó el servidor (con su Control Interno)

function isUnrestrictedClientAdmin() { return isClientAdmin && effectiveGrants.length === 0; }
function hasCostCenterPermission(ccId) {
    if (isUnrestrictedClientAdmin()) return true;
    return effectiveGrants.some((g) => g.sectionId === 'main' && g.itemId === 'cc-list' && g.submenuId === `cc-${ccId}`);
}
function selectedCostCenterIds() {
    try {
        const parsed = JSON.parse(localStorage.getItem('costCenterSelection') || 'null');
        if (Array.isArray(parsed)) return new Set(parsed.map(Number));
    } catch { /* se toma como "todos" */ }
    return null;
}
// Un activo se ve si su centro de costos se puede usar y está marcado en la App.
function centerAllowed(ccId) {
    if (!ccId) return true;
    if (!hasCostCenterPermission(ccId)) return false;
    const sel = selectedCostCenterIds();
    return !sel || sel.has(Number(ccId));
}

// --- Fechas en tu hora (se guardan en UTC) ----------------------------------------------------------------------------------------------
const localeOf = () => (currentLang() === 'es' ? 'es-MX' : 'en-US');
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
const resultText = (r) => t(r === 'out' ? 'main.aaResultadoFuera' : (r === 'ok' ? 'main.aaResultadoDentro' : 'main.aaResultadoSin'));
const numText = (n) => Number(n).toLocaleString(localeOf(), { maximumFractionDigits: 2 });
function limitText(l) {
    if (!l) return '';
    const hasMin = l.min !== null && l.min !== undefined;
    const hasMax = l.max !== null && l.max !== undefined;
    if (hasMin && hasMax) return t('main.aaLimRango', { min: numText(l.min), max: numText(l.max) });
    if (hasMax) return t('main.aaLimMax', { max: numText(l.max) });
    if (hasMin) return t('main.aaLimMin', { min: numText(l.min) });
    return '';
}
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };

// --- Carga: lo último que se bajó se guarda en el celular para verlo también sin señal ---------------------------------------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-aa-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function cacheSave() {
    try {
        const db = await cacheDb();
        const value = { clientId: currentUser ? (currentUser.clientId ?? null) : null, items: [...items.values()], assets: [...assets.values()], loadedFromDay, hasOlder, truncated, at: Date.now() };
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
async function loadCostCenters() {
    try {
        const res = await fetch(apiUrl('/api/business/cost-centers'), { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        costCenters = (body.costCenters || []).filter((cc) => hasCostCenterPermission(cc.id));
    } catch {
        costCenters = [];
    }
}
async function fetchRange(fromDay, untilDay) {
    const url = `${API}?since=${encodeURIComponent(startOfDay(fromDay).toISOString())}&until=${encodeURIComponent(startOfDay(untilDay).toISOString())}`;
    const res = await fetch(apiUrl(url), { credentials: 'include' });
    if (!res.ok) throw new Error('load failed');
    const body = await res.json();
    (body.items || []).forEach((it) => items.set(it.id, it));
    (body.assets || []).forEach((a) => assets.set(a.id, a));
    truncated = truncated || !!body.truncated;
    return body;
}
async function loadInitial() {
    dataState = 'loading';
    const clientId = currentUser ? (currentUser.clientId ?? null) : null;
    try {
        loadedFromDay = addDays(todayKey(), -(PAGE_DAYS - 1));
        const body = await fetchRange(loadedFromDay, addDays(todayKey(), 1));
        hasOlder = !!body.hasOlder;
        dataState = 'online';
        cacheSave();
        return;
    } catch { /* sin señal: se usa lo guardado */ }
    items = new Map();
    assets = new Map();
    try {
        const saved = await cacheRead();
        // lo guardado solo sirve si es de la misma empresa (otra cuenta en el mismo celular no ve actividades ajenas)
        if (saved && (saved.clientId ?? null) === clientId) {
            (saved.items || []).forEach((it) => items.set(it.id, it));
            (saved.assets || []).forEach((a) => assets.set(a.id, a));
            loadedFromDay = saved.loadedFromDay || loadedFromDay;
            hasOlder = !!saved.hasOlder;
            truncated = !!saved.truncated;
            dataState = 'cached';
            return;
        }
    } catch { /* sin datos guardados */ }
    dataState = 'none';
}
// Carga hacia atrás hasta cubrir el día pedido (o 7 días más cuando no se pide un día).
async function loadOlder(untilDay) {
    if (loading || !hasOlder || dataState !== 'online') return;
    loading = true;
    setMoreBusy(true);
    try {
        const target = untilDay && untilDay < loadedFromDay ? untilDay : addDays(loadedFromDay, -PAGE_DAYS);
        while (target < loadedFromDay && hasOlder) {
            const chunkFrom = target < addDays(loadedFromDay, -120) ? addDays(loadedFromDay, -120) : target;
            const body = await fetchRange(chunkFrom, loadedFromDay);
            loadedFromDay = chunkFrom;
            hasOlder = !!body.hasOlder;
        }
        cacheSave();
        syncOptions();
        drawContent();
    } catch (err) {
        console.error('Actividades Activos (App): no se pudieron cargar más días', err);
        showToast(t('admin.loadError'));
    } finally {
        loading = false;
        setMoreBusy(false);
    }
}

// --- Fotos: se piden con la sesión y se muestran como imagen local (en la App instalada la dirección del servidor es de otro origen); se entregan como data: porque la política de seguridad del servidor no deja cargar blob: -----------------------
const photoCache = new Map();
const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
async function photoUrl(id, thumb) {
    const url = `${PHOTO_API}/${id}/photo${thumb ? '?thumb=1' : ''}`;
    if (photoCache.has(url)) return photoCache.get(url);
    const res = await fetch(apiUrl(url), { credentials: 'include' });
    if (!res.ok) throw new Error('photo');
    const dataUrl = await blobToDataUrl(await res.blob());
    if (thumb) photoCache.set(url, dataUrl);
    return dataUrl;
}
function fillImage(img, id, thumb) {
    photoUrl(id, thumb).then((src) => { img.src = src; }).catch(() => { img.alt = '—'; });
}
function openViewer(it, asset) {
    const scrim = document.createElement('div');
    scrim.className = 'inc-app-viewer';
    const title = [asset && asset.code, it.temperature !== null && it.temperature !== undefined ? `${numText(it.temperature)} °C` : '', it.humidity !== null && it.humidity !== undefined ? `${numText(it.humidity)} %` : ''].filter(Boolean).join(' · ');
    scrim.innerHTML = `<div class="inc-app-viewer-bar"><span>${esc(title)}</span><button type="button" id="aa-app-vclose" aria-label="${esc(t('main.incFotoCerrar'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>
        <div class="inc-app-viewer-stage"><img id="aa-app-vimg" alt=""></div>`;
    document.body.appendChild(scrim);
    scrim.querySelector('#aa-app-vclose').addEventListener('click', () => scrim.remove());
    fillImage(scrim.querySelector('#aa-app-vimg'), it.id, false);
}

// --- Lo que se ve ------------------------------------------------------------------------------------------------------------------------
const itemFiltersActive = () => !!(filters.text.trim() || filters.who || filters.result !== 'all' || filters.time !== 'any' || filters.evid !== 'any');
const activeFilterCount = () => [filters.cls, filters.type, filters.who, filters.result !== 'all', filters.from, filters.to, filters.time !== 'any', filters.evid !== 'any', !filters.hideEmpty].filter(Boolean).length;
function timeMatches(seconds) {
    if (filters.time === 'any') return true;
    if (filters.time === 'none') return seconds === null || seconds === undefined;
    if (seconds === null || seconds === undefined) return false;
    if (filters.time === 'lt1') return seconds < 60;
    if (filters.time === '1to5') return seconds >= 60 && seconds <= 300;
    return seconds > 300;
}
function compute() {
    const matchText = filters.text.trim() && window.SearchSyntax ? window.SearchSyntax.compile('contains', filters.text) : null;
    const assetList = [...assets.values()].filter((a) => {
        if (!centerAllowed(a.costCenterId)) return false;
        if (filters.cls && (a.className || '') !== filters.cls) return false;
        if (filters.type && (a.typeName || '') !== filters.type) return false;
        return true;
    }).sort((a, z) => (a.className || '').localeCompare(z.className || '', localeOf()) || a.code.localeCompare(z.code, localeOf(), { numeric: true }));
    const assetById = new Map(assetList.map((a) => [a.id, a]));
    const start = filters.from || loadedFromDay;
    const today = todayKey();
    const end = filters.to && filters.to < today ? filters.to : today;
    const days = [];
    for (let d = start; d <= end && days.length < 800; d = addDays(d, 1)) days.push(d);
    const inRange = new Set(days);
    const cell = new Map();   // `${assetId}|${day}` -> actividades de la más vieja a la más nueva
    const counts = new Map(); // `${assetId}|${day}` -> cuántas hay ese día, sin los filtros de actividad: el contador «3 de 3» del horario cuenta todo lo registrado
    let count = 0;
    items.forEach((it) => {
        const asset = assetById.get(it.assetId);
        if (!asset) return;
        const day = dayOfIso(it.at);
        if (!inRange.has(day)) return;
        counts.set(`${it.assetId}|${day}`, (counts.get(`${it.assetId}|${day}`) || 0) + 1);
        if (filters.who && (it.person || '') !== filters.who) return;
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
    return { assets: shownAssets, days: dayInfo, cell, count, counts };
}
// El contador del horario de lectura del activo («3 de 3»): en los días que le toca y que ya empezaron; verde si se cumplió, ámbar si faltó (hoy todavía puede llegar).
function counterNode(asset, day, model) {
    const rule = asset.readSchedule;
    if (!rule || !window.AssetSchedule || day > todayKey()) return null;
    const [y, m, d] = day.split('-').map(Number);
    const need = window.AssetSchedule.expectedCount(rule);
    if (!need || !window.AssetSchedule.appliesOn(rule, y, m, d)) return null;
    const got = model.counts.get(`${asset.id}|${day}`) || 0;
    const node = el('small', `aa-app-count aa-app-count-${got >= need ? 'done' : (day === todayKey() ? 'open' : 'short')}`, t('main.aaCuenta', { k: got, n: need }));
    node.title = t('main.aaCuentaTip', { horario: window.AssetSchedule.format(rule) });
    return node;
}
function markButton(it, asset) {
    const b = el('button', `aa-app-m aa-app-m-${it.result}`, timeText(it.at));
    b.type = 'button';
    b.setAttribute('aria-label', [asset.code, resultText(it.result), whenText(it.at)].join(' · '));
    b.addEventListener('click', () => openDetail(it.id, 'list'));
    return b;
}
function cellContent(list, asset, day, model) {
    const box = el('div', 'aa-app-cell');
    list.slice(0, list.length > MAX_STACK ? MAX_STACK : list.length).forEach((it) => box.appendChild(markButton(it, asset)));
    if (list.length > MAX_STACK) {
        const more = el('button', 'aa-app-m aa-app-m-more', t('main.aaMasN', { n: list.length - MAX_STACK }));
        more.type = 'button';
        more.addEventListener('click', () => openDay(asset.id, day));
        box.appendChild(more);
    }
    const counter = counterNode(asset, day, model);
    if (counter) box.appendChild(counter);
    return box;
}
const assetSub = (a) => [a.typeName, a.name && a.name !== a.typeName ? a.name : '', a.costCenterName].filter(Boolean).join(' · ');
const groupsOf = (list) => {
    const groups = [];
    list.forEach((a) => { const name = a.className || ''; const last = groups[groups.length - 1]; if (last && last.name === name) last.list.push(a); else groups.push({ name, list: [a] }); });
    return groups;
};

// «Lista de activos»: cada activo es una tarjeta con sus días en una tira que se desliza hacia los lados (lo más nuevo, a la derecha).
function drawAssets(model) {
    const strips = [];
    let drawn = 0;
    groupsOf(model.assets).forEach((g) => {
        if (drawn >= MAX_CARDS) return;
        const head = el('div', 'aa-app-group');
        head.appendChild(el('span', '', g.name || t('main.aaSinClasificacion')));
        head.appendChild(el('small', '', t(g.list.length === 1 ? 'main.aaUnActivo' : 'main.aaNActivos', { n: g.list.length })));
        contentHost.appendChild(head);
        g.list.forEach((a) => {
            if (drawn >= MAX_CARDS) return;
            drawn += 1;
            const card = el('div', 'pm-app-card aa-app-card');
            const top = el('div', 'aa-app-card-head');
            top.appendChild(el('b', '', a.code));
            top.appendChild(el('small', '', assetSub(a)));
            card.appendChild(top);
            const strip = el('div', 'aa-app-strip');
            let run = [];
            const flush = () => {
                if (!run.length) return;
                const keys = run.map((d) => d.key);
                const gap = el('button', 'aa-app-gap', '···');
                gap.type = 'button';
                gap.title = t('home.aaAppGap', { n: keys.length });
                gap.setAttribute('aria-label', t('home.aaAppGap', { n: keys.length }));
                gap.addEventListener('click', () => { keys.forEach((k) => revealed.add(k)); drawContent(); });
                strip.appendChild(gap);
                run = [];
            };
            model.days.forEach((d) => {
                if (d.hidden) { run.push(d); return; }
                flush();
                const col = el('div', `aa-app-day${d.today ? ' aa-app-today' : ''}`);
                col.appendChild(el('small', 'aa-app-dayh', d.today ? t('main.aaHoy') : dayShort(d.key)));
                col.appendChild(cellContent(model.cell.get(`${a.id}|${d.key}`) || [], a, d.key, model));
                strip.appendChild(col);
            });
            flush();
            card.appendChild(strip);
            strips.push(strip);
            contentHost.appendChild(card);
        });
    });
    if (model.assets.length > drawn) contentHost.appendChild(el('p', 'pm-app-note', t('home.aaAppShowing', { n: drawn, total: model.assets.length })));
    strips.forEach((s) => { s.scrollLeft = s.scrollWidth; });
}
// «Lista de fechas»: las fechas hacia abajo (la más nueva primero) y, en cada una, los activos con lo que registraron.
function drawDates(model) {
    model.days.slice().reverse().forEach((d) => {
        if (d.hidden) {
            const b = el('button', 'aa-app-gap-row', t('main.aaSinActividadDiaOculta', { date: dayShort(d.key) }));
            b.type = 'button';
            b.title = t('main.aaMostrarFecha');
            b.addEventListener('click', () => { revealed.add(d.key); drawContent(); });
            contentHost.appendChild(b);
            return;
        }
        const card = el('div', `pm-app-card aa-app-daycard${d.today ? ' aa-app-today' : ''}`);
        const head = el('div', 'aa-app-card-head');
        head.appendChild(el('b', '', dayText(d.key)));
        if (d.today) head.appendChild(el('small', '', t('main.aaHoy')));
        card.appendChild(head);
        let rows = 0;
        groupsOf(model.assets).forEach((g) => {
            g.list.forEach((a) => {
                const list = model.cell.get(`${a.id}|${d.key}`) || [];
                const counter = counterNode(a, d.key, model);
                if (!list.length && !counter) return;
                rows += 1;
                const row = el('div', 'aa-app-row');
                const label = el('div', 'aa-app-row-label');
                label.appendChild(el('b', '', a.code));
                label.appendChild(el('small', '', [g.name || t('main.aaSinClasificacion'), a.typeName].filter(Boolean).join(' · ')));
                row.appendChild(label);
                const cellNode = cellContent(list, a, d.key, model);
                cellNode.className = 'aa-app-marks';
                row.appendChild(cellNode);
                card.appendChild(row);
            });
        });
        if (!rows) card.appendChild(el('p', 'pm-app-note', t('home.aaAppNoActivity')));
        contentHost.appendChild(card);
    });
}

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;
let contentHost = null;
let summaryEl = null;
let moreBtn = null;
const selects = {};

function render() {
    bodyEl.innerHTML = '';
    contentHost = null;
    if (screen === 'detail') renderDetail();
    else if (screen === 'day') renderDay();
    else renderList();
}
function setMoreBusy(busy) { if (moreBtn) { moreBtn.disabled = busy; moreBtn.textContent = busy ? t('main.aaCargando') : t('main.aaCargarMas', { n: PAGE_DAYS }); } }
function fieldWrap(labelKey, helpKey, control) {
    const wrap = el('label', 'aa-app-field');
    wrap.appendChild(el('span', '', t(labelKey)));
    control.setAttribute('data-help-key', helpKey);
    wrap.appendChild(control);
    return wrap;
}
function makeSelect(labelKey, helpKey, key, options, onChange) {
    const select = el('select', 'pm-app-input');
    options.forEach(([value, label]) => { const o = el('option', '', label); o.value = value; select.appendChild(o); });
    select.value = filters[key];
    select.addEventListener('change', () => { onChange(select.value); });
    selects[key] = select;
    return fieldWrap(labelKey, helpKey, select);
}
function dateInput(labelKey, key) {
    const input = el('input', 'pm-app-input');
    input.type = 'date';
    input.max = todayKey();
    input.value = filters[key];
    input.addEventListener('change', async () => {
        filters[key] = input.value;
        if (key === 'from') await ensureFrom(input.value);
        refreshFiltersButton();
        drawContent();
    });
    return fieldWrap(labelKey, 'aaFiltroFechas', input);
}
async function ensureFrom(day) {
    if (!day || day >= loadedFromDay) return;
    await loadOlder(day);
}
// Las opciones de los filtros salen de lo que hay cargado.
function setOptions(key, values, emptyLabel) {
    const select = selects[key];
    if (!select) return;
    const list = [...new Set(values)].sort((a, z) => a.localeCompare(z, localeOf()));
    if (filters[key] && !list.includes(filters[key])) filters[key] = '';
    select.innerHTML = '';
    const all = el('option', '', t('main.cpTodos'));
    all.value = '';
    select.appendChild(all);
    list.forEach((v) => { const o = el('option', '', v || emptyLabel); o.value = v; select.appendChild(o); });
    select.value = filters[key];
}
function syncOptions() {
    const list = [...assets.values()].filter((a) => centerAllowed(a.costCenterId));
    setOptions('cls', list.map((a) => a.className || ''), t('main.aaSinClasificacion'));
    setOptions('type', list.map((a) => a.typeName || ''), '—');
    setOptions('who', [...items.values()].map((i) => i.person || ''), '—');
}
function refreshFiltersButton() {
    const btn = document.getElementById('aa-app-filters-btn');
    if (!btn) return;
    const n = activeFilterCount();
    btn.querySelector('span').textContent = n ? t('home.aaAppFiltersN', { n }) : t('home.aaAppFilters');
}

function renderList() {
    titleEl.textContent = t('menu.catCentroDistActividadesActivos');
    if (dataState === 'cached') bodyEl.appendChild(el('p', 'pm-app-note', t('home.aaAppCached')));
    // Ver como
    const tabs = el('div', 'seg-app-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('data-help-key', 'aaVerComo');
    VIEWS.forEach((v) => {
        const b = el('button', 'seg-app-tab', t(v === 'assets' ? 'main.aaVistaActivos' : 'main.aaVistaFechas'));
        b.type = 'button';
        b.setAttribute('aria-pressed', String(view === v));
        b.addEventListener('click', () => { if (view === v) return; view = v; store.set('aa_app_view', v); tabs.querySelectorAll('.seg-app-tab').forEach((x, i) => x.setAttribute('aria-pressed', String(VIEWS[i] === view))); drawContent(); });
        tabs.appendChild(b);
    });
    bodyEl.appendChild(tabs);
    // buscador (la sintaxis de siempre: $ antes, @ después, la coma separa)
    const search = el('input', 'pm-app-input seg-app-search');
    search.type = 'search';
    search.placeholder = t('main.aaBuscarHint');
    search.setAttribute('aria-label', t('main.aaBuscar'));
    search.setAttribute('data-help-key', 'aaBuscar');
    search.value = filters.text;
    let timer = 0;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { filters.text = search.value; drawContent(); }, 180); });
    bodyEl.appendChild(search);
    // filtros (cerrados al abrir; el botón dice cuántos hay puestos)
    const fbtn = el('button', 'home-carga-secondary-btn aa-app-filters-btn');
    fbtn.type = 'button';
    fbtn.id = 'aa-app-filters-btn';
    fbtn.setAttribute('data-help-key', 'appAaFiltros');
    fbtn.innerHTML = `<i class="bx bx-filter-alt" aria-hidden="true"></i><span></span>`;
    bodyEl.appendChild(fbtn);
    const panel = el('div', 'aa-app-filters');
    panel.hidden = !filtersOpen;
    fbtn.addEventListener('click', () => { filtersOpen = !filtersOpen; panel.hidden = !filtersOpen; });
    const change = (key) => (v) => { filters[key] = v; refreshFiltersButton(); drawContent(); };
    panel.appendChild(makeSelect('main.aaFiltroClasificacion', 'aaFiltroClasificacion', 'cls', [['', t('main.cpTodos')]], change('cls')));
    panel.appendChild(makeSelect('main.aaFiltroTipo', 'aaFiltroTipo', 'type', [['', t('main.cpTodos')]], change('type')));
    panel.appendChild(makeSelect('main.aaFiltroQuien', 'aaFiltroQuien', 'who', [['', t('main.cpTodos')]], change('who')));
    panel.appendChild(makeSelect('main.aaFiltroResultado', 'aaFiltroResultado', 'result', [['all', t('main.cpTodos')], ['ok', t('main.aaResultadoDentro')], ['out', t('main.aaResultadoFuera')], ['none', t('main.aaResultadoSin')]], change('result')));
    const dates = el('div', 'aa-app-dates');
    dates.append(dateInput('main.cpFiltroDesde', 'from'), dateInput('main.cpFiltroHasta', 'to'));
    panel.appendChild(dates);
    panel.appendChild(makeSelect('main.aaFiltroTiempo', 'aaFiltroTiempo', 'time', [['any', t('main.aaCualquiera')], ['lt1', t('main.aaTiempoMenos1')], ['1to5', t('main.aaTiempo1a5')], ['gt5', t('main.aaTiempoMas5')], ['none', t('main.aaTiempoSinDato')]], change('time')));
    panel.appendChild(makeSelect('main.aaFiltroEvidencias', 'aaFiltroEvidencias', 'evid', [['any', t('main.aaConYSin')], ['with', t('main.aaConEvidencia')], ['without', t('main.aaSinEvidencia')]], change('evid')));
    const toggle = el('label', 'aa-app-toggle');
    toggle.setAttribute('data-help-key', 'aaOcultarVacias');
    const check = el('input');
    check.type = 'checkbox';
    check.checked = filters.hideEmpty;
    check.addEventListener('change', () => { filters.hideEmpty = check.checked; revealed.clear(); refreshFiltersButton(); drawContent(); });
    toggle.append(check, el('span', '', t('main.aaOcultarVacias')));
    panel.appendChild(toggle);
    bodyEl.appendChild(panel);
    summaryEl = el('p', 'pm-app-note aa-app-summary');
    bodyEl.appendChild(summaryEl);
    contentHost = el('div', 'aa-app-content');
    contentHost.setAttribute('data-help-key', 'appAaLista');
    bodyEl.appendChild(contentHost);
    moreBtn = el('button', 'home-carga-secondary-btn aa-app-more', t('main.aaCargarMas', { n: PAGE_DAYS }));
    moreBtn.type = 'button';
    moreBtn.hidden = true;
    moreBtn.addEventListener('click', () => loadOlder());
    bodyEl.appendChild(moreBtn);
    syncOptions();
    refreshFiltersButton();
    drawContent();
    if (listScroll) { const y = listScroll; listScroll = 0; requestAnimationFrame(() => { bodyEl.scrollTop = y; }); }
}
function drawContent() {
    if (!contentHost) return;
    contentHost.innerHTML = '';
    if (dataState === 'none') {
        contentHost.appendChild(el('p', 'home-carga-empty-note', t('home.aaAppNoData')));
        summaryEl.textContent = '';
        moreBtn.hidden = true;
        return;
    }
    const model = compute();
    if (!model.assets.length || !model.days.length) contentHost.appendChild(el('p', 'home-carga-empty-note', t(assets.size ? 'main.aaVacioFiltros' : 'main.aaVacio')));
    else if (view === 'assets') drawAssets(model);
    else drawDates(model);
    const hidden = model.days.filter((d) => d.hidden).length;
    summaryEl.textContent = [t(model.count === 1 ? 'main.aaResumen1' : 'main.aaResumenN', { n: model.count }), hidden ? t(hidden === 1 ? 'main.aaOcultaUna' : 'main.aaOcultasN', { n: hidden }) : '', truncated ? t('main.aaCortado') : ''].filter(Boolean).join(' · ');
    moreBtn.hidden = !hasOlder || !!filters.from || dataState !== 'online';
}

// --- Las actividades de un activo en un día (cuando son más de 3) -----------------------------------------------------------------------------
function openDay(assetId, day) {
    listScroll = bodyEl.scrollTop;
    dayCtx = { assetId, day };
    screen = 'day';
    render();
}
function renderDay() {
    const asset = assets.get(dayCtx.assetId) || { code: '' };
    titleEl.textContent = t('main.aaDiaTitulo', { code: asset.code });
    bodyEl.appendChild(el('p', 'pm-app-note', dayText(dayCtx.day)));
    const model = compute();
    const list = (model.cell.get(`${dayCtx.assetId}|${dayCtx.day}`) || []);
    list.forEach((it) => {
        const row = el('button', 'home-carga-active-row');
        row.type = 'button';
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx bx-time-five" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${esc(timeText(it.at))}</p><span>${esc(it.person || '—')}</span></span>
            <span class="inc-app-pills"><span class="aa-app-m aa-app-m-${esc(it.result)}">${esc(resultText(it.result))}</span></span>`;
        row.addEventListener('click', () => openDetail(it.id, 'day'));
        bodyEl.appendChild(row);
    });
}

// --- Detalle de una actividad ---------------------------------------------------------------------------------------------------------------
function openDetail(id, from) {
    if (screen === 'list') listScroll = bodyEl.scrollTop;
    openId = id;
    leaveTo = from;
    screen = 'detail';
    render();
    if (!details.has(id) && navigator.onLine !== false) {
        fetch(apiUrl(`${API}/${id}`), { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('detail'))))
            .then((d) => { details.set(id, d); if (screen === 'detail' && openId === id) render(); })
            .catch(() => { details.set(id, null); if (screen === 'detail' && openId === id) render(); });
    }
}
// Una medida con su juicio y su rango (el detalle del servidor trae los dos).
function measureText(value, unit, status, limit) {
    let text = `${numText(value)} ${unit}`;
    if (status) {
        text += ` · ${t(status === 'ok' ? 'main.aaResultadoDentro' : 'main.aaResultadoFuera')}`;
        const lim = limitText(limit);
        if (lim) text += ` (${lim})`;
    }
    return text;
}
function renderDetail() {
    const it = items.get(openId);
    if (!it) { screen = 'list'; render(); return; }
    const asset = assets.get(it.assetId) || {};
    const d = details.get(openId) || null;
    titleEl.textContent = t('main.aaDetalleTitulo', { code: asset.code || '', name: '' }).trim();
    const originKey = `main.aaOrigen_${it.source}`;
    const rows = [
        [t('main.colAaQuien'), it.person || '—'],
        [t('main.colAaResultado'), resultText(it.result)],
        it.temperature !== null && it.temperature !== undefined ? [t('main.aaDTemperatura'), measureText(it.temperature, '°C', d && d.tempStatus, d && d.tempLimit)] : null,
        it.humidity !== null && it.humidity !== undefined ? [t('main.aaDHumedad'), measureText(it.humidity, '%', d && d.humStatus, d && d.humLimit)] : null,
        [t('main.colAaFecha'), whenText(it.at)],
        [t('main.colAaTiempo'), durationText(it.durationS)],
        [t('main.aaDOrigen'), t(originKey) === originKey ? (it.source || '—') : t(originKey)],
        [t('main.aaDActivo'), [asset.code, asset.typeName, asset.className, asset.costCenterName].filter(Boolean).join(' · ') || '—'],
    ].filter(Boolean);
    const meta = el('div', 'pm-app-meta');
    meta.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    bodyEl.appendChild(meta);
    if (details.has(openId) && details.get(openId) === null) bodyEl.appendChild(el('p', 'pm-app-note', t('home.aaAppDetailOffline')));
    // evidencias: la foto de la lectura
    const ev = el('div', 'pm-app-card');
    ev.appendChild(el('h4', 'pm-app-title', t('main.colAaEvidencias')));
    if (it.hasPhoto) {
        const grid = el('div', 'inc-app-shots');
        const btn = el('button', 'inc-app-shot');
        btn.type = 'button';
        btn.setAttribute('aria-label', t('main.aaFotoLectura'));
        const img = el('img');
        img.alt = '';
        fillImage(img, it.id, true);
        btn.appendChild(img);
        btn.addEventListener('click', () => openViewer(it, asset));
        grid.appendChild(btn);
        ev.appendChild(grid);
    } else ev.appendChild(el('p', 'pm-app-note', t('main.aaSinFoto')));
    bodyEl.appendChild(ev);
    // Control Interno (lo manda el servidor con el detalle)
    if (d) {
        const control = el('details', 'aa-app-control');
        control.appendChild(el('summary', '', t('menu.classControlInterno')));
        const list = el('div', 'pm-app-meta');
        list.innerHTML = SYSTEM_KEYS.map((key) => `<div><span>${esc(t(`main.${key}`))}</span><b>${esc(d[key] === undefined || d[key] === '' ? '—' : String(d[key]))}</b></div>`).join('');
        control.appendChild(list);
        bodyEl.appendChild(control);
    }
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (screen === 'detail') { screen = leaveTo === 'day' ? 'day' : 'list'; render(); return; }
    if (screen === 'day') { screen = 'list'; render(); return; }
    window.location.href = 'AppInicio.html';
});

(async function init() {
    await loadLanguage();
    window.HelpMode?.init(t);
    try {
        const [meRes, businessProfileRes] = await Promise.all([
            fetch(apiUrl('/api/me'), { credentials: 'include' }),
            fetch(apiUrl('/api/me/business-profile'), { credentials: 'include' }),
        ]);
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        isClientAdmin = !!user?.isClientAdmin;
        if (businessProfileRes.ok) {
            const { profile } = await businessProfileRes.json();
            effectiveGrants = profile?.effectiveGrants || [];
        }
        await Promise.all([loadCostCenters(), loadBrandingForTheme()]);
        applyStyle(getStoredStyle());
        await loadInitial();
        render();
    } catch (err) {
        console.error('Actividades Activos (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
