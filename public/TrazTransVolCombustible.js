// ---------------------------------------------------------------------------
// Registro Combustible — Admin (trazabilidad). Read-only mirror of
// OpTransVolCombustible.html's own 41 columns (13 Control Interno +
// Registro Combustible's own 27 + Acciones), including the calculated ones
// (Costo por Litro, Total, Total Trip KM) that Operaciones itself will stop
// showing once its own column set gets trimmed down to just what a worker
// fills in. No inline edit, no "+ Nuevo Registro", no delete — a record is
// only ever created/edited from Operaciones; this screen exists purely to
// view it. Rendering logic mirrors BaseDatos-Empresa.js's own buildFuelRow
// exactly (same shared source data, GET /api/business/base-datos-global,
// today already scoped to registro-combustible only).
// ---------------------------------------------------------------------------

const MONTH_ABBR = {
    es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const DAY_ABBR = {
    es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

function pad(n, len = 2) {
    return String(n).padStart(len, '0');
}

function weekOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - start) / 86400000);
    return Math.ceil((days + start.getDay() + 1) / 7);
}

function formatMoney(n) {
    return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatKm(n) {
    return `${(Number(n) || 0).toLocaleString()} km`;
}

function formatCostPerLiter(n) {
    return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/L`;
}

function formatLiters(n) {
    return `${(Number(n) || 0).toLocaleString()} L`;
}

function textCell(key, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = key;
    if (extraClass) td.classList.add(extraClass);
    td.textContent = value || '—';
    return td;
}

const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
function buildSystemCells(record) {
    return SYSTEM_COLUMN_KEYS.map((key) => textCell(key, record[key], 'col-system'));
}

const FUEL_TYPE_LABELS = { diesel: 'main.fuelTypeDiesel', magna: 'main.fuelTypeMagna', premium: 'main.fuelTypePremium' };
const FUEL_REASON_LABELS = { traslado: 'main.colFuelTransferService', interno: 'main.colFuelInternalMovement' };

function buildFuelRow(record) {
    const lang = Dashboard.lang === 'es' ? 'es' : 'en';
    const [year, month, day] = record.date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const tripKmTotal = Math.max((parseFloat(record.tripKmAfter) || 0) - (parseFloat(record.tripKmBefore) || 0), 0);
    const liters = parseFloat(record.liters) || 0;
    const subtotal = parseFloat(record.subtotal) || 0;
    const vat = parseFloat(record.vat) || 0;
    const costPerLiter = liters > 0 ? subtotal / liters : 0;

    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
    tr.dataset.recordDate = record.date;
    tr.append(
        ...buildSystemCells(record),
        textCell('colFuelDbId', record.dbId, 'col-table-fuel'),
        textCell('colFuelRecordId', String(record.recordNumber), 'col-table-fuel'),
        textCell('colFuelDate', `${pad(day)}-${pad(month)}-${pad(year % 100)}`, 'col-table-fuel'),
        textCell('colFuelYear', String(year), 'col-table-fuel'),
        textCell('colFuelMonth', MONTH_ABBR[lang][month - 1], 'col-table-fuel'),
        textCell('colFuelWeek', `Sem${weekOfYear(dateObj)}_${year}`, 'col-table-fuel'),
        textCell('colFuelDayNum', String(day), 'col-table-fuel'),
        textCell('colFuelDayText', DAY_ABBR[lang][dateObj.getDay()], 'col-table-fuel'),
        textCell('colFuelEcoUnit', record.ecoUnit, 'col-table-fuel'),
        textCell('colFuelPlates', record.plates, 'col-table-fuel'),
        textCell('colFuelDriver', record.driver, 'col-table-fuel'),
        textCell('colFuelCoordinator', record.coordinator, 'col-table-fuel'),
        textCell('colFuelTicketEvidence', record.ticketEvidence ? Dashboard.t('main.evidenceYes') : '', 'col-table-fuel'),
        textCell('colFuelTripKmBefore', record.tripKmBefore ? formatKm(record.tripKmBefore) : '', 'col-table-fuel'),
        textCell('colFuelTripKmBeforeEvidence', record.tripKmBeforeEvidence ? Dashboard.t('main.evidenceYes') : '', 'col-table-fuel'),
        textCell('colFuelTripKmAfter', record.tripKmAfter ? formatKm(record.tripKmAfter) : '', 'col-table-fuel'),
        textCell('colFuelTripKmAfterEvidence', record.tripKmAfterEvidence ? Dashboard.t('main.evidenceYes') : '', 'col-table-fuel'),
        textCell('colFuelTripKmTotal', formatKm(tripKmTotal), 'col-table-fuel'),
        textCell('colFuelType', record.fuelType ? Dashboard.t(FUEL_TYPE_LABELS[record.fuelType] || '') : '', 'col-table-fuel'),
        textCell('colFuelLiters', liters ? formatLiters(liters) : '', 'col-table-fuel'),
        textCell('colFuelCostPerLiter', liters > 0 ? formatCostPerLiter(costPerLiter) : '', 'col-table-fuel'),
        textCell('colFuelSubtotal', subtotal ? formatMoney(subtotal) : '', 'col-table-fuel'),
        textCell('colFuelVat', vat ? formatMoney(vat) : '', 'col-table-fuel'),
        textCell('colFuelTotal', (subtotal || vat) ? formatMoney(subtotal + vat) : '', 'col-table-fuel'),
        textCell('colFuelReason', record.reason ? Dashboard.t(FUEL_REASON_LABELS[record.reason] || '') : '', 'col-table-fuel'),
        textCell('colFuelTransferService', record.transferService, 'col-table-fuel'),
        textCell('colFuelInternalMovement', record.internalMovement, 'col-table-fuel'),
        buildActionsCell(record),
    );
    return tr;
}

function buildActionsCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'admin-icon-btn';
    historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
    historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
    historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    historyBtn.addEventListener('click', () => Dashboard.openChangeHistory('registro-combustible', record.id));
    td.appendChild(historyBtn);
    return td;
}

function getTbody() {
    return document.getElementById('traz-fuel-table-body');
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (!tbody || tbody.querySelector('tr')) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="data-table-empty-cell" colspan="41"><div class="data-table-empty-inner" data-i18n="main.emptyStateText">${Dashboard.t('main.emptyStateText')}</div></td>`;
    tbody.appendChild(tr);
}

async function loadRecords() {
    const tbody = getTbody();
    if (!tbody) return;
    try {
        const res = await fetch('/api/business/base-datos-global', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { records } = await res.json();
        tbody.innerHTML = '';
        if (!records.length) { ensureEmptyState(); return; }
        records.forEach((record) => {
            if (record.sourceTable === 'registro-combustible') tbody.appendChild(buildFuelRow(record));
        });
        if (!tbody.querySelector('tr')) ensureEmptyState();
    } catch (err) {
        console.error('Registro Combustible (Admin): failed to load records', err);
    }
}

document.addEventListener('dashboard:language-changed', loadRecords);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-admin-fuel-traceability' });
        if (!role) return;
        await loadRecords();
    } catch (err) {
        console.error('Registro Combustible (Admin) failed to initialize:', err);
    }
})();
