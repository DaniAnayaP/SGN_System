// ---------------------------------------------------------------------------
// Análisis sin Diseño (Daniel, 2026-11-26, «constrúyelo todo de una vez»): piezas que comparten la lista de análisis («Nuevo análisis») y la pantalla del análisis («De un archivo», columnas base, aspecto):
//   · fuentes: los archivos (registros) que se pueden usar y sus columnas (GET /api/business/manual-analyses/sources);
//   · formatos de valor (fmtValue) y aspecto de una columna (applyLook), que valen igual en la tabla y en la vista previa;
//   · el selector múltiple tipo Excel (multiSelect): el campo cerrado muestra la primera opción y «+N más»; abierto trae buscador, «Seleccionar todo» y la lista.
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/manual-analyses';
const t = (key, params) => Dashboard.t(key, params);
const lang = () => (localStorage.getItem('lang') === 'en' ? 'en' : 'es');
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const CLASS_COLORS = ['#3f78ad', '#b23fb8', '#2b8456', '#b57a05', '#4f58c2', '#c4473a'];
const FORMATS_COMMON = ['int', 'd1', 'money'];
const FORMATS_MORE = [['Número', ['d2', 'd4', 'miles', 'pct', 'cient']], ['Fecha y hora', ['fecha', 'fechahora', 'hora']], ['Otros', ['texto', 'pers']]];
const AGGS = ['sum', 'avg', 'min', 'max', 'count', 'first'];

// ---- fuentes ----------------------------------------------------------------------------------------------------------------------------------------------
let sourcesPromise = null;
function loadSources(force) {
    if (!sourcesPromise || force) {
        sourcesPromise = fetch(`${API}/sources?lang=${lang()}`, { credentials: 'include', cache: 'no-store' }).then((r) => (r.ok ? r.json() : { registries: [] })).catch(() => ({ registries: [] }));
    }
    return sourcesPromise;
}
const regName = (r) => (r ? (r.name || (r.nameKey ? t(r.nameKey) : r.key)) : '');
async function sourceValues(registry, col, query) {
    const q = new URLSearchParams({ registry, col, lang: lang(), limit: '500' });
    if (query) q.set('q', query);
    const res = await fetch(`${API}/source-values?${q}`, { credentials: 'include', cache: 'no-store' });
    return res.ok ? res.json() : { values: [], complete: true };
}

