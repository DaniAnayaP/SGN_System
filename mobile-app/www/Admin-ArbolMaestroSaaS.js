(function () {
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

// General's own real children -- Inicio/Panel/Tablero, the same trio the
// client tree itself shows under Comité Directivo > Accesos Generales
// (confirmed live against it, 2026-09-17: "Los inicio - Tableros - panel
// deben de ir como generales"). Reuses menu.home/menu.panel/menu.dashboard's
// real labels (same Spanish/English text) since these are the same
// navigation concepts, just tracked here under their own saas_master_status
// ids instead of master_permission_status. Leaf-level only (no apartados),
// same GENERAL_ITEM_IDS treatment PermissionTree.js gives them: never
// draggable, no toggle/children of their own. 'saas-home'/'saas-panel' have
// no real distinct page to jump to for this role (same reasoning
// menu.json's own 'home' entry has href '#'), so they get no Navegar
// button rather than a dead one.
const GENERAL_ITEMS = [
    { itemId: 'saas-home', labelKey: 'menu.home', href: null },
    { itemId: 'saas-panel', labelKey: 'menu.panel', href: null },
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
// Fixed, non-reassignable, like Control Interno -- "Botones" is a sibling
// of an Apartado's own Tabla row (not one of Tabla's reassignable column
// categories), same "si ya son botones, ya deben estar en esa
// clasificación" reasoning the client tree already applied to class-botones.
const SAAS_CLASS_BOTONES_ID = 'saas-class-botones';
// Unlike Botones/Control Interno, "Acciones" is NOT fixed -- confirmed
// live: an admin assigns it to a table's own columns by hand, one at a
// time, exactly like any custom classification (e.g. "Carga Operador"),
// it just always shows up as a standing option instead of needing to be
// typed/created first. Same id namespace as the rest of this screen's own
// fixed classifications, but treated as a plain pickable option in
// availableSaasClassificationsFor below, not excluded from the picker.
const SAAS_CLASS_ACCIONES_ID = 'saas-class-acciones';
// Same universal data-table toolbar every real Tabla in this app shares
// (the same Dashboard.js table component, client-facing or SaaS-internal
// alike) -- same ids/labelKeys menu.json's own "iconsSubmenu" already
// lists for a real client-facing table (see e.g. public/data/menu.json
// around line 311). Applies to any apartado.controlInterno Tabla here
// too, same as CONTROL_INTERNO_COLUMNS does, since it's the identical
// shared component either way.
const ICON_PERSONALIZATION_ITEMS = [
    { id: 'iconZoomOut', labelKey: 'main.decreaseFontSize' },
    { id: 'iconZoomIn', labelKey: 'main.increaseFontSize' },
    { id: 'iconPin', labelKey: 'main.pinColumns' },
    { id: 'iconVisibility', labelKey: 'main.columnVisibility' },
    { id: 'iconHistory', labelKey: 'main.changeHistory' },
    { id: 'iconLegend', labelKey: 'main.columnLegendBtn' },
    { id: 'iconFilter', labelKey: 'main.filterToggle' },
    { id: 'iconFilterClear', labelKey: 'main.filterClearBtn' },
];
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
// The client tree's real depth order is Departamento -> Área -> Apartado
// -> Pantalla -> Tabla -> Clasificación -> Columna (confirmed live,
// 2026-09-17, directly against a real branch: Cadena de Suministro
// [Departamento] -> Transporte Volumen [Área] -> Operaciones [Apartado]
// -> Carga Combustible [Pantalla] -> Tabla Carga Combustible [Tabla]).
// SaaS has no Departamento or Área of its own -- "Servicio a Cliente"/
// "Configuración SaaS" (this screen's own top level) map to the NEXT
// client term down instead of inventing a new one: Apartado. Pantalla
// keeps its own name unchanged one level under that -- same "Apartado,
// then Pantalla, descending" order the client tree already has.
const SAAS_LEVEL_BADGES = {
    pantalla: { labelKey: 'main.colSysPantalla', color: '#3A4BC9' },
    apartado: { labelKey: 'admin.masterTreeLevelApartado', color: '#9A6B00' },
    // Same "Tabla" label/color the client tree already uses -- a real
    // Tabla apartado (built via tablaApartado() in SaasAdminCatalog.js,
    // always controlInterno:true) is its own level, distinct from a plain
    // Modal apartado, which stays "Apartado" (confirmed live, 2026-09-17:
    // "porque en una tabla dice apartado?").
    tabla: { labelKey: 'main.tablePrefix', color: '#5C6079' },
    // Same as the client tree's own LEVEL_BADGES.icono -- "Iconos
    // Personalización" is a plain structural level (fixed red badge, no
    // color pickers), not a real reassignable classification like
    // Botones, same as PermissionTree.js's renderStatusIcons already
    // treats it (buildLevelBadgeCtx('icono'), never
    // buildFixedClassificationCtx).
    icono: { labelKey: 'admin.masterTreeLevelIcono', color: '#B3261E' },
};
// The real 13 Control Interno columns every "class-control-interno" block
// in menu.json already lists (same ids/labelKeys, e.g.
// public/data/menu.json:51-63) -- this screen used to stand in for all 13
// with one opaque "Columnas de Control Interno" leaf; confirmed live,
// 2026-09-17, that they need to be their own real, individually-gated
// rows here too, exactly like the client tree already has.
const CONTROL_INTERNO_COLUMNS = [
    { id: 'colSysEmpresa', labelKey: 'main.colSysEmpresa' },
    { id: 'colSysArea', labelKey: 'main.colSysArea' },
    { id: 'colSysModulo', labelKey: 'main.colSysModulo' },
    { id: 'colSysPantalla', labelKey: 'main.colSysPantalla' },
    { id: 'colSysCentroCostos', labelKey: 'main.colSysCentroCostos' },
    { id: 'colSysFecha', labelKey: 'main.colSysFecha' },
    { id: 'colSysDiaNum', labelKey: 'main.colSysDiaNum' },
    { id: 'colSysDiaTexto', labelKey: 'main.colSysDiaTexto' },
    { id: 'colSysMesNum', labelKey: 'main.colSysMesNum' },
    { id: 'colSysMesTexto', labelKey: 'main.colSysMesTexto' },
    { id: 'colSysAnio', labelKey: 'main.colSysAnio' },
    { id: 'colSysSemana', labelKey: 'main.colSysSemana' },
    { id: 'colSysHora', labelKey: 'main.colSysHora' },
];
// Same 4 independent grant sub-levels every real columna gets in the
// client tree (COLUMN_STATUS_LEVELS in PermissionTree.js -- "Solo Ver"
// stays the implicit baseline, never its own row), reusing the exact same
// i18n keys. Acciones get the client tree's own reduced 2-level set
// (BUTTON_STATUS_LEVELS) instead -- "qué lógica da, eliminar un botón?".
const LEAF_COLUMN_LEVELS = [
    { id: 'ver-y-operar', labelKey: 'main.permVerYOperar' },
    { id: 'editar', labelKey: 'main.permEditar' },
    { id: 'autorizar', labelKey: 'main.permAutorizar' },
    { id: 'eliminar', labelKey: 'main.permEliminar' },
];
const LEAF_ACTION_LEVELS = [
    { id: 'ver-y-operar', labelKey: 'main.permVerYOperar' },
    { id: 'autorizar', labelKey: 'main.permAutorizar' },
];
// A leaf's own sub-levels stay collapsed until its OWN chevron opens --
// same "one column at a time" convention colTreeKey/expandedItems already
// enforces on the client tree (confirmed there: dumping every column's 4
// levels open at once was confirmed unusable). Deliberately its own Set,
// opposite polarity from `collapsed` above (opt-IN expand, not opt-out
// collapse) and never persisted to localStorage, matching the client
// tree's own expandedItems (column-level expand state resets on reload
// there too).
let expandedLeaves = new Set();

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
    // Per-row action icons (see SaasAdminCatalog.js's own tableActions
    // comment) -- unlike `acciones` below, these ARE this apartado's own
    // leaves: individually gate-able, defaulting into the "Acciones"
    // classification (see getEffectiveApartadoGroups) instead of "Por
    // Definir". Own 'ta' suffix namespace, never collides with a columna's
    // 'c'/CI's 'ci-'/a hoisted acción's 'a' suffix.
    (apartado.tableActions || []).forEach((label, idx) => leaves.push({ suffix: `ta${idx}`, label, kind: 'table-action' }));
    // The real 13 Control Interno columns (see CONTROL_INTERNO_COLUMNS),
    // not one opaque stand-in leaf -- suffix keyed by the column's own
    // stable id (not position) since these 13 are the same everywhere,
    // unlike columnas above which is only ever position-stable within
    // THIS one apartado.
    if (apartado.controlInterno) {
        CONTROL_INTERNO_COLUMNS.forEach((col) => leaves.push({ suffix: `ci-${col.id}`, label: t(col.labelKey), kind: 'ci' }));
    }
    // acciones are NOT this apartado's own leaves anymore -- see
    // buildActionLeaves/the "Botones" sibling row in renderList, mirroring
    // the client tree's own Botones/Tabla split (confirmed live,
    // 2026-09-17, against a real branch: Carga Combustible[Pantalla] has
    // Botones(3)/Iconos Personalización(8)/Tabla Carga Combustible(127)
    // as 3 SIBLING rows, acciones never mixed into the table's own count).
    return leaves;
}
// Same suffix scheme buildLeaves already used for acciones ('a0','a1',...)
// -- kept identical on purpose so any already-saved Estatus for one of
// these (this screen's own key convention never changed, only which
// heading row it now renders under) stays valid.
function buildActionLeaves(apartado) {
    return (apartado.acciones || []).map((label, idx) => ({ suffix: `a${idx}`, label, kind: 'action' }));
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
// Apartados nested under THIS one via their own nestUnder.host (see
// SaasAdminCatalog.js's own modal-* entries, e.g. "Modal: Color
// Institucional" nesting under Nuestros Clientes' Tabla -- confirmed live,
// 2026-09-23, against a real screenshot: a modal only ever pops up FROM a
// column/action that already exists in the table, so it renders nested
// under that trigger instead of as a flat sibling apartado).
function nestedChildrenOf(screen, apartado) {
    return screen.apartados.filter((a) => a.nestUnder && a.nestUnder.host === apartado.id);
}
// Recurses into nested children so a host's own count badge/rollup/
// "aplicar a lo anidado" cascade covers its nested modals too -- same
// "a nested row's Estatus rolls up into its parent" expectation every
// other level of this tree already has.
function collectLeafKeysForApartado(screen, apartado) {
    const own = buildLeaves(apartado).map((leaf) => leafKey(screen, apartado, leaf));
    const nested = nestedChildrenOf(screen, apartado).flatMap((child) => collectLeafKeysForApartado(screen, child));
    return [...own, ...nested];
}
// What the count badge shows (never the key lists above, which stay the
// source of truth for rollups/cascades): a nested modal counts for at least
// 1 even when it has no leaves of its own -- most modals only carry acciones,
// which live in the screen's Botones row instead, so summing keys alone left
// a host showing "1" with 6 modals hanging off it (confirmed live,
// 2026-09-24). Each level sums what its own children display, so a parent is
// never smaller than what it contains.
function nestedChildItemCount(screen, child) {
    return Math.max(1, buildLeaves(child).length + nestedItemCount(screen, child));
}
function nestedItemCount(screen, apartado) {
    return nestedChildrenOf(screen, apartado).reduce((sum, child) => sum + nestedChildItemCount(screen, child), 0);
}
function apartadoItemCount(screen, apartado) {
    return buildLeaves(apartado).length + nestedItemCount(screen, apartado);
}
// Only top-level apartados: the nested ones are already summed into their host.
function screensItemCount(screens) {
    return screens.reduce((sum, screen) => sum + screen.apartados
        .filter((apartado) => !apartado.nestUnder)
        .reduce((s, apartado) => s + apartadoItemCount(screen, apartado), 0), 0);
}
// One classification group: its own leaves (plus whatever modals pop up from
// each of them) and the modals hanging off the classification itself.
function groupItemCount(screen, leaves, nestedByColumn, nestedApartados) {
    const hosted = (nestedApartados || []).reduce((sum, na) => sum + nestedChildItemCount(screen, na), 0);
    return leaves.reduce((sum, leaf) => sum + 1 + (nestedByColumn.get(leaf.label) || [])
        .reduce((s, na) => s + nestedChildItemCount(screen, na), 0), hosted);
}
// Nested children of `apartado`, grouped by which of ITS OWN columnas they
// pop up from (nestUnder.column, matched by exact label) -- consumed while
// rendering that column's own leaf row, see renderLeafWithLevels's
// `nestedApartados` param.
function buildNestedByColumn(screen, apartado) {
    const map = new Map();
    nestedChildrenOf(screen, apartado).forEach((child) => {
        if (!child.nestUnder.column) return;
        const arr = map.get(child.nestUnder.column) || [];
        arr.push(child);
        map.set(child.nestUnder.column, arr);
    });
    return map;
}
// Nested children with no real column to hang off of (nestUnder.classification
// instead) -- these render as plain members of that classification group
// (e.g. "Acciones"), right alongside its regular columna/acción leaves.
function buildNestedByClassification(screen, apartado) {
    const map = new Map();
    nestedChildrenOf(screen, apartado).forEach((child) => {
        if (!child.nestUnder.classification) return;
        const arr = map.get(child.nestUnder.classification) || [];
        arr.push(child);
        map.set(child.nestUnder.classification, arr);
    });
    return map;
}

let listEl;
let saveBtn;
let errorEl;

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
// disabled (a leaf row, nothing underneath to cascade to) still renders
// the same button, just inert/dimmed -- an empty cell there read as a
// broken/missing control rather than "not applicable" (confirmed live,
// 2026-09-17: "visualmente no debe de haber espacios vacíos entre
// filas"), same reasoning every other conditional cell in this file
// already gets an empty PLACEHOLDER element for (never a true gap).
function nestBtn(title, onClick, disabled) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'perm-tree-mstatus-nest-btn';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML = '<i class="bx bx-copy" aria-hidden="true"></i>';
    if (disabled) btn.disabled = true;
    else btn.addEventListener('click', onClick);
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
// A plain reassignable leaf's own two independent color pairs (see the
// header comment on buildLeafColorGroup below, near buildControls) --
// "col-own:<key>"/"col-nested:<key>" synthetic ids in the SAME
// classificationColors/classificationTextColors maps every real
// classification's own color already lives in, so no new storage is
// needed (classificationColor's hash fallback and
// saveSaasClassificationColor's free-form id both already work
// unchanged for these). Returns {bg,text} only when at least one half
// was actually chosen, else null, so callers can tell "nothing set here"
// apart from "only a text color was chosen" without extra truthiness
// juggling at every call site.
function ownColorTint(key) {
    const bg = classificationColors.get(`col-own:${key}`);
    const text = classificationTextColors.get(`col-own:${key}`);
    return (bg || text) ? { bg, text } : null;
}
function nestedColorTint(key) {
    const bg = classificationColors.get(`col-nested:${key}`);
    const text = classificationTextColors.get(`col-nested:${key}`);
    return (bg || text) ? { bg, text } : null;
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
        showToast(t('admin.saveError'));
    }
}
// Closed by the next click anywhere else (capture-phase) or Escape -- same
// dismiss convention as PermissionTree.js's own openColorPicker.
let openColorPanelCleanup = null;
function closeColorPanel() {
    if (openColorPanelCleanup) { openColorPanelCleanup(); openColorPanelCleanup = null; }
}
// Fondo/Letra toggle -- the same dashed-circle glyphs used everywhere in
// this screen, doubling as a switch: click one to pick which of the two
// (dot vs text) the palette underneath edits, without closing the panel.
// Shared by the classification-header panel (Control Interno/Acciones/Por
// Definir/custom) and the leaf-column panel -- confirmed live, 2026-09-24:
// "en clasificación de columnas, ahí solo lo de fondo y letra y los
// colores del tema" (a header skips the Encabezado/Filas tabs below,
// since it has one color pair, not two, but shares this same row).
function appendColorKindRow(panel, colorId, kind, onChange, view) {
    const row = document.createElement('div');
    row.className = 'perm-tree-color-kind-row';
    const dotHex = classificationColor(colorId);
    const textHex = classificationTextColor(colorId) || classificationColor(colorId);
    const makeBtn = (kindValue, hex, glyphHtml, labelKey) => {
        const col = document.createElement('div');
        col.className = 'perm-tree-color-kind-col';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `perm-tree-color-kind-btn${kind === kindValue ? ' perm-tree-color-kind-btn-active' : ''}`;
        btn.style.color = hex;
        btn.innerHTML = glyphHtml;
        btn.addEventListener('click', (event) => { event.stopPropagation(); onChange(kindValue); });
        const cap = document.createElement('span');
        cap.className = 'perm-tree-color-kind-cap';
        cap.textContent = t(labelKey);
        col.append(btn, cap);
        return col;
    };
    row.appendChild(makeBtn('dot', dotHex, '<i class="bx bx-palette" aria-hidden="true"></i>', 'admin.masterTreeColumnColorFill'));
    row.appendChild(makeBtn('text', textHex, 'A', 'admin.masterTreeColumnColorText'));
    // Eye ("Ver") -- only the leaf-column panel passes `view` ({on,
    // onToggle}); a classification header's color is its own label's, not a
    // column's, so there is nothing to preview there. It only shows/hides
    // the example (see appendColorExample), it never saves anything.
    if (view) {
        const col = document.createElement('div');
        col.className = 'perm-tree-color-kind-col perm-tree-color-kind-col-view';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `perm-tree-color-view-btn${view.on ? ' perm-tree-color-view-btn-active' : ''}`;
        btn.innerHTML = '<i class="bx bx-show" aria-hidden="true"></i>';
        btn.title = t('admin.masterTreeColorViewToggle');
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-pressed', view.on ? 'true' : 'false');
        btn.addEventListener('click', (event) => { event.stopPropagation(); view.onToggle(); });
        const cap = document.createElement('span');
        cap.className = 'perm-tree-color-kind-cap';
        cap.textContent = t('admin.masterTreeColorViewCap');
        col.append(btn, cap);
        row.appendChild(col);
    }
    panel.appendChild(row);
}
// Example shown by the eye: a tiny table with this column's 4 stored colors
// applied at once (own pair -> its header, nested pair -> its cells) next to
// an uncolored neighbor column for contrast -- what the operational screen
// will eventually render for it once colors are authorized there. Sample
// data only; unset halves fall back to the table's neutral look.
function appendColorExample(panel, ownId, nestedId, columnLabel) {
    const paint = (el, id) => {
        const bg = classificationColors.get(id);
        const text = classificationTextColors.get(id);
        if (bg) el.style.backgroundColor = bg;
        if (text) el.style.color = text;
    };
    const wrap = document.createElement('div');
    wrap.className = 'perm-tree-color-example';
    const head = document.createElement('div');
    head.className = 'perm-tree-color-example-head';
    const title = document.createElement('span');
    title.textContent = t('admin.masterTreeColorExampleTitle');
    const colName = document.createElement('span');
    colName.className = 'perm-tree-color-example-col';
    colName.textContent = `${t('admin.masterTreeColorExampleColumn')} ${columnLabel}`;
    head.append(title, colName);
    const table = document.createElement('table');
    table.className = 'perm-tree-color-example-table';
    const headRow = table.insertRow();
    const neighborHead = document.createElement('th');
    neighborHead.textContent = t('admin.masterTreeColorExampleNeighbor');
    const ownHead = document.createElement('th');
    ownHead.textContent = columnLabel;
    paint(ownHead, ownId);
    headRow.append(neighborHead, ownHead);
    for (let i = 1; i <= 3; i += 1) {
        const bodyRow = table.insertRow();
        bodyRow.insertCell().textContent = String(411 + i).padStart(4, '0');
        const ownCell = bodyRow.insertCell();
        ownCell.className = 'perm-tree-color-example-own';
        ownCell.textContent = `${t('admin.masterTreeColorExampleSample')} ${i}`;
        paint(ownCell, nestedId);
    }
    wrap.append(head, table);
    panel.appendChild(wrap);
}
// Encabezado/Filas tabs -- which of the two independent colors a columna/
// acción leaf carries (its own row vs. everything nested under it). Only
// the leaf panel uses this; a classification header has no such split.
function appendColorTargetTabs(panel, target, onChange) {
    const row = document.createElement('div');
    row.className = 'perm-tree-color-target-tabs';
    const makeTab = (value, labelKey) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `perm-tree-color-target-tab${target === value ? ' perm-tree-color-target-tab-active' : ''}`;
        btn.textContent = t(labelKey);
        btn.addEventListener('click', (event) => { event.stopPropagation(); onChange(value); });
        row.appendChild(btn);
    };
    makeTab('own', 'admin.masterTreeColumnColorOwnGroup');
    makeTab('nested', 'admin.masterTreeColumnColorNestedGroup');
    panel.appendChild(row);
}
// The palette itself (Colores del tema / Estándar / Recientes / Más
// colores...) -- unchanged from what this screen already had, just
// factored out so both panels below render the exact same thing, never
// two copies drifting apart. Never changes based on which target/kind is
// selected -- confirmed live: "jamás dije que modificaba los colores del
// tema". `onPick` re-renders the calling panel once the save (and the
// renderList() it triggers) resolves, instead of closing the panel.
function appendColorPalette(panel, colorId, kind, onPick) {
    const isText = kind === 'text';
    const colorMap = isText ? classificationTextColors : classificationColors;
    const recentList = isText ? recentTextColors : recentColors;
    const currentHex = colorMap.get(colorId);
    const addSection = (labelKey) => {
        const label = document.createElement('div');
        label.className = 'perm-tree-color-section-label';
        label.textContent = t(labelKey);
        panel.appendChild(label);
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
            saveSaasClassificationColor(colorId, hex, kind).then(() => onPick && onPick());
        });
        container.appendChild(swatch);
    };
    addSection('admin.masterTreeColorThemeColors');
    const themeGrid = document.createElement('div');
    themeGrid.className = 'perm-tree-color-theme-grid';
    for (let row = 0; row < 6; row += 1) {
        CLASSIFICATION_COLOR_FAMILIES.forEach((family) => addSwatch(themeGrid, family.shades[row], true));
    }
    panel.appendChild(themeGrid);
    addSection('admin.masterTreeColorStandard');
    const standardRow = document.createElement('div');
    standardRow.className = 'perm-tree-color-standard-row';
    CLASSIFICATION_COLOR_FAMILIES.forEach((family) => addSwatch(standardRow, family.shades[3], false));
    panel.appendChild(standardRow);
    if (recentList.length) {
        addSection('admin.masterTreeColorRecent');
        const recentRow = document.createElement('div');
        recentRow.className = 'perm-tree-color-standard-row';
        recentList.forEach((hex) => addSwatch(recentRow, hex, false));
        panel.appendChild(recentRow);
    }
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'perm-tree-color-more-btn';
    moreBtn.textContent = t('admin.masterTreeMoreColors');
    moreBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        closeColorPanel();
        openColorDialog(colorId, kind);
    });
    panel.appendChild(moreBtn);
}
function anchorColorPanel(panel, anchorBtn) {
    anchorBtn.parentElement.appendChild(panel);
    // Must check containment, not just rely on stopPropagation() inside the
    // panel's own buttons -- this listener runs on the CAPTURE phase, which
    // fires before ANY bubble-phase handler (including stopPropagation
    // calls) on a descendant ever gets a chance to run, so a plain
    // "any click closes it" callback closed the panel on every click
    // inside it too (confirmed live, 2026-09-24: switching the Fondo/Letra
    // or Encabezado/Filas toggle silently closed the panel instead of
    // switching).
    const onDocClick = (event) => { if (!panel.contains(event.target)) closeColorPanel(); };
    const onKey = (event) => { if (event.key === 'Escape') closeColorPanel(); };
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    openColorPanelCleanup = () => {
        panel.remove();
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('keydown', onKey);
    };
}
// Classification header (Control Interno/Acciones/Por Definir/custom) --
// just the Fondo/Letra toggle + the palette, no Encabezado/Filas tabs.
// Re-anchors onto the SAME classification's own trigger after every pick,
// since saving triggers a full renderList() that tears down the old one.
function openClassificationColorPanel(anchorBtn, classificationId, initialKind) {
    closeColorPanel();
    let kind = initialKind || 'dot';
    const panel = document.createElement('div');
    panel.className = 'perm-tree-color-popover';
    function render() {
        panel.innerHTML = '';
        appendColorKindRow(panel, classificationId, kind, (k) => { kind = k; render(); });
        appendColorPalette(panel, classificationId, kind, () => {
            const fresh = document.querySelector(`[data-class-color-key="${CSS.escape(classificationId)}"]`);
            if (fresh) openClassificationColorPanel(fresh, classificationId, kind);
        });
    }
    render();
    anchorColorPanel(panel, anchorBtn);
}
// Columna/acción leaf -- Encabezado/Filas tabs (which of the 4 targets)
// on top of the same Fondo/Letra toggle + palette. Re-anchors onto the
// SAME leaf's own trigger (found by its stable key) after every pick.
function openLeafColorPanel(anchorBtn, ownId, nestedId, leafKey, columnLabel, initialTarget, initialKind, initialView) {
    closeColorPanel();
    let target = initialTarget || 'own';
    let kind = initialKind || 'dot';
    // Eye state lives here (not saved anywhere): off when the panel first
    // opens, and carried through the re-anchor after each pick so choosing a
    // color doesn't collapse the example you're watching.
    let viewOn = !!initialView;
    const panel = document.createElement('div');
    panel.className = 'perm-tree-color-popover';
    function currentId() { return target === 'own' ? ownId : nestedId; }
    function render() {
        panel.innerHTML = '';
        appendColorTargetTabs(panel, target, (t2) => { target = t2; render(); });
        appendColorKindRow(panel, currentId(), kind, (k) => { kind = k; render(); }, { on: viewOn, onToggle: () => { viewOn = !viewOn; render(); } });
        if (viewOn) appendColorExample(panel, ownId, nestedId, columnLabel);
        appendColorPalette(panel, currentId(), kind, () => {
            const fresh = document.querySelector(`[data-leaf-color-key="${CSS.escape(leafKey)}"]`);
            if (fresh) openLeafColorPanel(fresh, ownId, nestedId, leafKey, columnLabel, target, kind, viewOn);
        });
    }
    render();
    anchorColorPanel(panel, anchorBtn);
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
            <h3 id="perm-tree-color-dialog-title">${t('admin.masterTreeChooseColor')}</h3>
            <div class="perm-tree-color-tabs">
                <button type="button" class="perm-tree-color-tab perm-tree-color-tab-active" data-tab="std">${t('admin.masterTreeColorTabStandard')}</button>
                <button type="button" class="perm-tree-color-tab" data-tab="custom">${t('admin.masterTreeColorTabCustom')}</button>
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
                    <label>${t('admin.masterTreeColorModel')}</label>
                    <select disabled><option>RGB</option></select>
                </div>
                <div class="perm-tree-color-rgb-grid">
                    <label>${t('admin.masterTreeColorRed')}</label>
                    <input type="number" min="0" max="255" data-role="rgb-r" class="perm-tree-color-rgb-input">
                    <label>${t('admin.masterTreeColorGreen')}</label>
                    <input type="number" min="0" max="255" data-role="rgb-g" class="perm-tree-color-rgb-input">
                    <label>${t('admin.masterTreeColorBlue')}</label>
                    <input type="number" min="0" max="255" data-role="rgb-b" class="perm-tree-color-rgb-input">
                    <label>${t('admin.masterTreeColorHex')}</label>
                    <input type="text" data-role="hex-input" class="perm-tree-color-hex-input">
                </div>
            </div>
            <div class="perm-tree-color-dialog-footer">
                <div style="display:flex; gap:0.7rem;">
                    <div class="perm-tree-color-preview-col">
                        <div class="perm-tree-color-preview-label">${t('admin.masterTreeColorNew')}</div>
                        <div class="perm-tree-color-preview-swatch" data-role="preview-main"></div>
                    </div>
                    <div class="perm-tree-color-preview-col">
                        <div class="perm-tree-color-preview-label">${t('admin.masterTreeColorCurrent')}</div>
                        <div class="perm-tree-color-preview-swatch" data-role="preview-current"></div>
                    </div>
                </div>
                <div class="admin-form-actions">
                    <button type="button" class="btn btn-secondary" data-role="cancel">${t('admin.cancel')}</button>
                    <button type="button" class="btn" data-role="accept">${t('admin.confirmAccept')}</button>
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
    colorDialogEl.querySelector('#perm-tree-color-dialog-title').textContent = t(isText ? 'admin.masterTreeChooseTextColor' : 'admin.masterTreeChooseColor');
    colorDialogEl.__setInitialHex(currentHex);
    colorDialogEl.querySelector('[data-tab="std"]').click();
    colorDialogEl.hidden = false;
}

