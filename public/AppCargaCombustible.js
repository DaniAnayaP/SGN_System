// ---------------------------------------------------------------------------
// Carga Combustible (App) — a practical, one-field-at-a-time form instead of
// Sistema Web's table (see OpTransVolCargaCombustible.js for the desktop
// version of this same data, same /api/business/fuel-loading-records
// backend). Two screens: the list of active (not-yet-closed) cargas + "+
// Nueva Carga", and the field-by-field form for whichever carga is open.
//
// A carga only becomes a REAL, resumable record once its 6 identifying
// fields (Fecha/Sitio/Operador/Coordinador/Económico Unidad/Centro de
// Costos) are all known — same as Sistema Web's own "+ Nuevo Registro",
// which requires all of them in one POST. Until then it's just a draft held
// in memory on this device; going back before finishing it discards it,
// nothing was ever created server-side. Once created, Identificación is
// read-only (Sistema Web never lets you PATCH those either) and the 6
// Operación fields (Trip antes/después + their photo evidence, Costo Total
// + its ticket evidence) get filled progressively via PATCH, each locked
// until its own Regla de Orden de Llenado gate (if any) is filled — same
// enforcement model as the desktop table's own 🔗 icon
// (applyFieldFillRules), just read directly here instead of through a
// <table> cell.
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

// Same shape as AppInicio.js's own showToast (icon, message, close X, timed
// progress bar) — duplicated rather than shared, same convention every
// other App page this session follows (plain <script> tags, no modules).
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

// --- Estilo (theme) — same mechanism as AppInicio.js, applied here too so
// switching styles there is reflected consistently across every App page. --
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
        const res = await fetch('/api/business/branding', { credentials: 'include' });
        if (!res.ok) return;
        const { branding } = await res.json();
        clientColorPalette = branding.colorPalette || null;
        clientPrimaryColor = branding.primaryColor || null;
        if (getStoredStyle() === 'institutional') applyInstitutionalTheme();
    } catch {
        // Falls back to the static per-theme CSS already applied.
    }
}

// --- Field catalog -----------------------------------------------------
const FIELDS = [
    { id: 'date', group: 'ident', apiKey: 'date', labelKey: 'main.colCargaFechaRegistro', hintKey: 'home.cargaHintFecha', type: 'date', icon: 'bx-calendar', colId: 'colCargaFechaRegistro' },
    { id: 'loadSite', group: 'ident', apiKey: 'loadSite', labelKey: 'main.colCargaSitio', hintKey: 'home.cargaHintSitio', type: 'text', icon: 'bx-pin', colId: 'colCargaSitio' },
    { id: 'operator', group: 'ident', apiKey: 'operator', labelKey: 'main.colCargaOperador', hintKey: 'home.cargaHintOperador', type: 'text', icon: 'bx-user', colId: 'colCargaOperador', autoFill: true },
    { id: 'coordinator', group: 'ident', apiKey: 'coordinator', labelKey: 'main.colCargaCoordinador', hintKey: 'home.cargaHintCoordinador', type: 'text', icon: 'bx-user-check', colId: 'colCargaCoordinador' },
    { id: 'ecoUnit', group: 'ident', apiKey: 'ecoUnit', labelKey: 'main.colCargaEcoUnidad', hintKey: 'home.cargaHintEcoUnidad', type: 'text', icon: 'bx-id-card', colId: 'colCargaEcoUnidad' },
    { id: 'centroCostos', group: 'ident', apiKey: null, labelKey: 'main.colSysCentroCostos', hintKey: 'home.cargaHintCentroCostos', type: 'costCenter', icon: 'bx-purchase-tag-alt', colId: null },
    { id: 'tripBefore', group: 'op', apiKey: 'tripBefore', labelKey: 'main.colCargaTripAntes', hintKey: 'home.cargaHintTripAntes', type: 'number', icon: 'bx-tachometer', colId: 'colCargaTripAntes' },
    { id: 'tripBeforeEvidence', group: 'op', apiKey: 'tripBeforeEvidence', labelKey: 'main.colCargaTripAntesEvidencia', hintKey: 'home.cargaHintFoto', type: 'photo', icon: 'bx-camera', colId: 'colCargaTripAntesEvidencia' },
    { id: 'tripAfter', group: 'op', apiKey: 'tripAfter', labelKey: 'main.colCargaTripDespues', hintKey: 'home.cargaHintTripDespues', type: 'number', icon: 'bx-tachometer', colId: 'colCargaTripDespues' },
    { id: 'tripAfterEvidence', group: 'op', apiKey: 'tripAfterEvidence', labelKey: 'main.colCargaTripDespuesEvidencia', hintKey: 'home.cargaHintFoto', type: 'photo', icon: 'bx-camera', colId: 'colCargaTripDespuesEvidencia' },
    { id: 'totalCost', group: 'op', apiKey: 'totalCost', labelKey: 'main.colCargaCostoTotal', hintKey: 'home.cargaHintCosto', type: 'number', icon: 'bx-dollar-circle', colId: 'colCargaCostoTotal' },
    { id: 'totalCostEvidence', group: 'op', apiKey: 'totalCostEvidence', labelKey: 'main.colCargaCostoTotalEvidencia', hintKey: 'home.cargaHintTicket', type: 'photo', icon: 'bx-receipt', colId: 'colCargaCostoTotalEvidencia' },
];
const IDENT_FIELDS = FIELDS.filter((f) => f.group === 'ident');
const OP_FIELDS = FIELDS.filter((f) => f.group === 'op');
const GROUPS = [
    { key: 'ident', icon: 'bx-id-card', labelKey: 'home.cargaGroupIdent', fields: IDENT_FIELDS },
    { key: 'op', icon: 'bx-gas-pump', labelKey: 'home.cargaGroupOp', fields: OP_FIELDS },
];

