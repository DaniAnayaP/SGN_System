// ---------------------------------------------------------------------------
// Fork of PermissionTree.js for Costo Accesos-Permisos + Nuestros Planes'
// own access-tree modal. A price is attached to a plan's tree at EVERY
// level (Departamento/Área/Categoría/Pantalla/Columna) — a plan's own total
// (db.js's computeAccessCostTotal) is just the sum of every priced row,
// independent of whether that node is also granted anywhere, so pricing a
// Departamento AND a Pantalla underneath it both count on purpose (nothing
// stops the same access from being priced — and billed — at more than one
// level at once).
//
// PermissionTree.js has no extension hook (sectionsData/grantSet/
// expandedSections/expandedItems are closure-private, render() blows away
// and rebuilds container.innerHTML on every interaction) — this is a
// deliberate copy, not a wrapper, kept minimal by dropping everything this
// use case never needs (readOnly/enabledModuleKeys/allowedSectionIds/
// costCenters — a plan's tree is always the full universal one).
//
// Three modes:
//   - 'costEdit' (Costo Accesos-Permisos): every row = label + an editable
//     cost <input>, no checkbox at all — pricing doesn't depend on whether
//     anything is granted in any particular plan. Pricing stops AT Columna
//     (one price for the whole column), never descending into its 4 Solo
//     Ver/Ver y Operar/Editar/Autorizar sub-permission rows.
//   - 'grantReadonlyCost' (Nuestros Planes' shield-icon modal): every row =
//     an interactive checkbox plus a read-only cost value next to it,
//     sourced from that same plan's already-saved costs. A Columna's Ver/
//     Operar/Editar/Autorizar checkboxes deliberately behave DIFFERENTLY
//     here than in PermissionTree.js (confirmed with the user): a Plan is
//     choosing which capability LEVELS it makes available at all, not
//     which single one applies to a real user, so Operar/Editar/Autorizar
//     are freely combinable (not mutually exclusive) once Ver is checked,
//     and locked while it isn't — see renderColumnRow below.
//   - 'clientTricolor' (Nuestros Clientes' "Permisos Contratados"/
//     "+ Adicionales" modals): every row is colored against TWO grant sets
//     at once — the client's PLAN (green) and this client's OWN extra
//     sales on top of it (yellow) — with the same per-level "container =
//     fully covered / Columna = any of its 4 sub-permission levels" rule
//     computeCostTotalForGrantSet uses server-side, so what lights up here
//     always matches what gets billed. A level that's part green/part
//     yellow among its children gets no color of its own (its children
//     still show correctly) — this avoids ever double-counting the same
//     access as both "included" and "extra" in the money. Not covered by
//     either shows red; pass `interactive: true` (the "+ Adicionales"
//     modal only) to make red rows real checkboxes that toggle a pending
//     Set instead of saving immediately — read the result via
//     getClientGrants(). Pricing still stops at Columna, same as costEdit:
//     ticking a Columna's red box grants (and prices) the whole column at
//     once, not its 4 sub-permission rows individually.
//
//     `columnLevels: true` (Business-Usuarios.js's per-USER "Otorgar
//     Accesos" only — never the pricing screens above) opts a Columna back
//     into the same 4-level Solo Ver/Ver y Operar/Editar/Autorizar picker
//     PermissionTree.js's Roles tree has, since a real user (unlike a
//     priced plan/client módulo) needs to say WHICH level they're getting,
//     not just "this column, yes or no". Each level keeps its own
//     green/yellow/red coloring (green = the user's Puesto already grants
//     it and can't be removed here; yellow = already saved as an
//     individual "adicional"; red = available to add, checkable only when
//     interactive) instead of the whole column collapsing into one color.
// ---------------------------------------------------------------------------

