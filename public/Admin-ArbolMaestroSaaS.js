// ---------------------------------------------------------------------------
// "Árbol Maestro SaaS" -- GEIPSA-wide readiness status (Habilitado/
// Inhabilitado/Construcción/Mejoras + Web/App) for the SaaS team's OWN
// internal screens, at FULL DEPTH (Grupo -> Pantalla -> Apartado/Tabla/
// Modal -> Columna/Acción) -- same structure and visual language as Árbol
// de Permisos Maestro (PermissionTree.js statusMode), driven by
// SaasAdminCatalog.js instead of data/menu.json. Reuses the same DB tables
// (saas_master_status/saas_master_order) this screen already had as a flat
// 3-row list -- now keyed by many more leaf ids, never touches
// master_permission_status/master_permission_order.
//
// Deliberately its own small renderer, not PermissionTree.js itself -- that
// file's statusMode is tightly coupled to data/menu.json's own fetch/shape
// (business-sector filtering, cost centers, App-tab eligibility calls) that
// don't apply to this internal catalog, and duplicating just the render
// logic here keeps zero risk of regressing the real Árbol Maestro/Puesto/
// Usuario/Giro trees, which never pass anything related to this file.
//
// No $ Web / $ App cost columns here (unlike the client tree) -- pricing
// doesn't apply to GEIPSA's own internal tooling, only to what clients pay
// for. Every other column (Estatus, Web/App checkboxes, aplicar-a-anidados,
// count badge, drag-reorder, Navegar, dashed nest guides) matches the
// client tree, down to Columna/Acción level -- confirmed with the user this
// needed to go deeper than Árbol de Permisos Maestro's own reorder scope.
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
    { value: 'habilitado', labelKey: 'admin.masterTreeStatusHabilitado' },
    { value: 'inhabilitado', labelKey: 'admin.masterTreeStatusInhabilitado' },
    { value: 'construccion', labelKey: 'admin.masterTreeStatusConstruccion' },
    { value: 'mejoras', labelKey: 'admin.masterTreeStatusMejoras' },
];

