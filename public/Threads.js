// ---------------------------------------------------------------------------
// Hilos de comentarios (pieza 2b de Planes de trabajo): una conversación ligada a CUALQUIER cosa del sistema (tipo + id). La usan Planes de trabajo (un hilo por renglón y uno por plan) y la usarán el panel de Mensajes y el
// Cronograma de Implementación. Los comentarios no se editan ni se borran: cada uno queda con su autor, su fecha y su hora. Se pueden mencionar personas con «@» (las que hoy tienen acceso a lo que se comenta).
// El servidor decide todo (server.js, rutas /api/business/threads/:tipo/:id/…): aquí solo se dibuja. Módulo global: Threads.mount(contenedor, { type, id, onChange }). Se carga después de Dashboard.js (usa Dashboard.t y showToast).
// ---------------------------------------------------------------------------
(function () {
'use strict';
const BASE = '/api/business/threads';
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fold = (text) => String(text == null ? '' : text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const regexEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';
// «2026-03-18 15:04:05.123» (UTC) → fecha y hora en la zona de quien lo ve (y la hora base en el title)
const stampDate = (at) => new Date(`${String(at).replace(' ', 'T')}Z`);
const stampText = (at) => { const d = stampDate(at); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const MAX_BODY = 2000;
const POLL_MS = 15000;

async function api(method, path, body) {
    const res = await fetch(`${BASE}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.error || out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
// El texto de un error del servidor en el idioma de la pantalla (por su código; los de estado del plan ya existen en main.wpErr_*).
function errText(err) {
    const code = err && err.body && err.body.code;
    if (code) {
        for (const prefix of ['main.thrErr_', 'main.wpErr_']) { const key = `${prefix}${code}`; const text = Dashboard.t(key); if (text !== key) return text; }
    }
    return t('main.thrErr_default');
}

// el cuerpo con las menciones resaltadas (el texto siempre escapado)
function bodyHtml(comment) {
    let html = esc(comment.body).replace(/\n/g, '<br>');
    (comment.mentions || []).forEach((m) => {
        if (!m.name) return;
        html = html.replace(new RegExp(`@${regexEscape(esc(m.name))}`, 'g'), `<span class="thr-mention">@${esc(m.name)}</span>`);
    });
    return html;
}

function mount(container, options) {
    const type = options.type;
    const id = options.id;
    const path = `/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
    let comments = [];
    let state = { loaded: false, error: '', canPost: false, people: [], label: '', lastReadId: 0, hasMore: false, busy: false };
    let unreadFrom = 0; // id del primer comentario sin leer al abrir (para la línea «Sin leer»); 0 = ninguno
    const mentioned = new Map(); // nombre → id de lo elegido con «@»
    let suggestions = [];
    let timer = 0;
    let destroyed = false;

    container.classList.add('thr-root');
    container.innerHTML = `<div class="thr-list" role="log" aria-live="polite" data-help-key="thrList"></div><div class="thr-compose"></div>`;
    const listEl = container.querySelector('.thr-list');
    const composeEl = container.querySelector('.thr-compose');

    const lastId = () => (comments.length ? comments[comments.length - 1].id : 0);
    function renderList() {
        if (!state.loaded) { listEl.innerHTML = `<p class="thr-note">${esc(t('main.thrLoading'))}</p>`; return; }
        if (state.error) { listEl.innerHTML = `<p class="thr-note thr-error">${esc(state.error)}</p>`; return; }
        if (!comments.length) { listEl.innerHTML = `<p class="thr-note">${esc(t('main.thrEmpty'))}</p>`; return; }
        let html = '';
        comments.forEach((c) => {
            if (unreadFrom && c.id === unreadFrom) html += `<div class="thr-unread"><span>${esc(t('main.thrUnread'))}</span></div>`;
            html += `<div class="thr-msg${c.isMine ? ' thr-mine' : ''}${c.mentionsMe ? ' thr-mentions-me' : ''}"><span class="thr-av" aria-hidden="true">${esc(initials(c.authorName))}</span>
                <div class="thr-bubble"><div class="thr-by"><b>${esc(c.isMine ? t('main.thrYou') : c.authorName)}</b><time datetime="${esc(c.createdAt)}" title="${esc(`${c.createdAt} UTC`)}">${esc(stampText(c.createdAt))}</time></div><div class="thr-body">${bodyHtml(c)}</div></div></div>`;
        });
        if (state.hasMore) html += `<button type="button" class="btn btn-secondary thr-more" data-thr="more">${esc(t('main.thrMore'))}</button>`;
        const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 60;
        listEl.innerHTML = html;
        if (atBottom || options.stickBottom !== false) listEl.scrollTop = listEl.scrollHeight;
    }
    function renderCompose() {
        if (!state.loaded || state.error) { composeEl.innerHTML = ''; return; }
        if (!state.canPost) { composeEl.innerHTML = `<p class="thr-note">${esc(t('main.thrReadOnly'))}</p>`; return; }
        const keep = composeEl.querySelector('textarea');
        if (keep) return; // ya está dibujado: no se pierde lo que se estaba escribiendo
        composeEl.innerHTML = `<div class="thr-sug" hidden role="listbox" aria-label="${esc(t('main.thrMentionHint'))}"></div>
            <textarea class="thr-input" rows="2" maxlength="${MAX_BODY}" placeholder="${esc(t('main.thrPlaceholder'))}" aria-label="${esc(t('main.thrPlaceholder'))}" data-help-key="thrCompose"></textarea>
            <div class="thr-actions"><span class="thr-hint">${esc(t('main.thrMentionHint'))}</span><button type="button" class="btn thr-send" data-thr="send" data-help-key="thrSend">${esc(t('main.thrSend'))}</button></div>
            <p class="admin-error thr-form-error" role="alert" hidden></p>`;
    }
    const showError = (text) => { const el = composeEl.querySelector('.thr-form-error'); if (el) { el.textContent = text; el.hidden = !text; } };

    async function load() {
        try {
            const out = await api('GET', `${path}/comments?limit=200`);
            comments = out.comments || [];
            state = { ...state, loaded: true, error: '', canPost: !!out.canPost, people: out.people || [], label: out.label || '', lastReadId: out.lastReadId || 0, hasMore: !!out.hasMore };
            const firstUnread = comments.find((c) => !c.isMine && c.id > state.lastReadId);
            unreadFrom = firstUnread ? firstUnread.id : 0;
            if (options.onLabel) options.onLabel(state.label);
        } catch (err) {
            state = { ...state, loaded: true, error: errText(err) };
        }
        if (destroyed) return;
        renderList();
        renderCompose();
        if (!state.error && comments.some((c) => !c.isMine && c.id > state.lastReadId)) markRead();
    }
    async function markRead() {
        try {
            const out = await api('POST', `${path}/read`);
            state.lastReadId = out.lastReadId || lastId();
            if (options.onChange) options.onChange({ read: true });
        } catch (err) { /* un fallo al marcar leído no estorba: se vuelve a intentar al abrir */ }
    }
    async function loadMore() {
        try {
            const out = await api('GET', `${path}/comments?after=${lastId()}&limit=200`);
            comments = comments.concat(out.comments || []);
            state.hasMore = !!out.hasMore;
            renderList();
        } catch (err) { Dashboard.showToast(errText(err), 'error'); }
    }
    // los comentarios que llegan mientras está abierto (cada 15 s, solo con la pestaña a la vista)
    async function poll() {
        if (destroyed || document.hidden || !state.loaded || state.error || state.hasMore) return;
        try {
            const out = await api('GET', `${path}/comments?after=${lastId()}&limit=200`);
            if (destroyed) return;
            const fresh = out.comments || [];
            if (fresh.length) {
                comments = comments.concat(fresh);
                state.canPost = !!out.canPost;
                renderList();
                if (fresh.some((c) => !c.isMine)) markRead();
            } else if (!!out.canPost !== state.canPost) {
                state.canPost = !!out.canPost;
                composeEl.innerHTML = '';
                renderCompose();
            }
        } catch (err) { /* sin conexión o el plan cambió: se vuelve a intentar */ }
    }
    async function send() {
        const input = composeEl.querySelector('textarea');
        if (!input || state.busy) return;
        const body = input.value.trim();
        if (!body) { showError(t('main.thrErr_THREAD_BODY_REQUIRED')); return; }
        const mentions = [...mentioned.entries()].filter(([name]) => body.includes(`@${name}`)).map(([, userId]) => userId);
        state.busy = true;
        const btn = composeEl.querySelector('[data-thr="send"]');
        if (btn) btn.disabled = true;
        showError('');
        try {
            const out = await api('POST', `${path}/comments`, { body, mentions });
            input.value = '';
            mentioned.clear();
            hideSuggestions();
            comments.push(out.comment);
            renderList();
            listEl.scrollTop = listEl.scrollHeight;
            if (options.onChange) options.onChange({ posted: true });
        } catch (err) {
            showError(errText(err));
            if (err && err.body && ['WORK_PLAN_CLOSED', 'WORK_PLAN_INACTIVE', 'WORK_PLAN_CANCELLED', 'WORK_PLAN_NOT_FOUND', 'THREAD_NOT_FOUND'].includes(err.body.code)) load();
        } finally {
            state.busy = false;
            const again = composeEl.querySelector('[data-thr="send"]');
            if (again) again.disabled = false;
        }
    }

    // ---- menciones con «@» ----
    function hideSuggestions() { const box = composeEl.querySelector('.thr-sug'); if (box) { box.hidden = true; box.innerHTML = ''; } suggestions = []; }
    // la palabra que se está escribiendo tras una «@» pegada al cursor (o null)
    function mentionQuery(input) {
        const upto = input.value.slice(0, input.selectionStart);
        const m = /(^|\s)@([^\s@]{0,24})$/.exec(upto);
        return m ? { query: m[2], start: upto.length - m[2].length - 1 } : null;
    }
    function updateSuggestions(input) {
        const found = mentionQuery(input);
        const box = composeEl.querySelector('.thr-sug');
        if (!found || !box) { hideSuggestions(); return; }
        const q = fold(found.query);
        suggestions = state.people.filter((p) => !q || fold(p.name).split(/\s+/).some((w) => w.startsWith(q)) || fold(p.name).startsWith(q)).slice(0, 6);
        if (!suggestions.length) { hideSuggestions(); return; }
        box.innerHTML = suggestions.map((p, i) => `<button type="button" role="option" class="thr-sug-item${i === 0 ? ' active' : ''}" data-thr="pick" data-user="${p.id}">${esc(p.name)}</button>`).join('');
        box.hidden = false;
    }
    function pick(input, person) {
        const found = mentionQuery(input);
        if (!found) return;
        const before = input.value.slice(0, found.start);
        const after = input.value.slice(input.selectionStart);
        const insert = `@${person.name} `;
        input.value = `${before}${insert}${after}`;
        const pos = before.length + insert.length;
        input.setSelectionRange(pos, pos);
        mentioned.set(person.name, person.id);
        hideSuggestions();
        input.focus();
    }

    const onClick = (event) => {
        const btn = event.target.closest('[data-thr]');
        if (!btn || !container.contains(btn)) return;
        const op = btn.dataset.thr;
        if (op === 'send') send();
        else if (op === 'more') loadMore();
        else if (op === 'pick') { const person = state.people.find((p) => p.id === Number(btn.dataset.user)); const input = composeEl.querySelector('textarea'); if (person && input) pick(input, person); }
    };
    const onInput = (event) => { if (event.target.matches('textarea.thr-input')) updateSuggestions(event.target); };
    const onKey = (event) => {
        if (!event.target.matches('textarea.thr-input')) return;
        const box = composeEl.querySelector('.thr-sug');
        const open = box && !box.hidden && suggestions.length;
        if (open && (event.key === 'Enter' || event.key === 'Tab')) { event.preventDefault(); pick(event.target, suggestions[0]); return; }
        if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hideSuggestions(); return; }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send(); }
    };
    container.addEventListener('click', onClick);
    container.addEventListener('input', onInput);
    container.addEventListener('keydown', onKey);
    timer = setInterval(poll, POLL_MS);
    renderList();
    load();
    return {
        refresh: load,
        destroy() { destroyed = true; clearInterval(timer); container.removeEventListener('click', onClick); container.removeEventListener('input', onInput); container.removeEventListener('keydown', onKey); },
    };
}

window.Threads = { mount };
})();
