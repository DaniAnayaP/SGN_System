// ---------------------------------------------------------------------------
// TI › Implementación Inicial › 1 · Contratado (solo consulta): el punto de partida de la implementación. Muestra lo que la compañía contrató (departamentos, áreas, sitios y centros de costo) contra lo que YA USA, el uso por departamento
// y área, y el árbol de accesos contratado (el mismo árbol de Mis Accesos, solo lectura). «En uso» = ya hay algo hecho: sitios y centros ya creados; una pantalla con datos capturados (al menos un cambio en su historial); un área con alguna
// pantalla en uso; un departamento con alguna área en uso. Se vuelve a calcular en cada lectura, así que avanza solo mientras se trabajan los demás niveles. Datos: GET /api/business/implementation/contracted y /implementation (server.js).
// El implementador de SaaS marca este nivel como completo (Servicio a Cliente › Implementaciones).
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/implementation/contracted';
const IMPL_API = '/api/business/implementation';
const $ = (id) => document.getElementById(id);
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const dayOf = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
const shortDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '');
let data = null;
let implementation = null;
let clientName = '';
let tree = null;

async function getJson(path) {
    const res = await fetch(path, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'request failed');
    return body;
}
const pct = (used, total) => (total > 0 ? Math.min(100, Math.round((100 * used) / total)) : 0);
function sbox(label, used, total, ofKey, onlyKey, detail, helpKey) {
    const small = total > 0 ? t(ofKey, { total }) : t(onlyKey);
    return `<div class="impl-sbox"${helpKey ? ` data-help-key="${helpKey}"` : ''}><span class="impl-k">${esc(label)}</span><span class="impl-v">${used} <small>${esc(small)}</small></span>
        <div class="impl-use"><i style="width:${pct(used, total)}%"></i></div><span class="impl-d">${esc(detail || '')}</span></div>`;
}
function summary() {
    const s = data.summary;
    const deptNames = (s.departments.unusedLabelKeys || []).map((key) => t(key));
    const missing = (total, used) => (total > used ? t('main.implMissingToCreate', { n: total - used }) : (total > 0 ? t('main.implAllCreated') : ''));
    return `<div class="impl-sumg">
        ${sbox(t('main.implBoxDepartments'), s.departments.used, s.departments.contracted, 'main.implOfInUse', 'main.implTagUsed', deptNames.length ? t('main.implUnusedList', { names: deptNames.join(', ') }) : '', 'implContractedBoxes')}
        ${sbox(t('main.implBoxAreas'), s.areas.used, s.areas.contracted, 'main.implOfInUse', 'main.implTagUsed', '')}
        ${sbox(t('main.implBoxSites'), s.sites.used, s.sites.contracted, 'main.implOfCreated', 'main.implCreatedOnly', missing(s.sites.contracted, s.sites.used))}
        ${sbox(t('main.implBoxCenters'), s.costCenters.used, s.costCenters.contracted, 'main.implOfCreated', 'main.implCreatedOnly', missing(s.costCenters.contracted, s.costCenters.used))}
    </div>`;
}
const tag = (kind) => `<span class="impl-tag impl-tag-${kind}">${esc(t(`main.implTag_${kind}`))}</span>`;
function usage() {
    const rows = data.departments.map((d) => {
        const deptName = t(d.labelKey);
        const areas = d.areas.map((a) => `<div class="impl-urow impl-urow-area"><span>${esc(t(a.labelKey, a.labelParams || {}))}</span><span class="impl-uw">${a.used ? `<small>${esc(t(a.screensUsed === 1 ? 'main.implScreenWithData' : 'main.implScreensWithData', { n: a.screensUsed }))}</small>` : ''}${a.used ? tag('used') : tag('unused')}</span></div>`).join('');
        return `<div class="impl-urow impl-urow-dept"><span>${esc(deptName)}</span><span class="impl-uw">${tag('contracted')}${d.used ? tag('used') : tag('unused')}</span></div>${areas}`;
    }).join('');
    return `<div class="impl-card" data-help-key="implContractedUsage"><h4>${esc(t('main.implUsageTitle'))}</h4><div class="impl-usage">${rows || `<p class="impl-empty">—</p>`}</div></div>`;
}
function head() {
    const level = implementation && implementation.levels.find((l) => l.key === 'contracted');
    const sub = [data.plan ? t('main.implContractedSub', { plan: data.plan, giro: data.giro || '—' }) : t('main.implNoPlan'),
        level && level.startDate ? `${shortDate(level.startDate)} – ${shortDate(level.endDate)}` : ''].filter(Boolean).join(' · ');
    const tone = level ? { done: 'approved', current: 'negotiating', locked: 'cancelled', na: 'cancelled' }[level.state] : '';
    const pill = level ? `<span class="exp-chip exp-chip-${tone}">${esc(t(`main.implState_${level.state}`))}</span>${level.late ? ` <span class="exp-chip exp-chip-pending">${esc(t('main.implState_late'))}</span>` : ''}` : '';
    return `<div class="impl-head"><div><h3>${esc(t('main.implContractedTitle', { client: clientName }))}</h3><span class="impl-sub">${esc(sub)}</span>${implementation ? `<span class="impl-sub">${esc(implementation.implementer ? t('main.implImplementer', { name: implementation.implementer }) : t('main.implNoImplementer'))}</span>` : ''}</div><div>${pill}</div></div>`;
}
function render() {
    $('impl-root').innerHTML = `${head()}${summary()}${usage()}
        <div class="impl-card" data-help-key="implContractedTree"><h4>${esc(t('main.implTreeTitle'))}</h4>
        <p class="admin-hint perm-tree-legend">
            <span class="perm-tree-status perm-tree-status-enabled"><i class="bx bx-check" aria-hidden="true"></i></span><span>${esc(t('business.accesosLegendPlan'))}</span>
            <span class="perm-tree-status perm-tree-status-extra"><i class="bx bx-plus-circle" aria-hidden="true"></i></span><span>${esc(t('business.accesosLegendAdditional'))}</span>
            <span class="perm-tree-status perm-tree-status-blocked"><i class="bx bx-lock-alt" aria-hidden="true"></i></span><span>${esc(t('business.accesosLegendNotContracted'))}</span>
            <span class="perm-tree-status perm-tree-status-mixed"><i class="bx bx-minus" aria-hidden="true"></i></span><span>${esc(t('business.accesosLegendMixed'))}</span>
        </p><div id="impl-tree"></div></div>`;
}
// El árbol contratado: el mismo de Mis Accesos del administrador (verde = en el plan, amarillo = adicional, bloqueado = lo que existe en su giro y no contrató), pero de la compañía y solo lectura.
async function drawTree() {
    const container = $('impl-tree');
    if (!container || !window.PermissionCostTree) return;
    const order = await fetch('/api/business/permission-order', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const classOverrides = await fetch('/api/business/permission-classifications', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => (d && d.overrides) || null).catch(() => null);
    tree = window.PermissionCostTree.create(container, { order, classOverrides, mode: 'clientTricolor', interactive: false, visibleGrants: data.tree.giroGrants, mainIncluded: true });
    await tree.init(data.tree.planGrants || [], [], data.tree.additionalGrants || []);
}
async function load(quiet, withTree) {
    try {
        const [contracted, impl] = await Promise.all([getJson(API), getJson(IMPL_API)]);
        data = contracted; implementation = impl.implementation; clientName = impl.clientName;
        $('impl-error').hidden = true;
        if (withTree) { render(); await drawTree(); return; }
        // al refrescar solo se vuelven a dibujar el encabezado, el resumen y el uso: el árbol no cambia mientras tanto
        const root = $('impl-root');
        const oldHead = root.querySelector('.impl-head'); const oldSum = root.querySelector('.impl-sumg'); const oldUse = root.querySelector('.impl-card[data-help-key="implContractedUsage"]');
        if (oldHead && oldSum && oldUse) { oldHead.outerHTML = head(); oldSum.outerHTML = summary(); oldUse.outerHTML = usage(); }
    } catch (err) {
        console.error('Implementación Inicial (contratado): failed to load', err);
        if (!quiet) { $('impl-error').textContent = t('main.implLoadError'); $('impl-error').hidden = false; }
    }
}
document.addEventListener('dashboard:language-changed', () => { if (data) load(true, true).catch(() => {}); });
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await load(false, true);
        setInterval(() => { if (!document.hidden) load(true, false); }, 60000); // se actualiza solo mientras avanzan los demás niveles
    } catch (err) {
        console.error('Implementación Inicial (contratado) failed to initialize:', err);
    }
})();
})();
