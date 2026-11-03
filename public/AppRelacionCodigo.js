// ---------------------------------------------------------------------------
// Relación Código (App) — dónde vive cada código: centro de costos > almacén > sub almacén > zona > estante > nivel > espacio. Es la versión de celular de OpCentroDistRelacionCodigo.js
// (Web), con el mismo backend (/api/business/code-relations) y las mismas reglas, que el servidor vuelve a revisar. Una lista de las relaciones (con buscador) y un formulario con la misma
// cascada: cada lista se abre al elegir la anterior y el estante se ve de frente para tocar un hueco libre. Los códigos se buscan o se escanean con la cámara (UPC).
// Funciona sin señal: la lista, los catálogos, el Layout y los códigos se guardan en el celular; lo que se captura sin señal va a la cola de AppOfflineSync.js y se sube al reconectar;
// si el servidor lo rechaza entonces (por ejemplo el espacio ya lo ocupó otro código) no traba la cola: queda en el aviso "No se aplicó".
// ---------------------------------------------------------------------------

const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';
let dict = {};

function t(key, params = {}) {
    const value = key.split('.').reduce((obj, part) => obj?.[part], dict);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

async function loadLanguage() {
    const stored = localStorage.getItem('lang');
    const lang = SUPPORTED_LANGS.includes(stored) ? stored : DEFAULT_LANG;
    try {
        const res = await fetch(`i18n/${lang}.json`);
        if (res.ok) dict = await res.json();
    } catch {
        dict = {};
    }
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    const titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) document.title = t(titleEl.dataset.i18n);
}

// Same shape as AppInicio.js's own showToast — duplicated rather than
// shared, same convention every other App page in this project follows.
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

// --- Estilo (theme) — same mechanism as AppInicio.js/AppCargaCombustible.js.
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
        // Falls back to the static per-theme CSS already applied.
    }
}

const TABLE_KEY = 'relacion-codigo';
const API = '/api/business/code-relations';
const CACHE = { options: 'sgn_app_rel_options', skus: 'sgn_app_rel_skus', list: 'sgn_app_rel_list' };

// --- Estado -------------------------------------------------------------------------------------------------------------------------
let currentUser = null;
let options = null;     // centros de costos, almacenes, sub almacenes, zonas y anaqueles del Layout y espacios ocupados (la última copia buena, también sin señal)
let skus = [];          // códigos de Alta Artículos [{ id, sku, upc, description }] para buscar y escanear sin señal
let relations = [];     // la lista del servidor (más las guardadas sin señal en esta sesión)
let view = 'list';      // 'list' | 'form'
let searchText = '';
let editing = null;     // la relación abierta (null = nueva)
let st = null;          // lo que se va eligiendo: { sku, centro, alm, sub, zona, est, niv, esp }
let pendingCount = 0;   // cuántas hay guardadas en este celular esperando señal

// Los centros de costos marcados en el selector de la pantalla de inicio de la App. Se guarda en el celular con la misma clave que usa la Web: null = todos; si no, la lista de ids.
function selectedCenterIds() {
    try {
        const raw = localStorage.getItem('costCenterSelection');
        if (!raw || raw === 'all') return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch { return null; }
}
// Una relación sin centro se ve siempre, para poder asignárselo.
const centerShown = (id) => { const sel = selectedCenterIds(); return !sel || !id || sel.includes(String(id)); };
// Los centros que se pueden elegir en el formulario: los completos que están marcados (más el de la relación que se edita, aunque ya no esté marcado). Con uno solo, la relación nueva arranca en él.
function centerChoices() {
    const sel = selectedCenterIds();
    const list = options.costCenters.filter((c) => !sel || sel.includes(String(c.id)));
    if (editing && editing.costCenterId && !list.some((c) => String(c.id) === String(editing.costCenterId))) {
        list.push({ id: editing.costCenterId, name: (byId(options.costCenters, editing.costCenterId) || {}).name || editing.centroCostos || '' });
    }
    return list;
}
const blankState = () => ({ sku: null, centro: options && centerChoices().length === 1 ? centerChoices()[0].id : '', alm: '', sub: '', zona: '', hue: '', est: '', niv: '', esp: '', fila: '', prof: '', clas: 'activo' });
const readCache = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const writeCache = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin espacio: se pide otra vez con señal */ } };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const byId = (list, id) => (list || []).find((x) => String(x.id) === String(id));
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const sync = () => window.SgnOfflineSync;

