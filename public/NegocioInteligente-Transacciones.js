// ---------------------------------------------------------------------------
// Transacciones Inteligentes de Negocio — define/edit/delete reports (name +
// an ordered list of columns, each either pulled straight from Base de Datos
// Global ("base") or a formula over other columns already in the same report
// ("calculated"). This screen only stores the report's own definition;
// running a report to see real computed data is a future piece.
// ---------------------------------------------------------------------------

// Mirrors BaseDatos-Empresa.js's own 13 + 27 columns exactly — same source
// of truth conceptually, kept in sync by hand like every other per-screen
// column list in this codebase. Grouped by the same Tabla > Clasificación >
// Columna shape Base de Datos Global itself renders with (classification is
// empty for every one of these today, same as there).
const BASE_COLUMNS = [
    {
        tableKey: 'menu.classControlInterno',
        columns: [
            'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
            'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
            'colSysAnio', 'colSysSemana', 'colSysHora',
        ].map((colKey) => ({ colKey, labelKey: `main.${colKey}` })),
    },
    {
        tableKey: 'menu.opTransVolCombustible',
        columns: [
            'colFuelDbId', 'colFuelRecordId', 'colFuelDate', 'colFuelYear', 'colFuelMonth', 'colFuelWeek',
            'colFuelDayNum', 'colFuelDayText', 'colFuelEcoUnit', 'colFuelPlates', 'colFuelDriver',
            'colFuelCoordinator', 'colFuelTicketEvidence', 'colFuelTripKmBefore', 'colFuelTripKmBeforeEvidence',
            'colFuelTripKmAfter', 'colFuelTripKmAfterEvidence', 'colFuelTripKmTotal', 'colFuelType',
            'colFuelLiters', 'colFuelCostPerLiter', 'colFuelSubtotal', 'colFuelVat', 'colFuelTotal',
            'colFuelReason', 'colFuelTransferService', 'colFuelInternalMovement',
        ].map((colKey) => ({ colKey, labelKey: `main.${colKey}` })),
    },
];

const OPERATORS = [
    { id: 'subtract', labelKey: 'main.reportOpSubtract' },
    { id: 'add', labelKey: 'main.reportOpAdd' },
    { id: 'multiply', labelKey: 'main.reportOpMultiply' },
    { id: 'divide', labelKey: 'main.reportOpDivide' },
];
const OPERATOR_SYMBOL = { subtract: '−', add: '+', multiply: '×', divide: '÷' };

let reports = [];
let draftColumns = [];
let editingReportId = null;
let formulaOperands = [];
let formulaOperators = [];

const modal = document.getElementById('report-modal');
const stepMain = document.getElementById('report-step-main');
const stepBase = document.getElementById('report-step-base');
const stepCalc = document.getElementById('report-step-calc');
const nameInput = document.getElementById('report-name-input');
const columnListEl = document.getElementById('report-column-list');
const modalError = document.getElementById('report-modal-error');

function showStep(step) {
    stepMain.hidden = step !== 'main';
    stepBase.hidden = step !== 'base';
    stepCalc.hidden = step !== 'calc';
}

function columnSummary(col) {
    if (col.type === 'base') return col.label;
    const parts = formulaOperandsToText(col.formula);
    return `${col.label} (${parts})`;
}

function formulaOperandsToText(formula) {
    const bits = [];
    formula.operands.forEach((op, i) => {
        if (i > 0) bits.push(` ${OPERATOR_SYMBOL[formula.operators[i - 1]] || '?'} `);
        bits.push(op.kind === 'constant' ? String(op.value) : (draftColumns[op.reportColumnId]?.label || '?'));
    });
    return bits.join('');
}