(function () {
    function keyOf(sectionId, itemId, submenuId) {
        return `${sectionId}::${itemId || ''}::${submenuId || ''}`;
    }

    function isGranted(rawSet, sectionId, itemId, submenuId) {
        if (rawSet.has(keyOf(sectionId, itemId, submenuId))) return true;
        if (itemId && rawSet.has(keyOf(sectionId, itemId, null))) return true;
        if (rawSet.has(keyOf(sectionId, null, null))) return true;
        return false;
    }

    function t(key, params) {
        return window.Dashboard ? window.Dashboard.t(key, params) : key;
    }

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

    async function loadMenuData() {
        const res = await fetch('data/menu.json');
        if (!res.ok) throw new Error('failed to load menu.json');
        return res.json();
    }

    const GENERIC_AREAS = [
        { id: 'area-1', labelKey: 'menu.area.generic', labelParams: { n: 1 } },
        { id: 'area-2', labelKey: 'menu.area.generic', labelParams: { n: 2 } },
        { id: 'area-3', labelKey: 'menu.area.generic', labelParams: { n: 3 } },
    ];

    function categoriesForArea(sectionId, areaId, categories, areaOverrides) {
        const overrides = areaOverrides && areaOverrides[`${sectionId}/${areaId}`];
        if (!overrides) return categories;
        return categories.map((cat) => (
            overrides[cat.id] && overrides[cat.id].length ? { ...cat, submenu: overrides[cat.id] } : cat
        ));
    }

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

    // Web and App visibility share the same grantSet, as the exact same
    // {sectionId,itemId,submenuId} triple used for Web, just with this
    // suffix baked into the submenuId — same convention PermissionTree.js
    // uses (see its own APP_SUFFIX comment). Only meaningful in
    // grantReadonlyCost mode for now — a Plan deciding App is available at
    // a node, same "independently combinable, locked until Ver is on" rule
    // as Operar/Editar/Autorizar already gets there.
    const APP_SUFFIX = '#app';

    // allowedSectionIds: clientTricolor only, optional -- restricts the tree
    // to a client's own contracted módulos (plus 'main', always kept, same
    // convention PermissionTree.js already uses) for the "Permisos
    // Adicionales" case (Business-Usuarios.js), where a business user must
    // never be offered a módulo their own client hasn't contracted. Admin-
    // SaaS's own use of this component (Nuestros Clientes' Permisos
    // Contratados/Adicionales) never passes it, so the whole system menu
    // keeps showing there exactly as before -- GEIPSA needs to see
    // everything, contracted or not, to decide what to sell.
    function create(container, { mode = 'costEdit', currency = 'MXN', interactive = false, allowedSectionIds = null, columnLevels = false } = {}) {
        let sectionsData = [];
        let grantSet = new Set(); // costEdit/grantReadonlyCost modes
        let planGrantSet = new Set(); // clientTricolor: coverage granted by the client's PLAN (green)
        let clientGrantSet = new Set(); // clientTricolor: already-saved "+ adicionales" sold to THIS client (yellow)
        let pendingAdditions = new Set(); // clientTricolor + interactive: unsaved additions toggled in this session
        let costMap = new Map(); // tupleKey -> cost, editable in costEdit mode, read-only reference otherwise
        // grantReadonlyCost only -- a Plan's own Sector's CURRENT raw grants
        // (see Sector -> Plan, Admin-Planes.js), used only to label a LEAF
        // row "(Default)" when the Sector itself already covers it (isGranted
        // handles the same broad-parent-grant fallback everywhere else in
        // this file does) -- never affects what's actually checked/saved.
        let sectorDefaultSet = new Set();
        let expandedSections = new Set();
        let expandedItems = new Set();

        function formatCurrencyLocal(amount) {
            return window.Dashboard ? window.Dashboard.formatCurrency(amount, currency) : String(amount);
        }

        // clientTricolor only: clientGrantSet plus whatever's been toggled on
        // (but not yet saved) in the interactive "+ Adicionales" modal — the
        // read-only "Permisos Contratados" modal never has pendingAdditions,
        // so this degenerates to plain clientGrantSet there.
        function effectiveClientSet() {
            if (!interactive || pendingAdditions.size === 0) return clientGrantSet;
            return new Set([...clientGrantSet, ...pendingAdditions]);
        }

        // Same expansion init() already did for grantSet in the other two
        // modes (fan out every container-level grant onto its leaf
        // descendants, then also keep the raw tuples themselves) — factored
        // out so clientTricolor can build TWO such sets (plan + client)
        // instead of one.
        function buildExpandedSet(rawGrants) {
            const rawSet = new Set((rawGrants || []).map((g) => keyOf(g.sectionId, g.itemId, g.submenuId)));
            const expanded = new Set();
            sectionsData.forEach((section) => {
                section.items.forEach((item) => {
                    leafKeysUnder(section, item).forEach((leafKey) => {
                        const [sectionId, itemId, submenuId] = leafKey.split('::');
                        if (isGranted(rawSet, sectionId, itemId || null, submenuId || null)) expanded.add(leafKey);
                    });
                });
            });
            (rawGrants || []).forEach((g) => expanded.add(keyOf(g.sectionId, g.itemId, g.submenuId)));
            return expanded;
        }

        // Container-level color: green if EVERY leaf is plan-covered, else
        // yellow if EVERY leaf is client-covered, else red if NONE of them
        // are covered by either — anything in between (part green, part
        // yellow/red among its children) returns null, meaning "don't paint
        // this level" (Decisión #8): the children still resolve their own
        // color correctly, and nothing gets billed twice.
        function colorFor(leafKeys) {
            if (!leafKeys.length) return 'red';
            if (leafKeys.every((k) => planGrantSet.has(k))) return 'green';
            const clientSet = effectiveClientSet();
            if (leafKeys.every((k) => clientSet.has(k))) return 'yellow';
            // Every leaf covered, just from a MIX of sources (some by the
            // Rol/plan, some added individually) -- e.g. a classification
            // group whose columns were granted piecemeal across two
            // sessions. Falling through to the "partial" branch below
            // returns null, and buildRow's tricolor branch has no visual
            // for null at all (not red-interactive, and `if (colorSlot.color)`
            // is falsy for null) -- the row silently rendered with NOTHING,
            // looking identical to "nothing granted" even though every
            // single leaf underneath was actually covered. Treat full mixed
            // coverage as yellow (the existing "adicional" tint) instead.
            if (leafKeys.every((k) => planGrantSet.has(k) || clientSet.has(k))) return 'yellow';
            if (leafKeys.some((k) => planGrantSet.has(k) || clientSet.has(k))) return null;
            return 'red';
        }

        // Columna color: mirrors computeCostTotalForGrantSet's "any of its 4
        // sub-permission levels" rule, not "all of them" — a column is
        // already fully priced/sold as one unit (see the file header), so
        // there's no in-between/mixed state to worry about here.
        function columnColorFor(levelKeys) {
            if (levelKeys.some((k) => planGrantSet.has(k))) return 'green';
            const clientSet = effectiveClientSet();
            if (levelKeys.some((k) => clientSet.has(k))) return 'yellow';
            return 'red';
        }

        function buildCostSlot(costKey) {
            if (mode === 'costEdit') {
                const input = document.createElement('input');
                input.type = 'number';
                input.min = '0';
                input.step = '0.01';
                input.className = 'perm-tree-cost-input';
                const existing = costMap.get(costKey);
                input.value = existing != null ? existing : '';
                input.addEventListener('change', () => {
                    const val = Math.max(0, parseFloat(input.value) || 0);
                    if (val > 0) costMap.set(costKey, val);
                    else costMap.delete(costKey);
                });
                return input;
            }
            const span = document.createElement('span');
            span.className = 'perm-tree-cost-readonly';
            const existing = costMap.get(costKey);
            span.textContent = existing ? formatCurrencyLocal(existing) : '—';
            return span;
        }

        // clientTricolor only — mirrors PermissionTree.js's readOnly status
        // badge exactly (same classes/markup) so it inherits that styling
        // for free, plus one new modifier (perm-tree-status-extra) for
        // yellow/"adicional".
        function buildStatusBadge(color) {
            const statusClass = color === 'green' ? 'perm-tree-status-enabled'
                : color === 'yellow' ? 'perm-tree-status-extra'
                : 'perm-tree-status-blocked';
            const iconClass = color === 'green' ? 'bx-check'
                : color === 'yellow' ? 'bx-plus-circle'
                : 'bx-lock-alt';
            const status = document.createElement('span');
            status.className = `perm-tree-status ${statusClass}`;
            const icon = document.createElement('i');
            icon.className = `bx ${iconClass}`;
            icon.setAttribute('aria-hidden', 'true');
            status.appendChild(icon);
            return status;
        }

        // toggle is null for leaf rows (no children to expand). costKey is
        // null to suppress the cost slot entirely (used for the column
        // sub-permission-level rows in grantReadonlyCost mode, which are
        // never individually priced — pricing stops at Columna). colorSlot
        // (clientTricolor only) is { color, checked, onChange } — see
        // extraSlotArgs below for how callers build it.
        function buildRow(labelText, depth, toggle, costKey, colorSlot, appToggle) {
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
                btn.addEventListener('click', () => { toggle.onToggle(); render(); });
                row.appendChild(btn);
            } else {
                const spacer = document.createElement('span');
                spacer.className = 'perm-tree-toggle-spacer';
                row.appendChild(spacer);
            }

            let input = null;
            if (mode === 'costEdit') {
                const label = document.createElement('span');
                label.className = 'perm-tree-label-plain';
                label.textContent = labelText;
                row.appendChild(label);
                if (costKey != null) {
                    row.appendChild(buildCostSlot(costKey));
                    const appCostWrap = document.createElement('span');
                    appCostWrap.className = 'perm-tree-app-cost-wrap';
                    appCostWrap.title = t('main.appVisionColumn');
                    const appCostIcon = document.createElement('i');
                    appCostIcon.className = 'bx bx-mobile-alt';
                    appCostIcon.setAttribute('aria-hidden', 'true');
                    appCostWrap.append(appCostIcon, buildCostSlot(costKey + APP_SUFFIX));
                    row.appendChild(appCostWrap);
                }
            } else if (mode === 'clientTricolor') {
                const isRedInteractive = !!(colorSlot && colorSlot.color === 'red' && interactive);
                if (isRedInteractive) {
                    const labelEl = document.createElement('label');
                    labelEl.className = 'perm-tree-check';
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = !!colorSlot.checked;
                    input.addEventListener('change', () => { colorSlot.onChange(input.checked); render(); });
                    const span = document.createElement('span');
                    span.textContent = labelText;
                    labelEl.append(input, span);
                    row.appendChild(labelEl);
                } else {
                    if (colorSlot && colorSlot.color) row.appendChild(buildStatusBadge(colorSlot.color));
                    const label = document.createElement('span');
                    label.className = 'perm-tree-status-label';
                    label.textContent = labelText;
                    row.appendChild(label);
                }
                // Interactive "+ Adicionales" only: shows what each row would
                // cost (or already costs, if green/yellow) so the running
                // total at the bottom of the modal isn't the only place a
                // price appears — confirmed with the user.
                if (interactive && costKey != null) row.appendChild(buildCostSlot(costKey));
                appendClientAppSlot(row, appToggle, costKey);
            } else {
                const labelEl = document.createElement('label');
                labelEl.className = 'perm-tree-check';
                input = document.createElement('input');
                input.type = 'checkbox';
                const span = document.createElement('span');
                span.textContent = labelText;
                labelEl.append(input, span);
                // grantReadonlyCost only -- a leaf this Plan's own Sector
                // already grants by default (see init()'s sectorDefaultSet),
                // so whoever's building the Plan can see at a glance which
                // ones are the sector's own baseline vs. what THIS plan adds
                // beyond it. Never affects checked state or what gets saved.
                if (sectorDefaultSet.size && costKey != null) {
                    const [sId, iId, smId] = costKey.split('::');
                    if (isGranted(sectorDefaultSet, sId, iId || null, smId || null)) {
                        const tag = document.createElement('span');
                        tag.className = 'perm-tree-default-tag';
                        tag.textContent = t('admin.sectorDefaultTag');
                        labelEl.appendChild(tag);
                    }
                }
                row.appendChild(labelEl);
                if (costKey != null) row.appendChild(buildCostSlot(costKey));
                appendAppToggle(row, appToggle, costKey);
            }

            return { row, input };
        }

        // clientTricolor only — builds the (costKey, colorSlot) pair to pass
        // into buildRow for a node whose "fully covered" test is over
        // `leafKeys` (container levels: all of them; leaf-level nodes just
        // pass their own single key as a 1-element array, which degenerates
        // to an exact-match test). Toggling always adds/removes every key in
        // `leafKeys` together, mirroring the existing setKeys() cascade the
        // other two modes already use for their checkboxes.
        function extraSlotArgs(ownKey, leafKeys) {
            if (mode !== 'clientTricolor') return [ownKey, undefined];
            const color = colorFor(leafKeys);
            return [ownKey, {
                color,
                checked: color === 'red' && leafKeys.length > 0 && leafKeys.every((k) => pendingAdditions.has(k)),
                onChange: (checked) => leafKeys.forEach((k) => (checked ? pendingAdditions.add(k) : pendingAdditions.delete(k))),
            }];
        }

        // clientTricolor only — App-visibility's OWN tricolor slot, built
        // from the App-suffixed sibling of each Web leaf key (see APP_SUFFIX
        // below) so it colors green/yellow/red exactly like Web does, just
        // against `#app` rows instead of plain ones. `locked` additionally
        // marks whether the Web side itself is even covered yet (by plan or
        // client) — a red App slot only becomes a real purchasable checkbox
        // (see appendClientAppSlot) when it isn't locked, matching "App
        // can't be sold without Web".
        function appExtraSlotArgs(webLeafKeys) {
            if (mode !== 'clientTricolor') return undefined;
            const appKeys = webLeafKeys.map((k) => k + APP_SUFFIX);
            const color = colorFor(appKeys);
            const webCovered = webLeafKeys.length > 0 && webLeafKeys.every((k) => planGrantSet.has(k) || effectiveClientSet().has(k));
            return {
                color,
                locked: !webCovered,
                checked: color === 'red' && appKeys.length > 0 && appKeys.every((k) => pendingAdditions.has(k)),
                onChange: (checked) => appKeys.forEach((k) => (checked ? pendingAdditions.add(k) : pendingAdditions.delete(k))),
            };
        }

        // Column rows price/sell App-vision as ONE toggle on the column's
        // own "solo-ver" leaf (mirrors computeAppToggle/appColumnColorFor
        // elsewhere in this file) — never the 4 Ver/Operar/Editar/Autorizar
        // sub-permission keys the WEB side uses for a column.
        function appColumnExtraSlot(soloVerKey, webLevelKeys) {
            if (mode !== 'clientTricolor') return undefined;
            const appKey = soloVerKey + APP_SUFFIX;
            const color = colorFor([appKey]);
            const webCovered = webLevelKeys.some((k) => planGrantSet.has(k) || effectiveClientSet().has(k));
            return {
                color,
                locked: !webCovered,
                checked: color === 'red' && pendingAdditions.has(appKey),
                onChange: (checked) => (checked ? pendingAdditions.add(appKey) : pendingAdditions.delete(appKey)),
            };
        }

        // Unchecking a Web key also drops its App-visibility sibling — "App
        // can't stay enabled without Web" applies here too (grantReadonlyCost
        // mode only calls this; costEdit/clientTricolor never do).
        function setKeys(keys, checked) {
            keys.forEach((k) => {
                if (checked) grantSet.add(k);
                else { grantSet.delete(k); grantSet.delete(k + APP_SUFFIX); }
            });
        }

        // "Igualar con Web" (per-row button next to the toggle, and the
        // modal-wide button hosts can wire to equalizeAllAppToWeb below):
        // makes App match Web exactly for these leaves, in BOTH directions
        // -- on where Web is on, off where it isn't. Deliberately not the
        // same as computeAppToggle's own onChange just below, which only
        // ever touches leaves where Web is already ON (that's correct for
        // a manual checkbox click, which can only mean "turn App on/off for
        // what's granted") -- a leaf whose Web grant was removed earlier
        // while its App flag happened to already be on would sail through
        // that path untouched. setKeys already keeps this from happening
        // through the tree's own UI (unchecking Web clears App with it),
        // but data seeded another way (sectorDefaultSet, a server import)
        // isn't guaranteed that invariant, so a button whose whole point is
        // "make App equal to Web" should actually leave it equal.
        function equalizeAppToWeb(leafKeys) {
            leafKeys.forEach((k) => {
                if (grantSet.has(k)) grantSet.add(k + APP_SUFFIX);
                else grantSet.delete(k + APP_SUFFIX);
            });
            render();
        }

        // Additive-only sibling of equalizeAppToWeb above -- turns App on
        // wherever Web is already granted and App isn't yet, never turns
        // anything off. Lets someone fill gaps left by manually-added
        // App-only grants without equalize wiping those out.
        function fillMissingAppToWeb(leafKeys) {
            leafKeys.forEach((k) => {
                if (grantSet.has(k)) grantSet.add(k + APP_SUFFIX);
            });
            render();
        }

        // The modal-wide "Igualar todo" button's handler (exposed publicly
        // as equalizeAllAppToWeb below). Walking grantSet itself instead of
        // re-deriving "every leaf key in the tree" from sectionsData: every
        // Web grant already IN grantSet needs its App sibling turned on,
        // and every #app-suffixed key already in grantSet whose own Web key
        // ISN'T there needs clearing -- between those two passes that's the
        // entire universe of keys equalizeAllAppToWeb could possibly need
        // to touch, with no tree walk required.
        function equalizeAllAppToWeb() {
            if (mode !== 'grantReadonlyCost') return;
            Array.from(grantSet).forEach((k) => {
                if (k.endsWith(APP_SUFFIX)) {
                    if (!grantSet.has(k.slice(0, -APP_SUFFIX.length))) grantSet.delete(k);
                } else {
                    grantSet.add(k + APP_SUFFIX);
                }
            });
            render();
        }

        // Modal-wide sibling of fillMissingAppToWeb above -- same
        // additive-only rule, whole tree at once.
        function fillAllMissingAppToWeb() {
            if (mode !== 'grantReadonlyCost') return;
            Array.from(grantSet).forEach((k) => {
                if (!k.endsWith(APP_SUFFIX)) grantSet.add(k + APP_SUFFIX);
            });
            render();
        }

        // grantReadonlyCost only — App is a plain paired toggle per node,
        // no eligibility filter (a Plan isn't tied to a client/sector the
        // way PermissionTree.js's client tree is), just "locked until this
        // same node's Web grant is on" — same rule Operar/Editar/Autorizar
        // already follow via colInput/verGranted above.
        function computeAppToggle(leafKeys) {
            if (mode !== 'grantReadonlyCost') return null;
            const grantedLeaves = leafKeys.filter((k) => grantSet.has(k));
            const appOnCount = grantedLeaves.filter((k) => grantSet.has(k + APP_SUFFIX)).length;
            return {
                checked: grantedLeaves.length > 0 && appOnCount === grantedLeaves.length,
                indeterminate: appOnCount > 0 && appOnCount < grantedLeaves.length,
                disabled: grantedLeaves.length === 0,
                equalize: grantedLeaves.length > 0 ? () => equalizeAppToWeb(leafKeys) : null,
                fillMissing: grantedLeaves.some((k) => !grantSet.has(k + APP_SUFFIX)) ? () => fillMissingAppToWeb(leafKeys) : null,
                onChange: (checked) => {
                    grantedLeaves.forEach((k) => (checked ? grantSet.add(k + APP_SUFFIX) : grantSet.delete(k + APP_SUFFIX)));
                    render();
                },
            };
        }

        // grantReadonlyCost only — costKey (the SAME key already passed to
        // buildRow for this row's own Web cost badge) shows what THIS
        // node's App-vision reference price is, read from the same
        // costMap GEIPSA set in costEdit mode (key + APP_SUFFIX) — a
        // separate, independent price from the Web one, same "priced at
        // every level on purpose" rule the rest of this file already
        // follows.
        function appendAppToggle(row, appToggle, costKey) {
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
            // "Igualar con Web" for just this row/group -- same operation
            // the modal-wide button (see equalizeAllAppToWeb) runs over
            // the whole tree, scoped to this one node's own leaves instead.
            // Only shown where there's something to equalize (equalize is
            // null once this node has no Web-granted leaves at all).
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
            if (costKey != null) row.appendChild(buildCostSlot(costKey + APP_SUFFIX));
        }

        // clientTricolor only — mirrors the Web colorSlot rendering right
        // above (badge, or a real checkbox when red + interactive), just for
        // the App-suffixed slot built by appExtraSlotArgs/appColumnExtraSlot.
        // A red slot stays a plain locked badge (never a clickable checkbox)
        // when its own `locked` flag is set — Web isn't covered here yet, so
        // there's nothing to sell App-vision on top of. The read-only badge
        // keeps the bx-mobile-alt icon (just tinted, not a checkbox) instead
        // of reusing buildStatusBadge's generic check/lock glyphs — those
        // are IDENTICAL to the row's own Web status badge right next to it,
        // so a read-only viewer (see Business-MisAccesos.js) couldn't tell
        // App status was even being shown at all.
        function appendClientAppSlot(row, appColorSlot, costKey) {
            if (!appColorSlot) return;
            const isRedInteractive = !!(appColorSlot.color === 'red' && interactive && !appColorSlot.locked);
            if (isRedInteractive) {
                const label = document.createElement('label');
                label.className = 'perm-tree-app-toggle';
                label.title = t('main.appVisionColumn');
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = !!appColorSlot.checked;
                input.addEventListener('change', () => { appColorSlot.onChange(input.checked); render(); });
                const icon = document.createElement('i');
                icon.className = 'bx bx-mobile-alt';
                icon.setAttribute('aria-hidden', 'true');
                label.append(input, icon);
                row.appendChild(label);
            } else if (appColorSlot.color) {
                const badge = document.createElement('span');
                badge.className = `perm-tree-app-status perm-tree-app-status-${appColorSlot.color}`;
                badge.title = t('main.appVisionColumn');
                const icon = document.createElement('i');
                icon.className = 'bx bx-mobile-alt';
                icon.setAttribute('aria-hidden', 'true');
                badge.appendChild(icon);
                row.appendChild(badge);
            }
            if (interactive && costKey != null) row.appendChild(buildCostSlot(costKey + APP_SUFFIX));
        }

        const COLUMN_LEVELS = [
            { id: 'solo-ver', labelKey: 'main.permSoloVer' },
            { id: 'ver-y-operar', labelKey: 'main.permVerYOperar' },
            { id: 'editar', labelKey: 'main.permEditar' },
        ];
        const COLUMN_AUTHORIZE = { id: 'autorizar', labelKey: 'main.permAutorizar' };
        const COLUMN_LEVEL_ICONS = { 'ver-y-operar': 'bx-play', editar: 'bx-edit', autorizar: 'bx-shield-check' };

        // Ver y Operar/Editar/Autorizar as one connected row instead of 3
        // stacked plain checkboxes — same fix as PermissionTree.js's own
        // buildLevelSequenceRow (ported here since this file is a
        // deliberate standalone copy, not a shared component). A chevron
        // between each pair is purely decorative — grantReadonlyCost mode
        // keeps them freely combinable, never mutually exclusive.
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
                const label = document.createElement('label');
                label.className = `perm-tree-level-item${item.lockedColor ? ` perm-tree-level-item-${item.lockedColor}` : ''}`;
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

        // costEdit mode: Columna is a flat priced leaf, no expand, pricing
        // stops here (never descends into the 4 sub-permission levels).
        // clientTricolor mode: same flat-leaf treatment, colored/checkable
        // as one unit (see columnColorFor/extraSlotArgs's header comments).
        // grantReadonlyCost mode: intentionally DIFFERENT from
        // PermissionTree.js here (confirmed with the user) -- a Plan is
        // deciding which capability LEVELS it makes available at all, not
        // which single one applies to a real user, so Ver y Operar/Editar/
        // Autorizar are independently combinable (not mutually exclusive)
        // once Ver is on -- but locked (disabled, unselectable) while Ver
        // is off, since none of them make sense without it. Ver itself is
        // merged into the Columna row's own checkbox (same as
        // PermissionTree.js's column row), which also carries the
        // read-only cost badge for the whole column. Shared by both plain
        // columns and columns nested inside a classification group (see
        // renderClassificationGroup below) via an arbitrary `base` prefix.
        function renderColumnRow(container, section, item, base, col, depth) {
            const colCostKey = keyOf(section.id, item.id, base);

            if (mode === 'costEdit') {
                const { row } = buildRow(t(col.labelKey, col.labelParams), depth, null, colCostKey);
                container.appendChild(row);
                return;
            }

            if (mode === 'clientTricolor' && columnLevels) {
                const soloVerKeyTri = keyOf(section.id, item.id, `${base}/solo-ver`);
                const subLevelKeys = COLUMN_LEVELS.filter((l) => l.id !== 'solo-ver')
                    .concat(COLUMN_AUTHORIZE)
                    .map((l) => keyOf(section.id, item.id, `${base}/${l.id}`));
                const soloVerColor = columnColorFor([soloVerKeyTri]);
                const colTreeKey = `col::${section.id}::${item.id}::${base}`;
                const colExpanded = expandedItems.has(colTreeKey);
                const colorSlot = {
                    color: soloVerColor,
                    checked: soloVerColor === 'red' && interactive && pendingAdditions.has(soloVerKeyTri),
                    onChange: (checked) => {
                        if (checked) pendingAdditions.add(soloVerKeyTri);
                        else {
                            pendingAdditions.delete(soloVerKeyTri);
                            // Operar/Editar/Autorizar can't stay pending without Ver.
                            subLevelKeys.forEach((k) => pendingAdditions.delete(k));
                        }
                        render();
                    },
                };
                const { row } = buildRow(t(col.labelKey, col.labelParams), depth, {
                    expanded: colExpanded,
                    onToggle: () => { if (colExpanded) expandedItems.delete(colTreeKey); else expandedItems.add(colTreeKey); },
                }, colCostKey, colorSlot, appColumnExtraSlot(soloVerKeyTri, [soloVerKeyTri, ...subLevelKeys]));
                container.appendChild(row);
                if (!colExpanded) return;

                const verGranted = soloVerColor !== 'red';
                const items = COLUMN_LEVELS.filter((l) => l.id !== 'solo-ver').concat(COLUMN_AUTHORIZE).map((level) => {
                    const levelKey = keyOf(section.id, item.id, `${base}/${level.id}`);
                    const levelColor = columnColorFor([levelKey]);
                    const locked = levelColor !== 'red';
                    return {
                        icon: COLUMN_LEVEL_ICONS[level.id],
                        label: t(level.labelKey),
                        checked: locked || (interactive && pendingAdditions.has(levelKey)),
                        disabled: locked || !interactive || !verGranted,
                        lockedColor: locked ? levelColor : undefined,
                        onChange: (checked) => { if (checked) pendingAdditions.add(levelKey); else pendingAdditions.delete(levelKey); render(); },
                    };
                });
                container.appendChild(buildLevelSequenceRow(depth + 1, items));
                return;
            }

            if (mode === 'clientTricolor') {
                const levelKeys = [...COLUMN_LEVELS, COLUMN_AUTHORIZE].map((l) => keyOf(section.id, item.id, `${base}/${l.id}`));
                const color = columnColorFor(levelKeys);
                const colorSlot = {
                    color,
                    checked: color === 'red' && levelKeys.every((k) => pendingAdditions.has(k)),
                    onChange: (checked) => levelKeys.forEach((k) => (checked ? pendingAdditions.add(k) : pendingAdditions.delete(k))),
                };
                const soloVerKeyTri = keyOf(section.id, item.id, `${base}/solo-ver`);
                const { row } = buildRow(t(col.labelKey, col.labelParams), depth, null, colCostKey, colorSlot, appColumnExtraSlot(soloVerKeyTri, levelKeys));
                container.appendChild(row);
                return;
            }

            const colTreeKey = `col::${section.id}::${item.id}::${base}`;
            const colExpanded = expandedItems.has(colTreeKey);
            const soloVerKey = keyOf(section.id, item.id, `${base}/solo-ver`);
            const { row: colRow, input: colInput } = buildRow(t(col.labelKey, col.labelParams), depth, {
                expanded: colExpanded,
                onToggle: () => { if (colExpanded) expandedItems.delete(colTreeKey); else expandedItems.add(colTreeKey); },
            }, colCostKey, undefined, computeAppToggle([soloVerKey]));
            colInput.checked = grantSet.has(soloVerKey);
            colInput.addEventListener('change', () => {
                setKeys([soloVerKey], colInput.checked);
                // Operar/Editar/Autorizar can't stay granted without Ver.
                if (!colInput.checked) {
                    [...COLUMN_LEVELS, COLUMN_AUTHORIZE].forEach((level) => {
                        if (level.id === 'solo-ver') return;
                        grantSet.delete(keyOf(section.id, item.id, `${base}/${level.id}`));
                    });
                }
                render();
            });
            container.appendChild(colRow);
            if (!colExpanded) return;

            const verGranted = grantSet.has(soloVerKey);
            const authKey = keyOf(section.id, item.id, `${base}/${COLUMN_AUTHORIZE.id}`);
            const items = [
                ...COLUMN_LEVELS.filter((level) => level.id !== 'solo-ver').map((level) => {
                    const levelKey = keyOf(section.id, item.id, `${base}/${level.id}`);
                    return {
                        icon: COLUMN_LEVEL_ICONS[level.id],
                        label: t(level.labelKey),
                        checked: grantSet.has(levelKey),
                        disabled: !verGranted,
                        onChange: (checked) => { setKeys([levelKey], checked); render(); },
                    };
                }),
                {
                    icon: COLUMN_LEVEL_ICONS.autorizar,
                    label: t(COLUMN_AUTHORIZE.labelKey),
                    checked: grantSet.has(authKey),
                    disabled: !verGranted,
                    onChange: (checked) => { setKeys([authKey], checked); render(); },
                },
            ];
            container.appendChild(buildLevelSequenceRow(depth + 1, items));
        }

        // A classification (e.g. "Control Interno") groups several columns
        // under one expandable row, same container pattern as `sm` nodes
        // with a sub-submenu (see render() below) — leafKeys computed
        // locally (one "solo-ver" key per column) since Columna is outside
        // leafKeysUnder's reach on purpose. costEdit mode gets no cost slot
        // of its own here (pricing stays at Columna); clientTricolor gets
        // its color from the same extraSlotArgs/colorFor every other
        // container level already uses; grantReadonlyCost cascades
        // "solo-ver" to every column on click, mirroring PermissionTree.js.
        function renderClassificationGroup(container, section, item, sm, subSm, cls) {
            const classBase = `${sm.id}/${subSm.id}/${cls.id}`;
            const classLeafKeys = cls.submenu.map((col) => keyOf(section.id, item.id, `${classBase}/${col.id}/solo-ver`));
            const classChecked = classLeafKeys.filter((k) => grantSet.has(k)).length;
            const classTreeKey = `cls::${section.id}::${item.id}::${classBase}`;
            const classExpanded = expandedItems.has(classTreeKey);
            // Depth 5 — a sibling of the table's own plain columns (also 5,
            // see renderColumns), not depth 4 (the "Tabla <X>" heading's own
            // depth) — same fix as PermissionTree.js's renderClassificationGroup,
            // otherwise its children (forced to the shared depth-5 indent)
            // are indistinguishable from every other depth-5 column.
            const { row, input } = buildRow(t(cls.labelKey, cls.labelParams), 5, {
                expanded: classExpanded,
                onToggle: () => { if (classExpanded) expandedItems.delete(classTreeKey); else expandedItems.add(classTreeKey); },
            }, ...extraSlotArgs(null, classLeafKeys), computeAppToggle(classLeafKeys) || appExtraSlotArgs(classLeafKeys));
            row.classList.add('perm-tree-row-classification');
            if (input && mode !== 'clientTricolor') {
                input.checked = classChecked === classLeafKeys.length;
                input.indeterminate = classChecked > 0 && classChecked < classLeafKeys.length;
                input.addEventListener('change', () => { setKeys(classLeafKeys, input.checked); render(); });
            }
            container.appendChild(row);
            if (!classExpanded) return;
            // Own tinted wrapper (same idea as PermissionTree.js) so the
            // whole group reads as one visual unit distinct from the plain
            // columns around it.
            const classChildren = document.createElement('div');
            classChildren.className = 'perm-tree-classification-children';
            container.appendChild(classChildren);
            cls.submenu.forEach((col) => renderColumnRow(classChildren, section, item, `${classBase}/${col.id}`, col, 6));
        }

        // Every column's own "solo-ver" key under this pantalla's Tabla,
        // classification groups expanded to their own columns -- same
        // traversal renderColumns itself walks below, reused so the "Tabla
        // <X>" heading's own checkbox (select every column at once) and its
        // checked/indeterminate reflection read/write the exact same set.
        function tableSoloVerKeys(section, item, sm, subSm) {
            const keys = [];
            (subSm.submenu || []).forEach((entry) => {
                const cols = entry.isClassification ? entry.submenu : [entry];
                cols.forEach((col) => {
                    const colBase = entry.isClassification
                        ? `${sm.id}/${subSm.id}/${entry.id}/${col.id}`
                        : `${sm.id}/${subSm.id}/${entry.id}`;
                    keys.push(keyOf(section.id, item.id, `${colBase}/solo-ver`));
                });
            });
            return keys;
        }

        // Mirrors PermissionTree.js's cascadeTableColumns -- checking the
        // heading lands every column on Solo Ver only (Operar/Editar/
        // Autorizar stay a deliberate per-column choice); unchecking clears
        // all 4 levels for every column.
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

        function renderColumns(container, section, item, sm, subSm) {
            // "Tabla <X>" heading is its own collapsible unit too (same
            // convention as PermissionTree.js's renderTableColumns), and (in
            // grantReadonlyCost mode) now has its own select-all checkbox
            // too, same as PermissionTree.js's just got -- one toggle folds
            // just the column list, independent of the OUTER toggle on
            // subSm's own row (see below) that hides this whole block
            // (heading + columns) entirely.
            const tableTreeKey = `table::${section.id}::${item.id}::${sm.id}/${subSm.id}`;
            const tableExpanded = expandedItems.has(tableTreeKey);
            const tableLeafKeys = tableSoloVerKeys(section, item, sm, subSm);
            const tableChecked = tableLeafKeys.filter((k) => grantSet.has(k)).length;
            const { row: tableRowEl, input: tableInput } = buildRow(`${t('main.tablePrefix')} ${t(subSm.labelKey, subSm.labelParams)}`, 4, {
                expanded: tableExpanded,
                onToggle: () => { if (tableExpanded) expandedItems.delete(tableTreeKey); else expandedItems.add(tableTreeKey); },
            }, ...extraSlotArgs(null, tableLeafKeys), computeAppToggle(tableLeafKeys) || appExtraSlotArgs(tableLeafKeys));
            if (tableInput && mode !== 'clientTricolor') {
                tableInput.checked = tableLeafKeys.length > 0 && tableChecked === tableLeafKeys.length;
                tableInput.indeterminate = tableChecked > 0 && tableChecked < tableLeafKeys.length;
                tableInput.addEventListener('change', () => {
                    cascadeTableColumns(section, item, sm, subSm, tableInput.checked);
                    render();
                });
            }
            container.appendChild(tableRowEl);
            if (!tableExpanded) return;
            subSm.submenu.forEach((entry) => {
                if (entry.isClassification) {
                    renderClassificationGroup(container, section, item, sm, subSm, entry);
                    return;
                }
                renderColumnRow(container, section, item, `${sm.id}/${subSm.id}/${entry.id}`, entry, 5);
            });
        }

        function render() {
            container.innerHTML = '';
            if (mode === 'grantReadonlyCost') {
                const header = document.createElement('div');
                header.className = 'perm-tree-app-header';
                header.innerHTML = `<span class="perm-tree-app-header-label"><i class="bx bx-mobile-alt" aria-hidden="true"></i>${t('main.appVisionColumn')}</span>`;
                container.appendChild(header);
            }
            sectionsData.forEach((section) => {
                const sectionLeafKeys = section.items.flatMap((item) => leafKeysUnder(section, item));
                const sectionChecked = sectionLeafKeys.filter((k) => grantSet.has(k)).length;
                const sectionExpanded = expandedSections.has(section.id);
                const { row: sectionRowEl, input: sectionInput } = buildRow(t(sectionLabelKey(section)), 0, section.items.length ? {
                    expanded: sectionExpanded,
                    onToggle: () => { if (sectionExpanded) expandedSections.delete(section.id); else expandedSections.add(section.id); },
                } : null, ...extraSlotArgs(keyOf(section.id, null, null), sectionLeafKeys), computeAppToggle(sectionLeafKeys) || appExtraSlotArgs(sectionLeafKeys));
                if (sectionInput && mode !== 'clientTricolor') {
                    sectionInput.checked = sectionChecked === sectionLeafKeys.length && sectionLeafKeys.length > 0;
                    sectionInput.indeterminate = sectionChecked > 0 && sectionChecked < sectionLeafKeys.length;
                    sectionInput.addEventListener('change', () => { setKeys(sectionLeafKeys, sectionInput.checked); render(); });
                }
                container.appendChild(sectionRowEl);
                if (!sectionExpanded) return;

                section.items.forEach((item) => {
                    const itemLeafKeys = leafKeysUnder(section, item);
                    const itemChecked = itemLeafKeys.filter((k) => grantSet.has(k)).length;
                    const hasSubmenu = !!(item.submenu && item.submenu.length);
                    const itemKey = `${section.id}::${item.id}`;
                    const itemExpanded = expandedItems.has(itemKey);
                    const { row: itemRowEl, input: itemInput } = buildRow(t(item.labelKey, item.labelParams), 1, hasSubmenu ? {
                        expanded: itemExpanded,
                        onToggle: () => { if (itemExpanded) expandedItems.delete(itemKey); else expandedItems.add(itemKey); },
                    } : null, ...extraSlotArgs(keyOf(section.id, item.id, null), itemLeafKeys), computeAppToggle(itemLeafKeys) || appExtraSlotArgs(itemLeafKeys));
                    if (itemInput && mode !== 'clientTricolor') {
                        itemInput.checked = itemChecked === itemLeafKeys.length;
                        itemInput.indeterminate = itemChecked > 0 && itemChecked < itemLeafKeys.length;
                        itemInput.addEventListener('change', () => { setKeys(itemLeafKeys, itemInput.checked); render(); });
                    }
                    container.appendChild(itemRowEl);
                    if (!hasSubmenu || !itemExpanded) return;

                    item.submenu.forEach((sm) => {
                        const hasSubSubmenu = !!(sm.submenu && sm.submenu.length);
                        const smCostKey = keyOf(section.id, item.id, sm.id);
                        if (!hasSubSubmenu) {
                            const { row: smRowEl, input: smInput } = buildRow(t(sm.labelKey, sm.labelParams), 2, null, ...extraSlotArgs(smCostKey, [smCostKey]), computeAppToggle([smCostKey]) || appExtraSlotArgs([smCostKey]));
                            if (smInput && mode !== 'clientTricolor') {
                                smInput.checked = grantSet.has(smCostKey);
                                smInput.addEventListener('change', () => { setKeys([smCostKey], smInput.checked); render(); });
                            }
                            container.appendChild(smRowEl);
                            return;
                        }

                        const smLeafKeys = sm.submenu.map((subSm) => (
                            subSm.standalone ? keyOf(section.id, subSm.id, null) : keyOf(section.id, item.id, `${sm.id}/${subSm.id}`)
                        ));
                        const smChecked = smLeafKeys.filter((k) => grantSet.has(k)).length;
                        const smKey = `${section.id}::${item.id}::${sm.id}`;
                        const smExpandedNow = expandedItems.has(smKey);
                        const { row: smRowEl2, input: smInput2 } = buildRow(t(sm.labelKey, sm.labelParams), 2, {
                            expanded: smExpandedNow,
                            onToggle: () => { if (smExpandedNow) expandedItems.delete(smKey); else expandedItems.add(smKey); },
                        }, ...extraSlotArgs(smCostKey, smLeafKeys), computeAppToggle(smLeafKeys) || appExtraSlotArgs(smLeafKeys));
                        if (smInput2 && mode !== 'clientTricolor') {
                            smInput2.checked = smChecked === smLeafKeys.length;
                            smInput2.indeterminate = smChecked > 0 && smChecked < smLeafKeys.length;
                            smInput2.addEventListener('change', () => { setKeys(smLeafKeys, smInput2.checked); render(); });
                        }
                        container.appendChild(smRowEl2);
                        if (!smExpandedNow) return;

                        sm.submenu.forEach((subSm) => {
                            const key = subSm.standalone
                                ? keyOf(section.id, subSm.id, null)
                                : keyOf(section.id, item.id, `${sm.id}/${subSm.id}`);
                            // Own chevron (on top of the checkbox) when this
                            // pantalla has a table — folds the whole "Tabla
                            // <X>" block away as one unit, same fix as
                            // PermissionTree.js's equivalent subRow.
                            const subHasDetail = !!(subSm.submenu && subSm.submenu.length);
                            const subDetailKey = `subdetail::${section.id}::${item.id}::${sm.id}::${subSm.id}`;
                            const subDetailExpanded = expandedItems.has(subDetailKey);
                            const { row: subRowEl, input: subInput } = buildRow(t(subSm.labelKey, subSm.labelParams), 3, subHasDetail ? {
                                expanded: subDetailExpanded,
                                onToggle: () => { if (subDetailExpanded) expandedItems.delete(subDetailKey); else expandedItems.add(subDetailKey); },
                            } : null, ...extraSlotArgs(key, [key]), computeAppToggle([key]) || appExtraSlotArgs([key]));
                            if (subInput && mode !== 'clientTricolor') {
                                subInput.checked = grantSet.has(key);
                                subInput.addEventListener('change', () => { setKeys([key], subInput.checked); render(); });
                            }
                            container.appendChild(subRowEl);

                            if (subHasDetail && subDetailExpanded) {
                                renderColumns(container, section, item, sm, subSm);
                            }
                        });
                    });
                });
            });
        }

        // clientTricolor only — same per-level independent-sum algorithm as
        // db.js's computeCostTotalForGrantSet, run client-side against
        // effectiveClientSet() (client's own grants + any unsaved pending
        // additions) so the "+ Adicionales" modal can show a running total
        // before Guardar. Never needs to subtract plan overlap: a node can
        // only ever be red (and therefore selectable) when NEITHER the plan
        // nor the client already cover it, so nothing summed here was ever
        // already counted in the plan's own cost.
        function computeAdditionalCostTotal() {
            const set = effectiveClientSet();
            const costOf = (k) => costMap.get(k) || 0;
            let total = 0;
            sectionsData.forEach((section) => {
                const sectionLeafKeys = section.items.flatMap((item) => leafKeysUnder(section, item));
                const sectionKey = keyOf(section.id, null, null);
                if (sectionLeafKeys.length && sectionLeafKeys.every((k) => set.has(k))) total += costOf(sectionKey);
                if (sectionLeafKeys.length && sectionLeafKeys.every((k) => set.has(k + APP_SUFFIX))) total += costOf(sectionKey + APP_SUFFIX);

                section.items.forEach((item) => {
                    const itemLeafKeys = leafKeysUnder(section, item);
                    const itemKey = keyOf(section.id, item.id, null);
                    if (itemLeafKeys.length && itemLeafKeys.every((k) => set.has(k))) total += costOf(itemKey);
                    if (itemLeafKeys.length && itemLeafKeys.every((k) => set.has(k + APP_SUFFIX))) total += costOf(itemKey + APP_SUFFIX);
                    if (!(item.submenu && item.submenu.length)) return;

                    item.submenu.forEach((sm) => {
                        const smCostKey = keyOf(section.id, item.id, sm.id);
                        if (!(sm.submenu && sm.submenu.length)) {
                            if (set.has(smCostKey)) total += costOf(smCostKey);
                            if (set.has(smCostKey + APP_SUFFIX)) total += costOf(smCostKey + APP_SUFFIX);
                            return;
                        }
                        const smLeafKeys = sm.submenu.map((subSm) => (
                            subSm.standalone ? keyOf(section.id, subSm.id, null) : keyOf(section.id, item.id, `${sm.id}/${subSm.id}`)
                        ));
                        if (smLeafKeys.every((k) => set.has(k))) total += costOf(smCostKey);
                        if (smLeafKeys.every((k) => set.has(k + APP_SUFFIX))) total += costOf(smCostKey + APP_SUFFIX);

                        sm.submenu.forEach((subSm) => {
                            // Pantalla's OWN price — same fix as db.js's
                            // computeCostTotalForGrantSet (see its comment):
                            // independent from, and in addition to, the
                            // Categoría rollup above and any Columna prices
                            // below.
                            const subSmItemId = subSm.standalone ? subSm.id : item.id;
                            const subSmSubmenuId = subSm.standalone ? null : `${sm.id}/${subSm.id}`;
                            const subSmKey = keyOf(section.id, subSmItemId, subSmSubmenuId);
                            if (set.has(subSmKey)) total += costOf(subSmKey);
                            if (set.has(subSmKey + APP_SUFFIX)) total += costOf(subSmKey + APP_SUFFIX);
                            if (!(subSm.submenu && subSm.submenu.length)) return;
                            subSm.submenu.forEach((col) => {
                                const base = `${sm.id}/${subSm.id}/${col.id}`;
                                const colKey = keyOf(section.id, item.id, base);
                                const levelKeys = [...COLUMN_LEVELS, COLUMN_AUTHORIZE].map((l) => keyOf(section.id, item.id, `${base}/${l.id}`));
                                if (levelKeys.some((k) => set.has(k))) total += costOf(colKey);
                                // App-vision for a column is its own single
                                // "solo-ver" toggle (see appColumnExtraSlot),
                                // never the 4 sub-permission levels.
                                if (set.has(keyOf(section.id, item.id, `${base}/solo-ver`) + APP_SUFFIX)) {
                                    total += costOf(colKey + APP_SUFFIX);
                                }
                            });
                        });
                    });
                });
            });
            return total;
        }

        return {
            // clientGrants is only meaningful (and only fetched by callers)
            // in clientTricolor mode — ignored otherwise. sectorDefaultGrants
            // is the grantReadonlyCost analogue: a Plan's own Sector's raw
            // grants, ignored in every other mode.
            async init(initialGrants, initialCosts, clientGrants, sectorDefaultGrants) {
                sectorDefaultSet = new Set((sectorDefaultGrants || []).map((g) => keyOf(g.sectionId, g.itemId, g.submenuId)));
                const { sections: allSections, areaCategories, areaOverrides, areas } = await loadMenuData();
                const mainSection = allSections.find((s) => s.id === 'main');
                const generalItems = (mainSection?.items || []).filter((i) => ['home', 'panel', 'dashboard'].includes(i.id));
                const adminBusinessItem = mainSection?.items.find((i) => i.id === 'admin-business');
                const BUTTON_CONFIG_ITEM_IDS = ['btn-salir', 'btn-departamento', 'btn-area', 'btn-cc'];
                const buttonConfigItems = BUTTON_CONFIG_ITEM_IDS
                    .map((id) => mainSection?.items.find((i) => i.id === id))
                    .filter(Boolean)
                    .map((i) => ({ ...i, standalone: true }));

                const scopedSections = allowedSectionIds
                    ? allSections.filter((s) => s.id === 'main' || allowedSectionIds.includes(s.id))
                    : allSections;
                sectionsData = scopedSections.map((s) => {
                    if (s.id !== 'main') {
                        const deptAreas = (areas && areas[s.id]) || GENERIC_AREAS;
                        const areaItems = deptAreas.map((area) => ({
                            id: area.id,
                            labelKey: area.labelKey,
                            labelParams: area.labelParams,
                            submenu: categoriesForArea(s.id, area.id, areaCategories || [], areaOverrides),
                        }));
                        // clientTricolor mode deliberately drops generalItems
                        // (home/panel/dashboard) here, unlike costEdit/
                        // grantReadonlyCost — those two modes exist to feed a
                        // checkbox cascade that's self-consistent regardless
                        // of tree shape, but clientTricolor cross-checks its
                        // OWN leaf set against the server's
                        // buildPlanTreeSections() (db.js), which never
                        // includes generalItems under a non-main department.
                        // Keeping them here would make a fully-sold
                        // department register as "mixed" (missing 3 leaves
                        // the server never required) instead of green.
                        return { ...s, items: mode === 'clientTricolor' ? areaItems : [...generalItems, ...areaItems] };
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
                    return { ...s, items };
                });

                pendingAdditions = new Set();
                if (mode === 'clientTricolor') {
                    grantSet = new Set();
                    planGrantSet = buildExpandedSet(initialGrants);
                    clientGrantSet = buildExpandedSet(clientGrants);
                } else {
                    grantSet = buildExpandedSet(initialGrants);
                    planGrantSet = new Set();
                    clientGrantSet = new Set();
                }

                costMap = new Map((initialCosts || []).filter((c) => c.cost > 0).map((c) => [keyOf(c.sectionId, c.itemId, c.submenuId), c.cost]));

                expandedSections = new Set();
                expandedItems = new Set();
                render();
            },
            // Modal-wide "Igualar Visión APP con Web" button (grantReadonlyCost
            // only) -- a no-op call in any other mode.
            equalizeAllAppToWeb,
            // Modal-wide "Agregar Visión APP faltante" button -- same
            // grantReadonlyCost-only guard, additive-only.
            fillAllMissingAppToWeb,
            getGrants() {
                return Array.from(grantSet).map((k) => {
                    const [sectionId, itemId, submenuId] = k.split('::');
                    return { sectionId, itemId: itemId || null, submenuId: submenuId || null };
                });
            },
            getCosts() {
                return Array.from(costMap.entries()).map(([k, cost]) => {
                    const [sectionId, itemId, submenuId] = k.split('::');
                    return { sectionId, itemId: itemId || null, submenuId: submenuId || null, cost };
                });
            },
            // clientTricolor only — clientGrantSet plus any pending (unsaved)
            // red-checkbox additions, as the same {sectionId,itemId,
            // submenuId} tuple array the permission-grants PUT route expects.
            getClientGrants() {
                return Array.from(effectiveClientSet()).map((k) => {
                    const [sectionId, itemId, submenuId] = k.split('::');
                    return { sectionId, itemId: itemId || null, submenuId: submenuId || null };
                });
            },
            // clientTricolor + interactive only — live PAGO POR ADICIONALES
            // preview (permissions half only) before Guardar.
            getAdditionalCostTotal() {
                return computeAdditionalCostTotal();
            },
        };
    }

    window.PermissionCostTree = { create };
})();