// --- Datos: con señal se piden y se guardan; sin señal se usa la última copia ---------------------------------------------------------------
async function loadAll() {
    const get = async (path, key) => {
        try {
            const res = await fetch(apiUrl(path), { credentials: 'include' });
            if (!res.ok) throw new Error('load failed');
            const json = await res.json();
            writeCache(key, json);
            return json;
        } catch {
            return readCache(key);
        }
    };
    const [o, s, l] = await Promise.all([get(`${API}/options`, CACHE.options), get(`${API}/skus?all=1`, CACHE.skus), get(API, CACHE.list)]);
    options = o;
    skus = (s && s.skus) || [];
    relations = (l && l.relations) || [];
}
async function refreshPending() {
    const items = await sync().listOfflineQueue();
    pendingCount = items.filter((i) => i.recordKey && i.recordKey.startsWith(`${TABLE_KEY}:`)).length;
}
document.addEventListener('sgn:offline-queue-changed', async () => { await refreshPending(); if (view === 'list') render(); });
document.addEventListener('sgn:offline-rejected', () => { if (view === 'list') render(); });

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');

function render() {
    bodyEl.innerHTML = '';
    document.getElementById('carga-progress-track').hidden = true;
    document.getElementById('carga-progress-label').hidden = true;
    titleEl.textContent = t('menu.opCentroDistRelacionCodigo');
    if (view === 'list') renderList(); else renderForm();
}

function routeText(r) {
    return [r.warehouseName, r.subWarehouseName, r.zoneName, r.footprintCode && r.footprintCode !== r.spaceCode ? r.footprintCode : '', r.spaceCode, r.level ? t('main.relLevelN', { n: r.level }) : '', r.slot ? t('main.relSlotN', { n: r.slot }) : ''].filter(Boolean).join(' › ');
}

function renderRejectedBanner() {
    const rejected = sync().listRejected();
    if (!rejected.length) return;
    const box = document.createElement('div');
    box.className = 'relapp-rejected';
    box.innerHTML = `<b><i class="bx bx-error-circle" aria-hidden="true"></i> ${esc(t('home.relappRejectedTitle'))}</b>${rejected.map((r) => `<p>${esc(r.description)}${r.message ? ` — ${esc(r.message)}` : ''}${r.failed ? ` — ${esc(t('home.relappFailedRows', { n: r.failed.length }))}` : ''}</p>`).join('')}<button type="button" class="home-carga-secondary-btn">${esc(t('home.relappRejectedOk'))}</button>`;
    box.querySelector('button').addEventListener('click', () => { sync().clearRejected(); });
    bodyEl.appendChild(box);
}