// "Cambios" dialog -- verbatim adaptation of PermissionTree.js's own
// ensureHistoryDialog/openHistoryDialog/formatHistoryFieldName/
// formatHistoryChange, pointed at this screen's own change-log route.
let historyDialogEl = null;
function formatHistoryFieldName(field) {
    if (field === 'estatus') return t('admin.masterTreeHistoryFieldStatus');
    if (field === 'web') return t('admin.masterTreePlatformWeb');
    if (field === 'app') return t('admin.masterTreePlatformApp');
    if (field === 'clasificacion') return t('admin.masterTreeHistoryFieldClassification');
    if (field === 'color') return t('admin.masterTreeHistoryFieldColor');
    if (field === 'textColor') return t('admin.masterTreeHistoryFieldTextColor');
    return field;
}
function formatHistoryChange(entry) {
    const bool = (v) => (v === 'true' ? t('main.filterActive') : t('main.filterInactive'));
    const statusLabel = (v) => {
        const key = v ? `admin.masterTreeStatus${v.charAt(0).toUpperCase()}${v.slice(1)}` : '';
        const label = key ? t(key) : '';
        return label && label !== key ? label : (v || t('menu.classNone'));
    };
    const none = t('menu.classNone');
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
                        <th>${t('main.changeHistoryDate')}</th>
                        <th>${t('main.changeHistoryUser')}</th>
                        <th>${t('main.changeHistoryRecord')}</th>
                        <th>${t('main.changeHistoryChange')}</th>
                        <th>${t('main.changeHistoryRequestedBy')}</th>
                        <th>${t('main.changeHistoryAuthorizedBy')}</th>
                    </tr></thead>
                    <tbody data-role="list"></tbody>
                </table>
            </div>
            <div class="admin-form-actions" style="margin-top: 1.25rem;">
                <button type="button" class="btn btn-secondary" data-role="close">${t('admin.cancel')}</button>
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
    historyDialogEl.querySelector('[data-role="title"]').textContent = `${t('main.changeHistory')} — ${label}`;
    const list = historyDialogEl.querySelector('[data-role="list"]');
    list.innerHTML = `<tr><td colspan="6">${t('admin.loading')}</td></tr>`;
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
            list.innerHTML = `<tr><td colspan="6">${t('main.changeHistoryEmpty')}</td></tr>`;
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
        list.innerHTML = `<tr><td colspan="6">${t('admin.loadError')}</td></tr>`;
    }
}

