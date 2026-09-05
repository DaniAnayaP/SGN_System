// ---------------------------------------------------------------------------
// Alta Nuestros Artículos (Sku) (App) — same one-field-at-a-time shell as
// Carga Combustible (see AppCargaCombustible.js for the original of this
// pattern; OpCentroDistAltaArticulos.js is the Web/table version of this
// same data, same /api/business/sku-items backend). Two screens: the list
// of active (not-yet-complete) artículos + "+ Nuevo Artículo", and the
// field-by-field form for whichever artículo is open.
//
// "+ Nuevo Artículo" creates a real, blank record immediately — every one
// of its 24 capturable fields (17 own + 7 "Categoría X" selects sourced from
// the 7 "Nuestras Categorías..." catalogs) is then filled in one at a time
// via PATCH, each going through the exact same column-level permission/
// pending-approval workflow as every other table (checkAndLogFieldChanges).
// Registro Único and SKU are never fields here -- both are server-generated
// at creation (db_id/record_number) and simply displayed once the record
// exists. A record is "complete" (drops off "Artículos en captura") once
// every one of the 24 fields has a value -- confirmed with the client this
// mirrors Carga Combustible exactly: a completed artículo is then only
// consulted in Administración (not built in this pass), never edited here
// again.
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

const TABLE_KEY = 'nuestros-articulos';

