// ---------------------------------------------------------------------------
// Reusable Departamento > Área > Apartado > Pantalla > Columna checkbox
// tree, built from data/menu.json. Used by both Business-Roles.html
// (profile grants) and Business-Accesos.html (per-user extra grants).
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
    function create(container, { allowedSectionIds = null, costCenters = [], readOnly = false, enabledModuleKeys = null, showAppTab = false } = {}) {
        let sectionsData = [];
        let grantSet = new Set();
        // Which depth-0 sections and depth-1 items are expanded — set once
        // in init() (anything already granted starts open so it's not
        // hidden; everything else starts collapsed), then toggled freely by
        // the chevron buttons from there. Collapsing/expanding never
        // touches grantSet, so it can't change what's actually saved.
        let expandedSections = new Set();
        let expandedItems = new Set();
        // { app: {id,name,sector,icon,colorFrom,colorTo} | null, screens: [...] }
        // — this client's assigned App (see GET /api/business/app-screens),
        // fetched once in init() when showAppTab is on.
        let appInfo = { app: null, screens: [] };
        let activeTab = 'web';
        // Where the Web tree actually renders — stays `container` itself
        // until renderTabs() (below) discovers there's a real App tab to
        // show, at which point it becomes that tab's own pane div. Every
        // existing render() call in this file keeps working unchanged
        // either way, since it only ever touches `treeRoot`, never
        // `container` directly.
        let treeRoot = container;
        let appPaneEl = null; // set by mountTabs() once init() finds a real App to show

        function isModuleEnabled(moduleKey) {
            return !enabledModuleKeys || enabledModuleKeys.includes(moduleKey);
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

        // toggle is null for leaf rows (no children to expand) — they get an
        // invisible spacer instead, so every row's checkbox/status badge
        // still lines up regardless of depth. `blocked` is only meaningful
        // in readOnly mode (see create()'s readOnly option) — draws a
        // habilitado/bloqueado status badge instead of a checkbox, and
        // returns input:null since there's nothing to check/toggle.
        function buildRow(labelText, depth, toggle, blocked) {
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

            return { row, input };
        }

        function setKeys(keys, checked) {
            keys.forEach((k) => (checked ? grantSet.add(k) : grantSet.delete(k)));
        }

        // A row with no checkbox/grant of its own — used for the "Tabla <X>"
        // heading (a pantalla's table is always exactly one; nothing
        // meaningful to select/deselect at that level). `toggle`, when
        // given, adds the same chevron expand/collapse button buildRow's
        // checkbox rows use, so a long column list can be folded away as a
        // whole; omit it for a row that's just permanently visible.
        function buildStaticRow(labelText, depth, toggle) {
            const row = document.createElement('div');
            row.className = `perm-tree-row perm-tree-depth-${depth} perm-tree-row-static`;
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
            const label = document.createElement('span');
            label.className = 'perm-tree-static-label';
            label.textContent = labelText;
            row.appendChild(label);
            return row;
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
            // The column's own row IS "Solo Ver" -- its checkbox toggles that
            // grant directly, same mutual-exclusion rule as the other 2
            // levels below. Expanding it reveals just Ver y Operar/Editar
            // (Solo Ver no longer needs its own separate child row) plus the
            // independent Autorizar toggle.
            const colRow = buildRow(t(col.labelKey, col.labelParams), depth, {
                expanded: colExpanded,
                onToggle: () => {
                    if (colExpanded) expandedItems.delete(colTreeKey);
                    else expandedItems.add(colTreeKey);
                },
            }, subBlocked);
            if (!readOnly) {
                colRow.input.checked = grantSet.has(soloVerKey);
                colRow.input.addEventListener('change', () => {
                    if (colRow.input.checked) {
                        COLUMN_LEVELS.forEach((other) => {
                            if (other.id === 'solo-ver') return;
                            grantSet.delete(keyOf(section.id, item.id, `${base}/${other.id}`));
                        });
                    }
                    setKeys([soloVerKey], colRow.input.checked);
                    render();
                });
            }
            container.appendChild(colRow.row);
            if (!colExpanded) return;

            COLUMN_LEVELS.filter((level) => level.id !== 'solo-ver').forEach((level) => {
                const levelKey = keyOf(section.id, item.id, `${base}/${level.id}`);
                const levelRow = buildRow(t(level.labelKey), depth + 1, null, subBlocked);
                if (!readOnly) {
                    levelRow.input.checked = grantSet.has(levelKey);
                    levelRow.input.addEventListener('change', () => {
                        if (levelRow.input.checked) {
                            // Uncheck the other 2 mutually-exclusive levels for this column.
                            COLUMN_LEVELS.forEach((other) => {
                                if (other.id === level.id) return;
                                grantSet.delete(keyOf(section.id, item.id, `${base}/${other.id}`));
                            });
                        }
                        setKeys([levelKey], levelRow.input.checked);
                        render();
                    });
                }
                container.appendChild(levelRow.row);
            });

            const authKey = keyOf(section.id, item.id, `${base}/${COLUMN_AUTHORIZE.id}`);
            const authRow = buildRow(t(COLUMN_AUTHORIZE.labelKey), depth + 1, null, subBlocked);
            if (!readOnly) {
                authRow.input.checked = grantSet.has(authKey);
                authRow.input.addEventListener('change', () => {
                    setKeys([authKey], authRow.input.checked);
                    render();
                });
            }
            container.appendChild(authRow.row);
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
            const classRow = buildRow(t(cls.labelKey, cls.labelParams), 4, {
                expanded: classExpanded,
                onToggle: () => {
                    if (classExpanded) expandedItems.delete(classTreeKey);
                    else expandedItems.add(classTreeKey);
                },
            }, subBlocked);
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
            cls.submenu.forEach((col) => {
                renderColumnRow(container, section, item, `${classBase}/${col.id}`, col, 5, subBlocked);
            });
        }

        // Renders the "Tabla <pantalla>" heading + one row per entry in the
        // pantalla's own column list — either a plain column, or (when
        // marked isClassification) a group like "Control Interno" that
        // nests several columns under one shared toggle. The heading itself
        // is now a toggle too (same expandedItems Set/collapsed-by-default
        // convention as every other row here) so a long column list
        // (Control Interno's 13 plus a pantalla's own) can be folded away
        // as a whole instead of always taking up the full height.
        function renderTableColumns(container, section, item, sm, subSm, subBlocked) {
            const tableTreeKey = `table::${section.id}::${item.id}::${sm.id}/${subSm.id}`;
            const tableExpanded = expandedItems.has(tableTreeKey);
            container.appendChild(buildStaticRow(`${t('main.tablePrefix')} ${t(subSm.labelKey, subSm.labelParams)}`, 4, {
                expanded: tableExpanded,
                onToggle: () => {
                    if (tableExpanded) expandedItems.delete(tableTreeKey);
                    else expandedItems.add(tableTreeKey);
                },
            }));
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
        // single ordinary leaf, same shape as a plain pantalla checkbox.
        function renderIconPermissions(container, section, item, sm, subSm, subBlocked) {
            const iconsTreeKey = `icons::${section.id}::${item.id}::${sm.id}/${subSm.id}`;
            const iconsExpanded = expandedItems.has(iconsTreeKey);
            container.appendChild(buildStaticRow(t('menu.iconsPersonalization'), 4, {
                expanded: iconsExpanded,
                onToggle: () => {
                    if (iconsExpanded) expandedItems.delete(iconsTreeKey);
                    else expandedItems.add(iconsTreeKey);
                },
            }));
            if (!iconsExpanded) return;
            subSm.iconsSubmenu.forEach((icon) => {
                const iconKey = keyOf(section.id, item.id, `${sm.id}/${subSm.id}/${icon.id}`);
                const iconRow = buildRow(t(icon.labelKey), 5, null, subBlocked);
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

        function render() {
            treeRoot.innerHTML = '';
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
                } : null, sectionBlocked);
                if (!readOnly) {
                    sectionRow.input.checked = sectionChecked === sectionLeafKeys.length && sectionLeafKeys.length > 0;
                    sectionRow.input.indeterminate = sectionChecked > 0 && sectionChecked < sectionLeafKeys.length;
                    sectionRow.input.addEventListener('change', () => {
                        setKeys(sectionLeafKeys, sectionRow.input.checked);
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
                    } : null, itemBlocked);
                    if (!readOnly) {
                        itemRow.input.checked = itemChecked === itemLeafKeys.length;
                        itemRow.input.indeterminate = itemChecked > 0 && itemChecked < itemLeafKeys.length;
                        itemRow.input.addEventListener('change', () => {
                            setKeys(itemLeafKeys, itemRow.input.checked);
                            render();
                        });
                    }
                    treeRoot.appendChild(itemRow.row);
                    if (!hasSubmenu || !itemExpanded) return;

                    item.submenu.forEach((sm) => {
                        const hasSubSubmenu = !!(sm.submenu && sm.submenu.length);
                        if (!hasSubSubmenu) {
                            const key = keyOf(section.id, item.id, sm.id);
                            const smRow = buildRow(t(sm.labelKey, sm.labelParams), 2, null, itemBlocked);
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
                        }, itemBlocked);
                        if (!readOnly) {
                            smRow.input.checked = smChecked === smLeafKeys.length;
                            smRow.input.indeterminate = smChecked > 0 && smChecked < smLeafKeys.length;
                            smRow.input.addEventListener('change', () => {
                                setKeys(smLeafKeys, smRow.input.checked);
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
                            // leafKeysUnder's comment for why).
                            const subRow = buildRow(t(subSm.labelKey, subSm.labelParams), 3, null, subBlocked);
                            if (!readOnly) {
                                subRow.input.checked = grantSet.has(key);
                                subRow.input.addEventListener('change', () => {
                                    setKeys([key], subRow.input.checked);
                                    render();
                                });
                            }
                            treeRoot.appendChild(subRow.row);

                            if (subSm.submenu && subSm.submenu.length) {
                                renderTableColumns(treeRoot, section, item, sm, subSm, subBlocked);
                            }
                            if (subSm.iconsSubmenu && subSm.iconsSubmenu.length) {
                                renderIconPermissions(treeRoot, section, item, sm, subSm, subBlocked);
                            }
                        });
                    });
                });
            });
            // A Web-tab checkbox change already re-runs render() (see every
            // .addEventListener('change', ...) above) — piggyback the App
            // tab's own redraw on that same event instead of a separate
            // listener, so its lock states never go stale.
            if (appPaneEl) renderAppTab(appPaneEl);
        }

        // Is there at least one grant anywhere under this Web screen (its own
        // visibility leaf, or any column inside it)? Scans grantSet directly
        // rather than walking sectionsData — column-level grants (like
        // app-screen grants themselves) never go through leafKeysUnder/
        // expand(), so a structural walk would miss them; a flat prefix scan
        // over the small live grantSet is simpler and always correct.
        function isWebScreenGranted(screen) {
            if (!screen.sectionId || !screen.itemId || !screen.submenuPrefix) return false;
            const prefix = `${screen.sectionId}::${screen.itemId}::`;
            for (const k of grantSet) {
                if (!k.startsWith(prefix)) continue;
                const submenuId = k.slice(prefix.length);
                if (submenuId === screen.submenuPrefix || submenuId.startsWith(`${screen.submenuPrefix}/`)) return true;
            }
            return false;
        }

        // Same 3 mutually-exclusive levels + independent Autorizar as a
        // Web column's own picker (COLUMN_LEVELS/COLUMN_AUTHORIZE above) —
        // same grant ids too (so a screen's grants stay meaningful even if
        // it's later re-pointed at a different Web screen), just a flatter
        // "pill row" presentation per the confirmed mockup instead of an
        // expandable tree row, and "Ver" instead of "Solo Ver" (the mockup's
        // own reasoning: avoid reading as a duplicate of "Operar" once both
        // sit side by side in one row rather than nested levels).
        const APP_SCREEN_LEVELS = [
            { id: 'solo-ver', labelKey: 'main.permVer' },
            { id: 'ver-y-operar', labelKey: 'main.permVerYOperar' },
            { id: 'editar', labelKey: 'main.permEditar' },
        ];
        const APP_SCREEN_AUTHORIZE = { id: 'autorizar', labelKey: 'main.permAutorizar' };

        function renderAppScreenRow(paneEl, screen) {
            const unlocked = isWebScreenGranted(screen);
            const wrap = document.createElement('div');
            wrap.className = 'perm-tree-app-row-wrap';

            const row = document.createElement('div');
            row.className = `perm-tree-app-row${unlocked ? '' : ' perm-tree-app-row-locked'}`;
            const name = document.createElement('div');
            name.className = 'perm-tree-app-row-name';
            name.textContent = screen.name;
            row.appendChild(name);

            const picker = document.createElement('div');
            picker.className = 'perm-tree-app-picker';
            const makePill = (id, labelKey, onSelect) => {
                const pill = document.createElement('button');
                pill.type = 'button';
                pill.className = 'perm-tree-app-pill';
                pill.textContent = t(labelKey);
                const key = keyOf('app-screens', String(screen.id), id);
                if (grantSet.has(key)) pill.classList.add('selected');
                pill.disabled = readOnly || !unlocked;
                pill.addEventListener('click', () => {
                    onSelect(key);
                    renderAppTab(paneEl);
                });
                picker.appendChild(pill);
            };
            APP_SCREEN_LEVELS.forEach((level) => {
                makePill(level.id, level.labelKey, (key) => {
                    const nowSelected = !grantSet.has(key);
                    if (nowSelected) {
                        APP_SCREEN_LEVELS.forEach((other) => {
                            if (other.id === level.id) return;
                            grantSet.delete(keyOf('app-screens', String(screen.id), other.id));
                        });
                    }
                    setKeys([key], nowSelected);
                });
            });
            makePill(APP_SCREEN_AUTHORIZE.id, APP_SCREEN_AUTHORIZE.labelKey, (key) => {
                setKeys([key], !grantSet.has(key));
            });
            row.appendChild(picker);
            wrap.appendChild(row);

            const note = document.createElement('div');
            const webLabel = t(screen.webScreenLabelKey);
            note.className = unlocked ? 'perm-tree-app-link-line' : 'perm-tree-app-lock-hint';
            note.innerHTML = unlocked
                ? `<i class="bx bx-link" aria-hidden="true"></i> ${t('main.appScreenLinkLine', { webScreen: webLabel })}`
                : `<i class="bx bx-lock-alt" aria-hidden="true"></i> ${t('main.appScreenLockHint', { webScreen: webLabel })}`;
            wrap.appendChild(note);

            paneEl.appendChild(wrap);
        }

        // Re-run any time the Web tree changes too (see render()'s own call
        // to this at its end) — a screen's lock state depends on LIVE,
        // unsaved Web-tab grants, so checking a Web box should unlock its
        // App sibling immediately, without waiting for a save.
        function renderAppTab(paneEl) {
            paneEl.innerHTML = '';
            if (!appInfo.app) return;
            const banner = document.createElement('div');
            banner.className = 'perm-tree-app-banner';
            banner.innerHTML = `<i class="bx ${appInfo.app.icon || 'bx-mobile-alt'}" aria-hidden="true"></i> ${t('main.appAssignedBanner', { name: appInfo.app.name })}`;
            paneEl.appendChild(banner);
            appInfo.screens.forEach((screen) => renderAppScreenRow(paneEl, screen));
        }

        // Only called when init() finds a real App with at least one screen
        // to show — wraps the existing tree in a 2-tab shell (Sistema Web /
        // Aplicación Móvil) and repoints treeRoot at the Web pane, so
        // render() (completely unchanged otherwise) starts drawing into that
        // pane instead of straight into `container`.
        function mountTabs() {
            container.innerHTML = '';
            const tabs = document.createElement('div');
            tabs.className = 'perm-tree-tabs';
            const webBtn = document.createElement('button');
            webBtn.type = 'button';
            webBtn.className = 'perm-tree-tab active';
            webBtn.innerHTML = `<i class="bx bx-desktop" aria-hidden="true"></i><span>${t('main.webTab')}</span>`;
            const appBtn = document.createElement('button');
            appBtn.type = 'button';
            appBtn.className = 'perm-tree-tab';
            appBtn.innerHTML = `<i class="bx bx-mobile-alt" aria-hidden="true"></i><span>${t('main.appTab')}</span>`;
            tabs.append(webBtn, appBtn);

            const webPane = document.createElement('div');
            const appPane = document.createElement('div');
            appPane.hidden = true;
            container.append(tabs, webPane, appPane);

            treeRoot = webPane;
            appPaneEl = appPane;

            webBtn.addEventListener('click', () => {
                activeTab = 'web';
                webBtn.classList.add('active');
                appBtn.classList.remove('active');
                webPane.hidden = false;
                appPane.hidden = true;
            });
            appBtn.addEventListener('click', () => {
                activeTab = 'app';
                appBtn.classList.add('active');
                webBtn.classList.remove('active');
                webPane.hidden = true;
                appPane.hidden = false;
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
                        const res = await fetch('/api/business/app-screens', { credentials: 'include' });
                        if (res.ok) appInfo = await res.json();
                    } catch {
                        appInfo = { app: null, screens: [] };
                    }
                    // Nothing to show a tab FOR yet — a client with no App
                    // assigned, or one whose App has zero screens built —
                    // stays exactly the single-tree view it always was.
                    if (appInfo.app && appInfo.screens.length) mountTabs();
                }
                render();
            },
            getGrants() {
                return Array.from(grantSet).map((k) => {
                    const [sectionId, itemId, submenuId] = k.split('::');
                    return { sectionId, itemId: itemId || null, submenuId: submenuId || null };
                });
            },
        };
    }

    window.PermissionTree = { create };
})();
