// ---------------------------------------------------------------------------
// Pedido Manual (App) — la misma pantalla de la Web (Operaciones > Pedido Manual) hecha para el celular:
//   · la lista de pedidos (un pedido = varios artículos) con su estatus: Pendiente, Parcial o Surtido;
//   · Nuevo pedido: se busca en el catálogo de artículos (por código, descripción, UdM o categoría, con la misma sintaxis de búsqueda de todo el sistema),
//     se elige la cantidad y se envía. Si la empresa tiene Lugares de Envío, el pedido también pide el «Lugar que solicita» y solo salen los códigos habilitados para ese lugar desde el centro (Relación Código Envío).
//     El catálogo (con los lugares y qué código va a cuál) se guarda en el celular, así que se puede buscar y armar el pedido SIN señal: el pedido queda en la cola
//     de AppOfflineSync.js ("En tu celular") y se envía solo al reconectar con la hora a la que se mandó (el servidor guarda aparte la hora en que lo recibió);
//   · con permiso (Ver y Operar en la columna Estatus del árbol), cada renglón se marca Pendiente / Surtido; sin señal el cambio también queda en la cola.
// El nombre de quien pide sale de la cuenta. Es una parte de lo que hace la pantalla Web: corregir cantidades, eliminar y el QR se siguen haciendo allá.
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
const ORDERS_URL = '/api/business/pedido-manual';
const ORDER_RECORD_PREFIX = 'pedido-manual';
const MAX_RESULTS = 30;
let currentUser = null;
let isClientAdmin = false;
let effectiveGrants = [];
let costCenters = [];
let orders = [];            // pedidos del servidor (ya agrupados, el más nuevo primero)
let queuedOrders = [];      // pedidos que se mandaron sin señal y siguen en la cola de este celular
let canStatus = false;
let catalog = [];           // los artículos que se pueden pedir
let catalogPlaces = [];     // «Lugar que solicita»: los lugares de envío activos [{ id, name }]; vacío = la empresa no usa lugares y el pedido es el de siempre (por centro de costos)
let catalogById = new Map();
let catalogState = 'loading'; // 'loading' | 'online' | 'cached' | 'none'
let view = 'list';          // 'list' | 'order' | 'new' | 'done' (el número de pedido recién enviado)
let openKey = null;         // el pedido abierto: 'o:<orderId>' o 'q:<clientRef>'
let siteBlocked = false;

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
const sync = () => window.SgnOfflineSync;

function formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(currentLang() === 'es' ? 'es-MX' : 'en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
const qtyText = (n) => Number(n).toLocaleString(currentLang() === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 3 });
const itemsText = (n) => (n === 1 ? t('home.pmItem1') : t('home.pmItemsN', { n }));
const userLabel = () => (currentUser && (currentUser.name || currentUser.username)) || '';

// --- Catálogo: se baja al abrir y se guarda en el celular para buscar sin señal --------------------------------------------------------
function catalogDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-pm-catalog', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function catalogSave(value) {
    const db = await catalogDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, 'catalog');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
