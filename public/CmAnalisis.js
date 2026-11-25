// ---------------------------------------------------------------------------
// Cadena de Suministro › Centro de Distribución › Cargas Manuales › [un análisis] (Daniel, 2026-11-25, «Sí, empieza el Análisis»): la pantalla de UN análisis, con tres pestañas:
//   «Diseño» (qué columnas lleva, en tres grupos: referencia, consultadas de registros y —en la siguiente pieza— formuladas), «Archivo» (la versión extraída, en tabla estándar con la referencia primero y luego lo consultado)
//   y «Extracciones» (las versiones: cada «Extraer análisis» saca una COPIA con su fecha que no cambia aunque después cambie un registro; una versión equivocada se anula, no se borra).
// Los botones son del árbol: «Crear análisis» (armar el diseño), «Extraer análisis» y «Anular extracción».
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/manual-analyses';
const FILE_TABLE = 'analisis-archivo';
const VERSIONS_TABLE = 'analisis-extracciones';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const DIMS = ['unidad', 'unidadNombre', 'codigo', 'descripcion', 'categoria', 'udm'];
const KEY_DIMS = ['unidad', 'codigo'];
const AGGS = ['value', 'avg', 'sum', 'min', 'max'];
const t = (key, params) => Dashboard.t(key, params);
const lang = () => (localStorage.getItem('lang') === 'en' ? 'en' : 'es');
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 3 });
const MONTH_ABBR = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] };
function periodLabel(period) {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(period || '');
    if (!m) return String(period || '');
    const abbr = MONTH_ABBR[lang()][Number(m[2]) - 1];
    return m[3] ? `${m[3]}/${abbr}/${m[1]}` : `${abbr}-${m[1].slice(2)}`;
}
const periodsText = (periods) => (periods.length <= 2 ? periods.map(periodLabel).join(', ') : `${periodLabel(periods[0])} – ${periodLabel(periods[periods.length - 1])} (${periods.length})`);
const regName = (r) => (r ? (r.name || t(r.nameKey)) : '');
const colKeyOf = (key) => `an_${key}`;

const params = new URLSearchParams(location.search);
const st = { id: Number(params.get('id')) || 0, analysis: null, registries: [], extractions: [], canCreate: false, canExtract: false, canAnnul: false, design: null, dirty: false, tab: params.get('tab') || '', extraction: null, data: null, text: '' };
const wrapperOf = (id) => document.querySelector(`[data-table-id="${id}"]`);
const tableOf = (id) => wrapperOf(id)?.querySelector('table.data-table');
const registryByKey = (k) => st.registries.find((r) => r.key === k);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        if (!st.id) { location.replace('CmAnalisisLista.html'); return; }
        await load();
        if (!st.analysis) return;
        document.querySelectorAll('[data-an-tab]').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.anTab)));
        const bar = document.getElementById('filter-bar');
        bar?.addEventListener('data-table:filter-apply', () => { st.text = (document.getElementById('filter-search-text')?.value || '').trim(); loadFile(); });
        bar?.addEventListener('data-table:filter-clear', () => { st.text = ''; loadFile(); });
        document.addEventListener('dashboard:language-changed', () => { renderHead(); if (st.tab === 'design') renderDesign(); });
        const last = st.extractions.find((e) => e.status === 'vigente');
        const wanted = Number(params.get('v')) || (last ? last.id : 0);
        st.extraction = st.extractions.find((e) => e.id === wanted) || last || null;
        showTab(['design', 'file', 'versions'].includes(st.tab) ? st.tab : (st.extraction ? 'file' : 'design'));
    } catch (err) {
        console.error('Análisis: failed to initialize', err);
    }
})();

