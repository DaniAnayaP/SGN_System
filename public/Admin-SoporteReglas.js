// ---------------------------------------------------------------------------
// Servicio a Cliente › Soporte › pestaña «Reglas de atención» (lado SaaS, el proveedor): las reglas con que GEIPSA (Nivel 4) atiende los casos de TODAS las empresas. Cuatro grupos, cada uno con su botón de ver y de cambiar en el árbol de
// accesos de la cuenta (Equipo SaaS): Plazos de GEIPSA (1ª respuesta y «Resolver en» por prioridad), Horario de atención, Aviso de Urgente sin tomar y Cierre y reapertura. Valen igual para todos los clientes. Los datos salen de
// GET /api/admin/support-rules y se guardan con PATCH (solo lo que cambió); el historial sale de /api/admin/saas-table-changes/reglas-atencion. Admin-SoporteCasos.js muestra y oculta esta pestaña (window.SaasSupportRules.show).
// ---------------------------------------------------------------------------
// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const fmtTime = (iso) => new Date(iso).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const PRIS = ['p1', 'p2', 'p3', 'p4'];
const state = { data: null, draft: null, history: null, msg: '', err: '', saving: false };
const clone = (v) => JSON.parse(JSON.stringify(v));
// Minutos → «5 min», «4 h», «1 día»
function human(min) {
    const n = Number(min);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 60) return `${n} min`;
    if (n < 1440) return `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}`;
    const days = Math.floor(n / 1440); const hours = Math.floor((n % 1440) / 60);
    return `${days} ${lang() === 'en' ? (days === 1 ? 'day' : 'days') : (days === 1 ? 'día' : 'días')}${hours ? ` ${hours} h` : ''}`;
}
const acc = (group) => (state.data && state.data.access[group]) || { view: false, edit: false };
const limits = (key) => (state.data && state.data.limits[key]) || { min: 0, max: 99999 };

async function load() {
    const root = $('ss-rules');
    if (!root) return;
    try {
        const res = await fetch('/api/admin/support-rules', { credentials: 'include' });
        if (!res.ok) { root.innerHTML = `<p class="sp-muted">${esc(t('admin.saasRulesNoAccess'))}</p>`; return; }
        state.data = await res.json();
        state.draft = clone(state.data.values);
        render();
        loadHistory();
    } catch (err) {
        console.error('Reglas de atención failed to load:', err);
        root.innerHTML = `<p class="sp-muted">${esc(t('admin.saveError'))}</p>`;
    }
}
async function loadHistory() {
    try {
        const res = await fetch('/api/admin/saas-table-changes/reglas-atencion', { credentials: 'include' });
        if (!res.ok) return;
        state.history = (await res.json()).changes || [];
        renderHistory();
    } catch (err) { /* el historial no es lo principal */ }
}