function buildLevelBadgeCtx(level) {
    const badge = SAAS_LEVEL_BADGES[level];
    return { readOnlyLabel: t(badge.labelKey), readOnlyColor: badge.color };
}
// Same read-only-badge shape as buildLevelBadgeCtx above, but for a FIXED
// classification (Control Interno, or any classification-group heading
// row) instead of a structural level -- keeps classificationColor's own
// real color for that id, never a <select> (a group row names what it IS,
// nothing to reassign on it directly).
function buildFixedClassificationCtx(classificationId, labelKey) {
    return { readOnlyLabel: t(labelKey), readOnlyColor: classificationColor(classificationId), classificationId };
}
// classificationId -> display labelKey (or, for a custom one, the raw
// name typed when it was created -- t() already falls back to
// returning an unrecognized key unchanged, so no separate "is this a real
// key" branch is needed, see Dashboard.js's own t()).
function resolveSaasClassificationLabel(classificationId) {
    if (classificationId === SAAS_CLASS_CONTROL_INTERNO_ID) return 'menu.classControlInterno';
    if (classificationId === SAAS_CLASS_POR_DEFINIR_ID) return 'menu.classPorDefinir';
    if (classificationId === SAAS_CLASS_ACCIONES_ID) return 'menu.classAcciones';
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
    // Standing option, not tied to controlInterno like Control Interno
    // above -- any table's own columns can have real per-row action
    // buttons worth pulling into their own group, confirmed live.
    options.push({ id: SAAS_CLASS_ACCIONES_ID, labelKey: 'menu.classAcciones' });
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
        showToast(t('admin.saveError'));
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
            const label = picked && picked.isCustom ? t(picked.labelKey) : null;
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
        // A per-row action icon (kind 'table-action') defaults into
        // Acciones instead of Por Definir -- it's inherently an action, no
        // reason to make an admin manually reclassify every one of them
        // the first time they open a screen.
        const defaultClassificationId = leaf.kind === 'table-action' ? SAAS_CLASS_ACCIONES_ID : SAAS_CLASS_POR_DEFINIR_ID;
        const classificationId = override ? override.classificationId : defaultClassificationId;
        // A regular columna/acción reassigned to Control Interno merges
        // into the apartado's own fixed CI block instead (see the
        // ciLeaves/reassignedCiLeaves split in renderApartadoNode) --
        // grouping it here too produced a SECOND "Control Interno" heading
        // on the same Tabla (confirmed live, 2026-09-24: "ahora hay 2
        // clasificaciones de control interno en tabla principal").
        if (classificationId === SAAS_CLASS_CONTROL_INTERNO_ID) return;
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
    input.placeholder = t('admin.masterTreeClassificationCreatePlaceholder');
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'perm-tree-mstatus-class-create-btn';
    confirmBtn.title = t('admin.masterTreeClassificationCreateConfirm');
    confirmBtn.setAttribute('aria-label', confirmBtn.title);
    confirmBtn.innerHTML = '<i class="bx bx-check" aria-hidden="true"></i>';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'perm-tree-mstatus-class-create-btn perm-tree-mstatus-class-create-btn-cancel';
    cancelBtn.title = t('admin.cancel');
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

// A plain reassignable columna/acción/table-action leaf's own pair of
// color overrides -- "esta columna" (col-own:<key>) and "anidados"
// (col-nested:<key>), independent of whichever real classification it
// currently belongs to (its group heading keeps its OWN separate color,
// untouched by this). One trigger icon opens `openLeafColorPanel`, which
// shows the Encabezado/Filas tabs + Fondo/Letra toggle + the same palette
// every color picker in this screen already has, all in one panel -- see
// that function's own comment for why (confirmed live, 2026-09-24, across
// several rounds: single icon, one panel, no separate menu-then-popover).
function buildLeafColorGroup(key, label) {
    const ownId = `col-own:${key}`;
    const nestedId = `col-nested:${key}`;
    const group = document.createElement('div');
    group.className = 'perm-tree-mstatus-leaf-color-group';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'perm-tree-mini-color-btn perm-tree-mini-color-trigger';
    trigger.dataset.leafColorKey = key;
    trigger.innerHTML = '<i class="bx bx-palette" aria-hidden="true"></i>';
    trigger.title = t('admin.masterTreeColumnColorMenu');
    trigger.setAttribute('aria-label', trigger.title);
    trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        openLeafColorPanel(trigger, ownId, nestedId, key, label);
    });
    group.appendChild(trigger);
    return group;
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
        classBadge.style.color = classificationTextColor(classificationCtx.classificationId) || classificationCtx.readOnlyColor;
        classBadge.style.borderColor = classificationCtx.readOnlyColor;
        classBadge.style.backgroundColor = `color-mix(in srgb, ${classificationCtx.readOnlyColor} 14%, var(--color-bg))`;
        // Only a real classification's own group row carries
        // classificationId (see buildFixedClassificationCtx) -- a
        // structural level badge (Grupo/Pantalla/Apartado) isn't a
        // classification and has no color of its own to pick. When it IS
        // one, the two picker buttons live INSIDE this same pill (as its
        // own children, via the -with-actions modifier) instead of as
        // separate siblings trailing after it -- one border/background/
        // fixed width for the whole thing, see Admin.css. Botones is
        // excluded even though it carries a classificationId (kept for the
        // Cambios/history dialog) -- confirmed live, 2026-09-24: color
        // customization is for classifications that group real COLUMNS
        // (Control Interno, Acciones, Por Definir, custom) and for
        // columns themselves, not for the Botones action-button grouping.
        if (classificationCtx.classificationId && classificationCtx.classificationId !== SAAS_CLASS_BOTONES_ID) {
            classBadge.classList.add('perm-tree-mstatus-class-badge-with-actions');
            const labelSpan = document.createElement('span');
            labelSpan.className = 'perm-tree-mstatus-class-badge-label';
            labelSpan.textContent = classificationCtx.readOnlyLabel;
            classBadge.appendChild(labelSpan);

            // One trigger, not two -- clicking it opens the same panel
            // that already lets you pick Fondo/Letra inside, so showing
            // both icons on the badge itself was just showing the same
            // choice twice (confirmed live, 2026-09-24: "por qué tengo
            // los mismos iconos si hacen lo mismo?"). Matches the leaf
            // column trigger's own single-icon treatment (buildLeafColorGroup).
            const colorTriggerBtn = document.createElement('button');
            colorTriggerBtn.type = 'button';
            colorTriggerBtn.className = 'perm-tree-color-picker-btn';
            colorTriggerBtn.dataset.classColorKey = classificationCtx.classificationId;
            colorTriggerBtn.setAttribute('aria-label', t('admin.masterTreeColumnColorMenu'));
            colorTriggerBtn.innerHTML = '<i class="bx bx-palette" aria-hidden="true"></i>';
            colorTriggerBtn.style.color = classificationCtx.readOnlyColor;
            colorTriggerBtn.style.borderColor = classificationCtx.readOnlyColor;
            colorTriggerBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                openClassificationColorPanel(colorTriggerBtn, classificationCtx.classificationId, 'dot');
            });
            classBadge.appendChild(colorTriggerBtn);
        } else {
            classBadge.textContent = classificationCtx.readOnlyLabel;
        }
        classificationCell.appendChild(classBadge);
    } else if (classificationCtx) {
        const selectWrap = document.createElement('div');
        selectWrap.className = 'perm-tree-mstatus-class-select-wrap';
        const classSelect = document.createElement('select');
        classSelect.className = 'perm-tree-mstatus-class-select';
        classificationCtx.options.forEach((opt) => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.id;
            optionEl.textContent = t(opt.labelKey);
            classSelect.appendChild(optionEl);
        });
        if (!classificationCtx.options.some((o) => o.id === classificationCtx.currentId)) {
            const optionEl = document.createElement('option');
            optionEl.value = classificationCtx.currentId;
            optionEl.textContent = classificationCtx.currentId || t('menu.classNone');
            classSelect.appendChild(optionEl);
        }
        const createOptionEl = document.createElement('option');
        createOptionEl.value = CREATE_CLASSIFICATION_VALUE;
        createOptionEl.textContent = t('admin.masterTreeClassificationCreateOption');
        classSelect.appendChild(createOptionEl);
        classSelect.value = classificationCtx.currentId;
        classSelect.title = t('admin.masterTreeClassificationPicker');
        classSelect.setAttribute('aria-label', classSelect.title);
        const currentColor = classificationColor(classificationCtx.currentId);
        // The pill's chrome (border/fill/text color) lives on selectWrap,
        // not on the <select> itself -- the color trigger sits INSIDE the
        // pill (see Admin.css's .perm-tree-mstatus-class-select-wrap), and
        // a <select> can't contain a button.
        selectWrap.style.color = currentColor;
        selectWrap.style.borderColor = currentColor;
        selectWrap.style.backgroundColor = `color-mix(in srgb, ${currentColor} 14%, var(--color-bg))`;
        Array.from(classSelect.options).forEach((optionEl) => {
            optionEl.style.color = optionEl.value === CREATE_CLASSIFICATION_VALUE
                ? 'var(--color-text-secondary)' : classificationColor(optionEl.value);
        });
        classSelect.addEventListener('click', (e) => e.stopPropagation());
        classSelect.addEventListener('change', () => {
            if (classSelect.value === CREATE_CLASSIFICATION_VALUE) renderClassificationCreateUI(classificationCell, classificationCtx);
            else classificationCtx.onPick(classSelect.value);
        });
        // Trigger first in DOM order so tab order matches the visual one
        // (icon at the pill's start, then the <select>).
        selectWrap.appendChild(buildLeafColorGroup(key, label));
        selectWrap.appendChild(classSelect);
        classificationCell.appendChild(selectWrap);
    }
    controls.appendChild(classificationCell);

    const statusCell = document.createElement('div');
    statusCell.className = 'perm-tree-mstatus-status-cell';
    const select = document.createElement('select');
    select.className = `perm-tree-mstatus-select perm-tree-mstatus-select-${state.status}`;
    STATUS_OPTIONS.forEach((opt) => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.textContent = t(opt.labelKey);
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
    nestCell.appendChild(nestBtn('Aplicar Estatus a lo anidado', () => {
        descendantKeys.forEach((k) => setState(k, { ...getState(k), status: select.value }));
        renderList();
    }, !descendantKeys.length));
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
        group.appendChild(nestBtn(`Aplicar ${platform.toUpperCase()} a lo anidado`, () => {
            const value = platform === 'web' ? state.webEnabled : state.appEnabled;
            descendantKeys.forEach((k) => {
                const s = getState(k);
                setState(k, platform === 'web' ? { ...s, webEnabled: value, appEnabled: value ? s.appEnabled : false } : { ...s, appEnabled: value });
            });
            renderList();
        }, !descendantKeys.length));
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
    historyBtn.title = t('main.changeHistory');
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
    // The resize listener below is wired at script-load time, before this
    // shell ever calls SaasMasterTree.render() (unlike the desktop page,
    // where listEl is bound synchronously via getElementById as soon as the
    // script loads) -- a resize firing while the user is on some OTHER
    // section would otherwise crash on a still-unset listEl.
    if (!listEl) return;
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

// Sets --perm-tree-label-col-width (read by .perm-tree-mstatus-label and
// .perm-tree-mstatus-header-label) to the widest CURRENTLY VISIBLE row
// label's own natural width, then gives every row its OWN inline width so
// its label+count-badge combo ends at the SAME x regardless of that row's
// own depth/leading icons -- verbatim port of PermissionTree.js's own
// alignLabelColumnWidth (see its own comment there for the full
// reasoning). This screen used to just fix the label column at 16rem,
// which put a deeper row's count badge measurably right of a shallower
// one's (confirmed live, 2026-09-17, comparing directly against the
// client tree: "todavía se ve desalineado").
let saasMeasureCtx = null;
function measureTextWidth(text, font) {
    if (!saasMeasureCtx) saasMeasureCtx = document.createElement('canvas').getContext('2d');
    saasMeasureCtx.font = font;
    return saasMeasureCtx.measureText(text).width;
}
function alignLabelColumnWidth() {
    const labels = listEl.querySelectorAll('.perm-tree-mstatus-label');
    if (!labels.length) return;
    const treeLeft = listEl.getBoundingClientRect().left;
    let maxRightEdge = 0;
    const measured = [];
    labels.forEach((label) => {
        const labelRect = label.getBoundingClientRect();
        const offsetLeft = labelRect.left - treeLeft;
        const font = getComputedStyle(label).font;
        const badge = label.nextElementSibling && label.nextElementSibling.classList.contains('perm-tree-mstatus-count-badge')
            ? label.nextElementSibling : null;
        const trailing = badge ? badge.getBoundingClientRect().right - labelRect.right : 0;
        const rightEdge = offsetLeft + measureTextWidth(label.textContent, font) + trailing;
        if (rightEdge > maxRightEdge) maxRightEdge = rightEdge;
        measured.push({ label, offsetLeft, trailing });
    });
    const target = Math.ceil(maxRightEdge) + 8;
    const headerLabel = listEl.querySelector('.perm-tree-mstatus-header-label');
    const headerOffsetLeft = headerLabel ? headerLabel.getBoundingClientRect().left - treeLeft : 0;
    listEl.style.setProperty('--perm-tree-label-col-width', `${Math.max(0, target - headerOffsetLeft)}px`);
    measured.forEach(({ label, offsetLeft, trailing }) => {
        label.style.width = `${Math.max(0, target - offsetLeft - trailing)}px`;
    });
}

// A leaf's own toggle -- opt-IN expand (expandedLeaves), opposite polarity
// from toggleBtn's opt-out collapse Set above, since every leaf must
// default to COLLAPSED (see expandedLeaves' own comment for why: opening
// every column's 4 sub-levels at once was confirmed unusable on the
// client tree too).
function leafToggleBtn(key, expanded) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'perm-tree-toggle';
    btn.setAttribute('aria-expanded', String(expanded));
    btn.innerHTML = '<i class="bx bx-chevron-down" aria-hidden="true"></i>';
    btn.addEventListener('click', () => {
        if (expandedLeaves.has(key)) expandedLeaves.delete(key); else expandedLeaves.add(key);
        renderList();
    });
    return btn;
}
// One columna/acción leaf, plus (once its own chevron is opened) its 4
// (or, for an acción, 2) independent grant sub-levels one row deeper --
// same shape PermissionTree.js's own renderStatusColumn gives every real
// column (confirmed live, 2026-09-17: "las columnas no tienen las
// opciones de operar, editar, etc"). dragGroupId is the classification id
// this leaf currently belongs to (null for Control Interno's own fixed
// members, which never reorder) -- reused as-is for the drag `list`
// scope, same convention every other leaf loop here already has.
function renderLeafWithLevels(screen, apartado, leaf, depth, aKey, dragGroupId, classificationCtx, label, nestedApartados, nestedTint) {
    const key = leafKey(screen, apartado, leaf);
    const nested = nestedApartados || [];
    const nestedKeys = nested.flatMap((na) => collectLeafKeysForApartado(screen, na));
    const rollupKeys = [key, ...nestedKeys];
    const levels = (leaf.kind === 'action' || leaf.kind === 'table-action') ? LEAF_ACTION_LEVELS : LEAF_COLUMN_LEVELS;
    const leafTreeKey = `leaf:${key}`;
    const leafExpanded = expandedLeaves.has(leafTreeKey);
    const row = document.createElement('div');
    row.className = `perm-tree-row perm-tree-depth-${depth}`;
    if (dragGroupId !== null) {
        makeDraggable(row, {
            list: `leaves:${aKey}:${dragGroupId}`, id: leaf.suffix,
            onReorder: (fromId, toId) => { order.leavesByApartado[aKey] = reorderList(order.leavesByApartado[aKey] || buildLeaves(apartado).map((l) => l.suffix), fromId, toId); },
        });
        row.appendChild(dragHandle());
    } else {
        row.appendChild(spacer());
    }
    row.appendChild(leafToggleBtn(leafTreeKey, leafExpanded));
    row.appendChild(rollupEl(computeRollup(rollupKeys, 'web'), computeRollup(rollupKeys, 'app')));
    const labelElNode = labelEl(leaf.label);
    row.appendChild(labelElNode);
    row.appendChild(countBadge(1 + nested.reduce((sum, na) => sum + nestedChildItemCount(screen, na), 0)));
    row.appendChild(buildControls(key, nestedKeys, screen.href, classificationCtx, label));
    listEl.appendChild(row);
    // This leaf's own "esta columna" override (col-own:key, see
    // buildLeafColorGroup) always wins on THIS row -- it's a single-row
    // color, never cascaded. Falling back to the incoming nestedTint (an
    // ANCESTOR's own "anidados" pick) when this leaf has no own override,
    // since this row is itself one of that ancestor's descendants. A
    // "anidados" override set on THIS SAME leaf (below) never colors this
    // row -- only what hangs off it.
    const ownTint = ownColorTint(key);
    const rowTint = ownTint || nestedTint || null;
    if (rowTint) {
        if (rowTint.bg) row.style.backgroundColor = rowTint.bg;
        if (rowTint.text) labelElNode.style.color = rowTint.text;
    }
    if (!leafExpanded) return;
    // This leaf's own "anidados" override, else whatever nestedTint it
    // itself inherited from further up -- an explicit override on THIS
    // leaf always wins over one inherited from an ancestor, and either
    // way it's what now applies to everything rendered under it (its own
    // permission sub-levels below, and its nested modal apartado, if any).
    const ownNestedTint = nestedColorTint(key) || nestedTint || null;
    if (nested.length) {
        nested.forEach((childApartado) => renderApartadoNode(screen, childApartado, depth + 1, { draggable: false, nestedTint: ownNestedTint }));
    }
    // Read-only echo of the SAME classification this column's own row just
    // showed -- never its own picker/select (nothing to reassign one
    // level down), same convention the client tree's own
    // levelClassificationCtx has.
    const echoCtx = classificationCtx ? {
        readOnlyLabel: classificationCtx.readOnlyLabel !== undefined ? classificationCtx.readOnlyLabel : t(resolveSaasClassificationLabel(classificationCtx.currentId)),
        readOnlyColor: classificationCtx.readOnlyColor !== undefined ? classificationCtx.readOnlyColor : classificationColor(classificationCtx.currentId),
    } : null;
    levels.forEach((level) => {
        const levelKey = `${key}/${level.id}`;
        const levelLabel = t(level.labelKey);
        const levelRow = document.createElement('div');
        levelRow.className = `perm-tree-row perm-tree-depth-${depth + 1}`;
        levelRow.appendChild(spacer());
        levelRow.appendChild(spacer());
        levelRow.appendChild(rollupEl(computeRollup([levelKey], 'web'), computeRollup([levelKey], 'app')));
        const levelLabelNode = labelEl(levelLabel);
        levelRow.appendChild(levelLabelNode);
        levelRow.appendChild(countBadge(1));
        levelRow.appendChild(buildControls(levelKey, [], null, echoCtx, levelLabel));
        if (ownNestedTint) {
            if (ownNestedTint.bg) levelRow.style.backgroundColor = ownNestedTint.bg;
            if (ownNestedTint.text) levelLabelNode.style.color = ownNestedTint.text;
        }
        listEl.appendChild(levelRow);
    });
}