// --- Field catalog -----------------------------------------------------
// Every field's apiKey matches a real SKU_ITEM_PATCHABLE_FIELDS key in
// db.js. Registro Único/SKU are NOT here -- both are server-generated,
// shown read-only in the form header area instead (see renderFormView).
const FIELDS = [
    { id: 'upc', group: 'general', apiKey: 'upc', labelKey: 'main.colArticuloUpc', hintKey: 'home.articuloHintUpc', type: 'text', icon: 'bx-barcode', colId: 'colArticuloUpc' },
    { id: 'uniqueDescription', group: 'general', apiKey: 'uniqueDescription', labelKey: 'main.colArticuloDescUnica', hintKey: 'home.articuloHintDescUnica', type: 'text', icon: 'bx-text', colId: 'colArticuloDescUnica' },
    { id: 'knownDescription', group: 'general', apiKey: 'knownDescription', labelKey: 'main.colArticuloDescConocida', hintKey: 'home.articuloHintDescConocida', type: 'text', icon: 'bx-text', colId: 'colArticuloDescConocida' },
    { id: 'customDescription', group: 'general', apiKey: 'customDescription', labelKey: 'main.colArticuloDescPersonalizada', hintKey: 'home.articuloHintDescPersonalizada', type: 'text', icon: 'bx-text', colId: 'colArticuloDescPersonalizada' },
    { id: 'mainUom', group: 'general', apiKey: 'mainUom', labelKey: 'main.colArticuloUdm', hintKey: 'home.articuloHintUdm', type: 'text', icon: 'bx-ruler', colId: 'colArticuloUdm' },
    {
        id: 'articleType', group: 'general', apiKey: 'articleType', labelKey: 'main.colArticuloTipo', hintKey: 'home.articuloHintTipo', type: 'select', icon: 'bx-package', colId: 'colArticuloTipo',
        optionGroups: [{ options: [
            { value: 'articulo-terminado', labelKey: 'main.articleTypeFinished' },
            { value: 'materia-prima', labelKey: 'main.articleTypeRawMaterial' },
        ] }],
    },
    { id: 'height', group: 'dim', apiKey: 'height', labelKey: 'main.colArticuloAlto', hintKey: 'home.articuloHintAlto', type: 'number', icon: 'bx-ruler', colId: 'colArticuloAlto' },
    { id: 'length', group: 'dim', apiKey: 'length', labelKey: 'main.colArticuloLargo', hintKey: 'home.articuloHintLargo', type: 'number', icon: 'bx-ruler', colId: 'colArticuloLargo' },
    { id: 'width', group: 'dim', apiKey: 'width', labelKey: 'main.colArticuloAncho', hintKey: 'home.articuloHintAncho', type: 'number', icon: 'bx-ruler', colId: 'colArticuloAncho' },
    { id: 'articleWeight', group: 'dim', apiKey: 'articleWeight', labelKey: 'main.colArticuloPesoArticulo', hintKey: 'home.articuloHintPesoArticulo', type: 'number', icon: 'bx-dumbbell', colId: 'colArticuloPesoArticulo' },
    { id: 'packageWeight', group: 'dim', apiKey: 'packageWeight', labelKey: 'main.colArticuloPesoEmpaque', hintKey: 'home.articuloHintPesoEmpaque', type: 'number', icon: 'bx-dumbbell', colId: 'colArticuloPesoEmpaque' },
    { id: 'evidenceFront', group: 'evi', apiKey: 'evidenceFront', labelKey: 'main.colArticuloEvidenceFront', hintKey: 'home.articuloHintEvidencia', type: 'photo', icon: 'bx-camera', colId: 'colArticuloEvidenceFront' },
    { id: 'evidenceBack', group: 'evi', apiKey: 'evidenceBack', labelKey: 'main.colArticuloEvidenceBack', hintKey: 'home.articuloHintEvidencia', type: 'photo', icon: 'bx-camera', colId: 'colArticuloEvidenceBack' },
    { id: 'evidenceLeft', group: 'evi', apiKey: 'evidenceLeft', labelKey: 'main.colArticuloEvidenceLeft', hintKey: 'home.articuloHintEvidencia', type: 'photo', icon: 'bx-camera', colId: 'colArticuloEvidenceLeft' },
    { id: 'evidenceRight', group: 'evi', apiKey: 'evidenceRight', labelKey: 'main.colArticuloEvidenceRight', hintKey: 'home.articuloHintEvidencia', type: 'photo', icon: 'bx-camera', colId: 'colArticuloEvidenceRight' },
    { id: 'evidenceTop', group: 'evi', apiKey: 'evidenceTop', labelKey: 'main.colArticuloEvidenceTop', hintKey: 'home.articuloHintEvidencia', type: 'photo', icon: 'bx-camera', colId: 'colArticuloEvidenceTop' },
    { id: 'evidenceBottom', group: 'evi', apiKey: 'evidenceBottom', labelKey: 'main.colArticuloEvidenceBottom', hintKey: 'home.articuloHintEvidencia', type: 'photo', icon: 'bx-camera', colId: 'colArticuloEvidenceBottom' },
    // optionGroups start empty and get filled in by loadCategoryOptions()
    // once the 7 "Nuestras Categorías..." catalogs' Active values are
    // fetched -- see that function for why (options are per-client/dynamic,
    // unlike articleType's fixed list above).
    { id: 'categoryInventario', group: 'categorias', apiKey: 'categoryInventario', labelKey: 'main.colArticuloCategoriaInventario', hintKey: 'home.articuloHintCategoria', type: 'select', icon: 'bx-package', colId: 'colArticuloCategoriaInventario', categoryType: 'inventario', optionGroups: [{ options: [] }] },
    { id: 'categoryCompra', group: 'categorias', apiKey: 'categoryCompra', labelKey: 'main.colArticuloCategoriaCompra', hintKey: 'home.articuloHintCategoria', type: 'select', icon: 'bx-cart-alt', colId: 'colArticuloCategoriaCompra', categoryType: 'compra', optionGroups: [{ options: [] }] },
    { id: 'categoryAlmacenamiento', group: 'categorias', apiKey: 'categoryAlmacenamiento', labelKey: 'main.colArticuloCategoriaAlmacenamiento', hintKey: 'home.articuloHintCategoria', type: 'select', icon: 'bx-buildings', colId: 'colArticuloCategoriaAlmacenamiento', categoryType: 'almacenamiento', optionGroups: [{ options: [] }] },
    { id: 'categoryRotacion', group: 'categorias', apiKey: 'categoryRotacion', labelKey: 'main.colArticuloCategoriaRotacion', hintKey: 'home.articuloHintCategoria', type: 'select', icon: 'bx-refresh', colId: 'colArticuloCategoriaRotacion', categoryType: 'rotacion', optionGroups: [{ options: [] }] },
    { id: 'categoryManejo', group: 'categorias', apiKey: 'categoryManejo', labelKey: 'main.colArticuloCategoriaManejo', hintKey: 'home.articuloHintCategoria', type: 'select', icon: 'bx-move', colId: 'colArticuloCategoriaManejo', categoryType: 'manejo', optionGroups: [{ options: [] }] },
    { id: 'categoryRiesgo', group: 'categorias', apiKey: 'categoryRiesgo', labelKey: 'main.colArticuloCategoriaRiesgo', hintKey: 'home.articuloHintCategoria', type: 'select', icon: 'bx-error', colId: 'colArticuloCategoriaRiesgo', categoryType: 'riesgo', optionGroups: [{ options: [] }] },
    { id: 'categoryVidautil', group: 'categorias', apiKey: 'categoryVidautil', labelKey: 'main.colArticuloCategoriaVidautil', hintKey: 'home.articuloHintCategoria', type: 'select', icon: 'bx-time-five', colId: 'colArticuloCategoriaVidautil', categoryType: 'vidautil', optionGroups: [{ options: [] }] },
];
const GENERAL_FIELDS = FIELDS.filter((f) => f.group === 'general');
const DIM_FIELDS = FIELDS.filter((f) => f.group === 'dim');
const EVI_FIELDS = FIELDS.filter((f) => f.group === 'evi');
const CATEGORIA_FIELDS = FIELDS.filter((f) => f.group === 'categorias');
const GROUPS = [
    { key: 'general', icon: 'bx-id-card', labelKey: 'home.articuloGroupGeneral', fields: GENERAL_FIELDS },
    { key: 'dim', icon: 'bx-ruler', labelKey: 'home.articuloGroupDim', fields: DIM_FIELDS },
    { key: 'evi', icon: 'bx-camera', labelKey: 'home.articuloGroupEvi', fields: EVI_FIELDS },
    { key: 'categorias', icon: 'bx-purchase-tag', labelKey: 'home.articuloGroupCategorias', fields: CATEGORIA_FIELDS },
];

