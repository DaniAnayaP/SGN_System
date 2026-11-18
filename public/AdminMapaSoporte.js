// ---------------------------------------------------------------------------
// TI > Operaciones TI > Admin > Mapa de soporte: los ajustes de Soporte de la empresa, en cuatro grupos. Cada grupo se edita con su hoja del árbol (colMsPrioridades, colMsImpactos, colMsNiveles, colMsReglas):
//   · Prioridades: 1ª respuesta, Resolver en y «Puede esperar si lo que haces termina en» de las 4 prioridades (en minutos), y si se puede pausar un caso para atender uno Urgente.
//   · Impactos: lo que se le pregunta al usuario (riesgo operativo, costos…), editable. La matriz urgencia × importancia es fija y solo se muestra.
//   · Niveles: quién atiende el Nivel 1, 2 y 3 (el 2 y el 3 se pueden apagar; el 1 siempre se usa porque es el dueño del caso; el 0 y el 4 son fijos).
//   · Reglas del caso: calificaciones, revisión de accesos, cierre por la Mesa de ayuda, avisos al jefe directo, invitar al chat y el plazo para confirmar un aviso.
// Cada cambio se manda solo (PATCH /api/business/support-map con el campo que cambió); si la persona solo puede pedirlo, el valor se queda como estaba y el campo sale «pendiente».
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'mapa-soporte';
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GROUP_COL = { prioridades: 'colMsPrioridades', impactos: 'colMsImpactos', niveles: 'colMsNiveles', reglas: 'colMsReglas' };
const PRIORITIES = ['p1', 'p2', 'p3', 'p4'];
const PRI_PILL = { p1: 'bad', p2: 'warn', p3: 'blue', p4: 'grey' };
const state = { map: null, users: [], pending: [], canHistory: false };

// Minutos → «45 min», «2 h», «3 d»
function friendlyMinutes(m) {
    const n = Number(m);
    if (!n) return t('main.msNoLimit');
    if (n % 1440 === 0) return `${n / 1440} d`;
    if (n % 60 === 0) return `${n / 60} h`;
    return `${n} min`;
}
const isPending = (key) => state.pending.includes(key);
const canEdit = (group, key) => Dashboard.canEditField(TABLE_KEY, GROUP_COL[group], 1, isPending(key));

async function api(method, body) {
    // Dashboard.js ya envuelve fetch y pone solo el token CSRF
    const res = await fetch('/api/business/support-map', { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.message || t('main.msSaveError')), { status: res.status });
    return json;
}

// Manda un cambio de un campo. Si el servidor no lo aplicó (quedó pendiente de autorización o no se permitió), la pantalla vuelve a mostrar lo que hay.
async function save(patch) {
    try {
        const json = await api('PATCH', patch);
        absorb(json);
        if ((json.rejectedFields || []).length) Dashboard.showToast(t('main.fieldLocked'), 'warning');
        else if (Object.keys(patch).some((k) => (json.pendingFields || []).includes(k))) Dashboard.showToast(t('main.changePending'), 'info');
        else Dashboard.showToast(t('main.msSaved'), 'success');
    } catch (err) {
        Dashboard.showToast(err.message, 'error');
        try { absorb(await api('GET')); } catch (e) { /* se queda lo que había */ }
    }
    render();
}
function absorb(json) {
    state.map = json.map; state.users = json.users || state.users; state.pending = json.pendingFields || [];
    state.canHistory = !!(json.permissions && json.permissions.canHistory);
}

// ---- piezas -----------------------------------------------------------------------------------------------------------------------
function switchEl(group, key, label, { help } = {}) {
    const on = !!state.map[key];
    const can = canEdit(group, key);
    const lock = isPending(key) ? t('main.changePending') : (can ? '' : t('main.fieldLocked'));
    return `<div class="ms-switch-row"${help ? ` data-help-key="${help}"` : ''}><span>${esc(label)}</span><button type="button" class="ms-switch" role="switch" aria-checked="${on}" data-key="${key}" data-group="${group}" ${can ? '' : 'disabled'} title="${esc(lock)}"><span class="ms-knob"></span><b>${on ? t('main.assetYes') : t('main.assetNo')}</b></button></div>`;
}
function numberEl(group, key, { unit } = {}) {
    const can = canEdit(group, key);
    const lock = isPending(key) ? t('main.changePending') : (can ? '' : t('main.fieldLocked'));
    return `<label class="ms-num"><input type="number" min="0" step="1" inputmode="numeric" value="${state.map[key]}" data-key="${key}" data-group="${group}" ${can ? '' : 'disabled'} title="${esc(lock)}"><span class="ms-num-hint" data-hint-for="${key}">${esc(unit === 'h' ? `${state.map[key]} h` : friendlyMinutes(state.map[key]))}</span></label>`;
}