// One Apartado's own row (a real Tabla, or a plain Modal-only apartado),
// plus -- once its own chevron is opened -- its Control Interno block and
// classification groups. Recursive: a "modal-*" apartado nested under one
// of ITS HOST's own columns/classification (see SaasAdminCatalog.js's own
// nestUnder, e.g. "Modal: Color Institucional" nesting under Nuestros
// Clientes' Tabla -- confirmed live, 2026-09-23: a modal always pops up
// FROM a column/action that already exists in the table, so it renders
// nested under that trigger instead of as a flat sibling apartado) renders
// through this exact same function, one level deeper and non-draggable --
// same rendering either way, only its position/reorderability differ.
function renderApartadoNode(screen, apartado, depth, opts) {
    const draggable = !!(opts && opts.draggable);
    // Tint inherited from an ancestor leaf's own "anidados" pick (see
    // ownNestedTint in renderLeafWithLevels) -- this whole apartado is one
    // of that leaf's descendants when set, so it (and everything it in
    // turn renders below) picks it up too, all the way down until a
    // deeper node's own col-own/col-nested override takes over for just
    // its own sub-branch.
    const nestedTint = (opts && opts.nestedTint) || null;
    const aKey = apartadoKey(screen, apartado);

    // "Iconos Personalización" -- only a real Tabla (apartado.controlInterno)
    // ever gets this sibling (see the original comment this was lifted
    // from); no nested modal apartado is ever controlInterno, so this never
    // fires for one.
    if (apartado.controlInterno) {
        const iconLeafKeys = ICON_PERSONALIZATION_ITEMS.map((icon) => `${aKey}::icon-${icon.id}`);
        const iconsKey = `${aKey}::icons`;
        const iconsCtx = buildLevelBadgeCtx('icono');
        const iconsRow = document.createElement('div');
        iconsRow.className = `perm-tree-row perm-tree-depth-${depth}`;
        iconsRow.appendChild(spacer());
        iconsRow.appendChild(toggleBtn(`cls:${iconsKey}`, !collapsed.has(`cls:${iconsKey}`)));
        iconsRow.appendChild(rollupEl(computeRollup(iconLeafKeys, 'web'), computeRollup(iconLeafKeys, 'app')));
        const iconsLabelNode = labelEl(t('menu.iconsPersonalization'));
        iconsRow.appendChild(iconsLabelNode);
        iconsRow.appendChild(countBadge(iconLeafKeys.length));
        iconsRow.appendChild(buildControls(iconsKey, iconLeafKeys, screen.href, iconsCtx, t('menu.iconsPersonalization')));
        if (nestedTint) {
            if (nestedTint.bg) iconsRow.style.backgroundColor = nestedTint.bg;
            if (nestedTint.text) iconsLabelNode.style.color = nestedTint.text;
        }
        listEl.appendChild(iconsRow);
        if (!collapsed.has(`cls:${iconsKey}`)) {
            ICON_PERSONALIZATION_ITEMS.forEach((icon) => {
                const iconKey = `${aKey}::icon-${icon.id}`;
                const iconRow = document.createElement('div');
                iconRow.className = `perm-tree-row perm-tree-depth-${depth + 1}`;
                iconRow.appendChild(spacer());
                iconRow.appendChild(spacer());
                iconRow.appendChild(rollupEl(computeRollup([iconKey], 'web'), computeRollup([iconKey], 'app')));
                const iconLabelNode = labelEl(t(icon.labelKey));
                iconRow.appendChild(iconLabelNode);
                iconRow.appendChild(countBadge(1));
                iconRow.appendChild(buildControls(iconKey, [], screen.href, iconsCtx, t(icon.labelKey)));
                if (nestedTint) {
                    if (nestedTint.bg) iconRow.style.backgroundColor = nestedTint.bg;
                    if (nestedTint.text) iconLabelNode.style.color = nestedTint.text;
                }
                listEl.appendChild(iconRow);
            });
        }
    }

    // Nested children (modal-* apartados whose nestUnder.host is THIS
    // apartado's own id, see SaasAdminCatalog.js) -- grouped by which real
    // column pops them up (nestUnder.column) vs. which classification they
    // fall into when no column applies (nestUnder.classification, e.g. a
    // modal opened from a generic per-row action button rather than from
    // one of this Tabla's own named columns).
    const nestedByColumn = buildNestedByColumn(screen, apartado);
    const nestedByClassification = buildNestedByClassification(screen, apartado);

    // Every other leaf (columna/acción) groups by its effective
    // classification -- but "Por Definir Clasificación" itself never gets a
    // heading row: on this screen it's not a handful of stray leftovers,
    // it's EVERY leaf until an admin actually reclassifies one, so wrapping
    // it in a collapsible group just repeated the same label on every
    // single line underneath for no benefit. Those leaves render flat, at
    // their original depth, each still individually reassignable via its
    // own select -- only a REAL classification (a custom one, or one that
    // has a nested modal of its own, see below) earns a group heading.
    const apartadoGroups = getEffectiveApartadoGroups(screen, apartado);
    // A classification with nothing but a nested modal (no real
    // columna/acción of its own reclassified into it yet) still needs its
    // own heading row to hang that modal off of --
    // getEffectiveApartadoGroups only ever returns groups that already
    // have a real leaf.
    nestedByClassification.forEach((_, classificationId) => {
        if (!apartadoGroups.some((g) => g.classificationId === classificationId)) {
            apartadoGroups.push({ classificationId, leaves: [] });
        }
    });
    // A "modal-*" apartado with nothing but acciones (its acciones already
    // live in the screen's own Botones row, see buildActionLeaves/
    // screenActionEntries) has NOTHING of its own to show once opened --
    // giving it a chevron anyway rendered a control that visibly did
    // nothing when clicked (confirmed live, 2026-09-23: "el modal no
    // contrae nada"). Only a real Tabla, or a modal that itself has
    // columnas (e.g. "Modal: Cambios de Anexos") or a nested child of its
    // own, gets an expand toggle at all.
    const hasOwnBody = apartado.controlInterno || apartadoGroups.some((g) => g.leaves.length > 0) || nestedByColumn.size > 0 || nestedByClassification.size > 0;

    const apLeafKeys = collectLeafKeysForApartado(screen, apartado);
    const apRow = document.createElement('div');
    apRow.className = `perm-tree-row perm-tree-depth-${depth}`;
    if (draggable) {
        makeDraggable(apRow, {
            list: `apartados:${screen.itemId}`, id: apartado.id,
            onReorder: (fromId, toId) => { order.apartadosByScreen[screen.itemId] = reorderList(order.apartadosByScreen[screen.itemId] || screen.apartados.map((a) => a.id), fromId, toId); },
        });
        apRow.appendChild(dragHandle());
    } else {
        apRow.appendChild(spacer());
    }
    apRow.appendChild(hasOwnBody ? toggleBtn(`a:${aKey}`, !collapsed.has(`a:${aKey}`)) : spacer());
    apRow.appendChild(rollupEl(computeRollup(apLeafKeys, 'web'), computeRollup(apLeafKeys, 'app')));
    const apLabelNode = labelEl(apartado.label);
    apRow.appendChild(apLabelNode);
    apRow.appendChild(countBadge(apartadoItemCount(screen, apartado)));
    // Same href as the screen's own row, not null -- confirmed live that
    // only the top screen row having a working Navegar button, with every
    // Apartado/Columna underneath showing an empty cell, read as broken
    // rather than intentional. Every row within a screen now jumps to that
    // same screen (there's no separate URL for one of its own columns to
    // navigate to).
    apRow.appendChild(buildControls(aKey, apLeafKeys, screen.href, buildLevelBadgeCtx(apartado.controlInterno ? 'tabla' : 'apartado'), apartado.label));
    if (nestedTint) {
        if (nestedTint.bg) apRow.style.backgroundColor = nestedTint.bg;
        if (nestedTint.text) apLabelNode.style.color = nestedTint.text;
    }
    listEl.appendChild(apRow);
    if (!hasOwnBody || collapsed.has(`a:${aKey}`)) return;

    // Control Interno -- a real classification group like any other
    // (toggle + color pickers), holding the 13 real system columns
    // (CONTROL_INTERNO_COLUMNS) as members instead of one opaque
    // placeholder leaf. A regular columna/acción an admin manually
    // reassigned to Control Interno (via its own <select>, same as
    // reassigning to Acciones or a custom classification) merges in here
    // too -- fixedCiLeaves stay read-only/non-draggable like always,
    // reassignedCiLeaves keep their own real reassignment <select> (an
    // admin can still move one back out to Por Definir/Acciones later),
    // scoped to their own drag group so they only reorder among themselves.
    if (apartado.controlInterno) {
        const fixedCiLeaves = buildLeaves(apartado).filter((l) => l.kind === 'ci');
        const reassignedCiLeaves = buildLeaves(apartado).filter((l) => l.kind !== 'ci'
            && classificationOverrides.get(leafKey(screen, apartado, l))?.classificationId === SAAS_CLASS_CONTROL_INTERNO_ID);
        const ciLeaves = [...fixedCiLeaves, ...reassignedCiLeaves];
        const ciLeafKeys = ciLeaves.map((l) => leafKey(screen, apartado, l));
        const ciGroupKey = `${aKey}::class::${SAAS_CLASS_CONTROL_INTERNO_ID}`;
        const ciCtx = buildFixedClassificationCtx(SAAS_CLASS_CONTROL_INTERNO_ID, 'menu.classControlInterno');
        const ciRow = document.createElement('div');
        ciRow.className = `perm-tree-row perm-tree-depth-${depth + 1} perm-tree-row-classification`;
        ciRow.appendChild(spacer());
        ciRow.appendChild(toggleBtn(`cls:${ciGroupKey}`, !collapsed.has(`cls:${ciGroupKey}`)));
        ciRow.appendChild(rollupEl(computeRollup(ciLeafKeys, 'web'), computeRollup(ciLeafKeys, 'app')));
        const ciLabelNode = labelEl(t('menu.classControlInterno'));
        ciRow.appendChild(ciLabelNode);
        ciRow.appendChild(countBadge(groupItemCount(screen, ciLeaves, nestedByColumn, null)));
        ciRow.appendChild(buildControls(ciGroupKey, ciLeafKeys, screen.href, ciCtx, t('menu.classControlInterno')));
        if (nestedTint) {
            if (nestedTint.bg) ciRow.style.backgroundColor = nestedTint.bg;
            if (nestedTint.text) ciLabelNode.style.color = nestedTint.text;
        }
        listEl.appendChild(ciRow);
        if (!collapsed.has(`cls:${ciGroupKey}`)) {
            fixedCiLeaves.forEach((leaf) => {
                renderLeafWithLevels(screen, apartado, leaf, depth + 2, aKey, null, ciCtx, leaf.label, nestedByColumn.get(leaf.label), nestedTint);
            });
            reassignedCiLeaves.forEach((leaf) => {
                const key = leafKey(screen, apartado, leaf);
                renderLeafWithLevels(screen, apartado, leaf, depth + 2, aKey, SAAS_CLASS_CONTROL_INTERNO_ID, buildClassificationCtx(key, SAAS_CLASS_CONTROL_INTERNO_ID, screen, apartado), leaf.label, nestedByColumn.get(leaf.label), nestedTint);
            });
        }
    }

    // "Por Definir" now gets the same heading row as any other
    // classification (toggle + color pickers) instead of rendering its
    // members flat -- confirmed live, 2026-09-24: mixing a real group
    // heading (Control Interno) with unheaded leaves at the same depth
    // made the hierarchy unclear. Always rendered first among the groups
    // below, matching where it already sat visually.
    const porDefinirGroup = apartadoGroups.find((g) => g.classificationId === SAAS_CLASS_POR_DEFINIR_ID);
    const otherGroups = apartadoGroups.filter((g) => g.classificationId !== SAAS_CLASS_POR_DEFINIR_ID);
    const orderedApartadoGroups = porDefinirGroup ? [porDefinirGroup, ...otherGroups] : otherGroups;

    orderedApartadoGroups.forEach((clsGroup) => {
        const groupKey = `${aKey}::class::${clsGroup.classificationId}`;
        const nestedForGroup = nestedByClassification.get(clsGroup.classificationId) || [];
        const groupLeafKeys2 = clsGroup.leaves.map((leaf) => leafKey(screen, apartado, leaf))
            .concat(nestedForGroup.flatMap((na) => collectLeafKeysForApartado(screen, na)));
        const groupLabelKey = resolveSaasClassificationLabel(clsGroup.classificationId);
        const clsRow = document.createElement('div');
        clsRow.className = `perm-tree-row perm-tree-depth-${depth + 1} perm-tree-row-classification`;
        clsRow.appendChild(spacer());
        clsRow.appendChild(toggleBtn(`cls:${groupKey}`, !collapsed.has(`cls:${groupKey}`)));
        clsRow.appendChild(rollupEl(computeRollup(groupLeafKeys2, 'web'), computeRollup(groupLeafKeys2, 'app')));
        const clsLabelNode = labelEl(t(groupLabelKey));
        clsRow.appendChild(clsLabelNode);
        clsRow.appendChild(countBadge(groupItemCount(screen, clsGroup.leaves, nestedByColumn, nestedForGroup)));
        clsRow.appendChild(buildControls(groupKey, groupLeafKeys2, screen.href, buildFixedClassificationCtx(clsGroup.classificationId, groupLabelKey), t(groupLabelKey)));
        if (nestedTint) {
            if (nestedTint.bg) clsRow.style.backgroundColor = nestedTint.bg;
            if (nestedTint.text) clsLabelNode.style.color = nestedTint.text;
        }
        listEl.appendChild(clsRow);
        if (collapsed.has(`cls:${groupKey}`)) return;

        clsGroup.leaves.forEach((leaf) => {
            const key = leafKey(screen, apartado, leaf);
            renderLeafWithLevels(screen, apartado, leaf, depth + 2, aKey, clsGroup.classificationId, buildClassificationCtx(key, clsGroup.classificationId, screen, apartado), leaf.label, nestedByColumn.get(leaf.label), nestedTint);
        });
        nestedForGroup.forEach((childApartado) => renderApartadoNode(screen, childApartado, depth + 2, { draggable: false, nestedTint }));
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
    const labelHeaderText = document.createElement('span');
    labelHeaderText.textContent = 'Pantalla / Apartado / Columna';
    // Title for the count badge (see countBadge above) -- same treatment
    // as the client tree's own header, right-aligned inside this same box.
    const labelHeaderCount = document.createElement('span');
    labelHeaderCount.className = 'perm-tree-mstatus-header-count';
    labelHeaderCount.textContent = t('admin.masterTreeColCount');
    labelHeader.append(labelHeaderText, labelHeaderCount);
    header.appendChild(labelHeader);
    const controls = document.createElement('div');
    controls.className = 'perm-tree-mstatus-header-controls';
    // Icon + visible label on every column, same treatment
    // buildStatusTreeHeader gives the client tree's own header (confirmed
    // live: a bare/empty header column read as "incompleto" next to it --
    // the nest column in particular had no icon OR label at all before
    // this fix). Icons match whatever each column's own row-level button
    // already uses on THIS screen (bx-copy for aplicar-a-anidados,
    // bx-link-external for Navegar, bx-history for Cambios -- see
    // nestBtn/buildControls above), not necessarily the client tree's own
    // icon choice where the two screens' row buttons already differ.
    const classCol = document.createElement('span');
    classCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-class';
    classCol.innerHTML = `<i class="bx bx-purchase-tag-alt" aria-hidden="true"></i> ${t('admin.masterTreeColClassification')}`;
    classCol.title = t('admin.masterTreeColClassification');
    controls.appendChild(classCol);
    const statusCol = document.createElement('span');
    statusCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-status';
    statusCol.textContent = t('admin.masterTreeColStatus');
    controls.appendChild(statusCol);
    const nestCol = document.createElement('span');
    nestCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-status-nest';
    nestCol.innerHTML = `<i class="bx bx-copy" aria-hidden="true"></i> ${t('admin.masterTreeColApplyNested')}`;
    nestCol.title = t('admin.masterTreeColApplyNested');
    controls.appendChild(nestCol);
    const platformsCol = document.createElement('span');
    platformsCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-platforms';
    platformsCol.textContent = t('admin.masterTreeColPlatforms');
    controls.appendChild(platformsCol);
    const navCol = document.createElement('span');
    navCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-navigate';
    navCol.innerHTML = `<i class="bx bx-link-external" aria-hidden="true"></i> ${t('admin.masterTreeColNavigate')}`;
    navCol.title = t('admin.masterTreeColNavigate');
    controls.appendChild(navCol);
    const historyCol = document.createElement('span');
    historyCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-history';
    historyCol.innerHTML = `<i class="bx bx-history" aria-hidden="true"></i> ${t('admin.masterTreeColHistory')}`;
    historyCol.title = t('admin.masterTreeColHistory');
    controls.appendChild(historyCol);
    header.appendChild(controls);
    return header;
}

function renderList() {
    // Same guard as drawGuides() above -- the 'dashboard:language-changed'
    // listener below is also wired at script-load time, before render() has
    // necessarily run.
    if (!listEl) return;
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
    generalRow.appendChild(labelEl(t('admin.saasMasterTreeGeneral')));
    generalRow.appendChild(countBadge(GENERAL_ITEMS.length + screensItemCount(CATALOG.flatMap((g) => g.screens))));
    // Points at the very first screen overall -- General spans every
    // screen, so there's no single natural destination, but confirmed with
    // the user every row needs a real, clickable Navegar button, same as
    // the real Árbol de Permisos Maestro gives its own Departamento-level
    // rows (not just Pantalla ones).
    // Same "Estructura Web" special-case the client tree's own General row
    // gets (reused key, not a SaaS-specific synonym) -- General here is
    // likewise the whole app shell, not a real Grupo like Servicio a
    // Cliente/Config. SaaS (confirmed live, 2026-09-17).
    generalRow.appendChild(buildControls('__general__', allLeafKeys, CATALOG[0].screens[0].href, { readOnlyLabel: t('admin.masterTreeGeneralClassification'), readOnlyColor: SAAS_LEVEL_BADGES.apartado.color }, t('admin.saasMasterTreeGeneral')));
    listEl.appendChild(generalRow);

    if (!collapsed.has('gen:main')) {
        // "Accesos Generales" -- its own separate group nested under
        // General (not General itself, which stays the whole-tree kill
        // switch), holding just Inicio/Panel/Tablero, mirroring the exact
        // grouping the client tree already gives these same 3 items via
        // GENERAL_ITEM_IDS/sidebar.generalAccess (confirmed live,
        // 2026-09-17: "deben ser un anidado de accesos generales").
        const gaLeafKeys = GENERAL_ITEMS.map((i) => i.itemId);
        const gaRow = document.createElement('div');
        gaRow.className = 'perm-tree-row perm-tree-depth-1';
        gaRow.appendChild(spacer());
        gaRow.appendChild(toggleBtn('ga:main', !collapsed.has('ga:main')));
        gaRow.appendChild(rollupEl(computeRollup(gaLeafKeys, 'web'), computeRollup(gaLeafKeys, 'app')));
        gaRow.appendChild(labelEl(t('sidebar.generalAccess')));
        gaRow.appendChild(countBadge(gaLeafKeys.length));
        gaRow.appendChild(buildControls('ga:main', gaLeafKeys, GENERAL_ITEMS.find((i) => i.href)?.href || null, buildLevelBadgeCtx('apartado'), t('sidebar.generalAccess')));
        listEl.appendChild(gaRow);

        if (!collapsed.has('ga:main')) {
            GENERAL_ITEMS.forEach((item) => {
                const itemRow = document.createElement('div');
                itemRow.className = 'perm-tree-row perm-tree-depth-2';
                // No dragHandle/toggle -- never reorderable, no children of
                // its own, same GENERAL_ITEM_IDS treatment the real tree
                // gives Inicio/Panel/Tablero (spacer() keeps column
                // alignment).
                itemRow.appendChild(spacer());
                itemRow.appendChild(spacer());
                itemRow.appendChild(rollupEl(computeRollup([item.itemId], 'web'), computeRollup([item.itemId], 'app')));
                itemRow.appendChild(labelEl(t(item.labelKey)));
                itemRow.appendChild(countBadge(1));
                itemRow.appendChild(buildControls(item.itemId, [], item.href, buildLevelBadgeCtx('pantalla'), t(item.labelKey)));
                listEl.appendChild(itemRow);
            });
        }
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
        groupRow.appendChild(labelEl(t(group.labelKey)));
        groupRow.appendChild(countBadge(screensItemCount(group.screens)));
        // Confirmed against a real Departamento row (Comité Directivo) in
        // Árbol de Permisos Maestro: every row gets its own Estatus/Web-App
        // controls AND a working Navegar button, not just a read-only
        // rollup -- points at this group's own first screen, same
        // first-screen fallback General uses just above.
        groupRow.appendChild(buildControls(group.groupId, groupLeafKeys, group.screens[0].href, buildLevelBadgeCtx('apartado'), t(group.labelKey)));
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
            screenRow.appendChild(labelEl(t(screen.labelKey)));
            screenRow.appendChild(countBadge(screensItemCount([screen])));
            screenRow.appendChild(buildControls(screen.itemId, screenLeafKeys, screen.href, buildLevelBadgeCtx('pantalla'), t(screen.labelKey)));
            listEl.appendChild(screenRow);
            if (collapsed.has(`s:${screen.itemId}`)) return;

            const screenApartados = orderedApartados(screen);

            // "Botones" -- ONE sibling per PANTALLA, not per apartado. Most
            // screens split their real UI into a main Tabla plus several
            // "modal-*" entries (see SaasAdminCatalog.js -- one entry per
            // popup dialog the screen opens, e.g. Nuestros Clientes has 4:
            // Permisos Contratados/Adicionales, Cambios de Anexos, Color
            // Institucional, Acceso Administrador), and several of those
            // modals carry their own acciones array. This used to render
            // one "Botones" row PER apartado that had acciones, so a
            // screen with 4 such modals showed 4 separate "Botones" rows
            // in a column -- confirmed live: "porque aparecen 2 opciones
            // de botones, en una pantalla?". A screen's buttons are one
            // concept regardless of which internal modal they live in, so
            // every apartado's acciones combine into ONE group here, keyed
            // by the SCREEN itself (not any one apartado) -- each leaf's
            // own key still comes from ITS OWN apartado (leafKey), so
            // already-saved Estatus stays valid unchanged.
            const screenActionEntries = screenApartados.flatMap((apartado) => (
                apartado.acciones && apartado.acciones.length
                    ? buildActionLeaves(apartado).map((leaf) => ({ apartado, leaf }))
                    : []
            ));
            if (screenActionEntries.length) {
                const actionLeafKeys = screenActionEntries.map(({ apartado, leaf }) => leafKey(screen, apartado, leaf));
                const botonesKey = `${screen.itemId}::botones`;
                const botonesCtx = buildFixedClassificationCtx(SAAS_CLASS_BOTONES_ID, 'menu.classBotones');
                const botonesRow = document.createElement('div');
                botonesRow.className = 'perm-tree-row perm-tree-depth-2 perm-tree-row-classification';
                botonesRow.appendChild(spacer());
                botonesRow.appendChild(toggleBtn(`cls:${botonesKey}`, !collapsed.has(`cls:${botonesKey}`)));
                botonesRow.appendChild(rollupEl(computeRollup(actionLeafKeys, 'web'), computeRollup(actionLeafKeys, 'app')));
                botonesRow.appendChild(labelEl(t('menu.classBotones')));
                botonesRow.appendChild(countBadge(actionLeafKeys.length));
                botonesRow.appendChild(buildControls(botonesKey, actionLeafKeys, screen.href, botonesCtx, t('menu.classBotones')));
                listEl.appendChild(botonesRow);
                if (!collapsed.has(`cls:${botonesKey}`)) {
                    screenActionEntries.forEach(({ apartado, leaf }) => {
                        renderLeafWithLevels(screen, apartado, leaf, 3, apartadoKey(screen, apartado), null, botonesCtx, leaf.label);
                    });
                }
            }

            screenApartados.filter((apartado) => !apartado.nestUnder).forEach((apartado) => {
                renderApartadoNode(screen, apartado, 2, { draggable: true });
            });
        });
    });

    alignLabelColumnWidth();

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
        errorEl.textContent = t('admin.loadError');
        errorEl.hidden = false;
    }
}

