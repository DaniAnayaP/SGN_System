// ---------------------------------------------------------------------------
// Cadena de Suministro › Centro de Distribución › Cargas Manuales › Análisis Registros Manuales (Daniel, 2026-11-25, «Sí, empieza el Análisis»): la lista de análisis y el botón «＋ Agregar nuevo análisis».
// Cada análisis nuevo es una pantalla más del menú (debajo de esta) con su diseño de columnas y sus versiones (archivos extraídos). Tabla estándar; los botones son del árbol (colAnCrearAuth).
// Un análisis nunca se borra: se desactiva (deja de salir en el menú).
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/manual-analyses';
const TABLE = 'analisis';
const COLUMNS = ['colAnNombre', 'colAnRegistros', 'colAnColumnas', 'colAnUltimaVersion', 'colAnVersiones', 'colAnEstado'];
const t = (key, params) => Dashboard.t(key, params);
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const regName = (r) => r.name || t(r.nameKey);

const st = { analyses: [], registries: [], canCreate: false, text: '' };
const wrapper = () => document.querySelector(`[data-table-id="${TABLE}"]`);
const table = () => wrapper().querySelector('table.data-table');

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await load();
        openNewFromMenu();
        document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', () => { st.text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase(); draw(); });
        document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', () => { st.text = ''; draw(); });
    } catch (err) {
        console.error('Análisis Registros Manuales: failed to initialize', err);
    }
})();