function renderColumnList() {
    columnListEl.innerHTML = '';
    if (!draftColumns.length) {
        const li = document.createElement('li');
        li.className = 'report-column-list-empty';
        li.textContent = Dashboard.t('main.reportColumnsEmpty');
        columnListEl.appendChild(li);
        return;
    }
    draftColumns.forEach((col, index) => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.textContent = columnSummary(col);
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        removeBtn.setAttribute('aria-label', Dashboard.t('main.reportRemoveColumn'));
        removeBtn.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
        removeBtn.addEventListener('click', () => {
            // Removing a column that another calculated column references
            // would leave a dangling reportColumnId — simplest safe rule:
            // block it and tell the user which one to remove first, rather
            // than silently breaking the other formula.
            const dependents = draftColumns.filter((c, i) => i !== index && c.type === 'calculated'
                && c.formula.operands.some((op) => op.kind === 'column' && op.reportColumnId === index));
            if (dependents.length) {
                Dashboard.showToast(Dashboard.t('main.reportColumnInUse', { names: dependents.map((d) => d.label).join(', ') }), 'warning');
                return;
            }
            draftColumns.splice(index, 1);
            // Shift every reportColumnId above the removed index down by one
            // so the remaining formulas keep pointing at the right column.
            draftColumns.forEach((c) => {
                if (c.type !== 'calculated') return;
                c.formula.operands.forEach((op) => {
                    if (op.kind === 'column' && op.reportColumnId > index) op.reportColumnId -= 1;
                });
            });
            renderColumnList();
        });
        li.append(span, removeBtn);
        columnListEl.appendChild(li);
    });
}

function openReportModal(report) {
    editingReportId = report ? report.id : null;
    document.getElementById('report-modal-title').textContent = Dashboard.t(report ? 'main.reportModalTitleEdit' : 'main.reportModalTitle');
    nameInput.value = report ? report.name : '';
    // Deep-copy each formula: the remove-column handler below mutates
    // operand.reportColumnId in place when shifting indexes, and it must
    // never touch the cached `reports` array's own formula objects (that
    // would leak the shift into the list even if the user cancels).
    draftColumns = report
        ? report.columns.map((c) => ({
            type: c.type,
            sourceTableKey: c.sourceTableKey,
            colKey: c.colKey,
            label: c.label,
            formula: c.formula ? JSON.parse(JSON.stringify(c.formula)) : null,
        }))
        : [];
    modalError.hidden = true;
    renderColumnList();
    showStep('main');
    modal.hidden = false;
}

function closeReportModal() {
    modal.hidden = true;
}

// --- Columna Base de Registro -----------------------------------------------
function openBasePicker() {
    const list = document.getElementById('report-base-picker-list');
    list.innerHTML = '';
    BASE_COLUMNS.forEach((group) => {
        const tier1 = document.createElement('div');
        tier1.className = 'picker-tier1';
        tier1.textContent = Dashboard.t(group.tableKey);
        list.appendChild(tier1);
        const tier2 = document.createElement('div');
        tier2.className = 'picker-tier2';
        tier2.textContent = Dashboard.t('main.reportNoClassification');
        list.appendChild(tier2);
        group.columns.forEach((col) => {
            const label = document.createElement('label');
            label.className = 'picker-row';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.tableKey = group.tableKey;
            checkbox.dataset.colKey = col.colKey;
            checkbox.checked = draftColumns.some((c) => c.type === 'base' && c.sourceTableKey === group.tableKey && c.colKey === col.colKey);
            const span = document.createElement('span');
            span.textContent = Dashboard.t(col.labelKey);
            label.append(checkbox, span);
            list.appendChild(label);
        });
    });
    showStep('base');
}

document.getElementById('report-base-add-btn').addEventListener('click', () => {
    document.querySelectorAll('#report-base-picker-list input[type="checkbox"]:checked').forEach((checkbox) => {
        const { tableKey, colKey } = checkbox.dataset;
        const alreadyAdded = draftColumns.some((c) => c.type === 'base' && c.sourceTableKey === tableKey && c.colKey === colKey);
        if (alreadyAdded) return;
        const group = BASE_COLUMNS.find((g) => g.tableKey === tableKey);
        const col = group?.columns.find((c) => c.colKey === colKey);
        if (!col) return;
        draftColumns.push({ type: 'base', sourceTableKey: tableKey, colKey, label: Dashboard.t(col.labelKey) });
    });
    renderColumnList();
    showStep('main');
});
document.getElementById('report-base-back-btn').addEventListener('click', () => showStep('main'));
document.getElementById('report-add-base-btn').addEventListener('click', openBasePicker);