async function catalogRead() {
    const db = await catalogDb();
    return new Promise((resolve, reject) => {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get('catalog');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}
function setCatalog(items, places) {
    catalog = items;
    catalogPlaces = Array.isArray(places) ? places : [];
    catalogById = new Map(items.map((it) => [it.id, it]));
}
const usesPlaces = () => catalogPlaces.length > 0;
async function loadCatalog() {
    catalogState = 'loading';
    const clientId = currentUser ? (currentUser.clientId ?? null) : null;
    try {
        const res = await fetch(apiUrl(`${ORDERS_URL}/items`), { credentials: 'include' });
        if (res.ok) {
            const body = await res.json();
            setCatalog(body.items || [], body.places || []);
            catalogState = 'online';
            catalogSave({ clientId, items: catalog, places: catalogPlaces, at: body.at }).catch(() => { /* sin almacenamiento: se baja otra vez la próxima */ });
            return;
        }
    } catch { /* sin señal: se usa el catálogo guardado */ }
    try {
        const saved = await catalogRead();
        // el catálogo guardado solo sirve si es de la misma empresa (otra cuenta en el mismo celular no ve artículos ajenos)
        if (saved && Array.isArray(saved.items) && (saved.clientId ?? null) === clientId) { setCatalog(saved.items, saved.places); catalogState = 'cached'; return; }
    } catch { /* sin catálogo guardado */ }
    setCatalog([], []);
    catalogState = 'none';
}

// --- Pedidos ---------------------------------------------------------------------------------------------------------------------------
function groupOrders(lines) {
    const byOrder = new Map();
    lines.forEach((l) => {
        let o = byOrder.get(l.orderId);
        if (!o) {
            o = { key: `o:${l.orderId}`, orderId: l.orderId, folio: l.folio, name: l.name, placeName: l.placeName || '', requestedAt: l.requestedAt, receivedAt: l.receivedAt, cc: l.cc, centroCostos: l.centroCostos, source: l.source, lines: [] };
            byOrder.set(l.orderId, o);
        }
        o.lines.push(l);
    });
    return Array.from(byOrder.values());
}
function orderStatus(o) {
    const supplied = o.lines.filter((l) => l.status === 'supplied').length;
    if (!supplied) return 'pending';
    return supplied === o.lines.length ? 'supplied' : 'mixed';
}
const statusLabel = (s) => (s === 'mixed' ? t('home.pmStatusMixed') : t(`main.pmEstatus_${s}`));
function orderVisible(o) {
    if (o.queued) return true;
    if (!hasCostCenterPermission(o.cc) && o.cc) return false;
    const sel = selectedCostCenterIds();
    return !sel || !o.cc || sel.has(Number(o.cc));
}
async function loadOrders() {
    try {
        const res = await fetch(apiUrl(`${ORDERS_URL}?lite=1`), { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        canStatus = !!body.canStatus;
        orders = groupOrders(body.orders || []);
        await applyQueuedStatuses();
    } catch { /* sin señal: se queda con lo que ya se veía */ }
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

// Lo que se mandó sin señal y sigue en la cola: los pedidos nuevos se ven en la lista como "En tu celular" y los cambios de estatus ya se ven aplicados.
const ORDER_QUEUE_URL = /\/api\/business\/pedido-manual\/orders$/;
const STATUS_QUEUE_URL = /\/api\/business\/pedido-manual\/(\d+)\/status$/;
async function readQueue() {
    try { return await sync().listOfflineQueue(); } catch { return []; }
}
// Vuelve a leer la cola; devuelve cuántas cosas de esta pantalla (pedidos nuevos y cambios de estatus) siguen esperando señal.
let queueMineCount = 0;
async function refreshQueuedOrders() {
    const queue = await readQueue();
    queuedOrders = [];
    queueMineCount = queue.filter((item) => item.method === 'POST' && item.url && (ORDER_QUEUE_URL.test(item.url) || STATUS_QUEUE_URL.test(item.url))).length;
    queue.forEach((item) => {
        if (item.method !== 'POST' || !item.url || !ORDER_QUEUE_URL.test(item.url)) return;
        let body;
        try { body = JSON.parse(item.body || '{}'); } catch { return; }
        const lines = (body.items || []).map((it) => {
            const art = catalogById.get(it.id) || {};
            return { code: art.code || '', description: art.description || `#${it.id}`, uom: art.uom || '', quantity: it.quantity, status: 'pending' };
        });
        const cc = costCenters.find((c) => c.id === body.costCenterId);
        const place = catalogPlaces.find((p) => p.id === body.placeId);
        queuedOrders.push({ key: `q:${body.clientRef || item.id}`, queued: true, folio: '', name: body.requesterName || userLabel(), placeName: place ? place.name : '', requestedAt: body.clientAt || item.queuedAt, cc: body.costCenterId, centroCostos: cc ? cc.name : '', source: 'app', lines });
    });
    queuedOrders.reverse();
}
async function applyQueuedStatuses() {
    const queue = await readQueue();
    queue.forEach((item) => {
        const m = item.method === 'POST' && item.url ? STATUS_QUEUE_URL.exec(item.url) : null;
        if (!m) return;
        let body;
        try { body = JSON.parse(item.body || '{}'); } catch { return; }
        orders.forEach((o) => o.lines.forEach((l) => { if (String(l.id) === m[1] && (body.status === 'pending' || body.status === 'supplied')) l.status = body.status; }));
    });
}
// AppOfflineSync avisa cada 30 s aunque nada haya cambiado: solo se vuelve a dibujar si cambió lo que esta pantalla tenía en la cola, y nunca en "Nuevo pedido" (se perdería lo que se está escribiendo).
document.addEventListener('sgn:offline-queue-changed', async () => {
    const before = queueMineCount;
    await refreshQueuedOrders();
    if (before === queueMineCount) return;
    // al reconectar la cola se vacía: se vuelve a pedir la lista para ver los pedidos ya con su folio
    if (queueMineCount === 0 && navigator.onLine) await loadOrders();
    if (view !== 'new') render();
});
document.addEventListener('sgn:offline-rejected', () => { if (view === 'list') render(); });

function allOrders() { return [...queuedOrders, ...orders].filter(orderVisible); }

// --- Cambiar el estatus de un renglón ---------------------------------------------------------------------------------------------------
async function changeLineStatus(order, line, status) {
    if (line.status === status) return;
    const description = `${t('menu.opCentroDistPedidoManual')} · ${order.folio} · ${line.code}`;
    const before = line.status;
    try {
        const result = await sync().offlineAwareFetch(
            `${ORDERS_URL}/${line.id}/status`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status }) },
            description, `${ORDER_RECORD_PREFIX}:${line.id}`, null, { rejectable: true },
        );
        if (result.queued) {
            line.status = status;
            showToast(t('home.pmStatusSavedOffline'));
        } else if (!result.ok) {
            showToast(result.body.message || t('admin.saveError'));
        } else {
            line.status = status;
            showToast(t('home.pmStatusSaved'));
        }
    } catch {
        line.status = before;
        showToast(t('admin.saveError'));
    }
    render();
}

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    bodyEl.innerHTML = '';
    if (siteBlocked) { window.AppSiteGate.show(bodyEl, t); titleEl.textContent = t('menu.opCentroDistPedidoManual'); return; }
    if (view === 'new') { renderNew(); return; }
    if (view === 'done') { renderDone(); return; }
    if (view === 'order') { renderOrder(); return; }
    renderList();
}

function renderRejectedBanner() {
    const rejected = sync().listRejected();
    if (!rejected.length) return;
    const box = document.createElement('div');
    box.className = 'relapp-rejected';
    box.innerHTML = `<b><i class="bx bx-error-circle" aria-hidden="true"></i> ${esc(t('home.relappRejectedTitle'))}</b>${rejected.map((r) => `<p>${esc(r.description)}${r.message ? ` — ${esc(r.message)}` : ''}</p>`).join('')}<button type="button" class="home-carga-secondary-btn">${esc(t('home.relappRejectedOk'))}</button>`;
    box.querySelector('button').addEventListener('click', () => { sync().clearRejected(); });
    bodyEl.appendChild(box);
}

function renderList() {
    titleEl.textContent = t('menu.opCentroDistPedidoManual');
    renderRejectedBanner();
    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'home-carga-new-btn';
    newBtn.setAttribute('data-help-key', 'mobileNewRecord');
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('home.pmNewButton'))}</span>`;
    newBtn.addEventListener('click', startNewOrder);
    bodyEl.appendChild(newBtn);

    const list = allOrders();
    if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('home.pmListEmpty');
        bodyEl.appendChild(empty);
        return;
    }
    list.forEach((o) => {
        const status = orderStatus(o);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        const label = o.queued ? t('home.pmOnPhone') : o.folio;
        const sub = [itemsText(o.lines.length), o.placeName, o.centroCostos, formatTime(o.requestedAt)].filter(Boolean).join(' · ');
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx ${o.queued ? 'bx-cloud-upload' : 'bx-cart'}" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${esc(label)}${o.name ? ` · ${esc(o.name)}` : ''}</p><span>${esc(sub)}</span></span>
            <span class="pm-app-pill pm-app-pill-${o.queued ? 'queued' : status}">${esc(o.queued ? t('home.pmOnPhone') : statusLabel(status))}</span>`;
        row.addEventListener('click', () => { openKey = o.key; view = 'order'; render(); });
        bodyEl.appendChild(row);
    });
}

