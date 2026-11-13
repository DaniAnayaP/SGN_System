// ---------------------------------------------------------------------------
// Mantenimiento de activos: lo que comparten Operaciones > Mtto. de activos > Preventivo y Correctivo y Gestión > Activos.
//   - Estados con el DÍA DE QUIEN MIRA (el servidor usa las mismas reglas en programState y para los avisos): Al corriente, Por vencer (7 días o menos) y Vencido.
//   - El chip de Gestión > Activos (columna Mantenimiento, solo lectura): Fuera de servicio · falla abierta, Falla abierta, Preventivo vencido, Preventivo por vencer, Al corriente; un activo sin programas ni fallas no muestra nada.
//   - Ventanas de captura (dialog) con campos, un selector de fotos (hasta 3, reducidas aquí antes de subirlas) y el visor de fotos.
// ---------------------------------------------------------------------------
(function () {
const SOON_DAYS = 7;
const MAX_PHOTO_SIDE = 1280;
const pad = (n) => String(n).padStart(2, '0');
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayNumber = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const localeOf = () => ((Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es')) === 'en' ? 'en-US' : 'es-MX');
function dateText(iso) {
    if (!DAY_RE.test(iso || '')) return '';
    const d = new Date(`${iso}T00:00:00Z`);
    const mon = new Intl.DateTimeFormat(localeOf(), { timeZone: 'UTC', month: 'short' }).format(d).replace('.', '');
    return `${pad(d.getUTCDate())} ${mon} ${d.getUTCFullYear()}`;
}
// { key: 'ok' | 'soon' | 'overdue' | 'none', daysLeft } de la próxima fecha de un programa
function programState(nextOn) {
    if (!DAY_RE.test(nextOn || '')) return { key: 'none', daysLeft: null };
    const daysLeft = dayNumber(nextOn) - dayNumber(today());
    return { key: daysLeft < 0 ? 'overdue' : (daysLeft <= SOON_DAYS ? 'soon' : 'ok'), daysLeft };
}
const CHIP_CLASS = { ok: 'valid', soon: 'soon', overdue: 'expired', bad: 'failed', none: 'none', inactive: 'none', open: 'failed', repair: 'soon', closed: 'valid', high: 'failed', medium: 'soon', low: 'none' };
function chip(kind, text, title) {
    const span = document.createElement('span');
    span.className = `cal-chip cal-chip-${CHIP_CLASS[kind] || 'none'}`;
    span.textContent = text;
    if (title) span.title = title;
    return span;
}
// El estado de un programa como chip: «Al corriente · 122 días», «Por vencer · 7 días», «Vencido · hace 3 días», «Desactivado».
function programChip(program, st) {
    if (program.status === 'inactive') return chip('inactive', t('main.mtState_inactive'));
    const state = st || programState(program.nextOn);
    const n = state.daysLeft === null ? 0 : Math.abs(state.daysLeft);
    const plural = n === 1 ? '1' : '';
    let text = t(`main.mtChip_${state.key}${plural}`, { n });
    if (state.key === 'soon' && state.daysLeft === 0) text = t('main.mtChip_today');
    return chip(state.key, text, t('main.mtChipTip', { date: dateText(program.nextOn) }));
}
// La columna Mantenimiento de Gestión > Activos: summary = { programs, nextOn, openFaults, down } o null.
function summaryChip(summary) {
    if (!summary) return null;
    if (summary.down > 0) return chip('bad', t('main.mtSum_down'));
    if (summary.openFaults > 0) return chip('bad', t('main.mtSum_fault'));
    if (summary.programs > 0 && summary.nextOn) {
        const st = programState(summary.nextOn);
        if (st.key === 'overdue') return chip('bad', t('main.mtSum_overdue'), t('main.mtChipTip', { date: dateText(summary.nextOn) }));
        if (st.key === 'soon') return chip('soon', t('main.mtSum_soon'), t('main.mtChipTip', { date: dateText(summary.nextOn) }));
        return chip('ok', t('main.mtSum_ok'), t('main.mtChipTip', { date: dateText(summary.nextOn) }));
    }
    return null;
}

// ---- fotos ------------------------------------------------------------------------------------------------------------------------------------------------
const photoUrl = (kind, id, n) => `/api/business/maintenance/photos/${kind}/${id}/${n}`;
// La foto se reduce aquí (lado más largo 1280 px) y se manda como JPEG: el servidor guarda hasta 700 KB.
async function reducePhoto(file) {
    if (!file || !/^image\//i.test(file.type || '')) throw new Error('type');
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_PHOTO_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    let quality = 0.82;
    let blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', quality));
    while (blob && blob.size > 650 * 1024 && quality > 0.4) { quality -= 0.1; blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', quality)); }
    if (!blob) throw new Error('encode');
    return blob;
}
// Sube las fotos (File[]) de un registro; devuelve cuántas no se pudieron subir.
async function uploadPhotos(kind, refId, files, startAt = 1) {
    let failed = 0;
    for (let i = 0; i < files.length; i += 1) {
        try {
            const blob = await reducePhoto(files[i]);
            const res = await fetch(photoUrl(kind, refId, startAt + i), { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, credentials: 'include', body: blob });
            if (!res.ok) failed += 1;
        } catch (err) { failed += 1; }
    }
    return failed;
}
function openPhotoViewer(urls, startAt = 0) {
    if (!urls.length) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const panel = document.createElement('div');
    panel.className = 'modal-panel mt-viewer';
    const img = document.createElement('img');
    const bar = document.createElement('div');
    bar.className = 'admin-form-actions';
    let at = Math.min(Math.max(0, startAt), urls.length - 1);
    const show = () => { img.src = urls[at]; counter.textContent = `${at + 1} / ${urls.length}`; };
    const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'btn btn-secondary'; prev.innerHTML = '<i class="bx bx-chevron-left" aria-hidden="true"></i>';
    const next = document.createElement('button'); next.type = 'button'; next.className = 'btn btn-secondary'; next.innerHTML = '<i class="bx bx-chevron-right" aria-hidden="true"></i>';
    const counter = document.createElement('span'); counter.className = 'admin-hint';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn'; close.textContent = t('main.mtClose');
    prev.addEventListener('click', () => { at = (at + urls.length - 1) % urls.length; show(); });
    next.addEventListener('click', () => { at = (at + 1) % urls.length; show(); });
    bar.append(prev, counter, next, close);
    panel.append(img, bar);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const onKey = (event) => { if (event.key === 'Escape') shut(); };
    const shut = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) shut(); });
    close.addEventListener('click', shut);
    show();
}
// Selector de fotos (hasta max): un botón y las miniaturas elegidas (con su quitar). files() = lo elegido.
function photoPicker(max) {
    const wrap = document.createElement('div');
    wrap.className = 'mt-photos';
    const chosen = [];
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true;
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'btn btn-secondary mt-photo-add';
    add.innerHTML = `<i class="bx bx-camera" aria-hidden="true"></i> <span>${t('main.mtPhotoAdd')}</span>`;
    const hint = document.createElement('small'); hint.className = 'admin-hint';
    const draw = () => {
        wrap.querySelectorAll('.mt-photo').forEach((n) => n.remove());
        chosen.forEach((file, i) => {
            const box = document.createElement('span'); box.className = 'mt-photo';
            const img = document.createElement('img'); img.alt = file.name;
            const reader = new FileReader(); reader.onload = () => { img.src = String(reader.result); }; reader.readAsDataURL(file);
            const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'mt-photo-rm'; rm.setAttribute('aria-label', t('main.mtPhotoRemove')); rm.textContent = '✕';
            rm.addEventListener('click', () => { chosen.splice(i, 1); draw(); });
            box.append(img, rm);
            wrap.insertBefore(box, add);
        });
        add.hidden = chosen.length >= max;
        hint.textContent = t('main.mtPhotoCount', { n: chosen.length, max });
    };
    add.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
        Array.from(input.files || []).forEach((f) => { if (chosen.length < max && /^image\//i.test(f.type)) chosen.push(f); });
        input.value = '';
        draw();
    });
    wrap.append(add, input, hint);
    draw();
    return { el: wrap, files: () => chosen.slice() };
}

// ---- ventanas de captura -----------------------------------------------------------------------------------------------------------------------------------
// fields: [{ name, label, type: 'text' | 'number' | 'date' | 'select' | 'static' | 'photos', value, options: [{ value, label }], full, hint, list: [textos], required, maxLength, min, max, step }]
// onSubmit(values, api) devuelve true cuando se guardó (se cierra) o false/lanza para dejar abierta; api = { setError, get, set, close, photos }.
function dialog({ title, subtitle, fields, saveLabel, cancelLabel, onSubmit, onInput }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.style.maxWidth = '42rem';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const h = document.createElement('h3'); h.textContent = title;
    panel.appendChild(h);
    if (subtitle) { const p = document.createElement('p'); p.className = 'admin-hint'; p.textContent = subtitle; panel.appendChild(p); }
    const form = document.createElement('form');
    form.className = 'admin-form'; form.noValidate = true;
    const grid = document.createElement('div'); grid.className = 'admin-form-grid';
    const controls = {};
    let photoPick = null;
    let uid = 0;
    fields.forEach((f) => {
        const field = document.createElement('div');
        field.className = `admin-field${f.full ? ' admin-field-full' : ''}`;
        const id = `mt-f-${Date.now()}-${uid += 1}`;
        const label = document.createElement('label'); label.textContent = f.label; label.setAttribute('for', id);
        field.appendChild(label);
        let control;
        if (f.type === 'select') {
            control = document.createElement('select');
            (f.options || []).forEach((o) => { const opt = document.createElement('option'); opt.value = String(o.value); opt.textContent = o.label; control.appendChild(opt); });
            if (f.value !== undefined && f.value !== null) control.value = String(f.value);
        } else if (f.type === 'static') {
            control = document.createElement('input'); control.type = 'text'; control.readOnly = true; control.value = f.value == null ? '' : String(f.value); control.className = 'mt-static';
        } else if (f.type === 'photos') {
            photoPick = photoPicker(f.max || 3);
            control = photoPick.el;
        } else {
            control = document.createElement('input');
            control.type = f.type || 'text';
            if (f.type === 'number') { control.min = f.min !== undefined ? String(f.min) : '0'; if (f.max !== undefined) control.max = String(f.max); control.step = f.step || '1'; }
            if (f.maxLength) control.maxLength = f.maxLength;
            control.autocomplete = 'off';
            control.value = f.value === undefined || f.value === null ? '' : String(f.value);
            if (f.list && f.list.length) {
                const dl = document.createElement('datalist'); dl.id = `${id}-l`;
                f.list.forEach((v) => { const o = document.createElement('option'); o.value = v; dl.appendChild(o); });
                control.setAttribute('list', dl.id);
                field.appendChild(dl);
            }
        }
        if (f.type !== 'photos') { control.id = id; control.name = f.name; }
        controls[f.name] = control;
        field.appendChild(control);
        if (f.hint) { const hint = document.createElement('small'); hint.className = 'admin-hint'; hint.textContent = f.hint; field.appendChild(hint); }
        grid.appendChild(field);
        if (f.type !== 'photos' && onInput) control.addEventListener('input', () => onInput(f.name, api));
        if (f.type === 'select' && onInput) control.addEventListener('change', () => onInput(f.name, api));
    });
    form.appendChild(grid);
    const err = document.createElement('div'); err.className = 'admin-error'; err.setAttribute('role', 'alert'); err.hidden = true;
    const actions = document.createElement('div'); actions.className = 'admin-form-actions';
    const save = document.createElement('button'); save.type = 'submit'; save.className = 'btn'; save.textContent = saveLabel || t('admin.save');
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-secondary'; cancel.textContent = cancelLabel || t('admin.cancel');
    actions.append(save, cancel);
    form.append(err, actions);
    panel.appendChild(form);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    cancel.addEventListener('click', close);
    const api = {
        setError: (message) => { err.textContent = message || ''; err.hidden = !message; },
        get: (name) => (controls[name] ? controls[name].value : ''),
        set: (name, value) => { if (controls[name]) controls[name].value = value; },
        close, photos: () => (photoPick ? photoPick.files() : []),
    };
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        api.setError('');
        save.disabled = true;
        try {
            const values = {};
            Object.keys(controls).forEach((name) => { const c = controls[name]; if (c && 'value' in c) values[name] = typeof c.value === 'string' ? c.value.trim() : c.value; });
            const done = await onSubmit(values, api);
            if (done) close();
        } catch (e) {
            api.setError(e && e.message ? e.message : t('admin.saveError'));
        } finally { save.disabled = false; }
    });
    const first = fields.findIndex((f) => !['static', 'photos'].includes(f.type));
    if (first >= 0) controls[fields[first].name].focus();
    return api;
}
// POST/PATCH JSON con el manejo de errores de siempre: devuelve el cuerpo o lanza Error(mensaje del servidor).
async function sendJson(method, url, body) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(json.message || t('admin.saveError')); e.status = res.status; e.code = json.code; throw e; }
    return json;
}
window.AssetMaintenance = { SOON_DAYS, today, dateText, programState, chip, programChip, summaryChip, photoUrl, uploadPhotos, openPhotoViewer, photoPicker, dialog, sendJson, t };
})();
