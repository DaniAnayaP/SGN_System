// ---------------------------------------------------------------------------
// TI › Configuración Compañía › Mi App: el cliente ajusta SU app (el inicio de sesión de computadora y celular) desde su propio sistema. SGN la deja armada como INICIAL (Apps Nuestros Clientes) y aquí el administrador del cliente
// cambia la marca, el fondo, los textos y qué se muestra, y PUBLICA directo (sin aprobación de SGN). «Volver a lo inicial» regresa a lo que SGN dejó. Lo que NO cambia el cliente: la clave de la empresa y la identidad de la app (nombre
// abreviado y color del ícono): se ven bloqueadas y para cambiarlas hay «Pedir cambio a SGN». Rutas en server.js (/api/business/mi-app). Es el mismo editor de Admin-AppsClientes.js (SGN) adaptado a un solo cliente: si cambia uno, revisar el otro.
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/mi-app';
const HISTORY_KEY = 'mi-app';
const FALLBACK_PRIMARY = '#3a4bc9';
const MAX_LOGO_BYTES = 350 * 1024;
const MAX_IMAGE_BYTES = 700 * 1024;
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(`#ma-root ${sel}`);
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const stamp = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); };
const clone = (o) => JSON.parse(JSON.stringify(o));
// state: { company, config, canEdit, name, work (borrador de trabajo), savedJson, link }
let state = null;