function renderOrder() {
    const o = allOrders().find((x) => x.key === openKey);
    if (!o) { view = 'list'; render(); return; }
    titleEl.textContent = o.queued ? t('home.pmOnPhone') : o.folio;
    const meta = document.createElement('div');
    meta.className = 'pm-app-meta';
    const rows = [
        [t('home.pmRequestedBy'), o.name || '—'],
        o.placeName ? [t('main.colPmLugar'), o.placeName] : null,
        [t('home.pmWhen'), formatTime(o.requestedAt)],
        o.receivedAt ? [t('main.pmRecibido'), formatTime(o.receivedAt)] : null,
        [t('main.pmQrCentro'), o.centroCostos || '—'],
        [t('main.colPmOrigen'), o.source === 'qr' ? t('main.pmOrigenQr') : (o.source === 'app' ? t('main.pmOrigenApp') : t('main.pmOrigenUsuario'))],
    ].filter(Boolean);
    meta.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    bodyEl.appendChild(meta);
    o.lines.forEach((l) => {
        const row = document.createElement('div');
        row.className = 'pm-app-line';
        const editable = canStatus && !o.queued;
        row.innerHTML = `<div class="pm-app-line-main"><p>${esc(l.description)}</p><span>${esc([l.code, l.uom].filter(Boolean).join(' · '))}</span></div><b class="pm-app-qty">${esc(qtyText(l.quantity))}</b>`;
        const pill = document.createElement(editable ? 'button' : 'span');
        if (editable) { pill.type = 'button'; pill.setAttribute('data-help-key', 'pmEstatus'); pill.setAttribute('aria-label', t('main.colPmEstatus')); }
        pill.className = `pm-app-pill pm-app-pill-${o.queued ? 'queued' : l.status}${editable ? ' pm-app-pill-btn' : ''}`;
        pill.innerHTML = editable ? `${esc(statusLabel(l.status))} <i class="bx bx-chevron-down" aria-hidden="true"></i>` : esc(o.queued ? t('home.pmOnPhone') : statusLabel(l.status));
        if (editable) {
            pill.addEventListener('click', () => openSheet(t('main.colPmEstatus'), [
                { value: 'pending', label: statusLabel('pending') }, { value: 'supplied', label: statusLabel('supplied') },
            ], l.status, (value) => changeLineStatus(o, l, value)));
        }
        row.appendChild(pill);
        bodyEl.appendChild(row);
    });
}

// --- Hoja de opciones (la misma de las demás pantallas de la App) -------------------------------------------------------------------------
function openSheet(titleText, options, currentValue, onPick) {
    const scrim = document.createElement('div');
    scrim.className = 'home-select-scrim';
    const sheet = document.createElement('div');
    sheet.className = 'home-select-sheet';
    sheet.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-sheet-handle' }));
    sheet.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-sheet-title', textContent: titleText }));
    options.forEach((opt) => {
        const active = opt.value === currentValue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `home-select-option${active ? ' active' : ''}`;
        btn.innerHTML = `<span>${esc(opt.label)}</span>${active ? '<i class="bx bx-check" aria-hidden="true"></i>' : ''}`;
        btn.addEventListener('click', () => { scrim.remove(); onPick(opt.value); });
        sheet.appendChild(btn);
    });
    scrim.addEventListener('click', (event) => { if (event.target === scrim) scrim.remove(); });
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
}

