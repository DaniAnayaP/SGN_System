// ---------------------------------------------------------------------------
// "Nuestra Estructura Organizacional" — the org chart's "bosquejo" lives
// entirely on job_positions.reports_to_job_position_id (see db.js): this
// screen just lets an admin point each Puesto at the one it reports to,
// and shows the resulting chart. Whoever is CURRENTLY hired into a Puesto
// (Mi Recurso Humano) is attached read-only from the same
// GET /api/business/org-chart payload — the chart fills itself in from
// Operación without a separate assignment step here.
// Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

let positions = [];

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
    renderTree();
}

function occupantsLabel(position) {
    if (!position.workers.length) return '—';
    return position.workers.map((w) => w.fullName).join(', ');
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

        const tdOccupied = document.createElement('td');
        tdOccupied.dataset.col = 'ocOccupiedBy';
        tdOccupied.textContent = occupantsLabel(position);

        tr.append(tdName, tdReportsTo, tdOccupied);
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

// Recursive tree render: roots are positions with no reports-to (or one
// pointing at a Puesto that no longer exists), each node lists its own
// direct reports underneath it. No cycle guard needed here beyond simply
// not re-descending into an id already on the current path -- reports_to
// itself has no cycle prevention on write (see db.js), this just keeps a
// malformed cycle from infinite-looping the render.
function buildTreeNode(position, ancestry) {
    const node = document.createElement('div');
    node.className = 'org-tree-node';

    const box = document.createElement('div');
    box.className = 'org-node';
    box.innerHTML = `<span class="org-node-title">${position.name}</span>`;
    const occupants = position.workers.length
        ? `<span class="org-node-person">${occupantsLabel(position)}</span>`
        : `<span class="org-node-empty">${Dashboard.t('business.orgChartVacant')}</span>`;
    box.innerHTML += occupants;
    node.appendChild(box);

    const children = positions.filter((p) => p.reportsToJobPositionId === position.id && !ancestry.has(p.id));
    if (children.length) {
        const branch = document.createElement('div');
        branch.className = 'org-tree-branch';
        node.appendChild(branch);
        const childrenWrap = document.createElement('div');
        childrenWrap.className = 'org-tree-children';
        children.forEach((child) => childrenWrap.appendChild(buildTreeNode(child, new Set([...ancestry, position.id]))));
        node.appendChild(childrenWrap);
    }
    return node;
}

function renderTree() {
    const container = document.getElementById('org-chart-tree');
    container.innerHTML = '';
    const validIds = new Set(positions.map((p) => p.id));
    const roots = positions.filter((p) => !p.reportsToJobPositionId || !validIds.has(p.reportsToJobPositionId));
    if (!roots.length) return;
    roots.forEach((root) => container.appendChild(buildTreeNode(root, new Set())));
}

loadOrgChart();
