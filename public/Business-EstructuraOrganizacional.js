// ---------------------------------------------------------------------------
// "Nuestra Estructura Organizacional" — the org chart's "bosquejo" lives
// entirely on job_positions.reports_to_job_position_id (see db.js): this
// screen just lets an admin point each Puesto at the one it reports to,
// and shows the resulting chart. Whoever is CURRENTLY hired into a Puesto
// (Mi Recurso Humano) is attached read-only from the same
// GET /api/business/org-chart payload — the chart fills itself in from
// Operación without a separate assignment step here.
//
// Two extra concepts, both confirmed with the user before building:
// - Jefes Alternos: a Puesto can have extra Puestos with direct authority
//   over it (job_position_alt_supervisors), without changing who it
//   reports to -- shown as a small tag under its node, never a second
//   branch (so the tree stays a simple single-parent tree to draw).
// - Centros de Costo Habilitados: since a Puesto can be enabled for one,
//   several, or every Centro de Costo, the chart below the table is split
//   into a Global View (which Centro de Costo controls which, built from
//   scope-crossing Reporta A edges) and a Detailed View (one section per
//   Centro de Costo, only its own enabled Puestos, with any boss who lives
//   in a different Centro de Costo pulled in and tagged).
//
// Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

let positions = [];
let costCenters = [];

// Same parsing as Business-PuestosTrabajo.js's own cost_center_scope column
// -- 'all' or a specific array of ids, duplicated here rather than shared
// since neither screen has a common module to put it in.
function parseCostCenterScope(raw) {
    if (!raw || raw === 'all') return 'all';
    try {
        const ids = JSON.parse(raw);
        return Array.isArray(ids) ? ids.map(Number) : 'all';
    } catch {
        return 'all';
    }
}

function describeScope(raw) {
    const scope = parseCostCenterScope(raw);
    if (scope === 'all') return Dashboard.t('business.orgChartAllCostCenters');
    const codes = scope.map((id) => costCenters.find((c) => c.id === id)?.code).filter(Boolean);
    return codes.join(' + ') || Dashboard.t('business.orgChartMultiCc');
}

async function loadCostCenters() {
    try {
        const res = await fetch('/api/business/cost-centers', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        costCenters = data.costCenters || [];
    } catch {
        costCenters = [];
    }
}

async function loadOrgChart() {
    try {
        const res = await fetch('/api/business/org-chart', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        positions = data.positions || [];
    } catch {
        positions = [];
    }
    renderTable();
    renderGlobalMap();
    renderDetailView();
}

function occupantsLabel(position) {
    if (!position.workers.length) return '—';
    return position.workers.map((w) => w.fullName).join(', ');
}

function altSupervisorNames(position) {
    return (position.altSupervisorJobPositionIds || [])
        .map((id) => positions.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => p.name);
}

function renderTable() {
    const tbody = document.getElementById('org-chart-table-body');
    const empty = document.getElementById('org-chart-empty');
    tbody.innerHTML = '';
    empty.hidden = positions.length > 0;

    positions.forEach((position) => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.dataset.col = 'ocPosition';
        tdName.textContent = position.name;

        const tdReportsTo = document.createElement('td');
        tdReportsTo.dataset.col = 'ocReportsTo';
        const select = document.createElement('select');
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = Dashboard.t('business.orgChartNoSupervisor');
        select.appendChild(noneOpt);
        positions
            .filter((p) => p.id !== position.id)
            .forEach((p) => {
                const opt = document.createElement('option');
                opt.value = String(p.id);
                opt.textContent = p.name;
                select.appendChild(opt);
            });
        select.value = position.reportsToJobPositionId ? String(position.reportsToJobPositionId) : '';
        select.addEventListener('change', () => setReportsTo(position.id, select.value ? Number(select.value) : null));
        tdReportsTo.appendChild(select);

        const tdAlt = document.createElement('td');
        tdAlt.dataset.col = 'ocAltSupervisors';
        const altNames = altSupervisorNames(position);
        tdAlt.textContent = altNames.length ? altNames.join(', ') : '—';
        tdAlt.classList.add('editable-cell');
        tdAlt.title = Dashboard.t('main.fuelClickToEdit');
        tdAlt.onclick = () => openAltSupervisorsModal(position);

        const tdOccupied = document.createElement('td');
        tdOccupied.dataset.col = 'ocOccupiedBy';
        tdOccupied.textContent = occupantsLabel(position);

        tr.append(tdName, tdReportsTo, tdAlt, tdOccupied);
        tbody.appendChild(tr);
    });
}

async function setReportsTo(id, reportsToJobPositionId) {
    try {
        const res = await fetch(`/api/business/job-positions/${id}/reports-to`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ reportsToJobPositionId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'error');
            await loadOrgChart();
            return;
        }
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
        await loadOrgChart();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await loadOrgChart();
    }
}