// --- Nuevo pedido ----------------------------------------------------------------------------------------------------------------------
// draft: { costCenterId, cart: Map(id → { item, quantity }), query, mode, fields, requesterName, clientRef }
let draft = null;
const NAME_KEY = 'sgn_pm_name';
const PLACE_KEY = 'sgn_pm_app_place'; // el último «Lugar que solicita» elegido en este celular (si todavía existe en el catálogo)
const FIELD_KEYS = [['code', 'home.pmFCode'], ['description', 'home.pmFDesc'], ['uom', 'home.pmFUom'], ['categories', 'home.pmFCat']];
const SEARCH_MODES = [['startsWith', 'home.pmModeStarts'], ['contains', 'home.pmModeContains'], ['equals', 'home.pmModeEquals']];
const SIGNS = [['$', 'Before'], ['@', 'After'], [',', 'Comma']];
const ICON_SEARCH = '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>';
const ICON_SLIDERS = '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="9.5" cy="17" r="2.2"/>';
function newRef() {
    const bytes = new Uint8Array(12);
    (window.crypto || {}).getRandomValues?.(bytes);
    const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') || Math.random().toString(16).slice(2).padEnd(24, '0');
    return `app-${Date.now().toString(36)}-${rand}`;
}
function startNewOrder() {
    if (!costCenters.length) { showToast(t('home.pmNoCenters')); return; }
    const sel = selectedCostCenterIds();
    let costCenterId = null;
    if (sel && sel.size === 1) { const only = Array.from(sel)[0]; if (costCenters.some((c) => c.id === only)) costCenterId = only; }
    if (costCenterId === null && costCenters.length === 1) costCenterId = costCenters[0].id;
    // «Quién pide» siempre se pide: viene escrito con el último nombre usado (o el de la cuenta) y se puede cambiar
    let name = '';
    try { name = localStorage.getItem(NAME_KEY) || ''; } catch { /* sin almacenamiento */ }
    // el lugar que solicita: el último que se usó en este celular, si todavía está en el catálogo (sin lugares en la empresa no se pide)
    let placeId = null;
    try { const saved = Number(localStorage.getItem(PLACE_KEY)); if (saved && catalogPlaces.some((p) => p.id === saved)) placeId = saved; } catch { /* sin almacenamiento */ }
    draft = { costCenterId, placeId, cart: new Map(), query: '', mode: 'contains', fields: [], requesterName: name || userLabel(), clientRef: newRef() };
    view = 'new';
    render();
}
// Lo escrito se lee con el mismo motor que las tablas y el servidor (SearchSyntax.js): comas = búsquedas independientes, $ = otra palabra ANTES, @ = otra palabra DESPUÉS. Hasta 80 letras y 6 búsquedas.
const searchTerms = (raw) => String(raw == null ? '' : raw).slice(0, 80).split(',').slice(0, 6).join(',');
const searchReady = () => window.SearchSyntax.ready(draft.mode, searchTerms(draft.query));
const signOff = (sign) => (sign === '$' && draft.mode !== 'contains') || (sign === '@' && draft.mode === 'equals');
// los valores de un campo: las categorías se prueban una por una (Igual que compara cada una)
const valuesOf = (item, key) => (key === 'categories' ? String(item.categories || '').split(' · ').filter(Boolean) : [item[key]]);
// Solo se pueden pedir los códigos RELACIONADOS (Relación Código) con el centro de costos del pedido; un catálogo guardado de antes (sin esa lista) se ve completo hasta que se vuelva a bajar con señal.
// Con «Lugar que solicita» (la empresa tiene lugares de envío) son los HABILITADOS para ese lugar desde ese centro (Relación Código Envío): sin centro o sin lugar no hay ninguno.
const relatedTo = (it) => {
    if (usesPlaces()) return draft.costCenterId !== null && draft.placeId !== null && Array.isArray(it.ship) && it.ship.some(([cc, place]) => cc === draft.costCenterId && place === draft.placeId);
    return !Array.isArray(it.centers) || (draft.costCenterId !== null && it.centers.includes(draft.costCenterId));
};
// Lo ya agregado que deja de estar habilitado al cambiar el centro o el lugar se quita del pedido (con aviso).
function pruneCart() {
    const gone = Array.from(draft.cart.values()).filter(({ item }) => !relatedTo(item));
    gone.forEach(({ item }) => draft.cart.delete(item.id));
    if (gone.length) showToast(t(usesPlaces() ? 'home.pmCartPrunedPlace' : 'home.pmCartPruned', { n: gone.length }));
}
// Un error del servidor en el idioma de la App: por su código, o el texto que trae.
const sendErrorText = (body) => (body && body.code === 'PLACE' ? t('home.pmNeedPlace') : (body && body.code === 'RELATED' ? t('home.pmErrRelated') : (body && body.message) || t('home.pmErrSend')));
function searchCatalog() {
    if (!searchReady()) return null;
    const test = window.SearchSyntax.compile(draft.mode, searchTerms(draft.query));
    const keys = draft.fields.length ? draft.fields : FIELD_KEYS.map(([k]) => k);
    const found = [];
    for (const it of catalog) {
        if (!relatedTo(it)) continue;
        if (keys.some((k) => valuesOf(it, k).some((v) => !!v && test(v)))) { found.push(it); if (found.length > MAX_RESULTS) break; }
    }
    return found;
}
// Marca lo que cumple, como en las tablas: la palabra buscada resaltada y las de $ y @ más claro; con Igual que no se marca.
function highlight(text) {
    const str = String(text == null ? '' : text);
    if (!draft.query || draft.mode === 'equals') return esc(str);
    let out = '';
    let at = 0;
    window.SearchSyntax.ranges(draft.mode, searchTerms(draft.query), str).forEach((r) => {
        out += `${esc(str.slice(at, r.start))}<mark${r.role === 'main' ? '' : ' class="aux"'}>${esc(str.slice(r.start, r.end))}</mark>`;
        at = r.end;
    });
    return out + esc(str.slice(at));
}
const fieldsSummary = () => (!draft.fields.length ? t('home.pmAllFields') : (draft.fields.length <= 2 ? draft.fields.map((k) => t(FIELD_KEYS.find(([x]) => x === k)[1])).join(', ') : t('home.pmNSelected', { n: draft.fields.length })));
// Un menú abierto se cierra al tocar fuera de él.
document.addEventListener('click', (event) => {
    document.querySelectorAll('.pm-app-pop:not([hidden])').forEach((pop) => { if (!pop.contains(event.target) && !event.target.closest('[data-pm-popbtn]')) pop.hidden = true; });
});