// --- App state -----------------------------------------------------------
let currentUser = null;
let currentNickname = '';
let costCenters = []; // this user's own accessible cost centers
let gateMap = {}; // dependentColId -> gateColId, authorized rules only
let records = []; // real, persisted fuel-loading-records from the server
let draft = null; // { values } — identificación phase, not yet POSTed
let openRecordId = null; // id of the persisted record currently open, or null
let view = 'list'; // 'list' | 'draft' | 'record'

function isFieldFilled(value) {
    return value !== null && value !== undefined && value !== '' && value !== 0;
}

// --- Permission plumbing (mirrors AppInicio.js's own, duplicated since this
// is a separate page/script with no shared module scope) ------------------
let effectiveGrants = [];
let isClientAdmin = false;
function isUnrestrictedClientAdmin() {
    return isClientAdmin && effectiveGrants.length === 0;
}
function hasCostCenterPermission(ccId) {
    if (isUnrestrictedClientAdmin()) return true;
    return effectiveGrants.some((g) => g.sectionId === 'main' && g.itemId === 'cc-list' && g.submenuId === `cc-${ccId}`);
}

async function loadGateMap() {
    try {
        const res = await fetch('/api/business/field-fill-rules?tableKey=carga-combustible', { credentials: 'include' });
        if (!res.ok) return;
        const { rules } = await res.json();
        const map = {};
        (rules || []).filter((r) => r.authorized).forEach((r) => { map[r.dependentCol] = r.gateCol; });
        gateMap = map;
    } catch {
        gateMap = {};
    }
}

function fieldValueForGateCheck(colId) {
    const field = FIELDS.find((f) => f.colId === colId);
    if (!field) return true; // an unknown gate column can never block anything
    if (draft && Object.prototype.hasOwnProperty.call(draft.values, field.id)) return isFieldFilled(draft.values[field.id]);
    const record = records.find((r) => r.id === openRecordId);
    if (record && field.apiKey) return isFieldFilled(record[field.apiKey]);
    return false;
}
function isFieldUnlocked(field) {
    const gateColId = gateMap[field.colId];
    if (!gateColId) return true;
    return fieldValueForGateCheck(gateColId);
}

