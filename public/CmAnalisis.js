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
const DIMS = ['unidad', 'unidadNombre', 'codigo', 'descripcion', 'categoria', 'udm'];
const KEY_DIMS = ['unidad', 'codigo'];
const AGGS = ['value', 'avg', 'sum', 'min', 'max'];
const MAX_CONSULTED = 40; // el mismo tope que el servidor (manualAnalyses.js)
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
const st = { id: Number(params.get('id')) || 0, analysis: null, registries: [], extractions: [], canCreate: false, canExtract: false, canAnnul: false, design: null, picked: new Set(), dirty: false, sources: [], tab: params.get('tab') || '', extraction: null, data: null, text: '' };
const wrapperOf = (id) => document.querySelector(`[data-table-id="${id}"]`);
const tableOf = (id) => wrapperOf(id)?.querySelector('table.data-table');
const registryByKey = (k) => st.registries.find((r) => r.key === k) || (st.sources || []).find((r) => r.key === k);

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
        document.addEventListener('dashboard:language-changed', () => { renderHead(); });
        // sin Diseño (Daniel, 2026-11-26): el Análisis se ve «En vivo» (con los datos de hoy) o en una de sus versiones guardadas
        const wanted = Number(params.get('v')) || 0;
        st.extraction = st.extractions.find((e) => e.id === wanted) || liveExtraction();
        renderHead();
        showTab(['file', 'versions'].includes(st.tab) ? st.tab : 'file');
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
    try { st.sources = (await window.AnalysisKit.loadSources()).registries || []; } catch { st.sources = []; }
    renderHead();
}
const liveExtraction = () => ({ id: 0, version: 0, live: true, status: 'vigente', createdAt: '', createdBy: '' });
function renderHead() {
    const head = document.getElementById('an-head');
    if (!head || !st.analysis) return;
    const regs = (st.analysis.design.registries || []).map((k) => `<span class="an-chip">${esc(regName(registryByKey(k)) || k)}</span>`).join('');
    const viewOpts = [`<option value="0"${!st.extraction || st.extraction.live ? ' selected' : ''}>${esc(t('main.an2Live'))}</option>`, ...st.extractions.filter((e) => e.status === 'vigente').map((e) => `<option value="${e.id}"${st.extraction && st.extraction.id === e.id ? ' selected' : ''}>v${e.version}</option>`)].join('');
    head.innerHTML = `<h2 class="an-title">${esc(st.analysis.name)}</h2><span class="reg-pill reg-pill-${st.analysis.status === 'active' ? 'ok' : 'off'}">${esc(t(`main.anStatus_${st.analysis.status}`))}</span><span class="an-chips">${regs}</span>
        <select id="an-view" class="an-viewsel" aria-label="${esc(t('main.an2View'))}" title="${esc(t('main.an2View'))}" data-help-key="anView">${viewOpts}</select>${st.canCreate ? `<button type="button" class="admin-icon-btn" data-an-editbase aria-label="${esc(t('main.an2EditBase'))}" title="${esc(t('main.an2EditBase'))}" data-help-key="anBaseCols"><i class="bx bx-cog" aria-hidden="true"></i></button>` : ''}<span class="an-file-info" id="an-file-info"></span>`;
    const sel = head.querySelector('#an-view');
    if (sel) sel.addEventListener('change', () => { location.href = `CmAnalisis.html?id=${st.id}&v=${sel.value}&tab=file`; });
    renderFileInfo();
}
function renderFileInfo() {
    const el = document.getElementById('an-file-info');
    if (!el) return;
    const e = st.extraction;
    if (!e || st.tab !== 'file') { el.textContent = ''; return; }
    if (e.live) { el.textContent = t('main.an2LiveInfo'); return; }
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
    const addedBar = document.getElementById('an-added-bar'); if (addedBar && tab !== 'file') addedBar.hidden = true;
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
    const last = d.consulted.length - 1;
    const order = (i) => (st.canCreate
        ? `<td class="an-order"><button type="button" class="admin-icon-btn an-grip" draggable="true" data-an-drag="${i}" aria-label="${esc(t('main.anDragHandle'))}" title="${esc(t('main.anDragHandle'))}"><i class="bx bx-dots-vertical-rounded" aria-hidden="true"></i><i class="bx bx-dots-vertical-rounded" aria-hidden="true"></i></button>`
          + `<button type="button" class="admin-icon-btn" data-an-move="${i}" data-dir="-1" aria-label="${esc(t('main.anMoveUp'))}" title="${esc(t('main.anMoveUp'))}"${i === 0 ? ' disabled' : ''}><i class="bx bx-chevron-up" aria-hidden="true"></i></button>`
          + `<button type="button" class="admin-icon-btn" data-an-move="${i}" data-dir="1" aria-label="${esc(t('main.anMoveDown'))}" title="${esc(t('main.anMoveDown'))}"${i === last ? ' disabled' : ''}><i class="bx bx-chevron-down" aria-hidden="true"></i></button></td>`
        : '<td></td>');
    // Clasificación (nombre libre + color) y Formato de cada columna consultada
    const classCells = (c, i, disabled) => `<td><div class="an-clsrow"><input type="text" class="an-cls" data-an-cls="${i}" list="an-cls-list" value="${esc(c.cls || '')}" maxlength="40" autocomplete="off" placeholder="${esc(t('main.anColClassNone'))}"${disabled}><button type="button" class="an-sw" data-an-clscolor="${i}" style="background:${c.cls && Number.isInteger(c.color) ? CLASS_COLORS[c.color] : 'transparent'}" aria-label="${esc(t('main.anColClassColor'))}" title="${esc(t('main.anColClassColor'))}"${disabled}></button></div></td>`
        + `<td><select class="an-fmt" data-an-fmt="${i}" aria-label="${esc(t('main.anColFormat'))}"${disabled}>${FORMATS.map((f) => `<option value="${f}"${(c.fmt || 'general') === f ? ' selected' : ''}>${esc(t(`main.anFmt_${f}`))}</option>`).join('')}</select></td>`;
    const rows = d.consulted.map((c, i) => `<tr data-an-row="${i}">${order(i)}<td><input type="text" class="an-label" data-an-label="${i}" value="${esc(c.label)}" maxlength="80"${dis}></td><td>${esc(regName(registryByKey(c.registry)) || c.registry)}</td><td>${esc(t(`main.anAgg_${c.agg}`))}</td><td>${esc(periodsText(c.periods))}</td>${classCells(c, i, dis)}<td>${st.canCreate ? `<button type="button" class="admin-icon-btn" data-an-remove="${i}" aria-label="${esc(t('main.anRemove'))}" title="${esc(t('main.anRemove'))}"><i class="bx bx-trash" aria-hidden="true"></i></button>` : ''}</td></tr>`).join('');
    const list = (key) => (d.filters[key] || []).join(', ');
    host.innerHTML = `<section class="an-block an-block-ref" data-help-key="anRefBlock"><header><b>${esc(t('main.anRefTitle'))}</b></header><div class="an-checks-row">${refs}</div></section>
        <section class="an-block an-block-cons" data-help-key="anConsBlock"><header><b>${esc(t('main.anConsTitle'))}</b></header>
            ${d.consulted.length ? `<div class="wp-imp-table-wrap"><table class="wp-imp-table an-cons-table"><thead><tr><th>${esc(t('main.anColOrder'))}</th><th>${esc(t('main.anColLabel'))}</th><th>${esc(t('main.anColRegistry'))}</th><th>${esc(t('main.anColWhat'))}</th><th>${esc(t('main.anColPeriods'))}</th><th data-help-key="anColClass">${esc(t('main.anColClass'))}</th><th data-help-key="anColFormat">${esc(t('main.anColFormat'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table><datalist id="an-cls-list">${classKnown().map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist></div>` : `<p class="admin-hint">${esc(t('main.anNoColumns'))}</p>`}
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
    return ['AN_NAME_REQUIRED', 'AN_NAME_TAKEN', 'DESIGN_REGISTRIES', 'DESIGN_COLUMN_REGISTRY', 'DESIGN_COLUMN_PERIODS', 'ADDED_NAME', 'ADDED_STEPS', 'ADDED_RULES', 'ADDED_KIND', 'ADDED_TOO_MANY', 'BASE_KEY', 'BASE_MISSING', 'COL_REGISTRY', 'COL_KEY', 'COL_VALUE', 'COL_COND', 'COL_NOT_FOUND', 'AN_NO_COLUMNS', 'AN_EMPTY', 'AN_INACTIVE', 'AN_BUSY', 'AN_FORBIDDEN', 'AN_ERROR'].includes(code) ? t(`main.anErr_${code}`) : t('admin.saveError');
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
        <label for="an-a-cls">${esc(t('main.anColClass'))}</label>
        <div class="an-clsrow" data-help-key="anColClass"><input type="text" id="an-a-cls" maxlength="40" autocomplete="off" list="an-a-cls-list" placeholder="${esc(t('main.anColClassNone'))}"><datalist id="an-a-cls-list">${classKnown().map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>
            <span class="an-swatches" id="an-a-sw" role="group" aria-label="${esc(t('main.anColClassColor'))}">${CLASS_COLORS.map((col, i) => `<button type="button" class="an-sw" data-an-sw="${i}" style="background:${col}" aria-pressed="false" aria-label="${esc(t('main.anColClassColor'))} ${i + 1}"></button>`).join('')}</span></div>
        <label for="an-a-fmt">${esc(t('main.anColFormat'))}</label><select id="an-a-fmt" data-help-key="anColFormat">${FORMATS.map((f) => `<option value="${f}">${esc(t(`main.anFmt_${f}`))}</option>`).join('')}</select>
        <p class="admin-error" id="an-a-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t('main.anAddColumn'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay, close) => {
        const reg = () => registryByKey(overlay.querySelector('#an-a-reg').value);
        const agg = () => overlay.querySelector('#an-a-agg').value;
        const chosen = () => [...overlay.querySelectorAll('#an-a-periods input:checked')].map((i) => i.value);
        let labelTouched = false;
        // «El valor» de varios periodos = una columna por cada periodo (en orden de fecha); el nombre de la casilla es entonces el nombre base y a cada columna se le agrega su periodo
        const many = () => agg() === 'value' && chosen().length > 1;
        const valueName = () => ((reg() && reg().valueName) || t((reg() && reg().valueNameKey) || 'main.regValueColumn'));
        let wasMany = false;
        const syncLabel = () => {
            if (many() !== wasMany) { wasMany = many(); labelTouched = false; }
            // sin periodos marcados (o sin periodos cargados) el nombre vuelve al de lo que mide el registro, no se queda con el de otro registro
            if (!labelTouched) overlay.querySelector('#an-a-label').value = chosen().length ? (many() ? valueName() : defaultLabel(reg(), agg(), chosen())) : valueName();
        };
        const drawPeriods = () => {
            const r = reg();
            const list = (r && r.periods) || [];
            overlay.querySelector('#an-a-periods').innerHTML = list.length ? list.slice().reverse().map((p, i) => `<label class="an-pchip"><input type="checkbox" name="an-a-p" value="${esc(p)}"${i === 0 ? ' checked' : ''}><span>${esc(periodLabel(p))}</span></label>`).join('') : `<span class="admin-hint">${esc(t('main.anNoPeriods'))}</span>`;
            wasMany = false;
            syncLabel();
        };
        overlay.querySelector('#an-a-reg').addEventListener('change', () => { labelTouched = false; drawPeriods(); });
        overlay.querySelector('#an-a-agg').addEventListener('change', syncLabel);
        overlay.querySelector('#an-a-periods').addEventListener('change', syncLabel);
        overlay.querySelector('#an-a-label').addEventListener('input', () => { labelTouched = true; });
        // la clasificación: el nombre libre y su color (si ya hay columnas con ese nombre, toma su color mientras no se elija otro)
        let color = null; let colorTouched = false;
        const clsTyped = () => overlay.querySelector('#an-a-cls').value.trim();
        const drawSwatches = () => overlay.querySelectorAll('[data-an-sw]').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.anSw) === color ? 'true' : 'false'));
        overlay.querySelector('#an-a-cls').addEventListener('input', () => { if (!colorTouched) { color = clsTyped() ? colorOfClass(clsTyped(), null) : null; drawSwatches(); } });
        overlay.querySelector('#an-a-sw').addEventListener('click', (event) => { const b = event.target.closest('[data-an-sw]'); if (!b) return; color = Number(b.dataset.anSw); colorTouched = true; drawSwatches(); });
        drawPeriods();
        overlay.querySelector('[data-an-go]').addEventListener('click', () => {
            const periods = chosen().sort();
            const fail = (text) => { const el = overlay.querySelector('#an-a-error'); el.textContent = text; el.hidden = false; };
            if (!periods.length) return fail(t('main.anErr_DESIGN_COLUMN_PERIODS'));
            const typed = overlay.querySelector('#an-a-label').value.trim();
            const stamp = Date.now().toString(36);
            const added = many()
                ? periods.map((p, k) => ({ id: `c${stamp}${k}`, label: `${typed || valueName()} ${periodsText([p])}`.slice(0, 80), registry: reg().key, agg: 'value', periods: [p] }))
                : [{ id: `c${stamp}`, label: typed || defaultLabel(reg(), agg(), periods), registry: reg().key, agg: agg(), periods }];
            const typedRaw = clsTyped(); const typedClass = classKnown().find((x) => foldCls(x) === foldCls(typedRaw)) || typedRaw; // si ya hay una con ese nombre (sin importar mayúsculas), se usa la que ya existe
            const picked = overlay.querySelector('#an-a-fmt').value;
            if (typedClass) { const pick = Number.isInteger(color) ? color : colorOfClass(typedClass, null); if (colorTouched) paintClass(typedClass, pick); added.forEach((x) => { x.cls = typedClass; x.color = pick; }); }
            if (picked !== 'general') added.forEach((x) => { x.fmt = picked; });
            if (st.design.consulted.length + added.length > MAX_CONSULTED) return fail(t('main.anErr_TOO_MANY', { max: MAX_CONSULTED, total: st.design.consulted.length + added.length }));
            st.design.consulted.push(...added);
            setDirty(); close(); renderDesign();
        });
    });
}
// El orden de las columnas consultadas es el orden en el archivo: se cambia con las flechas o arrastrando el asa de cada renglón (de la posición from a la to).
function moveColumn(from, to, dir) {
    const list = st.design.consulted;
    if (!st.canCreate || from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    setDirty(); renderDesign();
    // con las flechas, el foco sigue a la columna que se movió, para poder seguir moviéndola
    const again = dir ? document.querySelector(`[data-an-move="${to}"][data-dir="${dir}"]:not([disabled])`) || document.querySelector(`[data-an-move="${to}"]:not([disabled])`) : null;
    if (again) again.focus();
}
let dragFrom = -1;
const dropTarget = (event) => { const tr = event.target.closest && event.target.closest('tr[data-an-row]'); return tr && tr.closest('.an-cons-table') ? tr : null; };
const clearDrop = () => document.querySelectorAll('.an-drop-above, .an-drop-below, .an-dragging').forEach((n) => n.classList.remove('an-drop-above', 'an-drop-below', 'an-dragging'));
document.addEventListener('dragstart', (event) => {
    const grip = event.target.closest && event.target.closest('[data-an-drag]');
    if (!grip) return;
    dragFrom = Number(grip.dataset.anDrag);
    const tr = grip.closest('tr');
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(dragFrom)); if (tr && event.dataTransfer.setDragImage) event.dataTransfer.setDragImage(tr, 16, 16); }
    if (tr) tr.classList.add('an-dragging');
});
document.addEventListener('dragover', (event) => {
    if (dragFrom < 0) return;
    const tr = dropTarget(event);
    if (!tr) return;
    event.preventDefault();
    const box = tr.getBoundingClientRect();
    const below = event.clientY > box.top + box.height / 2;
    document.querySelectorAll('.an-drop-above, .an-drop-below').forEach((n) => n.classList.remove('an-drop-above', 'an-drop-below'));
    tr.classList.add(below ? 'an-drop-below' : 'an-drop-above');
});
document.addEventListener('drop', (event) => {
    if (dragFrom < 0) return;
    const tr = dropTarget(event);
    if (!tr) return;
    event.preventDefault();
    const box = tr.getBoundingClientRect();
    const over = Number(tr.dataset.anRow);
    const slot = event.clientY > box.top + box.height / 2 ? over + 1 : over; // lugar entre renglones, antes de sacar el que se arrastra
    const from = dragFrom;
    dragFrom = -1; clearDrop();
    moveColumn(from, from < slot ? slot - 1 : slot, '');
});
document.addEventListener('dragend', () => { dragFrom = -1; clearDrop(); });
document.addEventListener('click', async (event) => {
    const add = event.target.closest('[data-an-add]'); const remove = event.target.closest('[data-an-remove]');
    const save = event.target.closest('[data-an-save]'); const go = event.target.closest('[data-an-extract]'); const move = event.target.closest('[data-an-move]');
    if (add) openAddColumn();
    else if (move) moveColumn(Number(move.dataset.anMove), Number(move.dataset.anMove) + Number(move.dataset.dir), move.dataset.dir);
    else if (event.target.closest('[data-an-clscolor]')) cycleClassColor(event.target.closest('[data-an-clscolor]'));
    else if (remove) { st.design.consulted.splice(Number(remove.dataset.anRemove), 1); setDirty(); renderDesign(); }
    else if (save) {
        save.disabled = true; showError('');
        try { await saveDesign(); renderHead(); renderDesign(); Dashboard.showToast(t('main.anSaved'), 'success'); } catch (err) { save.disabled = false; showError(errorText(err.body)); }
    } else if (go) extract();
});
function refreshAnalysis() {
    const btn = document.querySelector('[data-an-refresh]');
    if (btn) { if (btn.disabled) return; btn.disabled = true; btn.lastChild.textContent = ` ${t('main.anRefreshing')}`; }
    try { sessionStorage.setItem('anRefreshed', String(st.id)); } catch { /* sin memoria del navegador: solo no sale el aviso */ }
    // se abre otra vez el análisis En vivo: el servidor arma todo de nuevo con los datos de hoy (como al guardar una columna agregada)
    const search = `?id=${st.id}&v=0&tab=file`;
    if (location.search === search) location.reload(); else location.href = `CmAnalisis.html${search}`;
}
document.addEventListener('click', (event) => {
    if (event.target.closest('[data-an-refresh]')) { refreshAnalysis(); return; }
    const addCol = event.target.closest('[data-an-addcol]'); const addKind = event.target.closest('[data-an-addkind]'); const editCol = event.target.closest('[data-an-editcol]'); const delCol = event.target.closest('[data-an-delcol]');
    const menu = document.querySelector('.an-addmenu');
    if (menu) menu.hidden = addCol ? !menu.hidden : true; // «＋ Agregar columna» abre o cierra el menú; cualquier otro clic lo cierra
    const editFile = event.target.closest('[data-an-editfile]'); const delFile = event.target.closest('[data-an-delfile]'); const editBase = event.target.closest('[data-an-editbase]');
    if (editBase) window.AnalysisPage.openBase();
    else if (editFile) window.AnalysisPage.openFileColumn(editFile.dataset.anEditfile);
    else if (delFile) window.AnalysisPage.removeFileColumn(delFile.dataset.anDelfile);
    else if (addKind && addKind.dataset.anAddkind === 'file') window.AnalysisPage.openFileColumn(null);
    else if (addKind) { if (addKind.dataset.anAddkind === 'criterion') openCriterionDialog(null); else openAddedDialog(null); }
    else if (editCol) openAddedDialog(editCol.dataset.anEditcol);
    else if (delCol) removeAdded(delCol.dataset.anDelcol);
});
document.addEventListener('change', (event) => {
    const ref = event.target.closest('[data-an-ref]'); const filter = event.target.closest('[data-an-filter]');
    if (ref) { const set = new Set(st.design.reference); if (ref.checked) set.add(ref.dataset.anRef); else set.delete(ref.dataset.anRef); st.design.reference = DIMS.filter((d) => set.has(d)); setDirty(); }
    else if (filter) { readFilters(); setDirty(); }
});
document.addEventListener('input', (event) => {
    const label = event.target.closest('[data-an-label]');
    if (label) { st.design.consulted[Number(label.dataset.anLabel)].label = label.value; setDirty(); return; }
    // la clasificación de una columna consultada: el nombre que quiera la persona; toma el color de las que ya se llaman igual (o el siguiente libre) mientras no haya elegido uno
    const cls = event.target.closest('[data-an-cls]');
    if (cls) {
        const c = st.design.consulted[Number(cls.dataset.anCls)];
        const typed = cls.value.trim();
        if (typed) { c.cls = typed; if (!st.picked.has(c.id)) c.color = colorOfClass(typed, c); } else { delete c.cls; delete c.color; }
        const dot = cls.parentElement.querySelector('[data-an-clscolor]');
        if (dot) dot.style.background = c.cls && Number.isInteger(c.color) ? CLASS_COLORS[c.color] : 'transparent';
        setDirty();
    }
});
document.addEventListener('change', (event) => {
    const fmt = event.target.closest('[data-an-fmt]');
    if (!fmt) return;
    const c = st.design.consulted[Number(fmt.dataset.anFmt)];
    if (fmt.value === 'general') delete c.fmt; else c.fmt = fmt.value;
    setDirty();
});

// ---- columnas agregadas en el Archivo (Daniel, 2026-11-26): se agregan sobre el archivo ya extraído; pieza 1 = «Operación paso a paso» ---------------------------------------------------------
const CLASS_COLORS = ['#3f78ad', '#b23fb8', '#2b8456', '#b57a05', '#4f58c2', '#c4473a'];
const OPS = ['add', 'sub', 'mul', 'div', 'pow', 'min', 'max', 'logbase', 'round', 'sqrt', 'ln', 'log10', 'exp', 'abs'];
const OPS_NO_ARG = new Set(['sqrt', 'ln', 'log10', 'exp', 'abs']);
const OPS_VALUE_ONLY = new Set(['logbase', 'round']);
const foldCls = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
// Clasificación de columnas (Daniel, 2026-11-26): el nombre lo escribe la persona y cada nombre lleva un color; columnas con el mismo nombre comparten color y banda en el Archivo.
const FORMATS = ['general', 'int', 'dec1', 'dec2', 'money'];
const classedList = () => [...((st.design && st.design.consulted) || []), ...((st.design && st.design.columns) || []), ...((st.analysis && st.analysis.design && st.analysis.design.added) || [])];
const classKnown = () => [...new Set(classedList().map((x) => x.cls).filter(Boolean))];
const colorOfClass = (cls, skip) => {
    if (!cls) return null;
    const others = classedList().filter((x) => x !== skip);
    const same = others.find((x) => foldCls(x.cls) === foldCls(cls) && window.AnalysisKit.hasClassColor(x.color)); // el color puede ser de la paleta (número) o uno elegido (#rrggbb)
    if (same) return same.color;
    const used = new Set(others.map((x) => x.color).filter(Number.isInteger));
    for (let i = 0; i < CLASS_COLORS.length; i += 1) if (!used.has(i)) return i;
    return others.length % CLASS_COLORS.length;
};
const paintClass = (cls, color) => { [...(st.design.consulted || []), ...(st.design.columns || [])].forEach((x) => { if (x.cls && foldCls(x.cls) === foldCls(cls)) x.color = color; }); };
const fmtByKind = (v, fmt) => {
    if (v === null || v === undefined) return '';
    const dec = (d) => Number(v).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
    if (fmt === 'int') return dec(0);
    if (fmt === 'dec1') return dec(1);
    if (fmt === 'dec2') return dec(2);
    if (fmt === 'money') return `$${dec(2)}`;
    return num(v);
};
function cycleClassColor(btn) {
    const c = st.design.consulted[Number(btn.dataset.anClscolor)];
    if (!c || !c.cls) { Dashboard.showToast(t('main.anColClassFirst'), 'error'); return; }
    const next = (Number.isInteger(c.color) ? c.color + 1 : 0) % CLASS_COLORS.length;
    paintClass(c.cls, next); st.picked.add(c.id); setDirty(); renderDesign();
}
const columnLetter = (index) => { let n = index + 1; let out = ''; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; };
const fmtCell = (v, decimals) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v; // el resultado de un criterio puede ser un texto
    return decimals === null || decimals === undefined ? num(v) : Number(v).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
const columnTitle = (c) => (c.group === 'reference' ? t(`main.regDim_${c.dim}`) : c.label);

// la franja de arriba del Archivo: «＋ Agregar columna» y las columnas ya agregadas (un clic las edita; ✕ las quita)
function renderAddedBar() {
    const bar = document.getElementById('an-added-bar');
    if (!bar) return;
    const added = (st.analysis && st.analysis.design && st.analysis.design.added) || [];
    if (st.tab !== 'file' || !st.extraction || !st.data) { bar.hidden = true; return; }
    const cols = st.data.columns || [];
    const fileCols = st.analysis.design.columns || [];
    const letterOfKey = (key) => { const i = cols.findIndex((c) => c.key === key); return i < 0 ? '' : columnLetter(i); };
    bar.innerHTML = `${st.canCreate ? `<span class="an-addwrap"><button type="button" class="btn btn-secondary" data-an-addcol aria-haspopup="true" data-help-key="anAddedBar"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anAddColumnFile'))} <i class="bx bx-chevron-down" aria-hidden="true"></i></button><span class="an-addmenu" hidden>${st.extraction && st.extraction.live ? `<button type="button" data-an-addkind="file">${esc(t('main.an2KindFile'))}</button>` : ''}<button type="button" data-an-addkind="op">${esc(t('main.anAddKindOp'))}</button><button type="button" data-an-addkind="criterion">${esc(t('main.anAddKindCriterion'))}</button></span></span>` : ''}`
        + fileCols.map((c) => `<span class="an-addedchip an-filechip"><button type="button" data-an-editfile="${esc(c.id)}" title="${esc(t('main.an2EditFileCol'))}"${st.canCreate && st.extraction.live ? '' : ' disabled'}>⊞ ${esc(c.label)} <small>${esc(letterOfKey(`c_${c.id}`))}</small></button>${st.canCreate && st.extraction.live ? `<button type="button" data-an-delfile="${esc(c.id)}" aria-label="${esc(t('main.an2RemoveFileCol'))}" title="${esc(t('main.an2RemoveFileCol'))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : ''}</span>`).join('')
        + added.map((a) => `<span class="an-addedchip"><button type="button" data-an-editcol="${esc(a.id)}" title="${esc(t('main.anAddedEditTitle'))}"${st.canCreate ? '' : ' disabled'}>${a.kind === 'criterion' ? '?' : 'ƒ'} ${esc(a.name)} <small>${esc(letterOfKey(`a_${a.id}`))}</small></button>${st.canCreate ? `<button type="button" data-an-delcol="${esc(a.id)}" aria-label="${esc(t('main.anAddedRemove'))}" title="${esc(t('main.anAddedRemove'))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : ''}</span>`).join('');
    // «Actualizar» (Daniel, 2026-11-26): vuelve a cargar el análisis En vivo con lo que hay hoy (datos de los registros, fórmulas y columnas agregadas)
    if (st.extraction && st.extraction.live) bar.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-secondary" data-an-refresh data-help-key="anRefresh"><i class="bx bx-refresh" aria-hidden="true"></i> ${esc(t('main.anRefresh'))}</button>`);
    if (st.canExtract && st.analysis.status === 'active') bar.insertAdjacentHTML('beforeend', `<button type="button" class="btn" data-an-extract data-help-key="anExtract"><i class="bx bx-export" aria-hidden="true"></i> ${esc(t('main.anExtract'))}</button>`);
    bar.hidden = false;
}
async function saveAdded(list) {
    const res = await fetch(`${API}/${st.id}/added`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ added: list }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
    st.analysis = out.analysis; st.design = JSON.parse(JSON.stringify(st.analysis.design));
    // el motor de tablas no cambia las columnas de una tabla ya iniciada: se vuelve a abrir el Archivo con las columnas nuevas
    location.href = `CmAnalisis.html?id=${st.id}&v=${st.extraction && !st.extraction.live ? st.extraction.id : 0}&tab=file`;
}
async function removeAdded(id) {
    const added = (st.analysis.design.added || []);
    const col = added.find((a) => a.id === id);
    if (!col) return;
    if (!(await Dashboard.confirm(t('main.anAddedRemoveConfirm', { name: col.name })))) return;
    try { await saveAdded(added.filter((a) => a.id !== id)); } catch (err) { Dashboard.showToast(errorText(err.body), 'error'); }
}
function openAddedDialog(editId) {
    const allCols = (st.data && st.data.columns) || [];
    const added = (st.analysis.design.added || []);
    const editing = editId ? added.find((a) => a.id === editId) : null;
    if (editing && editing.kind === 'criterion') { openCriterionDialog(editId); return; }
    // las columnas que se pueden usar: las consultadas y las agregadas ANTES de esta (cada una con su letra de Excel)
    const editAt = editing ? allCols.findIndex((c) => c.key === `a_${editing.id}`) : allCols.length;
    const pickable = allCols.map((c, i) => ({ key: c.key, title: columnTitle(c), letter: columnLetter(i), group: c.group })).filter((c, i) => c.group !== 'reference' && i < editAt);
    const newLetter = columnLetter(editing ? editAt : allCols.length);
    const toDraftStep = (s) => (s.op === 'start' || s.arg
        ? { op: s.op, kind: s.arg && s.arg.col !== undefined ? 'col' : 'value', col: s.arg && s.arg.col !== undefined ? s.arg.col : '', value: s.arg && s.arg.value !== undefined ? String(s.arg.value) : '' }
        : { op: s.op, kind: 'value', col: '', value: '' });
    const first = pickable[0];
    const draft = editing
        ? { name: editing.name, cls: editing.cls || '', decimals: editing.decimals, steps: editing.steps.map(toDraftStep) }
        : { name: '', cls: '', decimals: 1, steps: [{ op: 'start', kind: 'col', col: first ? first.key : '', value: '' }] };
    let touchedName = !!editing;
    const html = `<h3>${esc(t(editing ? 'main.anAddedEditTitle' : 'main.anAddedTitle'))}</h3>
        <div class="an-f2">
            <div><label for="an-ad-name">${esc(t('main.anColLabel'))}</label><input type="text" id="an-ad-name" maxlength="80" autocomplete="off" value="${esc(draft.name)}"></div>
            <div><label for="an-ad-cls">${esc(t('main.anAddedClass'))}</label><input type="text" id="an-ad-cls" maxlength="40" autocomplete="off" list="an-ad-cls-list" placeholder="${esc(t('main.anAddedClassNone'))}" value="${esc(draft.cls)}"><datalist id="an-ad-cls-list">${[...new Set(added.map((a) => a.cls).filter(Boolean))].map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
            <div><label for="an-ad-dec">${esc(t('main.anAddedFormat'))}</label><select id="an-ad-dec"><option value="">${esc(t('main.anFmtAuto'))}</option>${[0, 1, 2, 3, 4].map((n) => `<option value="${n}">${esc(t('main.anFmtDecimals', { n }))}</option>`).join('')}</select></div>
        </div>
        <p class="reg-field-label">${esc(t('main.anAddedSteps'))}</p>
        <div class="an-steps" id="an-ad-steps"></div>
        <p><button type="button" class="btn btn-secondary" data-an-addstep><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anAddStep'))}</button></p>
        <p class="reg-field-label">${esc(t('main.anFormulaExcel'))}</p>
        <div class="an-formula" id="an-ad-formula">—</div>
        <div id="an-ad-preview"></div>
        <p class="admin-error" id="an-ad-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t(editing ? 'main.anAddedSave' : 'main.anAddedGo'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay, close) => {
        const $ = (sel) => overlay.querySelector(sel);
        $('#an-ad-dec').value = draft.decimals === null || draft.decimals === undefined ? '' : String(draft.decimals);
        const colSelect = (value, field, stepIndex, withValue) => `<select data-st="${stepIndex}" data-f="${field}">${pickable.map((c) => `<option value="${esc(c.key)}"${value === c.key ? ' selected' : ''}>${esc(c.letter)} · ${esc(c.title)}</option>`).join('')}${withValue ? `<option value="__value"${value === '__value' ? ' selected' : ''}>${esc(t('main.anArgValue'))}</option>` : ''}</select>`;
        const drawSteps = () => {
            $('#an-ad-steps').innerHTML = draft.steps.map((s, i) => {
                if (i === 0) {
                    return `<div class="an-step"><b>1</b><span>${esc(t('main.anStepStart'))}</span>${colSelect(s.kind === 'col' ? s.col : '__value', 'pick', 0, true)}${s.kind === 'value' ? `<input type="text" inputmode="decimal" data-st="0" data-f="value" value="${esc(s.value)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anArgValuePh'))}">` : ''}</div>`;
                }
                const opSel = `<select data-st="${i}" data-f="op">${OPS.map((o) => `<option value="${o}"${s.op === o ? ' selected' : ''}>${esc(t(`main.anOp_${o}`))}</option>`).join('')}</select>`;
                let arg = '';
                if (!OPS_NO_ARG.has(s.op)) {
                    const valueOnly = OPS_VALUE_ONLY.has(s.op);
                    arg = `${valueOnly ? '' : colSelect(s.kind === 'col' ? s.col : '__value', 'pick', i, true)}${valueOnly || s.kind === 'value' ? `<input type="text" inputmode="decimal" data-st="${i}" data-f="value" value="${esc(s.value)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anArgValuePh'))}">` : ''}`;
                }
                return `<div class="an-step"><b>${i + 1}</b>${opSel}${arg}<button type="button" class="admin-icon-btn" data-an-delstep="${i}" aria-label="${esc(t('main.anRemoveStep'))}" title="${esc(t('main.anRemoveStep'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>`;
            }).join('');
        };
        const colorFor = (cls) => colorOfClass(cls, editing); // el mismo nombre de clasificación lleva el mismo color en las columnas consultadas y en las agregadas
        const toDef = () => {
            const steps = [];
            for (const s of draft.steps) {
                if (s.op === 'start') {
                    if (s.kind === 'col') { if (!s.col) return null; steps.push({ op: 'start', arg: { col: s.col } }); } else { const n = Number(String(s.value).replace(',', '.')); if (String(s.value).trim() === '' || !Number.isFinite(n)) return null; steps.push({ op: 'start', arg: { value: n } }); }
                } else if (OPS_NO_ARG.has(s.op)) steps.push({ op: s.op });
                else if (s.kind === 'col' && !OPS_VALUE_ONLY.has(s.op)) { if (!s.col) return null; steps.push({ op: s.op, arg: { col: s.col } }); } else { const n = Number(String(s.value).replace(',', '.')); if (String(s.value).trim() === '' || !Number.isFinite(n)) return null; steps.push({ op: s.op, arg: { value: n } }); }
            }
            return { id: editing ? editing.id : undefined, kind: 'op', name: draft.name.trim(), cls: draft.cls.trim(), color: colorFor(draft.cls.trim()), decimals: draft.decimals, steps };
        };
        // la fórmula y los primeros renglones los calcula el servidor (el mismo cálculo de siempre): se pide un momento después del último cambio
        let timer = null; let seq = 0;
        const preview = () => {
            clearTimeout(timer);
            const def = toDef();
            const box = $('#an-ad-preview'); const fx = $('#an-ad-formula');
            if (!def) { fx.textContent = '—'; box.innerHTML = ''; return; }
            timer = setTimeout(async () => {
                const mine = ++seq;
                try {
                    const res = await fetch(`${API}/${st.id}/extractions/${st.extraction.id}/added-preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ def: { ...def, name: def.name || 'x' } }) });
                    const out = await res.json().catch(() => ({}));
                    if (mine !== seq) return;
                    if (!res.ok) { fx.textContent = '—'; box.innerHTML = ''; return; }
                    fx.textContent = out.formula;
                    box.innerHTML = `<div class="wp-imp-table-wrap"><table class="wp-imp-table"><thead><tr><th>${esc(t('main.regDim_codigo'))}</th><th class="col-num">${esc(newLetter)} · ${esc(def.name || t('main.anAddedTitle'))}</th></tr></thead><tbody>${(out.rows || []).map((r) => `<tr><td>${esc(r.label)}</td><td class="col-num">${r.value === null ? '—' : esc(fmtCell(r.value, def.decimals))}</td></tr>`).join('')}</tbody></table></div>`;
                } catch { /* sin vista previa */ }
            }, 250);
        };
        drawSteps(); preview();
        overlay.addEventListener('input', (event) => {
            const el = event.target;
            if (el.id === 'an-ad-name') { draft.name = el.value; touchedName = true; return; }
            if (el.id === 'an-ad-cls') { draft.cls = el.value; return; }
            if (el.dataset && el.dataset.f === 'value') { draft.steps[Number(el.dataset.st)].value = el.value; preview(); }
        });
        overlay.addEventListener('change', (event) => {
            const el = event.target;
            if (el.id === 'an-ad-dec') { draft.decimals = el.value === '' ? null : Number(el.value); return; }
            if (el.id === 'an-ad-cls') { draft.cls = el.value; return; }
            if (!el.dataset || el.dataset.st === undefined) return;
            const s = draft.steps[Number(el.dataset.st)];
            if (el.dataset.f === 'op') { s.op = el.value; if (OPS_VALUE_ONLY.has(s.op)) s.kind = 'value'; }
            if (el.dataset.f === 'pick') { if (el.value === '__value') s.kind = 'value'; else { s.kind = 'col'; s.col = el.value; } }
            drawSteps(); preview();
        });
        overlay.addEventListener('click', (event) => {
            const del = event.target.closest('[data-an-delstep]');
            if (event.target.closest('[data-an-addstep]')) { draft.steps.push({ op: 'add', kind: 'value', col: '', value: '' }); drawSteps(); preview(); return; }
            if (del) { draft.steps.splice(Number(del.dataset.anDelstep), 1); drawSteps(); preview(); }
        });
        $('[data-an-go]').addEventListener('click', async () => {
            const err = (text) => { const el = $('#an-ad-error'); el.textContent = text; el.hidden = !text; };
            const def = toDef();
            if (!draft.name.trim()) return err(t('main.anErr_ADDED_NAME'));
            if (!def) return err(t('main.anErr_ADDED_STEPS'));
            if (!editing && added.length >= 40) return err(t('main.anErr_ADDED_TOO_MANY'));
            const next = editing ? added.map((a) => (a.id === editing.id ? def : a)) : [...added, { ...def, id: `a${Date.now().toString(36)}` }];
            try { await saveAdded(next); } catch (e) { err(errorText(e.body)); }
        });
        if (!touchedName) setTimeout(() => $('#an-ad-name').focus(), 0);
    });
}

// ---- «Criterio» (pieza 2): reglas «si… entonces…», de arriba abajo; gana la primera que se cumple ----------------------------------------------------------------------------------------
const COND_OPS = ['lt', 'lte', 'gt', 'gte', 'between', 'eq', 'neq', 'contains', 'empty', 'notEmpty'];
const NUMERIC_COND_OPS = new Set(['lt', 'lte', 'gt', 'gte', 'between']);
const NO_VALUE_COND_OPS = new Set(['empty', 'notEmpty']);
const RESULT_TYPES = ['text', 'value', 'col', 'empty'];
const numOf = (v) => { const s = String(v === null || v === undefined ? '' : v).trim(); if (s === '') return null; const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : null; };

function openCriterionDialog(editId) {
    const allCols = (st.data && st.data.columns) || [];
    const added = (st.analysis.design.added || []);
    const editing = editId ? added.find((a) => a.id === editId) : null;
    // las columnas que se pueden revisar: todas las del archivo y las agregadas ANTES de esta (cada una con su letra de Excel)
    const editAt = editing ? allCols.findIndex((c) => c.key === `a_${editing.id}`) : allCols.length;
    const pickable = allCols.map((c, i) => ({ key: c.key, title: columnTitle(c), letter: columnLetter(i) })).filter((c, i) => i < editAt);
    const newLetter = columnLetter(editing ? editAt : allCols.length);
    const blankRes = (type) => ({ type, text: '', value: '', col: pickable[0] ? pickable[0].key : '' });
    const fromResult = (r) => {
        if (!r || r.empty) return blankRes('empty');
        if (r.col !== undefined) return { ...blankRes('col'), col: r.col };
        if (r.text !== undefined) return { ...blankRes('text'), text: r.text };
        return { ...blankRes('value'), value: String(r.value) };
    };
    const blankCond = () => ({ col: pickable[0] ? pickable[0].key : '', op: 'gt', value: '', value2: '' });
    const draft = editing
        ? { name: editing.name, cls: editing.cls || '', decimals: editing.decimals, rules: editing.rules.map((r) => ({ conds: r.conds.map((c) => ({ col: c.col, op: c.op, value: c.value === undefined ? '' : String(c.value), value2: c.value2 === undefined ? '' : String(c.value2) })), join: r.join === 'or' ? 'or' : 'and', res: fromResult(r.result) })), otherwise: fromResult(editing.otherwise) }
        : { name: '', cls: '', decimals: null, rules: [{ conds: [blankCond()], join: 'and', res: blankRes('text') }], otherwise: blankRes('empty') };
    const html = `<h3>${esc(t(editing ? 'main.anCriterionEditTitle' : 'main.anCriterionTitle'))}</h3>
        <div class="an-f2">
            <div><label for="an-cr-name">${esc(t('main.anColLabel'))}</label><input type="text" id="an-cr-name" maxlength="80" autocomplete="off" value="${esc(draft.name)}"></div>
            <div><label for="an-cr-cls">${esc(t('main.anAddedClass'))}</label><input type="text" id="an-cr-cls" maxlength="40" autocomplete="off" list="an-cr-cls-list" placeholder="${esc(t('main.anAddedClassNone'))}" value="${esc(draft.cls)}"><datalist id="an-cr-cls-list">${[...new Set(added.map((a) => a.cls).filter(Boolean))].map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
            <div><label for="an-cr-dec">${esc(t('main.anAddedFormat'))}</label><select id="an-cr-dec"><option value="">${esc(t('main.anFmtAuto'))}</option>${[0, 1, 2, 3, 4].map((n) => `<option value="${n}">${esc(t('main.anFmtDecimals', { n }))}</option>`).join('')}</select></div>
        </div>
        <p class="reg-field-label">${esc(t('main.anRules'))}</p>
        <div class="an-rules" id="an-cr-rules"></div>
        <p><button type="button" class="btn btn-secondary" data-an-addrule><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anAddRule'))}</button></p>
        <div class="an-step" id="an-cr-other"></div>
        <p class="reg-field-label">${esc(t('main.anFormulaExcel'))}</p>
        <div class="an-formula" id="an-cr-formula">—</div>
        <div id="an-cr-preview"></div>
        <p class="admin-error" id="an-cr-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t(editing ? 'main.anAddedSave' : 'main.anAddedGo'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay, close) => {
        const $ = (sel) => overlay.querySelector(sel);
        $('#an-cr-dec').value = draft.decimals === null || draft.decimals === undefined ? '' : String(draft.decimals);
        const colSel = (value, attrs) => `<select ${attrs}>${pickable.map((c) => `<option value="${esc(c.key)}"${value === c.key ? ' selected' : ''}>${esc(c.letter)} · ${esc(c.title)}</option>`).join('')}</select>`;
        const resultEditor = (res, scope) => {
            const typeSel = `<select data-cr="${scope}" data-f="rtype">${RESULT_TYPES.map((r) => `<option value="${r}"${res.type === r ? ' selected' : ''}>${esc(t(`main.anRes_${r}`))}</option>`).join('')}</select>`;
            if (res.type === 'text') return `${typeSel}<input type="text" maxlength="80" data-cr="${scope}" data-f="rtext" value="${esc(res.text)}" placeholder="${esc(t('main.anResTextPh'))}" aria-label="${esc(t('main.anRes_text'))}">`;
            if (res.type === 'value') return `${typeSel}<input type="text" inputmode="decimal" data-cr="${scope}" data-f="rvalue" value="${esc(res.value)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anRes_value'))}">`;
            if (res.type === 'col') return `${typeSel}${colSel(res.col, `data-cr="${scope}" data-f="rcol"`)}`;
            return typeSel;
        };
        const draw = () => {
            $('#an-cr-rules').innerHTML = draft.rules.map((rule, i) => {
                const conds = rule.conds.map((c, j) => {
                    const lead = j === 0 ? t('main.anIf') : t(rule.join === 'or' ? 'main.anOrElse' : 'main.anAndAlso');
                    const attrs = (f) => `data-cr="r${i}" data-c="${j}" data-f="${f}"`;
                    let vals = '';
                    if (!NO_VALUE_COND_OPS.has(c.op)) {
                        vals = `<input type="text" ${NUMERIC_COND_OPS.has(c.op) ? 'inputmode="decimal"' : ''} ${attrs('value')} value="${esc(c.value)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anArgValuePh'))}">`;
                        if (c.op === 'between') vals += `<span>${esc(t('main.anBetweenAnd'))}</span><input type="text" inputmode="decimal" ${attrs('value2')} value="${esc(c.value2)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anArgValuePh'))}">`;
                    }
                    return `<div class="an-cond"><span class="an-lead">${esc(lead)}</span>${colSel(c.col, attrs('col'))}<select ${attrs('op')}>${COND_OPS.map((o) => `<option value="${o}"${c.op === o ? ' selected' : ''}>${esc(t(`main.anCond_${o}`))}</option>`).join('')}</select>${vals}${rule.conds.length > 1 ? `<button type="button" class="admin-icon-btn" data-an-delcond="${i}:${j}" aria-label="${esc(t('main.anRemoveCond'))}" title="${esc(t('main.anRemoveCond'))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : ''}</div>`;
                }).join('');
                const join = rule.conds.length > 1 ? `<div class="an-cond"><span class="an-lead">${esc(t('main.anJoinLabel'))}</span><select data-cr="r${i}" data-f="join"><option value="and"${rule.join === 'and' ? ' selected' : ''}>${esc(t('main.anJoinAnd'))}</option><option value="or"${rule.join === 'or' ? ' selected' : ''}>${esc(t('main.anJoinOr'))}</option></select></div>` : '';
                return `<div class="an-rule"><div class="an-rulehead"><b>${esc(t('main.anRuleN', { n: i + 1 }))}</b>${draft.rules.length > 1 ? `<button type="button" class="admin-icon-btn" data-an-delrule="${i}" aria-label="${esc(t('main.anRemoveRule'))}" title="${esc(t('main.anRemoveRule'))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : ''}</div>${conds}${rule.conds.length < 5 ? `<div><button type="button" class="btn btn-secondary" data-an-addcond="${i}"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anAddCond'))}</button></div>` : ''}${join}<div class="an-cond"><span class="an-lead">${esc(t('main.anThen'))}</span>${resultEditor(rule.res, `r${i}`)}</div></div>`;
            }).join('');
            $('#an-cr-other').innerHTML = `<b>·</b><span>${esc(t('main.anNoneMatch'))}</span>${resultEditor(draft.otherwise, 'o')}`;
        };
        const colorFor = (cls) => colorOfClass(cls, editing); // el mismo nombre de clasificación lleva el mismo color en las columnas consultadas y en las agregadas
        const parseResult = (res) => {
            if (res.type === 'empty') return { empty: true };
            if (res.type === 'text') { const tx = res.text.trim(); return tx ? { text: tx } : null; }
            if (res.type === 'value') { const n = numOf(res.value); return n === null ? null : { value: n }; }
            return res.col ? { col: res.col } : null;
        };
        const toDef = () => {
            const rules = [];
            for (const rule of draft.rules) {
                const conds = [];
                for (const c of rule.conds) {
                    if (!c.col) return null;
                    if (NO_VALUE_COND_OPS.has(c.op)) { conds.push({ col: c.col, op: c.op }); continue; }
                    if (c.op === 'between') { const a = numOf(c.value); const b = numOf(c.value2); if (a === null || b === null) return null; conds.push({ col: c.col, op: c.op, value: a, value2: b }); continue; }
                    if (NUMERIC_COND_OPS.has(c.op)) { const n = numOf(c.value); if (n === null) return null; conds.push({ col: c.col, op: c.op, value: n }); continue; }
                    const text = String(c.value).trim();
                    if (!text) return null;
                    conds.push({ col: c.col, op: c.op, value: text });
                }
                const result = parseResult(rule.res);
                if (!result) return null;
                rules.push({ conds, join: rule.join, result });
            }
            const otherwise = draft.otherwise.type === 'empty' ? null : parseResult(draft.otherwise);
            if (draft.otherwise.type !== 'empty' && !otherwise) return null;
            return { id: editing ? editing.id : undefined, kind: 'criterion', name: draft.name.trim(), cls: draft.cls.trim(), color: colorFor(draft.cls.trim()), decimals: draft.decimals, rules, otherwise };
        };
        let timer = null; let seq = 0;
        const preview = () => {
            clearTimeout(timer);
            const def = toDef();
            const box = $('#an-cr-preview'); const fx = $('#an-cr-formula');
            if (!def) { fx.textContent = '—'; box.innerHTML = ''; return; }
            timer = setTimeout(async () => {
                const mine = ++seq;
                try {
                    const res = await fetch(`${API}/${st.id}/extractions/${st.extraction.id}/added-preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ def: { ...def, name: def.name || 'x' } }) });
                    const out = await res.json().catch(() => ({}));
                    if (mine !== seq) return;
                    if (!res.ok) { fx.textContent = '—'; box.innerHTML = ''; return; }
                    fx.textContent = out.formula;
                    box.innerHTML = `<div class="wp-imp-table-wrap"><table class="wp-imp-table"><thead><tr><th>${esc(t('main.regDim_codigo'))}</th><th>${esc(newLetter)} · ${esc(def.name || t('main.anCriterionTitle'))}</th></tr></thead><tbody>${(out.rows || []).map((r) => `<tr><td>${esc(r.label)}</td><td>${r.value === null ? '—' : esc(fmtCell(r.value, def.decimals))}</td></tr>`).join('')}</tbody></table></div>`;
                } catch { /* sin vista previa */ }
            }, 250);
        };
        draw(); preview();
        // el modelo se actualiza con lo que se escribe (sin volver a dibujar, para no perder el cursor); los selectores sí vuelven a dibujar
        const applyField = (el) => {
            if (el.id === 'an-cr-name') { draft.name = el.value; return false; }
            if (el.id === 'an-cr-cls') { draft.cls = el.value; return false; }
            if (el.id === 'an-cr-dec') { draft.decimals = el.value === '' ? null : Number(el.value); return false; }
            const scope = el.dataset && el.dataset.cr;
            if (!scope) return false;
            const f = el.dataset.f;
            if (scope === 'o') {
                const res = draft.otherwise;
                if (f === 'rtype') { draft.otherwise = { ...blankRes(el.value), text: res.text, value: res.value, col: res.col }; draft.otherwise.type = el.value; return true; }
                if (f === 'rtext') res.text = el.value; else if (f === 'rvalue') res.value = el.value; else if (f === 'rcol') res.col = el.value;
                return false;
            }
            const rule = draft.rules[Number(scope.slice(1))];
            if (!rule) return false;
            if (el.dataset.c !== undefined) {
                const c = rule.conds[Number(el.dataset.c)];
                if (f === 'col') c.col = el.value; else if (f === 'op') { c.op = el.value; return true; } else if (f === 'value') c.value = el.value; else if (f === 'value2') c.value2 = el.value;
                return false;
            }
            if (f === 'join') { rule.join = el.value === 'or' ? 'or' : 'and'; return true; }
            if (f === 'rtype') { rule.res = { ...rule.res, type: el.value }; return true; }
            if (f === 'rtext') rule.res.text = el.value; else if (f === 'rvalue') rule.res.value = el.value; else if (f === 'rcol') rule.res.col = el.value;
            return false;
        };
        overlay.addEventListener('input', (event) => { if (event.target.tagName === 'INPUT') { applyField(event.target); preview(); } });
        overlay.addEventListener('change', (event) => { const redraw = applyField(event.target); if (redraw) draw(); preview(); });
        overlay.addEventListener('click', (event) => {
            const addRule = event.target.closest('[data-an-addrule]'); const delRule = event.target.closest('[data-an-delrule]');
            const addCond = event.target.closest('[data-an-addcond]'); const delCond = event.target.closest('[data-an-delcond]');
            if (addRule) { if (draft.rules.length < 20) draft.rules.push({ conds: [blankCond()], join: 'and', res: blankRes('text') }); }
            else if (delRule) draft.rules.splice(Number(delRule.dataset.anDelrule), 1);
            else if (addCond) { const rule = draft.rules[Number(addCond.dataset.anAddcond)]; if (rule && rule.conds.length < 5) rule.conds.push(blankCond()); }
            else if (delCond) { const [i, j] = delCond.dataset.anDelcond.split(':').map(Number); const rule = draft.rules[i]; if (rule && rule.conds.length > 1) rule.conds.splice(j, 1); }
            else return;
            draw(); preview();
        });
        $('[data-an-go]').addEventListener('click', async () => {
            const err = (text) => { const el = $('#an-cr-error'); el.textContent = text; el.hidden = !text; };
            const def = toDef();
            if (!draft.name.trim()) return err(t('main.anErr_ADDED_NAME'));
            if (!def) return err(t('main.anErr_ADDED_RULES'));
            if (!editing && added.length >= 40) return err(t('main.anErr_ADDED_TOO_MANY'));
            const next = editing ? added.map((a) => (a.id === editing.id ? def : a)) : [...added, { ...def, id: `a${Date.now().toString(36)}` }];
            try { await saveAdded(next); } catch (e) { err(errorText(e.body)); }
        });
        setTimeout(() => { if (!draft.name) $('#an-cr-name').focus(); }, 0);
    });
}

// ---- tablas ---------------------------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function stampCell(col, value) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (value) { const span = document.createElement('span'); Dashboard.renderTimeStamp(span, value); td.appendChild(span); } else td.textContent = '—';
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
        if (c.groupTable) th.dataset.groupTable = c.groupTable; // la clasificación de una columna agregada (banda de arriba, con su color)
        if (c.labelKey) { th.dataset.i18n = c.labelKey; th.textContent = t(c.labelKey); } else th.textContent = c.label;
        if (c.title) th.title = c.title; // en una columna «la más reciente»: de qué carga son los números de hoy
        if (c.cls) th.className = c.cls;
        row.appendChild(th);
    });
    return true;
}
// ---- el diseño de cada columna (Daniel, 2026-11-26): el menú ⋮ del encabezado, el mismo de Registros Información (FlexFormat.js). Se guarda en el análisis, vale para todos y para todas sus versiones ----
const ffTimers = new Map();
function saveFileFormat(key, f) {
    clearTimeout(ffTimers.get(key));
    ffTimers.set(key, setTimeout(async () => {
        try {
            const res = await fetch(`${API}/${st.id}/format/column`, { method: window.FlexFormat.hasFormat(f) ? 'PUT' : 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, format: f }) });
            if (!res.ok) throw new Error('save failed');
        } catch (err) { Dashboard.showToast(t('main.fmtSaveError'), 'error'); }
    }, 350));
}
function setupFileFormat(table, cols) {
    const FF = window.FlexFormat;
    if (!FF || !table || !table.tHead) return;
    cols.forEach((c) => { const th = table.querySelector(`thead th[data-col="${colKeyOf(c.key)}"]`); if (th) FF.applyHeader(th, c.ff); });
    if (!st.canCreate) return;
    cols.forEach((c) => {
        const th = table.querySelector(`thead th[data-col="${colKeyOf(c.key)}"]`);
        if (!th || th.querySelector('.reg-fm-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reg-fm-btn';
        btn.textContent = '⋮';
        btn.title = t('main.fmtOpen', { name: c.label });
        btn.setAttribute('aria-label', t('main.fmtOpen', { name: c.label }));
        ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach((ev) => btn.addEventListener(ev, (event) => event.stopPropagation())); // tocar el ⋮ no ordena ni mueve la columna
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const current = (st.data && st.data.columns.find((x) => x.key === c.key)) || c;
            FF.openMenu({
                anchor: btn,
                title: t('main.fmtTitle', { name: current.label }),
                note: t('main.fmtSaveNoteAn'),
                f: current.ff,
                onChange: (f) => {
                    if (FF.hasFormat(f)) current.ff = { ...f }; else delete current.ff;
                    st.filePlan = fileCellPlan(st.data.columns); // los renglones que se dibujen después ya traen el formato nuevo
                    const idx = st.data.columns.indexOf(current);
                    FF.restyleColumn(table, { key: colKeyOf(current.key), fmt: current.ff, num: !!(st.filePlan[idx] && st.filePlan[idx].numeric) }, lang());
                    saveFileFormat(current.key, f);
                },
            });
        });
        th.appendChild(btn);
    });
}
function ensureEmpty(tableId, span, key) {
    const tbody = tableOf(tableId).tBodies[0];
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr'); const td = document.createElement('td');
    td.className = 'data-table-empty-cell'; td.colSpan = span;
    const inner = document.createElement('div'); inner.className = 'data-table-empty-inner'; inner.textContent = t(key || 'main.emptyStateText');
    td.appendChild(inner); tr.appendChild(td); tbody.appendChild(tr);
}
// Los renglones del Análisis se dibujan por partes (como en Registros Información): cada parte se arma como UN bloque de HTML. Ordenar, filtrar por columna y descargar piden primero el resto (registerPartialTable).
const FIRST_ROWS = 100; // los renglones que se dibujan al entrar
const NEXT_ROWS = 200; // los que se agregan al bajar o con «Mostrar más»
// Cómo se dibuja cada columna (la llave de la celda, su clase, cómo se escribe el valor y su aspecto), calculado una sola vez por carga.
function fileCellPlan(cols) {
    const FF = window.FlexFormat;
    const sample = (st.data && st.data.rows) || [];
    return cols.map((c, i) => {
        const key = esc(colKeyOf(c.key));
        let cls = 'an-ref'; let fmt = (v) => v;
        if (c.group === 'added') { cls = c.kind === 'criterion' ? 'an-added' : 'an-added col-num'; fmt = (v) => (v === null ? '' : fmtCell(v, c.decimals)); }
        else if (c.group !== 'reference') { cls = 'an-cons col-num'; fmt = (v) => (v === null ? '' : window.AnalysisKit.fmtValue(v, c.fmt, c.pat)); }
        const look = c.group === 'consulted' && c.style ? window.AnalysisKit.lookCss(c.style).cell : null; // el aspecto va en cada celda: los renglones que se dibujan después también lo traen
        let style = look && Object.keys(look).length ? ` style="${esc(Object.entries(look).map(([k, v]) => `${k}:${v}`).join(';'))}"` : '';
        // el formato que la persona le dio con el menú ⋮ del encabezado (el mismo de Registros Información): manda sobre lo anterior
        const ff = FF && FF.hasFormat(c.ff) ? c.ff : null;
        let numeric = false;
        for (let r = 0; r < sample.length && r < 200; r += 1) if (typeof sample[r][i] === 'number') { numeric = true; break; }
        if (ff) {
            const base = fmt;
            fmt = (v) => { if (v === null || v === undefined || v === '') return ''; const o = FF.formatValue(v, ff, lang()); return o ? o.text : base(v); };
            const css = FF.cellCss(ff);
            if (css) style = ` style="${esc(`${look && Object.keys(look).length ? `${Object.entries(look).map(([k, v]) => `${k}:${v}`).join(';')};` : ''}${css}`)}"`;
        }
        return { i, key, cls, fmt, style, ff: !!ff, numeric };
    });
}
function fileRowsHtml(from, to) {
    const rows = st.data.rows; const plan = st.filePlan; const html = [];
    for (let r = from; r < to; r += 1) {
        const row = rows[r];
        let tr = '<tr>';
        for (let k = 0; k < plan.length; k += 1) {
            const p = plan[k]; const raw = row[p.i]; const v = p.fmt(raw);
            // el número tal cual (data-v) para poder volver a darle formato sin recargar; con formato, también para ordenar por el número y no por el texto
            const extra = typeof raw === 'number' ? ` data-v="${raw}"${p.ff ? ` data-sort-value="${raw}"` : ''}` : '';
            tr += `<td data-col="${p.key}" class="${p.cls}"${p.style}${extra}>${v === null || v === undefined || v === '' ? '—' : esc(String(v))}</td>`;
        }
        html.push(`${tr}</tr>`);
    }
    return html.join('');
}
function drawFileRows(count) {
    const table = tableOf(FILE_TABLE);
    if (!st.data || !st.filePlan || !table) return 0;
    const to = Math.min(st.data.rows.length, st.drawn + count);
    if (to <= st.drawn) return 0;
    table.tBodies[0].insertAdjacentHTML('beforeend', fileRowsHtml(st.drawn, to));
    const added = to - st.drawn;
    st.drawn = to;
    updateFileNote();
    return added;
}
function drawAllFileRows() { drawFileRows(Infinity); return Promise.resolve(true); }
function watchFileScroll(wrapper) {
    if (!wrapper || wrapper.dataset.anScroll) return;
    wrapper.dataset.anScroll = '1';
    wrapper.addEventListener('scroll', () => {
        if (st.data && st.drawn < st.data.rows.length && wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 800) drawFileRows(NEXT_ROWS);
    }, { passive: true });
}
// El aviso de abajo: «Mostrando X de Y» con los botones para dibujar más mientras falten renglones; si ya están todos los que llegaron pero el análisis tiene más, avisa que son los primeros.
function updateFileNote() {
    const body = st.data;
    const wrapper = wrapperOf(FILE_TABLE);
    let note = document.getElementById('an-truncated');
    const partial = !!body && st.drawn < body.rows.length;
    if (!body || !wrapper || (!partial && !body.truncated)) { if (note) note.remove(); return; }
    if (!note) { note = document.createElement('p'); note.id = 'an-truncated'; note.className = 'admin-hint reg-more'; wrapper.after(note); }
    note.textContent = '';
    const text = document.createElement('span');
    text.textContent = partial ? t('main.regShowing', { shown: num(st.drawn), total: num(body.total) }) : t('main.anTruncated', { shown: body.rows.length, total: num(body.total) });
    note.appendChild(text);
    if (partial) {
        [['main.regShowMore', () => drawFileRows(NEXT_ROWS)], ['main.regShowAll', () => drawAllFileRows()]].forEach(([key, action]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-secondary reg-more-btn';
            btn.textContent = t(key);
            btn.addEventListener('click', action);
            note.appendChild(btn);
        });
    }
}
// Mientras el análisis se arma (el servidor puede tardar unos segundos con reportes grandes) la tabla se ve apagada y dice qué está pasando, en vez de quedarse en blanco.
function setFileBusy(wrapper, on) {
    if (!wrapper) return;
    wrapper.classList.toggle('reg-busy', on);
    let note = document.getElementById('an-loading-note');
    if (!on) { if (note) note.remove(); return; }
    if (!note) {
        note = document.createElement('p');
        note.id = 'an-loading-note'; note.className = 'reg-loading-note'; note.setAttribute('role', 'status');
        wrapper.parentNode.insertBefore(note, wrapper);
    }
    note.innerHTML = '<i class="bx bx-loader-alt bx-spin" aria-hidden="true"></i> ';
    note.append(t('main.anLoading'));
}
async function loadFile() {
    const e = st.extraction;
    const wrapper = wrapperOf(FILE_TABLE);
    if (!e) { buildHeader(FILE_TABLE, [{ col: 'ref_unidad', group: 'main.anGroupRef', labelKey: 'main.regDim_unidad', cls: 'an-ref' }]); ensureEmpty(FILE_TABLE, 1, 'main.anFileNone'); return; }
    setFileBusy(wrapper, true);
    try {
        const qs = st.text ? `?text=${encodeURIComponent(st.text)}` : '';
        const res = await fetch(e.live ? `${API}/${st.id}/live${qs}` : `${API}/${st.id}/extractions/${e.id}/data${qs}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        st.data = await res.json();
        const cols = st.data.columns;
        const columns = [
            ...cols.map((c) => {
                if (c.group === 'reference') return c.label ? { col: colKeyOf(c.key), group: 'main.anGroupRef', label: c.label, cls: c.isKey ? 'an-ref an-ref-key' : 'an-ref' } : { col: colKeyOf(c.key), group: 'main.anGroupRef', labelKey: `main.regDim_${c.dim}`, cls: 'an-ref' };
                if (c.group === 'added') {
                    let groupTable;
                    if (c.cls) { groupTable = `ancls:${foldCls(c.cls).replace(/\s+/g, '-')}`; if (Dashboard.setColumnClassMeta) Dashboard.setColumnClassMeta(groupTable, c.cls, window.AnalysisKit.classColor(c.color)); }
                    return { col: colKeyOf(c.key), group: 'main.anGroupAdded', groupTable, label: `${c.kind === 'criterion' ? '?' : 'ƒ'} ${c.label}`, cls: c.kind === 'criterion' ? 'an-added' : 'an-added col-num' };
                }
                // una columna consultada con clasificación va bajo su propia banda (nombre y color de la persona); sin clasificación, bajo «Consultadas» como siempre
                let consBand;
                if (c.cls) { consBand = `ancls:${foldCls(c.cls).replace(/\s+/g, '-')}`; if (Dashboard.setColumnClassMeta) Dashboard.setColumnClassMeta(consBand, c.cls, window.AnalysisKit.classColor(c.color)); }
                return { col: colKeyOf(c.key), group: 'main.anGroupCons', groupTable: consBand, label: c.label, cls: 'an-cons col-num', title: c.liveTitle ? t('main.an2LiveToday', { label: c.liveTitle }) : '' };
            }),
        ];
        const first = buildHeader(FILE_TABLE, columns);
        const tbody = tableOf(FILE_TABLE).tBodies[0];
        tbody.innerHTML = '';
        st.filePlan = fileCellPlan(cols);
        st.drawn = 0;
        drawFileRows(FIRST_ROWS); // el resto se dibuja por partes: dibujar los 5,000 renglones de golpe tardaba más de 5 segundos en el navegador
        ensureEmpty(FILE_TABLE, columns.length);
        if (first && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper, 1);
        if (first && Dashboard.registerPartialTable) Dashboard.registerPartialTable(FILE_TABLE, { isComplete: () => !st.data || st.drawn >= st.data.rows.length, loadAll: drawAllFileRows });
        watchFileScroll(wrapper);
        // el aspecto de cada columna (negrita, colores, bordes…) se pone después de armar la tabla
        cols.forEach((c) => { if (c.group === 'consulted' && c.style) window.AnalysisKit.applyLook(tableOf(FILE_TABLE), colKeyOf(c.key), c.style); });
        setupFileFormat(tableOf(FILE_TABLE), cols); // el formato de cada encabezado y su menú ⋮ (va después del aspecto de la columna: el ⋮ manda)
        if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(FILE_TABLE);
        wrapper.setAttribute('data-help-key', 'anFile');
        if (Dashboard.attachTableDownloadButton) Dashboard.attachTableDownloadButton(FILE_TABLE, { getTitle: () => `${st.analysis.name}_${e.live ? t('main.an2Live') : `v${e.version}`}`, getNotice: () => (st.data && st.data.truncated ? t('main.anDownloadTruncated', { shown: st.data.rows.length, total: num(st.data.total) }) : '') });
        updateFileNote();
        renderAddedBar();
        try { if (sessionStorage.getItem('anRefreshed') === String(st.id)) { sessionStorage.removeItem('anRefreshed'); Dashboard.showToast(t('main.anRefreshDone'), 'success'); } } catch { /* nada */ }
        window.dispatchEvent(new Event('resize'));
    } catch (err) {
        console.error('Análisis: failed to load the file', err);
        Dashboard.showToast(t('main.anLoadError'), 'error');
    } finally {
        setFileBusy(wrapper, false);
    }
}
function drawVersions() {
    const columns = [
        ...['colAnExtVersion', 'colAnExtFechaHora', 'colAnExtPor', 'colAnExtRenglones', 'colAnExtPeriodos', 'colAnExtEstado'].map((c) => ({ col: c, group: 'menu.cmAnalisisRegistros', labelKey: `main.${c}` })),
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
        tr.append(cell('colAnExtVersion', `v${e.version}`), stampCell('colAnExtFechaHora', e.createdAt), cell('colAnExtPor', e.createdBy), cell('colAnExtRenglones', num(e.rowsCount), 'col-num'), cell('colAnExtPeriodos', used), status, actions);
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

// ---- lo que las ventanas «De un archivo» y «Columnas base» (AnArchivoDialog.js) usan de esta pantalla ----
async function saveColumns(columns, extra = {}) {
    const res = await fetch(`${API}/${st.id}/columns`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columns, ...extra }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
    st.analysis = out.analysis; st.design = JSON.parse(JSON.stringify(st.analysis.design));
    location.href = `CmAnalisis.html?id=${st.id}&v=0&tab=file`; // el motor de tablas no cambia las columnas de una tabla ya iniciada: se vuelve a abrir «En vivo» con las columnas nuevas
}
async function removeFileColumn(id) {
    const cols = ((st.analysis.design && st.analysis.design.columns) || []).filter((c) => c.id !== id);
    try { await saveColumns(cols); } catch (err) { Dashboard.showToast(errorText(err.body), 'error'); }
}
window.AnalysisPage = { st, t, esc, modal, regName, registryByKey, colorOfClass, classKnown, CLASS_COLORS, errorText, saveColumns, removeFileColumn, paintClass, kit: window.AnalysisKit };
})();