function renderNew() {
    titleEl.textContent = t('home.pmNewButton');
    // el centro de costos
    const ccRow = document.createElement('button');
    ccRow.type = 'button';
    ccRow.className = 'home-carga-field-row pm-app-cc';
    const ccDraw = () => {
        const cc = costCenters.find((c) => c.id === draft.costCenterId);
        ccRow.innerHTML = `<span class="home-carga-field-icon"><i class="bx bx-buildings" aria-hidden="true"></i></span><span class="home-carga-field-label"><p>${esc(t('home.pmCenter'))}</p><span>${esc(cc ? `${cc.code ? `${cc.code} · ` : ''}${cc.name}` : t('home.pmCenterPick'))}</span></span><i class="bx ${cc ? 'bx-edit' : 'bx-chevron-down'} home-carga-field-trailing"></i>`;
    };
    ccDraw();
    ccRow.addEventListener('click', () => openSheet(t('home.pmCenter'), costCenters.map((c) => ({ value: c.id, label: `${c.code ? `${c.code} · ` : ''}${c.name}` })), draft.costCenterId, (value) => {
        draft.costCenterId = value;
        // lo ya agregado que no está relacionado con el centro nuevo se quita del pedido
        pruneCart();
        ccDraw();
        drawResults();
        draft.redrawCart();
    }));
    const ccWrap = document.createElement('div');
    ccWrap.className = 'home-carga-field';
    ccWrap.appendChild(ccRow);
    bodyEl.appendChild(ccWrap);

    // el lugar que solicita (solo si la empresa tiene lugares de envío): cada lugar tiene sus propios códigos habilitados
    if (usesPlaces()) {
        const placeRow = document.createElement('button');
        placeRow.type = 'button';
        placeRow.className = 'home-carga-field-row pm-app-cc';
        placeRow.setAttribute('data-help-key', 'pmLugar');
        const placeDraw = () => {
            const place = catalogPlaces.find((p) => p.id === draft.placeId);
            placeRow.innerHTML = `<span class="home-carga-field-icon"><i class="bx bx-map-pin" aria-hidden="true"></i></span><span class="home-carga-field-label"><p>${esc(t('home.pmPlace'))} <span class="pm-app-req" aria-hidden="true">*</span></p><span>${esc(place ? place.name : t('home.pmPlacePick'))}</span></span><i class="bx ${place ? 'bx-edit' : 'bx-chevron-down'} home-carga-field-trailing"></i>`;
        };
        placeDraw();
        placeRow.addEventListener('click', () => openSheet(t('home.pmPlace'), catalogPlaces.map((p) => ({ value: p.id, label: p.name })), draft.placeId, (value) => {
            if (value === draft.placeId) return;
            draft.placeId = value;
            try { localStorage.setItem(PLACE_KEY, String(value)); } catch { /* sin almacenamiento */ }
            // cada lugar tiene sus códigos: lo ya agregado que no está habilitado para el lugar nuevo se quita del pedido
            pruneCart();
            placeDraw();
            drawResults();
            draft.redrawCart();
        }));
        const placeWrap = document.createElement('div');
        placeWrap.className = 'home-carga-field';
        placeWrap.appendChild(placeRow);
        bodyEl.appendChild(placeWrap);
    }

    // quién pide (siempre se pide el nombre)
    const whoBox = document.createElement('div');
    whoBox.className = 'pm-app-card';
    whoBox.innerHTML = `<label class="pm-app-qty-label pm-app-who-label" for="pm-app-who">${esc(t('home.pmWho'))} <span class="pm-app-req" aria-hidden="true">*</span></label><input id="pm-app-who" class="pm-app-input" type="text" maxlength="60" autocomplete="name" required placeholder="${esc(t('home.pmWhoPlaceholder'))}" value="${esc(draft.requesterName)}">`;
    bodyEl.appendChild(whoBox);
    const whoInput = whoBox.querySelector('#pm-app-who');
    whoInput.addEventListener('input', () => { draft.requesterName = whoInput.value; });

    // el buscador: el mismo de los demás QR
    const searchBox = document.createElement('div');
    searchBox.className = 'pm-app-card';
    const modePop = SEARCH_MODES.map(([k, key]) => `<button type="button" class="pm-app-opt" role="menuitemradio" data-pm-mode="${k}" aria-pressed="${draft.mode === k}">${esc(t(key))}</button>`).join('');
    const signPop = SIGNS.map(([sg, key]) => `<button type="button" class="pm-app-opt pm-app-sg" role="menuitem" data-pm-sign="${sg}"><b aria-hidden="true">${sg}</b><span>${esc(t(`home.pmSign${key}`))}<small>${esc(t(`home.pmSign${key}Help`))}</small></span></button>`).join('');
    searchBox.innerHTML = `<div class="pm-app-mcur" id="pm-app-mcur">${esc(t(SEARCH_MODES.find(([k]) => k === draft.mode)[1]))}</div>
        <div class="pm-app-srow">
            <button type="button" class="pm-app-fmode" data-pm-popbtn="modepop" aria-haspopup="menu" aria-label="${esc(t('home.pmFilterType'))}" title="${esc(t('home.pmFilterType'))}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON_SLIDERS}</svg></button>
            <button type="button" class="pm-app-fmode pm-app-fsign" data-pm-popbtn="signpop" aria-haspopup="menu" aria-label="${esc(t('home.pmSigns'))}" title="${esc(t('home.pmSigns'))}"><span aria-hidden="true">\$@</span></button>
            <div class="pm-app-sbox"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON_SEARCH}</svg><input type="search" id="pm-app-q" inputmode="search" enterkeyhint="search" maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(t('home.pmSearchPlaceholder'))}" aria-label="${esc(t('home.pmSearchLabel'))}" value="${esc(draft.query)}"><button type="button" class="pm-app-sx" id="pm-app-qclear" aria-label="${esc(t('home.pmSearchClear'))}" title="${esc(t('home.pmSearchClear'))}"${draft.query ? '' : ' hidden'}>×</button></div>
            <div class="pm-app-pop" id="pm-app-modepop" role="menu" aria-label="${esc(t('home.pmFilterType'))}" hidden>${modePop}</div>
            <div class="pm-app-pop pm-app-signpop" id="pm-app-signpop" role="menu" aria-label="${esc(t('home.pmSigns'))}" hidden>${signPop}</div>
        </div>
        <button type="button" class="pm-app-sumrow" id="pm-app-fieldstoggle" aria-expanded="false" aria-controls="pm-app-fields"><span class="pm-app-lbl">${esc(t('home.pmSearchIn'))}</span><b id="pm-app-fields-sum">${esc(fieldsSummary())}</b><i aria-hidden="true"></i></button>
        <div class="pm-app-flist" id="pm-app-fields" role="group" aria-label="${esc(t('home.pmSearchIn'))}" hidden></div>
        <p class="pm-app-note" id="pm-app-note"></p><div id="pm-app-results" class="pm-app-results"></div>`;
    bodyEl.appendChild(searchBox);
    const qInput = searchBox.querySelector('#pm-app-q');
    const qClear = searchBox.querySelector('#pm-app-qclear');
    const note = searchBox.querySelector('#pm-app-note');
    const results = searchBox.querySelector('#pm-app-results');
    const modeEl = searchBox.querySelector('#pm-app-modepop');
    const signEl = searchBox.querySelector('#pm-app-signpop');
    const fieldsEl = searchBox.querySelector('#pm-app-fields');
    const fieldsHtml = () => {
        const opt = (key, label, checked, mixed) => `<label class="pm-app-copt${key === 'all' ? ' pm-app-all' : ''}${mixed ? ' pm-app-mixed' : ''}"><input type="checkbox" data-pm-field="${key}"${checked ? ' checked' : ''}><span class="pm-app-box"></span><span>${esc(label)}</span></label>`;
        return opt('all', t('home.pmAllFields'), !draft.fields.length, !!draft.fields.length) + FIELD_KEYS.map(([k, key]) => opt(k, t(key), draft.fields.includes(k), false)).join('');
    };
    fieldsEl.innerHTML = fieldsHtml();
    const drawResults = () => {
        results.innerHTML = '';
        note.textContent = '';
        if (catalogState === 'loading') { note.textContent = t('home.pmCatalogLoading'); return; }
        if (catalogState === 'none') { note.textContent = t('home.pmCatalogNone'); return; }
        if (catalogState === 'cached') note.textContent = t('home.pmCatalogCached', { n: catalog.length });
        if (usesPlaces()) {
            // con lugares: primero el centro y el lugar; solo salen los códigos habilitados para ese lugar desde ese centro
            if (draft.costCenterId === null) { note.textContent = t('home.pmPickCenterFirst'); return; }
            if (draft.placeId === null) { note.textContent = t('home.pmPickPlaceFirst'); return; }
            if (!catalog.some(relatedTo)) { note.textContent = t('home.pmNoRelatedPlace'); return; }
        } else {
            if (draft.costCenterId === null && catalog.some((it) => Array.isArray(it.centers))) { note.textContent = t('home.pmPickCenterFirst'); return; }
            if (catalog.length && !catalog.some(relatedTo)) { note.textContent = t('home.pmNoRelated'); return; }
        }
        const found = searchCatalog();
        if (found === null) { if (catalogState !== 'cached') note.textContent = t(draft.mode === 'contains' ? 'home.pmTypeMore' : 'home.pmTypeOne'); return; }
        if (!found.length) { note.textContent = t('home.pmNone'); return; }
        found.slice(0, MAX_RESULTS).forEach((it) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pm-app-result';
            btn.innerHTML = `<span><p>${highlight(it.description)}</p><span>${highlight([it.code, it.uom, it.categories].filter(Boolean).join(' · '))}</span></span><i class="bx bx-plus-circle" aria-hidden="true"></i>`;
            btn.addEventListener('click', () => openQuantity(it));
            results.appendChild(btn);
        });
        if (found.length > MAX_RESULTS) {
            const more = document.createElement('p');
            more.className = 'pm-app-note';
            more.textContent = t('home.pmMore');
            results.appendChild(more);
        }
    };
    const drawMode = () => {
        searchBox.querySelector('#pm-app-mcur').textContent = t(SEARCH_MODES.find(([k]) => k === draft.mode)[1]);
        searchBox.querySelectorAll('[data-pm-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pmMode === draft.mode)));
        searchBox.querySelectorAll('[data-pm-sign]').forEach((b) => { const off = signOff(b.dataset.pmSign); b.disabled = off; if (off) b.title = t('home.pmSignOff'); else b.removeAttribute('title'); });
        modeEl.hidden = true; signEl.hidden = true;
    };
    drawMode();
    const typed = () => { draft.query = qInput.value; qClear.hidden = !draft.query; drawResults(); };
    qInput.addEventListener('input', typed);
    qClear.addEventListener('click', () => { qInput.value = ''; typed(); qInput.focus(); });
    searchBox.querySelectorAll('[data-pm-popbtn]').forEach((btn) => btn.addEventListener('click', () => {
        const mine = btn.dataset.pmPopbtn === 'modepop' ? modeEl : signEl;
        const other = mine === modeEl ? signEl : modeEl;
        mine.hidden = !mine.hidden;
        other.hidden = true;
    }));
    searchBox.querySelectorAll('[data-pm-mode]').forEach((b) => b.addEventListener('click', () => { draft.mode = b.dataset.pmMode; drawMode(); drawResults(); }));
    // Escribe el signo donde está el cursor de la caja (la coma lleva su espacio) y deja el cursor justo después, con el teclado abierto.
    searchBox.querySelectorAll('[data-pm-sign]').forEach((b) => b.addEventListener('click', () => {
        if (b.disabled) return;
        const sign = b.dataset.pmSign;
        const start = qInput.selectionStart == null ? qInput.value.length : qInput.selectionStart;
        const end = qInput.selectionEnd == null ? start : qInput.selectionEnd;
        const text = sign === ',' ? ', ' : sign;
        qInput.value = qInput.value.slice(0, start) + text + qInput.value.slice(end);
        qInput.focus();
        try { qInput.setSelectionRange(start + text.length, start + text.length); } catch { /* algunos teclados no dejan mover el cursor */ }
        typed();
        signEl.hidden = true;
    }));
    const fieldsToggle = searchBox.querySelector('#pm-app-fieldstoggle');
    fieldsToggle.addEventListener('click', () => { fieldsEl.hidden = !fieldsEl.hidden; fieldsToggle.setAttribute('aria-expanded', String(!fieldsEl.hidden)); });
    // Marcar un campo desmarca «Todos» solo; si quedan todos los campos marcados o ninguno, vuelve a «Todos».
    fieldsEl.addEventListener('change', (event) => {
        const box = event.target.closest('[data-pm-field]');
        if (!box) return;
        const key = box.dataset.pmField;
        if (key === 'all') draft.fields = [];
        else {
            const set = new Set(draft.fields);
            if (box.checked) set.add(key); else set.delete(key);
            draft.fields = FIELD_KEYS.map(([k]) => k).filter((k) => set.has(k));
            if (draft.fields.length === FIELD_KEYS.length) draft.fields = [];
        }
        fieldsEl.innerHTML = fieldsHtml();
        searchBox.querySelector('#pm-app-fields-sum').textContent = fieldsSummary();
        drawResults();
    });
    drawResults();

    // el pedido armado
    const cartBox = document.createElement('div');
    cartBox.className = 'pm-app-card';
    bodyEl.appendChild(cartBox);
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'home-carga-new-btn pm-app-send';
    sendBtn.innerHTML = `<i class="bx bx-send" aria-hidden="true"></i><span>${esc(t('home.pmSend'))}</span>`;
    sendBtn.addEventListener('click', () => {
        if (!draft.requesterName.replace(/\s+/g, ' ').trim()) { showToast(t('home.pmNeedName')); whoInput.focus(); return; }
        sendDraft();
    });
    bodyEl.appendChild(sendBtn);
    const sendDraw = () => { sendBtn.disabled = !draft.cart.size || draft.costCenterId === null || (usesPlaces() && draft.placeId === null); };
    const cartDraw = () => {
        cartBox.innerHTML = `<h4 class="pm-app-title">${esc(t('home.pmCart'))}${draft.cart.size ? ` · ${esc(itemsText(draft.cart.size))}` : ''}</h4>`;
        if (!draft.cart.size) {
            const empty = document.createElement('p');
            empty.className = 'pm-app-note';
            empty.textContent = t('home.pmCartEmpty');
            cartBox.appendChild(empty);
        }
        draft.cart.forEach(({ item, quantity }, id) => {
            const row = document.createElement('div');
            row.className = 'pm-app-line';
            row.innerHTML = `<div class="pm-app-line-main"><p>${esc(item.description)}</p><span>${esc([item.code, item.uom].filter(Boolean).join(' · '))}</span></div><b class="pm-app-qty">${esc(qtyText(quantity))}</b>`;
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'pm-app-remove';
            rm.setAttribute('aria-label', t('home.pmRemove'));
            rm.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
            rm.addEventListener('click', () => { draft.cart.delete(id); cartDraw(); });
            row.appendChild(rm);
            cartBox.appendChild(row);
        });
        sendDraw();
    };
    draft.redrawCart = cartDraw;
    cartDraw();
}