async function onSaveClick() {
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
        showToast(t('main.changeSaved'));
    } catch {
        errorEl.textContent = t('admin.saveError');
        errorEl.hidden = false;
    } finally {
        saveBtn.disabled = false;
    }
}

document.addEventListener('dashboard:language-changed', renderList);
window.addEventListener('resize', () => setTimeout(drawGuides, 0));

// Factory entry point for this shell -- mirrors PermissionTree.js's own
// create()/init() shape instead of the desktop file's auto-running bottom
// IIFE, since AppAdminInicio.js's renderSection() builds every section's
// DOM dynamically into one shared contentEl rather than having static
// per-section HTML/ids to hang onto (see loadSaasMasterTree there). No
// role-gate here (unlike the desktop file's own Dashboard.initDashboard
// call) -- the shell already restricts the whole Panel Admin to admin
// users before any section ever renders.
window.SaasMasterTree = {
    async render(container) {
        container.innerHTML = '';

        const actions = document.createElement('div');
        actions.className = 'admin-form-actions';
        saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn';
        saveBtn.textContent = t('admin.save');
        saveBtn.addEventListener('click', onSaveClick);
        actions.appendChild(saveBtn);
        container.appendChild(actions);

        errorEl = document.createElement('div');
        errorEl.className = 'admin-error';
        errorEl.setAttribute('role', 'alert');
        errorEl.hidden = true;
        container.appendChild(errorEl);

        listEl = document.createElement('div');
        // .perm-tree is what actually gives this box its border/padding/
        // scroll behavior on this shell (same class loadMasterTree's own
        // treeWrap already relies on for the client tree) -- the desktop
        // page gets the same box shape from its own .saas-master-status-list
        // rule instead, scoped to its wider .saas-master-tree-panel layout,
        // which doesn't apply here.
        listEl.className = 'saas-master-status-list perm-tree';
        container.appendChild(listEl);

        const subtitle = document.createElement('p');
        subtitle.className = 'admin-subtitle';
        subtitle.textContent = t('admin.saasMasterTreeSubtitle');
        container.appendChild(subtitle);

        try {
            await load();
        } catch (err) {
            console.error('Admin (Árbol Maestro SaaS) failed to initialize:', err);
        }
    },
};

})();
