// ---------------------------------------------------------------------------
// Cadena de Suministro › Centro de Distribución › Cargas Manuales › Análisis Registros Manuales (Daniel, 2026-11-25, «Sí, empieza el Análisis»): la lista de análisis y el botón «＋ Agregar nuevo análisis».
// Cada análisis nuevo es una pantalla más del menú (debajo de esta) con su diseño de columnas y sus versiones (archivos extraídos). Tabla estándar; los botones son del árbol (colAnCrearAuth).
// Un análisis nunca se borra: se desactiva (deja de salir en el menú).
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/manual-analyses';
const TABLE = 'analisis';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const COLUMNS = ['colAnNombre', 'colAnRegistros', 'colAnColumnas', 'colAnUltimaVersion', 'colAnVersiones', 'colAnEstado'];
const t = (key, params) => Dashboard.t(key, params);
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const regName = (r) => r.name || t(r.nameKey);

const st = { analyses: [], registries: [], canCreate: false, text: '' };
const wrapper = () => document.querySelector(`[data-table-id="${TABLE}"]`);
const table = () => wrapper().querySelector('table.data-table');

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await load();
        document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', () => { st.text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase(); draw(); });
        document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', () => { st.text = ''; draw(); });
    } catch (err) {
        console.error('Análisis Registros Manuales: failed to initialize', err);
    }
})();

