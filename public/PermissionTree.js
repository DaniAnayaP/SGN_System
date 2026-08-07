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

    function sectionLabelKey(section) {
        if (section.id === 'main') return 'menu.mainSection';
        const first = section.items[0];
        return first ? first.labelKey : section.id;
    }

    async function loadSections() {
        const res = await fetch('data/menu.json');
        if (!res.ok) throw new Error('failed to load menu.json');
        const data = await res.json();
        return data.sections;
    }

    function leafKeysUnder(section, item) {
        if (item.submenu && item.submenu.length) {
            return item.submenu.map((sm) => keyOf(section.id, item.id, sm.id));
        }
        return [keyOf(section.id, item.id, null)];
    }

    function create(container, { allowedSectionIds = null } = {}) {
        let sectionsData = [];
        let grantSet = new Set();

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

        function buildRow(labelText, depth) {
            const row = document.createElement('label');
            row.className = `perm-tree-row perm-tree-depth-${depth}`;
            const input = document.createElement('input');
            input.type = 'checkbox';
            const span = document.createElement('span');
            span.textContent = labelText;
            row.append(input, span);
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
                const sectionRow = buildRow(t(sectionLabelKey(section)), 0);
                sectionRow.input.checked = sectionChecked === sectionLeafKeys.length && sectionLeafKeys.length > 0;
                sectionRow.input.indeterminate = sectionChecked > 0 && sectionChecked < sectionLeafKeys.length;
                sectionRow.input.addEventListener('change', () => {
                    setKeys(sectionLeafKeys, sectionRow.input.checked);
                    render();
                });
                container.appendChild(sectionRow.row);

                section.items.forEach((item) => {
                    const itemLeafKeys = leafKeysUnder(section, item);
                    const itemChecked = itemLeafKeys.filter((k) => grantSet.has(k)).length;
                    const itemRow = buildRow(t(item.labelKey, item.labelParams), 1);
                    itemRow.input.checked = itemChecked === itemLeafKeys.length;
                    itemRow.input.indeterminate = itemChecked > 0 && itemChecked < itemLeafKeys.length;
                    itemRow.input.addEventListener('change', () => {
                        setKeys(itemLeafKeys, itemRow.input.checked);
                        render();
                    });
                    container.appendChild(itemRow.row);

                    (item.submenu || []).forEach((sm) => {
                        const key = keyOf(section.id, item.id, sm.id);
                        const smRow = buildRow(t(sm.labelKey, sm.labelParams), 2);
                        smRow.input.checked = grantSet.has(key);
                        smRow.input.addEventListener('change', () => {
                            setKeys([key], smRow.input.checked);
                            render();
                        });
                        container.appendChild(smRow.row);
                    });
                });
            });
        }

        return {
            async init(initialGrants) {
                const allSections = await loadSections();
                // 'main' (Inicio, Tablero, Administración del Negocio, etc.)
                // is core navigation, not a contracted module — always shown
                // regardless of which módulos the client has contracted.
                sectionsData = allowedSectionIds
                    ? allSections.filter((s) => s.id === 'main' || allowedSectionIds.includes(s.id))
                    : allSections;
                grantSet = expand(initialGrants || []);
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
