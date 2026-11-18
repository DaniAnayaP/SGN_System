// ---------------------------------------------------------------------------
// Servicio a Cliente › Soporte › un caso (lado SaaS, Nivel 4 · el proveedor): el caso de una empresa tal como llegó, con TODO su recorrido: el chat de principio a fin (cada mensaje con su nivel), por dónde pasó (los traspasos con
// lo que hizo cada nivel y sus notas), las evidencias y quién lo reportó (solo lo que la empresa permite: nombre, puesto, departamento y jefe directo). Aquí el Nivel 4 califica cómo le llegó el caso (1 clic, antes de empezar si
// la empresa lo pide), lo TOMA, le escribe al usuario o deja notas internas, cambia su estatus, lo MARCA RESUELTO (regresa a la Mesa de ayuda de la empresa para confirmarlo con el usuario) o lo DEVUELVE al nivel anterior de
// la empresa con motivo, qué hizo, notas y evidencia. Cada botón y cada parte se da en el árbol de accesos de la cuenta. Lo escrito no se edita ni se borra. Rutas /api/admin/support-cases/:id/*. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const caseId = Number(new URLSearchParams(location.search).get('id'));
const API = `/api/admin/support-cases/${caseId}`;
const POLL_MS = 12000;
const MAX_EVIDENCE_BYTES = 12 * 1048576;
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const locale = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const fmtDate = (iso) => new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtTime = (iso) => new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const starsText = (n) => '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Number(n) || 0)));
const state = { d: null, messages: [], tab: 'all', pending: null, sending: false, form: null, rate: { stars: 0, tags: new Set(), comment: '', sending: false } };

// ---- piezas ---------------------------------------------------------------------------------------------------------------------------
const lvBadge = (level) => (level ? `<span class="sc-lv ${esc(level)}" title="${esc(t(`main.sopLevel_${level}`))}">${esc(level.toUpperCase())}</span>` : '');
function fileHtml(f, { big } = {}) {
    const url = `${API}/files/${f.id}`;
    if (f.kind === 'capture') return `<a class="sc-att" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${esc(f.name)}" loading="lazy"></a>`;
    if (f.kind === 'recording') return `<video class="sc-att${big ? ' big' : ''}" src="${url}" controls preload="metadata"></video>`;
    return `<a class="btn btn-secondary sc-att-file" href="${url}" download><i class="bx bx-download" aria-hidden="true"></i> ${esc(f.name)} <small>${esc(fmtSize(f.size))}</small></a>`;
}
function friendlyMinutes(m) {
    const n = Number(m) || 0;
    if (n < 1) return '< 1 min';
    if (n % 1440 === 0) return `${n / 1440} d`;
    if (n >= 60 && n % 60 === 0) return `${n / 60} h`;
    return `${n} min`;
}
function fmtDuration(min) {
    const n = Math.max(0, Number(min) || 0);
    if (n < 1) return '< 1 min';
    if (n < 60) return `${n} min`;
    if (n < 1440) return `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}`;
    return `${Math.floor(n / 1440)} d${Math.floor((n % 1440) / 60) ? ` ${Math.floor((n % 1440) / 60)} h` : ''}`;
}
// El texto de cada renglón del sistema (los mismos del chat de la empresa).
function eventText(m) {
    const d = m.eventData || {};
    const author = m.author || '—';
    switch (m.eventKey) {
        case 'created': return t('main.spEv_created', { level: t(`main.sopLevel_${d.level || 'n1'}`) });
        case 'first_response': return t('main.spEv_first_response', { author, min: friendlyMinutes(d.minutes) }) + (d.onTime === true ? t('main.spEv_ontime') : (d.onTime === false ? t('main.spEv_late') : ''));
        case 'file': return t('main.spEv_file', { author, name: d.name || '' });
        case 'access_review': return d.ok ? t('main.spEv_access_ok', { author }) : t('main.spEv_access_bad', { author, n: d.missing || 0 });
        case 'access_request': return t('main.spEv_access_request', { author, items: (d.items || []).map((i) => (i.labelKey ? t(i.labelKey) : t(`main.supAcc_${i.code}`))).join(', ') });
        case 'understood': return t('main.spEv_understood', { author });
        case 'context': return t('main.spEv_context', { author, screen: d.screenKey ? t(d.screenKey) : '', action: d.actionKey ? t('main.spEv_context_action', { action: t(d.actionKey) }) : '' });
        case 'int_notify': return t('main.spEv_int_notify', { author, to: d.to || '' });
        case 'int_invite': return t('main.spEv_int_invite', { author, to: d.to || '' });
        case 'int_escalated': return t('main.spEv_int_escalated', { from: d.from || '', to: d.to || '', why: t(`main.perReason_${d.reason || 'no_response'}`) });
        case 'int_escalated_top': return t('main.spEv_int_escalated_top', { from: d.from || '' });
        case 'int_escalated_known': return t('main.spEv_int_escalated_known', { from: d.from || '', to: d.to || '' });
        case 'int_confirmed': return t('main.spEv_int_confirmed', { name: d.name || author, min: friendlyMinutes(d.minutes) });
        case 'int_declined': return t('main.spEv_int_declined', { name: d.name || author }) + (d.reason ? ` — ${d.reason}` : '');
        case 'person_joined': return t('main.spEv_person_joined', { name: d.name || author });
        case 'moved': return d.solved || d.reason === 'solved' ? t('main.spEv_moved_solved', { author, from: t(`main.sopLevel_${d.from}`), to: t(`main.sopLevel_${d.to}`) }) : t(d.direction === 'up' ? 'main.spEv_moved_up' : 'main.spEv_moved_down', { author, from: t(`main.sopLevel_${d.from}`), to: t(`main.sopLevel_${d.to}`) });
        case 'status_changed': return t(d.auto ? 'main.spEv_status_auto' : 'main.spEv_status_changed', { author, from: t(`main.spStatus_${d.from}`), to: t(`main.spStatus_${d.to}`) });
        case 'classified': return d.type === 'c' ? t('main.spEv_classified_c', { author }) : t(d.created ? 'main.spEv_classified_p_new' : 'main.spEv_classified_p_existing', { author, general: d.general }) + (d.others ? t('main.spEv_classified_more', { n: d.others }) : '');
        case 'general_linked': return t('main.spEv_general_linked', { author, general: d.general });
        case 'resolved': return t('main.spEv_resolved', { author });
        case 'taken': return t('main.spEv_taken', { author });
        case 'assigned': return t('main.spEv_assigned', { author, to: d.to || '' });
        case 'paused': return t(d.urgent ? 'main.spEv_paused' : 'main.spEv_paused_plain', { author });
        case 'resumed': return t('main.spEv_resumed', { author });
        case 'int_urgent_alert': return t('main.spEv_int_urgent_alert');
        case 'rated': return t('main.spEv_rated', { author, stars: starsText(d.stars) });
        case 'general_resolved': return t('main.spEv_general_resolved', { general: d.general });
        case 'closed': return d.noresp ? t('main.spEv_closed_noresp', { author, n: d.attempts || 0 }) : t('main.spEv_closed_ok', { author }) + (d.cause ? t('main.spEv_closed_cause', { cause: d.cause }) : '');
        case 'reopened': return d.byTeam ? t('main.spEv_reopened_team', { to: t(`main.sopLevel_${d.to}`), said: d.said || '' }) : t('main.spEv_reopened_user', { author, said: d.said || '' });
        case 'int_attempt': return t('main.spEv_int_attempt', { author, n: d.n || 1, channel: t(`main.clCh_${d.channel}`) });
        default: return m.eventKey;
    }
}
// El detalle de un traspaso (con las notas internas): motivo, lo que hizo, las notas y cuántas evidencias.
function movedDetail(m) {
    const d = m.eventData || {};
    if (m.eventKey !== 'moved' || !d.reason) return '';
    const files = (d.fileIds || []).length;
    return `<div class="sc-why"><b>${esc(t('main.mvReasonLabel'))}:</b> ${esc(t(`main.mvReason_${d.reason}`))}<br><b>${esc(t('main.mvDidShort'))}:</b> ${esc(d.did)}${d.notes ? `<br><b>${esc(t('main.mvNotesShort'))}:</b> ${esc(d.notes)}` : ''}${files ? `<br><b>${esc(t('main.mvFilesShort'))}:</b> ${files}` : ''}</div>`;
}
function messageHtml(m) {
    if (m.kind === 'event') {
        const att = m.file ? `<div class="sc-ev-att">${fileHtml(m.file)}</div>` : (m.fileLocked ? `<div class="sc-ev-att sp-muted"><i class="bx bx-lock-alt" aria-hidden="true"></i> ${esc(t('main.scLocked'))}</div>` : '');
        return `<div class="sc-sep ${esc(m.eventKey)}" data-msg="${m.id}"><span>${lvBadge(m.level)} ${esc(eventText(m))}</span><time>${esc(fmtTime(m.createdAt))}</time>${m.body ? `<div class="sc-ev-body">${esc(m.body)}</div>` : ''}${movedDetail(m)}${att}</div>`;
    }
    const mine = m.authorId === state.d.chat.meId;
    const att = m.file ? `<div class="sc-att-wrap">${fileHtml(m.file)}</div>` : (m.fileLocked ? `<div class="sp-muted"><i class="bx bx-lock-alt" aria-hidden="true"></i> ${esc(t('main.scLocked'))}</div>` : '');
    return `<div class="sc-bub${mine ? ' me' : ''}${m.kind === 'note' ? ' note' : ''}" data-msg="${m.id}"><div class="sc-who">${lvBadge(m.level)}<b>${esc(m.author || '—')}</b> · <time>${esc(fmtTime(m.createdAt))}</time>${m.kind === 'note' ? `<span class="sc-notetag">${esc(t('main.scNoteTag'))}</span>` : ''}</div>${m.body ? `<div class="sc-txt">${esc(m.body)}</div>` : ''}${att}</div>`;
}
const visibleMessages = () => state.messages.filter((m) => (state.tab === 'files' ? (m.file || m.fileLocked) : (state.tab === 'notes' ? m.kind === 'note' : true)));