// Options come from each catalog's own Active values (see
// listActiveArticleCategoryNames in db.js), fetched once at load. Computed
// fresh per record (see categoryOptionGroupsFor below) rather than baked
// into FIELDS once -- an artículo that already has a since-deactivated
// value must keep showing it, and which record that applies to isn't known
// until its form is actually open.
let activeCategoryOptions = {};
async function loadCategoryOptions() {
    try {
        const res = await fetch(apiUrl('/api/business/article-categories-active'), { credentials: 'include' });
        if (!res.ok) return;
        const { options } = await res.json();
        activeCategoryOptions = options || {};
    } catch (err) {
        console.error('Alta Nuestros Artículos: failed to load category options', err);
        activeCategoryOptions = {};
    }
}
// A name is shown as both value and label (opt.label, not opt.labelKey) --
// these are free text a client admin typed into a catalog, not a fixed
// translated list like articleType's own optionGroups above.
function categoryOptionGroupsFor(field, record) {
    const active = activeCategoryOptions[field.categoryType] || [];
    const current = fieldValueFromRecord(field, record) || '';
    const names = current && !active.includes(current) ? [current, ...active] : active;
    return [{ options: names.map((name) => ({ value: name, label: name })) }];
}

// --- App state -----------------------------------------------------------
let currentUser = null;
let gateMap = {}; // dependentColId -> gateColId, authorized rules only
let records = []; // real, persisted sku-items from the server
let openRecordId = null; // id of the record currently open, or null
let view = 'list'; // 'list' | 'record'

function isFieldFilled(value) {
    return value !== null && value !== undefined && value !== '' && value !== 0;
}
function fieldValueFromRecord(field, record) {
    if (!record) return '';
    return record[field.apiKey];
}