async function load() {
    const res = await fetch(`${API}/${st.id}`, { credentials: 'include' });
    if (res.status === 404) { location.replace('CmAnalisisLista.html'); return; }
    if (!res.ok) throw new Error('load failed');
    const body = await res.json();
    st.analysis = body.analysis; st.registries = body.registries || []; st.extractions = body.extractions || [];
    st.canCreate = !!body.canCreate; st.canExtract = !!body.canExtract; st.canAnnul = !!body.canAnnul;
    st.design = JSON.parse(JSON.stringify(st.analysis.design));
    renderHead();
}
function renderHead() {
    const head = document.getElementById('an-head');
    if (!head || !st.analysis) return;
    const regs = (st.analysis.design.registries || []).map((k) => `<span class="an-chip">${esc(regName(registryByKey(k)) || k)}</span>`).join('');
    head.innerHTML = `<h2 class="an-title">${esc(st.analysis.name)}</h2><span class="reg-pill reg-pill-${st.analysis.status === 'active' ? 'ok' : 'off'}">${esc(t(`main.anStatus_${st.analysis.status}`))}</span><span class="an-chips">${regs}</span><span class="an-file-info" id="an-file-info"></span>`;
    renderFileInfo();
}
function renderFileInfo() {
    const el = document.getElementById('an-file-info');
    if (!el) return;
    const e = st.extraction;
    if (!e || st.tab !== 'file') { el.textContent = ''; return; }
    const used = Object.entries((e.notes && e.notes.periods) || {}).filter(([, list]) => list.length).map(([k, list]) => `${regName(registryByKey(k)) || k}: ${periodsText(list)}`).join(' · ');
    el.textContent = '';
    const when = document.createElement('span');
    Dashboard.renderTimeStamp(when, e.createdAt);
    el.append(document.createTextNode(`v${e.version} · `), when, document.createTextNode(` · ${e.createdBy}${used ? ` · ${used}` : ''}${e.status === 'anulada' ? ` · ${t('main.anStatusExt_anulada')}` : ''}`));
}

// ---- las pestañas ----------------------------------------------------------------------------------------------------------------------------------
function showTab(tab) {
    st.tab = tab;
    document.querySelectorAll('[data-an-tab]').forEach((btn) => { const on = btn.dataset.anTab === tab; btn.classList.toggle('reg-tab-on', on); btn.setAttribute('aria-selected', on ? 'true' : 'false'); });
    const design = document.getElementById('an-design'); const bar = document.getElementById('filter-bar');
    const fileW = wrapperOf(FILE_TABLE); const verW = wrapperOf(VERSIONS_TABLE);
    const fileBar = fileW.previousElementSibling; const verBar = verW.previousElementSibling;
    design.hidden = tab !== 'design';
    if (bar) bar.hidden = tab !== 'file';
    fileW.hidden = tab !== 'file'; verW.hidden = tab !== 'versions';
    if (fileBar && fileBar.classList.contains('data-table-zoom')) fileBar.hidden = tab !== 'file';
    if (verBar && verBar.classList.contains('data-table-zoom')) verBar.hidden = tab !== 'versions';
    const note = document.getElementById('an-truncated'); if (note) note.hidden = tab !== 'file';
    renderFileInfo();
    if (tab === 'design') renderDesign();
    else if (tab === 'file') loadFile();
    else drawVersions();
}

