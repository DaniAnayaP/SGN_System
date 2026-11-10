// ---------------------------------------------------------------------------
// Capacidad Almacenamiento (App) — la misma pantalla de la Web (Operaciones > Capacidad Almacenamiento) hecha para el celular: los LUGARES de almacenamiento del Layout (un hueco: activo × nivel × columna) de los centros de
// costos marcados arriba, con el código asignado a cada uno y su capacidad (huellas, por pallet, por huella y máxima). Se puede buscar y filtrar (sin código, con código, con datos por completar), elegir, cambiar o quitar el
// código de un lugar (con los permisos de su columna del árbol) y todo funciona SIN SEÑAL: los lugares y el catálogo de códigos se guardan en el celular, la capacidad se calcula ahí mismo y el cambio queda en la cola de
// AppOfflineSync.js («En tu celular») para mandarse solo al reconectar, con detección de choques si otra persona cambió ese lugar mientras tanto. Todavía sin cantidades en existencia (vendrán de existencias y transacciones).
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
const API = '/api/business/storage-capacity';
const RECORD_PREFIX = 'capacidad-almacenamiento';
const MAX_SHOWN = 150;
const MAX_CODES = 30;
let currentUser = null;
let isClientAdmin = false;
let effectiveGrants = [];
let costCenters = [];
let rows = [];            // los lugares de los centros de costos elegidos arriba
let canFill = false;
let canChange = false;
let codes = [];           // los códigos que se pueden asignar (se guardan en el celular)
let codesById = new Map();
let codesState = 'loading'; // 'loading' | 'online' | 'cached' | 'none'
let rowsFromCache = false;
let view = 'list';        // 'list' | 'detail' | 'pick'
let openKey = null;       // `${centro}|${lugar}`
let filter = 'all';       // 'all' | 'none' | 'with' | 'incomplete'
let query = '';
let siteBlocked = false;
let queueMineCount = 0;
const keyOf = (r) => `${r.cc}|${r.key}`;

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
const num = (n, digits = 2) => Number(n).toLocaleString(currentLang() === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: digits });

// La misma cuenta que la pantalla Web y el servidor (LayoutCalc.capacityOf): la App no carga LayoutCalc, así que la repite aquí para calcular sin señal.
// Huellas = cuántas tarimas del código (base Largo × Ancho en cm) caben de verdad en el piso del lugar (metros), de frente o girada; por pallet = TI × HI; por huella = estiba × por pallet; máxima = huellas × por huella.
const fitCount = (a, b, x, y) => (a > 0 && b > 0 && x > 0 && y > 0 ? Math.floor(a / x + 1e-9) * Math.floor(b / y + 1e-9) : 0);
function capacityOf(row, code) {
    const out = { huellas: null, perPallet: null, perHuella: null, max: null, missing: [] };
    if (!code) return out;
    const L = Number(code.length) || 0; const W = Number(code.width) || 0;
    const ti = Math.round(Number(code.ti)) || 0; const hi = Math.round(Number(code.hi)) || 0; const stack = Math.round(Number(code.stack)) || 0;
    if (L > 0 && W > 0) out.huellas = Math.max(fitCount(row.l * 100, row.w * 100, L, W), fitCount(row.l * 100, row.w * 100, W, L)); else out.missing.push('size');
    if (!(ti > 0)) out.missing.push('ti');
    if (!(hi > 0)) out.missing.push('hi');
    if (!(stack > 0)) out.missing.push('stack');
    if (ti > 0 && hi > 0) out.perPallet = ti * hi;
    if (out.perPallet !== null && stack > 0) out.perHuella = stack * out.perPallet;
    if (out.huellas !== null && out.perHuella !== null) out.max = out.huellas * out.perHuella;
    return out;
}
const isIncomplete = (r) => !!(r.code && r.calc && r.calc.missing.length);

// --- Lo guardado en el celular: los lugares y los códigos, para ver y elegir sin señal ------------------------------------------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-cap-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function cachePut(key, value) {
    const db = await cacheDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
