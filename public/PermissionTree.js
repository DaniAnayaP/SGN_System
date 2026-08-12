// ---------------------------------------------------------------------------
// Reusable módulo/apartado/pantalla checkbox tree, built from data/menu.json.
// Used by both Business-Roles.html (profile grants) and
// Business-Accesos.html (per-user extra grants).
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

    // The grant model has no "área" dimension (a department section here
    // covers every área within it) — so an área-specific submenu override
    // (see Dashboard.js effectiveAreaCategories, same areaOverrides data)
    // is APPENDED to that category's grantable items here instead of
    // swapped in, since the department's other áreas still show the
    // original ones and those must stay grantable too.
    function withAreaOverrides(sectionId, categories, areaOverrides) {
        if (!areaOverrides) return categories;
        const extraByCategory = Object.entries(areaOverrides)
            .filter(([key]) => key.startsWith(`${sectionId}/`))
            .map(([, overrides]) => overrides);
        if (!extraByCategory.length) return categories;
        return categories.map((cat) => {
            const extra = extraByCategory.flatMap((overrides) => overrides[cat.id] || []);
            return extra.length ? { ...cat, submenu: [...cat.submenu, ...extra] } : cat;
        });
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

    function create(container, { allowedSectionIds = null, costCenters = [] } = {}) {
        let sectionsData = [];
        let grantSet = new Set();
        // Which depth-0 sections and depth-1 items are expanded — set once
        // in init() (anything already granted starts open so it's not
        // hidden; everything else starts collapsed), then toggled freely by
        // the chevron buttons from there. Collapsing/expanding never
        // touches grantSet, so it can't change what's actually saved.
        let expandedSections = new Set();
        let expandedItems = new Set();

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
        // invisible spacer instead, so every row's checkbox still lines up
        // regardless of depth.
        function buildRow(labelText, depth, toggle) {
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
                    render();
                });
                row.appendChild(btn);
            } else {
                const spacer = document.createElement('span');
                spacer.className = 'perm-tree-toggle-spacer';
                row.appendChild(spacer);
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

        function render() {
            container.innerHTML = '';
            sectionsData.forEach((section) => {
                const sectionLeafKeys = section.items.flatMap((item) => leafKeysUnder(section, item));
                const sectionChecked = sectionLeafKeys.filter((k) => grantSet.has(k)).length;
                const sectionExpanded = expandedSections.has(section.id);
                const sectionRow = buildRow(t(sectionLabelKey(section)), 0, section.items.length ? {
                    expanded: sectionExpanded,
                    onToggle: () => {
                        if (sectionExpanded) expandedSections.delete(section.id);
                        else expandedSections.add(section.id);
                    },
                } : null);
                sectionRow.input.checked = sectionChecked === sectionLeafKeys.length && sectionLeafKeys.length > 0;
                sectionRow.input.indeterminate = sectionChecked > 0 && sectionChecked < sectionLeafKeys.length;
                sectionRow.input.addEventListener('change', () => {
                    setKeys(sectionLeafKeys, sectionRow.input.checked);
                    render();
                });
                container.appendChild(sectionRow.row);
                if (!sectionExpanded) return;

                section.items.forEach((item) => {
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
                    } : null);
                    itemRow.input.checked = itemChecked === itemLeafKeys.length;
                    itemRow.input.indeterminate = itemChecked > 0 && itemChecked < itemLeafKeys.length;
                    itemRow.input.addEventListener('change', () => {
                        setKeys(itemLeafKeys, itemRow.input.checked);
                        render();
                    });
                    container.appendChild(itemRow.row);
                    if (!hasSubmenu || !itemExpanded) return;

                    item.submenu.forEach((sm) => {
                        const hasSubSubmenu = !!(sm.submenu && sm.submenu.length);
                        if (!hasSubSubmenu) {
                            const key = keyOf(section.id, item.id, sm.id);
                            const smRow = buildRow(t(sm.labelKey, sm.labelParams), 2);
                            smRow.input.checked = grantSet.has(key);
                            smRow.input.addEventListener('change', () => {
                                setKeys([key], smRow.input.checked);
                                render();
                            });
                            container.appendChild(smRow.row);
                            return;
                        }

                        // One more level down (e.g. "Administración del
                        // Negocio" or "Configuración de Botones" nested
                        // inside "Configuración") — reuses expandedItems
                        // with a 3-part key, distinct from the 2-part
                        // item-level keys above.
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
                        });
                        smRow.input.checked = smChecked === smLeafKeys.length;
                        smRow.input.indeterminate = smChecked > 0 && smChecked < smLeafKeys.length;
                        smRow.input.addEventListener('change', () => {
                            setKeys(smLeafKeys, smRow.input.checked);
                            render();
                        });
                        container.appendChild(smRow.row);
                        if (!smExpandedNow) return;

                        sm.submenu.forEach((subSm) => {
                            const key = subSm.standalone
                                ? keyOf(section.id, subSm.id, null)
                                : keyOf(section.id, item.id, `${sm.id}/${subSm.id}`);
                            const subRow = buildRow(t(subSm.labelKey, subSm.labelParams), 3);
                            subRow.input.checked = grantSet.has(key);
                            subRow.input.addEventListener('change', () => {
                                setKeys([key], subRow.input.checked);
                                render();
                            });
                            container.appendChild(subRow.row);
                        });
                    });
                });
            });
        }

        return {
            async init(initialGrants) {
                const { sections: allSections, areaCategories, areaOverrides } = await loadMenuData();
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
                        return { ...s, items: [...generalItems, ...withAreaOverrides(s.id, areaCategories || [], areaOverrides)] };
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
                // Everything starts collapsed, even sections/items that
                // already have a grant — simpler and more predictable than
                // guessing which rows to auto-open.
                expandedSections = new Set();
                expandedItems = new Set();
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