// --- Columna Calculada -------------------------------------------------------
function renderFormulaOperands() {
    const container = document.getElementById('report-formula-operands');
    container.innerHTML = '';
    formulaOperands.forEach((operand, index) => {
        if (index > 0) {
            const opSelect = document.createElement('select');
            opSelect.className = 'formula-select';
            OPERATORS.forEach((op) => {
                const option = document.createElement('option');
                option.value = op.id;
                option.textContent = Dashboard.t(op.labelKey);
                opSelect.appendChild(option);
            });
            opSelect.value = formulaOperators[index - 1] || 'subtract';
            opSelect.addEventListener('change', () => { formulaOperators[index - 1] = opSelect.value; });
            container.appendChild(opSelect);
        }

        const row = document.createElement('div');
        row.className = 'formula-operand-row';

        const kindSelect = document.createElement('select');
        kindSelect.className = 'formula-select';
        [['column', 'main.reportOperandColumn'], ['constant', 'main.reportOperandConstant']].forEach(([kind, key]) => {
            const option = document.createElement('option');
            option.value = kind;
            option.textContent = Dashboard.t(key);
            kindSelect.appendChild(option);
        });
        kindSelect.value = operand.kind;
        kindSelect.addEventListener('change', () => {
            operand.kind = kindSelect.value;
            operand.reportColumnId = null;
            operand.value = null;
            renderFormulaOperands();
        });
        row.appendChild(kindSelect);

        if (operand.kind === 'column') {
            const colSelect = document.createElement('select');
            colSelect.className = 'formula-select';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = Dashboard.t('main.reportOperandPlaceholder');
            colSelect.appendChild(placeholder);
            draftColumns.forEach((col, colIndex) => {
                const option = document.createElement('option');
                option.value = String(colIndex);
                option.textContent = col.label;
                colSelect.appendChild(option);
            });
            colSelect.value = operand.reportColumnId != null ? String(operand.reportColumnId) : '';
            colSelect.addEventListener('change', () => {
                operand.reportColumnId = colSelect.value === '' ? null : Number(colSelect.value);
            });
            row.appendChild(colSelect);
        } else {
            const numberInput = document.createElement('input');
            numberInput.type = 'number';
            numberInput.className = 'formula-input';
            numberInput.step = 'any';
            numberInput.placeholder = Dashboard.t('main.reportConstantPlaceholder');
            numberInput.value = operand.value != null ? operand.value : '';
            numberInput.addEventListener('input', () => {
                operand.value = numberInput.value === '' ? null : parseFloat(numberInput.value);
            });
            row.appendChild(numberInput);
        }

        if (formulaOperands.length > 2) {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'admin-icon-btn admin-icon-btn-danger';
            removeBtn.setAttribute('aria-label', Dashboard.t('main.reportRemoveOperand'));
            removeBtn.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
            removeBtn.addEventListener('click', () => {
                formulaOperands.splice(index, 1);
                formulaOperators.splice(Math.max(index - 1, 0), 1);
                renderFormulaOperands();
            });
            row.appendChild(removeBtn);
        }

        container.appendChild(row);
    });
}

function openCalcBuilder() {
    formulaOperands = [{ kind: 'column', reportColumnId: null, value: null }, { kind: 'column', reportColumnId: null, value: null }];
    formulaOperators = ['subtract'];
    document.getElementById('report-calc-name-input').value = '';
    document.getElementById('report-calc-error').hidden = true;
    renderFormulaOperands();
    showStep('calc');
}
document.getElementById('report-add-calc-btn').addEventListener('click', openCalcBuilder);
document.getElementById('report-calc-back-btn').addEventListener('click', () => showStep('main'));
document.getElementById('report-add-operand-btn').addEventListener('click', () => {
    formulaOperands.push({ kind: 'column', reportColumnId: null, value: null });
    formulaOperators.push('subtract');
    renderFormulaOperands();
});

document.getElementById('report-calc-add-btn').addEventListener('click', () => {
    const errorEl = document.getElementById('report-calc-error');
    const name = document.getElementById('report-calc-name-input').value.trim();
    if (!name) {
        errorEl.textContent = Dashboard.t('main.reportNameRequired');
        errorEl.hidden = false;
        return;
    }
    const operands = formulaOperands.map((op) => (op.kind === 'constant'
        ? { kind: 'constant', value: op.value }
        : { kind: 'column', reportColumnId: op.reportColumnId }));
    const invalid = operands.some((op) => (op.kind === 'constant' && (op.value == null || Number.isNaN(op.value)))
        || (op.kind === 'column' && op.reportColumnId == null));
    if (invalid || operands.length < 2) {
        errorEl.textContent = Dashboard.t('main.reportNeedsOperands');
        errorEl.hidden = false;
        return;
    }
    draftColumns.push({ type: 'calculated', label: name, formula: { operands, operators: [...formulaOperators] } });
    renderColumnList();
    showStep('main');
});

