// ---------------------------------------------------------------------------
// "Árbol Maestro SaaS" -- GEIPSA-wide readiness status (Habilitado/
// Inhabilitado/Construcción/Mejoras + Web/App) for the SaaS team's OWN
// internal screens, at FULL DEPTH (Grupo -> Pantalla -> Apartado/Tabla/
// Modal -> Columna/Acción) -- same structure and visual language as Árbol
// de Permisos Maestro (PermissionTree.js statusMode), driven by
// SaasAdminCatalog.js instead of data/menu.json. Reuses the same DB tables
// (saas_master_status/saas_master_order) this screen already had as a flat
// 3-row list -- now keyed by many more leaf ids, never touches
// master_permission_status/master_permission_order.
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
// count badge, drag-reorder, Navegar, dashed nest guides) matches the
// client tree, down to Columna/Acción level -- confirmed with the user this
// needed to go deeper than Árbol de Permisos Maestro's own reorder scope.
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

function apartadoKey(screen, apartado) {
    return `${screen.itemId}::${apartado.id}`;
}
// Every column/acción/Control-Interno leaf gets a small stable suffix
// ('c0','c1',...,'ci','a0',...) instead of a hand-typed unique string --
// this suffix is what's actually stored in saas_master_status, so it must
// never change once real statuses exist in production even if the leaf's
// DISPLAY position later moves via drag-reorder (see leavesByApartado --
// reordering only changes a separate order list, never these keys).
function buildLeaves(apartado) {
    const leaves = [];
    (apartado.columnas || []).forEach((label, idx) => leaves.push({ suffix: `c${idx}`, label, kind: 'col' }));
    if (apartado.controlInterno) leaves.push({ suffix: 'ci', label: CI_LABEL, kind: 'ci' });
    (apartado.acciones || []).forEach((label, idx) => leaves.push({ suffix: `a${idx}`, label, kind: 'action' }));
    return leaves;
}
function leafKey(screen, apartado, leaf) {
    return `${apartadoKey(screen, apartado)}::${leaf.suffix}`;
}

function collectLeafKeysForScreens(screens) {
    const keys = [];
    for (const screen of screens) {
        for (const apartado of screen.apartados) {
            buildLeaves(apartado).forEach((leaf) => keys.push(leafKey(screen, apartado, leaf)));
        }
    }
    return keys;
}
function collectLeafKeysForApartado(screen, apartado) {
    return buildLeaves(apartado).map((leaf) => leafKey(screen, apartado, leaf));
}

const listEl = document.getElementById('saas-master-status-list');
const saveBtn = document.getElementById('saas-master-status-save');
const errorEl = document.getElementById('saas-master-status-error');

let statuses = [];
// order: { groups, screensByGroup: {groupId:[itemId]}, apartadosByScreen:
// {itemId:[apartadoId]}, leavesByApartado: {"screenId::apartadoId":[suffix]} }
let order = { groups: CATALOG.map((g) => g.groupId), screensByGroup: {}, apartadosByScreen: {}, leavesByApartado: {} };
CATALOG.forEach((g) => { order.screensByGroup[g.groupId] = g.screens.map((s) => s.itemId); });
let draggedId = null;
// Only apartado/screen/group collapse state lives here -- "General" is a
// permanent, non-collapsible summary card (see renderList), same
// relationship it always had to the real rows in this screen's original
// 3-row version, just now sitting above 2 groups instead of 3 screens.
const collapsed = new Set();

function getState(key) {
    return statuses.find((s) => s.itemId === key) || { itemId: key, status: 'habilitado', webEnabled: true, appEnabled: false };
}
function setState(key, next) {
    statuses = statuses.filter((s) => s.itemId !== key);
    statuses.push({ itemId: key, ...next });
}

function computeRollup(keys, platform) {
    if (!keys.length) return 'empty';
    const onCount = keys.filter((k) => (platform === 'web' ? getState(k).webEnabled : getState(k).appEnabled)).length;
    if (onCount === 0) return 'empty';
    if (onCount === keys.length) return 'full';
    return 'partial';
}

