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

    async function loadMenuData() {
        const res = await fetch('data/menu.json');
        if (!res.ok) throw new Error('failed to load menu.json');
        return res.json();
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
    function create(container, { allowedSectionIds = null, costCenters = [], readOnly = false, enabledModuleKeys = null, showAppTab = false, statusMode = false } = {}) {
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
        function statusRow(labelText, depth, key, toggle, rollup, leafKeys, ancestorLocked) {
            const row = document.createElement('div');
            row.className = `perm-tree-row perm-tree-depth-${depth}`;
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
            label.addEventListener('mouseenter', () => showSubmenuTooltip(label));
            label.addEventListener('mouseleave', hideSidebarTooltip);
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
        function applyStatusAbbreviations() {
            const ladders = STATUS_OPTIONS.map((opt) => STATUS_LADDER_KEYS[opt.value]);
            treeRoot.querySelectorAll('select.perm-tree-mstatus-select').forEach((select) => {
                const cs = getComputedStyle(select);
                // clientWidth minus its own padding minus a fixed allowance
                // for the native dropdown arrow (not part of clientWidth's
                // content box consistently across browsers) -- a budget in
                // real CSS pixels the canvas measurement can compare against.
                const budget = select.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 20;
                const font = cs.font;
                let step = 0;
                for (;;) {
                    Array.from(select.options).forEach((optionEl, i) => {
                        const ladder = ladders[i];
                        optionEl.textContent = t(ladder[Math.min(step, ladder.length - 1)]);
                    });
                    const selectedText = select.options[select.selectedIndex].textContent;
                    if (measureTextWidth(selectedText, font) <= budget) return;
                    if (!ladders.some((ladder) => step + 1 < ladder.length)) return;
                    step += 1;
                }
            });
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
        function alignLabelColumnWidth() {
            const labels = treeRoot.querySelectorAll('.perm-tree-mstatus-label');
            if (!labels.length) return;
            const font = getComputedStyle(labels[0]).font;
            let maxWidth = 0;
            labels.forEach((label) => {
                const width = measureTextWidth(label.textContent, font);
                if (width > maxWidth) maxWidth = width;
            });
            // Small buffer so the longest label itself doesn't sit flush
            // against the next column's edge.
            treeRoot.style.setProperty('--perm-tree-label-col-width', `${Math.ceil(maxWidth) + 8}px`);
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

        function renderStatusColumn(container, section, item, base, col, depth, ancestorLocked) {
            container.appendChild(statusRow(t(col.labelKey, col.labelParams), depth, keyOf(section.id, item.id, base), null, null, null, ancestorLocked));
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
                renderStatusColumn(container, section, item, `${classBase}/${col.id}`, col, 6, ancestorLocked);
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
                renderStatusColumn(container, section, item, `${sm.id}/${subSm.id}/${entry.id}`, entry, 5, ancestorLocked);
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
                container.appendChild(statusRow(t(icon.labelKey), 5, iconKey, null, null, null, ancestorLocked));
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
            header.append(spacer, label, status, platforms);
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
                treeRoot.appendChild(statusRow(t(sectionLabelKey(section)), 0, sectionStateKey, section.items.length ? {
                    expanded: sectionExpanded,
                    onToggle: () => {
                        if (sectionExpanded) expandedSections.delete(section.id);
                        else expandedSections.add(section.id);
                    },
                } : null, section.items.length ? { web: computeRollup(sectionLeafKeys, 'web'), app: computeRollup(sectionLeafKeys, 'app') } : null, sectionLeafKeys, false));
                if (!sectionExpanded) return;
                const itemAncestorLocked = nodeWebOff(sectionStateKey);

                section.items.forEach((item) => {
                    const hasSubmenu = !!(item.submenu && item.submenu.length);
                    const itemKey = `${section.id}::${item.id}`;
                    const itemExpanded = expandedItems.has(itemKey);
                    const itemLeafKeys = hasSubmenu ? leafKeysUnder(section, item) : [];
                    const itemStateKey = keyOf(section.id, item.id, null);
                    treeRoot.appendChild(statusRow(t(item.labelKey, item.labelParams), 1, itemStateKey, hasSubmenu ? {
                        expanded: itemExpanded,
                        onToggle: () => {
                            if (itemExpanded) expandedItems.delete(itemKey);
                            else expandedItems.add(itemKey);
                        },
                    } : null, hasSubmenu ? { web: computeRollup(itemLeafKeys, 'web'), app: computeRollup(itemLeafKeys, 'app') } : null, itemLeafKeys, itemAncestorLocked));
                    if (!hasSubmenu || !itemExpanded) return;
                    const smAncestorLocked = itemAncestorLocked || nodeWebOff(itemStateKey);

                    item.submenu.forEach((sm) => {
                        const hasSubSubmenu = !!(sm.submenu && sm.submenu.length);
                        const smStateKey = keyOf(section.id, item.id, sm.id);
                        if (!hasSubSubmenu) {
                            treeRoot.appendChild(statusRow(t(sm.labelKey, sm.labelParams), 2, smStateKey, null, null, null, smAncestorLocked));
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
                        }, { web: computeRollup(smLeafKeys, 'web'), app: computeRollup(smLeafKeys, 'app') }, smLeafKeys, smAncestorLocked));
                        if (!smExpandedNow) return;
                        const subSmAncestorLocked = smAncestorLocked || nodeWebOff(smStateKey);

                        sm.submenu.forEach((subSm) => {
                            const key = subSm.standalone
                                ? keyOf(section.id, subSm.id, null)
                                : keyOf(section.id, item.id, `${sm.id}/${subSm.id}`);
                            const subHasDetail = subSmHasDetail(subSm);
                            const subDetailKey = `subdetail::${section.id}::${item.id}::${sm.id}::${subSm.id}`;
                            const subDetailExpanded = expandedItems.has(subDetailKey);
                            treeRoot.appendChild(statusRow(t(subSm.labelKey, subSm.labelParams), 3, key, subHasDetail ? {
                                expanded: subDetailExpanded,
                                onToggle: () => {
                                    if (subDetailExpanded) expandedItems.delete(subDetailKey);
                                    else expandedItems.add(subDetailKey);
                                },
                            } : null, null, null, subSmAncestorLocked));
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
            async init(initialGrants) {
                const { sections: allSections, areaCategories, areaOverrides, areas } = await loadMenuData();
                // 'main' (Inicio, Tablero, Administración del Negocio, etc.)
                // is core navigation, not a contracted module — always shown
                // regardless of which módulos the client has contracted.
                const mainSection = allSections.find((s) => s.id === 'main');
                // Inicio/Panel/Tablero repeat inside every department here —
                // grantable per area, not just once under General — on top
                // of the shared category template (Catálogos, Operaciones,
                // ...) every department already gets.
                const generalItems = (mainSection?.items || []).filter((i) => ['home', 'panel', 'dashboard'].includes(i.id));
                const filtered = allowedSectionIds
                    ? allSections.filter((s) => s.id === 'main' || allowedSectionIds.includes(s.id))
                    : allSections;
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
                        const deptAreas = (areas && areas[s.id]) || GENERIC_AREAS;
                        const areaItems = deptAreas.map((area) => ({
                            id: area.id,
                            labelKey: area.labelKey,
                            labelParams: area.labelParams,
                            submenu: categoriesForArea(s.id, area.id, areaCategories || [], areaOverrides),
                        }));
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
                    // Baseline starts identical to what was just loaded --
                    // nothing is "pending" right after opening the screen,
                    // only once you start actually changing something.
                    applyBaseline(initialGrants);
                    expandedSections = new Set();
                    expandedItems = new Set();
                    render();
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
            // Turns a {sectionId,itemId,submenuId} back into the same human
            // name shown on its row (see statusRow) -- lets a caller build a
            // "here's what's about to change" summary without re-walking
            // the tree itself. '' if that node was never rendered (e.g. a
            // stale reference to a since-removed menu.json entry).
            getStatusLabel(sectionId, itemId, submenuId) {
                return statusLabelMap.get(keyOf(sectionId, itemId, submenuId)) || '';
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

    window.PermissionTree = { create };
})();
