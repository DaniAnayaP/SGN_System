// ---------------------------------------------------------------------------
// Base de Datos de Solicitudes — every catalog-value request ("+ Solicitar
// nuevo X") ever made, any catálogo, any status, plus every access-denied
// alert, concentrated here -- same "everything, unscoped by recipient" role
// Nuestros Cambios already plays for field edits (see
// GET /api/business/catalog-requests-log in server.js). Read-only, no
// pagination.
// ---------------------------------------------------------------------------

function textCell(value) {
    const td = document.createElement('td');
    td.textContent = value || '—';
    return td;
}

function badgeCell(text, cssClass) {
    const td = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `admin-badge ${cssClass}`;
    badge.textContent = text;
    td.appendChild(badge);
    return td;
}

// hops: [{from_label, to_label, action}] in chronological order --
// reconstructs "Daniel A. → Luis M. → Rosa C." by taking the first
// requester and every non-blank "sent to" name after (the final approve/
// reject hop has no to_label, nothing left to chase).
function describeChain(hops) {
    if (!hops || !hops.length) return '—';
    const names = [hops[0].from_label, ...hops.filter((h) => h.to_label).map((h) => h.to_label)];
    return names.filter(Boolean).join(' → ');
}

function statusBadge(status) {
    if (status === 'approved') return badgeCell(Dashboard.t('main.reqStatusApproved'), 'admin-badge-activo');
    if (status === 'rejected') return badgeCell(Dashboard.t('main.reqStatusRejected'), 'admin-badge-inactivo');
    return badgeCell(Dashboard.t('main.reqStatusPending'), 'admin-badge-suspendido');
}

function buildRequestRow(request) {
    const tr = document.createElement('tr');
    tr.append(
        textCell(formatDate(request.createdAt)),
        textCell(Dashboard.t('main.reqTypeRequest')),
        textCell(request.categoryLabel),
        textCell(request.requestedName),
        textCell(request.requestedByLabel),
        textCell(Dashboard.t(TABLE_KEY_LABELS[request.sourceTableKey] || request.sourceTableKey || '—')),
        textCell(describeChain(request.hops)),
        statusBadge(request.status),
    );
    return tr;
}

function buildAlertRow(alert) {
    const tr = document.createElement('tr');
    tr.append(
        textCell(formatDate(alert.created_at)),
        textCell(Dashboard.t('main.reqTypeAlert')),
        textCell('—'),
        textCell('—'),
        textCell(alert.acting_user_label),
        textCell(Dashboard.t(alert.screen_key)),
        textCell(`${Dashboard.t(alert.field_key)} → ${Dashboard.t('main.reportsTo')}`),
        badgeCell(Dashboard.t('main.reqStatusAlert'), 'admin-badge-inactivo'),
    );
    return tr;
}

// dd-mm-aa, same format Dashboard.js's own change-history modal already
// uses for a raw SQLite "YYYY-MM-DD HH:MM:SS" value.
function formatDate(sqliteDatetime) {
    const [y, m, d] = (sqliteDatetime || '').slice(0, 10).split('-');
    return y && m && d ? `${d}-${m}-${y.slice(2)}` : '—';
}

// A request's own sourceTableKey is a raw table key (e.g.
// "nuestros-traslados"), not a translation key -- map it to the same
// screen label every other table already advertises via WEB_SCREEN_CATALOG,
// falling back to the raw key itself for one that hasn't been added yet.
const TABLE_KEY_LABELS = {
    'nuestros-traslados': 'menu.opTransVolNuestrosTraslados',
};

function getTbody() {
    return document.getElementById('requests-table-body');
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (!tbody || tbody.querySelector('tr')) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="data-table-empty-cell" colspan="8"><div class="data-table-empty-inner" data-i18n="main.emptyStateText">${Dashboard.t('main.emptyStateText')}</div></td>`;
    tbody.appendChild(tr);
}

async function loadRequestsLog() {
    const tbody = getTbody();
    if (!tbody) return;
    try {
        const res = await fetch('/api/business/catalog-requests-log', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { requests, alertas } = await res.json();
        tbody.innerHTML = '';
        // Both already come back newest-first from their own db.js queries --
        // merge by createdAt so a request and an alert from the same moment
        // interleave correctly instead of showing as two separate blocks.
        const rows = [
            ...requests.map((r) => ({ sortKey: r.createdAt, el: buildRequestRow(r) })),
            ...alertas.map((a) => ({ sortKey: a.created_at, el: buildAlertRow(a) })),
        ].sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));
        if (!rows.length) { ensureEmptyState(); return; }
        rows.forEach(({ el }) => tbody.appendChild(el));
    } catch (err) {
        console.error('Base de Datos de Solicitudes: failed to load', err);
    }
}

(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'btn-base-datos' });
        await loadRequestsLog();
    } catch (err) {
        console.error('Base de Datos de Solicitudes failed to initialize:', err);
    }
})();
