// ---------------------------------------------------------------------------
// TI › Configuración Compañía › Mi App en tiendas (pieza 6 de Apps Nuestros Clientes): la app PROPIA del cliente (su ícono, su nombre abreviado y su código de empresa ya cargado), de pago.
// La pantalla solo la ve quien la tiene contratada (nodo con costo en el Árbol Maestro, se vende en «+ Permisos Adicionales»). El administrador del cliente PIDE su app aquí; SGN es el dueño de las apps en las tiendas:
// la arma en la nube, la publica y deja en Apps Nuestros Clientes el estado y los enlaces (APK para Android, Google Play, App Store), que esta pantalla muestra. Rutas en server.js (/api/business/mi-app/store).
// Se ve igual que «Mi App» (misma familia de estilos cli-* de Admin.css): si cambia una, revisar la otra.
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/mi-app/store';
const HISTORY_KEY = 'mi-app-tiendas';
const $ = (id) => document.getElementById(id);
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const stamp = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); };
// state: { store, contracted, canEdit, name, slug, iconColor, iconPublished }
let state = null;

async function call(method, path, body) {
    const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
function explain(err) {
    const code = err.body && err.body.code;
    const text = Dashboard.t(`main.atErr_${code}`);
    return text !== `main.atErr_${code}` ? text : t('main.atErr_default');
}
function showError(text) { $('mt-error').textContent = text || ''; $('mt-error').hidden = !text; }

const chipClass = { none: 'cancelled', requested: 'pending', building: 'negotiating', ready: 'approved' };
const stateChip = (status) => `<span class="exp-chip exp-chip-${chipClass[status] || 'cancelled'}">${esc(t(`main.atState_${status}`))}</span>`;
function renderTitle() {
    const title = state.name ? t('main.atTitle', { name: state.name }) : t('main.atTitleBare');
    const el = $('mt-title'); if (el) { el.removeAttribute('data-i18n'); el.textContent = title; }
    document.title = title;
}
const initials = (name) => String(name || '').replace(/[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || 'SG';
function iconTile() {
    // sin controlador en el propio elemento (la política de seguridad no lo deja): render() le pone el «error» a la imagen
    const img = state.iconPublished ? `<img data-icon-img src="/c/${encodeURIComponent(state.slug)}/icon-192.png${state.iconVersion ? `?v=${encodeURIComponent(state.iconVersion)}` : ''}" alt="" style="width:100%;height:100%;border-radius:inherit;object-fit:cover">` : '';
    return `<span class="cli-thumb" style="background:${esc(state.iconColor)};width:64px;height:64px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.25rem;overflow:hidden;position:relative">${esc(initials(state.name))}${img ? `<span style="position:absolute;inset:0">${img}</span>` : ''}</span>`;
}
function linkRow(label, url) {
    return `<div class="cli-row"><span>${esc(label)}</span>${url ? `<a class="btn btn-secondary sc-mini" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(t('main.atOpen'))}</a>` : `<span class="cli-sub">${esc(t('main.atNoLink'))}</span>`}</div>`;
}
function render() {
    const s = state.store;
    const lines = [];
    if (s.status !== 'none' && s.requestedAt) lines.push(t('main.atRequestedLine', { by: s.requestedBy || '—', date: stamp(s.requestedAt) }));
    if (s.status === 'ready' && s.updatedAt) lines.push(t('main.atReadyLine', { date: stamp(s.updatedAt) }));
    const canRequest = state.contracted && state.canEdit && s.status === 'none';
    $('mt-root').innerHTML = `<div class="cli-head"><div><div class="cli-statusline">${stateChip(s.status)} <span class="cli-sub">${esc(lines.join(' · '))}</span></div>${state.canEdit ? '' : `<p class="cli-sub">${esc(t('main.maViewOnly'))}</p>`}${state.contracted ? '' : `<p class="cli-sub">${esc(t('main.atNotContracted'))}</p>`}</div>
        <div class="cli-actions">${canRequest ? `<button type="button" class="btn" id="mt-request">${esc(t('main.atRequest'))}</button>` : ''}<button type="button" class="btn btn-secondary" id="mt-history" data-help-key="changeHistory"><i class="bx bx-history" aria-hidden="true"></i> ${esc(t('main.maHistory'))}</button></div></div>
        <div class="cli-ed"><div class="cli-ctrl">
        <div class="cli-grp" data-help-key="appTiendas"><h4>${esc(t('main.atGrpApp'))}</h4>
            <div class="cli-row"><span>${iconTile()}</span></div>
            <div class="cli-row"><span>${esc(t('admin.saasCliShortName'))}</span><span class="cli-addr">${esc(state.name || '—')}</span></div>
            <div class="cli-row"><span>${esc(t('main.atCompanyCode'))}</span><code class="cli-addr">${esc(state.slug)}</code></div>
            ${s.version ? `<div class="cli-row"><span>${esc(t('main.atVersion'))}</span><span class="cli-addr">${esc(s.version)}</span></div>` : ''}</div>
        <div class="cli-grp" data-help-key="appTiendasLinks"><h4>${esc(t('main.atGrpLinks'))}</h4>
            ${s.status === 'ready' ? `${linkRow(t('main.atApk'), s.apkUrl)}${linkRow(t('main.atPlay'), s.playUrl)}${linkRow(t('main.atAppStore'), s.appStoreUrl)}` : `<p class="cli-sub">${esc(t(`main.atWait_${s.status}`))}</p>`}</div>
        </div></div>`;
    $('mt-root').querySelectorAll('img[data-icon-img]').forEach((img) => img.addEventListener('error', () => img.remove()));
}
async function doRequest() {
    showError('');
    try {
        const confirmFn = (window.Dashboard && window.Dashboard.confirm) || window.confirm;
        if (!(await confirmFn(t('main.atRequestConfirm', { name: state.name || state.slug })))) return;
        const out = await call('POST', `${API}/request`, {});
        state.store = out.store;
        render();
        Dashboard.showToast(t('main.atRequestedOk'), 'success');
    } catch (err) { showError(explain(err)); }
}
function bind() {
    $('mt-root').addEventListener('click', (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;
        if (btn.id === 'mt-request') doRequest();
        else if (btn.id === 'mt-history') Dashboard.openChangeHistory(HISTORY_KEY);
    });
}

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        let detail;
        try { detail = await call('GET', API); } catch (err) {
            showError(err.status === 404 ? t('main.maNoConfig') : t('main.atLoadError'));
            return;
        }
        state = { store: detail.store, contracted: detail.contracted, canEdit: detail.canEdit, name: detail.name, slug: detail.slug, iconColor: detail.iconColor, iconPublished: detail.iconPublished, iconVersion: detail.iconVersion };
        renderTitle();
        render();
        bind();
    } catch (err) {
        console.error('Mi App en tiendas failed to initialize:', err);
        showError(t('main.atLoadError'));
    }
})();
})();
