// ---------------------------------------------------------------------------
// Fork of PermissionTree.js for Costo Accesos-Permisos + Nuestros Planes'
// own access-tree modal. A price is attached to a plan's tree at EVERY
// level (Departamento/Área/Categoría/Pantalla/Columna), stored and summed
// independently per level — see db.js's computeAccessCostTotal for the
// exact "selected" rule per level and why this can double-count the same
// access at multiple levels on purpose.
//
// PermissionTree.js has no extension hook (sectionsData/grantSet/
// expandedSections/expandedItems are closure-private, render() blows away
// and rebuilds container.innerHTML on every interaction) — this is a
// deliberate copy, not a wrapper, kept minimal by dropping everything this
// use case never needs (readOnly/enabledModuleKeys/allowedSectionIds/
// costCenters — a plan's tree is always the full universal one).
//
// Two modes:
//   - 'costEdit' (Costo Accesos-Permisos): every row = label + an editable
//     cost <input>, no checkbox at all — pricing doesn't depend on whether
//     anything is granted in any particular plan. Pricing stops AT Columna
//     (one price for the whole column), never descending into its 4 Solo
//     Ver/Ver y Operar/Editar/Autorizar sub-permission rows.
//   - 'grantReadonlyCost' (Nuestros Planes' shield-icon modal): every row =
//     the SAME interactive checkbox PermissionTree.js already has (nothing
//     about how permissions are granted changes) plus a read-only cost
//     value next to it, sourced from that same plan's already-saved costs.
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

    function create(container, { mode = 'costEdit', currency = 'MXN' } = {}) {
        let sectionsData = [];
        let grantSet = new Set(); // unused/empty in costEdit mode
        let costMap = new Map(); // tupleKey -> cost, editable in costEdit mode, read-only reference in grantReadonlyCost mode
        let expandedSections = new Set();
        let expandedItems = new Set();

        function formatCurrencyLocal(amount) {
            return window.Dashboard ? window.Dashboard.formatCurrency(amount, currency) : String(amount);
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

        // toggle is null for leaf rows (no children to expand). costKey is
        // null to suppress the cost slot entirely (used for the column
        // sub-permission-level rows in grantReadonlyCost mode, which are
        // never individually priced — pricing stops at Columna).
        function buildRow(labelText, depth, toggle, costKey) {
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
            } else {
                const labelEl = document.createElement('label');
                labelEl.className = 'perm-tree-check';
                input = document.createElement('input');
                input.type = 'checkbox';
                const span = document.createElement('span');
                span.textContent = labelText;
                labelEl.append(input, span);
                row.appendChild(labelEl);
            }

            if (costKey != null) row.appendChild(buildCostSlot(costKey));

            return { row, input };
        }

        function setKeys(keys, checked) {
            keys.forEach((k) => (checked ? grantSet.add(k) : grantSet.delete(k)));
        }

        function buildStaticRow(labelText, depth) {
            const row = document.createElement('div');
            row.className = `perm-tree-row perm-tree-depth-${depth} perm-tree-row-static`;
            const spacer = document.createElement('span');
            spacer.className = 'perm-tree-toggle-spacer';
            row.appendChild(spacer);
            const label = document.createElement('span');
            label.className = 'perm-tree-static-label';
            label.textContent = labelText;
            row.appendChild(label);
            return row;
        }

        // Columna row — only used in grantReadonlyCost mode (costEdit mode
        // renders Columna as a plain priced leaf via buildRow instead, see
        // renderColumns below). No checkbox of its own, same as
        // PermissionTree.js — only its 4 sub-permission children are real
        // grants — plus a read-only cost badge sourced from costMap.
        function buildToggleOnlyRow(labelText, depth, toggle, costKey) {
            const row = document.createElement('div');
            row.className = `perm-tree-row perm-tree-depth-${depth}`;
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
            const label = document.createElement('span');
            label.className = 'perm-tree-toggle-label';
            label.textContent = labelText;
            row.appendChild(label);
            if (costKey != null) row.appendChild(buildCostSlot(costKey));
            return row;
        }

        const COLUMN_LEVELS = [
            { id: 'solo-ver', labelKey: 'main.permSoloVer' },
            { id: 'ver-y-operar', labelKey: 'main.permVerYOperar' },
            { id: 'editar', labelKey: 'main.permEditar' },
        ];
        const COLUMN_AUTHORIZE = { id: 'autorizar', labelKey: 'main.permAutorizar' };

        // costEdit mode: Columna is a flat priced leaf, no expand, pricing
        // stops here (never descends into the 4 sub-permission levels).
        // grantReadonlyCost mode: identical toggle-only + 4-checkbox
        // behavior as PermissionTree.js, unchanged, plus a read-only cost
        // badge on the Columna row itself only.
        function renderColumns(container, section, item, sm, subSm) {
            container.appendChild(buildStaticRow(`${t('main.tablePrefix')} ${t(subSm.labelKey, subSm.labelParams)}`, 4));
            subSm.submenu.forEach((col) => {
                const base = `${sm.id}/${subSm.id}/${col.id}`;
                const colCostKey = keyOf(section.id, item.id, base);

                if (mode === 'costEdit') {
                    const { row } = buildRow(t(col.labelKey, col.labelParams), 5, null, colCostKey);
                    container.appendChild(row);
                    return;
                }

                const colTreeKey = `col::${section.id}::${item.id}::${sm.id}::${subSm.id}::${col.id}`;
                const colExpanded = expandedItems.has(colTreeKey);
                const colRow = buildToggleOnlyRow(t(col.labelKey, col.labelParams), 5, {
                    expanded: colExpanded,
                    onToggle: () => { if (colExpanded) expandedItems.delete(colTreeKey); else expandedItems.add(colTreeKey); },
                }, colCostKey);
                container.appendChild(colRow);
                if (!colExpanded) return;

                COLUMN_LEVELS.forEach((level) => {
                    const levelKey = keyOf(section.id, item.id, `${base}/${level.id}`);
                    const { row: levelRowEl, input: levelInput } = buildRow(t(level.labelKey), 6, null, null);
                    levelInput.checked = grantSet.has(levelKey);
                    levelInput.addEventListener('change', () => {
                        if (levelInput.checked) {
                            COLUMN_LEVELS.forEach((other) => {
                                if (other.id === level.id) return;
                                grantSet.delete(keyOf(section.id, item.id, `${base}/${other.id}`));
                            });
                        }
                        setKeys([levelKey], levelInput.checked);
                        render();
                    });
                    container.appendChild(levelRowEl);
                });

                const authKey = keyOf(section.id, item.id, `${base}/${COLUMN_AUTHORIZE.id}`);
                const { row: authRowEl, input: authInput } = buildRow(t(COLUMN_AUTHORIZE.labelKey), 6, null, null);
                authInput.checked = grantSet.has(authKey);
                authInput.addEventListener('change', () => { setKeys([authKey], authInput.checked); render(); });
                container.appendChild(authRowEl);
            });
        }

        function render() {
            container.innerHTML = '';
            sectionsData.forEach((section) => {
                const sectionLeafKeys = section.items.flatMap((item) => leafKeysUnder(section, item));
                const sectionChecked = sectionLeafKeys.filter((k) => grantSet.has(k)).length;
                const sectionExpanded = expandedSections.has(section.id);
                const { row: sectionRowEl, input: sectionInput } = buildRow(t(sectionLabelKey(section)), 0, section.items.length ? {
                    expanded: sectionExpanded,
                    onToggle: () => { if (sectionExpanded) expandedSections.delete(section.id); else expandedSections.add(section.id); },
                } : null, keyOf(section.id, null, null));
                if (sectionInput) {
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
                    } : null, keyOf(section.id, item.id, null));
                    if (itemInput) {
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
                            const { row: smRowEl, input: smInput } = buildRow(t(sm.labelKey, sm.labelParams), 2, null, smCostKey);
                            if (smInput) {
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
                        }, smCostKey);
                        if (smInput2) {
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
                            const { row: subRowEl, input: subInput } = buildRow(t(subSm.labelKey, subSm.labelParams), 3, null, key);
                            if (subInput) {
                                subInput.checked = grantSet.has(key);
                                subInput.addEventListener('change', () => { setKeys([key], subInput.checked); render(); });
                            }
                            container.appendChild(subRowEl);

                            if (subSm.submenu && subSm.submenu.length) {
                                renderColumns(container, section, item, sm, subSm);
                            }
                        });
                    });
                });
            });
        }

        return {
            async init(initialGrants, initialCosts) {
                const { sections: allSections, areaCategories, areaOverrides, areas } = await loadMenuData();
                const mainSection = allSections.find((s) => s.id === 'main');
                const generalItems = (mainSection?.items || []).filter((i) => ['home', 'panel', 'dashboard'].includes(i.id));
                const adminBusinessItem = mainSection?.items.find((i) => i.id === 'admin-business');
                const BUTTON_CONFIG_ITEM_IDS = ['btn-salir', 'btn-departamento', 'btn-area', 'btn-cc'];
                const buttonConfigItems = BUTTON_CONFIG_ITEM_IDS
                    .map((id) => mainSection?.items.find((i) => i.id === id))
                    .filter(Boolean)
                    .map((i) => ({ ...i, standalone: true }));

                sectionsData = allSections.map((s) => {
                    if (s.id !== 'main') {
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
                    return { ...s, items };
                });

                const rawSet = new Set((initialGrants || []).map((g) => keyOf(g.sectionId, g.itemId, g.submenuId)));
                grantSet = new Set();
                sectionsData.forEach((section) => {
                    section.items.forEach((item) => {
                        leafKeysUnder(section, item).forEach((leafKey) => {
                            const [sectionId, itemId, submenuId] = leafKey.split('::');
                            if (isGranted(rawSet, sectionId, itemId || null, submenuId || null)) grantSet.add(leafKey);
                        });
                    });
                });
                (initialGrants || []).forEach((g) => grantSet.add(keyOf(g.sectionId, g.itemId, g.submenuId)));

                costMap = new Map((initialCosts || []).filter((c) => c.cost > 0).map((c) => [keyOf(c.sectionId, c.itemId, c.submenuId), c.cost]));

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
            getCosts() {
                return Array.from(costMap.entries()).map(([k, cost]) => {
                    const [sectionId, itemId, submenuId] = k.split('::');
                    return { sectionId, itemId: itemId || null, submenuId: submenuId || null, cost };
                });
            },
        };
    }

    window.PermissionCostTree = { create };
})();
