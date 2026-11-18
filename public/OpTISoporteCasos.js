// ---------------------------------------------------------------------------
// TI > Operaciones TI > Operaciones > Casos de soporte: la lista de las solicitudes de soporte de la empresa (un renglón por caso, con su folio SP-0001) y el botón «Nueva solicitud».
// La solicitud pide: qué pasó, la categoría, qué implica (cada impacto del Mapa de soporte con su nivel: Ninguno, Bajo, Medio o Alto), cuándo afecta y si puede seguir trabajando; de ahí sale la PRIORIDAD (se ve en vivo, con las
// reglas de SupportRules.js, y el servidor la vuelve a calcular), el nivel donde entra y el plazo de la primera respuesta. Además pide las evidencias de su categoría: datos que se escriben, capturas, archivos y la
// GRABACIÓN DE PANTALLA con un botón (SupportRecorder.js). Primero se crea el caso y luego se suben las evidencias una por una. Las evidencias no se editan ni se borran: se ven en la pantalla de cada caso (OpTISoporteCaso.js, que también trae el chat y el
// recorrido; las evidencias solo con la columna Evidencias en el árbol, o quien abrió el caso). Trae las columnas de Control Interno. Las filas salen del servidor (GET /api/business/support-cases).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'casos-soporte';
const API = '/api/business/support-cases';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['colSpFolio', 'colSpReporto', 'colSpPantalla', 'colSpResumen', 'colSpCategoria', 'colSpTipo', 'colSpGeneral', 'colSpPrioridad', 'colSpNivel', 'colSpEstatus'];
const SR = window.SupportRules;
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const locale = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
function friendlyMinutes(m) {
    const n = Number(m);
    if (!n) return t('main.msNoLimit');
    if (n % 1440 === 0) return `${n / 1440} d`;
    if (n % 60 === 0) return `${n / 60} h`;
    return `${n} min`;
}
let canCreate = false;
let canFiles = false;
let formOptions = null;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Casos de soporte failed to initialize:', err);
    }
})();

