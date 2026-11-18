// ---------------------------------------------------------------------------
// TI > Operaciones TI > Operaciones > Casos de soporte > un caso: lo que se contó (resumen, categoría, impacto, prioridad, plazo de la primera respuesta), el CHAT del caso de principio a fin, el recorrido («cómo se fue
// dando») y las evidencias. Se llega desde la lista (?id=). El chat junta lo que escribe el usuario y cada nivel; cada mensaje lleva el nivel de quien lo escribió (N0 = el usuario, N1 = Mesa de ayuda…). Las notas
// internas (amarillo) solo las ve el equipo con la columna Notas internas. Los renglones del sistema (llegó al nivel, primera respuesta, evidencia agregada) salen entre los mensajes y también arman el recorrido: un toque en un
// paso lleva a esa parte del chat. Lo escrito no se edita ni se borra. La pantalla pide lo nuevo cada 12 segundos mientras está abierta.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const API = '/api/business/support-cases';
const POLL_MS = 12000;
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
const caseId = Number(new URLSearchParams(location.search).get('id'));
const state = { c: null, files: [], chat: null, messages: [], tab: 'all', pending: null, sending: false, timer: null };

// ---- piezas ---------------------------------------------------------------------------------------------------------------------------
const lvBadge = (level) => (level ? `<span class="sc-lv ${esc(level)}" title="${esc(t(`main.sopLevel_${level}`))}">${esc(level.toUpperCase())}</span>` : '');
function fileHtml(f, { big } = {}) {
    const url = `${API}/${caseId}/files/${f.id}`;
    if (f.kind === 'capture') return `<a class="sc-att" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${esc(f.name)}" loading="lazy"></a>`;
    if (f.kind === 'recording') return `<video class="sc-att${big ? ' big' : ''}" src="${url}" controls preload="metadata"></video>`;
    return `<a class="btn btn-secondary sc-att-file" href="${url}" download><i class="bx bx-download" aria-hidden="true"></i> ${esc(f.name)} <small>${esc(fmtSize(f.size))}</small></a>`;
}
function eventText(m) {
    const d = m.eventData || {};
    if (m.eventKey === 'created') return t('main.spEv_created', { level: t(`main.sopLevel_${d.level || 'n1'}`) });
    if (m.eventKey === 'first_response') return t('main.spEv_first_response', { author: m.author || '—', min: friendlyMinutes(d.minutes) }) + (d.onTime === true ? t('main.spEv_ontime') : (d.onTime === false ? t('main.spEv_late') : ''));
    if (m.eventKey === 'file') return t('main.spEv_file', { author: m.author || '—', name: d.name || '' });
    const author = m.author || '—';
    if (m.eventKey === 'access_review') return d.ok ? t('main.spEv_access_ok', { author }) : t('main.spEv_access_bad', { author, n: d.missing || 0 });
    if (m.eventKey === 'access_request') return t('main.spEv_access_request', { author, items: (d.items || []).map(itemLabel).join(', ') });
    if (m.eventKey === 'understood') return t('main.spEv_understood', { author });
    if (m.eventKey === 'context') return t('main.spEv_context', { author, screen: d.screenKey ? t(d.screenKey) : '', action: d.actionKey ? t('main.spEv_context_action', { action: t(d.actionKey) }) : '' });
    if (m.eventKey === 'int_notify') return t('main.spEv_int_notify', { author, to: d.to || '' });
    if (m.eventKey === 'int_invite') return t('main.spEv_int_invite', { author, to: d.to || '' });
    if (m.eventKey === 'int_escalated') return t('main.spEv_int_escalated', { from: d.from || '', to: d.to || '', why: t(`main.perReason_${d.reason || 'no_response'}`) });
    if (m.eventKey === 'int_escalated_top') return t('main.spEv_int_escalated_top', { from: d.from || '' });
    if (m.eventKey === 'int_escalated_known') return t('main.spEv_int_escalated_known', { from: d.from || '', to: d.to || '' });
    if (m.eventKey === 'int_confirmed') return t('main.spEv_int_confirmed', { name: d.name || author, min: friendlyMinutes(d.minutes) });
    if (m.eventKey === 'int_declined') return t('main.spEv_int_declined', { name: d.name || author }) + (d.reason ? ` — ${d.reason}` : '');
    if (m.eventKey === 'person_joined') return t('main.spEv_person_joined', { name: d.name || author });
    if (m.eventKey === 'moved' && (d.solved || d.reason === 'solved')) return t('main.spEv_moved_solved', { author, from: t(`main.sopLevel_${d.from}`), to: t(`main.sopLevel_${d.to}`) });
    if (m.eventKey === 'moved') return t(d.direction === 'up' ? 'main.spEv_moved_up' : 'main.spEv_moved_down', { author, from: t(`main.sopLevel_${d.from}`), to: t(`main.sopLevel_${d.to}`) });
    if (m.eventKey === 'status_changed') return t(d.auto ? 'main.spEv_status_auto' : 'main.spEv_status_changed', { author, from: t(`main.spStatus_${d.from}`), to: t(`main.spStatus_${d.to}`) });
    if (m.eventKey === 'classified') return d.type === 'c' ? t('main.spEv_classified_c', { author }) : t(d.created ? 'main.spEv_classified_p_new' : 'main.spEv_classified_p_existing', { author, general: d.general }) + (d.others ? t('main.spEv_classified_more', { n: d.others }) : '');
    if (m.eventKey === 'general_linked') return t('main.spEv_general_linked', { author, general: d.general });
    if (m.eventKey === 'resolved') return t('main.spEv_resolved', { author });
    if (m.eventKey === 'taken') return t('main.spEv_taken', { author });
    if (m.eventKey === 'paused') return t(d.urgent ? 'main.spEv_paused' : 'main.spEv_paused_plain', { author });
    if (m.eventKey === 'resumed') return t('main.spEv_resumed', { author });
    if (m.eventKey === 'int_urgent_alert') return t('main.spEv_int_urgent_alert');
    if (m.eventKey === 'rated') return t('main.spEv_rated', { author, stars: starsText(d.stars) });
    if (m.eventKey === 'general_resolved') return t('main.spEv_general_resolved', { general: d.general });
    if (m.eventKey === 'closed') return d.noresp ? t('main.spEv_closed_noresp', { author, n: d.attempts || 0 }) : t('main.spEv_closed_ok', { author }) + (d.cause ? t('main.spEv_closed_cause', { cause: d.cause }) : '');
    if (m.eventKey === 'reopened') return d.byTeam ? t('main.spEv_reopened_team', { to: t(`main.sopLevel_${d.to}`), said: d.said || '' }) : t('main.spEv_reopened_user', { author, said: d.said || '' });
    if (m.eventKey === 'int_attempt') return t('main.spEv_int_attempt', { author, n: d.n || 1, channel: t(`main.clCh_${d.channel}`) });
    return m.eventKey;
}
// El detalle de un traspaso (solo lo ve el equipo con las notas internas): motivo, lo que hizo, las notas y cuántas evidencias.
function movedDetail(m) {
    const d = m.eventData || {};
    if (m.eventKey !== 'moved' || !d.reason) return '';
    const files = (d.fileIds || []).length;
    return `<div class="sc-why"><b>${esc(t('main.mvReasonLabel'))}:</b> ${esc(t(`main.mvReason_${d.reason}`))}<br><b>${esc(t('main.mvDidShort'))}:</b> ${esc(d.did)}${d.notes ? `<br><b>${esc(t('main.mvNotesShort'))}:</b> ${esc(d.notes)}` : ''}${files ? `<br><b>${esc(t('main.mvFilesShort'))}:</b> ${files}` : ''}</div>`;
}
function friendlyMinutes(m) {
    const n = Number(m) || 0;
    if (n < 1) return '< 1 min';
    if (n % 1440 === 0) return `${n / 1440} d`;
    if (n >= 60 && n % 60 === 0) return `${n / 60} h`;
    return `${n} min`;
}
function messageHtml(m) {
    if (m.kind === 'event') {
        const att = m.file ? `<div class="sc-ev-att">${fileHtml(m.file)}</div>` : (m.fileLocked ? `<div class="sc-ev-att sp-muted"><i class="bx bx-lock-alt" aria-hidden="true"></i> ${esc(t('main.scLocked'))}</div>` : '');
        return `<div class="sc-sep ${esc(m.eventKey)}" data-msg="${m.id}"><span>${lvBadge(m.level)} ${esc(eventText(m))}</span><time>${esc(fmtTime(m.createdAt))}</time>${m.body ? `<div class="sc-ev-body">${esc(m.body)}</div>` : ''}${movedDetail(m)}${att}</div>`;
    }
    const mine = m.authorId === state.chat.meId;
    const att = m.file ? `<div class="sc-att-wrap">${fileHtml(m.file)}</div>` : (m.fileLocked ? `<div class="sp-muted"><i class="bx bx-lock-alt" aria-hidden="true"></i> ${esc(t('main.scLocked'))}</div>` : '');
    return `<div class="sc-bub${mine ? ' me' : ''}${m.kind === 'note' ? ' note' : ''}" data-msg="${m.id}"><div class="sc-who">${lvBadge(m.level)}<b>${esc(m.author || '—')}</b> · <time>${esc(fmtTime(m.createdAt))}</time>${m.kind === 'note' ? `<span class="sc-notetag">${esc(t('main.scNoteTag'))}</span>` : ''}</div>${m.body ? `<div class="sc-txt">${esc(m.body)}</div>` : ''}${att}</div>`;
}
const visibleMessages = () => state.messages.filter((m) => (state.tab === 'files' ? (m.file || m.fileLocked) : (state.tab === 'notes' ? m.kind === 'note' : true)));