// ---- dibujar ---------------------------------------------------------------------------------------------------------------------------
function renderHeader() {
    const d = state.d; const c = d.case;
    const impacts = (c.impacts || []).filter((i) => i.level > 0).map((i) => `${esc(i.name)}: ${esc(t(`main.spLevel_${i.level}`))}`).join(' · ') || esc(t('main.spLevel_0'));
    const statusPick = d.can.status ? `<select id="ss-status-pick" class="sc-status-pick" data-help-key="spEstatus" aria-label="${esc(t('main.stChange'))}"><option value="">${esc(t('main.stChange'))}</option>${d.statusTargets.filter((s) => s !== c.status).map((s) => `<option value="${s}">${esc(t(`main.spStatus_${s}`))}</option>`).join('')}</select>` : '';
    const assignPick = d.can.assign && d.assignable.length ? `<select id="ss-assign-pick" class="sc-status-pick" data-help-key="saasSpAssign" aria-label="${esc(t('admin.saasSpAssignPick'))}"><option value="">${esc(t('admin.saasSpAssignPick'))}</option>${d.assignable.filter((u) => u.id !== c.assigneeId).map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>` : '';
    const btns = `${assignPick}${d.can.take ? `<button type="button" class="btn btn-secondary sc-mini" data-ss-act="take" data-help-key="saasSpTake">${esc(t('main.cpTake'))}</button>` : ''}${d.can.resolve ? `<button type="button" class="btn sc-mini" data-ss-act="resolve" data-help-key="saasSpResolve">${esc(t('main.rsTitle'))}</button>` : ''}${d.can.down ? `<button type="button" class="btn btn-secondary sc-mini" data-ss-act="down" data-help-key="saasSpDown">↓ ${esc(t('main.mvDown'))}</button>` : ''}`;
    const from = c.from ? t('admin.saasSpFromLine', { level: t(`main.sopLevel_${c.from.level}`), by: c.from.by || '—', when: fmtTime(c.from.at) }) : t('admin.saasSpDirect');
    $('sc-head').innerHTML = `<div><h2>${esc(c.folio)} · ${esc(c.summary)}</h2><span class="sp-muted">${esc([c.screen, c.action].filter(Boolean).join(' · '))}</span></div>
        <div class="sc-tags"><span class="sp-tag sp-type" data-k="${esc(c.type)}">${esc(t(`main.spType_${c.type}`))}</span><span class="sp-tag sp-pri" data-k="${c.priority}">${esc(t(`main.msPri_${c.priority}`))}</span>
        <span class="sp-tag sp-lv" data-k="${esc(c.level)}">${esc(t(`main.sopLevel_${c.level}`))}</span><span class="sp-tag sp-status" data-k="${esc(c.status)}">${esc(t(`main.spStatus_${c.status}`))}</span>${statusPick}${btns}</div>`;
    $('sc-meta').innerHTML = `<dl class="sp-meta"><div><dt>${esc(t('admin.saasSpColClient'))}</dt><dd>${esc(c.client)}</dd></div><div><dt>${esc(t('admin.saasSpColSector'))}</dt><dd>${esc(c.sector || '—')}</dd></div>
        <div><dt>${esc(t('admin.saasSpColFrom'))}</dt><dd>${esc(from)}</dd></div><div><dt>${esc(t('main.colSpFechaHora'))}</dt><dd>${esc(fmtDate(c.createdAt))}</dd></div>
        <div><dt>${esc(t('main.colSpCategoria'))}</dt><dd>${esc(c.category || '—')}</dd></div><div><dt>${esc(t('main.cpAssignee'))}</dt><dd>${esc(c.assigneeName || '—')}</dd></div>
        <div><dt>${esc(t('main.spFWhen'))}</dt><dd>${esc(t(`main.spWhen_${c.whenAffects}`))}</dd></div><div class="sp-wide"><dt>${esc(t('main.spFImpact'))}</dt><dd>${impacts}</dd></div>
        ${c.errorText ? `<div class="sp-wide"><dt>${esc(t('main.spFError'))}</dt><dd class="sp-pre">${esc(c.errorText)}</dd></div>` : ''}
        ${!d.inScope && c.atN4 && !c.assigneeId ? `<div class="sp-wide"><dd class="sp-muted">${esc(t('admin.saasSpOutOfScope'))}</dd></div>` : ''}
        ${d.can.noTi ? `<div class="sp-wide"><dd class="sp-muted">${esc(t('admin.saasSpNoTiNote'))}</dd></div>` : ''}
        ${c.understood ? `<div class="sp-wide"><dt>${esc(t('main.supStep3'))}</dt><dd class="sp-pre">${esc(c.understood)}</dd></div>` : ''}</dl>`;
}
// Quien reportó, lo que la empresa le comparte al proveedor.
function renderReporter() {
    const r = state.d.reporter;
    const box = $('ss-reporter-card');
    if (!r.shared) { box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('admin.saasSpReporterTitle'))}</h3></div><p class="sp-muted">${esc(t('admin.saasSpReporterHidden'))}</p>`; return; }
    const row = (k, v) => (v ? `<div><dt>${esc(t(k))}</dt><dd>${esc(v)}</dd></div>` : '');
    box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('admin.saasSpReporterTitle'))}</h3></div><p class="sp-muted">${esc(t('admin.saasSpReporterHint'))}</p>
        <dl class="sp-meta">${row('admin.saasSpRepName', r.name)}${row('admin.saasSpRepPosition', r.position || r.role)}${row('admin.saasSpRepDept', r.department)}${row('admin.saasSpRepBoss', r.boss)}</dl>`;
}
// Calificar cómo llegó el caso (1 clic): estrellas, etiquetas y un comentario; es lo primero cuando la empresa lo pide.
function renderRate() {
    const d = state.d; const box = $('ss-rate-card');
    if (!d.pending) { box.hidden = true; return; }
    box.hidden = false;
    const f = state.rate; const p = d.pending;
    const tg = d.ratingTags;
    const stars = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="sc-star${f.stars >= n ? ' on' : ''}" data-rt-star data-n="${n}" aria-label="${n}" aria-pressed="${f.stars === n}">★</button>`).join('');
    const chips = [...tg.good, ...tg.bad].map((k) => `<button type="button" class="sp-chip${f.tags.has(k) ? ' on' : ''}" data-rt-tag="${esc(k)}">${esc(t(`main.rtTag_receive_${k}`))}</button>`).join('');
    box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('main.rtTitle'))}</h3></div><div class="sc-rate-block sc-rate-pending"><h4>${esc(t('main.rtPendingTitle'))}</h4>
        <p class="sp-muted">${esc(t('main.rtPendingWho', { by: p.by || '—', from: t(`main.sopLevel_${p.from}`), to: t(`main.sopLevel_${p.to}`), when: fmtTime(p.at) }))}</p>
        <div class="sc-rate"><div class="sc-stars" role="group" aria-label="${esc(t('main.rtStarsLabel'))}">${stars}</div><div class="sp-chips">${chips}</div>
        <label class="sp-field"><textarea id="rt-comment" rows="2" maxlength="${d.maxComment}" placeholder="${esc(t('main.rtComment'))}">${esc(f.comment)}</textarea></label>
        <div class="admin-form-actions"><button type="button" class="btn" id="rt-send"${f.sending ? ' disabled' : ''}>${esc(f.sending ? t('main.spFSending') : t('main.rtSend'))}</button></div></div></div>`;
}
async function submitRating() {
    const f = state.rate; const p = state.d.pending;
    if (!p || f.sending) return;
    if (!f.stars) { Dashboard.showToast(t('main.rtStarsErr'), 'warning'); return; }
    f.sending = true; renderRate();
    try {
        const res = await fetch(`${API}/ratings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ moveId: p.id, stars: f.stars, tags: [...f.tags], comment: f.comment }) });
        const out = await res.json().catch(() => ({}));
        f.sending = false;
        if (!res.ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); await reload(); return; }
        state.rate = { stars: 0, tags: new Set(), comment: '', sending: false };
        Dashboard.showToast(t('main.rtSaved'), 'success');
        await reload();
    } catch (err) {
        console.error('Soporte (SaaS): failed to rate', err);
        f.sending = false; renderRate();
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
// Por dónde pasó: la barra de tiempo en cada nivel y la lista de traspasos con lo que escribió cada nivel (con el permiso del chat).
function renderLane() {
    const d = state.d; const box = $('sc-lane-card');
    if (!d.canChat || !d.segments.length) { box.hidden = true; return; }
    box.hidden = false;
    const total = d.segments.reduce((a, s) => a + Math.max(s.minutes, 1), 0);
    const bar = d.segments.map((s) => `<div class="sc-seg ${esc(s.level)} ${esc(s.how)}" style="flex:${Math.max(Math.max(s.minutes, 1) / total * 100, 9)} 1 0" title="${esc(t(`main.sopLevel_${s.level}`))} · ${esc(fmtDuration(s.minutes))}">${lvBadge(s.level)}<b>${esc(fmtDuration(s.minutes))}</b>${s.how === 'down' ? '<span aria-hidden="true">↩</span>' : ''}</div>`).join('');
    const list = d.segments.map((s) => `<div class="sc-seg-row"><span>${lvBadge(s.level)} ${esc(t(`main.sopLevel_${s.level}`))}</span><span class="sp-muted">${esc(fmtTime(s.startAt))} · ${esc(fmtDuration(s.minutes))}${s.endAt ? '' : ` · ${esc(t('main.mvNow'))}`} · ${esc(t(`main.mvHow_${s.how}`))}</span></div>`).join('');
    box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('main.mvLaneTitle'))}</h3></div><div class="sc-lane">${bar}</div><div class="sc-seg-list">${list}</div>`;
}
function renderTabs() {
    const tabs = [['all', t('main.scTabAll')], ['files', t('main.scTabFiles')], ...(state.d.chat.canSeeNotes ? [['notes', t('main.scTabNotes')]] : [])];
    $('sc-tabs').innerHTML = tabs.map(([k, label]) => `<button type="button" class="sp-chip${state.tab === k ? ' on' : ''}" data-tab="${k}">${esc(label)}</button>`).join('');
}
function renderThread(scrollToEnd) {
    const box = $('sc-thread');
    if (!state.d.chat.canSee) { box.innerHTML = `<p class="sp-muted">${esc(t('admin.saasSpNoChat'))}</p>`; return; }
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const list = visibleMessages();
    box.innerHTML = list.length ? list.map(messageHtml).join('') : `<p class="sp-muted">${esc(t('main.scNoMessages'))}</p>`;
    if (scrollToEnd || nearBottom) box.scrollTop = box.scrollHeight;
}
function renderFlow() {
    const steps = state.messages.filter((m) => m.kind === 'event');
    $('sc-flow').innerHTML = steps.length ? `<div class="sc-tl">${steps.map((m) => `<button type="button" class="sc-step ${esc(m.level)}" data-goto="${m.id}"><time>${esc(fmtTime(m.createdAt))}</time><span class="dotc"></span><div><b>${lvBadge(m.level)} ${esc(eventText(m))}</b></div></button>`).join('')}</div>` : `<p class="sp-muted">${esc(t('main.scNoMessages'))}</p>`;
}
function renderFiles() {
    const d = state.d;
    if (!d.canEvidence) { $('sc-files').innerHTML = `<p class="sp-muted">${esc(t('main.spFilesLocked'))}</p>`; return; }
    if (!d.files.length) { $('sc-files').innerHTML = `<p class="sp-muted">${esc(t('main.spNoFiles'))}</p>`; return; }
    const levels = [...new Set(d.files.map((f) => f.level || 'n0'))].sort();
    $('sc-files').innerHTML = levels.map((lv) => `<h4>${lvBadge(lv)} ${esc(t(`main.sopLevel_${lv}`))}</h4><div class="sp-files">${d.files.filter((f) => (f.level || 'n0') === lv).map((f) => `<div class="sp-file"><div class="sp-file-name"><b>${esc(f.name)}</b><span class="sp-muted">${esc(fmtSize(f.size))} · ${esc(f.by || '')} · ${esc(fmtDate(f.createdAt))}</span></div>${fileHtml(f, { big: true })}</div>`).join('')}</div>`).join('');
}
function renderComposer() {
    const ch = state.d.chat;
    const box = $('sc-composer');
    if ((!ch.canSend && !ch.canWriteNotes) || !ch.canSee) { box.hidden = true; return; }
    box.hidden = false;
    const note = $('sc-note') && $('sc-note').checked;
    const text = $('sc-text') ? $('sc-text').value : '';
    const canUpload = state.d.can.upload;
    box.innerHTML = `${ch.canWriteNotes ? `<label class="sc-notebox" data-help-key="spNotas"><input type="checkbox" id="sc-note"${note ? ' checked' : ''}${ch.canSend ? '' : ' checked disabled'}> ${esc(t('main.scNoteToggle'))}</label>` : ''}
        <textarea id="sc-text" rows="2" maxlength="${ch.max}" placeholder="${esc(t(note ? 'main.scWriteNote' : 'main.scWrite'))}">${esc(text)}</textarea>
        <div class="sc-actions">${canUpload ? `<label class="btn btn-secondary"><i class="bx bx-paperclip" aria-hidden="true"></i> ${esc(t('main.scAttach'))}<input type="file" id="sc-file" hidden></label>` : ''}
            ${state.pending ? `<span class="sp-ok"><i class="bx bx-check" aria-hidden="true"></i> ${esc(state.pending.name)} <button type="button" class="ms-icon-btn" id="sc-unattach" aria-label="${esc(t('main.scRemove'))}"><i class="bx bx-x" aria-hidden="true"></i></button></span>` : ''}
            <button type="button" class="btn" id="sc-send"${state.sending ? ' disabled' : ''}>${esc(t(state.sending ? 'main.scSending' : 'main.scSend'))}</button></div>`;
}
// Cierre con el usuario de una empresa SIN TI contratado: el Nivel 4 es también su Mesa de ayuda. Conforme (causa, qué se hizo y evidencia de después de que quedó por confirmar), no conforme (se reabre en el Nivel 4) o sin respuesta tras 3 intentos.
const closeAttempt = { channel: 'chat', note: '', sending: false };
function renderCloseCard() {
    const c = state.d.closing; const box = $('ss-close-card');
    if (!c) { box.hidden = true; return; }
    box.hidden = false;
    const r = c.resolved;
    const who = r ? `<div class="sp-meta-line"><b>${esc(t('main.clResolvedBy'))}:</b> ${esc(r.by)} · ${esc(fmtTime(r.createdAt))}<br><b>${esc(t('main.clDid'))}:</b> ${esc(r.did)}${r.fileCount ? `<br><b>${esc(t('main.mvFilesShort'))}:</b> ${r.fileCount}` : ''}</div>` : '';
    const head = `<div class="sc-card-head"><h3>${esc(t('main.clCloseTitle'))}</h3><div class="sc-tags"><span class="sp-tag sp-status" data-k="confirm">${esc(t('main.spStatus_confirm'))}</span></div></div>`;
    if (!c.canClose) { box.innerHTML = `${head}${who}<p class="sp-muted">${esc(t('admin.saasSpCloseNoButton'))}</p>`; return; }
    const attempts = c.attempts.map((a, i) => `<div class="sc-attempt ok"><b>${i + 1}</b> ${esc(t(`main.clCh_${a.channel}`))} · ${esc(fmtTime(a.createdAt))} · ${esc(a.by || '')} — ${esc(a.note)}</div>`).join('');
    const missing = Math.max(0, c.needAttempts - c.attempts.length);
    const add = c.attempts.length < c.maxAttempts ? `<div class="sc-attempt-form"><select id="cl-ach">${c.channels.map((ch) => `<option value="${ch}"${ch === closeAttempt.channel ? ' selected' : ''}>${esc(t(`main.clCh_${ch}`))}</option>`).join('')}</select><input type="text" id="cl-anote" maxlength="500" placeholder="${esc(t('main.clAttemptNote'))}" value="${esc(closeAttempt.note)}"><button type="button" class="btn btn-secondary" id="cl-aadd"${closeAttempt.sending ? ' disabled' : ''}>${esc(t('main.clAttemptAdd'))}</button></div>` : '';
    box.innerHTML = `${head}${who}<div class="sc-warn">${esc(t('main.clConfirmHint'))}</div>
        <div class="sc-actions"><button type="button" class="btn" data-ss-close="ok">${esc(t('main.clConformYes'))}</button><button type="button" class="btn btn-secondary" data-ss-close="none">${esc(t('main.clConformNo'))}</button></div>
        <div class="sc-sg"><h4>${esc(t('main.clNoReplyTitle'))}</h4>${attempts || `<p class="sp-muted">${esc(t('main.clNoAttempts'))}</p>`}${missing ? `<div class="sc-attempt miss"><b>!</b> ${esc(t('main.clAttemptsMissing', { n: missing }))}</div>` : ''}${add}
        <p class="sp-muted">${esc(t('main.clNoReplyHint'))}</p><div class="admin-form-actions"><button type="button" class="btn btn-secondary" id="cl-noresp"${missing || closeAttempt.sending ? ' disabled' : ''}>${esc(t('main.clCloseNoReply'))}</button></div></div>`;
}
function renderAll(first) {
    renderHeader(); renderReporter(); renderRate(); renderCloseCard(); renderLane(); renderTabs(); renderThread(first); renderFlow(); renderFiles(); renderComposer();
}

// ---- datos ----------------------------------------------------------------------------------------------------------------------------
async function loadCase() {
    const res = await fetch(API, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'load failed');
    state.d = body;
}
async function loadMessages(first) {
    if (!state.d.chat.canSee) return false;
    const after = first ? 0 : (state.messages.length ? state.messages[state.messages.length - 1].id : 0);
    const res = await fetch(`${API}/messages?after=${after}`, { credentials: 'include' });
    if (!res.ok) return false;
    const body = await res.json();
    if (first) state.messages = body.messages; else if (body.messages.length) state.messages.push(...body.messages.filter((m) => !state.messages.some((x) => x.id === m.id)));
    return body.messages.length > 0;
}
// Vuelve a traer el caso y el chat completos (después de una acción).
async function reload() {
    await loadCase();
    await loadMessages(true);
    renderAll(true);
}
async function poll() {
    try {
        if (state.sending || state.form) return;
        const got = await loadMessages(false);
        if (got) { await loadCase(); renderAll(false); }
    } catch (err) { console.error('Soporte (SaaS): failed to refresh', err); }
}
async function postJson(path, body) {
    const res = await fetch(`${API}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body || {}) });
    const out = await res.json().catch(() => ({}));
    return { ok: res.ok, out };
}
async function uploadFile(item, query) {
    const res = await fetch(`${API}/files${query || ''}`, { method: 'POST', headers: { 'Content-Type': item.blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(item.name) }, credentials: 'include', body: item.blob });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || Dashboard.t('admin.saveError'));
    return body.file;
}
async function send() {
    if (state.sending) return;
    const text = $('sc-text').value.trim();
    const note = !!($('sc-note') && $('sc-note').checked);
    if (!text && !state.pending) { Dashboard.showToast(t('main.scErrEmpty'), 'warning'); return; }
    state.sending = true;
    renderComposer();
    try {
        let fileId;
        if (state.pending) {
            try { fileId = (await uploadFile(state.pending, '?chat=1')).id; } catch (err) { Dashboard.showToast(t('main.spFileFailed', { name: state.pending.name, why: err.message }), 'warning'); return; }
        }
        const { ok, out } = await postJson('messages', { body: text, note, fileId });
        if (!ok) {
            if (out.code === 'RATE_FIRST') { await reload(); }
            Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning');
            return;
        }
        state.pending = null;
        $('sc-text').value = '';
        state.sending = false;
        await reload();
        renderThread(true);
    } catch (err) {
        console.error('Soporte (SaaS): failed to send', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        state.sending = false;
        renderComposer();
    }
}
async function simpleAction(path, body, okKey) {
    try {
        const { ok, out } = await postJson(path, body);
        if (!ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); await reload(); return false; }
        if (okKey) Dashboard.showToast(t(okKey, { status: out.status ? t(`main.spStatus_${out.status}`) : '' }), 'success');
        await reload();
        return true;
    } catch (err) {
        console.error('Soporte (SaaS): action failed', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        return false;
    }
}

// ---- «Marcar resuelto» y «Devolver»: una ventana con lo que se hizo y la evidencia (se puede grabar la pantalla) ------------------------------------------------------------------------
// mode 'resolve': qué hice + evidencia. mode 'down': a qué nivel, motivo, qué hice, notas para el siguiente nivel + evidencia. La evidencia se sube al enviar y viaja en el traspaso.
let formEl = null;
function evidenceHtml(f) {
    const files = f.files.map((x, i) => `<div class="sp-slot-row"><span class="sp-ok"><i class="bx bx-check" aria-hidden="true"></i> ${esc(x.name)} <small class="sp-muted">${esc(fmtSize(x.blob.size))}</small></span><button type="button" class="ms-icon-btn" data-fm-unfile="${i}" aria-label="${esc(t('main.scRemove'))}"><i class="bx bx-trash" aria-hidden="true"></i></button></div>`).join('');
    const canRec = window.SupportRecorder && SupportRecorder.canRecord();
    const rec = f.rec ? `<span class="sp-recbar"><span class="sp-recdot"></span><b>${esc(t('main.spFRecording'))} · ${esc(fmtClock(f.rec.seconds))}</b><button type="button" class="btn" data-fm-recstop>${esc(t('main.spFRecStop'))}</button></span>` : (canRec ? `<button type="button" class="btn btn-secondary" data-fm-rec><i class="bx bx-radio-circle-marked" aria-hidden="true"></i> ${esc(t('main.spFRecord'))}</button>` : '');
    return `${files}<div class="sp-slot-row"><label class="btn btn-secondary"><i class="bx bx-paperclip" aria-hidden="true"></i> ${esc(t('main.scAttach'))}<input type="file" id="fm-file" multiple hidden></label>${rec}</div>`;
}
function renderForm() {
    const d = state.d; const f = state.form;
    const mode = f.mode; const down = mode === 'down'; const closeOk = mode === 'close-ok'; const closeNone = mode === 'close-none';
    const reasons = down ? d.reasons.map((r) => `<button type="button" class="sp-chip${f.reason === r ? ' on' : ''}" role="radio" aria-checked="${f.reason === r}" data-fm-reason="${r}">${esc(t(`main.mvReason_${r}`))}</button>`).join('') : '';
    let body;
    if (closeNone) {
        body = `<label class="sp-field"><span>${esc(t('main.clSaid'))} *</span><textarea id="fm-said" rows="3" maxlength="${d.closing.maxText}">${esc(f.said)}</textarea></label><div class="sc-warn">${esc(t('main.clReopenHint'))}</div>`;
    } else if (closeOk) {
        const picks = d.closing.files.map((x) => `<label class="sc-sim"><input type="checkbox" data-fm-pick="${x.id}"${f.picked.has(x.id) ? ' checked' : ''}> <span>${lvBadge(x.level || 'n0')} <b>${esc(x.name)}</b> <small class="sp-muted">${esc(fmtSize(x.size))} · ${esc(x.by || '')} · ${esc(fmtTime(x.createdAt))}</small></span></label>`).join('');
        body = `<label class="sp-field"><span>${esc(t('main.clCause'))} *</span><select id="fm-cause"><option value="">—</option>${d.closing.causes.map((c) => `<option value="${c.id}"${String(c.id) === f.cause ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
            <label class="sp-field"><span>${esc(t('main.clDid'))} * <small class="sp-muted">${esc(t('main.clDidHint'))}</small></span><textarea id="fm-did" rows="3" maxlength="${d.closing.maxText}">${esc(f.did)}</textarea></label>
            <div class="sp-field"><span>${esc(t('main.clEvidence'))} * <small class="sp-muted">${esc(t('main.clEvidenceHint'))}</small></span><div class="sc-sim">${picks}</div>${evidenceHtml(f)}</div>`;
    } else {
        body = `${down ? `<label class="sp-field"><span>${esc(t('main.mvTo'))} *</span><select id="fm-to">${d.downTo.map((l) => `<option value="${l}"${l === f.to ? ' selected' : ''}>${esc(t(`main.sopLevel_${l}`))}</option>`).join('')}</select></label>
            <div class="sp-field"><span>${esc(t('main.mvReason'))} *</span><div class="sp-chips" role="radiogroup">${reasons}</div></div>` : ''}
            <label class="sp-field"><span>${esc(t(down ? 'main.mvDid' : 'main.rsDid'))} * <small class="sp-muted">${esc(t('main.mvDidHint'))}</small></span><textarea id="fm-did" rows="3" maxlength="${d.maxText}">${esc(f.did)}</textarea></label>
            ${down ? `<label class="sp-field"><span>${esc(t('main.mvNotes'))} * <small class="sp-muted">${esc(t('main.mvNotesHint'))}</small></span><textarea id="fm-notes" rows="3" maxlength="${d.maxText}">${esc(f.notes)}</textarea></label>` : ''}
            <div class="sp-field"><span>${esc(t('main.mvFiles'))} * <small class="sp-muted">${esc(t('main.mvFilesHint'))}</small></span>${evidenceHtml(f)}</div>`;
    }
    formEl.querySelector('#fm-body').innerHTML = body;
    const send = formEl.querySelector('#fm-send');
    send.disabled = f.sending;
    send.textContent = f.sending ? t('main.spFSending') : (closeOk ? t('main.clCloseBtn') : (closeNone ? t('main.clReopenBtn') : (down ? t('main.mvSendDown', { level: t(`main.sopLevel_${f.to}`) }) : t('main.rsSend'))));
    formEl.querySelector('#fm-title').textContent = closeOk ? t('main.clConformYes') : (closeNone ? t('main.clConformNo') : (down ? t('main.mvDown') : t('main.rsTitle')));
}
function closeForm() { if (state.form && state.form.rec) { try { state.form.rec.ctl.stop(); } catch (err) { /* ya terminó */ } } if (formEl) formEl.hidden = true; state.form = null; }
function openForm(mode) {
    if (!formEl) {
        formEl = document.createElement('div');
        formEl.className = 'modal-overlay';
        formEl.hidden = true;
        formEl.innerHTML = '<div class="modal-panel sp-form sc-move" role="dialog" aria-modal="true" aria-labelledby="fm-title"><h3 id="fm-title"></h3><div id="fm-body"></div><p class="sp-muted" id="fm-note"></p><div class="admin-form-actions"><button type="button" class="btn" id="fm-send"></button><button type="button" class="btn btn-secondary" id="fm-cancel"></button></div></div>';
        document.body.appendChild(formEl);
        formEl.addEventListener('click', onFormClick);
        formEl.addEventListener('input', (event) => { const f = state.form; if (!f) return; if (event.target.id === 'fm-did') f.did = event.target.value; else if (event.target.id === 'fm-notes') f.notes = event.target.value; else if (event.target.id === 'fm-said') f.said = event.target.value; });
        formEl.addEventListener('change', onFormChange);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.form && !state.form.sending) closeForm(); });
    }
    state.form = { mode, to: state.d.downTo[0], reason: '', did: '', notes: '', said: '', cause: '', picked: new Set(), files: [], rec: null, sending: false };
    formEl.querySelector('#fm-cancel').textContent = t('main.spFCancel');
    formEl.querySelector('#fm-note').textContent = mode === 'down' ? t('main.mvHint') : (mode === 'resolve' ? t('main.rsModalHint') : '');
    renderForm();
    formEl.hidden = false;
}
async function onFormChange(event) {
    const f = state.form; if (!f) return;
    const el = event.target;
    if (el.id === 'fm-to') { f.to = el.value; renderForm(); return; }
    if (el.id === 'fm-cause') { f.cause = el.value; return; }
    if (el.matches('[data-fm-pick]')) { const id = Number(el.dataset.fmPick); if (el.checked) f.picked.add(id); else f.picked.delete(id); return; }
    if (el.id === 'fm-file') {
        const picked = [...(el.files || [])]; el.value = '';
        for (const file of picked) {
            let blob = file;
            if (file.type && file.type.startsWith('image/')) { try { blob = await Dashboard.compressImageToBlob(file); } catch (err) { blob = file; } }
            if (blob.size > MAX_EVIDENCE_BYTES) { Dashboard.showToast(t('main.spTooBig', { name: file.name, mb: 12 }), 'warning'); continue; }
            f.files.push({ blob, name: file.name });
        }
        renderForm();
    }
}
async function onFormClick(event) {
    const f = state.form; if (!f) return;
    if (event.target === formEl || event.target.closest('#fm-cancel')) { if (!f.sending) closeForm(); return; }
    const reason = event.target.closest('[data-fm-reason]');
    if (reason) { f.reason = reason.dataset.fmReason; renderForm(); return; }
    const un = event.target.closest('[data-fm-unfile]');
    if (un) { f.files.splice(Number(un.dataset.fmUnfile), 1); renderForm(); return; }
    if (event.target.closest('[data-fm-rec]')) {
        try {
            const ctl = await SupportRecorder.start({ onTick: (s) => { if (f.rec) { f.rec.seconds = s; const lb = formEl.querySelector('.sp-recbar b'); if (lb) lb.textContent = `${t('main.spFRecording')} · ${fmtClock(s)}`; } } });
            f.rec = { seconds: 0, ctl };
            ctl.done.then(({ blob }) => { f.rec = null; if (blob.size <= MAX_EVIDENCE_BYTES) f.files.push({ blob, name: `grabacion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm` }); else Dashboard.showToast(t('main.spTooBig', { name: t('main.spFRecord'), mb: 12 }), 'warning'); if (state.form === f) renderForm(); });
            renderForm();
        } catch (err) { Dashboard.showToast(t('main.spRecDenied'), 'warning'); }
        return;
    }
    if (event.target.closest('[data-fm-recstop]')) { if (f.rec) f.rec.ctl.stop(); return; }
    if (event.target.closest('#fm-send')) submitForm();
}
async function submitForm() {
    const f = state.form;
    if (!f || f.sending) return;
    if (f.mode === 'close-ok' || f.mode === 'close-none') return submitCloseForm();
    return submitMoveForm();
}
async function submitCloseForm() {
    const f = state.form; const c = state.d.closing;
    const ok = f.mode === 'close-ok';
    if (ok) {
        if (!f.cause) { Dashboard.showToast(t('main.clErrCause'), 'warning'); return; }
        if (f.did.trim().length < c.minText) { Dashboard.showToast(t('main.rsErrDid'), 'warning'); return; }
        if (!f.picked.size && !f.files.length) { Dashboard.showToast(t('main.clErrEvidence'), 'warning'); return; }
        if (f.rec) { Dashboard.showToast(t('main.spErrRecording'), 'warning'); return; }
    } else if (f.said.trim().length < c.minSaid) { Dashboard.showToast(t('main.clErrSaid'), 'warning'); return; }
    f.sending = true; renderForm();
    try {
        const ids = [...f.picked];
        if (ok) {
            for (const item of f.files) {
                if (item.uploaded) { ids.push(item.uploaded); continue; }
                try { item.uploaded = (await uploadFile(item, '?move=1')).id; } catch (err) { Dashboard.showToast(t('main.spFileFailed', { name: item.name, why: err.message }), 'warning'); f.sending = false; renderForm(); return; }
                ids.push(item.uploaded);
            }
        }
        const { ok: sent, out } = await postJson('close', ok ? { conformity: 'ok', causeId: Number(f.cause), did: f.did, fileIds: ids } : { conformity: 'none', said: f.said });
        if (!sent) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); f.sending = false; renderForm(); return; }
        closeForm();
        Dashboard.showToast(ok ? t('main.clDoneClosed') : t('main.clDoneReopen', { level: t('main.sopLevel_n4') }), 'success');
        await reload();
    } catch (err) {
        console.error('Soporte (SaaS): failed to close', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        if (state.form) { state.form.sending = false; renderForm(); }
    }
}
async function submitMoveForm() {
    const f = state.form; const d = state.d;
    if (!f || f.sending) return;
    const down = f.mode === 'down';
    const need = (cond, key) => { if (!cond) { Dashboard.showToast(t(key), 'warning'); return false; } return true; };
    if (down && !need(f.reason, 'main.mvErrReason')) return;
    if (!need(f.did.trim().length >= d.minText, down ? 'main.mvErrDid' : 'main.rsErrDid')) return;
    if (down && !need(f.notes.trim().length >= d.minText, 'main.mvErrNotes')) return;
    if (!need(f.files.length, 'main.mvErrFiles')) return;
    if (f.rec) { Dashboard.showToast(t('main.spErrRecording'), 'warning'); return; }
    f.sending = true; renderForm();
    try {
        const ids = [];
        for (const item of f.files) {
            if (item.uploaded) { ids.push(item.uploaded); continue; } // ya subida en un intento anterior
            try { item.uploaded = (await uploadFile(item, '?move=1')).id; } catch (err) { Dashboard.showToast(t('main.spFileFailed', { name: item.name, why: err.message }), 'warning'); f.sending = false; renderForm(); return; }
            ids.push(item.uploaded);
        }
        const { ok, out } = await postJson(down ? 'moves' : 'resolve', down ? { toLevel: f.to, reason: f.reason, did: f.did, notes: f.notes, fileIds: ids } : { did: f.did, fileIds: ids });
        if (!ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); f.sending = false; renderForm(); return; }
        closeForm();
        Dashboard.showToast(down ? t('main.mvDoneDown', { level: t(`main.sopLevel_${out.level}`) }) : t('main.rsDone'), 'success');
        await reload();
    } catch (err) {
        console.error('Soporte (SaaS): failed to send the form', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        if (state.form) { state.form.sending = false; renderForm(); }
    }
}