// ---- tabla --------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function tagCell(col, className, dataKey, text, title) {
    const td = document.createElement('td');
    td.dataset.col = col;
    const tag = document.createElement('span');
    tag.className = className;
    if (dataKey !== null) tag.dataset.k = dataKey;
    tag.textContent = text;
    if (title) tag.title = title;
    td.appendChild(tag);
    return td;
}
function timeCell(col, iso) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (!iso) { td.textContent = '—'; return td; }
    td.textContent = new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    td.title = `UTC ${iso.replace('T', ' ').replace('Z', '')}`;
    return td;
}
// «Responder antes de»: la hora límite de la primera respuesta; en rojo si ya pasó y el caso sigue abierto.
function dueCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colSpResponder';
    td.setAttribute('data-help-key', 'spResponder');
    if (r.firstResponseAt) {
        td.textContent = `✓ ${new Date(r.firstResponseAt).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
        td.className = 'sp-ok-text';
        td.title = `${t('main.scFirstResponse')} · UTC ${r.firstResponseAt.replace('T', ' ').replace('Z', '')}`;
        return td;
    }
    if (!r.dueAt) { td.textContent = t('main.msNoLimit'); td.className = 'sp-muted'; return td; }
    td.textContent = new Date(r.dueAt).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    td.title = `UTC ${r.dueAt.replace('T', ' ').replace('Z', '')}`;
    if (r.status === 'open' && Date.now() > new Date(r.dueAt).getTime()) {
        const tag = document.createElement('span');
        tag.className = 'sp-overdue';
        tag.textContent = t('main.spOverdue');
        td.append(' ', tag);
    }
    return td;
}
function filesCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colSpEvidencias';
    td.setAttribute('data-help-key', 'spEvidenciasCol');
    if (!r.fileCount) { td.textContent = '0'; td.className = 'sp-muted'; return td; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-files-btn';
    btn.innerHTML = `<i class="bx bx-paperclip" aria-hidden="true"></i> ${r.fileCount}`;
    btn.setAttribute('aria-label', t('main.spViewFiles'));
    btn.addEventListener('click', () => openViewer(r.id));
    td.appendChild(btn);
    return td;
}
function actionsCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'admin-icon-btn';
    view.setAttribute('data-help-key', 'spVer');
    view.setAttribute('aria-label', t('main.spViewCase'));
    view.title = t('main.spViewCase');
    view.innerHTML = '<i class="bx bx-show" aria-hidden="true"></i>';
    view.addEventListener('click', () => openViewer(r.id));
    td.appendChild(view);
    return td;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    const system = r.system || {};
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, system[key], 'col-system')),
        cell('colCatRegistroUnico', r.folio, 'col-system'),
        cell('colSpFolio', r.folio), timeCell('colSpFechaHora', r.createdAt), cell('colSpReporto', r.reporter), cell('colSpPantalla', r.screen), cell('colSpResumen', r.summary), cell('colSpCategoria', r.category),
        tagCell('colSpTipo', 'sp-tag sp-type', r.type, t(`main.spType_${r.type}`)),
        r.general ? tagCell('colSpGeneral', 'sp-tag sp-general', null, r.general.folio) : cell('colSpGeneral', '—'),
        tagCell('colSpPrioridad', 'sp-tag sp-pri', String(r.priority), t(`main.msPri_${r.priority}`)),
        tagCell('colSpNivel', 'sp-tag sp-lv', r.level, t(`main.sopLevel_${r.level}`)),
        tagCell('colSpEstatus', 'sp-tag sp-status', r.status, t(`main.spStatus_${r.status}`)),
        dueCell(r), filesCell(r),
    );
    tr.appendChild(actionsCell(r));
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
    td.colSpan = document.querySelectorAll('table.data-table thead th').length;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}
const ROW_CHUNK = 100;
let renderToken = 0;
const nextTurn = () => (window.scheduler && window.scheduler.yield ? window.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
async function refreshTable() {
    const tbody = getTbody();
    const token = ++renderToken;
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== renderToken) return;
        canCreate = !!body.canCreate;
        canFiles = !!body.canFiles;
        document.getElementById('sp-new-btn').hidden = !canCreate;
        tbody.innerHTML = '';
        if (!body.cases.length) { ensureEmptyState(); return; }
        for (let from = 0; from < body.cases.length; from += ROW_CHUNK) {
            if (token !== renderToken) return;
            const fragment = document.createDocumentFragment();
            body.cases.slice(from, from + ROW_CHUNK).forEach((r) => fragment.appendChild(buildRow(r)));
            tbody.appendChild(fragment);
            if (from + ROW_CHUNK < body.cases.length) await nextTurn();
        }
        if (token !== renderToken) return;
        applyFilters();
    } catch (err) {
        console.error('Casos de soporte: failed to load cases', err);
    }
}
function applyFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = SEARCH_COLUMNS.map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '').join(' ');
        tr.hidden = !SearchSyntax.matches('contains', text, haystack);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);

// ---- un caso: lo abre su propia pantalla (chat, recorrido y evidencias) ------------------------------------------------------------------------------
const openViewer = (caseId) => { location.href = `OpTISoporteCaso.html?id=${caseId}`; };
// Sube UNA evidencia (el archivo tal cual). Regresa { ok, message }.
async function uploadOne(caseId, { blob, name, evidenceId }) {
    try {
        const headers = { 'Content-Type': blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(name) };
        if (evidenceId) headers['X-Evidence-Id'] = String(evidenceId);
        const res = await fetch(`${API}/${caseId}/files`, { method: 'POST', headers, credentials: 'include', body: blob });
        const body = await res.json().catch(() => ({}));
        return res.ok ? { ok: true } : { ok: false, message: body.message || Dashboard.t('admin.saveError') };
    } catch (err) {
        return { ok: false, message: Dashboard.t('admin.saveError') };
    }
}

// ---- Nueva solicitud ---------------------------------------------------------------------------------------------------------------------------
let formEl = null;
let form = null; // { categoryId, impacts: Map(name → level), when, keep, slots: Map(evidenceId → {blob, name}), extras: [{blob, name}], rec, sending }
const WHEN_KEYS = ['now', 'today', 'week', 'none'];
async function loadFormOptions() {
    const res = await fetch(`${API}/form`, { credentials: 'include' });
    if (!res.ok) throw new Error('form failed');
    formOptions = await res.json();
    // las pantallas del sistema (de los departamentos de la empresa) para elegir cuál era y qué se quería hacer; sin ellas se escribe con palabras
    formOptions.screens = [];
    try {
        const sr = await fetch(`${API}/screens`, { credentials: 'include' });
        if (sr.ok) {
            const list = (await sr.json()).screens;
            const base = list.map((s) => `${t(s.labelKey)}${s.categoryLabelKey ? ` · ${t(s.categoryLabelKey)}` : ''}`);
            const count = new Map();
            base.forEach((b) => count.set(b, (count.get(b) || 0) + 1));
            formOptions.screens = list.map((s, i) => ({ ...s, label: count.get(base[i]) > 1 ? `${base[i]} (${String(s.nodeId).replace(/^cat-[a-z]+-/, '')})` : base[i] })).sort((a, b) => a.label.localeCompare(b.label, locale()));
        }
    } catch (err) { /* sin lista: se escribe con palabras */ }
}
const categoryOf = () => (formOptions.categories.find((c) => c.id === form.categoryId) || null);
function priorityPreview() {
    const impacts = formOptions.impacts.map((i) => ({ name: i.name, level: form.impacts.get(i.name) || 0 }));
    const priority = SR.priorityOf(impacts, form.when);
    const cat = categoryOf();
    const level = SR.entryLevel(cat ? cat.kind : '', formOptions.map);
    const minutes = SR.firstResponseMinutes(priority, cat ? cat.firstResponseMin : 0, formOptions.map);
    return { priority, level, minutes };
}
function chipGroup(name, options, selected) {
    return `<div class="sp-chips" role="radiogroup" data-chips="${name}">${options.map(([value, label]) => `<button type="button" class="sp-chip${String(selected) === String(value) ? ' on' : ''}" role="radio" aria-checked="${String(selected) === String(value)}" data-chip-value="${esc(value)}">${esc(label)}</button>`).join('')}</div>`;
}
function renderForm() {
    const cat = categoryOf();
    const p = form.when ? priorityPreview() : null;
    const impactRows = formOptions.impacts.map((i) => `<div class="sp-impact"><div><b>${esc(i.name)}</b>${i.question ? `<small>${esc(i.question)}</small>` : ''}</div>${chipGroup(`impact:${i.name}`, [0, 1, 2, 3].map((l) => [l, t(`main.spLevel_${l}`)]), form.impacts.get(i.name) || 0)}</div>`).join('');
    const slots = cat ? cat.evidences.map((e) => slotHtml(e)).join('') : '';
    const extras = form.extras.map((x, i) => `<div class="sp-slot-row"><span>${esc(x.name)} <small class="sp-muted">${esc(fmtSize(x.blob.size))}</small></span><button type="button" class="ms-icon-btn" data-extra-remove="${i}" aria-label="${esc(t('main.msRemoveImpact'))}"><i class="bx bx-trash" aria-hidden="true"></i></button></div>`).join('');
    const missing = cat ? cat.evidences.filter((e) => (e.kind === 'data' ? !(form.answers.get(e.id) || '').trim() : !form.slots.has(e.id))).length : 0;
    formEl.querySelector('#sp-form-body').innerHTML = `
        <div class="sp-grid">
            <label class="sp-field sp-wide"><span>${esc(t('main.spFSummary'))} *</span><input type="text" id="sp-f-summary" maxlength="${formOptions.limits.summary}" value="${esc(form.summary)}"></label>
            ${screenPickerHtml()}
            <label class="sp-field sp-wide"><span>${esc(t('main.spFError'))}</span><textarea id="sp-f-error" rows="2" maxlength="${formOptions.limits.text}">${esc(form.errorText)}</textarea></label>
            <label class="sp-field sp-wide"><span>${esc(t('main.spFCategory'))} *</span><select id="sp-f-category"><option value="">${esc(t('main.spFChoose'))}</option>${formOptions.categories.map((c) => `<option value="${c.id}"${c.id === form.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        </div>
        <section class="sp-sec" data-help-key="spImpactos"><h4>${esc(t('main.spFImpact'))}</h4>${impactRows}</section>
        <section class="sp-sec" data-help-key="spCuando"><h4>${esc(t('main.spFWhen'))} *</h4>${chipGroup('when', WHEN_KEYS.map((k) => [k, t(`main.spWhen_${k}`)]), form.when)}
            <h4>${esc(t('main.spFKeep'))} *</h4>${chipGroup('keep', [['yes', t('main.spYes')], ['no', t('main.spNo')]], form.keep === null ? '' : (form.keep ? 'yes' : 'no'))}</section>
        <section class="sp-sec sp-calc" data-help-key="spPrioridad">${p ? `<b>${esc(t('main.spFPriority'))}:</b> <span class="sp-tag sp-pri" data-k="${p.priority}">${esc(t(`main.msPri_${p.priority}`))}</span>
            <span class="sp-muted">${esc(t('main.spFEnters'))}: ${esc(t(`main.sopLevel_${p.level}`))} · ${esc(t('main.spFFirst'))}: ${esc(friendlyMinutes(p.minutes))}</span>` : `<span class="sp-muted">${esc(t('main.spFPriorityHint'))}</span>`}</section>
        <section class="sp-sec" data-help-key="spEvidencias"><h4>${esc(t('main.spFEvidence'))}${cat && missing ? ` <span class="sp-overdue">${esc(t('main.spFMissing', { n: missing }))}</span>` : ''}</h4>
            ${cat ? (cat.evidences.length ? slots : `<p class="sp-muted">${esc(t('main.spFNoEvidence'))}</p>`) : `<p class="sp-muted">${esc(t('main.spFPickCategoryFirst'))}</p>`}
            <div class="sp-slot"><b>${esc(t('main.spFExtra'))}</b><div>${extras}</div><label class="btn btn-secondary"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.spFAdd'))}<input type="file" id="sp-f-extra" hidden></label></div></section>`;
    const send = formEl.querySelector('#sp-form-send');
    send.disabled = form.sending;
    send.textContent = form.sending ? t('main.spFSending') : t('main.spFSubmit');
}
function slotHtml(e) {
    const label = `<b>${esc(e.name)}</b>`;
    if (e.kind === 'data') return `<label class="sp-slot sp-field">${label}<input type="text" data-answer="${e.id}" maxlength="${formOptions.limits.answer}" value="${esc(form.answers.get(e.id) || '')}"></label>`;
    const have = form.slots.get(e.id);
    const state = have ? `<span class="sp-ok"><i class="bx bx-check" aria-hidden="true"></i> ${esc(have.name)} <small class="sp-muted">${esc(fmtSize(have.blob.size))}</small></span> <button type="button" class="ms-icon-btn" data-slot-clear="${e.id}" aria-label="${esc(t('main.msRemoveImpact'))}"><i class="bx bx-trash" aria-hidden="true"></i></button>` : '';
    if (e.kind === 'recording') {
        const rec = form.rec && form.rec.slot === e.id ? form.rec : null;
        const canRec = window.SupportRecorder && SupportRecorder.canRecord();
        const recUi = rec
            ? `<span class="sp-recbar"><span class="sp-recdot"></span><b>${esc(t('main.spFRecording'))} · ${esc(fmtClock(rec.seconds))} / ${esc(fmtClock(SupportRecorder.MAX_SECONDS))}</b><button type="button" class="btn" data-rec-stop="${e.id}">${esc(t('main.spFRecStop'))}</button></span>`
            : `${canRec ? `<button type="button" class="btn" data-rec-start="${e.id}" data-help-key="spGrabar"><i class="bx bx-radio-circle-marked" aria-hidden="true"></i> ${esc(t('main.spFRecord'))}</button>` : ''}
               <label class="btn btn-secondary"><i class="bx bx-video" aria-hidden="true"></i> ${esc(t('main.spFPickVideo'))}<input type="file" accept="video/*" data-slot-file="${e.id}" hidden></label>`;
        const preview = have ? `<video class="sp-preview" controls src="${URL.createObjectURL(have.blob)}"></video>` : '';
        return `<div class="sp-slot">${label}<div class="sp-slot-row">${recUi}${state}</div>${preview}${!canRec ? `<small class="sp-muted">${esc(t('main.spRecUnsupported'))}</small>` : ''}</div>`;
    }
    const accept = e.kind === 'capture' ? ' accept="image/*"' : '';
    return `<div class="sp-slot">${label}<div class="sp-slot-row"><label class="btn btn-secondary"><i class="bx bx-paperclip" aria-hidden="true"></i> ${esc(t('main.spFAttach'))}<input type="file"${accept} data-slot-file="${e.id}" hidden></label>${state}</div></div>`;
}
const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
// Pantalla y acción: de la lista del sistema (de ahí la Mesa de ayuda compara los accesos) o «otra / no sé» escrita con palabras.
function screenPickerHtml() {
    const free = `<label class="sp-field"><span>${esc(t('main.spFScreen'))}</span><input type="text" id="sp-f-screen" maxlength="120" value="${esc(form.screen)}"></label><label class="sp-field"><span>${esc(t('main.spFAction'))}</span><input type="text" id="sp-f-action" maxlength="120" value="${esc(form.action)}"></label>`;
    if (!formOptions.screens.length) return free;
    const picked = formOptions.screens.find((s) => s.id === form.screenId);
    const screenSel = `<label class="sp-field"><span>${esc(t('main.spFScreen'))}</span><select id="sp-f-screen-sel"><option value="">${esc(t('main.spFChoose'))}</option>${formOptions.screens.map((s) => `<option value="${esc(s.id)}"${s.id === form.screenId ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}<option value="__other"${form.screenId === '__other' ? ' selected' : ''}>${esc(t('main.spFOtherScreen'))}</option></select></label>`;
    const actionSel = picked ? `<label class="sp-field"><span>${esc(t('main.spFAction'))}</span><select id="sp-f-action-sel"><option value="">${esc(t('main.spFChoose'))}</option>${[...picked.actions].sort((a, b) => ['button', 'column', 'icon'].indexOf(a.kind) - ['button', 'column', 'icon'].indexOf(b.kind)).map((a) => `<option value="${esc(a.id)}"${a.id === form.actionId ? ' selected' : ''}>${esc(t(`main.supActKind_${a.kind}`))}: ${esc(t(a.labelKey))}</option>`).join('')}</select></label>` : '<div></div>';
    return form.screenId === '__other' ? `${screenSel}<div></div>${free}` : `${screenSel}${actionSel}`;
}
function newForm(prefill) {
    return { screenId: '', actionId: '', summary: '', screen: (prefill && prefill.screen) || '', action: (prefill && prefill.action) || '', errorText: (prefill && prefill.errorText) || '', categoryId: null, impacts: new Map(), when: '', keep: null, answers: new Map(), slots: new Map(), extras: [], rec: null, sending: false };
}
function closeForm() {
    if (form && form.rec) { try { form.rec.ctl.stop(); } catch (err) { /* ya terminó */ } }
    if (formEl) formEl.hidden = true;
    form = null;
}
async function openForm(prefill) {
    try { await loadFormOptions(); } catch (err) { Dashboard.showToast(Dashboard.t('admin.saveError'), 'error'); return; }
    if (!formEl) {
        formEl = document.createElement('div');
        formEl.className = 'modal-overlay';
        formEl.hidden = true;
        formEl.innerHTML = '<div class="modal-panel sp-form" role="dialog" aria-modal="true" aria-labelledby="sp-form-title"><h3 id="sp-form-title"></h3><div id="sp-form-body"></div><div class="admin-form-actions"><button type="button" class="btn" id="sp-form-send"></button><button type="button" class="btn btn-secondary" id="sp-form-cancel"></button></div></div>';
        document.body.appendChild(formEl);
        formEl.addEventListener('click', onFormClick);
        formEl.addEventListener('input', onFormInput);
        formEl.addEventListener('change', onFormChange);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && form && !form.sending) closeForm(); });
    }
    form = newForm(prefill);
    formEl.querySelector('#sp-form-title').textContent = t('main.spNewTitle');
    formEl.querySelector('#sp-form-cancel').textContent = t('main.spFCancel');
    renderForm();
    formEl.hidden = false;
}
function onFormInput(event) {
    const el = event.target;
    if (!form) return;
    if (el.id === 'sp-f-summary') form.summary = el.value;
    else if (el.id === 'sp-f-screen') form.screen = el.value;
    else if (el.id === 'sp-f-action') form.action = el.value;
    else if (el.id === 'sp-f-error') form.errorText = el.value;
    else if (el.dataset && el.dataset.answer) form.answers.set(Number(el.dataset.answer), el.value);
}
async function onFormChange(event) {
    const el = event.target;
    if (!form) return;
    if (el.id === 'sp-f-screen-sel') { form.screenId = el.value; form.actionId = ''; renderForm(); return; }
    if (el.id === 'sp-f-action-sel') { form.actionId = el.value; return; }
    if (el.id === 'sp-f-category') {
        form.categoryId = el.value ? Number(el.value) : null;
        form.slots = new Map(); form.answers = new Map();
        renderForm();
        return;
    }
    const file = el.files && el.files[0];
    if (el.id === 'sp-f-extra' || (el.dataset && el.dataset.slotFile)) {
        el.value = '';
        if (!file) return;
        const slotId = el.dataset && el.dataset.slotFile ? Number(el.dataset.slotFile) : null;
        let blob = file;
        if (file.type && file.type.startsWith('image/')) { try { blob = await Dashboard.compressImageToBlob(file); } catch (err) { blob = file; } }
        const kind = blob.type && blob.type.startsWith('image/') ? 'capture' : (blob.type && blob.type.startsWith('video/') ? 'recording' : 'file');
        const limit = formOptions.limits.bytes[kind];
        if (blob.size > limit) { Dashboard.showToast(t('main.spTooBig', { name: file.name, mb: Math.round(limit / 1048576) }), 'warning'); return; }
        const name = blob === file ? file.name : file.name.replace(/\.[^.]+$/, '') + (blob.type === 'image/png' ? '.png' : '.jpg');
        if (slotId) form.slots.set(slotId, { blob, name }); else form.extras.push({ blob, name });
        renderForm();
    }
}
async function onFormClick(event) {
    if (!form) return;
    if (event.target === formEl) { if (!form.sending) closeForm(); return; }
    if (event.target.closest('#sp-form-cancel')) { if (!form.sending) closeForm(); return; }
    if (event.target.closest('#sp-form-send')) { submitForm(); return; }
    const chip = event.target.closest('[data-chip-value]');
    if (chip) {
        const group = chip.closest('[data-chips]').dataset.chips;
        const value = chip.dataset.chipValue;
        if (group === 'when') form.when = value;
        else if (group === 'keep') form.keep = value === 'yes';
        else if (group.startsWith('impact:')) form.impacts.set(group.slice(7), Number(value));
        renderForm();
        return;
    }
    const clear = event.target.closest('[data-slot-clear]');
    if (clear) { form.slots.delete(Number(clear.dataset.slotClear)); renderForm(); return; }
    const rm = event.target.closest('[data-extra-remove]');
    if (rm) { form.extras.splice(Number(rm.dataset.extraRemove), 1); renderForm(); return; }
    const recStart = event.target.closest('[data-rec-start]');
    if (recStart) { startRecording(Number(recStart.dataset.recStart)); return; }
    const recStop = event.target.closest('[data-rec-stop]');
    if (recStop) { stopRecording(); }
}
// La grabación de pantalla: pide elegir qué pantalla grabar, cuenta los segundos y al terminar deja el video listo en su evidencia.
async function startRecording(slotId) {
    try {
        const ctl = await SupportRecorder.start({ onTick: (seconds) => { if (form && form.rec) { form.rec.seconds = seconds; const label = formEl.querySelector('.sp-recbar b'); if (label) label.textContent = `${t('main.spFRecording')} · ${fmtClock(seconds)} / ${fmtClock(SupportRecorder.MAX_SECONDS)}`; } } });
        form.rec = { slot: slotId, seconds: 0, ctl };
        ctl.done.then(({ blob }) => finishRecording(slotId, blob));
        renderForm();
    } catch (err) {
        Dashboard.showToast(t('main.spRecDenied'), 'warning');
    }
}
function stopRecording() { if (form && form.rec) form.rec.ctl.stop(); }
function finishRecording(slotId, blob) {
    if (!form) return;
    form.rec = null;
    const limit = formOptions.limits.bytes.recording;
    if (blob.size > limit) { Dashboard.showToast(t('main.spTooBig', { name: t('main.spFRecord'), mb: Math.round(limit / 1048576) }), 'warning'); renderForm(); return; }
    form.slots.set(slotId, { blob, name: `grabacion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm` });
    renderForm();
}
// Crea el caso y después sube las evidencias una por una (si alguna falla, el caso ya existe y se puede agregar desde la pantalla del caso).
async function submitForm() {
    if (!form || form.sending) return;
    const cat = categoryOf();
    const need = (cond, key) => { if (!cond) { Dashboard.showToast(t(key), 'warning'); return false; } return true; };
    if (!need(form.summary.trim(), 'main.spErrSummary') || !need(cat, 'main.spErrCategory') || !need(form.when, 'main.spErrWhen') || !need(form.keep !== null, 'main.spErrKeep')) return;
    if (form.rec) { Dashboard.showToast(t('main.spErrRecording'), 'warning'); return; }
    form.sending = true;
    renderForm();
    try {
        const answers = {};
        form.answers.forEach((text, id) => { if (String(text).trim()) answers[id] = String(text).trim(); });
        const res = await fetch(API, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ summary: form.summary.trim(), screen: form.screen, action: form.action, screenId: form.screenId && form.screenId !== '__other' ? form.screenId : undefined, actionId: form.screenId && form.screenId !== '__other' && form.actionId ? form.actionId : undefined, errorText: form.errorText, categoryId: cat.id, when: form.when, keepWorking: form.keep,
                impacts: formOptions.impacts.map((i) => ({ name: i.name, level: form.impacts.get(i.name) || 0 })), answers }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'warning'); form.sending = false; renderForm(); return; }
        const created = body.case;
        const queue = [...[...form.slots.entries()].map(([evidenceId, x]) => ({ ...x, evidenceId })), ...form.extras.map((x) => ({ ...x, evidenceId: null }))];
        const failed = [];
        for (const item of queue) {
            const result = await uploadOne(created.id, item);
            if (!result.ok) failed.push(t('main.spFileFailed', { name: item.name, why: result.message }));
        }
        closeForm();
        Dashboard.showToast(t('main.spSent', { folio: created.folio }), 'success');
        failed.forEach((m) => Dashboard.showToast(m, 'warning'));
        await refreshTable();
    } catch (err) {
        console.error('Casos de soporte: failed to send request', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        if (form) { form.sending = false; renderForm(); }
    }
}
document.getElementById('sp-new-btn')?.addEventListener('click', () => {
    const q = new URLSearchParams(location.search);
    openForm({ screen: q.get('screen') || '', action: q.get('action') || '', errorText: q.get('error') || '' });
});
})();
