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

// Set once by renderResults() -- the download button needs the report's
// own title for the exported filename, same string already used for the
// browser tab.
let currentReportTitle = 'Reporte';

function csvEscape(value) {
    const str = String(value ?? '');
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function downloadCsv(columns, rows, title) {
    // BOM prefix -- without it Excel (still the most common opener for a
    // .csv on Windows) guesses the wrong encoding for accented characters.
    const lines = [columns.map((c) => csvEscape(c.label)).join(',')];
    rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
    downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${title}.csv`);
}

async function downloadViaServer(format, columns, rows, title) {
    const res = await fetch(`/api/business/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ columns, rows, title }),
    });
    if (!res.ok) throw new Error('export failed');
    downloadBlob(await res.blob(), `${title}.${format}`);
}

async function exportReport(format) {
    const { columns, rows } = Dashboard.getVisibleTableSnapshot('report-results');
    if (!columns.length) return;
    try {
        if (format === 'csv') downloadCsv(columns, rows, currentReportTitle);
        else await downloadViaServer(format, columns, rows, currentReportTitle);
    } catch (err) {
        console.error('Transacciones Inteligentes: export failed', err);
        Dashboard.showToast(Dashboard.t('main.downloadError'), 'error');
    }
}

// Adds the download button (with its CSV/Excel/PDF menu) into the SAME
// .data-table-zoom toolbar Dashboard.js already builds for pin/visibility/
// history/legend -- must run after that (see init() below), and only once,
// since this page never re-renders the toolbar itself.
function ensureDownloadButton() {
    const wrapper = document.querySelector('[data-table-id="report-results"]');
    const zoom = wrapper?.previousElementSibling;
    if (!zoom?.classList?.contains('data-table-zoom') || zoom.querySelector('[data-download-btn]')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.downloadBtn = '1';
    btn.className = 'data-table-zoom-btn';
    btn.setAttribute('aria-label', Dashboard.t('main.downloadReport'));
    btn.title = Dashboard.t('main.downloadReport');
    btn.style.position = 'relative';
    btn.innerHTML = '<i class="bx bx-download" aria-hidden="true"></i>';

    const menu = document.createElement('div');
    menu.className = 'data-table-col-filter-mode-menu';
    menu.hidden = true;
    [
        ['csv', 'main.downloadAsCsv', 'main.downloadAsCsvHint'],
        ['xlsx', 'main.downloadAsExcel', 'main.downloadAsExcelHint'],
        ['pdf', 'main.downloadAsPdf', 'main.downloadAsPdfHint'],
    ].forEach(([format, labelKey, hintKey]) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'data-table-col-filter-mode-option';
        option.textContent = `${Dashboard.t(labelKey)} — ${Dashboard.t(hintKey)}`;
        option.addEventListener('click', (event) => {
            event.stopPropagation();
            menu.hidden = true;
            exportReport(format);
        });
        menu.appendChild(option);
    });

    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', (event) => {
        if (!menu.hidden && !btn.contains(event.target)) menu.hidden = true;
    });

    btn.appendChild(menu);
    zoom.appendChild(btn);
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
    currentReportTitle = title || 'Reporte';

    // Semaforización: which columns came straight from Base de Datos Global
    // vs. were built from a formula -- data-group feeds the generic
    // classification band (Dashboard.js: initDataTableColumns already reads
    // it off every <th>), report-col-base/-calc tint the real header/body
    // cells the same way col-system/col-table-fuel do elsewhere.
    const reportColClass = (col) => (col.type === 'calculated' ? 'report-col-calc' : 'report-col-base');
    const reportColGroupKey = (col) => (col.type === 'calculated' ? 'main.reportColCalc' : 'main.reportColBase');

    const headRow = document.getElementById('report-results-head');
    headRow.innerHTML = '';
    report.columns.forEach((col, index) => {
        const th = document.createElement('th');
        th.dataset.col = `col${index}`;
        th.dataset.group = reportColGroupKey(col);
        th.className = reportColClass(col);
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
            td.className = reportColClass(report.columns[index]);
            td.textContent = formatCellValue(value);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    const wrapper = document.querySelector('[data-table-id="report-results"]');
    if (wrapper && report.columns.length) {
        Dashboard.initDataTableColumns(wrapper, 0);
        ensureDownloadButton();
    }
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