async function load() {
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        st.analyses = body.analyses || []; st.registries = body.registries || []; st.canCreate = !!body.canCreate;
        draw();
    } catch (err) {
        console.error('Análisis: failed to load', err);
        Dashboard.showToast(t('main.anLoadError'), 'error');
    }
}
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function iconBtn(icon, key, helpKey, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'admin-icon-btn';
    btn.setAttribute('data-help-key', helpKey); btn.setAttribute('aria-label', t(key)); btn.title = t(key);
    btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
    btn.addEventListener('click', onClick);
    return btn;
}
function visible() {
    if (!st.text) return st.analyses;
    return st.analyses.filter((a) => `${a.name} ${(a.design.registries || []).map((k) => { const r = st.registries.find((x) => x.key === k); return r ? regName(r) : k; }).join(' ')}`.toLowerCase().includes(st.text));
}
function draw() {
    const tbl = table();
    if (!tbl.dataset.colInit) {
        const row = tbl.tHead.rows[0] || tbl.tHead.insertRow();
        row.textContent = '';
        const th = (col, group, key, cls) => { const el = document.createElement('th'); el.dataset.col = col; if (group) el.dataset.group = group; el.dataset.i18n = key; el.textContent = t(key); if (cls) el.className = cls; return el; };
        SYSTEM_COLUMN_KEYS.forEach((k) => row.appendChild(th(k, 'menu.classControlInterno', `main.${k}`, 'col-system')));
        COLUMNS.forEach((k) => row.appendChild(th(k, 'menu.cmAnalisisRegistros', `main.${k}`)));
        row.appendChild(th('actions', null, 'main.colActions'));
    }
    const tbody = tbl.tBodies[0];
    tbody.innerHTML = '';
    visible().forEach((a) => {
        const tr = document.createElement('tr');
        tr.dataset.recordId = a.id;
        const name = document.createElement('td');
        name.dataset.col = 'colAnNombre';
        const link = document.createElement('a');
        link.href = `CmAnalisis.html?id=${a.id}`; link.textContent = a.name; link.className = 'an-link';
        name.appendChild(link);
        const last = a.lastExtraction;
        const lastCell = document.createElement('td');
        lastCell.dataset.col = 'colAnUltimaVersion';
        if (last) { lastCell.appendChild(document.createTextNode(`v${last.version} · `)); const when = document.createElement('span'); Dashboard.renderTimeStamp(when, last.createdAt); lastCell.appendChild(when); } else lastCell.textContent = '—';
        const status = document.createElement('td');
        status.dataset.col = 'colAnEstado';
        status.innerHTML = `<span class="reg-pill reg-pill-${a.status === 'active' ? 'ok' : 'off'}">${esc(t(`main.anStatus_${a.status}`))}</span>`;
        const actions = document.createElement('td');
        actions.dataset.col = 'actions';
        actions.className = 'admin-table-actions';
        actions.appendChild(iconBtn('bx-right-arrow-alt', 'main.anOpen', 'anOpen', () => { location.href = `CmAnalisis.html?id=${a.id}`; }));
        const history = iconBtn('bx-history', 'main.changeHistoryTitleRecord', 'changeHistory', () => Dashboard.openChangeHistory(TABLE, a.id));
        actions.appendChild(history);
        if (st.canCreate) {
            actions.appendChild(iconBtn('bx-edit', 'main.anRename', 'anRename', () => openRename(a)));
            actions.appendChild(iconBtn(a.status === 'active' ? 'bx-hide' : 'bx-show', a.status === 'active' ? 'main.anDeactivate' : 'main.anActivate', 'anToggle', () => toggle(a)));
        }
        tr.append(
            ...SYSTEM_COLUMN_KEYS.map((k) => cell(k, a[k], 'col-system')), name,
            cell('colAnRegistros', (a.design.registries || []).map((k) => { const r = st.registries.find((x) => x.key === k); return r ? regName(r) : k; }).join(' · ')),
            cell('colAnColumnas', (a.design.consulted || []).length, 'col-num'), lastCell, cell('colAnVersiones', a.extractionsCount, 'col-num'), status, actions,
        );
        tbody.appendChild(tr);
    });
    if (!tbody.querySelector('tr')) {
        const tr = document.createElement('tr'); const td = document.createElement('td');
        td.className = 'data-table-empty-cell'; td.colSpan = SYSTEM_COLUMN_KEYS.length + COLUMNS.length + 1;
        const inner = document.createElement('div'); inner.className = 'data-table-empty-inner'; inner.textContent = t('main.emptyStateText');
        td.appendChild(inner); tr.appendChild(td); tbody.appendChild(tr);
    }
    if (!tbl.dataset.colInit && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper(), 0);
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE);
    wrapper().setAttribute('data-help-key', 'anTable');
    renderButtons();
    if (Dashboard.attachTableDownloadButton) Dashboard.attachTableDownloadButton(TABLE, { getTitle: () => `${t('menu.cmAnalisisRegistros')}_${new Date().toISOString().slice(0, 10)}` });
}
function renderButtons() {
    const toolbar = wrapper().previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom') || !st.canCreate || toolbar.querySelector('#an-new-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'data-table-new-record-btn'; btn.id = 'an-new-btn'; btn.setAttribute('data-help-key', 'anNew');
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('main.anNew'))}</span>`;
    btn.addEventListener('click', openCreate);
    toolbar.classList.add('ven-toolbar');
    toolbar.prepend(btn);
}
function errorText(body) {
    const code = body && body.code;
    return ['AN_NAME_REQUIRED', 'AN_NAME_TAKEN', 'DESIGN_REGISTRIES', 'AN_FORBIDDEN'].includes(code) ? t(`main.anErr_${code}`) : t('admin.saveError');
}
function modal(html, onReady) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    overlay.querySelectorAll('[data-an-close]').forEach((b) => b.addEventListener('click', close));
    onReady(overlay, close);
}
function openCreate() {
    const regs = st.registries;
    const html = `<h3>${esc(t('main.anNewTitle'))}</h3>
        <label for="an-c-name">${esc(t('main.anName'))}</label><input type="text" id="an-c-name" maxlength="80" autocomplete="off">
        <p class="reg-field-label">${esc(t('main.anRegistriesLabel'))}</p>
        <div class="an-checks" id="an-c-regs">${regs.map((r) => `<label><input type="checkbox" value="${esc(r.key)}" checked> <span>${esc(regName(r))}</span> <small>${esc(t(r.kind === 'month' ? 'main.regKindMonth' : 'main.regKindDay'))}</small></label>`).join('')}</div>
        <p class="reg-field-label">${esc(t('main.anStart'))}</p>
        <div class="an-checks"><label><input type="radio" name="an-c-start" value="blank" checked> <span>${esc(t('main.anStartBlank'))}</span></label>
        <label><input type="radio" name="an-c-start" value="copy"${st.analyses.length ? '' : ' disabled'}> <span>${esc(t('main.anStartCopy'))}</span></label>
        <select id="an-c-copy"${st.analyses.length ? '' : ' disabled'}>${st.analyses.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
        <p class="admin-error" id="an-c-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t('main.anCreate'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay) => {
        const err = (text) => { const el = overlay.querySelector('#an-c-error'); el.textContent = text; el.hidden = !text; };
        overlay.querySelector('#an-c-name').focus();
        overlay.querySelector('[data-an-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget;
            const registries = [...overlay.querySelectorAll('#an-c-regs input:checked')].map((i) => i.value);
            const copy = overlay.querySelector('input[name="an-c-start"]:checked').value === 'copy';
            if (!copy && !registries.length) { err(t('main.anErr_DESIGN_REGISTRIES')); return; }
            btn.disabled = true; err('');
            try {
                const body = { name: overlay.querySelector('#an-c-name').value, registries };
                if (copy) body.copyFrom = Number(overlay.querySelector('#an-c-copy').value);
                const res = await fetch(API, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const out = await res.json().catch(() => ({}));
                if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
                location.href = `CmAnalisis.html?id=${out.analysis.id}`; // se abre en su diseño; el menú ya la trae como pantalla nueva
            } catch (e) { btn.disabled = false; err(errorText(e.body)); }
        });
    });
}
function openRename(a) {
    modal(`<h3>${esc(t('main.anRename'))}</h3><label for="an-r-name">${esc(t('main.anName'))}</label><input type="text" id="an-r-name" maxlength="80" value="${esc(a.name)}" autocomplete="off">
        <p class="admin-error" id="an-r-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t('main.anRename'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`, (overlay) => {
        overlay.querySelector('[data-an-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget; btn.disabled = true;
            try {
                const res = await fetch(`${API}/${a.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: overlay.querySelector('#an-r-name').value }) });
                const out = await res.json().catch(() => ({}));
                if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
                location.reload(); // el menú trae el nombre nuevo
            } catch (e) { btn.disabled = false; const el = overlay.querySelector('#an-r-error'); el.textContent = errorText(e.body); el.hidden = false; }
        });
    });
}
async function toggle(a) {
    try {
        const res = await fetch(`${API}/${a.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: a.status === 'active' ? 'inactive' : 'active' }) });
        if (!res.ok) throw new Error('failed');
        location.reload(); // sale del menú (o vuelve a salir)
    } catch (err) { Dashboard.showToast(t('admin.saveError'), 'error'); }
}
})();