async function loadGateMap() {
    try {
        const res = await fetch(apiUrl('/api/business/field-fill-rules?tableKey=nuestros-articulos'), { credentials: 'include' });
        if (!res.ok) return;
        const { rules } = await res.json();
        const map = {};
        (rules || []).filter((r) => r.authorized).forEach((r) => { map[r.dependentCol] = r.gateCol; });
        gateMap = map;
    } catch {
        gateMap = {};
    }
}

function fieldValueForGateCheck(colId, record) {
    const field = FIELDS.find((f) => f.colId === colId);
    if (!field) return true;
    return isFieldFilled(fieldValueFromRecord(field, record));
}
function isFieldUnlocked(field, record) {
    const gateColId = gateMap[field.colId];
    if (!gateColId) return true;
    return fieldValueForGateCheck(gateColId, record);
}

// A record is "complete" (drops off "Artículos en captura") once every one
// of the 24 capturable fields has a value. Registro Único/SKU don't count
// -- they're never empty, they're just never fields either.
function isRecordComplete(record) {
    return FIELDS.every((f) => isFieldFilled(fieldValueFromRecord(f, record)));
}
function activeRecords() {
    return records.filter((r) => !isRecordComplete(r));
}
function recordLabel(record) {
    if (record.uniqueDescription) return record.uniqueDescription;
    if (record.sku) return `SKU ${record.sku}`;
    return `${t('home.articuloFallbackLabel')} #${record.recordNumber || record.id}`;
}
function recordDoneCount(record) {
    return FIELDS.filter((f) => isFieldFilled(fieldValueFromRecord(f, record))).length;
}

// --- Data loading ----------------------------------------------------------
async function loadRecords() {
    try {
        const res = await fetch(apiUrl('/api/business/sku-items'), { credentials: 'include' });
        if (!res.ok) return;
        const { skuItems } = await res.json();
        records = skuItems || [];
    } catch {
        records = [];
    }
}

// --- Create + patch ---------------------------------------------------------
async function createNewSkuItem() {
    try {
        const res = await fetch(apiUrl('/api/business/sku-items'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error('create failed');
        const { skuItem } = await res.json();
        records.push(skuItem);
        openRecordId = skuItem.id;
        view = 'record';
        render();
    } catch {
        showToast(t('admin.saveError'));
    }
}

// Records with at least one PATCH sitting in the offline queue right now
// (see AppOfflineSync.js) -- shown as a small cloud badge on the record's
// own list row, same "Fase 1 tracks per RECORD" convention as Carga
// Combustible.
const offlinePendingRecordIds = new Set();
async function refreshOfflinePendingIds() {
    const items = await window.SgnOfflineSync.listOfflineQueue();
    offlinePendingRecordIds.clear();
    items.forEach((item) => { if (item.recordKey) offlinePendingRecordIds.add(item.recordKey); });
    render();
}
document.addEventListener('sgn:offline-queue-changed', refreshOfflinePendingIds);

async function patchRecord(id, patch) {
    const recordKey = `${TABLE_KEY}:${id}`;
    const before = currentRecord() || {};
    const description = `${t('menu.opCentroDistAltaArticulos')} · ${recordLabel(before)}`;
    const baseline = {};
    Object.keys(patch).forEach((key) => { baseline[key] = before[key]; });
    try {
        const result = await window.SgnOfflineSync.offlineAwareFetch(
            `/api/business/sku-items/${id}`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) },
            description, recordKey, baseline,
        );
        if (result.queued) {
            const idx = records.findIndex((r) => r.id === id);
            if (idx !== -1) records[idx] = { ...records[idx], ...patch };
            offlinePendingRecordIds.add(recordKey);
            showToast(t('home.cargaSavedOffline'));
            render();
            return;
        }
        const body = result.body;
        if (!result.ok) {
            showToast(body.message || t('admin.saveError'));
            await loadRecords();
            render();
            return;
        }
        if (body.rejectedFields?.length) {
            showToast(`${t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => t(fk)).join(', ')}`);
        } else if (body.pendingFields?.length) {
            showToast(`${t('main.changePending')}: ${body.pendingFields.map((fk) => t(fk)).join(', ')}`);
        }
        const idx = records.findIndex((r) => r.id === id);
        if (idx !== -1) records[idx] = body.skuItem;
        render();
    } catch {
        showToast(t('admin.saveError'));
    }
}

