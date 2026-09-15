// ---------------------------------------------------------------------------
// "Árbol Maestro SaaS" -- GEIPSA-wide readiness status (Habilitado/
// Inhabilitado/Construcción/Mejoras + Web/App) for the SaaS team's OWN
// internal screens, now at FULL DEPTH (Grupo -> Pantalla -> Apartado/Tabla/
// Modal -> Columna/Acción) -- same structure and visual language as Árbol
// de Permisos Maestro (PermissionTree.js statusMode), driven by
// SaasAdminCatalog.js instead of data/menu.json. Reuses the same DB tables
// (saas_master_status/saas_master_order) this screen already had as a flat
// 3-row list -- now keyed by many more leaf ids (see buildLeafId), never
// touches master_permission_status/master_permission_order.
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
// count badge, drag-reorder, Navegar) matches the client tree exactly.
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
const CI_LABEL = window.SAAS_ADMIN_CONTROL_INTERNO_LABEL;

// Every leaf/apartado gets a stable id from its POSITION in the catalog
// (screen -> apartado -> column/acción index) rather than a hand-typed
// unique string per leaf -- ~150 leaves across 9 screens would otherwise
// mean ~150 hand-kept-unique ids. Stable as long as SaasAdminCatalog.js's
// own array order doesn't change once real statuses are saved in
// production (reordering the CATALOG itself would silently move a saved
// status onto the wrong leaf) -- append new leaves at the end, don't
// reorder existing ones.
function apartadoKey(screen, apartado) {
    return `${screen.itemId}::${apartado.id}`;
}
function columnKey(screen, apartado, idx) {
    return `${apartadoKey(screen, apartado)}::c${idx}`;
}
function actionKey(screen, apartado, idx) {
    return `${apartadoKey(screen, apartado)}::a${idx}`;
}
function ciKey(screen, apartado) {
    return `${apartadoKey(screen, apartado)}::ci`;
}

// Every leaf key that actually carries its own Estatus/Web-App state (used
// for rollup computation and for the "aplicar a anidados" cascade) --
// columns, actions and the bundled Control Interno node, NOT the apartado
// container itself (static, like the client tree's own "Tabla <X>"
// heading) and NOT the group/screen rows (their own rollup is computed
// FROM these, never stored directly).
function collectLeafKeys(scope) {
    const keys = [];
    const screens = scope.screens || [scope.screen];
    for (const screen of screens) {
        for (const apartado of screen.apartados) {
            (apartado.columnas || []).forEach((_, idx) => keys.push(columnKey(screen, apartado, idx)));
            if (apartado.controlInterno) keys.push(ciKey(screen, apartado));
            (apartado.acciones || []).forEach((_, idx) => keys.push(actionKey(screen, apartado, idx)));
        }
    }
    return keys;
}

const listEl = document.getElementById('saas-master-status-list');
const saveBtn = document.getElementById('saas-master-status-save');
const errorEl = document.getElementById('saas-master-status-error');

let statuses = [];
// order: { groups: [groupId,...], screensByGroup: { groupId: [itemId,...] } }
let order = { groups: CATALOG.map((g) => g.groupId), screensByGroup: {} };
CATALOG.forEach((g) => { order.screensByGroup[g.groupId] = g.screens.map((s) => s.itemId); });
let draggedId = null;
const collapsed = new Set(); // keys currently collapsed (default: everything expanded except columns detail -- keep simple, everything expanded)

function getState(key) {
    return statuses.find((s) => s.itemId === key) || { itemId: key, status: 'habilitado', webEnabled: true, appEnabled: false };
}
function setState(key, next) {
    statuses = statuses.filter((s) => s.itemId !== key);
    statuses.push({ itemId: key, ...next });
}
function cascadeState(keys, next) {
    keys.forEach((key) => setState(key, { ...getState(key), ...next }));
}

function computeRollup(keys, platform) {
    if (!keys.length) return 'empty';
    const onCount = keys.filter((k) => (platform === 'web' ? getState(k).webEnabled : getState(k).appEnabled)).length;
    if (onCount === 0) return 'empty';
    if (onCount === keys.length) return 'full';
    return 'partial';
}

function orderedGroups() {
    return order.groups.map((id) => CATALOG.find((g) => g.groupId === id)).filter(Boolean);
}
function orderedScreens(group) {
    const ids = order.screensByGroup[group.groupId] || group.screens.map((s) => s.itemId);
    return ids.map((id) => group.screens.find((s) => s.itemId === id)).filter(Boolean);
}