// --- Jefes Alternos -- click-to-edit modal from the table column, same
// "checklist modal" shape as Puestos de Trabajo's own Centros de Costo
// Habilitados column, but built with real row styling from the start
// (see .job-position-checklist in Admin.css) rather than reusing
// .hr-department-checklist, which has no styling anywhere in the codebase.
const altModal = document.getElementById('alt-supervisors-modal');
const altModalList = document.getElementById('alt-supervisors-modal-list');
const altModalError = document.getElementById('alt-supervisors-modal-error');
const altModalSaveBtn = document.getElementById('alt-supervisors-modal-save');
const altModalCancelBtn = document.getElementById('alt-supervisors-modal-cancel');
let editingAltPositionId = null;

function buildAltSupervisorsChecklist(container, position) {
    container.innerHTML = '';
    const selectedIds = new Set(position.altSupervisorJobPositionIds || []);
    positions
        .filter((p) => p.id !== position.id)
        .forEach((p) => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = p.id;
            input.checked = selectedIds.has(p.id);
            const span = document.createElement('span');
            span.textContent = p.name;
            label.append(input, span);
            container.appendChild(label);
        });
}
function readAltSupervisorIds(container) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((input) => Number(input.value));
}
function openAltSupervisorsModal(position) {
    editingAltPositionId = position.id;
    buildAltSupervisorsChecklist(altModalList, position);
    altModalError.hidden = true;
    altModal.hidden = false;
}
function closeAltSupervisorsModal() {
    altModal.hidden = true;
    editingAltPositionId = null;
}
async function saveAltSupervisorsModal() {
    const altSupervisorIds = readAltSupervisorIds(altModalList);
    altModalSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/business/job-positions/${editingAltPositionId}/alt-supervisors`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ altSupervisorIds }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            altModalError.textContent = body.message || Dashboard.t('admin.saveError');
            altModalError.hidden = false;
            return;
        }
        closeAltSupervisorsModal();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
        await loadOrgChart();
    } catch {
        altModalError.textContent = Dashboard.t('admin.saveError');
        altModalError.hidden = false;
    } finally {
        altModalSaveBtn.disabled = false;
    }
}
altModalSaveBtn.addEventListener('click', saveAltSupervisorsModal);
altModalCancelBtn.addEventListener('click', closeAltSupervisorsModal);
altModal.addEventListener('click', (event) => { if (event.target === altModal) closeAltSupervisorsModal(); });
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !altModal.hidden) closeAltSupervisorsModal();
});

// --- Shared node builder for both the Global Map and the Detailed View --
// position.name / occupantsLabel / altSupervisorNames are all free text
// (typed by whoever created the Puesto or hired the worker), so every piece
// is set via textContent, never interpolated into innerHTML.
function buildOrgNode(position, { crossLabel } = {}) {
    const box = document.createElement('div');
    box.className = crossLabel ? 'org-node org-node-cross' : 'org-node';

    const titleEl = document.createElement('span');
    titleEl.className = 'org-node-title';
    titleEl.textContent = position.name;
    box.appendChild(titleEl);

    if (position.workers.length) {
        const personEl = document.createElement('span');
        personEl.className = 'org-node-person';
        personEl.textContent = occupantsLabel(position);
        box.appendChild(personEl);
    } else {
        const emptyEl = document.createElement('span');
        emptyEl.className = 'org-node-empty';
        emptyEl.textContent = Dashboard.t('business.orgChartVacant');
        box.appendChild(emptyEl);
    }

    if (crossLabel) {
        const tagEl = document.createElement('span');
        tagEl.className = 'org-node-cross-tag';
        tagEl.textContent = crossLabel;
        box.appendChild(tagEl);
    }

    const altNames = altSupervisorNames(position);
    if (altNames.length) {
        const altEl = document.createElement('span');
        altEl.className = 'org-node-alt';
        altEl.textContent = `${Dashboard.t('business.orgChartAltLabel')}: ${altNames.join(', ')}`;
        box.appendChild(altEl);
    }
    return box;
}

// ---------------------------------------------------------------------------
// Global View -- one node per distinct Centro de Costo scope actually in
// use (a single Centro de Costo, a specific multi-Centro combination like a
// Gerente Regional's, or 'all'), connected whenever a Puesto's direct boss
// has a DIFFERENT scope (that edge is the "controls" relationship). A scope
// nobody controls and that controls nobody itself is a fully independent
// Centro de Costo, drawn separately below the connected hierarchy. No
// manual configuration -- it's read straight off Reporta A + Centros de
// Costo Habilitados.
// ---------------------------------------------------------------------------
function scopeKeyOf(position) {
    const scope = parseCostCenterScope(position.costCenterScope);
    return scope === 'all' ? 'all' : JSON.stringify([...scope].sort((a, b) => a - b));
}

function buildCostCenterGraph() {
    const positionsByScope = new Map();
    positions.forEach((p) => {
        const key = scopeKeyOf(p);
        if (!positionsByScope.has(key)) positionsByScope.set(key, []);
        positionsByScope.get(key).push(p);
    });

    // First scope-crossing edge found per child key wins -- a Puesto only
    // has one direct boss, so this is exact, not a heuristic; a child key
    // could in theory get here from more than one Puesto sharing it, but
    // they always share the same boss's scope by construction (same
    // Centros de Costo Habilitados), so this is stable either way.
    const controllerOf = new Map();
    positions.forEach((p) => {
        if (!p.reportsToJobPositionId) return;
        const boss = positions.find((b) => b.id === p.reportsToJobPositionId);
        if (!boss) return;
        const childKey = scopeKeyOf(p);
        const parentKey = scopeKeyOf(boss);
        if (childKey !== parentKey && !controllerOf.has(childKey)) controllerOf.set(childKey, parentKey);
    });

    function nodeLabel(key) {
        const holders = positionsByScope.get(key) || [];
        if (key === 'all') {
            return { title: Dashboard.t('business.orgChartAllCostCenters'), meta: holders.map((p) => p.name).join(' · ') };
        }
        const ids = JSON.parse(key);
        if (ids.length === 1) {
            const cc = costCenters.find((c) => c.id === ids[0]);
            return {
                title: cc ? `${cc.code} - ${cc.name}` : `#${ids[0]}`,
                meta: Dashboard.t('business.orgChartPositionCount', { count: holders.length }),
            };
        }
        const codes = ids.map((id) => costCenters.find((c) => c.id === id)?.code).filter(Boolean);
        return {
            title: holders.map((p) => p.name).join(' / ') || Dashboard.t('business.orgChartMultiCc'),
            meta: `${Dashboard.t('business.orgChartCovers')}: ${codes.join(' + ')}`,
        };
    }

    const allKeys = Array.from(positionsByScope.keys());
    const controlledKeys = new Set(controllerOf.values());
    const childrenOf = (key) => allKeys.filter((k) => controllerOf.get(k) === key);
    const roots = allKeys.filter((k) => !controllerOf.has(k));

    return {
        nodeLabel,
        childrenOf,
        connectedRoots: roots.filter((k) => childrenOf(k).length > 0),
        independentRoots: roots.filter((k) => childrenOf(k).length === 0),
    };
}