// La cantidad de un artículo (hoja desde abajo): − / número / + y «Agregar al pedido».
function openQuantity(item) {
    const scrim = document.createElement('div');
    scrim.className = 'home-select-scrim';
    const sheet = document.createElement('div');
    sheet.className = 'home-select-sheet';
    const inCart = draft.cart.get(item.id);
    sheet.innerHTML = `<div class="home-select-sheet-handle"></div><div class="home-select-sheet-title">${esc(item.description)}</div>
        <p class="pm-app-note pm-app-sheet-meta">${esc([item.code, item.uom, item.categories].filter(Boolean).join(' · '))}</p>
        <label class="pm-app-qty-label" for="pm-app-qty">${esc(t('home.pmQuantity'))}</label>
        <div class="pm-app-stepper"><button type="button" id="pm-app-minus" aria-label="−"><i class="bx bx-minus" aria-hidden="true"></i></button><input id="pm-app-qty" type="number" inputmode="decimal" min="0" step="any" value="${inCart ? esc(inCart.quantity) : '1'}"><button type="button" id="pm-app-plus" aria-label="+"><i class="bx bx-plus" aria-hidden="true"></i></button></div>
        <p class="home-carga-field-error" id="pm-app-qty-err">${esc(t('main.recEditError_QTY'))}</p>
        <button type="button" class="home-carga-new-btn" id="pm-app-add"><i class="bx bx-cart-add" aria-hidden="true"></i><span>${esc(t('home.pmAdd'))}</span></button>
        <button type="button" class="home-carga-secondary-btn" id="pm-app-cancel">${esc(t('home.pmCancel'))}</button>`;
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
    const input = sheet.querySelector('#pm-app-qty');
    const err = sheet.querySelector('#pm-app-qty-err');
    const step = (delta) => { const v = parseFloat(input.value) || 0; input.value = String(Math.max(0, Math.round((v + delta) * 1000) / 1000)); err.classList.remove('show'); };
    sheet.querySelector('#pm-app-minus').addEventListener('click', () => step(-1));
    sheet.querySelector('#pm-app-plus').addEventListener('click', () => step(1));
    const close = () => scrim.remove();
    scrim.addEventListener('click', (event) => { if (event.target === scrim) close(); });
    sheet.querySelector('#pm-app-cancel').addEventListener('click', close);
    sheet.querySelector('#pm-app-add').addEventListener('click', () => {
        const qty = Math.round(parseFloat(input.value) * 1000) / 1000;
        if (!Number.isFinite(qty) || qty <= 0 || qty > 999999) { err.classList.add('show'); return; }
        draft.cart.set(item.id, { item, quantity: qty });
        close();
        draft.redrawCart();
    });
    input.focus();
    input.select();
}