async function load() {
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        st.analyses = body.analyses || []; st.registries = body.registries || []; st.canCreate = !!body.canCreate;
        draw();
    } catch (err) {
        console.error('Análisis: failed to load', err);
        Dashboard.showToast(t('main.anLoadError'), 'error');
    }
}
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function iconBtn(icon, key, helpKey, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'admin-icon-btn';
    btn.setAttribute('data-help-key', helpKey); btn.setAttribute('aria-label', t(key)); btn.title = t(key);
    btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
    btn.addEventListener('click', onClick);
    return btn;
}
function visible() {
    if (!st.text) return st.analyses;
    return st.analyses.filter((a) => `${a.name} ${(a.design.registries || []).map((k) => { const r = st.registries.find((x) => x.key === k); return r ? regName(r) : k; }).join(' ')}`.toLowerCase().includes(st.text));
}
function draw() {
    const tbl = table();
    if (!tbl.dataset.colInit) {
        const row = tbl.tHead.rows[0] || tbl.tHead.insertRow();
        row.textContent = '';
        const th = (col, group, key, cls) => { const el = document.createElement('th'); el.dataset.col = col; if (group) el.dataset.group = group; el.dataset.i18n = key; el.textContent = t(key); if (cls) el.className = cls; return el; };
        COLUMNS.forEach((k) => row.appendChild(th(k, 'menu.cmAnalisisRegistros', `main.${k}`)));
        row.appendChild(th('actions', null, 'main.colActions'));
    }
    const tbody = tbl.tBodies[0];
    tbody.innerHTML = '';
    visible().forEach((a) => {
        const tr = document.createElement('tr');
        tr.dataset.recordId = a.id;
        const name = document.createElement('td');
        name.dataset.col = 'colAnNombre';
        const link = document.createElement('a');
        link.href = `CmAnalisis.html?id=${a.id}`; link.textContent = a.name; link.className = 'an-link';
        name.appendChild(link);
        const last = a.lastExtraction;
        const lastCell = document.createElement('td');
        lastCell.dataset.col = 'colAnUltimaVersion';
        if (last) { lastCell.appendChild(document.createTextNode(`v${last.version} · `)); const when = document.createElement('span'); Dashboard.renderTimeStamp(when, last.createdAt); lastCell.appendChild(when); } else lastCell.textContent = '—';
        const status = document.createElement('td');
        status.dataset.col = 'colAnEstado';
        status.innerHTML = `<span class="reg-pill reg-pill-${a.status === 'active' ? 'ok' : 'off'}">${esc(t(`main.anStatus_${a.status}`))}</span>`;
        const actions = document.createElement('td');
        actions.dataset.col = 'actions';
        actions.className = 'admin-table-actions';
        actions.appendChild(iconBtn('bx-right-arrow-alt', 'main.anOpen', 'anOpen', () => { location.href = `CmAnalisis.html?id=${a.id}`; }));
        const history = iconBtn('bx-history', 'main.changeHistoryTitleRecord', 'changeHistory', () => Dashboard.openChangeHistory(TABLE, a.id));
        actions.appendChild(history);
        if (st.canCreate) {
            actions.appendChild(iconBtn('bx-edit', 'main.anRename', 'anRename', () => openRename(a)));
            actions.appendChild(iconBtn(a.status === 'active' ? 'bx-hide' : 'bx-show', a.status === 'active' ? 'main.anDeactivate' : 'main.anActivate', 'anToggle', () => toggle(a)));
        }
        tr.append(
            name,
            cell('colAnRegistros', (a.design.registries || []).map((k) => { const r = st.registries.find((x) => x.key === k); return r ? regName(r) : k; }).join(' · ')),
            cell('colAnColumnas', ((a.design.legacy === false || !(a.design.consulted || []).length) && a.design.columns ? a.design.columns : (a.design.consulted || [])).length, 'col-num'), lastCell, cell('colAnVersiones', a.extractionsCount, 'col-num'), status, actions,
        );
        tbody.appendChild(tr);
    });
    if (!tbody.querySelector('tr')) {
        const tr = document.createElement('tr'); const td = document.createElement('td');
        td.className = 'data-table-empty-cell'; td.colSpan = COLUMNS.length + 1;
        const inner = document.createElement('div'); inner.className = 'data-table-empty-inner'; inner.textContent = t('main.emptyStateText');
        td.appendChild(inner); tr.appendChild(td); tbody.appendChild(tr);
    }
    if (!tbl.dataset.colInit && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper(), 0);
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE);
    wrapper().setAttribute('data-help-key', 'anTable');
    if (Dashboard.attachTableDownloadButton) Dashboard.attachTableDownloadButton(TABLE, { getTitle: () => `${t('menu.cmAnalisisRegistros')}_${new Date().toISOString().slice(0, 10)}` });
}
// La opción «＋ Agregar nuevo análisis» del menú lateral abre esta pantalla con ?nuevo=1: se muestra la ventana de alta (solo con el botón «Crear análisis») y se limpia la dirección.
function openNewFromMenu() {
    const params = new URLSearchParams(location.search);
    if (params.get('nuevo') !== '1') return;
    history.replaceState(null, '', location.pathname);
    if (st.canCreate) openCreate();
}
function errorText(body) {
    const code = body && body.code;
    return ['AN_NAME_REQUIRED', 'AN_NAME_TAKEN', 'DESIGN_REGISTRIES', 'AN_FORBIDDEN', 'BASE_KEY', 'COL_NOT_FOUND'].includes(code) ? t(`main.anErr_${code}`) : t('admin.saveError');
}
function modal(html, onReady) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    overlay.querySelectorAll('[data-an-close]').forEach((b) => b.addEventListener('click', close));
    onReady(overlay, close);
}
// «Nuevo análisis» (Daniel, 2026-11-26): solo se eligen el archivo base, las columnas base (cada una puede ser llave) y si la llave lleva duplicados. Todo lo demás se arma en el Análisis.
// Las columnas que se ofrecen salen del archivo base (los registros mensuales/diarios traen sus 6 columnas fijas; los de tabla libre, las suyas). Unidad/Sitio y Código vienen como llave si el archivo es mensual o diario;
// en una tabla libre vienen como llave las que se cargaron como llave.
function suggestBase(source) {
    const cols = source ? source.columns : [];
    const isPeriodic = cols.some((c) => c.kind === 'dim');
    let picked;
    if (isPeriodic) picked = [['unidad', true], ['codigo', true], ['descripcion', false], ['categoria', false]];
    else {
        const keys = cols.filter((c) => c.group === 'key');
        const data = cols.filter((c) => c.group === 'data');
        const loose = cols.filter((c) => c.kind === 'text');
        picked = keys.length ? [...keys.map((c) => [c.key, true]), ...data.slice(0, 2).map((c) => [c.key, false])] : loose.slice(0, 3).map((c, i) => [c.key, i === 0]);
    }
    return picked.filter(([key]) => cols.some((c) => c.key === key));
}
async function openCreate() {
    const kit = window.AnalysisKit;
    const sources = (await kit.loadSources()).registries || [];
    const regs = sources.filter((r) => r.status === 'active' && !r.obsolete); // un registro desactivado u obsoleto ya no se ofrece para análisis nuevos
    const html = `<h3>${esc(t('main.anNewTitle'))}</h3>
        <label for="an-c-name">${esc(t('main.anName'))}</label><input type="text" id="an-c-name" maxlength="80" autocomplete="off">
        <div class="an-start"><label><input type="radio" name="an-c-start" value="blank" checked> <span>${esc(t('main.anStartBlank'))}</span></label>
        <label><input type="radio" name="an-c-start" value="copy"${st.analyses.length ? '' : ' disabled'}> <span>${esc(t('main.anStartCopy'))}</span></label>
        <select id="an-c-copy"${st.analyses.length ? '' : ' disabled'}>${st.analyses.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
        <div id="an-c-blank">
        <label for="an-c-base" data-help-key="anBaseFile">${esc(t('main.an2BaseFile'))} <small>${esc(t('main.an2BaseFileHint'))}</small></label>
        <select id="an-c-base">${regs.map((r) => `<option value="${esc(r.key)}">${esc(kit.regName(r))}</option>`).join('')}</select>
        <p class="reg-field-label" data-help-key="anBaseCols">${esc(t('main.an2BaseCols'))}</p>
        <div class="an-basecols" id="an-c-cols"></div>
        <p class="reg-field-label" data-help-key="anDedupe">${esc(t('main.an2RowsOfKey'))}</p>
        <div class="an-opts" id="an-c-dedupe">
            <label class="an-opt"><input type="radio" name="an-c-dedupe" value="sin" checked><span><b>${esc(t('main.an2NoDup'))}</b><small id="an-c-nodup-hint"></small></span><em>${esc(t('main.an2Default'))}</em></label>
            <label class="an-opt"><input type="radio" name="an-c-dedupe" value="con"><span><b>${esc(t('main.an2Dup'))}</b><small>${esc(t('main.an2DupHint'))}</small></span></label>
        </div>
        <div class="an-prev" id="an-c-prev"></div>
        </div>
        <p class="admin-error" id="an-c-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t('main.anCreate'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay) => {
        const $ = (sel) => overlay.querySelector(sel);
        const err = (text) => { const el = $('#an-c-error'); el.textContent = text; el.hidden = !text; };
        let base = []; // [{ col, key }]
        const sourceOf = () => sources.find((r) => r.key === $('#an-c-base').value);
        const labelOf = (key) => { const c = (sourceOf() ? sourceOf().columns : []).find((x) => x.key === key); return c ? c.label : key; };
        let previewTimer = null;
        const drawPreview = () => {
            clearTimeout(previewTimer);
            const keys = base.filter((b) => b.key);
            $('#an-c-nodup-hint').textContent = keys.length ? t('main.an2NoDupHint', { keys: keys.map((b) => labelOf(b.col)).join(' + ') }) : t('main.an2NeedKey');
            const box = $('#an-c-prev');
            if (!keys.length) { box.innerHTML = `<p class="admin-error">${esc(t('main.an2NeedKey'))}</p>`; return; }
            box.innerHTML = `<span class="an-prev-n">…</span>`;
            previewTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`${API}/base-preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRegistry: $('#an-c-base').value, base }) });
                    const out = await res.json().catch(() => ({}));
                    if (!res.ok) { box.innerHTML = ''; return; }
                    const num = (n) => Number(n).toLocaleString(kit.lang() === 'en' ? 'en-US' : 'es-MX');
                    const sample = (out.sample || []).slice(0, 4);
                    box.innerHTML = `<div class="an-prev-nums"><div><b>${esc(num(out.distinct))}</b><span>${esc(t('main.an2PrevDistinct'))}</span></div><div><b>${esc(num(out.total))}</b><span>${esc(t('main.an2PrevTotal'))}</span></div></div>${sample.length ? `<div class="wp-imp-table-wrap"><table class="wp-imp-table"><thead><tr>${(out.columns || []).map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${sample.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}`;
                } catch { box.innerHTML = ''; }
            }, 250);
        };
        const drawCols = () => {
            const src = sourceOf();
            const all = src ? src.columns.filter((c) => c.kind !== 'load') : [];
            const chosen = new Set(base.map((b) => b.col));
            const rest = all.filter((c) => !chosen.has(c.key));
            $('#an-c-cols').innerHTML = `${base.map((b) => `<span class="an-bchip${b.key ? ' an-bchip-key' : ''}"><label class="an-bname"><input type="checkbox" data-an-bcol="${esc(b.col)}" checked><span>${esc(labelOf(b.col))}</span></label><button type="button" class="an-bkey${b.key ? ' on' : ''}" data-an-bkey="${esc(b.col)}" aria-pressed="${b.key ? 'true' : 'false'}">${esc(t('main.an2Key'))}</button></span>`).join('')}${rest.length ? `<span class="an-addwrap"><button type="button" class="an-bchip an-bchip-add" data-an-bmore aria-haspopup="true">${esc(t('main.an2AddCol'))} <i class="bx bx-chevron-down" aria-hidden="true"></i></button><span class="an-addmenu an-bmenu" hidden>${rest.map((c) => `<button type="button" data-an-bpick="${esc(c.key)}">${esc(c.label)}</button>`).join('')}</span></span>` : ''}`;
            drawPreview();
        };
        const resetBase = () => { base = suggestBase(sourceOf()).map(([col, key]) => ({ col, key })); drawCols(); };
        $('#an-c-base').addEventListener('change', resetBase);
        overlay.addEventListener('click', (event) => {
            const keyBtn = event.target.closest('[data-an-bkey]'); const pick = event.target.closest('[data-an-bpick]'); const more = event.target.closest('[data-an-bmore]'); const box = event.target.closest('[data-an-bcol]');
            const menu = overlay.querySelector('.an-bmenu');
            if (menu && !more) menu.hidden = true;
            if (keyBtn) { const b = base.find((x) => x.col === keyBtn.dataset.anBkey); if (b) { b.key = !b.key; drawCols(); } }
            else if (pick) { base.push({ col: pick.dataset.anBpick, key: false }); drawCols(); }
            else if (more && menu) { menu.hidden = !menu.hidden; event.stopPropagation(); }
            else if (box) { event.preventDefault(); base = base.filter((x) => x.col !== box.dataset.anBcol); drawCols(); }
        });
        overlay.querySelectorAll('input[name="an-c-start"]').forEach((r) => r.addEventListener('change', () => { $('#an-c-blank').hidden = $('input[name="an-c-start"]:checked').value === 'copy'; }));
        overlay.querySelector('#an-c-dedupe').addEventListener('change', () => {});
        resetBase();
        $('#an-c-name').focus();
        $('[data-an-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget;
            const copy = $('input[name="an-c-start"]:checked').value === 'copy';
            if (!copy && !base.some((b) => b.key)) { err(t('main.an2NeedKey')); return; }
            btn.disabled = true; err('');
            try {
                const body = { name: $('#an-c-name').value };
                if (copy) body.copyFrom = Number($('#an-c-copy').value);
                else Object.assign(body, { baseRegistry: $('#an-c-base').value, base, dedupe: $('input[name="an-c-dedupe"]:checked').value });
                const res = await fetch(API, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const out = await res.json().catch(() => ({}));
                if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
                location.href = `CmAnalisis.html?id=${out.analysis.id}`; // se abre en su Análisis; el menú ya la trae como pantalla nueva
            } catch (e) { btn.disabled = false; err(errorText(e.body)); }
        });
    });
}
function openRename(a) {
    modal(`<h3>${esc(t('main.anRename'))}</h3><label for="an-r-name">${esc(t('main.anName'))}</label><input type="text" id="an-r-name" maxlength="80" value="${esc(a.name)}" autocomplete="off">
        <p class="admin-error" id="an-r-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t('main.anRename'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`, (overlay) => {
        overlay.querySelector('[data-an-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget; btn.disabled = true;
            try {
                const res = await fetch(`${API}/${a.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: overlay.querySelector('#an-r-name').value }) });
                const out = await res.json().catch(() => ({}));
                if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
                location.reload(); // el menú trae el nombre nuevo
            } catch (e) { btn.disabled = false; const el = overlay.querySelector('#an-r-error'); el.textContent = errorText(e.body); el.hidden = false; }
        });
    });
}
async function toggle(a) {
    try {
        const res = await fetch(`${API}/${a.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: a.status === 'active' ? 'inactive' : 'active' }) });
        if (!res.ok) throw new Error('failed');
        location.reload(); // sale del menú (o vuelve a salir)
    } catch (err) { Dashboard.showToast(t('admin.saveError'), 'error'); }
}
})();