function buildGlobalNode(key, graph, ancestry) {
    const { title, meta } = graph.nodeLabel(key);
    const wrap = document.createElement('div');
    wrap.className = 'org-tree-node';
    const box = document.createElement('div');
    box.className = 'org-global-node';
    const titleEl = document.createElement('span');
    titleEl.className = 'org-global-node-title';
    titleEl.textContent = title;
    box.appendChild(titleEl);
    if (meta) {
        const metaEl = document.createElement('span');
        metaEl.className = 'org-global-node-meta';
        metaEl.textContent = meta;
        box.appendChild(metaEl);
    }
    wrap.appendChild(box);

    const children = graph.childrenOf(key).filter((childKey) => !ancestry.has(childKey));
    if (children.length) {
        const branch = document.createElement('div');
        branch.className = 'org-tree-branch';
        wrap.appendChild(branch);
        const childrenWrap = document.createElement('div');
        childrenWrap.className = 'org-tree-children';
        children.forEach((childKey) => childrenWrap.appendChild(buildGlobalNode(childKey, graph, new Set([...ancestry, key]))));
        wrap.appendChild(childrenWrap);
    }
    return wrap;
}

function renderGlobalMap() {
    const container = document.getElementById('org-chart-global-map');
    container.innerHTML = '';
    if (!positions.length) return;
    const graph = buildCostCenterGraph();
    graph.connectedRoots.forEach((key) => container.appendChild(buildGlobalNode(key, graph, new Set())));
    if (graph.independentRoots.length) {
        const independentWrap = document.createElement('div');
        independentWrap.className = 'org-global-independent-row';
        graph.independentRoots.forEach((key) => independentWrap.appendChild(buildGlobalNode(key, graph, new Set())));
        container.appendChild(independentWrap);
    }
}

// ---------------------------------------------------------------------------
// Detailed View -- one section per Centro de Costo, tree built only from
// Puestos enabled there. A local root whose real boss lives in a different
// Centro de Costo gets that boss (and further ancestors, however many
// Centros de Costo the chain crosses) prepended above it, tagged with
// describeScope() -- Corporativo commanding the units is the normal case
// here, not an error, per the user.
// ---------------------------------------------------------------------------
function isLocalToCc(position, cc) {
    const scope = parseCostCenterScope(position.costCenterScope);
    return scope === 'all' || scope.includes(cc.id);
}