// ---- piezas -------------------------------------------------------------------------------------------------------------------------------------------------
function sw(key, label, group, attrs = '') {
    const v = state.draft[key];
    return `<label class="rg-sw"><input type="checkbox" data-rg="${key}" ${v ? 'checked' : ''} ${acc(group).edit ? '' : 'disabled'} ${attrs}><i aria-hidden="true"></i><span>${esc(label)}</span></label>`;
}
function num(key, group, label) {
    const l = limits(key);
    return `<input type="number" class="rg-num" data-rg="${key}" min="${l.min}" max="${l.max}" step="1" value="${esc(state.draft[key])}" ${acc(group).edit ? '' : 'disabled'} aria-label="${esc(label)}">`;
}
function head(group, title, switchKey, switchLabel) {
    return `<h3 class="rg-head"><span>${esc(title)}</span><span class="rg-head-r">${acc(group).edit ? '' : `<span class="rg-tag">${esc(t('admin.saasRulesReadOnly'))}</span>`}${switchKey ? sw(switchKey, switchLabel, group) : ''}</span></h3>`;
}
function plazosHtml() {
    const rows = PRIS.map((p) => `<tr><th scope="row">${esc(t(`main.msPri_${p.slice(1)}`))}</th>
        <td><span class="rg-cell">${num(`${p}FirstMin`, 'plazos', `${t(`main.msPri_${p.slice(1)}`)} · ${t('admin.saasRulesColFirst')}`)}<span class="rg-unit">min</span><span class="rg-human" data-rg-human="${p}FirstMin">${esc(human(state.draft[`${p}FirstMin`]))}</span></span></td>
        <td><span class="rg-cell">${num(`${p}ResolveMin`, 'plazos', `${t(`main.msPri_${p.slice(1)}`)} · ${t('admin.saasRulesColResolve')}`)}<span class="rg-unit">min</span><span class="rg-human" data-rg-human="${p}ResolveMin">${esc(human(state.draft[`${p}ResolveMin`]))}</span></span></td></tr>`).join('');
    return `<div class="rg-group rg-wide" data-help-key="saasRulesPlazos" data-rg-group="plazos">${head('plazos', t('admin.saasRulesGroupPlazos'), 'n4DeadlinesOn', t('admin.saasRulesUse'))}
        <div class="rg-scroll"><table class="rg-table"><thead><tr><th>${esc(t('admin.saasRulesColPriority'))}</th><th>${esc(t('admin.saasRulesColFirst'))}</th><th>${esc(t('admin.saasRulesColResolve'))}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function dayRow(d) {
    const edit = acc('horario').edit;
    const off = !d.on;
    return `<div class="rg-day${off ? ' off' : ''}" data-rg-day="${d.day}">
        <span class="rg-day-name">${esc(t(`admin.saasRulesDay_${d.day}`))}</span>
        <label class="rg-sw rg-sw-solo"><input type="checkbox" data-rg-day-on="${d.day}" ${d.on ? 'checked' : ''} ${edit ? '' : 'disabled'} aria-label="${esc(t(`admin.saasRulesDay_${d.day}`))}"><i aria-hidden="true"></i></label>
        <span class="rg-day-range"><input type="time" data-rg-day-from="${d.day}" value="${esc(d.from)}" ${edit && !off ? '' : 'disabled'} aria-label="${esc(t('admin.saasRulesFrom'))}"> <span>${esc(t('admin.saasRulesTo'))}</span> <input type="time" data-rg-day-to="${d.day}" value="${esc(d.to === '24:00' ? '23:59' : d.to)}" ${edit && !off ? '' : 'disabled'} aria-label="${esc(t('admin.saasRulesTo'))}"></span>
        <span class="rg-day-off sp-muted">${esc(t('admin.saasRulesNoService'))}</span></div>`;
}
function horarioHtml() {
    const tzs = state.data.timezones.includes(state.draft.timezone) ? state.data.timezones : [state.draft.timezone, ...state.data.timezones];
    return `<div class="rg-group" data-help-key="saasRulesHorario" data-rg-group="horario">${head('horario', t('admin.saasRulesGroupHorario'))}
        <div class="rg-days">${state.draft.schedule.map(dayRow).join('')}</div>
        <label class="rg-line"><span>${esc(t('admin.saasRulesTimezone'))}</span><select data-rg="timezone" ${acc('horario').edit ? '' : 'disabled'}>${tzs.map((z) => `<option value="${esc(z)}"${z === state.draft.timezone ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
        <div class="rg-line"><span>${esc(t('admin.saasRulesScheduleOn'))}</span>${sw('scheduleOn', '', 'horario')}</div>
        <div class="rg-line"><span>${esc(t('admin.saasRulesUrgent24h'))}</span>${sw('urgent24h', '', 'horario')}</div></div>`;
}
function urgenteHtml() {
    const edit = acc('urgente').edit;
    const chips = [`<button type="button" class="sp-chip${state.draft.urgentToScope ? ' on' : ''}" data-rg-scope="1" ${edit ? '' : 'disabled'}>${esc(t('admin.saasRulesToScope'))}</button>`]
        .concat(state.data.people.map((p) => `<button type="button" class="sp-chip${state.draft.urgentToUsers.includes(p.id) ? ' on' : ''}" data-rg-person="${p.id}" ${edit ? '' : 'disabled'}>${esc(p.name)}</button>`)).join('');
    return `<div class="rg-group" data-help-key="saasRulesUrgente" data-rg-group="urgente">${head('urgente', t('admin.saasRulesGroupUrgente'), 'urgentAlertOn', t('admin.saasRulesUseAlert'))}
        <div class="rg-line"><span>${esc(t('admin.saasRulesAlertAfter'))}</span><span class="rg-cell">${num('urgentAlertMin', 'urgente', t('admin.saasRulesAlertAfter'))}<span class="rg-unit">min</span></span></div>
        <div class="rg-line"><span>${esc(t('admin.saasRulesRepeat'))}</span><span class="rg-cell">${num('urgentRepeatMin', 'urgente', t('admin.saasRulesRepeat'))}<span class="rg-unit">min</span></span></div>
        <div class="rg-line rg-line-col"><span>${esc(t('admin.saasRulesNotifyTo'))}</span><span class="sp-chips">${chips}</span></div></div>`;
}
function cierreHtml() {
    const line = (key, label, unit) => `<div class="rg-line"><span>${esc(label)}</span><span class="rg-cell">${num(key, 'cierre', label)}${unit ? `<span class="rg-unit">${esc(unit)}</span>` : ''}</span></div>`;
    return `<div class="rg-group" data-help-key="saasRulesCierre" data-rg-group="cierre">${head('cierre', t('admin.saasRulesGroupCierre'))}
        ${line('reopenDays', t('admin.saasRulesReopenDays'), lang() === 'en' ? 'days' : 'días')}${line('needAttempts', t('admin.saasRulesNeedAttempts'))}${line('maxAttempts', t('admin.saasRulesMaxAttempts'))}</div>`;
}
function saveBarHtml() {
    const meta = state.data.meta;
    const last = meta && meta.updatedAt ? t('admin.saasRulesLastChange', { by: meta.updatedBy || '—', when: fmtTime(meta.updatedAt) }) : t('admin.saasRulesNeverChanged');
    const canEdit = Object.values(state.data.access).some((a) => a.edit);
    return `<div class="rg-save"><span class="sp-muted">${esc(last)}</span>
        <span class="rg-msg${state.err ? ' err' : ''}" role="status" id="rg-msg">${esc(state.err || state.msg)}</span>
        ${canEdit ? `<span class="rg-btns"><button type="button" class="btn btn-secondary" id="rg-discard" disabled>${esc(t('admin.saasRulesDiscard'))}</button><button type="button" class="btn" id="rg-save" disabled>${esc(t('admin.saasRulesSave'))}</button></span>` : ''}</div>`;
}
function render() {
    const root = $('ss-rules');
    if (!root || !state.data) return;
    const a = state.data.access;
    // los grupos que esta cuenta puede ver; Aviso de Urgente y Cierre van en una columna
    const right = [a.urgente.view ? urgenteHtml() : '', a.cierre.view ? cierreHtml() : ''].filter(Boolean).join('');
    root.innerHTML = `<div class="rg">${a.plazos.view ? plazosHtml() : ''}
        <div class="rg-cols">${a.horario.view ? horarioHtml() : ''}${right ? `<div class="rg-stack">${right}</div>` : ''}</div>
        ${saveBarHtml()}
        <details class="rg-history" id="rg-history"><summary>${esc(t('admin.saasRulesHistory'))}</summary><div id="rg-history-body"></div></details></div>`;
    renderHistory();
    syncDirty();
}
function renderHistory() {
    const body = $('rg-history-body');
    if (!body) return;
    if (!state.history) { body.innerHTML = ''; return; }
    if (!state.history.length) { body.innerHTML = `<p class="sp-muted">${esc(t('admin.saasRulesHistoryEmpty'))}</p>`; return; }
    const when = (s) => fmtTime(`${String(s).replace(' ', 'T')}Z`);
    body.innerHTML = `<div class="rg-scroll"><table class="rg-table"><thead><tr><th>${esc(t('admin.saasRulesHWhen'))}</th><th>${esc(t('admin.saasRulesHBy'))}</th><th>${esc(t('admin.saasRulesHRule'))}</th><th>${esc(t('admin.saasRulesHFrom'))}</th><th>${esc(t('admin.saasRulesHTo'))}</th></tr></thead><tbody>${state.history.slice(0, 200).map((c) => `<tr><td>${esc(when(c.changed_at))}</td><td>${esc(c.changed_by)}</td><td>${esc(c.field_key)}</td><td>${esc(c.old_value)}</td><td>${esc(c.new_value)}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---- lo que cambió y guardar --------------------------------------------------------------------------------------------------------------------------
const editableKeys = () => Object.keys(state.draft).filter((k) => {
    const group = Object.keys(state.data.groups || {}).find((g) => state.data.groups[g].includes(k));
    return group && acc(group).edit;
});
const changedKeys = () => editableKeys().filter((k) => JSON.stringify(state.draft[k]) !== JSON.stringify(state.data.values[k]));
function syncDirty() {
    const dirty = changedKeys().length > 0;
    const save = $('rg-save'); const discard = $('rg-discard');
    if (save) save.disabled = !dirty || state.saving;
    if (discard) discard.disabled = !dirty || state.saving;
}
async function save() {
    const keys = changedKeys();
    if (!keys.length) { state.msg = t('admin.saasRulesNothing'); state.err = ''; render(); return; }
    state.saving = true; state.msg = ''; state.err = '';
    syncDirty();
    try {
        const res = await fetch('/api/admin/support-rules', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(keys.map((k) => [k, state.draft[k]]))) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { state.err = body.message || t('admin.saveError'); state.saving = false; render(); return; }
        state.data = body; state.draft = clone(body.values); state.msg = t('admin.saasRulesSaved'); state.err = '';
    } catch (err) {
        console.error('Reglas de atención failed to save:', err);
        state.err = t('admin.saveError');
    }
    state.saving = false;
    render();
    loadHistory();
}

// ---- eventos ------------------------------------------------------------------------------------------------------------------------------------------
function wire() {
    const root = $('ss-rules');
    if (!root || root.dataset.wired) return;
    root.dataset.wired = '1';
    const touched = () => { state.msg = ''; state.err = ''; const m = $('rg-msg'); if (m) { m.textContent = ''; m.classList.remove('err'); } syncDirty(); };
    root.addEventListener('input', (e) => {
        const el = e.target;
        if (el.matches('input[type="number"][data-rg]')) {
            state.draft[el.dataset.rg] = el.value === '' ? null : Number(el.value);
            const h = root.querySelector(`[data-rg-human="${el.dataset.rg}"]`);
            if (h) h.textContent = human(el.value);
            touched();
        } else if (el.matches('input[type="time"]')) {
            const day = Number(el.dataset.rgDayFrom || el.dataset.rgDayTo);
            const row = state.draft.schedule.find((d) => d.day === day);
            if (row && el.value) { if (el.dataset.rgDayFrom) row.from = el.value; else row.to = el.value; touched(); }
        }
    });
    root.addEventListener('change', (e) => {
        const el = e.target;
        if (el.matches('input[type="checkbox"][data-rg]')) { state.draft[el.dataset.rg] = el.checked; touched(); }
        else if (el.matches('select[data-rg]')) { state.draft[el.dataset.rg] = el.value; touched(); }
        else if (el.matches('[data-rg-day-on]')) {
            const day = Number(el.dataset.rgDayOn);
            const row = state.draft.schedule.find((d) => d.day === day);
            row.on = el.checked;
            const rowEl = root.querySelector(`[data-rg-day="${day}"]`);
            rowEl.classList.toggle('off', !el.checked);
            rowEl.querySelectorAll('input[type="time"]').forEach((i) => { i.disabled = !el.checked || !acc('horario').edit; });
            touched();
        }
    });
    root.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-rg-scope], [data-rg-person]');
        if (chip && !chip.disabled) {
            if (chip.dataset.rgScope) state.draft.urgentToScope = !state.draft.urgentToScope;
            else {
                const id = Number(chip.dataset.rgPerson);
                state.draft.urgentToUsers = state.draft.urgentToUsers.includes(id) ? state.draft.urgentToUsers.filter((x) => x !== id) : [...state.draft.urgentToUsers, id];
            }
            chip.classList.toggle('on');
            touched();
            return;
        }
        if (e.target.closest('#rg-save')) save();
        else if (e.target.closest('#rg-discard')) { state.draft = clone(state.data.values); state.msg = ''; state.err = ''; render(); }
    });
}
window.SaasSupportRules = { show() { wire(); load(); } };
})();