function isRecordComplete(record) {
    return OP_FIELDS.every((f) => isFieldFilled(record[f.apiKey]));
}
function activeRecords() {
    return records.filter((r) => !isRecordComplete(r));
}
function recordLabel(record) {
    if (record.loadSite && record.ecoUnit) return `${record.loadSite} · ${record.ecoUnit}`;
    if (record.loadSite) return record.loadSite;
    return `${t('home.cargaFallbackLabel')} #${record.recordNumber}`;
}
function recordDoneCount(record) {
    return IDENT_FIELDS.length + OP_FIELDS.filter((f) => isFieldFilled(record[f.apiKey])).length;
}

// --- Data loading ----------------------------------------------------------
async function loadRecords() {
    try {
        const res = await fetch('/api/business/fuel-loading-records', { credentials: 'include' });
        if (!res.ok) return;
        const { records: rows } = await res.json();
        records = rows || [];
    } catch {
        records = [];
    }
}
async function loadCostCenters() {
    try {
        const res = await fetch('/api/business/cost-centers', { credentials: 'include' });
        if (!res.ok) return;
        const { costCenters: rows } = await res.json();
        costCenters = (rows || []).filter((cc) => hasCostCenterPermission(cc.id));
    } catch {
        costCenters = [];
    }
}

// --- Draft (Identificación, pre-creation) ---------------------------------
function freshDraftValues() {
    const values = {};
    IDENT_FIELDS.forEach((f) => { values[f.id] = ''; });
    values.operator = currentNickname ? `${currentUser.name} (${currentNickname})` : (currentUser?.name || '');
    if (costCenters.length === 1) values.centroCostos = String(costCenters[0].id);
    return values;
}
function startDraft() {
    // Centro de Costos is required from creation (Control Interno) — rather
    // than let them into the form and only discover it's stuck on that one
    // field, block right here with the one thing they can actually act on:
    // asking their coordinator to get one assigned.
    if (!costCenters.length) {
        showToast(t('home.cargaNoCostCenter'));
        return;
    }
    draft = { values: freshDraftValues() };
    openRecordId = null;
    view = 'draft';
    render();
}
function draftDoneCount() {
    return IDENT_FIELDS.filter((f) => isFieldFilled(draft.values[f.id])).length;
}
function isDraftComplete() {
    return IDENT_FIELDS.every((f) => isFieldFilled(draft.values[f.id]));
}
async function submitDraft() {
    const cc = costCenters.find((c) => String(c.id) === String(draft.values.centroCostos));
    if (!cc) {
        showToast(t('admin.costCenterRequiredForRecord'));
        return;
    }
    try {
        const res = await fetch('/api/business/fuel-loading-records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                date: draft.values.date,
                loadSite: draft.values.loadSite,
                operator: draft.values.operator,
                coordinator: draft.values.coordinator,
                ecoUnit: draft.values.ecoUnit,
                centroCostos: `${cc.code} - ${cc.name}`,
            }),
        });
        if (!res.ok) throw new Error('save failed');
        const { record } = await res.json();
        records.push(record);
        draft = null;
        openRecordId = record.id;
        view = 'record';
        render();
    } catch {
        showToast(t('admin.saveError'));
    }
}

