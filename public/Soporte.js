// ---------------------------------------------------------------------------
// «Soporte» (para todos los usuarios de una empresa con TI contratado): el Nivel 0 y el seguimiento de lo que uno pidió.
//   · Ayuda rápida: los errores explicados y manuales que arma la empresa (TI › Catálogos › Errores y ayuda); se busca, se lee qué pasó y qué se requiere y se dice si «me sirvió» o «no me sirvió, pedir ayuda».
//   · Pedir soporte: la solicitud nueva (el mismo formulario de la lista de casos) y quién es la Mesa de ayuda.
//   · Mis solicitudes: las que abrió esta persona, con su estatus, nivel y quién las atiende; cada una se abre en su pantalla (chat, recorrido, calificar la atención y reabrir).
// Rutas /api/business/my-support*, /api/business/support-help. Con ?new=1 (y opcionalmente title, error y screen) abre la solicitud nueva ya con eso escrito.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const locale = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const fmtDate = (iso) => new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const state = { help: [], mine: null, q: '', open: null, noSupport: false, answered: new Set() };
const FORM_CFG = { form: '/api/business/my-support/form', screens: '/api/business/my-support/screens', create: '/api/business/my-support', cases: '/api/business/support-cases' };

async function load() {
    const [helpRes, mineRes] = await Promise.all([fetch('/api/business/support-help', { credentials: 'include' }), fetch('/api/business/my-support', { credentials: 'include' })]);
    state.help = helpRes.ok ? ((await helpRes.json()).articles || []) : [];
    if (mineRes.status === 403) { state.noSupport = true; state.mine = null; } else if (mineRes.ok) { state.noSupport = false; state.mine = await mineRes.json(); }
    render();
}
const matches = (a, q) => !q || [a.title, a.errorText, a.what, a.need, a.manualTitle].some((x) => String(x || '').toLowerCase().includes(q));
function manualHtml(a) {
    if (!a.manualUrl) return '';
    const external = /^https?:/i.test(a.manualUrl);
    return `<a class="btn btn-secondary" href="${esc(a.manualUrl)}"${external ? ' target="_blank" rel="noopener"' : ''}><i class="bx bx-book-open" aria-hidden="true"></i> ${esc(a.manualTitle || t('main.soManual'))}</a>`;
}
function articleHtml(a) {
    const isOpen = state.open === a.id;
    const done = state.answered.has(a.id);
    const body = isOpen ? `<div class="so-article-body">${a.what ? `<div><b>${esc(t('main.soWhat'))}</b><p class="sp-pre">${esc(a.what)}</p></div>` : ''}${a.need ? `<div><b>${esc(t('main.soNeed'))}</b><p class="sp-pre">${esc(a.need)}</p></div>` : ''}
        <div class="sc-actions">${manualHtml(a)}${done ? `<span class="sp-muted">${esc(t('main.soThanks'))}</span>` : `<button type="button" class="btn" data-so-helped="${a.id}">${esc(t('main.soHelped'))}</button><button type="button" class="btn btn-secondary" data-so-nohelp="${a.id}">${esc(t('main.soNotHelped'))}</button>`}</div></div>` : '';
    return `<div class="so-article${isOpen ? ' open' : ''}"><button type="button" class="so-article-head" data-so-open="${a.id}" aria-expanded="${isOpen}"><b>${esc(a.title)}</b>${a.errorText ? `<small class="sp-muted">${esc(a.errorText)}</small>` : ''}</button>${body}</div>`;
}
function helpHtml() {
    const q = state.q.trim().toLowerCase();
    const list = state.help.filter((a) => matches(a, q));
    return `<section class="sc-card" data-help-key="soAyuda"><div class="sc-card-head"><h3>${esc(t('main.soHelpTitle'))}</h3></div>
        <label class="sp-field"><span>${esc(t('main.soSearchLabel'))}</span><input type="search" id="so-search" value="${esc(state.q)}" placeholder="${esc(t('main.soSearchPlaceholder'))}"></label>
        <div class="so-articles">${list.length ? list.map(articleHtml).join('') : `<p class="sp-muted">${esc(t(state.help.length ? 'main.soNoMatch' : 'main.soNoHelp'))}</p>`}</div></section>`;
}
function askHtml() {
    const desk = state.mine && state.mine.helpDesk && state.mine.helpDesk.length ? `<p class="sp-muted">${esc(t('main.soHelpDesk', { names: state.mine.helpDesk.join(', ') }))}</p>` : '';
    return `<section class="sc-card" data-help-key="soPedir"><div class="sc-card-head"><h3>${esc(t('main.soAskTitle'))}</h3><button type="button" class="btn" id="so-new"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.spNew'))}</button></div><p>${esc(t('main.soAskText'))}</p>${desk}</section>`;
}
function mineHtml() {
    const cases = state.mine ? state.mine.cases : [];
    const cards = cases.map((c) => {
        const extra = c.rateCan ? `<span class="sp-tag per-pending">${esc(t('main.soRateNow'))}</span>` : (c.reopenCan ? `<span class="sp-muted">${esc(t('main.soReopenUntil', { when: fmtDate(c.reopenUntil) }))}</span>` : '');
        return `<a class="so-case" href="OpTISoporteCaso.html?id=${c.id}&amp;from=support"><div><b>${esc(c.folio)}</b> · ${esc(c.summary)}<div class="sp-muted">${esc(fmtDate(c.createdAt))}${c.assigneeName ? ` · ${esc(t('main.soAssignee', { name: c.assigneeName }))}` : ''}</div></div>
            <div class="sc-tags"><span class="sp-tag sp-status" data-k="${esc(c.status)}">${esc(t(`main.spStatus_${c.status}`))}</span><span class="sp-tag sp-lv" data-k="${esc(c.level)}">${esc(t(`main.sopLevel_${c.level}`))}</span>${extra}</div></a>`;
    }).join('');
    return `<section class="sc-card" data-help-key="soMias"><div class="sc-card-head"><h3>${esc(t('main.soMineTitle'))}</h3></div><div class="so-cases">${cards || `<p class="sp-muted">${esc(t('main.soNoCases'))}</p>`}</div></section>`;
}
function render() {
    if (state.noSupport) { $('so-root').innerHTML = `<section class="sc-card"><p>${esc(t('main.soNoSupport'))}</p></section>`; return; }
    const keepFocus = document.activeElement && document.activeElement.id === 'so-search';
    const pos = keepFocus ? document.activeElement.selectionStart : 0;
    $('so-root').innerHTML = `${helpHtml()}${askHtml()}${mineHtml()}`;
    if (keepFocus) { const el = $('so-search'); el.focus(); el.setSelectionRange(pos, pos); }
}
function openForm(prefill) {
    SupportRequestForm.open(prefill || {}, { ...FORM_CFG, onCreated: async (created) => { await load(); if (created && created.id) location.href = `OpTISoporteCaso.html?id=${created.id}&from=support`; } });
}
async function useArticle(id, helped) {
    try {
        const res = await fetch(`/api/business/support-help/${id}/use`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ helped, source: 'support' }) });
        return res.ok;
    } catch (err) { return false; }
}
$('so-root').addEventListener('click', async (event) => {
    const op = event.target.closest('[data-so-open]');
    if (op) { const id = Number(op.dataset.soOpen); state.open = state.open === id ? null : id; render(); return; }
    const yes = event.target.closest('[data-so-helped]');
    if (yes) { const id = Number(yes.dataset.soHelped); if (await useArticle(id, true)) { state.answered.add(id); Dashboard.showToast(t('main.soThanks'), 'success'); render(); } return; }
    const no = event.target.closest('[data-so-nohelp]');
    if (no) {
        const id = Number(no.dataset.soNohelp);
        const a = state.help.find((x) => x.id === id);
        await useArticle(id, false);
        openForm({ summary: a ? a.title : '', errorText: a ? a.errorText : '' });
        return;
    }
    if (event.target.closest('#so-new')) openForm({});
});
$('so-root').addEventListener('input', (event) => { if (event.target.id === 'so-search') { state.q = event.target.value; render(); } });
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await load();
        const q = new URLSearchParams(location.search);
        if (q.get('new') === '1' && !state.noSupport) openForm({ summary: q.get('title') || '', errorText: q.get('error') || '', screen: q.get('screen') || '' });
    } catch (err) {
        console.error('Soporte failed to initialize:', err);
    }
})();
})();