function renderPriorities() {
    const heads = [t('main.msColPrioridad'), t('main.msColPrimera'), t('main.msColResolver'), t('main.msColEspera')];
    const rows = PRIORITIES.map((p, i) => `<tr><td><span class="ms-pill ${PRI_PILL[p]}">${esc(t(`main.msPri_${i + 1}`))}</span></td><td>${numberEl('prioridades', `${p}FirstMin`)}</td><td>${numberEl('prioridades', `${p}ResolveMin`)}</td><td>${numberEl('prioridades', `${p}WaitMin`)}</td></tr>`).join('');
    return `<section class="ms-card ms-wide" data-help-key="msPrioridades"><h3>${esc(t('main.msSecPrioridades'))}</h3>
        <div class="ms-scroll"><table class="ms-table"><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        ${switchEl('prioridades', 'allowPause', t('main.msAllowPause'))}
        ${switchEl('prioridades', 'pauseStopsClock', t('main.msPauseStopsClock'))}</section>`;
}

function renderImpacts() {
    const can = canEdit('impactos', 'impacts');
    const lock = isPending('impacts') ? t('main.changePending') : (can ? '' : t('main.fieldLocked'));
    const rows = state.map.impacts.map((im, i) => `<div class="ms-impact"><input type="text" maxlength="40" value="${esc(im.name)}" data-impact="${i}" data-field="name" aria-label="${esc(t('main.msImpactName'))}" ${can ? '' : 'disabled'} title="${esc(lock)}">
        <input type="text" maxlength="160" value="${esc(im.question)}" data-impact="${i}" data-field="question" aria-label="${esc(t('main.msImpactQuestion'))}" ${can ? '' : 'disabled'} title="${esc(lock)}">
        <button type="button" class="ms-icon-btn" data-remove-impact="${i}" aria-label="${esc(t('main.msRemoveImpact'))}" title="${esc(t('main.msRemoveImpact'))}" ${can && state.map.impacts.length > 1 ? '' : 'disabled'}><i class="bx bx-trash" aria-hidden="true"></i></button></div>`).join('');
    const mx = [['p1', 'p2'], ['p1', 'p2'], ['p3', 'p4'], ['p3', 'p4']];
    const rowLabels = ['msMxNow', 'msMxToday', 'msMxWeek', 'msMxNoDate'];
    const matrix = `<div class="ms-matrix"><div></div><div class="h">${esc(t('main.msMxImportant'))}</div><div class="h">${esc(t('main.msMxNotImportant'))}</div>${mx.map((r, i) => `<div class="h">${esc(t(`main.${rowLabels[i]}`))}</div>${r.map((p) => `<div class="c ${PRI_PILL[p]}">${esc(t(`main.msPri_${PRIORITIES.indexOf(p) + 1}`))}</div>`).join('')}`).join('')}</div>`;
    return `<section class="ms-card" data-help-key="msImpactos"><h3>${esc(t('main.msSecImpactos'))}</h3>
        <div data-help-key="msMatriz">${matrix}</div>
        <h4>${esc(t('main.msImpactsTitle'))}</h4>
        <div class="ms-impacts" id="ms-impacts">${rows}</div>
        <button type="button" class="btn btn-secondary ms-add" id="ms-add-impact" ${can && state.map.impacts.length < 12 ? '' : 'disabled'} title="${esc(lock)}"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.msAddImpact'))}</button></section>`;
}