// --- Record (Operación, post-creation) ------------------------------------
async function patchRecord(id, patch) {
    try {
        const res = await fetch(`/api/business/fuel-loading-records/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
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
        if (idx !== -1) records[idx] = body.record;
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
    titleEl.textContent = t('menu.opTransVolCargaCombustible');
    progressTrack.hidden = true;
    progressLabel.hidden = true;

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'home-carga-new-btn';
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('home.cargaNewButton')}</span>`;
    newBtn.addEventListener('click', startDraft);
    bodyEl.appendChild(newBtn);

    const label = document.createElement('div');
    label.className = 'home-picker-section-label';
    label.textContent = t('home.cargaActiveSection');
    bodyEl.appendChild(label);

    const active = activeRecords();
    if (!active.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('home.cargaActiveEmpty');
        bodyEl.appendChild(empty);
        return;
    }
    active.forEach((record) => {
        const done = recordDoneCount(record);
        const total = FIELDS.length;
        const pct = Math.round((done / total) * 100);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx bx-gas-pump" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${recordLabel(record)}</p><span>${t('home.cargaFieldsCount', { done, total })}</span></span>
            <span class="home-carga-active-row-progress" style="--pct:${pct}"><span>${pct}%</span></span>
        `;
        row.addEventListener('click', () => { openRecordId = record.id; view = 'record'; render(); });
        bodyEl.appendChild(row);
    });
}

function renderFormView() {
    const values = view === 'draft' ? draft.values : records.find((r) => r.id === openRecordId);
    const done = view === 'draft' ? draftDoneCount() : recordDoneCount(values);
    const total = FIELDS.length;
    titleEl.textContent = view === 'draft' ? t('home.cargaNewButton') : recordLabel(values);
    progressTrack.hidden = false;
    progressLabel.hidden = false;
    progressFill.style.width = `${Math.round((done / total) * 100)}%`;
    progressLabel.textContent = t('home.cargaFieldsCount', { done, total });

    GROUPS.forEach((group) => {
        const groupDone = group.fields.filter((f) => fieldIsDone(f)).length;
        const header = document.createElement('div');
        header.className = 'home-carga-group-header';
        header.innerHTML = `<i class="bx ${group.icon}" aria-hidden="true"></i><span class="home-carga-group-label">${t(group.labelKey)}</span><span class="home-carga-group-tag">${groupDone}/${group.fields.length}</span>`;
        bodyEl.appendChild(header);
        group.fields.forEach((field) => bodyEl.appendChild(buildFieldEl(field)));
    });

    if (view === 'draft') {
        if (isDraftComplete()) submitDraft();
        return;
    }

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

function fieldCurrentValue(field) {
    if (view === 'draft') return draft.values[field.id] || '';
    const record = records.find((r) => r.id === openRecordId);
    if (!record) return '';
    // Centro de Costos has no apiKey of its own — the server only ever
    // returns it flattened into colSysCentroCostos (Control Interno), same
    // as every other table; there's no raw cost-center id to recover once
    // the record exists, only the already-formatted "code - name" string.
    if (field.id === 'centroCostos') return record.colSysCentroCostos || '';
    return record[field.apiKey];
}
function fieldIsDone(field) {
    return isFieldFilled(fieldCurrentValue(field));
}
function fieldPreviewText(field) {
    const value = fieldCurrentValue(field);
    if (field.type === 'photo') return t('home.cargaPhotoAttached');
    if (field.type === 'costCenter') {
        const cc = costCenters.find((c) => String(c.id) === String(value));
        return cc ? `${cc.code} - ${cc.name}` : String(value);
    }
    if (field.type === 'date' && value) {
        const d = new Date(`${value}T00:00:00`);
        return d.toLocaleDateString(document.documentElement.lang === 'es' ? 'es-MX' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return String(value);
}

const expandedFieldIds = new Set();

function buildFieldEl(field) {
    const done = fieldIsDone(field);
    // Identificación fields on an already-created record are permanent —
    // Sistema Web never lets you PATCH them either — so they render as
    // plain completed rows with no edit affordance once persisted.
    const editableWhenDone = !(view === 'record' && field.group === 'ident');
    const unlocked = view === 'draft' ? isFieldUnlocked(field) : (editableWhenDone ? isFieldUnlocked(field) : true);
    const expanded = expandedFieldIds.has(field.id);

    const wrap = document.createElement('div');
    wrap.className = `home-carga-field${!unlocked ? ' home-carga-field-locked' : ''}${done ? ' home-carga-field-done' : ''}`;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'home-carga-field-row';
    const autoTag = field.autoFill && done ? `<span class="home-carga-field-auto-tag">${t('home.cargaAutoTag')}</span>` : '';
    const subtitle = done ? fieldPreviewText(field) : (unlocked ? t(field.hintKey) : t('home.cargaLocked'));
    let trailing = '<i class="bx bx-chevron-down home-carga-field-trailing"></i>';
    if (!unlocked) trailing = '<i class="bx bx-lock-alt home-carga-field-trailing"></i>';
    else if (done && !(editableWhenDone)) trailing = '';
    else if (done) trailing = '<i class="bx bx-edit home-carga-field-trailing"></i>';
    else if (expanded) trailing = '<i class="bx bx-chevron-down home-carga-field-trailing icon-up"></i>';
    row.innerHTML = `
        <span class="home-carga-field-icon"><i class="bx ${field.icon}" aria-hidden="true"></i></span>
        <span class="home-carga-field-label"><p>${t(field.labelKey)}${autoTag}</p><span>${subtitle}</span></span>
        ${trailing}
    `;
    const canInteract = unlocked && (editableWhenDone || !done);
    if (canInteract) {
        row.addEventListener('click', () => {
            if (expandedFieldIds.has(field.id)) expandedFieldIds.delete(field.id);
            else expandedFieldIds.add(field.id);
            render();
        });
    } else {
        row.disabled = true;
    }
    wrap.appendChild(row);

    if (canInteract && expanded) {
        wrap.appendChild(buildFieldBody(field));
    }
    return wrap;
}

function commitFieldValue(field, value) {
    if (view === 'draft') {
        draft.values[field.id] = value;
        expandedFieldIds.delete(field.id);
        render();
        return;
    }
    expandedFieldIds.delete(field.id);
    patchRecord(openRecordId, { [field.apiKey]: value });
}

function buildFieldBody(field) {
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
        const hasPhoto = isFieldFilled(fieldCurrentValue(field));
        btn.innerHTML = `<i class="bx bx-camera" aria-hidden="true"></i><span>${hasPhoto ? t('home.cargaChangePhoto') : t('home.cargaTakePhoto')}</span>`;
        btn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => commitFieldValue(field, reader.result);
            reader.readAsDataURL(file);
        });
        row.append(btn, fileInput);
        bodyWrap.appendChild(row);
        return bodyWrap;
    }

    if (field.type === 'costCenter') {
        if (!costCenters.length) {
            const err = document.createElement('p');
            err.className = 'home-carga-field-error show';
            err.textContent = t('admin.costCenterRequiredForRecord');
            bodyWrap.appendChild(err);
            return bodyWrap;
        }
        const select = document.createElement('select');
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = t('main.newRecordCostCenterPlaceholder');
        select.appendChild(placeholder);
        costCenters.forEach((cc) => {
            const opt = document.createElement('option');
            opt.value = String(cc.id);
            opt.textContent = `${cc.code} - ${cc.name}`;
            select.appendChild(opt);
        });
        select.value = fieldCurrentValue(field) || '';
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'home-carga-field-confirm';
        confirmBtn.textContent = t('home.cargaConfirm');
        confirmBtn.addEventListener('click', () => {
            if (!select.value) return;
            commitFieldValue(field, select.value);
        });
        bodyWrap.append(select, confirmBtn);
        return bodyWrap;
    }

    const input = document.createElement('input');
    input.type = field.type;
    input.value = fieldCurrentValue(field) || '';
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
    if (view === 'draft' && draftDoneCount() > 0) {
        if (!window.confirm(t('home.cargaDiscardConfirm'))) return;
    }
    draft = null;
    view = 'list';
    render();
});

(async function init() {
    await loadLanguage();
    try {
        const [meRes, profileRes, businessProfileRes] = await Promise.all([
            fetch('/api/me', { credentials: 'include' }),
            fetch('/api/me/profile', { credentials: 'include' }),
            fetch('/api/me/business-profile', { credentials: 'include' }),
        ]);
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        isClientAdmin = !!user?.isClientAdmin;
        if (profileRes.ok) {
            const { profile } = await profileRes.json();
            currentNickname = profile?.nickname || '';
        }
        if (businessProfileRes.ok) {
            const { profile } = await businessProfileRes.json();
            effectiveGrants = profile?.effectiveGrants || [];
        }
        await Promise.all([loadCostCenters(), loadGateMap(), loadRecords(), loadBrandingForTheme()]);
        applyStyle(getStoredStyle());
        render();
    } catch (err) {
        console.error('Carga Combustible (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