// ---- eventos de la pantalla ----------------------------------------------------------------------------------------------------------
document.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-ss-act]');
    if (act) {
        const kind = act.dataset.ssAct;
        if (kind === 'take') await simpleAction('take', {}, 'admin.saasSpTaken');
        else if (kind === 'resolve') openForm('resolve');
        else if (kind === 'down') openForm('down');
        return;
    }
    const closeBtn = event.target.closest('[data-ss-close]');
    if (closeBtn) { openForm(closeBtn.dataset.ssClose === 'ok' ? 'close-ok' : 'close-none'); return; }
    if (event.target.closest('#cl-aadd')) {
        if (closeAttempt.sending) return;
        if (closeAttempt.note.trim().length < ((state.d.closing && state.d.closing.minSaid) || 5)) { Dashboard.showToast(t('main.clErrAttemptNote'), 'warning'); return; }
        closeAttempt.sending = true; renderCloseCard();
        const { ok, out } = await postJson('attempts', { channel: closeAttempt.channel, note: closeAttempt.note });
        closeAttempt.sending = false;
        if (!ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); renderCloseCard(); return; }
        closeAttempt.note = '';
        await reload();
        return;
    }
    if (event.target.closest('#cl-noresp')) {
        const { ok, out } = await postJson('close', { conformity: 'noresp' });
        if (!ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); return; }
        Dashboard.showToast(t('main.clDoneNoReply'), 'success');
        await reload();
        return;
    }
    const star = event.target.closest('[data-rt-star]');
    if (star) { if (!state.rate.sending) { state.rate.stars = Number(star.dataset.n); renderRate(); } return; }
    const tag = event.target.closest('[data-rt-tag]');
    if (tag) { if (!state.rate.sending) { const k = tag.dataset.rtTag; if (state.rate.tags.has(k)) state.rate.tags.delete(k); else state.rate.tags.add(k); renderRate(); } return; }
    if (event.target.closest('#rt-send')) { submitRating(); return; }
    const tab = event.target.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; renderTabs(); renderThread(true); return; }
    const go = event.target.closest('[data-goto]');
    if (go) { const el = document.querySelector(`#sc-thread [data-msg="${go.dataset.goto}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (event.target.closest('#sc-send')) { send(); return; }
    if (event.target.closest('#sc-unattach')) { state.pending = null; renderComposer(); }
});
document.addEventListener('input', (event) => {
    if (event.target.id === 'rt-comment') state.rate.comment = event.target.value;
    if (event.target.id === 'cl-anote') closeAttempt.note = event.target.value;
});
document.addEventListener('change', async (event) => {
    if (event.target.id === 'ss-status-pick') {
        const status = event.target.value;
        if (status) await simpleAction('status', { status }, 'main.stDone');
        return;
    }
    if (event.target.id === 'ss-assign-pick') {
        const userId = Number(event.target.value);
        if (userId) {
            const name = (state.d.assignable.find((u) => u.id === userId) || {}).name || '';
            if (await simpleAction('assign', { userId }, null)) Dashboard.showToast(t('admin.saasSpAssigned', { name }), 'success');
        }
        return;
    }
    if (event.target.id === 'cl-ach') { closeAttempt.channel = event.target.value; return; }
    if (event.target.id === 'sc-note') { renderComposer(); return; }
    if (event.target.id === 'sc-file') {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        let blob = file;
        if (file.type && file.type.startsWith('image/')) { try { blob = await Dashboard.compressImageToBlob(file); } catch (err) { blob = file; } }
        if (blob.size > MAX_EVIDENCE_BYTES) { Dashboard.showToast(t('main.spTooBig', { name: file.name, mb: 12 }), 'warning'); return; }
        state.pending = { blob, name: file.name };
        renderComposer();
    }
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target.id === 'sc-text') send();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-soporte-saas' });
        if (!role) return;
        if (!Number.isInteger(caseId) || caseId < 1) { location.href = 'Admin-SoporteCasos.html'; return; }
        try {
            await loadCase();
        } catch (err) {
            const e = $('sc-error'); e.textContent = err.message || t('main.scNotFound'); e.hidden = false; return;
        }
        await loadMessages(true);
        $('sc-root').hidden = false;
        renderAll(true);
        setInterval(() => { if (!document.hidden) poll(); }, POLL_MS);
    } catch (err) {
        console.error('Soporte (SaaS) caso failed to initialize:', err);
    }
})();
})();
