// ---------------------------------------------------------------------------
// Cost cascade (Árbol Maestro -> Giro -> Plan, replacing Costo
// Accesos-Permisos' flat per-plan price sheet -- see db.js's own cascade
// comments starting at resolveCostAdjustment). This is the tree an admin
// uses to set ONE Giro's or ONE Plan's own per-node discount/increase
// EXCEPTIONS, on top of that owner's single global default (edited by the
// host screen itself, outside this tree -- see getDefault/setDefault).
//
// Sibling fork of PermissionCostTree.js (same reasoning that file has for
// forking PermissionTree.js: no shared extension hook, and this row's own
// anatomy -- a type selector, two value inputs, a read-only base reference,
// a live resolved-cost preview, a "clear exception" button -- doesn't fit
// any of that file's 3 existing modes). Menu-tree construction (loadMenuData/
// categoriesForArea/sectionLabelKey/the admin-business+button-config swap in
// init()) is copied verbatim from PermissionCostTree.js, since it has to
// produce the exact same {section,item,sm,subSm,col} shape db.js's own
// buildPlanTreeSections()/walkCostTreeNodes() already walk server-side.
//
// Deliberately does NOT descend into a classification group's own nested
// columns (e.g. Control Interno's 13 columns under class-control-interno) --
// walkCostTreeNodes() never does either (it treats a classification group as
// one flat child of subSm.submenu, same as a plain column), so an override
// on a column nested inside one would never actually be read by the cascade.
// Showing it here would be a control that silently does nothing.
// ---------------------------------------------------------------------------

