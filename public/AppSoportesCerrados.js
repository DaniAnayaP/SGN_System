// ---------------------------------------------------------------------------
// Soportes cerrados (App) — la misma pantalla Gestión › Soportes cerrados de la Web (TI › Operaciones TI), hecha para el celular: los casos de soporte ya terminados (Terminado o Cerrado sin respuesta), el más reciente primero, con la
// causa, qué se hizo, quién lo cerró, cuánto tardó, cuántas veces se reabrió, la calificación del usuario y cuántas evidencias trae. Solo se ve (como en la Web); tocar un caso lo abre en la pantalla de Soporte de la App
// (AppSoporte.html?id=…&back=AppSoportesCerrados.html), con su chat, su recorrido y sus evidencias, y el atrás regresa aquí. Se busca con el buscador de siempre (SearchSyntax) sobre las mismas columnas que busca la Web.
// Sin señal se ve lo último que se bajó (guardado en el celular, solo de la misma empresa y persona). El servidor es el mismo de la Web (GET /api/business/support-closed): quien no tiene la pantalla en el árbol no la ve.
// Es una pantalla de las que la empresa agrega a la App de un sector (Nuestras APPs › «Soportes cerrados») y se da con «Visión APP» en el árbol de permisos.
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
const API = '/api/business/support-closed';
const OPEN_CASE = 'AppSoporte.html';            // el caso se abre en la pantalla de Soporte de la App (chat, recorrido y evidencias); «back» regresa aquí
const PAGE = 40;                                // cuántos se dibujan de una vez («Ver más» trae otros)
let currentUser = null;
let cases = [];
let truncated = false;
let maxCases = 0;
let dataState = 'loading';                      // 'loading' | 'online' | 'cached' | 'none' | 'forbidden'
let query = '';
let shown = PAGE;
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
const localeOf = () => (currentLang() === 'es' ? 'es-MX' : 'en-US');
const fmtTime = (iso) => new Date(iso).toLocaleString(localeOf(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// Cuánto tardó, en palabras cortas: «45 min», «3 h 20 min», «1 d 5 h» (igual que la Web).
function duration(min) {
    const n = Math.max(0, Number(min) || 0);
    if (n < 1) return '< 1 min';
    if (n < 60) return `${n} min`;
    if (n < 1440) return `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}`;
    return `${Math.floor(n / 1440)} d${Math.floor((n % 1440) / 60) ? ` ${Math.floor((n % 1440) / 60)} h` : ''}`;
}

// --- Carga: lo último que se bajó se guarda en el celular para verlo también sin señal (solo la misma empresa y la misma persona) ----------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-sc-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function cacheSave() {
    try {
        const db = await cacheDb();
        const value = { clientId: currentUser ? (currentUser.clientId ?? null) : null, userId: currentUser ? (currentUser.sub ?? currentUser.id ?? null) : null, cases, truncated, max: maxCases, at: Date.now() };
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
async function loadData() {
    const clientId = currentUser ? (currentUser.clientId ?? null) : null;
    try {
        const res = await fetch(apiUrl(API), { credentials: 'include' });
        if (res.status === 401) { window.location.replace('Login.html'); return; }
        if (res.status === 403) { dataState = 'forbidden'; return; }
        if (res.ok) {
            const body = await res.json();
            cases = body.cases || []; truncated = !!body.truncated; maxCases = body.max || 0;
            dataState = 'online';
            cacheSave();
            return;
        }
    } catch { /* sin señal: se intenta con lo guardado */ }
    try {
        const saved = await cacheRead();
        const userId = currentUser ? (currentUser.sub ?? currentUser.id ?? null) : null;
        if (saved && (saved.clientId ?? null) === clientId && (saved.userId ?? null) === userId) {
            cases = saved.cases || []; truncated = !!saved.truncated; maxCases = saved.max || 0;
            dataState = 'cached';
            return;
        }
    } catch { /* sin datos guardados */ }
    dataState = 'none';
}

// --- Lo que se dibuja ---------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;
const chip = (text, cls) => el('span', `wpapp-chip${cls ? ` ${cls}` : ''}`, text);
// el buscador de siempre de la App (SearchSyntax: «$» antes, «@» después, la coma separa búsquedas) sobre las mismas columnas que busca la Web
const haystackOf = (c) => [c.folio, c.reporter, c.screen, c.summary, c.category, t(`main.spType_${c.type}`), c.general ? c.general.folio : '', t(`main.msPri_${c.priority}`), t(`main.spStatus_${c.status}`), c.causeName, c.closeDid, c.closedBy].filter(Boolean).join(' ');
const matches = (c, q) => !String(q || '').trim() || window.SearchSyntax.matches('contains', q, haystackOf(c));
function caseCard(c) {
    const card = el('button', 'wpapp-row spapp-card scapp-card');
    card.type = 'button';
    const main = el('div', 'wpapp-main');
    const title = el('div', 'wpapp-title');
    title.innerHTML = `<b>${esc(c.folio)}</b> · ${esc(c.summary)}`;
    main.appendChild(title);
    main.appendChild(el('span', 'wpapp-crumbs', [c.reporter, c.closedAt ? `${t('main.colScCerrado')} ${fmtTime(c.closedAt)}` : '', `${t('main.colScTiempo')}: ${duration(c.totalMinutes)}`].filter(Boolean).join(' · ')));
    const chips = el('div', 'wpapp-chips');
    chips.append(chip(t(`main.spStatus_${c.status}`), c.status === 'done' ? 'wpapp-chip-done' : 'wpapp-chip-late'), chip(t(`main.spType_${c.type}`)), chip(t(`main.msPri_${c.priority}`)));
    if (c.general) chips.appendChild(chip(c.general.folio));
    if (c.userStars) chips.appendChild(chip('★'.repeat(c.userStars) + '☆'.repeat(5 - c.userStars)));
    if (c.reopenedCount) chips.appendChild(chip(`${t('main.colScReabierto')}: ${c.reopenedCount}`, 'wpapp-chip-warn'));
    if (c.fileCount) chips.appendChild(chip(`📎 ${c.fileCount}`));
    main.appendChild(chips);
    // lo que se hizo y por qué quedó así (lo corto; el caso completo se abre al tocar)
    const lines = [[t('main.colScCausa'), c.causeName], [t('main.colScQueSeHizo'), c.closeDid], [t('main.colScCerro'), c.closedBy]].filter(([, v]) => v);
    if (lines.length) {
        const box = el('div', 'scapp-lines');
        lines.forEach(([k, v]) => { const row = el('div', 'scapp-line'); row.append(el('span', '', `${k}: `), el('b', '', v)); box.appendChild(row); });
        main.appendChild(box);
    }
    card.append(main, el('i', 'bx bx-chevron-right spapp-go'));
    card.addEventListener('click', () => { window.location.href = `${OPEN_CASE}?id=${c.id}&back=${encodeURIComponent(location.pathname.split('/').pop() || 'AppSoportesCerrados.html')}`; });
    return card;
}
function render() {
    bodyEl.innerHTML = '';
    titleEl.textContent = t('menu.gesTiSoportesCerrados');
    if (dataState === 'loading') { bodyEl.appendChild(el('p', 'home-empty', t('admin.loading'))); return; }
    if (dataState === 'forbidden') { bodyEl.appendChild(el('p', 'home-empty', t('home.scappForbidden'))); return; }
    if (dataState === 'none') { bodyEl.appendChild(el('p', 'home-empty', t('home.scappNoData'))); return; }
    if (dataState === 'cached') bodyEl.appendChild(el('p', 'spapp-note', t('home.scappCached')));
    const host = el('div', 'scapp');
    const search = el('input', 'pm-app-input wpapp-search');
    search.type = 'search';
    search.value = query;
    search.placeholder = t('home.scappSearch');
    search.setAttribute('aria-label', t('home.scappSearch'));
    search.setAttribute('data-help-key', 'appScSearch');
    host.appendChild(search);
    const count = el('p', 'spapp-hint scapp-count');
    const listEl = el('div', 'spapp-list');
    listEl.setAttribute('data-help-key', 'appScList');
    const draw = () => {
        listEl.innerHTML = '';
        const found = cases.filter((c) => matches(c, query));
        count.textContent = t('home.scappCount', { shown: Math.min(shown, found.length), n: found.length }) + (truncated ? ` · ${t('home.scappTruncated', { max: maxCases })}` : '');
        if (!found.length) { listEl.appendChild(el('p', 'home-empty', t(cases.length ? 'home.scappNoMatch' : 'home.scappEmpty'))); return; }
        found.slice(0, shown).forEach((c) => listEl.appendChild(caseCard(c)));
        if (found.length > shown) {
            const more = el('button', 'home-carga-secondary-btn scapp-more', t('home.scappMore'));
            more.type = 'button';
            more.addEventListener('click', () => { shown += PAGE; draw(); });
            listEl.appendChild(more);
        }
    };
    search.addEventListener('input', () => { query = search.value; shown = PAGE; draw(); });
    host.append(count, listEl);
    bodyEl.appendChild(host);
    draw();
}
document.getElementById('carga-back').addEventListener('click', () => { window.location.href = 'AppInicio.html'; });

(async function init() {
    await loadLanguage();
    window.HelpMode?.init(t);
    try {
        const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' });
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        if (!user || !user.clientId) { window.location.replace('AppInicio.html'); return; }   // las cuentas de SaaS tienen su Soporte en la Web
        await loadBrandingForTheme();
        applyStyle(getStoredStyle());
        render();
        await loadData();
        render();
    } catch (err) {
        console.error('Soportes cerrados (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