// --- Rendering -------------------------------------------------------------
const progressTrack = document.getElementById('carga-progress-track');
const progressFill = document.getElementById('carga-progress-fill');
const progressLabel = document.getElementById('carga-progress-label');
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');

function render() {
    bodyEl.innerHTML = '';
    if (view === 'list') renderListView();
    else renderFormView();
}

function renderListView() {
    titleEl.textContent = t('menu.opCentroDistAltaArticulos');
    progressTrack.hidden = true;
    progressLabel.hidden = true;

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'home-carga-new-btn';
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('home.articuloNewButton')}</span>`;
    newBtn.addEventListener('click', createNewSkuItem);
    bodyEl.appendChild(newBtn);

    const label = document.createElement('div');
    label.className = 'home-picker-section-label';
    label.textContent = t('home.articuloActiveSection');
    bodyEl.appendChild(label);

    const active = activeRecords();
    if (!active.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('home.articuloActiveEmpty');
        bodyEl.appendChild(empty);
        return;
    }
    active.forEach((record) => {
        const done = recordDoneCount(record);
        const total = FIELDS.length;
        const pct = Math.round((done / total) * 100);
        const isOfflinePending = offlinePendingRecordIds.has(`${TABLE_KEY}:${record.id}`);
        const offlineBadge = isOfflinePending
            ? `<span class="home-carga-offline-badge" title="${t('home.cargaSavedOffline')}"><i class="bx bx-cloud-upload" aria-hidden="true"></i></span>`
            : '';
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx bx-package" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${recordLabel(record)}</p><span>${t('home.cargaFieldsCount', { done, total })}</span></span>
            ${offlineBadge}
            <span class="home-carga-active-row-progress" style="--pct:${pct}"><span>${pct}%</span></span>
        `;
        row.addEventListener('click', () => { openRecordId = record.id; view = 'record'; render(); });
        bodyEl.appendChild(row);
    });
}

function currentRecord() {
    return records.find((r) => r.id === openRecordId);
}

function renderFormView() {
    const record = currentRecord();
    const done = recordDoneCount(record);
    const total = FIELDS.length;
    titleEl.textContent = recordLabel(record);
    progressTrack.hidden = false;
    progressLabel.hidden = false;
    progressFill.style.width = `${Math.round((done / total) * 100)}%`;
    progressLabel.textContent = t('home.cargaFieldsCount', { done, total });

    GROUPS.forEach((group) => {
        const groupDone = group.fields.filter((f) => isFieldFilled(fieldValueFromRecord(f, record))).length;
        const header = document.createElement('div');
        header.className = 'home-carga-group-header';
        header.innerHTML = `<i class="bx ${group.icon}" aria-hidden="true"></i><span class="home-carga-group-label">${t(group.labelKey)}</span><span class="home-carga-group-tag">${groupDone}/${group.fields.length}</span>`;
        bodyEl.appendChild(header);
        group.fields.forEach((field) => bodyEl.appendChild(buildFieldEl(field, record)));
    });

    const allDone = done === total;
    const doneCard = document.createElement('div');
    doneCard.className = `home-carga-done-card${allDone ? ' show' : ''}`;
    doneCard.innerHTML = `<i class="bx bx-check-circle" aria-hidden="true"></i><p>${t('home.cargaAllDone')}</p><button type="button" id="carga-save-btn">${t('home.cargaSaveBtn')}</button>`;
    bodyEl.appendChild(doneCard);
    if (allDone) {
        doneCard.querySelector('#carga-save-btn').addEventListener('click', () => {
            view = 'list';
            render();
        });
    }
}

function fieldPreviewText(field, record) {
    const value = fieldValueFromRecord(field, record);
    if (field.type === 'photo') return t('home.cargaPhotoAttached');
    if (field.type === 'select') {
        const groups = field.categoryType ? categoryOptionGroupsFor(field, record) : field.optionGroups;
        for (const grp of groups) {
            const opt = grp.options.find((o) => o.value === value);
            if (opt) return opt.labelKey ? t(opt.labelKey) : opt.label;
        }
    }
    return String(value);
}