// Nearest-first list of ancestors above `position`, regardless of their own
// Centro de Costo -- reports_to is already guaranteed cycle-free (see the
// PUT .../reports-to route), so this always terminates.
function ancestorChainOf(position) {
    const chain = [];
    const seen = new Set([position.id]);
    let currentId = position.reportsToJobPositionId;
    while (currentId && !seen.has(currentId)) {
        const boss = positions.find((p) => p.id === currentId);
        if (!boss) break;
        chain.push(boss);
        seen.add(boss.id);
        currentId = boss.reportsToJobPositionId;
    }
    return chain;
}

function buildLocalSubtree(position, localIds, ancestry) {
    const wrap = document.createElement('div');
    wrap.className = 'org-tree-node';
    wrap.appendChild(buildOrgNode(position));
    const children = positions.filter((p) => p.reportsToJobPositionId === position.id && localIds.has(p.id) && !ancestry.has(p.id));
    if (children.length) {
        const branch = document.createElement('div');
        branch.className = 'org-tree-branch';
        wrap.appendChild(branch);
        const childrenWrap = document.createElement('div');
        childrenWrap.className = 'org-tree-children';
        children.forEach((child) => childrenWrap.appendChild(buildLocalSubtree(child, localIds, new Set([...ancestry, position.id]))));
        wrap.appendChild(childrenWrap);
    }
    return wrap;
}

// One local root's full branch: furthest cross-ancestor at the top, down
// through however many Centros de Costo it crosses, ending in that root's
// own local subtree.
function buildRootBranch(root, localIds) {
    const crossChain = ancestorChainOf(root).filter((ancestor) => !localIds.has(ancestor.id));
    const localSubtree = buildLocalSubtree(root, localIds, new Set());
    if (!crossChain.length) return localSubtree;

    let topWrap = null;
    let parentWrap = null;
    [...crossChain].reverse().forEach((ancestor) => {
        const nodeWrap = document.createElement('div');
        nodeWrap.className = 'org-tree-node';
        nodeWrap.appendChild(buildOrgNode(ancestor, { crossLabel: describeScope(ancestor.costCenterScope) }));
        if (parentWrap) {
            const branch = document.createElement('div');
            branch.className = 'org-tree-branch';
            parentWrap.appendChild(branch);
            const childrenWrap = document.createElement('div');
            childrenWrap.className = 'org-tree-children';
            childrenWrap.appendChild(nodeWrap);
            parentWrap.appendChild(childrenWrap);
        } else {
            topWrap = nodeWrap;
        }
        parentWrap = nodeWrap;
    });
    const branch = document.createElement('div');
    branch.className = 'org-tree-branch';
    parentWrap.appendChild(branch);
    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'org-tree-children';
    childrenWrap.appendChild(localSubtree);
    parentWrap.appendChild(childrenWrap);
    return topWrap;
}

function buildCcSection(cc) {
    const localPositions = positions.filter((p) => isLocalToCc(p, cc));
    if (!localPositions.length) return null;
    const localIds = new Set(localPositions.map((p) => p.id));
    const localRoots = localPositions.filter((p) => !p.reportsToJobPositionId || !localIds.has(p.reportsToJobPositionId));

    const section = document.createElement('div');
    section.className = 'org-cc-section';

    const head = document.createElement('div');
    head.className = 'org-cc-section-head';
    const icon = document.createElement('span');
    icon.className = 'org-cc-section-icon';
    icon.textContent = (cc.code || '?').slice(0, 2).toUpperCase();
    const title = document.createElement('span');
    title.className = 'org-cc-section-title';
    title.textContent = `${cc.code} - ${cc.name}`;
    const count = document.createElement('span');
    count.className = 'org-cc-section-count';
    count.textContent = Dashboard.t('business.orgChartPositionCount', { count: localPositions.length });
    head.append(icon, title, count);
    section.appendChild(head);

    const treeWrap = document.createElement('div');
    treeWrap.className = 'org-chart-tree';
    localRoots.forEach((root) => treeWrap.appendChild(buildRootBranch(root, localIds)));
    section.appendChild(treeWrap);
    return section;
}

function renderDetailView() {
    const container = document.getElementById('org-chart-detail');
    container.innerHTML = '';
    costCenters.forEach((cc) => {
        const section = buildCcSection(cc);
        if (section) container.appendChild(section);
    });
}

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-catalogos-estructura-organizacional' });
        if (!role) return;
        await loadCostCenters();
        await loadOrgChart();
    } catch (err) {
        console.error('Business (Estructura Organizacional) failed to initialize:', err);
    }
})();