function reorderList(list, fromId, toId) {
    const next = list.filter((id) => id !== fromId);
    next.splice(next.indexOf(toId), 0, fromId);
    return next;
}
function orderedGroups() {
    return order.groups.map((id) => CATALOG.find((g) => g.groupId === id)).filter(Boolean);
}
function orderedScreens(group) {
    const saved = (order.screensByGroup[group.groupId] || []).filter((id) => group.screens.some((s) => s.itemId === id));
    const rest = group.screens.map((s) => s.itemId).filter((id) => !saved.includes(id));
    return [...saved, ...rest].map((id) => group.screens.find((s) => s.itemId === id));
}
function orderedApartados(screen) {
    const allIds = screen.apartados.map((a) => a.id);
    const saved = (order.apartadosByScreen[screen.itemId] || []).filter((id) => allIds.includes(id));
    const rest = allIds.filter((id) => !saved.includes(id));
    return [...saved, ...rest].map((id) => screen.apartados.find((a) => a.id === id));
}
function orderedLeaves(screen, apartado) {
    const all = buildLeaves(apartado);
    const aKey = apartadoKey(screen, apartado);
    const allSuffixes = all.map((l) => l.suffix);
    const saved = (order.leavesByApartado[aKey] || []).filter((s) => allSuffixes.includes(s));
    const rest = allSuffixes.filter((s) => !saved.includes(s));
    const bySuffix = new Map(all.map((l) => [l.suffix, l]));
    return [...saved, ...rest].map((s) => bySuffix.get(s));
}

