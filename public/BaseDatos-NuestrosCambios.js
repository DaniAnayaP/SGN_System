// ---------------------------------------------------------------------------
// Base de Datos de Nuestros Cambios — every row any pantalla has ever logged
// via checkAndLogFieldChanges/logTableChange (see server.js), across every
// table at once, concentrated here. Nothing screen-specific to wire: the
// moment a table starts calling logTableChange its rows already land in
// data_table_changes and show up here automatically -- existing screens and
// any future one alike. Read-only, no pagination, same recipe as Nuestros
// Respaldos: 13 Control Interno columns + this screen's own.
// ---------------------------------------------------------------------------

function textCell(value) {
    const td = document.createElement('td');
    td.textContent = value || '—';
    return td;
}

const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
function buildSystemCells(change) {
    return SYSTEM_COLUMN_KEYS.map((key) => {
        const td = textCell(change[key]);
        td.classList.add('col-system');
        return td;
    });
}

// Same description recipe Dashboard.js's own change-history modal already
// uses (openChangeHistory) -- kept identical so a change reads the same way
// whether it's seen there or concentrated here.
function describeChange(change) {
    if (change.action === 'create') return Dashboard.t('main.changeHistoryCreated');
    if (change.action === 'delete') return Dashboard.t('main.changeHistoryDeleted');
    return `${Dashboard.t(change.field_key)}: "${change.old_value || '—'}" → "${change.new_value || '—'}"`;
}

function buildRow(change) {
    const tr = document.createElement('tr');
    tr.append(
        ...buildSystemCells(change),
        textCell(Dashboard.t(change.screenLabelKey)),
        textCell(change.record_label),
        textCell(describeChange(change)),
        textCell(change.changed_by),
        textCell(change.requested_by),
        textCell(change.authorized_by),
    );
    return tr;
}

function getTbody() {
    return document.getElementById('changes-table-body');
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (!tbody || tbody.querySelector('tr')) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="data-table-empty-cell" colspan="19"><div class="data-table-empty-inner" data-i18n="main.emptyStateText">${Dashboard.t('main.emptyStateText')}</div></td>`;
    tbody.appendChild(tr);
}

async function loadChanges() {
    const tbody = getTbody();
    if (!tbody) return;
    try {
        const res = await fetch('/api/business/table-changes', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { changes } = await res.json();
        tbody.innerHTML = '';
        if (!changes.length) { ensureEmptyState(); return; }
        changes.forEach((change) => tbody.appendChild(buildRow(change)));
    } catch (err) {
        console.error('Nuestros Cambios: failed to load changes', err);
    }
}

(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'btn-base-datos' });
        await loadChanges();
    } catch (err) {
        console.error('Nuestros Cambios failed to initialize:', err);
    }
})();
