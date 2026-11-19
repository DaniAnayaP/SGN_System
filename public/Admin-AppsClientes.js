// ---------------------------------------------------------------------------
// Servicio a Cliente › Apps Nuestros Clientes (lado SaaS): el inicio de sesión PERSONALIZADO de cada cliente, para computadora y para el celular. Una fila por cliente (que no esté inactivo): qué tiene en cada canal (el de siempre o uno
// personalizado), su clave y su estado. «Personalizar» crea su inicio y abre el editor: controles a la izquierda (dónde se usa, marca, fondo, textos y qué se muestra) y la vista previa de computadora y celular a la derecha, que cambia al
// momento. Lo que se edita es un BORRADOR; «Publicar» lo pone en el inicio de verdad. Lo que se deja vacío (logo, colores) toma lo de Diseño de Compañía del cliente. La clave del cliente es la dirección (…/c/<clave>) y el código de empresa de la
// app; se puede cambiar (el enlace y el código ya entregados dejan de valer). Cada botón se da en el árbol de accesos de la cuenta (Equipo SaaS). Rutas en server.js (/api/admin/client-logins). Trae las 13 columnas de Control Interno.
// Pieza 1: la pantalla y sus datos; la dirección pública /c/<clave> y la app del celular son las piezas siguientes.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'apps-clientes-saas';
const API = '/api/admin/client-logins';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['client', 'web', 'app', 'slug', 'status'];
const MAX_LOGO_BYTES = 350 * 1024;
const MAX_IMAGE_BYTES = 700 * 1024;
const FALLBACK_PRIMARY = '#3a4bc9'; // el azul del inicio de siempre, si la compañía no tiene colores
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const stamp = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); };
const state = { rows: [], can: {}, editor: null };

