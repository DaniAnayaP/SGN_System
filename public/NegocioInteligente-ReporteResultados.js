// ---------------------------------------------------------------------------
// Read-only results viewer for one saved report (Transacciones Inteligentes
// de Negocio) — ?id= in the URL picks which one. Columns aren't known ahead
// of time (they're whatever this specific report was built with), so the
// <thead>/<tbody> are built entirely at runtime, then wired into the
// generic .data-table engine manually (see Dashboard.initDataTableColumns'
// own comment for why the automatic lazy-init can't be relied on here).
// ---------------------------------------------------------------------------

function reportIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id');
}

function formatCellValue(value) {
    if (value == null || value === '') return '—';
    return typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value);
}

function renderResults(report, rows) {
    // No on-screen <h1> here (the breadcrumb already carries this report's
    // name, matching it by href in the sidebar tree) -- document.title only
    // drives the browser tab, same convention as Registro de traslados.
    const title = `${Dashboard.companyName || ''} - ${report.name}`.replace(/^ - /, '');
    document.getElementById('report-page-title').textContent = title;

    const headRow = document.getElementById('report-results-head');
    headRow.innerHTML = '';
    report.columns.forEach((col, index) => {
        const th = document.createElement('th');
        th.dataset.col = `col${index}`;
        th.textContent = col.label;
        headRow.appendChild(th);
    });

    const tbody = document.getElementById('report-results-body');
    const emptyEl = document.getElementById('report-results-empty');
    tbody.innerHTML = '';
    emptyEl.hidden = rows.length > 0;
    rows.forEach((row) => {
        const tr = document.createElement('tr');
        row.forEach((value, index) => {
            const td = document.createElement('td');
            td.dataset.col = `col${index}`;
            td.textContent = formatCellValue(value);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    const wrapper = document.querySelector('[data-table-id="report-results"]');
    if (wrapper && report.columns.length) Dashboard.initDataTableColumns(wrapper, 0);
}

function showResultsMessage(text) {
    document.querySelector('[data-table-id="report-results"] table').hidden = true;
    const emptyEl = document.getElementById('report-results-empty');
    emptyEl.textContent = text;
    emptyEl.hidden = false;
}

async function loadResults() {
    const id = reportIdFromUrl();
    if (!id) {
        showResultsMessage(Dashboard.t('main.reportEmptyState'));
        return;
    }
    try {
        const res = await fetch(`/api/business/intelligent-reports/${id}/results`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { report, rows } = await res.json();
        renderResults(report, rows || []);
    } catch (err) {
        console.error('Transacciones Inteligentes: failed to load report results', err);
        showResultsMessage(Dashboard.t('admin.saveError'));
    }
}

(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'report-results' });
        await loadResults();
    } catch (err) {
        console.error('Reporte Resultados failed to initialize:', err);
    }
})();
