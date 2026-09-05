// ---------------------------------------------------------------------------
// Nuestras Categorías <Tipo> (Catálogos > Cadena de Suministro > C.
// Distribución) — 7 near-identical catalogs (Inventarios/Compras/
// Almacenamiento/Rotación/Manejo Especial/Riesgo/Vida Útil), each just a
// named, described, activatable option list Alta Nuestros Artículos' own
// "Categorías Artículo" selects read from. One shared script instead of 7
// copy-pasted ones -- these 7 screens are the exact same shape by design
// (confirmed with the client), each HTML shell only differs in which
// category it points at via <body data-category-type="...">. Same
// "create blank + click-per-cell + PATCH" convention as Tipos de Unidad
// (the closest existing catalog precedent) -- unlike Alta Nuestros
// Artículos, these only have 2 editable fields, so there's no case for a
// creation form/modal here.
// ---------------------------------------------------------------------------

const CATEGORY_TYPE_TABLE_KEYS = {
    inventario: 'categorias-inventario',
    compra: 'categorias-compra',
    almacenamiento: 'categorias-almacenamiento',
    rotacion: 'categorias-rotacion',
    manejo: 'categorias-manejo',
    riesgo: 'categorias-riesgo',
    vidautil: 'categorias-vidautil',
};

const CATEGORY_TYPE = document.body.dataset.categoryType;
const TABLE_KEY = CATEGORY_TYPE_TABLE_KEYS[CATEGORY_TYPE];
const API_BASE = `/api/business/article-categories/${CATEGORY_TYPE}`;
const DELETE_AUTH_COL = 'colCatDeleteAuth';

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Nuestras Categorías failed to initialize:', err);
    }
})();

function textCell(key, value) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value || '—';
    return td;
}

function textCellSystem(key, value) {
    const td = textCell(key, value);
    td.classList.add('col-system');
    return td;
}

const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
function buildSystemCells(record) {
    return SYSTEM_COLUMN_KEYS.map((key) => textCellSystem(key, record[key]));
}

function isPending(record, key) {
    return (record.pendingFields || []).includes(key);
}

// A draft row (record.id === null, never persisted -- see createNewCategory)
// only actually gets created on the server once its FIRST field commits, so
// "+ Nueva Categoría" followed by leaving the row untouched never leaves a
// blank category behind.
async function ensureCreatedThenPatch(record, patch) {
    if (record.id) return patchCategory(record.id, patch);
    try {
        const res = await fetch(API_BASE, { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('create failed');
        const { category } = await res.json();
        record.id = category.id;
        record.registroUnico = category.registroUnico;
        record.code = category.code;
        await patchCategory(category.id, patch);
    } catch (err) {
        console.error('Nuestras Categorías: failed to create record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function patchCategory(id, patch) {
    try {
        const res = await fetch(`${API_BASE}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'error');
            await refreshTable();
            return;
        }
        const body = await res.json().catch(() => ({}));
        if (body.rejectedFields?.length) {
            Dashboard.showToast(`${Dashboard.t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'warning');
        } else if (body.pendingFields?.length) {
            Dashboard.showToast(`${Dashboard.t('main.changePending')}: ${body.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'info');
        }
        await refreshTable();
    } catch (err) {
        console.error('Nuestras Categorías: failed to save change', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await refreshTable();
    }
}

function buildStatusCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colCatStatus';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.innerHTML = `
        <option value="active" data-i18n="admin.statusActivo">${Dashboard.t('admin.statusActivo')}</option>
        <option value="inactive" data-i18n="admin.statusInactivo">${Dashboard.t('admin.statusInactivo')}</option>
    `;
    select.value = record.status || 'active';
    select.disabled = isPending(record, 'status') || !Dashboard.canEditField(TABLE_KEY, 'colCatStatus', record.status || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'status') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { status: select.value }));
    td.appendChild(select);
    return td;
}

function buildActionsCell(record, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    if (record.id) {
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, record.id));
        td.appendChild(historyBtn);
    }
    if (!record.id || Dashboard.hasColumnDeleteGrant(TABLE_KEY, DELETE_AUTH_COL)) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.title = Dashboard.t('admin.delete');
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => {
            if (!record.id) { tr.remove(); ensureEmptyState(); return; }
            deleteCategory(record.id, tr);
        });
        td.appendChild(deleteBtn);
    }
    return td;
}

async function deleteCategory(id, tr) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
            if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
            throw new Error('delete failed');
        }
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Nuestras Categorías: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

function buildRow(record) {
    const tdName = document.createElement('td');
    tdName.dataset.col = 'colCatName';
    Dashboard.attachInlineEdit(tdName, {
        value: record.name || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCatName',
        pending: isPending(record, 'name'),
        onCommit: (val) => ensureCreatedThenPatch(record, { name: val.trim() }),
    });

    const tdDescription = document.createElement('td');
    tdDescription.dataset.col = 'colCatDescription';
    Dashboard.attachInlineEdit(tdDescription, {
        value: record.description || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCatDescription',
        pending: isPending(record, 'description'),
        onCommit: (val) => ensureCreatedThenPatch(record, { description: val.trim() }),
    });

    const tr = document.createElement('tr');
    tr.dataset.recordId = record.id != null ? String(record.id) : '';
    tr.append(
        ...buildSystemCells(record),
        textCellSystem('colCatRegistroUnico', record.registroUnico),
        textCell('colCatCode', record.code),
        tdName,
        tdDescription,
        buildStatusCell(record),
        buildActionsCell(record, tr),
    );
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    return tr;
}

function getTbody() {
    return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = 18;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

async function refreshTable() {
    const tbody = getTbody();
    if (tbody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    try {
        const res = await fetch(API_BASE, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { categories } = await res.json();
        tbody.innerHTML = '';
        if (!categories.length) { ensureEmptyState(); return; }
        categories.forEach((record) => tbody.appendChild(buildRow(record)));
        applyCategoryFilters();
    } catch (err) {
        console.error('Nuestras Categorías: failed to load records', err);
    }
}

function applyCategoryFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = ['colCatCode', 'colCatName', 'colCatDescription']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !haystack.includes(text);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyCategoryFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyCategoryFilters);

// Only adds a local, in-memory draft row (record.id === null) -- nothing is
// persisted server-side until its first field actually commits (see
// ensureCreatedThenPatch), so clicking this and never touching the row never
// leaves a blank category behind.
function createNewCategory() {
    const draft = { id: null, registroUnico: '', code: '', name: '', description: '', status: '', pendingFields: [] };
    const tbody = getTbody();
    const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
    if (emptyRow) emptyRow.remove();
    tbody.appendChild(buildRow(draft));
}

function renderNewRecordButton() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newArticleCategory">${Dashboard.t('main.newArticleCategory')}</span>`;
    btn.addEventListener('click', createNewCategory);
    toolbar.prepend(btn);
}
