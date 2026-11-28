// ---------------------------------------------------------------------------
// Registros de tabla libre › formato de cada columna EN PANTALLA (Daniel, 2026-11-26, «el menú en el encabezado, la B»).
// Es el mismo formato que ya usa el Excel de la descarga (flexExcel.js, por columna): número (General, Número, Moneda, Contabilidad, Fecha corta/larga, Hora, Porcentaje, Fracción, Científica),
// negritas / cursiva / subrayado, alineación, sombreado y color de letra de las celdas, y el encabezado de la columna (relleno, letra, negritas). Se guarda con el registro y vale para todas las cargas.
// Aquí vive lo que dibuja: formatValue (cómo se escribe un valor), cellCss / headCss (estilos), cellHtml (una celda), restyleColumn (cambiar una columna ya dibujada) y openMenu (el cuadro del encabezado).
// ---------------------------------------------------------------------------
(function () {
    'use strict';
    const CUR = { MXN: '$', USD: 'US$', EUR: '€' };
    const NUMBER_FORMATS = ['general', 'numero', 'moneda', 'contabilidad', 'fcorta', 'flarga', 'hora', 'porcentaje', 'fraccion', 'cientifica'];
    const MONTHS = { es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'], en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
    const DAYS = { es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
    const SHADES = ['#fbe3d3', '#fff2cc', '#dcefde', '#dce8f3', '#ead0f0', '#f2f2f2'];
    const INKS = ['#2b2133', '#c00000', '#2a7a48', '#0070c0', '#7030a0', '#ffffff'];
    const HFILLS = ['#9a3cc2', '#3f78ad', '#2b8456', '#b57a05', '#c4473a', '#2b2133'];
    const HINKS = ['#ffffff', '#2b2133'];
// «Ajustar texto»: el texto se parte en renglones en vez de cortarse con «…» (lo mismo que hace «Encabezados y celdas» para toda la tabla, aquí solo para una columna)
const WRAP_CSS = { 'white-space': 'normal', 'overflow-wrap': 'anywhere', 'text-overflow': 'clip' };
// Los iconos de la cinta «Alineación» de Excel, de líneas (los mismos de «Encabezados y celdas» en Dashboard.js)
const ico = (inner) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICONS = {
    va: { top: ico('<path d="M2 2h12M5 5.5h6M5 9h6"/>'), middle: ico('<path d="M2 8h12M5 4.5h6M5 11.5h6"/>'), bottom: ico('<path d="M2 14h12M5 7h6M5 10.5h6"/>') },
    wrap: ico('<path d="M2 3.5h12M2 7.5h8.5a2.5 2.5 0 0 1 0 5H7.5"/><path d="M9 10.5l-1.6 2 1.6 2"/>'),
    al: { left: ico('<path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8"/>'), center: ico('<path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8"/>'), right: ico('<path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8"/>') },
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const T = (key, params) => (window.Dashboard && window.Dashboard.t ? window.Dashboard.t(key, params) : key);
    const escDefault = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const pad = (n) => String(n).padStart(2, '0');
    const nfmt = (n, d, grp) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: grp }).format(n);
    const hasFormat = (f) => !!f && Object.keys(f).length > 0;

    function fraction(v) {
        const neg = v < 0; const a = Math.abs(v); const whole = Math.floor(a); const rest = a - whole;
        if (rest < 1e-9) return `${neg ? '-' : ''}${whole}`;
        let best = [0, 1]; let err = 9;
        for (let q = 2; q <= 9; q += 1) { const p = Math.round(rest * q); const e = Math.abs(rest - p / q); if (e < err - 1e-12) { err = e; best = [p, q]; } }
        if (best[0] === 0) return `${neg ? '-' : ''}${whole}`;
        if (best[0] === best[1]) return `${neg ? '-' : ''}${whole + 1}`;
        return `${neg ? '-' : ''}${whole ? `${whole} ` : ''}${best[0]}/${best[1]}`;
    }
    function scientific(v, d) {
        const [m, e] = v.toExponential(d).split('e');
        return `${m.toUpperCase()}E${e[0] === '-' ? '-' : '+'}${String(Math.abs(Number(e))).padStart(2, '0')}`;
    }
    const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;
    // Cómo se escribe un valor con ese formato: { text, neg } o null si no se cambia (sin formato de número, o el valor no es de ese tipo: un texto con formato de moneda se queda como viene).
    function formatValue(v, f, lang) {
        if (v === null || v === undefined || v === '' || !f || !f.nf) return null;
        const L = lang === 'en' ? 'en' : 'es';
        const nf = f.nf;
        if (nf === 'fcorta' || nf === 'flarga' || nf === 'hora') {
            const m = typeof v === 'string' ? ISO.exec(v) : null;
            if (!m) return null;
            const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
            if (nf === 'fcorta') return { text: `${pad(d)}/${pad(mo)}/${y}`, neg: false };
            if (nf === 'hora') return { text: `${pad(Number(m[4] || 0))}:${pad(Number(m[5] || 0))}:${pad(Number(m[6] || 0))}`, neg: false };
            const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
            return { text: L === 'en' ? `${DAYS.en[dow]}, ${MONTHS.en[mo - 1]} ${d}, ${y}` : `${DAYS.es[dow]}, ${d} de ${MONTHS.es[mo - 1]} de ${y}`, neg: false };
        }
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        const dec = Number.isInteger(f.dec) ? f.dec : 2;
        const sym = CUR[f.cur || 'MXN'];
        if (nf === 'numero') return { text: nfmt(v, dec, !!f.miles), neg: false };
        if (nf === 'porcentaje') return { text: `${nfmt(v * 100, dec, true)}%`, neg: false };
        if (nf === 'fraccion') return { text: fraction(v), neg: false };
        if (nf === 'cientifica') return { text: scientific(v, dec), neg: false };
        const body = nfmt(Math.abs(v), dec, true);
        if (nf === 'contabilidad') return { text: v < 0 ? `${sym} (${body})` : `${sym} ${body}`, neg: false };
        if (nf === 'moneda') {
            if (v < 0 && f.neg === 'par') return { text: `(${sym}${body})`, neg: false };
            return { text: v < 0 ? `-${sym}${body}` : `${sym}${body}`, neg: v < 0 && f.neg === 'rojo' };
        }
        return null;
    }
    // Los estilos de las celdas y del encabezado de una columna.
    function cellProps(f) {
        const p = {};
        if (!f) return p;
        if (f.fill) p['background-color'] = f.fill;
        if (f.ink) p.color = f.ink;
        if (f.b) p['font-weight'] = '700';
        if (f.i) p['font-style'] = 'italic';
        if (f.u) p['text-decoration'] = 'underline';
        if (f.al) p['text-align'] = f.al;
        if (f.bd) p.border = '1px solid #000';
        if (f.fam) p['font-family'] = `'${f.fam}', sans-serif`;
        if (f.size) p['font-size'] = `${Math.round((f.size / 11) * 100) / 100}em`;
        if (f.va) p['vertical-align'] = f.va;
        if (f.wrap) Object.assign(p, WRAP_CSS, { 'line-height': '1.3' });
        return p;
    }
    function headProps(f) {
        const p = {};
        if (!f) return p;
        if (f.hfill) p['background-color'] = f.hfill;
        if (f.hink) p.color = f.hink;
        if (f.hb) p['font-weight'] = '800';
        if (f.hal) p['text-align'] = f.hal;
        if (f.hva) p['vertical-align'] = f.hva;
        if (f.hwrap) Object.assign(p, WRAP_CSS, { 'line-height': '1.25' });
        return p;
    }
    const CELL_KEYS = ['background-color', 'color', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'border', 'font-family', 'font-size', 'vertical-align', 'white-space', 'overflow-wrap', 'text-overflow', 'line-height'];
const HEAD_KEYS = ['background-color', 'color', 'font-weight', 'vertical-align', 'white-space', 'overflow-wrap', 'text-overflow', 'line-height'];
    const cellCss = (f) => Object.entries(cellProps(f)).map(([k, v]) => `${k}:${v}`).join(';');
    function applyProps(el, props, keys) {
        keys.forEach((k) => { if (props[k] !== undefined) el.style.setProperty(k, props[k]); else el.style.removeProperty(k); });
    }
    // Una celda de la tabla ya con su formato (las que no tienen formato salen como siempre).
    function cellHtml(col, value, esc, baseCls, lang) {
        const e = esc || escDefault;
        const empty = value === null || value === undefined || value === '';
        const f = col.fmt;
        let text = empty ? '—' : e(value);
        let cls = baseCls || '';
        let attrs = '';
        if (hasFormat(f)) {
            const out = empty ? null : formatValue(value, f, lang);
            if (out) {
                text = e(out.text);
                attrs += ` data-v="${e(String(value))}"`;
                if (typeof value === 'number') attrs += ` data-sort-value="${value}"`;
                if (out.neg) cls += ' reg-fm-neg';
            }
            const css = cellCss(f);
            if (css) attrs += ` style="${e(css)}"`;
        }
        return `<td data-col="${col.key}"${cls.trim() ? ` class="${cls.trim()}"` : ''}${attrs}>${text}</td>`;
    }
    // Cambiar el formato de una columna que ya está dibujada: sus celdas y su encabezado, sin volver a armar la tabla.
    function restyleColumn(table, col, lang) {
        if (!table) return;
        const f = col.fmt;
        table.querySelectorAll(`td[data-col="${col.key}"]`).forEach((td) => {
            const raw = td.dataset.v !== undefined ? td.dataset.v : td.textContent.trim();
            if (raw !== '' && raw !== '—') {
                const value = col.num && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
                const out = hasFormat(f) ? formatValue(value, f, lang) : null;
                if (out) { td.dataset.v = raw; td.textContent = out.text; if (typeof value === 'number') td.dataset.sortValue = String(value); td.classList.toggle('reg-fm-neg', !!out.neg); }
                else { delete td.dataset.v; delete td.dataset.sortValue; td.textContent = raw; td.classList.remove('reg-fm-neg'); }
            }
            applyProps(td, cellProps(f), CELL_KEYS);
        });
        const th = table.querySelector(`thead th[data-col="${col.key}"]`);
        if (th) applyHeader(th, f);
        refreshLook(table); // «Ajustar texto» de una columna cambia lo que se abrevia
    }
    // La alineación propia del encabezado se marca (data-fm-hal) para que «Como los datos» de toda la tabla no la pise; «Ajustar texto» (data-fm-hwrap) lo lee «Ajustar columnas al encabezado».
    function applyHeader(th, f) {
        const p = headProps(f);
        const had = !!(th.dataset.fmHal || th.dataset.fmHwrap);
        applyProps(th, p, HEAD_KEYS);
        if (p['text-align']) { th.style.setProperty('text-align', p['text-align']); th.dataset.fmHal = '1'; }
        else if (th.dataset.fmHal) { th.style.removeProperty('text-align'); delete th.dataset.fmHal; }
        if (f && f.hwrap) th.dataset.fmHwrap = '1'; else delete th.dataset.fmHwrap;
        if (had || th.dataset.fmHal || th.dataset.fmHwrap) refreshLook(th.closest('table'));
    }
    function refreshLook(table) { if (table && window.Dashboard && window.Dashboard.refreshTableLook) window.Dashboard.refreshTableLook(table); }

    // ---- el cuadro del encabezado (⋮) ----
    let current = null;
    function closeMenu() { if (current) { current.remove(); current = null; document.removeEventListener('mousedown', onOutside, true); document.removeEventListener('keydown', onKey, true); } }
    function onOutside(event) { if (current && !current.contains(event.target) && !event.target.closest('.reg-fm-btn')) closeMenu(); }
    function onKey(event) { if (event.key === 'Escape') closeMenu(); }
    // opts: { anchor, title, f (formato de ahora), canSave, onChange(f) }: onChange se llama con el formato nuevo después de cada cambio (vacío = sin formato).
    function openMenu(opts) {
        closeMenu();
        const state = { f: { ...(opts.f || {}) } };
        const box = document.createElement('div');
        box.className = 'reg-fm-pop';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', opts.title);
        box.setAttribute('data-help-key', 'regFormatoColumna');
        document.body.appendChild(box);
        current = box;
        const esc = escDefault;
        const change = (patch) => {
            Object.entries(patch).forEach(([k, v]) => { if (v === null || v === undefined) delete state.f[k]; else state.f[k] = v; });
            opts.onChange({ ...state.f });
            draw();
        };
        const swatches = (act, list, cur, label) => `<span class="reg-fm-sw"><span class="reg-fm-lab">${esc(label)}</span><button type="button" class="reg-fm-none" data-fm="${act}" data-v="" aria-pressed="${!cur}" title="${esc(T('main.fmtNone'))}" aria-label="${esc(T('main.fmtNone'))}"></button>${list.map((c) => `<button type="button" data-fm="${act}" data-v="${c}" style="background:${c}" aria-pressed="${cur === c}" aria-label="${c}"></button>`).join('')}<input type="color" data-fm="${act}-c" value="${cur || '#d96ecf'}" aria-label="${esc(T('main.fmtMoreColors'))}" title="${esc(T('main.fmtMoreColors'))}"></span>`;
        const toggle = (act, on, label, inner) => `<button type="button" class="reg-fm-ic" data-fm="${act}" aria-pressed="${on}" title="${esc(label)}" aria-label="${esc(label)}">${inner}</button>`;
        // alineación vertical (arriba / en medio / abajo), «Ajustar texto» y horizontal (izquierda / centro / derecha), con los iconos de Excel; p = '' para las celdas y 'h' para el encabezado
        const aligns = (p, f) => ['top', 'middle', 'bottom'].map((v) => toggle(`${p}va-${v}`, f[`${p}va`] === v, T(`main.look${cap(v)}`), ICONS.va[v])).join('')
            + `<span class="reg-fm-sep"></span>${toggle(`${p}wrap`, !!f[`${p}wrap`], T('main.lookWrap'), ICONS.wrap)}<span class="reg-fm-sep"></span>`
            + ['left', 'center', 'right'].map((v) => toggle(`${p}al-${v}`, f[`${p}al`] === v, T(`main.look${cap(v)}`), ICONS.al[v])).join('');
        const extraNode = opts.extra ? opts.extra({ close: closeMenu }) : null; // secciones propias de la pantalla (se arman una vez y se vuelven a poner en cada dibujo)
        const draw = () => {
            const f = state.f;
            box.innerHTML = `<div class="reg-fm-head"><b>${esc(opts.title)}</b><button type="button" class="reg-fm-x" data-fm="close" aria-label="${esc(T('main.regCancel'))}">×</button></div>${extraNode ? '<div data-fm-extra></div>' : ''}
            <div class="reg-fm-g"><small>${esc(T('main.fmtNumber'))}</small><div class="reg-fm-r"><select data-fm="nf" aria-label="${esc(T('main.fmtNumber'))}">${NUMBER_FORMATS.map((n) => `<option value="${n}"${(f.nf || 'general') === n ? ' selected' : ''}>${esc(T(`main.fmtNf_${n}`))}</option>`).join('')}</select>
                ${toggle('dec-', false, T('main.fmtDecLess'), '−.0')}${toggle('dec+', false, T('main.fmtDecMore'), '+.0')}${toggle('miles', !!f.miles, T('main.fmtThousands'), '000')}</div></div>
            <div class="reg-fm-g"><small>${esc(T('main.fmtCells'))}</small><div class="reg-fm-r">${toggle('b', !!f.b, T('main.fmtBold'), '<b>N</b>')}${toggle('i', !!f.i, T('main.fmtItalic'), '<i>K</i>')}${toggle('u', !!f.u, T('main.fmtUnderline'), '<u>S</u>')}${toggle('bd', !!f.bd, T('main.fmtBorders'), '▦')}</div>
                <div class="reg-fm-r">${aligns('', f)}</div>
                ${swatches('fill', SHADES, f.fill, T('main.fmtShade'))}${swatches('ink', INKS, f.ink, T('main.fmtInk'))}</div>
            <div class="reg-fm-g"><small>${esc(T('main.fmtHeader'))}</small><div class="reg-fm-r">${toggle('hb', !!f.hb, T('main.fmtBold'), '<b>N</b>')}<span class="reg-fm-sep"></span>${aligns('h', f)}</div>
                ${swatches('hfill', HFILLS, f.hfill, T('main.fmtHFill'))}${swatches('hink', HINKS, f.hink, T('main.fmtInk'))}</div>
            <div class="reg-fm-foot"><button type="button" class="reg-fm-clear" data-fm="clear">${esc(T('main.fmtClear'))}</button>${opts.onCollapse ? `<button type="button" class="reg-fm-clear" data-fm="collapse">${esc(T('main.colCollapse'))}</button>` : ''}<span class="reg-fm-note">${esc(opts.note || T('main.fmtSaveNote'))}</span></div>`;
            if (extraNode) { const slot = box.querySelector('[data-fm-extra]'); if (slot) slot.appendChild(extraNode); }
        };
        draw();
        // la posición: debajo del botón, sin salirse de la ventana
        const r = opts.anchor.getBoundingClientRect();
        const w = Math.min(box.offsetWidth || 380, window.innerWidth - 16);
        box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
        box.style.top = `${Math.min(r.bottom + 6, Math.max(8, window.innerHeight - box.offsetHeight - 8))}px`;
        box.addEventListener('click', (event) => {
            const b = event.target.closest('[data-fm]');
            if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
            const act = b.dataset.fm; const f = state.f;
            if (act === 'close') { closeMenu(); return; }
            if (act === 'clear') { state.f = {}; opts.onChange({}); draw(); return; }
            if (act === 'collapse') { closeMenu(); if (opts.onCollapse) opts.onCollapse(); return; }
            if (act === 'dec+' || act === 'dec-') { const d = Number.isInteger(f.dec) ? f.dec : 2; change({ nf: f.nf || 'numero', dec: Math.max(0, Math.min(6, d + (act === 'dec+' ? 1 : -1))) }); return; }
            if (act === 'miles') { change({ miles: f.miles ? null : true, nf: f.nf || 'numero' }); return; }
            if (act === 'b' || act === 'i' || act === 'u' || act === 'bd' || act === 'hb') { change({ [act]: f[act] ? null : true }); return; }
            const pos = /^(h?)(va|al)-(top|middle|bottom|left|center|right)$/.exec(act);
            if (pos) { const key = `${pos[1]}${pos[2]}`; change({ [key]: f[key] === pos[3] ? null : pos[3] }); return; }
            if (act === 'wrap' || act === 'hwrap') { change({ [act]: f[act] ? null : true }); return; }
            if (act === 'fill' || act === 'ink' || act === 'hfill' || act === 'hink') change({ [act]: b.dataset.v || null });
        });
        box.addEventListener('change', (event) => {
            const el = event.target;
            if (!el.dataset || !el.dataset.fm) return;
            if (el.dataset.fm === 'nf') { const v = el.value; change({ nf: v === 'general' ? null : v, dec: v === 'general' || ['fcorta', 'flarga', 'hora', 'fraccion'].includes(v) ? null : (v === 'porcentaje' ? 0 : 2), miles: v === 'numero' ? (state.f.miles || null) : null }); return; }
            if (/-c$/.test(el.dataset.fm)) change({ [el.dataset.fm.slice(0, -2)]: el.value });
        });
        setTimeout(() => { document.addEventListener('mousedown', onOutside, true); document.addEventListener('keydown', onKey, true); }, 0);
        return { close: closeMenu };
    }
    window.FlexFormat = { NUMBER_FORMATS, formatValue, cellCss, cellHtml, restyleColumn, applyHeader, openMenu, closeMenu, hasFormat };
}());
