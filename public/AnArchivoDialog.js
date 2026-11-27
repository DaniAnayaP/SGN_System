// ---------------------------------------------------------------------------
// Análisis sin Diseño (Daniel, 2026-11-26): las dos ventanas del Análisis que arma cada columna:
//   · «De un archivo»: elige el archivo, qué columna(s) de valor trae, con qué llave se liga (cada columna base llave ← una del archivo), las condiciones (ninguna, una o más; cada una «columna es alguna de estas opciones»,
//     unidas con «y» u «o»), cómo juntar los valores si la llave se repite (suma, promedio, mínimo, máximo, conteo, el primero), el nombre, la clasificación, el formato y el aspecto (como en Excel). Trae una vista previa.
//   · «Columnas base»: qué columnas lleva el análisis, cuáles son llave y si llevan duplicados.
// Usa lo que expone CmAnalisis.js (window.AnalysisPage) y los formatos y el selector múltiple de AnalysisKit.js.
// ---------------------------------------------------------------------------
(function () {
const P = window.AnalysisPage;
if (!P) return;
const { st, t, esc, modal, kit } = P;
const API = kit.API;
const AGG_LABEL = (a) => t(`main.an2Agg_${a}`);
const FORMAT_ALL = ['general', ...kit.FORMATS_COMMON];
const sourceOf = (key) => (st.sources || []).find((r) => r.key === key);
const colsOf = (reg) => (reg ? reg.columns : []).filter((c) => c.kind !== 'load');
// «La más reciente» (⟳): lo que el archivo ofrece ({ id, name?, today }); en una tabla libre cada familia de columnas con día y hora, en un registro mensual o diario el último periodo.
const liveOpts = (regKey) => ((sourceOf(regKey) || {}).live || []);
const liveName = (o) => (o.id === 'last' ? t('main.an2LiveLast') : (o.name || o.id));
// al agregar una columna de una tabla libre, lo normal es que sea la más reciente (se actualiza sola); en los demás archivos, el primer periodo de siempre
const defaultPick = (regKey) => { const reg = sourceOf(regKey); const live = liveOpts(regKey); const firstValue = colsOf(reg).find((c) => c.kind === 'value'); return reg && reg.kind === 'tabla' && live.length ? { valueCols: [], live: [live[0].id] } : { valueCols: firstValue ? [firstValue.key] : [], live: [] }; };
// Un archivo «sin datos» (Daniel, 2026-11-26): uno de formato fijo (mensual o diario) sin ninguna fecha cargada, o una tabla libre sin cargas vigentes. Solo trae sus columnas de referencia: no hay nada que elegir como valor.
const noData = (reg) => { if (!reg) return false; const cols = colsOf(reg); return reg.columns.some((c) => c.kind === 'dim') ? !cols.some((c) => c.kind === 'value') : !cols.length; };
const SYN = { unidad: ['unidad', 'sitio', 'site', 'unit', 'centro de costos', 'clave unidad'], codigo: ['codigo', 'cod', 'code', 'sku', 'item', 'articulo', 'clave articulo'], descripcion: ['descripcion', 'nombre', 'description'], categoria: ['categoria', 'familia', 'category'], udm: ['udm', 'unidad de medida', 'uom'] };
const synKey = (label) => { const f = kit.fold(label); return Object.keys(SYN).find((k) => SYN[k].some((s) => f === kit.fold(s))) || null; };
const debounce = (fn, ms) => { let timer = null; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; };
const PALETTE = kit.CLASS_COLORS;

// ---------------------------------------------------------------------------------------------- «De un archivo»
// Con qué columna del archivo se liga una columna base: la de la última columna sacada de ese archivo; en el mismo archivo base, ella misma; si no, la que se llama parecido.
function suggestKeyMap(design, regKey, editing) {
    const reg = sourceOf(regKey);
    const baseReg = sourceOf(design.baseRegistry);
    const last = [...(design.columns || [])].reverse().find((c) => c.registry === regKey && (!editing || c.id !== editing.id) && (c.keyMap || []).length);
    const map = {};
    const cols = colsOf(reg);
    (design.base || []).filter((b) => b.key).forEach((b) => {
        const fromLast = last && last.keyMap.find((k) => k.base === b.col);
        if (fromLast && cols.some((c) => c.key === fromLast.file)) { map[b.col] = fromLast.file; return; }
        if (regKey === design.baseRegistry) { map[b.col] = b.col; return; }
        const baseLabel = ((baseReg ? baseReg.columns : []).find((c) => c.key === b.col) || {}).label || b.col;
        const same = cols.find((c) => kit.fold(c.label) === kit.fold(baseLabel)) || cols.find((c) => synKey(c.label) && synKey(c.label) === (synKey(baseLabel) || (SYN[b.col] ? b.col : null)));
        map[b.col] = same ? same.key : '';
    });
    return { map, kept: !!last && regKey !== design.baseRegistry };
}
function initialState(design, editId) {
    const editing = editId ? (design.columns || []).find((c) => c.id === editId) : null;
    const regs = st.sources || [];
    if (editing) {
        const keyMap = {};
        (design.base || []).filter((b) => b.key).forEach((b) => { const m = (editing.keyMap || []).find((k) => k.base === b.col); keyMap[b.col] = m ? m.file : (editing.registry === design.baseRegistry ? b.col : ''); });
        return { editing, registry: editing.registry, valueCols: [...editing.valueCols], live: [...(editing.live || [])], agg: editing.agg || 'sum', keyMap, kept: false, conds: (editing.conds || []).map((c) => ({ col: c.col, values: [...c.values], join: c.join === 'or' ? 'or' : 'and' })),
            label: editing.label, labelTouched: true, cls: editing.cls || '', color: kit.hasClassColor(editing.color) ? editing.color : null, colorTouched: false, fmt: editing.fmt || 'general', pat: editing.pat || '', style: JSON.parse(JSON.stringify(editing.style || {})) };
    }
    const other = regs.find((r) => r.key !== design.baseRegistry && r.status === 'active') || regs.find((r) => r.key === design.baseRegistry) || regs[0];
    const regKey = other ? other.key : design.baseRegistry;
    const km = suggestKeyMap(design, regKey, null);
    const pick = defaultPick(regKey);
    return { editing: null, registry: regKey, valueCols: pick.valueCols, live: pick.live, agg: 'sum', keyMap: km.map, kept: km.kept, conds: [], label: '', labelTouched: false, cls: '', color: null, colorTouched: false, fmt: 'general', pat: '', style: {} };
}
const labelOfCol = (regKey, colKey) => { const c = colsOf(sourceOf(regKey)).find((x) => x.key === colKey); return c ? c.label : colKey; };
function defaultLabel(d) {
    if (d.valueCols.length) return labelOfCol(d.registry, d.valueCols[0]);
    const o = liveOpts(d.registry).find((x) => x.id === (d.live || [])[0]);
    return o ? liveName(o) : '';
}
function columnFrom(d, id, valueCols, live = []) {
    const entry = { id, label: (d.label || '').trim() || (valueCols.length ? labelOfCol(d.registry, valueCols[0]) : t('main.an2ColumnN')), registry: d.registry, valueCols, agg: d.agg,
        keyMap: Object.entries(d.keyMap).filter(([, file]) => file).map(([base, file]) => ({ base, file })),
        conds: d.conds.filter((c) => c.col && c.values.length).map((c, i) => ({ col: c.col, values: c.values, join: i && c.join === 'or' ? 'or' : 'and' })) };
    if (live.length) entry.live = live;
    if (d.cls.trim()) { entry.cls = d.cls.trim(); if (kit.hasClassColor(d.color)) entry.color = d.color; }
    if (d.fmt && d.fmt !== 'general') { entry.fmt = d.fmt; if (d.fmt === 'pers' && d.pat) entry.pat = d.pat; }
    if (Object.keys(d.style).length) entry.style = d.style;
    return entry;
}

function chipsFor(name, items, selected, attr) {
    return items.map((v) => `<label class="an-vchip"><input type="checkbox" ${attr}="${esc(v.value)}"${selected(v.value) ? ' checked' : ''}><span>${esc(v.label)}</span></label>`).join('');
}
const swatch = (attr, value, color, on, title) => `<button type="button" class="an-sw${on ? ' on' : ''}${color ? '' : ' none'}" ${attr}="${esc(value)}" style="${color ? `background:${color}` : ''}" aria-pressed="${on ? 'true' : 'false'}" title="${esc(title || '')}" aria-label="${esc(title || '')}"></button>`;
const hexOf = (c) => (typeof c === 'string' ? c : '#8a3590');

// El renglón «La más reciente» (⟳) encima de las cargas: un botón por cada columna (Exist, Costo…) o, en un registro mensual, «El último periodo»; dice cuál es hoy.
function liveBlock(d) {
    const live = liveOpts(d.registry);
    if (!live.length) return '';
    const picked = d.live || [];
    const today = picked.map((id) => (live.find((o) => o.id === id) || {}).today).filter(Boolean).join(' · ');
    return `<div class="an-live-group" data-help-key="anFdLive"><span class="an-live-title">${esc(t('main.an2LiveTitle'))}</span><div class="an-valcols">${chipsFor('l', live.map((o) => ({ value: o.id, label: `⟳ ${liveName(o)}` })), (v) => picked.includes(v), 'data-fd-live')}</div>${picked.length ? `<span class="an-live-today">${esc(t('main.an2LiveToday', { label: today }))}</span><span class="an-dim">${esc(t('main.an2LiveHint'))}</span>` : ''}</div><span class="an-live-title">${esc(t('main.an2FixedTitle'))}</span>`;
}
function formHtml(d, design) {
    const regs = st.sources || [];
    const reg = sourceOf(d.registry);
    const cols = colsOf(reg);
    const valueFirst = [...cols.filter((c) => c.kind === 'value'), ...cols.filter((c) => c.kind !== 'value')];
    const keyBase = (design.base || []).filter((b) => b.key);
    const baseReg = sourceOf(design.baseRegistry);
    const baseLabel = (col) => ((baseReg ? baseReg.columns : []).find((c) => c.key === col) || {}).label || col;
    const known = P.classKnown();
    const s = d.style;
    const bd = new Set(s.bd || []);
    const isPalette = (c, i) => c === i;
    return `
    <label for="fd-reg" data-help-key="anFdFile">${esc(t('main.an2File'))}</label>
    <select id="fd-reg">${regs.map((r) => `<option value="${esc(r.key)}"${r.key === d.registry ? ' selected' : ''}>${esc(kit.regName(r))}${r.key === design.baseRegistry ? ` · ${esc(t('main.an2IsBase'))}` : ''}${noData(r) ? ` · ${esc(t('main.an2NoDataTag'))}` : ''}</option>`).join('')}</select>
    <p class="reg-field-label" data-help-key="anFdValue">${esc(t('main.an2ValueCols'))} <small>${esc(t('main.an2ValueColsHint'))}</small></p>
    ${liveBlock(d)}<div class="an-valcols">${chipsFor('v', valueFirst.map((c) => ({ value: c.key, label: c.label })), (v) => d.valueCols.includes(v), 'data-fd-val')}</div>
    ${noData(reg) ? `<p class="admin-hint">${esc(t('main.an2NoDataNotice'))}</p>` : ''}
    <p class="reg-field-label" data-help-key="anFdKey">${esc(t('main.an2KeyTitle'))} <small>${esc(t('main.an2KeyHint'))}</small></p>
    <div class="an-keymap">${keyBase.map((b) => `<span class="an-kb">${esc(baseLabel(b.col))}</span><span class="an-arrow">←</span><select data-fd-key="${esc(b.col)}" aria-label="${esc(baseLabel(b.col))}"><option value="">${esc(t('main.an2PickCol'))}</option>${cols.map((c) => `<option value="${esc(c.key)}"${d.keyMap[b.col] === c.key ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`).join('')}</div>
    ${d.kept ? `<p class="an-kept">${esc(t('main.an2KeyKept'))}</p>` : ''}
    <p class="reg-field-label" data-help-key="anFdConds">${esc(t('main.an2CondsTitle'))} <small>${esc(t('main.an2CondsHint'))}</small></p>
    <div class="an-conds">${d.conds.length ? d.conds.map((c, i) => `${i ? `<div class="an-conn"><span>${esc(t('main.an2Between'))}</span><button type="button" class="an-conn-btn${c.join !== 'or' ? ' on' : ''}" data-fd-join="${i}" data-v="and">${esc(t('main.an2And'))}</button><button type="button" class="an-conn-btn${c.join === 'or' ? ' on' : ''}" data-fd-join="${i}" data-v="or">${esc(t('main.an2Or'))}</button></div>` : ''}
        <div class="an-cond2"><select data-fd-ccol="${i}" aria-label="${esc(t('main.an2CondCol'))}">${cols.map((x) => `<option value="${esc(x.key)}"${c.col === x.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select><span>${esc(t('main.an2Is'))}</span><div class="an-msh" data-fd-cval="${i}"></div><button type="button" class="admin-icon-btn" data-fd-delcond="${i}" aria-label="${esc(t('main.an2RemoveCond'))}" title="${esc(t('main.an2RemoveCond'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>`).join('') : `<p class="admin-hint">${esc(t('main.an2NoConds'))}</p>`}</div>
    <p><button type="button" class="btn btn-secondary btn-small" data-fd-addcond><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.an2AddCond'))}</button></p>
    <label for="fd-agg" data-help-key="anFdAgg">${esc(t('main.an2AggTitle'))} <small>${esc(t('main.an2AggHint'))}</small></label>
    <select id="fd-agg">${kit.AGGS.map((a) => `<option value="${a}"${d.agg === a ? ' selected' : ''}>${esc(AGG_LABEL(a))}</option>`).join('')}</select>
    <label for="fd-label">${esc(t('main.anColLabel'))}</label><input type="text" id="fd-label" maxlength="80" autocomplete="off" value="${esc(d.label)}" placeholder="${esc(defaultLabel(d))}">
    <label for="fd-cls" data-help-key="anColClass">${esc(t('main.anColClass'))} <small>${esc(t('main.an2ClassHint'))}</small></label>
    <input type="text" id="fd-cls" maxlength="40" autocomplete="off" list="fd-cls-list" value="${esc(d.cls)}" placeholder="${esc(t('main.anColClassNone'))}"><datalist id="fd-cls-list">${known.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>
    <div class="an-swrow">${known.length ? `<span class="an-dim">${esc(t('main.an2UsedClasses'))}</span>${known.map((x) => `<button type="button" class="an-vchip-btn" data-fd-usedcls="${esc(x)}">${esc(x)}</button>`).join('')}` : ''}<span class="an-swatches">${PALETTE.map((c, i) => swatch('data-fd-clscolor', i, c, d.color === i, `${t('main.anColClassColor')} ${i + 1}`)).join('')}<label class="an-sw custom${typeof d.color === 'string' ? ' on' : ''}" data-fd-clscustomwrap${typeof d.color === 'string' ? ` style="background:${esc(d.color)}"` : ''} title="${esc(t('main.an2OtherColor'))}"><input type="color" data-fd-clscustom value="${typeof d.color === 'string' ? esc(d.color) : '#8a3590'}" aria-label="${esc(t('main.an2OtherColor'))}"></label></span></div>
    <p class="reg-field-label" data-help-key="anColFormat">${esc(t('main.anColFormat'))}</p>
    <div class="an-fmtrow">${FORMAT_ALL.map((f) => `<button type="button" class="an-vchip-btn${d.fmt === f ? ' on' : ''}" data-fd-fmt="${f}">${esc(t(`main.anFmt_${f}`))}</button>`).join('')}
        <select id="fd-fmt-more" aria-label="${esc(t('main.an2OtherFormat'))}"><option value="">${esc(t('main.an2OtherFormat'))}</option>${kit.FORMATS_MORE.map(([g, ids]) => `<optgroup label="${esc(t(`main.an2FmtGroup_${g === 'Número' ? 'num' : (g === 'Fecha y hora' ? 'date' : 'other')}`))}">${ids.map((f) => `<option value="${f}"${d.fmt === f ? ' selected' : ''}>${esc(t(`main.anFmt_${f}`))}</option>`).join('')}</optgroup>`).join('')}</select></div>
    ${d.fmt === 'pers' ? `<div class="an-pers"><input type="text" id="fd-pat" maxlength="40" value="${esc(d.pat)}" placeholder="#,##0.0000" aria-label="${esc(t('main.an2CustomFormat'))}"><span class="an-dim">${esc(t('main.an2CustomFormatHint'))}</span></div>` : ''}
    <p class="reg-field-label" data-help-key="anFdLook">${esc(t('main.an2Look'))} <small>${esc(t('main.an2LookHint'))}</small></p>
    <div class="an-fxbar"><button type="button" class="an-fxb${s.b ? ' on' : ''}" data-fd-fx="b" title="${esc(t('main.an2Bold'))}"><b>N</b></button><button type="button" class="an-fxb${s.i ? ' on' : ''}" data-fd-fx="i" title="${esc(t('main.an2Italic'))}"><i>K</i></button><button type="button" class="an-fxb${s.u ? ' on' : ''}" data-fd-fx="u" title="${esc(t('main.an2Underline'))}"><u>S</u></button><button type="button" class="an-fxb${s.s ? ' on' : ''}" data-fd-fx="s" title="${esc(t('main.an2Strike'))}"><s>T</s></button></div>
    <div class="an-swrow"><span class="an-dim an-swlab">${esc(t('main.an2HeaderColor'))}</span>${swatch('data-fd-color="hc" data-v', 0, null, s.hc === undefined, t('main.an2NoColor'))}${[1, 2, 3, 4].map((i) => swatch('data-fd-color="hc" data-v', i, PALETTE[i - 1], isPalette(s.hc, i), `${t('main.an2HeaderColor')} ${i}`)).join('')}<label class="an-sw custom" title="${esc(t('main.an2OtherColor'))}"><input type="color" data-fd-custom="hc" value="${hexOf(s.hc)}" aria-label="${esc(t('main.an2OtherColor'))}"></label></div>
    <div class="an-swrow"><span class="an-dim an-swlab">${esc(t('main.an2DataShade'))}</span>${swatch('data-fd-color="dc" data-v', 0, null, s.dc === undefined, t('main.an2NoColor'))}${[1, 2, 3, 4].map((i) => swatch('data-fd-color="dc" data-v', i, PALETTE[i - 1], isPalette(s.dc, i), `${t('main.an2DataShade')} ${i}`)).join('')}<label class="an-sw custom" title="${esc(t('main.an2OtherColor'))}"><input type="color" data-fd-custom="dc" value="${hexOf(s.dc)}" aria-label="${esc(t('main.an2OtherColor'))}"></label></div>
    <div class="an-swrow"><span class="an-dim an-swlab">${esc(t('main.an2Borders'))}</span><div class="an-fxbar">${[['all', '▦'], ['t', '▔'], ['b', '▁'], ['l', '▏'], ['r', '▕']].map(([k, ch]) => `<button type="button" class="an-fxb${bd.has(k) ? ' on' : ''}" data-fd-bd="${k}" title="${esc(t(`main.an2Bd_${k}`))}">${ch}</button>`).join('')}</div></div>
    <div class="an-swrow"><span class="an-dim an-swlab">${esc(t('main.an2Line'))}</span>${['solid', 'dotted', 'dashed', 'double', 'thick'].map((l) => `<button type="button" class="an-vchip-btn${(s.line || 'solid') === l ? ' on' : ''}" data-fd-line="${l}">${esc(t(`main.an2Line_${l}`))}</button>`).join('')}</div>
    <div class="an-swrow"><span class="an-dim an-swlab">${esc(t('main.an2LineColor'))}</span>${swatch('data-fd-color="lc" data-v', 0, null, s.lc === undefined, t('main.an2NoColor'))}${[1, 2, 3, 4].map((i) => swatch('data-fd-color="lc" data-v', i, PALETTE[i - 1], isPalette(s.lc, i), `${t('main.an2LineColor')} ${i}`)).join('')}<label class="an-sw custom" title="${esc(t('main.an2OtherColor'))}"><input type="color" data-fd-custom="lc" value="${hexOf(s.lc)}" aria-label="${esc(t('main.an2OtherColor'))}"></label></div>
    <p class="reg-field-label">${esc(t('main.an2Preview'))}</p><div class="an-fdprev" id="fd-prev"><span class="an-dim">…</span></div>`;
}

function openFileColumn(editId) {
    const design = st.design;
    if (!design || !design.baseRegistry) return;
    const d = initialState(design, editId);
    const html = `<h3>${esc(d.editing ? t('main.an2EditFileColTitle') : t('main.an2AddFileColTitle'))}</h3><div id="fd-body" class="an-fd"></div>
        <p class="admin-error" id="fd-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(d.editing ? t('main.an2Save') : t('main.anAddColumnFile'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay, close) => {
        overlay.querySelector('.exp-panel').classList.add('an-fd-panel');
        const host = overlay.querySelector('#fd-body');
        const err = (text) => { const el = overlay.querySelector('#fd-error'); el.textContent = text; el.hidden = !text; };
        const numOf = (n) => Number(n).toLocaleString(kit.lang() === 'en' ? 'en-US' : 'es-MX');
        const runPreview = debounce(async () => {
            const box = host.querySelector('#fd-prev');
            if (!box) return;
            const vals = d.valueCols.length ? d.valueCols : [];
            const lives = d.live || [];
            if (!vals.length && !lives.length && d.agg !== 'count') { box.innerHTML = `<span class="an-dim">${esc(t('main.an2PickValue'))}</span>`; return; }
            if (Object.values(d.keyMap).some((v) => !v)) { box.innerHTML = `<span class="an-dim">${esc(t('main.an2PickKey'))}</span>`; return; }
            try {
                const res = await fetch(`${API}/${st.id}/column-preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ column: columnFrom(d, 'preview', vals.slice(0, 1), vals.length ? [] : lives.slice(0, 1)) }) });
                const out = await res.json().catch(() => ({}));
                if (!res.ok) { box.innerHTML = `<span class="admin-error">${esc(P.errorText(out))}</span>`; return; }
                const rows = (out.sample || []).slice(0, 6);
                box.innerHTML = `<p><b>${esc(numOf(out.withValue))}</b> ${esc(t('main.an2PrevOf'))} <b>${esc(numOf(out.total))}</b> ${esc(t('main.an2PrevWithValue'))}</p>${rows.length ? `<div class="wp-imp-table-wrap"><table class="wp-imp-table"><thead><tr>${(out.columns || []).map((c) => `<th>${esc(c.label)}</th>`).join('')}<th>${esc(d.label || defaultLabel(d))}</th></tr></thead><tbody>${rows.map((r) => `<tr>${r.base.map((v) => `<td>${esc(v)}</td>`).join('')}<td class="col-num">${esc(kit.fmtValue(r.value, d.fmt, d.pat))}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
            } catch { box.innerHTML = ''; }
        }, 400);
        const draw = () => {
            host.innerHTML = formHtml(d, design);
            host.querySelectorAll('[data-fd-cval]').forEach((el) => {
                const i = Number(el.dataset.fdCval);
                const cond = d.conds[i];
                kit.multiSelect(el, { selected: cond.values, getOptions: (q) => kit.sourceValues(d.registry, cond.col, q), onChange: (arr) => { cond.values = arr; runPreview(); } });
            });
            runPreview();
        };
        const refreshKeys = () => { const km = suggestKeyMap(design, d.registry, d.editing); d.keyMap = km.map; d.kept = km.kept; };
        host.addEventListener('change', (event) => {
            const el = event.target;
            if (el.id === 'fd-reg') {
                d.registry = el.value; refreshKeys(); d.conds = [];
                const pick = defaultPick(d.registry); d.valueCols = pick.valueCols; d.live = pick.live;
                if (!d.labelTouched) d.label = '';
                draw(); return;
            }
            if (el.dataset.fdLive !== undefined) { d.live = el.checked ? [...(d.live || []), el.dataset.fdLive] : (d.live || []).filter((v) => v !== el.dataset.fdLive); draw(); return; }
            if (el.dataset.fdVal !== undefined) { d.valueCols = el.checked ? [...d.valueCols, el.dataset.fdVal] : d.valueCols.filter((v) => v !== el.dataset.fdVal); if (!d.labelTouched) { const ph = host.querySelector('#fd-label'); if (ph) ph.placeholder = defaultLabel(d); } runPreview(); return; }
            if (el.dataset.fdKey !== undefined) { d.keyMap[el.dataset.fdKey] = el.value; d.kept = false; runPreview(); return; }
            if (el.dataset.fdCcol !== undefined) { const c = d.conds[Number(el.dataset.fdCcol)]; c.col = el.value; c.values = []; draw(); return; }
            if (el.id === 'fd-agg') { d.agg = el.value; runPreview(); return; }
            if (el.id === 'fd-fmt-more') { if (el.value) { d.fmt = el.value; draw(); } return; }
            if (el.dataset.fdCustom) { d.style[el.dataset.fdCustom] = el.value.toLowerCase(); draw(); return; }
            if (el.dataset.fdClscustom !== undefined) { d.color = el.value.toLowerCase(); d.colorTouched = true; draw(); } // cualquier color para la clasificación
        });
        host.addEventListener('input', (event) => {
            const el = event.target;
            if (el.id === 'fd-label') { d.label = el.value; d.labelTouched = true; return; }
            if (el.id === 'fd-cls') {
                d.cls = el.value; if (!d.colorTouched) d.color = el.value.trim() ? P.colorOfClass(el.value.trim(), d.editing) : null;
                host.querySelectorAll('[data-fd-clscolor]').forEach((b) => { const on = Number(b.dataset.fdClscolor) === d.color; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
                const custom = host.querySelector('[data-fd-clscustomwrap]'); // el círculo multicolor: con el color elegido cuando la clasificación usa uno propio
                if (custom) { const hex = typeof d.color === 'string'; custom.classList.toggle('on', hex); custom.style.background = hex ? d.color : ''; const picker = custom.querySelector('input'); if (picker && hex) picker.value = d.color; }
                return;
            }
            if (el.id === 'fd-pat') { d.pat = el.value; runPreview(); }
        });
        host.addEventListener('click', (event) => {
            const b = event.target.closest('button');
            if (!b) return;
            if (b.dataset.fdAddcond !== undefined) { const cols = colsOf(sourceOf(d.registry)); d.conds.push({ col: (cols.find((c) => c.kind !== 'value') || cols[0] || {}).key || '', values: [], join: 'and' }); draw(); return; }
            if (b.dataset.fdDelcond !== undefined) { d.conds.splice(Number(b.dataset.fdDelcond), 1); draw(); return; }
            if (b.dataset.fdJoin !== undefined) { d.conds[Number(b.dataset.fdJoin)].join = b.dataset.v; draw(); return; }
            if (b.dataset.fdFmt) { d.fmt = b.dataset.fdFmt; draw(); return; }
            if (b.dataset.fdUsedcls !== undefined) { d.cls = b.dataset.fdUsedcls; d.color = P.colorOfClass(d.cls, d.editing); d.colorTouched = false; draw(); return; }
            if (b.dataset.fdClscolor !== undefined) { d.color = Number(b.dataset.fdClscolor); d.colorTouched = true; draw(); return; }
            if (b.dataset.fdFx) { const k = b.dataset.fdFx; if (d.style[k]) delete d.style[k]; else d.style[k] = true; draw(); return; }
            if (b.dataset.fdColor) { const k = b.dataset.fdColor; const v = Number(b.dataset.v || 0); if (!v) delete d.style[k]; else d.style[k] = v; draw(); return; }
            if (b.dataset.fdBd) { const k = b.dataset.fdBd; const set = new Set(d.style.bd || []); if (set.has(k)) set.delete(k); else set.add(k); if (set.size) d.style.bd = [...set]; else delete d.style.bd; draw(); return; }
            if (b.dataset.fdLine) { if (b.dataset.fdLine === 'solid') delete d.style.line; else d.style.line = b.dataset.fdLine; draw(); }
        });
        draw();
        overlay.querySelector('[data-an-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget;
            err('');
            if (!d.valueCols.length && !(d.live || []).length && d.agg !== 'count') { err(t('main.anErr_COL_VALUE')); return; }
            if (Object.values(d.keyMap).some((v) => !v)) { err(t('main.anErr_COL_KEY')); return; }
            btn.disabled = true;
            try {
                const stamp = Date.now().toString(36);
                let list;
                if (d.editing) {
                    const entry = columnFrom(d, d.editing.id, d.valueCols, d.live || []);
                    list = (design.columns || []).map((c) => (c.id === d.editing.id ? entry : c));
                } else {
                    // cada columna de valor elegida (una carga concreta o «la más reciente») es una columna nueva
                    const picks = [...d.valueCols.map((v) => ({ v })), ...(d.live || []).map((l) => ({ l }))];
                    if (!picks.length) picks.push({});
                    const many = picks.length > 1;
                    const added = picks.map((p, k) => {
                        const entry = columnFrom(d, `f${stamp}${k}`, p.v ? [p.v] : [], p.l ? [p.l] : []);
                        if (many) entry.label = `${(d.label || '').trim() ? `${d.label.trim()} ` : ''}${p.v ? labelOfCol(d.registry, p.v) : liveName(liveOpts(d.registry).find((o) => o.id === p.l) || { id: p.l })}`.slice(0, 80);
                        return entry;
                    });
                    list = [...(design.columns || []), ...added];
                }
                // el mismo nombre lleva el mismo color: también en las columnas de Operación y Criterio (las agrega el servidor al guardar)
                const repaint = d.cls.trim() && d.colorTouched && kit.hasClassColor(d.color);
                if (repaint) P.paintClass(d.cls.trim(), d.color);
                await P.saveColumns(list, repaint ? { paint: { cls: d.cls.trim(), color: d.color } } : {});
                close();
            } catch (e) { btn.disabled = false; err(P.errorText(e.body)); }
        });
    });
}

// ---------------------------------------------------------------------------------------------- «Columnas base»
function openBase() {
    const design = st.design;
    if (!design || !design.baseRegistry) return;
    const src = sourceOf(design.baseRegistry);
    const all = colsOf(src).filter((c) => c.kind !== 'load');
    let base = (design.base || []).map((b) => ({ ...b }));
    let dedupe = design.dedupe === 'con' ? 'con' : 'sin';
    const html = `<h3>${esc(t('main.an2BaseTitle'))}</h3><p class="admin-hint">${esc(kit.regName(src) || '')}</p>
        <p class="reg-field-label">${esc(t('main.an2BaseCols'))}</p><div class="an-basecols" id="bd-cols"></div>
        <p class="reg-field-label">${esc(t('main.an2RowsOfKey'))}</p>
        <div class="an-opts"><label class="an-opt"><input type="radio" name="bd-dedupe" value="sin"><span><b>${esc(t('main.an2NoDup'))}</b></span></label><label class="an-opt"><input type="radio" name="bd-dedupe" value="con"><span><b>${esc(t('main.an2Dup'))}</b><small>${esc(t('main.an2DupHint'))}</small></span></label></div>
        <p class="admin-error" id="bd-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-an-go>${esc(t('main.an2Save'))}</button><button type="button" class="btn btn-secondary" data-an-close>${esc(t('main.regCancel'))}</button></div>`;
    modal(html, (overlay, close) => {
        const labelOf = (key) => (all.find((c) => c.key === key) || {}).label || key;
        const err = (text) => { const el = overlay.querySelector('#bd-error'); el.textContent = text; el.hidden = !text; };
        overlay.querySelectorAll('input[name="bd-dedupe"]').forEach((r) => { r.checked = r.value === dedupe; r.addEventListener('change', () => { dedupe = r.value; }); });
        const draw = () => {
            const chosen = new Set(base.map((b) => b.col));
            const rest = all.filter((c) => !chosen.has(c.key));
            overlay.querySelector('#bd-cols').innerHTML = `${base.map((b) => `<span class="an-bchip${b.key ? ' an-bchip-key' : ''}"><label class="an-bname"><input type="checkbox" data-an-bcol="${esc(b.col)}" checked><span>${esc(labelOf(b.col))}</span></label><button type="button" class="an-bkey${b.key ? ' on' : ''}" data-an-bkey="${esc(b.col)}" aria-pressed="${b.key ? 'true' : 'false'}">${esc(t('main.an2Key'))}</button></span>`).join('')}${rest.length ? `<span class="an-addwrap"><button type="button" class="an-bchip an-bchip-add" data-an-bmore aria-haspopup="true">${esc(t('main.an2AddCol'))} <i class="bx bx-chevron-down" aria-hidden="true"></i></button><span class="an-addmenu an-bmenu" hidden>${rest.map((c) => `<button type="button" data-an-bpick="${esc(c.key)}">${esc(c.label)}</button>`).join('')}</span></span>` : ''}`;
        };
        overlay.addEventListener('click', (event) => {
            const keyBtn = event.target.closest('[data-an-bkey]'); const pick = event.target.closest('[data-an-bpick]'); const more = event.target.closest('[data-an-bmore]'); const box = event.target.closest('[data-an-bcol]');
            const menu = overlay.querySelector('.an-bmenu');
            if (menu && !more) menu.hidden = true;
            if (keyBtn) { const b = base.find((x) => x.col === keyBtn.dataset.anBkey); if (b) { b.key = !b.key; draw(); } }
            else if (pick) { base.push({ col: pick.dataset.anBpick, key: false }); draw(); }
            else if (more && menu) { menu.hidden = !menu.hidden; event.stopPropagation(); }
            else if (box) { event.preventDefault(); base = base.filter((x) => x.col !== box.dataset.anBcol); draw(); }
        });
        draw();
        overlay.querySelector('[data-an-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget;
            if (!base.some((b) => b.key)) { err(t('main.an2NeedKey')); return; }
            btn.disabled = true; err('');
            try { await P.saveColumns(design.columns || [], { base, dedupe }); close(); } catch (e) { btn.disabled = false; err(P.errorText(e.body)); }
        });
    });
}

P.openFileColumn = openFileColumn;
P.openBase = openBase;
})();
