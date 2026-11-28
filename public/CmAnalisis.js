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
const st = { id: Number(params.get('id')) || 0, analysis: null, registries: [], extractions: [], canCreate: false, canExtract: false, canAnnul: false, design: null, picked: new Set(), dirty: false, sources: [], tab: params.get('tab') || '', extraction: null, data: null, text: '', selMode: false, sel: new Set(), bulkOpen: false, lastPick: -1, entries: [], leaving: false, refreshing: false, view: null, sortSpec: null, cf: null, canComment: false, canTotals: false, numCols: new Set() };
const wrapperOf = (id) => document.querySelector(`[data-table-id="${id}"]`);
// El panel de «Columnas consultadas» y «Columnas agregadas» se puede ocultar con un icono de la barra de la tabla (Daniel, 2026-11-28, «ya solo trabajo en la tabla y me ocupa espacio»): se recuerda por persona. Con el panel oculto,
// «Seleccionar» lo muestra mientras dura la selección.
const PANEL_KEY = 'anColsPanelHidden';
const readPanelHidden = () => { try { return localStorage.getItem(PANEL_KEY) === '1'; } catch { return false; } };
const savePanelHidden = (on) => { try { if (on) localStorage.setItem(PANEL_KEY, '1'); else localStorage.removeItem(PANEL_KEY); } catch { /* sin almacenamiento */ } };
function syncPanelToggle() {
    const btn = document.querySelector('[data-col-action="an-panel"]');
    if (!btn) return;
    const hidden = !!st.panelHidden;
    const label = t(hidden ? 'main.anPanelShow' : 'main.anPanelHide');
    btn.setAttribute('aria-label', label); btn.title = label;
    btn.classList.toggle('active', hidden); btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
}
function ensurePanelToggle() {
    if (st.panelHidden === undefined) st.panelHidden = readPanelHidden(); // lo que la persona dejó la última vez, aunque la barra de la tabla todavía no esté
    const wrapper = wrapperOf(FILE_TABLE);
    const bar = wrapper && wrapper.previousElementSibling;
    if (!bar || !bar.classList.contains('data-table-zoom')) return;
    if (bar.querySelector('[data-col-action="an-panel"]')) { syncPanelToggle(); return; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-zoom-btn';
    btn.dataset.colAction = 'an-panel';
    btn.dataset.helpKey = 'anPanelToggle';
    btn.innerHTML = '<i class="bx bx-collapse-vertical" aria-hidden="true"></i>';
    btn.addEventListener('click', () => { st.panelHidden = !st.panelHidden; savePanelHidden(st.panelHidden); syncPanelToggle(); renderAddedBar(); });
    bar.appendChild(btn);
    if (Dashboard.groupDataTableToolbar) Dashboard.groupDataTableToolbar(bar);
    syncPanelToggle();
}
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
    st.analysis = body.analysis; st.registries = body.registries || []; st.extractions = body.extractions || []; st.dataUpdatedAt = body.dataUpdatedAt || '';
    st.canCreate = !!body.canCreate; st.canExtract = !!body.canExtract; st.canAnnul = !!body.canAnnul; st.canComment = !!body.canComment; st.canTotals = !!body.canTotals;
    st.design = JSON.parse(JSON.stringify(st.analysis.design));
    restoreWork(); // los cambios de columnas que quedaron sin aplicar en esta pestaña
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
    el.classList.toggle('an-file-info-live', !!e.live); // «En vivo»: una sola línea a la derecha del título; una versión lleva más texto y va en su propio renglón
    if (e.live) {
        // «En vivo»: su «Última actualización» (la carga más reciente de los archivos que lee), como en Registros Información; la explicación va en el Modo ayuda (anView)
        el.textContent = '';
        if (!st.dataUpdatedAt) return;
        const label = document.createElement('b');
        label.textContent = `${t('main.regUpdated')} `;
        const when = document.createElement('span');
        Dashboard.renderTimeStamp(when, st.dataUpdatedAt);
        el.append(label, when);
        return;
    }
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
    const toolsRow = document.getElementById('an-tools'); if (toolsRow && tab !== 'file') toolsRow.hidden = true;
    // en la pestaña Archivo los iconos de la tabla van en la misma fila que los botones (ver Admin.css: .an-file-layout)
    const pageContent = document.querySelector('.page-content'); if (pageContent) pageContent.classList.toggle('an-file-layout', tab === 'file');
    if (fileBar && fileBar.classList.contains('data-table-zoom')) fileBar.classList.add('an-file-toolbar');
    ['an-selbar', 'an-editpanel', 'an-pending'].forEach((id) => { const el = document.getElementById(id); if (el && tab !== 'file') el.hidden = true; });
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
async function refreshAnalysis() {
    if (st.refreshing) return;
    st.refreshing = true;
    const busy = (on) => document.querySelectorAll('[data-an-refresh]').forEach((btn) => { btn.disabled = on; const l = btn.querySelector('[data-an-refresh-label]'); if (l) l.textContent = on ? t('main.anRefreshing') : t(btn.closest('#an-pending') ? 'main.anPendGo' : 'main.anRefresh'); });
    busy(true);
    // los cambios de columnas sin aplicar se guardan juntos, una sola vez, y luego se arma todo
    try { if (pendingInfo().total) await commitPending(); } catch (err) { st.refreshing = false; busy(false); Dashboard.showToast(errorText(err.body), 'error'); return; }
    try { sessionStorage.setItem('anRefreshed', String(st.id)); } catch { /* sin memoria del navegador: solo no sale el aviso */ }
    // se abre otra vez el análisis En vivo: el servidor arma todo de nuevo con los datos de hoy (como al guardar una columna agregada)
    const search = `?id=${st.id}&v=0&tab=file`;
    st.leaving = true;
    if (location.search === search) location.reload(); else location.href = `CmAnalisis.html${search}`;
}
document.addEventListener('click', (event) => {
    if (event.target.closest('[data-an-refresh]')) { refreshAnalysis(); return; }
    const cmCell = event.target.closest('td.an-cm');
    if (cmCell && cmCell.closest(`[data-table-id="${FILE_TABLE}"]`)) { openCommentsPanel(cmCell); return; } // un clic en una celda de comentarios abre su lista
    const q = (sel) => event.target.closest(sel);
    if (q('[data-an-selmode],[data-an-pick],[data-an-selall],[data-an-selnone],[data-an-seldone],[data-an-bulkedit],[data-an-bulkclose],[data-an-bulkfmt],[data-an-bulkapply],[data-an-bulkremove],[data-an-undo],[data-an-discard],[data-an-cat],[data-an-filetab],[data-an-catmark],[data-an-catcollapse],[data-an-catexpand]')) {
        const m = document.querySelector('.an-addmenu'); if (m) m.hidden = true;
        if (q('[data-an-selmode]')) { if (st.selMode) endSelection(); else { st.selMode = true; renderAddedBar(); } }
        else if (q('[data-an-pick]')) toggleSel(q('[data-an-pick]').dataset.anPick, event.shiftKey);
        else if (q('[data-an-selall]')) { (st.entries || []).forEach((e) => { if (e.status !== 'removed') st.sel.add(e.key); }); renderAddedBar(); }
        else if (q('[data-an-selnone]')) { st.sel.clear(); st.bulkOpen = false; renderAddedBar(); }
        else if (q('[data-an-seldone]')) endSelection();
        else if (q('[data-an-bulkedit]')) { st.bulkOpen = !st.bulkOpen; renderAddedBar(); }
        else if (q('[data-an-bulkclose]')) { st.bulkOpen = false; renderAddedBar(); }
        else if (q('[data-an-bulkfmt]')) openBulkFormat(q('[data-an-bulkfmt]'));
        else if (q('[data-an-bulkapply]')) applyBulk();
        else if (q('[data-an-bulkremove]')) bulkRemove();
        else if (q('[data-an-undo]')) stageUndo(q('[data-an-undo]').dataset.anUndo);
        else if (q('[data-an-discard]')) discardPending();
        else if (q('[data-an-cat]')) toggleCat(q('[data-an-cat]').dataset.anCat);
        else if (q('[data-an-filetab]')) setFileTab(q('[data-an-filetab]').dataset.anFiletab);
        else if (q('[data-an-catmark]')) markCat(q('[data-an-catmark]').dataset.anCatmark);
        else if (q('[data-an-catcollapse]')) setAllCats(false);
        else if (q('[data-an-catexpand]')) setAllCats(true);
        return;
    }
    const addCol = event.target.closest('[data-an-addcol]'); const addKind = event.target.closest('[data-an-addkind]'); const editCol = event.target.closest('[data-an-editcol]'); const delCol = event.target.closest('[data-an-delcol]');
    const menu = document.querySelector('.an-addmenu');
    if (menu) menu.hidden = addCol ? !menu.hidden : true; // «＋ Agregar columna» abre o cierra el menú; cualquier otro clic lo cierra
    const editFile = event.target.closest('[data-an-editfile]'); const delFile = event.target.closest('[data-an-delfile]'); const editBase = event.target.closest('[data-an-editbase]');
    if (editBase) window.AnalysisPage.openBase();
    else if (editFile) window.AnalysisPage.openFileColumn(editFile.dataset.anEditfile);
    else if (delFile) window.AnalysisPage.removeFileColumn(delFile.dataset.anDelfile);
    else if (addKind && addKind.dataset.anAddkind === 'file') window.AnalysisPage.openFileColumn(null);
    else if (addKind) { if (addKind.dataset.anAddkind === 'criterion') openCriterionDialog(null); else if (addKind.dataset.anAddkind === 'block') openBlockDialog(null); else if (addKind.dataset.anAddkind === 'comment') openCommentColumnDialog(null); else openAddedDialog(null); }
    else if (editCol) openAddedDialog(editCol.dataset.anEditcol);
    else if (delCol) removeAdded(delCol.dataset.anDelcol);
});
document.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches && event.target.matches('td.an-cm') && event.target.closest(`[data-table-id="${FILE_TABLE}"]`)) openCommentsPanel(event.target); });
document.addEventListener('change', (event) => {
    if (event.target.id === 'an-bk-mode') { const input = document.getElementById('an-bk-cls'); if (input) { input.disabled = event.target.value !== 'set'; if (!input.disabled) input.focus(); } return; } // edición en grupo: solo «Poner…» deja escribir la clasificación
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
// Las acciones agrupadas por tipo, como la Biblioteca de funciones de Excel (Daniel, 2026-11-27, «la A»): un título de tipo antes de cada grupo (<optgroup>); la lista es la misma de siempre
const OP_GROUPS = [['basic', ['add', 'sub', 'mul', 'div']], ['pow', ['pow', 'sqrt', 'ln', 'log10', 'logbase', 'exp']], ['round', ['round', 'abs']], ['minmax', ['min', 'max']]];
const groupedOptions = (groups, groupKey, itemKey, selected) => groups.map(([g, list]) => `<optgroup label="${esc(t(`main.${groupKey}_${g}`))}">${list.map((o) => `<option value="${o}"${selected === o ? ' selected' : ''}>${esc(t(`main.${itemKey}_${o}`))}</option>`).join('')}</optgroup>`).join('');
const OPS_NO_ARG = new Set(['sqrt', 'ln', 'log10', 'exp', 'abs']);
const OPS_VALUE_ONLY = new Set(['logbase', 'round']);
const foldCls = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
// Clasificación de columnas (Daniel, 2026-11-26): el nombre lo escribe la persona y cada nombre lleva un color; columnas con el mismo nombre comparten color y banda en el Archivo.
const FORMATS = ['general', 'int', 'dec1', 'dec2', 'money'];
const classedList = () => [...((st.design && st.design.consulted) || []), ...((st.design && st.design.columns) || []), ...((st.design && st.design.added) || [])];
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

// ---- los cambios de columnas esperan al «Actualizar» (Daniel, 2026-11-27) --------------------------------------------------------------------------------------------------------
// Agregar, quitar o cambiar una columna (o las columnas base) ya no vuelve a armar el análisis en cada cambio: queda como «cambio sin aplicar» sobre la copia de trabajo (st.design) y todo se guarda junto, una sola vez, al dar «Actualizar».
// Lo guardado en el análisis es st.analysis.design; la tabla muestra lo último que se armó. Los cambios sin aplicar se recuerdan en esta pestaña (sessionStorage) por si se recarga la página.
// Lo que solo cambia cómo se VE una columna (nombre, clasificación, formato) no espera: se guarda al momento (columns-meta y format/column) y no entra en los cambios sin aplicar.
const canon = (v) => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.keys(val).sort().map((x) => [x, val[x]])) : val));
const sameJson = (a, b) => canon(a) === canon(b);
const workLists = (d) => ({ columns: (d && d.columns) || [], added: (d && d.added) || [], base: (d && d.base) || [], dedupe: (d && d.dedupe) || 'sin' });
const workKey = () => `anWork:${st.id}`;
function pendingInfo() {
    const saved = (st.analysis && st.analysis.design) || {}; const work = st.design || {};
    const out = { removed: new Set(), isnew: new Set(), edited: new Set(), baseChanged: false, total: 0 };
    [['f', 'columns'], ['a', 'added']].forEach(([p, field]) => {
        const before = saved[field] || []; const after = work[field] || [];
        const now = new Map(after.map((x) => [x.id, x]));
        before.forEach((x) => { const y = now.get(x.id); if (!y) out.removed.add(`${p}:${x.id}`); else if (!sameJson(x, y)) out.edited.add(`${p}:${x.id}`); });
        const had = new Set(before.map((x) => x.id));
        after.forEach((x) => { if (!had.has(x.id)) out.isnew.add(`${p}:${x.id}`); });
    });
    out.baseChanged = !sameJson(saved.base || [], work.base || []) || (saved.dedupe || 'sin') !== (work.dedupe || 'sin');
    out.total = out.removed.size + out.isnew.size + out.edited.size + (out.baseChanged ? 1 : 0);
    return out;
}
function persistWork() {
    try { if (pendingInfo().total) sessionStorage.setItem(workKey(), JSON.stringify({ saved: workLists(st.analysis.design), work: workLists(st.design) })); else sessionStorage.removeItem(workKey()); } catch { /* sin memoria del navegador: solo no se recuerdan al recargar */ }
}
function restoreWork() {
    if (!st.canCreate || !st.design) return;
    try {
        const raw = sessionStorage.getItem(workKey()); if (!raw) return;
        const o = JSON.parse(raw);
        if (!sameJson(o.saved, workLists(st.analysis.design))) { sessionStorage.removeItem(workKey()); return; } // el análisis cambió desde entonces: esos cambios ya no aplican
        Object.assign(st.design, o.work);
    } catch { /* nada */ }
}
window.addEventListener('beforeunload', (event) => { if (!st.leaving && st.canCreate && st.analysis && pendingInfo().total) { event.preventDefault(); event.returnValue = ''; } }); // cambios sin aplicar: el navegador pregunta antes de salir
function afterStage() { persistWork(); renderAddedBar(); }
// Las fichas de la franja: primero las columnas de archivo (⊞) y luego las agregadas (ƒ, ?); las quitadas sin aplicar siguen en su lugar (con «deshacer») y las nuevas van al final de su grupo.
function barEntries(live) {
    const saved = st.analysis.design; const work = live ? st.design : st.analysis.design; const p = live ? pendingInfo() : null;
    const out = [];
    [['f', 'columns'], ['a', 'added']].forEach(([kind, field]) => {
        const before = saved[field] || []; const after = work[field] || [];
        const now = new Map(after.map((x) => [x.id, x]));
        before.forEach((x) => { const key = `${kind}:${x.id}`; const y = now.get(x.id); out.push({ kind, id: x.id, key, item: y || x, status: !y ? 'removed' : (p && p.edited.has(key) ? 'edited' : 'saved') }); });
        const had = new Set(before.map((x) => x.id));
        after.forEach((x) => { if (!had.has(x.id)) out.push({ kind, id: x.id, key: `${kind}:${x.id}`, item: x, status: 'new' }); });
    });
    return out;
}
const entryByKey = (key) => (st.entries || []).find((e) => e.key === key);
const entryLabel = (e) => (e.kind === 'f' ? e.item.label : e.item.name);
function stageRemove(keys) {
    const f = new Set(); const a = new Set();
    keys.forEach((k) => { (k[0] === 'f' ? f : a).add(k.slice(2)); });
    st.design.columns = (st.design.columns || []).filter((c) => !f.has(c.id));
    st.design.added = (st.design.added || []).filter((x) => !a.has(x.id));
    afterStage();
}
function stageUndo(key) {
    const field = key[0] === 'f' ? 'columns' : 'added'; const id = key.slice(2);
    const saved = st.analysis.design[field] || []; const idx = saved.findIndex((x) => x.id === id);
    const list = st.design[field] || [];
    if (idx < 0 || list.some((x) => x.id === id)) return;
    let at = 0;
    for (let i = idx - 1; i >= 0; i -= 1) { const j = list.findIndex((x) => x.id === saved[i].id); if (j >= 0) { at = j + 1; break; } } // vuelve a su lugar: después de la anterior que sigue ahí
    list.splice(at, 0, JSON.parse(JSON.stringify(saved[idx])));
    st.design[field] = list;
    afterStage();
}
function discardPending() {
    const saved = JSON.parse(JSON.stringify(workLists(st.analysis.design)));
    Object.assign(st.design, saved);
    st.sel.clear(); st.bulkOpen = false;
    afterStage();
}
// Quitar una columna que usan fórmulas las deja vacías (#REF!): se avisa cuáles (las fórmulas que se quitan junto con ella no cuentan).
async function confirmRemoval(keys) {
    const gone = new Set(keys);
    const keyOf = (k) => (k[0] === 'f' ? `c_${k.slice(2)}` : `a_${k.slice(2)}`);
    const users = new Map();
    (st.design.added || []).forEach((a) => {
        if (gone.has(`a:${a.id}`)) return;
        const json = JSON.stringify(a);
        keys.forEach((k) => { if (json.includes(`"col":"${keyOf(k)}"`)) { if (!users.has(k)) users.set(k, []); users.get(k).push(a.name); } });
    });
    if (!users.size) return true;
    const lines = [...users.entries()].map(([k, names]) => { const e = entryByKey(k); return t('main.anRemoveUsedLine', { name: e ? entryLabel(e) : k, users: names.join(', ') }); });
    return Dashboard.confirm(`${lines.join(' ')} ${t('main.anRemoveUsedConfirm')}`);
}
async function removeFileColumn(id) { const k = `f:${id}`; if (await confirmRemoval([k])) stageRemove([k]); }
async function removeAdded(id) { const k = `a:${id}`; if (await confirmRemoval([k])) stageRemove([k]); }
// El acomodo original de las columnas (layout = { order, hidden, pinned, widths } o null para quitarlo): lo guarda el servidor en el análisis y lo ve quien lo abra.
async function saveOriginalLayout(layout) {
    const res = await fetch(`${API}/${st.id}/layout`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout }) });
    if (!res.ok) throw new Error('layout failed');
    const body = await res.json();
    const saved = body.layout || undefined;
    if (st.analysis.design) st.analysis.design.layout = saved;
    if (st.design) st.design.layout = saved; // la copia de trabajo también (no se pierde al guardar las columnas)
}
async function saveAdded(list) { st.design.added = list; afterStage(); }
async function saveColumns(columns, extra = {}) {
    st.design.columns = columns;
    if (extra.base) st.design.base = extra.base;
    if (extra.dedupe) st.design.dedupe = extra.dedupe;
    // el mismo nombre lleva el mismo color: también en las columnas de Operación y Criterio (antes lo hacía el servidor al guardar; ahora se guardan juntas al Actualizar)
    if (extra.paint && extra.paint.cls) (st.design.added || []).forEach((a) => { if (a.cls && foldCls(a.cls) === foldCls(extra.paint.cls)) a.color = extra.paint.color; });
    afterStage();
}
// «Actualizar»: guarda juntos los cambios sin aplicar (columnas y columnas base, luego las agregadas) y vuelve a abrir el análisis con todo.
async function commitPending() {
    const p = pendingInfo();
    if (!p.total) return;
    const saved = st.analysis.design; const work = st.design;
    const send = async (path, body) => {
        const res = await fetch(`${API}/${st.id}/${path}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
        st.analysis = out.analysis;
    };
    if (p.baseChanged || !sameJson(saved.columns || [], work.columns || [])) await send('columns', { columns: work.columns || [], ...(p.baseChanged ? { base: work.base, dedupe: work.dedupe } : {}) });
    if (!sameJson((st.analysis.design.added) || [], work.added || [])) await send('added', { added: work.added || [] });
    st.design = JSON.parse(JSON.stringify(st.analysis.design));
    persistWork();
}
// Los datos de una columna por su ficha: «f:ID» → c_ID, «a:ID» → a_ID.
const dataKeyOfEntry = (key) => (key[0] === 'f' ? `c_${key.slice(2)}` : `a_${key.slice(2)}`);
// Nombre y clasificación se guardan al momento (no hace falta «Actualizar»): items = [{ kind: 'f' | 'a', id, label?, cls?, color? }]
async function saveMeta(items) {
    const res = await fetch(`${API}/${st.id}/columns-meta`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
    st.analysis = out.analysis;
    items.forEach((it) => { // la copia de trabajo solo toma nombre y clasificación: lo demás que esté sin aplicar se queda como estaba
        const target = (it.kind === 'f' ? st.design.columns : st.design.added || []).find((x) => x.id === it.id);
        if (!target) return;
        if (it.label !== undefined) { if (it.kind === 'f') target.label = it.label; else target.name = it.label; }
        if (it.cls !== undefined) { if (it.cls) { target.cls = it.cls; if (it.color !== undefined) target.color = it.color; } else { delete target.cls; delete target.color; } }
    });
    persistWork();
}
function reloadFile() { st.leaving = true; location.reload(); } // el motor de tablas no cambia el encabezado de una tabla ya iniciada: se vuelve a abrir (los cambios sin aplicar se recuerdan)
// ---- seleccionar varias columnas para editarlas o quitarlas juntas (Daniel, 2026-11-27) ----
function toggleSel(key, range) {
    const list = (st.entries || []).filter((e) => e.status !== 'removed');
    const at = list.findIndex((e) => e.key === key);
    if (range && st.lastPick >= 0 && at >= 0) { for (let i = Math.min(st.lastPick, at); i <= Math.max(st.lastPick, at); i += 1) st.sel.add(list[i].key); } // Mayús + clic: de la última marcada hasta esta
    else if (st.sel.has(key)) st.sel.delete(key); else st.sel.add(key);
    st.lastPick = at;
    renderAddedBar();
}
const selectedKeys = () => [...st.sel].filter((k) => { const e = entryByKey(k); return e && e.status !== 'removed'; });
function endSelection() { st.selMode = false; st.sel.clear(); st.bulkOpen = false; st.lastPick = -1; renderAddedBar(); }
function renderSelBar() {
    const bar = document.getElementById('an-selbar'); const panel = document.getElementById('an-editpanel');
    if (!bar || !panel) return;
    const live = !!(st.extraction && st.extraction.live);
    const on = st.selMode && st.canCreate && live && st.tab === 'file' && st.data;
    const keys = on ? selectedKeys() : [];
    bar.hidden = !on || !keys.length;
    if (!bar.hidden) bar.innerHTML = `<span><b>${esc(t('main.anSelCount', { n: keys.length }))}</b></span><button type="button" class="btn btn-secondary" data-an-selall>${esc(t('main.anSelAll'))}</button><button type="button" class="btn btn-secondary" data-an-selnone>${esc(t('main.anSelNone'))}</button><span class="an-selbar-sp"></span><button type="button" class="btn btn-secondary" data-an-bulkedit><i class="bx bx-edit" aria-hidden="true"></i> ${esc(t('main.anBulkEdit', { n: keys.length }))}</button><button type="button" class="btn btn-secondary an-danger" data-an-bulkremove><i class="bx bx-trash" aria-hidden="true"></i> ${esc(t('main.anBulkRemove', { n: keys.length }))}</button><button type="button" class="btn btn-secondary" data-an-seldone>${esc(t('main.anSelDone'))}</button>`;
    panel.hidden = !(on && st.bulkOpen && keys.length);
    if (panel.hidden) { panel.innerHTML = ''; delete panel.dataset.keys; return; }
    if (panel.dataset.keys === keys.join('|')) return; // el panel se arma una vez por selección: no se borra lo que se está escribiendo
    panel.dataset.keys = keys.join('|');
    const hasFile = keys.some((k) => k[0] === 'f');
    const aggs = ['sum', 'avg', 'min', 'max', 'count', 'first'];
    panel.innerHTML = `<h4>${esc(t('main.anBulkTitle', { n: keys.length }))}</h4>
        <div class="an-f2">
            <div><label for="an-bk-mode">${esc(t('main.anBulkCls'))}</label><div class="an-bk-row"><select id="an-bk-mode"><option value="keep">${esc(t('main.anBulkKeep'))}</option><option value="set">${esc(t('main.anBulkClsSet'))}</option><option value="none">${esc(t('main.anBulkClsNone'))}</option></select><input type="text" id="an-bk-cls" maxlength="40" autocomplete="off" list="an-bk-cls-list" placeholder="${esc(t('main.anBulkClsPh'))}" disabled><datalist id="an-bk-cls-list">${classKnown().map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></div><small class="an-bk-note">${esc(t('main.anBulkNowNote'))}</small></div>
            <div><label>${esc(t('main.anBulkFormat'))}</label><div><button type="button" class="btn btn-secondary" data-an-bulkfmt><i class="bx bx-slider-alt" aria-hidden="true"></i> ${esc(t('main.anBulkFormatBtn'))}</button></div><small class="an-bk-note">${esc(t('main.anBulkFmtNote'))}</small></div>
            ${hasFile ? `<div><label for="an-bk-agg">${esc(t('main.anBulkAgg'))}</label><select id="an-bk-agg"><option value="">${esc(t('main.anBulkKeep'))}</option>${aggs.map((a) => `<option value="${a}">${esc(t(`main.an2Agg_${a}`))}</option>`).join('')}</select><small class="an-bk-note">${esc(t('main.anBulkWaitNote'))}</small></div>` : ''}
        </div>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-bulkapply>${esc(t('main.anBulkApply'))}</button><button type="button" class="btn btn-secondary" data-an-bulkclose>${esc(t('main.regCancel'))}</button></div>`;
}
// El formato (número, celdas, encabezado) de varias columnas a la vez: el mismo cuadro del ⋮; cada cambio se aplica a todas las marcadas (solo lo que se toca, no borra el resto de cada una).
function openBulkFormat(anchor) {
    const keys = selectedKeys().map(dataKeyOfEntry).filter((k) => st.data && st.data.columns.some((c) => c.key === k));
    if (!keys.length || !window.FlexFormat) return;
    const FF = window.FlexFormat; let prev = {};
    FF.openMenu({
        anchor, title: t('main.anBulkFormatTitle', { n: keys.length }), note: t('main.anBulkFormatNote'), f: {},
        onChange: (f) => {
            const patch = {}; const clear = !Object.keys(f).length;
            new Set([...Object.keys(prev), ...Object.keys(f)]).forEach((k) => { if (!sameJson(prev[k], f[k])) patch[k] = f[k]; });
            prev = { ...f };
            keys.forEach((dk) => { const col = st.data.columns.find((c) => c.key === dk); if (col) setColumnFormat(col, clear ? {} : { ...(col.ff || {}), ...patch }, clear ? null : patch); });
            st.filePlan = fileCellPlan(st.data.columns);
            keys.forEach((dk) => { const col = st.data.columns.find((c) => c.key === dk); const idx = st.data.columns.indexOf(col); FF.restyleColumn(tableOf(FILE_TABLE), { key: colKeyOf(dk), fmt: col.ff, num: !!(st.filePlan[idx] && st.filePlan[idx].numeric) }, lang()); });
        },
    });
}
// col.ff = formato nuevo (sin las llaves que se quitaron) y se guarda en el análisis
function setColumnFormat(col, merged, patch) {
    const FF = window.FlexFormat;
    const next = { ...merged };
    if (patch) Object.keys(patch).forEach((k) => { if (patch[k] === undefined || patch[k] === null) delete next[k]; });
    if (FF.hasFormat(next)) col.ff = next; else delete col.ff;
    saveFileFormat(col.key, next);
}
async function applyBulk() {
    const keys = selectedKeys();
    if (!keys.length) return;
    const mode = (document.getElementById('an-bk-mode') || {}).value || 'keep';
    const typed = ((document.getElementById('an-bk-cls') || {}).value || '').trim();
    const agg = (document.getElementById('an-bk-agg') || {}).value || '';
    if (mode === 'set' && !typed) { Dashboard.showToast(t('main.anBulkClsNeed'), 'error'); return; }
    if (mode === 'keep' && !agg) { Dashboard.showToast(t('main.anBulkNothing'), 'info'); return; }
    if (agg) { // cómo juntar los valores cambia los DATOS: espera al «Actualizar»
        (st.design.columns || []).forEach((c) => { if (keys.includes(`f:${c.id}`)) c.agg = agg; });
        afterStage();
    }
    if (mode !== 'keep') { // clasificación: no cambia datos, se guarda al momento
        const items = keys.map((k) => {
            const e = entryByKey(k);
            return { kind: k[0], id: k.slice(2), cls: mode === 'set' ? typed : '', ...(mode === 'set' ? { color: colorOfClass(typed, e && e.item) } : {}) };
        });
        try { await saveMeta(items); } catch (err) { Dashboard.showToast(errorText(err.body), 'error'); return; }
        reloadFile();
        return;
    }
    st.bulkOpen = false; renderAddedBar();
    Dashboard.showToast(t('main.anBulkDone', { n: keys.length }), 'success');
}
// ---- el menú ⋮ de un encabezado: además del formato, nombre, clasificación y de dónde sale (Daniel, 2026-11-27) ----
function buildMetaExtra(col, menu) {
    if (!st.canCreate || !(st.extraction && st.extraction.live) || col.group === 'reference') return null;
    const isFile = col.group === 'consulted'; const kind = isFile ? 'f' : 'a'; const id = String(col.key).slice(2);
    const item = (isFile ? st.design.columns : st.design.added || []).find((x) => x.id === id);
    if (!item) return null;
    const label = isFile ? item.label : item.name;
    const wrap = document.createElement('div'); wrap.className = 'reg-fm-extra';
    let src = '';
    if (isFile) {
        const live = (item.live || []).length ? `⟳ ${t('main.anMetaSourceLive')}` : '';
        src = `<div class="reg-fm-g"><small>${esc(t('main.anMetaSource'))}</small><span class="an-meta-src">${esc(regName(registryByKey(item.registry)) || item.registry)}${live ? ` · ${esc(live)}` : ''}</span><button type="button" class="reg-fm-clear" data-meta="source">${esc(t('main.anMetaSourceBtn'))}</button></div>`;
    }
    wrap.innerHTML = `<div class="reg-fm-g"><small>${esc(t('main.anMetaName'))}</small><input type="text" maxlength="80" autocomplete="off" data-meta="label" value="${esc(label)}"></div>
        <div class="reg-fm-g"><small>${esc(t('main.anMetaCls'))}</small><input type="text" maxlength="40" autocomplete="off" data-meta="cls" list="an-meta-cls-list" placeholder="${esc(t('main.anBulkClsNone'))}" value="${esc(item.cls || '')}"><datalist id="an-meta-cls-list">${classKnown().map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
        <p class="reg-fm-note">${esc(t('main.anMetaNote'))}</p>${src}`;
    let busy = false;
    const commit = async () => {
        if (busy) return;
        const nextLabel = wrap.querySelector('[data-meta="label"]').value.trim(); const nextCls = wrap.querySelector('[data-meta="cls"]').value.trim();
        if (nextLabel === label && nextCls === (item.cls || '')) return;
        if (!nextLabel) { Dashboard.showToast(t('main.anErr_ADDED_NAME'), 'error'); wrap.querySelector('[data-meta="label"]').value = label; return; }
        busy = true;
        const it = { kind, id };
        if (nextLabel !== label) it.label = nextLabel;
        if (nextCls !== (item.cls || '')) { it.cls = nextCls; if (nextCls) it.color = colorOfClass(nextCls, item); }
        try { await saveMeta([it]); reloadFile(); } catch (err) { busy = false; Dashboard.showToast(errorText(err.body), 'error'); }
    };
    wrap.addEventListener('change', (event) => { if (event.target.dataset.meta === 'label' || event.target.dataset.meta === 'cls') commit(); });
    wrap.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.dataset && event.target.dataset.meta) { event.preventDefault(); commit(); } });
    wrap.addEventListener('click', (event) => { if (event.target.closest('[data-meta="source"]')) { menu.close(); window.AnalysisPage.openFileColumn(id); } });
    return wrap;
}
// ---- el apartado «Columnas consultadas» (Daniel, 2026-11-27: «Archivo consultado → Categoría consultada → Columna consultada») y «Columnas agregadas» ----
// Las fichas dejan de ir revueltas con los botones: los botones van en una fila chica y las columnas en dos apartados. Las consultadas se ordenan por el ARCHIVO de donde salen (el registro), luego por su categoría (la Clasificación,
// la misma de la banda del encabezado y de su color; las que no tienen caen en «Sin clasificación») y al final la ficha de cada columna. Los archivos entran abiertos y las categorías cerradas; lo que la persona abre o cierra se
// recuerda en su navegador. Las agregadas (operación, criterio, comentarios) no tienen archivo: van en su propio apartado. Con pocas columnas consultadas se ven sueltas, sin niveles.
const CAT_MIN_CHIPS = 7;
const CAT_NONE = '__none';
const CAT_NONE_COLOR = '#8a7d94';
const catKeyOf = (e) => foldCls(e.item.cls) || CAT_NONE;
const catsStorageKey = () => `anCats:${st.id}`;
const filesStorageKey = () => `anFileTab:${st.id}`;
function loadFlags(key) { try { const o = JSON.parse(localStorage.getItem(key) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
function saveFlags(key, flags) {
    try {
        const on = Object.keys(flags || {}).filter((k) => flags[k]);
        if (on.length) localStorage.setItem(key, JSON.stringify(Object.fromEntries(on.map((k) => [k, true])))); else localStorage.removeItem(key);
    } catch { /* sin memoria del navegador: lo abierto no se recuerda */ }
}
const catOpenFlags = () => { if (!st.catOpen) st.catOpen = loadFlags(catsStorageKey()); return st.catOpen; }; // categorías abiertas
const fileTabKey = () => { if (st.fileTab === undefined) { try { st.fileTab = localStorage.getItem(filesStorageKey()) || ''; } catch { st.fileTab = ''; } } return st.fileTab; }; // el archivo que se ve (su pestaña); de fábrica, el primero
function setFileTab(k) { st.fileTab = k; try { localStorage.setItem(filesStorageKey(), k); } catch { /* sin memoria del navegador */ } renderAddedBar(); }
// las columnas consultadas por archivo y, dentro, por categoría; la llave de una categoría lleva su archivo (la misma clasificación puede estar en dos archivos)
function groupFiles(list) {
    const order = []; const map = new Map();
    list.forEach((e) => {
        const fk = String(e.item.registry || '');
        if (!map.has(fk)) { map.set(fk, { key: fk, name: (window.AnalysisPage && regName(registryByKey(fk))) || fk, list: [], cats: [], catMap: new Map() }); order.push(fk); }
        const f = map.get(fk); f.list.push(e);
        const ck = catKeyOf(e); const full = `${fk}|${ck}`;
        if (!f.catMap.has(ck)) { const g = { k: full, name: ck === CAT_NONE ? '' : String(e.item.cls || '').trim(), none: ck === CAT_NONE, color: CAT_NONE_COLOR, colored: false, list: [] }; f.catMap.set(ck, g); f.cats.push(g); }
        const g = f.catMap.get(ck); g.list.push(e);
        if (!g.none && !g.colored) { g.color = window.AnalysisKit.classColor(e.item.color); g.colored = window.AnalysisKit.hasClassColor(e.item.color); }
    });
    return order.map((k) => map.get(k));
}
const consultedEntries = () => (st.entries || []).filter((e) => e.kind === 'f');
const isNested = () => consultedEntries().length >= CAT_MIN_CHIPS;
const allCats = () => groupFiles(consultedEntries()).flatMap((f) => f.cats);
function toggleCat(k) { const f = catOpenFlags(); f[k] = !f[k]; saveFlags(catsStorageKey(), f); renderAddedBar(); }
function setAllCats(open) {
    const f = catOpenFlags();
    allCats().forEach((g) => { f[g.k] = open; });
    saveFlags(catsStorageKey(), f); renderAddedBar();
}
function markCat(k) { // «Marcar todas» de una categoría (o «Quitar marcas» si ya están todas), también con la categoría contraída
    const g = allCats().find((x) => x.k === k); if (!g) return;
    const list = g.list.filter((e) => e.status !== 'removed');
    const every = list.length && list.every((e) => st.sel.has(e.key));
    list.forEach((e) => { if (every) st.sel.delete(e.key); else st.sel.add(e.key); });
    renderAddedBar();
}
// lo que cambió dentro de algo contraído (nuevas, quitadas, con cambios sin aplicar) se ve en su encabezado
function catBadges(list) {
    const count = (x) => list.filter((e) => e.status === x).length;
    const bit = (n, cls, one, many) => (n ? `<span class="an-catbd ${cls}">${esc(n === 1 ? t(one) : t(many, { n }))}</span>` : '');
    return bit(count('new'), 'is-new', 'main.anCatNew1', 'main.anCatNewN') + bit(count('removed'), 'is-removed', 'main.anCatRemoved1', 'main.anCatRemovedN') + bit(count('edited'), 'is-edited', 'main.anCatEdited1', 'main.anCatEditedN');
}
const colsText = (n) => (n === 1 ? t('main.anCatCount1') : t('main.anCatCountN', { n }));
// Una pestaña por archivo (Daniel eligió la forma C de la maqueta); dentro, sus categorías en una fila y, debajo, las fichas de las categorías abiertas (cada grupo con el punto de su color).
function renderConsultedPanel(list, chip, pick) {
    if (!list.length) return '';
    const open = catOpenFlags();
    const nested = list.length >= CAT_MIN_CHIPS;
    const files = nested ? groupFiles(list) : [];
    const count = nested ? `${colsText(list.length)} · ${esc(files.length === 1 ? t('main.anPanelFile1') : t('main.anPanelFilesN', { n: files.length }))}` : colsText(list.length);
    const head = `<header class="an-panel-h" data-help-key="anColumnas"><b>${esc(t('main.anPanelConsulted'))}</b><small>${count}</small></header>`;
    if (!nested) return `<section class="an-panel">${head}<div class="an-panel-chips">${list.map(chip).join('')}</div></section>`;
    const wanted = fileTabKey();
    const active = files.find((f) => f.key === wanted) || files[0];
    const tabs = `<div class="an-ftabs" role="tablist">${files.map((f) => { const on = f === active; return `<button type="button" class="an-ftab${on ? ' is-on' : ''}" role="tab" aria-selected="${on ? 'true' : 'false'}" data-an-filetab="${esc(f.key)}">${esc(f.name)}<small>${f.list.length}</small>${on ? '' : catBadges(f.list)}</button>`; }).join('')}</div>`;
    const pills = active.cats.map((g) => {
        const isOpen = !!open[g.k]; const selectable = g.list.filter((e) => e.status !== 'removed'); const picked = selectable.filter((e) => st.sel.has(e.key)).length;
        const name = g.none ? t('main.anCatNone') : g.name;
        const pill = `<button type="button" class="an-cpill${isOpen ? ' is-on' : ''}" data-an-cat="${esc(g.k)}" aria-expanded="${isOpen ? 'true' : 'false'}" data-help-key="anCategorias"><i class="an-dot" style="background:${esc(g.color)}" aria-hidden="true"></i>${esc(name)}<small>${g.list.length}${pick && picked ? ` · ${esc(t('main.anCatPicked', { n: picked }))}` : ''}</small>${isOpen ? '' : catBadges(g.list)}</button>`;
        const mark = pick && selectable.length ? `<button type="button" class="btn btn-secondary an-sm" data-an-catmark="${esc(g.k)}">${esc(t(picked === selectable.length ? 'main.anCatUnmark' : 'main.anCatMark'))}</button>` : '';
        return `<span class="an-cpillwrap">${pill}${mark}</span>`;
    }).join('');
    const blocks = active.cats.filter((g) => open[g.k]).map((g) => `<div class="an-copen"><i class="an-dot" style="background:${esc(g.color)}" aria-hidden="true"></i><span class="an-catchips">${g.list.map(chip).join('')}</span></div>`).join('');
    return `<section class="an-panel">${head}${tabs}<div class="an-ftab-body"><div class="an-cpills">${pills}</div>${blocks}</div></section>`;
}
// las columnas agregadas (operación, criterio, comentarios): una sola línea, sin recuadro
function renderAddedPanel(list, chip) {
    if (!list.length) return '';
    return `<section class="an-panel an-panel-inline"><span class="an-panel-h-inline" data-help-key="anColumnas"><b>${esc(t('main.anPanelAdded'))}</b><small>${esc(colsText(list.length))}</small></span><span class="an-catchips">${list.map(chip).join('')}</span></section>`;
}
// la franja de arriba del Archivo: «＋ Agregar columna», «Seleccionar» y las columnas ya agregadas (un clic las edita; ✕ las quita; los cambios esperan al «Actualizar»)
function renderAddedBar() {
    const bar = document.getElementById('an-added-bar'); const tools = document.getElementById('an-tools');
    if (!bar || !tools) return;
    if (st.tab !== 'file' || !st.extraction || !st.data) { bar.hidden = true; tools.hidden = true; renderSelBar(); renderPendingBar(); return; }
    const live = !!(st.extraction && st.extraction.live);
    const editable = st.canCreate && live;
    const cols = st.data.columns || [];
    const letterOfKey = (key) => { const i = cols.findIndex((c) => c.key === key); return i < 0 ? '' : columnLetter(i); };
    const entries = barEntries(live);
    st.entries = entries;
    const pick = !!(st.selMode && editable);
    const pend = editable ? pendingInfo() : null;
    const chip = (e) => {
        const isFile = e.kind === 'f';
        const letter = e.status === 'new' ? '' : letterOfKey(dataKeyOfEntry(e.key));
        const icon = isFile ? '⊞' : (e.item.kind === 'criterion' ? '?' : (e.item.kind === 'comment' ? '✎' : (e.item.kind === 'block' ? 'Σ' : 'ƒ')));
        const picked = pick && st.sel.has(e.key);
        const cls = `an-addedchip${isFile ? ' an-filechip' : ''}${e.status !== 'saved' ? ` an-chip-${e.status}` : ''}${picked ? ' an-chip-picked' : ''}`;
        const attr = pick ? `data-an-pick="${esc(e.key)}"` : (isFile ? `data-an-editfile="${esc(e.id)}"` : `data-an-editcol="${esc(e.id)}"`);
        const title = pick ? t('main.anPickTitle') : t(isFile ? 'main.an2EditFileCol' : 'main.anAddedEditTitle');
        const tag = e.status === 'new' ? `<span class="an-chip-tag">${esc(t('main.anChipNew'))}</span>` : (e.status === 'edited' ? `<span class="an-chip-tag">${esc(t('main.anChipEdited'))}</span>` : '');
        const head = `<button type="button" ${attr} title="${esc(title)}"${editable && e.status !== 'removed' ? '' : ' disabled'}>${pick ? `<span class="an-chip-box" aria-hidden="true">${picked ? '☑' : '☐'}</span>` : ''}${icon} ${esc(entryLabel(e))} <small>${esc(letter)}</small></button>${tag}`;
        let tail = '';
        if (e.status === 'removed') tail = `<button type="button" class="an-chip-undo" data-an-undo="${esc(e.key)}">${esc(t('main.anChipUndo'))}</button>`;
        else if (editable && !pick) tail = `<button type="button" ${isFile ? 'data-an-delfile' : 'data-an-delcol'}="${esc(e.id)}" aria-label="${esc(t(isFile ? 'main.an2RemoveFileCol' : 'main.anAddedRemove'))}" title="${esc(t(isFile ? 'main.an2RemoveFileCol' : 'main.anAddedRemove'))}"><i class="bx bx-x" aria-hidden="true"></i></button>`;
        return `<span class="${cls}">${head}${tail}</span>`;
    };
    const addMenu = st.canCreate ? `<span class="an-addwrap"><button type="button" class="btn btn-secondary an-sm" data-an-addcol aria-haspopup="true" data-help-key="anAddedBar"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anAddColumnFile'))} <i class="bx bx-chevron-down" aria-hidden="true"></i></button><span class="an-addmenu" hidden>${live ? `<button type="button" data-an-addkind="file">${esc(t('main.an2KindFile'))}</button>` : ''}<button type="button" data-an-addkind="op">${esc(t('main.anAddKindOp'))}</button><button type="button" data-an-addkind="criterion">${esc(t('main.anAddKindCriterion'))}</button><button type="button" data-an-addkind="block" data-help-key="anBloque">${esc(t('main.anAddKindBlock'))}</button><button type="button" data-an-addkind="comment" data-help-key="anComentarios">${esc(t('main.anAddKindComment'))}</button></span></span>` : '';
    const selBtn = editable && entries.filter((e) => e.status !== 'removed').length > 1 ? `<button type="button" class="btn btn-secondary an-sm${st.selMode ? ' an-on' : ''}" data-an-selmode aria-pressed="${st.selMode ? 'true' : 'false'}" data-help-key="anSelect"><i class="bx bx-select-multiple" aria-hidden="true"></i> ${esc(t('main.anSelectBtn'))}</button>` : '';
    // los botones en una sola fila chica (Daniel, 2026-11-27): agregar y seleccionar a la izquierda; actualizar y extraer a la derecha
    const nested = isNested();
    const ghost = nested ? `<button type="button" class="btn btn-secondary an-sm an-ghost" data-an-catcollapse>${esc(t('main.anCatCollapseAll'))}</button><button type="button" class="btn btn-secondary an-sm an-ghost" data-an-catexpand>${esc(t('main.anCatExpandAll'))}</button>` : '';
    // «Actualizar» (Daniel, 2026-11-26): vuelve a cargar el análisis En vivo con lo que hay hoy (datos de los registros, fórmulas, columnas agregadas y, desde 2026-11-27, los cambios sin aplicar)
    const refreshBtn = live ? `<button type="button" class="btn btn-secondary an-sm" data-an-refresh data-help-key="anRefresh"><i class="bx bx-refresh" aria-hidden="true"></i> <span data-an-refresh-label>${esc(t('main.anRefresh'))}</span>${pend && pend.total ? ` <span class="an-badge">${pend.total}</span>` : ''}</button>` : '';
    const extractBtn = st.canExtract && st.analysis.status === 'active' ? `<button type="button" class="btn an-sm" data-an-extract data-help-key="anExtract"><i class="bx bx-export" aria-hidden="true"></i> ${esc(t('main.anExtract'))}</button>` : '';
    tools.innerHTML = `${addMenu}${selBtn}${ghost}<span class="an-tools-sp"></span>${refreshBtn}${extractBtn}`;
    bar.innerHTML = `${renderConsultedPanel(entries.filter((e) => e.kind === 'f'), chip, pick)}${renderAddedPanel(entries.filter((e) => e.kind === 'a'), chip)}`;
    tools.hidden = false;
    ensurePanelToggle();
    bar.hidden = !!st.panelHidden && !pick; // oculto con el icono de la barra de la tabla (salvo mientras se selecciona)
    renderSelBar();
    renderPendingBar();
}
function renderPendingBar() {
    const el = document.getElementById('an-pending');
    if (!el) return;
    const on = st.canCreate && st.tab === 'file' && st.data && st.extraction && st.extraction.live;
    const p = on ? pendingInfo() : null;
    el.hidden = !p || !p.total;
    if (el.hidden) { el.innerHTML = ''; return; }
    const bits = [];
    if (p.isnew.size) bits.push(t('main.anPendNew', { n: p.isnew.size }));
    if (p.removed.size) bits.push(t('main.anPendRemoved', { n: p.removed.size }));
    if (p.edited.size) bits.push(t('main.anPendEdited', { n: p.edited.size }));
    if (p.baseChanged) bits.push(t('main.anPendBase'));
    el.innerHTML = `<span><b>${esc(t('main.anPendTitle', { n: p.total }))}</b> ${esc(bits.join(' · '))}. ${esc(t('main.anPendNote'))}</span><span class="an-pending-sp"></span><button type="button" class="btn btn-secondary" data-an-discard>${esc(t('main.anPendDiscard'))}</button><button type="button" class="btn" data-an-refresh data-help-key="anPending"><i class="bx bx-refresh" aria-hidden="true"></i> <span data-an-refresh-label>${esc(t('main.anPendGo'))}</span></button>`;
}
async function bulkRemove() {
    const keys = selectedKeys();
    if (!keys.length) return;
    if (!(await confirmRemoval(keys))) return;
    stageRemove(keys);
    st.sel.clear(); st.bulkOpen = false; renderAddedBar();
    Dashboard.showToast(t('main.anBulkRemoved', { n: keys.length }), 'info');
}
// ---- «Fórmula» en la ventana de Operación (Daniel, 2026-11-27, «la A»): escribir =H*I en vez de armar los pasos. La fórmula se convierte en los MISMOS pasos de siempre (de izquierda a derecha, cada uno con una columna o un número), así que lo guardado,
// la fórmula de Excel que se muestra y el cálculo del servidor no cambian. Las funciones llevan su nombre de Excel en español (el mismo que escribe formulaOfSteps en el servidor). ----
const FX_FUNCS = { ABS: ['abs', 1], RAIZ: ['sqrt', 1], LN: ['ln', 1], LOG10: ['log10', 1], EXP: ['exp', 1], REDONDEAR: ['round', 2], POTENCIA: ['pow', 2], MIN: ['min', 2], MAX: ['max', 2], LOG: ['logbase', 2] };
const FX_NAME_OF = Object.fromEntries(Object.entries(FX_FUNCS).map(([name, [op]]) => [op, name]));
// letters: Map letra de Excel → llave de la columna. Devuelve { steps } (pasos como los guarda el análisis) o { err: [código, dato, número] }.
function parseFormula(text, letters) {
    const src = String(text || '').trim();
    if (src[0] !== '=') return { err: ['START'] };
    const body = src.slice(1);
    if (!body.trim()) return { err: ['EMPTY'] };
    const toks = [];
    const re = /\s*(?:(\d+(?:[.,]\d+)?)|([A-Za-zÑñ]+\d*)|([-+*/^();]))/y;
    let pos = 0;
    while (pos < body.length) {
        if (!body.slice(pos).trim()) break;
        re.lastIndex = pos;
        const m = re.exec(body);
        if (!m) return { err: ['CHAR', body.slice(pos).trim()[0]] };
        toks.push(m[1] !== undefined ? { k: 'num', v: m[1] } : (m[2] !== undefined ? { k: 'id', v: m[2] } : { k: 'op', v: m[3] }));
        pos = re.lastIndex;
    }
    let i = 0;
    const peekIs = (v) => !!toks[i] && toks[i].k === 'op' && toks[i].v === v;
    const fail = (code, x, n) => { throw { code, x, n }; };
    const expr = () => {
        let left = term();
        while (peekIs('+') || peekIs('-')) { const op = toks[i].v === '+' ? 'add' : 'sub'; i += 1; left = { t: 'bin', op, l: left, r: term() }; }
        return left;
    };
    const term = () => {
        let left = power();
        while (peekIs('*') || peekIs('/')) { const op = toks[i].v === '*' ? 'mul' : 'div'; i += 1; left = { t: 'bin', op, l: left, r: power() }; }
        return left;
    };
    const power = () => {
        let left = unary();
        while (peekIs('^')) { i += 1; left = { t: 'bin', op: 'pow', l: left, r: unary() }; }
        return left;
    };
    const unary = () => {
        if (peekIs('-')) { i += 1; const x = unary(); return x.t === 'num' ? { t: 'num', v: -x.v } : { t: 'bin', op: 'mul', l: x, r: { t: 'num', v: -1 } }; }
        if (peekIs('+')) { i += 1; return unary(); }
        return primary();
    };
    const primary = () => {
        const tk = toks[i]; i += 1;
        if (!tk) fail('SYNTAX');
        if (tk.k === 'num') return { t: 'num', v: Number(tk.v.replace(',', '.')) };
        if (tk.k === 'op' && tk.v === '(') { const e = expr(); if (!peekIs(')')) fail('SYNTAX'); i += 1; return e; }
        if (tk.k === 'id') {
            const id = tk.v.toUpperCase();
            if (peekIs('(')) {
                const def = FX_FUNCS[id];
                if (!def) fail('FN', id);
                i += 1;
                if (peekIs(')')) fail('ARGS', id, def[1]);
                const args = [expr()];
                while (peekIs(';')) { i += 1; args.push(expr()); }
                if (!peekIs(')')) fail('SYNTAX');
                i += 1;
                if (args.length !== def[1]) fail('ARGS', id, def[1]);
                return { t: 'fn', op: def[0], name: id, args };
            }
            const m = /^([A-Z]{1,3})(\d*)$/.exec(id);
            if (!m) fail('COL', id);
            if (m[2] && m[2] !== '2') fail('ROW');
            const key = letters.get(m[1]);
            if (!key) fail('COL', m[1]);
            return { t: 'col', key };
        }
        return fail('SYNTAX');
    };
    const atomArg = (n) => (n.t === 'col' ? { col: n.key } : (n.t === 'num' ? { value: n.v } : null));
    const stepsOf = (n) => {
        if (n.t === 'col' || n.t === 'num') return [{ op: 'start', arg: atomArg(n) }];
        if (n.t === 'bin') { const a = atomArg(n.r); if (!a) fail('NOSTEPS'); return [...stepsOf(n.l), { op: n.op, arg: a }]; }
        const base = stepsOf(n.args[0]);
        if (n.args.length === 1) return [...base, { op: n.op }];
        const a = atomArg(n.args[1]);
        if (!a) fail('NOSTEPS');
        if (OPS_VALUE_ONLY.has(n.op) && a.value === undefined) fail('VALUEONLY', n.name);
        return [...base, { op: n.op, arg: a }];
    };
    // la fórmula libre: el mismo árbol en la forma que guarda el servidor (una columna por su llave; el operador ^ es la función POTENCIA)
    const exprOf = (n) => {
        if (n.t === 'col') return { col: n.key };
        if (n.t === 'num') return { value: n.v };
        if (n.t === 'bin') return n.op === 'pow' ? { fn: 'pow', args: [exprOf(n.l), exprOf(n.r)] } : { op: n.op, l: exprOf(n.l), r: exprOf(n.r) };
        return { fn: n.op, args: n.args.map(exprOf) };
    };
    const sizeOf = (n, depth) => (n.col !== undefined || n.value !== undefined ? { nodes: 1, depth } : [n.l, n.r, ...(n.args || [])].filter(Boolean).map((c) => sizeOf(c, depth + 1)).reduce((a, b) => ({ nodes: a.nodes + b.nodes, depth: Math.max(a.depth, b.depth) }), { nodes: 1, depth }));
    try {
        const tree = expr();
        if (i < toks.length) fail('SYNTAX');
        // cabe en pasos (de izquierda a derecha, una columna o un número en cada uno) → pasos, como siempre; si no (=H*(I+J), =H*I+J*K) → fórmula libre
        let steps = null;
        try { steps = stepsOf(tree); } catch (e) { if (!(e && (e.code === 'NOSTEPS' || e.code === 'VALUEONLY'))) throw e; }
        if (steps && steps.length <= 20) return { steps };
        const free = exprOf(tree); const size = sizeOf(free, 0);
        if (size.nodes > 60 || size.depth > 12) fail('TOOBIG');
        return { expr: free };
    } catch (e) {
        if (e && e.code) return { err: [e.code, e.x, e.n] };
        throw e;
    }
}
function openAddedDialog(editId) {
    const allCols = (st.data && st.data.columns) || [];
    const added = (st.design.added || []);
    const editing = editId ? added.find((a) => a.id === editId) : null;
    if (editing && editing.kind === 'criterion') { openCriterionDialog(editId); return; }
    if (editing && editing.kind === 'block') { openBlockDialog(editId); return; }
    if (editing && editing.kind === 'comment') { openCommentColumnDialog(editId); return; }
    // las columnas que se pueden usar: las consultadas y las agregadas ANTES de esta (cada una con su letra de Excel)
    const editAt = editing && allCols.some((c) => c.key === `a_${editing.id}`) ? allCols.findIndex((c) => c.key === `a_${editing.id}`) : allCols.length; // una columna agregada que aún no se arma (cambio sin aplicar) puede usar todas las que ya están
    const pickable = allCols.map((c, i) => ({ key: c.key, title: columnTitle(c), letter: columnLetter(i), group: c.group })).filter((c, i) => c.group !== 'reference' && c.kind !== 'comment' && i < editAt); // una columna de comentarios no entra en una fórmula
    const newLetter = columnLetter(editing ? editAt : allCols.length);
    const toDraftStep = (s) => (s.op === 'start' || s.arg
        ? { op: s.op, kind: s.arg && s.arg.col !== undefined ? 'col' : 'value', col: s.arg && s.arg.col !== undefined ? s.arg.col : '', value: s.arg && s.arg.value !== undefined ? String(s.arg.value) : '' }
        : { op: s.op, kind: 'value', col: '', value: '' });
    const first = pickable[0];
    const draft = editing
        ? { name: editing.name, cls: editing.cls || '', decimals: editing.decimals, steps: editing.steps ? editing.steps.map(toDraftStep) : [], expr: editing.expr || null }
        : { name: '', cls: '', decimals: 1, steps: [{ op: 'start', kind: 'col', col: first ? first.key : '', value: '' }], expr: null }; // expr: la fórmula libre (no cabe en pasos); si hay, manda sobre los pasos
    let touchedName = !!editing;
    const html = `<h3>${esc(t(editing ? 'main.anAddedEditTitle' : 'main.anAddedTitle'))}</h3>
        <div class="an-f2">
            <div><label for="an-ad-name">${esc(t('main.anColLabel'))}</label><input type="text" id="an-ad-name" maxlength="80" autocomplete="off" value="${esc(draft.name)}"></div>
            <div><label for="an-ad-cls">${esc(t('main.anAddedClass'))}</label><input type="text" id="an-ad-cls" maxlength="40" autocomplete="off" list="an-ad-cls-list" placeholder="${esc(t('main.anAddedClassNone'))}" value="${esc(draft.cls)}"><datalist id="an-ad-cls-list">${classKnown().map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
            <div><label for="an-ad-dec">${esc(t('main.anAddedFormat'))}</label><select id="an-ad-dec"><option value="">${esc(t('main.anFmtAuto'))}</option>${[0, 1, 2, 3, 4].map((n) => `<option value="${n}">${esc(t('main.anFmtDecimals', { n }))}</option>`).join('')}</select></div>
        </div>
        <div class="reg-tabs an-ad-tabs" role="tablist" aria-label="${esc(t('main.anAdModeLabel'))}" data-help-key="anFormulaTab">
            <button type="button" class="reg-tab reg-tab-on" role="tab" id="an-ad-tab-steps" data-an-adtab="steps" aria-selected="true" aria-controls="an-ad-pane-steps">${esc(t('main.anAdTabSteps'))}</button>
            <button type="button" class="reg-tab" role="tab" id="an-ad-tab-fx" data-an-adtab="fx" aria-selected="false" aria-controls="an-ad-pane-fx">${esc(t('main.anAdTabFx'))}</button>
        </div>
        <div id="an-ad-pane-steps" role="tabpanel" aria-labelledby="an-ad-tab-steps">
            <p class="reg-field-label">${esc(t('main.anAddedSteps'))}</p>
            <div class="an-steps" id="an-ad-steps"></div>
            <p><button type="button" class="btn btn-secondary" data-an-addstep><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anAddStep'))}</button></p>
        </div>
        <div id="an-ad-pane-fx" role="tabpanel" aria-labelledby="an-ad-tab-fx" hidden>
            <input type="text" id="an-ad-fx" class="an-fx" spellcheck="false" autocomplete="off" placeholder="=H*I" aria-label="${esc(t('main.anAdTabFx'))}" aria-describedby="an-ad-fx-err">
            <p class="an-fx-err" id="an-ad-fx-err" role="status"></p>
            <div class="an-fx-ins">
                <select id="an-ad-fx-col" aria-label="${esc(t('main.anFxInsertCol'))}"><option value="">${esc(t('main.anFxInsertCol'))}</option>${pickable.map((c) => `<option value="${esc(c.letter)}">${esc(c.letter)} · ${esc(c.title)}</option>`).join('')}</select>
                <select id="an-ad-fx-fn" aria-label="${esc(t('main.anFxInsertFn'))}"><option value="">${esc(t('main.anFxInsertFn'))}</option>${OP_GROUPS.map(([g, list]) => { const fns = list.filter((o) => FX_NAME_OF[o]); return fns.length ? `<optgroup label="${esc(t(`main.anOpGroup_${g}`))}">${fns.map((o) => `<option value="${FX_NAME_OF[o]}">${FX_NAME_OF[o]} · ${esc(t(`main.anOp_${o}`))}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>
            </div>
        </div>
        <p class="reg-field-label">${esc(t('main.anFormulaExcel'))}</p>
        <div class="an-formula" id="an-ad-formula">—</div>
        <div id="an-ad-preview"></div>
        <p class="admin-error" id="an-ad-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t(editing ? 'main.anAddedSave' : 'main.anAddedGo'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay, close) => {
        const $ = (sel) => overlay.querySelector(sel);
        $('#an-ad-dec').value = draft.decimals === null || draft.decimals === undefined ? '' : String(draft.decimals);
        let mode = 'steps'; let fxError = ''; // «Paso a paso» o «Fórmula»: la pestaña que está puesta es la que manda; fxError = lo que no se entendió de la fórmula escrita
        const letterKeys = new Map(pickable.map((c) => [c.letter, c.key]));
        const keyLetters = new Map(pickable.map((c) => [c.key, c.letter]));
        // los pasos de hoy como fórmula de Excel (el mismo texto que arma el servidor) para llenar la pestaña «Fórmula» al abrirla; null si algún paso aún está incompleto
        const sumOutside = (expr) => { let depth = 0; for (let k = 0; k < expr.length; k += 1) { const ch = expr[k]; if (ch === '(') depth += 1; else if (ch === ')') depth -= 1; else if (depth === 0 && k > 0 && (ch === '+' || ch === '-')) return true; } return false; };
        const wrapSum = (expr) => (sumOutside(expr) ? `(${expr})` : expr);
        const draftFormula = (steps) => {
            let expr = '';
            for (const s of steps) {
                let a = '';
                if (s.op === 'start' || !OPS_NO_ARG.has(s.op)) {
                    if (s.kind === 'col' && !OPS_VALUE_ONLY.has(s.op)) { const l = keyLetters.get(s.col); if (!l) return null; a = `${l}2`; } else { const n = Number(String(s.value).replace(',', '.')); if (String(s.value).trim() === '' || !Number.isFinite(n)) return null; a = String(n); }
                }
                if (s.op === 'start') expr = a;
                else if (s.op === 'add') expr = `${expr}+${a}`;
                else if (s.op === 'sub') expr = `${expr}-${a}`;
                else if (s.op === 'mul') expr = `${wrapSum(expr)}*${a}`;
                else if (s.op === 'div') expr = `${wrapSum(expr)}/${a}`;
                else if (OPS_NO_ARG.has(s.op)) expr = `${FX_NAME_OF[s.op]}(${expr})`;
                else expr = `${FX_NAME_OF[s.op]}(${expr};${a})`;
            }
            return `=${expr}`;
        };
        // una fórmula libre como texto (el mismo que arma el servidor): paréntesis solo donde hacen falta
        const exprFormula = (expr) => {
            const sign = { add: '+', sub: '-', mul: '*', div: '/' }; const prec = { add: 1, sub: 1, mul: 2, div: 2 };
            const text = (node, parentOp, side) => {
                if (node.col !== undefined) { const l = keyLetters.get(node.col); return l ? `${l}2` : '#REF!'; }
                if (node.value !== undefined) return String(node.value);
                if (node.fn) return `${FX_NAME_OF[node.fn]}(${node.args.map((a) => text(a, null, null)).join(';')})`;
                const out = `${text(node.l, node.op, 'l')}${sign[node.op]}${text(node.r, node.op, 'r')}`;
                if (!parentOp) return out;
                return prec[node.op] < prec[parentOp] || (prec[node.op] === prec[parentOp] && side === 'r' && (parentOp === 'sub' || parentOp === 'div')) ? `(${out})` : out;
            };
            return `=${text(expr, null, null)}`;
        };
        const currentFormula = () => (draft.expr ? exprFormula(draft.expr) : draftFormula(draft.steps));
        const fxErrorText = ([code, x, n]) => t(`main.anFxErr_${code}`, { x: x || '', n: n || '' });
        const applyFx = (text) => {
            const box = $('#an-ad-fx'); const msg = $('#an-ad-fx-err');
            const r = parseFormula(text, letterKeys);
            if (r.err) { fxError = fxErrorText(r.err); msg.textContent = fxError; box.classList.add('an-fx-bad'); box.setAttribute('aria-invalid', 'true'); return; }
            fxError = ''; msg.textContent = ''; box.classList.remove('an-fx-bad'); box.removeAttribute('aria-invalid');
            if (r.expr) draft.expr = r.expr; else { draft.expr = null; draft.steps = r.steps.map(toDraftStep); } // cabe en pasos → pasos de siempre; si no → fórmula libre
        };
        const setMode = (next) => {
            if (next === mode) return;
            if (next === 'fx') { const box = $('#an-ad-fx'); box.value = currentFormula() || '='; mode = 'fx'; applyFx(box.value); } else { mode = 'steps'; fxError = ''; drawSteps(); }
            $('#an-ad-pane-steps').hidden = mode !== 'steps'; $('#an-ad-pane-fx').hidden = mode !== 'fx';
            overlay.querySelectorAll('[data-an-adtab]').forEach((b) => { const on = b.dataset.anAdtab === mode; b.classList.toggle('reg-tab-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
            preview();
            if (mode === 'fx') $('#an-ad-fx').focus();
        };
        const colSelect = (value, field, stepIndex, withValue) => `<select data-st="${stepIndex}" data-f="${field}">${pickable.map((c) => `<option value="${esc(c.key)}"${value === c.key ? ' selected' : ''}>${esc(c.letter)} · ${esc(c.title)}</option>`).join('')}${withValue ? `<option value="__value"${value === '__value' ? ' selected' : ''}>${esc(t('main.anArgValue'))}</option>` : ''}</select>`;
        const drawSteps = () => {
            $('[data-an-addstep]').parentElement.hidden = !!draft.expr;
            if (draft.expr) { $('#an-ad-steps').innerHTML = `<p class="an-fx-note">${esc(t('main.anFxNoStepsView'))}</p>`; return; }
            $('#an-ad-steps').innerHTML = draft.steps.map((s, i) => {
                if (i === 0) {
                    return `<div class="an-step"><b>1</b><span>${esc(t('main.anStepStart'))}</span>${colSelect(s.kind === 'col' ? s.col : '__value', 'pick', 0, true)}${s.kind === 'value' ? `<input type="text" inputmode="decimal" data-st="0" data-f="value" value="${esc(s.value)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anArgValuePh'))}">` : ''}</div>`;
                }
                const opSel = `<select data-st="${i}" data-f="op">${groupedOptions(OP_GROUPS, 'anOpGroup', 'anOp', s.op)}</select>`;
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
            if (mode === 'fx' && fxError) return null; // la fórmula escrita no se entiende: no hay nada que calcular ni guardar
            if (draft.expr) return { id: editing ? editing.id : undefined, kind: 'op', name: draft.name.trim(), cls: draft.cls.trim(), color: colorFor(draft.cls.trim()), decimals: draft.decimals, expr: draft.expr };
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
        if (draft.expr) setMode('fx'); // una fórmula libre guardada se abre en «Fórmula»: no se ve en pasos
        overlay.addEventListener('input', (event) => {
            const el = event.target;
            if (el.id === 'an-ad-name') { draft.name = el.value; touchedName = true; return; }
            if (el.id === 'an-ad-cls') { draft.cls = el.value; return; }
            if (el.id === 'an-ad-fx') { applyFx(el.value); preview(); return; }
            if (el.dataset && el.dataset.f === 'value') { draft.steps[Number(el.dataset.st)].value = el.value; preview(); }
        });
        overlay.addEventListener('change', (event) => {
            const el = event.target;
            if (el.id === 'an-ad-dec') { draft.decimals = el.value === '' ? null : Number(el.value); return; }
            if (el.id === 'an-ad-cls') { draft.cls = el.value; return; }
            if (el.id === 'an-ad-fx-col' || el.id === 'an-ad-fx-fn') { // «Insertar columna / función»: se escribe en la fórmula donde está el cursor
                const box = $('#an-ad-fx'); const text = el.id === 'an-ad-fx-fn' ? `${el.value}(` : el.value; el.value = '';
                if (!text || text === '(') return;
                const from = box.selectionStart == null ? box.value.length : box.selectionStart; const to = box.selectionEnd == null ? from : box.selectionEnd;
                box.value = box.value.slice(0, from) + text + box.value.slice(to);
                const at = from + text.length; box.focus(); try { box.setSelectionRange(at, at); } catch { /* sin cursor */ }
                applyFx(box.value); preview(); return;
            }
            if (!el.dataset || el.dataset.st === undefined) return;
            const s = draft.steps[Number(el.dataset.st)];
            if (el.dataset.f === 'op') { s.op = el.value; if (OPS_VALUE_ONLY.has(s.op)) s.kind = 'value'; }
            if (el.dataset.f === 'pick') { if (el.value === '__value') s.kind = 'value'; else { s.kind = 'col'; s.col = el.value; } }
            drawSteps(); preview();
        });
        overlay.addEventListener('click', (event) => {
            const del = event.target.closest('[data-an-delstep]');
            const tab = event.target.closest('[data-an-adtab]');
            if (tab) { setMode(tab.dataset.anAdtab); return; }
            if (event.target.closest('[data-an-addstep]')) { draft.steps.push({ op: 'add', kind: 'value', col: '', value: '' }); drawSteps(); preview(); return; }
            if (del) { draft.steps.splice(Number(del.dataset.anDelstep), 1); drawSteps(); preview(); }
        });
        $('[data-an-go]').addEventListener('click', async () => {
            const err = (text) => { const el = $('#an-ad-error'); el.textContent = text; el.hidden = !text; };
            const def = toDef();
            if (!draft.name.trim()) return err(t('main.anErr_ADDED_NAME'));
            if (!def) return err(mode === 'fx' && fxError ? fxError : t('main.anErr_ADDED_STEPS'));
            if (!editing && added.length >= 40) return err(t('main.anErr_ADDED_TOO_MANY'));
            const next = editing ? added.map((a) => (a.id === editing.id ? def : a)) : [...added, { ...def, id: `a${Date.now().toString(36)}` }];
            try { await saveAdded(next); close(); } catch (e) { err(errorText(e.body)); }
        });
        if (!touchedName) setTimeout(() => $('#an-ad-name').focus(), 0);
    });
}

// ---- «Varias columnas (bloque)» (Daniel, 2026-11-27, «Sí a las recomendadas»): una función sobre un grupo de columnas, como el rango de Excel (F2:AM2) ------------------------------------------------------
// El bloque se guarda por sus dos puntas (Desde–hasta): lo que quede entre ellas, en el orden del archivo, entra solo. Se escoge con las listas o con «Marcar en la tabla» (clic en la primera columna y clic en la última, o Mayús + clic).
const BLOCK_FNS = ['blank', 'filled', 'zero', 'meet', 'sum', 'avg', 'min', 'max', 'median'];
// los cálculos por tipo, como la Biblioteca de funciones de Excel (Daniel, 2026-11-27): Contar y Estadística. «Cuántas cumplen…» lleva su condición; la suma, el promedio, el menor y el mayor la aceptan opcional («Solo las que…»)
const BLOCK_FN_GROUPS = [['count', ['filled', 'blank', 'zero', 'meet']], ['stat', ['sum', 'avg', 'min', 'max', 'median']]];
const BLOCK_COND_FNS = new Set(['meet', 'sum', 'avg', 'min', 'max']);
const BLOCK_CONDS = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'];
const blockCountText = (n) => (n === 1 ? t('main.anBlockCount1') : t('main.anBlockCount', { n }));
// cuántas columnas hay entre dos puntas; cols = solo las que cuentan en un bloque (sin las de referencia ni las de comentarios), en el orden del archivo
function blockCount(cols, from, to) {
    const a = cols.findIndex((c) => c.key === from); const b = cols.findIndex((c) => c.key === to);
    return a < 0 || b < 0 ? 0 : Math.abs(a - b) + 1;
}
// las puntas con las que arranca un bloque nuevo: la primera y la última de las columnas consultadas (si no hay, de todas)
function defaultBlockEnds(cols) {
    const pool = cols.some((c) => c.group === 'consulted') ? cols.filter((c) => c.group === 'consulted') : cols;
    return { from: pool.length ? pool[0].key : '', to: pool.length ? pool[pool.length - 1].key : '' };
}
const blockSelect = (cols, attrs, value) => `<select ${attrs}>${cols.map((c) => `<option value="${esc(c.key)}"${value === c.key ? ' selected' : ''}>${esc(c.letter)} · ${esc(c.title)}</option>`).join('')}</select>`;
// «Marcar en la tabla»: la ventana se esconde, la tabla muestra la letra de cada columna y se marca el bloque con un clic en la primera y otro en la última (o Mayús + clic); «Listo» devuelve las dos puntas, «Cancelar» o Esc las deja como estaban.
function markOnTable({ cols, from, to, overlay, onDone }) {
    const table = tableOf(FILE_TABLE); const host = document.querySelector('.page-content');
    if (!table || !host || !cols.length) return;
    const order = cols.map((c) => c.key); const letterOf = new Map(cols.map((c) => [c.key, c.letter]));
    let a = order.includes(from) ? from : order[0]; let b = order.includes(to) ? to : a; let waiting = false;
    const bar = document.createElement('div');
    bar.className = 'an-markbar'; bar.setAttribute('role', 'status');
    bar.innerHTML = `<span>${esc(t('main.anMarkHelp'))}</span><b class="an-mark-info"></b><span class="an-tools-sp"></span><button type="button" class="btn an-sm" data-mk="ok">${esc(t('main.anMarkDone'))}</button><button type="button" class="btn btn-secondary an-sm" data-mk="cancel">${esc(t('main.regCancel'))}</button>`;
    host.appendChild(bar);
    overlay.style.display = 'none';
    table.classList.add('an-marking');
    const ths = [...table.querySelectorAll('thead th[data-col]')];
    ths.forEach((th) => { const l = letterOf.get(dataKeyOf(th.dataset.col)); if (l) { const tag = document.createElement('span'); tag.className = 'an-mark-letter'; tag.textContent = l; th.appendChild(tag); } });
    const span = () => { const i = order.indexOf(a); const j = order.indexOf(b); return i < 0 || j < 0 ? [] : order.slice(Math.min(i, j), Math.max(i, j) + 1); };
    const paint = () => {
        const keys = span(); const set = new Set(keys);
        ths.forEach((th) => th.classList.toggle('an-markon', set.has(dataKeyOf(th.dataset.col))));
        bar.querySelector('.an-mark-info').textContent = !keys.length ? t('main.anMarkNone') : (keys.length === 1 ? t('main.anMarkOne', { from: letterOf.get(keys[0]) }) : t('main.anMarkInfo', { from: letterOf.get(keys[0]), to: letterOf.get(keys[keys.length - 1]), n: keys.length }));
        bar.querySelector('[data-mk="ok"]').disabled = !keys.length;
    };
    const finish = (apply) => {
        document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true);
        bar.remove(); table.classList.remove('an-marking');
        ths.forEach((th) => { th.classList.remove('an-markon'); th.querySelectorAll('.an-mark-letter').forEach((tag) => tag.remove()); });
        overlay.style.display = '';
        if (apply) { const keys = span(); if (keys.length) onDone({ from: keys[0], to: keys[keys.length - 1] }); }
    };
    function onClick(event) {
        if (bar.contains(event.target)) { const mk = event.target.closest('[data-mk]'); if (mk) { event.stopPropagation(); finish(mk.dataset.mk === 'ok'); } return; }
        const th = event.target.closest && event.target.closest('thead th');
        if (!th || !table.contains(th)) return;
        event.preventDefault(); event.stopPropagation(); // en este modo un clic en un encabezado marca: no ordena ni abre menús
        const key = dataKeyOf(th.dataset.col || '');
        if (!order.includes(key)) return;
        if (event.shiftKey || waiting) { b = key; waiting = false; } else { a = key; b = key; waiting = true; }
        paint();
    }
    function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); finish(false); } }
    document.addEventListener('click', onClick, true); document.addEventListener('keydown', onKey, true);
    paint();
    const firstTh = ths.find((th) => dataKeyOf(th.dataset.col) === a);
    if (firstTh) firstTh.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function openBlockDialog(editId) {
    const allCols = (st.data && st.data.columns) || [];
    const added = (st.design.added || []);
    const editing = editId ? added.find((a) => a.id === editId) : null;
    // las columnas que cuentan en un bloque: las consultadas y las agregadas ANTES de esta (cada una con su letra de Excel); sin las de referencia ni las de comentarios
    const editAt = editing && allCols.some((c) => c.key === `a_${editing.id}`) ? allCols.findIndex((c) => c.key === `a_${editing.id}`) : allCols.length;
    const cols = allCols.map((c, i) => ({ key: c.key, title: columnTitle(c), letter: columnLetter(i), group: c.group, kind: c.kind })).filter((c, i) => c.group !== 'reference' && c.kind !== 'comment' && i < editAt);
    const newLetter = columnLetter(editing ? editAt : allCols.length);
    const draft = editing
        ? { name: editing.name, cls: editing.cls || '', decimals: editing.decimals, fn: editing.fn, cond: editing.cond ? { op: editing.cond.op, value: String(editing.cond.value) } : { op: 'neq', value: '' }, blocks: editing.blocks.map((b) => ({ from: b.from, to: b.to })) }
        : { name: t('main.anBlockName_blank'), cls: '', decimals: null, fn: 'blank', cond: { op: 'neq', value: '' }, blocks: [defaultBlockEnds(cols)] };
    let touchedName = !!editing;
    const html = `<h3>${esc(t(editing ? 'main.anBlockEditTitle' : 'main.anBlockTitle'))}</h3>
        <div class="an-f2">
            <div><label for="an-bk-name">${esc(t('main.anColLabel'))}</label><input type="text" id="an-bk-name" maxlength="80" autocomplete="off" value="${esc(draft.name)}"></div>
            <div><label for="an-bk-cls">${esc(t('main.anAddedClass'))}</label><input type="text" id="an-bk-cls" maxlength="40" autocomplete="off" list="an-bk-cls-list" placeholder="${esc(t('main.anAddedClassNone'))}" value="${esc(draft.cls)}"><datalist id="an-bk-cls-list">${classKnown().map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
            <div><label for="an-bk-dec">${esc(t('main.anAddedFormat'))}</label><select id="an-bk-dec"><option value="">${esc(t('main.anFmtAuto'))}</option>${[0, 1, 2, 3, 4].map((n) => `<option value="${n}">${esc(t('main.anFmtDecimals', { n }))}</option>`).join('')}</select></div>
        </div>
        <p class="reg-field-label">${esc(t('main.anBlockWhat'))}</p>
        <div class="an-fn-groups" id="an-bk-fns"></div>
        <div class="an-cond an-bk-cond" id="an-bk-cond" hidden>
            <span class="an-lead" id="an-bk-condlead"></span>
            <select id="an-bk-condop" aria-label="${esc(t('main.anBlockCondLead'))}">${groupedOptions(COND_GROUPS.map(([g, list]) => [g, list.filter((o) => BLOCK_CONDS.includes(o))]).filter(([, list]) => list.length), 'anCondGroup', 'anCond', '')}</select>
            <input type="text" id="an-bk-condval" inputmode="decimal" autocomplete="off" placeholder="${esc(t('main.anBlockCondValue'))}" aria-label="${esc(t('main.anBlockCondValue'))}">
        </div>
        <p class="reg-field-label">${esc(t('main.anBlockCols'))}</p>
        <div class="an-blocks" id="an-bk-blocks"></div>
        <p><button type="button" class="btn btn-secondary an-sm" data-an-addblock><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anBlockAdd'))}</button></p>
        <p class="reg-field-label">${esc(t('main.anFormulaExcel'))}</p>
        <div class="an-formula" id="an-bk-formula">—</div>
        <div id="an-bk-preview"></div>
        <p class="admin-error" id="an-bk-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t(editing ? 'main.anAddedSave' : 'main.anAddedGo'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay, close) => {
        const $ = (sel) => overlay.querySelector(sel);
        $('#an-bk-dec').value = draft.decimals === null || draft.decimals === undefined ? '' : String(draft.decimals);
        const drawFns = () => {
            const button = (f) => `<button type="button" class="btn btn-secondary an-sm${draft.fn === f ? ' an-on' : ''}" data-an-fn="${f}" aria-pressed="${draft.fn === f ? 'true' : 'false'}">${esc(t(`main.anBlockFn_${f}`))}</button>`;
            $('#an-bk-fns').innerHTML = BLOCK_FN_GROUPS.map(([g, list]) => `<div class="an-fn-group"><span class="an-fn-title">${esc(t(`main.anBlockGroup_${g}`))}</span><div class="an-seg">${list.map(button).join('')}</div></div>`).join('');
            // la condición: obligatoria en «Cuántas cumplen…», opcional (vacía = sin condición) en la suma, el promedio, el menor y el mayor; las demás no la llevan
            const row = $('#an-bk-cond'); row.hidden = !BLOCK_COND_FNS.has(draft.fn);
            $('#an-bk-condlead').textContent = t(draft.fn === 'meet' ? 'main.anBlockCondLeadMeet' : 'main.anBlockCondLead');
            $('#an-bk-condop').value = draft.cond.op; $('#an-bk-condval').value = draft.cond.value;
        };
        const drawBlocks = () => {
            $('#an-bk-blocks').innerHTML = draft.blocks.map((b, i) => `<div class="an-range"><span class="an-lead">${esc(t('main.anBlockFrom'))}</span>${blockSelect(cols, `data-bi="${i}" data-f="from"`, b.from)}<span>${esc(t('main.anBlockTo'))}</span>${blockSelect(cols, `data-bi="${i}" data-f="to"`, b.to)}<button type="button" class="btn btn-secondary an-sm" data-an-markblock data-bi="${i}">⌖ ${esc(t('main.anBlockMark'))}</button><span class="an-cnt">${esc(blockCountText(blockCount(cols, b.from, b.to)))}</span>${draft.blocks.length > 1 ? `<button type="button" class="admin-icon-btn" data-an-delblock="${i}" aria-label="${esc(t('main.anBlockRemove'))}" title="${esc(t('main.anBlockRemove'))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : ''}</div>`).join('');
        };
        const colorFor = (cls) => colorOfClass(cls, editing);
        const toDef = () => {
            if (!draft.blocks.length || draft.blocks.some((b) => !cols.some((c) => c.key === b.from) || !cols.some((c) => c.key === b.to))) return null;
            let cond = null;
            if (BLOCK_COND_FNS.has(draft.fn)) {
                const raw = String(draft.cond.value).trim();
                if (raw !== '') { const n = Number(raw.replace(',', '.')); if (!Number.isFinite(n)) return null; cond = { op: draft.cond.op, value: n }; } else if (draft.fn === 'meet') return null; // sin número no hay condición: en «cuántas cumplen» es obligatoria, en los demás se calcula con todas
            }
            return { id: editing ? editing.id : undefined, kind: 'block', name: draft.name.trim(), cls: draft.cls.trim(), color: colorFor(draft.cls.trim()), decimals: draft.decimals, fn: draft.fn, ...(cond ? { cond } : {}), blocks: draft.blocks.map((b) => ({ from: b.from, to: b.to })) };
        };
        let timer = null; let seq = 0;
        const preview = () => {
            clearTimeout(timer);
            const def = toDef();
            const box = $('#an-bk-preview'); const fx = $('#an-bk-formula');
            if (!def) { fx.textContent = '—'; box.innerHTML = ''; return; }
            timer = setTimeout(async () => {
                const mine = ++seq;
                try {
                    const res = await fetch(`${API}/${st.id}/extractions/${st.extraction.id}/added-preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ def: { ...def, name: def.name || 'x' } }) });
                    const out = await res.json().catch(() => ({}));
                    if (mine !== seq) return;
                    if (!res.ok) { fx.textContent = '—'; box.innerHTML = ''; return; }
                    fx.textContent = out.formula;
                    box.innerHTML = `<div class="wp-imp-table-wrap"><table class="wp-imp-table"><thead><tr><th>${esc(t('main.regDim_codigo'))}</th><th class="col-num">${esc(newLetter)} · ${esc(def.name || t('main.anBlockTitle'))}</th></tr></thead><tbody>${(out.rows || []).map((r) => `<tr><td>${esc(r.label)}</td><td class="col-num">${r.value === null ? '—' : esc(fmtCell(r.value, def.decimals))}</td></tr>`).join('')}</tbody></table></div>`;
                } catch { /* sin vista previa */ }
            }, 250);
        };
        drawFns(); drawBlocks(); preview();
        overlay.addEventListener('input', (event) => {
            const el = event.target;
            if (el.id === 'an-bk-name') { draft.name = el.value; touchedName = true; return; }
            if (el.id === 'an-bk-cls') draft.cls = el.value;
            if (el.id === 'an-bk-condval') { draft.cond.value = el.value; preview(); }
        });
        overlay.addEventListener('change', (event) => {
            const el = event.target;
            if (el.id === 'an-bk-dec') { draft.decimals = el.value === '' ? null : Number(el.value); preview(); return; }
            if (el.id === 'an-bk-cls') { draft.cls = el.value; return; }
            if (el.id === 'an-bk-condop') { draft.cond.op = el.value; preview(); return; }
            if (el.dataset && el.dataset.bi !== undefined && el.tagName === 'SELECT') { draft.blocks[Number(el.dataset.bi)][el.dataset.f] = el.value; drawBlocks(); preview(); }
        });
        overlay.addEventListener('click', (event) => {
            const fnBtn = event.target.closest('[data-an-fn]'); const mark = event.target.closest('[data-an-markblock]'); const del = event.target.closest('[data-an-delblock]');
            if (fnBtn) {
                draft.fn = fnBtn.dataset.anFn;
                if (!touchedName) { draft.name = t(`main.anBlockName_${draft.fn}`); $('#an-bk-name').value = draft.name; } // el nombre sugerido cambia con lo que se calcula mientras nadie lo escriba
                drawFns(); preview();
            } else if (mark) {
                const b = draft.blocks[Number(mark.dataset.bi)];
                if (b) markOnTable({ cols, from: b.from, to: b.to, overlay, onDone: (r) => { b.from = r.from; b.to = r.to; drawBlocks(); preview(); } });
            } else if (event.target.closest('[data-an-addblock]')) {
                if (draft.blocks.length < 10 && cols.length) { draft.blocks.push({ from: cols[0].key, to: cols[0].key }); drawBlocks(); preview(); }
            } else if (del) { draft.blocks.splice(Number(del.dataset.anDelblock), 1); drawBlocks(); preview(); }
        });
        $('[data-an-go]').addEventListener('click', async () => {
            const err = (text) => { const el = $('#an-bk-error'); el.textContent = text; el.hidden = !text; };
            const def = toDef();
            if (!draft.name.trim()) return err(t('main.anErr_ADDED_NAME'));
            if (!def) return err(t('main.anErr_ADDED_BLOCK'));
            if (!editing && added.length >= 40) return err(t('main.anErr_ADDED_TOO_MANY'));
            const next = editing ? added.map((a) => (a.id === editing.id ? def : a)) : [...added, { ...def, id: `a${Date.now().toString(36)}` }];
            try { await saveAdded(next); close(); } catch (e) { err(errorText(e.body)); }
        });
        setTimeout(() => { if (!draft.name) $('#an-bk-name').focus(); }, 0);
    });
}

// ---- «Criterio» (pieza 2): reglas «si… entonces…», de arriba abajo; gana la primera que se cumple ----------------------------------------------------------------------------------------
const COND_OPS = ['lt', 'lte', 'gt', 'gte', 'between', 'eq', 'neq', 'contains', 'empty', 'notEmpty', 'blankZero'];
const COND_GROUPS = [['eq', ['eq', 'neq']], ['num', ['lt', 'lte', 'gt', 'gte', 'between']], ['text', ['contains']], ['empty', ['empty', 'notEmpty', 'blankZero']]]; // las condiciones por tipo (Igualdad, Números, Texto, Vacíos), igual que las acciones
const NUMERIC_COND_OPS = new Set(['lt', 'lte', 'gt', 'gte', 'between']);
const NO_VALUE_COND_OPS = new Set(['empty', 'notEmpty', 'blankZero']);
const RESULT_TYPES = ['text', 'value', 'col', 'empty'];
const SCAN_RESULT_TYPES = ['name', 'found', 'text', 'value', 'col', 'empty']; // una regla de bloque también puede poner el nombre o el valor de la columna que cumplió
const numOf = (v) => { const s = String(v === null || v === undefined ? '' : v).trim(); if (s === '') return null; const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : null; };

function openCriterionDialog(editId) {
    const allCols = (st.data && st.data.columns) || [];
    const added = (st.design.added || []);
    const editing = editId ? added.find((a) => a.id === editId) : null;
    // las columnas que se pueden revisar: todas las del archivo y las agregadas ANTES de esta (cada una con su letra de Excel)
    const editAt = editing && allCols.some((c) => c.key === `a_${editing.id}`) ? allCols.findIndex((c) => c.key === `a_${editing.id}`) : allCols.length; // una columna agregada que aún no se arma (cambio sin aplicar) puede usar todas las que ya están
    const pickable = allCols.map((c, i) => ({ key: c.key, title: columnTitle(c), letter: columnLetter(i), kind: c.kind, group: c.group })).filter((c, i) => c.kind !== 'comment' && i < editAt);
    const blockCols = pickable.filter((c) => c.group !== 'reference'); // las que cuentan en un bloque
    const newLetter = columnLetter(editing ? editAt : allCols.length);
    const blankRes = (type) => ({ type, text: '', value: '', col: pickable[0] ? pickable[0].key : '' });
    const fromResult = (r) => {
        if (!r || r.empty) return blankRes('empty');
        if (r.name) return blankRes('name');
        if (r.found) return blankRes('found');
        if (r.col !== undefined) return { ...blankRes('col'), col: r.col };
        if (r.text !== undefined) return { ...blankRes('text'), text: r.text };
        return { ...blankRes('value'), value: String(r.value) };
    };
    const blankCond = () => ({ col: pickable[0] ? pickable[0].key : '', op: 'gt', value: '', value2: '' });
    const blankScan = () => ({ scan: true, ...defaultBlockEnds(blockCols), dir: 'asc', cond: { op: 'gt', value: '0', value2: '' }, res: blankRes('name') });
    const scanFromRule = (r) => ({ scan: true, from: r.scan.from, to: r.scan.to, dir: r.scan.dir === 'desc' ? 'desc' : 'asc', cond: { op: r.scan.cond.op, value: r.scan.cond.value === undefined ? '' : String(r.scan.cond.value), value2: r.scan.cond.value2 === undefined ? '' : String(r.scan.cond.value2) }, res: fromResult(r.result) });
    const draft = editing
        ? { name: editing.name, cls: editing.cls || '', decimals: editing.decimals, rules: editing.rules.map((r) => (r.scan ? scanFromRule(r) : ({ conds: r.conds.map((c) => ({ col: c.col, op: c.op, value: c.value === undefined ? '' : String(c.value), value2: c.value2 === undefined ? '' : String(c.value2) })), join: r.join === 'or' ? 'or' : 'and', res: fromResult(r.result) }))), otherwise: fromResult(editing.otherwise) }
        : { name: '', cls: '', decimals: null, rules: [{ conds: [blankCond()], join: 'and', res: blankRes('text') }], otherwise: blankRes('empty') };
    const html = `<h3>${esc(t(editing ? 'main.anCriterionEditTitle' : 'main.anCriterionTitle'))}</h3>
        <div class="an-f2">
            <div><label for="an-cr-name">${esc(t('main.anColLabel'))}</label><input type="text" id="an-cr-name" maxlength="80" autocomplete="off" value="${esc(draft.name)}"></div>
            <div><label for="an-cr-cls">${esc(t('main.anAddedClass'))}</label><input type="text" id="an-cr-cls" maxlength="40" autocomplete="off" list="an-cr-cls-list" placeholder="${esc(t('main.anAddedClassNone'))}" value="${esc(draft.cls)}"><datalist id="an-cr-cls-list">${classKnown().map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
            <div><label for="an-cr-dec">${esc(t('main.anAddedFormat'))}</label><select id="an-cr-dec"><option value="">${esc(t('main.anFmtAuto'))}</option>${[0, 1, 2, 3, 4].map((n) => `<option value="${n}">${esc(t('main.anFmtDecimals', { n }))}</option>`).join('')}</select></div>
        </div>
        <p class="reg-field-label">${esc(t('main.anRules'))}</p>
        <div class="an-rules" id="an-cr-rules"></div>
        <p><button type="button" class="btn btn-secondary" data-an-addrule><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anAddRule'))}</button> <button type="button" class="btn btn-secondary" data-an-addscan data-help-key="anReglaBloque"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anAddScanRule'))}</button></p>
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
        const resultEditor = (res, scope, types = RESULT_TYPES) => {
            const typeSel = `<select data-cr="${scope}" data-f="rtype">${types.map((r) => `<option value="${r}"${res.type === r ? ' selected' : ''}>${esc(t(`main.anRes_${r}`))}</option>`).join('')}</select>`;
            if (res.type === 'text') return `${typeSel}<input type="text" maxlength="80" data-cr="${scope}" data-f="rtext" value="${esc(res.text)}" placeholder="${esc(t('main.anResTextPh'))}" aria-label="${esc(t('main.anRes_text'))}">`;
            if (res.type === 'value') return `${typeSel}<input type="text" inputmode="decimal" data-cr="${scope}" data-f="rvalue" value="${esc(res.value)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anRes_value'))}">`;
            if (res.type === 'col') return `${typeSel}${colSel(res.col, `data-cr="${scope}" data-f="rcol"`)}`;
            return typeSel;
        };
        // la regla de bloque: recorre las columnas del bloque (de izquierda a derecha o al revés) y se queda con la primera donde se cumple la condición
        const scanCard = (rule, i) => {
            const attrs = (f) => `data-cr="r${i}" data-f="${f}"`;
            const c = rule.cond; let vals = '';
            if (!NO_VALUE_COND_OPS.has(c.op)) {
                vals = `<input type="text" ${NUMERIC_COND_OPS.has(c.op) ? 'inputmode="decimal"' : ''} ${attrs('sval')} value="${esc(c.value)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anArgValuePh'))}">`;
                if (c.op === 'between') vals += `<span>${esc(t('main.anBetweenAnd'))}</span><input type="text" inputmode="decimal" ${attrs('sval2')} value="${esc(c.value2)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anArgValuePh'))}">`;
            }
            const delBtn = draft.rules.length > 1 ? `<button type="button" class="admin-icon-btn" data-an-delrule="${i}" aria-label="${esc(t('main.anRemoveRule'))}" title="${esc(t('main.anRemoveRule'))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : '';
            return `<div class="an-rule an-rule-scan"><div class="an-rulehead"><b>${esc(t('main.anScanTitle', { n: i + 1 }))}</b>${delBtn}</div>
                <div class="an-cond"><span class="an-lead">${esc(t('main.anScanReview'))}</span><span>${esc(t('main.anBlockFrom'))}</span>${blockSelect(blockCols, attrs('sfrom'), rule.from)}<span>${esc(t('main.anBlockTo'))}</span>${blockSelect(blockCols, attrs('sto'), rule.to)}<button type="button" class="btn btn-secondary an-sm" data-an-markblock data-cr-scan="${i}">⌖ ${esc(t('main.anBlockMark'))}</button><span class="an-cnt">${esc(blockCountText(blockCount(blockCols, rule.from, rule.to)))}</span></div>
                <div class="an-cond"><span class="an-lead">${esc(t('main.anScanDir'))}</span><select ${attrs('sdir')}><option value="asc"${rule.dir === 'asc' ? ' selected' : ''}>${esc(t('main.anScanDir_asc'))}</option><option value="desc"${rule.dir === 'desc' ? ' selected' : ''}>${esc(t('main.anScanDir_desc'))}</option></select></div>
                <div class="an-cond"><span class="an-lead">${esc(t('main.anScanWhere'))}</span><select ${attrs('sop')}>${groupedOptions(COND_GROUPS, 'anCondGroup', 'anCond', c.op)}</select>${vals}</div>
                <div class="an-cond"><span class="an-lead">${esc(t('main.anThen'))}</span>${resultEditor(rule.res, `r${i}`, SCAN_RESULT_TYPES)}</div></div>`;
        };
        const draw = () => {
            $('#an-cr-rules').innerHTML = draft.rules.map((rule, i) => {
                if (rule.scan) return scanCard(rule, i);
                const conds = rule.conds.map((c, j) => {
                    const lead = j === 0 ? t('main.anIf') : t(rule.join === 'or' ? 'main.anOrElse' : 'main.anAndAlso');
                    const attrs = (f) => `data-cr="r${i}" data-c="${j}" data-f="${f}"`;
                    let vals = '';
                    if (!NO_VALUE_COND_OPS.has(c.op)) {
                        vals = `<input type="text" ${NUMERIC_COND_OPS.has(c.op) ? 'inputmode="decimal"' : ''} ${attrs('value')} value="${esc(c.value)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anArgValuePh'))}">`;
                        if (c.op === 'between') vals += `<span>${esc(t('main.anBetweenAnd'))}</span><input type="text" inputmode="decimal" ${attrs('value2')} value="${esc(c.value2)}" placeholder="${esc(t('main.anArgValuePh'))}" aria-label="${esc(t('main.anArgValuePh'))}">`;
                    }
                    return `<div class="an-cond"><span class="an-lead">${esc(lead)}</span>${colSel(c.col, attrs('col'))}<select ${attrs('op')}>${groupedOptions(COND_GROUPS, 'anCondGroup', 'anCond', c.op)}</select>${vals}${rule.conds.length > 1 ? `<button type="button" class="admin-icon-btn" data-an-delcond="${i}:${j}" aria-label="${esc(t('main.anRemoveCond'))}" title="${esc(t('main.anRemoveCond'))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : ''}</div>`;
                }).join('');
                const join = rule.conds.length > 1 ? `<div class="an-cond"><span class="an-lead">${esc(t('main.anJoinLabel'))}</span><select data-cr="r${i}" data-f="join"><option value="and"${rule.join === 'and' ? ' selected' : ''}>${esc(t('main.anJoinAnd'))}</option><option value="or"${rule.join === 'or' ? ' selected' : ''}>${esc(t('main.anJoinOr'))}</option></select></div>` : '';
                return `<div class="an-rule"><div class="an-rulehead"><b>${esc(t('main.anRuleN', { n: i + 1 }))}</b>${draft.rules.length > 1 ? `<button type="button" class="admin-icon-btn" data-an-delrule="${i}" aria-label="${esc(t('main.anRemoveRule'))}" title="${esc(t('main.anRemoveRule'))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : ''}</div>${conds}${rule.conds.length < 5 ? `<div><button type="button" class="btn btn-secondary" data-an-addcond="${i}"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.anAddCond'))}</button></div>` : ''}${join}<div class="an-cond"><span class="an-lead">${esc(t('main.anThen'))}</span>${resultEditor(rule.res, `r${i}`)}</div></div>`;
            }).join('');
            $('#an-cr-other').innerHTML = `<b>·</b><span>${esc(t('main.anNoneMatch'))}</span>${resultEditor(draft.otherwise, 'o')}`;
        };
        const colorFor = (cls) => colorOfClass(cls, editing); // el mismo nombre de clasificación lleva el mismo color en las columnas consultadas y en las agregadas
        const parseResult = (res) => {
            if (res.type === 'empty') return { empty: true };
            if (res.type === 'name') return { name: true };
            if (res.type === 'found') return { found: true };
            if (res.type === 'text') { const tx = res.text.trim(); return tx ? { text: tx } : null; }
            if (res.type === 'value') { const n = numOf(res.value); return n === null ? null : { value: n }; }
            return res.col ? { col: res.col } : null;
        };
        const toDef = () => {
            const rules = [];
            for (const rule of draft.rules) {
                if (rule.scan) {
                    if (!blockCols.some((c) => c.key === rule.from) || !blockCols.some((c) => c.key === rule.to)) return null;
                    const k = rule.cond; let cond;
                    if (NO_VALUE_COND_OPS.has(k.op)) cond = { op: k.op };
                    else if (k.op === 'between') { const lo = numOf(k.value); const hi = numOf(k.value2); if (lo === null || hi === null) return null; cond = { op: k.op, value: lo, value2: hi }; }
                    else if (NUMERIC_COND_OPS.has(k.op)) { const n = numOf(k.value); if (n === null) return null; cond = { op: k.op, value: n }; }
                    else { const text = String(k.value).trim(); if (!text) return null; cond = { op: k.op, value: text }; }
                    const sres = parseResult(rule.res);
                    if (!sres) return null;
                    rules.push({ scan: { from: rule.from, to: rule.to, dir: rule.dir, cond }, result: sres });
                    continue;
                }
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
            if (rule.scan) {
                if (f === 'sfrom') { rule.from = el.value; return true; }
                if (f === 'sto') { rule.to = el.value; return true; }
                if (f === 'sdir') rule.dir = el.value === 'desc' ? 'desc' : 'asc';
                else if (f === 'sop') { rule.cond.op = el.value; return true; }
                else if (f === 'sval') rule.cond.value = el.value; else if (f === 'sval2') rule.cond.value2 = el.value;
                else if (f === 'rtype') { rule.res = { ...rule.res, type: el.value }; return true; }
                else if (f === 'rtext') rule.res.text = el.value; else if (f === 'rvalue') rule.res.value = el.value; else if (f === 'rcol') rule.res.col = el.value;
                return false;
            }
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
            const addScan = event.target.closest('[data-an-addscan]'); const markScan = event.target.closest('[data-an-markblock]');
            if (markScan) {
                const rule = draft.rules[Number(markScan.dataset.crScan)];
                if (rule && rule.scan) markOnTable({ cols: blockCols, from: rule.from, to: rule.to, overlay, onDone: (r) => { rule.from = r.from; rule.to = r.to; draw(); preview(); } });
                return;
            }
            if (addScan) { if (draft.rules.length < 20 && blockCols.length) draft.rules.push(blankScan()); }
            else if (addRule) { if (draft.rules.length < 20) draft.rules.push({ conds: [blankCond()], join: 'and', res: blankRes('text') }); }
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
            try { await saveAdded(next); close(); } catch (e) { err(errorText(e.body)); }
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
        if (c.typeBand) th.dataset.typeBand = c.typeBand; // el tipo de una columna agregada (Operación, Criterio, Bloque, Comentarios), una palabra por columna en la franja pegada al encabezado
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
                extra: (menu) => buildMetaExtra(current, menu),
                onCollapse: Dashboard.collapseColumn ? () => Dashboard.collapseColumn(FILE_TABLE, colKeyOf(current.key)) : null, // «Contraer columna»: la tira angosta (Dashboard.js)
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
// La descarga en Excel con el MISMO formato de la pantalla (Daniel, 2026-11-26): la tabla manda lo que se ve (columnas visibles en su orden y renglones que pasan los filtros y el orden) con el valor de cada celda
// (el número tal cual, no el texto con formato) y el formato de cada columna; el servidor escribe el Excel (analysisExcel.js).
// ¿Se baja TODO desde el servidor? Sí cuando trae más renglones de los que se ven aquí (En vivo manda 5,000, una versión 2,000): el servidor aplica también el filtro por columna y el orden de la pantalla.
function fullDownloadApplies() {
    const table = tableOf(FILE_TABLE);
    return !!(st.data && st.data.truncated && table); // el servidor aplica el filtro y el orden de la pantalla: se baja TODO lo que pasa el filtro
}
// los decimales que la persona ve («Encabezados y celdas» › Celdas): el Excel baja lo que se ve
const lookDecBody = () => { const look = Dashboard.getDataTableLook && Dashboard.getDataTableLook(FILE_TABLE); return look && look.dec !== undefined ? { dec: look.dec } : {}; };
function buildAnalysisXlsx({ columns, trs }) {
    if (!st.data || !trs) return null;
    const defs = st.data.columns;
    const at = new Map(defs.map((c, i) => [colKeyOf(c.key), i]));
    const idx = columns.map((c) => at.get(c.key));
    if (idx.some((i) => i === undefined)) return null;
    const rows = trs.map((tr) => { const row = st.data.rows[Number(tr.dataset.r)] || []; return idx.map((i) => (row[i] === undefined ? null : row[i])); });
    if (fullDownloadApplies()) {
        Dashboard.showToast(t('main.downloadFullPreparing'), 'info');
        return { url: `${API}/${st.id}/export-xlsx`, body: { ...lookDecBody(), full: true, v: fileVersion(), text: st.text || '', keys: idx.map((i) => defs[i].key), tz: new Date().getTimezoneOffset(), lang: lang(), ...(serverCf(st.cf) ? { cf: JSON.stringify(serverCf(st.cf)) } : {}), ...(st.sortSpec ? { sort: dataKeyOf(st.sortSpec.key), dir: st.sortSpec.dir } : {}) } };
    }
    // las columnas de comentarios: el Excel lleva todos los comentarios de cada renglón (el servidor los arma con la llave del renglón)
    const commentCols = [];
    idx.forEach((i, pos) => { if (defs[i].kind === 'comment') commentCols.push({ at: pos, col: defs[i].id }); });
    const commentExtra = commentCols.length ? { commentCols, rowKeys: trs.map((tr) => (st.data.keys || [])[Number(tr.dataset.r)] || ''), v: st.extraction && !st.extraction.live ? st.extraction.id : 0, tz: new Date().getTimezoneOffset() } : {};
    const labelOf = (c) => c.label || (c.dim ? t(`main.regDim_${c.dim}`) : c.key);
    return { url: `${API}/${st.id}/export-xlsx`, body: { ...lookDecBody(), columns: idx.map((i) => ({ label: labelOf(defs[i]), ff: defs[i].ff || null, fmt: defs[i].fmt || '', style: defs[i].style || null, decimals: Number.isInteger(defs[i].decimals) ? defs[i].decimals : null })), rows, ...commentExtra } };
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
        if (c.group === 'added') { cls = c.kind === 'criterion' || c.kind === 'comment' ? `an-added${c.kind === 'comment' ? ' an-cm' : ''}` : 'an-added col-num'; fmt = (v) => (v === null ? '' : fmtCell(v, c.decimals)); }
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
        return { i, key, cls, fmt, style, ff: !!ff, numeric, comment: c.group === 'added' && c.kind === 'comment', dataKey: c.key };
    });
}
function fileRowsHtml(from, to) {
    const rows = st.data.rows; const plan = st.filePlan; const view = st.view; const html = [];
    for (let r = from; r < to; r += 1) {
        const at = view[r]; const row = rows[at]; // st.view = los renglones de los datos que se ven (con el filtro y el orden de la pantalla)
        let tr = `<tr data-r="${at}">`; // el número del renglón de los datos: la descarga con formato toma de ahí el valor de cada celda
        for (let k = 0; k < plan.length; k += 1) {
            const p = plan[k]; const raw = row[p.i]; const v = p.fmt(raw);
            if (p.comment) { tr += commentCellHtml(p, at, raw); continue; } // la columna de comentarios: el último comentario y cuántos hay
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
    if (!st.data || !st.filePlan || !st.view || !table) return 0;
    const to = Math.min(st.view.length, st.drawn + count);
    if (to <= st.drawn) return 0;
    table.tBodies[0].insertAdjacentHTML('beforeend', fileRowsHtml(st.drawn, to));
    const added = to - st.drawn;
    st.drawn = to;
    updateFileNote();
    return added;
}
// ---- orden, filtro por columna y totales EN EL SERVIDOR (Daniel, 2026-11-27, «pasa el filtro del Análisis al servidor»): antes solo se filtraba y se ordenaba lo que la pantalla traía (los primeros 5,000 renglones de En vivo, 2,000 de una versión);
// ahora el servidor lo hace sobre TODOS los renglones y la pantalla recibe los primeros del resultado (y el total de los que pasan el filtro). Lo que se manda: cf (el filtro por columna con las llaves de los datos), sort + dir, text y lang. ----
const dataColumnIndexes = () => new Map(((st.data && st.data.columns) || []).map((c, i) => [colKeyOf(c.key), i]));
const dataKeyOf = (colKey) => String(colKey || '').replace(/^an_/, ''); // la llave de la columna en los datos (la que conoce el servidor)
function serverCf(spec) {
    if (!spec) return null;
    const out = {};
    ['f', 'r', 'x'].forEach((part) => { // x = «todos menos estos» (una selección grande de casillas)
        if (!spec[part]) return;
        const o = {};
        Object.keys(spec[part]).forEach((k) => { o[dataKeyOf(k)] = spec[part][k]; });
        if (Object.keys(o).length) out[part] = o;
    });
    return Object.keys(out).length ? out : null;
}
const fileVersion = () => (st.extraction && !st.extraction.live ? st.extraction.id : 0);
// noSort: los totales y las listas de valores no necesitan el orden
function fileQuery(extra = {}, { noSort = false } = {}) {
    const p = new URLSearchParams();
    if (st.text) p.set('text', st.text);
    const cf = serverCf(st.cf); if (cf) p.set('cf', JSON.stringify(cf));
    if (st.sortSpec && !noSort) { p.set('sort', dataKeyOf(st.sortSpec.key)); p.set('dir', st.sortSpec.dir); }
    p.set('lang', lang());
    Object.keys(extra).forEach((k) => p.set(k, extra[k]));
    return p;
}
// La pantalla ya trae solo lo que pasó el filtro y en su orden: la vista son todos los renglones que llegaron.
function buildView() {
    const n = st.data ? st.data.rows.length : 0;
    st.view = new Array(n);
    for (let r = 0; r < n; r += 1) st.view[r] = r;
}
let querySeq = 0;
// Vuelve a pedir al servidor los renglones con el filtro y el orden de ahora y dibuja los primeros (el resto sigue por partes al bajar o con «Mostrar más»).
// sameRows: ordenar no cambia qué renglones cuentan, así que la fila de totales no se vuelve a calcular
async function queryRows(sameRows) {
    const e = st.extraction; const table = tableOf(FILE_TABLE); const wrapper = wrapperOf(FILE_TABLE);
    if (!e || !table || !st.data) return;
    const seq = ++querySeq;
    setFileBusy(wrapper, true);
    try {
        const res = await fetch(`${API}/${st.id}/${e.live ? 'live' : `extractions/${e.id}/data`}?${fileQuery({ cached: '1' })}`, { credentials: 'include' });
        if (!res.ok) throw new Error('query failed');
        const body = await res.json();
        if (seq !== querySeq) return; // llegó una consulta más nueva
        st.data = body;
        st.filePlan = fileCellPlan(body.columns);
        buildView();
        table.tBodies[0].innerHTML = '';
        st.drawn = 0;
        drawFileRows(FIRST_ROWS);
        ensureEmpty(FILE_TABLE, body.columns.length);
        if (wrapper) wrapper.scrollTop = 0;
        updateFileNote();
        if (!sameRows && Dashboard.refreshTotalsRow) Dashboard.refreshTotalsRow(FILE_TABLE);
    } catch (err) {
        console.error('Análisis: failed to query the rows', err);
        Dashboard.showToast(t('main.anLoadError'), 'error');
    } finally {
        if (seq === querySeq) setFileBusy(wrapper, false);
    }
}
function setFileSort(key, dir) { st.sortSpec = dir ? { key, dir } : null; queryRows(true); }
// ---- fila de totales: el servidor cuenta TODOS los renglones que pasan el filtro y la búsqueda ----
function fileTotalsInfo() {
    const n = st.data ? st.data.total : 0;
    return { count: n, total: n, filtered: !!(st.cf || st.text) };
}
async function computeFileTotals(specs) {
    const byKey = {};
    Object.keys(specs).forEach((k) => { byKey[dataKeyOf(k)] = specs[k]; });
    const p = fileQuery({ calcs: JSON.stringify(byKey), cached: '1' }, { noSort: true });
    if (fileVersion()) p.set('v', String(fileVersion()));
    const res = await fetch(`${API}/${st.id}/totals?${p}`, { credentials: 'include' });
    if (!res.ok) throw new Error('totals failed');
    const body = await res.json();
    const values = {};
    Object.keys(body.values || {}).forEach((k) => { values[colKeyOf(k)] = body.values[k]; });
    return { rows: body.rows, values };
}
// La lista de casillas del filtro de una columna: los valores distintos de TODOS los renglones (los pide al servidor).
async function fileColumnValues(key, opts) {
    const p = new URLSearchParams({ col: dataKeyOf(key), lang: lang() });
    if (opts && opts.q) { p.set('q', opts.q); p.set('mode', opts.mode || 'contains'); } // lo escrito en el buscador del filtro: los valores que coinciden de TODO el análisis
    if (st.text) p.set('text', st.text);
    if (fileVersion()) p.set('v', String(fileVersion()));
    const res = await fetch(`${API}/${st.id}/column-values?${p}`, { credentials: 'include' });
    if (!res.ok) throw new Error('values failed');
    return res.json();
}
// ---- columna «Comentarios» (Daniel, 2026-11-27): la lista de comentarios de cada renglón, con fecha y autor; escribe quien tenga el permiso del árbol; una versión trae los de su momento ----
const canWriteComments = () => !!(st.canComment && st.extraction && st.extraction.live && st.analysis && st.analysis.status === 'active');
function commentInner(n, last) {
    if (n) return `<span class="an-cm-last">${esc(String(last === null || last === undefined ? '' : last))}</span><span class="an-cm-n" title="${esc(t('main.anCmCount', { n }))}">${n}</span>`;
    return canWriteComments() ? `<span class="an-cm-add">＋ ${esc(t('main.anCmAdd'))}</span>` : '—';
}
function commentCellHtml(p, at, raw) {
    const n = ((st.data.cm || {})[p.dataKey] || { n: [] }).n[at] || 0;
    return `<td data-col="${p.key}" class="${p.cls}" tabindex="0">${commentInner(n, raw)}</td>`;
}
const rowKeyAt = (r) => (st.data && st.data.keys ? st.data.keys[r] : '') || '';
function rowTitleAt(r) {
    const parts = [];
    st.data.columns.forEach((c, i) => { if (c.group === 'reference' && c.isKey) { const v = st.data.rows[r][i]; if (v !== null && v !== undefined && v !== '') parts.push(String(v)); } });
    return parts.join(' · ');
}
function openCommentsPanel(td) {
    const tr = td.closest('tr'); const r = Number(tr && tr.dataset.r);
    if (!st.data || !Number.isInteger(r)) return;
    const dataKey = String(td.dataset.col || '').replace(/^an_/, '');
    const id = dataKey.slice(2); const key = rowKeyAt(r);
    if (!key) return;
    const live = !!(st.extraction && st.extraction.live);
    const canWrite = canWriteComments();
    const colAt = st.data.columns.findIndex((c) => c.key === dataKey);
    const colDef = st.data.columns[colAt];
    const html = `<h3>${esc(colDef ? colDef.label : '')} · ${esc(rowTitleAt(r))}</h3>
        <div class="an-cm-list" id="an-cm-list" aria-live="polite"><p class="admin-hint">${esc(t('main.anCmLoading'))}</p></div>
        ${canWrite ? `<textarea id="an-cm-text" class="an-cm-text" maxlength="1000" rows="3" placeholder="${esc(t('main.anCmPlaceholder'))}" aria-label="${esc(t('main.anCmPlaceholder'))}"></textarea><p class="admin-hint">${esc(t('main.anCmNote'))}</p>`
            : `<p class="admin-hint">${esc(!live ? t('main.anCmVersionNote') : (!st.canComment ? t('main.anCmNoPermission') : t('main.anCmInactiveNote')))}</p>`}
        <p class="admin-error" id="an-cm-error" role="alert" hidden></p>
        <div class="admin-form-actions">${canWrite ? `<button type="button" class="btn" data-an-cmadd>${esc(t('main.anCmAddBtn'))}</button>` : ''}<button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.anCmClose'))}</button></div>`;
    modal(html, async (overlay) => {
        const list = overlay.querySelector('#an-cm-list');
        const drawList = (comments) => {
            list.innerHTML = '';
            if (!comments.length) { const p = document.createElement('p'); p.className = 'admin-hint'; p.textContent = t('main.anCmEmpty'); list.appendChild(p); return; }
            comments.forEach((c) => {
                const item = document.createElement('div'); item.className = 'an-cm-item';
                const head = document.createElement('div'); head.className = 'an-cm-head';
                const who = document.createElement('b'); who.textContent = c.by || '—';
                const when = document.createElement('span'); if (c.at) Dashboard.renderTimeStamp(when, c.at); // la hora se guarda en UTC y se ve en la hora de quien mira
                head.append(who, when);
                const body = document.createElement('p'); body.textContent = c.t;
                item.append(head, body); list.appendChild(item);
            });
            list.scrollTop = list.scrollHeight;
        };
        const showError = (text) => { const el = overlay.querySelector('#an-cm-error'); el.textContent = text; el.hidden = !text; };
        try {
            const res = await fetch(`${API}/${st.id}/comments?col=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}&v=${live ? 0 : st.extraction.id}`, { credentials: 'include' });
            if (!res.ok) throw new Error('load failed');
            drawList((await res.json()).comments || []);
        } catch { list.innerHTML = ''; showError(t('main.anCmLoadError')); }
        const btn = overlay.querySelector('[data-an-cmadd]');
        if (btn) btn.addEventListener('click', async () => {
            const box = overlay.querySelector('#an-cm-text'); const text = box.value.trim();
            showError('');
            if (!text) { showError(t('main.anErr_COMMENT_EMPTY')); return; }
            btn.disabled = true;
            try {
                const res = await fetch(`${API}/${st.id}/comments`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ col: id, key, text }) });
                const outBody = await res.json().catch(() => ({}));
                if (!res.ok) throw Object.assign(new Error('failed'), { body: outBody });
                const comments = outBody.comments || [];
                drawList(comments); box.value = '';
                // la celda y los datos de la pantalla toman lo nuevo (el último comentario y cuántos hay)
                const last = comments.length ? comments[comments.length - 1].t : null;
                if (colAt >= 0) st.data.rows[r][colAt] = last;
                if (st.data.cm && st.data.cm[dataKey]) st.data.cm[dataKey].n[r] = comments.length;
                td.innerHTML = commentInner(comments.length, last);
                Dashboard.showToast(t('main.anCmAdded'), 'success');
            } catch (err) { showError(errorText(err.body)); } finally { btn.disabled = false; }
        });
    });
}
// La ventana de una columna de comentarios (nombre y clasificación): lo que se escribe en cada renglón no va aquí.
function openCommentColumnDialog(editId) {
    const added = (st.design.added || []);
    const editing = editId ? added.find((a) => a.id === editId) : null;
    const draft = { name: editing ? editing.name : '', cls: editing ? (editing.cls || '') : '' };
    const dup = st.design.dedupe === 'con';
    const html = `<h3>${esc(t(editing ? 'main.anCmEditTitle' : 'main.anCmTitle'))}</h3>
        <p class="admin-hint">${esc(t('main.anCmHint'))}</p>${dup ? `<p class="admin-hint an-cm-warn">${esc(t('main.anCmDupWarn'))}</p>` : ''}
        <div class="an-f2">
            <div><label for="an-cm-name">${esc(t('main.anColLabel'))}</label><input type="text" id="an-cm-name" maxlength="80" autocomplete="off" value="${esc(draft.name)}"></div>
            <div><label for="an-cm-cls">${esc(t('main.anAddedClass'))}</label><input type="text" id="an-cm-cls" maxlength="40" autocomplete="off" list="an-cm-cls-list" placeholder="${esc(t('main.anAddedClassNone'))}" value="${esc(draft.cls)}"><datalist id="an-cm-cls-list">${classKnown().map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
        </div>
        <p class="admin-error" id="an-cm-cerror" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t(editing ? 'main.anAddedSave' : 'main.anAddedGo'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay, close) => {
        const $ = (sel) => overlay.querySelector(sel);
        setTimeout(() => $('#an-cm-name').focus(), 0);
        $('[data-an-go]').addEventListener('click', async () => {
            const err = (text) => { const el = $('#an-cm-cerror'); el.textContent = text; el.hidden = !text; };
            const name = $('#an-cm-name').value.trim(); const cls = $('#an-cm-cls').value.trim();
            if (!name) return err(t('main.anErr_ADDED_NAME'));
            if (!editing && added.length >= 40) return err(t('main.anErr_ADDED_TOO_MANY'));
            const def = { id: editing ? editing.id : `a${Date.now().toString(36)}`, kind: 'comment', name, cls, color: cls ? colorOfClass(cls, editing) : null, decimals: null };
            const next = editing ? added.map((a) => (a.id === editing.id ? def : a)) : [...added, def];
            try { await saveAdded(next); close(); } catch (e) { err(errorText(e.body)); }
        });
    });
}
function drawAllFileRows() { drawFileRows(Infinity); return Promise.resolve(true); }
function watchFileScroll(wrapper) {
    if (!wrapper || wrapper.dataset.anScroll) return;
    wrapper.dataset.anScroll = '1';
    wrapper.addEventListener('scroll', () => {
        if (st.view && st.drawn < st.view.length && wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 800) drawFileRows(NEXT_ROWS);
    }, { passive: true });
}
// El aviso de abajo: «Mostrando X de Y» con los botones para dibujar más mientras falten renglones; si ya están todos los que llegaron pero el análisis tiene más, avisa que son los primeros.
function updateFileNote() {
    const body = st.data;
    const wrapper = wrapperOf(FILE_TABLE);
    let note = document.getElementById('an-truncated');
    const partial = !!body && !!st.view && st.drawn < st.view.length;
    if (!body || !wrapper || (!partial && !body.truncated)) { if (note) note.remove(); return; }
    if (!note) { note = document.createElement('p'); note.id = 'an-truncated'; note.className = 'admin-hint reg-more'; wrapper.after(note); }
    note.textContent = '';
    const text = document.createElement('span');
    text.textContent = partial ? t('main.regShowing', { shown: num(st.drawn), total: num(body.total) }) : t('main.anTruncated', { shown: body.rows.length, total: num(body.total) });
    note.appendChild(text);
    if (partial) {
        // «Mostrar todos» dibuja de golpe lo que falta (con 40 columnas, 5,000 renglones son 200,000 celdas y la página se congelaba): solo se ofrece cuando es poco; si no, quedan «Mostrar más», el orden, el filtro y la descarga
        const heavy = st.view.length * ((st.data && st.data.columns.length) || 1) > 60000;
        [['main.regShowMore', () => drawFileRows(NEXT_ROWS)], ...(heavy ? [] : [['main.regShowAll', () => drawAllFileRows()]])].forEach(([key, action]) => {
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
        wrapper.after(note); // debajo de la tabla: el icono de descargar y los demás se buscan en el elemento que está ANTES de la tabla
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
        const qs = `?${fileQuery()}`; // el filtro y el orden que ya estaban puestos se conservan al volver a leer
        const res = await fetch(e.live ? `${API}/${st.id}/live${qs}` : `${API}/${st.id}/extractions/${e.id}/data${qs}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        st.data = await res.json();
        const cols = st.data.columns;
        const columns = [
            ...cols.map((c) => {
                if (c.group === 'reference') return c.label ? { col: colKeyOf(c.key), group: 'main.anGroupRef', typeBand: 'main.anBandBase', label: c.label, cls: c.isKey ? 'an-ref an-ref-key' : 'an-ref' } : { col: colKeyOf(c.key), group: 'main.anGroupRef', typeBand: 'main.anBandBase', labelKey: `main.regDim_${c.dim}`, cls: 'an-ref' };
                if (c.group === 'added') {
                    let groupTable;
                    if (c.cls) { groupTable = `ancls:${foldCls(c.cls).replace(/\s+/g, '-')}`; if (Dashboard.setColumnClassMeta) Dashboard.setColumnClassMeta(groupTable, c.cls, window.AnalysisKit.classColor(c.color)); }
                    // el tipo de la columna ya no va como una letra pegada al nombre: sube a la franja de arriba con su palabra (Daniel, 2026-11-27, «la A»)
                    return { col: colKeyOf(c.key), group: 'main.anGroupAdded', groupTable, label: c.label, typeBand: `main.anBand${c.kind === 'criterion' ? 'Criterion' : (c.kind === 'comment' ? 'Comment' : (c.kind === 'block' ? 'Block' : 'Fx'))}`, cls: c.kind === 'criterion' ? 'an-added' : 'an-added col-num' };
                }
                // una columna consultada con clasificación va bajo su propia banda (nombre y color de la persona); sin clasificación, bajo «Consultadas» como siempre
                let consBand;
                if (c.cls) { consBand = `ancls:${foldCls(c.cls).replace(/\s+/g, '-')}`; if (Dashboard.setColumnClassMeta) Dashboard.setColumnClassMeta(consBand, c.cls, window.AnalysisKit.classColor(c.color)); }
                return { col: colKeyOf(c.key), group: 'main.anGroupCons', groupTable: consBand, typeBand: 'main.anBandCons', label: c.label, cls: 'an-cons col-num', title: c.liveTitle ? t('main.an2LiveToday', { label: c.liveTitle }) : '' };
            }),
        ];
        const first = buildHeader(FILE_TABLE, columns);
        const tbody = tableOf(FILE_TABLE).tBodies[0];
        tbody.innerHTML = '';
        st.filePlan = fileCellPlan(cols);
        st.numCols = new Set(st.filePlan.filter((p) => p.numeric || /col-num/.test(p.cls)).map((p) => p.key)); // las columnas con números (la fila de totales ofrece suma, promedio…)
        buildView();
        st.drawn = 0;
        drawFileRows(FIRST_ROWS); // el resto se dibuja por partes: dibujar los 5,000 renglones de golpe tardaba más de 5 segundos en el navegador
        ensureEmpty(FILE_TABLE, columns.length);
        // el acomodo de columnas es POR ANÁLISIS y hay un acomodo ORIGINAL que ve quien lo abra sin haberse acomodado nada (Daniel, 2026-11-27, «Sí a las recomendadas»)
        if (first) {
            wrapper.dataset.layoutScope = String(st.id);
            if (Dashboard.registerOriginalLayout) Dashboard.registerOriginalLayout(FILE_TABLE, { get: () => (st.analysis.design && st.analysis.design.layout) || null, canEdit: () => !!st.canCreate, save: saveOriginalLayout });
        }
        if (first && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper, 1);
        if (first && Dashboard.registerPartialTable) Dashboard.registerPartialTable(FILE_TABLE, { isComplete: () => !st.data || !st.view || st.drawn >= st.view.length, loadAll: drawAllFileRows, dataMode: true, sortRows: setFileSort, rowIndexes: () => (st.view || []).slice() });
        // el filtro por columna y sus listas de valores los resuelve el servidor sobre todos los renglones (queryRows, fileColumnValues)
        if (first && Dashboard.registerServerFilteredTable) Dashboard.registerServerFilteredTable(FILE_TABLE, { onChange: (spec) => { st.cf = spec; queryRows(); }, getValues: fileColumnValues });
        // la fila de totales (Daniel, 2026-11-27): el servidor suma y cuenta TODOS los renglones que pasan el filtro y la búsqueda
        if (first && Dashboard.registerTotalsRow) Dashboard.registerTotalsRow(FILE_TABLE, { scope: () => String(st.id), canUse: () => !!st.canTotals, isNumeric: (key) => st.numCols.has(key), rowsInfo: fileTotalsInfo, compute: computeFileTotals });
        watchFileScroll(wrapper);
        // el aspecto de cada columna (negrita, colores, bordes…) se pone después de armar la tabla
        cols.forEach((c) => { if (c.group === 'consulted' && c.style) window.AnalysisKit.applyLook(tableOf(FILE_TABLE), colKeyOf(c.key), c.style); });
        setupFileFormat(tableOf(FILE_TABLE), cols); // el formato de cada encabezado y su menú ⋮ (va después del aspecto de la columna: el ⋮ manda)
        if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(FILE_TABLE);
        if (Dashboard.refreshTotalsRow) Dashboard.refreshTotalsRow(FILE_TABLE);
        wrapper.setAttribute('data-help-key', 'anFile');
        if (Dashboard.attachTableDownloadButton) Dashboard.attachTableDownloadButton(FILE_TABLE, { getKind: () => 'analysis', getTitle: () => `${st.analysis.name}_${e.live ? t('main.an2Live') : `v${e.version}`}`, getNotice: (format) => (st.data && st.data.truncated && !(format === 'xlsx' && fullDownloadApplies()) ? t('main.anDownloadTruncated', { shown: st.data.rows.length, total: num(st.data.total) }) : ''), buildXlsx: buildAnalysisXlsx });
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
window.AnalysisPage = { st, t, esc, modal, regName, registryByKey, colorOfClass, classKnown, CLASS_COLORS, errorText, saveColumns, removeFileColumn, paintClass, kit: window.AnalysisKit };
})();
