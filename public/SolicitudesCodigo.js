// ---------------------------------------------------------------------------
// Solicitudes de alta de código: lo que comparten «Pedir alta de código» (cada área) y «Solicitudes de alta de código» (TI): el formulario con los 24 datos (lo que no se sabe se marca «lo llena TI», con fotos), la ventana de detalle con
// su línea del tiempo y relojes, y los ayudantes de tiempos y estatus. window.SolicitudesCodigo. Las rutas están en server.js (/api/business/sku-requests).
// ---------------------------------------------------------------------------
(function (global) {
'use strict';
const API = '/api/business/sku-requests';
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(path, options = {}) {
    const res = await fetch(path, { credentials: 'include', ...options, headers: { ...(options.raw ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(body.message || 'request failed'); err.status = res.status; err.body = body; throw err; }
    return body;
}
const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data || {}) });

// ---- tiempos, estatus y avance ---------------------------------------------------------------------------------------------------------------------
function duration(ms) {
    if (!(ms >= 60000)) return t('main.solDurLessMin');
    const d = Math.floor(ms / 86400000); const h = Math.floor((ms % 86400000) / 3600000); const m = Math.floor((ms % 3600000) / 60000);
    const parts = [];
    if (d) parts.push(t('main.solDurDay', { n: d }));
    if (h) parts.push(t('main.solDurHour', { n: h }));
    if (m && !d) parts.push(t('main.solDurMin', { n: m }));
    return parts.join(' ');
}
const statusChip = (status) => `<span class="sol-chip sol-chip-${esc(status)}">${esc(t(`main.solStatus_${status}`))}</span>`;
const holderText = (holder) => t(`main.solHolder_${holder || 'none'}`);
const progressText = (p) => (p.byTi ? t('main.solProgressTi', { done: p.filled, total: p.total, ti: p.byTi }) : t('main.solProgress', { done: p.filled, total: p.total }));
const dateTime = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX', { dateStyle: 'medium', timeStyle: 'short' }); };

// ---- ventanas ---------------------------------------------------------------------------------------------------------------------------------------
function makeModal(html, { wide = false } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay sol-overlay';
    overlay.innerHTML = `<div class="modal-panel sol-panel${wide ? ' sol-panel-wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    return { overlay, close, $: (sel) => overlay.querySelector(sel) };
}
async function showPhoto(requestId, field, label) {
    try {
        const { url } = await api(`${API}/${requestId}/photo/${field}`);
        const modal = makeModal(`<h3>${esc(label)}</h3><img class="sol-photo-big" src="${esc(url)}" alt="${esc(label)}"><div class="admin-form-actions"><button type="button" class="btn" data-close>${esc(t('main.solClose'))}</button></div>`);
        modal.$('[data-close]').addEventListener('click', modal.close);
    } catch (err) { Dashboard.showToast(t('main.solPhotoError'), 'error'); }
}

// La línea del tiempo: cada paso con su estatus, quién y cuándo, la nota (lo que pidió TI o el motivo) y cuánto duró.
function timelineHtml(request) {
    const events = request.events || [];
    const toMs = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`);
    return `<ol class="sol-timeline">${events.map((e, i) => {
        const end = i + 1 < events.length ? toMs(events[i + 1].at) : (request.closedAt ? toMs(request.closedAt) : Date.now());
        const span = Math.max(0, end - toMs(e.at));
        const closed = e.status === 'created' || e.status === 'rejected';
        return `<li class="sol-step sol-step-${esc(e.holder || 'none')}"><div class="sol-step-head">${statusChip(e.status)}<span class="sol-step-who">${esc(holderText(e.holder))}</span><span class="sol-step-time">${closed ? '' : esc(duration(span))}</span></div>
            <div class="sol-step-meta">${esc(dateTime(e.at))}${e.by ? ` · ${esc(t('main.solStepBy', { by: e.by }))}` : ''}</div>${e.note ? `<div class="sol-step-note">${esc(e.note)}</div>` : ''}</li>`;
    }).join('')}</ol>`;
}
function timesHtml(request) {
    const x = request.times;
    return `<div class="sol-times"><span><b>${esc(t('main.colSolTotal'))}</b> ${esc(duration(x.totalMs))}</span><span><b>${esc(t('main.solRequesterTime'))}</b> ${esc(duration(x.requesterMs))}</span><span><b>${esc(t('main.solTiTime'))}</b> ${esc(duration(x.tiMs))}</span>${x.open ? `<span><b>${esc(t('main.solStageTime'))}</b> ${esc(duration(x.stageMs))}</span>` : ''}</div>`;
}

// ---- el formulario -----------------------------------------------------------------------------------------------------------------------------------
const TEXT_FIELDS = [['upc', 'colArticuloUpc'], ['uniqueDescription', 'colArticuloDescUnica'], ['knownDescription', 'colArticuloDescConocida'], ['customDescription', 'colArticuloDescPersonalizada']];
const NUMBER_FIELDS = [['height', 'colArticuloAlto'], ['length', 'colArticuloLargo'], ['width', 'colArticuloAncho'], ['articleWeight', 'colArticuloPesoArticulo'], ['packageWeight', 'colArticuloPesoEmpaque']];
const PHOTO_FIELDS = [['evidenceFront', 'colArticuloEvidenceFront'], ['evidenceBack', 'colArticuloEvidenceBack'], ['evidenceLeft', 'colArticuloEvidenceLeft'], ['evidenceRight', 'colArticuloEvidenceRight'], ['evidenceTop', 'colArticuloEvidenceTop'], ['evidenceBottom', 'colArticuloEvidenceBottom']];
const CATEGORY_FIELDS = [['categoryInventario', 'colArticuloCategoriaInventario', 'inventario'], ['categoryCompra', 'colArticuloCategoriaCompra', 'compra'], ['categoryAlmacenamiento', 'colArticuloCategoriaAlmacenamiento', 'almacenamiento'],
    ['categoryRotacion', 'colArticuloCategoriaRotacion', 'rotacion'], ['categoryManejo', 'colArticuloCategoriaManejo', 'manejo'], ['categoryRiesgo', 'colArticuloCategoriaRiesgo', 'riesgo'], ['categoryVidautil', 'colArticuloCategoriaVidautil', 'vidautil']];
const OPTIONAL_CATEGORY = ['categoryTipoCodigo', 'colArticuloCategoriaTipoCodigo', 'tipocodigo'];
const REQUIRED_KEYS = [...TEXT_FIELDS.map((f) => f[0]), 'mainUom', 'articleType', ...NUMBER_FIELDS.map((f) => f[0]), ...PHOTO_FIELDS.map((f) => f[0]), ...CATEGORY_FIELDS.map((f) => f[0])];
let catalog = null;
async function loadCatalog() {
    if (catalog) return catalog;
    try {
        const body = await api('/api/business/article-categories-active');
        catalog = { options: body.options || {}, classificationsByInventory: body.classificationsByInventory || {} };
    } catch (err) { catalog = { options: {}, classificationsByInventory: {} }; }
    return catalog;
}
// Abre el formulario. request: la solicitud a completar (sin ella, una nueva para ctx.department/ctx.area). asTi: TI corrigiendo en revisión (sin las casillas «lo llena TI»). onDone(request): al guardar/enviar.
async function openForm({ request = null, ctx = {}, asTi = false, onDone = () => {} }) {
    const cat = await loadCatalog();
    const data = request ? { ...request.data } : {};
    const flagged = new Set(request ? request.tiFields : []);
    const photos = request ? { ...request.photos } : {};
    const files = new Map();
    const field = (key, label, control, required) => `<div class="admin-field sol-field" data-field="${key}"><label for="sol-f-${key}">${esc(label)}</label>${control}${required && !asTi ? `<label class="sol-ti" data-help-key="solLoQueLlenaTi"><input type="checkbox" data-ti="${key}"${flagged.has(key) ? ' checked' : ''}><span>${esc(t('main.solByTi'))}</span></label>` : ''}</div>`;
    const select = (key, items, current) => `<select id="sol-f-${key}" data-key="${key}"><option value="">—</option>${items.map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
    const label = (col) => Dashboard.t(`main.${col}`);
    const optionsOf = (type) => { const list = (cat.options[type] || []).slice(); return list; };
    const typeItems = [['articulo-terminado', 'main.articleTypeFinished'], ['materia-prima', 'main.articleTypeRawMaterial']];
    const sections = [
        [t('main.solSectionData'), [
            ...TEXT_FIELDS.map(([k, col]) => field(k, label(col), `<input id="sol-f-${k}" data-key="${k}" type="text" value="${esc(data[k] || '')}" autocomplete="off"${k === 'uniqueDescription' ? ' data-help-key="solDescripcionUnica"' : ''}>`, k !== 'uniqueDescription')),
            field('mainUom', label('colArticuloUdm'), select('mainUom', optionsOf('udm'), data.mainUom || ''), true),
            field('articleType', label('colArticuloTipo'), `<select id="sol-f-articleType" data-key="articleType"><option value="">—</option>${typeItems.map(([v, key]) => `<option value="${v}"${data.articleType === v ? ' selected' : ''}>${esc(Dashboard.t(key))}</option>`).join('')}</select>`, true),
            `<div class="admin-field sol-field"><label for="sol-f-clientCode">${esc(label('colArticuloCodigoCliente'))}</label><input id="sol-f-clientCode" data-key="clientCode" type="text" value="${esc(data.clientCode || '')}" autocomplete="off"></div>`,
        ]],
        [t('main.solSectionSize'), NUMBER_FIELDS.map(([k, col]) => field(k, label(col), `<input id="sol-f-${k}" data-key="${k}" data-number="1" type="number" min="0" step="any" value="${data[k] ? esc(data[k]) : ''}">`, true))],
        [t('main.solSectionCategories'), [
            ...CATEGORY_FIELDS.map(([k, col, type]) => field(k, label(col), select(k, optionsOf(type), data[k] || ''), true)),
            `<div class="admin-field sol-field"><label for="sol-f-${OPTIONAL_CATEGORY[0]}">${esc(label(OPTIONAL_CATEGORY[1]))}</label>${select(OPTIONAL_CATEGORY[0], optionsOf(OPTIONAL_CATEGORY[2]), data[OPTIONAL_CATEGORY[0]] || '')}</div>`,
        ]],
        [t('main.solSectionPhotos'), PHOTO_FIELDS.map(([k, col]) => field(k, label(col), `<span class="sol-photo-row"><input id="sol-f-${k}" data-photo="${k}" type="file" accept="image/*"><button type="button" class="btn btn-secondary sol-photo-view" data-view="${k}"${photos[k] ? '' : ' hidden'}>${esc(t('main.solPhotoView'))}</button></span>`, true))],
    ];
    const placeHtml = request ? `<p class="admin-hint">${esc(t('main.solFor'))}: <b>${esc(request.areaLabel)}</b>${request.siteCode ? ` · ${esc(request.siteCode)}` : ''}</p>` : `<p class="admin-hint">${esc(t('main.solFor'))}: <b>${esc(ctx.areaLabel || '')}</b></p>
        <div class="sol-place"><div class="admin-field"><label for="sol-site">${esc(t('main.solSite'))}</label><select id="sol-site"><option value="">${esc(t('main.solAllSites'))}</option>${(ctx.sites || []).map((s) => `<option value="${esc(s.code)}">${esc(s.code)}${s.sucursal ? ` - ${esc(s.sucursal)}` : ''}</option>`).join('')}</select></div>
        <div class="admin-field"><label for="sol-center">${esc(t('main.solCenter'))}</label><select id="sol-center" disabled><option value="">${esc(t('main.solAllCenters'))}</option></select></div></div>`;
    const modal = makeModal(`<h3>${esc(request ? t('main.solFormTitleEdit', { label: request.label }) : t('main.solFormTitleNew'))}</h3>${placeHtml}
        <div class="sol-progress" id="sol-progress"></div>
        <form class="sol-form" id="sol-form" autocomplete="off">${sections.map(([title, rows]) => `<fieldset class="sol-section"><legend>${esc(title)}</legend><div class="sol-grid">${rows.join('')}</div></fieldset>`).join('')}</form>
        <p class="admin-error" id="sol-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="sol-save">${esc(t('main.solSave'))}</button>${asTi ? '' : `<button type="button" class="btn btn-secondary" id="sol-send">${esc(t('main.solSaveSend'))}</button>`}<button type="button" class="btn btn-secondary" id="sol-close">${esc(t('main.solClose'))}</button></div>`, { wide: true });
    const form = modal.$('#sol-form');
    const errorEl = modal.$('#sol-error');
    const showError = (text) => { errorEl.textContent = text; errorEl.hidden = !text; };
    const read = () => {
        const out = {}; const ti = [];
        form.querySelectorAll('[data-key]').forEach((el) => { out[el.dataset.key] = el.dataset.number ? (Number(el.value) || 0) : el.value.trim(); });
        form.querySelectorAll('[data-ti]').forEach((el) => { if (el.checked) ti.push(el.dataset.ti); });
        return { data: out, ti };
    };
    // lo marcado «lo llena TI» se cierra y se cuenta aparte; el avance sale de lo lleno + lo marcado
    const refresh = () => {
        const { data: now, ti } = read();
        form.querySelectorAll('[data-ti]').forEach((el) => {
            const key = el.dataset.ti; const input = form.querySelector(`[data-key="${key}"], [data-photo="${key}"]`);
            if (input) { input.disabled = el.checked; if (el.checked && input.dataset.key) input.value = ''; }
        });
        let filled = 0; let byTi = 0;
        REQUIRED_KEYS.forEach((key) => {
            const isPhoto = PHOTO_FIELDS.some((f) => f[0] === key);
            const has = isPhoto ? (photos[key] || files.has(key)) : (now[key] !== '' && now[key] !== 0 && now[key] !== undefined);
            if (has) filled += 1; else if (ti.includes(key)) byTi += 1;
        });
        modal.$('#sol-progress').textContent = progressText({ total: REQUIRED_KEYS.length, filled, byTi });
    };
    form.addEventListener('input', refresh);
    form.addEventListener('change', (event) => {
        const photo = event.target.dataset && event.target.dataset.photo;
        if (photo) { if (event.target.files[0]) files.set(photo, event.target.files[0]); else files.delete(photo); }
        refresh();
    });
    form.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => showPhoto(request.id, btn.dataset.view, label(PHOTO_FIELDS.find((f) => f[0] === btn.dataset.view)[1]))));
    const siteSel = modal.$('#sol-site'); const centerSel = modal.$('#sol-center');
    if (siteSel) siteSel.addEventListener('change', () => {
        const site = (ctx.sites || []).find((s) => s.code === siteSel.value);
        centerSel.innerHTML = `<option value="">${esc(t('main.solAllCenters'))}</option>${(site ? site.centers : []).map((c) => `<option value="${c.id}">${esc(c.code)} · ${esc(c.name)}</option>`).join('')}`;
        centerSel.disabled = !site || site.centers.length < 2;
    });
    refresh();
    modal.$('#sol-close').addEventListener('click', modal.close);
    const run = async (send) => {
        showError('');
        const { data: now, ti } = read();
        if (!now.uniqueDescription) { showError(t('main.solNeedDescription')); return; }
        const buttons = [modal.$('#sol-save'), modal.$('#sol-send')].filter(Boolean);
        buttons.forEach((b) => { b.disabled = true; });
        try {
            let saved;
            const payload = { data: now, tiFields: asTi ? null : ti };
            if (asTi) delete payload.tiFields;
            if (request) {
                saved = (await api(`${API}/${request.id}${asTi ? '?view=ti' : ''}`, { method: 'PATCH', body: JSON.stringify(payload) })).request;
            } else {
                saved = (await post(API, { department: ctx.department, area: ctx.area, siteCode: siteSel ? siteSel.value : '', costCenterId: centerSel && centerSel.value ? Number(centerSel.value) : 0, ...payload })).request;
            }
            for (const [key, file] of files) {
                const res = await fetch(`${API}/${saved.id}/photo/${key}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file });
                if (!res.ok) { const body = await res.json().catch(() => ({})); throw Object.assign(new Error(body.message || t('main.solPhotoError')), { body }); }
            }
            if (send) saved = (await post(`${API}/${saved.id}/submit`)).request;
            else saved = (await api(`${API}/${saved.id}${asTi ? '?view=ti' : ''}`)).request;
            Dashboard.showToast(t(send ? 'main.solSent' : 'main.solSaved'), 'success');
            modal.close();
            onDone(saved);
        } catch (err) {
            const body = err.body || {};
            if (body.code === 'DESCRIPTION_TAKEN') showError(t('main.solDescTaken', { owner: body.owner || '' }));
            else if (body.code === 'INCOMPLETE') showError(t('main.solMissing', { n: (body.missing || []).length }));
            else showError(err.message || t('main.solSaveError'));
            buttons.forEach((b) => { b.disabled = false; });
        }
    };
    modal.$('#sol-save').addEventListener('click', () => run(false));
    const sendBtn = modal.$('#sol-send');
    if (sendBtn) sendBtn.addEventListener('click', () => run(true));
}

// ---- el detalle ------------------------------------------------------------------------------------------------------------------------------------
// actions: [{ label, className, onClick(request, close) }] se muestran abajo (para TI: tomar en revisión, pedir datos, rechazar, crear código; para quien pidió: completar).
function openDetail(request, { actions = [] } = {}) {
    const labelOf = (col) => Dashboard.t(`main.${col}`);
    const dataRows = [...TEXT_FIELDS.map(([k, c]) => [k, c]), ['mainUom', 'colArticuloUdm'], ['articleType', 'colArticuloTipo'], ...NUMBER_FIELDS, ...CATEGORY_FIELDS.map(([k, c]) => [k, c]), [OPTIONAL_CATEGORY[0], OPTIONAL_CATEGORY[1]], ['clientCode', 'colArticuloCodigoCliente']]
        .map(([k, col]) => {
            const v = request.data[k];
            const byTi = request.tiFields.includes(k) && !(v !== '' && v !== 0 && v !== undefined && v !== null);
            return `<tr><th>${esc(labelOf(col))}</th><td>${byTi ? `<i class="sol-by-ti">${esc(t('main.solByTi'))}</i>` : (v !== '' && v !== 0 && v !== undefined && v !== null ? esc(k === 'articleType' ? Dashboard.t(v === 'materia-prima' ? 'main.articleTypeRawMaterial' : 'main.articleTypeFinished') : v) : '—')}</td></tr>`;
        });
    const photoRows = PHOTO_FIELDS.map(([k, col]) => `<tr><th>${esc(labelOf(col))}</th><td>${request.photos[k] ? `<button type="button" class="btn btn-secondary sol-photo-view" data-view="${k}">${esc(t('main.solPhotoView'))}</button>` : (request.tiFields.includes(k) ? `<i class="sol-by-ti">${esc(t('main.solByTi'))}</i>` : '—')}</td></tr>`);
    const modal = makeModal(`<div class="sol-detail-head"><h3>${esc(request.label)} · ${esc(request.uniqueDescription)}</h3><div>${statusChip(request.status)} <span class="sol-holder">${esc(t('main.colSolEnManos'))}: <b>${esc(holderText(request.holder))}</b></span></div></div>
        <p class="admin-hint">${esc(request.areaLabel)}${request.siteCode ? ` · ${esc(request.siteCode)}` : ''}${request.costCenterName ? ` · ${esc(request.costCenterName)}` : ''} · ${esc(request.requestedBy)}${request.sku ? ` · ${esc(t('main.solSkuCreated', { sku: request.sku }))}` : ''}</p>
        ${request.tiNote ? `<div class="sol-note"><b>${esc(t('main.solNote'))}:</b> ${esc(request.tiNote)}</div>` : ''}
        <div class="sol-progress">${esc(progressText(request.progress))}</div>${timesHtml(request)}
        <div class="sol-detail-cols"><div><table class="sol-data">${dataRows.join('')}${photoRows.join('')}</table></div><div><h4>${esc(t('main.solTimeline'))}</h4>${timelineHtml(request)}</div></div>
        <div class="admin-form-actions" id="sol-actions"></div>`, { wide: true });
    modal.overlay.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => showPhoto(request.id, btn.dataset.view, labelOf(PHOTO_FIELDS.find((f) => f[0] === btn.dataset.view)[1]))));
    const bar = modal.$('#sol-actions');
    actions.forEach((a) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = a.className || 'btn';
        btn.textContent = a.label;
        btn.addEventListener('click', () => a.onClick(request, modal.close));
        bar.appendChild(btn);
    });
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-secondary';
    closeBtn.textContent = t('main.solClose');
    closeBtn.addEventListener('click', modal.close);
    bar.appendChild(closeBtn);
}
// Pide un texto (lo que se necesita o el motivo del rechazo) y lo manda a la acción.
function askText({ title, confirm, onConfirm }) {
    const modal = makeModal(`<h3>${esc(title)}</h3><textarea id="sol-ask" rows="4" maxlength="600" style="width:100%"></textarea><p class="admin-error" id="sol-ask-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="sol-ask-ok">${esc(confirm || t('main.solConfirm'))}</button><button type="button" class="btn btn-secondary" id="sol-ask-close">${esc(t('main.solClose'))}</button></div>`);
    modal.$('#sol-ask-close').addEventListener('click', modal.close);
    modal.$('#sol-ask').focus();
    modal.$('#sol-ask-ok').addEventListener('click', async () => {
        const text = modal.$('#sol-ask').value.trim();
        const errorEl = modal.$('#sol-ask-error');
        if (!text) { errorEl.textContent = title; errorEl.hidden = false; return; }
        try { await onConfirm(text); modal.close(); } catch (err) { errorEl.textContent = err.message || t('main.solActionError'); errorEl.hidden = false; }
    });
}

global.SolicitudesCodigo = { API, api, post, duration, statusChip, holderText, progressText, dateTime, openForm, openDetail, askText, esc, t };
})(window);
