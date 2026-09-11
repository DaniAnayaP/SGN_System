// ---------------------------------------------------------------------------
// Reusable Departamento > Área > Apartado > Pantalla > Columna checkbox
// tree, built from data/menu.json. Used by both Business-Roles.html
// (Puesto de Trabajo grants) and Business-Usuarios.html (per-user Permisos
// Adicionales).
//
// Internally, state is always stored EXPANDED at the leaf (pantalla) level —
// simpler and more robust than trying to track partial/broad grants during
// editing. Checking a módulo or apartado checkbox just checks/unchecks all
// of its leaves; indeterminate state shows when only some are checked.
// getGrants() returns one row per checked leaf: { sectionId, itemId,
// submenuId } (submenuId null for leaf items with no submenu).
// ---------------------------------------------------------------------------

(function () {
    function keyOf(sectionId, itemId, submenuId) {
        return `${sectionId}::${itemId || ''}::${submenuId || ''}`;
    }

    // Accepts grants saved in either leaf form or broader form (whole
    // section/item) and resolves whether a given leaf is covered.
    function isGranted(rawSet, sectionId, itemId, submenuId) {
        if (rawSet.has(keyOf(sectionId, itemId, submenuId))) return true;
        if (itemId && rawSet.has(keyOf(sectionId, itemId, null))) return true;
        if (rawSet.has(keyOf(sectionId, null, null))) return true;
        return false;
    }

    function t(key, params) {
        return window.Dashboard ? window.Dashboard.t(key, params) : key;
    }

    // Every department section id maps 1:1 to one of these menu.* keys —
    // can't derive the label from section.items[0] anymore (see loadMenuData
    // below: department sections are just placeholders now, their items
    // come from the shared areaCategories template instead).
    const SECTION_LABEL_KEYS = {
        finance: 'menu.finance',
        accounting: 'menu.accounting',
        'human-resources': 'menu.humanResources',
        marketing: 'menu.marketing',
        commercial: 'menu.commercial',
        purchasing: 'menu.purchasing',
        'supply-chain': 'menu.supplyChain',
        'management-control': 'menu.managementControl',
        'general-management': 'menu.generalManagement',
        'steering-committee': 'menu.steeringCommittee',
        certifications: 'menu.certifications',
        'org-empresa': 'menu.orgEmpresa',
    };

    function sectionLabelKey(section) {
        if (section.id === 'main') return 'menu.mainSection';
        return SECTION_LABEL_KEYS[section.id] || section.id;
    }

    // Árbol de Permisos Maestro's 4 possible statuses (see the statusMode
    // option on create() below). Deliberately a separate vocabulary from
    // the grant/checkbox system above: a status answers "does this feature
    // exist / is it ready to sell", never "does this client/plan/sector
    // have access to it" -- that's still what grantSet/getGrants() answer.
    const DEFAULT_STATUS = 'habilitado';
    const STATUS_OPTIONS = [
        { value: 'habilitado', labelKey: 'admin.masterTreeStatusHabilitado' },
        { value: 'inhabilitado', labelKey: 'admin.masterTreeStatusInhabilitado' },
        { value: 'construccion', labelKey: 'admin.masterTreeStatusConstruccion' },
        { value: 'mejoras', labelKey: 'admin.masterTreeStatusMejoras' },
    ];
    // Progressively shorter labels for the same 4 known values -- same
    // "step down until it fits" idea as the sidebar's abbrKeys ladder (see
    // applySubmenuAbbreviations in Dashboard.js), just applied to a
    // <select>'s own options instead of a plain label. Rewrites every
    // option together (not just the selected one) so the OPEN dropdown
    // always shows the same wording the closed box does -- simpler than a
    // custom control, and fine for only 4 fixed words everyone already
    // knows the meaning of. First entry always matches STATUS_OPTIONS'
    // own labelKey above (the un-abbreviated form).
    // Last rung of the ladder -- a single symbol instead of any text at
    // all, confirmed with the user for whatever's still too tight even
    // for "Habil.". A native <select>'s options can only hold plain text,
    // not a real icon font glyph (unlike the Web/App monitor/phone
    // silhouettes), so this is a Unicode symbol rather than a drawn icon
    // -- visually just as compact, still literally text under the hood.
    const STATUS_LADDER_KEYS = {
        habilitado: ['admin.masterTreeStatusHabilitado', 'admin.masterTreeStatusHabilitadoMed', 'admin.masterTreeStatusHabilitadoShort', 'admin.masterTreeStatusHabilitadoIcon'],
        inhabilitado: ['admin.masterTreeStatusInhabilitado', 'admin.masterTreeStatusInhabilitadoShort', 'admin.masterTreeStatusInhabilitadoIcon'],
        construccion: ['admin.masterTreeStatusConstruccion', 'admin.masterTreeStatusConstruccionMed', 'admin.masterTreeStatusConstruccionShort', 'admin.masterTreeStatusConstruccionIcon'],
        mejoras: ['admin.masterTreeStatusMejoras', 'admin.masterTreeStatusMejorasShort', 'admin.masterTreeStatusMejorasIcon'],
    };

    // Cached at module scope (not per create() instance) -- menu.json is a
    // static file that never changes within a page's lifetime, and screens
    // like Admin-BusinessSectors.js's own department/área reorder now call
    // getDepartmentCatalog/getAreaCatalog repeatedly (once per department)
    // without ever instantiating a tree, which would otherwise mean one
    // redundant fetch per call.
    let menuDataCache = null;
    async function loadMenuData() {
        if (menuDataCache) return menuDataCache;
        const res = await fetch('data/menu.json');
        if (!res.ok) throw new Error('failed to load menu.json');
        menuDataCache = await res.json();
        return menuDataCache;
    }

    // Departamento id + translated label, with none of the área/categoría
    // resolution create()/init() do below -- a screen that only needs the
    // Departamento list (e.g. Admin-BusinessSectors.js's own
    // Reordenar-Departamentos screen) doesn't need a whole tree instance to
    // get it. 'main' excluded, same as departmentOrder's own convention
    // (Inicio/Tablero/Administración del Negocio isn't a real Departamento).
    async function getDepartmentCatalog() {
        const { sections } = await loadMenuData();
        return sections.filter((s) => s.id !== 'main').map((s) => ({ id: s.id, label: t(sectionLabelKey(s)) }));
    }

    // Fallback área list for the 8 departments with no named areas of their
    // own (see AREAS_BY_DEPARTMENT/GENERIC_AREAS in Dashboard.js — this is a
    // deliberate hand-kept-in-sync duplicate, same as data/menu.json's own
    // "areas" key for the 3 departments that DO have real areas; touching
    // Dashboard.js's own live, synchronous área picker to source this from
    // menu.json instead was judged more risk than it's worth for this task).
    const GENERIC_AREAS = [
        { id: 'area-1', labelKey: 'menu.area.generic', labelParams: { n: 1 } },
        { id: 'area-2', labelKey: 'menu.area.generic', labelParams: { n: 2 } },
        { id: 'area-3', labelKey: 'menu.area.generic', labelParams: { n: 3 } },
    ];

    // Área id + translated label for one department, same lightweight idea
    // as getDepartmentCatalog above (no submenu/categoría resolution) --
    // used by Admin-BusinessSectors.js's own Área-reorder screen, which
    // needs área names without building a tree.
    async function getAreaCatalog(sectionId) {
        const { areas } = await loadMenuData();
        const deptAreas = (areas && areas[sectionId]) || GENERIC_AREAS;
        return deptAreas.map((area) => ({ id: area.id, label: t(area.labelKey, area.labelParams) }));
    }

    // Every department's Inicio/Panel/Tablero -- always depth-1 items
    // alongside its real áreas (see generalItems below), but core
    // navigation rather than a Giro/Plan-facing "Área", so never
    // draggable/reorderable (see isRealArea in renderStatusTree).
    const GENERAL_ITEM_IDS = ['home', 'panel', 'dashboard'];

    // Reorders `list` (in place) to match `orderIds` as closely as
    // possible: anything named in orderIds comes first, in that order;
    // anything in `list` but NOT mentioned in orderIds keeps its original
    // relative position, appended after -- so an item added to menu.json
    // after an order was last saved is never silently dropped. Shared by
    // departmentOrder (below) and areaOrder (see sectionsData's own
    // construction further down) rather than duplicating this per level.
    function applyOrder(list, orderIds) {
        if (!orderIds || !orderIds.length) return list;
        const byId = new Map(list.map((item) => [item.id, item]));
        const ordered = [];
        orderIds.forEach((id) => {
            if (byId.has(id)) {
                ordered.push(byId.get(id));
                byId.delete(id);
            }
        });
        list.forEach((item) => {
            if (byId.has(item.id)) ordered.push(item);
        });
        return ordered;
    }

    // Each área within a department gets its OWN resolved category list —
    // an área-specific submenu override (menu.json's areaOverrides, keyed
    // "<sectionId>/<areaId>") REPLACES that category's generic Cat 1/Cat
    // 2-style placeholder for THIS área only (unlike the old
    // department-wide merge, a given pantalla now belongs to exactly one
    // área, matching the real sidebar/breadcrumb).
    function categoriesForArea(sectionId, areaId, categories, areaOverrides) {
        const overrides = areaOverrides && areaOverrides[`${sectionId}/${areaId}`];
        if (!overrides) return categories;
        return categories.map((cat) => (
            overrides[cat.id] && overrides[cat.id].length ? { ...cat, submenu: overrides[cat.id] } : cat
        ));
    }

    // A submenu entry can itself have a submenu (e.g. "Administración del
    // Negocio" nested inside "Configuración", with its own 9 pantallas) —
    // that third level's leaf keys normally use a compound "parentId/leafId"
    // as the submenuId, still fitting the existing 3-field {sectionId,
    // itemId, submenuId} grant shape without a schema change. A grandchild
    // marked `standalone` (e.g. Departamento/Área/C. Costos/Salir nested
    // under "Configuración de Botones") is really its OWN independent
    // top-level item just displayed deeper — it keeps its own itemId as the
    // key instead of the compound form, so it stays interchangeable with
    // whatever else already checks that same grant (e.g. the double-gate
    // with MODULE_CATALOG in Dashboard.js).
    // A subSm can itself have a submenu too (e.g. "Registros de Combustible"
    // nested inside "Centros de Costo" ... "Configuración de Botones" —
    // A pantalla that has its own "Tabla" of columns (colFuelPlates etc.)
    // does NOT expand into per-column leaves here — a column's 4
    // permission options (Solo Ver/Ver y Operar/Editar/Autorizar) are a
    // fundamentally different kind of choice (at most 1-2 of them make
    // sense checked at once, never "all of them") and would break every
    // ancestor's all-checked/indeterminate math if counted the same way as
    // a normal grantable leaf. The pantalla itself stays exactly one leaf,
    // same as any pantalla without a table — see renderTableColumns(),
    // which renders and tracks that whole sub-tree completely separately,
    // outside of leafKeysUnder/expand/the section-and-up rollup chain.
    function leafKeysUnder(section, item) {
        if (item.submenu && item.submenu.length) {
            return item.submenu.flatMap((sm) => (
                sm.submenu && sm.submenu.length
                    ? sm.submenu.map((subSm) => (
                        subSm.standalone
                            ? keyOf(section.id, subSm.id, null)
                            : keyOf(section.id, item.id, `${sm.id}/${subSm.id}`)
                    ))
                    : [keyOf(section.id, item.id, sm.id)]
            ));
        }
        return [keyOf(section.id, item.id, null)];
    }

    // Same leaf enumeration as leafKeysUnder, scoped to just ONE Apartado
    // (sm) instead of every one under the whole Área -- statusMode's own
    // rollup/"aplicar anidados" need this at the Apartado level too
    // (Catálogos/Operaciones/Admin/... each have their own Pantallas
    // nested under them), not just at Departamento/Área.
    function leafKeysUnderSm(section, item, sm) {
        if (sm.submenu && sm.submenu.length) {
            return sm.submenu.map((subSm) => (
                subSm.standalone
                    ? keyOf(section.id, subSm.id, null)
                    : keyOf(section.id, item.id, `${sm.id}/${subSm.id}`)
            ));
        }
        return [keyOf(section.id, item.id, sm.id)];
    }

    // Module keys that gate an individual 'main'-section top-bar button —
    // same catalog as MODULE_CATALOG in db.js minus the department keys
    // (those gate a whole section instead, handled separately below). Only
    // consulted in readOnly mode, to mark a button "bloqueado" when the
    // client hasn't contracted it, same double-gate Dashboard.js's
    // TOP_BAR_BUTTONS already enforces at render time for real users.
    const MAIN_MODULE_ITEM_IDS = [
        'btn-mensajes', 'btn-chatbot', 'btn-notificaciones', 'btn-marcadores',
        'btn-configuracion', 'btn-datos-usuario', 'btn-datos-usuario-negocio',
        'btn-departamento', 'btn-area', 'btn-cc',
    ];

    // readOnly + enabledModuleKeys turn this into a pure "what does this
    // client have contracted" viewer (see Admin-SaaS.js openAdminAccessModal)
    // — every checkbox becomes a non-interactive habilitado/bloqueado status
    // badge instead, and allowedSectionIds is ignored (the whole tree shows,
    // not just the contracted slice), since the point is to see what's
    // blocked too, not just what's available.
    // showAppTab: only Business-Roles.js (profile grants) and
    // Business-Accesos.js (per-user extra grants) pass this — it's what a
    // CLIENT's grants look like, so it doesn't make sense for Admin-Planes'
    // plan-grants tree (a Plan isn't tied to any one client/sector anymore,
    // see the Nuestras APPs redesign — plans.app_id is dead).
    // departmentOrder: an optional array of department sectionIds in the
    // order they should render (see Admin-ArbolMaestro.js/
    // Admin-BusinessSectors.js's own "Reordenar" screen) -- purely a
    // display-order override applied to the SAME sections menu.json
    // already returns, computed once in init() below and left completely
    // alone by every other caller (undefined here, unchanged behavior).
    // 'main' (Inicio/Tablero/Administración del Negocio -- core navigation,
    // not a Giro/Plan-facing "Departamento") is never reordered by this.
    function create(container, { allowedSectionIds = null, costCenters = [], readOnly = false, enabledModuleKeys = null, showAppTab = false, statusMode = false, departmentOrder = null, areaOrder = null, apartadoOrder = null, pantallaOrder = null, columnOrder = null, costCurrency = 'MXN' } = {}) {
        // Shown inside every $ Web/$ App input (see buildCostInput below) --
        // purely a label, never affects the number stored/sent; the caller
        // (Admin-ArbolMaestro.js) is the one that actually knows/persists
        // which currency the values are in (master_cost_settings in db.js).
        const costCurrencySymbol = { MXN: '$', USD: '$', EUR: '€' }[costCurrency] || '$';
        // statusMode (Árbol de Permisos Maestro) is a completely separate,
        // much simpler mode: no grants, no rollup/indeterminate math, no
        // App-visibility column, no cost-center/module filtering -- GEIPSA
        // needs to see and set a status on literally every node in the
        // system regardless of any one client's contract. Forcing those
        // other options off up front makes the shared tree-building code in
        // init() below (which normally reacts to them) behave exactly as if
        // the caller had simply never passed them.
        if (statusMode) {
            allowedSectionIds = null;
            costCenters = [];
            enabledModuleKeys = null;
            showAppTab = false;
        }
        let sectionsData = [];
        // Departamento/Área drag-reorder (statusMode/Árbol Maestro only --
        // see statusRow's dragCtx param and renderStatusTree below). Plain
        // module-scope state, same pattern grantSet/statusMap already use;
        // dragging never touches sectionsData's actual CONTENTS, only a
        // list's own order, so nothing else this file computes from it
        // (grants, statuses, labels) needs to change. One shared
        // draggedNode (not a separate variable per level) so a drag started
        // on one level can never be accidentally dropped as if it were
        // another (see the kind check in statusRow).
        let draggedNode = null;
        function reorderInPlace(list, draggedId, targetId) {
            if (draggedId === targetId) return false;
            const draggedIdx = list.findIndex((s) => s.id === draggedId);
            if (draggedIdx === -1) return false;
            const [moved] = list.splice(draggedIdx, 1);
            const targetIdx = list.findIndex((s) => s.id === targetId);
            if (targetIdx === -1) {
                list.splice(draggedIdx, 0, moved);
                return false;
            }
            list.splice(targetIdx, 0, moved);
            return true;
        }
        function reorderDepartments(draggedId, targetId) {
            return reorderInPlace(sectionsData, draggedId, targetId);
        }
        // Áreas only ever reorder among their OWN department's siblings
        // (confirmed with the user: never across departments) -- sectionId
        // scopes the splice to that one department's own items array, which
        // also holds Inicio/Panel/Tablero (GENERAL_ITEM_IDS, never
        // draggable -- see the isRealArea guard in renderStatusTree) ahead
        // of the real áreas; reorderInPlace only ever matches on área ids,
        // so that leading block never moves.
        function reorderAreas(sectionId, draggedId, targetId) {
            const section = sectionsData.find((s) => s.id === sectionId);
            if (!section) return false;
            return reorderInPlace(section.items, draggedId, targetId);
        }
        // Same idea one level deeper -- an Apartado (a "Catálogos"/
        // "Operaciones"/... category, see categoriesForArea) only ever
        // reorders among the OTHER apartados of that SAME área, never
        // across áreas or departments. area.submenu holds nothing but real
        // apartado entries (unlike section.items, there's no
        // GENERAL_ITEM_IDS-style leading block to worry about here).
        function reorderApartados(sectionId, areaId, draggedId, targetId) {
            const section = sectionsData.find((s) => s.id === sectionId);
            const area = section && section.items.find((i) => i.id === areaId);
            if (!area || !area.submenu) return false;
            return reorderInPlace(area.submenu, draggedId, targetId);
        }
        // One level deeper still -- a Pantalla only ever reorders among the
        // OTHER pantallas of that SAME apartado, never across apartados,
        // áreas or departments.
        function reorderPantallas(sectionId, areaId, apartadoId, draggedId, targetId) {
            const section = sectionsData.find((s) => s.id === sectionId);
            const area = section && section.items.find((i) => i.id === areaId);
            const apartado = area && area.submenu && area.submenu.find((sm) => sm.id === apartadoId);
            if (!apartado || !apartado.submenu) return false;
            return reorderInPlace(apartado.submenu, draggedId, targetId);
        }
        // Columna only ever reorders within its own Clasificación (e.g.
        // "Control Interno"'s 13 columns among themselves) -- a standalone
        // column (one with no Clasificación wrapper, e.g. "Autorización
        // para Eliminar") never drags, same as every level above guards a
        // group that genuinely has nothing else in it: in practice a
        // Pantalla only ever has one or two such standalone columns, so
        // there's nothing real to reorder there.
        function reorderColumns(sectionId, areaId, apartadoId, pantallaId, classId, draggedId, targetId) {
            const section = sectionsData.find((s) => s.id === sectionId);
            const area = section && section.items.find((i) => i.id === areaId);
            const apartado = area && area.submenu && area.submenu.find((sm) => sm.id === apartadoId);
            const subSm = apartado && apartado.submenu && apartado.submenu.find((p) => p.id === pantallaId);
            const cls = subSm && subSm.submenu && subSm.submenu.find((entry) => entry.isClassification && entry.id === classId);
            if (!cls || !cls.submenu) return false;
            return reorderInPlace(cls.submenu, draggedId, targetId);
        }
        let grantSet = new Set();
        // statusMode's own state -- a Map from the same keyOf(...) key
        // vocabulary above to a {status, webEnabled, appEnabled} object. A
        // key absent from this map simply means every column is at its
        // default (see getNodeState below), same "only exceptions get
        // stored" convention as master_permission_status itself (see
        // db.js) -- never populated/read outside statusMode.
        let statusMap = new Map();
        // Snapshot of statusMap as of the last load/save -- lets each
        // checkbox tell "changed since last save" (see buildPlatformCheckbox's
        // pending-added/pending-removed classes) apart from "already saved
        // this way". Same shape/convention as statusMap, refreshed via
        // setBaseline() below (called from init() and again by
        // Admin-ArbolMaestro.js right after a successful PUT).
        let baselineMap = new Map();
        // Árbol Maestro's own $ Web / $ App cost per node (statusMode only)
        // -- same keyOf(...) vocabulary and sparse "absent = 0" convention
        // as statusMap above (see master_permission_cost in db.js). Shown
        // on Departamento/Área/Apartado/Pantalla/Columna rows (showCost
        // param on statusRow, see renderStatusTree/renderStatusColumn) --
        // Ícono and Clasificación never get their own price, same as
        // plan_permission_costs/PermissionCostTree.js never price those
        // either.
        let costMap = new Map();
        // key -> the human label shown on that row, filled in as
        // statusRow renders each one -- lets a caller (Admin-ArbolMaestro.js's
        // confirm-changes screen) turn a bare {sectionId,itemId,submenuId}
        // back into the same name the admin actually saw, via getStatusLabel
        // below, without re-walking the tree itself.
        let statusLabelMap = new Map();
        // Which depth-0 sections and depth-1 items are expanded — set once
        // in init() (anything already granted starts open so it's not
        // hidden; everything else starts collapsed), then toggled freely by
        // the chevron buttons from there. Collapsing/expanding never
        // touches grantSet, so it can't change what's actually saved.
        let expandedSections = new Set();
        let expandedItems = new Set();
        // { app: {id,name,sector,icon,colorFrom,colorTo} | null, screens: [...] }
        // — this client's assigned App (see GET /api/business/app-screens),
        // fetched once in init() when showAppTab is on. screens carry the
        // exact Web path (sectionId/itemId/submenuPrefix) TABLE_GRANT_PATHS
        // already resolved server-side, which is also what tells us which
        // Web leaves are even ELIGIBLE for App — see isAppEligibleKey below.
        let appInfo = { app: null, screens: [] };
        // Only true once we know this client actually has an App with at
        // least one screen (see init()) — until then every row renders
        // exactly like before App existed, no locked/disabled App column
        // cluttering a client who never contracted one.
        let appColumnEnabled = false;
        const treeRoot = container;
        // Estatus ladder (see applyStatusAbbreviations) only cares about
        // the tree's own width, which a plain re-render never re-checks --
        // window resize is the one thing that can change it without also
        // triggering a render on its own.
        // Resizing the window AFTER load (not just loading fresh at a given
        // width -- exactly what Chrome DevTools' device-toolbar does, and
        // what a real user resizing their browser does too) can leave
        // treeRoot scrolled to a non-zero horizontal position on its own
        // (scroll anchoring / the browser trying to keep something in
        // view during the reflow) -- applyStatusAbbreviations alone never
        // corrected that, only a full renderStatusTree() did (see its own
        // scrollLeft reset), and a resize never triggers that. This is
        // almost certainly the real cause behind "the label's own start is
        // cut off, Estatus/Web·App still fully visible" reports -- a
        // fresh page load at a narrow width never showed it locally, only
        // resizing an already-loaded wider page down did.
        if (statusMode) window.addEventListener('resize', () => {
            applyStatusAbbreviations();
            treeRoot.scrollLeft = 0;
        });

        function isModuleEnabled(moduleKey) {
            return !enabledModuleKeys || enabledModuleKeys.includes(moduleKey);
        }

        // Web and App visibility are stored side by side in the SAME
        // grantSet, as the exact same {sectionId,itemId,submenuId} triple
        // used for Web, just with this suffix baked into the submenuId —
        // `keyOf('main','btn-x','foo')` (Web) vs `keyOf('main','btn-x','foo')
        // + APP_SUFFIX` (App visibility for that same node). No schema or
        // getGrants()/expand() change needed: split('::') still yields
        // exactly 3 parts (the suffix has no '::' in it), so an App row
        // round-trips through the server as an ordinary-looking grant.
        const APP_SUFFIX = '#app';

        // Does this Web leaf key sit under a pantalla/general-button this
        // client's App actually has a screen for? Mirrors the old
        // isWebScreenGranted's prefix match, but against appInfo.screens
        // (the sector-based catalog from Nuestras APPs) instead of grantSet
        // — a column/icon key is eligible whenever its own pantalla is.
        // A column/icon key's own field id, once the pantalla's submenuPrefix
        // is stripped off the front — column keys end in "/solo-ver" (see
        // renderColumnRow) and may pass through a classification segment
        // (e.g. "class-control-interno") on the way, which the catalog
        // never names its columns by, so only the segment right before
        // "/solo-ver" is the real field id; an icon key has no such suffix
        // and is already exactly one segment.
        function fieldKeyFromSubmenuId(submenuId, submenuPrefix) {
            const rest = submenuId.slice(submenuPrefix.length + 1);
            if (rest.endsWith('/solo-ver')) {
                const parts = rest.slice(0, -'/solo-ver'.length).split('/');
                return parts[parts.length - 1];
            }
            return rest;
        }

        // Screen-level eligibility (does this client's App even have a
        // screen for this pantalla) plus, for a column/icon key specifically,
        // field-level eligibility against that screen's own curated list in
        // Nuestras APPs (see saas_app_screen_fields in db.js) — an empty
        // list there means "not curated yet", so everything under the
        // pantalla stays eligible rather than locking out every column
        // until GEIPSA visits that screen's checklist.
        function isAppEligibleKey(webKey) {
            if (!appColumnEnabled) return false;
            const [sectionId, itemId, submenuId] = webKey.split('::');
            const screen = appInfo.screens.find((s) => {
                if (s.sectionId !== sectionId || s.itemId !== itemId) return false;
                if (submenuId === s.submenuPrefix) return true;
                return !!s.submenuPrefix && submenuId.startsWith(`${s.submenuPrefix}/`);
            });
            if (!screen) return false;
            if (submenuId === screen.submenuPrefix) return true;
            if (!screen.enabledFields || !screen.enabledFields.length) return true;
            return screen.enabledFields.includes(fieldKeyFromSubmenuId(submenuId, screen.submenuPrefix));
        }

        // Builds the App-column toggle for buildRow, shared by every level
        // (Departamento down to Ícono) — pass the node's own Web leaf key
        // wrapped in a 1-element array for a true leaf, or its full
        // leafKeysUnder rollup for a container; the math is identical
        // either way. Only the subset that's BOTH App-eligible AND
        // currently Web-granted is actionable — toggling a container only
        // ever touches that subset, never forces Web on to make room for it.
        function computeAppToggle(leafKeys) {
            if (!appColumnEnabled) return null;
            const actionable = leafKeys.filter((k) => grantSet.has(k) && isAppEligibleKey(k));
            const appOnCount = actionable.filter((k) => grantSet.has(k + APP_SUFFIX)).length;
            return {
                checked: actionable.length > 0 && appOnCount === actionable.length,
                indeterminate: appOnCount > 0 && appOnCount < actionable.length,
                disabled: readOnly || actionable.length === 0,
                // "Igualar con Web" for this row/group -- see
                // equalizeAllAppToWeb below for why this is a separate
                // operation from onChange right above (which only ever
                // touches leaves already actionable, so a leaf that lost
                // its Web grant or its App eligibility while its App flag
                // stayed on from before would never get cleared by it).
                equalize: !readOnly && leafKeys.some((k) => grantSet.has(k) || grantSet.has(k + APP_SUFFIX))
                    ? () => {
                        leafKeys.forEach((k) => {
                            if (grantSet.has(k) && isAppEligibleKey(k)) grantSet.add(k + APP_SUFFIX);
                            else grantSet.delete(k + APP_SUFFIX);
                        });
                        render();
                    }
                    : null,
                // Additive-only sibling of equalize above -- turns on App
                // wherever Web is granted and eligible but App isn't yet,
                // and never touches anything else. For a tree where someone
                // already hand-picked extra App-only grants on top of Web
                // (equalize would wipe those), this fills the gaps without
                // undoing that manual work. Only shown when there's
                // actually a gap to fill.
                fillMissing: !readOnly && leafKeys.some((k) => grantSet.has(k) && isAppEligibleKey(k) && !grantSet.has(k + APP_SUFFIX))
                    ? () => {
                        leafKeys.forEach((k) => {
                            if (grantSet.has(k) && isAppEligibleKey(k)) grantSet.add(k + APP_SUFFIX);
                        });
                        render();
                    }
                    : null,
                onChange: (checked) => {
                    actionable.forEach((k) => (checked ? grantSet.add(k + APP_SUFFIX) : grantSet.delete(k + APP_SUFFIX)));
                    render();
                },
            };
        }

        // Modal-wide "Igualar todo" button (exposed publicly below). Walks
        // grantSet itself rather than re-deriving every leaf key from
        // sectionsData: every Web grant already in grantSet that's also
        // App-eligible needs its App sibling turned on, and every
        // #app-suffixed key already there whose own Web key either isn't
        // granted or isn't App-eligible needs clearing -- together that's
        // the entire universe equalizeAllAppToWeb could need to touch.
        function equalizeAllAppToWeb() {
            if (!appColumnEnabled || readOnly) return;
            Array.from(grantSet).forEach((k) => {
                if (k.endsWith(APP_SUFFIX)) {
                    const base = k.slice(0, -APP_SUFFIX.length);
                    if (!(grantSet.has(base) && isAppEligibleKey(base))) grantSet.delete(k);
                } else if (isAppEligibleKey(k)) {
                    grantSet.add(k + APP_SUFFIX);
                }
            });
            render();
        }

        // Modal-wide sibling of the "fillMissing" per-row handler above --
        // same additive-only rule, whole tree at once. Never clears an
        // App-suffixed key, unlike equalizeAllAppToWeb.
        function fillAllMissingAppToWeb() {
            if (!appColumnEnabled || readOnly) return;
            Array.from(grantSet).forEach((k) => {
                if (!k.endsWith(APP_SUFFIX) && isAppEligibleKey(k)) grantSet.add(k + APP_SUFFIX);
            });
            render();
        }

        function expand(grants) {
            const rawSet = new Set(grants.map((g) => keyOf(g.sectionId, g.itemId, g.submenuId)));
            const expanded = new Set();
            sectionsData.forEach((section) => {
                section.items.forEach((item) => {
                    leafKeysUnder(section, item).forEach((leafKey) => {
                        const [sectionId, itemId, submenuId] = leafKey.split('::');
                        if (isGranted(rawSet, sectionId, itemId || null, submenuId || null)) {
                            expanded.add(leafKey);
                        }
                    });
                });
            });
            return expanded;
        }

        // Small paired checkbox appended after the Web label on any row
        // that has one — appToggle is whatever computeAppToggle() returned
        // (null when this client has no App column at all). Kept out of
        // readOnly's status-badge branch on purpose: nobody asked for an
        // App status view in the read-only contract viewer yet.
        function appendAppToggle(row, appToggle) {
            if (!appToggle) return;
            const label = document.createElement('label');
            label.className = 'perm-tree-app-toggle';
            label.title = t('main.appVisionColumn');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = appToggle.checked;
            input.indeterminate = appToggle.indeterminate;
            input.disabled = appToggle.disabled;
            input.addEventListener('change', () => appToggle.onChange(input.checked));
            const icon = document.createElement('i');
            icon.className = 'bx bx-mobile-alt';
            icon.setAttribute('aria-hidden', 'true');
            label.append(input, icon);
            row.appendChild(label);
            if (appToggle.equalize) {
                const eqBtn = document.createElement('button');
                eqBtn.type = 'button';
                eqBtn.className = 'perm-tree-app-equalize-btn';
                eqBtn.title = t('main.appEqualizeRow');
                eqBtn.setAttribute('aria-label', t('main.appEqualizeRow'));
                eqBtn.innerHTML = '<i class="bx bx-copy" aria-hidden="true"></i>';
                eqBtn.addEventListener('click', appToggle.equalize);
                row.appendChild(eqBtn);
            }
            if (appToggle.fillMissing) {
                const fillBtn = document.createElement('button');
                fillBtn.type = 'button';
                fillBtn.className = 'perm-tree-app-equalize-btn';
                fillBtn.title = t('main.appFillMissingRow');
                fillBtn.setAttribute('aria-label', t('main.appFillMissingRow'));
                fillBtn.innerHTML = '<i class="bx bx-list-plus" aria-hidden="true"></i>';
                fillBtn.addEventListener('click', appToggle.fillMissing);
                row.appendChild(fillBtn);
            }
        }

        // toggle is null for leaf rows (no children to expand) — they get an
        // invisible spacer instead, so every row's checkbox/status badge
        // still lines up regardless of depth. `blocked` is only meaningful
        // in readOnly mode (see create()'s readOnly option) — draws a
        // habilitado/bloqueado status badge instead of a checkbox, and
        // returns input:null since there's nothing to check/toggle.
        // `appToggle` (see computeAppToggle) adds the paired App checkbox
        // to the right of the Web one — every level from Departamento down
        // to Ícono can carry one, not just pantallas as before.
        function buildRow(labelText, depth, toggle, blocked, appToggle) {
            const row = document.createElement('div');
            row.className = `perm-tree-row perm-tree-depth-${depth}`;
            if (readOnly && blocked) row.classList.add('perm-tree-row-blocked');

            if (toggle) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'perm-tree-toggle';
                btn.setAttribute('aria-expanded', String(toggle.expanded));
                const icon = document.createElement('i');
                icon.className = 'bx bx-chevron-down';
                icon.setAttribute('aria-hidden', 'true');
                btn.appendChild(icon);
                btn.addEventListener('click', () => {
                    toggle.onToggle();
                    render();
                });
                row.appendChild(btn);
            } else {
                const spacer = document.createElement('span');
                spacer.className = 'perm-tree-toggle-spacer';
                row.appendChild(spacer);
            }

            if (readOnly) {
                const status = document.createElement('span');
                status.className = `perm-tree-status ${blocked ? 'perm-tree-status-blocked' : 'perm-tree-status-enabled'}`;
                const statusIcon = document.createElement('i');
                statusIcon.className = blocked ? 'bx bx-lock-alt' : 'bx bx-check';
                statusIcon.setAttribute('aria-hidden', 'true');
                status.appendChild(statusIcon);
                const label = document.createElement('span');
                label.className = 'perm-tree-status-label';
                label.textContent = labelText;
                row.append(status, label);
                return { row, input: null };
            }

            const label = document.createElement('label');
            label.className = 'perm-tree-check';
            const input = document.createElement('input');
            input.type = 'checkbox';
            const span = document.createElement('span');
            span.textContent = labelText;
            label.append(input, span);
            row.appendChild(label);
            appendAppToggle(row, appToggle);

            return { row, input };
        }

        // Unchecking a Web key also drops its App-visibility sibling (see
        // APP_SUFFIX above) — "App can't stay enabled without Web" applies
        // uniformly, at every level, through this one shared spot instead
        // of repeating the cascade at each of the checkbox handlers below.
        function setKeys(keys, checked) {
            keys.forEach((k) => {
                if (checked) grantSet.add(k);
                else { grantSet.delete(k); grantSet.delete(k + APP_SUFFIX); }
            });
        }

        // "Solo Ver"/"Ver y Operar"/"Editar" are mutually exclusive (a
        // column can be in at most one of these 3 modes at a time) —
        // "Autorizar" is a fully independent 4th toggle, combinable with
        // any of the 3 (or with none). All 4 are still ordinary grant
        // leaves in profile_grants/user_grants — the mutual exclusion is
        // purely a UI behavior here, not a different storage shape.
        const COLUMN_LEVELS = [
            { id: 'solo-ver', labelKey: 'main.permSoloVer' },
            { id: 'ver-y-operar', labelKey: 'main.permVerYOperar' },
            { id: 'editar', labelKey: 'main.permEditar' },
        ];
        const COLUMN_AUTHORIZE = { id: 'autorizar', labelKey: 'main.permAutorizar' };
        // Same independent-5th-toggle treatment as Autorizar -- see
        // canDeleteColumn in db.js for what actually reads this leaf.
        const COLUMN_ELIMINAR = { id: 'eliminar', labelKey: 'main.permEliminar' };
        const COLUMN_LEVEL_ICONS = { 'ver-y-operar': 'bx-play', editar: 'bx-edit', autorizar: 'bx-shield-check', eliminar: 'bx-trash' };

        // Ver y Operar/Editar/Autorizar as one connected row instead of 3
        // stacked plain checkboxes — the user's own complaint looking at
        // this exact picker in Nuestros Planes: "no se ven bien, como
        // secuencia". A chevron between each pair is purely decorative
        // (they're still independently toggleable, Autorizar especially),
        // just enough to read as one related progression rather than 3
        // disconnected list rows. readOnly mode swaps each checkbox for a
        // small status badge, same information buildRow's own badge branch
        // already shows elsewhere in this file.
        function buildLevelSequenceRow(depth, items) {
            const row = document.createElement('div');
            row.className = `perm-tree-row perm-tree-depth-${depth}`;
            const spacer = document.createElement('span');
            spacer.className = 'perm-tree-toggle-spacer';
            row.appendChild(spacer);
            const group = document.createElement('div');
            group.className = 'perm-tree-level-group';
            items.forEach((item, i) => {
                if (i > 0) {
                    const sep = document.createElement('i');
                    sep.className = 'bx bx-chevron-right perm-tree-level-sep';
                    sep.setAttribute('aria-hidden', 'true');
                    group.appendChild(sep);
                }
                if (readOnly) {
                    const span = document.createElement('span');
                    span.className = `perm-tree-level-item perm-tree-level-item-readonly${item.checked ? ' perm-tree-level-item-on' : ''}`;
                    const icon = document.createElement('i');
                    icon.className = `bx ${item.checked ? 'bx-check-circle' : item.icon}`;
                    icon.setAttribute('aria-hidden', 'true');
                    const text = document.createElement('span');
                    text.textContent = item.label;
                    span.append(icon, text);
                    group.appendChild(span);
                    return;
                }
                const label = document.createElement('label');
                label.className = 'perm-tree-level-item';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = item.checked;
                input.disabled = item.disabled;
                input.addEventListener('change', () => item.onChange(input.checked));
                const icon = document.createElement('i');
                icon.className = `bx ${item.icon}`;
                icon.setAttribute('aria-hidden', 'true');
                const text = document.createElement('span');
                text.textContent = item.label;
                label.append(input, icon, text);
                group.appendChild(label);
            });
            row.appendChild(group);
            return row;
        }

        // One toggle row for a column + (when expanded) its 4 permission
        // leaves, keyed off an arbitrary `base` submenuId prefix — shared by
        // plain columns (base = sm/subSm/col) and columns nested inside a
        // classification group (base = sm/subSm/class/col, see
        // renderClassificationGroup below). Entirely separate from
        // leafKeysUnder/expand/the section-and-up rollup chain (see
        // leafKeysUnder's comment for why).
        function renderColumnRow(container, section, item, base, col, depth, subBlocked) {
            const colTreeKey = `col::${section.id}::${item.id}::${base}`;
            const colExpanded = expandedItems.has(colTreeKey);
            const soloVerKey = keyOf(section.id, item.id, `${base}/solo-ver`);
            // The column's own row reflects "does this column have ANY of
            // the 3 mutually exclusive levels" -- not just Solo Ver -- so
            // raising it straight to Ver y Operar/Editar from the expanded
            // row below doesn't make this checkbox look like access got
            // REMOVED (it used to read only the Solo Ver key, so choosing
            // Operar visually unchecked it even though Operar implies you
            // can still see it). Expanding it reveals Ver y Operar/Editar
            // plus the independent Autorizar toggle. Clicking it straight
            // ON (from fully off) grants the Solo Ver baseline, same as
            // before; clicking it OFF clears whichever of the 3 was
            // actually active, so the box never lies about there being
            // some access left behind it.
            const colRow = buildRow(t(col.labelKey, col.labelParams), depth, {
                expanded: colExpanded,
                onToggle: () => {
                    if (colExpanded) expandedItems.delete(colTreeKey);
                    else expandedItems.add(colTreeKey);
                },
            }, subBlocked, computeAppToggle([soloVerKey]));
            if (!readOnly) {
                const levelKeys = COLUMN_LEVELS.map((level) => keyOf(section.id, item.id, `${base}/${level.id}`));
                colRow.input.checked = levelKeys.some((k) => grantSet.has(k));
                colRow.input.addEventListener('change', () => {
                    setKeys(colRow.input.checked ? [soloVerKey] : levelKeys, colRow.input.checked);
                    render();
                });
            }
            container.appendChild(colRow.row);
            if (!colExpanded) return;

            const authKey = keyOf(section.id, item.id, `${base}/${COLUMN_AUTHORIZE.id}`);
            const deleteKey = keyOf(section.id, item.id, `${base}/${COLUMN_ELIMINAR.id}`);
            const items = [
                ...COLUMN_LEVELS.filter((level) => level.id !== 'solo-ver').map((level) => {
                    const levelKey = keyOf(section.id, item.id, `${base}/${level.id}`);
                    return {
                        icon: COLUMN_LEVEL_ICONS[level.id],
                        label: t(level.labelKey),
                        checked: grantSet.has(levelKey),
                        disabled: subBlocked,
                        onChange: (checked) => {
                            if (checked) {
                                // Uncheck the other 2 mutually-exclusive levels for this column.
                                COLUMN_LEVELS.forEach((other) => {
                                    if (other.id === level.id) return;
                                    grantSet.delete(keyOf(section.id, item.id, `${base}/${other.id}`));
                                });
                                setKeys([levelKey], true);
                            } else {
                                // Ver y Operar/Editar are escalating tiers ON
                                // TOP of Solo Ver, not a raise-then-nothing
                                // toggle -- turning one off always falls back
                                // to the Solo Ver baseline instead of leaving
                                // the column with zero access.
                                setKeys([levelKey], false);
                                setKeys([soloVerKey], true);
                            }
                            render();
                        },
                    };
                }),
                {
                    icon: COLUMN_LEVEL_ICONS.autorizar,
                    label: t(COLUMN_AUTHORIZE.labelKey),
                    checked: grantSet.has(authKey),
                    disabled: subBlocked,
                    onChange: (checked) => { setKeys([authKey], checked); render(); },
                },
                {
                    icon: COLUMN_LEVEL_ICONS.eliminar,
                    label: t(COLUMN_ELIMINAR.labelKey),
                    checked: grantSet.has(deleteKey),
                    disabled: subBlocked,
                    onChange: (checked) => { setKeys([deleteKey], checked); render(); },
                },
            ];
            container.appendChild(buildLevelSequenceRow(depth + 1, items));
        }

        // A classification (e.g. "Control Interno") groups several columns
        // under one expandable row with its own checkbox — checking it
        // grants "solo-ver" on every column inside at once (the admin can
        // still open each column afterward and raise it individually);
        // unchecking clears all of them. This is the first place a click
        // above Columna cascades into Columna's own sub-levels — every
        // other container's "checked" state (Departamento/Área/Apartado/
        // Pantalla) rolls up from leafKeysUnder, which stops before Columna
        // on purpose (see its comment), so this rollup is computed locally
        // instead of reusing that function.
        function renderClassificationGroup(container, section, item, sm, subSm, cls, subBlocked) {
            const classBase = `${sm.id}/${subSm.id}/${cls.id}`;
            const classLeafKeys = cls.submenu.map((col) => keyOf(section.id, item.id, `${classBase}/${col.id}/solo-ver`));
            const classChecked = classLeafKeys.filter((k) => grantSet.has(k)).length;
            const classTreeKey = `cls::${section.id}::${item.id}::${classBase}`;
            const classExpanded = expandedItems.has(classTreeKey);
            // Depth 5 — a sibling of the table's own plain columns (also 5,
            // see renderTableColumns), not depth 4 (the "Tabla <X>" heading's
            // own depth). Rendering it at 4 made it read as a peer of the
            // table heading instead of a peer of the columns beside it, so
            // its children (also forced to the shared depth-5 indent) were
            // visually indistinguishable from every other depth-5 column —
            // "no se distingue qué opciones son de Control Interno".
            const classRow = buildRow(t(cls.labelKey, cls.labelParams), 5, {
                expanded: classExpanded,
                onToggle: () => {
                    if (classExpanded) expandedItems.delete(classTreeKey);
                    else expandedItems.add(classTreeKey);
                },
            }, subBlocked, computeAppToggle(classLeafKeys));
            classRow.row.classList.add('perm-tree-row-classification');
            if (!readOnly) {
                classRow.input.checked = classChecked === classLeafKeys.length;
                classRow.input.indeterminate = classChecked > 0 && classChecked < classLeafKeys.length;
                classRow.input.addEventListener('change', () => {
                    setKeys(classLeafKeys, classRow.input.checked);
                    render();
                });
            }
            container.appendChild(classRow.row);
            if (!classExpanded) return;
            // Own tinted wrapper (same band color as the header row) so the
            // whole group reads as one visual unit distinct from the plain
            // columns around it, not just an indent level.
            const classChildren = document.createElement('div');
            classChildren.className = 'perm-tree-classification-children';
            container.appendChild(classChildren);
            cls.submenu.forEach((col) => {
                renderColumnRow(classChildren, section, item, `${classBase}/${col.id}`, col, 6, subBlocked);
            });
        }

        // Cascades a pantalla's own checkbox (see its onChange above) into
        // every column of its Tabla (classification groups expanded to
        // their own columns) plus every one of its Iconos, all in one go.
        // Checking always lands each column on Solo Ver ONLY -- Ver y
        // Operar/Editar/Autorizar stay a deliberate, individually-made
        // choice per column, never implied by "this pantalla is visible".
        // Unchecking clears a column's own level entirely, same as picking
        // no level by hand.
        function cascadeTableColumns(section, item, sm, subSm, checked) {
            (subSm.submenu || []).forEach((entry) => {
                const cols = entry.isClassification ? entry.submenu : [entry];
                cols.forEach((col) => {
                    const colBase = entry.isClassification
                        ? `${sm.id}/${subSm.id}/${entry.id}/${col.id}`
                        : `${sm.id}/${subSm.id}/${entry.id}`;
                    [...COLUMN_LEVELS, COLUMN_AUTHORIZE].forEach((level) => {
                        if (checked && level.id === 'solo-ver') return;
                        grantSet.delete(keyOf(section.id, item.id, `${colBase}/${level.id}`));
                    });
                    if (checked) setKeys([keyOf(section.id, item.id, `${colBase}/solo-ver`)], true);
                });
            });
        }

        function cascadeIcons(section, item, sm, subSm, checked) {
            (subSm.iconsSubmenu || []).forEach((icon) => {
                setKeys([keyOf(section.id, item.id, `${sm.id}/${subSm.id}/${icon.id}`)], checked);
            });
        }

        function cascadeSubSmDetail(section, item, sm, subSm, checked) {
            cascadeTableColumns(section, item, sm, subSm, checked);
            cascadeIcons(section, item, sm, subSm, checked);
        }

        function subSmHasDetail(subSm) {
            return !!((subSm.submenu && subSm.submenu.length) || (subSm.iconsSubmenu && subSm.iconsSubmenu.length));
        }

        // Every non-standalone pantalla under `item` that has its own
        // Tabla/Iconos -- used so checking a Departamento/Área/Apartado
        // checkbox cascades all the way down into every pantalla's detail
        // underneath it, same as checking the pantalla itself already does,
        // instead of stopping at the pantalla's own single leaf key.
        function detailedSubSmUnder(item) {
            const result = [];
            (item.submenu || []).forEach((sm) => {
                (sm.submenu || []).forEach((subSm) => {
                    if (!subSm.standalone && subSmHasDetail(subSm)) result.push({ sm, subSm });
                });
            });
            return result;
        }

        // A column counts as "covered" if it has ANY of the 3 mutually
        // exclusive levels set (not just Solo Ver: someone may have raised
        // it straight to Ver y Operar/Editar by hand, that still means
        // "this column has access"). Split in two (table columns vs.
        // icons) so the "Tabla <X>" heading's own checkbox below can
        // reflect/cascade just its half, while the pantalla-level checkbox
        // (subSmDetailCoverage) keeps combining both -- never touches
        // leafKeysUnder or any of the Departamento/Área/Apartado rollup
        // math, which keeps reading each row's own single grant key
        // exactly as before.
        function tableColumnsCoverage(section, item, sm, subSm) {
            let total = 0;
            let coveredCount = 0;
            (subSm.submenu || []).forEach((entry) => {
                const cols = entry.isClassification ? entry.submenu : [entry];
                cols.forEach((col) => {
                    const colBase = entry.isClassification
                        ? `${sm.id}/${subSm.id}/${entry.id}/${col.id}`
                        : `${sm.id}/${subSm.id}/${entry.id}`;
                    total += 1;
                    if (COLUMN_LEVELS.some((level) => grantSet.has(keyOf(section.id, item.id, `${colBase}/${level.id}`)))) {
                        coveredCount += 1;
                    }
                });
            });
            return { total, coveredCount };
        }

        function iconsCoverage(section, item, sm, subSm) {
            let total = 0;
            let coveredCount = 0;
            (subSm.iconsSubmenu || []).forEach((icon) => {
                total += 1;
                if (grantSet.has(keyOf(section.id, item.id, `${sm.id}/${subSm.id}/${icon.id}`))) coveredCount += 1;
            });
            return { total, coveredCount };
        }

        function subSmDetailCoverage(section, item, sm, subSm) {
            const table = tableColumnsCoverage(section, item, sm, subSm);
            const icons = iconsCoverage(section, item, sm, subSm);
            return { total: table.total + icons.total, coveredCount: table.coveredCount + icons.coveredCount };
        }

        // Renders the "Tabla <pantalla>" heading + one row per entry in the
        // pantalla's own column list — either a plain column, or (when
        // marked isClassification) a group like "Control Interno" that
        // nests several columns under one shared toggle. The heading has
        // both a chevron (same expandedItems Set/collapsed-by-default
        // convention as every other row here, so a long column list --
        // Control Interno's 13 plus a pantalla's own -- can be folded away
        // as a whole) AND its own checkbox: checking it puts every column
        // underneath on Solo Ver in one go (Iconos untouched, that's a
        // separate bulk toggle below); its checked/indeterminate state
        // reflects that same coverage back, same "Control Interno inside
        // Área" pattern used one level in and one level out from here.
        function renderTableColumns(container, section, item, sm, subSm, subBlocked) {
            const tableTreeKey = `table::${section.id}::${item.id}::${sm.id}/${subSm.id}`;
            const tableExpanded = expandedItems.has(tableTreeKey);
            const tableRow = buildRow(`${t('main.tablePrefix')} ${t(subSm.labelKey, subSm.labelParams)}`, 4, {
                expanded: tableExpanded,
                onToggle: () => {
                    if (tableExpanded) expandedItems.delete(tableTreeKey);
                    else expandedItems.add(tableTreeKey);
                },
            }, subBlocked, null);
            if (!readOnly) {
                const { total, coveredCount } = tableColumnsCoverage(section, item, sm, subSm);
                tableRow.input.checked = total > 0 && coveredCount === total;
                tableRow.input.indeterminate = coveredCount > 0 && coveredCount < total;
                tableRow.input.addEventListener('change', () => {
                    cascadeTableColumns(section, item, sm, subSm, tableRow.input.checked);
                    render();
                });
            }
            container.appendChild(tableRow.row);
            if (!tableExpanded) return;
            subSm.submenu.forEach((entry) => {
                if (entry.isClassification) {
                    renderClassificationGroup(container, section, item, sm, subSm, entry, subBlocked);
                    return;
                }
                renderColumnRow(container, section, item, `${sm.id}/${subSm.id}/${entry.id}`, entry, 5, subBlocked);
            });
        }

        // Renders the "Iconos Personalización" heading + one plain checkbox
        // per toolbar icon (Fijar/Visibilidad/Historial/Leyenda/Filtro/
        // Limpiar/Zoom) a pantalla's table offers. Unlike a Columna, an icon
        // has no Ver y Operar/Editar/Autorizar distinction — it's simply
        // shown or not (see Dashboard.js: hasIconGrant) — so each one is a
        // single ordinary leaf, same shape as a plain pantalla checkbox. The
        // heading itself has the same select-all checkbox as "Tabla <X>"
        // right above it: checking it grants every icon in one go, and its
        // own checked/indeterminate state reflects that same coverage back.
        function renderIconPermissions(container, section, item, sm, subSm, subBlocked) {
            const iconsTreeKey = `icons::${section.id}::${item.id}::${sm.id}/${subSm.id}`;
            const iconsExpanded = expandedItems.has(iconsTreeKey);
            const iconsRow = buildRow(t('menu.iconsPersonalization'), 4, {
                expanded: iconsExpanded,
                onToggle: () => {
                    if (iconsExpanded) expandedItems.delete(iconsTreeKey);
                    else expandedItems.add(iconsTreeKey);
                },
            }, subBlocked, null);
            if (!readOnly) {
                const { total, coveredCount } = iconsCoverage(section, item, sm, subSm);
                iconsRow.input.checked = total > 0 && coveredCount === total;
                iconsRow.input.indeterminate = coveredCount > 0 && coveredCount < total;
                iconsRow.input.addEventListener('change', () => {
                    cascadeIcons(section, item, sm, subSm, iconsRow.input.checked);
                    render();
                });
            }
            container.appendChild(iconsRow.row);
            if (!iconsExpanded) return;
            subSm.iconsSubmenu.forEach((icon) => {
                const iconKey = keyOf(section.id, item.id, `${sm.id}/${subSm.id}/${icon.id}`);
                const iconRow = buildRow(t(icon.labelKey), 5, null, subBlocked, computeAppToggle([iconKey]));
                if (!readOnly) {
                    iconRow.input.checked = grantSet.has(iconKey);
                    iconRow.input.addEventListener('change', () => {
                        setKeys([iconKey], iconRow.input.checked);
                        render();
                    });
                }
                container.appendChild(iconRow.row);
            });
        }

        // Sits once above the tree, right-aligned over where every row's own
        // App toggle lands (buildRow always appends it last, after however
        // much Web label text a given row has) — the only column that
        // actually lines up vertically regardless of depth, since Web's own
        // checkbox is inline with each row's variable-width label, not a
        // fixed column of its own.
        function buildAppColumnHeader() {
            const header = document.createElement('div');
            header.className = 'perm-tree-app-header';
            header.innerHTML = `<span class="perm-tree-app-header-label"><i class="bx bx-mobile-alt" aria-hidden="true"></i>${t('main.appVisionColumn')}</span>`;
            return header;
        }

        // Vista Previa/Navegar -- Pantalla rows only (see the previewInfo
        // param on statusRow below). Confirmed with the user: a pantalla
        // that's already built for real (its own menu.json href is
        // something other than '#') gets an actual preview; anything still
        // unbuilt keeps the plain "under construction" toast every row
        // already had. Walks the exact same submenu structure
        // renderStatusTableColumns already walks for the checkbox tree --
        // no separate preview data to maintain per screen, it's just the
        // catalog's own column definitions. includeSystem=false drops the
        // "Control Interno" classification -- those 13 columns are always
        // auto-filled, never something a person actually fills in on
        // either platform, so the App tab (which previews the CAPTURE
        // form, not a read-only table) excludes them; the Web tab keeps
        // them since the real Web table always shows them too.
        // Shared by Columna/Ícono previewInfo below -- the full 4-level
        // path down to (and including) the Pantalla that owns them.
        function previewScreenBreadcrumb(section, item, sm, subSm) {
            return `${t(sectionLabelKey(section))} › ${t(item.labelKey, item.labelParams)} › ${t(sm.labelKey, sm.labelParams)} › ${t(subSm.labelKey, subSm.labelParams)}`;
        }

        function previewNodeIsBuilt(subSm) {
            return !!(subSm && subSm.href && subSm.href !== '#');
        }

        function buildPreviewColumnGroups(subSm, includeSystem) {
            const groups = [];
            let plainGroup = null;
            (subSm.submenu || []).forEach((entry) => {
                if (entry.isClassification) {
                    if (!includeSystem && entry.id === 'class-control-interno') return;
                    groups.push({
                        bandLabel: t(entry.labelKey, entry.labelParams),
                        columns: (entry.submenu || []).map((col) => ({ id: col.id, label: t(col.labelKey, col.labelParams) })),
                    });
                    return;
                }
                if (!plainGroup) {
                    plainGroup = { bandLabel: null, columns: [] };
                    groups.push(plainGroup);
                }
                plainGroup.columns.push({ id: entry.id, label: t(entry.labelKey, entry.labelParams) });
            });
            return groups;
        }

        // Every "...Evidencia" column (colCargaTripAntesEvidencia, etc.) is
        // a photo upload everywhere in this codebase -- checking the ID
        // suffix (language-independent) rather than the translated label
        // text is what every real screen's own upload wiring already does
        // the same way.
        function isPreviewEvidenceField(id) {
            return /evidencia$/i.test(id || '');
        }

        // Confirmed with the user: Vista Previa isn't just something to
        // LOOK at -- typing into a text field or tapping the camera button
        // has to actually respond, so it feels like really trying the
        // screen. Nothing here ever leaves the browser tab though: no
        // fetch, no fetch stand-in, no write to costMap/statusMap/anything
        // persisted -- a photo "upload" just flips the button's own local
        // state, a typed value lives only in that <input> until the modal
        // closes and this whole subtree is thrown away.
        // compact=true: a small icon-only square (fits a Web table cell).
        // compact=false: icon + visible text label (App's own field rows
        // have the room, and every real App upload button already shows
        // its label the same way).
        function buildPreviewPhotoButton(compact) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = compact ? 'perm-preview-photo-btn' : 'perm-preview-phone-photo-btn';
            const setState = (taken) => {
                btn.classList.toggle('taken', taken);
                const label = t(taken ? 'admin.masterTreePreviewPhotoTaken' : 'admin.masterTreePreviewTakePhoto');
                const icon = `<i class="bx ${taken ? 'bx-check' : 'bx-camera'}" aria-hidden="true"></i>`;
                btn.innerHTML = compact ? icon : `${icon}<span>${label}</span>`;
                btn.title = label;
                btn.setAttribute('aria-label', label);
            };
            setState(false);
            btn.addEventListener('click', () => setState(!btn.classList.contains('taken')));
            return btn;
        }

        // Reads whatever's currently in a demo table cell -- the typed
        // <input> value, or the photo button's own taken/not label for an
        // Evidencia cell -- so the column filter below always reflects
        // what's actually showing right now, including anything the admin
        // just typed while trying the preview.
        function readPreviewCellValue(cell) {
            if (!cell) return '';
            const input = cell.querySelector('input');
            if (input) return input.value.trim() || '···';
            const photoBtn = cell.querySelector('.perm-preview-photo-btn');
            if (photoBtn) return t(photoBtn.classList.contains('taken') ? 'admin.masterTreePreviewPhotoTaken' : 'admin.masterTreePreviewTakePhoto');
            return '';
        }

        // A row hides once ANY of its columns' own active filter excludes
        // its current value -- same "every active filter narrows further"
        // rule the real per-column header filter uses (see Dashboard.js's
        // applyColumnValueFilters), not just whichever column was touched
        // last.
        function reapplyPreviewColumnFilters(tableEl) {
            const filters = tableEl.previewColFilters;
            Array.from(tableEl.querySelectorAll('tbody tr')).forEach((tr) => {
                let visible = true;
                if (filters) {
                    filters.forEach((allowed, colIndex) => {
                        if (!allowed.has(readPreviewCellValue(tr.children[colIndex]))) visible = false;
                    });
                }
                tr.classList.toggle('perm-preview-row-col-filtered', !visible);
            });
        }

        // The small funnel icon that lives right on every column header --
        // confirmed with the user this specific control (distinct from the
        // toolbar's own global Filtro icon above the table) was missing.
        // Same Excel-style "checklist of this column's own current values"
        // idea as the real .data-table-col-filter-trigger, simplified (no
        // search box or date-range mode -- a demo table only ever has 2
        // rows, a full text search over 1-2 distinct values isn't worth
        // the extra chrome).
        function openPreviewColumnFilterMenu(colTh, tableEl, colIndex, trigger) {
            document.querySelectorAll('.perm-preview-col-filter-menu').forEach((m) => m.remove());
            if (!tableEl.previewColFilters) tableEl.previewColFilters = new Map();
            const distinct = Array.from(new Set(Array.from(tableEl.querySelectorAll('tbody tr')).map((tr) => readPreviewCellValue(tr.children[colIndex]))));
            const current = tableEl.previewColFilters.get(colIndex) || new Set(distinct);

            const menu = document.createElement('div');
            menu.className = 'perm-preview-col-filter-menu';
            const allRow = document.createElement('label');
            allRow.className = 'perm-preview-col-filter-option perm-preview-col-filter-all';
            const allCb = document.createElement('input');
            allCb.type = 'checkbox';
            allCb.checked = current.size === distinct.length;
            const allSpan = document.createElement('span');
            allSpan.textContent = t('admin.masterTreePreviewFilterAll');
            allRow.append(allCb, allSpan);
            menu.appendChild(allRow);

            const list = document.createElement('div');
            list.className = 'perm-preview-col-filter-list';
            const checkboxes = [];
            distinct.forEach((val) => {
                const row = document.createElement('label');
                row.className = 'perm-preview-col-filter-option';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = current.has(val);
                cb.addEventListener('change', () => {
                    const next = new Set(tableEl.previewColFilters.get(colIndex) || new Set(distinct));
                    if (cb.checked) next.add(val); else next.delete(val);
                    if (next.size === distinct.length) tableEl.previewColFilters.delete(colIndex);
                    else tableEl.previewColFilters.set(colIndex, next);
                    allCb.checked = !tableEl.previewColFilters.has(colIndex) || next.size === distinct.length;
                    reapplyPreviewColumnFilters(tableEl);
                    colTh.classList.toggle('perm-preview-col-filter-active', tableEl.previewColFilters.has(colIndex));
                });
                const span = document.createElement('span');
                span.textContent = val;
                row.append(cb, span);
                list.appendChild(row);
                checkboxes.push(cb);
            });
            menu.appendChild(list);

            allCb.addEventListener('change', () => {
                checkboxes.forEach((cb) => { cb.checked = allCb.checked; });
                if (allCb.checked) tableEl.previewColFilters.delete(colIndex);
                else tableEl.previewColFilters.set(colIndex, new Set());
                reapplyPreviewColumnFilters(tableEl);
                colTh.classList.toggle('perm-preview-col-filter-active', tableEl.previewColFilters.has(colIndex));
            });

            document.body.appendChild(menu);
            const rect = trigger.getBoundingClientRect();
            menu.style.top = `${rect.bottom + 4}px`;
            menu.style.left = `${Math.min(rect.left, window.innerWidth - 224)}px`;
            const closeOnOutsideClick = (event) => {
                if (menu.contains(event.target) || event.target === trigger) return;
                menu.remove();
                document.removeEventListener('click', closeOnOutsideClick);
            };
            setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 0);
        }

        function attachPreviewColumnFilterTrigger(colTh, tableEl, colIndex) {
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'perm-preview-col-filter-trigger';
            trigger.innerHTML = '<i class="bx bx-filter-alt" aria-hidden="true"></i>';
            trigger.setAttribute('aria-label', t('admin.masterTreePreviewFilterColumn'));
            trigger.addEventListener('click', (event) => {
                event.stopPropagation();
                openPreviewColumnFilterMenu(colTh, tableEl, colIndex, trigger);
            });
            // Into the label's own inner flex row, not the <th> directly
            // -- see buildPreviewWebTable's own comment on why.
            (colTh.querySelector('.perm-preview-col-head-inner') || colTh).appendChild(trigger);
        }

        // previewInfo.focusColumnId (only set for kind:'columna') highlights
        // that one column while still showing every other real column
        // around it for context -- confirmed with the user a column never
        // exists in isolation on the real screen either.
        function buildPreviewWebTable(previewInfo) {
            const subSm = previewInfo.node;
            const focusColumnId = previewInfo.focusColumnId;
            const groups = buildPreviewColumnGroups(subSm, true);
            const scroll = document.createElement('div');
            scroll.className = 'perm-preview-table-scroll';
            const table = document.createElement('table');
            table.className = 'perm-preview-table';
            table.dataset.previewTable = 'true';
            const thead = document.createElement('thead');
            const bandRow = document.createElement('tr');
            const colRow = document.createElement('tr');
            const flatCols = [];
            groups.forEach((group) => {
                const bandTh = document.createElement('th');
                bandTh.colSpan = group.columns.length;
                bandTh.className = group.bandLabel ? 'perm-preview-band' : 'perm-preview-band perm-preview-band-plain';
                bandTh.textContent = group.bandLabel || '';
                bandRow.appendChild(bandTh);
                group.columns.forEach((col) => {
                    const colTh = document.createElement('th');
                    colTh.className = 'perm-preview-col-head';
                    if (col.id === focusColumnId) colTh.classList.add('perm-preview-col-focus');
                    // The label + filter-trigger flex row lives in its OWN
                    // inner <div> -- setting display:flex directly on the
                    // <th> itself knocks it out of the table's own layout
                    // (every header stacks vertically instead of sitting
                    // side by side), confirmed live.
                    const colHeadInner = document.createElement('div');
                    colHeadInner.className = 'perm-preview-col-head-inner';
                    const colLabel = document.createElement('span');
                    colLabel.textContent = col.label;
                    colHeadInner.appendChild(colLabel);
                    colTh.appendChild(colHeadInner);
                    colRow.appendChild(colTh);
                    flatCols.push(col);
                });
            });
            thead.append(bandRow, colRow);
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            for (let r = 0; r < 2; r++) {
                const tr = document.createElement('tr');
                tr.className = 'perm-preview-example-row';
                flatCols.forEach((col) => {
                    const td = document.createElement('td');
                    if (col.id === focusColumnId) td.classList.add('perm-preview-col-focus');
                    if (isPreviewEvidenceField(col.id)) {
                        td.appendChild(buildPreviewPhotoButton(true));
                    } else {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'perm-preview-input';
                        input.placeholder = '···';
                        td.appendChild(input);
                    }
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            Array.from(colRow.children).forEach((colTh, index) => attachPreviewColumnFilterTrigger(colTh, table, index));
            scroll.appendChild(table);
            return scroll;
        }

        function buildPreviewAppMock(subSm, previewInfo) {
            const groups = buildPreviewColumnGroups(subSm, false);
            const phone = document.createElement('div');
            phone.className = 'perm-preview-phone';
            const header = document.createElement('div');
            header.className = 'perm-preview-phone-header';
            header.innerHTML = `<i class="bx ${previewInfo.icon || 'bx-window'}" aria-hidden="true"></i><span>${previewInfo.label}</span>`;
            const body = document.createElement('div');
            body.className = 'perm-preview-phone-body';
            groups.forEach((group) => {
                group.columns.forEach((col) => {
                    const isEvidence = isPreviewEvidenceField(col.id);
                    const field = document.createElement('div');
                    field.className = 'perm-preview-phone-field';
                    if (col.id === previewInfo.focusColumnId) field.classList.add('perm-preview-phone-field-focus');
                    const icon = document.createElement('span');
                    icon.className = 'perm-preview-phone-field-icon';
                    icon.innerHTML = `<i class="bx ${isEvidence ? 'bx-camera' : 'bx-pencil'}" aria-hidden="true"></i>`;
                    const textWrap = document.createElement('span');
                    textWrap.className = 'perm-preview-phone-field-text';
                    const labelEl = document.createElement('span');
                    labelEl.className = 'perm-preview-phone-field-label';
                    labelEl.textContent = col.label;
                    textWrap.appendChild(labelEl);
                    if (isEvidence) {
                        textWrap.appendChild(buildPreviewPhotoButton(false));
                    } else {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'perm-preview-phone-input';
                        input.placeholder = '···';
                        textWrap.appendChild(input);
                    }
                    field.append(icon, textWrap);
                    body.appendChild(field);
                });
            });
            phone.append(header, body);
            return phone;
        }

        // --- Vista Previa: Ícono, a REAL simulation of what each toolbar
        // icon actually does (zoom/pin/visibility/history/legend/filter),
        // not just a picture of it -- confirmed with the user this has to
        // work, not just look right. Everything below only ever touches
        // its own local demo table/inputs, never anything persisted. -----
        const ICON_DEMO_GLYPHS = {
            iconZoomOut: 'bx-zoom-out',
            iconZoomIn: 'bx-zoom-in',
            iconPin: 'bx-pin',
            iconVisibility: 'bx-show',
            iconHistory: 'bx-history',
            iconLegend: 'bx-info-circle',
            iconFilter: 'bx-filter-alt',
            iconFilterClear: 'bx-x-circle',
        };

        function buildPreviewLegendHtml() {
            return ['habilitado', 'construccion', 'mejoras', 'inhabilitado'].map((key) => {
                const cap = key.charAt(0).toUpperCase() + key.slice(1);
                return `<span class="perm-preview-legend-dot perm-preview-legend-${key}"></span>${t(`admin.masterTreeStatus${cap}`)}`;
            }).join('');
        }

        // iconEntries: [{ id, label }] -- one demo toolbar shared by both
        // the full-screen mock (every icon) and the standalone Ícono
        // preview (just that one), same behavior either way. Returns the
        // toolbar + its (initially hidden) filter row and info popover;
        // caller appends this once, before the table it controls.
        function buildIconToolbarWrap(iconEntries, tableEl) {
            const wrap = document.createElement('div');
            const toolbar = document.createElement('div');
            toolbar.className = 'perm-preview-icon-toolbar';
            const filterRow = document.createElement('div');
            filterRow.className = 'perm-preview-filter-row';
            filterRow.hidden = true;
            const filterInput = document.createElement('input');
            filterInput.type = 'text';
            filterInput.className = 'perm-preview-filter-input';
            filterInput.placeholder = t('admin.masterTreePreviewFilterPlaceholder');
            filterRow.appendChild(filterInput);
            const infoBox = document.createElement('div');
            infoBox.className = 'perm-preview-info-box';
            infoBox.hidden = true;

            filterInput.addEventListener('input', () => {
                const q = filterInput.value.trim().toLowerCase();
                Array.from(tableEl.querySelectorAll('tbody tr')).forEach((tr) => {
                    tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? '' : 'none';
                });
            });

            const shared = {
                zoom: 1,
                showInfo(kind) {
                    const reopening = infoBox.hidden || infoBox.dataset.kind !== kind;
                    infoBox.hidden = !reopening;
                    infoBox.dataset.kind = kind;
                    infoBox.innerHTML = kind === 'legend' ? buildPreviewLegendHtml() : t('admin.masterTreePreviewHistorySample');
                },
            };

            iconEntries.forEach((entry) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'perm-preview-icon-btn';
                btn.innerHTML = `<i class="bx ${ICON_DEMO_GLYPHS[entry.id] || 'bx-square'}" aria-hidden="true"></i>`;
                btn.title = entry.label;
                btn.setAttribute('aria-label', entry.label);
                btn.addEventListener('click', () => {
                    switch (entry.id) {
                        case 'iconZoomIn':
                            shared.zoom = Math.min(1.5, shared.zoom + 0.15);
                            tableEl.style.fontSize = `${shared.zoom}em`;
                            break;
                        case 'iconZoomOut':
                            shared.zoom = Math.max(0.65, shared.zoom - 0.15);
                            tableEl.style.fontSize = `${shared.zoom}em`;
                            break;
                        case 'iconPin':
                            tableEl.classList.toggle('perm-preview-pinned');
                            break;
                        case 'iconVisibility':
                            tableEl.classList.toggle('perm-preview-col-hidden');
                            break;
                        case 'iconHistory':
                            shared.showInfo('history');
                            break;
                        case 'iconLegend':
                            shared.showInfo('legend');
                            break;
                        case 'iconFilter':
                            filterRow.hidden = !filterRow.hidden;
                            if (!filterRow.hidden) filterInput.focus();
                            break;
                        case 'iconFilterClear':
                            filterInput.value = '';
                            filterInput.dispatchEvent(new Event('input'));
                            break;
                        default:
                            break;
                    }
                });
                toolbar.appendChild(btn);
            });

            wrap.append(toolbar, filterRow, infoBox);
            return wrap;
        }

        // kind:'pantalla' Web tab -- the full screen, not just its column
        // table: the same toolbar the real page has (every one of its
        // icons, each actually working against the table below it) plus
        // every real column. This is the "toda la funcionalidad de la
        // pantalla" the user asked for, one step up from a bare table.
        function buildPreviewScreenMock(previewInfo) {
            const subSm = previewInfo.node;
            const wrapAll = document.createElement('div');
            const tableWrap = buildPreviewWebTable(previewInfo);
            const tableEl = tableWrap.querySelector('table');
            const iconEntries = (subSm.iconsSubmenu || []).map((icon) => ({ id: icon.id, label: t(icon.labelKey) }));
            if (iconEntries.length) wrapAll.appendChild(buildIconToolbarWrap(iconEntries, tableEl));
            wrapAll.appendChild(tableWrap);
            return wrapAll;
        }

        // kind:'icono' Web tab -- the SAME real table its screen has, but
        // the toolbar only shows that one icon, so trying it isn't buried
        // among the other six.
        function buildPreviewIconDemoWeb(previewInfo) {
            const wrapAll = document.createElement('div');
            const hint = document.createElement('p');
            hint.className = 'perm-preview-icon-hint';
            hint.textContent = t('admin.masterTreePreviewIconHint', { icon: previewInfo.label });
            const tableWrap = buildPreviewWebTable(previewInfo);
            const tableEl = tableWrap.querySelector('table');
            wrapAll.appendChild(hint);
            wrapAll.appendChild(buildIconToolbarWrap([{ id: previewInfo.iconId, label: previewInfo.label }], tableEl));
            wrapAll.appendChild(tableWrap);
            return wrapAll;
        }

        // kind:'icono' App tab -- honest, not fabricated: zoom/pin/
        // visibility/history/legend/filter are all Web-table conveniences,
        // the App's own capture screens (a scrollable field list, see
        // buildPreviewAppMock) never had an equivalent to begin with.
        function buildPreviewIconWebOnlyNote() {
            const note = document.createElement('div');
            note.className = 'perm-preview-icon-app-note';
            note.innerHTML = `<i class="bx bx-info-circle" aria-hidden="true"></i><span>${t('admin.masterTreePreviewIconWebOnly')}</span>`;
            return note;
        }

        // --- Vista Previa: nodos de navegación (Departamento/Área/
        // Apartado) -- no tienen su propia pantalla que probar, así que
        // aquí "vista previa" significa mostrar cómo se ve ESE nivel como
        // punto de navegación: la lista de lo que contiene en Web, la
        // rejilla de accesos directos en App. previewInfo.children = [{id,
        // label, icon}], ya resuelto por cada uno de los 3 call sites en
        // renderStatusTree (nunca vacío por construcción salvo un nodo sin
        // hijos reales, ej. Inicio/Panel/Tablero). --------------------------
        function buildPreviewNavWeb(previewInfo) {
            const wrap = document.createElement('div');
            wrap.className = 'perm-preview-nav-list';
            const head = document.createElement('div');
            head.className = 'perm-preview-nav-list-head';
            head.innerHTML = `<i class="bx ${previewInfo.icon || 'bx-folder'}" aria-hidden="true"></i><span>${previewInfo.label}</span>`;
            wrap.appendChild(head);
            if (!previewInfo.children.length) {
                const empty = document.createElement('p');
                empty.className = 'perm-preview-nav-empty';
                empty.textContent = t('admin.masterTreePreviewNavEmpty');
                wrap.appendChild(empty);
            } else {
                previewInfo.children.forEach((child) => {
                    const item = document.createElement('div');
                    item.className = 'perm-preview-nav-item';
                    item.innerHTML = `<i class="bx bx-chevron-right" aria-hidden="true"></i><span>${child.label}</span>`;
                    wrap.appendChild(item);
                });
            }
            return wrap;
        }

        function buildPreviewNavApp(previewInfo) {
            const phone = document.createElement('div');
            phone.className = 'perm-preview-nav-app';
            const head = document.createElement('div');
            head.className = 'perm-preview-phone-header';
            head.innerHTML = `<i class="bx ${previewInfo.icon || 'bx-folder'}" aria-hidden="true"></i><span>${previewInfo.label}</span>`;
            phone.appendChild(head);
            if (!previewInfo.children.length) {
                const empty = document.createElement('p');
                empty.className = 'perm-preview-nav-empty';
                empty.textContent = t('admin.masterTreePreviewNavEmpty');
                phone.appendChild(empty);
            } else {
                const grid = document.createElement('div');
                grid.className = 'perm-preview-nav-app-grid';
                previewInfo.children.forEach((child) => {
                    const tile = document.createElement('div');
                    tile.className = 'perm-preview-nav-app-tile';
                    tile.innerHTML = `<i class="bx ${child.icon || 'bx-square'}" aria-hidden="true"></i><span>${child.label}</span>`;
                    grid.appendChild(tile);
                });
                phone.appendChild(grid);
            }
            return phone;
        }

        // previewInfo.kind decides the whole shape of the panel:
        // 'pantalla' -- Web: full screen mock (toolbar + table). App: the
        //   field-list capture form.
        // 'columna' -- Web: the same real table, one column highlighted.
        //   App: the same field list, one field highlighted.
        // 'icono' -- Web: the real table with just that one icon's toolbar,
        //   actually working. App: an honest "this is Web-only" note.
        // 'nav' -- Departamento/Área/Apartado, no screen of their own:
        //   Web a sidebar-style list of what's under this node, App a tile
        //   grid of the same, always available (no href to gate on).
        function openPreviewModal(previewInfo) {
            const overlay = document.createElement('div');
            overlay.className = 'perm-preview-overlay';
            const panel = document.createElement('div');
            panel.className = 'perm-preview-panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');

            const head = document.createElement('div');
            head.className = 'perm-preview-head';
            const headIcon = document.createElement('span');
            headIcon.className = 'perm-preview-head-icon';
            headIcon.innerHTML = `<i class="bx ${previewInfo.icon || 'bx-window'}" aria-hidden="true"></i>`;
            const headText = document.createElement('div');
            headText.className = 'perm-preview-head-text';
            const crumb = document.createElement('div');
            crumb.className = 'perm-preview-breadcrumb';
            crumb.textContent = previewInfo.breadcrumb;
            const title = document.createElement('div');
            title.className = 'perm-preview-title';
            title.textContent = previewInfo.label;
            headText.append(crumb, title);
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'perm-preview-close';
            closeBtn.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
            closeBtn.setAttribute('aria-label', t('admin.masterTreePreviewClose'));
            head.append(headIcon, headText, closeBtn);

            const toggle = document.createElement('div');
            toggle.className = 'perm-preview-toggle';
            const webBtn = document.createElement('button');
            webBtn.type = 'button';
            webBtn.className = 'active';
            webBtn.innerHTML = `<i class="bx bx-desktop" aria-hidden="true"></i><span>${t('admin.masterTreePlatformWeb')}</span>`;
            const appBtn = document.createElement('button');
            appBtn.type = 'button';
            appBtn.innerHTML = `<i class="bx bx-mobile-alt" aria-hidden="true"></i><span>${t('admin.masterTreePlatformApp')}</span>`;
            toggle.append(webBtn, appBtn);

            const body = document.createElement('div');
            body.className = 'perm-preview-body';
            const note = document.createElement('p');
            note.className = 'perm-preview-note';
            note.textContent = t('admin.masterTreePreviewNote');
            const content = document.createElement('div');

            function showWeb() {
                webBtn.classList.add('active');
                appBtn.classList.remove('active');
                content.className = '';
                content.innerHTML = '';
                if (previewInfo.kind === 'nav') content.appendChild(buildPreviewNavWeb(previewInfo));
                else if (previewInfo.kind === 'icono') content.appendChild(buildPreviewIconDemoWeb(previewInfo));
                else if (previewInfo.kind === 'pantalla') content.appendChild(buildPreviewScreenMock(previewInfo));
                else content.appendChild(buildPreviewWebTable(previewInfo)); // 'columna'
            }
            function showApp() {
                appBtn.classList.add('active');
                webBtn.classList.remove('active');
                content.className = 'perm-preview-app-wrap';
                content.innerHTML = '';
                if (previewInfo.kind === 'nav') content.appendChild(buildPreviewNavApp(previewInfo));
                else if (previewInfo.kind === 'icono') content.appendChild(buildPreviewIconWebOnlyNote());
                else content.appendChild(buildPreviewAppMock(previewInfo.node, previewInfo)); // 'pantalla' + 'columna'
            }
            webBtn.addEventListener('click', showWeb);
            appBtn.addEventListener('click', showApp);

            body.append(note, content);
            panel.append(head, toggle, body);
            overlay.appendChild(panel);
            function close() { overlay.remove(); }
            closeBtn.addEventListener('click', close);
            overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
            document.body.appendChild(overlay);
            showWeb();
        }

        // -------------------------------------------------------------
        // statusMode rendering (Árbol de Permisos Maestro) -- an entirely
        // separate, parallel walk of the SAME sectionsData tree built by
        // init() below. Deliberately never touches grantSet, computeAppToggle,
        // buildRow, or any of the rollup/indeterminate math above -- every
        // row (Departamento down to Columna/Ícono) gets exactly one
        // independent status <select>, full stop. "Tabla <X>" and "Iconos
        // Personalización" stay plain expand/collapse group headers with no
        // status of their own (same as in the checkbox tree, neither is a
        // real grantable/menu node -- see leafKeysUnder's comment above for
        // why a pantalla's own Tabla was never a grant leaf either); their
        // columns/icons underneath each still get their own row.
        // -------------------------------------------------------------
        function statusRow(labelText, depth, key, toggle, rollup, leafKeys, ancestorLocked, dragCtx, showCost, previewInfo) {
            const row = document.createElement('div');
            row.className = `perm-tree-row perm-tree-depth-${depth}`;
            // Drag-to-reorder -- Árbol Maestro only. dragCtx is
            // { kind, id, scope, onDrop(draggedId, targetId) }, passed at
            // whichever depth is currently reorderable (depth 0 for
            // Departamento, depth 1 for Área under it, depth 2 for Apartado
            // under THAT área -- see renderStatusTree). `scope` is just
            // whatever key identifies the specific sibling group a row
            // belongs to -- null for Departamento (one single list), a
            // sectionId for Área (one list per department), a
            // "sectionId::areaId" compound for Apartado (one list per
            // área) -- it doesn't need to mean anything to statusRow
            // itself, only to match between a dragged row and a candidate
            // drop target. No separate "reorder column": the grip sits
            // right on the row, and dropping it mutates sectionsData in
            // place (via onDrop) before a full renderStatusTree() redraw
            // picks up the new order. `kind`+`scope` guard against a drag
            // started on one level/group being dropped as if it were
            // another -- can't happen through the UI since a drag never
            // leaves its own group's rows, but without the scope check
            // here an Área (or Apartado) dragged from one group would
            // still show the "valid drop" highlight over a row from a
            // DIFFERENT group (the drop itself would still be a no-op,
            // since the matching onDrop would never find that id in the
            // wrong group's list -- but the highlight would lie about it
            // being a valid target). readOnly mode never gets
            // draggable="true" -- same guard every other editable control
            // in this file already respects.
            if (dragCtx && !readOnly) {
                row.classList.add('perm-tree-row-draggable');
                row.draggable = true;
                const grip = document.createElement('span');
                grip.className = 'perm-tree-drag-handle';
                grip.setAttribute('aria-hidden', 'true');
                grip.innerHTML = '<i class="bx bx-dots-vertical-rounded"></i><i class="bx bx-dots-vertical-rounded"></i>';
                row.appendChild(grip);
                const matchesDragged = () => !!draggedNode
                    && draggedNode.kind === dragCtx.kind
                    && draggedNode.scope === dragCtx.scope
                    && draggedNode.id !== dragCtx.id;
                row.addEventListener('dragstart', (e) => {
                    draggedNode = { kind: dragCtx.kind, id: dragCtx.id, scope: dragCtx.scope };
                    row.classList.add('perm-tree-row-dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });
                row.addEventListener('dragend', () => {
                    draggedNode = null;
                    row.classList.remove('perm-tree-row-dragging');
                });
                row.addEventListener('dragover', (e) => {
                    if (!matchesDragged()) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    row.classList.add('perm-tree-row-drop-target');
                });
                row.addEventListener('dragleave', () => {
                    row.classList.remove('perm-tree-row-drop-target');
                });
                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    row.classList.remove('perm-tree-row-drop-target');
                    const wasValid = matchesDragged();
                    const draggedId = draggedNode ? draggedNode.id : null;
                    draggedNode = null;
                    if (!wasValid) return;
                    if (dragCtx.onDrop(draggedId, dragCtx.id)) renderStatusTree();
                });
            }
            if (toggle) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'perm-tree-toggle';
                btn.setAttribute('aria-expanded', String(toggle.expanded));
                const icon = document.createElement('i');
                icon.className = 'bx bx-chevron-down';
                icon.setAttribute('aria-hidden', 'true');
                btn.appendChild(icon);
                btn.addEventListener('click', () => {
                    toggle.onToggle();
                    renderStatusTree();
                });
                row.appendChild(btn);
            } else {
                const spacer = document.createElement('span');
                spacer.className = 'perm-tree-toggle-spacer';
                row.appendChild(spacer);
            }
            // Group rollup -- ✓ green once every descendant leaf has this
            // platform on, a gray dash for only some of them, nothing at
            // all once none do. Purely a read-only summary of the leaves
            // underneath (see computeRollup below); only group rows
            // (Departamento/Área, the ones with a toggle) get one. Sits
            // right before the label (not its own column) -- the same
            // spot a row's own checkbox would sit in an ordinary tree.
            if (rollup) {
                const rollupEl = document.createElement('span');
                rollupEl.className = 'perm-tree-mstatus-rollup';
                rollupEl.append(buildRollupIcon('web', rollup.web), buildRollupIcon('app', rollup.app));
                row.appendChild(rollupEl);
            }
            const label = document.createElement('span');
            label.className = 'perm-tree-mstatus-label';
            label.textContent = labelText;
            // Same "always show the real full name on hover" tooltip the
            // sidebar already uses (showSubmenuTooltip/hideSidebarTooltip,
            // both plain globals in Dashboard.js -- reused as-is rather
            // than reimplemented here) -- a no-op whenever the label
            // wasn't actually ellipsized (see that function's own guard).
            // Guarded: Dashboard.js (and these two globals) doesn't exist
            // in the mobile-app/www context that also loads this file, so
            // an unguarded call would throw the moment statusMode's first
            // row rendered there.
            label.addEventListener('mouseenter', () => { if (typeof showSubmenuTooltip === 'function') showSubmenuTooltip(label); });
            label.addEventListener('mouseleave', () => { if (typeof hideSidebarTooltip === 'function') hideSidebarTooltip(); });
            row.appendChild(label);
            if (key) {
                // Stashed so a caller (Admin-ArbolMaestro.js's confirm-
                // changes screen) can turn a bare key back into the same
                // human name shown here, without re-walking the tree itself.
                statusLabelMap.set(key, labelText);
                const controls = document.createElement('div');
                controls.className = 'perm-tree-mstatus-controls';
                // Same fixed-width-cell treatment as platformsCell below --
                // the select itself stays a snug pill (its own max-width
                // just caps how wide it CAN get), centered inside a column
                // that's always exactly as wide as the header's Estatus
                // label, so its left edge lines up regardless of how short
                // the current ladder step's text is.
                const statusCell = document.createElement('div');
                statusCell.className = 'perm-tree-mstatus-status-cell';
                statusCell.appendChild(buildStatusBadgeSelect(key));
                controls.appendChild(statusCell);
                // Fixed-width cell (matches perm-tree-mstatus-header-
                // platforms exactly) instead of letting the two platform
                // groups just sit at whatever width their own content
                // needs -- .perm-tree-mstatus-controls used to rely on
                // margin-left:auto to "flush right" against the row's own
                // edge, which only coincidentally lined up under the
                // header's fixed Estatus/Web·App columns when there was
                // enough slack; a real column of the same width as the
                // header's is what actually keeps them aligned regardless
                // of content length or window size.
                const platformsCell = document.createElement('div');
                platformsCell.className = 'perm-tree-mstatus-platforms-cell';
                platformsCell.appendChild(buildPlatformGroup(key, 'web', leafKeys, ancestorLocked));
                platformsCell.appendChild(buildPlatformGroup(key, 'app', leafKeys, ancestorLocked));
                controls.appendChild(platformsCell);
                // $ Web / $ App -- Árbol Maestro's own suggested/base cost
                // for this node (see master_permission_cost in db.js).
                // Departamento/Área/Apartado/Pantalla/Columna all get one
                // (showCost is passed true from those 5 depths in
                // renderStatusTree/renderStatusColumn) -- Ícono and
                // Clasificación don't, since neither is ever its own
                // priced unit in plan_permission_costs/PermissionCostTree.js
                // either (a column is priced as a whole; its classification
                // is just a visual grouping of columns, same as Ícono has
                // no price anywhere in the system). Plain number inputs,
                // not tied to readOnly/ancestorLocked -- price and status/
                // grants are independent axes, same as the existing Costo
                // Accesos-Permisos screen.
                if (showCost) {
                    const cost = getNodeCost(key);
                    const buildCostInput = (platform, value) => {
                        const wrap = document.createElement('div');
                        wrap.className = 'perm-tree-mstatus-cost-wrap';
                        const symbol = document.createElement('span');
                        symbol.className = 'perm-tree-mstatus-cost-symbol';
                        symbol.textContent = costCurrencySymbol;
                        symbol.setAttribute('aria-hidden', 'true');
                        wrap.appendChild(symbol);
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.min = '0';
                        input.step = '0.01';
                        input.className = 'perm-tree-cost-input';
                        input.value = (Number(value) || 0).toFixed(2);
                        input.addEventListener('change', () => {
                            const current = getNodeCost(key);
                            const parsed = Math.max(0, parseFloat(input.value) || 0);
                            setNodeCost(key, { ...current, [platform]: parsed });
                            input.value = parsed.toFixed(2);
                        });
                        wrap.appendChild(input);
                        return wrap;
                    };
                    const costWebCell = document.createElement('div');
                    costWebCell.className = 'perm-tree-mstatus-cost-cell';
                    costWebCell.appendChild(buildCostInput('web', cost.web));
                    controls.appendChild(costWebCell);
                    const costAppCell = document.createElement('div');
                    costAppCell.className = 'perm-tree-mstatus-cost-cell';
                    costAppCell.appendChild(buildCostInput('app', cost.app));
                    controls.appendChild(costAppCell);
                } else {
                    // controls is right-aligned via margin-left:auto, so its
                    // width has to stay constant regardless of showCost, or
                    // Estatus (its first child) drifts left/right per row.
                    controls.appendChild(document.createElement('div')).className = 'perm-tree-mstatus-cost-cell';
                    controls.appendChild(document.createElement('div')).className = 'perm-tree-mstatus-cost-cell';
                }
                // Vista Previa/Navegar -- real preview (openPreviewModal
                // above) only for a Pantalla whose own menu.json href is
                // already a real page; everything else (Departamento/Área/
                // Apartado, or a Pantalla still on href:'#') keeps the
                // plain "under construction" toast, same as the identical
                // icon already shipped on Nuestros Sectores de Negocio's
                // own Acciones column. Reuses .perm-tree-mstatus-nest-btn's
                // exact look (a small square icon button) rather than
                // adding a new button style for one icon.
                const navigateCell = document.createElement('div');
                navigateCell.className = 'perm-tree-mstatus-navigate-cell';
                const navigateBtn = document.createElement('button');
                navigateBtn.type = 'button';
                navigateBtn.className = 'perm-tree-mstatus-nest-btn';
                navigateBtn.title = t('admin.businessSectorPreview');
                navigateBtn.setAttribute('aria-label', t('admin.businessSectorPreview'));
                navigateBtn.innerHTML = '<i class="bx bx-compass" aria-hidden="true"></i>';
                // 'nav' (Departamento/Área/Apartado) always previews --
                // it's just menu.json's own structure, no built/unbuilt
                // page to gate on. Every other kind still needs its
                // OWNING pantalla to actually have a real page.
                const canPreview = !!previewInfo && (previewInfo.kind === 'nav'
                    || !!(previewInfo.node && previewInfo.node.href && previewInfo.node.href !== '#'));
                navigateBtn.addEventListener('click', () => {
                    if (canPreview) { openPreviewModal(previewInfo); return; }
                    const message = t('admin.underConstruction');
                    if (window.Dashboard && typeof window.Dashboard.showToast === 'function') window.Dashboard.showToast(message, 'info');
                    else if (typeof window.showToast === 'function') window.showToast(message);
                });
                navigateCell.appendChild(navigateBtn);
                controls.appendChild(navigateCell);
                row.appendChild(controls);
            }
            return row;
        }

        // Default node state -- confirmed with the user: Sistema Web
        // defaults ON (checking the branch turns Web on by itself), App
        // Móvil defaults OFF (always a deliberate manual opt-in).
        function getNodeState(key) {
            return statusMap.get(key) || { status: DEFAULT_STATUS, webEnabled: true, appEnabled: false };
        }
        function setNodeState(key, next) {
            if (next.status === DEFAULT_STATUS && next.webEnabled && !next.appEnabled) statusMap.delete(key);
            else statusMap.set(key, next);
        }
        // Resolves a node's label directly from sectionsData, independent
        // of whether statusRow has ever actually rendered that row this
        // session (statusLabelMap -- see getStatusLabel below -- only gets
        // a node once its row renders, which needs every ancestor expanded
        // first; "aplicar a anidados" (applyNestedPlatform above) writes
        // straight into statusMap without expanding anything, so a bulk
        // change can easily touch far more nodes than were ever rendered).
        // '' for a standalone pantalla (never reachable through
        // getPantallaOrders either, see its own comment) or a stale
        // reference to a since-removed menu.json entry.
        // Walks as many "/"-separated segments as submenuId actually has --
        // 1 (Apartado), 2 (.../Pantalla), 3 (.../Clasificación OR a
        // standalone column with no Clasificación wrapper), 4 (.../
        // Clasificación/Columna) -- same compound-key vocabulary
        // statusRow's own key already uses at every one of those depths,
        // just resolved generically instead of hardcoding each depth's
        // own branch.
        function resolveNodeLabel(sectionId, itemId, submenuId) {
            const section = sectionsData.find((s) => s.id === sectionId);
            if (!section) return '';
            if (!itemId) return t(sectionLabelKey(section));
            const area = section.items.find((i) => i.id === itemId);
            if (!area) return '';
            if (!submenuId) return t(area.labelKey, area.labelParams);
            const segments = submenuId.split('/');
            let node = (area.submenu || []).find((sm) => sm.id === segments[0]);
            for (let i = 1; node && i < segments.length; i += 1) {
                node = (node.submenu || []).find((entry) => entry.id === segments[i]);
            }
            return node ? t(node.labelKey, node.labelParams) : '';
        }
        function getNodeCost(key) {
            return costMap.get(key) || { web: 0, app: 0 };
        }
        function setNodeCost(key, next) {
            if (!next.web && !next.app) costMap.delete(key);
            else costMap.set(key, next);
        }
        function nodeWebOff(key) {
            return !getNodeState(key).webEnabled;
        }
        function getBaselineState(key) {
            return baselineMap.get(key) || { status: DEFAULT_STATUS, webEnabled: true, appEnabled: false };
        }
        // Rebuilds baselineMap from a rows list in the exact same shape/
        // filtering as the statusMap population in init() below -- called
        // there for the initial load, and again by Admin-ArbolMaestro.js
        // right after a successful save (with the server's fresh rows) so
        // pending-added/pending-removed highlights clear the moment
        // there's nothing left unsaved.
        function applyBaseline(rows) {
            baselineMap = new Map();
            (rows || []).forEach((s) => {
                if (!s) return;
                const status = s.status || DEFAULT_STATUS;
                const webEnabled = s.webEnabled !== false;
                const appEnabled = s.appEnabled === true;
                if (status === DEFAULT_STATUS && webEnabled && !appEnabled) return;
                baselineMap.set(keyOf(s.sectionId, s.itemId, s.submenuId), { status, webEnabled, appEnabled });
            });
        }

        // The one colored "badge select" per row -- still a real,
        // keyboard-operable <select>, just re-skinned per its own current
        // value (see the perm-tree-mstatus-select-<status> CSS classes,
        // applied to each <option> too so the OPEN native dropdown list
        // shows each choice in its own color, not just the closed box)
        // instead of the browser's bare default look.
        function buildStatusBadgeSelect(key) {
            const select = document.createElement('select');
            select.disabled = readOnly;
            STATUS_OPTIONS.forEach((opt) => {
                const optionEl = document.createElement('option');
                optionEl.value = opt.value;
                optionEl.textContent = t(opt.labelKey);
                optionEl.className = `perm-tree-mstatus-select-${opt.value}`;
                select.appendChild(optionEl);
            });
            const state = getNodeState(key);
            select.value = state.status;
            select.className = `perm-tree-mstatus-select perm-tree-mstatus-select-${state.status}`;
            // Always the full, un-abbreviated name -- most useful exactly
            // when applyStatusAbbreviations has stepped this all the way
            // down to a bare symbol with no visible word left at all.
            select.title = t(STATUS_OPTIONS.find((opt) => opt.value === state.status).labelKey);
            select.addEventListener('change', () => {
                // Estatus is informational only for now -- confirmed with
                // the user: there's no real test/staging environment yet,
                // so nothing here forces Web/App off just because the
                // status isn't Habilitado (see buildPlatformCheckbox, which
                // no longer locks either checkbox off of this value).
                const next = { ...getNodeState(key), status: select.value };
                setNodeState(key, next);
                select.className = `perm-tree-mstatus-select perm-tree-mstatus-select-${select.value}`;
                select.title = t(STATUS_OPTIONS.find((opt) => opt.value === select.value).labelKey);
                renderStatusTree();
            });
            return select;
        }

        // Steps every Estatus <select> in the tree down through its own
        // ladder (STATUS_LADDER_KEYS) until its closed-box text fits --
        // same "measure, step down, stop once it fits" loop as the
        // sidebar's applySubmenuAbbreviations (Dashboard.js), just walking
        // a <select>'s options instead of a label span. Rewrites every
        // option together (not just the selected one) so the open
        // dropdown always matches the closed box, then re-checks from step
        // 0 each call so widening the tree steps back UP again too, not
        // just ever downward. Called after every render and on resize.
        //
        // Can't use select.scrollWidth > select.clientWidth the way the
        // sidebar's plain <span> ladder does -- a native <select>'s closed
        // box doesn't reliably report its own text overflow that way (its
        // displayed value isn't laid out as an ordinary text node), which
        // is exactly why the ladder never stepped down in practice and only
        // CSS ellipsis on the untouched full text ever kicked in, wasting
        // the column's width and squeezing the label next to it. Measuring
        // the candidate text on an offscreen canvas against the select's
        // own CSS max-width (fixed, not dependent on the browser's own
        // select-box quirks) sidesteps that entirely.
        let statusMeasureCtx = null;
        function measureTextWidth(text, font) {
            if (!statusMeasureCtx) statusMeasureCtx = document.createElement('canvas').getContext('2d');
            statusMeasureCtx.font = font;
            return statusMeasureCtx.measureText(text).width;
        }
        // Estatus used to step down once the SELECT's own box got too
        // small -- but that box is now a fixed alignment column (matching
        // the header's Estatus column), so it never shrinks with the
        // window on its own anymore, and the ladder never had a reason to
        // engage: scroll ended up being the only thing that ever
        // happened. Measures the tree's actual REMAINING room instead --
        // total width minus the leading chevron/rollup allowance, the
        // label column (already sized to its own longest word), the
        // Web·App column, and gaps -- and steps every select down
        // together (they must all agree on one step, since they all share
        // one column width) until the widest CURRENTLY SELECTED status
        // text fits that remaining room, or there's no shorter step left
        // (icon-only) -- at which point whatever's still too wide is
        // exactly what .perm-tree's own overflow-x:auto is for.
        function applyStatusAbbreviations() {
            const selects = Array.from(treeRoot.querySelectorAll('select.perm-tree-mstatus-select'));
            if (!selects.length) return;
            const font = getComputedStyle(selects[0]).font;
            const ladders = STATUS_OPTIONS.map((opt) => STATUS_LADDER_KEYS[opt.value]);
            const maxSteps = Math.max(...ladders.map((ladder) => ladder.length));

            const rootFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            const labelColWidth = parseFloat(getComputedStyle(treeRoot).getPropertyValue('--perm-tree-label-col-width')) || 0;
            // 4.3rem leading allowance (matches the header's own spacer) +
            // the label column + the fixed 13rem Web·App column + the
            // Navegar icon column (~2.2rem, fixed -- an icon button never
            // needs its own abbreviation step) + ~3rem of slack for gaps/
            // padding/the select's own native dropdown arrow -- everything
            // Estatus always shares its line with.
            const fixedNeighbors = (4.3 * rootFontPx) + labelColWidth + (13 * rootFontPx) + (2.2 * rootFontPx) + (3 * rootFontPx);
            const available = Math.max(treeRoot.clientWidth - fixedNeighbors, 0);

            let step = 0;
            let widestAtStep = 0;
            for (;;) {
                widestAtStep = 0;
                selects.forEach((select) => {
                    Array.from(select.options).forEach((optionEl, i) => {
                        const ladder = ladders[i];
                        optionEl.textContent = t(ladder[Math.min(step, ladder.length - 1)]);
                    });
                    const selectedText = select.options[select.selectedIndex].textContent;
                    const width = measureTextWidth(selectedText, font);
                    if (width > widestAtStep) widestAtStep = width;
                });
                if (widestAtStep <= available) break;
                if (step + 1 >= maxSteps) break;
                step += 1;
            }
            // Shared column width -- the select's own CSS width just
            // follows whatever this step actually needs (plus its own
            // padding/arrow), instead of a fixed 9.5rem disconnected from
            // what's actually showing.
            treeRoot.style.setProperty('--perm-tree-status-col-width', `${Math.ceil(widestAtStep) + 38}px`);
        }

        // Sets --perm-tree-label-col-width (read by .perm-tree-mstatus-
        // label and .perm-tree-mstatus-header-label) to the widest
        // CURRENTLY VISIBLE row label's own natural width, measured on the
        // same canvas as the Estatus ladder above rather than by reading
        // DOM layout (avoids a measure-during-layout thrash across
        // potentially 40+ rows). Confirmed with the user: the label
        // column's floor is set by its own longest word, never an
        // arbitrary rem guess, and it shrinks back down the moment a
        // longer node collapses out of view. Re-run at the end of every
        // renderStatusTree() -- expand/collapse is the only thing that
        // changes which labels are "currently visible" to measure.
        // A row's own indentation (.perm-tree-depth-N's padding-left) PLUS
        // whatever combination of toggle/rollup-icons/drag-grip it has
        // before its label -- both vary by depth AND by which controls
        // that specific row happens to have -- used to just add straight
        // onto a SINGLE shared label-column width, so Estatus/Web·App/etc
        // drifted further right the deeper (and the more decorated) a row
        // was (a Columna nested under Tabla > Clasificación could land way
        // right of where the same controls sit on a Departamento row),
        // confirmed live once Vista Previa made it natural to actually
        // expand that deep. Fixed by measuring each label's OWN actual
        // rendered offset from its row's left edge (covers indentation AND
        // every preceding control, whatever the mix), then giving each
        // row an inline width so offset + width is the SAME total for
        // every row -- whichever row needs the most room sets that shared
        // total, then each row's own width is just that total minus its
        // own offset.
        function alignLabelColumnWidth() {
            const labels = treeRoot.querySelectorAll('.perm-tree-mstatus-label');
            if (!labels.length) return;
            const treeLeft = treeRoot.getBoundingClientRect().left;
            let maxRightEdge = 0;
            const measured = [];
            labels.forEach((label) => {
                const offsetLeft = label.getBoundingClientRect().left - treeLeft;
                const font = getComputedStyle(label).font;
                const rightEdge = offsetLeft + measureTextWidth(label.textContent, font);
                if (rightEdge > maxRightEdge) maxRightEdge = rightEdge;
                measured.push({ label, offsetLeft });
            });
            // Small buffer so the longest label itself doesn't sit flush
            // against the next column's edge.
            const target = Math.ceil(maxRightEdge) + 8;
            treeRoot.style.setProperty('--perm-tree-label-col-width', `${target}px`);
            measured.forEach(({ label, offsetLeft }) => {
                label.style.width = `${Math.max(0, target - offsetLeft)}px`;
            });
        }

        // Small monitor (Web) / phone (App) silhouette -- shared by the
        // platform checkbox and its read-only rollup summary below, so the
        // shape itself says which platform this is, not just position or
        // color. `mark` draws a checkmark/dash inside for the rollup only;
        // the checkbox itself carries no inner mark, its filled/outline
        // state already says checked/unchecked (see perm-tree-mstatus-
        // device-box:has(input:checked) in Admin.css).
        function devicePathFor(platform) {
            return platform === 'web'
                ? '<rect x="2" y="4" width="20" height="13" rx="1.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="17" x2="12" y2="20"/>'
                : '<rect x="6" y="2" width="12" height="20" rx="2.5"/>';
        }
        function deviceMarkFor(platform, state) {
            if (state === 'full') return platform === 'web' ? '<path d="M6 10l3 3 6-6"/>' : '<path d="M9 12.5l2 2 4-5"/>';
            if (state === 'partial') return platform === 'web' ? '<line x1="7" y1="10.5" x2="15" y2="10.5"/>' : '<line x1="8" y1="12" x2="16" y2="12"/>';
            return '';
        }
        function deviceIconSvg(platform, mark) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${devicePathFor(platform)}${mark || ''}</svg>`;
        }

        // Sistema Web / App Móvil -- simple availability checkboxes, not
        // their own status. Estatus is informational only for now (no
        // dedicated test/staging environment to justify locking Web off
        // for anything short of Habilitado -- confirmed with the user);
        // the dependencies that stay are App can't outrun Web (same rule
        // the checkbox/grant tree above enforces via computeAppToggle) and,
        // new here, a node can't outrun its own ancestors: once any
        // Departamento/Área/Apartado above this one has Web off,
        // everything nested under it locks too (see ancestorLocked,
        // threaded down through renderStatusTree). Locking never erases
        // the stored value -- input.checked always reflects it as-is, so
        // turning the ancestor back on brings every locked descendant back
        // exactly as it was left (confirmed with the user: block, don't
        // wipe).
        function buildPlatformCheckbox(key, platform, ancestorLocked) {
            const wrap = document.createElement('label');
            wrap.className = `perm-tree-mstatus-badge perm-tree-mstatus-badge-${platform}`;
            const platformTag = document.createElement('span');
            platformTag.className = 'perm-tree-mstatus-platform';
            platformTag.textContent = t(platform === 'web' ? 'admin.masterTreePlatformWeb' : 'admin.masterTreePlatformApp');
            const state = getNodeState(key);
            const locked = ancestorLocked || (platform === 'app' && !state.webEnabled);
            if (ancestorLocked) wrap.title = t('admin.masterTreeLockedByAncestor');
            const device = document.createElement('span');
            device.className = 'perm-tree-mstatus-device';
            // Pending-added (yellow) / pending-removed (gray) -- compares
            // against baselineMap (the last load/save), not against the
            // default state, so a checkbox that's always been on doesn't
            // light up just because it's checked. Purely visual, cleared
            // the moment setBaseline() runs again after a real save (see
            // applyBaseline above); never affects what actually gets sent
            // to the server.
            const checked = platform === 'web' ? state.webEnabled : state.appEnabled;
            const baseline = getBaselineState(key);
            const baselineChecked = platform === 'web' ? baseline.webEnabled : baseline.appEnabled;
            if (checked !== baselineChecked) {
                device.classList.add(`perm-tree-mstatus-device-pending-${checked ? 'added' : 'removed'}`);
            }
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = checked;
            input.disabled = readOnly || locked;
            input.addEventListener('change', () => {
                const next = { ...getNodeState(key) };
                if (platform === 'web') {
                    next.webEnabled = input.checked;
                    if (!input.checked) next.appEnabled = false; // App can't stay on once Web turns off
                } else {
                    next.appEnabled = input.checked;
                }
                setNodeState(key, next);
                renderStatusTree();
            });
            const box = document.createElement('span');
            box.className = 'perm-tree-mstatus-device-box';
            box.innerHTML = deviceIconSvg(platform, '');
            device.append(input, box);
            wrap.append(platformTag, device);
            return wrap;
        }

        // Copies THIS node's own current Web/App value onto every leaf
        // nested under it, one platform at a time -- same icon+function as
        // Nuestros Planes' cost tree (perm-tree-app-equalize-btn/bx-copy),
        // just split so Web and App can be pushed down independently since
        // they don't have to match. Deliberately one-directional: this is
        // the only thing that ever writes downward. A leaf checked by hand
        // never pushes back up -- computeRollup only ever *reads* the
        // leaves to summarize a group's state, it never sets anything.
        function applyNestedPlatform(leafKeys, key, platform) {
            const source = getNodeState(key);
            const value = platform === 'web' ? source.webEnabled : source.appEnabled;
            leafKeys.forEach((leafKey) => {
                const next = { ...getNodeState(leafKey) };
                if (platform === 'web') {
                    next.webEnabled = value;
                    if (!value) next.appEnabled = false;
                } else {
                    next.appEnabled = value;
                }
                setNodeState(leafKey, next);
            });
            renderStatusTree();
        }

        // Checkbox + its "apply to nested" button, side by side -- the
        // button only renders on group rows that actually have leaves
        // underneath (leafKeys is only passed for Departamento/Área rows,
        // see renderStatusTree); a leaf row like "Inicio" gets just the
        // checkbox, nothing to apply anything to.
        function buildPlatformGroup(key, platform, leafKeys, ancestorLocked) {
            const group = document.createElement('div');
            group.className = 'perm-tree-mstatus-platform-group';
            group.appendChild(buildPlatformCheckbox(key, platform, ancestorLocked));
            if (!readOnly && leafKeys && leafKeys.length) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'perm-tree-mstatus-nest-btn';
                btn.title = t(platform === 'web' ? 'admin.masterTreeApplyNestedWeb' : 'admin.masterTreeApplyNestedApp');
                btn.setAttribute('aria-label', btn.title);
                btn.innerHTML = '<i class="bx bx-copy" aria-hidden="true"></i>';
                btn.addEventListener('click', () => applyNestedPlatform(leafKeys, key, platform));
                group.appendChild(btn);
            }
            return group;
        }

        // 'full' (every leaf key has this platform on) / 'partial' (some
        // do) / 'empty' (none do) -- leafKeysUnder already gives the exact
        // same leaf granularity the checkbox tree rolls grants up over
        // (one key per pantalla, a whole Tabla counted as its pantalla's
        // single key even though statusMode still lets you open it and set
        // each column separately -- same simplification leafKeysUnder's
        // own comment already documents for the grant tree).
        function computeRollup(leafKeys, platform) {
            if (!leafKeys.length) return 'empty';
            const onCount = leafKeys.filter((k) => {
                const state = getNodeState(k);
                return platform === 'web' ? state.webEnabled : state.appEnabled;
            }).length;
            if (onCount === 0) return 'empty';
            return onCount === leafKeys.length ? 'full' : 'partial';
        }

        function buildRollupIcon(platform, state) {
            const el = document.createElement('span');
            el.className = `perm-tree-mstatus-rollup-icon perm-tree-mstatus-rollup-${state}`;
            el.title = t(platform === 'web' ? 'admin.masterTreePlatformWeb' : 'admin.masterTreePlatformApp');
            el.innerHTML = deviceIconSvg(platform, deviceMarkFor(platform, state));
            return el;
        }

        function renderStatusColumn(container, section, item, base, col, depth, ancestorLocked, sm, subSm, cls) {
            // Vista Previa here highlights this one column inside its own
            // real table (Web) / field list (App) -- gated on the OWNING
            // pantalla being built, same rule as the pantalla's own preview.
            const previewInfo = (sm && previewNodeIsBuilt(subSm)) ? {
                kind: 'columna',
                label: t(col.labelKey, col.labelParams),
                breadcrumb: previewScreenBreadcrumb(section, item, sm, subSm),
                icon: subSm.icon,
                node: subSm,
                focusColumnId: col.id,
            } : null;
            // Columna only reorders within its own Clasificación (cls) --
            // a standalone column (cls is null here, see
            // renderStatusTableColumns below) never drags, same as every
            // level above guards a group that genuinely has nothing else
            // in it (a Pantalla only ever has one or two standalone
            // columns in practice).
            const columnDragCtx = cls ? {
                kind: 'columna',
                id: col.id,
                scope: `${section.id}::${item.id}::${sm.id}::${subSm.id}::${cls.id}`,
                onDrop: (draggedId, targetId) => reorderColumns(section.id, item.id, sm.id, subSm.id, cls.id, draggedId, targetId),
            } : null;
            container.appendChild(statusRow(t(col.labelKey, col.labelParams), depth, keyOf(section.id, item.id, base), null, null, null, ancestorLocked, columnDragCtx, true, previewInfo));
        }

        function renderStatusClassification(container, section, item, sm, subSm, cls, ancestorLocked) {
            const classBase = `${sm.id}/${subSm.id}/${cls.id}`;
            const classTreeKey = `cls::${section.id}::${item.id}::${classBase}`;
            const classExpanded = expandedItems.has(classTreeKey);
            container.appendChild(statusRow(t(cls.labelKey, cls.labelParams), 5, null, {
                expanded: classExpanded,
                onToggle: () => {
                    if (classExpanded) expandedItems.delete(classTreeKey);
                    else expandedItems.add(classTreeKey);
                },
            }));
            if (!classExpanded) return;
            cls.submenu.forEach((col) => {
                renderStatusColumn(container, section, item, `${classBase}/${col.id}`, col, 6, ancestorLocked, sm, subSm, cls);
            });
        }

        function renderStatusTableColumns(container, section, item, sm, subSm, ancestorLocked) {
            const tableTreeKey = `table::${section.id}::${item.id}::${sm.id}/${subSm.id}`;
            const tableExpanded = expandedItems.has(tableTreeKey);
            container.appendChild(statusRow(`${t('main.tablePrefix')} ${t(subSm.labelKey, subSm.labelParams)}`, 4, null, {
                expanded: tableExpanded,
                onToggle: () => {
                    if (tableExpanded) expandedItems.delete(tableTreeKey);
                    else expandedItems.add(tableTreeKey);
                },
            }));
            if (!tableExpanded) return;
            subSm.submenu.forEach((entry) => {
                if (entry.isClassification) {
                    renderStatusClassification(container, section, item, sm, subSm, entry, ancestorLocked);
                    return;
                }
                renderStatusColumn(container, section, item, `${sm.id}/${subSm.id}/${entry.id}`, entry, 5, ancestorLocked, sm, subSm, null);
            });
        }

        function renderStatusIcons(container, section, item, sm, subSm, ancestorLocked) {
            const iconsTreeKey = `icons::${section.id}::${item.id}::${sm.id}/${subSm.id}`;
            const iconsExpanded = expandedItems.has(iconsTreeKey);
            container.appendChild(statusRow(t('menu.iconsPersonalization'), 4, null, {
                expanded: iconsExpanded,
                onToggle: () => {
                    if (iconsExpanded) expandedItems.delete(iconsTreeKey);
                    else expandedItems.add(iconsTreeKey);
                },
            }));
            if (!iconsExpanded) return;
            subSm.iconsSubmenu.forEach((icon) => {
                const iconKey = keyOf(section.id, item.id, `${sm.id}/${subSm.id}/${icon.id}`);
                // Vista Previa here shows the SAME real table this
                // pantalla's own preview has, with only this one icon's
                // toolbar -- see buildPreviewIconDemoWeb -- gated on the
                // pantalla being built, same rule as everything else here.
                const previewInfo = previewNodeIsBuilt(subSm) ? {
                    kind: 'icono',
                    label: t(icon.labelKey),
                    breadcrumb: previewScreenBreadcrumb(section, item, sm, subSm),
                    icon: subSm.icon,
                    node: subSm,
                    iconId: icon.id,
                } : null;
                container.appendChild(statusRow(t(icon.labelKey), 5, iconKey, null, null, null, ancestorLocked, null, false, previewInfo));
            });
        }

        // Persistent column header (Pantalla/Función | Estatus | Web · App)
        // -- sticks to the top of the tree's own scroll container so this
        // reads as an actual table even once you've scrolled past the
        // first few rows. statusMode-only, built fresh each render since
        // it's static content with no state of its own.
        function buildStatusTreeHeader() {
            const header = document.createElement('div');
            header.className = 'perm-tree-mstatus-header';
            // A depth-0 row's own chevron + rollup icons sit before its
            // label (see statusRow) -- the header has neither, so without
            // this spacer its Estatus/Web·App columns start ~4.3rem to the
            // LEFT of where a real row's own controls actually land, which
            // is exactly what let "Estatus" visibly land on top of a row's
            // label once things got tight enough for that gap to matter.
            // Matches depth-0 exactly; deeper rows indent further still, so
            // this is an approximation for anything nested -- unavoidable
            // for one flat header over a tree with variable indentation.
            const spacer = document.createElement('span');
            spacer.className = 'perm-tree-mstatus-header-spacer';
            const label = document.createElement('span');
            label.className = 'perm-tree-mstatus-header-label';
            label.textContent = t('admin.masterTreeColScreen');
            const status = document.createElement('span');
            status.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-status';
            status.textContent = t('admin.masterTreeColStatus');
            const platforms = document.createElement('span');
            platforms.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-platforms';
            platforms.textContent = t('admin.masterTreeColPlatforms');
            // $ Web / $ App -- suggested/base cost, see the showCost param
            // note on statusRow above.
            const costWeb = document.createElement('span');
            costWeb.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-cost';
            costWeb.textContent = t('admin.masterTreeColCostWeb');
            const costApp = document.createElement('span');
            costApp.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-cost';
            costApp.textContent = t('admin.masterTreeColCostApp');
            // Icon-only header (matches the icon-only navigate button
            // itself) -- a text label here would need its own place in the
            // abbreviation ladder for no real benefit at this width.
            const navigate = document.createElement('span');
            navigate.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-navigate';
            navigate.innerHTML = '<i class="bx bx-compass" aria-hidden="true"></i>';
            navigate.title = t('admin.masterTreeColNavigate');
            // Wrapped together with margin-left:auto -- same trailing group
            // a row's own .perm-tree-mstatus-controls is (see statusRow),
            // so both end up flush against the SAME right edge regardless
            // of what precedes them, instead of a big empty gap after a
            // sequence of fixed columns that no longer fill the row's full
            // (often much wider) available width on their own.
            const controls = document.createElement('div');
            controls.className = 'perm-tree-mstatus-header-controls';
            controls.append(status, platforms, costWeb, costApp, navigate);
            header.append(spacer, label, controls);
            return header;
        }

        // ancestorLocked cascades one level at a time: each node's own
        // Web/App checkbox is locked once anything ABOVE it (or it itself,
        // for its own children) has Web off -- computed here as we walk
        // down, never mutated, so re-enabling an ancestor's Web instantly
        // un-locks everything under it back to whatever was already there.
        function renderStatusTree() {
            treeRoot.innerHTML = '';
            treeRoot.appendChild(buildStatusTreeHeader());
            sectionsData.forEach((section) => {
                const sectionExpanded = expandedSections.has(section.id);
                const sectionLeafKeys = section.items.flatMap((item) => leafKeysUnder(section, item));
                const sectionStateKey = keyOf(section.id, null, null);
                // Departamento has no screen of its own to try -- 'nav'
                // preview instead shows how it looks as a navigation point
                // (its own Áreas, see buildPreviewNavWeb/App), always
                // available regardless of what's built underneath.
                const deptPreviewInfo = {
                    kind: 'nav',
                    label: t(sectionLabelKey(section)),
                    breadcrumb: '',
                    icon: section.icon,
                    children: section.items.filter((i) => !GENERAL_ITEM_IDS.includes(i.id)).map((i) => ({ id: i.id, label: t(i.labelKey, i.labelParams), icon: i.icon })),
                };
                treeRoot.appendChild(statusRow(t(sectionLabelKey(section)), 0, sectionStateKey, section.items.length ? {
                    expanded: sectionExpanded,
                    onToggle: () => {
                        if (sectionExpanded) expandedSections.delete(section.id);
                        else expandedSections.add(section.id);
                    },
                } : null, section.items.length ? { web: computeRollup(sectionLeafKeys, 'web'), app: computeRollup(sectionLeafKeys, 'app') } : null, sectionLeafKeys, false, section.id !== 'main' ? { kind: 'department', id: section.id, scope: null, onDrop: reorderDepartments } : null, true, deptPreviewInfo));
                if (!sectionExpanded) return;
                const itemAncestorLocked = nodeWebOff(sectionStateKey);

                section.items.forEach((item) => {
                    const hasSubmenu = !!(item.submenu && item.submenu.length);
                    const itemKey = `${section.id}::${item.id}`;
                    const itemExpanded = expandedItems.has(itemKey);
                    const itemLeafKeys = hasSubmenu ? leafKeysUnder(section, item) : [];
                    const itemStateKey = keyOf(section.id, item.id, null);
                    // Only real áreas reorder (never Inicio/Panel/Tablero,
                    // and never anything under 'main' -- same GENERAL_ITEM_IDS
                    // exclusion sectionsData's own construction already
                    // applies when merging generalItems ahead of areaItems).
                    const isRealArea = section.id !== 'main' && !GENERAL_ITEM_IDS.includes(item.id);
                    // Same 'nav' idea as Departamento above, one level down
                    // -- an Área's own children are its Apartados
                    // (Catálogos/Operaciones/...).
                    const areaPreviewInfo = {
                        kind: 'nav',
                        label: t(item.labelKey, item.labelParams),
                        breadcrumb: t(sectionLabelKey(section)),
                        icon: item.icon,
                        children: hasSubmenu ? item.submenu.map((sm) => ({ id: sm.id, label: t(sm.labelKey, sm.labelParams), icon: sm.icon })) : [],
                    };
                    treeRoot.appendChild(statusRow(t(item.labelKey, item.labelParams), 1, itemStateKey, hasSubmenu ? {
                        expanded: itemExpanded,
                        onToggle: () => {
                            if (itemExpanded) expandedItems.delete(itemKey);
                            else expandedItems.add(itemKey);
                        },
                    } : null, hasSubmenu ? { web: computeRollup(itemLeafKeys, 'web'), app: computeRollup(itemLeafKeys, 'app') } : null, itemLeafKeys, itemAncestorLocked, isRealArea ? { kind: 'area', id: item.id, scope: section.id, onDrop: (draggedId, targetId) => reorderAreas(section.id, draggedId, targetId) } : null, true, areaPreviewInfo));
                    if (!hasSubmenu || !itemExpanded) return;
                    const smAncestorLocked = itemAncestorLocked || nodeWebOff(itemStateKey);
                    // Apartado (Catálogos/Operaciones/...) only reorders
                    // among its own área's siblings -- same isRealArea
                    // guard as Área itself, since a non-área item (Inicio/
                    // Panel/Tablero) never has real apartado children here.
                    const apartadoScope = `${section.id}::${item.id}`;

                    item.submenu.forEach((sm) => {
                        const hasSubSubmenu = !!(sm.submenu && sm.submenu.length);
                        const smStateKey = keyOf(section.id, item.id, sm.id);
                        const apartadoDragCtx = isRealArea ? { kind: 'apartado', id: sm.id, scope: apartadoScope, onDrop: (draggedId, targetId) => reorderApartados(section.id, item.id, draggedId, targetId) } : null;
                        // Same 'nav' idea one level deeper still -- an
                        // Apartado's own children are its Pantallas (a
                        // standalone one, e.g. under 'main', is excluded --
                        // same reasoning as pantallaDragCtx below, it isn't
                        // really one of THIS apartado's own screens).
                        const apartadoPreviewInfo = {
                            kind: 'nav',
                            label: t(sm.labelKey, sm.labelParams),
                            breadcrumb: `${t(sectionLabelKey(section))} › ${t(item.labelKey, item.labelParams)}`,
                            icon: sm.icon,
                            children: hasSubSubmenu ? sm.submenu.filter((s) => !s.standalone).map((subSm) => ({ id: subSm.id, label: t(subSm.labelKey, subSm.labelParams), icon: subSm.icon })) : [],
                        };
                        if (!hasSubSubmenu) {
                            treeRoot.appendChild(statusRow(t(sm.labelKey, sm.labelParams), 2, smStateKey, null, null, null, smAncestorLocked, apartadoDragCtx, true, apartadoPreviewInfo));
                            return;
                        }

                        const smKey = `${section.id}::${item.id}::${sm.id}`;
                        const smExpandedNow = expandedItems.has(smKey);
                        const smLeafKeys = leafKeysUnderSm(section, item, sm);
                        treeRoot.appendChild(statusRow(t(sm.labelKey, sm.labelParams), 2, smStateKey, {
                            expanded: smExpandedNow,
                            onToggle: () => {
                                if (smExpandedNow) expandedItems.delete(smKey);
                                else expandedItems.add(smKey);
                            },
                        }, { web: computeRollup(smLeafKeys, 'web'), app: computeRollup(smLeafKeys, 'app') }, smLeafKeys, smAncestorLocked, apartadoDragCtx, true, apartadoPreviewInfo));
                        if (!smExpandedNow) return;
                        const subSmAncestorLocked = smAncestorLocked || nodeWebOff(smStateKey);
                        // Pantalla only reorders among its own apartado's
                        // siblings -- same isRealArea guard as Área/Apartado
                        // (a standalone pantalla, e.g. under 'main', is
                        // never draggable either way).
                        const pantallaScope = `${section.id}::${item.id}::${sm.id}`;

                        sm.submenu.forEach((subSm) => {
                            const key = subSm.standalone
                                ? keyOf(section.id, subSm.id, null)
                                : keyOf(section.id, item.id, `${sm.id}/${subSm.id}`);
                            const subHasDetail = subSmHasDetail(subSm);
                            const subDetailKey = `subdetail::${section.id}::${item.id}::${sm.id}::${subSm.id}`;
                            const subDetailExpanded = expandedItems.has(subDetailKey);
                            const pantallaDragCtx = (isRealArea && !subSm.standalone)
                                ? { kind: 'pantalla', id: subSm.id, scope: pantallaScope, onDrop: (draggedId, targetId) => reorderPantallas(section.id, item.id, sm.id, draggedId, targetId) }
                                : null;
                            // Vista Previa only for a real Pantalla node (not
                            // a standalone Departamento/Área/C.Costos button
                            // displayed nested here -- those aren't a table/
                            // form screen with a column structure to preview).
                            const previewInfo = subSm.standalone ? null : {
                                kind: 'pantalla',
                                label: t(subSm.labelKey, subSm.labelParams),
                                breadcrumb: `${t(sectionLabelKey(section))} › ${t(item.labelKey, item.labelParams)} › ${t(sm.labelKey, sm.labelParams)}`,
                                icon: subSm.icon,
                                node: subSm,
                            };
                            treeRoot.appendChild(statusRow(t(subSm.labelKey, subSm.labelParams), 3, key, subHasDetail ? {
                                expanded: subDetailExpanded,
                                onToggle: () => {
                                    if (subDetailExpanded) expandedItems.delete(subDetailKey);
                                    else expandedItems.add(subDetailKey);
                                },
                            } : null, null, null, subSmAncestorLocked, pantallaDragCtx, true, previewInfo));
                            if (subHasDetail && subDetailExpanded) {
                                const detailAncestorLocked = subSmAncestorLocked || nodeWebOff(key);
                                if (subSm.submenu && subSm.submenu.length) {
                                    renderStatusTableColumns(treeRoot, section, item, sm, subSm, detailAncestorLocked);
                                }
                                if (subSm.iconsSubmenu && subSm.iconsSubmenu.length) {
                                    renderStatusIcons(treeRoot, section, item, sm, subSm, detailAncestorLocked);
                                }
                            }
                        });
                    });
                });
            });
            alignLabelColumnWidth();
            applyStatusAbbreviations();
            // Defensive reset -- seen live scrolled to a non-zero position
            // on load in Chrome's device-toolbar responsive mode (label
            // start hidden, Estatus/Web·App fully visible instead), not
            // reproducible with a plain resized browser window locally.
            // Whatever the exact cause, showing the start of every row by
            // default is the only sane behavior for a freshly rendered
            // tree, so pin it explicitly rather than trust the browser's
            // own post-layout scroll position.
            treeRoot.scrollLeft = 0;
        }

        function render() {
            // statusMode has no checkboxes, no App column, no rollup math --
            // an entirely separate render path (see renderStatusTree above).
            // Everything below this guard is the original checkbox-tree
            // renderer, untouched and unreachable when statusMode is on.
            if (statusMode) {
                renderStatusTree();
                return;
            }
            treeRoot.innerHTML = '';
            if (appColumnEnabled) treeRoot.appendChild(buildAppColumnHeader());
            sectionsData.forEach((section) => {
                // A department section (anything but 'main') is gated as a
                // whole by its own MODULE_CATALOG key — 'main' itself is
                // core navigation and never blocked (individual buttons
                // inside it are gated one at a time below instead).
                const sectionBlocked = readOnly && section.id !== 'main' && !isModuleEnabled(section.id);
                const sectionLeafKeys = section.items.flatMap((item) => leafKeysUnder(section, item));
                const sectionChecked = sectionLeafKeys.filter((k) => grantSet.has(k)).length;
                const sectionExpanded = expandedSections.has(section.id);
                const sectionRow = buildRow(t(sectionLabelKey(section)), 0, section.items.length ? {
                    expanded: sectionExpanded,
                    onToggle: () => {
                        if (sectionExpanded) expandedSections.delete(section.id);
                        else expandedSections.add(section.id);
                    },
                } : null, sectionBlocked, computeAppToggle(sectionLeafKeys));
                if (!readOnly) {
                    sectionRow.input.checked = sectionChecked === sectionLeafKeys.length && sectionLeafKeys.length > 0;
                    sectionRow.input.indeterminate = sectionChecked > 0 && sectionChecked < sectionLeafKeys.length;
                    sectionRow.input.addEventListener('change', () => {
                        setKeys(sectionLeafKeys, sectionRow.input.checked);
                        section.items.forEach((item) => {
                            detailedSubSmUnder(item).forEach(({ sm, subSm }) => {
                                cascadeSubSmDetail(section, item, sm, subSm, sectionRow.input.checked);
                            });
                        });
                        render();
                    });
                }
                treeRoot.appendChild(sectionRow.row);
                if (!sectionExpanded) return;

                section.items.forEach((item) => {
                    // Only a handful of 'main' buttons are individually
                    // module-gated (MAIN_MODULE_ITEM_IDS) — everything else
                    // (Inicio, Panel, Tablero, and every department's own
                    // Catálogos/Operaciones/... items) only inherits its
                    // section's blocked state, since there's no finer-grained
                    // contract below the module/department level.
                    const itemBlocked = sectionBlocked
                        || (readOnly && section.id === 'main' && MAIN_MODULE_ITEM_IDS.includes(item.id) && !isModuleEnabled(item.id));
                    const itemLeafKeys = leafKeysUnder(section, item);
                    const itemChecked = itemLeafKeys.filter((k) => grantSet.has(k)).length;
                    const hasSubmenu = !!(item.submenu && item.submenu.length);
                    const itemKey = `${section.id}::${item.id}`;
                    const itemExpanded = expandedItems.has(itemKey);
                    const itemRow = buildRow(t(item.labelKey, item.labelParams), 1, hasSubmenu ? {
                        expanded: itemExpanded,
                        onToggle: () => {
                            if (itemExpanded) expandedItems.delete(itemKey);
                            else expandedItems.add(itemKey);
                        },
                    } : null, itemBlocked, computeAppToggle(itemLeafKeys));
                    if (!readOnly) {
                        itemRow.input.checked = itemChecked === itemLeafKeys.length;
                        itemRow.input.indeterminate = itemChecked > 0 && itemChecked < itemLeafKeys.length;
                        itemRow.input.addEventListener('change', () => {
                            setKeys(itemLeafKeys, itemRow.input.checked);
                            detailedSubSmUnder(item).forEach(({ sm, subSm }) => {
                                cascadeSubSmDetail(section, item, sm, subSm, itemRow.input.checked);
                            });
                            render();
                        });
                    }
                    treeRoot.appendChild(itemRow.row);
                    if (!hasSubmenu || !itemExpanded) return;

                    item.submenu.forEach((sm) => {
                        const hasSubSubmenu = !!(sm.submenu && sm.submenu.length);
                        if (!hasSubSubmenu) {
                            const key = keyOf(section.id, item.id, sm.id);
                            const smRow = buildRow(t(sm.labelKey, sm.labelParams), 2, null, itemBlocked, computeAppToggle([key]));
                            if (!readOnly) {
                                smRow.input.checked = grantSet.has(key);
                                smRow.input.addEventListener('change', () => {
                                    setKeys([key], smRow.input.checked);
                                    render();
                                });
                            }
                            treeRoot.appendChild(smRow.row);
                            return;
                        }

                        // One more level down (e.g. "Administración del
                        // Negocio" or "Configuración de Botones" nested
                        // inside "Configuración") — reuses expandedItems
                        // with a 3-part key, distinct from the 2-part
                        // item-level keys above. subSm's own key is always
                        // its plain compound form — a pantalla's table
                        // columns (see renderTableColumns below) are
                        // rendered separately and never count toward this.
                        const smLeafKeys = sm.submenu.map((subSm) => (
                            subSm.standalone ? keyOf(section.id, subSm.id, null) : keyOf(section.id, item.id, `${sm.id}/${subSm.id}`)
                        ));
                        const smChecked = smLeafKeys.filter((k) => grantSet.has(k)).length;
                        const smKey = `${section.id}::${item.id}::${sm.id}`;
                        const smExpandedNow = expandedItems.has(smKey);
                        const smRow = buildRow(t(sm.labelKey, sm.labelParams), 2, {
                            expanded: smExpandedNow,
                            onToggle: () => {
                                if (smExpandedNow) expandedItems.delete(smKey);
                                else expandedItems.add(smKey);
                            },
                        }, itemBlocked, computeAppToggle(smLeafKeys));
                        if (!readOnly) {
                            smRow.input.checked = smChecked === smLeafKeys.length;
                            smRow.input.indeterminate = smChecked > 0 && smChecked < smLeafKeys.length;
                            smRow.input.addEventListener('change', () => {
                                setKeys(smLeafKeys, smRow.input.checked);
                                sm.submenu.forEach((subSm) => {
                                    if (subSm.standalone || !subSmHasDetail(subSm)) return;
                                    cascadeSubSmDetail(section, item, sm, subSm, smRow.input.checked);
                                });
                                render();
                            });
                        }
                        treeRoot.appendChild(smRow.row);
                        if (!smExpandedNow) return;

                        sm.submenu.forEach((subSm) => {
                            const key = subSm.standalone
                                ? keyOf(section.id, subSm.id, null)
                                : keyOf(section.id, item.id, `${sm.id}/${subSm.id}`);
                            // standalone rows (Departamento/Área/C. Costos —
                            // see BUTTON_CONFIG_ITEM_IDS below) are only
                            // DISPLAYED nested here; they're each their own
                            // real 'main' item with their own module key, so
                            // (unlike the ab-* Administración del Negocio
                            // screens next to them, which have no module key
                            // of their own) they need their own check on top
                            // of whatever their parent already inherited —
                            // otherwise they always showed enabled just
                            // because "Configuración" itself was.
                            const subBlocked = itemBlocked
                                || (readOnly && subSm.standalone && MAIN_MODULE_ITEM_IDS.includes(subSm.id) && !isModuleEnabled(subSm.id));

                            // subSm's OWN checkbox is always a plain,
                            // independent leaf — "can see this pantalla" —
                            // regardless of whether it also has a Tabla of
                            // columns. Never a rollup of its columns (see
                            // leafKeysUnder's comment for why). When it DOES
                            // have a table/icons, its row also gets its own
                            // chevron (on top of the checkbox) so the whole
                            // "Tabla <X>" block below can be folded away as
                            // one unit — before this, only "Tabla <X>"'s own
                            // inner heading could collapse; the pantalla row
                            // itself couldn't, so its table always took up
                            // space even when you just wanted the pantalla's
                            // own checkbox in view.
                            const subHasDetail = subSmHasDetail(subSm);
                            const subDetailKey = `subdetail::${section.id}::${item.id}::${sm.id}::${subSm.id}`;
                            const subDetailExpanded = expandedItems.has(subDetailKey);
                            const subRow = buildRow(t(subSm.labelKey, subSm.labelParams), 3, subHasDetail ? {
                                expanded: subDetailExpanded,
                                onToggle: () => {
                                    if (subDetailExpanded) expandedItems.delete(subDetailKey);
                                    else expandedItems.add(subDetailKey);
                                },
                            } : null, subBlocked, computeAppToggle([key]));
                            if (!readOnly) {
                                let subChecked = grantSet.has(key);
                                let subIndeterminate = false;
                                if (subHasDetail) {
                                    const { total, coveredCount } = subSmDetailCoverage(section, item, sm, subSm);
                                    if (total > 0 && coveredCount === total) {
                                        // Every column/icon underneath is already
                                        // covered by hand -- heal the pantalla's own
                                        // key too, so it genuinely IS fully granted
                                        // (keeps Área/Categoría/Departamento's own
                                        // counts, which read this same key, accurate)
                                        // instead of just LOOKING checked.
                                        grantSet.add(key);
                                        subChecked = true;
                                    } else if (!subChecked && total > 0 && coveredCount > 0) {
                                        // Partial coverage the user built by hand
                                        // without ever checking the pantalla itself --
                                        // shown as a hint only, same as Control Interno
                                        // reflecting Área. Never revokes an explicit
                                        // pantalla-level check made earlier (that stays
                                        // solid even if a column was unchecked after).
                                        subIndeterminate = true;
                                    }
                                }
                                subRow.input.checked = subChecked;
                                subRow.input.indeterminate = subIndeterminate;
                                subRow.input.addEventListener('change', () => {
                                    setKeys([key], subRow.input.checked);
                                    // Checking/unchecking the pantalla itself
                                    // also cascades into its own Tabla/Iconos
                                    // (if it has any) -- same "check the
                                    // container, get everything nested" the
                                    // Control Interno group already does one
                                    // level in, just one level further out.
                                    // Each column still only ever gets Solo
                                    // Ver from this (never Ver y Operar/
                                    // Editar/Autorizar) -- those stay a
                                    // deliberate per-column choice, this only
                                    // guarantees "at least visible".
                                    if (subHasDetail) {
                                        cascadeSubSmDetail(section, item, sm, subSm, subRow.input.checked);
                                    }
                                    render();
                                });
                            }
                            treeRoot.appendChild(subRow.row);

                            if (subHasDetail && subDetailExpanded) {
                                if (subSm.submenu && subSm.submenu.length) {
                                    renderTableColumns(treeRoot, section, item, sm, subSm, subBlocked);
                                }
                                if (subSm.iconsSubmenu && subSm.iconsSubmenu.length) {
                                    renderIconPermissions(treeRoot, section, item, sm, subSm, subBlocked);
                                }
                            }
                        });
                    });
                });
            });
        }

        return {
            async init(initialGrants, initialCosts) {
                const { sections: allSections, areaCategories, areaOverrides, areas } = await loadMenuData();
                // 'main' (Inicio, Tablero, Administración del Negocio, etc.)
                // is core navigation, not a contracted module — always shown
                // regardless of which módulos the client has contracted.
                const mainSection = allSections.find((s) => s.id === 'main');
                // Inicio/Panel/Tablero repeat inside every department here —
                // grantable per area, not just once under General — on top
                // of the shared category template (Catálogos, Operaciones,
                // ...) every department already gets.
                const generalItems = (mainSection?.items || []).filter((i) => GENERAL_ITEM_IDS.includes(i.id));
                const scopedSections = allowedSectionIds
                    ? allSections.filter((s) => s.id === 'main' || allowedSectionIds.includes(s.id))
                    : allSections;
                // Reorder the real departments (never 'main', see the
                // departmentOrder param note on create() above) -- anything
                // not explicitly ordered yet (a department added to
                // menu.json after this order was last saved) keeps its
                // original relative position, appended after the ordered
                // ones, so a new department is never silently hidden (see
                // applyOrder above).
                const filtered = [
                    ...scopedSections.filter((s) => s.id === 'main'),
                    ...applyOrder(scopedSections.filter((s) => s.id !== 'main'), departmentOrder),
                ];
                // Every department section is just a placeholder in
                // menu.json now (items: []) — the actual grantable
                // categories/pantallas (Catálogos, Operaciones, ...) live
                // once in the shared areaCategories template and apply the
                // same way to every department, so swap them in here
                // instead of using the section's own (empty) items.
                // "Administración del Negocio" (admin-business) is excluded
                // as its own top-level row here — it only ever appears
                // nested inside "Configuración" (see the swap below), so it
                // doesn't also show up as a duplicate top-level "button".
                // Its 9 pantallas are the SAME data the real topbar
                // dropdown uses (renderBusinessAdminSettingsMenu in
                // Dashboard.js) — reused here, not duplicated in menu.json.
                const adminBusinessItem = mainSection?.items.find((i) => i.id === 'admin-business');
                // Salir/Departamento/Área/C. Costos are each their own real
                // 'main' item (so Dashboard.js's double-gate with
                // MODULE_CATALOG keeps working unchanged for the latter 3),
                // but only ever DISPLAYED nested inside "Configuración de
                // Botones" — never as their own top-level "General" rows.
                // `standalone: true` (handled in leafKeysUnder/render above)
                // keeps each one's own itemId as its grant key instead of a
                // compound one, since they're independent items just shown
                // deeper, not genuinely owned by btn-config-botones.
                const BUTTON_CONFIG_ITEM_IDS = ['btn-salir', 'btn-departamento', 'btn-area', 'btn-cc'];
                const buttonConfigItems = BUTTON_CONFIG_ITEM_IDS
                    .map((id) => mainSection?.items.find((i) => i.id === id))
                    .filter(Boolean)
                    .map((i) => ({ ...i, standalone: true }));
                // Centros de Costo aren't a static menu.json catalog like
                // departments — they're created on the fly per client (see
                // Business-CentrosCosto.html), so this list comes in as a
                // param instead of being read from loadMenuData(). Each one
                // becomes its own grantable leaf; labelKey is the raw
                // "CODE - Name" text rather than an i18n key, which t()
                // already falls back to displaying as-is for unknown keys.
                const costCentersItem = costCenters.length
                    ? {
                        id: 'cc-list',
                        labelKey: 'sidebar.costCenters',
                        submenu: costCenters.map((cc) => ({ id: `cc-${cc.id}`, labelKey: `${cc.code} - ${cc.name}` })),
                    }
                    : null;
                sectionsData = filtered.map((s) => {
                    if (s.id !== 'main') {
                        // Área is a real level now (Departamento > Área >
                        // Apartado > Pantalla > Columna): each área in this
                        // department becomes its own item, carrying its OWN
                        // resolved category list — a pantalla belongs to
                        // exactly one área, not merged across all of them.
                        // areaOrder (see create()'s own param note) is keyed
                        // by department sectionId -- each department reorders
                        // its own áreas independently, same cascade idea as
                        // departmentOrder itself just one level down.
                        const deptAreas = applyOrder((areas && areas[s.id]) || GENERIC_AREAS, areaOrder && areaOrder[s.id]);
                        // apartadoOrder is keyed by "sectionId::areaId" --
                        // each área reorders its own apartados (Catálogos/
                        // Operaciones/...) independently, same cascade idea
                        // one level deeper still.
                        const areaItems = deptAreas.map((area) => {
                            const apartados = applyOrder(
                                categoriesForArea(s.id, area.id, areaCategories || [], areaOverrides),
                                apartadoOrder && apartadoOrder[`${s.id}::${area.id}`],
                            );
                            return {
                                id: area.id,
                                labelKey: area.labelKey,
                                labelParams: area.labelParams,
                                // Wrapped in [...], and EACH apartado below
                                // also cloned (never just passed through as
                                // `cat`) -- categoriesForArea returns the
                                // SHARED areaCategories template itself (not
                                // a copy) for any área/apartado with no
                                // override of its own, submenu (pantallas)
                                // included. Without cloning both levels,
                                // reorderApartados/reorderPantallas's
                                // in-place splice on ONE área would silently
                                // reorder every OTHER área still sharing
                                // that same template object too --
                                // confirmed live for apartados before this
                                // fix (dragging one área's apartado moved it
                                // for a sibling área as well); pantallaOrder
                                // and columnOrder are deeper still, same
                                // risk in principle -- each Pantalla object
                                // (and each of ITS classifications' own
                                // submenu) gets cloned too below, not just
                                // passed through, for the exact same reason.
                                submenu: apartados.map((cat) => ({
                                    ...cat,
                                    submenu: cat.submenu
                                        ? [...applyOrder(cat.submenu, pantallaOrder && pantallaOrder[`${s.id}::${area.id}::${cat.id}`])].map((subSm) => {
                                            if (subSm.standalone || !subSm.submenu) return subSm;
                                            return {
                                                ...subSm,
                                                submenu: subSm.submenu.map((entry) => {
                                                    if (!entry.isClassification || !entry.submenu) return entry;
                                                    const colKey = `${s.id}::${area.id}::${cat.id}::${subSm.id}::${entry.id}`;
                                                    return { ...entry, submenu: [...applyOrder(entry.submenu, columnOrder && columnOrder[colKey])] };
                                                }),
                                            };
                                        })
                                        : cat.submenu,
                                })),
                            };
                        });
                        return { ...s, items: [...generalItems, ...areaItems] };
                    }
                    const items = s.items
                        .filter((i) => i.id !== 'admin-business' && !BUTTON_CONFIG_ITEM_IDS.includes(i.id))
                        .map((i) => {
                            if (i.id !== 'btn-configuracion' || !i.submenu) return i;
                            return {
                                ...i,
                                submenu: i.submenu.map((sm) => {
                                    if (sm.id === 'btn-admin-negocio' && adminBusinessItem) {
                                        return { id: 'btn-admin-negocio', labelKey: sm.labelKey, labelParams: sm.labelParams, submenu: adminBusinessItem.submenu };
                                    }
                                    if (sm.id === 'btn-config-botones' && buttonConfigItems.length) {
                                        return { id: 'btn-config-botones', labelKey: sm.labelKey, labelParams: sm.labelParams, submenu: buttonConfigItems };
                                    }
                                    return sm;
                                }),
                            };
                        });
                    return { ...s, items: costCentersItem ? [...items, costCentersItem] : items };
                });
                // Organizational hierarchy (Empresa > Sucursal > Centro de
                // Costos) -- statusMode only, a sibling of 'main'/"General"
                // (its own top-level section) so it gets the exact same
                // Estatus/Web·App/$ cost row every other department gets,
                // for free, via the same generic rendering code below. A
                // synthetic section with no data/menu.json backing on
                // purpose -- it represents SGN's own org hierarchy for the
                // future Holding cost-mirroring feature (see the Holding
                // roadmap), never a real navigable screen, so it must never
                // show up in the ordinary Puesto de Trabajo/Accesos y
                // Permisos grant trees every other PermissionTree.js caller
                // builds straight from menu.json.
                if (statusMode) {
                    sectionsData = [...sectionsData, {
                        id: 'org-empresa',
                        icon: 'bx-buildings',
                        items: [{
                            id: 'org-sucursal',
                            labelKey: 'menu.orgSucursal',
                            icon: 'bx-git-branch',
                            submenu: [
                                { id: 'org-centro-costos', labelKey: 'menu.orgCentroCostos', icon: 'bx-purchase-tag-alt' },
                            ],
                        }],
                    }];
                }
                // statusMode never builds a grantSet at all -- initialGrants
                // here is really a [{sectionId,itemId,submenuId,status,
                // webEnabled,appEnabled}] list (see getMasterPermissionStatuses
                // in db.js); a node missing from it, or explicitly at every
                // default value, needs no entry in statusMap (same "only
                // exceptions get stored" convention the server side already
                // uses). Returns before any of the grant-only setup below
                // (expand(), showAppTab's app-screens fetch) ever runs.
                if (statusMode) {
                    statusMap = new Map();
                    statusLabelMap = new Map();
                    (initialGrants || []).forEach((s) => {
                        if (!s) return;
                        const status = s.status || DEFAULT_STATUS;
                        const webEnabled = s.webEnabled !== false;
                        const appEnabled = s.appEnabled === true;
                        if (status === DEFAULT_STATUS && webEnabled && !appEnabled) return;
                        statusMap.set(keyOf(s.sectionId, s.itemId, s.submenuId), { status, webEnabled, appEnabled });
                    });
                    // Same sparse "absent = 0" convention as statusMap above
                    // (see master_permission_cost in db.js) -- a node never
                    // priced needs no entry here at all.
                    costMap = new Map();
                    (initialCosts || []).forEach((c) => {
                        if (!c) return;
                        const web = Number(c.web) || 0;
                        const app = Number(c.app) || 0;
                        if (!web && !app) return;
                        costMap.set(keyOf(c.sectionId, c.itemId, c.submenuId), { web, app });
                    });
                    // Baseline starts identical to what was just loaded --
                    // nothing is "pending" right after opening the screen,
                    // only once you start actually changing something.
                    applyBaseline(initialGrants);
                    expandedSections = new Set();
                    expandedItems = new Set();
                    render();
                    // alignLabelColumnWidth measures each label on a canvas
                    // using getComputedStyle's OWN font string (e.g.
                    // "Poppins, sans-serif") -- but the canvas can only
                    // ever draw with whatever font is ACTUALLY loaded yet,
                    // so on a fresh page load (before the Google Font
                    // finishes fetching) it silently measures with the
                    // browser's own fallback serif/sans-serif instead,
                    // whose per-character widths don't match Poppins'.
                    // Longer labels accumulate more error than short ones,
                    // so a long deeply-nested Columna label drifted out of
                    // alignment with a short Departamento label even
                    // though both used the exact same (wrong, that one
                    // frame) measurement logic -- confirmed live, and
                    // never reproduced testing locally where the font was
                    // already cached from an earlier run. document.fonts.
                    // ready resolves once every CSS-declared font is
                    // actually usable, so re-rendering then re-measures
                    // with the real metrics -- a no-op re-render if the
                    // font had already loaded by the first render.
                    if (document.fonts && document.fonts.ready) {
                        document.fonts.ready.then(() => { if (statusMode) render(); });
                    }
                    return;
                }
                grantSet = expand(initialGrants || []);
                // Column-permission grants (Solo Ver/Ver y Operar/Editar/
                // Autorizar) are always already leaf-level, and their
                // section/item never go through leafKeysUnder/expand()
                // (see renderTableColumns) — union them in directly so
                // they still render checked. Harmless no-op for every
                // other already-leaf grant, since expand() would already
                // have added those via its exact-match branch.
                (initialGrants || []).forEach((g) => grantSet.add(keyOf(g.sectionId, g.itemId, g.submenuId)));
                // Everything starts collapsed, even sections/items that
                // already have a grant — simpler and more predictable than
                // guessing which rows to auto-open.
                expandedSections = new Set();
                expandedItems = new Set();
                if (showAppTab) {
                    try {
                        const res = await fetch(apiUrl('/api/business/app-screens'), { credentials: 'include' });
                        if (res.ok) appInfo = await res.json();
                    } catch {
                        appInfo = { app: null, screens: [] };
                    }
                    // Nothing to show an App column FOR yet — a client with
                    // no App assigned, or one whose App has zero screens
                    // built — renders exactly like it did before App
                    // existed, no permanently-locked column cluttering it.
                    appColumnEnabled = !!(appInfo.app && appInfo.screens.length);
                }
                render();
            },
            // Modal-wide "Igualar Visión APP con Web" button -- a no-op
            // call when there's no App column at all, or in read-only mode.
            equalizeAllAppToWeb,
            // Modal-wide "Agregar Visión APP faltante" button -- same no-op
            // guard, additive-only (see fillAllMissingAppToWeb above).
            fillAllMissingAppToWeb,
            getGrants() {
                return Array.from(grantSet).map((k) => {
                    const [sectionId, itemId, submenuId] = k.split('::');
                    return { sectionId, itemId: itemId || null, submenuId: submenuId || null };
                });
            },
            // statusMode's parallel of getGrants() above -- one row per
            // node/platform combination whose status was changed away from
            // DEFAULT_STATUS in this editing session (statusMap never holds
            // default-status entries to begin with, see
            // buildStatusBadgeSelect's onChange). Strip APP_SUFFIX off the
            // END of the whole key (not a per-segment split) since it was
            // appended there regardless of which segment it visually lands
            // in once split. Empty array for every other caller, since
            // statusMap is only ever populated in statusMode.
            getStatuses() {
                return Array.from(statusMap.entries()).map(([k, state]) => {
                    const [sectionId, itemId, submenuId] = k.split('::');
                    return { sectionId, itemId: itemId || null, submenuId: submenuId || null, ...state };
                });
            },
            // Same idea, for $ Web / $ App (see master_permission_cost in
            // db.js) -- one row per node with a non-zero price. Empty array
            // for every other caller, since costMap is only ever populated
            // in statusMode.
            getCosts() {
                return Array.from(costMap.entries()).map(([k, cost]) => {
                    const [sectionId, itemId, submenuId] = k.split('::');
                    return { sectionId, itemId: itemId || null, submenuId: submenuId || null, ...cost };
                });
            },
            // Turns a {sectionId,itemId,submenuId} back into the same human
            // name shown on its row (see statusRow) -- lets a caller build a
            // "here's what's about to change" summary without re-walking
            // the tree itself. '' if that node was never rendered (e.g. a
            // stale reference to a since-removed menu.json entry).
            getStatusLabel(sectionId, itemId, submenuId) {
                return statusLabelMap.get(keyOf(sectionId, itemId, submenuId)) || resolveNodeLabel(sectionId, itemId, submenuId);
            },
            // Same resolution getStatusLabel above falls back to, exposed
            // directly for a caller (Admin-ArbolMaestro.js's Resumen view)
            // that needs every node's name up front, whether or not it was
            // ever expanded/rendered this session.
            getNodeLabel(sectionId, itemId, submenuId) {
                return resolveNodeLabel(sectionId, itemId, submenuId);
            },
            // statusMode only -- current Departamento order (drag-reordered
            // sectionsData, minus 'main' which is core navigation and never
            // a reorderable Departamento -- see the departmentOrder param
            // note on create() above). Admin-ArbolMaestro.js reads this on
            // Guardar and sends it to the master-permission-order endpoint
            // alongside status/Web-App changes. Empty array for a caller
            // that never rendered in statusMode (sectionsData still holds
            // whatever the last create() call built, harmless either way).
            getDepartmentOrder() {
                return sectionsData.filter((s) => s.id !== 'main').map((s) => s.id);
            },
            // 'main' itself (labeled "General") and its own Inicio/Panel/
            // Tablero items are excluded from getDepartmentOrder/
            // getAreaOrders/etc above (never reorderable, never a real
            // Área) -- but 'main' still has its OWN status like any other
            // node, set the same way via its row's Estatus select. A
            // caller that walks getDepartmentOrder alone to enumerate every
            // node (Admin-ArbolMaestro.js's Resumen view) needs this too,
            // or 'main' silently never appears in ANY status group there,
            // no matter what its actual status is -- confirmed live: an
            // Inhabilitado "General" still showed as 0 across every
            // Resumen card.
            getGeneralItemIds() {
                const mainSection = sectionsData.find((s) => s.id === 'main');
                return mainSection ? mainSection.items.map((i) => i.id) : [];
            },
            // statusMode only -- every real Columna under one Pantalla,
            // { submenuId, label } already resolved (submenuId matches
            // exactly what a column's own row uses for its status key --
            // see renderStatusColumn/renderStatusClassification's own
            // base construction). getPantallaOrders/getNodeLabel stop at
            // Pantalla; Admin-ArbolMaestro.js's Resumen view needs to go
            // one level deeper too, since a column can carry its own
            // status override same as anything else here -- confirmed
            // live: without this, a Pantalla could never expand any
            // further in Resumen, and a column-level override was
            // invisible there no matter what it actually was.
            getColumnEntries(sectionId, areaId, apartadoId, pantallaId) {
                const section = sectionsData.find((s) => s.id === sectionId);
                const area = section && section.items.find((i) => i.id === areaId);
                const apartado = area && (area.submenu || []).find((sm) => sm.id === apartadoId);
                const subSm = apartado && (apartado.submenu || []).find((p) => p.id === pantallaId);
                if (!subSm) return [];
                const entries = [];
                (subSm.submenu || []).forEach((entry) => {
                    if (entry.isClassification) {
                        (entry.submenu || []).forEach((col) => {
                            entries.push({ submenuId: `${apartadoId}/${pantallaId}/${entry.id}/${col.id}`, label: t(col.labelKey, col.labelParams) });
                        });
                        return;
                    }
                    entries.push({ submenuId: `${apartadoId}/${pantallaId}/${entry.id}`, label: t(entry.labelKey, entry.labelParams) });
                });
                return entries;
            },
            // statusMode only -- current Área order for EVERY department at
            // once, keyed by department sectionId (same shape the areaOrder
            // param on create() accepts, so a caller can just round-trip
            // this straight back in on the next load). GENERAL_ITEM_IDS
            // (Inicio/Panel/Tablero) are excluded -- never a real Área.
            getAreaOrders() {
                const result = {};
                sectionsData.forEach((s) => {
                    if (s.id === 'main') return;
                    result[s.id] = s.items.filter((i) => !GENERAL_ITEM_IDS.includes(i.id)).map((i) => i.id);
                });
                return result;
            },
            // statusMode only -- current Apartado order for EVERY área of
            // EVERY department at once, keyed by "sectionId::areaId" (same
            // shape apartadoOrder accepts). Only áreas that actually have a
            // submenu contribute a key -- an área with none has nothing to
            // reorder here.
            getApartadoOrders() {
                const result = {};
                sectionsData.forEach((s) => {
                    if (s.id === 'main') return;
                    s.items.filter((i) => !GENERAL_ITEM_IDS.includes(i.id)).forEach((area) => {
                        if (area.submenu && area.submenu.length) {
                            result[`${s.id}::${area.id}`] = area.submenu.map((sm) => sm.id);
                        }
                    });
                });
                return result;
            },
            // statusMode only -- current Pantalla order for EVERY apartado
            // of EVERY área at once, keyed by "sectionId::areaId::apartadoId"
            // (same shape pantallaOrder accepts). A standalone pantalla
            // (e.g. under 'main') is never included -- it's not part of any
            // apartado's own submenu to begin with.
            getPantallaOrders() {
                const result = {};
                sectionsData.forEach((s) => {
                    if (s.id === 'main') return;
                    s.items.filter((i) => !GENERAL_ITEM_IDS.includes(i.id)).forEach((area) => {
                        (area.submenu || []).forEach((apartado) => {
                            if (apartado.submenu && apartado.submenu.length) {
                                result[`${s.id}::${area.id}::${apartado.id}`] = apartado.submenu.map((subSm) => subSm.id);
                            }
                        });
                    });
                });
                return result;
            },
            // statusMode only -- current Columna order for EVERY
            // Clasificación of EVERY Pantalla at once, keyed by
            // "sectionId::areaId::apartadoId::pantallaId::classId" (same
            // shape columnOrder accepts). Only a Clasificación with real
            // columns contributes a key -- a standalone column (no
            // Clasificación wrapper) never reorders, see reorderColumns.
            getColumnOrders() {
                const result = {};
                sectionsData.forEach((s) => {
                    if (s.id === 'main') return;
                    s.items.filter((i) => !GENERAL_ITEM_IDS.includes(i.id)).forEach((area) => {
                        (area.submenu || []).forEach((apartado) => {
                            (apartado.submenu || []).forEach((subSm) => {
                                if (subSm.standalone) return;
                                (subSm.submenu || []).forEach((entry) => {
                                    if (entry.isClassification && entry.submenu && entry.submenu.length) {
                                        result[`${s.id}::${area.id}::${apartado.id}::${subSm.id}::${entry.id}`] = entry.submenu.map((col) => col.id);
                                    }
                                });
                            });
                        });
                    });
                });
                return result;
            },
            // statusMode only -- Admin-ArbolMaestro.js calls this right
            // after a successful save with the server's fresh rows, so
            // every pending-added/pending-removed highlight clears the
            // instant there's nothing left unsaved. A no-op re-render for
            // every other caller (baselineMap only ever means anything in
            // statusMode).
            setBaseline(rows) {
                applyBaseline(rows);
                if (statusMode) renderStatusTree();
            },
        };
    }

    window.PermissionTree = { create, getDepartmentCatalog, getAreaCatalog };
})();