// ---- dibujar ---------------------------------------------------------------------------------------------------------------------------
function renderHeader() {
    const c = state.c;
    const answers = Object.entries(c.answers || {});
    const impacts = (c.impacts || []).filter((i) => i.level > 0).map((i) => `${esc(i.name)}: ${esc(t(`main.spLevel_${i.level}`))}`).join(' · ') || esc(t('main.spLevel_0'));
    let first;
    if (c.firstResponseAt) {
        const min = Math.max(0, Math.round((new Date(c.firstResponseAt) - new Date(c.createdAt)) / 60000));
        const late = c.dueAt && new Date(c.firstResponseAt) > new Date(c.dueAt);
        first = `<span class="${late ? 'sp-overdue' : 'sc-ok'}">${late ? '' : '✓ '}${esc(friendlyMinutes(min))}${c.dueAt ? ` · ${esc(t(late ? 'main.scLate' : 'main.scOnTime'))}` : ''}</span>`;
    } else if (c.dueAt) {
        const over = Date.now() > new Date(c.dueAt).getTime();
        first = `${esc(t('main.scPendingDue', { when: fmtTime(c.dueAt) }))}${over ? ` <span class="sp-overdue">${esc(t('main.spOverdue'))}</span>` : ''}`;
    } else first = esc(t('main.scPendingNoLimit'));
    const statusPick = state.statusCan ? `<select id="sc-status-pick" class="sc-status-pick" data-help-key="spEstatus" aria-label="${esc(t('main.stChange'))}"><option value="">${esc(t('main.stChange'))}</option>${['review', 'working', 'testing'].filter((s) => s !== c.status).map((s) => `<option value="${s}">${esc(t(`main.spStatus_${s}`))}</option>`).join('')}</select>` : '';
    const actionBtns = `${state.takeCan ? `<button type="button" class="btn btn-secondary sc-mini" data-cp-take>${esc(t('main.cpTake'))}</button>` : ''}${state.pauseCan ? `<button type="button" class="btn btn-secondary sc-mini" data-cp-pause>${esc(t('main.qPause'))}</button>` : ''}${state.resumeCan ? `<button type="button" class="btn btn-secondary sc-mini" data-cp-resume>${esc(t('main.qResume'))}</button>` : ''}`;
    $('sc-head').innerHTML = `<div><h2>${esc(c.folio)} · ${esc(c.summary)}</h2><span class="sp-muted">${esc([c.screen, c.action].filter(Boolean).join(' · '))}</span></div>
        <div class="sc-tags"><span class="sp-tag sp-type" data-k="${esc(c.type)}">${esc(t(`main.spType_${c.type}`))}</span><span class="sp-tag sp-pri" data-k="${c.priority}">${esc(t(`main.msPri_${c.priority}`))}</span>
        <span class="sp-tag sp-lv" data-k="${esc(c.level)}">${esc(t(`main.sopLevel_${c.level}`))}</span><span class="sp-tag sp-status" data-k="${esc(c.status)}">${esc(t(`main.spStatus_${c.status}`))}</span>${c.general ? `<span class="sp-tag sp-general" title="${esc(t('main.colSpGeneral'))}">${esc(c.general.folio)}</span>` : ''}${statusPick}${actionBtns}</div>`;
    $('sc-meta').innerHTML = `<dl class="sp-meta"><div><dt>${esc(t('main.colSpReporto'))}</dt><dd>${esc(c.reporter || '—')}</dd></div><div><dt>${esc(t('main.colSpFechaHora'))}</dt><dd>${esc(fmtDate(c.createdAt))}</dd></div>
        <div><dt>${esc(t('main.colSpCategoria'))}</dt><dd>${esc(c.category || '—')}</dd></div><div data-help-key="spPrimeraResp"><dt>${esc(t('main.scFirstResponse'))}</dt><dd>${first}</dd></div>
        <div><dt>${esc(t('main.spFWhen'))}</dt><dd>${esc(t(`main.spWhen_${c.whenAffects}`))}</dd></div><div><dt>${esc(t('main.spFKeep'))}</dt><dd>${esc(c.keepWorking ? t('main.spYes') : t('main.spNo'))}</dd></div>
        <div class="sp-wide"><dt>${esc(t('main.spFImpact'))}</dt><dd>${impacts}</dd></div>
        <div><dt>${esc(t('main.cpAssignee'))}</dt><dd>${esc(c.assigneeName || '—')}${c.pauseCount ? ` <span class="sp-muted">· ${esc(t('main.cpPauses', { n: c.pauseCount }))}</span>` : ''}</dd></div>
        ${c.userStars ? `<div><dt>${esc(t('main.rtMetaStars'))}</dt><dd class="sc-stars-text">${esc(starsText(c.userStars))}</dd></div>` : ''}
        ${c.errorText ? `<div class="sp-wide"><dt>${esc(t('main.spFError'))}</dt><dd class="sp-pre">${esc(c.errorText)}</dd></div>` : ''}
        ${answers.map(([id, text]) => `<div class="sp-wide"><dt>${esc(t('main.spAnswer'))}</dt><dd class="sp-pre">${esc(text)}</dd></div>`).join('')}</dl>`;
}
function renderTabs() {
    const tabs = [['all', t('main.scTabAll')], ['files', t('main.scTabFiles')], ...(state.chat.canSeeNotes ? [['notes', t('main.scTabNotes')]] : [])];
    $('sc-tabs').innerHTML = tabs.map(([k, label]) => `<button type="button" class="sp-chip${state.tab === k ? ' on' : ''}" data-tab="${k}">${esc(label)}</button>`).join('');
}
function renderThread(scrollToEnd) {
    const box = $('sc-thread');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const list = visibleMessages();
    box.innerHTML = list.length ? list.map(messageHtml).join('') : `<p class="sp-muted">${esc(t('main.scNoMessages'))}</p>`;
    if (scrollToEnd || nearBottom) box.scrollTop = box.scrollHeight;
}
// Cómo se fue dando: los renglones del sistema, en orden; un toque lleva a esa parte del chat.
function renderFlow() {
    const steps = state.messages.filter((m) => m.kind === 'event');
    $('sc-flow').innerHTML = steps.length ? `<div class="sc-tl">${steps.map((m) => `<button type="button" class="sc-step ${esc(m.level)}" data-goto="${m.id}"><time>${esc(fmtTime(m.createdAt))}</time><span class="dotc"></span><div><b>${lvBadge(m.level)} ${esc(eventText(m))}</b>${m.file && m.file.kind === 'capture' ? `<img class="sc-step-img" src="${API}/${caseId}/files/${m.file.id}" alt="" loading="lazy">` : ''}</div></button>`).join('')}</div>` : `<p class="sp-muted">${esc(t('main.scNoMessages'))}</p>`;
}
function renderFiles() {
    const c = state.c;
    if (!c.withFiles) { $('sc-files').innerHTML = `<p class="sp-muted">${esc(t('main.spFilesLocked'))}</p>`; return; }
    if (!state.files.length) { $('sc-files').innerHTML = `<p class="sp-muted">${esc(t('main.spNoFiles'))}</p>`; return; }
    const levels = [...new Set(state.files.map((f) => f.level || 'n0'))].sort();
    $('sc-files').innerHTML = levels.map((lv) => `<h4>${lvBadge(lv)} ${esc(t(`main.sopLevel_${lv}`))}</h4><div class="sp-files">${state.files.filter((f) => (f.level || 'n0') === lv).map((f) => `<div class="sp-file"><div class="sp-file-name"><b>${esc(f.name)}</b><span class="sp-muted">${esc(fmtSize(f.size))} · ${esc(f.by || '')} · ${esc(fmtDate(f.createdAt))}</span></div>${fileHtml(f, { big: true })}</div>`).join('')}</div>`).join('');
}
function renderComposer() {
    const ch = state.chat;
    const box = $('sc-composer');
    if (!ch.canSend && !ch.canWriteNotes) { box.hidden = true; return; }
    // un caso cerrado no recibe mensajes (salvo que sea «sin respuesta» y quien reportó pueda reabrirlo escribiendo)
    if (['done', 'noresp'].includes(state.c.status) && !(state.c.status === 'noresp' && state.reopenCan)) { box.hidden = true; return; }
    box.hidden = false;
    const note = $('sc-note') && $('sc-note').checked;
    const text = $('sc-text') ? $('sc-text').value : '';
    box.innerHTML = `${ch.canWriteNotes && !ch.isReporter ? `<label class="sc-notebox" data-help-key="spNotas"><input type="checkbox" id="sc-note"${note ? ' checked' : ''}${ch.canSend ? '' : ' checked disabled'}> ${esc(t('main.scNoteToggle'))}</label>` : ''}
        <textarea id="sc-text" rows="2" maxlength="${ch.max}" placeholder="${esc(t(note ? 'main.scWriteNote' : 'main.scWrite'))}">${esc(text)}</textarea>
        <div class="sc-actions">${ch.canSend || ch.canWriteNotes ? `<label class="btn btn-secondary"><i class="bx bx-paperclip" aria-hidden="true"></i> ${esc(t('main.scAttach'))}<input type="file" id="sc-file" hidden></label>` : ''}
            ${state.pending ? `<span class="sp-ok"><i class="bx bx-check" aria-hidden="true"></i> ${esc(state.pending.name)} <button type="button" class="ms-icon-btn" id="sc-unattach" aria-label="${esc(t('main.scRemove'))}"><i class="bx bx-x" aria-hidden="true"></i></button></span>` : ''}
            <button type="button" class="btn" id="sc-send"${state.sending ? ' disabled' : ''}>${esc(t(state.sending ? 'main.scSending' : 'main.scSend'))}</button></div>`;
}

