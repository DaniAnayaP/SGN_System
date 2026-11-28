// «Mi personalización de Descarga» (Daniel, 2026-11-28, «Sí a las recomendadas en todo», maqueta mi-personalizacion-descarga-v2): el cuadro que se abre al descargar (formato, mi personalización, lo que cada formato permite
// ajustar y «Así queda») y el administrador de mis personalizaciones (icono nuevo junto al de Descargar). Lo carga Dashboard.js cuando hace falta (attachTableDownloadButton). El servidor guarda y revisa cada personalización
// (downloadPresets.js / downloadPresetsApi.js); aquí solo se arma el cuadro y se dice a la descarga cuál aplicar: { preset: 'factory' | id } (una guardada), { p: <JSON> } (con cambios o la del registro) o {} (nada elegido: sale como siempre).
(function () {
    'use strict';
    const API = '/api/business/download-presets';
    const LAST_KEY = 'sgn_dl_last';
    // La de fábrica «Como siempre» (la misma de downloadPresets.js)
    const FACTORY = {
        v: 1, title: '', date: true, logo: true, general: true, kpis: true, fill: '#9a3cc2', ink: '#ffffff', bold: true, filter: true, keyFill: true, freeze: true, frozenHeader: true,
        dec: 'screen', miles: null, neg: 'normal', sep: ',', enc: 'bom', csvTitle: false, orient: 'v', paper: 'carta', foot: false, lines: [],
    };
    const FILLS = [['#9a3cc2', 'dlFillPurple'], ['#2f6fb0', 'dlFillBlue'], ['#2b8456', 'dlFillGreen'], ['#6b7280', 'dlFillGray'], [null, 'dlFillNone']];
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const T = (key, params) => (window.Dashboard && window.Dashboard.t ? window.Dashboard.t(`main.${key}`, params) : key);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const toast = (message, type) => { if (window.Dashboard && window.Dashboard.showToast) window.Dashboard.showToast(message, type || 'info'); };
    const full = (preset) => Object.assign(clone(FACTORY), preset || {});
    const same = (a, b) => JSON.stringify(full(a)) === JSON.stringify(full(b));
    const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    // ---- lo que dice el servidor -----------------------------------------------------------------------------------------------------------------------------
    let cache = null; // { available, presets: [{ id, name, preset }], active: null | 'factory' | id }
    const registryCache = new Map(); // llave del registro → { preset, canEdit } | null
    async function api(method, path, body) {
        const res = await fetch(path, { method, credentials: 'include', headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined });
        let json = null; try { json = await res.json(); } catch (e) { /* sin cuerpo */ }
        if (!res.ok) { const err = new Error((json && json.message) || 'dl'); err.code = json && json.code; throw err; }
        return json;
    }
    async function load(force) {
        if (cache && !force) return cache;
        try { cache = await api('GET', API); } catch (e) { cache = { available: false, presets: [], active: null }; }
        return cache;
    }
    async function loadRegistry(key, force) {
        if (!key) return null;
        if (registryCache.has(key) && !force) return registryCache.get(key);
        let out = null;
        try { const r = await api('GET', `/api/business/manual-registries/${encodeURIComponent(key)}/download-preset`); out = { preset: r.preset, canEdit: !!r.canEdit }; } catch (e) { out = null; }
        registryCache.set(key, out);
        return out;
    }
    const changed = () => document.dispatchEvent(new CustomEvent('download-presets:changed'));
    // Cuál tiene la persona al descargar: { kind: 'own' | 'factory' | 'registry' | 'default', id, name, preset }
    function chosenOf(state, registry) {
        if (state.active === 'factory') return { kind: 'factory', name: T('dlFactory'), preset: full(FACTORY) };
        if (Number.isInteger(state.active)) {
            const mine = state.presets.find((p) => p.id === state.active);
            if (mine) return { kind: 'own', id: mine.id, name: mine.name, preset: full(mine.preset) };
        }
        if (registry && registry.preset) return { kind: 'registry', name: T('dlFromRegistry'), preset: full(registry.preset) };
        return { kind: 'default', name: T('dlFactory'), preset: full(FACTORY) };
    }
    // El texto de la etiqueta «Descarga con: X» junto al icono
    async function pillText(registryKey) {
        const state = await load();
        if (!state.available) return '';
        const reg = await loadRegistry(registryKey);
        return T('dlPill', { name: chosenOf(state, reg).name });
    }

    // ---- lo que cada formato deja ajustar (según la tabla que baja) ----------------------------------------------------------------------------------------------
    // kind: 'flex' (registro de tabla libre), 'fixed' (registro de siempre), 'analysis' (Excel de Análisis) o 'generic' (el Excel y el PDF de las demás pantallas: celdas de texto).
    function allowed(field, format, kind) {
        const numeric = kind === 'flex' || kind === 'fixed' || kind === 'analysis';
        switch (field) {
            case 'title': return true;
            case 'date': case 'general': case 'kpis': case 'keyFill': case 'freeze': return format === 'xlsx' && kind === 'flex';
            case 'fill': case 'ink': case 'bold': return format === 'xlsx' || format === 'pdf';
            case 'filter': case 'frozenHeader': return format === 'xlsx';
            case 'dec': return (format === 'xlsx' && numeric) || (format === 'csv' && (kind === 'flex' || kind === 'fixed'));
            case 'miles': case 'neg': return format === 'xlsx' && numeric;
            case 'sep': case 'enc': case 'csvTitle': return format === 'csv';
            case 'orient': case 'paper': case 'foot': return format === 'pdf';
            default: return false;
        }
    }
    const SECTIONS = [
        { id: 't', name: 'dlSecTitle', fields: ['title', 'date', 'general', 'kpis'] },
        { id: 'h', name: 'dlSecHeader', fields: ['fill', 'ink', 'bold', 'filter'] },
        { id: 'c', name: 'dlSecColumns', fields: ['keyFill', 'freeze', 'frozenHeader'] },
        { id: 'n', name: 'dlSecNumbers', fields: ['dec', 'miles', 'neg'] },
        { id: 'a', name: 'dlSecFile', fields: ['sep', 'enc', 'csvTitle'] },
        { id: 'p', name: 'dlSecSheet', fields: ['orient', 'paper', 'foot'] },
    ];

    // ---- «Así queda»: la vista previa con los primeros renglones de la tabla --------------------------------------------------------------------------------------
    function numberOf(text) { const t = String(text == null ? '' : text).trim().replace(/,/g, ''); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; }
    function numberView(text, P) {
        const n = numberOf(text);
        if (n === null) return { text: String(text == null ? '' : text), neg: false };
        const original = String(text).trim();
        const decOriginal = (original.split('.')[1] || '').length;
        const dec = P.dec === 'screen' ? decOriginal : P.dec;
        let body = Math.abs(n).toFixed(dec);
        if (P.miles === true || (P.miles === null && original.includes(','))) { const [whole, frac] = body.split('.'); body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac !== undefined ? `.${frac}` : ''); }
        const negative = n < 0;
        if (negative && P.neg === 'par') return { text: `(${body})`, neg: false };
        return { text: (negative ? '-' : '') + body, neg: negative && P.neg === 'rojo' };
    }
    function previewHtml(P, format, kind, snap) {
        // hasta 5 columnas: las primeras y, si la tabla trae columnas de números más allá, las dos primeras de ellas (para que los decimales se vean)
        const numIdx = snap.columns.map((c, i) => (c.num ? i : -1)).filter((i) => i >= 0);
        let idx = snap.columns.map((c, i) => i).slice(0, 5);
        if (numIdx.length && !idx.some((i) => numIdx.includes(i))) idx = [...idx.slice(0, 3), ...numIdx.slice(0, 2)];
        const cols = idx.map((i) => snap.columns[i]);
        const rows = snap.rows.slice(0, 4).map((r) => idx.map((i) => r[i]));
        const title = P.title || '';
        if (format === 'csv') {
            const sep = P.sep === '\t' ? '→' : P.sep;
            const line = (cells) => cells.map((c) => esc(String(c).includes(P.sep) ? `"${c}"` : c)).join(`<i>${esc(sep)}</i>`);
            const lines = [];
            if (P.csvTitle) lines.push(esc(title || snap.title || ''));
            lines.push(line(cols.map((c) => c.label)));
            rows.slice(0, 3).forEach((r) => lines.push(line(r.slice(0, cols.length))));
            return `<pre class="dl-csv">${lines.join('\n')}</pre><span class="dl-chip">${esc(P.enc === 'bom' ? T('dlEncBom') : T('dlEncPlain'))}</span>`;
        }
        const head = cols.map((c, i) => `<th style="${P.fill ? `background:${P.fill};` : ''}color:${P.ink};font-weight:${P.bold ? 700 : 400}">${esc(c.label)}${format === 'xlsx' && P.filter ? '<b>▾</b>' : ''}</th>`).join('');
        const keyCls = (i) => (format === 'xlsx' && kind === 'flex' && P.keyFill && i === 0 ? ' class="dl-key"' : '');
        const body = rows.map((r) => `<tr>${cols.map((c, i) => { const v = cols[i].num ? numberView(r[i], P) : { text: String(r[i] == null ? '' : r[i]), neg: false }; return `<td${keyCls(i)}${v.neg ? ' style="color:#c00000"' : ''}>${esc(v.text)}</td>`; }).join('')}</tr>`).join('');
        const titleRow = title ? `<tr><td class="dl-ttl" colspan="${cols.length || 1}">${esc(title)}</td></tr>` : '';
        if (format === 'pdf') {
            const ratio = P.orient === 'h' ? 'landscape' : 'portrait';
            const paper = { carta: T('dlPaperLetter'), a4: 'A4', legal: T('dlPaperLegal') }[P.paper] || '';
            const foot = P.foot ? `<div class="dl-foot"><span>${esc(new Date().toISOString().slice(0, 10))}</span><span>1 / 1</span></div>` : '';
            return `<div class="dl-page ${ratio}">${title ? `<div class="dl-pt">${esc(title)}</div>` : ''}<table class="dl-xl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${foot}</div><span class="dl-chip">${esc(paper)} · ${esc(P.orient === 'h' ? T('dlOrientH') : T('dlOrientV'))}</span>`;
        }
        const cover = kind === 'flex' ? `<div class="dl-cover">${[[P.date, 'dlDate'], [P.general, 'dlGeneral'], [P.kpis, 'dlKpis']].filter((x) => x[0]).map((x) => `<span class="dl-chip">${esc(T(x[1]))}</span>`).join('')}</div>` : '';
        return `<div class="dl-scr"><table class="dl-xl"><thead>${titleRow}<tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${cover}`;
    }

    // ---- el cuadro de Descargar -------------------------------------------------------------------------------------------------------------------------------------
    // opts: { format, kind | kindOf(format), registryKey, snapshot: { columns: [{label}], rows: [[texto]] }, title, onDownload({ format, preset, param }) }
    async function open(opts) {
        const state = await load();
        if (!state.available) { opts.onDownload({ format: opts.format, preset: null, param: {} }); return; }
        const reg = await loadRegistry(opts.registryKey);
        const snap = Object.assign({ columns: [], rows: [] }, opts.snapshot || {}, { title: opts.title || '' });
        let format = opts.format || 'xlsx';
        const kindFor = (f) => (opts.kindOf ? opts.kindOf(f) : opts.kind) || 'generic';
        let kind = kindFor(format);
        const initial = chosenOf(state, reg);
        let sel = initial.kind === 'own' ? `own:${initial.id}` : initial.kind === 'factory' ? 'factory' : initial.kind === 'registry' ? 'registry' : 'default';
        let P = clone(initial.preset);
        let base = clone(initial.preset); // con lo que se compara para saber si hay cambios
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal-panel dl-dialog" role="dialog" aria-modal="true" aria-labelledby="dl-title" style="max-width: 62rem;">
            <div class="dl-head"><h3 id="dl-title">${esc(T('dlDialogTitle'))}</h3><div class="dl-fmts" role="tablist" aria-label="${esc(T('dlDialogTitle'))}">
                ${['xlsx', 'csv', 'pdf'].map((f) => `<button type="button" role="tab" data-f="${f}" aria-selected="false">${esc(T(`dlFmt_${f}`))}</button>`).join('')}</div>
                <button type="button" class="dl-x" data-act="close" aria-label="${esc(T('dlClose'))}">×</button></div>
            <div class="dl-body"><div class="dl-left"><div class="dl-mine"><label for="dl-pre">${esc(T('dlMine'))}</label><select id="dl-pre" class="dl-field"></select><span class="dl-mod" id="dl-mod" hidden>${esc(T('dlChanged'))}</span></div><div id="dl-secs"></div></div>
            <div class="dl-right"><span class="dl-tag">${esc(T('dlPreview'))}</span><div id="dl-prev"></div></div></div>
            <div class="dl-foot-bar"><button type="button" class="btn dl-go" data-act="go">${esc(T('dlGo'))}</button>
                <button type="button" class="btn btn-secondary dl-btn" data-act="save">${esc(T('dlSaveAs'))}</button>
                <span class="dl-saverow" id="dl-saverow" hidden><input class="dl-field" id="dl-name" type="text" maxlength="60" placeholder="${esc(T('dlSaveName'))}" aria-label="${esc(T('dlSaveName'))}"><button type="button" class="btn" id="dl-saveok" data-act="saveok">${esc(T('dlSave'))}</button></span>
                ${reg && reg.canEdit ? `<button type="button" class="btn btn-secondary dl-btn" data-act="regsave">${esc(T('dlSaveRegistry'))}</button>` : ''}
                <span class="dl-msg" id="dl-msg" role="status"></span></div></div>`;
        document.body.appendChild(overlay);
        const $ = (sel2) => overlay.querySelector(sel2);
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
        const say = (m, bad) => { const el = $('#dl-msg'); el.textContent = m || ''; el.classList.toggle('bad', !!bad); };

        const drawSelect = () => {
            const rows = [];
            rows.push(['factory', T('dlFactory')]);
            if (reg && reg.preset) rows.push(['registry', T('dlFromRegistry')]);
            state.presets.forEach((p) => rows.push([`own:${p.id}`, p.name + (state.active === p.id ? ` (${T('dlUsing')})` : '')]));
            const sel2 = $('#dl-pre');
            sel2.innerHTML = rows.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
            sel2.value = sel === 'default' ? (reg && reg.preset ? 'registry' : 'factory') : sel;
        };
        const field = (id, label, inner) => `<div class="dl-row" data-f="${id}"><span class="dl-l">${esc(label)}</span><div class="dl-c">${inner}</div></div>`;
        const seg = (key, opts2) => `<span class="dl-seg" role="group">${opts2.map(([v, label, extra]) => `<button type="button" data-k="${key}" data-v="${esc(JSON.stringify(v))}" aria-pressed="${JSON.stringify(P[key]) === JSON.stringify(v)}"${extra ? ` style="${extra}"` : ''}>${esc(label)}</button>`).join('')}</span>`;
        const chk = (key, label) => `<label class="dl-chk"><input type="checkbox" data-k="${key}" ${P[key] ? 'checked' : ''}><span>${esc(label)}</span></label>`;
        const FIELD_HTML = {
            title: () => field('title', T('dlTitle'), `<input class="dl-field dl-wide" data-k="title" type="text" maxlength="120" value="${esc(P.title)}" placeholder="${esc(T('dlTitlePh'))}" aria-label="${esc(T('dlTitle'))}">`),
            date: () => '', general: () => '', kpis: () => '',
            fill: () => field('fill', T('dlFill'), seg('fill', FILLS.map(([hex, key]) => [hex, T(key), hex ? `--sw:${hex}` : '']))),
            ink: () => field('ink', T('dlInk'), seg('ink', [['#ffffff', T('dlInkWhite')], ['#111111', T('dlInkBlack')]])),
            bold: () => '', filter: () => '', keyFill: () => '', freeze: () => '', frozenHeader: () => '',
            dec: () => field('dec', T('dlDec'), seg('dec', [['screen', T('dlDecScreen')], [0, '0'], [1, '1'], [2, '2']])),
            miles: () => field('miles', T('dlMiles'), seg('miles', [[null, T('dlMilesAuto')], [true, T('dlMilesYes')], [false, T('dlMilesNo')]])),
            neg: () => field('neg', T('dlNeg'), seg('neg', [['normal', T('dlNegNormal')], ['rojo', T('dlNegRed')], ['par', T('dlNegPar')]])),
            sep: () => field('sep', T('dlSep'), seg('sep', [[',', T('dlSepComma')], [';', T('dlSepSemi')], ['\t', T('dlSepTab')], ['|', T('dlSepPipe')]])),
            enc: () => field('enc', T('dlEnc'), seg('enc', [['bom', T('dlEncBom')], ['plain', T('dlEncPlain')]])),
            csvTitle: () => '',
            orient: () => field('orient', T('dlOrient'), seg('orient', [['v', T('dlOrientV')], ['h', T('dlOrientH')]])),
            paper: () => field('paper', T('dlPaper'), seg('paper', [['carta', T('dlPaperLetter')], ['a4', 'A4'], ['legal', T('dlPaperLegal')]])),
            foot: () => '',
        };
        // los casilleros van juntos en una sola fila por sección
        const CHECKS = { t: [['date', 'dlDate'], ['general', 'dlGeneral'], ['kpis', 'dlKpis']], h: [['bold', 'dlBold'], ['filter', 'dlFilter']], c: [['keyFill', 'dlKeyFill'], ['freeze', 'dlFreeze'], ['frozenHeader', 'dlFrozenHeader']], a: [['csvTitle', 'dlCsvTitle']], p: [['foot', 'dlFoot']] };
        let openSec = 'h';
        const drawSections = () => {
            const box = $('#dl-secs');
            box.innerHTML = '';
            SECTIONS.forEach((s) => {
                const fields = s.fields.filter((f) => allowed(f, format, kind));
                if (!fields.length) return;
                const d = document.createElement('details');
                d.dataset.id = s.id;
                d.open = s.id === openSec;
                const rowsHtml = fields.map((f) => FIELD_HTML[f]()).join('');
                const checks = (CHECKS[s.id] || []).filter(([f]) => allowed(f, format, kind));
                d.innerHTML = `<summary><b>${esc(T(s.name))}</b></summary><div class="dl-fields">${rowsHtml}${checks.length ? field(`${s.id}-chk`, T('dlOptions'), `<span class="dl-checks">${checks.map(([f, label]) => chk(f, T(label))).join('')}</span>`) : ''}</div>`;
                d.addEventListener('toggle', () => { if (d.open) openSec = s.id; });
                box.appendChild(d);
            });
        };
        const dirty = () => !same(P, base);
        const drawPreview = () => { $('#dl-prev').innerHTML = previewHtml(P, format, kind, snap); $('#dl-mod').hidden = !dirty(); };
        const drawTabs = () => overlay.querySelectorAll('.dl-fmts [data-f]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.f === format)));
        const redraw = () => { drawTabs(); drawSelect(); drawSections(); drawPreview(); };
        const loadSel = (value) => {
            sel = value;
            if (value === 'factory') P = full(FACTORY);
            else if (value === 'registry') P = full(reg && reg.preset);
            else { const p = state.presets.find((x) => `own:${x.id}` === value); P = full(p && p.preset); }
            base = clone(P);
        };
        overlay.addEventListener('change', (e) => {
            const el = e.target;
            if (el.id === 'dl-pre') { loadSel(el.value); drawSections(); drawPreview(); say(''); return; }
            if (el.matches && el.matches('input[type=checkbox][data-k]')) { P[el.dataset.k] = el.checked; drawPreview(); }
        });
        overlay.addEventListener('input', (e) => {
            const el = e.target;
            if (el.matches && el.matches('input[type=text][data-k]')) { P[el.dataset.k] = el.value; drawPreview(); }
            if (el.id === 'dl-name') { const taken = state.presets.some((p) => fold(p.name) === fold(el.value)); $('#dl-saveok').textContent = taken ? T('dlReplace') : T('dlSave'); }
        });
        // lo que se manda a la descarga: una guardada por su id, «Como siempre», o la personalización completa cuando tiene cambios (o es la del registro y la persona no eligió otra)
        const paramOf = () => {
            if (dirty()) return { p: JSON.stringify(P) };
            if (sel.startsWith('own:')) return { preset: Number(sel.slice(4)) };
            if (sel === 'factory') return state.active === null && !(reg && reg.preset) ? {} : { preset: 'factory' };
            if (sel === 'registry') return state.active === null ? {} : { p: JSON.stringify(P) };
            return {};
        };
        const remember = () => { try { localStorage.setItem(LAST_KEY, JSON.stringify(P)); } catch (e) { /* sin almacenamiento */ } };
        overlay.addEventListener('click', async (e) => {
            const tab = e.target.closest('.dl-fmts [data-f]');
            if (tab) { format = tab.dataset.f; kind = kindFor(format); redraw(); return; }
            const pick = e.target.closest('button[data-k]');
            if (pick) { P[pick.dataset.k] = JSON.parse(pick.dataset.v); overlay.querySelectorAll(`button[data-k="${pick.dataset.k}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b === pick))); drawPreview(); return; }
            const act = e.target.closest('[data-act]');
            if (!act) return;
            const what = act.dataset.act;
            if (what === 'close') { close(); return; }
            if (what === 'go') { const param = paramOf(); remember(); close(); opts.onDownload({ format, preset: clone(P), param }); return; }
            if (what === 'save') { const row = $('#dl-saverow'); row.hidden = !row.hidden; if (!row.hidden) $('#dl-name').focus(); return; }
            if (what === 'saveok') {
                const name = $('#dl-name').value.trim();
                if (!name) { say(T('dlNameNeeded'), true); return; }
                try {
                    const existing = state.presets.find((p) => fold(p.name) === fold(name));
                    const out = existing ? await api('PUT', `${API}/${existing.id}`, { preset: P }) : await api('POST', API, { name, preset: P });
                    const id = existing ? existing.id : out.id;
                    await api('PUT', `${API}/active`, { id });
                    Object.assign(state, await load(true));
                    const saved = state.presets.find((p) => p.id === id);
                    sel = `own:${id}`; P = full(saved && saved.preset); base = clone(P);
                    $('#dl-saverow').hidden = true; $('#dl-name').value = '';
                    redraw(); changed(); say(T('dlSaved', { name }));
                } catch (err) { say(err.code === 'TOO_MANY' ? T('dlTooMany') : T('dlError'), true); }
                return;
            }
            if (what === 'regsave') {
                try {
                    await api('PUT', `/api/business/manual-registries/${encodeURIComponent(opts.registryKey)}/download-preset`, { preset: P });
                    registryCache.delete(opts.registryKey);
                    Object.assign(reg, await loadRegistry(opts.registryKey, true));
                    sel = 'registry'; base = clone(P); redraw(); changed(); say(T('dlRegistrySaved'));
                } catch (err) { say(T('dlError'), true); }
            }
        });
        redraw();
        const first = $('.dl-fmts [aria-selected="true"]'); if (first) first.focus();
    }

    // ---- el administrador: mis personalizaciones (el icono nuevo) --------------------------------------------------------------------------------------------------
    // opts: { registryKey }
    async function manage(opts) {
        opts = opts || {};
        let state = await load(true);
        if (!state.available) return;
        let reg = await loadRegistry(opts.registryKey, true);
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal-panel dl-manage" role="dialog" aria-modal="true" aria-labelledby="dlm-title" style="max-width: 40rem;"><div class="dl-head"><h3 id="dlm-title">${esc(T('dlManageTitle'))}</h3><button type="button" class="dl-x" data-act="close" aria-label="${esc(T('dlClose'))}">×</button></div>
            <div class="dl-list" id="dlm-list"></div>
            <div class="dl-foot-bar"><button type="button" class="btn btn-secondary dl-btn" data-act="new">${esc(T('dlNewFromLast'))}</button><span class="dl-saverow" id="dlm-newrow" hidden><input class="dl-field" id="dlm-name" type="text" maxlength="60" placeholder="${esc(T('dlSaveName'))}" aria-label="${esc(T('dlSaveName'))}"><button type="button" class="btn" data-act="newok">${esc(T('dlSave'))}</button></span><span class="dl-msg" id="dlm-msg" role="status"></span></div></div>`;
        document.body.appendChild(overlay);
        const $ = (s) => overlay.querySelector(s);
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
        const say = (m, bad) => { const el = $('#dlm-msg'); el.textContent = m || ''; el.classList.toggle('bad', !!bad); };
        let renaming = null; let deleting = null;
        const chosen = () => chosenOf(state, reg);
        const draw = () => {
            const c = chosen();
            const row = (key, name, badge, inUse, extra) => `<div class="dl-item" data-key="${esc(key)}"><span class="dl-nm">${esc(name)}</span>${badge ? `<span class="dl-badge">${esc(badge)}</span>` : ''}${inUse ? `<span class="dl-badge on">${esc(T('dlInUse'))}</span>` : `<button type="button" class="dl-mini" data-act="use" data-key="${esc(key)}">${esc(T('dlUse'))}</button>`}${extra || ''}</div>`;
            const parts = [];
            parts.push(row('factory', T('dlFactory'), T('dlFactoryBadge'), c.kind === 'factory' || c.kind === 'default'));
            if (reg && reg.preset) parts.push(row('registry', T('dlFromRegistry'), T('dlRegistryBadge'), c.kind === 'registry', reg.canEdit ? `<button type="button" class="dl-mini" data-act="regdel">${esc(T('dlRegistryRemove'))}</button>` : ''));
            state.presets.forEach((p) => {
                const key = `own:${p.id}`;
                if (renaming === p.id) { parts.push(`<div class="dl-item" data-key="${esc(key)}"><input class="dl-field dl-wide" id="dlm-ren" type="text" maxlength="60" value="${esc(p.name)}" aria-label="${esc(T('dlRename'))}"><button type="button" class="btn" data-act="renok" data-id="${p.id}">${esc(T('dlSave'))}</button><button type="button" class="dl-mini" data-act="rencancel">${esc(T('dlNo'))}</button></div>`); return; }
                const tools = deleting === p.id
                    ? `<span class="dl-sure">${esc(T('dlDeleteSure'))}</span><button type="button" class="dl-mini bad" data-act="delok" data-id="${p.id}">${esc(T('dlYes'))}</button><button type="button" class="dl-mini" data-act="delcancel">${esc(T('dlNo'))}</button>`
                    : `<button type="button" class="dl-mini" data-act="ren" data-id="${p.id}">${esc(T('dlRename'))}</button><button type="button" class="dl-mini" data-act="del" data-id="${p.id}">${esc(T('dlDelete'))}</button>`;
                parts.push(row(key, p.name, '', c.kind === 'own' && c.id === p.id, tools));
            });
            $('#dlm-list').innerHTML = parts.join('');
        };
        const refresh = async () => { state = await load(true); changed(); draw(); };
        overlay.addEventListener('click', async (e) => {
            const act = e.target.closest('[data-act]');
            if (!act) return;
            const what = act.dataset.act;
            try {
                if (what === 'close') { close(); return; }
                if (what === 'use') {
                    const key = act.dataset.key;
                    await api('PUT', `${API}/active`, { id: key === 'factory' ? 'factory' : key === 'registry' ? null : Number(key.slice(4)) });
                    await refresh(); say(''); return;
                }
                if (what === 'ren') { renaming = Number(act.dataset.id); deleting = null; draw(); const input = $('#dlm-ren'); if (input) { input.focus(); input.select(); } return; }
                if (what === 'rencancel') { renaming = null; draw(); return; }
                if (what === 'renok') {
                    const name = $('#dlm-ren').value.trim();
                    if (!name) { say(T('dlNameNeeded'), true); return; }
                    await api('PUT', `${API}/${act.dataset.id}`, { name }); renaming = null; await refresh(); say(''); return;
                }
                if (what === 'del') { deleting = Number(act.dataset.id); renaming = null; draw(); return; }
                if (what === 'delcancel') { deleting = null; draw(); return; }
                if (what === 'delok') { await api('DELETE', `${API}/${act.dataset.id}`); deleting = null; await refresh(); say(''); return; }
                if (what === 'regdel') {
                    await api('DELETE', `/api/business/manual-registries/${encodeURIComponent(opts.registryKey)}/download-preset`);
                    registryCache.delete(opts.registryKey); reg = await loadRegistry(opts.registryKey, true); await refresh(); return;
                }
                if (what === 'new') { const row = $('#dlm-newrow'); row.hidden = !row.hidden; if (!row.hidden) $('#dlm-name').focus(); return; }
                if (what === 'newok') {
                    const name = $('#dlm-name').value.trim();
                    if (!name) { say(T('dlNameNeeded'), true); return; }
                    let last = FACTORY; try { last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null') || FACTORY; } catch (err) { last = FACTORY; }
                    await api('POST', API, { name, preset: last });
                    $('#dlm-newrow').hidden = true; $('#dlm-name').value = '';
                    await refresh(); say(T('dlSaved', { name }));
                }
            } catch (err) { say(err.code === 'NAME_TAKEN' ? T('dlNameTaken') : err.code === 'TOO_MANY' ? T('dlTooMany') : T('dlError'), true); }
        });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'dlm-ren') { const ok = overlay.querySelector('[data-act="renok"]'); if (ok) ok.click(); } if (e.key === 'Enter' && e.target.id === 'dlm-name') { const ok = overlay.querySelector('[data-act="newok"]'); if (ok) ok.click(); } });
        draw();
    }

    window.DownloadDialog = { open, manage, load, pillText, FACTORY };
})();
