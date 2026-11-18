// ---------------------------------------------------------------------------
// TI > Operaciones TI > Catálogos > Errores y ayuda: la ayuda rápida (Nivel 0) de la empresa. Cada renglón explica algo en palabras sencillas: el texto del error que ve la persona, qué pasó, qué se requiere y el
// manual o proceso donde está explicado (una página de Material Apoyo o un enlace). Se ve en «Soporte» (para todos los usuarios) y en los avisos de error que traen ese texto. Se ve con la columna «Artículos» del árbol
// y se agrega o edita con Ver y operar; lo inactivo deja de mostrarse. Cada cambio queda en el historial de cambios.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'ayuda-soporte';
const API = '/api/business/support-help-admin';
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const locale = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const state = { articles: [], canEdit: false, canHistory: false, form: null };
async function load() {
    const res = await fetch(API, { credentials: 'include' });
    if (!res.ok) { $('ay-root').innerHTML = `<p class="sp-muted">${esc(t('main.ayNoAccess'))}</p>`; return; }
    const body = await res.json();
    state.articles = body.articles; state.canEdit = !!body.canEdit; state.canHistory = !!body.canHistory;
    render();
}
function render() {
    const rows = state.articles.map((a) => `<tr><td><b>${esc(a.title)}</b></td><td>${esc(a.errorText || '—')}</td><td>${esc((a.what || a.need).slice(0, 120))}${(a.what || a.need).length > 120 ? '…' : ''}</td>
        <td>${a.manualUrl ? `<a href="${esc(a.manualUrl)}"${/^https?:/i.test(a.manualUrl) ? ' target="_blank" rel="noopener"' : ''}>${esc(a.manualTitle || a.manualUrl)}</a>` : '—'}</td>
        <td><span class="sp-tag ${a.status === 'active' ? 'per-confirmed' : 'per-expired'}">${esc(t(`main.ayStatus_${a.status}`))}</span></td>
        <td>${state.canEdit ? `<button type="button" class="admin-icon-btn" data-ay-edit="${a.id}" aria-label="${esc(t('main.ayEdit'))}" title="${esc(t('main.ayEdit'))}"><i class="bx bx-edit" aria-hidden="true"></i></button>` : ''}</td></tr>`).join('');
    $('ay-root').innerHTML = `<div class="ms-bar">${state.canEdit ? `<button type="button" class="btn" id="ay-new" data-help-key="ayAgregar"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.ayNew'))}</button>` : ''}${state.canHistory ? `<button type="button" class="ms-history-btn" id="ay-history" data-help-key="ayHistorial"><i class="bx bx-history" aria-hidden="true"></i> ${esc(t('main.changeHistory'))}</button>` : ''}</div>
        <section class="sc-card" data-help-key="ayLista"><div class="sc-sg-table"><table class="ms-table"><thead><tr><th>${esc(t('main.ayTitle'))}</th><th>${esc(t('main.ayError'))}</th><th>${esc(t('main.ayWhatShort'))}</th><th>${esc(t('main.ayManual'))}</th><th>${esc(t('main.ayStatus'))}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="sp-muted">${esc(t('main.ayEmpty'))}</td></tr>`}</tbody></table></div></section>`;
}
function formHtml() {
    const f = state.form;
    const field = (key, label, hint, rows) => `<label class="sp-field"><span>${esc(label)}${key === 'title' ? ' *' : ''}${hint ? ` <small class="sp-muted">${esc(hint)}</small>` : ''}</span>${rows ? `<textarea data-ay-f="${key}" rows="${rows}">${esc(f[key])}</textarea>` : `<input type="text" data-ay-f="${key}" value="${esc(f[key])}">`}</label>`;
    return `${field('title', t('main.ayTitle'), t('main.ayTitleHint'))}${field('errorText', t('main.ayError'), t('main.ayErrorHint'))}${field('what', t('main.ayWhat'), '', 4)}${field('need', t('main.ayNeed'), '', 4)}${field('manualTitle', t('main.ayManualTitle'), '')}${field('manualUrl', t('main.ayManualUrl'), t('main.ayManualUrlHint'))}
        <label class="sp-field"><span>${esc(t('main.ayStatus'))}</span><select data-ay-f="status"><option value="active"${f.status === 'active' ? ' selected' : ''}>${esc(t('main.ayStatus_active'))}</option><option value="inactive"${f.status === 'inactive' ? ' selected' : ''}>${esc(t('main.ayStatus_inactive'))}</option></select></label>`;
}
let formEl = null;
function openForm(article) {
    if (!formEl) {
        formEl = document.createElement('div');
        formEl.className = 'modal-overlay';
        formEl.hidden = true;
        formEl.innerHTML = '<div class="modal-panel sp-form" role="dialog" aria-modal="true" aria-labelledby="ay-form-title"><h3 id="ay-form-title"></h3><div id="ay-form-body"></div><div class="admin-form-actions"><button type="button" class="btn" id="ay-form-save"></button><button type="button" class="btn btn-secondary" id="ay-form-cancel"></button></div></div>';
        document.body.appendChild(formEl);
        formEl.addEventListener('click', (event) => {
            if (event.target === formEl || event.target.closest('#ay-form-cancel')) { if (!state.form.sending) closeForm(); return; }
            if (event.target.closest('#ay-form-save')) save();
        });
        formEl.addEventListener('input', (event) => { const k = event.target.dataset && event.target.dataset.ayF; if (k && state.form) state.form[k] = event.target.value; });
        formEl.addEventListener('change', (event) => { const k = event.target.dataset && event.target.dataset.ayF; if (k && state.form) state.form[k] = event.target.value; });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.form && !state.form.sending) closeForm(); });
    }
    state.form = { id: article ? article.id : null, title: article ? article.title : '', errorText: article ? article.errorText : '', what: article ? article.what : '', need: article ? article.need : '', manualTitle: article ? article.manualTitle : '', manualUrl: article ? article.manualUrl : '', status: article ? article.status : 'active', sending: false };
    $('ay-form-title').textContent = t(article ? 'main.ayEdit' : 'main.ayNew');
    $('ay-form-save').textContent = t('main.ayFormSave');
    $('ay-form-cancel').textContent = t('main.spFCancel');
    $('ay-form-body').innerHTML = formHtml();
    formEl.hidden = false;
}
function closeForm() { if (formEl) formEl.hidden = true; state.form = null; }
async function save() {
    const f = state.form; if (!f || f.sending) return;
    f.sending = true;
    try {
        const body = { title: f.title, errorText: f.errorText, what: f.what, need: f.need, manualTitle: f.manualTitle, manualUrl: f.manualUrl, status: f.status };
        const res = await fetch(f.id ? `${API}/${f.id}` : API, { method: f.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); f.sending = false; return; }
        closeForm();
        Dashboard.showToast(t('main.ayFormSaved'), 'success');
        await load();
    } catch (err) {
        console.error('Errores y ayuda: failed to save', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        if (state.form) state.form.sending = false;
    }
}
$('ay-root').addEventListener('click', (event) => {
    if (event.target.closest('#ay-new')) { openForm(null); return; }
    const ed = event.target.closest('[data-ay-edit]');
    if (ed) { openForm(state.articles.find((a) => a.id === Number(ed.dataset.ayEdit))); return; }
    if (event.target.closest('#ay-history')) Dashboard.openChangeHistory(TABLE_KEY);
});
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await load();
    } catch (err) {
        console.error('Errores y ayuda failed to initialize:', err);
    }
})();
})();