// ---- datos ----------------------------------------------------------------------------------------------------------------------------
async function loadCase() {
    const res = await fetch(`${API}/${caseId}`, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'load failed');
    state.c = body.case; state.files = body.files || []; state.chat = body.chat; state.contactCan = !!(body.contact && body.contact.canSee); state.peopleCan = !!(body.people && body.people.canSee);
    state.statusCan = !!body.statusCan; state.classCan = !!body.classCan;
    state.takeCan = !!body.takeCan; state.pauseCan = !!body.pauseCan; state.resumeCan = !!body.resumeCan;
    state.closingCan = !!body.closingCan; state.reopenCan = !!body.reopenCan; state.reopenUntil = body.reopenUntil || null;
}
async function loadMessages(first) {
    if (!state.chat.canSee) return false;
    const after = first ? 0 : (state.messages.length ? state.messages[state.messages.length - 1].id : 0);
    const res = await fetch(`${API}/${caseId}/messages?after=${after}`, { credentials: 'include' });
    if (!res.ok) return false;
    const body = await res.json();
    if (first) state.messages = body.messages; else if (body.messages.length) state.messages.push(...body.messages.filter((m) => !state.messages.some((x) => x.id === m.id)));
    return body.messages.length > 0;
}
async function refresh(first) {
    try {
        const hadFirst = !!(state.c && state.c.firstResponseAt);
        const got = await loadMessages(first);
        if (!first && got) {
            await loadCase();
            renderHeader(); renderFiles();
            if (state.contactCan) await reloadContact();
            await reloadMoves();
            await reloadClass();
            await reloadClosing();
            await reloadRatings();
        }
        if (!first && state.peopleCan) await reloadPeople();
        if (first || got) { renderThread(first); renderFlow(); }
        if (!first && !hadFirst && state.c.firstResponseAt) renderHeader();
    } catch (err) { console.error('Caso de soporte: failed to refresh', err); }
}
// Sube el adjunto de un mensaje (?chat=1: el archivo saldrá dentro del mensaje, no como un renglón aparte del sistema).
async function uploadAttachment(p) {
    const res = await fetch(`${API}/${caseId}/files?chat=1`, { method: 'POST', headers: { 'Content-Type': p.blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(p.name) }, credentials: 'include', body: p.blob });
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
        // primero el adjunto (si hay) y luego el mensaje que lo lleva
        let fileId;
        if (state.pending) {
            try { fileId = (await uploadAttachment(state.pending)).id; } catch (err) { Dashboard.showToast(t('main.spFileFailed', { name: state.pending.name, why: err.message }), 'warning'); return; }
        }
        const res = await fetch(`${API}/${caseId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ body: text, note, fileId }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'warning'); return; }
        state.pending = null;
        $('sc-text').value = '';
        state.sending = false;
        await refresh(false);
        await loadCase(); renderHeader(); renderFiles();
        renderThread(true);
    } catch (err) {
        console.error('Caso de soporte: failed to send', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        state.sending = false;
        renderComposer();
    }
}

// ---- primer contacto de la Mesa de ayuda ------------------------------------------------------------------------------------------------------------------
// 1) Accesos: la pantalla y la acción del caso contra lo que tiene quien reportó (el sistema compara, la persona confirma; si falta algo lo pide aquí mismo). 2) Hablar con el usuario (el chat) y pedir lo que falta.
// 3) Lo que entendí de la situación, que viaja con el caso.
const contactState = { data: null, screens: [], draft: '', pickScreen: '', pickAction: '', pickCodes: new Set(), note: '' };
// El nombre de cada pantalla con su apartado (Correctivo · Operaciones); si dos se llaman igual, se agrega lo que las distingue.
function screenLabels(list) {
    const base = list.map((s) => `${t(s.labelKey)}${s.categoryLabelKey ? ` · ${t(s.categoryLabelKey)}` : ''}`);
    const count = new Map();
    base.forEach((b) => count.set(b, (count.get(b) || 0) + 1));
    return list.map((s, i) => ({ ...s, label: count.get(base[i]) > 1 ? `${base[i]} (${String(s.nodeId).replace(/^cat-[a-z]+-/, '')})` : base[i] }));
}
const itemLabel = (i) => (i.labelKey ? t(i.labelKey) : t(`main.supAcc_${i.code}`));
function accessRowLabel(r, screenKey) {
    if (r.code === 'action') return t(`main.supAcc_action_${r.kind}`, { label: t(r.labelKey) });
    if (r.code === 'screen') return t('main.supAcc_screen', { screen: screenKey ? t(screenKey) : '' });
    return t(`main.supAcc_${r.code}`);
}
function accessRowSource(r) {
    if (r.source === 'role') return t('main.supSrc_role', { role: r.roleName || '—' });
    return t(`main.supSrc_${r.source}`);
}
async function loadContact() {
    const res = await fetch(`${API}/${caseId}/contact`, { credentials: 'include' });
    if (!res.ok) return false;
    contactState.data = await res.json();
    return true;
}
async function loadScreens() {
    if (contactState.screens.length) return;
    const res = await fetch(`${API}/screens`, { credentials: 'include' });
    if (res.ok) contactState.screens = screenLabels((await res.json()).screens).sort((a, b) => a.label.localeCompare(b.label, locale()));
}
function chk(ok) { return `<span class="sc-chk${ok ? ' on' : ''}" aria-hidden="true">${ok ? '✓' : ''}</span>`; }
function renderContact() {
    const c = contactState.data;
    const box = $('sc-contact-card');
    if (!c) { box.hidden = true; return; }
    box.hidden = false;
    const accessDone = c.accessOk !== null;
    const evidenceMissing = c.evidence.filter((e) => !e.done);
    const done = [accessDone, c.talked, !!c.understood];
    const screenSel = c.canOperate ? `<label class="sp-field"><span>${esc(t('main.colSpPantalla'))}</span><select id="sc-pick-screen"><option value="">${esc(t('main.spFChoose'))}</option>${contactState.screens.map((s) => `<option value="${esc(s.id)}"${s.id === (contactState.pickScreen || c.screenNode) ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>` : '';
    const pickedScreen = contactState.screens.find((s) => s.id === (contactState.pickScreen || c.screenNode));
    const actionSel = c.canOperate && pickedScreen ? `<label class="sp-field"><span>${esc(t('main.spFAction'))}</span><select id="sc-pick-action"><option value="">—</option>${[...pickedScreen.actions].sort((a, b) => ['button', 'column', 'icon'].indexOf(a.kind) - ['button', 'column', 'icon'].indexOf(b.kind)).map((a) => `<option value="${esc(a.id)}"${a.id === (contactState.pickAction || (pickedScreen.id === c.screenNode ? c.actionLeaf : '')) ? ' selected' : ''}>${esc(t(`main.supActKind_${a.kind}`))}: ${esc(t(a.labelKey))}</option>`).join('')}</select></label>` : '';
    const saveCtx = c.canOperate && (contactState.pickScreen && (contactState.pickScreen !== c.screenNode || contactState.pickAction !== c.actionLeaf)) ? `<button type="button" class="btn btn-secondary" id="sc-save-ctx">${esc(t('main.supSaveContext'))}</button>` : '';
    const was = c.screen ? `${esc(t(c.screen.labelKey))}${c.actionLeaf ? ` › ${esc(c.actionLabel || '')}` : ''}` : (c.screenLabel ? `${esc(c.screenLabel)}${c.actionLabel ? ` › ${esc(c.actionLabel)}` : ''} <span class="sp-muted">(${esc(t('main.supFreeText'))})</span>` : `<span class="sp-muted">${esc(t('main.supNoScreen'))}</span>`);
    let table = '';
    if (c.review) {
        const rows = c.review.rows.map((r) => `<tr><td><span class="sp-tag ${r.ok ? 'sc-have' : 'sc-miss'}">${esc(t(r.ok ? 'main.supHas' : 'main.supMissing'))}</span></td><td>${esc(accessRowLabel(r, c.screen && c.screen.labelKey))}</td><td>${esc(t(`main.supNeed_${r.need}`))}</td><td>${esc(typeof r.have === 'number' ? String(r.have) : t(`main.supHave_${r.have}`))}</td><td>${esc(accessRowSource(r))}</td>${!r.ok && c.canRequest ? `<td><input type="checkbox" data-pick-code="${esc(r.code)}"${contactState.pickCodes.has(r.code) ? ' checked' : ''} aria-label="${esc(t('main.supAskThis'))}"></td>` : (c.canRequest ? '<td></td>' : '')}</tr>`).join('');
        const missing = c.review.rows.filter((r) => !r.ok).length;
        const req = c.canRequest && missing ? `<div class="sc-req"><input type="text" id="sc-req-note" maxlength="300" placeholder="${esc(t('main.supReqNote'))}" value="${esc(contactState.note)}"><button type="button" class="btn" id="sc-req-send" data-help-key="spPedirAcceso"${contactState.pickCodes.size ? '' : ' disabled'}>${esc(t('main.supAsk'))}</button><span class="sp-muted">${esc(t('main.supAskHint'))}</span></div>` : '';
        const confirmBtns = c.canOperate ? `<div class="sc-confirm"><button type="button" class="btn" id="sc-ok"${c.review.result === 'ok' ? '' : ' disabled'}>${esc(t('main.supConfirmOk'))}</button><button type="button" class="btn btn-secondary" id="sc-notok">${esc(t('main.supConfirmBad'))}</button><button type="button" class="btn btn-secondary" id="sc-recheck">${esc(t('main.supRecheck'))}</button></div>` : '';
        table = `<div class="sp-scroll"><table class="ms-table sc-acc"><thead><tr><th></th><th>${esc(t('main.supColAccess'))}</th><th>${esc(t('main.supColNeed'))}</th><th>${esc(t('main.supColHas', { name: c.reporter || '—' }))}</th><th>${esc(t('main.supColSource'))}</th>${c.canRequest ? '<th></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>
            <div class="sc-result ${c.review.result === 'ok' ? 'ok' : 'bad'}">${esc(t(c.review.result === 'ok' ? 'main.supResultOk' : 'main.supResultMissing', { n: missing }))}</div>${confirmBtns}${req}`;
    } else if (c.screenNode === '' && !c.canOperate) table = '';
    const reviewed = accessDone ? `<div class="sp-muted">${esc(t(c.accessOk ? 'main.supReviewedOk' : 'main.supReviewedBad', { who: c.accessCheckedBy || '—', when: fmtTime(c.accessCheckedAt) }))}</div>` : '';
    const requests = c.requests.length ? `<div class="sc-reqs"><h5>${esc(t('main.supRequests'))}</h5>${c.requests.map((r) => `<div class="sp-muted">${esc(fmtTime(r.createdAt))} · ${esc(r.by)}: ${esc(r.items.map(itemLabel).join(', '))}${r.note ? ` — ${esc(r.note)}` : ''}</div>`).join('')}</div>` : '';
    const understood = c.understood ? `<div class="sc-und"><div class="sc-txt">${esc(c.understood)}</div><div class="sp-muted">${esc(c.understoodBy || '')} · ${esc(fmtTime(c.understoodAt))}</div></div>` : '';
    const write = c.canOperate ? `<textarea id="sc-und-text" rows="3" maxlength="${c.maxUnderstood}" placeholder="${esc(t('main.supUndPlaceholder'))}">${esc(contactState.draft)}</textarea><div class="sc-actions"><button type="button" class="btn" id="sc-und-save">${esc(t('main.supUndSave'))}</button></div>` : '';
    box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('main.scContactTitle'))}</h3><div class="sc-prog">${[['main.supStep1', done[0]], ['main.supStep2', done[1]], ['main.supStep3', done[2]]].map(([k, ok]) => `<span class="sp-tag${ok ? ' sc-have' : ''}">${ok ? '✓ ' : ''}${esc(t(k))}</span>`).join('')}</div></div>
        <div class="sc-contact-cols">
            <div class="sc-step-box" data-help-key="spAccesos"><h4>1 · ${esc(t('main.supStep1'))}</h4><p>${esc(t('main.supWas', { name: c.reporter || '—' }))}: <b>${was}</b></p>
                ${c.canOperate ? `<div class="sc-ctx">${screenSel}${actionSel}${saveCtx}</div>` : ''}${table}${reviewed}${requests}</div>
            <div class="sc-step-box"><h4>2 · ${esc(t('main.supStep2'))}</h4><div class="sc-list"><div>${chk(c.talked)} ${esc(t('main.supTalked', { name: c.reporter || '—' }))}</div>
                ${c.evidence.map((e) => `<div>${chk(e.done)} ${esc(e.name)}</div>`).join('') || `<div class="sp-muted">${esc(t('main.spFNoEvidence'))}</div>`}</div>
                ${evidenceMissing.length ? `<p class="sp-muted">${esc(t('main.supAskUser', { items: evidenceMissing.map((e) => e.name).join(', ') }))}</p>` : ''}</div>
            <div class="sc-step-box" data-help-key="spEntendi"><h4>3 · ${esc(t('main.supStep3'))}</h4>${understood}${write}${!c.understood && !c.canOperate ? `<p class="sp-muted">${esc(t('main.supNoUnderstood'))}</p>` : ''}</div>
        </div>`;
}
async function reloadContact() {
    if (!(await loadContact())) return;
    renderContact();
}
async function contactPost(path, body, method = 'POST') {
    const res = await fetch(`${API}/${caseId}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); return null; }
    return out;
}
async function afterContactChange() {
    await Promise.all([reloadContact(), refresh(false)]);
    renderThread(false);
}
document.addEventListener('change', (event) => {
    const el = event.target;
    if (el.id === 'sc-pick-screen') { contactState.pickScreen = el.value; contactState.pickAction = ''; renderContact(); return; }
    if (el.id === 'sc-pick-action') { contactState.pickAction = el.value; renderContact(); return; }
    if (el.dataset && el.dataset.pickCode) { if (el.checked) contactState.pickCodes.add(el.dataset.pickCode); else contactState.pickCodes.delete(el.dataset.pickCode); renderContact(); }
});
document.addEventListener('input', (event) => {
    if (event.target.id === 'sc-und-text') contactState.draft = event.target.value;
    if (event.target.id === 'sc-req-note') contactState.note = event.target.value;
});
document.addEventListener('click', async (event) => {
    const btn = event.target.closest('#sc-save-ctx, #sc-recheck, #sc-ok, #sc-notok, #sc-req-send, #sc-und-save');
    if (!btn) return;
    btn.disabled = true;
    try {
        if (btn.id === 'sc-save-ctx') {
            const out = await contactPost('context', { screenId: contactState.pickScreen, actionId: contactState.pickAction || undefined }, 'PATCH');
            if (out) { contactState.pickScreen = ''; contactState.pickAction = ''; Dashboard.showToast(t('main.supContextSaved'), 'success'); await afterContactChange(); }
        } else if (btn.id === 'sc-recheck') { await reloadContact(); Dashboard.showToast(t('main.supRechecked'), 'success'); }
        else if (btn.id === 'sc-ok' || btn.id === 'sc-notok') {
            const out = await contactPost('access-review', { ok: btn.id === 'sc-ok' });
            if (out) { Dashboard.showToast(t('main.supReviewSaved'), 'success'); await afterContactChange(); }
        } else if (btn.id === 'sc-req-send') {
            const out = await contactPost('access-request', { codes: [...contactState.pickCodes], note: contactState.note });
            if (out) { contactState.pickCodes = new Set(); contactState.note = ''; Dashboard.showToast(t('main.supAsked'), 'success'); await afterContactChange(); }
        } else if (btn.id === 'sc-und-save') {
            const out = await contactPost('understood', { text: contactState.draft });
            if (out) { contactState.draft = ''; Dashboard.showToast(t('main.supUndSaved'), 'success'); await afterContactChange(); }
        }
    } finally { btn.disabled = false; }
});

