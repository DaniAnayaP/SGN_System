// ---------------------------------------------------------------------------
// Corregir un registro (Operaciones > Limpieza y Temperaturas): la ventanita que abre el lápiz de cada renglón. Es la misma para las dos pantallas: cada una le dice qué campos tiene el registro
// (quién lo hizo, y en Temperaturas lo que marcaba), cuáles puede corregir quien la usa (según el árbol de permisos) y cómo guardar. Aquí solo se muestra la ventana, se revisa lo que se escribió y se
// manda SOLO lo que cambió (así un campo que no se puede corregir nunca se manda). Lo demás -- permisos, autorización del jefe, historial de cambios y la marca «Editado»-- lo hace el servidor.
// Uso: RecordEdit.open({ title, subtitle, fields: [{ key, label, kind: 'text' | 'number', value, enabled, hint }], save: async (patch) => ({ ok: true } | { ok: false, message }) }).
// ---------------------------------------------------------------------------
(function () {
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let overlay = null;
let current = null;

function showError(message) {
    const el = overlay.querySelector('#rec-edit-error');
    el.textContent = message || '';
    el.hidden = !message;
}
function close() {
    if (!overlay) return;
    overlay.hidden = true;
    current = null;
}
function ensure() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `<div class="modal-panel rec-edit-panel" role="dialog" aria-modal="true" aria-labelledby="rec-edit-title">
        <h3 id="rec-edit-title"></h3>
        <p class="tpl-muted" id="rec-edit-sub"></p>
        <div class="rec-edit-fields" id="rec-edit-fields"></div>
        <p class="tpl-muted" id="rec-edit-help"></p>
        <p class="layout-fmt-error" id="rec-edit-error" role="alert" hidden></p>
        <div class="layout-fmt-footer"><span class="layout-fmt-spacer"></span><button type="button" class="btn btn-secondary" id="rec-edit-cancel"></button><button type="button" class="btn" id="rec-edit-ok"></button></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.querySelector('#rec-edit-cancel').addEventListener('click', close);
    overlay.querySelector('#rec-edit-ok').addEventListener('click', submit);
    overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') { event.preventDefault(); submit(); }
    });
}

async function submit() {
    const ctx = current;
    if (!ctx || ctx.busy) return;
    const patch = {};
    for (const f of ctx.fields) {
        if (!f.enabled) continue;
        const input = overlay.querySelector(`#rec-edit-f-${f.key}`);
        const raw = input.value.trim();
        if (f.kind === 'number') {
            const n = raw === '' ? Number.NaN : Number(raw.replace(',', '.'));
            if (!Number.isFinite(n)) { showError(t('main.recEditNumero')); input.focus(); return; }
            if (n !== Number(f.value)) patch[f.key] = n;
        } else {
            const text = raw.replace(/\s+/g, ' ');
            if (!text) { showError(t('main.recEditError_NAME')); input.focus(); return; }
            if (text !== String(f.value === null || f.value === undefined ? '' : f.value)) patch[f.key] = text;
        }
    }
    if (!Object.keys(patch).length) { showError(t('main.recEditNada')); return; }
    showError('');
    ctx.busy = true;
    const ok = overlay.querySelector('#rec-edit-ok');
    ok.disabled = true;
    try {
        const result = await ctx.save(patch);
        if (result && result.ok) close();
        else showError((result && result.message) || Dashboard.t('admin.saveError'));
    } catch (err) {
        console.error('RecordEdit: save failed', err);
        showError(Dashboard.t('admin.saveError'));
    } finally {
        ctx.busy = false;
        ok.disabled = false;
    }
}

function open({ title, subtitle, fields, save }) {
    ensure();
    current = { fields, save, busy: false };
    overlay.querySelector('#rec-edit-title').textContent = title || t('main.recEditTitulo');
    overlay.querySelector('#rec-edit-sub').textContent = subtitle || '';
    overlay.querySelector('#rec-edit-help').textContent = t('main.recEditAyuda');
    overlay.querySelector('#rec-edit-cancel').textContent = t('main.recEditCancelar');
    overlay.querySelector('#rec-edit-ok').textContent = t('main.recEditGuardar');
    overlay.querySelector('#rec-edit-fields').innerHTML = fields.map((f) => `<div class="layout-fl"><label for="rec-edit-f-${esc(f.key)}">${esc(f.label)}
            <input id="rec-edit-f-${esc(f.key)}" name="${esc(f.key)}" type="${f.kind === 'number' ? 'number' : 'text'}"${f.kind === 'number' ? ' step="0.1" inputmode="decimal"' : ' maxlength="60" autocomplete="off"'}
                value="${esc(f.value)}"${f.enabled ? '' : ' disabled'}${f.hint ? ` title="${esc(f.hint)}"` : ''}>
            ${f.hint ? `<span class="rec-edit-hint">${esc(f.hint)}</span>` : ''}</label></div>`).join('');
    showError('');
    overlay.hidden = false;
    const first = overlay.querySelector('input:not([disabled])');
    if (first) { first.focus(); first.select(); }
}

// El texto de un error del servidor al corregir: los que tienen su aviso propio (nombre vacío, temperatura o humedad no válida…) en el idioma de la pantalla; cualquier otro (sin permiso, sesión vencida,
// el registro ya no existe…) como el aviso general de «no se pudo guardar», nunca el texto crudo del servidor.
const KNOWN_ERRORS = new Set(['NAME', 'TEMP', 'HUM', 'NOTEMP', 'NOHUM', 'EMPTY', 'QTY']);
const errorText = (code) => (KNOWN_ERRORS.has(code) ? t(`main.recEditError_${code}`) : Dashboard.t('admin.saveError'));

window.RecordEdit = { open, close, errorText };
})();
