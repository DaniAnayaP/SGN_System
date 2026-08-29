// ---------------------------------------------------------------------------
// Tipos de Unidad (App) — same one-field-at-a-time architecture as Carga
// Combustible (see AppCargaCombustible.js's own header note for the full
// reasoning), trimmed down to this catalog's own 3 fillable fields (Código
// is auto-generated, never user-entered). Unlike Carga Combustible, every
// created Tipo de Unidad always stays in the list — a catalog entry never
// "graduates out" the way a finished operational record does, so there's no
// active/complete split here, just one flat list, tap any row to edit.
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

// --- Estilo (theme) — same mechanism as every other App page. --------------
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
// apiKey matches a real UNIT_TYPE_PATCHABLE_FIELDS key in db.js. fuelType
// mirrors the exact grouped options approved for Carga Combustible/Registro
// Combustible's own Tipo Combustible (Gasolina > Magna/Premium, Diésel).
const FIELDS = [
    { id: 'name', apiKey: 'name', labelKey: 'main.colUnitTypeName', hintKey: 'home.unitTypeHintName', type: 'text', icon: 'bx-car' },
    {
        id: 'fuelType', apiKey: 'fuelType', labelKey: 'main.colFuelType', hintKey: 'home.unitTypeHintFuel', type: 'select', icon: 'bx-gas-pump',
        optionGroups: [
            { labelKey: 'main.fuelTypeGasolineGroup', options: [{ value: 'magna', labelKey: 'main.fuelTypeMagna' }, { value: 'premium', labelKey: 'main.fuelTypePremium' }] },
            { options: [{ value: 'diesel', labelKey: 'main.fuelTypeDiesel' }] },
        ],
    },
    {
        id: 'status', apiKey: 'status', labelKey: 'main.colUnitTypeStatus', hintKey: 'home.unitTypeHintStatus', type: 'select', icon: 'bx-toggle-left',
        optionGroups: [{ options: [{ value: 'active', labelKey: 'admin.statusActivo' }, { value: 'inactive', labelKey: 'admin.statusInactivo' }] }],
    },
];

// --- App state -----------------------------------------------------------
let currentUser = null;
let isClientAdmin = false;
let effectiveGrants = [];
let records = [];
let openRecordId = null;
let view = 'list'; // 'list' | 'record'
// A record only actually gets created on the server once its FIRST field is
// confirmed (see commitFieldValue) — "+ Nuevo Tipo de Unidad" just opens this
// in-memory draft (no id/code yet), so tapping it and backing out without
// typing anything never leaves a blank type behind. Never appears in
// `records`/the list until it's real.
let draftRecord = null;
function blankDraftRecord() {
    return { id: null, code: '', name: '', fuelType: '', status: '', pendingFields: [] };
}

function isFieldFilled(value) {
    return value !== null && value !== undefined && value !== '';
}
function fieldValueFromRecord(field, record) {
    return record ? record[field.apiKey] : '';
}
function isUnrestrictedClientAdmin() {
    return isClientAdmin && effectiveGrants.length === 0;
}
function recordDoneCount(record) {
    return FIELDS.filter((f) => isFieldFilled(fieldValueFromRecord(f, record))).length;
}
function recordLabel(record) {
    if (record.name) return record.name;
    if (!record.id) return t('home.newUnitTypeButton');
    return `${t('home.unitTypeFallbackLabel')} ${record.code}`;
}

// --- Data loading ------------------------------------------------------
async function loadRecords() {
    try {
        const res = await fetch('/api/business/unit-types', { credentials: 'include' });
        if (!res.ok) return;
        const { unitTypes } = await res.json();
        records = unitTypes || [];
    } catch {
        records = [];
    }
}

// --- Create + patch ------------------------------------------------------
function createNewUnitType() {
    draftRecord = blankDraftRecord();
    openRecordId = null;
    view = 'record';
    render();
}