// ---- quién reportó y su equipo ----------------------------------------------------------------------------------------------------------------------------
// La ficha de quien reportó y su organigrama (jefes de arriba, jefe directo y compañeros). Con Ver y operar, cada persona lleva dos casillas: Avisar (una nota en su campana, sin entrar al chat; debe tocar «Enterado») e
// Invitar (se suma al chat; debe aceptar). Si alguien no responde en el plazo, el aviso pasa al jefe de esa persona con la nota de qué pasó (se ve en la lista de seguimiento).
const peopleState = { data: null, notify: new Set(), invite: new Set(), message: '' };
function monthsSince(dateText) {
    const d = new Date(dateText);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth());
}
async function loadPeople() {
    const res = await fetch(`${API}/${caseId}/people`, { credentials: 'include' });
    if (!res.ok) return false;
    peopleState.data = await res.json();
    return true;
}
function personStatusText(p) {
    if (!p) return '';
    const when = (iso) => fmtTime(iso);
    if (p.status === 'pending') return t(p.kind === 'invite' ? 'main.perWaitingInvite' : 'main.perWaitingNotice', { when: when(p.dueAt) });
    if (p.status === 'confirmed') return t('main.perConfirmed', { when: when(p.respondedAt) });
    if (p.status === 'accepted') return t('main.perAccepted', { when: when(p.respondedAt) });
    if (p.status === 'declined') return t('main.perDeclined');
    if (p.status === 'expired') return t('main.perExpired');
    return '';
}
function orgNodeHtml(n, { tag, me, direct } = {}) {
    const d = peopleState.data;
    const p = d.people.find((x) => x.userId === n.userId);
    const selectable = d.canOperate && n.userId && !me;
    const involved = !!p;
    const boxes = selectable ? `<div class="osel"><label class="ob${peopleState.notify.has(n.userId) ? ' on' : ''}"><input type="checkbox" data-org-notify="${n.userId}"${peopleState.notify.has(n.userId) ? ' checked' : ''}${involved ? ' disabled' : ''}> ${esc(t('main.perNotify'))}</label>${d.allowInvite ? `<label class="ob${peopleState.invite.has(n.userId) ? ' on' : ''}"><input type="checkbox" data-org-invite="${n.userId}"${peopleState.invite.has(n.userId) ? ' checked' : ''}${involved && p.kind === 'invite' ? ' disabled' : ''}> ${esc(t('main.perInvite'))}</label>` : ''}</div>` : '';
    const status = p ? `<span class="odone ${esc(p.status)}">${esc(personStatusText(p))}</span>` : '';
    const noAccount = !n.userId && !me ? `<span class="sp-muted">${esc(t('main.perNoAccount'))}</span>` : '';
    return `<div class="onode${me ? ' me' : ''}">${tag ? `<span class="otag${me ? ' me' : ''}">${esc(tag)}</span>` : ''}<span class="sc-av" aria-hidden="true">${esc(String(n.name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase())}</span><b>${esc(n.name || '—')}</b><span class="sp-muted">${esc(n.role || n.position || '')}</span>${me ? `<span class="odone">${esc(t('main.perInCase'))}</span>` : `${boxes}${status}${noAccount}`}</div>`;
}
function renderPeople() {
    const d = peopleState.data;
    const box = $('sc-people-card');
    if (!d) { box.hidden = true; return; }
    box.hidden = false;
    const o = d.org; const person = o.person;
    const months = monthsSince(person.startDate);
    const card = `<div class="p1"><span class="sc-av big" aria-hidden="true">${esc(String(person.name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase())}</span><div><b>${esc(person.name || '—')}</b>
        <span class="sp-muted">${esc([person.position, person.department, person.area].filter(Boolean).join(' · ') || '—')}</span>
        <span class="sp-muted">${esc(t('main.perRole'))}: ${esc(person.role || '—')}${months !== null ? ` · ${esc(t('main.perTenure', { n: months }))}` : ''}</span></div></div>
        ${person.workplaces.length ? `<div><span class="k">${esc(t('main.perWorks'))}</span><p>${esc(person.workplaces.join(' · '))}</p></div>` : ''}
        ${person.email || person.phone ? `<div><span class="k">${esc(t('main.perContact'))}</span><p>${esc([person.email, person.phone].filter(Boolean).join(' · '))}</p></div>` : ''}`;
    const chain = [...o.chain].reverse();
    const levels = chain.map((lvl, i) => {
        const isDirect = i === chain.length - 1;
        return `<div class="olvl">${lvl.people.map((n) => orgNodeHtml(n, { tag: isDirect ? t('main.perDirectBoss') : '' })).join('') || `<div class="onode"><span class="sp-muted">${esc(lvl.positionName)} · ${esc(t('main.perNobody'))}</span></div>`}</div><div class="vl"></div>`;
    }).join('');
    const reporter = orgNodeHtml({ userId: person.userId, name: person.name, role: person.role || person.position }, { tag: t('main.perReported'), me: true });
    const peers = o.peers.map((n) => `<div class="child">${orgNodeHtml(n)}</div>`).join('');
    const direct = (chain.length ? chain[chain.length - 1].people : []).filter((n) => n.userId);
    const allBosses = chain.flatMap((l) => l.people).filter((n) => n.userId);
    const quick = d.canOperate ? `<div class="chipset"><span class="tagq">${esc(t('main.perQuick'))}</span><button type="button" class="chip" data-quick="direct"${direct.length ? '' : ' disabled'}>${esc(t('main.perDirectBoss'))}</button><button type="button" class="chip" data-quick="chain"${allBosses.length ? '' : ' disabled'}>${esc(t('main.perChain'))}</button><button type="button" class="chip" data-quick="peers"${o.peers.some((n) => n.userId) ? '' : ' disabled'}>${esc(t('main.perPeers'))}</button><button type="button" class="chip" data-quick="clear">${esc(t('main.perClear'))}</button></div>` : '';
    const nameOf = (id) => { const all = [...o.chain.flatMap((l) => l.people), ...o.peers]; return (all.find((n) => n.userId === id) || {}).name || String(id); };
    const total = peopleState.notify.size + peopleState.invite.size;
    const summary = total ? `<div class="selsum"><b>${esc(t('main.perSelected', { n: total }))}</b> ${[...peopleState.notify].map((id) => `${esc(nameOf(id))} <span class="pill blue">${esc(t('main.perNotify').toLowerCase())}</span>`).join(' &nbsp; ')} ${[...peopleState.invite].map((id) => `${esc(nameOf(id))} <span class="pill good">${esc(t('main.perInviteChat'))}</span>`).join(' &nbsp; ')}</div>` : '';
    const action = d.canOperate ? `<div class="actbar">${quick}${summary}<input type="text" id="sc-ppl-msg" maxlength="300" placeholder="${esc(t('main.perMessage'))}" value="${esc(peopleState.message)}"><div class="sc-actions"><button type="button" class="btn" id="sc-ppl-send"${total ? '' : ' disabled'}>${esc(t('main.perSend', { n: total }))}</button></div><p class="sp-muted">${esc(t('main.perHint', { hours: d.hours }))}</p></div>` : '';
    const follow = d.people.length ? `<div class="sc-follow"><h4>${esc(t('main.perFollow'))}</h4><table class="ms-table"><thead><tr><th>${esc(t('main.perColWho'))}</th><th>${esc(t('main.perColWhat'))}</th><th>${esc(t('main.perColStatus'))}</th><th>${esc(t('main.perColNote'))}</th></tr></thead><tbody>${d.people.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(t(p.kind === 'invite' ? 'main.perKindInvite' : 'main.perKindNotice'))}</td><td><span class="sp-tag per-${esc(p.status)}">${esc(personStatusText(p))}</span></td><td>${p.fromName ? esc(t('main.perFromBoss', { name: p.fromName, reason: t(`main.perReason_${p.reason || 'no_response'}`) })) : (p.reason === 'auto_urgent' ? esc(t('main.perAutoUrgent')) : esc(p.message || ''))}</td></tr>`).join('')}</tbody></table></div>` : '';
    box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('main.scPeopleTitle'))}</h3></div>
        <div class="ppl2"><div class="ppl-left">${card}</div><div class="orgbox"><div class="org">${levels}<div class="olvl">${reporter}</div>${peers ? `<div class="vl"></div><div class="branch">${peers}</div>` : ''}</div></div></div>${action}${follow}`;
}
async function reloadPeople() {
    if (!state.peopleCan) return;
    if (document.activeElement && document.activeElement.id === 'sc-ppl-msg') return; // sin quitarle el cursor a quien está escribiendo
    if (await loadPeople()) renderPeople();
}
document.addEventListener('change', (event) => {
    const el = event.target;
    if (el.dataset && el.dataset.orgNotify) { const id = Number(el.dataset.orgNotify); if (el.checked) { peopleState.notify.add(id); peopleState.invite.delete(id); } else peopleState.notify.delete(id); renderPeople(); return; }
    if (el.dataset && el.dataset.orgInvite) { const id = Number(el.dataset.orgInvite); if (el.checked) { peopleState.invite.add(id); peopleState.notify.delete(id); } else peopleState.invite.delete(id); renderPeople(); }
});
document.addEventListener('input', (event) => { if (event.target.id === 'sc-ppl-msg') peopleState.message = event.target.value; });
document.addEventListener('click', async (event) => {
    const quick = event.target.closest('[data-quick]');
    if (quick && peopleState.data) {
        const o = peopleState.data.org; const involved = new Set(peopleState.data.people.map((p) => p.userId));
        const add = (list) => list.filter((n) => n.userId && !involved.has(n.userId)).forEach((n) => { peopleState.notify.add(n.userId); peopleState.invite.delete(n.userId); });
        const chain = [...o.chain].reverse();
        if (quick.dataset.quick === 'direct') add(chain.length ? chain[chain.length - 1].people : []);
        else if (quick.dataset.quick === 'chain') add(chain.flatMap((l) => l.people));
        else if (quick.dataset.quick === 'peers') add(o.peers);
        else { peopleState.notify.clear(); peopleState.invite.clear(); }
        renderPeople();
        return;
    }
    const send = event.target.closest('#sc-ppl-send');
    if (!send) return;
    send.disabled = true;
    try {
        const res = await fetch(`${API}/${caseId}/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ notify: [...peopleState.notify], invite: [...peopleState.invite], message: peopleState.message }) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); return; }
        peopleState.notify.clear(); peopleState.invite.clear(); peopleState.message = '';
        Dashboard.showToast(t('main.perSent'), 'success');
        await Promise.all([reloadPeople(), refresh(false)]);
        renderThread(false);
    } finally { send.disabled = false; }
});

// ---- por dónde pasó el caso, y subirlo o devolverlo ------------------------------------------------------------------------------------------------------------
// La barra de tiempo en cada nivel y los botones «Subir de nivel» / «Devolver» (cada uno con su hoja del árbol). La ventana pide el motivo, lo que se hizo en el nivel, las notas para el siguiente y al menos una evidencia
// (se puede grabar la pantalla); al subir avisa si falta alguna evidencia que pide la categoría. Lo escrito no se edita ni se borra.
const moveState = { data: null, form: null };
function fmtDuration(min) {
    const n = Math.max(0, Number(min) || 0);
    if (n < 1) return '< 1 min';
    if (n < 60) return `${n} min`;
    if (n < 1440) return `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}`;
    return `${Math.floor(n / 1440)} d${Math.floor((n % 1440) / 60) ? ` ${Math.floor((n % 1440) / 60)} h` : ''}`;
}
async function loadMoves() {
    const res = await fetch(`${API}/${caseId}/moves`, { credentials: 'include' });
    if (!res.ok) return false;
    moveState.data = await res.json();
    return true;
}
function renderLane() {
    const d = moveState.data;
    const box = $('sc-lane-card');
    if (!d) { box.hidden = true; return; }
    box.hidden = false;
    const total = d.segments.reduce((a, s) => a + Math.max(s.minutes, 1), 0);
    const bar = d.segments.map((s) => `<div class="sc-seg ${esc(s.level)} ${esc(s.how)}" style="flex:${Math.max(Math.max(s.minutes, 1) / total * 100, 9)} 1 0" title="${esc(t(`main.sopLevel_${s.level}`))} · ${esc(fmtDuration(s.minutes))}">${lvBadge(s.level)}<b>${esc(fmtDuration(s.minutes))}</b>${s.how === 'down' ? '<span aria-hidden="true">↩</span>' : ''}</div>`).join('');
    const list = d.segments.map((s) => `<div class="sc-seg-row"><span>${lvBadge(s.level)} ${esc(t(`main.sopLevel_${s.level}`))}</span><span class="sp-muted">${esc(fmtTime(s.startAt))} · ${esc(fmtDuration(s.minutes))}${s.endAt ? '' : ` · ${esc(t('main.mvNow'))}`} · ${esc(t(`main.mvHow_${s.how}`))}</span></div>`).join('');
    const btns = `${d.canUp ? `<button type="button" class="btn" data-move="up">↑ ${esc(t('main.mvUp'))}</button>` : ''}${d.canDown ? `<button type="button" class="btn btn-secondary" data-move="down">↓ ${esc(t('main.mvDown'))}</button>` : ''}`;
    box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('main.mvLaneTitle'))}</h3><div class="sc-actions">${btns}</div></div><div class="sc-lane">${bar}</div><div class="sc-seg-list">${list}</div>`;
}
async function reloadMoves() {
    if (!state.chat || !state.chat.canSee || state.chat.isReporter) return;
    if (await loadMoves()) renderLane();
}
let moveEl = null;
function moveToOptions() { const d = moveState.data; const f = moveState.form; return f.dir === 'up' ? d.upTo : d.downTo; }
function renderMoveForm() {
    const d = moveState.data; const f = moveState.form;
    const opts = moveToOptions();
    const reasons = d.reasons[f.dir].map((r) => `<button type="button" class="sp-chip${f.reason === r ? ' on' : ''}" role="radio" aria-checked="${f.reason === r}" data-mv-reason="${r}">${esc(t(`main.mvReason_${r}`))}</button>`).join('');
    const files = f.files.map((x, i) => `<div class="sp-slot-row"><span class="sp-ok"><i class="bx bx-check" aria-hidden="true"></i> ${esc(x.name)} <small class="sp-muted">${esc(fmtSize(x.blob.size))}</small></span><button type="button" class="ms-icon-btn" data-mv-unfile="${i}" aria-label="${esc(t('main.scRemove'))}"><i class="bx bx-trash" aria-hidden="true"></i></button></div>`).join('');
    const canRec = window.SupportRecorder && SupportRecorder.canRecord();
    const rec = f.rec ? `<span class="sp-recbar"><span class="sp-recdot"></span><b>${esc(t('main.spFRecording'))} · ${esc(fmtClock(f.rec.seconds))}</b><button type="button" class="btn" data-mv-recstop>${esc(t('main.spFRecStop'))}</button></span>` : (canRec ? `<button type="button" class="btn btn-secondary" data-mv-rec><i class="bx bx-radio-circle-marked" aria-hidden="true"></i> ${esc(t('main.spFRecord'))}</button>` : '');
    const miss = f.dir === 'up' && d.missingEvidence.length ? `<div class="sc-warn"><b>${esc(t('main.mvMissing'))}</b> ${esc(d.missingEvidence.map((e) => e.name).join(', '))}<label><input type="checkbox" id="mv-confirm"${f.confirmMissing ? ' checked' : ''}> ${esc(t('main.mvMissingConfirm'))}</label></div>` : '';
    const both = d.canUp && d.canDown;
    moveEl.querySelector('#mv-body').innerHTML = `
        ${both ? `<div class="sp-chips"><button type="button" class="sp-chip${f.dir === 'up' ? ' on' : ''}" data-mv-dir="up">↑ ${esc(t('main.mvUp'))}</button><button type="button" class="sp-chip${f.dir === 'down' ? ' on' : ''}" data-mv-dir="down">↓ ${esc(t('main.mvDown'))}</button></div>` : ''}
        <label class="sp-field"><span>${esc(t('main.mvTo'))} *</span><select id="mv-to">${opts.map((l) => `<option value="${l}"${l === f.to ? ' selected' : ''}>${esc(t(`main.sopLevel_${l}`))}</option>`).join('')}</select></label>
        <div class="sp-field"><span>${esc(t('main.mvReason'))} *</span><div class="sp-chips" role="radiogroup">${reasons}</div></div>
        <label class="sp-field"><span>${esc(t('main.mvDid'))} * <small class="sp-muted">${esc(t('main.mvDidHint'))}</small></span><textarea id="mv-did" rows="3" maxlength="${d.maxText}">${esc(f.did)}</textarea></label>
        <label class="sp-field"><span>${esc(t('main.mvNotes'))} * <small class="sp-muted">${esc(t('main.mvNotesHint'))}</small></span><textarea id="mv-notes" rows="3" maxlength="${d.maxText}">${esc(f.notes)}</textarea></label>
        <div class="sp-field"><span>${esc(t('main.mvFiles'))} * <small class="sp-muted">${esc(t('main.mvFilesHint'))}</small></span>${files}
            <div class="sp-slot-row"><label class="btn btn-secondary"><i class="bx bx-paperclip" aria-hidden="true"></i> ${esc(t('main.scAttach'))}<input type="file" id="mv-file" multiple hidden></label>${rec}</div></div>
        ${miss}`;
    const send = moveEl.querySelector('#mv-send');
    send.disabled = f.sending;
    send.textContent = f.sending ? t('main.spFSending') : t(f.dir === 'up' ? 'main.mvSendUp' : 'main.mvSendDown', { level: t(`main.sopLevel_${f.to}`) });
    moveEl.querySelector('#mv-title').textContent = t(f.dir === 'up' ? 'main.mvUp' : 'main.mvDown');
}
function closeMove() { if (moveState.form && moveState.form.rec) { try { moveState.form.rec.ctl.stop(); } catch (err) { /* ya terminó */ } } if (moveEl) moveEl.hidden = true; moveState.form = null; }
function openMove(dir) {
    const d = moveState.data;
    if (!moveEl) {
        moveEl = document.createElement('div');
        moveEl.className = 'modal-overlay';
        moveEl.hidden = true;
        moveEl.innerHTML = '<div class="modal-panel sp-form sc-move" role="dialog" aria-modal="true" aria-labelledby="mv-title"><h3 id="mv-title"></h3><div id="mv-body"></div><p class="sp-muted" id="mv-note"></p><div class="admin-form-actions"><button type="button" class="btn" id="mv-send"></button><button type="button" class="btn btn-secondary" id="mv-cancel"></button></div></div>';
        document.body.appendChild(moveEl);
        moveEl.addEventListener('click', onMoveClick);
        moveEl.addEventListener('input', onMoveInput);
        moveEl.addEventListener('change', onMoveChange);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && moveState.form && !moveState.form.sending) closeMove(); });
    }
    moveState.form = { dir, to: (dir === 'up' ? d.upTo : d.downTo)[0], reason: '', did: '', notes: '', files: [], confirmMissing: false, rec: null, sending: false };
    moveEl.querySelector('#mv-cancel').textContent = t('main.spFCancel');
    moveEl.querySelector('#mv-note').textContent = t('main.mvHint');
    renderMoveForm();
    moveEl.hidden = false;
}
function onMoveInput(event) {
    const f = moveState.form; if (!f) return;
    if (event.target.id === 'mv-did') f.did = event.target.value;
    else if (event.target.id === 'mv-notes') f.notes = event.target.value;
}
async function onMoveChange(event) {
    const f = moveState.form; if (!f) return;
    const el = event.target;
    if (el.id === 'mv-to') { f.to = el.value; renderMoveForm(); return; }
    if (el.id === 'mv-confirm') { f.confirmMissing = el.checked; return; }
    if (el.id === 'mv-file') {
        const picked = [...(el.files || [])]; el.value = '';
        for (const file of picked) {
            let blob = file;
            if (file.type && file.type.startsWith('image/')) { try { blob = await Dashboard.compressImageToBlob(file); } catch (err) { blob = file; } }
            if (blob.size > 12 * 1048576) { Dashboard.showToast(t('main.spTooBig', { name: file.name, mb: 12 }), 'warning'); continue; }
            f.files.push({ blob, name: file.name });
        }
        renderMoveForm();
    }
}
async function onMoveClick(event) {
    const f = moveState.form; if (!f) return;
    if (event.target === moveEl || event.target.closest('#mv-cancel')) { if (!f.sending) closeMove(); return; }
    const dir = event.target.closest('[data-mv-dir]');
    if (dir) { f.dir = dir.dataset.mvDir; f.to = moveToOptions()[0]; f.reason = ''; renderMoveForm(); return; }
    const reason = event.target.closest('[data-mv-reason]');
    if (reason) { f.reason = reason.dataset.mvReason; renderMoveForm(); return; }
    const un = event.target.closest('[data-mv-unfile]');
    if (un) { f.files.splice(Number(un.dataset.mvUnfile), 1); renderMoveForm(); return; }
    if (event.target.closest('[data-mv-rec]')) {
        try {
            const ctl = await SupportRecorder.start({ onTick: (s) => { if (f.rec) { f.rec.seconds = s; const lb = moveEl.querySelector('.sp-recbar b'); if (lb) lb.textContent = `${t('main.spFRecording')} · ${fmtClock(s)}`; } } });
            f.rec = { seconds: 0, ctl };
            ctl.done.then(({ blob }) => { f.rec = null; if (blob.size <= 12 * 1048576) f.files.push({ blob, name: `grabacion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm` }); else Dashboard.showToast(t('main.spTooBig', { name: t('main.spFRecord'), mb: 12 }), 'warning'); if (moveState.form === f) renderMoveForm(); });
            renderMoveForm();
        } catch (err) { Dashboard.showToast(t('main.spRecDenied'), 'warning'); }
        return;
    }
    if (event.target.closest('[data-mv-recstop]')) { if (f.rec) f.rec.ctl.stop(); return; }
    if (event.target.closest('#mv-send')) submitMove();
}
async function submitMove() {
    const f = moveState.form; const d = moveState.data;
    if (!f || f.sending) return;
    const need = (cond, key) => { if (!cond) { Dashboard.showToast(t(key), 'warning'); return false; } return true; };
    if (!need(f.reason, 'main.mvErrReason') || !need(f.did.trim().length >= d.minText, 'main.mvErrDid') || !need(f.notes.trim().length >= d.minText, 'main.mvErrNotes') || !need(f.files.length, 'main.mvErrFiles')) return;
    if (f.rec) { Dashboard.showToast(t('main.spErrRecording'), 'warning'); return; }
    f.sending = true; renderMoveForm();
    try {
        const ids = [];
        for (const item of f.files) {
            if (item.uploaded) { ids.push(item.uploaded); continue; } // ya subida en un intento anterior
            const res = await fetch(`${API}/${caseId}/files?move=1`, { method: 'POST', headers: { 'Content-Type': item.blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(item.name) }, credentials: 'include', body: item.blob });
            const out = await res.json().catch(() => ({}));
            if (!res.ok) { Dashboard.showToast(t('main.spFileFailed', { name: item.name, why: out.message || Dashboard.t('admin.saveError') }), 'warning'); f.sending = false; renderMoveForm(); return; }
            ids.push(out.file.id);
            item.uploaded = out.file.id;
        }
        const res = await fetch(`${API}/${caseId}/moves`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ direction: f.dir, toLevel: f.to, reason: f.reason, did: f.did, notes: f.notes, fileIds: ids, confirmMissing: f.confirmMissing }) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) {
            Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning');
            // las evidencias ya subidas se quedan (marcadas) para el siguiente intento: no se vuelven a mandar
            f.sending = false; renderMoveForm();
            return;
        }
        closeMove();
        Dashboard.showToast(t(f.dir === 'up' ? 'main.mvDoneUp' : 'main.mvDoneDown', { level: t(`main.sopLevel_${out.level}`) }), 'success');
        await Promise.all([loadCase().then(() => { renderHeader(); renderFiles(); }), reloadMoves(), refresh(false)]);
        renderThread(true);
    } catch (err) {
        console.error('Caso de soporte: failed to move', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        if (moveState.form) { moveState.form.sending = false; renderMoveForm(); }
    }
}
document.addEventListener('click', (event) => {
    const mv = event.target.closest('[data-move]');
    if (mv && moveState.data) openMove(mv.dataset.move);
});