const DEVICE_PATHS = {
    web: '<rect x="2" y="4" width="20" height="13" rx="1.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="17" x2="12" y2="20"/>',
    app: '<rect x="6" y="2" width="12" height="20" rx="2.5"/>',
};
const DEVICE_MARKS = {
    full: { web: '<path d="M6 10l3 3 6-6"/>', app: '<path d="M9 12.5l2 2 4-5"/>' },
    partial: { web: '<line x1="7" y1="10.5" x2="15" y2="10.5"/>', app: '<line x1="8" y1="12" x2="16" y2="12"/>' },
    empty: { web: '', app: '' },
};
function deviceIconSvg(platform, mark) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DEVICE_PATHS[platform]}${mark || ''}</svg>`;
}

const CATALOG = window.SAAS_ADMIN_CATALOG;
const CI_LABEL = window.SAAS_ADMIN_CONTROL_INTERNO_LABEL;

// General's own real children -- Inicio/Tablero, the top-bar items outside
// both category tabs (see Panel Admin's own bottom nav in AppAdminInicio.js
// and Dashboard.js's buildSidebarData, which gives the admin/GEIPSA sidebar
// this exact pair -- [home, dashboard, customerServiceItem, saasConfigItem],
// no 'panel' for this role). Reuses menu.home/menu.dashboard's real labels
// (same Spanish/English text, "Inicio"/"Tablero") since these are the same
// navigation concepts, just tracked here under their own saas_master_status
// ids instead of master_permission_status. Leaf-level only (no apartados),
// same GENERAL_ITEM_IDS treatment PermissionTree.js gives them: never
// draggable, no toggle/children of their own. 'saas-home' has no real
// distinct page to jump to (menu.json itself gives 'home' href '#'), so it
// gets no Navegar button rather than a dead one.
const GENERAL_ITEMS = [
    { itemId: 'saas-home', labelKey: 'menu.home', href: null },
    { itemId: 'saas-board', labelKey: 'menu.dashboard', href: 'Inicio-en.html' },
];

// Clasificación + color + Cambios -- same system PermissionTree.js's
// statusMode has for the client tree, duplicated here (not shared/
// imported) on purpose: this file is deliberately its own standalone
// renderer (see the header comment above) specifically so nothing here
// can ever regress the real Árbol Maestro/Puesto/Usuario/Giro trees, and
// sharing the color-dialog code would mean touching that already-tuned
// file. Own id namespace ("saas-class-*") and own DB tables
// (saas_classification_overrides/saas_classification_colors/
// saas_master_change_log, see db.js) -- a color or reclassification
// picked here can never affect (or be affected by) the client tree's own
// classifications.
const SAAS_CLASS_CONTROL_INTERNO_ID = 'saas-class-control-interno';
const SAAS_CLASS_POR_DEFINIR_ID = 'saas-class-por-definir';
const CREATE_CLASSIFICATION_VALUE = '__create-classification__';
const CLASSIFICATION_COLOR_FAMILIES = [
    { id: 'purple', shades: ['#EEEDFE', '#CECBF6', '#AFA9EC', '#7F77DD', '#534AB7', '#3C3489'] },
    { id: 'teal', shades: ['#E1F5EE', '#9FE1CB', '#5DCAA5', '#1D9E75', '#0F6E56', '#085041'] },
    { id: 'coral', shades: ['#FAECE7', '#F5C4B3', '#F0997B', '#D85A30', '#993C1D', '#712B13'] },
    { id: 'pink', shades: ['#FBEAF0', '#F4C0D1', '#ED93B1', '#D4537E', '#993556', '#72243E'] },
    { id: 'blue', shades: ['#E6F1FB', '#B5D4F4', '#85B7EB', '#378ADD', '#185FA5', '#0C447C'] },
    { id: 'green', shades: ['#EAF3DE', '#C0DD97', '#97C459', '#639922', '#3B6D11', '#27500A'] },
    { id: 'amber', shades: ['#FAEEDA', '#FAC775', '#EF9F27', '#BA7517', '#854F0B', '#633806'] },
    { id: 'gray', shades: ['#F1EFE8', '#D3D1C7', '#B4B2A9', '#888780', '#5F5E5A', '#444441'] },
];
const CLASSIFICATION_COLOR_PALETTE = ['#3A4BC9', '#1E7E34', '#9A6B00', '#B3261E', '#0E7C86', '#6C4BA6'];
// Read-only structural badges for Grupo/Pantalla/Apartado rows -- same
// "a blank Clasificación cell reads as broken" reasoning as the client
// tree's own LEVEL_BADGES.
const SAAS_LEVEL_BADGES = {
    grupo: { labelKey: 'admin.masterTreeLevelGrupo', color: '#6C4BA6' },
    pantalla: { labelKey: 'main.colSysPantalla', color: '#3A4BC9' },
    apartado: { labelKey: 'admin.masterTreeLevelApartado', color: '#9A6B00' },
};

function apartadoKey(screen, apartado) {
    return `${screen.itemId}::${apartado.id}`;
}
// Every column/acción/Control-Interno leaf gets a small stable suffix
// ('c0','c1',...,'ci','a0',...) instead of a hand-typed unique string --
// this suffix is what's actually stored in saas_master_status, so it must
// never change once real statuses exist in production even if the leaf's
// DISPLAY position later moves via drag-reorder (see leavesByApartado --
// reordering only changes a separate order list, never these keys).
function buildLeaves(apartado) {
    const leaves = [];
    (apartado.columnas || []).forEach((label, idx) => leaves.push({ suffix: `c${idx}`, label, kind: 'col' }));
    if (apartado.controlInterno) leaves.push({ suffix: 'ci', label: CI_LABEL, kind: 'ci' });
    (apartado.acciones || []).forEach((label, idx) => leaves.push({ suffix: `a${idx}`, label, kind: 'action' }));
    return leaves;
}
function leafKey(screen, apartado, leaf) {
    return `${apartadoKey(screen, apartado)}::${leaf.suffix}`;
}

function collectLeafKeysForScreens(screens) {
    const keys = [];
    for (const screen of screens) {
        for (const apartado of screen.apartados) {
            buildLeaves(apartado).forEach((leaf) => keys.push(leafKey(screen, apartado, leaf)));
        }
    }
    return keys;
}
function collectLeafKeysForApartado(screen, apartado) {
    return buildLeaves(apartado).map((leaf) => leafKey(screen, apartado, leaf));
}

const listEl = document.getElementById('saas-master-status-list');
const saveBtn = document.getElementById('saas-master-status-save');
const errorEl = document.getElementById('saas-master-status-error');

let statuses = [];
// Clasificación + color state -- populated in load(), same shape as
// PermissionTree.js's own classificationOverrides/classificationColors/
// classificationTextColors, just fetched from this screen's own
// saas-classification-* endpoints (see the id-namespace comment above).
let classificationOverrides = new Map(); // nodeKey -> {classificationId, classificationLabel}
let classificationColors = new Map(); // classificationId -> hex
let classificationTextColors = new Map(); // classificationId -> hex
const recentColors = [];
const recentTextColors = [];
// order: { groups, screensByGroup: {groupId:[itemId]}, apartadosByScreen:
// {itemId:[apartadoId]}, leavesByApartado: {"screenId::apartadoId":[suffix]} }
let order = { groups: CATALOG.map((g) => g.groupId), screensByGroup: {}, apartadosByScreen: {}, leavesByApartado: {} };
CATALOG.forEach((g) => { order.screensByGroup[g.groupId] = g.screens.map((s) => s.itemId); });
let draggedId = null;
// Only apartado/screen/group collapse state lives here -- "General" is a
// permanent, non-collapsible summary card (see renderList), same
// relationship it always had to the real rows in this screen's original
// 3-row version, just now sitting above 2 groups instead of 3 screens.
// Persisted to localStorage (this browser only, never sent to the server
// -- it's not real data, just where you left the tree) -- confirmed live
// that without this, collapsing everything and then reloading (e.g. right
// after Guardar, to double check the save landed) silently threw all of
// it back open, since this Set previously lived in memory only.
const COLLAPSED_STORAGE_KEY = 'saasMasterTreeCollapsed';
let collapsed;
try {
    collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) || '[]'));
} catch {
    collapsed = new Set();
}
function persistCollapsed() {
    try { localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed])); } catch { /* private/blocked storage -- collapse state just won't survive a reload */ }
}

function getState(key) {
    return statuses.find((s) => s.itemId === key) || { itemId: key, status: 'habilitado', webEnabled: true, appEnabled: false };
}
function setState(key, next) {
    statuses = statuses.filter((s) => s.itemId !== key);
    statuses.push({ itemId: key, ...next });
}

function computeRollup(keys, platform) {
    if (!keys.length) return 'empty';
    const onCount = keys.filter((k) => (platform === 'web' ? getState(k).webEnabled : getState(k).appEnabled)).length;
    if (onCount === 0) return 'empty';
    if (onCount === keys.length) return 'full';
    return 'partial';
}

function reorderList(list, fromId, toId) {
    const next = list.filter((id) => id !== fromId);
    next.splice(next.indexOf(toId), 0, fromId);
    return next;
}
function orderedGroups() {
    return order.groups.map((id) => CATALOG.find((g) => g.groupId === id)).filter(Boolean);
}
function orderedScreens(group) {
    const saved = (order.screensByGroup[group.groupId] || []).filter((id) => group.screens.some((s) => s.itemId === id));
    const rest = group.screens.map((s) => s.itemId).filter((id) => !saved.includes(id));
    return [...saved, ...rest].map((id) => group.screens.find((s) => s.itemId === id));
}
function orderedApartados(screen) {
    const allIds = screen.apartados.map((a) => a.id);
    const saved = (order.apartadosByScreen[screen.itemId] || []).filter((id) => allIds.includes(id));
    const rest = allIds.filter((id) => !saved.includes(id));
    return [...saved, ...rest].map((id) => screen.apartados.find((a) => a.id === id));
}
function orderedLeaves(screen, apartado) {
    const all = buildLeaves(apartado);
    const aKey = apartadoKey(screen, apartado);
    const allSuffixes = all.map((l) => l.suffix);
    const saved = (order.leavesByApartado[aKey] || []).filter((s) => allSuffixes.includes(s));
    const rest = allSuffixes.filter((s) => !saved.includes(s));
    const bySuffix = new Map(all.map((l) => [l.suffix, l]));
    return [...saved, ...rest].map((s) => bySuffix.get(s));
}

function makeDraggable(el, { list, id, onReorder }) {
    el.classList.add('perm-tree-row-draggable');
    el.draggable = true;
    el.addEventListener('dragstart', (e) => { draggedId = { list, id }; el.classList.add('perm-tree-row-dragging'); e.stopPropagation(); });
    el.addEventListener('dragend', (e) => { draggedId = null; el.classList.remove('perm-tree-row-dragging'); e.stopPropagation(); });
    el.addEventListener('dragover', (e) => {
        if (!draggedId || draggedId.list !== list || draggedId.id === id) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('perm-tree-row-drop-target');
    });
    el.addEventListener('dragleave', (e) => { el.classList.remove('perm-tree-row-drop-target'); e.stopPropagation(); });
    el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('perm-tree-row-drop-target');
        const from = draggedId;
        draggedId = null;
        if (!from || from.list !== list || from.id === id) return;
        onReorder(from.id, id);
        renderList();
    });
}

function toggleBtn(key, expanded) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'perm-tree-toggle';
    btn.setAttribute('aria-expanded', String(expanded));
    btn.innerHTML = '<i class="bx bx-chevron-down" aria-hidden="true"></i>';
    btn.addEventListener('click', () => {
        if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
        persistCollapsed();
        renderList();
    });
    return btn;
}
function spacer() {
    const s = document.createElement('span');
    s.className = 'perm-tree-toggle-spacer';
    return s;
}
function dragHandle() {
    const grip = document.createElement('span');
    grip.className = 'perm-tree-drag-handle';
    grip.setAttribute('aria-hidden', 'true');
    grip.innerHTML = '<i class="bx bx-dots-vertical-rounded"></i><i class="bx bx-dots-vertical-rounded"></i>';
    return grip;
}
function rollupEl(webState, appState) {
    const wrap = document.createElement('span');
    wrap.className = 'perm-tree-mstatus-rollup';
    const webIcon = document.createElement('span');
    webIcon.className = `perm-tree-mstatus-rollup-icon perm-tree-mstatus-rollup-${webState}`;
    webIcon.title = 'Web';
    webIcon.innerHTML = deviceIconSvg('web', DEVICE_MARKS[webState].web);
    const appIcon = document.createElement('span');
    appIcon.className = `perm-tree-mstatus-rollup-icon perm-tree-mstatus-rollup-${appState}`;
    appIcon.title = 'App';
    appIcon.innerHTML = deviceIconSvg('app', DEVICE_MARKS[appState].app);
    wrap.append(webIcon, appIcon);
    return wrap;
}
function countBadge(n) {
    const el = document.createElement('span');
    el.className = 'perm-tree-mstatus-count-badge';
    el.textContent = String(Math.max(1, n));
    return el;
}
function labelEl(text) {
    const el = document.createElement('span');
    el.className = 'perm-tree-mstatus-label';
    el.textContent = text;
    el.title = text;
    return el;
}
function nestBtn(title, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'perm-tree-mstatus-nest-btn';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML = '<i class="bx bx-copy" aria-hidden="true"></i>';
    btn.addEventListener('click', onClick);
    return btn;
}

// A classification's color is stored as a literal "#rrggbb" hex string,
// same convention as the client tree's own classificationColor -- see
// saas_classification_colors' own DDL comment in db.js.
function classificationColor(id) {
    if (!id) return 'var(--color-text-secondary)';
    const chosen = classificationColors.get(id);
    if (chosen) return chosen;
    if (id === SAAS_CLASS_CONTROL_INTERNO_ID) return '#3A4BC9';
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return CLASSIFICATION_COLOR_PALETTE[hash % CLASSIFICATION_COLOR_PALETTE.length];
}
// Independent admin-chosen TEXT color -- null (never a fallback color
// itself) when none was chosen, so every caller falls back to
// classificationColor(id), same as PermissionTree.js's own
// classificationTextColor.
function classificationTextColor(id) {
    if (!id) return null;
    return classificationTextColors.get(id) || null;
}
async function saveSaasClassificationColor(classificationId, hex, kind = 'dot') {
    const isText = kind === 'text';
    try {
        const body = isText ? { classificationId, textColor: hex } : { classificationId, color: hex };
        const res = await fetch('/api/admin/saas-classification-colors', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('save failed');
        const targetMap = isText ? classificationTextColors : classificationColors;
        const recentList = isText ? recentTextColors : recentColors;
        targetMap.set(classificationId, hex);
        const existingIdx = recentList.indexOf(hex);
        if (existingIdx !== -1) recentList.splice(existingIdx, 1);
        recentList.unshift(hex);
        if (recentList.length > 8) recentList.length = 8;
        renderList();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
// Closed by the next click anywhere else (capture-phase) or Escape -- same
// dismiss convention as PermissionTree.js's own openColorPicker.
let openColorPickerCleanup = null;
function closeColorPicker() {
    if (openColorPickerCleanup) { openColorPickerCleanup(); openColorPickerCleanup = null; }
}
// Quick popover (Colores del tema / Colores estándar / Colores recientes +
// "Más colores...") -- verbatim adaptation of PermissionTree.js's own
// openColorPicker, `t(` swapped for `Dashboard.t(` and pointed at this
// screen's own save function.
function openColorPicker(anchorBtn, classificationId, kind = 'dot') {
    closeColorPicker();
    const isText = kind === 'text';
    const colorMap = isText ? classificationTextColors : classificationColors;
    const recentList = isText ? recentTextColors : recentColors;
    const popover = document.createElement('div');
    popover.className = 'perm-tree-color-popover';
    const currentHex = colorMap.get(classificationId);
    const addSection = (labelKey) => {
        const label = document.createElement('div');
        label.className = 'perm-tree-color-section-label';
        label.textContent = Dashboard.t(labelKey);
        popover.appendChild(label);
    };
    const addSwatch = (container, hex, small) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = small ? 'perm-tree-color-swatch perm-tree-color-swatch-sm' : 'perm-tree-color-swatch';
        swatch.style.backgroundColor = hex;
        swatch.setAttribute('aria-label', hex);
        if (currentHex === hex) {
            swatch.classList.add('perm-tree-color-swatch-selected');
            swatch.innerHTML = '<i class="bx bx-check" aria-hidden="true"></i>';
        }
        swatch.addEventListener('click', (event) => {
            event.stopPropagation();
            closeColorPicker();
            saveSaasClassificationColor(classificationId, hex, kind);
        });
        container.appendChild(swatch);
    };
    addSection('admin.masterTreeColorThemeColors');
    const themeGrid = document.createElement('div');
    themeGrid.className = 'perm-tree-color-theme-grid';
    for (let row = 0; row < 6; row += 1) {
        CLASSIFICATION_COLOR_FAMILIES.forEach((family) => addSwatch(themeGrid, family.shades[row], true));
    }
    popover.appendChild(themeGrid);
    addSection('admin.masterTreeColorStandard');
    const standardRow = document.createElement('div');
    standardRow.className = 'perm-tree-color-standard-row';
    CLASSIFICATION_COLOR_FAMILIES.forEach((family) => addSwatch(standardRow, family.shades[3], false));
    popover.appendChild(standardRow);
    if (recentList.length) {
        addSection('admin.masterTreeColorRecent');
        const recentRow = document.createElement('div');
        recentRow.className = 'perm-tree-color-standard-row';
        recentList.forEach((hex) => addSwatch(recentRow, hex, false));
        popover.appendChild(recentRow);
    }
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'perm-tree-color-more-btn';
    moreBtn.textContent = Dashboard.t('admin.masterTreeMoreColors');
    moreBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        closeColorPicker();
        openColorDialog(classificationId, kind);
    });
    popover.appendChild(moreBtn);
    anchorBtn.parentElement.appendChild(popover);
    const onDocClick = () => closeColorPicker();
    const onKey = (event) => { if (event.key === 'Escape') closeColorPicker(); };
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    openColorPickerCleanup = () => {
        popover.remove();
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('keydown', onKey);
    };
}
// Full colorimetry dialog ("Más colores...") -- verbatim adaptation of
// PermissionTree.js's own ensureColorDialog/openColorDialog/hsvToHex/
// hexToRgb/hexToHsv (hexagon mosaic + saturation/value square + hue strip
// + RGB/hex fields + drag support, all of it, unchanged in behavior).
let colorDialogEl = null;
let colorDialogState = null; // { classificationId, pickedHex, kind }
function hsvToHex(h, s, v) {
    const c = v * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = v - c;
    let r = 0; let g = 0; let b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    const toHex = (n) => Math.max(0, Math.min(255, Math.round((n + m) * 255))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function hexToRgb(hex) {
    return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}
function hexToHsv(hex) {
    const { r: r255, g: g255, b: b255 } = hexToRgb(hex);
    const r = r255 / 255; const g = g255 / 255; const b = b255 / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = ((b - r) / d) + 2;
        else h = ((r - g) / d) + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}
function ensureColorDialog() {
    if (colorDialogEl) return;
    colorDialogEl = document.createElement('div');
    colorDialogEl.className = 'modal-overlay';
    colorDialogEl.hidden = true;
    colorDialogEl.innerHTML = `
        <div class="modal-panel perm-tree-color-dialog" role="dialog" aria-modal="true" aria-labelledby="perm-tree-color-dialog-title">
            <h3 id="perm-tree-color-dialog-title">${Dashboard.t('admin.masterTreeChooseColor')}</h3>
            <div class="perm-tree-color-tabs">
                <button type="button" class="perm-tree-color-tab perm-tree-color-tab-active" data-tab="std">${Dashboard.t('admin.masterTreeColorTabStandard')}</button>
                <button type="button" class="perm-tree-color-tab" data-tab="custom">${Dashboard.t('admin.masterTreeColorTabCustom')}</button>
            </div>
            <div class="perm-tree-color-tab-panel" data-panel="std">
                <div class="perm-tree-color-mosaic" data-role="mosaic"></div>
                <div class="perm-tree-color-gray-row" data-role="gray-row"></div>
            </div>
            <div class="perm-tree-color-tab-panel" data-panel="custom" hidden>
                <div class="perm-tree-color-sv-row">
                    <div class="perm-tree-color-sv-wrap">
                        <canvas data-role="sv-canvas" width="220" height="150" class="perm-tree-color-sv-canvas"></canvas>
                        <div class="perm-tree-color-sv-marker" data-role="sv-marker"></div>
                    </div>
                    <div class="perm-tree-color-hue-wrap">
                        <div class="perm-tree-color-hue-strip" data-role="hue-strip"></div>
                        <div class="perm-tree-color-hue-arrow" data-role="hue-arrow"></div>
                    </div>
                </div>
                <div class="perm-tree-color-model-row">
                    <label>${Dashboard.t('admin.masterTreeColorModel')}</label>
                    <select disabled><option>RGB</option></select>
                </div>
                <div class="perm-tree-color-rgb-grid">
                    <label>${Dashboard.t('admin.masterTreeColorRed')}</label>
                    <input type="number" min="0" max="255" data-role="rgb-r" class="perm-tree-color-rgb-input">
                    <label>${Dashboard.t('admin.masterTreeColorGreen')}</label>
                    <input type="number" min="0" max="255" data-role="rgb-g" class="perm-tree-color-rgb-input">
                    <label>${Dashboard.t('admin.masterTreeColorBlue')}</label>
                    <input type="number" min="0" max="255" data-role="rgb-b" class="perm-tree-color-rgb-input">
                    <label>${Dashboard.t('admin.masterTreeColorHex')}</label>
                    <input type="text" data-role="hex-input" class="perm-tree-color-hex-input">
                </div>
            </div>
            <div class="perm-tree-color-dialog-footer">
                <div style="display:flex; gap:0.7rem;">
                    <div class="perm-tree-color-preview-col">
                        <div class="perm-tree-color-preview-label">${Dashboard.t('admin.masterTreeColorNew')}</div>
                        <div class="perm-tree-color-preview-swatch" data-role="preview-main"></div>
                    </div>
                    <div class="perm-tree-color-preview-col">
                        <div class="perm-tree-color-preview-label">${Dashboard.t('admin.masterTreeColorCurrent')}</div>
                        <div class="perm-tree-color-preview-swatch" data-role="preview-current"></div>
                    </div>
                </div>
                <div class="admin-form-actions">
                    <button type="button" class="btn btn-secondary" data-role="cancel">${Dashboard.t('admin.cancel')}</button>
                    <button type="button" class="btn" data-role="accept">${Dashboard.t('admin.confirmAccept')}</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(colorDialogEl);
    const panel = colorDialogEl.querySelector('.perm-tree-color-dialog');
    const tabs = Array.from(colorDialogEl.querySelectorAll('.perm-tree-color-tab'));
    const panels = Array.from(colorDialogEl.querySelectorAll('.perm-tree-color-tab-panel'));
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            tabs.forEach((t2) => t2.classList.toggle('perm-tree-color-tab-active', t2 === tab));
            panels.forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
            if (tab.dataset.tab === 'custom') drawSvCanvas();
        });
    });
    const close = () => { colorDialogEl.hidden = true; colorDialogState = null; };
    colorDialogEl.querySelector('[data-role="cancel"]').addEventListener('click', close);
    colorDialogEl.addEventListener('click', (event) => { if (event.target === colorDialogEl) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !colorDialogEl.hidden) close(); });
    colorDialogEl.querySelector('[data-role="accept"]').addEventListener('click', () => {
        if (!colorDialogState) return;
        const { classificationId, pickedHex, kind } = colorDialogState;
        close();
        saveSaasClassificationColor(classificationId, pickedHex, kind);
    });

    const mosaic = panel.querySelector('[data-role="mosaic"]');
    const previewMain = panel.querySelector('[data-role="preview-main"]');
    const previewCurrent = panel.querySelector('[data-role="preview-current"]');
    const hexClip = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
    const setPicked = (hex) => {
        if (colorDialogState) colorDialogState.pickedHex = hex;
        previewMain.style.backgroundColor = hex;
    };
    const rowCounts = [9, 10, 11, 12, 13, 12, 11, 10, 9];
    const centerRow = 4;
    rowCounts.forEach((count, rowIdx) => {
        const row = document.createElement('div');
        row.className = 'perm-tree-color-mosaic-row-cells';
        for (let i = 0; i < count; i += 1) {
            const dx = i - count / 2; const dy = rowIdx - centerRow;
            const dist = Math.sqrt((dx * dx * 0.85) + (dy * dy)) / 6.8;
            const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
            const hex = hsvToHex(angle, Math.min(1, dist), 1 - Math.min(0.55, dist * 0.25));
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'perm-tree-color-hex-cell';
            cell.style.backgroundColor = hex;
            cell.style.clipPath = hexClip;
            cell.addEventListener('click', () => setPicked(hex));
            row.appendChild(cell);
        }
        mosaic.appendChild(row);
    });
    const grayRow = panel.querySelector('[data-role="gray-row"]');
    for (let g = 0; g < 9; g += 1) {
        const v = Math.round(255 - (g * (255 / 8)));
        const hex = hsvToHex(0, 0, v / 255);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'perm-tree-color-hex-cell perm-tree-color-hex-cell-sm';
        cell.style.backgroundColor = hex;
        cell.style.clipPath = hexClip;
        cell.addEventListener('click', () => setPicked(hex));
        grayRow.appendChild(cell);
    }

    const canvas = panel.querySelector('[data-role="sv-canvas"]');
    const ctx = canvas.getContext('2d');
    const svMarker = panel.querySelector('[data-role="sv-marker"]');
    const hueStrip = panel.querySelector('[data-role="hue-strip"]');
    const hueArrow = panel.querySelector('[data-role="hue-arrow"]');
    const hexInput = panel.querySelector('[data-role="hex-input"]');
    const rgbR = panel.querySelector('[data-role="rgb-r"]');
    const rgbG = panel.querySelector('[data-role="rgb-g"]');
    const rgbB = panel.querySelector('[data-role="rgb-b"]');
    let hue = 252;
    let sat = 1;
    let val = 1;
    function drawSvCanvas() {
        const w = canvas.width; const h = canvas.height;
        const satGrad = ctx.createLinearGradient(0, 0, w, 0);
        satGrad.addColorStop(0, '#fff');
        satGrad.addColorStop(1, hsvToHex(hue, 1, 1));
        ctx.fillStyle = satGrad;
        ctx.fillRect(0, 0, w, h);
        const valGrad = ctx.createLinearGradient(0, 0, 0, h);
        valGrad.addColorStop(0, 'rgba(0,0,0,0)');
        valGrad.addColorStop(1, '#000');
        ctx.fillStyle = valGrad;
        ctx.fillRect(0, 0, w, h);
    }
    function applyHsv(h, s, v, skip) {
        hue = h; sat = s; val = v;
        const hex = hsvToHex(h, s, v);
        if (skip !== 'marker') { svMarker.style.left = `${s * 100}%`; svMarker.style.top = `${(1 - v) * 100}%`; }
        if (skip !== 'hue') { hueArrow.style.top = `${(h / 360) * 100}%`; drawSvCanvas(); }
        if (skip !== 'hex') hexInput.value = hex;
        if (skip !== 'rgb') { const rgb = hexToRgb(hex); rgbR.value = rgb.r; rgbG.value = rgb.g; rgbB.value = rgb.b; }
        setPicked(hex);
    }
    function dragHandler(el, onMove) {
        let dragging = false;
        const move = (event) => { if (dragging) onMove(event); };
        el.addEventListener('mousedown', (event) => { dragging = true; onMove(event); });
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', () => { dragging = false; });
    }
    dragHandler(canvas, (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
        applyHsv(hue, x, 1 - y, 'hue');
    });
    dragHandler(hueStrip, (event) => {
        const rect = hueStrip.getBoundingClientRect();
        const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
        applyHsv(y * 360, sat, val, null);
    });
    hexInput.addEventListener('input', () => {
        if (!/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) return;
        const hsv = hexToHsv(hexInput.value);
        applyHsv(hsv.h, hsv.s, hsv.v, 'hex');
    });
    [rgbR, rgbG, rgbB].forEach((input) => {
        input.addEventListener('input', () => {
            const clamp = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
            const hex = `#${[clamp(rgbR.value), clamp(rgbG.value), clamp(rgbB.value)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
            const hsv = hexToHsv(hex);
            applyHsv(hsv.h, hsv.s, hsv.v, 'rgb');
        });
    });
    colorDialogEl.__setInitialHex = (hex) => {
        previewMain.style.backgroundColor = hex;
        previewCurrent.style.backgroundColor = hex;
        const hsv = hexToHsv(hex);
        applyHsv(hsv.h, hsv.s, hsv.v, null);
    };
}
function openColorDialog(classificationId, kind = 'dot') {
    ensureColorDialog();
    const isText = kind === 'text';
    const currentHex = isText ? (classificationTextColor(classificationId) || classificationColor(classificationId)) : classificationColor(classificationId);
    colorDialogState = { classificationId, pickedHex: currentHex, kind };
    colorDialogEl.querySelector('#perm-tree-color-dialog-title').textContent = Dashboard.t(isText ? 'admin.masterTreeChooseTextColor' : 'admin.masterTreeChooseColor');
    colorDialogEl.__setInitialHex(currentHex);
    colorDialogEl.querySelector('[data-tab="std"]').click();
    colorDialogEl.hidden = false;
}

// "Cambios" dialog -- verbatim adaptation of PermissionTree.js's own
// ensureHistoryDialog/openHistoryDialog/formatHistoryFieldName/
// formatHistoryChange, pointed at this screen's own change-log route.
let historyDialogEl = null;
function formatHistoryFieldName(field) {
    if (field === 'estatus') return Dashboard.t('admin.masterTreeHistoryFieldStatus');
    if (field === 'web') return Dashboard.t('admin.masterTreePlatformWeb');
    if (field === 'app') return Dashboard.t('admin.masterTreePlatformApp');
    if (field === 'clasificacion') return Dashboard.t('admin.masterTreeHistoryFieldClassification');
    if (field === 'color') return Dashboard.t('admin.masterTreeHistoryFieldColor');
    if (field === 'textColor') return Dashboard.t('admin.masterTreeHistoryFieldTextColor');
    return field;
}
function formatHistoryChange(entry) {
    const bool = (v) => (v === 'true' ? Dashboard.t('main.filterActive') : Dashboard.t('main.filterInactive'));
    const statusLabel = (v) => {
        const key = v ? `admin.masterTreeStatus${v.charAt(0).toUpperCase()}${v.slice(1)}` : '';
        const label = key ? Dashboard.t(key) : '';
        return label && label !== key ? label : (v || Dashboard.t('menu.classNone'));
    };
    const none = Dashboard.t('menu.classNone');
    if (entry.field === 'estatus') return `${statusLabel(entry.oldValue)} → ${statusLabel(entry.newValue)}`;
    if (entry.field === 'web' || entry.field === 'app') return `${bool(entry.oldValue)} → ${bool(entry.newValue)}`;
    if (entry.field === 'color' || entry.field === 'textColor') {
        const sw = (hex) => (hex ? `<span class="perm-tree-history-swatch" style="background:${hex}"></span>${hex}` : '—');
        return `${sw(entry.oldValue)} → ${sw(entry.newValue)}`;
    }
    return `${entry.oldValue || none} → ${entry.newValue || none}`;
}
function ensureHistoryDialog() {
    if (historyDialogEl) return;
    historyDialogEl = document.createElement('div');
    historyDialogEl.className = 'modal-overlay';
    historyDialogEl.hidden = true;
    historyDialogEl.innerHTML = `
        <div class="modal-panel" style="max-width: 40rem;" role="dialog" aria-modal="true" aria-labelledby="perm-tree-history-title">
            <h3 id="perm-tree-history-title" data-role="title"></h3>
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead><tr>
                        <th>${Dashboard.t('main.changeHistoryDate')}</th>
                        <th>${Dashboard.t('main.changeHistoryUser')}</th>
                        <th>${Dashboard.t('main.changeHistoryRecord')}</th>
                        <th>${Dashboard.t('main.changeHistoryChange')}</th>
                        <th>${Dashboard.t('main.changeHistoryRequestedBy')}</th>
                        <th>${Dashboard.t('main.changeHistoryAuthorizedBy')}</th>
                    </tr></thead>
                    <tbody data-role="list"></tbody>
                </table>
            </div>
            <div class="admin-form-actions" style="margin-top: 1.25rem;">
                <button type="button" class="btn btn-secondary" data-role="close">${Dashboard.t('admin.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(historyDialogEl);
    const close = () => { historyDialogEl.hidden = true; };
    historyDialogEl.querySelector('[data-role="close"]').addEventListener('click', close);
    historyDialogEl.addEventListener('click', (event) => { if (event.target === historyDialogEl) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !historyDialogEl.hidden) close(); });
}
async function openHistoryDialog(nodeKey, classificationId, label) {
    ensureHistoryDialog();
    historyDialogEl.querySelector('[data-role="title"]').textContent = `${Dashboard.t('main.changeHistory')} — ${label}`;
    const list = historyDialogEl.querySelector('[data-role="list"]');
    list.innerHTML = `<tr><td colspan="6">${Dashboard.t('admin.loading')}</td></tr>`;
    historyDialogEl.hidden = false;
    try {
        const params = new URLSearchParams({ nodeKey });
        if (classificationId) params.set('classificationId', classificationId);
        const res = await fetch(`/api/admin/saas-master-change-log?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        const entries = data.entries || [];
        list.innerHTML = '';
        if (!entries.length) {
            list.innerHTML = `<tr><td colspan="6">${Dashboard.t('main.changeHistoryEmpty')}</td></tr>`;
            return;
        }
        entries.forEach((entry) => {
            const tr = document.createElement('tr');
            const cells = [
                entry.changedAt || '',
                entry.changedBy || '',
                formatHistoryFieldName(entry.field),
                formatHistoryChange(entry),
                entry.changedBy || '',
                entry.changedBy || '',
            ];
            cells.forEach((value, i) => {
                const td = document.createElement('td');
                if (i === 3) td.innerHTML = value;
                else td.textContent = value;
                tr.appendChild(td);
            });
            list.appendChild(tr);
        });
    } catch {
        list.innerHTML = `<tr><td colspan="6">${Dashboard.t('admin.loadError')}</td></tr>`;
    }
}

function buildLevelBadgeCtx(level) {
    const badge = SAAS_LEVEL_BADGES[level];
    return { readOnlyLabel: Dashboard.t(badge.labelKey), readOnlyColor: badge.color };
}
// Same read-only-badge shape as buildLevelBadgeCtx above, but for a FIXED
// classification (Control Interno, or any classification-group heading
// row) instead of a structural level -- keeps classificationColor's own
// real color for that id, never a <select> (a group row names what it IS,
// nothing to reassign on it directly).
function buildFixedClassificationCtx(classificationId, labelKey) {
    return { readOnlyLabel: Dashboard.t(labelKey), readOnlyColor: classificationColor(classificationId), classificationId };
}
// classificationId -> display labelKey (or, for a custom one, the raw
// name typed when it was created -- Dashboard.t() already falls back to
// returning an unrecognized key unchanged, so no separate "is this a real
// key" branch is needed, see Dashboard.js's own t()).
function resolveSaasClassificationLabel(classificationId) {
    if (classificationId === SAAS_CLASS_CONTROL_INTERNO_ID) return 'menu.classControlInterno';
    if (classificationId === SAAS_CLASS_POR_DEFINIR_ID) return 'menu.classPorDefinir';
    const customEntry = Array.from(classificationOverrides.values())
        .find((o) => o.classificationId === classificationId && o.classificationLabel);
    return customEntry ? customEntry.classificationLabel : 'menu.classPorDefinir';
}
// Sanitizes apartadoKey's own "screenId::apartadoId" shape into an
// id-safe slug, scoping a custom classification's id to one Apartado
// (mirrors PermissionTree.js's own "custom-<subSm.id>-" prefix, which had
// an already-id-safe subSm.id to work with -- this file's own keys
// contain "::", hence the extra sanitizing step here).
function apartadoSlug(aKey) {
    return aKey.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}
function generateSaasCustomClassificationId(screen, apartado, name) {
    const slug = name
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'clasificacion';
    const base = `saas-class-custom-${apartadoSlug(apartadoKey(screen, apartado))}-${slug}`;
    let id = base;
    let n = 2;
    while (Array.from(classificationOverrides.values()).some((o) => o.classificationId === id && o.classificationLabel && o.classificationLabel !== name)) {
        id = `${base}-${n}`;
        n += 1;
    }
    return id;
}
// Every classification actually selectable for one Apartado's own
// columnas/acciones: the universal "Por Definir" default, Control Interno
// if this Apartado has one, then any custom classification already
// created for THIS Apartado (scoped by generateSaasCustomClassificationId's
// own prefix).
function availableSaasClassificationsFor(screen, apartado) {
    const options = [{ id: SAAS_CLASS_POR_DEFINIR_ID, labelKey: 'menu.classPorDefinir' }];
    if (apartado.controlInterno) options.push({ id: SAAS_CLASS_CONTROL_INTERNO_ID, labelKey: 'menu.classControlInterno' });
    const customPrefix = `saas-class-custom-${apartadoSlug(apartadoKey(screen, apartado))}-`;
    const seenCustom = new Set();
    classificationOverrides.forEach((o) => {
        if (o.classificationLabel && o.classificationId.startsWith(customPrefix) && !seenCustom.has(o.classificationId)) {
            seenCustom.add(o.classificationId);
            options.push({ id: o.classificationId, labelKey: o.classificationLabel, isCustom: true });
        }
    });
    return options;
}
async function saveSaasClassificationOverride(nodeKey, classificationId, classificationLabel) {
    try {
        const res = await fetch('/api/admin/saas-classification-overrides', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ nodeKey, classificationId, classificationLabel: classificationLabel || null }),
        });
        if (!res.ok) throw new Error('save failed');
        if (classificationId) classificationOverrides.set(nodeKey, { classificationId, classificationLabel: classificationLabel || null });
        else classificationOverrides.delete(nodeKey);
        renderList();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
// classificationCtx for a reassignable columna/acción leaf -- picking
// "Por Definir" again (its real default home) deletes the override
// instead of writing a same-as-default one, same convention
// buildClassificationCtx already has in PermissionTree.js.
function buildClassificationCtx(nodeKey, currentId, screen, apartado) {
    const options = availableSaasClassificationsFor(screen, apartado);
    if (!options.some((o) => o.id === currentId)) options.unshift({ id: currentId, labelKey: currentId });
    return {
        currentId,
        options,
        onPick: (newId) => {
            const picked = options.find((o) => o.id === newId);
            const label = picked && picked.isCustom ? Dashboard.t(picked.labelKey) : null;
            saveSaasClassificationOverride(nodeKey, newId === SAAS_CLASS_POR_DEFINIR_ID ? null : newId, label);
        },
        onCreate: (name) => {
            const id = generateSaasCustomClassificationId(screen, apartado, name);
            saveSaasClassificationOverride(nodeKey, id, name);
        },
    };
}
// Every non-Control-Interno leaf grouped by its EFFECTIVE classification
// (override, else "Por Definir") -- preserves orderedLeaves' own order
// within each group, so drag-reorder (scoped per group, see renderList)
// stays consistent with whatever was last saved. There's no menu.json-
// shaped submenu to walk here (unlike PermissionTree.js's own
// getEffectiveTableGroups), so this partitions the flat leaf list
// directly instead.
function getEffectiveApartadoGroups(screen, apartado) {
    const nonCiLeaves = orderedLeaves(screen, apartado).filter((l) => l.kind !== 'ci');
    const groups = [];
    const groupById = new Map();
    nonCiLeaves.forEach((leaf) => {
        const key = leafKey(screen, apartado, leaf);
        const override = classificationOverrides.get(key);
        const classificationId = override ? override.classificationId : SAAS_CLASS_POR_DEFINIR_ID;
        let g = groupById.get(classificationId);
        if (!g) { g = { classificationId, leaves: [] }; groupById.set(classificationId, g); groups.push(g); }
        g.leaves.push(leaf);
    });
    return groups;
}
function renderClassificationCreateUI(cell, ctx) {
    cell.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'perm-tree-mstatus-class-create';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'perm-tree-mstatus-class-create-input';
    input.placeholder = Dashboard.t('admin.masterTreeClassificationCreatePlaceholder');
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'perm-tree-mstatus-class-create-btn';
    confirmBtn.title = Dashboard.t('admin.masterTreeClassificationCreateConfirm');
    confirmBtn.setAttribute('aria-label', confirmBtn.title);
    confirmBtn.innerHTML = '<i class="bx bx-check" aria-hidden="true"></i>';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'perm-tree-mstatus-class-create-btn perm-tree-mstatus-class-create-btn-cancel';
    cancelBtn.title = Dashboard.t('admin.cancel');
    cancelBtn.setAttribute('aria-label', cancelBtn.title);
    cancelBtn.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
    wrap.append(input, confirmBtn, cancelBtn);
    cell.appendChild(wrap);
    wrap.addEventListener('click', (e) => e.stopPropagation());
    input.focus();
    const confirm = () => {
        const name = input.value.trim();
        if (!name) { input.focus(); return; }
        ctx.onCreate(name);
    };
    confirmBtn.addEventListener('click', confirm);
    cancelBtn.addEventListener('click', () => renderList());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirm();
        if (e.key === 'Escape') renderList();
    });
}

// Full controls block (Clasificación + Estatus + aplicar-a-anidados +
// Web/App + Navegar + Cambios) -- used by every real row (Grupo/Pantalla/
// Apartado/classification-group/Columna/Acción) that carries its own key,
// same as every row in Árbol de Permisos Maestro does once it has one (see
// statusRow there) -- only "General" has no key/controls of its own, it's
// a pure summary. classificationCtx is null for rows with nothing to show
// there (General/Inicio/Tablero); label is this row's own display text,
// used only for the Cambios dialog's title.
function buildControls(key, descendantKeys, navigateHref, classificationCtx, label) {
    const state = getState(key);
    const controls = document.createElement('div');
    controls.className = 'perm-tree-mstatus-controls';

    // Clasificación -- placed before Estatus (same order as the client
    // tree's own statusRow), read-only badge (+ dot/text color pickers,
    // real classifications only) for a structural/fixed row, a real
    // reassignment <select> for a plain columna/acción leaf, or an empty
    // cell (classificationCtx null) for rows with nothing to show here.
    const classificationCell = document.createElement('div');
    classificationCell.className = 'perm-tree-mstatus-class-cell';
    if (classificationCtx && classificationCtx.readOnlyLabel !== undefined) {
        const classBadge = document.createElement('span');
        classBadge.className = 'perm-tree-mstatus-class-badge';
        classBadge.textContent = classificationCtx.readOnlyLabel;
        classBadge.style.color = classificationTextColor(classificationCtx.classificationId) || classificationCtx.readOnlyColor;
        classBadge.style.borderColor = classificationCtx.readOnlyColor;
        classBadge.style.backgroundColor = `color-mix(in srgb, ${classificationCtx.readOnlyColor} 14%, var(--color-bg))`;
        classificationCell.appendChild(classBadge);
        // Only a real classification's own group row carries
        // classificationId (see buildFixedClassificationCtx) -- a
        // structural level badge (Grupo/Pantalla/Apartado) isn't a
        // classification and has no color of its own to pick.
        if (classificationCtx.classificationId) {
            const colorBtn = document.createElement('button');
            colorBtn.type = 'button';
            colorBtn.className = 'perm-tree-color-picker-btn';
            colorBtn.setAttribute('aria-label', Dashboard.t('admin.masterTreeChooseColor'));
            colorBtn.innerHTML = '<i class="bx bx-palette" aria-hidden="true"></i>';
            colorBtn.style.color = classificationCtx.readOnlyColor;
            colorBtn.style.borderColor = classificationCtx.readOnlyColor;
            colorBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                openColorPicker(colorBtn, classificationCtx.classificationId, 'dot');
            });
            classificationCell.appendChild(colorBtn);
            const textColorBtn = document.createElement('button');
            textColorBtn.type = 'button';
            textColorBtn.className = 'perm-tree-text-color-picker-btn';
            textColorBtn.setAttribute('aria-label', Dashboard.t('admin.masterTreeChooseTextColor'));
            const textHex = classificationTextColor(classificationCtx.classificationId) || classificationCtx.readOnlyColor;
            textColorBtn.innerHTML = 'A<span class="perm-tree-text-color-picker-bar" aria-hidden="true"></span>';
            textColorBtn.style.color = textHex;
            textColorBtn.style.borderColor = textHex;
            textColorBtn.querySelector('.perm-tree-text-color-picker-bar').style.backgroundColor = textHex;
            textColorBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                openColorPicker(textColorBtn, classificationCtx.classificationId, 'text');
            });
            classificationCell.appendChild(textColorBtn);
        }
    } else if (classificationCtx) {
        const classSelect = document.createElement('select');
        classSelect.className = 'perm-tree-mstatus-class-select';
        classificationCtx.options.forEach((opt) => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.id;
            optionEl.textContent = Dashboard.t(opt.labelKey);
            classSelect.appendChild(optionEl);
        });
        if (!classificationCtx.options.some((o) => o.id === classificationCtx.currentId)) {
            const optionEl = document.createElement('option');
            optionEl.value = classificationCtx.currentId;
            optionEl.textContent = classificationCtx.currentId || Dashboard.t('menu.classNone');
            classSelect.appendChild(optionEl);
        }
        const createOptionEl = document.createElement('option');
        createOptionEl.value = CREATE_CLASSIFICATION_VALUE;
        createOptionEl.textContent = Dashboard.t('admin.masterTreeClassificationCreateOption');
        classSelect.appendChild(createOptionEl);
        classSelect.value = classificationCtx.currentId;
        classSelect.title = Dashboard.t('admin.masterTreeClassificationPicker');
        classSelect.setAttribute('aria-label', classSelect.title);
        const currentColor = classificationColor(classificationCtx.currentId);
        classSelect.style.color = currentColor;
        classSelect.style.borderColor = currentColor;
        classSelect.style.backgroundColor = `color-mix(in srgb, ${currentColor} 14%, var(--color-bg))`;
        Array.from(classSelect.options).forEach((optionEl) => {
            optionEl.style.color = optionEl.value === CREATE_CLASSIFICATION_VALUE
                ? 'var(--color-text-secondary)' : classificationColor(optionEl.value);
        });
        classSelect.addEventListener('click', (e) => e.stopPropagation());
        classSelect.addEventListener('change', () => {
            if (classSelect.value === CREATE_CLASSIFICATION_VALUE) renderClassificationCreateUI(classificationCell, classificationCtx);
            else classificationCtx.onPick(classSelect.value);
        });
        classificationCell.appendChild(classSelect);
    }
    controls.appendChild(classificationCell);

    const statusCell = document.createElement('div');
    statusCell.className = 'perm-tree-mstatus-status-cell';
    const select = document.createElement('select');
    select.className = `perm-tree-mstatus-select perm-tree-mstatus-select-${state.status}`;
    STATUS_OPTIONS.forEach((opt) => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.textContent = Dashboard.t(opt.labelKey);
        optionEl.className = `perm-tree-mstatus-select-${opt.value}`;
        select.appendChild(optionEl);
    });
    select.value = state.status;
    select.addEventListener('change', () => {
        setState(key, { ...getState(key), status: select.value });
        renderList();
    });
    statusCell.appendChild(select);
    controls.appendChild(statusCell);

    const nestCell = document.createElement('div');
    nestCell.className = 'perm-tree-mstatus-status-nest-cell';
    if (descendantKeys.length) {
        nestCell.appendChild(nestBtn('Aplicar Estatus a lo anidado', () => {
            descendantKeys.forEach((k) => setState(k, { ...getState(k), status: select.value }));
            renderList();
        }));
    }
    controls.appendChild(nestCell);

    const platformsCell = document.createElement('div');
    platformsCell.className = 'perm-tree-mstatus-platforms-cell';
    ['web', 'app'].forEach((platform) => {
        const group = document.createElement('div');
        group.className = 'perm-tree-mstatus-platform-group';
        const badge = document.createElement('label');
        badge.className = `perm-tree-mstatus-badge perm-tree-mstatus-badge-${platform}`;
        const tag = document.createElement('span');
        tag.className = 'perm-tree-mstatus-platform';
        tag.textContent = platform === 'web' ? 'WEB' : 'APP';
        const device = document.createElement('span');
        device.className = 'perm-tree-mstatus-device';
        const checked = platform === 'web' ? state.webEnabled : state.appEnabled;
        if (checked) device.classList.add('perm-tree-mstatus-device-on');
        const locked = platform === 'app' && !state.webEnabled;
        const box = document.createElement('span');
        box.className = 'perm-tree-mstatus-device-box';
        box.innerHTML = deviceIconSvg(platform, '');
        device.appendChild(box);
        device.style.opacity = locked ? '0.4' : '';
        device.style.cursor = locked ? 'not-allowed' : 'pointer';
        device.addEventListener('click', () => {
            if (locked) return;
            const current = getState(key);
            const next = { ...current };
            if (platform === 'web') {
                next.webEnabled = !current.webEnabled;
                if (!next.webEnabled) next.appEnabled = false;
            } else {
                next.appEnabled = !current.appEnabled;
            }
            setState(key, next);
            renderList();
        });
        badge.append(tag, device);
        group.appendChild(badge);
        if (descendantKeys.length) {
            group.appendChild(nestBtn(`Aplicar ${platform.toUpperCase()} a lo anidado`, () => {
                const value = platform === 'web' ? state.webEnabled : state.appEnabled;
                descendantKeys.forEach((k) => {
                    const s = getState(k);
                    setState(k, platform === 'web' ? { ...s, webEnabled: value, appEnabled: value ? s.appEnabled : false } : { ...s, appEnabled: value });
                });
                renderList();
            }));
        }
        platformsCell.appendChild(group);
    });
    controls.appendChild(platformsCell);

    const navCell = document.createElement('div');
    navCell.className = 'perm-tree-mstatus-navigate-cell';
    if (navigateHref) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'perm-tree-mstatus-nest-btn';
        btn.title = 'Navegar';
        btn.setAttribute('aria-label', 'Navegar');
        btn.innerHTML = '<i class="bx bx-link-external" aria-hidden="true"></i>';
        btn.addEventListener('click', () => { window.location.href = navigateHref; });
        navCell.appendChild(btn);
    }
    controls.appendChild(navCell);

    // "Cambios" -- last child, every real row gets one, no exceptions
    // (same rule the client tree's own statusRow follows). classificationCtx's
    // own classificationId (present only on Control Interno's row and each
    // classification-group heading row) is what lets the merged log also
    // pick up that classification's shared color/textColor history.
    const historyCell = document.createElement('div');
    historyCell.className = 'perm-tree-mstatus-history-cell';
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'perm-tree-mstatus-nest-btn';
    historyBtn.title = Dashboard.t('main.changeHistory');
    historyBtn.setAttribute('aria-label', historyBtn.title);
    historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    historyBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openHistoryDialog(key, classificationCtx?.classificationId || null, label);
    });
    historyCell.appendChild(historyBtn);
    controls.appendChild(historyCell);

    return controls;
}

// Dashed vertical guides connecting an expanded row to the full block of
// descendants directly under it -- same purely-decorative, computed-from-
// real-positions idea as drawNestGuides in PermissionTree.js. Derived from
// the depth classes already on each row rather than a separate parent-
// child map: since rendering is depth-first, an expanded row's own
// descendant block is exactly the run of immediately-following rows whose
// depth is greater than its own, stopping at the first row that isn't.
function drawGuides() {
    listEl.querySelectorAll('.perm-tree-nest-guide').forEach((el) => el.remove());
    const rows = Array.from(listEl.children).filter((el) => el.classList.contains('perm-tree-row'));
    const containerRect = listEl.getBoundingClientRect();
    const depthOf = (el) => {
        const m = el.className.match(/perm-tree-depth-(\d+)/);
        return m ? Number(m[1]) : -1;
    };
    rows.forEach((row, i) => {
        const toggle = row.querySelector(':scope > .perm-tree-toggle[aria-expanded="true"]');
        if (!toggle) return;
        const depth = depthOf(row);
        let last = null;
        for (let j = i + 1; j < rows.length; j++) {
            if (depthOf(rows[j]) <= depth) break;
            last = rows[j];
        }
        if (!last) return;
        // Anchored to THIS row's own drag handle when it has one, not the
        // toggle -- confirmed live on the real Árbol de Permisos Maestro
        // (PermissionTree.js's own drawNestGuides) that centering on the
        // toggle instead puts the guide right on top of the NEXT level's
        // own drag handle (grip+toggle together are roughly one whole
        // indent step wide). Falls back to the toggle only when this row
        // has no grip of its own (none of ours do currently, but matching
        // the real fallback costs nothing and keeps this correct if that
        // ever changes).
        const anchor = row.querySelector(':scope > .perm-tree-drag-handle') || toggle;
        const anchorRect = anchor.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const guide = document.createElement('div');
        guide.className = 'perm-tree-nest-guide';
        guide.style.left = `${anchorRect.left - containerRect.left - 4 + listEl.scrollLeft}px`;
        guide.style.top = `${rowRect.bottom - containerRect.top + listEl.scrollTop}px`;
        guide.style.height = `${Math.max(0, last.getBoundingClientRect().bottom - rowRect.bottom)}px`;
        listEl.appendChild(guide);
    });
}

function buildHeader() {
    const header = document.createElement('div');
    header.className = 'perm-tree-mstatus-header';
    const spacerEl = document.createElement('span');
    spacerEl.className = 'perm-tree-mstatus-header-spacer';
    header.appendChild(spacerEl);
    const labelHeader = document.createElement('span');
    labelHeader.className = 'perm-tree-mstatus-header-label';
    labelHeader.textContent = 'Pantalla / Apartado / Columna';
    header.appendChild(labelHeader);
    const controls = document.createElement('div');
    controls.className = 'perm-tree-mstatus-header-controls';
    const classCol = document.createElement('span');
    classCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-class';
    classCol.textContent = Dashboard.t('admin.masterTreeColClassification');
    controls.appendChild(classCol);
    const statusCol = document.createElement('span');
    statusCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-status';
    statusCol.textContent = 'Estatus';
    controls.appendChild(statusCol);
    const nestCol = document.createElement('span');
    nestCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-status-nest';
    controls.appendChild(nestCol);
    const platformsCol = document.createElement('span');
    platformsCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-platforms';
    platformsCol.textContent = 'Web · App';
    controls.appendChild(platformsCol);
    const navCol = document.createElement('span');
    navCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-navigate';
    navCol.innerHTML = '<i class="bx bx-link-external" aria-hidden="true"></i>';
    controls.appendChild(navCol);
    const historyCol = document.createElement('span');
    historyCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-history';
    historyCol.textContent = Dashboard.t('admin.masterTreeColHistory');
    controls.appendChild(historyCol);
    header.appendChild(controls);
    return header;
}

function renderList() {
    listEl.innerHTML = '';
    listEl.appendChild(buildHeader());

    // "General" -- a real row with its own stored Estatus/Web-App and a
    // cascade over literally every leaf (confirmed against the real Árbol de
    // Permisos Maestro's own General row, which has both, visible there as a
    // genuine, non-rollup "Inhabilitado" that its own children didn't
    // share) -- a real kill-switch over the whole tree, not just a read-only
    // summary. Its OWN toggle only ever shows/hides GENERAL_ITEMS
    // (Inicio/Tablero) below -- Servicio a Cliente/Configuración SaaS always
    // render as their own top-level rows right after regardless of this
    // toggle's state (confirmed with the user after an earlier version of
    // this collapsed the whole tree away when General's toggle also gated
    // the 2 groups).
    const allLeafKeys = [...GENERAL_ITEMS.map((i) => i.itemId), ...collectLeafKeysForScreens(CATALOG.flatMap((g) => g.screens))];
    const generalRow = document.createElement('div');
    generalRow.className = 'perm-tree-row perm-tree-depth-0 saas-master-status-row-general';
    generalRow.appendChild(spacer());
    generalRow.appendChild(toggleBtn('gen:main', !collapsed.has('gen:main')));
    generalRow.appendChild(rollupEl(computeRollup(allLeafKeys, 'web'), computeRollup(allLeafKeys, 'app')));
    generalRow.appendChild(labelEl(Dashboard.t('admin.saasMasterTreeGeneral')));
    generalRow.appendChild(countBadge(allLeafKeys.length));
    // Points at the very first screen overall -- General spans every
    // screen, so there's no single natural destination, but confirmed with
    // the user every row needs a real, clickable Navegar button, same as
    // the real Árbol de Permisos Maestro gives its own Departamento-level
    // rows (not just Pantalla ones).
    generalRow.appendChild(buildControls('__general__', allLeafKeys, CATALOG[0].screens[0].href, null, Dashboard.t('admin.saasMasterTreeGeneral')));
    listEl.appendChild(generalRow);

    if (!collapsed.has('gen:main')) {
        GENERAL_ITEMS.forEach((item) => {
            const itemRow = document.createElement('div');
            itemRow.className = 'perm-tree-row perm-tree-depth-1';
            // No dragHandle/toggle -- never reorderable, no children of its
            // own, same GENERAL_ITEM_IDS treatment the real tree gives
            // Inicio/Panel/Tablero (spacer() keeps column alignment).
            itemRow.appendChild(spacer());
            itemRow.appendChild(spacer());
            itemRow.appendChild(rollupEl(computeRollup([item.itemId], 'web'), computeRollup([item.itemId], 'app')));
            itemRow.appendChild(labelEl(Dashboard.t(item.labelKey)));
            itemRow.appendChild(countBadge(1));
            itemRow.appendChild(buildControls(item.itemId, [], item.href, null, Dashboard.t(item.labelKey)));
            listEl.appendChild(itemRow);
        });
    }

    orderedGroups().forEach((group) => {
        const groupLeafKeys = collectLeafKeysForScreens(group.screens);
        const groupRow = document.createElement('div');
        groupRow.className = 'perm-tree-row perm-tree-depth-0';
        makeDraggable(groupRow, {
            list: 'groups', id: group.groupId,
            onReorder: (fromId, toId) => { order.groups = reorderList(order.groups, fromId, toId); },
        });
        groupRow.appendChild(dragHandle());
        groupRow.appendChild(toggleBtn(`g:${group.groupId}`, !collapsed.has(`g:${group.groupId}`)));
        groupRow.appendChild(rollupEl(computeRollup(groupLeafKeys, 'web'), computeRollup(groupLeafKeys, 'app')));
        groupRow.appendChild(labelEl(Dashboard.t(group.labelKey)));
        groupRow.appendChild(countBadge(groupLeafKeys.length));
        // Confirmed against a real Departamento row (Comité Directivo) in
        // Árbol de Permisos Maestro: every row gets its own Estatus/Web-App
        // controls AND a working Navegar button, not just a read-only
        // rollup -- points at this group's own first screen, same
        // first-screen fallback General uses just above.
        groupRow.appendChild(buildControls(group.groupId, groupLeafKeys, group.screens[0].href, buildLevelBadgeCtx('grupo'), Dashboard.t(group.labelKey)));
        listEl.appendChild(groupRow);
        if (collapsed.has(`g:${group.groupId}`)) return;

        orderedScreens(group).forEach((screen) => {
            const screenLeafKeys = collectLeafKeysForScreens([screen]);
            const screenRow = document.createElement('div');
            screenRow.className = 'perm-tree-row perm-tree-depth-1';
            makeDraggable(screenRow, {
                list: `screens:${group.groupId}`, id: screen.itemId,
                onReorder: (fromId, toId) => { order.screensByGroup[group.groupId] = reorderList(order.screensByGroup[group.groupId] || group.screens.map((s) => s.itemId), fromId, toId); },
            });
            screenRow.appendChild(dragHandle());
            screenRow.appendChild(toggleBtn(`s:${screen.itemId}`, !collapsed.has(`s:${screen.itemId}`)));
            screenRow.appendChild(rollupEl(computeRollup(screenLeafKeys, 'web'), computeRollup(screenLeafKeys, 'app')));
            screenRow.appendChild(labelEl(Dashboard.t(screen.labelKey)));
            screenRow.appendChild(countBadge(screenLeafKeys.length));
            screenRow.appendChild(buildControls(screen.itemId, screenLeafKeys, screen.href, buildLevelBadgeCtx('pantalla'), Dashboard.t(screen.labelKey)));
            listEl.appendChild(screenRow);
            if (collapsed.has(`s:${screen.itemId}`)) return;

            orderedApartados(screen).forEach((apartado) => {
                const aKey = apartadoKey(screen, apartado);
                const apLeafKeys = collectLeafKeysForApartado(screen, apartado);
                const apRow = document.createElement('div');
                apRow.className = 'perm-tree-row perm-tree-depth-2';
                makeDraggable(apRow, {
                    list: `apartados:${screen.itemId}`, id: apartado.id,
                    onReorder: (fromId, toId) => { order.apartadosByScreen[screen.itemId] = reorderList(order.apartadosByScreen[screen.itemId] || screen.apartados.map((a) => a.id), fromId, toId); },
                });
                apRow.appendChild(dragHandle());
                apRow.appendChild(toggleBtn(`a:${aKey}`, !collapsed.has(`a:${aKey}`)));
                apRow.appendChild(rollupEl(computeRollup(apLeafKeys, 'web'), computeRollup(apLeafKeys, 'app')));
                apRow.appendChild(labelEl(apartado.label));
                apRow.appendChild(countBadge(apLeafKeys.length));
                // Same href as the screen's own row, not null -- confirmed
                // live that only the top screen row having a working
                // Navegar button, with every Apartado/Columna underneath
                // showing an empty cell, read as broken rather than
                // intentional. Every row within a screen now jumps to that
                // same screen (there's no separate URL for one of its own
                // columns to navigate to).
                apRow.appendChild(buildControls(aKey, apLeafKeys, screen.href, buildLevelBadgeCtx('apartado'), apartado.label));
                listEl.appendChild(apRow);
                if (collapsed.has(`a:${aKey}`)) return;

                // Control Interno stays a single, non-reassignable row --
                // rendered first, never draggable (fixed classification,
                // same treatment "Botones"/"Acciones" get in the client
                // tree), since apartado.controlInterno only ever produces
                // exactly one such leaf (see buildLeaves).
                if (apartado.controlInterno) {
                    const ciLeaf = buildLeaves(apartado).find((l) => l.kind === 'ci');
                    const ciKey = leafKey(screen, apartado, ciLeaf);
                    const ciRow = document.createElement('div');
                    ciRow.className = 'perm-tree-row perm-tree-depth-3 perm-tree-row-classification';
                    ciRow.appendChild(spacer());
                    ciRow.appendChild(spacer());
                    ciRow.appendChild(rollupEl(computeRollup([ciKey], 'web'), computeRollup([ciKey], 'app')));
                    ciRow.appendChild(labelEl(ciLeaf.label));
                    ciRow.appendChild(countBadge(1));
                    ciRow.appendChild(buildControls(ciKey, [], screen.href, buildFixedClassificationCtx(SAAS_CLASS_CONTROL_INTERNO_ID, 'menu.classControlInterno'), ciLeaf.label));
                    listEl.appendChild(ciRow);
                }

                // Every other leaf (columna/acción) groups by its effective
                // classification -- but "Por Definir Clasificación" itself
                // never gets a heading row: on this screen (unlike the
                // client tree) it's not a handful of stray leftovers, it's
                // EVERY leaf until an admin actually reclassifies one, so
                // wrapping it in a collapsible group just repeated the
                // same label on every single line underneath for no
                // benefit (confirmed live: "se ven filas vacías, no
                // clasificadas, desordenadas"). Those leaves render flat,
                // at their original depth, each still individually
                // reassignable via its own select -- only a REAL
                // classification (a custom one an admin created for this
                // Apartado) earns a group heading below.
                const apartadoGroups = getEffectiveApartadoGroups(screen, apartado);
                const porDefinirGroup = apartadoGroups.find((g) => g.classificationId === SAAS_CLASS_POR_DEFINIR_ID);
                (porDefinirGroup ? porDefinirGroup.leaves : []).forEach((leaf) => {
                    const key = leafKey(screen, apartado, leaf);
                    const row = document.createElement('div');
                    row.className = 'perm-tree-row perm-tree-depth-3';
                    makeDraggable(row, {
                        list: `leaves:${aKey}:${SAAS_CLASS_POR_DEFINIR_ID}`, id: leaf.suffix,
                        onReorder: (fromId, toId) => { order.leavesByApartado[aKey] = reorderList(order.leavesByApartado[aKey] || buildLeaves(apartado).map((l) => l.suffix), fromId, toId); },
                    });
                    row.appendChild(dragHandle());
                    row.appendChild(spacer());
                    row.appendChild(rollupEl(computeRollup([key], 'web'), computeRollup([key], 'app')));
                    row.appendChild(labelEl(leaf.label));
                    row.appendChild(countBadge(1));
                    row.appendChild(buildControls(key, [], screen.href, buildClassificationCtx(key, SAAS_CLASS_POR_DEFINIR_ID, screen, apartado), leaf.label));
                    listEl.appendChild(row);
                });

                apartadoGroups.filter((g) => g.classificationId !== SAAS_CLASS_POR_DEFINIR_ID).forEach((clsGroup) => {
                    const groupKey = `${aKey}::class::${clsGroup.classificationId}`;
                    const groupLeafKeys2 = clsGroup.leaves.map((leaf) => leafKey(screen, apartado, leaf));
                    const groupLabelKey = resolveSaasClassificationLabel(clsGroup.classificationId);
                    const clsRow = document.createElement('div');
                    clsRow.className = 'perm-tree-row perm-tree-depth-3 perm-tree-row-classification';
                    clsRow.appendChild(spacer());
                    clsRow.appendChild(toggleBtn(`cls:${groupKey}`, !collapsed.has(`cls:${groupKey}`)));
                    clsRow.appendChild(rollupEl(computeRollup(groupLeafKeys2, 'web'), computeRollup(groupLeafKeys2, 'app')));
                    clsRow.appendChild(labelEl(Dashboard.t(groupLabelKey)));
                    clsRow.appendChild(countBadge(groupLeafKeys2.length));
                    clsRow.appendChild(buildControls(groupKey, groupLeafKeys2, screen.href, buildFixedClassificationCtx(clsGroup.classificationId, groupLabelKey), Dashboard.t(groupLabelKey)));
                    listEl.appendChild(clsRow);
                    if (collapsed.has(`cls:${groupKey}`)) return;

                    clsGroup.leaves.forEach((leaf) => {
                        const key = leafKey(screen, apartado, leaf);
                        const row = document.createElement('div');
                        row.className = 'perm-tree-row perm-tree-depth-4';
                        makeDraggable(row, {
                            list: `leaves:${aKey}:${clsGroup.classificationId}`, id: leaf.suffix,
                            onReorder: (fromId, toId) => { order.leavesByApartado[aKey] = reorderList(order.leavesByApartado[aKey] || buildLeaves(apartado).map((l) => l.suffix), fromId, toId); },
                        });
                        row.appendChild(dragHandle());
                        row.appendChild(spacer());
                        row.appendChild(rollupEl(computeRollup([key], 'web'), computeRollup([key], 'app')));
                        row.appendChild(labelEl(leaf.label));
                        row.appendChild(countBadge(1));
                        row.appendChild(buildControls(key, [], screen.href, buildClassificationCtx(key, clsGroup.classificationId, screen, apartado), leaf.label));
                        listEl.appendChild(row);
                    });
                });
            });
        });
    });

    // setTimeout, not requestAnimationFrame -- rAF gets throttled/suspended
    // on a backgrounded tab, which silently left every guide missing during
    // live testing even though the exact same positioning logic worked fine
    // when run by hand from the console right after. A 0ms timeout still
    // waits for this paint to land (rows need real layout before
    // getBoundingClientRect means anything) without depending on the tab
    // actually being the visible/focused one.
    setTimeout(drawGuides, 0);
}

async function load() {
    try {
        const [statusRes, orderRes, overridesRes, colorsRes] = await Promise.all([
            fetch('/api/admin/saas-master-status', { credentials: 'include' }),
            fetch('/api/admin/saas-master-order', { credentials: 'include' }),
            fetch('/api/admin/saas-classification-overrides', { credentials: 'include' }),
            fetch('/api/admin/saas-classification-colors', { credentials: 'include' }),
        ]);
        if (!statusRes.ok || !orderRes.ok || !overridesRes.ok || !colorsRes.ok) throw new Error('load failed');
        const statusData = await statusRes.json();
        const orderData = await orderRes.json();
        const overridesData = await overridesRes.json();
        const colorsData = await colorsRes.json();
        statuses = statusData.statuses || [];
        const saved = orderData.order;
        if (saved && typeof saved === 'object' && !Array.isArray(saved) && saved.groups) {
            order = { groups: saved.groups || order.groups, screensByGroup: saved.screensByGroup || {}, apartadosByScreen: saved.apartadosByScreen || {}, leavesByApartado: saved.leavesByApartado || {} };
        }
        classificationOverrides = new Map();
        (overridesData.overrides || []).forEach((o) => {
            if (o && o.nodeKey && o.classificationId) classificationOverrides.set(o.nodeKey, { classificationId: o.classificationId, classificationLabel: o.classificationLabel || null });
        });
        classificationColors = new Map();
        classificationTextColors = new Map();
        (colorsData.colors || []).forEach((c) => {
            if (c && c.classificationId && c.color) classificationColors.set(c.classificationId, c.color);
            if (c && c.classificationId && c.textColor) classificationTextColors.set(c.classificationId, c.textColor);
        });
        renderList();
    } catch {
        errorEl.textContent = Dashboard.t('admin.loadError');
        errorEl.hidden = false;
    }
}

saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    errorEl.hidden = true;
    try {
        const [statusRes, orderRes] = await Promise.all([
            fetch('/api/admin/saas-master-status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ statuses }),
            }),
            fetch('/api/admin/saas-master-order', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ order }),
            }),
        ]);
        if (!statusRes.ok || !orderRes.ok) throw new Error('save failed');
        const statusData = await statusRes.json();
        statuses = statusData.statuses || [];
        renderList();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        errorEl.textContent = Dashboard.t('admin.saveError');
        errorEl.hidden = false;
    } finally {
        saveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', renderList);
window.addEventListener('resize', () => setTimeout(drawGuides, 0));

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-saas-master-status' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await load();
    } catch (err) {
        console.error('Admin (Árbol Maestro SaaS) failed to initialize:', err);
    }
})();
