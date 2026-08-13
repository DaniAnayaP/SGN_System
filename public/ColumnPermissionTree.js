// ---------------------------------------------------------------------------
// "Modificar columna guardada" grant tree — a much simpler cousin of
// PermissionTree.js: 2 levels (tabla -> columna), no menu.json, no
// drag/pin, no readOnly mode. Used by Business-Roles.html (profile grants)
// and Business-Accesos.html (per-user extra grants), fed by
// GET /api/business/editable-columns (which itself is generated from each
// table's own *_FIELDS map in db.js — a future table only needs its own
// *_FIELDS map plus one line in server.js's EDITABLE_TABLE_REGISTRY to show
// up here automatically).
//
// Grants are stored as { sectionId: 'col-edit:<tableKey>', itemId: '<colKey>',
// submenuId: null } — same profile_grants/user_grants rows the menu tree
// uses, just a different sectionId namespace, so getGrants() here can be
// concatenated straight into the same array PermissionTree.js produces
// before the existing single "Guardar" PUTs it.
// ---------------------------------------------------------------------------

(function () {
    function t(key, params) {
        return window.Dashboard ? window.Dashboard.t(key, params) : key;
    }

    function buildRow(label) {
        const row = document.createElement('div');
        row.className = 'admin-module-row';
        const name = document.createElement('span');
        name.className = 'admin-module-name';
        name.style.flex = '1';
        name.textContent = label;
        row.appendChild(name);
        const toggle = document.createElement('label');
        toggle.className = 'admin-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        const track = document.createElement('span');
        track.className = 'admin-switch-track';
        toggle.append(input, track);
        row.appendChild(toggle);
        return { row, input };
    }

    function create(container, { tables = [] } = {}) {
        container.innerHTML = '';
        const inputsByKey = new Map(); // `${tableKey}::${colKey}` -> checkbox input

        tables.forEach((table) => {
            const heading = document.createElement('h4');
            heading.className = 'admin-module-group-title';
            heading.textContent = t(table.labelKey);
            container.appendChild(heading);

            const list = document.createElement('div');
            list.className = 'admin-module-list';
            table.columns.forEach((col) => {
                const { row, input } = buildRow(t(col.fieldKey));
                list.appendChild(row);
                inputsByKey.set(`${table.tableKey}::${col.key}`, input);
            });
            container.appendChild(list);
        });

        return {
            init(grants) {
                const granted = new Set(
                    (grants || [])
                        .filter((g) => typeof g.sectionId === 'string' && g.sectionId.startsWith('col-edit:'))
                        .map((g) => `${g.sectionId.slice('col-edit:'.length)}::${g.itemId}`),
                );
                inputsByKey.forEach((input, key) => { input.checked = granted.has(key); });
            },
            getGrants() {
                const grants = [];
                inputsByKey.forEach((input, key) => {
                    if (!input.checked) return;
                    const sep = key.indexOf('::');
                    grants.push({ sectionId: `col-edit:${key.slice(0, sep)}`, itemId: key.slice(sep + 2), submenuId: null });
                });
                return grants;
            },
        };
    }

    window.ColumnPermissionTree = { create };
})();