const expandedFieldIds = new Set();
const SHEET_FIELD_TYPES = ['select'];

function openSheetForField(field, record) {
    const currentValue = fieldValueFromRecord(field, record) || '';
    const optionGroups = field.categoryType ? categoryOptionGroupsFor(field, record) : field.optionGroups;
    openSelectSheet(t(field.labelKey), optionGroups, currentValue, (value) => commitFieldValue(field, value));
}

function buildFieldEl(field, record) {
    const done = isFieldFilled(fieldValueFromRecord(field, record));
    const unlocked = isFieldUnlocked(field, record);
    const expanded = expandedFieldIds.has(field.id);

    const wrap = document.createElement('div');
    wrap.className = `home-carga-field${!unlocked ? ' home-carga-field-locked' : ''}${done ? ' home-carga-field-done' : ''}`;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'home-carga-field-row';
    const subtitle = done ? fieldPreviewText(field, record) : (unlocked ? t(field.hintKey) : t('home.cargaLocked'));
    let trailing = '<i class="bx bx-chevron-down home-carga-field-trailing"></i>';
    if (!unlocked) trailing = '<i class="bx bx-lock-alt home-carga-field-trailing"></i>';
    else if (done) trailing = '<i class="bx bx-edit home-carga-field-trailing"></i>';
    else if (expanded) trailing = '<i class="bx bx-chevron-down home-carga-field-trailing icon-up"></i>';
    row.innerHTML = `
        <span class="home-carga-field-icon"><i class="bx ${field.icon}" aria-hidden="true"></i></span>
        <span class="home-carga-field-label"><p>${t(field.labelKey)}</p><span>${subtitle}</span></span>
        ${trailing}
    `;
    const opensSheet = SHEET_FIELD_TYPES.includes(field.type);
    if (unlocked) {
        row.addEventListener('click', () => {
            if (opensSheet) { openSheetForField(field, record); return; }
            if (expandedFieldIds.has(field.id)) expandedFieldIds.delete(field.id);
            else expandedFieldIds.add(field.id);
            render();
        });
    } else {
        row.disabled = true;
    }
    wrap.appendChild(row);

    if (unlocked && expanded && !opensSheet) {
        wrap.appendChild(buildFieldBody(field, record));
    }
    return wrap;
}

function commitFieldValue(field, value) {
    expandedFieldIds.delete(field.id);
    patchRecord(openRecordId, { [field.apiKey]: value });
}

// Bottom sheet for a 'select' field's options -- appended straight to
// <body>, escapes .home-carga-field's own overflow:hidden. Tapping an
// option, or the dimmed scrim around the sheet, closes it.
function openSelectSheet(titleText, optionGroups, currentValue, onPick) {
    const scrim = document.createElement('div');
    scrim.className = 'home-select-scrim';
    const sheet = document.createElement('div');
    sheet.className = 'home-select-sheet';
    sheet.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-sheet-handle' }));
    const title = document.createElement('div');
    title.className = 'home-select-sheet-title';
    title.textContent = titleText;
    sheet.appendChild(title);
    optionGroups.forEach((grp, i) => {
        if (i > 0) sheet.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-divider' }));
        if (grp.labelKey) {
            const label = document.createElement('div');
            label.className = 'home-select-group-label';
            label.textContent = t(grp.labelKey);
            sheet.appendChild(label);
        }
        grp.options.forEach((opt) => {
            const isActive = opt.value === currentValue;
            const text = opt.labelKey ? t(opt.labelKey) : (opt.label || '');
            const optBtn = document.createElement('button');
            optBtn.type = 'button';
            optBtn.className = `home-select-option${grp.labelKey ? ' indent' : ''}${isActive ? ' active' : ''}`;
            optBtn.innerHTML = `<span>${text}</span>${isActive ? '<i class="bx bx-check" aria-hidden="true"></i>' : ''}`;
            optBtn.addEventListener('click', () => {
                scrim.remove();
                onPick(opt.value);
            });
            sheet.appendChild(optBtn);
        });
    });
    scrim.addEventListener('click', (event) => { if (event.target === scrim) scrim.remove(); });
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
}

