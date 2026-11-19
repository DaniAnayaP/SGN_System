// ---------------------------------------------------------------------------
// Actividades de cada nivel de la Implementación Inicial (pieza 1 del «Cronograma con actividades»). Lo comparten el Cronograma del cliente (OpTIImplCronograma.js) y el modal «Cronograma» de SaaS (Admin-Implementaciones.js):
// el dibujo de una actividad, el formulario en línea y las llamadas (agregar, cambiar, cambiar de estado y quitar). El servidor decide quién puede qué y manda `can` por nivel y `actions` por actividad (server.js): aquí solo
// se dibuja lo que viene permitido. Cada página dice a qué rutas llamar y qué hacer con la respuesta (configure). Módulo global: ImplActivities. Se carga después de Dashboard.js (usa Dashboard.t, confirm y showToast).
// ---------------------------------------------------------------------------
(function () {
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
// «2026-03-16» → fecha de calendario sin correrla por zonas horarias.
const dayOf = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
const shortDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '');
// «2026-03-18 15:04:05» (UTC) → el día en la hora de quien lo ve.
const stampDay = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }); };

// ctx = lo que pone cada página: { levelsBase, activitiesBase (rutas), getData() → { implementation, people }, onChange(json), rerender(), reload() }
let ctx = null;
// El formulario abierto (uno a la vez): { levelKey, id (null = actividad nueva), values, error, busy }
let form = null;
const configure = (options) => { ctx = options; };
const isEditing = () => !!form;
const closeForm = () => { form = null; };