// --- Save / list / delete / authorize ---------------------------------------
document.getElementById('report-new-btn').addEventListener('click', () => openReportModal(null));
document.getElementById('report-cancel-btn').addEventListener('click', closeReportModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeReportModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeReportModal(); });

document.getElementById('report-save-btn').addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
        modalError.textContent = Dashboard.t('main.reportNameRequired');
        modalError.hidden = false;
        return;
    }
    if (!draftColumns.length) {
        modalError.textContent = Dashboard.t('main.reportNeedsColumns');
        modalError.hidden = false;
        return;
    }
    modalError.hidden = true;
    const body = { name, columns: draftColumns };
    try {
        const url = editingReportId ? `/api/business/intelligent-reports/${editingReportId}` : '/api/business/intelligent-reports';
        const res = await fetch(url, {
            method: editingReportId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('save failed');
        const wasEditing = !!editingReportId;
        closeReportModal();
        await loadReports();
        Dashboard.showToast(Dashboard.t(wasEditing ? 'main.changeSaved' : 'main.recordSaved'), 'success');
    } catch {
        modalError.textContent = Dashboard.t('admin.saveError');
        modalError.hidden = false;
    }
});

function formatDate(isoLike) {
    if (!isoLike) return '—';
    const [datePart] = isoLike.split(' ');
    const [year, month, day] = (datePart || '').split('-');
    if (!year || !month || !day) return isoLike;
    return `${day}/${month}/${year}`;
}

function renderReports() {
    const tbody = document.getElementById('report-table-body');
    const emptyEl = document.getElementById('report-empty');
    tbody.innerHTML = '';
    emptyEl.hidden = reports.length > 0;
    reports.forEach((report) => {
        const tr = document.createElement('tr');
        const cells = [
            ['reportCompany', Dashboard.companyName || '—'],
            ['reportName', report.name],
            ['reportCreatedAt', formatDate(report.created_at)],
            ['reportCreatedBy', report.created_by || '—'],
            ['reportAuthorizedBy', report.authorized_by || '—'],
        ];
        cells.forEach(([col, text]) => {
            const td = document.createElement('td');
            td.dataset.col = col;
            td.textContent = text;
            tr.appendChild(td);
        });

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';

        if (!report.authorized_by) {
            const authorizeBtn = document.createElement('button');
            authorizeBtn.type = 'button';
            authorizeBtn.className = 'admin-icon-btn';
            authorizeBtn.setAttribute('aria-label', Dashboard.t('main.reportAuthorize'));
            authorizeBtn.title = Dashboard.t('main.reportAuthorize');
            authorizeBtn.innerHTML = '<i class="bx bx-check-shield" aria-hidden="true"></i>';
            authorizeBtn.addEventListener('click', () => authorizeReport(report));
            tdActions.appendChild(authorizeBtn);
        }
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => openReportModal(report));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => deleteReport(report));
        tdActions.append(editBtn, deleteBtn);

        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
}

async function authorizeReport(report) {
    try {
        const res = await fetch(`/api/business/intelligent-reports/${report.id}/authorize`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
            if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
            throw new Error('authorize failed');
        }
        await loadReports();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function deleteReport(report) {
    if (!(await Dashboard.confirm(Dashboard.t('main.reportDeleteConfirm')))) return;
    try {
        const res = await fetch(`/api/business/intelligent-reports/${report.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        reports = reports.filter((r) => r.id !== report.id);
        renderReports();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function loadReports() {
    try {
        const res = await fetch('/api/business/intelligent-reports', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        reports = data.reports || [];
        renderReports();
    } catch (err) {
        console.error('Transacciones Inteligentes: failed to load reports', err);
    }
}

(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'btn-negocio-inteligente' });
        await loadReports();
    } catch (err) {
        console.error('Transacciones Inteligentes failed to initialize:', err);
    }
})();