async function patchRecord(id, patch) {
    try {
        const res = await fetch(`/api/business/unit-types/${id}`, {
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
        if (idx !== -1) records[idx] = body.unitType;
        render();
    } catch {
        showToast(t('admin.saveError'));
    }
}

async function deleteRecord(id) {
    try {
        const res = await fetch(`/api/business/unit-types/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        records = records.filter((r) => r.id !== id);
        view = 'list';
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
    titleEl.textContent = t('menu.catTransVolTiposUnidades');
    progressTrack.hidden = true;
    progressLabel.hidden = true;

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'home-carga-new-btn';
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('home.newUnitTypeButton')}</span>`;
    newBtn.addEventListener('click', createNewUnitType);
    bodyEl.appendChild(newBtn);

    if (!records.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('home.unitTypeListEmpty');
        bodyEl.appendChild(empty);
        return;
    }
    records.forEach((record) => {
        const done = recordDoneCount(record);
        const total = FIELDS.length;
        const pct = Math.round((done / total) * 100);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx bx-car" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${recordLabel(record)}</p><span>${t('home.cargaFieldsCount', { done, total })}</span></span>
            <span class="home-carga-active-row-progress" style="--pct:${pct}"><span>${pct}%</span></span>
        `;
        row.addEventListener('click', () => { openRecordId = record.id; view = 'record'; render(); });
        bodyEl.appendChild(row);
    });
}

function currentRecord() {
    if (draftRecord) return draftRecord;
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

    const codeRow = document.createElement('p');
    codeRow.className = 'home-carga-progress-label';
    codeRow.hidden = false;
    codeRow.style.margin = '0 0 0.6rem';
    codeRow.textContent = `${t('main.colUnitTypeCode')}: ${record.code || '—'}`;
    bodyEl.appendChild(codeRow);

    FIELDS.forEach((field) => bodyEl.appendChild(buildFieldEl(field, record)));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'home-carga-photo-btn';
    deleteBtn.style.marginTop = '0.8rem';
    deleteBtn.innerHTML = `<i class="bx bx-trash" aria-hidden="true"></i><span>${t('admin.delete')}</span>`;
    deleteBtn.addEventListener('click', () => {
        // A draft was never persisted -- nothing to confirm, just discard it.
        if (!record.id) { draftRecord = null; view = 'list'; render(); return; }
        if (window.confirm(t('main.recordDeleteConfirm'))) deleteRecord(record.id);
    });
    bodyEl.appendChild(deleteBtn);
}

function fieldPreviewText(field, record) {
    const value = fieldValueFromRecord(field, record);
    if (field.type === 'select') {
        for (const grp of field.optionGroups) {
            const opt = grp.options.find((o) => o.value === value);
            if (opt) return t(opt.labelKey);
        }
    }
    return String(value);
}

const expandedFieldIds = new Set();

function buildFieldEl(field, record) {
    const done = isFieldFilled(fieldValueFromRecord(field, record));
    const expanded = expandedFieldIds.has(field.id);

    const wrap = document.createElement('div');
    wrap.className = `home-carga-field${done ? ' home-carga-field-done' : ''}`;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'home-carga-field-row';
    const subtitle = done ? fieldPreviewText(field, record) : t(field.hintKey);
    let trailing = '<i class="bx bx-chevron-down home-carga-field-trailing"></i>';
    if (done) trailing = '<i class="bx bx-edit home-carga-field-trailing"></i>';
    else if (expanded) trailing = '<i class="bx bx-chevron-down home-carga-field-trailing icon-up"></i>';
    row.innerHTML = `
        <span class="home-carga-field-icon"><i class="bx ${field.icon}" aria-hidden="true"></i></span>
        <span class="home-carga-field-label"><p>${t(field.labelKey)}</p><span>${subtitle}</span></span>
        ${trailing}
    `;
    row.addEventListener('click', () => {
        if (expandedFieldIds.has(field.id)) expandedFieldIds.delete(field.id);
        else expandedFieldIds.add(field.id);
        render();
    });
    wrap.appendChild(row);

    if (expanded) wrap.appendChild(buildFieldBody(field, record));
    return wrap;
}

// The FIRST confirm on a draft is what actually creates the record --
// creates it for real (assigns its Código), then immediately applies this
// same field, same as if it had always existed. Every confirm after that is
// a normal patch.
async function commitFieldValue(field, value) {
    expandedFieldIds.delete(field.id);
    if (draftRecord) {
        try {
            const res = await fetch('/api/business/unit-types', { method: 'POST', credentials: 'include' });
            if (!res.ok) throw new Error('create failed');
            const { unitType } = await res.json();
            records.push(unitType);
            openRecordId = unitType.id;
            draftRecord = null;
            await patchRecord(unitType.id, { [field.apiKey]: value });
        } catch {
            showToast(t('admin.saveError'));
            draftRecord = null;
            view = 'list';
            render();
        }
        return;
    }
    patchRecord(openRecordId, { [field.apiKey]: value });
}

function buildFieldBody(field, record) {
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'home-carga-field-body';

    if (field.type === 'select') {
        const currentValue = fieldValueFromRecord(field, record) || '';
        const selectedOpt = field.optionGroups.flatMap((g) => g.options).find((o) => o.value === currentValue);

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'home-select-trigger';
        trigger.setAttribute('aria-expanded', 'false');
        const valueSpan = document.createElement('span');
        valueSpan.className = `home-select-trigger-value${selectedOpt ? '' : ' placeholder'}`;
        valueSpan.textContent = selectedOpt ? t(selectedOpt.labelKey) : t('main.fuelTypeSelect');
        trigger.innerHTML = `
            <span class="home-select-trigger-text">
                <span class="home-select-trigger-label">${t(field.labelKey)}</span>
            </span>
            <i class="bx bx-chevron-down" aria-hidden="true"></i>
        `;
        trigger.querySelector('.home-select-trigger-text').appendChild(valueSpan);

        const options = document.createElement('div');
        options.className = 'home-select-options';
        options.hidden = true;
        field.optionGroups.forEach((grp, i) => {
            if (i > 0) options.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-divider' }));
            if (grp.labelKey) {
                const label = document.createElement('div');
                label.className = 'home-select-group-label';
                label.textContent = t(grp.labelKey);
                options.appendChild(label);
            }
            grp.options.forEach((opt) => {
                const isActive = opt.value === currentValue;
                const optBtn = document.createElement('button');
                optBtn.type = 'button';
                optBtn.className = `home-select-option${grp.labelKey ? ' indent' : ''}${isActive ? ' active' : ''}`;
                optBtn.innerHTML = `<span>${t(opt.labelKey)}</span>${isActive ? '<i class="bx bx-check" aria-hidden="true"></i>' : ''}`;
                optBtn.addEventListener('click', () => {
                    options.hidden = true;
                    commitFieldValue(field, opt.value);
                });
                options.appendChild(optBtn);
            });
        });
        trigger.addEventListener('click', () => {
            options.hidden = !options.hidden;
            trigger.setAttribute('aria-expanded', String(!options.hidden));
        });
        bodyWrap.append(trigger, options);
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
        commitFieldValue(field, input.value.trim());
    });
    bodyWrap.append(input, error, confirmBtn);
    return bodyWrap;
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') {
        window.location.href = 'AppInicio.html';
        return;
    }
    // Backing out of a still-blank draft discards it -- nothing was ever
    // persisted, so there's nothing to keep.
    draftRecord = null;
    view = 'list';
    render();
});

(async function init() {
    await loadLanguage();
    try {
        const [meRes, businessProfileRes] = await Promise.all([
            fetch('/api/me', { credentials: 'include' }),
            fetch('/api/me/business-profile', { credentials: 'include' }),
        ]);
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        isClientAdmin = !!user?.isClientAdmin;
        if (businessProfileRes.ok) {
            const { profile } = await businessProfileRes.json();
            effectiveGrants = profile?.effectiveGrants || [];
        }
        await Promise.all([loadRecords(), loadBrandingForTheme()]);
        applyStyle(getStoredStyle());
        render();
    } catch (err) {
        console.error('Tipos de Unidad (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