// ---- llamadas ------------------------------------------------------------------------------------------------------------------------------------------
async function call(method, path, body) {
    const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
const request = (op, p) => ({
    add: () => call('POST', `${ctx.levelsBase}/${encodeURIComponent(p.levelKey)}/activities`, p.fields),
    update: () => call('PATCH', `${ctx.activitiesBase}/${p.id}`, p.fields),
    status: () => call('POST', `${ctx.activitiesBase}/${p.id}/status`, { status: p.status }),
    remove: () => call('DELETE', `${ctx.activitiesBase}/${p.id}`),
}[op])();
// El texto de un error del servidor en el idioma de la pantalla (por su código).
function errorText(err) {
    const code = err && err.body && err.body.code;
    const key = `main.implActErr_${code}`;
    const text = Dashboard.t(key);
    return text !== key ? text : t('main.implActErr_default');
}
// Estos errores quieren decir que lo que se ve ya no es lo que hay: se vuelve a leer.
const STALE_CODES = ['NOT_FOUND', 'CLOSED', 'FORBIDDEN', 'LOCKED', 'LEVEL_NA', 'ALREADY'];
function fail(err) {
    if (err && err.body && STALE_CODES.includes(err.body.code)) { form = null; Promise.resolve(ctx.reload()).catch(() => {}); }
    Dashboard.showToast(errorText(err), 'error');
}

// ---- dibujo --------------------------------------------------------------------------------------------------------------------------------------------
const STATUS_TONE = { pending: 'cancelled', running: 'negotiating', done: 'approved' };
const statusText = (a) => t(`main.implActStatus_${a.status}`);
// El punto del estado (pendiente / en curso / hecha), con su texto para quien no lo ve de color.
const dot = (a) => `<span class="impl-dot impl-dot-${esc(a.status)}" role="img" aria-label="${esc(statusText(a))}" title="${esc(statusText(a))}"></span>`;
const addedTag = (a) => `<span class="impl-tag impl-tag-added" title="${esc(t('main.implActAddedBy', { by: a.createdBy || '—', date: stampDay(a.createdAt) }))}">${esc(t('main.implActAdded'))}</span>`;
const systemTag = () => `<span class="impl-tag impl-tag-system">${esc(t('main.implActSystem'))}</span>`;
const datesText = (a) => (a.startDate ? `${shortDate(a.startDate)} – ${shortDate(a.endDate)}` : t('main.implNoLevelDates'));
const statusChip = (a) => `<span class="exp-chip exp-chip-${STATUS_TONE[a.status] || 'cancelled'}">${esc(statusText(a))}</span>${a.late ? ` <span class="exp-chip exp-chip-pending">${esc(t('main.implActLate'))}</span>` : ''}`;
const outsideTag = (a) => (a.outsidePlan ? `<span class="impl-tag" title="${esc(t('main.implActOutside'))}">${esc(t('main.implActOutside'))}</span>` : '');
// Los contadores del nivel: cuántas actividades lleva y, si hay pendientes, un aviso discreto.
function counters(level) {
    if (!level.activitiesTotal) return '';
    const chips = [`<span class="impl-cnt">${esc(t('main.implActCount', { n: level.activitiesTotal }))}</span>`];
    if (level.activitiesPending) chips.push(`<span class="impl-cnt impl-cnt-hot">${esc(level.activitiesPending === 1 ? t('main.implActPendingOne') : t('main.implActPendingMany', { n: level.activitiesPending }))}</span>`);
    return `<span class="impl-cnts" data-help-key="implActToggle">${chips.join('')}</span>`;
}
// Los iconos de lo que se puede hacer con una actividad (según los `actions` que manda el servidor).
function actionButtons(a) {
    const acts = a.actions || {};
    const btn = (op, icon, labelKey, status) => `<button type="button" class="admin-icon-btn impl-act-btn${op === 'remove' ? ' admin-icon-btn-danger' : ''}" data-impl-act="${op}" data-id="${a.id}"${status ? ` data-status="${status}"` : ''} aria-label="${esc(t(labelKey))}" title="${esc(t(labelKey))}"><i class="bx ${icon}" aria-hidden="true"></i></button>`;
    const out = [];
    if (acts.status) {
        if (a.status === 'pending') out.push(btn('status', 'bx-play', 'main.implActMarkRunning', 'running'));
        if (a.status !== 'done') out.push(btn('status', 'bx-check', 'main.implActMarkDone', 'done'));
        if (a.status !== 'pending') out.push(btn('status', 'bx-undo', 'main.implActMarkPending', 'pending'));
    }
    if (acts.edit) out.push(btn('edit', 'bx-edit-alt', 'main.implActEdit'));
    if (acts.remove) out.push(btn('remove', 'bx-trash', 'main.implActRemove'));
    return out.length ? `<span class="impl-act-btns" data-help-key="implActActions">${out.join('')}</span>` : '';
}
// La celda del nombre (cronograma del cliente): punto, nombre y etiqueta «Agregada», y debajo el responsable y los iconos.
const nameBlock = (a) => `<span class="impl-act-line"><span class="impl-act-t">${dot(a)}<span class="impl-act-name"><b>${esc(a.title)}</b> ${addedTag(a)}</span></span></span>
    <span class="impl-act-line impl-act-sub"><span class="impl-act-who">${esc(a.responsible || t('main.implActNoResponsible'))}</span>${actionButtons(a)}</span>`;
// La celda de fechas y estado (cronograma del cliente).
const stateBlock = (a) => `${statusChip(a)}<span class="impl-dates">${esc(datesText(a))}</span>${outsideTag(a)}${a.status === 'done' && a.doneAt ? `<span class="impl-hint">${esc(t('main.implActDoneBy', { date: stampDay(a.doneAt), by: a.doneBy || '—' }))}</span>` : ''}`;
const addButton = (level) => `<button type="button" class="impl-add" data-impl-act="add" data-level="${esc(level.key)}" data-help-key="implActAdd"><span class="impl-plus" aria-hidden="true">+</span>${esc(t('main.implActAdd'))}</button>`;

// El formulario en línea (agregar o editar): actividad, responsable (con la lista de personas de la compañía, escribible) y las dos fechas.
function formFor(level) {
    if (!form || form.levelKey !== level.key) return '';
    const data = ctx.getData();
    const v = form.values;
    return `<form class="impl-form" data-impl-form="${esc(level.key)}" novalidate data-help-key="implActAdd">
        <h4>${esc(form.id ? t('main.implActFormEdit') : t('main.implActFormNew', { n: level.position }))}</h4>
        <div class="impl-form-grid">
            <div class="admin-field impl-f-wide"><label for="impl-af-title">${esc(t('main.implActFieldTitle'))}</label><input id="impl-af-title" name="title" type="text" maxlength="120" required autocomplete="off" value="${esc(v.title)}"></div>
            <div class="admin-field impl-f-resp"><label for="impl-af-resp">${esc(t('main.implActFieldResponsible'))}</label><input id="impl-af-resp" name="responsible" type="text" maxlength="80" list="impl-af-people" autocomplete="off" placeholder="${esc(t('main.implActResponsibleHint'))}" value="${esc(v.responsible)}"><datalist id="impl-af-people">${(data.people || []).map((name) => `<option value="${esc(name)}"></option>`).join('')}</datalist></div>
            <div class="admin-field"><label for="impl-af-from">${esc(t('main.implActFieldFrom'))}</label><input id="impl-af-from" name="startDate" type="date" value="${esc(v.startDate)}"></div>
            <div class="admin-field"><label for="impl-af-to">${esc(t('main.implActFieldTo'))}</label><input id="impl-af-to" name="endDate" type="date" value="${esc(v.endDate)}"></div>
        </div>
        <p class="admin-error impl-form-error" role="alert"${form.error ? '' : ' hidden'}>${esc(form.error)}</p>
        <div class="admin-form-actions"><button type="submit" class="btn"${form.busy ? ' disabled' : ''}>${esc(t('main.implActSave'))}</button><button type="button" class="btn btn-secondary" data-impl-act="cancel">${esc(t('main.implActCancel'))}</button></div>
    </form>`;
}
// El bloque completo de un nivel en una lista (modal de SaaS): sus actividades, el formulario y el botón de agregar.
function block(level) {
    const rows = level.activities.map((a) => `<div class="impl-act" data-impl-activity="${a.id}">
        <div class="impl-act-main"><span class="impl-act-t">${dot(a)}<span class="impl-act-name"><b>${esc(a.title)}</b> ${addedTag(a)}</span></span>${statusChip(a)}</div>
        <div class="impl-act-sub"><span class="impl-act-who">${esc(a.responsible || t('main.implActNoResponsible'))} · ${esc(datesText(a))} ${outsideTag(a)}</span>${actionButtons(a)}</div>
    </div>`).join('');
    const open = form && form.levelKey === level.key;
    const add = !open && level.can && level.can.add ? addButton(level) : '';
    const html = `${rows}${formFor(level)}${add}`;
    return html ? `<div class="impl-acts-block" data-help-key="implActRow"><h5 class="impl-acts-h">${esc(t('main.implActLabel'))}</h5>${html}</div>` : '';
}

// ---- acciones ------------------------------------------------------------------------------------------------------------------------------------------
function findActivity(id) {
    const impl = ctx.getData().implementation;
    for (const level of (impl && impl.levels) || []) {
        const activity = level.activities.find((a) => a.id === id);
        if (activity) return { level, activity };
    }
    return null;
}
function openForm(levelKey, activity) {
    form = { levelKey, id: activity ? activity.id : null, values: { title: activity ? activity.title : '', responsible: activity ? activity.responsible : '', startDate: activity ? activity.startDate : '', endDate: activity ? activity.endDate : '' }, error: '', busy: false };
    ctx.rerender();
    setTimeout(() => { const el = document.getElementById('impl-af-title'); if (el) el.focus(); }, 0);
}
async function changeStatus(id, status) {
    try { ctx.onChange(await request('status', { id, status })); } catch (err) { fail(err); }
}
async function removeActivity(id) {
    const found = findActivity(id);
    if (!found) return;
    if (!(await Dashboard.confirm(t('main.implActRemoveConfirm', { title: found.activity.title })))) return;
    try {
        const json = await request('remove', { id });
        if (form && form.id === id) form = null;
        Dashboard.showToast(t('main.implActRemoved'), 'success');
        ctx.onChange(json);
    } catch (err) { fail(err); }
}
// Lo que se puede revisar sin preguntarle al servidor (él lo vuelve a revisar): la actividad es obligatoria, las fechas van las dos o ninguna y el fin no va antes del inicio.
function localProblem(f) {
    if (!f.title.trim()) return 'TITLE';
    if ((f.startDate && !f.endDate) || (!f.startDate && f.endDate)) return 'DATES';
    if (f.startDate && f.endDate < f.startDate) return 'RANGE';
    return '';
}
function showFormError(root, text) {
    form.error = text;
    const el = root.querySelector('.impl-form-error');
    if (el) { el.textContent = text; el.hidden = !text; }
    const submit = root.querySelector('[data-impl-form] button[type="submit"]');
    if (submit) submit.disabled = false;
}
async function submitForm(root, formEl) {
    if (!form || form.busy) return;
    const f = { title: formEl.elements.title.value, responsible: formEl.elements.responsible.value, startDate: formEl.elements.startDate.value, endDate: formEl.elements.endDate.value };
    form.values = { ...f };
    const problem = localProblem(f);
    if (problem) { showFormError(root, t(`main.implActErr_${problem}`)); return; }
    form.busy = true;
    form.error = '';
    const submit = formEl.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    const el = formEl.querySelector('.impl-form-error');
    if (el) el.hidden = true;
    try {
        const json = form.id ? await request('update', { id: form.id, fields: f }) : await request('add', { levelKey: form.levelKey, fields: f });
        form = null;
        Dashboard.showToast(t('main.implActSaved'), 'success');
        ctx.onChange(json);
    } catch (err) {
        if (form) form.busy = false;
        if (err && err.body && STALE_CODES.includes(err.body.code)) fail(err);
        else if (form) showFormError(root, errorText(err));
        else Dashboard.showToast(errorText(err), 'error');
    }
}
// Se conecta UNA vez a un contenedor que no se reemplaza (el cronograma del cliente) o al de cada ventana (SaaS): lo demás es delegación de eventos.
function bind(root) {
    if (root.dataset.implActBound) return;
    root.dataset.implActBound = '1';
    root.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-impl-act]');
        if (!btn || !root.contains(btn) || !ctx) return;
        const op = btn.dataset.implAct;
        const id = Number(btn.dataset.id);
        if (op === 'add') openForm(btn.dataset.level, null);
        else if (op === 'cancel') { form = null; ctx.rerender(); }
        else if (op === 'edit') { const found = findActivity(id); if (found) openForm(found.level.key, found.activity); }
        else if (op === 'status') changeStatus(id, btn.dataset.status);
        else if (op === 'remove') removeActivity(id);
    });
    root.addEventListener('input', (event) => {
        const input = event.target;
        if (!form || !input.name || !input.closest('[data-impl-form]')) return;
        form.values[input.name] = input.value;
    });
    root.addEventListener('submit', (event) => {
        const formEl = event.target.closest('[data-impl-form]');
        if (!formEl || !ctx) return;
        event.preventDefault();
        submitForm(root, formEl);
    });
}

window.ImplActivities = { configure, bind, isEditing, closeForm, formFor, block, counters, nameBlock, stateBlock, addButton, systemTag, dot, statusChip, datesText };
})();