// ---- la lista --------------------------------------------------------------------------------------------------------------------------------------------
const stateChip = (status) => `<span class="exp-chip exp-chip-${{ default: 'cancelled', draft: 'pending', published: 'approved', published_changes: 'negotiating' }[status] || 'cancelled'}">${esc(t(`main.cliState_${status}`))}</span>`;
const rowStatus = (r) => (!r.hasConfig ? 'none' : (!r.published ? 'draft' : (r.dirty ? 'changes' : 'published')));
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function systemCells(r) {
    const d = new Date(`${String(r.createdAt).replace(' ', 'T')}Z`);
    const pad = (n) => String(n).padStart(2, '0');
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const start = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((Math.floor((d - start) / 86400000) + start.getDay() + 1) / 7);
    const values = {
        colSysEmpresa: r.client, colSysArea: 'Servicio a Cliente', colSysModulo: 'Administración SaaS', colSysPantalla: t('menu.saasClientLogins'), colSysCentroCostos: '',
        colSysFecha: `${pad(d.getDate())}/${months[d.getMonth()]}/${d.getFullYear()}`, colSysDiaNum: pad(d.getDate()), colSysDiaTexto: days[d.getDay()], colSysMesNum: pad(d.getMonth() + 1), colSysMesTexto: months[d.getMonth()],
        colSysAnio: String(d.getFullYear()), colSysSemana: `Sem${week}_${d.getFullYear()}`, colSysHora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    };
    return SYSTEM_COLUMN_KEYS.map((key) => cell(key, values[key], 'col-system'));
}
function actionsCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    if (r.hasConfig || state.can.edit) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary sc-mini';
        btn.dataset.cliAct = 'open';
        btn.dataset.cliClient = String(r.clientId);
        btn.textContent = t(r.hasConfig ? 'admin.saasCliEdit' : 'admin.saasCliCustomize');
        td.appendChild(btn);
    }
    const history = document.createElement('button');
    history.type = 'button';
    history.className = 'admin-icon-btn';
    history.setAttribute('data-help-key', 'changeHistory');
    history.setAttribute('aria-label', t('main.solHistory'));
    history.title = t('main.solHistory');
    history.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    history.addEventListener('click', () => Dashboard.openChangeHistoryWithRows(t('main.changeHistoryTitleRecord'), Dashboard.saasTableChangesLoader(TABLE_KEY, r.clientId)));
    td.appendChild(history);
    return td;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.clientId);
    const web = document.createElement('td'); web.dataset.col = 'web'; web.innerHTML = stateChip(r.web);
    const app = document.createElement('td'); app.dataset.col = 'app'; app.innerHTML = stateChip(r.app);
    const status = document.createElement('td'); status.dataset.col = 'status';
    const key = rowStatus(r);
    status.innerHTML = `<span class="exp-chip exp-chip-${{ none: 'cancelled', draft: 'pending', published: 'approved', changes: 'negotiating' }[key]}">${esc(t(`main.cliRow_${key}`))}</span>`;
    tr.append(...systemCells(r), cell('client', r.client), web, app, cell('slug', r.slug), status, actionsCell(r));
    return tr;
}
function getTbody() { return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0]; }
function renderRows() {
    const tbody = getTbody();
    tbody.innerHTML = '';
    if (!state.rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.className = 'data-table-empty-cell';
        td.colSpan = document.querySelectorAll('table.data-table thead th').length;
        td.innerHTML = `<div class="data-table-empty-inner">${esc(Dashboard.t('main.emptyStateText'))}</div>`;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }
    const fragment = document.createDocumentFragment();
    state.rows.forEach((r) => fragment.appendChild(buildRow(r)));
    tbody.appendChild(fragment);
    applyFilters();
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
Dashboard.registerSaasTableHistory(TABLE_KEY, 'main.changeHistoryTitle', Dashboard.saasTableChangesLoader(TABLE_KEY));
async function call(method, path, body) {
    const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body || {}) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
function explain(err) {
    const code = err.body && err.body.code;
    const key = `admin.saasCliErr_${code}`;
    const text = Dashboard.t(key);
    return text !== key ? text : t('admin.saasCliErr_default');
}
async function loadList() {
    const errEl = document.getElementById('ss-error');
    try {
        const body = await call('GET', API);
        errEl.hidden = true;
        state.rows = body.rows; state.can = body.can || {};
        renderRows();
    } catch (err) { errEl.textContent = (err.body && err.body.message) || Dashboard.t('admin.saveError'); errEl.hidden = false; }
}

// ---- el editor -------------------------------------------------------------------------------------------------------------------------------------------
const clone = (o) => JSON.parse(JSON.stringify(o));
const $ = (sel) => document.querySelector(`#cli-editor ${sel}`);
function hexToRgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return [58, 75, 201]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const darken = (hex, factor) => toHex(hexToRgb(hex).map((v) => v * (1 - factor)));
const lighten = (hex, factor) => toHex(hexToRgb(hex).map((v) => v + (255 - v) * factor));
function palette(ed) {
    const w = ed.work; const company = ed.company;
    const primary = w.brand.primary || company.primaryColor || FALLBACK_PRIMARY;
    const color1 = w.background.color1 || primary;
    const color2 = w.background.color2 || company.secondaryColor || darken(color1, 0.42);
    const button = w.brand.button || lighten(primary, 0.12);
    return { primary, color1, color2, button };
}
function backgroundCss(ed, p) {
    const bg = ed.work.background;
    if (bg.type === 'solid') return p.color1;
    if (bg.type === 'image' && bg.image) return `linear-gradient(rgba(0,0,0,.28), rgba(0,0,0,.28)), url("${bg.image}") center/cover`;
    if (bg.type === 'pattern') return `repeating-linear-gradient(60deg, rgba(255,255,255,.07) 0 14px, transparent 14px 28px), repeating-linear-gradient(-60deg, rgba(255,255,255,.05) 0 14px, transparent 14px 28px), linear-gradient(160deg, ${p.color2}, ${p.color1} 60%, ${p.color2})`;
    return `linear-gradient(160deg, ${p.color2}, ${p.color1} 55%, ${p.color2})`;
}
function greeting() { const h = new Date().getHours(); return t(h < 12 ? 'admin.saasCliGreetMorning' : (h < 19 ? 'admin.saasCliGreetAfternoon' : 'admin.saasCliGreetEvening')); }
const markHtml = (ed, size) => {
    const logo = ed.work.brand.logo || ed.company.logo;
    return logo ? `<img class="cli-logo cli-logo-${size}" src="${esc(logo)}" alt="">` : `<span class="cli-mark cli-mark-${size}"></span>`;
};
function webPreview(ed) {
    const w = ed.work; const p = palette(ed);
    const social = w.show.social ? '<div class="cli-social"><i></i><i></i><i></i></div>' : '';
    return `<div class="cli-browser${w.channels.web ? '' : ' cli-off'}"><div class="cli-bar"><i></i><i></i><i></i><span class="cli-url">…/c/${esc(ed.config.slug)}</span></div>
        <div class="cli-web"><div class="cli-brandside${w.background.diagonal ? ' cli-band' : ''}" style="background: ${backgroundCss(ed, p)}">${markHtml(ed, 'lg')}<div class="cli-cname">${esc(ed.company.name.toUpperCase())}</div>${w.texts.greeting ? `<div class="cli-greet">${esc(greeting())}</div>` : ''}<div class="cli-greet-sub">${esc(w.texts.welcome)}</div></div>
        <div class="cli-formside"><h5>${esc(w.texts.formTitle)}</h5><div class="cli-inp">${esc(t('admin.saasCliPrevUser'))}</div><div class="cli-inp">${esc(t('admin.saasCliPrevPassword'))}</div>${w.show.forgot ? `<div class="cli-lnk" style="color:${p.primary}">${esc(t('admin.saasCliPrevForgot'))}</div>` : ''}<div class="cli-btn" style="background:${p.button}">${esc(w.texts.formTitle)}</div>${social}${w.show.register ? '<div class="cli-lnk cli-muted">+</div>' : ''}${w.show.language ? `<div class="cli-lnk cli-muted">${esc(t('admin.saasCliPrevLangs'))}</div>` : ''}${w.show.appLink ? '<div class="cli-lnk cli-muted">⬇ App</div>' : ''}</div></div></div>`;
}
function phoneWelcome(ed) {
    const w = ed.work; const p = palette(ed);
    return `<div class="cli-phone"><div class="cli-scrn${w.background.diagonal ? ' cli-band' : ''}" style="background: ${backgroundCss(ed, p)}"><div><div class="cli-sb"><span>11:23</span><span>5G ▮▮▮</span></div><div class="cli-burger"><i></i><i></i><i></i></div></div>
        <div class="cli-mid">${markHtml(ed, 'lg')}<div class="cli-cname">${esc(ed.company.name.toUpperCase())}</div></div><div class="cli-low">${w.texts.greeting ? `<div class="cli-greet">${esc(greeting())}</div>` : ''}<div class="cli-greet-sub">${esc(w.texts.welcome)}</div><div class="cli-btn" style="background:${p.button}">${esc(w.texts.appButton)}</div></div></div><div class="cli-cap">${esc(t('admin.saasCliPrevWelcome'))}</div></div>`;
}
function phoneLogin(ed) {
    const w = ed.work; const p = palette(ed);
    return `<div class="cli-phone"><div class="cli-scrn cli-scrn-form${w.background.diagonal ? ' cli-band' : ''}" style="background: ${backgroundCss(ed, p)}"><div class="cli-sb"><span>11:23</span><span>5G ▮▮▮</span></div><div class="cli-mid">${markHtml(ed, 'sm')}<div class="cli-cname">${esc(ed.company.name.toUpperCase())}</div></div>
        <div class="cli-field">${esc(t('admin.saasCliPrevUser'))}</div><div class="cli-field">${esc(t('admin.saasCliPrevPassword'))}</div><div class="cli-btn" style="background:${p.button}">${esc(w.texts.formTitle)}</div>${w.show.forgot ? `<div class="cli-lnk" style="color:#fff;text-align:center;opacity:.85">${esc(t('admin.saasCliPrevForgot'))}</div>` : ''}${w.show.faceId ? `<div class="cli-face"><i></i>${esc(t('admin.saasCliPrevFaceId'))}</div>` : ''}</div><div class="cli-cap">${esc(t('admin.saasCliPrevLogin'))}</div></div>`;
}
function renderPreviews() {
    const ed = state.editor;
    const phones = `${ed.work.show.welcomeScreen ? phoneWelcome(ed) : ''}${phoneLogin(ed)}`;
    $('#cli-previews').innerHTML = `<div><span class="cli-prev-cap">${esc(t('admin.saasCliPrevWeb'))}</span>${webPreview(ed)}</div><div><span class="cli-prev-cap">${esc(t('admin.saasCliPrevApp'))}</span><div class="cli-phones${ed.work.channels.app ? '' : ' cli-off'}">${phones}</div></div><div><span class="cli-prev-cap">${esc(t('admin.saasCliPrevIcon'))}</span>${iconPreview(ed)}</div>`;
    renderStatus();
}
// ---- el ícono de la app: logo de la marca (o el de Diseño de Compañía) sobre el color elegido, con la banda «by SGN» abajo. Se dibuja aquí (imagen SVG) y se baja como PNG de 1024 px, cuadrado y sin esquinas redondeadas:
// las tiendas y el celular le ponen su propia máscara. El nombre abreviado va debajo del ícono en la pantalla del celular, no dentro de la imagen. ----
function iconIdentity(ed) {
    const id = ed.work.identity || { shortName: '', iconColor: '' };
    return { name: id.shortName || ed.company.suggestedShortName || '', color: id.iconColor || palette(ed).primary, logo: ed.work.brand.logo || ed.company.logo || '' };
}
function iconSvg(ed) {
    const id = iconIdentity(ed);
    const [r, g, b] = hexToRgb(id.color);
    const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62; // sobre un color muy claro la banda va más oscura para que «by SGN» se lea
    const plate = id.logo
        ? `<rect x="176" y="130" width="672" height="520" rx="92" fill="#fff"/><image href="${id.logo}" xlink:href="${id.logo}" x="216" y="170" width="592" height="440" preserveAspectRatio="xMidYMid meet"/>`
        : `<circle cx="500" cy="390" r="170" fill="none" stroke="#fff" stroke-width="68"/><circle cx="668" cy="506" r="50" fill="${lighten(id.color, 0.6)}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="${id.color}"/>${plate}<rect y="772" width="1024" height="252" fill="rgba(0,0,0,${light ? 0.62 : 0.34})"/><text x="512" y="925" text-anchor="middle" font-family="Poppins, Arial, Helvetica, sans-serif" font-weight="700" font-size="120" letter-spacing="6" fill="#fff">by SGN</text></svg>`;
}
const iconUri = (ed) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(ed))}`;
function iconPreview(ed) {
    const id = iconIdentity(ed);
    const uri = esc(iconUri(ed));
    const img = (size) => `<img class="cli-appicon" src="${uri}" width="${size}" height="${size}" alt="">`;
    return `<div class="cli-iconprev"><div class="cli-iconrow">
        <div class="cli-iconit">${img(104)}<span>${esc(t('admin.saasCliIconStore'))}</span></div>
        <div class="cli-iconit">${img(60)}<span class="cli-iconlbl">${esc(id.name)}</span><span>${esc(t('admin.saasCliIconHome'))}</span></div>
        <div class="cli-iconit">${img(38)}<span>${esc(t('admin.saasCliIconAlert'))}</span></div></div>
        ${state.can.icon ? `<button type="button" class="btn btn-secondary sc-mini" id="cli-icon-dl">${esc(t('admin.saasCliIconDownload'))}</button>` : ''}</div>`;
}
// Opción C (instalar desde la dirección del cliente): al PUBLICAR se dibuja el ícono en PNG de 512 y 192 px y se manda con la publicación; el servidor lo entrega en el manifiesto de /c/<clave>. Si no se pudo dibujar, se publica sin ícono (sale el de SGN).
async function renderIconPngs(ed) {
    const uri = iconUri(ed);
    const draw = (size) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; canvas.getContext('2d').drawImage(img, 0, 0, size, size); resolve(canvas.toDataURL('image/png')); };
        img.onerror = () => reject(new Error('icon'));
        img.src = uri;
    });
    try { return { s512: await draw(512), s192: await draw(192) }; } catch { return undefined; }
}
function downloadIcon() {
    const ed = state.editor;
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = 1024;
        canvas.getContext('2d').drawImage(img, 0, 0, 1024, 1024);
        canvas.toBlob((blob) => {
            if (!blob) { Dashboard.showToast(t('admin.saasCliIconError'), 'error'); return; }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = `icono-${ed.config.slug}.png`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            Dashboard.showToast(t('admin.saasCliIconDownloaded'), 'success');
        }, 'image/png');
    };
    img.onerror = () => Dashboard.showToast(t('admin.saasCliIconError'), 'error');
    img.src = iconUri(ed);
}
function renderStatus() {
    const ed = state.editor;
    const dirty = JSON.stringify(ed.work) !== ed.savedJson;
    const c = ed.config;
    const published = c.published ? (c.dirty || dirty ? 'published_changes' : 'published') : 'draft';
    const lines = [dirty ? t('admin.saasCliUnsaved') : t('admin.saasCliSavedAt', { date: stamp(c.updatedAt), by: c.updatedBy || '—' }), c.published ? t('admin.saasCliPublishedAt', { date: stamp(c.liveAt), by: c.liveBy || '—' }) : t('admin.saasCliNeverPublished')];
    if (c.clientChange) lines.push(t('admin.saasCliClientChanged', { by: c.clientChange.by || '—', date: stamp(c.clientChange.at) }));
    $('#cli-status').innerHTML = `${stateChip(published)} <span class="cli-sub">${esc(lines.join(' · '))}</span>`;
    const save = $('#cli-save'); const pub = $('#cli-publish');
    if (save) save.disabled = !dirty;
    if (pub) pub.disabled = !(dirty || c.dirty || !c.published);
}
// ---- los controles: se dibujan una vez; cada cambio actualiza el borrador de trabajo y la vista previa ----
const badge = (kind) => `<span class="cli-ch cli-ch-${kind}">${esc(t(`admin.saasCliBadge${kind === 'both' ? 'Both' : (kind === 'app' ? 'App' : 'Web')}`))}</span>`;
function toggleRow(path, label, kind) { return `<label class="cli-row"><span>${esc(label)} ${kind ? badge(kind) : ''}</span><input type="checkbox" data-p="${path}" class="cli-tgl"></label>`; }
function colorRow(path, label, helpKey) {
    return `<div class="cli-row"${helpKey ? ` data-help-key="${helpKey}"` : ''}><span>${esc(label)}</span><span class="cli-inline"><input type="color" data-color="${path}"><button type="button" class="cli-link" data-clear="${path}">${esc(t('admin.saasCliColorReset'))}</button></span></div>`;
}
function buildEditor() {
    const ed = state.editor;
    const can = state.can.edit;
    $('#cli-body').innerHTML = `<div class="cli-ed"><div class="cli-ctrl">
        <div class="cli-grp" data-help-key="cliChannels"><h4>${esc(t('admin.saasCliGrpChannels'))}</h4>${toggleRow('channels.web', t('admin.saasCliUseWeb'))}${toggleRow('channels.app', t('admin.saasCliUseApp'))}</div>
        <div class="cli-grp" data-help-key="cliBrand"><h4>${esc(t('admin.saasCliGrpBrand'))} ${badge('both')}</h4>
            <div class="cli-row"><span>${esc(t('admin.saasCliLogo'))}</span><span class="cli-inline"><span id="cli-logo-thumb"></span><input type="file" id="cli-logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden><button type="button" class="cli-link" id="cli-logo-pick">${esc(t('admin.saasCliLogoChange'))}</button><button type="button" class="cli-link" id="cli-logo-reset">${esc(t('admin.saasCliLogoReset'))}</button></span></div>
            ${colorRow('brand.primary', t('admin.saasCliPrimary'))}${colorRow('brand.button', t('admin.saasCliButton'))}</div>
        <div class="cli-grp" data-help-key="cliIdentity"><h4>${esc(t('admin.saasCliGrpIdentity'))} ${badge('app')}</h4>
            <label class="cli-row"><span>${esc(t('admin.saasCliShortName'))} <span class="cli-count" id="cli-short-count"></span></span><input type="text" class="cli-fld" id="cli-short" data-p="identity.shortName" maxlength="12" autocomplete="off" spellcheck="false"></label>
            ${colorRow('identity.iconColor', t('admin.saasCliIconColor'))}
            <div class="cli-row"><span>${esc(t('admin.saasCliIconBy'))}</span><span class="cli-sub">${esc(t('admin.saasCliIconByFixed'))}</span></div>
            <p class="cli-sub">${esc(t('admin.saasCliIconLogoNote'))}</p></div>
        <div class="cli-grp"><h4>${esc(t('admin.saasCliGrpBackground'))} ${badge('both')}</h4>
            <div class="cli-bgopt" role="radiogroup">${['solid', 'gradient', 'image', 'pattern'].map((k) => `<label><input type="radio" name="cli-bg" value="${k}" data-bgtype><span>${esc(t(`admin.saasCliBg${k.charAt(0).toUpperCase()}${k.slice(1)}`))}</span></label>`).join('')}</div>
            ${colorRow('background.color1', t('admin.saasCliBgColor1'))}${colorRow('background.color2', t('admin.saasCliBgColor2'))}
            <div class="cli-row" id="cli-bg-image-row"><span>${esc(t('admin.saasCliBgImage'))}</span><span class="cli-inline"><span id="cli-bg-thumb"></span><input type="file" id="cli-bg-file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden><button type="button" class="cli-link" id="cli-bg-pick">${esc(t('admin.saasCliBgImageChoose'))}</button><button type="button" class="cli-link" id="cli-bg-reset">${esc(t('admin.saasCliBgImageRemove'))}</button></span></div>
            ${toggleRow('background.diagonal', t('admin.saasCliBgDiagonal'))}</div>
        <div class="cli-grp"><h4>${esc(t('admin.saasCliGrpTexts'))} ${badge('both')}</h4>${toggleRow('texts.greeting', t('admin.saasCliGreeting'))}
            <label class="cli-row"><span>${esc(t('admin.saasCliWelcome'))}</span><input type="text" class="cli-fld" data-p="texts.welcome" maxlength="80"></label>
            <label class="cli-row"><span>${esc(t('admin.saasCliFormTitle'))}</span><input type="text" class="cli-fld" data-p="texts.formTitle" maxlength="40"></label>
            <label class="cli-row"><span>${esc(t('admin.saasCliAppButton'))} ${badge('app')}</span><input type="text" class="cli-fld" data-p="texts.appButton" maxlength="30"></label></div>
        <div class="cli-grp"><h4>${esc(t('admin.saasCliGrpShow'))}</h4>${toggleRow('show.welcomeScreen', t('admin.saasCliShowWelcomeScreen'), 'app')}${toggleRow('show.faceId', t('admin.saasCliShowFaceId'), 'app')}${toggleRow('show.appLink', t('admin.saasCliShowAppLink'), 'web')}${toggleRow('show.language', t('admin.saasCliShowLanguage'))}${toggleRow('show.forgot', t('admin.saasCliShowForgot'))}${toggleRow('show.register', t('admin.saasCliShowRegister'))}${toggleRow('show.social', t('admin.saasCliShowSocial'))}</div>
        <div class="cli-grp" data-help-key="cliKey"><h4>${esc(t('admin.saasCliKey'))}</h4>
            <label class="cli-row"><span>${esc(t('admin.saasCliKey'))}</span><span class="cli-inline"><input type="text" class="cli-fld" id="cli-slug" maxlength="40" spellcheck="false"><button type="button" class="btn btn-secondary sc-mini" id="cli-slug-save">${esc(t('admin.saasCliKeySave'))}</button></span></label>
            <div class="cli-row"><span>${esc(t('admin.saasCliKeyAddress'))}</span><code class="cli-addr" id="cli-address"></code></div>
            <div class="cli-row"><span>${esc(t('admin.saasCliKeyCode'))}</span><code class="cli-addr" id="cli-code"></code></div>
            <p class="cli-sub" id="cli-slug-warn" hidden>${esc(t('admin.saasCliKeyWarn'))}</p></div>
        ${state.can.link ? `<div class="cli-grp" data-help-key="cliLink" id="cli-link-grp"><h4>${esc(t('admin.saasCliLink'))} ${badge('web')}</h4>
            <p class="cli-sub" id="cli-link-state"></p>
            <div class="cli-row"><code class="cli-addr" id="cli-link-url"></code></div>
            <div class="cli-inline cli-linkbtns"><button type="button" class="btn btn-secondary sc-mini" id="cli-link-copy">${esc(t('admin.saasCliLinkCopy'))}</button><button type="button" class="btn btn-secondary sc-mini" id="cli-link-open">${esc(t('admin.saasCliLinkOpen'))}</button><button type="button" class="btn btn-secondary sc-mini" id="cli-link-qr">${esc(t('admin.saasCliLinkQr'))}</button></div>
            <div class="cli-qr" id="cli-qr"></div></div>` : ''}
        </div><div class="cli-prev" id="cli-previews"></div></div>`;
    // se pone lo del borrador en los controles
    syncControls();
    const disabled = !can;
    document.querySelectorAll('#cli-body input, #cli-body button').forEach((el) => { if (el.id === 'cli-slug' || el.id === 'cli-slug-save' || el.id === 'cli-icon-dl' || el.closest('#cli-link-grp')) return; if (disabled) el.disabled = true; });
    const slugInput = $('#cli-slug'); const slugSave = $('#cli-slug-save');
    slugInput.disabled = !state.can.slug; slugSave.disabled = !state.can.slug;
}
function getPath(obj, path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj); }
function setPath(obj, path, value) { const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => o[k], obj)[last] = value; }
function syncControls() {
    const ed = state.editor; const w = ed.work; const p = palette(ed);
    document.querySelectorAll('#cli-body [data-p]').forEach((el) => {
        const v = getPath(w, el.dataset.p);
        if (el.type === 'checkbox') el.checked = !!v; else if (el !== document.activeElement) el.value = v == null ? '' : v;
    });
    document.querySelectorAll('#cli-body [data-color]').forEach((el) => { const path = el.dataset.color; const own = getPath(w, path); el.value = own || ({ 'brand.primary': p.primary, 'brand.button': p.button, 'background.color1': p.color1, 'background.color2': p.color2, 'identity.iconColor': p.primary }[path] || FALLBACK_PRIMARY); el.classList.toggle('cli-company', !own); });
    // nombre abreviado: lo que se propone sale de placeholder, y el contador dice cuántas de las 12 letras lleva
    const short = $('#cli-short');
    short.placeholder = ed.company.suggestedShortName || '';
    $('#cli-short-count').textContent = t('admin.saasCliShortNameCount', { n: Array.from(w.identity.shortName || '').length });
    document.querySelectorAll('#cli-body [data-bgtype]').forEach((el) => { el.checked = el.value === w.background.type; });
    const type = w.background.type;
    $('#cli-bg-image-row').hidden = type !== 'image';
    document.querySelector('#cli-body [data-color="background.color2"]').closest('.cli-row').hidden = type === 'solid' || type === 'image';
    $('#cli-logo-thumb').innerHTML = (w.brand.logo || ed.company.logo) ? `<img src="${esc(w.brand.logo || ed.company.logo)}" alt="" class="cli-thumb">` : '';
    $('#cli-bg-thumb').innerHTML = w.background.image ? `<img src="${esc(w.background.image)}" alt="" class="cli-thumb">` : '';
    $('#cli-slug').value = $('#cli-slug') === document.activeElement ? $('#cli-slug').value : ed.config.slug;
    $('#cli-address').textContent = `${location.origin}/c/${ed.config.slug}`;
    $('#cli-code').textContent = ed.config.slug;
    $('#cli-slug-warn').hidden = !ed.config.published;
}
function readImage(file, maxBytes, onDone) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) { Dashboard.showToast(t('admin.saasCliErr_IMAGE'), 'error'); return; }
    if (file.size > maxBytes) { Dashboard.showToast(t('admin.saasCliErr_IMAGE_SIZE'), 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => onDone(String(reader.result));
    reader.readAsDataURL(file);
}
function bindEditor() {
    const body = document.getElementById('cli-body');
    const touch = () => { syncControls(); renderPreviews(); };
    body.addEventListener('input', (event) => {
        const el = event.target; const ed = state.editor;
        if (el.dataset.p && el.type !== 'checkbox') setPath(ed.work, el.dataset.p, el.value);
        else if (el.dataset.color) setPath(ed.work, el.dataset.color, el.value);
        else if (el.id === 'cli-slug') return;
        else return;
        touch();
    });
    body.addEventListener('change', (event) => {
        const el = event.target; const ed = state.editor;
        if (el.dataset.p && el.type === 'checkbox') setPath(ed.work, el.dataset.p, el.checked);
        else if (el.dataset.bgtype !== undefined) ed.work.background.type = el.value;
        else if (el.id === 'cli-logo-file') { readImage(el.files[0], MAX_LOGO_BYTES, (data) => { ed.work.brand.logo = data; touch(); }); el.value = ''; return; }
        else if (el.id === 'cli-bg-file') { readImage(el.files[0], MAX_IMAGE_BYTES, (data) => { ed.work.background.image = data; ed.work.background.type = 'image'; touch(); }); el.value = ''; return; }
        else return;
        touch();
    });
    body.addEventListener('click', (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;
        const ed = state.editor;
        if (btn.dataset.clear) { setPath(ed.work, btn.dataset.clear, ''); touch(); }
        else if (btn.id === 'cli-logo-pick') $('#cli-logo-file').click();
        else if (btn.id === 'cli-logo-reset') { ed.work.brand.logo = ''; touch(); }
        else if (btn.id === 'cli-bg-pick') $('#cli-bg-file').click();
        else if (btn.id === 'cli-bg-reset') { ed.work.background.image = ''; touch(); }
        else if (btn.id === 'cli-slug-save') saveSlug();
        else if (btn.id === 'cli-icon-dl') downloadIcon();
        else if (btn.id === 'cli-link-copy') copyLink();
        else if (btn.id === 'cli-link-open' && ed.link) window.open(ed.link.url, '_blank', 'noopener');
        else if (btn.id === 'cli-link-qr' && ed.link) downloadQr(ed.link.qrRows, ed.link.slug);
    });
}
// ---- Enlace y QR: la dirección del cliente y su QR (la cuadrícula viene del servidor; aquí solo se dibuja) ----
function qrSvg(rows) {
    const n = rows.length; const quiet = 4; const size = n + quiet * 2;
    let d = '';
    rows.forEach((row, y) => { let x = 0; while (x < n) { if (row[x] === '1') { let end = x; while (end < n && row[end] === '1') end += 1; d += `M${x + quiet} ${y + quiet}h${end - x}v1h-${end - x}z`; x = end; } else x += 1; } });
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
function downloadQr(rows, slug) {
    const n = rows.length; const quiet = 4; const scale = 12; const size = (n + quiet * 2) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#000';
    rows.forEach((row, y) => { for (let x = 0; x < n; x += 1) if (row[x] === '1') ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale); });
    canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `qr-${slug}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
}
async function loadLink() {
    const ed = state.editor;
    if (!ed || !state.can.link || !$('#cli-link-grp')) return;
    try {
        const link = await call('GET', `${API}/${ed.clientId}/link`);
        if (state.editor !== ed) return;
        ed.link = link;
        $('#cli-link-url').textContent = link.url;
        $('#cli-link-state').textContent = t(link.live ? 'admin.saasCliLinkLive' : 'admin.saasCliLinkNotLive');
        $('#cli-qr').innerHTML = qrSvg(link.qrRows);
    } catch (err) {
        $('#cli-link-state').textContent = t('admin.saasCliLinkError');
    }
}
async function copyLink() {
    const url = state.editor && state.editor.link && state.editor.link.url;
    if (!url) return;
    try { await navigator.clipboard.writeText(url); } catch {
        const probe = document.createElement('textarea'); probe.value = url; document.body.appendChild(probe); probe.select();
        try { document.execCommand('copy'); } catch { /* sin portapapeles */ }
        probe.remove();
    }
    Dashboard.showToast(t('admin.saasCliLinkCopied'), 'success');
}
// ---- guardar, publicar, quitar ----
function adopt(detail, keepWork) {
    const ed = state.editor;
    ed.company = detail.company; ed.config = detail.config; ed.reserved = detail.reserved; state.can = { ...state.can, ...detail.can };
    if (!keepWork) { ed.work = clone(detail.config.draft); ed.savedJson = JSON.stringify(detail.config.draft); }
}
async function guarded(fn) {
    const errorEl = $('#cli-error');
    errorEl.hidden = true;
    try { await fn(); } catch (err) {
        errorEl.textContent = explain(err);
        errorEl.hidden = false;
        if (err.body && ['EXISTS', 'NOT_FOUND'].includes(err.body.code)) loadList();
    }
}
async function saveDraft() {
    const ed = state.editor;
    const detail = await call('PUT', `${API}/${ed.clientId}/draft`, { draft: ed.work });
    adopt(detail, false);
    syncControls(); renderPreviews();
}
const doSave = () => guarded(async () => { await saveDraft(); Dashboard.showToast(t('admin.saasCliSaved'), 'success'); loadList(); });
const doPublish = () => guarded(async () => {
    const ed = state.editor;
    if (JSON.stringify(ed.work) !== ed.savedJson) await saveDraft();
    let detail;
    const icon = await renderIconPngs(ed);
    try { detail = await call('POST', `${API}/${ed.clientId}/publish`, { icon }); } catch (err) {
        // El cliente ya cambió su «Mi App» después de lo inicial: publicar sobrescribe sus cambios, así que se pide confirmar.
        if (!(err.body && err.body.code === 'CLIENT_CHANGED')) throw err;
        const confirmFn = (window.Dashboard && window.Dashboard.confirm) || window.confirm;
        if (!(await confirmFn(t('admin.saasCliClientChangedConfirm', { by: err.body.changedBy || '—', date: stamp(err.body.changedAt) })))) return;
        detail = await call('POST', `${API}/${ed.clientId}/publish`, { force: true, icon });
    }
    adopt(detail, false);
    syncControls(); renderPreviews(); loadLink();
    Dashboard.showToast(t('admin.saasCliPublished'), 'success');
    loadList();
});
function saveSlug() {
    guarded(async () => {
        const ed = state.editor;
        const detail = await call('PUT', `${API}/${ed.clientId}/slug`, { slug: $('#cli-slug').value });
        adopt(detail, true);
        syncControls(); renderPreviews(); loadLink();
        Dashboard.showToast(t('admin.saasCliDone'), 'success');
        loadList();
    });
}
function askRemove() {
    const box = $('#cli-remove-box');
    box.hidden = false;
    box.querySelector('p').textContent = t('admin.saasCliRemoveConfirm', { client: state.editor.company.name });
}
const doRemove = () => guarded(async () => {
    const ed = state.editor;
    await call('DELETE', `${API}/${ed.clientId}`);
    Dashboard.showToast(t('admin.saasCliDone'), 'success');
    closeEditor();
    loadList();
});
// ---- abrir y cerrar el editor ----
function closeEditor() {
    state.editor = null;
    document.getElementById('cli-editor').hidden = true;
    document.getElementById('cli-list').hidden = false;
}
async function openEditor(clientId) {
    const listError = document.getElementById('ss-error');
    try {
        let detail = await call('GET', `${API}/${clientId}`);
        if (!detail.config) {
            if (!state.can.edit) return;
            detail = await call('POST', `${API}/${clientId}`, {});
            loadList();
        }
        state.editor = { clientId, company: detail.company, config: detail.config, reserved: detail.reserved, work: clone(detail.config.draft), savedJson: JSON.stringify(detail.config.draft) };
        state.can = { ...state.can, ...detail.can };
    } catch (err) { listError.textContent = explain(err); listError.hidden = false; return; }
    const ed = state.editor;
    const root = document.getElementById('cli-editor');
    root.innerHTML = `<div class="cli-head"><div><button type="button" class="cli-link" id="cli-back">‹ ${esc(t('admin.saasCliBack'))}</button><h3>${esc(t('admin.saasCliTitle', { client: ed.company.name }))}</h3><div id="cli-status" class="cli-statusline"></div></div>
        <div class="cli-actions" data-help-key="cliDraft"><button type="button" class="btn btn-secondary" id="cli-save"${state.can.edit ? '' : ' disabled'}>${esc(t('admin.saasCliSaveDraft'))}</button><button type="button" class="btn" id="cli-publish"${state.can.publish ? '' : ' disabled'}>${esc(t('admin.saasCliPublish'))}</button>${state.can.remove ? `<button type="button" class="btn btn-secondary" id="cli-remove">${esc(t('admin.saasCliRemove'))}</button>` : ''}</div></div>
        <p class="admin-error" id="cli-error" hidden></p>
        <div class="cli-remove" id="cli-remove-box" hidden><p></p><div class="admin-form-actions"><button type="button" class="btn" id="cli-remove-yes">${esc(t('admin.saasCliRemoveYes'))}</button><button type="button" class="btn btn-secondary" id="cli-remove-no">${esc(t('admin.saasCliCancel'))}</button></div></div>
        <div id="cli-body"></div>`;
    document.getElementById('cli-list').hidden = true;
    root.hidden = false;
    buildEditor();
    renderPreviews();
    loadLink();
    document.getElementById('cli-back').addEventListener('click', () => { closeEditor(); loadList(); });
    document.getElementById('cli-save').addEventListener('click', doSave);
    document.getElementById('cli-publish').addEventListener('click', doPublish);
    document.getElementById('cli-remove')?.addEventListener('click', askRemove);
    document.getElementById('cli-remove-yes').addEventListener('click', doRemove);
    document.getElementById('cli-remove-no').addEventListener('click', () => { document.getElementById('cli-remove-box').hidden = true; });
    bindEditor();
}
document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-cli-act]');
    if (!btn) return;
    openEditor(Number(btn.dataset.cliClient));
});
window.addEventListener('beforeunload', (event) => { if (state.editor && JSON.stringify(state.editor.work) !== state.editor.savedJson) { event.preventDefault(); event.returnValue = ''; } });

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-apps-clientes-saas' });
        if (!role) return;
        await loadList();
        document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
        document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);
    } catch (err) {
        console.error('Apps Nuestros Clientes failed to initialize:', err);
    }
})();
})();