function renderList() {
    renderRejectedBanner();
    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'home-carga-new-btn';
    newBtn.setAttribute('data-help-key', 'mobileNewRecord');
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('main.newRelation'))}</span>`;
    newBtn.addEventListener('click', () => openForm(null));
    bodyEl.appendChild(newBtn);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'relapp-input relapp-list-search';
    search.placeholder = t('home.relappSearch');
    search.setAttribute('aria-label', t('home.relappSearch'));
    search.value = searchText;
    search.addEventListener('input', () => { searchText = search.value; renderRows(); });
    bodyEl.appendChild(search);

    if (pendingCount) {
        const note = document.createElement('p');
        note.className = 'relapp-pending';
        note.innerHTML = `<i class="bx bx-cloud-upload" aria-hidden="true"></i> ${esc(t('home.relappPending', { n: pendingCount }))}`;
        bodyEl.appendChild(note);
    }
    const holder = document.createElement('div');
    holder.id = 'rel-rows';
    bodyEl.appendChild(holder);
    renderRows();
}

function renderRows() {
    const holder = document.getElementById('rel-rows');
    if (!holder) return;
    holder.innerHTML = '';
    const q = searchText.trim().toLowerCase();
    const inCenters = relations.filter((r) => centerShown(r.costCenterId));
    const shown = inCenters.filter((r) => !q || [r.sku, r.upc, r.description, routeText(r)].join(' ').toLowerCase().includes(q));
    if (!shown.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t(relations.length && !inCenters.length ? 'home.relappEmptyCenters' : 'home.relappEmpty');
        holder.appendChild(empty);
        return;
    }
    shown.forEach((r) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        const located = r.status === 'located';
        row.innerHTML = `<span class="home-carga-active-row-icon"><i class="bx bx-map-pin" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${esc(r.sku)} · ${esc(r.description || r.upc)}</p><span>${esc(routeText(r) || r.centroCostos)}</span>${r.locator ? `<span class="relapp-locator">${esc(r.locator)}</span>` : ''}</span>
            ${r.local ? `<span class="home-carga-offline-badge" title="${esc(t('home.cargaSavedOffline'))}"><i class="bx bx-cloud-upload" aria-hidden="true"></i></span>` : ''}
            <span class="relapp-tag ${located ? 'ok' : 'partial'}">${esc(t(located ? 'main.relStatusLocated' : 'main.relStatusPartial'))}</span>`;
        row.addEventListener('click', () => openForm(r));
        holder.appendChild(row);
    });
}

// --- Formulario: la misma cascada de la Web (cada lista se abre al elegir la anterior) ---------------------------------------------------
function openForm(record) {
    if (!options) { showToast(t('home.relappNoCatalogs')); return; }
    editing = record;
    st = record
        ? {
            sku: { id: record.skuItemId, sku: record.sku, description: record.description, upc: record.upc },
            centro: record.costCenterId || '', alm: record.warehouseId || '', sub: record.subWarehouseId || '', zona: record.zoneId || '', hue: record.footprintId || '', est: record.spaceId || '', niv: record.level || '', esp: record.slot || '', fila: record.row || '', prof: record.depth || '', clas: record.classification || 'activo',
        }
        : blankState();
    view = 'form';
    render();
}

function cutBelow(key) {
    const order = ['centro', 'alm', 'sub', 'zona', 'hue', 'est', 'niv', 'esp', 'fila', 'prof'];
    for (let i = order.indexOf(key) + 1; i < order.length; i += 1) st[order[i]] = '';
}

function derived() {
    const sub = byId(options.subWarehouses, st.sub);
    const physical = !!sub && sub.kind === 'physical';
    const entries = physical ? sub.locations : [];
    // Las zonas son las del Layout del centro elegido (una copia vieja de las opciones, sin zonesByCenter, trae solo "zones").
    const centerZones = options.zonesByCenter ? (options.zonesByCenter[st.centro] || []) : (options.zones || []);
    const zones = centerZones.filter((z) => entries.some((e) => e.zoneId === z.id));
    const zone = byId(zones, st.zona);
    const entry = zone ? entries.find((e) => e.zoneId === zone.id) : null;
    // Zona > Huella > Activo: se ofrecen las huellas que tienen algún activo de ese sub almacén y los activos de la huella elegida. Una copia vieja de las opciones (sin huellas, guardada en el celular antes de este
    // cambio) se sigue usando como antes, Zona > Activo, hasta que haya señal y se bajen las nuevas.
    const allowed = zone ? zone.spaces.filter((s) => !entry.spaceIds.length || entry.spaceIds.includes(s.id)) : [];
    const legacy = !!zone && !Array.isArray(zone.footprints);
    const footprints = zone && !legacy ? zone.footprints.filter((f) => allowed.some((s) => s.footprintId === f.id)) : [];
    const footprint = byId(footprints, st.hue);
    const racks = legacy ? allowed : (footprint ? allowed.filter((s) => s.footprintId === footprint.id) : []);
    return { sub, physical, zones, zone, legacy, footprints, footprint, racks, rack: byId(racks, st.est) };
}
// Un espacio es anaquel + nivel + columna + fila + profundidad (sin fila o sin profundidad cuenta como la 1).
function bayInfo(rack, level, column) {
    const b = ((rack && rack.bays) || []).find((x) => x.n === Number(level) && x.c === Number(column)) || {};
    return { rows: b.rows || 1, depth: b.depth || 1 };
}
function occupiedBy(spaceId, level, slot, row, depth) {
    const hit = options.occupied.find((o) => o.spaceId === spaceId && o.level === level && o.slot === slot && (o.row || 1) === (row || 1) && (o.depth || 1) === (depth || 1) && !(editing && o.id === editing.id));
    return hit ? hit.sku : '';
}
function selectField(id, labelKey, helpKey) {
    return `<div class="relapp-field"><label for="${id}">${esc(t(labelKey))}</label><select id="${id}" class="relapp-input" data-help-key="${helpKey}"></select></div>`;
}
function fillSelect(id, items, placeholder, current, disabled) {
    const sel = document.getElementById(id);
    sel.innerHTML = `<option value="">${esc(placeholder)}</option>${items.map((i) => `<option value="${esc(i.value)}"${String(i.value) === String(current) ? ' selected' : ''}>${esc(i.label)}</option>`).join('')}`;
    sel.disabled = disabled !== undefined ? disabled : !items.length;
}

function renderForm() {
    titleEl.textContent = t(editing ? 'main.relDialogEdit' : 'main.relDialogNew');
    bodyEl.innerHTML = `
        <div class="relapp-field">
            <label for="rel-code">${esc(t('main.relCode'))}</label>
            <div class="relapp-code">
                <input type="search" id="rel-code" class="relapp-input" autocomplete="off" placeholder="${esc(t('main.relSearchPlaceholder'))}" data-help-key="relCodeSearch">
                ${barcodeDetectionSupported() ? `<button type="button" id="rel-scan" class="relapp-scan" aria-label="${esc(t('home.relappScan'))}" title="${esc(t('home.relappScan'))}"><i class="bx bx-barcode-reader" aria-hidden="true"></i></button>` : ''}
            </div>
            <div id="rel-results" class="relapp-results" hidden></div>
            <div id="rel-art" class="relapp-art"></div>
        </div>
        ${selectField('rel-clas', 'main.colRelClasificacion', 'relClass')}
        ${selectField('rel-centro', 'main.colRelCentroCostos', 'relCostCenter')}
        ${selectField('rel-alm', 'main.colRelAlmacen', 'relWarehouse')}
        ${selectField('rel-sub', 'main.colRelSubAlmacen', 'relSubWarehouse')}
        ${selectField('rel-zona', 'main.colRelZona', 'relZone')}
        ${selectField('rel-hue', 'main.colRelHuella', 'relFootprint')}
        ${selectField('rel-est', 'main.colRelEstante', 'relRack')}
        <div class="relapp-four">${selectField('rel-niv', 'main.colRelNivel', 'relLevel')}${selectField('rel-esp', 'main.colRelEspacio', 'relSlot')}${selectField('rel-fila', 'main.colRelFila', 'relRow')}${selectField('rel-prof', 'main.colRelProfundidad', 'relDepth')}</div>
        <div class="relapp-rack"><div class="relapp-rack-head"><b id="rel-rack-title"></b><span id="rel-rack-sub"></span></div><div class="relapp-frame" id="rel-frame"></div></div>
        <div class="relapp-field"><label>${esc(t('main.relPath'))}</label><div class="relapp-path" id="rel-path" data-help-key="relPath"></div></div>
        <p class="relapp-msg" id="rel-msg"></p>
        <button type="button" class="home-carga-new-btn" id="rel-save" data-help-key="relSave"><i class="bx bx-save" aria-hidden="true"></i><span>${esc(t('main.relSave'))}</span></button>
        ${editing ? `<button type="button" class="home-carga-secondary-btn" id="rel-delete"><i class="bx bx-trash" aria-hidden="true"></i><span>${esc(t('home.relappDelete'))}</span></button>` : ''}`;
    document.getElementById('rel-code').value = st.sku ? `${st.sku.sku} · ${st.sku.description || st.sku.upc}` : '';
    const bind = (id, key, numeric) => document.getElementById(id).addEventListener('change', (event) => {
        const v = event.target.value;
        st[key] = numeric && v !== '' ? Number(v) : v;
        cutBelow(key);
        refreshForm();
    });
    bind('rel-centro', 'centro', true); bind('rel-alm', 'alm', true); bind('rel-sub', 'sub', true);
    // Al elegir la zona o la huella, lo que solo tiene una opción (la única huella de la zona, el único activo de la huella) se elige solo: en el caso normal huella y activo son lo mismo.
    const autoPick = () => {
        let d = derived();
        if (d.zone && !d.legacy && !st.hue && d.footprints.length === 1) { st.hue = d.footprints[0].id; d = derived(); }
        if (d.footprint && !st.est && d.racks.length === 1) st.est = d.racks[0].id;
    };
    document.getElementById('rel-zona').addEventListener('change', (event) => { st.zona = event.target.value; cutBelow('zona'); autoPick(); refreshForm(); });
    document.getElementById('rel-hue').addEventListener('change', (event) => { st.hue = event.target.value; cutBelow('hue'); autoPick(); refreshForm(); });
    bind('rel-est', 'est'); bind('rel-niv', 'niv', true); bind('rel-esp', 'esp', true); bind('rel-fila', 'fila', true); bind('rel-prof', 'prof', true);
    document.getElementById('rel-clas').addEventListener('change', (event) => { st.clas = event.target.value; });
    document.getElementById('rel-code').addEventListener('input', () => { st.sku = null; searchCodes(); refreshForm(true); });
    document.getElementById('rel-results').addEventListener('click', (event) => {
        const pick = event.target.closest('[data-id]');
        if (pick) chooseSku(byId(skus, pick.dataset.id));
    });
    document.getElementById('rel-frame').addEventListener('click', (event) => {
        const cell = event.target.closest('.relapp-cell[data-n]');
        if (cell) {
            st.niv = Number(cell.dataset.n);
            st.esp = Number(cell.dataset.e);
            const rack = derived().rack;
            const bay = rack ? bayInfo(rack, st.niv, st.esp) : { rows: 1, depth: 1 };
            let free = null;
            for (let r = 1; r <= bay.rows && !free; r += 1) for (let dd = 1; dd <= bay.depth && !free; dd += 1) if (!occupiedBy(rack.id, st.niv, st.esp, r, dd)) free = { r, dd };
            st.fila = bay.rows > 1 && free ? free.r : '';
            st.prof = bay.depth > 1 && free ? free.dd : '';
            refreshForm();
        }
    });
    document.getElementById('rel-save').addEventListener('click', save);
    const scan = document.getElementById('rel-scan');
    if (scan) scan.addEventListener('click', openBarcodeScanner);
    const del = document.getElementById('rel-delete');
    if (del) del.addEventListener('click', removeRelation);
    refreshForm();
}

function chooseSku(s) {
    if (!s) return;
    st.sku = s;
    document.getElementById('rel-code').value = `${s.sku} · ${s.description || s.upc}`;
    document.getElementById('rel-results').hidden = true;
    refreshForm();
}
function searchCodes() {
    const q = document.getElementById('rel-code').value.trim().toLowerCase();
    const box = document.getElementById('rel-results');
    if (!q) { box.hidden = true; return; }
    const found = skus.filter((s) => [s.sku, s.upc, s.description].join(' ').toLowerCase().includes(q)).slice(0, 20);
    box.innerHTML = found.length
        ? found.map((s) => `<button type="button" class="relapp-result" data-id="${s.id}"><b>${esc(s.sku)}</b> ${esc(s.description)} <span>${esc(s.upc)}</span></button>`).join('')
        : `<span class="relapp-muted">${esc(t('main.relNoMatches'))}</span>`;
    box.hidden = false;
}

function refreshForm(keepInput) {
    const keepWh = editing ? editing.warehouseId : null;
    const keepSub = editing ? editing.subWarehouseId : null;
    document.getElementById('rel-art').innerHTML = st.sku
        ? `<b>${esc(st.sku.sku)} · ${esc(st.sku.description)}</b><span>${esc(st.sku.upc ? `UPC ${st.sku.upc}` : '')}</span>`
        : `<span>${esc(t('main.relPickCode'))}</span>`;
    document.getElementById('rel-clas').innerHTML = ['activo', 'cuarentena', 'aclaracion', 'consigna'].map((k) => `<option value="${k}"${st.clas === k ? ' selected' : ''}>${esc(t(`main.relClass_${k}`))}</option>`).join('');
    fillSelect('rel-centro', centerChoices().map((c) => ({ value: c.id, label: c.name })), t('main.relChooseCost'), st.centro, false);
    const whs = options.warehouses.filter((w) => w.parentId === st.centro && (w.status === 'active' || w.id === keepWh));
    fillSelect('rel-alm', whs.map((w) => ({ value: w.id, label: w.name })), st.centro ? t('main.relChooseWarehouse') : t('main.relFirstCost'), st.alm, !st.centro || !whs.length);
    const subs = options.subWarehouses.filter((s) => s.parentId === st.alm && (s.status === 'active' || s.id === keepSub));
    fillSelect('rel-sub', subs.map((s) => ({ value: s.id, label: s.name })), st.alm ? t('main.relChooseSub') : t('main.relFirstWarehouse'), st.sub, !st.alm || !subs.length);
    const d = derived();
    const zonePlaceholder = !st.sub ? t('main.relFirstSub') : (d.sub && d.sub.kind === 'virtual' ? t('main.relSubVirtual') : (d.physical && !d.zones.length ? t('main.relNoZonesForSub') : (d.physical ? t('main.relChooseZone') : t('main.relSubNoKind'))));
    fillSelect('rel-zona', d.zones.map((z) => ({ value: z.id, label: z.name })), zonePlaceholder, st.zona, !d.zones.length);
    fillSelect('rel-hue', d.footprints.map((f) => ({ value: f.id, label: f.code })), d.zone ? t('main.relChooseFootprint') : t('main.relFirstZone'), st.hue, !d.footprints.length);
    document.getElementById('rel-hue').closest('.relapp-field').hidden = d.legacy;
    fillSelect('rel-est', d.racks.map((r) => ({ value: r.id, label: r.code })), (d.footprint || d.legacy) ? t('main.relChooseRack') : t('main.relFirstFootprint'), st.est, !d.racks.length);
    fillSelect('rel-niv', d.rack ? range(d.rack.levels).map((n) => ({ value: n, label: n })) : [], d.rack ? t('main.relLevelShort') : '—', st.niv, !d.rack);
    fillSelect('rel-esp', d.rack && st.niv ? range(d.rack.slots).map((n) => ({ value: n, label: n })) : [], d.rack ? t('main.relSlotShort') : '—', st.esp, !(d.rack && st.niv));
    const hasBay = !!(d.rack && st.niv && st.esp);
    const bay = hasBay ? bayInfo(d.rack, st.niv, st.esp) : { rows: 1, depth: 1 };
    const slotFree = (r, dd) => !occupiedBy(d.rack.id, Number(st.niv), Number(st.esp), r, dd);
    const freeRows = hasBay && bay.rows > 1 ? range(bay.rows).filter((r) => range(bay.depth).some((dd) => slotFree(r, dd))) : [];
    const freeDepths = hasBay && bay.depth > 1 ? range(bay.depth).filter((dd) => range(bay.rows).some((r) => (!st.fila || r === Number(st.fila)) && slotFree(r, dd))) : [];
    fillSelect('rel-fila', freeRows.map((n) => ({ value: n, label: n })), bay.rows > 1 ? t('main.relRowShort') : '—', st.fila, !freeRows.length);
    fillSelect('rel-prof', freeDepths.map((n) => ({ value: n, label: n })), bay.depth > 1 ? t('main.relDepthShort') : '—', st.prof, !freeDepths.length);
    drawRack(d.rack);
    drawPath(d);
    const ready = !!(st.sku && st.centro && st.alm);
    document.getElementById('rel-save').disabled = !ready;
    const missing = [];
    if (!st.sku) missing.push(t('main.relMissingCode'));
    if (!st.centro) missing.push(t('main.relMissingCost')); else if (!st.alm) missing.push(t('main.relMissingWarehouse'));
    const located = (d.sub && d.sub.kind === 'virtual') || (st.est && st.niv && st.esp && (st.fila || bay.rows <= 1) && (st.prof || bay.depth <= 1));
    document.getElementById('rel-msg').textContent = ready ? t(located ? 'main.relReady' : 'main.relReadyPartial') : t('main.relMissing', { x: missing.join(' / ') });
}

function drawRack(rack) {
    const frame = document.getElementById('rel-frame');
    const title = document.getElementById('rel-rack-title');
    const sub = document.getElementById('rel-rack-sub');
    if (!rack) {
        title.textContent = t('main.colRelEstante');
        sub.textContent = t('main.relRackPick');
        frame.innerHTML = `<div class="relapp-muted relapp-frame-empty">${esc(t('main.relRackEmpty'))}</div>`;
        return;
    }
    title.textContent = t('main.relRackTitle', { code: rack.code });
    sub.textContent = t('main.relRackSub', { levels: rack.levels, slots: rack.slots });
    let html = '';
    for (let n = rack.levels; n >= 1; n -= 1) {
        html += `<div class="relapp-lv" style="--cols:${rack.slots}"><span class="relapp-ln">${n}</span>`;
        for (let e = 1; e <= rack.slots; e += 1) {
            const bay = bayInfo(rack, n, e);
            const occs = [];
            for (let r = 1; r <= bay.rows; r += 1) for (let dd = 1; dd <= bay.depth; dd += 1) occs.push(occupiedBy(rack.id, n, e, r, dd));
            const occ = occs.every(Boolean) ? occs[0] : '';
            const sel = Number(st.niv) === n && Number(st.esp) === e;
            html += occ
                ? `<button type="button" class="relapp-cell occ" disabled>${esc(occ.slice(-3))}</button>`
                : `<button type="button" class="relapp-cell${sel ? ' sel' : ''}" data-n="${n}" data-e="${e}">${e}</button>`;
        }
        html += '</div>';
    }
    frame.innerHTML = html;
}
function drawPath(d) {
    const parts = [
        [t('main.colRelCentroCostos'), (byId(options.costCenters, st.centro) || {}).name], [t('main.colRelAlmacen'), (byId(options.warehouses, st.alm) || {}).name],
        [t('main.colRelSubAlmacen'), d.sub && d.sub.name], [t('main.colRelZona'), d.zone && d.zone.name], [t('main.colRelHuella'), d.footprint && d.footprint.code], [t('main.colRelEstante'), d.rack && d.rack.code],
        [t('main.colRelNivel'), st.niv ? t('main.relLevelN', { n: st.niv }) : ''], [t('main.colRelEspacio'), st.esp ? t('main.relSlotN', { n: st.esp }) : ''],
        [t('main.colRelFila'), st.fila ? t('main.relRowN', { n: st.fila }) : ''],
        [t('main.colRelProfundidad'), st.prof ? t('main.relDepthN', { n: st.prof }) : ''],
    ];
    document.getElementById('rel-path').innerHTML = parts.map(([label, value], i) => `${i ? '<span class="relapp-arrow">›</span>' : ''}<span class="relapp-step${value ? ' on' : ''}">${esc(value || label)}</span>`).join('');
}

// --- Guardar (con cola sin señal) -------------------------------------------------------------------------------------------------------
async function save() {
    const values = {
        skuItemId: st.sku ? st.sku.id : null, costCenterId: st.centro || null, warehouseId: st.alm || null, subWarehouseId: st.sub || null,
        zoneId: st.zona || '', spaceId: st.est || '', level: st.niv || null, slot: st.esp || null, row: st.fila || null, depth: st.prof || null, classification: st.clas || 'activo',
    };
    const isEdit = !!(editing && editing.id && !editing.local);
    let method = 'POST';
    let url = API;
    let body = values;
    let baseline = null;
    if (isEdit) {
        const before = { skuItemId: editing.skuItemId, costCenterId: editing.costCenterId, warehouseId: editing.warehouseId, subWarehouseId: editing.subWarehouseId, zoneId: editing.zoneId || '', spaceId: editing.spaceId || '', level: editing.level, slot: editing.slot, row: editing.row, depth: editing.depth, classification: editing.classification || 'activo' };
        body = {};
        baseline = {};
        Object.keys(values).forEach((key) => { if (String(values[key] ?? '') !== String(before[key] ?? '')) { body[key] = values[key]; baseline[key] = before[key]; } });
        if (!Object.keys(body).length) { view = 'list'; render(); return; }
        method = 'PATCH';
        url = `${API}/${editing.id}`;
    }
    const description = `${t('menu.opCentroDistRelacionCodigo')} · ${st.sku.sku}`;
    const recordKey = isEdit ? `${TABLE_KEY}:${editing.id}` : `${TABLE_KEY}:new:${Date.now()}`;
    document.getElementById('rel-save').disabled = true;
    try {
        const result = await sync().offlineAwareFetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) }, description, recordKey, baseline, { rejectable: true });
        if (result.queued) {
            // Se guardó en el celular: se ve ya como si estuviera, con su nube, y el espacio queda tomado mientras llega la señal.
            const d = derived();
            const lbay = d.rack && st.niv && st.esp ? bayInfo(d.rack, st.niv, st.esp) : { rows: 1, depth: 1 };
            const local = {
                id: isEdit ? editing.id : null, local: true, skuItemId: st.sku.id, sku: st.sku.sku, upc: st.sku.upc, description: st.sku.description,
                costCenterId: st.centro || null, centroCostos: (byId(options.costCenters, st.centro) || {}).name || '', warehouseId: st.alm || null, warehouseName: (byId(options.warehouses, st.alm) || {}).name || '',
                subWarehouseId: st.sub || null, subWarehouseName: d.sub ? d.sub.name : '', zoneId: st.zona || '', zoneName: d.zone ? d.zone.name : '', spaceId: st.est || '', spaceCode: d.rack ? d.rack.code : '', footprintId: d.footprint ? d.footprint.id : '', footprintCode: d.footprint ? d.footprint.code : '', locator: '',
                level: st.niv || null, slot: st.esp || null, row: st.fila || null, depth: st.prof || null, classification: st.clas || 'activo', status: ((d.sub && d.sub.kind === 'virtual') || (st.est && st.niv && st.esp && (st.fila || lbay.rows <= 1) && (st.prof || lbay.depth <= 1))) ? 'located' : 'partial',
            };
            relations = isEdit ? relations.map((r) => (r.id === editing.id ? { ...r, ...local } : r)) : [local, ...relations];
            if (local.spaceId && local.level && local.slot) options.occupied.push({ id: local.id || 0, spaceId: local.spaceId, level: local.level, slot: local.slot, row: local.row || 1, depth: local.depth || 1, sku: local.sku });
            await refreshPending();
            showToast(t('home.cargaSavedOffline'));
            view = 'list';
            render();
            return;
        }
        if (!result.ok) {
            showToast(result.body.message || t('admin.saveError'));
            document.getElementById('rel-save').disabled = false;
            return;
        }
        if (result.body.rejectedFields?.length) showToast(`${t('main.fieldLocked')}: ${result.body.rejectedFields.map((fk) => t(fk)).join(', ')}`);
        else if (result.body.pendingFields?.length) showToast(`${t('main.changePending')}: ${result.body.pendingFields.map((fk) => t(fk)).join(', ')}`);
        else showToast(t('main.relSaved'));
        await loadAll();
        view = 'list';
        render();
    } catch (err) {
        console.error('Relación Código (App): no se pudo guardar', err);
        showToast(t('admin.saveError'));
        document.getElementById('rel-save').disabled = false;
    }
}

async function removeRelation() {
    if (!editing || !editing.id || editing.local) return;
    if (!window.confirm(t('home.relappDeleteConfirm'))) return;
    const result = await sync().offlineAwareFetch(`${API}/${editing.id}`, { method: 'DELETE', credentials: 'include' }, `${t('menu.opCentroDistRelacionCodigo')} · ${editing.sku} · ${t('admin.delete')}`, `${TABLE_KEY}:${editing.id}`, null, { rejectable: true });
    if (!result.queued && !result.ok) { showToast(result.body.message || t('admin.saveError')); return; }
    relations = relations.filter((r) => r.id !== editing.id);
    if (result.queued) { await refreshPending(); showToast(t('home.cargaSavedOffline')); }
    view = 'list';
    render();
}

// --- Escáner de código de barras (la cámara del celular) -----------------------------------------------------------------------------------
function barcodeDetectionSupported() {
    return 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
}
// Un UPC-A de 12 números y su EAN-13 con un cero adelante son el mismo código; el SKU se compara sin ceros.
const stripZeros = (v) => String(v || '').replace(/^0+/, '');
function findSkuByScan(value) {
    const raw = String(value || '').trim();
    return skus.find((s) => s.upc === raw) || skus.find((s) => s.upc && stripZeros(s.upc) === stripZeros(raw)) || skus.find((s) => s.sku === raw || stripZeros(s.sku) === stripZeros(raw));
}
async function openBarcodeScanner() {
    const overlay = document.createElement('div');
    overlay.className = 'scan-overlay';
    overlay.innerHTML = `
        <div class="scan-topbar">
            <button type="button" class="scan-close" aria-label="${esc(t('admin.cancel'))}"><i class="bx bx-x" aria-hidden="true"></i></button>
            <span class="scan-title">${esc(t('home.articuloScanTitle'))}</span>
            <span style="width:2.2rem"></span>
        </div>
        <div class="scan-camera">
            <video autoplay playsinline muted></video>
            <div class="scan-frame"><span class="scan-corner tl"></span><span class="scan-corner tr"></span><span class="scan-corner bl"></span><span class="scan-corner br"></span></div>
            <p class="scan-hint">${esc(t('home.articuloScanHint'))}</p>
        </div>
        <div class="scan-bottombar"><button type="button" class="scan-manual">${esc(t('home.articuloScanManual'))}</button></div>`;
    document.body.appendChild(overlay);
    const video = overlay.querySelector('video');
    let stream = null;
    let rafId = null;
    let stopped = false;
    function stopAndClose() {
        stopped = true;
        if (rafId) cancelAnimationFrame(rafId);
        if (stream) stream.getTracks().forEach((track) => track.stop());
        overlay.remove();
    }
    overlay.querySelector('.scan-close').addEventListener('click', stopAndClose);
    overlay.querySelector('.scan-manual').addEventListener('click', stopAndClose);
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        video.srcObject = stream;
        await video.play();
    } catch (err) {
        console.error('Barcode scanner: camera access failed', err);
        showToast(t('home.articuloScanCameraError'));
        stopAndClose();
        return;
    }
    const detector = new window.BarcodeDetector({ formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39'] });
    async function tick() {
        if (stopped) return;
        try {
            const codes = await detector.detect(video);
            if (codes.length) {
                const value = codes[0].rawValue;
                stopAndClose();
                const found = findSkuByScan(value);
                if (found) chooseSku(found); else showToast(t('home.relappNotFound', { code: value }));
                return;
            }
        } catch (err) {
            console.error('Barcode scanner: detect failed', err);
        }
        rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') { window.location.href = 'AppInicio.html'; return; }
    view = 'list';
    editing = null;
    render();
});

(async function init() {
    await loadLanguage();
    window.HelpMode?.init(t);
    try {
        const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' });
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        if (await window.AppSiteGate.blocked()) { window.AppSiteGate.show(bodyEl, t); return; }
        await Promise.all([loadAll(), loadBrandingForTheme()]);
        applyStyle(getStoredStyle());
        await refreshPending();
        render();
    } catch (err) {
        console.error('Relación Código (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