function makeDraggable(el, { list, id, onReorder }) {
    el.classList.add('perm-tree-row-draggable');
    el.draggable = true;
    el.addEventListener('dragstart', () => { draggedId = { list, id }; el.classList.add('perm-tree-row-dragging'); });
    el.addEventListener('dragend', () => { draggedId = null; el.classList.remove('perm-tree-row-dragging'); });
    el.addEventListener('dragover', (e) => {
        if (!draggedId || draggedId.list !== list || draggedId.id === id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('perm-tree-row-drop-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('perm-tree-row-drop-target'));
    el.addEventListener('drop', (e) => {
        e.preventDefault();
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

function nestBtn(title, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'perm-tree-mstatus-nest-btn';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML = '<i class="bx bx-copy" aria-hidden="true"></i>';
    btn.addEventListener('click', onClick);
    return btn;
}

// Full controls block (Estatus + aplicar-a-anidados + Web/App + Navegar) --
// used by leaf rows (own key) and by group/screen rows (own key, computed
// as the "set every descendant to this" cascade, same relationship
// Departamento/Área have to their own Estatus in the real tree).
function buildControls(key, descendantKeys, navigateHref) {
    const state = getState(key);
    const controls = document.createElement('div');
    controls.className = 'perm-tree-mstatus-controls';

    const statusCell = document.createElement('div');
    statusCell.className = 'perm-tree-mstatus-status-cell';
    const select = document.createElement('select');
    select.className = `perm-tree-mstatus-select perm-tree-mstatus-select-${state.status}`;
    STATUS_OPTIONS.forEach((opt) => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.textContent = Dashboard.t(opt.labelKey);
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
    if (descendantKeys.length) {
        nestCell.appendChild(nestBtn('Aplicar Estatus a lo anidado', () => {
            cascadeState(descendantKeys, { status: select.value });
            renderList();
        }));
    }
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
        if (descendantKeys.length) {
            group.appendChild(nestBtn(`Aplicar ${platform.toUpperCase()} a lo anidado`, () => {
                const value = platform === 'web' ? state.webEnabled : state.appEnabled;
                descendantKeys.forEach((k) => {
                    const s = getState(k);
                    setState(k, platform === 'web' ? { ...s, webEnabled: value, appEnabled: value ? s.appEnabled : false } : { ...s, appEnabled: value });
                });
                renderList();
            }));
        }
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

    return controls;
}

function renderList() {
    listEl.innerHTML = '';

    // General -- read-only rollup over every leaf in the whole catalog.
    const allLeafKeys = collectLeafKeys({ screens: CATALOG.flatMap((g) => g.screens) });
    const generalRow = document.createElement('div');
    generalRow.className = 'perm-tree-row perm-tree-depth-0 saas-master-status-row-general';
    generalRow.appendChild(toggleBtn('__general__', !collapsed.has('__general__')));
    generalRow.appendChild(rollupEl(computeRollup(allLeafKeys, 'web'), computeRollup(allLeafKeys, 'app')));
    generalRow.appendChild(labelEl(Dashboard.t('admin.saasMasterTreeGeneral')));
    generalRow.appendChild(countBadge(allLeafKeys.length));
    listEl.appendChild(generalRow);
    if (collapsed.has('__general__')) { return; }

    orderedGroups().forEach((group) => {
        const groupLeafKeys = collectLeafKeys({ screens: group.screens });
        const groupRow = document.createElement('div');
        groupRow.className = 'perm-tree-row perm-tree-depth-0';
        makeDraggable(groupRow, {
            list: 'groups', id: group.groupId,
            onReorder: (fromId, toId) => {
                const next = order.groups.filter((id) => id !== fromId);
                next.splice(next.indexOf(toId), 0, fromId);
                order.groups = next;
            },
        });
        groupRow.appendChild(dragHandle());
        groupRow.appendChild(toggleBtn(`g:${group.groupId}`, !collapsed.has(`g:${group.groupId}`)));
        groupRow.appendChild(rollupEl(computeRollup(groupLeafKeys, 'web'), computeRollup(groupLeafKeys, 'app')));
        groupRow.appendChild(labelEl(Dashboard.t(group.labelKey)));
        groupRow.appendChild(countBadge(groupLeafKeys.length));
        listEl.appendChild(groupRow);
        if (collapsed.has(`g:${group.groupId}`)) return;

        orderedScreens(group).forEach((screen) => {
            const screenLeafKeys = collectLeafKeys({ screens: [screen] });
            const screenRow = document.createElement('div');
            screenRow.className = 'perm-tree-row perm-tree-depth-1';
            makeDraggable(screenRow, {
                list: `screens:${group.groupId}`, id: screen.itemId,
                onReorder: (fromId, toId) => {
                    const ids = order.screensByGroup[group.groupId];
                    const next = ids.filter((id) => id !== fromId);
                    next.splice(next.indexOf(toId), 0, fromId);
                    order.screensByGroup[group.groupId] = next;
                },
            });
            screenRow.appendChild(dragHandle());
            screenRow.appendChild(toggleBtn(`s:${screen.itemId}`, !collapsed.has(`s:${screen.itemId}`)));
            screenRow.appendChild(rollupEl(computeRollup(screenLeafKeys, 'web'), computeRollup(screenLeafKeys, 'app')));
            screenRow.appendChild(labelEl(Dashboard.t(screen.labelKey)));
            screenRow.appendChild(countBadge(screenLeafKeys.length));
            screenRow.appendChild(buildControls(screen.itemId, screenLeafKeys, screen.href));
            listEl.appendChild(screenRow);
            if (collapsed.has(`s:${screen.itemId}`)) return;

            screen.apartados.forEach((apartado) => {
                const aKey = apartadoKey(screen, apartado);
                const leafCount = (apartado.columnas ? apartado.columnas.length : 0) + (apartado.controlInterno ? 1 : 0) + (apartado.acciones ? apartado.acciones.length : 0);
                const apRow = document.createElement('div');
                apRow.className = 'perm-tree-row perm-tree-depth-2 perm-tree-row-static';
                apRow.appendChild(toggleBtn(`a:${aKey}`, !collapsed.has(`a:${aKey}`)));
                apRow.appendChild(labelEl(apartado.label));
                apRow.appendChild(countBadge(leafCount));
                listEl.appendChild(apRow);
                if (collapsed.has(`a:${aKey}`)) return;

                (apartado.columnas || []).forEach((colLabel, idx) => {
                    const key = columnKey(screen, apartado, idx);
                    const row = document.createElement('div');
                    row.className = 'perm-tree-row perm-tree-depth-3';
                    row.appendChild(spacer());
                    row.appendChild(labelEl(colLabel));
                    row.appendChild(countBadge(1));
                    row.appendChild(buildControls(key, [], null));
                    listEl.appendChild(row);
                });

                if (apartado.controlInterno) {
                    const key = ciKey(screen, apartado);
                    const row = document.createElement('div');
                    row.className = 'perm-tree-row perm-tree-depth-3 perm-tree-row-classification';
                    row.appendChild(spacer());
                    row.appendChild(labelEl(CI_LABEL));
                    row.appendChild(countBadge(13));
                    row.appendChild(buildControls(key, [], null));
                    listEl.appendChild(row);
                }

                (apartado.acciones || []).forEach((actLabel, idx) => {
                    const key = actionKey(screen, apartado, idx);
                    const row = document.createElement('div');
                    row.className = 'perm-tree-row perm-tree-depth-3';
                    row.appendChild(spacer());
                    row.appendChild(labelEl(actLabel));
                    row.appendChild(countBadge(1));
                    row.appendChild(buildControls(key, [], null));
                    listEl.appendChild(row);
                });
            });
        });
    });
}

async function load() {
    try {
        const [statusRes, orderRes] = await Promise.all([
            fetch('/api/admin/saas-master-status', { credentials: 'include' }),
            fetch('/api/admin/saas-master-order', { credentials: 'include' }),
        ]);
        if (!statusRes.ok || !orderRes.ok) throw new Error('load failed');
        const statusData = await statusRes.json();
        const orderData = await orderRes.json();
        statuses = statusData.statuses || [];
        // order payload shape: { groups, screensByGroup } -- same JSON blob
        // saas_master_order already stores as ordered_items (one JSON array
        // column), just carrying a richer shape than the old flat array.
        const saved = orderData.order;
        if (saved && typeof saved === 'object' && !Array.isArray(saved) && saved.groups) {
            order = saved;
        }
        renderList();
    } catch {
        errorEl.textContent = Dashboard.t('admin.loadError');
        errorEl.hidden = false;
    }
}

saveBtn.addEventListener('click', async () => {
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
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        errorEl.textContent = Dashboard.t('admin.saveError');
        errorEl.hidden = false;
    } finally {
        saveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', renderList);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-saas-master-status' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await load();
    } catch (err) {
        console.error('Admin (Árbol Maestro SaaS) failed to initialize:', err);
    }
})();