function makeDraggable(el, { list, id, onReorder }) {
    el.classList.add('perm-tree-row-draggable');
    el.draggable = true;
    el.addEventListener('dragstart', (e) => { draggedId = { list, id }; el.classList.add('perm-tree-row-dragging'); e.stopPropagation(); });
    el.addEventListener('dragend', (e) => { draggedId = null; el.classList.remove('perm-tree-row-dragging'); e.stopPropagation(); });
    el.addEventListener('dragover', (e) => {
        if (!draggedId || draggedId.list !== list || draggedId.id === id) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('perm-tree-row-drop-target');
    });
    el.addEventListener('dragleave', (e) => { el.classList.remove('perm-tree-row-drop-target'); e.stopPropagation(); });
    el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
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
// used by every real row (Grupo/Pantalla/Apartado/Columna/Acción) that
// carries its own key, same as every row in Árbol de Permisos Maestro does
// once it has one (see statusRow there) -- only "General" has no key/
// controls of its own, it's a pure summary.
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
            descendantKeys.forEach((k) => setState(k, { ...getState(k), status: select.value }));
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

// Dashed vertical guides connecting an expanded row to the full block of
// descendants directly under it -- same purely-decorative, computed-from-
// real-positions idea as drawNestGuides in PermissionTree.js. Derived from
// the depth classes already on each row rather than a separate parent-
// child map: since rendering is depth-first, an expanded row's own
// descendant block is exactly the run of immediately-following rows whose
// depth is greater than its own, stopping at the first row that isn't.
function drawGuides() {
    listEl.querySelectorAll('.perm-tree-nest-guide').forEach((el) => el.remove());
    const rows = Array.from(listEl.children).filter((el) => el.classList.contains('perm-tree-row'));
    const containerRect = listEl.getBoundingClientRect();
    const depthOf = (el) => {
        const m = el.className.match(/perm-tree-depth-(\d+)/);
        return m ? Number(m[1]) : -1;
    };
    rows.forEach((row, i) => {
        const toggle = row.querySelector(':scope > .perm-tree-toggle[aria-expanded="true"]');
        if (!toggle) return;
        const depth = depthOf(row);
        let last = null;
        for (let j = i + 1; j < rows.length; j++) {
            if (depthOf(rows[j]) <= depth) break;
            last = rows[j];
        }
        if (!last) return;
        // Anchored to THIS row's own drag handle when it has one, not the
        // toggle -- confirmed live on the real Árbol de Permisos Maestro
        // (PermissionTree.js's own drawNestGuides) that centering on the
        // toggle instead puts the guide right on top of the NEXT level's
        // own drag handle (grip+toggle together are roughly one whole
        // indent step wide). Falls back to the toggle only when this row
        // has no grip of its own (none of ours do currently, but matching
        // the real fallback costs nothing and keeps this correct if that
        // ever changes).
        const anchor = row.querySelector(':scope > .perm-tree-drag-handle') || toggle;
        const anchorRect = anchor.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const guide = document.createElement('div');
        guide.className = 'perm-tree-nest-guide';
        guide.style.left = `${anchorRect.left - containerRect.left - 4 + listEl.scrollLeft}px`;
        guide.style.top = `${rowRect.bottom - containerRect.top + listEl.scrollTop}px`;
        guide.style.height = `${Math.max(0, last.getBoundingClientRect().bottom - rowRect.bottom)}px`;
        listEl.appendChild(guide);
    });
}

function buildHeader() {
    const header = document.createElement('div');
    header.className = 'perm-tree-mstatus-header';
    const spacerEl = document.createElement('span');
    spacerEl.className = 'perm-tree-mstatus-header-spacer';
    header.appendChild(spacerEl);
    const labelHeader = document.createElement('span');
    labelHeader.className = 'perm-tree-mstatus-header-label';
    labelHeader.textContent = 'Pantalla / Apartado / Columna';
    header.appendChild(labelHeader);
    const controls = document.createElement('div');
    controls.className = 'perm-tree-mstatus-header-controls';
    const statusCol = document.createElement('span');
    statusCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-status';
    statusCol.textContent = 'Estatus';
    controls.appendChild(statusCol);
    const nestCol = document.createElement('span');
    nestCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-status-nest';
    controls.appendChild(nestCol);
    const platformsCol = document.createElement('span');
    platformsCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-platforms';
    platformsCol.textContent = 'Web · App';
    controls.appendChild(platformsCol);
    const navCol = document.createElement('span');
    navCol.className = 'perm-tree-mstatus-header-col perm-tree-mstatus-header-navigate';
    navCol.innerHTML = '<i class="bx bx-link-external" aria-hidden="true"></i>';
    controls.appendChild(navCol);
    header.appendChild(controls);
    return header;
}

function renderList() {
    listEl.innerHTML = '';
    listEl.appendChild(buildHeader());

    // "General" -- never a real parent row: Servicio a Cliente/Configuración
    // SaaS always render as their own top-level rows right below it
    // regardless of anything here (confirmed with the user after an earlier
    // version of this collapsed the whole tree away when this had a
    // toggle). It IS a real row with its own stored Estatus/Web-App and a
    // cascade over literally every leaf, though -- confirmed against the
    // real Árbol de Permisos Maestro's own General row, which has both
    // (visible there as a genuine, non-rollup "Inhabilitado" that its own
    // children didn't share) -- a real kill-switch over the whole tree, not
    // just a read-only summary.
    const allLeafKeys = collectLeafKeysForScreens(CATALOG.flatMap((g) => g.screens));
    const generalRow = document.createElement('div');
    generalRow.className = 'perm-tree-row perm-tree-depth-0 saas-master-status-row-general';
    generalRow.appendChild(spacer());
    generalRow.appendChild(rollupEl(computeRollup(allLeafKeys, 'web'), computeRollup(allLeafKeys, 'app')));
    generalRow.appendChild(labelEl(Dashboard.t('admin.saasMasterTreeGeneral')));
    generalRow.appendChild(countBadge(allLeafKeys.length));
    generalRow.appendChild(buildControls('__general__', allLeafKeys, null));
    listEl.appendChild(generalRow);

    orderedGroups().forEach((group) => {
        const groupLeafKeys = collectLeafKeysForScreens(group.screens);
        const groupRow = document.createElement('div');
        groupRow.className = 'perm-tree-row perm-tree-depth-0';
        makeDraggable(groupRow, {
            list: 'groups', id: group.groupId,
            onReorder: (fromId, toId) => { order.groups = reorderList(order.groups, fromId, toId); },
        });
        groupRow.appendChild(dragHandle());
        groupRow.appendChild(toggleBtn(`g:${group.groupId}`, !collapsed.has(`g:${group.groupId}`)));
        groupRow.appendChild(rollupEl(computeRollup(groupLeafKeys, 'web'), computeRollup(groupLeafKeys, 'app')));
        groupRow.appendChild(labelEl(Dashboard.t(group.labelKey)));
        groupRow.appendChild(countBadge(groupLeafKeys.length));
        // Confirmed against a real Departamento row (Comité Directivo) in
        // Árbol de Permisos Maestro: every row gets its own Estatus/Web-App
        // controls, not just a read-only rollup -- this row looked "empty"
        // next to its own siblings without this.
        groupRow.appendChild(buildControls(group.groupId, groupLeafKeys, null));
        listEl.appendChild(groupRow);
        if (collapsed.has(`g:${group.groupId}`)) return;

        orderedScreens(group).forEach((screen) => {
            const screenLeafKeys = collectLeafKeysForScreens([screen]);
            const screenRow = document.createElement('div');
            screenRow.className = 'perm-tree-row perm-tree-depth-1';
            makeDraggable(screenRow, {
                list: `screens:${group.groupId}`, id: screen.itemId,
                onReorder: (fromId, toId) => { order.screensByGroup[group.groupId] = reorderList(order.screensByGroup[group.groupId] || group.screens.map((s) => s.itemId), fromId, toId); },
            });
            screenRow.appendChild(dragHandle());
            screenRow.appendChild(toggleBtn(`s:${screen.itemId}`, !collapsed.has(`s:${screen.itemId}`)));
            screenRow.appendChild(rollupEl(computeRollup(screenLeafKeys, 'web'), computeRollup(screenLeafKeys, 'app')));
            screenRow.appendChild(labelEl(Dashboard.t(screen.labelKey)));
            screenRow.appendChild(countBadge(screenLeafKeys.length));
            screenRow.appendChild(buildControls(screen.itemId, screenLeafKeys, screen.href));
            listEl.appendChild(screenRow);
            if (collapsed.has(`s:${screen.itemId}`)) return;

            orderedApartados(screen).forEach((apartado) => {
                const aKey = apartadoKey(screen, apartado);
                const apLeafKeys = collectLeafKeysForApartado(screen, apartado);
                const apRow = document.createElement('div');
                apRow.className = 'perm-tree-row perm-tree-depth-2';
                makeDraggable(apRow, {
                    list: `apartados:${screen.itemId}`, id: apartado.id,
                    onReorder: (fromId, toId) => { order.apartadosByScreen[screen.itemId] = reorderList(order.apartadosByScreen[screen.itemId] || screen.apartados.map((a) => a.id), fromId, toId); },
                });
                apRow.appendChild(dragHandle());
                apRow.appendChild(toggleBtn(`a:${aKey}`, !collapsed.has(`a:${aKey}`)));
                apRow.appendChild(rollupEl(computeRollup(apLeafKeys, 'web'), computeRollup(apLeafKeys, 'app')));
                apRow.appendChild(labelEl(apartado.label));
                apRow.appendChild(countBadge(apLeafKeys.length));
                apRow.appendChild(buildControls(aKey, apLeafKeys, null));
                listEl.appendChild(apRow);
                if (collapsed.has(`a:${aKey}`)) return;

                orderedLeaves(screen, apartado).forEach((leaf) => {
                    const key = leafKey(screen, apartado, leaf);
                    const row = document.createElement('div');
                    row.className = `perm-tree-row perm-tree-depth-3${leaf.kind === 'ci' ? ' perm-tree-row-classification' : ''}`;
                    makeDraggable(row, {
                        list: `leaves:${aKey}`, id: leaf.suffix,
                        onReorder: (fromId, toId) => { order.leavesByApartado[aKey] = reorderList(order.leavesByApartado[aKey] || buildLeaves(apartado).map((l) => l.suffix), fromId, toId); },
                    });
                    row.appendChild(dragHandle());
                    row.appendChild(spacer());
                    row.appendChild(rollupEl(computeRollup([key], 'web'), computeRollup([key], 'app')));
                    row.appendChild(labelEl(leaf.label));
                    row.appendChild(countBadge(1));
                    row.appendChild(buildControls(key, [], null));
                    listEl.appendChild(row);
                });
            });
        });
    });

    // setTimeout, not requestAnimationFrame -- rAF gets throttled/suspended
    // on a backgrounded tab, which silently left every guide missing during
    // live testing even though the exact same positioning logic worked fine
    // when run by hand from the console right after. A 0ms timeout still
    // waits for this paint to land (rows need real layout before
    // getBoundingClientRect means anything) without depending on the tab
    // actually being the visible/focused one.
    setTimeout(drawGuides, 0);
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
        const saved = orderData.order;
        if (saved && typeof saved === 'object' && !Array.isArray(saved) && saved.groups) {
            order = { groups: saved.groups || order.groups, screensByGroup: saved.screensByGroup || {}, apartadosByScreen: saved.apartadosByScreen || {}, leavesByApartado: saved.leavesByApartado || {} };
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
window.addEventListener('resize', () => setTimeout(drawGuides, 0));

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
