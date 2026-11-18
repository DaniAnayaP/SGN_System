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
    return m.eventKey;
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
        return `<div class="sc-sep ${esc(m.eventKey)}" data-msg="${m.id}"><span>${lvBadge(m.level)} ${esc(eventText(m))}</span><time>${esc(fmtTime(m.createdAt))}</time>${att}</div>`;
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
    $('sc-head').innerHTML = `<div><h2>${esc(c.folio)} · ${esc(c.summary)}</h2><span class="sp-muted">${esc([c.screen, c.action].filter(Boolean).join(' · '))}</span></div>
        <div class="sc-tags"><span class="sp-tag sp-type" data-k="${esc(c.type)}">${esc(t(`main.spType_${c.type}`))}</span><span class="sp-tag sp-pri" data-k="${c.priority}">${esc(t(`main.msPri_${c.priority}`))}</span>
        <span class="sp-tag sp-lv" data-k="${esc(c.level)}">${esc(t(`main.sopLevel_${c.level}`))}</span><span class="sp-tag sp-status" data-k="${esc(c.status)}">${esc(t(`main.spStatus_${c.status}`))}</span></div>`;
    $('sc-meta').innerHTML = `<dl class="sp-meta"><div><dt>${esc(t('main.colSpReporto'))}</dt><dd>${esc(c.reporter || '—')}</dd></div><div><dt>${esc(t('main.colSpFechaHora'))}</dt><dd>${esc(fmtDate(c.createdAt))}</dd></div>
        <div><dt>${esc(t('main.colSpCategoria'))}</dt><dd>${esc(c.category || '—')}</dd></div><div data-help-key="spPrimeraResp"><dt>${esc(t('main.scFirstResponse'))}</dt><dd>${first}</dd></div>
        <div><dt>${esc(t('main.spFWhen'))}</dt><dd>${esc(t(`main.spWhen_${c.whenAffects}`))}</dd></div><div><dt>${esc(t('main.spFKeep'))}</dt><dd>${esc(c.keepWorking ? t('main.spYes') : t('main.spNo'))}</dd></div>
        <div class="sp-wide"><dt>${esc(t('main.spFImpact'))}</dt><dd>${impacts}</dd></div>
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
    state.c = body.case; state.files = body.files || []; state.chat = body.chat;
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
        }
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
        if (!Number.isInteger(caseId) || caseId < 1) { $('sc-root').innerHTML = `<p class="sp-muted">${esc(t('main.scNotFound'))}</p>`; return; }
        await loadCase();
        $('sc-root').hidden = false;
        renderHeader(); renderFiles();
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