// ---- Diseño -------------------------------------------------------------------------------------------------------------------------------------------
function defaultLabel(reg, agg, periods) {
    const value = ((reg && reg.valueName) || t((reg && reg.valueNameKey) || 'main.regValueColumn'));
    return agg === 'value' ? `${value} ${periodsText(periods)}` : `${t(`main.anAggShort_${agg}`)} ${value} ${periodsText(periods)}`;
}
function renderDesign() {
    const host = document.getElementById('an-design');
    const d = st.design;
    const dis = st.canCreate ? '' : ' disabled';
    const refs = DIMS.map((dim) => `<label class="an-check${KEY_DIMS.includes(dim) ? ' an-check-fixed' : ''}"><input type="checkbox" data-an-ref="${dim}"${d.reference.includes(dim) ? ' checked' : ''}${KEY_DIMS.includes(dim) || !st.canCreate ? ' disabled' : ''}> <span>${esc(t(`main.regDim_${dim}`))}</span>${KEY_DIMS.includes(dim) ? `<small>${esc(t('main.anKey'))}</small>` : ''}</label>`).join('');
    const rows = d.consulted.map((c, i) => `<tr><td><input type="text" class="an-label" data-an-label="${i}" value="${esc(c.label)}" maxlength="80"${dis}></td><td>${esc(regName(registryByKey(c.registry)) || c.registry)}</td><td>${esc(t(`main.anAgg_${c.agg}`))}</td><td>${esc(periodsText(c.periods))}</td><td>${st.canCreate ? `<button type="button" class="admin-icon-btn" data-an-remove="${i}" aria-label="${esc(t('main.anRemove'))}" title="${esc(t('main.anRemove'))}"><i class="bx bx-trash" aria-hidden="true"></i></button>` : ''}</td></tr>`).join('');
    const list = (key) => (d.filters[key] || []).join(', ');
    host.innerHTML = `<section class="an-block an-block-ref" data-help-key="anRefBlock"><header><b>${esc(t('main.anRefTitle'))}</b></header><div class="an-checks-row">${refs}</div></section>
        <section class="an-block an-block-cons" data-help-key="anConsBlock"><header><b>${esc(t('main.anConsTitle'))}</b></header>
            ${d.consulted.length ? `<div class="wp-imp-table-wrap"><table class="wp-imp-table an-cons-table"><thead><tr><th>${esc(t('main.anColLabel'))}</th><th>${esc(t('main.anColRegistry'))}</th><th>${esc(t('main.anColWhat'))}</th><th>${esc(t('main.anColPeriods'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="admin-hint">${esc(t('main.anNoColumns'))}</p>`}
            ${st.canCreate ? `<p><button type="button" class="btn btn-secondary" data-an-add><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anAddColumn'))}</button></p>` : ''}</section>
        <section class="an-block an-block-filters" data-help-key="anFiltersBlock"><header><b>${esc(t('main.anFiltersTitle'))}</b></header><div class="an-filters">
            ${['unidades', 'categorias', 'codigos'].map((k) => `<div class="filter-field"><label for="an-f-${k}">${esc(t(`main.anFilter_${k}`))}</label><input type="text" id="an-f-${k}" data-an-filter="${k}" value="${esc(list(k))}" placeholder="${esc(t('main.anFilterHint'))}"${dis}></div>`).join('')}</div></section>
        <div class="admin-form-actions">${st.canCreate ? `<button type="button" class="btn btn-secondary" data-an-save${st.dirty ? '' : ' disabled'}>${esc(t('main.anSaveDesign'))}</button>` : ''}${st.canExtract ? `<button type="button" class="btn" data-an-extract data-help-key="anExtract"><i class="bx bx-export" aria-hidden="true"></i> ${esc(t('main.anExtract'))}</button>` : ''}</div>
        <p class="admin-error" id="an-d-error" role="alert" hidden></p>`;
}
function setDirty() {
    st.dirty = true;
    const save = document.querySelector('[data-an-save]'); if (save) save.disabled = false;
}
function showError(text) { const el = document.getElementById('an-d-error'); if (el) { el.textContent = text; el.hidden = !text; } }
function errorText(body) {
    const code = body && body.code;
    return ['AN_NAME_REQUIRED', 'AN_NAME_TAKEN', 'DESIGN_REGISTRIES', 'DESIGN_COLUMN_REGISTRY', 'DESIGN_COLUMN_PERIODS', 'AN_NO_COLUMNS', 'AN_EMPTY', 'AN_INACTIVE', 'AN_BUSY', 'AN_FORBIDDEN', 'AN_ERROR'].includes(code) ? t(`main.anErr_${code}`) : t('admin.saveError');
}
function readFilters() {
    document.querySelectorAll('[data-an-filter]').forEach((input) => {
        st.design.filters[input.dataset.anFilter] = input.value.split(',').map((x) => x.trim()).filter(Boolean);
    });
}
async function saveDesign() {
    readFilters();
    const res = await fetch(`${API}/${st.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design: st.design }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
    st.analysis = out.analysis; st.design = JSON.parse(JSON.stringify(out.analysis.design)); st.dirty = false;
}
async function extract() {
    showError('');
    const btn = document.querySelector('[data-an-extract]');
    if (btn) { btn.disabled = true; btn.lastChild.textContent = ` ${t('main.anExtracting')}`; }
    try {
        if (st.canCreate && (st.dirty || document.querySelector('[data-an-filter]'))) await saveDesign();
        const res = await fetch(`${API}/${st.id}/extract`, { method: 'POST', credentials: 'include' });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
        Dashboard.showToast(t('main.anExtractDone', { v: out.extraction.version, n: num(out.extraction.rowsCount) }), 'success');
        location.href = `CmAnalisis.html?id=${st.id}&v=${out.extraction.id}&tab=file`;
    } catch (err) {
        if (btn) { btn.disabled = false; btn.lastChild.textContent = ` ${t('main.anExtract')}`; }
        showError(errorText(err.body));
    }
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
function openAddColumn() {
    const regs = (st.design.registries || []).map(registryByKey).filter(Boolean);
    if (!regs.length) return;
    const html = `<h3>${esc(t('main.anAddColumn'))}</h3>
        <label for="an-a-reg">${esc(t('main.anColRegistry'))}</label><select id="an-a-reg">${regs.map((r) => `<option value="${esc(r.key)}">${esc(regName(r))}</option>`).join('')}</select>
        <label for="an-a-agg">${esc(t('main.anColWhat'))}</label><select id="an-a-agg">${AGGS.map((a) => `<option value="${a}">${esc(t(`main.anAgg_${a}`))}</option>`).join('')}</select>
        <p class="reg-field-label">${esc(t('main.anColPeriods'))}</p><div class="an-periods" id="an-a-periods"></div>
        <label for="an-a-label">${esc(t('main.anColLabel'))}</label><input type="text" id="an-a-label" maxlength="80" autocomplete="off">
        <p class="admin-error" id="an-a-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t('main.anAddColumn'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay, close) => {
        const reg = () => registryByKey(overlay.querySelector('#an-a-reg').value);
        const agg = () => overlay.querySelector('#an-a-agg').value;
        const chosen = () => [...overlay.querySelectorAll('#an-a-periods input:checked')].map((i) => i.value);
        let labelTouched = false;
        const syncLabel = () => { if (!labelTouched && chosen().length) overlay.querySelector('#an-a-label').value = defaultLabel(reg(), agg(), chosen()); };
        const drawPeriods = () => {
            const r = reg();
            const single = agg() === 'value';
            const list = (r && r.periods) || [];
            overlay.querySelector('#an-a-periods').innerHTML = list.length ? list.slice().reverse().map((p, i) => `<label><input type="${single ? 'radio' : 'checkbox'}" name="an-a-p" value="${esc(p)}"${i === 0 ? ' checked' : ''}> <span>${esc(periodLabel(p))}</span></label>`).join('') : `<span class="admin-hint">${esc(t('main.anNoPeriods'))}</span>`;
            syncLabel();
        };
        overlay.querySelector('#an-a-reg').addEventListener('change', () => { labelTouched = false; drawPeriods(); });
        overlay.querySelector('#an-a-agg').addEventListener('change', drawPeriods);
        overlay.querySelector('#an-a-periods').addEventListener('change', syncLabel);
        overlay.querySelector('#an-a-label').addEventListener('input', () => { labelTouched = true; });
        drawPeriods();
        overlay.querySelector('[data-an-go]').addEventListener('click', () => {
            const periods = chosen();
            if (!periods.length) { const el = overlay.querySelector('#an-a-error'); el.textContent = t('main.anErr_DESIGN_COLUMN_PERIODS'); el.hidden = false; return; }
            st.design.consulted.push({ id: `c${Date.now().toString(36)}`, label: overlay.querySelector('#an-a-label').value.trim() || defaultLabel(reg(), agg(), periods), registry: reg().key, agg: agg(), periods });
            setDirty(); close(); renderDesign();
        });
    });
}
document.addEventListener('click', async (event) => {
    const add = event.target.closest('[data-an-add]'); const remove = event.target.closest('[data-an-remove]');
    const save = event.target.closest('[data-an-save]'); const go = event.target.closest('[data-an-extract]');
    if (add) openAddColumn();
    else if (remove) { st.design.consulted.splice(Number(remove.dataset.anRemove), 1); setDirty(); renderDesign(); }
    else if (save) {
        save.disabled = true; showError('');
        try { await saveDesign(); renderHead(); renderDesign(); Dashboard.showToast(t('main.anSaved'), 'success'); } catch (err) { save.disabled = false; showError(errorText(err.body)); }
    } else if (go) extract();
});
document.addEventListener('change', (event) => {
    const ref = event.target.closest('[data-an-ref]'); const filter = event.target.closest('[data-an-filter]');
    if (ref) { const set = new Set(st.design.reference); if (ref.checked) set.add(ref.dataset.anRef); else set.delete(ref.dataset.anRef); st.design.reference = DIMS.filter((d) => set.has(d)); setDirty(); }
    else if (filter) { readFilters(); setDirty(); }
});
document.addEventListener('input', (event) => {
    const label = event.target.closest('[data-an-label]');
    if (label) { st.design.consulted[Number(label.dataset.anLabel)].label = label.value; setDirty(); }
});

// ---- tablas ---------------------------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function buildHeader(tableId, columns) {
    const table = tableOf(tableId);
    if (!table || table.dataset.colInit) return false;
    const row = table.tHead.rows[0] || table.tHead.insertRow();
    row.textContent = '';
    columns.forEach((c) => {
        const th = document.createElement('th');
        th.dataset.col = c.col;
        if (c.group) th.dataset.group = c.group;
        if (c.labelKey) { th.dataset.i18n = c.labelKey; th.textContent = t(c.labelKey); } else th.textContent = c.label;
        if (c.cls) th.className = c.cls;
        row.appendChild(th);
    });
    return true;
}
function ensureEmpty(tableId, span, key) {
    const tbody = tableOf(tableId).tBodies[0];
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr'); const td = document.createElement('td');
    td.className = 'data-table-empty-cell'; td.colSpan = span;
    const inner = document.createElement('div'); inner.className = 'data-table-empty-inner'; inner.textContent = t(key || 'main.emptyStateText');
    td.appendChild(inner); tr.appendChild(td); tbody.appendChild(tr);
}
async function loadFile() {
    const e = st.extraction;
    const wrapper = wrapperOf(FILE_TABLE);
    if (!e) { buildHeader(FILE_TABLE, [{ col: 'colSysEmpresa', group: 'menu.classControlInterno', labelKey: 'main.colSysEmpresa', cls: 'col-system' }]); ensureEmpty(FILE_TABLE, 1, 'main.anFileNone'); return; }
    try {
        const qs = st.text ? `?text=${encodeURIComponent(st.text)}` : '';
        const res = await fetch(`${API}/${st.id}/extractions/${e.id}/data${qs}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        st.data = await res.json();
        const cols = st.data.columns;
        const columns = [
            ...SYSTEM_COLUMN_KEYS.map((k) => ({ col: k, group: 'menu.classControlInterno', labelKey: `main.${k}`, cls: 'col-system' })),
            ...cols.map((c) => (c.group === 'reference' ? { col: colKeyOf(c.key), group: 'main.anGroupRef', labelKey: `main.regDim_${c.dim}`, cls: 'an-ref' } : { col: colKeyOf(c.key), group: 'main.anGroupCons', label: c.label, cls: 'an-cons col-num' })),
        ];
        const first = buildHeader(FILE_TABLE, columns);
        const tbody = tableOf(FILE_TABLE).tBodies[0];
        tbody.innerHTML = '';
        st.data.rows.forEach((row) => {
            const tr = document.createElement('tr');
            tr.append(
                ...SYSTEM_COLUMN_KEYS.map((k) => cell(k, st.data.sys[k], 'col-system')),
                ...cols.map((c, i) => (c.group === 'reference' ? cell(colKeyOf(c.key), row[i], 'an-ref') : cell(colKeyOf(c.key), row[i] === null ? '' : num(row[i]), 'an-cons col-num'))),
            );
            tbody.appendChild(tr);
        });
        ensureEmpty(FILE_TABLE, columns.length);
        if (first && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper, 1);
        if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(FILE_TABLE);
        wrapper.setAttribute('data-help-key', 'anFile');
        if (Dashboard.attachTableDownloadButton) Dashboard.attachTableDownloadButton(FILE_TABLE, { getTitle: () => `${st.analysis.name}_v${e.version}`, getNotice: () => (st.data && st.data.truncated ? t('main.anDownloadTruncated', { shown: st.data.rows.length, total: num(st.data.total) }) : '') });
        let note = document.getElementById('an-truncated');
        if (st.data.truncated) {
            if (!note) { note = document.createElement('p'); note.id = 'an-truncated'; note.className = 'admin-hint'; wrapper.after(note); }
            note.textContent = t('main.anTruncated', { shown: st.data.rows.length, total: num(st.data.total) });
        } else if (note) note.remove();
        window.dispatchEvent(new Event('resize'));
    } catch (err) {
        console.error('Análisis: failed to load the file', err);
        Dashboard.showToast(t('main.anLoadError'), 'error');
    }
}
function drawVersions() {
    const columns = [
        ...SYSTEM_COLUMN_KEYS.map((k) => ({ col: k, group: 'menu.classControlInterno', labelKey: `main.${k}`, cls: 'col-system' })),
        ...['colAnExtVersion', 'colAnExtRenglones', 'colAnExtPeriodos', 'colAnExtEstado'].map((c) => ({ col: c, group: 'menu.cmAnalisisRegistros', labelKey: `main.${c}` })),
        { col: 'actions', labelKey: 'main.colActions' },
    ];
    const first = buildHeader(VERSIONS_TABLE, columns);
    const tbody = tableOf(VERSIONS_TABLE).tBodies[0];
    tbody.innerHTML = '';
    st.extractions.forEach((e) => {
        const tr = document.createElement('tr');
        tr.dataset.recordId = e.id;
        const status = document.createElement('td');
        status.dataset.col = 'colAnExtEstado';
        status.innerHTML = `<span class="reg-pill reg-pill-${e.status === 'vigente' ? 'ok' : 'off'}">${esc(t(`main.anStatusExt_${e.status}`))}</span>${e.annulNote ? ` <small>${esc(e.annulNote)}</small>` : ''}`;
        const actions = document.createElement('td');
        actions.dataset.col = 'actions';
        actions.className = 'admin-table-actions';
        const btn = (icon, key, helpKey, onClick) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'admin-icon-btn'; b.setAttribute('data-help-key', helpKey); b.setAttribute('aria-label', t(key)); b.title = t(key); b.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`; b.addEventListener('click', onClick); return b; };
        actions.appendChild(btn('bx-table', 'main.anVersionView', 'anVersionView', () => { location.href = `CmAnalisis.html?id=${st.id}&v=${e.id}&tab=file`; }));
        actions.appendChild(btn('bx-history', 'main.changeHistoryTitleRecord', 'changeHistory', () => Dashboard.openChangeHistory(VERSIONS_TABLE, e.id)));
        if (st.canAnnul && e.status === 'vigente') actions.appendChild(btn('bx-block', 'main.anAnnul', 'anAnnul', () => openAnnul(e)));
        const used = Object.entries((e.notes && e.notes.periods) || {}).filter(([, list]) => list.length).map(([k, list]) => `${regName(registryByKey(k)) || k}: ${periodsText(list)}`).join(' · ');
        tr.append(...SYSTEM_COLUMN_KEYS.map((k) => cell(k, e[k], 'col-system')), cell('colAnExtVersion', `v${e.version}`), cell('colAnExtRenglones', num(e.rowsCount), 'col-num'), cell('colAnExtPeriodos', used), status, actions);
        tbody.appendChild(tr);
    });
    ensureEmpty(VERSIONS_TABLE, columns.length);
    if (first && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapperOf(VERSIONS_TABLE), 2);
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(VERSIONS_TABLE);
    wrapperOf(VERSIONS_TABLE).setAttribute('data-help-key', 'anVersions');
    if (Dashboard.attachTableDownloadButton) Dashboard.attachTableDownloadButton(VERSIONS_TABLE, { getTitle: () => `${st.analysis.name}_${t('main.anTabVersions')}` });
    window.dispatchEvent(new Event('resize'));
}
function openAnnul(e) {
    modal(`<h3>${esc(t('main.anAnnulTitle', { v: e.version }))}</h3><p class="admin-hint">${esc(t('main.anAnnulHint'))}</p><label for="an-n-note">${esc(t('main.regAnnulNote'))}</label><textarea id="an-n-note" rows="3" maxlength="300"></textarea>
        <p class="admin-error" id="an-n-error" role="alert" hidden></p><div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t('main.anAnnul'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`, (overlay) => {
        overlay.querySelector('[data-an-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget; btn.disabled = true;
            try {
                const res = await fetch(`${API}/${st.id}/extractions/${e.id}/annul`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: overlay.querySelector('#an-n-note').value }) });
                if (!res.ok) throw new Error('annul failed');
                location.href = `CmAnalisis.html?id=${st.id}&tab=versions`;
            } catch { btn.disabled = false; const el = overlay.querySelector('#an-n-error'); el.textContent = t('admin.saveError'); el.hidden = false; }
        });
    });
}
})();