async function call(method, path, body) {
    const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
function explain(err) {
    const code = err.body && err.body.code;
    for (const key of [`main.ma_${code}`, `main.maErr_${code}`, `admin.saasCliErr_${code}`]) {
        const text = Dashboard.t(key);
        if (text !== key) return text;
    }
    return t('admin.saasCliErr_default');
}
function showError(text) { $('ma-error').textContent = text || ''; $('ma-error').hidden = !text; }

// ---- colores, fondo y vista previa (igual que Admin-AppsClientes.js) ----
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
// ---- el ícono de la app (solo se ve y se baja: la identidad la cambia SGN) ----
function iconIdentity(ed) {
    const id = ed.work.identity || { shortName: '', iconColor: '' };
    return { name: id.shortName || ed.company.suggestedShortName || '', color: id.iconColor || palette(ed).primary, logo: ed.work.brand.logo || ed.company.logo || '' };
}
function iconSvg(ed) {
    const id = iconIdentity(ed);
    const [r, g, b] = hexToRgb(id.color);
    const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62;
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
        <button type="button" class="btn btn-secondary sc-mini" id="ma-icon-dl">${esc(t('admin.saasCliIconDownload'))}</button></div>`;
}
// Opción C (instalar desde la dirección del cliente): al PUBLICAR se dibuja el ícono en PNG de 512 y 192 px y se manda con la publicación (igual que en Admin-AppsClientes.js).
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
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = 1024;
        canvas.getContext('2d').drawImage(img, 0, 0, 1024, 1024);
        canvas.toBlob((blob) => {
            if (!blob) { Dashboard.showToast(t('admin.saasCliIconError'), 'error'); return; }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = `icono-${state.config.slug}.png`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            Dashboard.showToast(t('admin.saasCliIconDownloaded'), 'success');
        }, 'image/png');
    };
    img.onerror = () => Dashboard.showToast(t('admin.saasCliIconError'), 'error');
    img.src = iconUri(state);
}
// ---- enlace y QR ----
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
    try {
        const link = await call('GET', `${API}/link`);
        state.link = link;
        q('#ma-link-url').textContent = link.url;
        q('#ma-link-state').textContent = t(link.live ? 'admin.saasCliLinkLive' : 'admin.saasCliLinkNotLive');
        q('#ma-qr').innerHTML = qrSvg(link.qrRows);
    } catch (err) { q('#ma-link-state').textContent = t('admin.saasCliLinkError'); }
}
async function copyLink() {
    const url = state.link && state.link.url;
    if (!url) return;
    try { await navigator.clipboard.writeText(url); } catch {
        const probe = document.createElement('textarea'); probe.value = url; document.body.appendChild(probe); probe.select();
        try { document.execCommand('copy'); } catch { /* sin portapapeles */ }
        probe.remove();
    }
    Dashboard.showToast(t('admin.saasCliLinkCopied'), 'success');
}

// ---- el encabezado, el estado y los botones ----
const stateChip = (status) => `<span class="exp-chip exp-chip-${{ default: 'cancelled', draft: 'pending', published: 'approved', published_changes: 'negotiating' }[status] || 'cancelled'}">${esc(t(`main.cliState_${status}`))}</span>`;
function renderTitle() {
    const title = state.name ? t('main.maTitle', { name: state.name }) : t('main.maTitleBare');
    const el = $('ma-title'); if (el) { el.removeAttribute('data-i18n'); el.textContent = title; }
    document.title = title;
}
function renderStatus() {
    const c = state.config;
    const dirty = JSON.stringify(state.work) !== state.savedJson;
    const published = c.published ? (c.dirty || dirty ? 'published_changes' : 'published') : 'draft';
    const lines = [];
    lines.push(c.hasInitial && c.initialAt ? t('main.maInitialLine', { date: stamp(c.initialAt) }) : t('main.maNoInitial'));
    if (c.clientChangedAt) lines.push(t('main.maChangedLine', { by: c.clientChangedBy || '—', date: stamp(c.clientChangedAt) }));
    if (dirty) lines.push(t('admin.saasCliUnsaved'));
    $('ma-status').innerHTML = `${stateChip(published)} <span class="cli-sub">${esc(lines.join(' · '))}</span>`;
    const save = $('ma-save'); const pub = $('ma-publish'); const restore = $('ma-restore');
    if (save) save.disabled = !dirty;
    if (pub) pub.disabled = !(dirty || c.dirty || !c.published);
    if (restore) restore.disabled = !c.hasInitial;
}
function renderPreviews() {
    const ed = state;
    const phones = `${ed.work.show.welcomeScreen ? phoneWelcome(ed) : ''}${phoneLogin(ed)}`;
    $('ma-previews').innerHTML = `<div><span class="cli-prev-cap">${esc(t('admin.saasCliPrevWeb'))}</span>${webPreview(ed)}</div><div><span class="cli-prev-cap">${esc(t('admin.saasCliPrevApp'))}</span><div class="cli-phones${ed.work.channels.app ? '' : ' cli-off'}">${phones}</div></div><div><span class="cli-prev-cap">${esc(t('admin.saasCliPrevIcon'))}</span>${iconPreview(ed)}</div>`;
    renderStatus();
}

// ---- los controles ----
const badge = (kind) => `<span class="cli-ch cli-ch-${kind}">${esc(t(`admin.saasCliBadge${kind === 'both' ? 'Both' : (kind === 'app' ? 'App' : 'Web')}`))}</span>`;
function toggleRow(path, label, kind) { return `<label class="cli-row"><span>${esc(label)} ${kind ? badge(kind) : ''}</span><input type="checkbox" data-p="${path}" class="cli-tgl"></label>`; }
function colorRow(path, label) { return `<div class="cli-row"><span>${esc(label)}</span><span class="cli-inline"><input type="color" data-color="${path}"><button type="button" class="cli-link" data-clear="${path}">${esc(t('admin.saasCliColorReset'))}</button></span></div>`; }
function buildEditor() {
    const id = iconIdentity(state);
    $('ma-root').innerHTML = `<div class="cli-head"><div><div id="ma-status" class="cli-statusline"></div>${state.canEdit ? '' : `<p class="cli-sub">${esc(t('main.maViewOnly'))}</p>`}</div>
        <div class="cli-actions"><button type="button" class="btn btn-secondary" id="ma-save">${esc(t('main.maSave'))}</button><button type="button" class="btn" id="ma-publish">${esc(t('main.maPublish'))}</button><button type="button" class="btn btn-secondary" id="ma-restore">${esc(t('main.maRestore'))}</button><button type="button" class="btn btn-secondary" id="ma-history" data-help-key="changeHistory"><i class="bx bx-history" aria-hidden="true"></i> ${esc(t('main.maHistory'))}</button></div></div>
        <div class="cli-ed"><div class="cli-ctrl">
        <div class="cli-grp" data-help-key="cliChannels"><h4>${esc(t('admin.saasCliGrpChannels'))}</h4>${toggleRow('channels.web', t('admin.saasCliUseWeb'))}${toggleRow('channels.app', t('admin.saasCliUseApp'))}</div>
        <div class="cli-grp" data-help-key="cliBrand"><h4>${esc(t('admin.saasCliGrpBrand'))} ${badge('both')}</h4>
            <div class="cli-row"><span>${esc(t('admin.saasCliLogo'))}</span><span class="cli-inline"><span id="ma-logo-thumb"></span><input type="file" id="ma-logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden><button type="button" class="cli-link" id="ma-logo-pick">${esc(t('admin.saasCliLogoChange'))}</button><button type="button" class="cli-link" id="ma-logo-reset">${esc(t('admin.saasCliLogoReset'))}</button></span></div>
            ${colorRow('brand.primary', t('admin.saasCliPrimary'))}${colorRow('brand.button', t('admin.saasCliButton'))}</div>
        <div class="cli-grp" data-help-key="cliIdentity"><h4>${esc(t('admin.saasCliGrpIdentity'))} ${badge('app')}</h4>
            <div class="cli-row"><span>${esc(t('admin.saasCliShortName'))}</span><span class="cli-inline"><span class="cli-addr" id="ma-id-name">${esc(id.name)}</span></span></div>
            <div class="cli-row"><span>${esc(t('admin.saasCliIconColor'))}</span><span class="cli-inline"><span class="cli-thumb" id="ma-id-color" style="background:${esc(id.color)};display:inline-block"></span></span></div>
            <div class="cli-row"><span>${esc(t('admin.saasCliIconBy'))}</span><span class="cli-sub">${esc(t('admin.saasCliIconByFixed'))}</span></div>
            <p class="cli-sub">${esc(t('main.maIdentityLocked'))}</p>
            ${state.canEdit ? `<div class="cli-inline"><button type="button" class="btn btn-secondary sc-mini" id="ma-ask">${esc(t('main.maAskChange'))}</button></div>
            <div id="ma-ask-box" hidden><label class="cli-row"><span>${esc(t('main.maChangeTitle'))}</span></label><textarea id="ma-ask-text" class="cli-fld" rows="3" maxlength="500" placeholder="${esc(t('main.maChangePlaceholder'))}" style="width:100%"></textarea>
                <div class="cli-inline"><button type="button" class="btn sc-mini" id="ma-ask-send">${esc(t('main.maChangeSend'))}</button><button type="button" class="btn btn-secondary sc-mini" id="ma-ask-cancel">${esc(t('main.maChangeCancel'))}</button></div></div>` : ''}</div>
        <div class="cli-grp"><h4>${esc(t('admin.saasCliGrpBackground'))} ${badge('both')}</h4>
            <div class="cli-bgopt" role="radiogroup">${['solid', 'gradient', 'image', 'pattern'].map((k) => `<label><input type="radio" name="ma-bg" value="${k}" data-bgtype><span>${esc(t(`admin.saasCliBg${k.charAt(0).toUpperCase()}${k.slice(1)}`))}</span></label>`).join('')}</div>
            ${colorRow('background.color1', t('admin.saasCliBgColor1'))}${colorRow('background.color2', t('admin.saasCliBgColor2'))}
            <div class="cli-row" id="ma-bg-image-row"><span>${esc(t('admin.saasCliBgImage'))}</span><span class="cli-inline"><span id="ma-bg-thumb"></span><input type="file" id="ma-bg-file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden><button type="button" class="cli-link" id="ma-bg-pick">${esc(t('admin.saasCliBgImageChoose'))}</button><button type="button" class="cli-link" id="ma-bg-reset">${esc(t('admin.saasCliBgImageRemove'))}</button></span></div>
            ${toggleRow('background.diagonal', t('admin.saasCliBgDiagonal'))}</div>
        <div class="cli-grp"><h4>${esc(t('admin.saasCliGrpTexts'))} ${badge('both')}</h4>${toggleRow('texts.greeting', t('admin.saasCliGreeting'))}
            <label class="cli-row"><span>${esc(t('admin.saasCliWelcome'))}</span><input type="text" class="cli-fld" data-p="texts.welcome" maxlength="80"></label>
            <label class="cli-row"><span>${esc(t('admin.saasCliFormTitle'))}</span><input type="text" class="cli-fld" data-p="texts.formTitle" maxlength="40"></label>
            <label class="cli-row"><span>${esc(t('admin.saasCliAppButton'))} ${badge('app')}</span><input type="text" class="cli-fld" data-p="texts.appButton" maxlength="30"></label></div>
        <div class="cli-grp"><h4>${esc(t('admin.saasCliGrpShow'))}</h4>${toggleRow('show.welcomeScreen', t('admin.saasCliShowWelcomeScreen'), 'app')}${toggleRow('show.faceId', t('admin.saasCliShowFaceId'), 'app')}${toggleRow('show.appLink', t('admin.saasCliShowAppLink'), 'web')}${toggleRow('show.language', t('admin.saasCliShowLanguage'))}${toggleRow('show.forgot', t('admin.saasCliShowForgot'))}${toggleRow('show.register', t('admin.saasCliShowRegister'))}${toggleRow('show.social', t('admin.saasCliShowSocial'))}</div>
        <div class="cli-grp" data-help-key="cliLink"><h4>${esc(t('admin.saasCliLink'))} ${badge('web')}</h4>
            <div class="cli-row"><span>${esc(t('admin.saasCliKey'))}</span><code class="cli-addr">${esc(state.config.slug)}</code></div>
            <p class="cli-sub">${esc(t('main.maKeyLocked'))}</p>
            <p class="cli-sub" id="ma-link-state"></p>
            <div class="cli-row"><code class="cli-addr" id="ma-link-url"></code></div>
            <div class="cli-inline cli-linkbtns"><button type="button" class="btn btn-secondary sc-mini" id="ma-link-copy">${esc(t('admin.saasCliLinkCopy'))}</button><button type="button" class="btn btn-secondary sc-mini" id="ma-link-open">${esc(t('admin.saasCliLinkOpen'))}</button><button type="button" class="btn btn-secondary sc-mini" id="ma-link-qr">${esc(t('admin.saasCliLinkQr'))}</button></div>
            <div class="cli-qr" id="ma-qr"></div></div>
        </div><div class="cli-prev" id="ma-previews"></div></div>`;
    syncControls();
    if (!state.canEdit) {
        document.querySelectorAll('#ma-root .cli-ctrl input, #ma-root .cli-ctrl button, #ma-root .cli-ctrl textarea').forEach((el) => { if (!el.closest('[data-help-key="cliLink"]')) el.disabled = true; });
        ['ma-save', 'ma-publish', 'ma-restore'].forEach((id2) => { const el = $(id2); if (el) el.hidden = true; });
    }
}
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
const setPath = (obj, path, value) => { const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => o[k], obj)[last] = value; };
function syncControls() {
    const w = state.work; const p = palette(state);
    document.querySelectorAll('#ma-root [data-p]').forEach((el) => {
        const v = getPath(w, el.dataset.p);
        if (el.type === 'checkbox') el.checked = !!v; else if (el !== document.activeElement) el.value = v == null ? '' : v;
    });
    document.querySelectorAll('#ma-root [data-color]').forEach((el) => { const path = el.dataset.color; const own = getPath(w, path); el.value = own || ({ 'brand.primary': p.primary, 'brand.button': p.button, 'background.color1': p.color1, 'background.color2': p.color2 }[path] || FALLBACK_PRIMARY); el.classList.toggle('cli-company', !own); });
    document.querySelectorAll('#ma-root [data-bgtype]').forEach((el) => { el.checked = el.value === w.background.type; });
    const type = w.background.type;
    $('ma-bg-image-row').hidden = type !== 'image';
    document.querySelector('#ma-root [data-color="background.color2"]').closest('.cli-row').hidden = type === 'solid' || type === 'image';
    $('ma-logo-thumb').innerHTML = (w.brand.logo || state.company.logo) ? `<img src="${esc(w.brand.logo || state.company.logo)}" alt="" class="cli-thumb">` : '';
    $('ma-bg-thumb').innerHTML = w.background.image ? `<img src="${esc(w.background.image)}" alt="" class="cli-thumb">` : '';
    const id = iconIdentity(state);
    $('ma-id-name').textContent = id.name;
    $('ma-id-color').style.background = id.color;
}
function readImage(file, maxBytes, onDone) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) { Dashboard.showToast(t('admin.saasCliErr_IMAGE'), 'error'); return; }
    if (file.size > maxBytes) { Dashboard.showToast(t('admin.saasCliErr_IMAGE_SIZE'), 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => onDone(String(reader.result));
    reader.readAsDataURL(file);
}
function adopt(detail, keepWork) {
    state.company = detail.company; state.config = detail.config; state.canEdit = detail.canEdit; state.name = detail.name;
    if (!keepWork) { state.work = clone(detail.config.draft); state.savedJson = JSON.stringify(detail.config.draft); }
}
async function guarded(fn) {
    showError('');
    try { await fn(); } catch (err) { showError(explain(err)); }
}
async function saveDraft() {
    const detail = await call('PUT', `${API}/draft`, { draft: state.work });
    adopt(detail, false);
    syncControls(); renderPreviews(); renderTitle();
}
const doSave = () => guarded(async () => { await saveDraft(); Dashboard.showToast(t('main.maSaved'), 'success'); });
const doPublish = () => guarded(async () => {
    if (JSON.stringify(state.work) !== state.savedJson) await saveDraft();
    const detail = await call('POST', `${API}/publish`, { icon: await renderIconPngs(state) });
    adopt(detail, false);
    syncControls(); renderPreviews(); loadLink();
    Dashboard.showToast(t('main.maPublishedOk'), 'success');
});
const doRestore = () => guarded(async () => {
    const confirmFn = (window.Dashboard && window.Dashboard.confirm) || window.confirm;
    if (!(await confirmFn(t('main.maRestoreConfirm')))) return;
    const detail = await call('POST', `${API}/restore`, {});
    adopt(detail, false);
    syncControls(); renderPreviews(); loadLink();
    Dashboard.showToast(t('main.maRestored'), 'success');
});
const doAskChange = () => guarded(async () => {
    const out = await call('POST', `${API}/change-request`, { message: $('ma-ask-text').value });
    $('ma-ask-text').value = '';
    $('ma-ask-box').hidden = true;
    Dashboard.showToast(t('main.maChangeSent', { label: out.label || '' }), 'success');
});
function bindEditor() {
    const root = $('ma-root');
    const touch = () => { syncControls(); renderPreviews(); };
    root.addEventListener('input', (event) => {
        const el = event.target;
        if (el.dataset.p && el.type !== 'checkbox') setPath(state.work, el.dataset.p, el.value);
        else if (el.dataset.color) setPath(state.work, el.dataset.color, el.value);
        else return;
        touch();
    });
    root.addEventListener('change', (event) => {
        const el = event.target;
        if (el.dataset.p && el.type === 'checkbox') setPath(state.work, el.dataset.p, el.checked);
        else if (el.dataset.bgtype !== undefined) state.work.background.type = el.value;
        else if (el.id === 'ma-logo-file') { readImage(el.files[0], MAX_LOGO_BYTES, (data) => { state.work.brand.logo = data; touch(); }); el.value = ''; return; }
        else if (el.id === 'ma-bg-file') { readImage(el.files[0], MAX_IMAGE_BYTES, (data) => { state.work.background.image = data; state.work.background.type = 'image'; touch(); }); el.value = ''; return; }
        else return;
        touch();
    });
    root.addEventListener('click', (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;
        if (btn.dataset.clear) { setPath(state.work, btn.dataset.clear, ''); touch(); }
        else if (btn.id === 'ma-logo-pick') $('ma-logo-file').click();
        else if (btn.id === 'ma-logo-reset') { state.work.brand.logo = ''; touch(); }
        else if (btn.id === 'ma-bg-pick') $('ma-bg-file').click();
        else if (btn.id === 'ma-bg-reset') { state.work.background.image = ''; touch(); }
        else if (btn.id === 'ma-save') doSave();
        else if (btn.id === 'ma-publish') doPublish();
        else if (btn.id === 'ma-restore') doRestore();
        else if (btn.id === 'ma-history') Dashboard.openChangeHistory(HISTORY_KEY);
        else if (btn.id === 'ma-ask') { $('ma-ask-box').hidden = false; $('ma-ask-text').focus(); }
        else if (btn.id === 'ma-ask-cancel') $('ma-ask-box').hidden = true;
        else if (btn.id === 'ma-ask-send') doAskChange();
        else if (btn.id === 'ma-icon-dl') downloadIcon();
        else if (btn.id === 'ma-link-copy') copyLink();
        else if (btn.id === 'ma-link-open' && state.link) window.open(state.link.url, '_blank', 'noopener');
        else if (btn.id === 'ma-link-qr' && state.link) downloadQr(state.link.qrRows, state.link.slug);
    });
    window.addEventListener('beforeunload', (event) => { if (state && JSON.stringify(state.work) !== state.savedJson) { event.preventDefault(); event.returnValue = ''; } });
}

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        let detail;
        try { detail = await call('GET', API); } catch (err) {
            showError(err.status === 404 ? t('main.maNoConfig') : t('main.maLoadError'));
            return;
        }
        state = { company: detail.company, config: detail.config, canEdit: detail.canEdit, name: detail.name, work: clone(detail.config.draft), savedJson: JSON.stringify(detail.config.draft), link: null };
        renderTitle();
        buildEditor();
        renderPreviews();
        bindEditor();
        loadLink();
    } catch (err) {
        console.error('Mi App failed to initialize:', err);
        showError(t('main.maLoadError'));
    }
})();
})();