(function () {
    function t(key, params) {
        return window.Dashboard ? window.Dashboard.t(key, params) : key;
    }

    function keyOf(sectionId, itemId, submenuId) {
        return `${sectionId}::${itemId || ''}::${submenuId || ''}`;
    }

    // Copied from PermissionCostTree.js -- see that file's own comment.
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

    // ownerType/ownerId are display-only here (the host screen owns the
    // fetch/save round trip) -- this component only ever works with the
    // {default, overrides, baseCosts|masterCosts, currency} shape its own
    // init() receives, and the plain {sectionId,itemId,submenuId,type,
    // valueWeb,valueApp} array getOverrides() returns.
    function create(container, { ownerType = 'sector' } = {}) {
        let sectionsData = [];
        let currency = 'MXN';
        let defaultAdjust = { type: 'percent', valueWeb: 0, valueApp: 0 };
        let overridesByKey = new Map(); // tupleKey -> {type,valueWeb,valueApp}
        let baseCostByKey = new Map(); // tupleKey -> {web,app} -- master cost (Giro tree) or Giro-resolved cost (Plan tree)
        let expandedSections = new Set();
        let expandedItems = new Set();

        function formatCurrencyLocal(amount) {
            return window.Dashboard ? window.Dashboard.formatCurrency(amount, currency) : String(amount);
        }

        // Client-side mirror of db.js's resolveCostAdjustment -- same
        // narrowest-to-broadest walk (full submenuId path, then each shorter
        // '/'-prefix, then item-level, then department-level, then this
        // owner's own global default), so the live preview shown here always
        // matches what the server will compute once saved. Small intentional
        // client/server duplication, same tolerance this codebase already
        // has elsewhere (see isTupleGranted's own comment in db.js).
        function resolveAdjustment(sectionId, itemId, submenuId) {
            const tryKeys = [];
            if (submenuId) {
                const parts = String(submenuId).split('/');
                for (let i = parts.length; i >= 1; i -= 1) tryKeys.push(keyOf(sectionId, itemId, parts.slice(0, i).join('/')));
            }
            if (itemId) tryKeys.push(keyOf(sectionId, itemId, null));
            tryKeys.push(keyOf(sectionId, null, null));
            for (const k of tryKeys) {
                if (overridesByKey.has(k)) return overridesByKey.get(k);
            }
            return defaultAdjust;
        }
        function applyAdjustment(base, adjustment, platform) {
            const value = platform === 'app' ? adjustment.valueApp : adjustment.valueWeb;
            const result = adjustment.type === 'flat' ? base + value : base * (1 + value / 100);
            return Math.max(0, result);
        }
        function resolvedCostFor(sectionId, itemId, submenuId) {
            const base = baseCostByKey.get(keyOf(sectionId, itemId, submenuId)) || { web: 0, app: 0 };
            const adjustment = resolveAdjustment(sectionId, itemId, submenuId);
            return { web: applyAdjustment(base.web, adjustment, 'web'), app: applyAdjustment(base.app, adjustment, 'app') };
        }

        function buildAdjustRow(labelText, depth, sectionId, itemId, submenuId, toggle) {
            const key = keyOf(sectionId, itemId, submenuId);
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

            const label = document.createElement('span');
            label.className = 'perm-tree-cost-adjust-label';
            label.textContent = labelText;
            row.appendChild(label);

            const base = baseCostByKey.get(key) || { web: 0, app: 0 };
            const baseEl = document.createElement('span');
            baseEl.className = 'perm-tree-cost-adjust-base';
            baseEl.title = t('admin.costAdjustBase');
            baseEl.textContent = (base.web || base.app)
                ? `${formatCurrencyLocal(base.web)} / ${formatCurrencyLocal(base.app)}`
                : '—';
            row.appendChild(baseEl);

            const existingOverride = overridesByKey.get(key);
            const effective = existingOverride || defaultAdjust;

            const typeSelect = document.createElement('select');
            typeSelect.className = 'perm-tree-cost-adjust-type';
            [['percent', t('admin.costAdjustPercent')], ['flat', t('admin.costAdjustFlat')]].forEach(([value, labelOpt]) => {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = labelOpt;
                if (effective.type === value) opt.selected = true;
                typeSelect.appendChild(opt);
            });

            const webInput = document.createElement('input');
            webInput.type = 'number';
            webInput.step = '0.01';
            webInput.className = 'perm-tree-cost-adjust-value';
            webInput.value = effective.valueWeb || 0;
            webInput.setAttribute('aria-label', t('admin.costAdjustValueWeb'));

            const appInput = document.createElement('input');
            appInput.type = 'number';
            appInput.step = '0.01';
            appInput.className = 'perm-tree-cost-adjust-value';
            appInput.value = effective.valueApp || 0;
            appInput.setAttribute('aria-label', t('admin.costAdjustValueApp'));

            const resultEl = document.createElement('span');
            resultEl.className = 'perm-tree-cost-adjust-result';
            function refreshResult() {
                const resolved = resolvedCostFor(sectionId, itemId, submenuId);
                resultEl.textContent = `${formatCurrencyLocal(resolved.web)} / ${formatCurrencyLocal(resolved.app)}`;
            }
            refreshResult();

            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'perm-tree-cost-adjust-clear';
            clearBtn.innerHTML = '<i class="bx bx-reset" aria-hidden="true"></i>';
            clearBtn.title = t('admin.costAdjustClear');
            clearBtn.hidden = !existingOverride;

            function commitOverride() {
                const type = typeSelect.value === 'flat' ? 'flat' : 'percent';
                const valueWeb = parseFloat(webInput.value) || 0;
                const valueApp = parseFloat(appInput.value) || 0;
                if (!valueWeb && !valueApp) overridesByKey.delete(key);
                else overridesByKey.set(key, { type, valueWeb, valueApp });
                clearBtn.hidden = !overridesByKey.has(key);
                refreshResult();
            }
            typeSelect.addEventListener('change', commitOverride);
            webInput.addEventListener('change', commitOverride);
            appInput.addEventListener('change', commitOverride);

            clearBtn.addEventListener('click', () => {
                overridesByKey.delete(key);
                typeSelect.value = defaultAdjust.type;
                webInput.value = defaultAdjust.valueWeb || 0;
                appInput.value = defaultAdjust.valueApp || 0;
                clearBtn.hidden = true;
                refreshResult();
            });

            row.appendChild(typeSelect);
            row.appendChild(webInput);
            row.appendChild(appInput);
            row.appendChild(resultEl);
            row.appendChild(clearBtn);
            return row;
        }

        function render() {
            container.innerHTML = '';
            const treeRoot = document.createElement('div');
            treeRoot.className = 'perm-tree perm-tree-cost-adjust';
            container.appendChild(treeRoot);

            const header = document.createElement('div');
            header.className = 'perm-tree-row perm-tree-cost-adjust-header';
            header.innerHTML = `
                <span class="perm-tree-toggle-spacer"></span>
                <span class="perm-tree-cost-adjust-label">${t('admin.costAdjustNode')}</span>
                <span class="perm-tree-cost-adjust-base">${t('admin.costAdjustBase')}</span>
                <span class="perm-tree-cost-adjust-type">${t('admin.costAdjustType')}</span>
                <span class="perm-tree-cost-adjust-value">${t('admin.costAdjustValueWeb')}</span>
                <span class="perm-tree-cost-adjust-value">${t('admin.costAdjustValueApp')}</span>
                <span class="perm-tree-cost-adjust-result">${t('admin.costAdjustResult')}</span>
            `;
            treeRoot.appendChild(header);

            sectionsData.forEach((section) => {
                const sectionExpanded = expandedSections.has(section.id);
                treeRoot.appendChild(buildAdjustRow(t(sectionLabelKey(section)), 0, section.id, null, null, section.items.length ? {
                    expanded: sectionExpanded,
                    onToggle: () => { if (sectionExpanded) expandedSections.delete(section.id); else expandedSections.add(section.id); },
                } : null));
                if (!sectionExpanded) return;

                section.items.forEach((item) => {
                    const itemTreeKey = `${section.id}::${item.id}`;
                    const itemExpanded = expandedItems.has(itemTreeKey);
                    const hasSubmenu = !!(item.submenu && item.submenu.length);
                    treeRoot.appendChild(buildAdjustRow(t(item.labelKey, item.labelParams), 1, section.id, item.id, null, hasSubmenu ? {
                        expanded: itemExpanded,
                        onToggle: () => { if (itemExpanded) expandedItems.delete(itemTreeKey); else expandedItems.add(itemTreeKey); },
                    } : null));
                    if (!hasSubmenu || !itemExpanded) return;

                    item.submenu.forEach((sm) => {
                        const hasSubSubmenu = !!(sm.submenu && sm.submenu.length);
                        if (!hasSubSubmenu) {
                            treeRoot.appendChild(buildAdjustRow(t(sm.labelKey, sm.labelParams), 2, section.id, item.id, sm.id, null));
                            return;
                        }
                        const smTreeKey = `${section.id}::${item.id}::${sm.id}`;
                        const smExpanded = expandedItems.has(smTreeKey);
                        treeRoot.appendChild(buildAdjustRow(t(sm.labelKey, sm.labelParams), 2, section.id, item.id, sm.id, {
                            expanded: smExpanded,
                            onToggle: () => { if (smExpanded) expandedItems.delete(smTreeKey); else expandedItems.add(smTreeKey); },
                        }));
                        if (!smExpanded) return;

                        sm.submenu.forEach((subSm) => {
                            const subSmItemId = subSm.standalone ? subSm.id : item.id;
                            const subSmSubmenuId = subSm.standalone ? null : `${sm.id}/${subSm.id}`;
                            const hasCols = !!(subSm.submenu && subSm.submenu.length);
                            const subSmTreeKey = `subsm::${section.id}::${subSmItemId}::${subSmSubmenuId || ''}`;
                            const subSmExpanded = expandedItems.has(subSmTreeKey);
                            treeRoot.appendChild(buildAdjustRow(t(subSm.labelKey, subSm.labelParams), 3, section.id, subSmItemId, subSmSubmenuId, hasCols ? {
                                expanded: subSmExpanded,
                                onToggle: () => { if (subSmExpanded) expandedItems.delete(subSmTreeKey); else expandedItems.add(subSmTreeKey); },
                            } : null));
                            if (!hasCols || !subSmExpanded) return;

                            subSm.submenu.forEach((col) => {
                                const base = `${sm.id}/${subSm.id}/${col.id}`;
                                treeRoot.appendChild(buildAdjustRow(t(col.labelKey, col.labelParams), 4, section.id, item.id, base, null));
                            });
                        });
                    });
                });
            });
        }

        return {
            async init(data) {
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

                currency = data.currency || 'MXN';
                defaultAdjust = data.default || { type: 'percent', valueWeb: 0, valueApp: 0 };
                overridesByKey = new Map((data.overrides || []).map((o) => [
                    keyOf(o.sectionId, o.itemId, o.submenuId),
                    { type: o.adjustType, valueWeb: o.adjustValueWeb, valueApp: o.adjustValueApp },
                ]));
                // masterCosts (Giro tree, {sectionId,itemId,submenuId,web,app})
                // or baseCosts (Plan tree, same shape, already Giro-resolved).
                baseCostByKey = new Map((data.baseCosts || data.masterCosts || []).map((c) => [
                    keyOf(c.sectionId, c.itemId, c.submenuId),
                    { web: c.web || 0, app: c.app || 0 },
                ]));
                expandedSections = new Set();
                expandedItems = new Set();
                render();
            },
            getDefault() {
                return { ...defaultAdjust };
            },
            // Called by the host screen's own default-adjustment fieldset
            // (outside this tree) -- re-renders so every row without its own
            // exception shows the new default's resolved preview.
            setDefault(next) {
                defaultAdjust = {
                    type: next.type === 'flat' ? 'flat' : 'percent',
                    valueWeb: Number(next.valueWeb) || 0,
                    valueApp: Number(next.valueApp) || 0,
                };
                render();
            },
            getOverrides() {
                return Array.from(overridesByKey.entries()).map(([key, adj]) => {
                    const [sectionId, itemId, submenuId] = key.split('::');
                    return {
                        sectionId, itemId: itemId || null, submenuId: submenuId || null,
                        type: adj.type, valueWeb: adj.valueWeb, valueApp: adj.valueApp,
                    };
                });
            },
        };
    }

    window.PermissionCostAdjustTree = { create };
})();