function peopleSummary(key) {
    const byId = new Map(state.users.map((u) => [u.id, u]));
    const names = (state.map[key] || []).map((id) => (byId.get(id) || {}).name).filter(Boolean);
    return names.length ? names.join(', ') : t('main.msNoPeople');
}
function levelRow(n) {
    const usersKey = `n${n}Users`; const enabledKey = `n${n}Enabled`;
    const name = t(`main.sopLevel_n${n}`);
    const optional = n > 1;
    const enabled = optional ? !!state.map[enabledKey] : true;
    const can = canEdit('niveles', usersKey);
    const lock = isPending(usersKey) ? t('main.changePending') : (can ? '' : t('main.fieldLocked'));
    const sw = optional ? switchEl('niveles', enabledKey, t('main.msUse')) : `<div class="ms-switch-row"><span>${esc(t('main.msUse'))}</span><span class="ms-fixed">${esc(t('main.msFixed'))}</span></div>`;
    return `<div class="ms-level${enabled ? '' : ' off'}"><div class="ms-level-head"><span class="ms-lv l${n}">N${n}</span><b>${esc(name)}</b></div>${sw}
        <div class="ms-people"><span class="ms-people-names">${esc(peopleSummary(usersKey))}</span><button type="button" class="btn btn-secondary" data-pick-people="${usersKey}" data-level="${n}" ${can && enabled ? '' : 'disabled'} title="${esc(lock)}">${esc(t('main.msChoosePeople'))}</button></div></div>`;
}
function renderLevels() {
    const fixed = (n, nameKey, whereKey) => `<div class="ms-level"><div class="ms-level-head"><span class="ms-lv l${n}">N${n}</span><b>${esc(t(nameKey))}</b></div><div class="ms-switch-row"><span>${esc(t(whereKey))}</span><span class="ms-fixed">${esc(t('main.msFixed'))}</span></div></div>`;
    return `<section class="ms-card" data-help-key="msNiveles"><h3>${esc(t('main.msSecNiveles'))}</h3>
        <div class="ms-levels">${fixed(0, 'main.sopLevel_n0', 'main.msN0Where')}${levelRow(1)}${levelRow(2)}${levelRow(3)}${fixed(4, 'main.msLevel4', 'main.msN4Where')}</div></section>`;
}

function renderRules() {
    return `<section class="ms-card ms-wide" data-help-key="msReglas"><h3>${esc(t('main.msSecReglas'))}</h3><div class="ms-rules">
        ${switchEl('reglas', 'rateOnReceive', t('main.msRateOnReceive'))}
        ${switchEl('reglas', 'accessCheck', t('main.msAccessCheck'))}
        ${switchEl('reglas', 'closeByHelpdesk', t('main.msCloseByHelpdesk'))}
        <h4>${esc(t('main.msNotifyBossTitle'))}</h4>
        ${switchEl('reglas', 'notifyUrgent', t('main.msNotifyUrgent'))}
        ${switchEl('reglas', 'notifyOverdue', t('main.msNotifyOverdue'))}
        ${switchEl('reglas', 'notifyEscalated', t('main.msNotifyEscalated'))}
        ${switchEl('reglas', 'notifyClosed', t('main.msNotifyClosed'))}
        ${switchEl('reglas', 'allowInviteChat', t('main.msAllowInviteChat'))}
        ${switchEl('reglas', 'askUserRating', t('main.msAskUserRating'))}
        ${switchEl('reglas', 'shareWithProvider', t('main.msShareWithProvider'))}
        <div class="ms-switch-row"><span>${esc(t('main.msRatingReminder'))}</span>${numberEl('reglas', 'ratingReminderHours', { unit: 'h' })}</div>
        <div class="ms-switch-row"><span>${esc(t('main.msConfirmWindow'))}</span>${numberEl('reglas', 'confirmWindowHours', { unit: 'h' })}</div></div></section>`;
}

function render() {
    $('ms-root').innerHTML = `<div class="ms-grid">${renderPriorities()}${renderImpacts()}${renderLevels()}${renderRules()}</div>`;
    $('ms-history').hidden = !state.canHistory;
}