// ---- estatus y clasificación (Correctivo / Preventivo) -------------------------------------------------------------------------------------------------------------
// El estatus se cambia desde el desplegable del encabezado (con el botón «Cambiar estatus» del árbol). La tarjeta «Clasificación» (columna del árbol) le muestra a la Mesa de ayuda el rol de quien reportó, cuántas personas lo tienen
// y los casos parecidos de la semana; ella decide si es Correctivo o Preventivo (y en ese caso abre un Soporte general o liga el caso a uno abierto). Preventivo ya no regresa.
const STATUS_TARGETS = ['review', 'working', 'testing'];
const classState = { data: null, form: null };
async function changeStatus(status) {
    try {
        const res = await fetch(`${API}/${caseId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status }) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); await loadCase(); renderHeader(); return; }
        Dashboard.showToast(t('main.stDone', { status: t(`main.spStatus_${status}`) }), 'success');
        await loadCase(); renderHeader();
        await refresh(false);
        renderThread(true);
    } catch (err) {
        console.error('Caso de soporte: failed to change status', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
async function loadClass() {
    const res = await fetch(`${API}/${caseId}/classification`, { credentials: 'include' });
    if (!res.ok) return false;
    classState.data = await res.json();
    return true;
}
function newClassForm() {
    const d = classState.data;
    const a = d.analysis;
    return { type: '', mode: 'new', title: d.defaultTitle, level: d.levels.includes(state.c.level) ? state.c.level : d.levels[0], notify: true, general: a && a.openGenerals.length ? String((a.openGenerals.find((g) => g.sameScreen) || a.openGenerals[0]).id) : '', link: new Set(a ? a.similar.map((c) => c.id) : []), sending: false };
}
function generalBoxHtml(g) {
    const rows = (g.cases || []).map((c) => `<tr><td><b>${esc(c.folio)}</b></td><td>${esc(c.reporter || '—')}</td><td>${lvBadge(c.level)}</td><td><span class="sp-tag sp-status" data-k="${esc(c.status)}">${esc(t(`main.spStatus_${c.status}`))}</span></td></tr>`).join('');
    return `<div class="sc-sg"><div class="sc-card-head"><h4>${esc(t('main.clGeneralTitle', { folio: g.folio }))}</h4><span class="sc-tags"><span class="sp-tag sp-type" data-k="p">${esc(t('main.spType_p'))}</span><span class="sp-tag sp-general">${esc(t(`main.clGenSt_${g.status}`))}</span></span></div>
        <dl class="sp-meta"><div class="sp-wide"><dt>${esc(t('main.clGenWhat'))}</dt><dd>${esc(g.title)}</dd></div><div><dt>${esc(t('main.clGenRole'))}</dt><dd>${esc(g.role ? t('main.clGenRoleVal', { role: g.role, n: g.affected }) : '—')}</dd></div>
        <div><dt>${esc(t('main.clGenLevel'))}</dt><dd>${esc(t(`main.sopLevel_${g.level}`))}</dd></div><div><dt>${esc(t('main.colSpPrioridad'))}</dt><dd><span class="sp-tag sp-pri" data-k="${g.priority}">${esc(t(`main.msPri_${g.priority}`))}</span></dd></div><div><dt>${esc(t('main.clGenNotified'))}</dt><dd>${g.notified}</dd></div></dl>
        <div class="sc-sg-table"><table class="ms-table"><thead><tr><th>${esc(t('main.clColCase'))}</th><th>${esc(t('main.clColUser'))}</th><th>${esc(t('main.colSpNivel'))}</th><th>${esc(t('main.colSpEstatus'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${g.status !== 'open' ? `<p class="sp-muted">${esc(t('main.clGenResolvedLine', { by: g.resolvedBy || '—', when: g.resolvedAt ? fmtTime(g.resolvedAt) : '—', did: g.resolvedDid || '' }))}</p>` : ''}
        ${g.canResolve ? `<div class="admin-form-actions"><button type="button" class="btn" data-cl-resolve-general>✓ ${esc(t('main.clGenResolveBtn'))}</button></div>` : ''}
        <p class="sp-muted">${esc(t('main.clGenHint'))}</p></div>`;
}
function renderClass() {
    const d = classState.data;
    const box = $('sc-class-card');
    if (!d) { box.hidden = true; return; }
    box.hidden = false;
    const c = state.c;
    const typeTag = `<span class="sp-tag sp-type" data-k="${esc(c.type)}">${esc(t(`main.spType_${c.type}`))}</span>`;
    const decided = d.classifiedAt ? `<span class="sp-muted">${esc(t('main.clDecided', { by: d.classifiedBy || '—', when: fmtTime(d.classifiedAt) }))}</span>` : `<span class="sp-muted">${esc(t('main.clPending'))}</span>`;
    let inner = '';
    if (d.general) inner = generalBoxHtml(d.general) + `<p class="sp-muted">${esc(t('main.clLocked'))}</p>`;
    else if (d.canOperate && d.analysis) {
        if (!classState.form) classState.form = newClassForm();
        const f = classState.form; const a = d.analysis;
        const facts = `<dl class="sp-meta"><div><dt>${esc(t('main.clRole'))}</dt><dd>${esc(a.roleName || t('main.clNoRole'))}</dd></div><div><dt>${esc(t('main.clRoleCount'))}</dt><dd>${a.roleCount}</dd></div>
            <div><dt>${esc(t('main.clAffected'))}</dt><dd>${a.accessChecked ? a.affectedCount : `${a.affectedCount} <span class="sp-muted">${esc(t('main.clAffectedAll'))}</span>`}</dd></div><div><dt>${esc(t('main.clSimilarCount'))}</dt><dd>${a.similar.length}</dd></div></dl>`;
        const choice = `<div class="sp-field"><span>${esc(t('main.clQuestion'))} *</span><div class="sp-chips" role="radiogroup"><button type="button" class="sp-chip${f.type === 'c' ? ' on' : ''}" role="radio" aria-checked="${f.type === 'c'}" data-cl-type="c">${esc(t('main.clNo'))} · <b>${esc(t('main.spType_c'))}</b></button>
            <button type="button" class="sp-chip${f.type === 'p' ? ' on' : ''}" role="radio" aria-checked="${f.type === 'p'}" data-cl-type="p">${esc(t('main.clYes'))} · <b>${esc(t('main.spType_p'))}</b></button></div></div>`;
        let more = '';
        if (f.type === 'p') {
            const modes = a.openGenerals.length ? `<div class="sp-chips" role="radiogroup"><button type="button" class="sp-chip${f.mode === 'new' ? ' on' : ''}" data-cl-mode="new">${esc(t('main.clModeNew'))}</button><button type="button" class="sp-chip${f.mode === 'existing' ? ' on' : ''}" data-cl-mode="existing">${esc(t('main.clModeExisting'))}</button></div>` : '';
            const fresh = f.mode === 'new'
                ? `<label class="sp-field"><span>${esc(t('main.clGenTitleLabel'))} * <small class="sp-muted">${esc(t('main.clGenTitleHint'))}</small></span><input type="text" id="cl-title" maxlength="${d.titleMax}" value="${esc(f.title)}"></label>
                   <label class="sp-field"><span>${esc(t('main.clGenLevel'))}</span><select id="cl-level">${d.levels.map((l) => `<option value="${l}"${l === f.level ? ' selected' : ''}>${esc(t(`main.sopLevel_${l}`))}</option>`).join('')}</select></label>
                   ${a.affectedCount > 1 ? `<label class="sc-warn-line"><input type="checkbox" id="cl-notify"${f.notify ? ' checked' : ''}> ${esc(t('main.clNotify', { n: Math.max(0, a.affectedCount - 1) }))}</label>` : `<p class="sp-muted">${esc(t('main.clNotifyNone'))}</p>`}`
                : `<label class="sp-field"><span>${esc(t('main.clPickGeneral'))} *</span><select id="cl-general">${a.openGenerals.map((g) => `<option value="${g.id}"${String(g.id) === f.general ? ' selected' : ''}>${esc(`${g.folio} · ${g.title}${g.sameScreen ? ` ★ ${t('main.clSameScreen')}` : ''}`)}</option>`).join('')}</select></label>`;
            const similar = a.similar.length ? `<div class="sp-field"><span>${esc(t('main.clSimilarTitle'))} <small class="sp-muted">${esc(t('main.clSimilarHint'))}</small></span><div class="sc-sim">${a.similar.map((s) => `<label><input type="checkbox" data-cl-link="${s.id}"${f.link.has(s.id) ? ' checked' : ''}> <b>${esc(s.folio)}</b> · ${esc(s.reporter || '—')} · ${esc(s.summary)} <span class="sp-tag sp-status" data-k="${esc(s.status)}">${esc(t(`main.spStatus_${s.status}`))}</span></label>`).join('')}</div></div>` : `<p class="sp-muted">${esc(t('main.clSimilarNone'))}</p>`;
            more = `${modes}${fresh}${similar}`;
        }
        const label = f.type === 'p' ? (f.mode === 'new' ? t('main.clSaveP') : t('main.clSavePExisting')) : t('main.clSaveC');
        inner = `${facts}${choice}${more}<div class="admin-form-actions"><button type="button" class="btn" id="cl-save"${f.type && !f.sending ? '' : ' disabled'}>${esc(f.sending ? t('main.spFSending') : label)}</button></div>`;
    } else inner = `<p class="sp-muted">${esc(t('main.clReadOnly'))}</p>`;
    box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('main.clTitle'))}</h3><div class="sc-tags">${typeTag}${decided}</div></div>${inner}`;
}
async function reloadClass() {
    if (!state.classCan) return;
    if (await loadClass()) {
        if (classState.data.general || !classState.data.canOperate) classState.form = null;
        renderClass();
    }
}
async function submitClass() {
    const f = classState.form; const d = classState.data;
    if (!f || f.sending) return;
    if (!f.type) { Dashboard.showToast(t('main.clErrType'), 'warning'); return; }
    const body = { type: f.type };
    if (f.type === 'p') {
        body.mode = f.mode; body.linkCaseIds = [...f.link];
        if (f.mode === 'new') {
            if (f.title.trim().length < d.titleMin) { Dashboard.showToast(t('main.clErrTitle'), 'warning'); return; }
            body.title = f.title; body.level = f.level; body.notify = f.notify;
        } else {
            if (!f.general) { Dashboard.showToast(t('main.clErrGeneral'), 'warning'); return; }
            body.generalId = Number(f.general);
        }
    }
    f.sending = true; renderClass();
    try {
        const res = await fetch(`${API}/${caseId}/classify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); f.sending = false; renderClass(); return; }
        Dashboard.showToast(out.type === 'p' ? t('main.clDoneP', { folio: out.general.folio }) : t('main.clDoneC'), 'success');
        classState.form = null;
        await loadCase(); renderHeader();
        await reloadClass();
        await refresh(false);
        renderThread(true);
    } catch (err) {
        console.error('Caso de soporte: failed to classify', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        if (classState.form) { classState.form.sending = false; renderClass(); }
    }
}
document.addEventListener('change', (event) => {
    const el = event.target;
    if (el.id === 'sc-status-pick') { const v = el.value; if (v) changeStatus(v); return; }
    const f = classState.form; if (!f) return;
    if (el.id === 'cl-level') f.level = el.value;
    else if (el.id === 'cl-general') f.general = el.value;
    else if (el.id === 'cl-notify') f.notify = el.checked;
    else if (el.dataset && el.dataset.clLink) { const id = Number(el.dataset.clLink); if (el.checked) f.link.add(id); else f.link.delete(id); }
});
document.addEventListener('input', (event) => {
    if (event.target.id === 'cl-title' && classState.form) classState.form.title = event.target.value;
});
document.addEventListener('click', (event) => {
    const f = classState.form; if (!f || f.sending) return;
    const ty = event.target.closest('[data-cl-type]');
    if (ty) { f.type = ty.dataset.clType; renderClass(); return; }
    const mo = event.target.closest('[data-cl-mode]');
    if (mo) { f.mode = mo.dataset.clMode; renderClass(); return; }
    if (event.target.closest('#cl-save')) submitClass();
});

// ---- cierre con conformidad: marcar resuelto, confirmar con el usuario, cerrar, cerrar sin respuesta y reabrir ----------------------------------------------------------------
// «Marcar resuelto» (botón del árbol) pide qué se hizo y evidencia y regresa el caso a la Mesa de ayuda por confirmar con el usuario. La Mesa de ayuda lo cierra (botón «Cerrar caso»): conforme (causa, qué se hizo y evidencia
// de que quedó resuelto), no conforme (se reabre) o sin respuesta (con 3 intentos de contacto registrados). Quien reportó puede reabrirlo hasta 7 días después. Lo escrito no se edita ni se borra.
const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const CLOSED_STATUSES = ['done', 'noresp'];
const MAX_EVIDENCE_BYTES = 12 * 1048576;
const closeState = { data: null, form: null, reopenText: '', reopening: false };
async function loadClosing() {
    const res = await fetch(`${API}/${caseId}/closing`, { credentials: 'include' });
    if (!res.ok) return false;
    closeState.data = await res.json();
    return true;
}
// Evidencia nueva dentro de un formulario (adjuntar o grabar la pantalla): target = { blobs: [{ blob, name, uploaded }], rec }.
async function addEvidenceFiles(target, list) {
    for (const file of list) {
        let blob = file;
        if (file.type && file.type.startsWith('image/')) { try { blob = await Dashboard.compressImageToBlob(file); } catch (err) { blob = file; } }
        if (blob.size > MAX_EVIDENCE_BYTES) { Dashboard.showToast(t('main.spTooBig', { name: file.name, mb: 12 }), 'warning'); continue; }
        target.blobs.push({ blob, name: file.name });
    }
}
async function startEvidenceRec(target, rerender) {
    try {
        const ctl = await SupportRecorder.start({ onTick: (s) => { if (target.rec) { target.rec.seconds = s; document.querySelectorAll('.sp-recbar b').forEach((b) => { b.textContent = `${t('main.spFRecording')} · ${fmtClock(s)}`; }); } } });
        target.rec = { seconds: 0, ctl };
        ctl.done.then(({ blob }) => {
            target.rec = null;
            if (blob.size <= MAX_EVIDENCE_BYTES) target.blobs.push({ blob, name: `grabacion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm` });
            else Dashboard.showToast(t('main.spTooBig', { name: t('main.spFRecord'), mb: 12 }), 'warning');
            rerender();
        });
        rerender();
    } catch (err) { Dashboard.showToast(t('main.spRecDenied'), 'warning'); }
}
function evidenceControlsHtml(target, attr) {
    const canRec = window.SupportRecorder && SupportRecorder.canRecord();
    const blobs = target.blobs.map((x, i) => `<div class="sp-slot-row"><span class="sp-ok"><i class="bx bx-check" aria-hidden="true"></i> ${esc(x.name)} <small class="sp-muted">${esc(fmtSize(x.blob.size))}</small></span><button type="button" class="ms-icon-btn" data-${attr}-unfile="${i}" aria-label="${esc(t('main.scRemove'))}"><i class="bx bx-trash" aria-hidden="true"></i></button></div>`).join('');
    const rec = target.rec ? `<span class="sp-recbar"><span class="sp-recdot"></span><b>${esc(t('main.spFRecording'))} · ${esc(fmtClock(target.rec.seconds))}</b><button type="button" class="btn" data-${attr}-recstop>${esc(t('main.spFRecStop'))}</button></span>` : (canRec ? `<button type="button" class="btn btn-secondary" data-${attr}-rec><i class="bx bx-radio-circle-marked" aria-hidden="true"></i> ${esc(t('main.spFRecord'))}</button>` : '');
    return `${blobs}<div class="sp-slot-row"><label class="btn btn-secondary"><i class="bx bx-paperclip" aria-hidden="true"></i> ${esc(t('main.scAttach'))}<input type="file" data-${attr}-file multiple hidden></label>${rec}</div>`;
}
// Sube las evidencias nuevas del formulario (?move=1: no crean un renglón aparte); regresa los ids (con los que ya estaban subidos) o null si alguna falló.
async function uploadEvidence(target) {
    const ids = [];
    for (const item of target.blobs) {
        if (item.uploaded) { ids.push(item.uploaded); continue; }
        const res = await fetch(`${API}/${caseId}/files?move=1`, { method: 'POST', headers: { 'Content-Type': item.blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(item.name) }, credentials: 'include', body: item.blob });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(t('main.spFileFailed', { name: item.name, why: out.message || Dashboard.t('admin.saveError') }), 'warning'); return null; }
        item.uploaded = out.file.id; ids.push(out.file.id);
    }
    return ids;
}
async function afterClosingChange() {
    await loadCase(); renderHeader(); renderFiles();
    await reloadMoves();
    await reloadClass();
    await reloadClosing();
    await refresh(false);
    renderThread(true);
}
async function reloadClosing() {
    if (state.closingCan) await loadClosing();
    renderClosing();
}
function attemptsHtml(d, f) {
    const list = d.attempts.map((a, i) => `<div class="sc-attempt ok"><b>${i + 1}</b> ${esc(t(`main.clCh_${a.channel}`))} · ${esc(fmtTime(a.createdAt))} · ${esc(a.by || '')} — ${esc(a.note)}</div>`).join('');
    const missing = Math.max(0, d.needAttempts - d.attempts.length);
    const add = d.attempts.length < d.maxAttempts ? `<div class="sc-attempt-form"><select data-cf-ach>${d.channels.map((c) => `<option value="${c}"${c === f.attempt.channel ? ' selected' : ''}>${esc(t(`main.clCh_${c}`))}</option>`).join('')}</select><input type="text" data-cf-anote maxlength="500" placeholder="${esc(t('main.clAttemptNote'))}" value="${esc(f.attempt.note)}"><button type="button" class="btn btn-secondary" data-cf-aadd${f.sending ? ' disabled' : ''}>${esc(t('main.clAttemptAdd'))}</button></div>` : '';
    return `<div class="sc-sg"><h4>${esc(t('main.clNoReplyTitle'))}</h4>${list || `<p class="sp-muted">${esc(t('main.clNoAttempts'))}</p>`}${missing ? `<div class="sc-attempt miss"><b>!</b> ${esc(t('main.clAttemptsMissing', { n: missing }))}</div>` : ''}${add}
        <p class="sp-muted">${esc(t('main.clNoReplyHint'))}</p><div class="admin-form-actions"><button type="button" class="btn btn-secondary" data-cf-noresp${missing || f.sending ? ' disabled' : ''}>${esc(t('main.clCloseNoReply'))}</button></div></div>`;
}
function closeFormHtml(d, f) {
    const files = d.files.map((x) => `<label class="sc-sim"><input type="checkbox" data-cf-pick="${x.id}"${f.picked.has(x.id) ? ' checked' : ''}> <span>${lvBadge(x.level || 'n0')} <b>${esc(x.name)}</b> <small class="sp-muted">${esc(fmtSize(x.size))} · ${esc(x.by || '')} · ${esc(fmtTime(x.createdAt))}</small></span></label>`).join('');
    const ok = f.conformity === 'ok';
    const body = ok
        ? `<label class="sp-field"><span>${esc(t('main.clCause'))} *</span><select data-cf-cause><option value="">—</option>${d.causes.map((c) => `<option value="${c.id}"${String(c.id) === f.cause ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
           <label class="sp-field"><span>${esc(t('main.clDid'))} * <small class="sp-muted">${esc(t('main.clDidHint'))}</small></span><textarea data-cf-did rows="3" maxlength="${d.maxText}">${esc(f.did)}</textarea></label>
           <div class="sp-field"><span>${esc(t('main.clEvidence'))} * <small class="sp-muted">${esc(t('main.clEvidenceHint'))}</small></span><div class="sc-sim">${files}</div>${evidenceControlsHtml(f, 'cf')}</div>`
        : `<label class="sp-field"><span>${esc(t('main.clSaid'))} *</span><textarea data-cf-said rows="3" maxlength="${d.maxText}">${esc(f.said)}</textarea></label><div class="sc-warn">${esc(t('main.clReopenHint'))}</div>`;
    return `<div class="sp-field"><span>${esc(t('main.clConform'))} *</span><div class="sp-chips" role="radiogroup"><button type="button" class="sp-chip${ok ? ' on' : ''}" role="radio" aria-checked="${ok}" data-cf-conf="ok">${esc(t('main.clConformYes'))}</button><button type="button" class="sp-chip${!ok ? ' on' : ''}" role="radio" aria-checked="${!ok}" data-cf-conf="none">${esc(t('main.clConformNo'))}</button></div></div>${body}
        <div class="admin-form-actions"><button type="button" class="btn" data-cf-close${f.sending ? ' disabled' : ''}>${esc(f.sending ? t('main.spFSending') : (ok ? t('main.clCloseBtn') : t('main.clReopenBtn')))}</button></div>`;
}
function renderClosing() {
    const box = $('sc-close-card');
    const c = state.c; const d = closeState.data;
    const closed = CLOSED_STATUSES.includes(c.status);
    let head = ''; let inner = '';
    if (!closed && c.status !== 'confirm') {
        if (d && d.canResolve) { head = `<button type="button" class="btn" data-cl-resolve>✓ ${esc(t('main.rsBtn'))}</button>`; inner = `<p class="sp-muted">${esc(t('main.rsHint'))}</p>`; }
        else { box.hidden = true; return; }
    } else if (c.status === 'confirm') {
        const r = d && d.resolved;
        const who = r ? `<div class="sp-meta-line"><b>${esc(t('main.clResolvedBy'))}:</b> ${lvBadge(r.level)} ${esc(r.by)} · ${esc(fmtTime(r.createdAt))}${r.general ? ` · ${esc(r.general)}` : ''}<br><b>${esc(t('main.clDid'))}:</b> ${esc(r.did)}${r.fileCount ? `<br><b>${esc(t('main.mvFilesShort'))}:</b> ${r.fileCount}` : ''}</div>` : '';
        if (!d) inner = `<p>${esc(t('main.clUserConfirmWait'))}</p>`;
        else if (d.canClose) {
            if (!closeState.form) closeState.form = { conformity: 'ok', cause: '', did: '', said: '', picked: new Set(), blobs: [], rec: null, sending: false, attempt: { channel: 'chat', note: '' } };
            inner = `${who}<div class="sc-warn">${esc(t('main.clConfirmHint'))}</div>${closeFormHtml(d, closeState.form)}${attemptsHtml(d, closeState.form)}`;
        } else inner = `${who}<p class="sp-muted">${esc(t('main.clOnlyHelpDesk'))}</p>`;
    } else {
        const lines = `<dl class="sp-meta"><div><dt>${esc(t('main.clClosedBy'))}</dt><dd>${esc(c.closedBy || '—')}</dd></div><div><dt>${esc(t('main.clClosedAt'))}</dt><dd>${esc(c.closedAt ? fmtDate(c.closedAt) : '—')}</dd></div>
            ${d && d.cause ? `<div><dt>${esc(t('main.clCause'))}</dt><dd>${esc(d.cause)}</dd></div>` : ''}${c.reopenedCount ? `<div><dt>${esc(t('main.clReopened'))}</dt><dd>${c.reopenedCount}</dd></div>` : ''}
            <div class="sp-wide"><dt>${esc(t(c.status === 'noresp' ? 'main.clNoReplyTitle' : 'main.clDid'))}</dt><dd class="sp-pre">${esc(c.closeDid || '—')}</dd></div></dl>`;
        let reopen = '';
        if (state.reopenCan) reopen = `<div class="sc-sg"><h4>${esc(t('main.clReopenTitle'))}</h4><p class="sp-muted">${esc(t('main.clReopenUntil', { when: fmtDate(state.reopenUntil) }))}</p><label class="sp-field"><span>${esc(t('main.clReopenSaid'))} *</span><textarea data-cl-rsaid rows="2" maxlength="500">${esc(closeState.reopenText)}</textarea></label><div class="admin-form-actions"><button type="button" class="btn" data-cl-reopen${closeState.reopening ? ' disabled' : ''}>${esc(t('main.clReopenAction'))}</button></div></div>`;
        else if (state.chat && state.chat.isReporter) reopen = `<p class="sp-muted">${esc(t('main.clReopenExpired'))}</p>`;
        inner = `${lines}${reopen}`;
    }
    box.hidden = false;
    box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('main.clCloseTitle'))}</h3><div class="sc-tags"><span class="sp-tag sp-status" data-k="${esc(c.status)}">${esc(t(`main.spStatus_${c.status}`))}</span>${head}</div></div>${inner}`;
}
// ---- la ventana de «Marcar resuelto» (de un caso o de un Soporte general) ----
let resolveEl = null;
const resolveState = { form: null };
function renderResolveForm() {
    const f = resolveState.form;
    resolveEl.querySelector('#rs-body').innerHTML = `<label class="sp-field"><span>${esc(t('main.rsDid'))} * <small class="sp-muted">${esc(t('main.mvDidHint'))}</small></span><textarea id="rs-did" rows="3" maxlength="1000">${esc(f.did)}</textarea></label>
        <div class="sp-field"><span>${esc(t('main.mvFiles'))} * <small class="sp-muted">${esc(t('main.mvFilesHint'))}</small></span>${evidenceControlsHtml(f, 'rs')}</div>`;
    const send = resolveEl.querySelector('#rs-send');
    send.disabled = f.sending;
    send.textContent = f.sending ? t('main.spFSending') : t(f.general ? 'main.rsSendGeneral' : 'main.rsSend');
    resolveEl.querySelector('#rs-title').textContent = t(f.general ? 'main.rsTitleGeneral' : 'main.rsTitle');
}
function closeResolve() { if (resolveState.form && resolveState.form.rec) { try { resolveState.form.rec.ctl.stop(); } catch (err) { /* ya terminó */ } } if (resolveEl) resolveEl.hidden = true; resolveState.form = null; }
function openResolve(general) {
    if (!resolveEl) {
        resolveEl = document.createElement('div');
        resolveEl.className = 'modal-overlay';
        resolveEl.hidden = true;
        resolveEl.innerHTML = '<div class="modal-panel sp-form sc-move" role="dialog" aria-modal="true" aria-labelledby="rs-title"><h3 id="rs-title"></h3><div id="rs-body"></div><p class="sp-muted" id="rs-note"></p><div class="admin-form-actions"><button type="button" class="btn" id="rs-send"></button><button type="button" class="btn btn-secondary" id="rs-cancel"></button></div></div>';
        document.body.appendChild(resolveEl);
        resolveEl.addEventListener('click', onResolveClick);
        resolveEl.addEventListener('input', (event) => { if (event.target.id === 'rs-did' && resolveState.form) resolveState.form.did = event.target.value; });
        resolveEl.addEventListener('change', async (event) => {
            const f = resolveState.form; if (!f || !event.target.matches('[data-rs-file]')) return;
            const picked = [...(event.target.files || [])]; event.target.value = '';
            await addEvidenceFiles(f, picked); renderResolveForm();
        });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && resolveState.form && !resolveState.form.sending) closeResolve(); });
    }
    resolveState.form = { general: !!general, did: '', blobs: [], rec: null, sending: false };
    resolveEl.querySelector('#rs-cancel').textContent = t('main.spFCancel');
    resolveEl.querySelector('#rs-note').textContent = t(general ? 'main.rsHintGeneral' : 'main.rsModalHint');
    renderResolveForm();
    resolveEl.hidden = false;
}
async function onResolveClick(event) {
    const f = resolveState.form; if (!f) return;
    if (event.target === resolveEl || event.target.closest('#rs-cancel')) { if (!f.sending) closeResolve(); return; }
    const un = event.target.closest('[data-rs-unfile]');
    if (un) { f.blobs.splice(Number(un.dataset.rsUnfile), 1); renderResolveForm(); return; }
    if (event.target.closest('[data-rs-rec]')) { await startEvidenceRec(f, () => { if (resolveState.form === f) renderResolveForm(); }); return; }
    if (event.target.closest('[data-rs-recstop]')) { if (f.rec) f.rec.ctl.stop(); return; }
    if (event.target.closest('#rs-send')) submitResolve();
}
async function submitResolve() {
    const f = resolveState.form; const d = closeState.data;
    if (!f || f.sending) return;
    if (f.did.trim().length < ((d && d.minText) || 10)) { Dashboard.showToast(t('main.rsErrDid'), 'warning'); return; }
    if (!f.blobs.length) { Dashboard.showToast(t('main.mvErrFiles'), 'warning'); return; }
    if (f.rec) { Dashboard.showToast(t('main.spErrRecording'), 'warning'); return; }
    f.sending = true; renderResolveForm();
    try {
        const ids = await uploadEvidence(f);
        if (!ids) { f.sending = false; renderResolveForm(); return; }
        const res = await fetch(`${API}/${caseId}/${f.general ? 'general-resolve' : 'resolve'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ did: f.did, fileIds: ids }) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); f.sending = false; renderResolveForm(); return; }
        const general = f.general;
        closeResolve();
        Dashboard.showToast(general ? t('main.rsDoneGeneral', { n: out.cases }) : t('main.rsDone'), 'success');
        await afterClosingChange();
    } catch (err) {
        console.error('Caso de soporte: failed to resolve', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        if (resolveState.form) { resolveState.form.sending = false; renderResolveForm(); }
    }
}
// ---- cerrar / sin respuesta / reabrir ----
async function postJson(path, body) {
    const res = await fetch(`${API}/${caseId}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    return { ok: res.ok, out };
}
async function submitClose(mode) {
    const f = closeState.form; const d = closeState.data;
    if (!f || f.sending) return;
    const body = { conformity: mode || f.conformity };
    if (body.conformity === 'ok') {
        if (!f.cause) { Dashboard.showToast(t('main.clErrCause'), 'warning'); return; }
        if (f.did.trim().length < d.minText) { Dashboard.showToast(t('main.rsErrDid'), 'warning'); return; }
        if (!f.picked.size && !f.blobs.length) { Dashboard.showToast(t('main.clErrEvidence'), 'warning'); return; }
        if (f.rec) { Dashboard.showToast(t('main.spErrRecording'), 'warning'); return; }
        body.causeId = Number(f.cause); body.did = f.did;
    } else if (body.conformity === 'none') {
        if (f.said.trim().length < d.minSaid) { Dashboard.showToast(t('main.clErrSaid'), 'warning'); return; }
        body.said = f.said;
    }
    f.sending = true; renderClosing();
    try {
        if (body.conformity === 'ok') {
            const up = await uploadEvidence(f);
            if (!up) { f.sending = false; renderClosing(); return; }
            body.fileIds = [...f.picked, ...up];
        }
        const { ok, out } = await postJson('close', body);
        if (!ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); f.sending = false; renderClosing(); return; }
        closeState.form = null;
        Dashboard.showToast(out.status === 'open' ? t('main.clDoneReopen', { level: t(`main.sopLevel_${out.level}`) }) : t(out.status === 'noresp' ? 'main.clDoneNoReply' : 'main.clDoneClosed'), 'success');
        await afterClosingChange();
    } catch (err) {
        console.error('Caso de soporte: failed to close', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        if (closeState.form) { closeState.form.sending = false; renderClosing(); }
    }
}
async function submitAttempt() {
    const f = closeState.form; if (!f || f.sending) return;
    if (f.attempt.note.trim().length < ((closeState.data && closeState.data.minSaid) || 5)) { Dashboard.showToast(t('main.clErrAttemptNote'), 'warning'); return; }
    f.sending = true; renderClosing();
    const { ok, out } = await postJson('attempts', { channel: f.attempt.channel, note: f.attempt.note });
    f.sending = false;
    if (!ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); renderClosing(); return; }
    f.attempt.note = '';
    await loadClosing(); renderClosing();
    await refresh(false);
}
async function submitReopen() {
    if (closeState.reopening) return;
    if (closeState.reopenText.trim().length < 5) { Dashboard.showToast(t('main.clErrReopen'), 'warning'); return; }
    closeState.reopening = true; renderClosing();
    try {
        const { ok, out } = await postJson('reopen', { said: closeState.reopenText });
        closeState.reopening = false;
        if (!ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); renderClosing(); return; }
        closeState.reopenText = '';
        Dashboard.showToast(t('main.clDoneReopenUser'), 'success');
        await afterClosingChange();
    } catch (err) {
        closeState.reopening = false;
        console.error('Caso de soporte: failed to reopen', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        renderClosing();
    }
}
document.addEventListener('click', async (event) => {
    if (event.target.closest('[data-cl-resolve]')) { openResolve(false); return; }
    if (event.target.closest('[data-cl-resolve-general]')) { openResolve(true); return; }
    if (event.target.closest('[data-cl-reopen]')) { submitReopen(); return; }
    const f = closeState.form; if (!f || f.sending) return;
    const conf = event.target.closest('[data-cf-conf]');
    if (conf) { f.conformity = conf.dataset.cfConf; renderClosing(); return; }
    const un = event.target.closest('[data-cf-unfile]');
    if (un) { f.blobs.splice(Number(un.dataset.cfUnfile), 1); renderClosing(); return; }
    if (event.target.closest('[data-cf-rec]')) { await startEvidenceRec(f, () => { if (closeState.form === f) renderClosing(); }); return; }
    if (event.target.closest('[data-cf-recstop]')) { if (f.rec) f.rec.ctl.stop(); return; }
    if (event.target.closest('[data-cf-close]')) { submitClose(); return; }
    if (event.target.closest('[data-cf-noresp]')) { submitClose('noresp'); return; }
    if (event.target.closest('[data-cf-aadd]')) submitAttempt();
});
document.addEventListener('change', async (event) => {
    const f = closeState.form; const el = event.target;
    if (!f) return;
    if (el.matches('[data-cf-cause]')) f.cause = el.value;
    else if (el.matches('[data-cf-ach]')) f.attempt.channel = el.value;
    else if (el.matches('[data-cf-pick]')) { const id = Number(el.dataset.cfPick); if (el.checked) f.picked.add(id); else f.picked.delete(id); }
    else if (el.matches('[data-cf-file]')) { const picked = [...(el.files || [])]; el.value = ''; await addEvidenceFiles(f, picked); renderClosing(); }
});
document.addEventListener('input', (event) => {
    const el = event.target;
    if (el.matches('[data-cl-rsaid]')) { closeState.reopenText = el.value; return; }
    const f = closeState.form; if (!f) return;
    if (el.matches('[data-cf-did]')) f.did = el.value;
    else if (el.matches('[data-cf-said]')) f.said = el.value;
    else if (el.matches('[data-cf-anote]')) f.attempt.note = el.value;
});

// ---- calificaciones --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// El usuario califica la atención cuando el caso termina. Entre niveles: quien recibe un caso califica cómo le llegó (1 clic; obligatoria antes de empezar si el Mapa de soporte lo pide) y quien lo pasó hacia arriba puede
// calificar (opcional) al nivel que lo recibió. Las calificaciones entre niveles son internas: solo las ve quien tenga la columna del árbol. Lo escrito no se edita ni se borra.
const rateState = { data: null, forms: {} };
const starsText = (n) => '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Number(n) || 0)));
async function loadRatings() {
    const res = await fetch(`${API}/${caseId}/ratings`, { credentials: 'include' });
    if (!res.ok) { rateState.data = null; return false; }
    rateState.data = await res.json();
    return true;
}
async function reloadRatings() {
    await loadRatings();
    renderRatings();
}
function rateFormHtml(key, kind, d) {
    const f = rateState.forms[key] || (rateState.forms[key] = { stars: 0, tags: new Set(), comment: '', sending: false });
    const tg = d.tags[kind];
    const stars = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="sc-star${f.stars >= n ? ' on' : ''}" data-rt-star="${esc(key)}" data-n="${n}" aria-label="${n}" aria-pressed="${f.stars === n}">★</button>`).join('');
    const chips = [...tg.good, ...tg.bad].map((k) => `<button type="button" class="sp-chip${f.tags.has(k) ? ' on' : ''}" data-rt-tag="${esc(key)}" data-tag="${esc(k)}">${esc(t(`main.rtTag_${kind}_${k}`))}</button>`).join('');
    return `<div class="sc-rate"><div class="sc-stars" role="group" aria-label="${esc(t('main.rtStarsLabel'))}">${stars}</div><div class="sp-chips">${chips}</div>
        <label class="sp-field"><textarea data-rt-comment="${esc(key)}" rows="2" maxlength="${d.maxComment}" placeholder="${esc(t('main.rtComment'))}">${esc(f.comment)}</textarea></label>
        <div class="admin-form-actions"><button type="button" class="btn" data-rt-send="${esc(key)}"${f.sending ? ' disabled' : ''}>${esc(f.sending ? t('main.spFSending') : t('main.rtSend'))}</button></div></div>`;
}
function ratingLineHtml(r, kind) {
    return `<div class="sc-rate-line"><span class="sc-stars-text" aria-label="${r.stars}/5">${esc(starsText(r.stars))}</span> ${r.tags.map((k) => `<span class="sp-tag">${esc(t(`main.rtTag_${kind}_${k}`))}</span>`).join(' ')}${r.comment ? `<div class="sp-pre">${esc(r.comment)}</div>` : ''}</div>`;
}
function renderRatings() {
    const box = $('sc-rate-card'); const d = rateState.data;
    if (!d) { box.hidden = true; return; }
    const parts = [];
    if (d.userCanRate) parts.push(`<div class="sc-rate-block"><h4>${esc(t('main.rtUserTitle'))}</h4><p class="sp-muted">${esc(t('main.rtUserHint'))}</p>${rateFormHtml('user:0', 'user', d)}</div>`);
    else if (d.user) parts.push(`<div class="sc-rate-block"><h4>${esc(t('main.rtUserDone'))}</h4>${ratingLineHtml(d.user, 'user')}<span class="sp-muted">${esc(d.user.by)} · ${esc(fmtTime(d.user.createdAt))}</span></div>`);
    if (d.pending) {
        const p = d.pending;
        parts.push(`<div class="sc-rate-block sc-rate-pending"><h4>${esc(t('main.rtPendingTitle'))}</h4><p class="sp-muted">${esc(t('main.rtPendingWho', { by: p.by || '—', from: t(`main.sopLevel_${p.from}`), to: t(`main.sopLevel_${p.to}`), when: fmtTime(p.at) }))}</p>${rateFormHtml(`receive:${p.id}`, 'receive', d)}</div>`);
    }
    d.deliver.forEach((m) => parts.push(`<div class="sc-rate-block"><h4>${esc(t('main.rtDeliverTitle', { level: t(`main.sopLevel_${m.to}`) }))}</h4><p class="sp-muted">${esc(t('main.rtOptional'))}</p>${rateFormHtml(`deliver:${m.id}`, 'deliver', d)}</div>`));
    if (d.canSeeAll && d.all.length) {
        const rows = d.all.map((r) => `<tr><td>${esc(t(`main.rtKind_${r.kind}`))}</td><td>${lvBadge(r.raterLevel)} ${esc(r.by || '—')}</td><td>${lvBadge(r.targetLevel)} ${esc(r.targetName || '')}</td><td class="sc-stars-text">${esc(starsText(r.stars))}</td><td>${esc(r.tags.map((k) => t(`main.rtTag_${r.kind}_${k}`)).join(', '))}${r.comment ? `<br><span class="sp-muted">${esc(r.comment)}</span>` : ''}</td><td>${esc(fmtTime(r.createdAt))}</td></tr>`).join('');
        parts.push(`<div class="sc-rate-block"><h4>${esc(t('main.rtHistTitle'))}</h4><div class="sc-sg-table"><table class="ms-table"><thead><tr><th>${esc(t('main.rtColKind'))}</th><th>${esc(t('main.rtColWho'))}</th><th>${esc(t('main.rtColTarget'))}</th><th>${esc(t('main.rtColStars'))}</th><th>${esc(t('main.rtColNote'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
    }
    if (!parts.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('main.rtTitle'))}</h3></div>${parts.join('')}`;
}
async function submitRating(key) {
    const f = rateState.forms[key]; if (!f || f.sending) return;
    const [kind, moveId] = key.split(':');
    if (!f.stars) { Dashboard.showToast(t('main.rtStarsErr'), 'warning'); return; }
    f.sending = true; renderRatings();
    try {
        const res = await fetch(`${API}/${caseId}/ratings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ kind, moveId: Number(moveId) || undefined, stars: f.stars, tags: [...f.tags], comment: f.comment }) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); f.sending = false; await reloadRatings(); return; }
        delete rateState.forms[key];
        Dashboard.showToast(t(kind === 'user' ? 'main.rtThanks' : 'main.rtSaved'), 'success');
        await loadCase(); renderHeader();
        await reloadRatings();
        await refresh(false);
        renderThread(true);
    } catch (err) {
        console.error('Caso de soporte: failed to rate', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        f.sending = false; renderRatings();
    }
}
document.addEventListener('click', (event) => {
    const st = event.target.closest('[data-rt-star]');
    if (st) { const f = rateState.forms[st.dataset.rtStar]; if (f && !f.sending) { f.stars = Number(st.dataset.n); renderRatings(); } return; }
    const tg = event.target.closest('[data-rt-tag]');
    if (tg) { const f = rateState.forms[tg.dataset.rtTag]; if (f && !f.sending) { const k = tg.dataset.tag; if (f.tags.has(k)) f.tags.delete(k); else f.tags.add(k); renderRatings(); } return; }
    const send = event.target.closest('[data-rt-send]');
    if (send) submitRating(send.dataset.rtSend);
});
document.addEventListener('input', (event) => {
    const c = event.target.closest && event.target.closest('[data-rt-comment]');
    if (c && rateState.forms[c.dataset.rtComment]) rateState.forms[c.dataset.rtComment].comment = c.value;
});

// ---- quién atiende el caso: tomar, pausar y retomar (botones junto al estatus) ----------------------------------------------------------------------------------------------------------
async function caseAction(path, okKey) {
    try {
        const res = await fetch(`${API}/${caseId}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); await loadCase(); renderHeader(); return; }
        Dashboard.showToast(t(okKey), 'success');
        await loadCase(); renderHeader();
        await reloadRatings();
        await refresh(false);
        renderThread(true);
    } catch (err) {
        console.error('Caso de soporte: failed action', path, err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}
document.addEventListener('click', (event) => {
    if (event.target.closest('[data-cp-take]')) caseAction('take', 'main.cpDoneTake');
    else if (event.target.closest('[data-cp-pause]')) { if (window.confirm(t('main.qPauseConfirm'))) caseAction('pause', 'main.qDonePauseOnly'); }
    else if (event.target.closest('[data-cp-resume]')) caseAction('resume', 'main.qDoneResume');
});

// ---- eventos ----------------------------------------------------------------------------------------------------------------------------
document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; renderTabs(); renderThread(true); return; }
    const go = event.target.closest('[data-goto]');
    if (go) {
        state.tab = 'all'; renderTabs(); renderThread(false);
        const el = $('sc-thread').querySelector(`[data-msg="${go.dataset.goto}"]`);
        if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
        return;
    }
    if (event.target.closest('#sc-send')) { send(); return; }
    if (event.target.closest('#sc-unattach')) { state.pending = null; renderComposer(); }
});
document.addEventListener('change', async (event) => {
    if (event.target.id === 'sc-note') { renderComposer(); return; }
    if (event.target.id !== 'sc-file') return;
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const text = $('sc-text').value;
    let blob = file;
    if (file.type && file.type.startsWith('image/')) { try { blob = await Dashboard.compressImageToBlob(file); } catch (err) { blob = file; } }
    if (blob.size > 12 * 1048576) { Dashboard.showToast(t('main.spTooBig', { name: file.name, mb: 12 }), 'warning'); return; }
    state.pending = { blob, name: file.name };
    renderComposer();
    $('sc-text').value = text;
});
document.addEventListener('keydown', (event) => {
    if (event.target.id === 'sc-text' && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.c) refresh(false); });

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        // Quien llega desde «Soporte» (sin la hoja de la lista de Operaciones) regresa a «Soporte»
        if (new URLSearchParams(location.search).get('from') === 'support') {
            const back = document.querySelector('.sc-back');
            if (back) { back.setAttribute('href', 'Soporte.html'); const label = back.querySelector('span'); if (label) { label.setAttribute('data-i18n', 'menu.support'); label.textContent = Dashboard.t('menu.support'); } }
        }
        if (!Number.isInteger(caseId) || caseId < 1) { $('sc-root').innerHTML = `<p class="sp-muted">${esc(t('main.scNotFound'))}</p>`; return; }
        await loadCase();
        $('sc-root').hidden = false;
        renderHeader(); renderFiles();
        if (state.contactCan) { await loadScreens(); await loadContact(); renderContact(); }
        if (state.peopleCan) { await loadPeople(); renderPeople(); }
        if (state.chat.canSee && !state.chat.isReporter) { if (await loadMoves()) renderLane(); }
        if (state.classCan) { if (await loadClass()) renderClass(); }
        if (state.closingCan) await loadClosing();
        renderClosing();
        await reloadRatings();
        if (state.chat.canSee) { await loadMessages(true); renderTabs(); renderThread(true); renderFlow(); renderComposer(); } else { $('sc-chat-card').hidden = true; $('sc-flow-card').hidden = true; }
        state.timer = setInterval(() => { if (!document.hidden) refresh(false); }, POLL_MS);
    } catch (err) {
        console.error('Caso de soporte failed to initialize:', err);
        $('sc-root').hidden = true;
        $('sc-error').hidden = false;
        $('sc-error').textContent = t('main.scNotFound');
    }
})();
})();