async function sendDraft() {
    if (!draft || !draft.cart.size || draft.costCenterId === null) return;
    if (usesPlaces() && draft.placeId === null) { showToast(t('home.pmNeedPlace')); return; }
    const requesterName = draft.requesterName.replace(/\s+/g, ' ').trim().slice(0, 60);
    const items = Array.from(draft.cart, ([id, { quantity }]) => ({ id, quantity }));
    const body = { costCenterId: draft.costCenterId, requesterName, items, clientAt: new Date().toISOString(), clientRef: draft.clientRef };
    const place = usesPlaces() ? catalogPlaces.find((p) => p.id === draft.placeId) : null;
    if (place) body.placeId = place.id;
    const cc = costCenters.find((c) => c.id === draft.costCenterId);
    const description = `${t('menu.opCentroDistPedidoManual')} · ${[place ? place.name : '', cc ? cc.name : ''].filter(Boolean).join(' · ')} · ${itemsText(items.length)}`;
    const sendBtn = bodyEl.querySelector('.pm-app-send');
    if (sendBtn) sendBtn.disabled = true;
    try {
        // rejectable: si ya con señal el servidor lo rechaza (un artículo dejó de existir) se anota en "No se aplicó" en vez de trabar la cola
        const result = await sync().offlineAwareFetch(
            `${ORDERS_URL}/orders`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) },
            description, `${ORDER_RECORD_PREFIX}-new:${draft.clientRef}`, null, { rejectable: true },
        );
        if (!result.queued && !result.ok) {
            showToast(sendErrorText(result.body));
            if (sendBtn) sendBtn.disabled = false;
            return;
        }
        try { localStorage.setItem(NAME_KEY, requesterName); } catch { /* sin almacenamiento */ }
        // lo que se ve al terminar: el número de pedido (si se mandó sin señal todavía no lo hay) y su lista de artículos
        doneInfo = {
            queued: !!result.queued, folio: result.queued ? '' : (result.body.folio || ''), name: requesterName, placeName: place ? place.name : '', at: result.queued ? body.clientAt : (result.body.createdAt || body.clientAt), centroCostos: cc ? cc.name : '',
            lines: Array.from(draft.cart.values(), ({ item, quantity }) => ({ code: item.code, description: item.description, uom: item.uom, quantity })),
        };
        if (!result.queued) await loadOrders();
        draft = null;
        await refreshQueuedOrders();
        view = 'done';
        render();
    } catch {
        showToast(t('home.pmErrSend'));
        if (sendBtn) sendBtn.disabled = false;
    }
}
// El número de pedido y la lista de lo que se pidió.
let doneInfo = null;
function renderDone() {
    const d = doneInfo;
    if (!d) { view = 'list'; render(); return; }
    titleEl.textContent = t(d.queued ? 'home.pmSavedTitle' : 'home.pmSentTitle');
    const box = document.createElement('div');
    box.className = 'pm-app-card pm-app-done';
    box.innerHTML = `<div class="pm-app-tick" aria-hidden="true"><i class="bx ${d.queued ? 'bx-cloud-upload' : 'bx-check'}"></i></div>
        <span class="pm-app-lbl">${esc(t('home.pmOrderNumber'))}</span>
        <div class="pm-app-folio">${esc(d.folio || t('home.pmNoNumberYet'))}</div>
        ${d.queued ? `<p class="pm-app-note">${esc(t('home.pmNumberOnSync'))}</p>` : ''}
        <div class="pm-app-meta pm-app-meta-flat">${[[t('home.pmRequestedBy'), d.name], [t('main.colPmLugar'), d.placeName], [t('home.pmWhen'), formatTime(d.at)], [t('main.pmQrCentro'), d.centroCostos]].filter(([, v]) => v).map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
        <h4 class="pm-app-title">${esc(t('home.pmListTitle'))} · ${esc(itemsText(d.lines.length))}</h4>
        ${d.lines.map((l) => `<div class="pm-app-line"><div class="pm-app-line-main"><p>${esc(l.description)}</p><span>${esc([l.code, l.uom].filter(Boolean).join(' · '))}</span></div><b class="pm-app-qty">${esc(qtyText(l.quantity))}</b></div>`).join('')}`;
    bodyEl.appendChild(box);
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'home-carga-new-btn';
    again.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('home.pmAnother'))}</span>`;
    again.addEventListener('click', startNewOrder);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'home-carga-secondary-btn';
    back.textContent = t('home.pmBackToList');
    back.addEventListener('click', () => { doneInfo = null; view = 'list'; render(); });
    bodyEl.append(again, back);
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') { window.location.href = 'AppInicio.html'; return; }
    if (view === 'new' && draft && draft.cart.size && !window.confirm(t('home.pmDiscard'))) return;
    draft = null;
    doneInfo = null;
    view = 'list';
    render();
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
        // Toda operación va ligada a un centro de costos completo (AppSiteGate); sin señal no se bloquea.
        siteBlocked = await window.AppSiteGate.blocked();
        await Promise.all([loadCostCenters(), loadBrandingForTheme(), loadCatalog()]);
        applyStyle(getStoredStyle());
        await loadOrders();
        await refreshQueuedOrders();
        render();
    } catch (err) {
        console.error('Pedido Manual (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