// ---- eventos ------------------------------------------------------------------------------------------------------------------------
$('ms-root').addEventListener('click', (event) => {
    const sw = event.target.closest('.ms-switch');
    if (sw && !sw.disabled) { save({ [sw.dataset.key]: sw.getAttribute('aria-checked') !== 'true' }); return; }
    const pick = event.target.closest('[data-pick-people]');
    if (pick && !pick.disabled) { openPeople(pick.dataset.pickPeople, Number(pick.dataset.level)); return; }
    const rm = event.target.closest('[data-remove-impact]');
    if (rm && !rm.disabled) { const list = state.map.impacts.filter((_, i) => i !== Number(rm.dataset.removeImpact)); save({ impacts: list }); return; }
    if (event.target.closest('#ms-add-impact') && !event.target.closest('#ms-add-impact').disabled) {
        let name = t('main.msNewImpact'); let n = 2;
        while (state.map.impacts.some((i) => i.name.toLowerCase() === name.toLowerCase())) { name = `${t('main.msNewImpact')} ${n}`; n += 1; }
        save({ impacts: [...state.map.impacts, { name, question: '' }] });
    }
});
// los números y los textos se mandan al terminar de escribir (al salir del campo o con Enter)
$('ms-root').addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.type === 'number') {
        const key = input.dataset.key;
        if (input.value === '' || Number(input.value) === state.map[key]) { input.value = state.map[key]; return; }
        save({ [key]: Number(input.value) });
        return;
    }
    if (input.dataset.impact !== undefined) {
        const list = state.map.impacts.map((i) => ({ ...i }));
        list[Number(input.dataset.impact)][input.dataset.field] = input.value;
        save({ impacts: list });
    }
});
$('ms-root').addEventListener('input', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.type === 'number') {
        const hint = document.querySelector(`[data-hint-for="${input.dataset.key}"]`);
        if (hint && input.value !== '') hint.textContent = input.dataset.key.endsWith('Hours') ? `${input.value} h` : friendlyMinutes(input.value);
    }
});
$('ms-history').addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY));

// ---- quién atiende un nivel ----------------------------------------------------------------------------------------------------------
let dialogEl = null;
let dialogState = null; // { key, picked: Set(id) }
function ensureDialog() {
    if (dialogEl) return;
    dialogEl = document.createElement('div');
    dialogEl.className = 'modal-overlay';
    dialogEl.hidden = true;
    dialogEl.innerHTML = `<div class="modal-panel wh-location-dialog" role="dialog" aria-modal="true" aria-labelledby="ms-people-title">
        <h3 id="ms-people-title"></h3><div class="wh-location-list" id="ms-people-list"></div>
        <div class="admin-form-actions"><button type="button" class="btn" id="ms-people-save">${esc(t('main.whSave'))}</button><button type="button" class="btn btn-secondary" id="ms-people-close">${esc(t('main.whClose'))}</button></div></div>`;
    document.body.appendChild(dialogEl);
    dialogEl.addEventListener('click', (event) => {
        if (event.target === dialogEl || event.target.closest('#ms-people-close')) { closeDialog(); return; }
        if (event.target.closest('#ms-people-save') && dialogState) { const { key, picked } = dialogState; closeDialog(); save({ [key]: Array.from(picked) }); }
    });
    dialogEl.addEventListener('change', (event) => {
        const box = event.target;
        if (!(box instanceof HTMLInputElement) || !dialogState) return;
        if (box.checked) dialogState.picked.add(Number(box.value)); else dialogState.picked.delete(Number(box.value));
    });
}
function openPeople(key, level) {
    ensureDialog();
    dialogState = { key, picked: new Set(state.map[key] || []) };
    $('ms-people-title').textContent = t('main.msPeopleTitle', { level: t(`main.sopLevel_n${level}`) });
    const list = $('ms-people-list');
    list.innerHTML = state.users.length ? '' : `<p class="wh-muted">${esc(t('main.msNoUsers'))}</p>`;
    state.users.forEach((u) => {
        const label = document.createElement('label');
        label.className = 'wh-zone-all';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = String(u.id); cb.checked = dialogState.picked.has(u.id);
        const name = document.createElement('b'); name.textContent = u.name;
        label.append(cb, name);
        list.appendChild(label);
    });
    dialogEl.hidden = false;
}
function closeDialog() { if (dialogEl) dialogEl.hidden = true; dialogState = null; }
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && dialogState) closeDialog(); });

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        absorb(await api('GET'));
        render();
    } catch (err) {
        console.error('Mapa de soporte failed to initialize:', err);
    }
})();
})();