async function cacheGet(key) {
    const db = await cacheDb();
    return new Promise((resolve, reject) => {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}
const clientIdOf = () => (currentUser ? (currentUser.clientId ?? null) : null);

async function loadCodes() {
    codesState = 'loading';
    try {
        const res = await fetch(apiUrl(`${API}/codes`), { credentials: 'include' });
        if (res.ok) {
            const body = await res.json();
            codes = body.codes || [];
            codesById = new Map(codes.map((c) => [c.id, c]));
            codesState = 'online';
            cachePut('codes', { clientId: clientIdOf(), codes }).catch(() => { /* sin almacenamiento */ });
            return;
        }
    } catch { /* sin señal: se usan los guardados */ }
    try {
        const saved = await cacheGet('codes');
        if (saved && Array.isArray(saved.codes) && (saved.clientId ?? null) === clientIdOf()) { codes = saved.codes; codesById = new Map(codes.map((c) => [c.id, c])); codesState = 'cached'; return; }
    } catch { /* sin códigos guardados */ }
    codes = [];
    codesById = new Map();
    codesState = 'none';
}
async function loadCosts() {
    try {
        const res = await fetch(apiUrl('/api/business/cost-centers'), { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        costCenters = (body.costCenters || []).filter((cc) => hasCostCenterPermission(cc.id));
    } catch {
        costCenters = [];
    }
}
// Los centros que se piden: los marcados arriba (los que esta cuenta puede ver); sin marcar, todos.
function wantedCenterIds() {
    const sel = selectedCostCenterIds();
    const ids = costCenters.map((c) => c.id).filter((id) => !sel || !sel.size || sel.has(id));
    return ids;
}
async function loadRows() {
    const wanted = wantedCenterIds();
    const cacheKey = `rows:${clientIdOf()}`;
    try {
        const results = await Promise.all(wanted.map((id) => fetch(apiUrl(`${API}?costCenterId=${id}`), { credentials: 'include' }).then((res) => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))));
        rows = results.flatMap((b) => b.rows || []);
        canFill = results.some((b) => b.canFill);
        canChange = results.some((b) => b.canChange);
        rowsFromCache = false;
        cachePut(cacheKey, { rows, canFill, canChange, all: !!costCenters.length }).catch(() => { /* sin almacenamiento */ });
    } catch {
        // sin señal: los lugares que se vieron la última vez (solo de los centros marcados)
        try {
            const saved = await cacheGet(cacheKey);
            if (saved && Array.isArray(saved.rows)) {
                const ok = new Set(wanted);
                rows = saved.rows.filter((r) => ok.has(r.cc));
                canFill = !!saved.canFill;
                canChange = !!saved.canChange;
                rowsFromCache = true;
            }
        } catch { /* sin lugares guardados */ }
    }
    await applyQueued();
}

// --- Lo que sigue en la cola sin señal: se ve ya aplicado (en tu celular) --------------------------------------------------------------------
const QUEUE_URL = /\/api\/business\/storage-capacity\/(\d+)\/(.+)$/;
async function readQueue() {
    try { return await sync().listOfflineQueue(); } catch { return []; }
}
function recomputeRow(r, code) {
    r.code = code ? { ...code, sku: code.sku } : null;
    r.calc = code ? capacityOf(r, code) : null;
}
async function applyQueued() {
    const queue = await readQueue();
    const mine = queue.filter((item) => item.method === 'PATCH' && item.url && QUEUE_URL.test(item.url));
    queueMineCount = mine.length;
    rows.forEach((r) => { r.pending = false; });
    mine.forEach((item) => {
        const m = QUEUE_URL.exec(item.url);
        let body;
        try { body = JSON.parse(item.body || '{}'); } catch { return; }
        const cc = Number(m[1]);
        const key = decodeURIComponent(m[2]);
        const r = rows.find((x) => x.cc === cc && x.key === key);
        if (!r) return;
        recomputeRow(r, body.skuItemId ? codesById.get(Number(body.skuItemId)) || null : null);
        r.pending = true;
    });
}
document.addEventListener('sgn:offline-queue-changed', async () => {
    const before = queueMineCount;
    await applyQueued();
    if (before === queueMineCount) return;
    // al reconectar la cola se vacía: se vuelven a pedir los lugares para verlos tal como quedaron en el servidor
    if (queueMineCount === 0 && navigator.onLine) await loadRows();
    if (view !== 'pick') render();
});
document.addEventListener('sgn:offline-rejected', () => { if (view === 'list') render(); });

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    bodyEl.innerHTML = '';
    if (siteBlocked) { window.AppSiteGate.show(bodyEl, t); titleEl.textContent = t('menu.opCentroDistCapacidadAlmacenamiento'); return; }
    if (view === 'detail') { renderDetail(); return; }
    if (view === 'pick') { renderPick(); return; }
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
function matchesFilter(r) {
    if (filter === 'none') return !r.code;
    if (filter === 'with') return !!r.code;
    if (filter === 'incomplete') return isIncomplete(r);
    return true;
}
function visibleRows() {
    const test = window.SearchSyntax.ready('contains', query) ? window.SearchSyntax.compile('contains', query) : null;
    return rows.filter((r) => matchesFilter(r) && (!test || [r.locator, r.typeName, r.code && r.code.sku, r.code && r.code.upc, r.code && r.code.description].some((v) => !!v && test(v))));
}
function renderList() {
    titleEl.textContent = t('menu.opCentroDistCapacidadAlmacenamiento');
    renderRejectedBanner();
    const withCode = rows.filter((r) => r.code).length;
    const kpis = document.createElement('div');
    kpis.className = 'cap-app-kpis';
    kpis.innerHTML = [[num(rows.length, 0), t('home.capKpiPlaces')], [num(rows.reduce((a, r) => a + (r.m2 || 0), 0)), t('home.capKpiM2')], [num(withCode, 0), t('home.capKpiWith')], [num(rows.length - withCode, 0), t('home.capKpiWithout')], [num(rows.filter(isIncomplete).length, 0), t('home.capKpiIncomplete')]]
        .map(([v, l]) => `<div class="cap-app-kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
    bodyEl.appendChild(kpis);
    if (rowsFromCache) { const n = document.createElement('p'); n.className = 'pm-app-note'; n.textContent = t('home.capFromCache'); bodyEl.appendChild(n); }

    const card = document.createElement('div');
    card.className = 'pm-app-card';
    card.innerHTML = `<input type="search" id="cap-app-q" class="pm-app-input" inputmode="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(t('home.capSearch'))}" aria-label="${esc(t('home.capSearch'))}" value="${esc(query)}">
        <div class="pm-app-chips" role="group">${[['all', 'home.capFAll'], ['none', 'home.capFNone'], ['with', 'home.capFWith'], ['incomplete', 'home.capFIncomplete']].map(([id, key]) => `<button type="button" class="pm-app-chip" data-f="${id}" aria-pressed="${filter === id}">${esc(t(key))}</button>`).join('')}</div>`;
    bodyEl.appendChild(card);
    const list = document.createElement('div');
    bodyEl.appendChild(list);
    const drawList = () => {
        list.innerHTML = '';
        const shown = visibleRows();
        if (!shown.length) {
            const empty = document.createElement('p');
            empty.className = 'home-carga-empty-note';
            empty.textContent = t(rows.length ? 'home.capNoResults' : 'home.capEmpty');
            list.appendChild(empty);
            return;
        }
        shown.slice(0, MAX_SHOWN).forEach((r) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'home-carga-active-row';
            const sub = [r.typeName, `${num(r.l)} × ${num(r.w)} m`, `${num(r.m2)} m²`].filter(Boolean).join(' · ');
            const pill = r.code ? `<span class="cap-app-pill${isIncomplete(r) ? ' warn' : ''}">${esc(r.code.sku)}</span>` : `<span class="cap-app-pill none">${esc(t('home.capNoCode'))}</span>`;
            btn.innerHTML = `<span class="home-carga-active-row-icon"><i class="bx bx-package" aria-hidden="true"></i></span><span class="home-carga-active-row-label"><p>${esc(r.locator)}</p><span>${esc(sub)}${r.code ? ` · ${esc(r.code.description)}` : ''}</span></span>${r.pending ? `<span class="home-carga-offline-badge" title="${esc(t('home.capSavedOffline'))}"><i class="bx bx-cloud-upload" aria-hidden="true"></i></span>` : ''}${pill}`;
            btn.addEventListener('click', () => { openKey = keyOf(r); view = 'detail'; render(); });
            list.appendChild(btn);
        });
        if (shown.length > MAX_SHOWN) {
            const more = document.createElement('p');
            more.className = 'pm-app-note';
            more.textContent = t('home.capShowing', { n: MAX_SHOWN, total: shown.length });
            list.appendChild(more);
        }
    };
    drawList();
    const q = card.querySelector('#cap-app-q');
    q.addEventListener('input', () => { query = q.value; drawList(); });
    card.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
        filter = b.dataset.f;
        card.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.f === filter)));
        drawList();
    }));
}
const currentRow = () => rows.find((r) => keyOf(r) === openKey);
function renderDetail() {
    const r = currentRow();
    if (!r) { view = 'list'; render(); return; }
    titleEl.textContent = r.locator;
    const info = document.createElement('div');
    info.className = 'pm-app-meta';
    info.innerHTML = [[t('main.colCapActivo'), r.typeName || '—'], [t('main.colCapLargo'), num(r.l)], [t('main.colCapFondo'), num(r.w)], [t('main.colCapAlto'), r.h > 0 ? num(r.h) : '—'], [t('main.colCapM2'), num(r.m2)]]
        .map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    bodyEl.appendChild(info);

    const c = r.code;
    const codeBox = document.createElement('div');
    codeBox.className = 'pm-app-card';
    codeBox.innerHTML = `<h4 class="pm-app-title">${esc(t('main.colCapCodigo'))}${r.pending ? ` · ${esc(t('home.capSavedOffline'))}` : ''}</h4>`;
    if (c) {
        const lines = [[t('main.colCapCodigo'), c.sku], [t('main.colCapDescripcion'), c.description], [t('main.colCapUdm'), c.uom || '—'], [t('main.colCapTipoAlm'), (c.storageTypes && c.storageTypes.length) || c.storageType ? ((c.storageTypes && c.storageTypes.length) ? c.storageTypes : [c.storageType]).map((k) => t(`main.storageType_${k}`)).join(' · ') : '—'], [t('main.colCapBase'), c.length > 0 && c.width > 0 ? `${num(c.length, 1)} × ${num(c.width, 1)}` : '—'], [t('main.colCapTi'), c.ti > 0 ? num(c.ti, 0) : '—'], [t('main.colCapHi'), c.hi > 0 ? num(c.hi, 0) : '—'], [t('main.colCapEstiba'), c.stack > 0 ? num(c.stack, 0) : '—']];
        const meta = document.createElement('div');
        meta.className = 'pm-app-meta pm-app-meta-flat';
        meta.innerHTML = lines.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
        codeBox.appendChild(meta);
    } else {
        const none = document.createElement('p');
        none.className = 'pm-app-note';
        none.textContent = t('home.capNoCodeYet');
        codeBox.appendChild(none);
    }
    const mayPick = c ? canChange : canFill;
    if (mayPick) {
        const pickBtn = document.createElement('button');
        pickBtn.type = 'button';
        pickBtn.className = 'home-carga-new-btn';
        pickBtn.innerHTML = `<i class="bx bx-search" aria-hidden="true"></i><span>${esc(t(c ? 'home.capChange' : 'home.capChoose'))}</span>`;
        pickBtn.addEventListener('click', () => { view = 'pick'; pickQuery = ''; render(); });
        codeBox.appendChild(pickBtn);
    } else if (!c) {
        const lock = document.createElement('p');
        lock.className = 'pm-app-note';
        lock.textContent = t('home.capNoPermission');
        codeBox.appendChild(lock);
    }
    if (c && canChange) {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'home-carga-secondary-btn';
        rm.textContent = t('home.capRemove');
        rm.addEventListener('click', () => assign(r, null));
        codeBox.appendChild(rm);
    }
    bodyEl.appendChild(codeBox);

    if (c && r.calc) {
        const k = r.calc;
        const box = document.createElement('div');
        box.className = 'pm-app-card cap-app-calc';
        box.innerHTML = `<h4 class="pm-app-title">${esc(t('home.capCapacity'))}</h4><div class="cap-app-grid">${[[t('main.colCapHuellas'), k.huellas === null ? '—' : (k.huellas === 0 ? t('main.capNoCabe') : num(k.huellas, 0))], [t('main.colCapPorPallet'), k.perPallet === null ? '—' : num(k.perPallet, 0)], [t('main.colCapPorHuella'), k.perHuella === null ? '—' : num(k.perHuella, 0)], [t('main.colCapMaxima'), k.max === null ? '—' : num(k.max, 0)]].map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>${k.missing.length ? `<p class="pm-app-note">${esc(t('main.capFaltan', { datos: k.missing.map((m) => t(`main.capFalta_${m}`)).join(', ') }))}</p>` : ''}`;
        bodyEl.appendChild(box);
    }
}

// --- Elegir el código de un lugar: se busca en los códigos guardados en el celular (con la misma sintaxis de búsqueda de todo el sistema) -------------
let pickQuery = '';
function renderPick() {
    const r = currentRow();
    if (!r) { view = 'list'; render(); return; }
    titleEl.textContent = t('home.capPickTitle', { place: r.locator });
    const card = document.createElement('div');
    card.className = 'pm-app-card';
    card.innerHTML = `<input type="search" id="cap-app-code-q" class="pm-app-input" inputmode="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(t('main.capBuscarCodigo'))}" aria-label="${esc(t('main.capBuscarCodigo'))}" value="${esc(pickQuery)}"><p class="pm-app-note" id="cap-app-note"></p><div class="pm-app-results" id="cap-app-results"></div>`;
    bodyEl.appendChild(card);
    const q = card.querySelector('#cap-app-code-q');
    const note = card.querySelector('#cap-app-note');
    const box = card.querySelector('#cap-app-results');
    const draw = () => {
        box.innerHTML = '';
        note.textContent = '';
        if (codesState === 'none') { note.textContent = t('home.capCodesNone'); return; }
        if (codesState === 'cached') note.textContent = t('home.capCodesCached', { n: codes.length });
        if (!window.SearchSyntax.ready('contains', pickQuery)) { if (codesState !== 'cached') note.textContent = t('home.pmTypeMore'); return; }
        const test = window.SearchSyntax.compile('contains', pickQuery);
        const found = [];
        for (const c of codes) { if ([c.sku, c.upc, c.description].some((v) => !!v && test(v))) { found.push(c); if (found.length > MAX_CODES) break; } }
        if (!found.length) { note.textContent = t('main.capSinResultados'); return; }
        found.slice(0, MAX_CODES).forEach((c) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pm-app-result';
            btn.innerHTML = `<span><p>${esc(c.sku)} · ${esc(c.description)}</p><span>${esc([c.upc, c.uom].filter(Boolean).join(' · '))}</span></span><i class="bx bx-check-circle" aria-hidden="true"></i>`;
            btn.addEventListener('click', () => assign(r, c.id));
            box.appendChild(btn);
        });
        if (found.length > MAX_CODES) { const more = document.createElement('p'); more.className = 'pm-app-note'; more.textContent = t('home.pmMore'); box.appendChild(more); }
    };
    q.addEventListener('input', () => { pickQuery = q.value; draw(); });
    draw();
    q.focus();
}

// --- Asignar (o quitar con null) el código de un lugar ----------------------------------------------------------------------------------------
// Va por la cola sin señal: con señal el servidor decide (se aplica, queda pendiente de autorización o no hay permiso) y regresa el lugar ya con su capacidad; sin señal el cambio se ve aplicado en el celular y se manda solo al reconectar.
// Con lo que se veía al guardar (baseline) un código que otra persona cambió entre tanto no se pisa sin preguntar.
async function assign(r, skuItemId) {
    const before = r.code ? r.code.id : null;
    const description = `${t('menu.opCentroDistCapacidadAlmacenamiento')} · ${r.locator}`;
    try {
        const result = await sync().offlineAwareFetch(
            `${API}/${r.cc}/${encodeURIComponent(r.key)}`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ skuItemId }) },
            description, `${RECORD_PREFIX}:${keyOf(r)}`, { skuItemId: before }, { rejectable: true },
        );
        if (result.queued) {
            recomputeRow(r, skuItemId ? codesById.get(skuItemId) || null : null);
            r.pending = true;
            queueMineCount += 1;
            showToast(t('home.capSavedOffline'), 6000);
        } else if (!result.ok) {
            showToast(result.body.message || t('admin.saveError'));
            return;
        } else {
            const body = result.body;
            if (body.rejectedFields && body.rejectedFields.length) showToast(t('main.capSinPermiso'));
            else if (body.pendingFields && body.pendingFields.length) showToast(`${t('main.changePending')}: ${body.pendingFields.map((fk) => t(fk)).join(', ')}`);
            else showToast(t(skuItemId === null ? 'main.capQuitado' : 'main.capGuardado'));
            if (body.row) { const at = rows.findIndex((x) => keyOf(x) === keyOf(r)); if (at >= 0) rows[at] = body.row; }
        }
        cachePut(`rows:${clientIdOf()}`, { rows, canFill, canChange, all: true }).catch(() => { /* sin almacenamiento */ });
        view = 'detail';
        render();
    } catch {
        showToast(t('admin.saveError'));
    }
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') { window.location.href = 'AppInicio.html'; return; }
    view = view === 'pick' ? 'detail' : 'list';
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
        await Promise.all([loadCosts(), loadBrandingForTheme(), loadCodes()]);
        applyStyle(getStoredStyle());
        await loadRows();
        render();
    } catch (err) {
        console.error('Capacidad Almacenamiento (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
