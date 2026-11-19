// ---------------------------------------------------------------------------
// TI › Configuración Compañía › Configuración de botones: los valores por defecto de TODA la compañía para lo que cada persona configura en «Configuración de botones» del engrane: Botón Salir, Departamento, Área, Centros de Costo y
// Tamaño del Sistema. Lo que cada persona ya eligió sigue mandando; lo de la compañía vale para quien todavía no eligió (se aplica en su próxima entrada). «Sin valor» = la compañía no fija ese ajuste.
// Solo el administrador del cliente cambia estos valores; cada cambio queda en el historial (tabla «config-botones»). Rutas en server.js (/api/business/button-defaults).
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/button-defaults';
const HISTORY_KEY = 'config-botones';
const UI_SCALE_LEVELS = [70, 80, 90, 100, 110, 120, 130, 140]; // los mismos 8 tamaños de Dashboard.js (el 4 es «Ideal»)
const IDEAL_LEVEL = 4;
const $ = (id) => document.getElementById(id);
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let state = null; // { defaults, canEdit, options }

function option(value, label, selected) {
    return `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
}
function renderSelects() {
    const d = state.defaults;
    $('cb-logout').innerHTML = option('', t('main.cbNoValue'), !d.logoutMode) + ['confirm', 'direct'].map((m) => option(m, t(m === 'direct' ? 'main.logoutModeDirect' : 'main.logoutModeConfirm'), d.logoutMode === m)).join('');
    $('cb-scale').innerHTML = option('', t('main.cbNoValue'), !d.uiScale) + UI_SCALE_LEVELS.map((pct, i) => option(i + 1, i + 1 === IDEAL_LEVEL ? `${pct}% · ${t('main.uiScaleIdeal')}` : `${pct}%`, d.uiScale === i + 1)).join('');
    const deptLabel = (key) => { const dept = (Dashboard.DEPARTMENTS || []).find((x) => x.key === key); return dept ? t(dept.labelKey) : key; };
    $('cb-dept').innerHTML = option('', t('main.cbNoValue'), !d.department) + state.options.departments.map((key) => option(key, deptLabel(key), d.department === key)).join('');
    renderAreas(d.department, d.area);
}
function renderAreas(department, selected) {
    const areas = department ? (state.options.areas[department] || []) : [];
    $('cb-area').innerHTML = option('', t('main.cbNoValue'), !selected) + areas.map((a) => option(a.id, t(a.labelKey, a.labelParams || {}), selected === a.id)).join('');
    $('cb-area').disabled = !department || !state.canEdit;
}
function renderCenters() {
    const d = state.defaults;
    const all = d.costCenters === 'all';
    const picked = new Set(all ? [] : d.costCenters);
    const box = $('cb-centers');
    box.innerHTML = `<label class="cb-center cb-center-all"><input type="checkbox" id="cb-centers-all"${all ? ' checked' : ''}><span>${esc(t('main.cbAllCenters'))}</span></label>`
        + state.options.costCenters.map((cc) => `<label class="cb-center"><input type="checkbox" data-center="${cc.id}"${picked.has(cc.id) ? ' checked' : ''}${all ? ' disabled' : ''}><span>${esc(cc.siteCode ? `${cc.siteCode} · ` : '')}${esc(cc.name || cc.code)}</span></label>`).join('');
    box.querySelectorAll('input').forEach((el) => { if (!state.canEdit) el.disabled = true; });
    $('cb-centers-all').addEventListener('change', () => {
        const allOn = $('cb-centers-all').checked;
        box.querySelectorAll('[data-center]').forEach((el) => { el.disabled = allOn || !state.canEdit; if (allOn) el.checked = false; });
    });
}
function readForm() {
    const allCenters = $('cb-centers-all').checked;
    const centers = [...$('cb-centers').querySelectorAll('[data-center]:checked')].map((el) => Number(el.dataset.center));
    return {
        logoutMode: $('cb-logout').value,
        uiScale: $('cb-scale').value ? Number($('cb-scale').value) : 0,
        department: $('cb-dept').value,
        area: $('cb-dept').value ? $('cb-area').value : '',
        costCenters: allCenters || !centers.length ? 'all' : centers,
    };
}
function showError(text) { $('cb-error').textContent = text; $('cb-error').hidden = !text; }
const SERVER_ERRORS = { DEPARTMENT: 'main.cbErrDepartment', AREA: 'main.cbErrArea', COST_CENTERS: 'main.cbErrCenters', UI_SCALE: 'main.cbErrScale', LOGOUT: 'main.cbErrLogout' };

async function load() {
    const res = await fetch(API, { credentials: 'include' });
    if (!res.ok) throw new Error('load failed');
    state = await res.json();
    renderSelects();
    renderCenters();
    const editable = state.canEdit;
    ['cb-logout', 'cb-scale', 'cb-dept'].forEach((id) => { $(id).disabled = !editable; });
    $('cb-save').hidden = !editable;
}
async function save() {
    showError('');
    $('cb-save-status').textContent = '';
    $('cb-save').disabled = true;
    try {
        const res = await fetch(API, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(readForm()) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { showError(SERVER_ERRORS[body.code] ? t(SERVER_ERRORS[body.code]) : (res.status === 403 ? t('main.cbErrForbidden') : t('main.cbSaveError'))); return; }
        state = body;
        renderSelects();
        renderCenters();
        ['cb-logout', 'cb-scale', 'cb-dept'].forEach((id) => { $(id).disabled = !state.canEdit; });
        $('cb-save-status').textContent = t('main.cbSaved');
    } catch (err) {
        console.error('Configuración de botones: no se pudo guardar', err);
        showError(t('main.cbSaveError'));
    } finally {
        $('cb-save').disabled = false;
    }
}

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await load();
        $('cb-dept').addEventListener('change', () => renderAreas($('cb-dept').value, ''));
        $('cb-save').addEventListener('click', save);
        $('cb-history').addEventListener('click', () => Dashboard.openChangeHistory(HISTORY_KEY));
    } catch (err) {
        console.error('Configuración de botones failed to initialize:', err);
        showError(t('main.cbLoadError'));
    }
})();
})();