// ---- formatos ---------------------------------------------------------------------------------------------------------------------------------------------
const MONTHS = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] };
const pad2 = (n) => String(n).padStart(2, '0');
function toDate(v) {
    if (v instanceof Date) return v;
    const s = String(v).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
    if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 80000) return new Date(Math.round((Number(s) - 25569) * 86400000)); // número de fecha de Excel
    return null;
}
function dateText(d, mode) {
    const mon = MONTHS[lang()][d.getMonth()];
    const day = `${pad2(d.getDate())}/${mon}/${d.getFullYear()}`;
    const hour = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return mode === 'hora' ? hour : (mode === 'fechahora' ? `${day} ${hour}` : day);
}
const numOf = (v) => (typeof v === 'number' ? v : (/^-?\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : null));
// Cómo se ve un valor en el Análisis (solo presentación: el dato no cambia). general = como viene.
function fmtValue(v, fmt, pat) {
    if (v === null || v === undefined || v === '') return '';
    const loc = lang() === 'en' ? 'en-US' : 'es-MX';
    const n = numOf(v);
    const dec = (x, d, group = true) => Number(x).toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: group });
    const pending = (f) => (n === null ? String(v) : f(n));
    switch (fmt) {
    case 'int': return pending((x) => dec(x, 0));
    case 'dec1': case 'd1': return pending((x) => dec(x, 1));
    case 'dec2': case 'd2': case 'miles': return pending((x) => dec(x, 2));
    case 'd4': return pending((x) => dec(x, 4));
    case 'money': return pending((x) => `$${dec(x, 2)}`);
    case 'pct': return pending((x) => `${dec(x * 100, 0)}%`);
    case 'cient': return pending((x) => x.toExponential(1).toUpperCase().replace(/E([+-])(\d)$/, 'E$10$2'));
    case 'fecha': case 'fechahora': case 'hora': { const d = toDate(v); return d ? dateText(d, fmt) : String(v); }
    case 'texto': return String(v);
    case 'pers': return customFormat(v, n, String(pat || ''), dec);
    default: return typeof v === 'number' ? Number(v).toLocaleString(loc, { maximumFractionDigits: 3 }) : String(v);
    }
}
// Un formato personalizado como en Excel: #,##0.00 (decimales y miles), con $ o % pegados; o una fecha con yyyy, mm, dd, hh, MM (minutos).
function customFormat(v, n, pat, dec) {
    if (!pat) return String(v);
    if (/[ymdh]/i.test(pat.replace(/[#0,.%$\s]/g, '')) && /yy|dd|hh/i.test(pat)) {
        const d = toDate(v);
        if (!d) return String(v);
        return pat.replace(/yyyy/gi, d.getFullYear()).replace(/yy/gi, String(d.getFullYear()).slice(-2)).replace(/mmm/g, MONTHS[lang()][d.getMonth()]).replace(/dd/gi, pad2(d.getDate())).replace(/hh/gi, pad2(d.getHours())).replace(/MM/g, pad2(d.getMinutes())).replace(/mm/g, pad2(d.getMonth() + 1));
    }
    if (n === null) return String(v);
    const m = /^([^#0]*)([#0,]*)(?:\.([#0]*))?(.*)$/.exec(pat);
    if (!m) return String(v);
    const decimals = (m[3] || '').length;
    const prefix = m[1] || '';
    const suffix = m[4] || '';
    const pct = /%/.test(suffix) || /%/.test(prefix);
    return `${prefix}${dec(pct ? n * 100 : n, decimals, /,/.test(m[2] || ''))}${suffix}`;
}

// ---- aspecto de una columna (como en Excel) --------------------------------------------------------------------------------------------------------------
const colorOf = (c) => (typeof c === 'number' ? CLASS_COLORS[c - 1] : (typeof c === 'string' ? c : null));
const LINE = { solid: ['solid', '1px'], dotted: ['dotted', '2px'], dashed: ['dashed', '1px'], double: ['double', '3px'], thick: ['solid', '3px'] };
function lookCss(style) {
    const s = style || {};
    const head = {}; const cell = {};
    const both = (k, v) => { head[k] = v; cell[k] = v; };
    if (s.b) both('font-weight', '700');
    if (s.i) both('font-style', 'italic');
    const deco = [s.u ? 'underline' : '', s.s ? 'line-through' : ''].filter(Boolean).join(' ');
    if (deco) both('text-decoration', deco);
    const hc = colorOf(s.hc); if (hc) { head.background = hc; head.color = '#fff'; }
    const dc = colorOf(s.dc); if (dc) cell.background = `color-mix(in srgb, ${dc} 22%, transparent)`;
    if (s.bd && s.bd.length) {
        const [style1, width] = LINE[s.line] || LINE.solid;
        const line = `${width} ${style1} ${colorOf(s.lc) || 'currentColor'}`;
        const all = s.bd.includes('all');
        [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']].forEach(([k, side]) => { if (all || s.bd.includes(k)) both(`border-${side}`, line); });
    }
    return { head, cell };
}
function applyLook(table, colKey, style) {
    if (!table || !style || !Object.keys(style).length) return;
    const css = lookCss(style);
    const th = table.querySelector(`th[data-col="${colKey}"]`);
    if (th) Object.entries(css.head).forEach(([k, v]) => th.style.setProperty(k, v));
    table.querySelectorAll(`td[data-col="${colKey}"]`).forEach((td) => Object.entries(css.cell).forEach(([k, v]) => td.style.setProperty(k, v)));
}

// ---- selector múltiple tipo Excel -------------------------------------------------------------------------------------------------------------------------
// opts: { getOptions: async (query) => ({ values: [texto], complete }), selected: [texto], onChange(lista), placeholder }. Devuelve { getSelected(), setSelected(list), reload() }.
function multiSelect(host, opts) {
    let selected = new Set(opts.selected || []);
    let options = [];
    let complete = true;
    let query = '';
    host.classList.add('an-ms');
    host.innerHTML = `<button type="button" class="an-ms-sum" aria-haspopup="listbox"></button><div class="an-ms-panel" hidden>
        <input type="text" class="an-ms-search" placeholder="${esc(t('main.an2Search'))}" autocomplete="off">
        <label class="an-ms-op an-ms-all"><input type="checkbox" class="an-ms-allbox"> <span>${esc(t('main.an2SelectAll'))}</span></label>
        <div class="an-ms-list" role="listbox"></div><p class="an-ms-more" hidden>${esc(t('main.an2MoreValues'))}</p></div>`;
    const sum = host.querySelector('.an-ms-sum'); const panel = host.querySelector('.an-ms-panel'); const search = host.querySelector('.an-ms-search');
    const list = host.querySelector('.an-ms-list'); const allBox = host.querySelector('.an-ms-allbox'); const more = host.querySelector('.an-ms-more');
    const drawSummary = () => {
        const arr = [...selected];
        sum.innerHTML = arr.length ? `<span class="an-ms-pill">${esc(arr[0])}</span>${arr.length > 1 ? `<i class="an-ms-n">${esc(t('main.an2NMore', { n: arr.length - 1 }))}</i>` : ''}` : `<span class="an-ms-ph">${esc(opts.placeholder || t('main.an2ChooseValues'))}</span>`;
    };
    const drawList = () => {
        const q = fold(query);
        const shown = options.filter((v) => !q || fold(v).includes(q));
        // las ya elegidas que la lista cortada no trae también se ven
        const extra = [...selected].filter((v) => !options.includes(v) && (!q || fold(v).includes(q)));
        const all = [...extra, ...shown];
        list.innerHTML = all.map((v, i) => `<label class="an-ms-op"><input type="checkbox" data-i="${i}"${selected.has(v) ? ' checked' : ''}> <span>${esc(v)}</span></label>`).join('') || `<p class="admin-hint">${esc(t('main.an2NoValues'))}</p>`;
        list.querySelectorAll('input').forEach((box) => box.addEventListener('change', () => { const v = all[Number(box.dataset.i)]; if (box.checked) selected.add(v); else selected.delete(v); changed(false); }));
        allBox.checked = all.length > 0 && all.every((v) => selected.has(v));
        more.hidden = complete;
        allBox.onchange = () => { all.forEach((v) => { if (allBox.checked) selected.add(v); else selected.delete(v); }); drawList(); changed(false); };
    };
    const changed = (redraw = true) => { drawSummary(); if (redraw) drawList(); if (opts.onChange) opts.onChange([...selected]); };
    const reload = async () => {
        const out = await opts.getOptions(query);
        options = out.values || []; complete = out.complete !== false;
        drawList();
    };
    const open = () => { panel.hidden = false; reload(); search.focus(); };
    const close = () => { panel.hidden = true; };
    sum.addEventListener('click', () => (panel.hidden ? open() : close()));
    let timer = null;
    search.addEventListener('input', () => { query = search.value; clearTimeout(timer); timer = setTimeout(() => (complete ? drawList() : reload()), 200); });
    document.addEventListener('mousedown', (e) => { if (!host.contains(e.target)) close(); });
    drawSummary();
    return {
        getSelected: () => [...selected],
        setSelected: (arr) => { selected = new Set(arr); drawSummary(); drawList(); },
        reload: () => { options = []; complete = true; query = ''; search.value = ''; drawList(); },
    };
}

window.AnalysisKit = { API, t, lang, esc, fold, CLASS_COLORS, FORMATS_COMMON, FORMATS_MORE, AGGS, loadSources, regName, sourceValues, fmtValue, colorOf, lookCss, applyLook, multiSelect };
})();
