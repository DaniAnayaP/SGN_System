// ---------------------------------------------------------------------------
// «Nueva solicitud» de Soporte: el formulario que pide qué pasó, la pantalla y la acción, la categoría, qué implica (cada impacto del Mapa de soporte con su nivel), cuándo afecta y si puede seguir trabajando, y las
// evidencias de la categoría (con grabación de pantalla). Lo usan la lista de Operaciones › Casos de soporte y la pantalla «Soporte» de todos los usuarios; cada una dice a qué rutas llamar y qué hacer al crearse
// el caso: SupportRequestForm.open(prefill, { form, screens, create, cases, onCreated }). Primero se crea el caso y luego se suben las evidencias una por una.
// ---------------------------------------------------------------------------
(function () {
const SR = window.SupportRules;
const DEFAULT_CFG = { form: '/api/business/support-cases/form', screens: '/api/business/support-cases/screens', create: '/api/business/support-cases', cases: '/api/business/support-cases', onCreated: null };
let cfg = DEFAULT_CFG;
let formOptions = null;
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
// Sube UNA evidencia (el archivo tal cual). Regresa { ok, message }.
async function uploadOne(caseId, { blob, name, evidenceId }) {
    try {
        const headers = { 'Content-Type': blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(name) };
        if (evidenceId) headers['X-Evidence-Id'] = String(evidenceId);
        const res = await fetch(`${cfg.cases}/${caseId}/files`, { method: 'POST', headers, credentials: 'include', body: blob });
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
    const res = await fetch(cfg.form, { credentials: 'include' });
    if (!res.ok) throw new Error('form failed');
    formOptions = await res.json();
    // las pantallas del sistema (de los departamentos de la empresa) para elegir cuál era y qué se quería hacer; sin ellas se escribe con palabras
    formOptions.screens = [];
    try {
        const sr = await fetch(cfg.screens, { credentials: 'include' });
        if (sr.ok) {
            const list = (await sr.json()).screens;
            const base = list.map((s) => `${t(s.labelKey)}${s.categoryLabelKey ? ` · ${t(s.categoryLabelKey)}` : ''}`);
            const count = new Map();
            base.forEach((b) => count.set(b, (count.get(b) || 0) + 1));
            formOptions.screens = list.map((s, i) => ({ ...s, label: count.get(base[i]) > 1 ? `${base[i]} (${String(s.nodeId).replace(/^cat-[a-z]+-/, '')})` : base[i] }));
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
            ${errorBlockHtml()}
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
// «Mensaje del error»: tres maneras de mostrarlo: escribirlo, subir una imagen o grabar la pantalla repitiendo la acción que dio el error (la imagen y el video llegan al caso como evidencias).
const errFileState = (file, which) => `<span class="sp-ok"><i class="bx bx-check" aria-hidden="true"></i> ${esc(file.name)} <small class="sp-muted">${esc(fmtSize(file.blob.size))}</small></span> <button type="button" class="ms-icon-btn" data-err-clear="${which}" aria-label="${esc(t('main.msRemoveImpact'))}"><i class="bx bx-trash" aria-hidden="true"></i></button>`;
function errorBlockHtml() {
    const modes = [['text', t('main.spFErrText')], ['image', t('main.spFErrImage')], ['record', t('main.spFRecord')]];
    const filled = (k) => (k === 'text' ? !!form.errorText.trim() : (k === 'image' ? !!form.errImage : !!form.errRec));
    const chips = `<div class="sp-chips" role="radiogroup" data-chips="errmode">${modes.map(([value, label]) => `<button type="button" class="sp-chip${form.errMode === value ? ' on' : ''}" role="radio" aria-checked="${form.errMode === value}" data-chip-value="${value}">${esc(label)}${filled(value) ? ' ✓' : ''}</button>`).join('')}</div>`;
    let panel;
    if (form.errMode === 'image') {
        const have = form.errImage;
        panel = `<div class="sp-slot-row"><label class="btn btn-secondary"><i class="bx bx-image-add" aria-hidden="true"></i> ${esc(t('main.spFPickImage'))}<input type="file" id="sp-f-err-image" accept="image/*" hidden></label>${have ? errFileState(have, 'image') : ''}</div>${have ? `<img class="sp-preview" alt="" src="${URL.createObjectURL(have.blob)}">` : ''}`;
    } else if (form.errMode === 'record') {
        const rec = form.rec && form.rec.slot === 'error' ? form.rec : null;
        const canRec = window.SupportRecorder && SupportRecorder.canRecord();
        const have = form.errRec;
        const recUi = rec
            ? `<span class="sp-recbar"><span class="sp-recdot"></span><b>${esc(t('main.spFRecording'))} · ${esc(fmtClock(rec.seconds))} / ${esc(fmtClock(SupportRecorder.MAX_SECONDS))}</b><button type="button" class="btn" data-rec-stop="error">${esc(t('main.spFRecStop'))}</button></span>`
            : `${canRec && !form.rec ? `<button type="button" class="btn" data-rec-start="error" data-help-key="spGrabar"><i class="bx bx-radio-circle-marked" aria-hidden="true"></i> ${esc(t('main.spFRecord'))}</button>` : ''}<label class="btn btn-secondary"><i class="bx bx-video" aria-hidden="true"></i> ${esc(t('main.spFPickVideo'))}<input type="file" id="sp-f-err-video" accept="video/*" hidden></label>`;
        panel = `<div class="sp-slot-row">${recUi}${have ? errFileState(have, 'record') : ''}</div>${have ? `<video class="sp-preview" controls src="${URL.createObjectURL(have.blob)}"></video>` : ''}${!canRec ? `<small class="sp-muted">${esc(t('main.spRecUnsupported'))}</small>` : ''}`;
    } else {
        panel = `<textarea id="sp-f-error" rows="2" maxlength="${formOptions.limits.text}">${esc(form.errorText)}</textarea>`;
    }
    return `<div class="sp-field sp-wide" data-help-key="spErrorOpciones"><span>${esc(t('main.spFError'))}</span>${chips}${panel}</div>`;
}
// Pantalla y acción: de la lista del sistema (de ahí la Mesa de ayuda compara los accesos) o «otra / no sé» escrita con palabras.
function screenPickerHtml() {
    const free = `<label class="sp-field"><span>${esc(t('main.spFScreen'))}</span><input type="text" id="sp-f-screen" maxlength="120" value="${esc(form.screen)}"></label><label class="sp-field"><span>${esc(t('main.spFAction'))}</span><input type="text" id="sp-f-action" maxlength="120" value="${esc(form.action)}"></label>`;
    if (!formOptions.screens.length) return free;
    const picked = formOptions.screens.find((s) => s.id === form.screenId);
    // un punto de color antes de cada pantalla (se ve también en la casilla ya elegida): verde = la tiene, rojo = todavía no la tiene
    const screenOption = (s) => `<option value="${esc(s.id)}"${s.id === form.screenId ? ' selected' : ''}>${s.has === undefined ? '' : (s.has ? '🟢 ' : '🔴 ')}${esc(s.label)}</option>`;
    const screenOptions = formOptions.screens.map(screenOption).join('');
    const screenSel = `<label class="sp-field"><span>${esc(t('main.spFScreen'))}</span><select id="sp-f-screen-sel"><option value="">${esc(t('main.spFChoose'))}</option>${screenOptions}<option value="__other"${form.screenId === '__other' ? ' selected' : ''}>${esc(t('main.spFOtherScreen'))}</option></select></label>`;
    const actionSel = picked ? `<label class="sp-field"><span>${esc(t('main.spFAction'))}</span><select id="sp-f-action-sel"><option value="">${esc(t('main.spFChoose'))}</option>${[...picked.actions].sort((a, b) => ['button', 'column', 'icon'].indexOf(a.kind) - ['button', 'column', 'icon'].indexOf(b.kind)).map((a) => `<option value="${esc(a.id)}"${a.id === form.actionId ? ' selected' : ''}>${esc(t(`main.supActKind_${a.kind}`))}: ${esc(t(a.labelKey))}</option>`).join('')}</select></label>` : '<div></div>';
    return form.screenId === '__other' ? `${screenSel}<div></div>${free}` : `${screenSel}${actionSel}`;
}
function newForm(prefill) {
    return { screenId: '', actionId: '', summary: (prefill && prefill.summary) || '', screen: (prefill && prefill.screen) || '', action: (prefill && prefill.action) || '', errorText: (prefill && prefill.errorText) || '', categoryId: null, impacts: new Map(), when: '', keep: null, answers: new Map(), slots: new Map(), extras: [], rec: null, sending: false, errMode: 'text', errImage: null, errRec: null };
}
function closeForm() {
    if (form && form.rec) { try { form.rec.ctl.stop(); } catch (err) { /* ya terminó */ } }
    hideRecordingFloat();
    if (formEl) formEl.hidden = true;
    form = null;
}
async function openForm(prefill, options) {
    cfg = { ...DEFAULT_CFG, ...(options || {}) };
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
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && form && !form.sending && !form.rec) closeForm(); });
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
    if (el.id === 'sp-f-err-image' || el.id === 'sp-f-err-video') {
        const picked = el.files && el.files[0];
        const isImage = el.id === 'sp-f-err-image';
        el.value = '';
        if (!picked) return;
        let blob = picked;
        if (isImage) { try { blob = await Dashboard.compressImageToBlob(picked); } catch (err) { blob = picked; } }
        const limit = formOptions.limits.bytes[isImage ? 'capture' : 'recording'];
        if (blob.size > limit) { Dashboard.showToast(t('main.spTooBig', { name: picked.name, mb: Math.round(limit / 1048576) }), 'warning'); return; }
        const name = blob === picked ? picked.name : picked.name.replace(/\.[^.]+$/, '') + (blob.type === 'image/png' ? '.png' : '.jpg');
        if (!form) return;
        if (isImage) form.errImage = { blob, name: `error-${name}` }; else form.errRec = { blob, name: `error-${name}` };
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
        else if (group === 'errmode') form.errMode = value;
        else if (group.startsWith('impact:')) form.impacts.set(group.slice(7), Number(value));
        renderForm();
        return;
    }
    const clear = event.target.closest('[data-slot-clear]');
    if (clear) { form.slots.delete(Number(clear.dataset.slotClear)); renderForm(); return; }
    const errClear = event.target.closest('[data-err-clear]');
    if (errClear) { if (errClear.dataset.errClear === 'image') form.errImage = null; else form.errRec = null; renderForm(); return; }
    const rm = event.target.closest('[data-extra-remove]');
    if (rm) { form.extras.splice(Number(rm.dataset.extraRemove), 1); renderForm(); return; }
    const recStart = event.target.closest('[data-rec-start]');
    if (recStart) { startRecording(recStart.dataset.recStart === 'error' ? 'error' : Number(recStart.dataset.recStart)); return; }
    const recStop = event.target.closest('[data-rec-stop]');
    if (recStop) { stopRecording(); }
}
// La grabación de pantalla: pide elegir qué pantalla grabar, cuenta los segundos y al terminar deja el video listo en su evidencia.
async function startRecording(slotId) {
    try {
        const ctl = await SupportRecorder.start({ onTick: (seconds) => { if (form && form.rec) { form.rec.seconds = seconds; document.querySelectorAll('.sp-recbar b').forEach((label) => { label.textContent = `${t('main.spFRecording')} · ${fmtClock(seconds)} / ${fmtClock(SupportRecorder.MAX_SECONDS)}`; }); } } });
        form.rec = { slot: slotId, seconds: 0, ctl };
        ctl.done.then(({ blob }) => finishRecording(slotId, blob));
        showRecordingFloat(); // el formulario se esconde para que la persona repita la acción en la pantalla; queda una barra con «Detener»
        renderForm();
    } catch (err) {
        Dashboard.showToast(t('main.spRecDenied'), 'warning');
    }
}
function stopRecording() { if (form && form.rec) form.rec.ctl.stop(); }
// La barra flotante de «Grabando»: mientras se graba el formulario se esconde (si no, taparía la pantalla donde se repite la acción) y desde aquí se detiene.
function showRecordingFloat() {
    hideRecordingFloat();
    if (formEl) formEl.hidden = true;
    const bar = document.createElement('div');
    bar.id = 'sp-rec-float';
    bar.className = 'sp-recbar sp-rec-float';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `<span class="sp-recdot"></span><b>${esc(t('main.spFRecording'))} · ${esc(fmtClock(0))} / ${esc(fmtClock(SupportRecorder.MAX_SECONDS))}</b><button type="button" class="btn">${esc(t('main.spFRecStop'))}</button>`;
    bar.querySelector('button').addEventListener('click', stopRecording);
    document.body.appendChild(bar);
}
function hideRecordingFloat() {
    const bar = document.getElementById('sp-rec-float');
    if (bar) bar.remove();
}
function finishRecording(slotId, blob) {
    hideRecordingFloat();
    if (!form) return;
    if (formEl) formEl.hidden = false;
    form.rec = null;
    const limit = formOptions.limits.bytes.recording;
    if (blob.size > limit) { Dashboard.showToast(t('main.spTooBig', { name: t('main.spFRecord'), mb: Math.round(limit / 1048576) }), 'warning'); renderForm(); return; }
    const recName = `grabacion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
    if (slotId === 'error') form.errRec = { blob, name: `error-${recName}` }; else form.slots.set(slotId, { blob, name: recName });
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
        const res = await fetch(cfg.create, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ summary: form.summary.trim(), screen: form.screen, action: form.action, screenId: form.screenId && form.screenId !== '__other' ? form.screenId : undefined, actionId: form.screenId && form.screenId !== '__other' && form.actionId ? form.actionId : undefined, errorText: form.errorText, categoryId: cat.id, when: form.when, keepWorking: form.keep,
                impacts: formOptions.impacts.map((i) => ({ name: i.name, level: form.impacts.get(i.name) || 0 })), answers }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'warning'); form.sending = false; renderForm(); return; }
        const created = body.case;
        const queue = [...[...form.slots.entries()].map(([evidenceId, x]) => ({ ...x, evidenceId })), ...form.extras.map((x) => ({ ...x, evidenceId: null })), ...(form.errImage ? [{ ...form.errImage, evidenceId: null }] : []), ...(form.errRec ? [{ ...form.errRec, evidenceId: null }] : [])];
        const failed = [];
        for (const item of queue) {
            const result = await uploadOne(created.id, item);
            if (!result.ok) failed.push(t('main.spFileFailed', { name: item.name, why: result.message }));
        }
        closeForm();
        Dashboard.showToast(t('main.spSent', { folio: created.folio }), 'success');
        failed.forEach((m) => Dashboard.showToast(m, 'warning'));
        if (cfg.onCreated) await cfg.onCreated(created);
    } catch (err) {
        console.error('Casos de soporte: failed to send request', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        if (form) { form.sending = false; renderForm(); }
    }
}

window.SupportRequestForm = { open: openForm };
})();
