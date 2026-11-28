// «Mi personalización de Descarga» (Daniel, 2026-11-28, «Sí a las recomendadas en todo», maqueta mi-personalizacion-descarga-v2): el cuadro que se abre al descargar (formato, mi personalización, lo que cada formato permite
// ajustar y «Así queda») y el administrador de mis personalizaciones (icono nuevo junto al de Descargar). Lo carga Dashboard.js cuando hace falta (attachTableDownloadButton). El servidor guarda y revisa cada personalización
// (downloadPresets.js / downloadPresetsApi.js); aquí solo se arma el cuadro y se dice a la descarga cuál aplicar: { preset: 'factory' | id } (una guardada), { p: <JSON> } (con cambios o la del registro) o {} (nada elegido: sale como siempre).
(function () {
    'use strict';
    const API = '/api/business/download-presets';
    const LAST_KEY = 'sgn_dl_last';
    // La de fábrica «Como siempre» (la misma de downloadPresets.js)
    const FACTORY = {
        v: 1, title: '', date: true, logo: true, brand: false, general: true, kpis: true, fill: '#9a3cc2', ink: '#ffffff', bold: true, filter: true, keyFill: true, freeze: true, frozenHeader: true,
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
            case 'brand': return (format === 'xlsx' && kind === 'generic') || format === 'pdf'; // el logo de la compañía: solo donde el Excel no va en flujo
            case 'lines': return format === 'xlsx' || format === 'pdf';
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
        { id: 'l', name: 'dlSecLines', fields: ['lines'] },
        { id: 'n', name: 'dlSecNumbers', fields: ['dec', 'miles', 'neg'] },
        { id: 'a', name: 'dlSecFile', fields: ['sep', 'enc', 'csvTitle'] },
        { id: 'p', name: 'dlSecSheet', fields: ['orient', 'paper', 'foot'] },
    ];

    // ---- Líneas (bordes): los patrones del menú de Bordes de Excel, los estilos y los colores ------------------------------------------------------------------------------------------------
    const PATS = ['inferior', 'superior', 'izq', 'der', 'sin', 'todos', 'externos', 'ext_grueso', 'doble_inf', 'inf_grueso', 'sup_inf', 'sup_inf_grueso', 'sup_inf_doble'];
    const FORCED = { ext_grueso: 'gruesa', inf_grueso: 'gruesa', sup_inf_grueso: 'gruesa', doble_inf: 'doble', sup_inf_doble: 'doble' };
    const STYLES = ['fina', 'media', 'gruesa', 'punteada', 'doble'];
    const CSS_LINE = { fina: '1px solid', media: '2px solid', gruesa: '3px solid', punteada: '1px dotted', doble: '3px double' };
    const LCOL = { gris: '#6b7280', negro: '#111111', morado: '#9a3cc2', azul: '#2f6fb0', rojo: '#c00000' };
    const BIG = 16384; // «hasta la última columna»: el servidor lo recorta a las columnas que se bajan
    function patIcon(p) {
        const grid = '<path d="M2 2h12M2 8h12M2 14h12M2 2v12M8 2v12M14 2v12" stroke-dasharray="1 1.6" stroke-width=".9" opacity=".45"/>';
        const seg = { inferior: 'M2 14h12', superior: 'M2 2h12', izq: 'M2 2v12', der: 'M14 2v12', sin: '', todos: 'M2 2h12M2 8h12M2 14h12M2 2v12M8 2v12M14 2v12', externos: 'M2 2h12v12H2z', ext_grueso: 'M2 2h12v12H2z', doble_inf: 'M2 13h12M2 15h12', inf_grueso: 'M2 14h12', sup_inf: 'M2 2h12M2 14h12', sup_inf_grueso: 'M2 2h12M2 14h12', sup_inf_doble: 'M2 1h12M2 3h12M2 13h12M2 15h12' }[p];
        const w = /grueso/.test(p) ? 3 : 1.6;
        return `<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="square" aria-hidden="true">${grid}${seg ? `<path d="${seg}" stroke-width="${w}"/>` : '<path d="M3 3l10 10M13 3L3 13" stroke-width="1.2" opacity=".5"/>'}</svg>`;
    }

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
    // ui: { consecutive (columnas seguidas: así las posiciones de las celdas marcadas son las de la tabla), picking (se marcan celdas aquí), sel(r, c) }
    function previewHtml(P, format, kind, snap, ui) {
        ui = ui || {};
        // hasta 5 columnas: las primeras y, si la tabla trae columnas de números más allá, las dos primeras de ellas (para que los decimales se vean)
        const numIdx = snap.columns.map((c, i) => (c.num ? i : -1)).filter((i) => i >= 0);
        let idx = snap.columns.map((c, i) => i).slice(0, 5);
        if (!ui.consecutive && numIdx.length && !idx.some((i) => numIdx.includes(i))) idx = [...idx.slice(0, 3), ...numIdx.slice(0, 2)];
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
        // las líneas (bordes) de la personalización, sobre la misma cuadrícula que usa el servidor (renglón 0 = encabezado)
        const lib = window.DownloadLines;
        const grid = lib && (format === 'xlsx' || format === 'pdf') && P.lines && P.lines.length ? lib.createGrid(P.lines.map((l) => Object.assign({}, l, { co: LCOL[l.co] || l.co })), { rows: rows.length, cols: snap.columns.length, colIndex: (name) => snap.columns.findIndex((c) => fold(c.label) === fold(name)) }) : null;
        const edgeCss = (r, k) => { if (!grid) return ''; const e = grid.cell(r, idx[k]); let o = ''; ['top', 'right', 'bottom', 'left'].forEach((s) => { if (e[s]) o += `border-${s}:${CSS_LINE[e[s].st]} ${e[s].co};`; }); return o; };
        const selCls = (r, k) => (ui.sel && ui.sel(r, idx[k]) ? 'dl-sel' : '');
        const head = cols.map((c, i) => `<th data-r="0" data-c="${idx[i]}" class="${selCls(0, i)}" style="${P.fill ? `background:${P.fill};` : ''}color:${P.ink};font-weight:${P.bold ? 700 : 400};${edgeCss(0, i)}">${esc(c.label)}${format === 'xlsx' && P.filter ? '<b>▾</b>' : ''}</th>`).join('');
        const body = rows.map((r, ri) => `<tr>${cols.map((c, i) => { const v = cols[i].num ? numberView(r[i], P) : { text: String(r[i] == null ? '' : r[i]), neg: false }; const cls = [format === 'xlsx' && kind === 'flex' && P.keyFill && i === 0 ? 'dl-key' : '', selCls(ri + 1, i)].filter(Boolean).join(' '); return `<td data-r="${ri + 1}" data-c="${idx[i]}"${cls ? ` class="${cls}"` : ''} style="${v.neg ? 'color:#c00000;' : ''}${edgeCss(ri + 1, i)}">${esc(v.text)}</td>`; }).join('')}</tr>`).join('');
        const titleRow = title ? `<tr><td class="dl-ttl" colspan="${cols.length || 1}">${esc(title)}</td></tr>` : '';
        if (format === 'pdf') {
            const ratio = P.orient === 'h' ? 'landscape' : 'portrait';
            const paper = { carta: T('dlPaperLetter'), a4: 'A4', legal: T('dlPaperLegal') }[P.paper] || '';
            const foot = P.foot ? `<div class="dl-foot"><span>${esc(new Date().toISOString().slice(0, 10))}</span><span>1 / 1</span></div>` : '';
            return `<div class="dl-page ${ratio}">${title ? `<div class="dl-pt">${esc(title)}</div>` : ''}<table class="dl-xl${ui.picking ? ' dl-pick' : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${foot}</div><span class="dl-chip">${esc(paper)} · ${esc(P.orient === 'h' ? T('dlOrientH') : T('dlOrientV'))}</span>`;
        }
        const cover = kind === 'flex' ? `<div class="dl-cover">${[[P.date, 'dlDate'], [P.general, 'dlGeneral'], [P.kpis, 'dlKpis']].filter((x) => x[0]).map((x) => `<span class="dl-chip">${esc(T(x[1]))}</span>`).join('')}</div>` : '';
        return `<div class="dl-scr"><table class="dl-xl${ui.picking ? ' dl-pick' : ''}"><thead>${titleRow}<tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${cover}`;
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
        const CHECKS = { t: [['brand', 'dlBrand'], ['date', 'dlDate'], ['general', 'dlGeneral'], ['kpis', 'dlKpis']], h: [['bold', 'dlBold'], ['filter', 'dlFilter']], c: [['keyFill', 'dlKeyFill'], ['freeze', 'dlFreeze'], ['frozenHeader', 'dlFrozenHeader']], a: [['csvTitle', 'dlCsvTitle']], p: [['foot', 'dlFoot']] };
        let openSec = 'h';
        // Líneas: lo que la persona va armando (dónde, patrón, estilo y color); las capas ya aplicadas viven en P.lines
        const L = { scope: 'all', cols: {}, rect: null, anchor: null, pat: 'todos', st: 'fina', co: 'negro', more: false, mt: { t: true, b: true, l: true, r: true, ih: false, iv: false } };
        const inSel = (r, c) => {
            if (L.scope === 'col') return !!L.cols[c];
            if (L.scope === 'cell' && L.rect) { const x = L.rect; return r >= x.r1 && (x.r2 === null || r <= x.r2) && c >= x.c1 && c <= x.c2; }
            return false;
        };
        const layerName = (l) => {
            const w = l.where || {};
            const where = w.scope === 'all' ? T('dlLnAll') : w.scope === 'col' ? T('dlLnLayerCol', { name: w.col }) : T('dlLnLayerCells', { rows: w.r1 === w.r2 ? (w.r1 === 0 ? T('dlLnHeader') : w.r1) : `${w.r1 === 0 ? T('dlLnHeader') : w.r1}–${w.r2 === null ? '…' : w.r2}`, cols: w.c1 === w.c2 ? w.c1 + 1 : `${w.c1 + 1}–${w.c2 >= BIG ? '…' : w.c2 + 1}` });
            const pat = l.pat === 'custom' ? T('dlLnMore') : T(`dlPat_${l.pat}`);
            return `${where} · ${pat}${l.pat === 'sin' ? '' : ` · ${T(`dlSt_${FORCED[l.pat] || l.st}`).toLowerCase()} ${T(`dlCo_${typeof l.co === 'string' && LCOL[l.co] ? l.co : Object.keys(LCOL).find((k) => LCOL[k] === l.co) || 'negro'}`).toLowerCase()}`}`;
        };
        const buildLines = (box) => {
            const chip = (ln, label, on, extra) => `<button type="button" class="dl-ch" data-ln="${ln}" aria-pressed="${!!on}"${extra ? ` data-v="${esc(extra)}"` : ''}>${esc(label)}</button>`;
            const dot = (ln, label, on, hex, extra) => `<button type="button" class="dl-ch" data-ln="${ln}" aria-pressed="${!!on}" data-v="${esc(extra)}"><i class="dl-dot" style="background:${hex}"></i>${esc(label)}</button>`;
            const row = (label, inner) => `<div class="dl-row"><span class="dl-l">${esc(label)}</span><div class="dl-c">${inner}</div></div>`;
            let h = row(T('dlLnWhere'), ['all', 'col', 'cell'].map((s) => chip('scope', T(`dlLn_${s}`), L.scope === s, s)).join(''));
            if (L.scope === 'col') h += row(T('dlLnCols'), snap.columns.slice(0, 40).map((c, i) => chip('col', c.label, !!L.cols[i], String(i))).join(''));
            if (L.scope === 'cell') h += row(T('dlLnMark'), [['dlLnHeader', 0, 0, 0, BIG], ['dlLnData', 1, null, 0, BIG], ['dlLnFirstCol', 0, null, 0, 0]].map(([k, r1, r2, c1, c2]) => chip('quick', T(k), false, JSON.stringify({ r1, r2, c1, c2 }))).join(''));
            h += `<div class="dl-bgrid" role="group" aria-label="${esc(T('dlLnPatterns'))}">${PATS.map((p) => `<button type="button" class="dl-bpat" data-ln="pat" data-v="${p}" aria-pressed="${!L.more && L.pat === p}">${patIcon(p)}<span>${esc(T(`dlPat_${p}`))}</span></button>`).join('')}</div>`;
            const forced = !L.more && FORCED[L.pat];
            h += row(T('dlLnStyle'), STYLES.map((s) => chip('st', T(`dlSt_${s}`), (forced || L.st) === s, s)).join(''));
            h += row(T('dlLnColor'), Object.keys(LCOL).map((k) => dot('co', T(`dlCo_${k}`), L.co === k, LCOL[k], k)).join(''));
            h += row('', chip('more', T('dlLnMore'), L.more, ''));
            if (L.more) h += `<div class="dl-more">${[['t', 'dlLnTop'], ['b', 'dlLnBottom'], ['l', 'dlLnLeft'], ['r', 'dlLnRight'], ['ih', 'dlLnInnerH'], ['iv', 'dlLnInnerV']].map(([k, label]) => chip('mt', T(label), L.mt[k], k)).join('')}</div>`;
            h += row('', `<button type="button" class="btn dl-apply" data-ln="apply">${esc(T('dlLnApply'))}</button>${P.lines.length ? `<button type="button" class="btn btn-secondary" data-ln="clear">${esc(T('dlLnClear'))}</button>` : ''}`);
            h += P.lines.map((l, i) => `<div class="dl-layer"><span>${esc(layerName(l))}</span><button type="button" data-ln="del" data-v="${i}" aria-label="${esc(T('dlLnRemove'))}">✕</button></div>`).join('');
            box.innerHTML = h;
        };
        const redrawLines = () => { const box = overlay.querySelector('.dl-lines'); if (box) buildLines(box); drawPreview(); };
        const linesClick = (b) => {
            const k = b.dataset.ln; const v = b.dataset.v;
            if (k === 'scope') { L.scope = v; L.rect = null; L.anchor = null; }
            else if (k === 'col') L.cols[Number(v)] = !L.cols[Number(v)];
            else if (k === 'quick') L.rect = JSON.parse(v);
            else if (k === 'pat') { L.pat = v; L.more = false; }
            else if (k === 'st') L.st = v;
            else if (k === 'co') L.co = v;
            else if (k === 'more') L.more = !L.more;
            else if (k === 'mt') L.mt[v] = !L.mt[v];
            else if (k === 'del') P.lines.splice(Number(v), 1);
            else if (k === 'clear') P.lines = [];
            else if (k === 'apply') {
                const wheres = [];
                if (L.scope === 'all') wheres.push({ scope: 'all' });
                else if (L.scope === 'col') Object.keys(L.cols).filter((i) => L.cols[i]).forEach((i) => { if (snap.columns[i]) wheres.push({ scope: 'col', col: snap.columns[i].label }); });
                else if (L.rect) wheres.push({ scope: 'cells', r1: L.rect.r1, c1: L.rect.c1, r2: L.rect.r2, c2: L.rect.c2 });
                if (!wheres.length) { say(T(L.scope === 'col' ? 'dlLnPickCols' : 'dlLnPickCells'), true); return; }
                wheres.forEach((w) => P.lines.push({ where: w, pat: L.more ? 'custom' : L.pat, mt: L.more ? clone(L.mt) : null, st: L.st, co: L.co, label: '' }));
                L.rect = null; L.anchor = null; L.cols = {}; say('');
            }
            redrawLines();
        };
        const drawSections = () => {
            const box = $('#dl-secs');
            box.innerHTML = '';
            SECTIONS.forEach((s) => {
                const fields = s.fields.filter((f) => allowed(f, format, kind));
                if (!fields.length) return;
                const d = document.createElement('details');
                d.dataset.id = s.id;
                d.open = s.id === openSec;
                if (s.id === 'l') {
                    d.innerHTML = `<summary data-help-key="downloadLines"><b>${esc(T(s.name))}</b></summary><div class="dl-fields dl-lines"></div>`;
                    d.addEventListener('toggle', () => { if (d.open) { openSec = s.id; drawPreview(); } });
                    box.appendChild(d);
                    buildLines(d.querySelector('.dl-lines'));
                    return;
                }
                const rowsHtml = fields.map((f) => FIELD_HTML[f]()).join('');
                const checks = (CHECKS[s.id] || []).filter(([f]) => allowed(f, format, kind));
                d.innerHTML = `<summary><b>${esc(T(s.name))}</b></summary><div class="dl-fields">${rowsHtml}${checks.length ? field(`${s.id}-chk`, T('dlOptions'), `<span class="dl-checks">${checks.map(([f, label]) => chk(f, T(label))).join('')}</span>`) : ''}</div>`;
                d.addEventListener('toggle', () => { if (d.open) { openSec = s.id; drawPreview(); } });
                box.appendChild(d);
            });
        };
        const dirty = () => !same(P, base);
        const drawPreview = () => {
            const working = openSec === 'l' && allowed('lines', format, kind);
            $('#dl-prev').innerHTML = previewHtml(P, format, kind, snap, { consecutive: working, picking: working && L.scope !== 'all', sel: working ? inSel : null });
            $('#dl-mod').hidden = !dirty();
        };
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
            const ln = e.target.closest('[data-ln]');
            if (ln) { linesClick(ln); return; }
            // marcar en «Así queda»: una columna (tocando su encabezado) o un grupo de celdas (una y luego otra, como en Excel)
            const cellEl = e.target.closest('#dl-prev [data-r]');
            if (cellEl && openSec === 'l' && L.scope !== 'all') {
                const r = Number(cellEl.dataset.r); const c = Number(cellEl.dataset.c);
                if (L.scope === 'col') L.cols[c] = !L.cols[c];
                else if (!L.anchor) { L.anchor = { r, c }; L.rect = { r1: r, c1: c, r2: r, c2: c }; }
                else { L.rect = { r1: Math.min(L.anchor.r, r), c1: Math.min(L.anchor.c, c), r2: Math.max(L.anchor.r, r), c2: Math.max(L.anchor.c, c) }; L.anchor = null; }
                redrawLines();
                return;
            }
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