function buildFieldBody(field, record) {
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'home-carga-field-body';

    if (field.type === 'photo') {
        const row = document.createElement('div');
        row.className = 'home-carga-photo-row';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'home-carga-photo-btn';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.hidden = true;
        const hasPhoto = isFieldFilled(fieldValueFromRecord(field, record));
        function renderPhotoBtn(busy) {
            const icon = busy ? 'bx-loader-alt bx-spin' : 'bx-camera';
            const label = hasPhoto ? t('home.cargaChangePhoto') : t('home.cargaTakePhoto');
            btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i><span>${label}</span>`;
        }
        renderPhotoBtn(false);
        btn.addEventListener('click', () => fileInput.click());
        // Compressed client-side, then uploaded straight to R2 via a
        // presigned URL -- never stored as base64 in SQLite. If that can't
        // complete right now, the already-compressed photo is queued in
        // this device's own IndexedDB and uploads on its own once
        // connectivity returns, same as every other App evidence field.
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            const recordId = record.id;
            const recordKey = `${TABLE_KEY}:${recordId}`;
            const description = `${t('menu.opCentroDistAltaArticulos')} · ${recordLabel(record)}`;
            btn.disabled = true;
            renderPhotoBtn(true);
            try {
                const blob = await window.SgnOfflineSync.compressImageToBlob(file);
                const contentType = blob.type || file.type || 'application/octet-stream';
                try {
                    const key = await window.SgnOfflineSync.uploadEvidenceNow(
                        { tableKey: TABLE_KEY, recordId, fieldKey: field.apiKey }, blob, contentType,
                    );
                    commitFieldValue(field, key);
                } catch {
                    await window.SgnOfflineSync.queueOfflineEvidence({
                        tableKey: TABLE_KEY, recordId, fieldKey: field.apiKey, blob, contentType,
                        patchUrl: `/api/business/sku-items/${recordId}`,
                        description, recordKey,
                    });
                    const idx = records.findIndex((r) => r.id === recordId);
                    if (idx !== -1) records[idx] = { ...records[idx], [field.apiKey]: 'pending-upload' };
                    offlinePendingRecordIds.add(recordKey);
                    showToast(t('home.cargaSavedOffline'));
                    render();
                }
            } finally {
                btn.disabled = false;
            }
        });
        row.append(btn, fileInput);
        bodyWrap.appendChild(row);
        return bodyWrap;
    }

    const input = document.createElement('input');
    input.type = field.type;
    input.value = fieldValueFromRecord(field, record) || '';
    input.placeholder = t(field.hintKey);
    const error = document.createElement('p');
    error.className = 'home-carga-field-error';
    error.textContent = t('login.fieldRequired');
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'home-carga-field-confirm';
    confirmBtn.textContent = t('home.cargaConfirm');
    confirmBtn.addEventListener('click', () => {
        if (!String(input.value).trim()) {
            error.classList.add('show');
            return;
        }
        commitFieldValue(field, field.type === 'number' ? parseFloat(input.value) || 0 : input.value.trim());
    });
    bodyWrap.append(input, error, confirmBtn);
    return bodyWrap;
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') {
        window.location.href = 'AppInicio.html';
        return;
    }
    // Nothing is ever held only in memory -- every confirmed field is
    // already saved, so leaving mid-way loses nothing and needs no
    // discard prompt.
    view = 'list';
    render();
});

(async function init() {
    await loadLanguage();
    try {
        const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' });
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        await Promise.all([loadGateMap(), loadRecords(), loadBrandingForTheme(), loadCategoryOptions()]);
        applyStyle(getStoredStyle());
        await refreshOfflinePendingIds();
    } catch (err) {
        console.error('Alta Nuestros Artículos (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
