// ---------------------------------------------------------------------------
// La hoja que se descarga del Layout: nombre del cliente, mapa, KPIs, QR, versión y fecha. Se arma como un SVG con el ancho y el largo (en cm) que se elijan (A3 horizontal
// si no se dice otra cosa), y de ahí salen el PNG (se pinta en un canvas) y el PDF (la misma imagen dentro de una página, sin librerías: un PDF de una sola imagen se escribe a mano).
// La hoja se acomoda sola al espacio: horizontal (las tarjetas de m² a la derecha del mapa), vertical (las tarjetas abajo) o chica (solo lo principal). Si el espacio es más chico
// que una hoja estándar, el archivo sale en la hoja más chica donde quepa (Carta, A4, A3 o Tabloide) con el espacio marcado con una línea punteada para recortar. Todo ocurre en el
// navegador con lo ÚLTIMO GUARDADO que trae GET /api/business/layout/qr, así que la hoja trae lo mismo que se ve al escanear el QR.
// ---------------------------------------------------------------------------
(function () {
    const PX_CM = 1600 / 42; // la hoja A3 de siempre: 42 cm = 1600 px
    const FONT = 'Poppins, Arial, Helvetica, sans-serif';
    const LIMITS = { min: 6, max: 120 };
    // Hojas estándar (ancho × largo en cm, en horizontal) y medidas rápidas.
    const PAGES = [['Carta', 27.94, 21.59], ['A4', 29.7, 21], ['A3', 42, 29.7], ['Tabloide', 43.18, 27.94]];
    const PRESETS = [['a3h', 42, 29.7], ['a4h', 29.7, 21], ['cartah', 27.94, 21.59], ['a4v', 21, 29.7], ['mediacarta', 21.59, 13.97], ['tarjeta', 10.5, 14.8]];
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = (n, lang) => (Number.isFinite(n) ? n : 0).toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 2 });
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dim = (n) => String(Math.round(n * 10) / 10);

    // La hoja del archivo para un espacio de wCm × hCm: del mismo tamaño, o (si el espacio es más chico que una hoja estándar y se quiere la línea de recorte) la más chica donde quepa.
    function pageFor(wCm, hCm, cut) {
        if (cut !== false) {
            for (const [name, pw, ph] of PAGES) {
                const fits = (a, b) => (wCm <= a + 0.05 && hCm <= b + 0.05 ? { name, w: a, h: b } : null);
                const hit = fits(pw, ph) || fits(ph, pw);
                if (hit) return hit.w - wCm > 1.6 || hit.h - hCm > 1.6 ? { name: hit.name, w: hit.w, h: hit.h, small: true } : { name: '', w: wCm, h: hCm, small: false };
            }
        }
        return { name: '', w: wCm, h: hCm, small: false };
    }

    // Módulos del QR (rows = filas de '0'/'1') como un solo trazo, con su zona blanca alrededor.
    function qrPath(rows, x, y, size, ink = '#14161F', sw = 3) {
        const n = rows.length;
        const unit = size / (n + 8);
        let d = '';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
            if (rows[r][c] === '1') d += `M${(x + (c + 4) * unit).toFixed(2)} ${(y + (r + 4) * unit).toFixed(2)}h${unit.toFixed(2)}v${unit.toFixed(2)}h-${unit.toFixed(2)}z`;
        }
        return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#FFFFFF" stroke="${ink}" stroke-width="${sw}" rx="8"/><path d="${d}" fill="#14161F"/>`;
    }

    // El contenido de la hoja dentro de un espacio de W × H px (el que se imprime). Con 1600 × 1131 queda como la hoja A3 de siempre.
    function sheetContent(data, labels, lang, W, H) {
        const k = data.kpis;
        const th = data.theme || window.LayoutMapSvg.DEFAULT_THEME;
        const C = th.chrome;
        const f = clamp(Math.min(W, H) / 1131, 0.34, 1.8);
        const m = 48 * f;
        const land = W / H >= 1.12;
        const tiny = Math.min(W, H) / PX_CM < 13;
        const dateFmt = (d) => d.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const utc = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        // data.view = cómo se está viendo el croquis: sus capas activas y si lleva medidas; el reporte sale igual.
        const view = data.view || {};
        const layers = Array.isArray(view.layers) ? view.layers : null;
        const on = (key) => !layers || layers.includes(key);
        const initials = (data.companyName || '').trim().slice(0, 2).toUpperCase() || '··';
        const allCards = [
            [`${fmt(k.total, lang)} m²`, labels.kpiTotal], [`${fmt(k.offices, lang)} m²`, labels.kpiOffices], [`${fmt(k.aisles, lang)} m²`, labels.kpiAisles],
            [`${fmt(k.docks, lang)} m²`, labels.kpiDocks], [`${fmt(k.storage, lang)} m²`, labels.kpiStorage], [`${fmt(k.dead, lang)} m²`, labels.kpiDead], [`${fmt(k.volume, lang)} m³`, labels.kpiVolume],
        ];
        const cards = tiny ? [allCards[0], allCards[4], allCards[5], allCards[6]] : allCards;
        let s = `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
        // encabezado
        const bs = 84 * f;
        const nameSize = (tiny ? 27 : 36) * f;
        // El logo del cliente (si lo tiene) va en lugar de las iniciales; ancho según su forma (data.logoRatio = ancho / alto, hasta 2.4 veces el alto).
        const logoW = data.logoDataUrl ? bs * clamp(Number(data.logoRatio) || 1, 0.5, 2.4) : bs;
        if (data.logoDataUrl) s += `<image href="${esc(data.logoDataUrl)}" x="${m}" y="${m}" width="${logoW.toFixed(2)}" height="${bs}" preserveAspectRatio="xMinYMid meet"/>`;
        else s += `<rect x="${m}" y="${m}" width="${bs}" height="${bs}" rx="${18 * f}" fill="${C.badge}"/><text x="${m + bs / 2}" y="${m + bs * 0.667}" font-size="${36 * f}" font-weight="700" fill="#FFFFFF" text-anchor="middle">${esc(initials)}</text>`;
        // Lo fuerte arriba y lo débil abajo: el Sitio (data.siteName: el que se escribe en Contorno > Sitio; después saldrá de la configuración) grande, en negritas y en el color de la marca,
        // y debajo el nombre de la compañía, más chico y en gris. Los dos se achican si no caben antes del código QR.
        const qs = clamp(230 * f, 70, Math.min(H * 0.22, W * 0.26));
        const qy = 40 * f;
        const hx = m + logoW + 20 * f;
        const headAvail = Math.max(W - m - qs - 24 * f - hx, 60 * f);
        const fitSize = (txt, size, k, min) => Math.max(min, Math.min(size, headAvail / (Math.max(String(txt).length, 1) * k)));
        const siteText = String(data.siteName || labels.area || '');
        const companyText = String(data.companyName || '');
        const siteSize = fitSize(siteText, nameSize, 0.66, 13 * f);
        const companySize = fitSize(companyText, nameSize * 0.6, 0.6, 10 * f);
        s += `<text x="${hx}" y="${m + 38 * f}" font-size="${siteSize}" font-weight="700" fill="${C.badge}">${esc(siteText)}</text><text x="${hx}" y="${m + 70 * f}" font-size="${companySize}" fill="#6B7089">${esc(companyText)}</text>`;
        s += `<text x="${m}" y="${m + 157 * f}" font-size="${(tiny ? 42 : 58) * f}" font-weight="700" fill="${C.ink}">${esc(labels.title)}</text>`;
        s += qrPath(data.qrRows, W - m - qs, qy, qs, C.ink, 3 * f);
        // El aviso del QR va abajo, junto al código: arriba se encimaba con los nombres largos de empresa.
        if (qs >= 110) {
            s += `<text x="${W - m - qs - 20 * f}" y="${qy + qs - 84 * f}" font-size="${23 * f}" font-weight="700" fill="${C.ink}" text-anchor="end">${esc(labels.scan)}</text>`;
            s += `<text x="${W - m - qs - 20 * f}" y="${qy + qs - 52 * f}" font-size="${19 * f}" fill="#3F435D" text-anchor="end">${esc(labels.fixed)}</text>`;
        }
        const urlY = qy + qs + 22 * f;
        // La dirección del QR ya no se escribe debajo del código (urlY solo deja el mismo espacio de siempre).
        const ruleY = Math.max(urlY + 14 * f, m + 195 * f + 42 * f);
        s += `<line x1="${m}" y1="${ruleY}" x2="${W - m}" y2="${ruleY}" stroke="${C.rule}" stroke-width="${3 * f}"/>`;
        const top = ruleY + 20 * f;
        // pie
        const lineY = H - 91 * f;
        // leyenda: los tipos de zona (con los mismos colores del mapa) y, después, cada zona con formato propio con su nombre y su muestra; se acomoda en los renglones que haga falta
        // La leyenda solo nombra lo que se ve en el croquis.
        const leg = [];
        if (on('puertas')) leg.push(['door', labels.door]);
        if (on('luz') && (data.layout.power || []).length) leg.push(['power', labels.power]);
        if (on('contorno') && (data.layout.obstacles || []).length) leg.push(['column', labels.column]);
        if (on('espacios')) leg.push(['space', labels.space]);
        if (on('zonas')) {
            leg.push(['dry', labels.dry], ['cold', labels.cold], ['chemical', labels.chemical], ['finished', labels.finished], ['dock', labels.dock], ['office', labels.office], ['aisle', labels.aisle], ['aisle2', labels.aisle2], ['none', labels.none]);
            (data.layout.zones || []).filter((z) => z.fmt).slice(0, 12).forEach((z) => leg.push([`zone:${z.id}`, z.name, z]));
        }
        const legPos = [];
        let legX = m;
        let legRow = 0;
        leg.forEach((item) => {
            const textW = item[1].length * 8.6 * f;
            if (legX > m && legX + 30 * f + textW > W - m) { legX = m; legRow += 1; }
            legPos.push({ item, x: legX, row: legRow });
            legX += 30 * f + textW + 26 * f;
        });
        const legendH = tiny ? 0 : 28 * f * (legRow + 1) + 12 * f;
        const frameBottom = lineY - legendH;
        // mapa y tarjetas
        let frameX = m;
        let frameW;
        let frameH;
        // Los totales (las tarjetas de m² y m³) se pueden quitar de la hoja (data.view.totals = false): el mapa ocupa el lugar que dejan.
        const showTotals = view.totals !== false;
        if (land) {
            const cw = showTotals ? clamp(394 * f, 120, W * 0.27) : 0;
            const gap = showTotals ? 28 * f : 0;
            frameW = W - 2 * m - cw - gap;
            frameH = frameBottom - top;
            if (showTotals) {
                const pitch = (frameH - 82 * f) / Math.max(cards.length - 1, 1);
                const cardH = Math.min(82 * f, pitch - 8 * f);
                const kk = cardH / (82 * f);
                cards.forEach((c, i) => {
                    const y = top + i * pitch;
                    s += `<rect x="${W - m - cw}" y="${y}" width="${cw}" height="${cardH}" rx="${10 * f}" fill="${C.cardBg}" stroke="${C.cardBorder}" stroke-width="${2 * f}"/>`;
                    s += `<text x="${W - m - cw + 22 * f}" y="${y + 41 * f * kk}" font-size="${32 * f}" font-weight="700" fill="${C.cardInk}">${esc(c[0])}</text><text x="${W - m - cw + 22 * f}" y="${y + 68 * f * kk}" font-size="${17 * f}" fill="#3F435D">${esc(c[1])}</text>`;
                });
            }
        } else {
            const rows = showTotals ? Math.ceil(cards.length / 2) : 0;
            const gp = 12 * f;
            const cardH = Math.min(82 * f, Math.max((frameBottom - top) * 0.1, 40 * f));
            const cardsH = showTotals ? rows * cardH + (rows - 1) * gp : 0;
            frameW = W - 2 * m;
            frameH = frameBottom - top - cardsH - (showTotals ? 20 * f : 0);
            if (showTotals) {
                const cw = (frameW - gp) / 2;
                const kk = cardH / (82 * f);
                cards.forEach((c, i) => {
                    const x = m + (i % 2) * (cw + gp);
                    const y = frameBottom - cardsH + Math.floor(i / 2) * (cardH + gp);
                    s += `<rect x="${x}" y="${y}" width="${cw}" height="${cardH}" rx="${10 * f}" fill="${C.cardBg}" stroke="${C.cardBorder}" stroke-width="${2 * f}"/>`;
                    s += `<text x="${x + 22 * f}" y="${y + 41 * f * kk}" font-size="${32 * f}" font-weight="700" fill="${C.cardInk}">${esc(c[0])}</text><text x="${x + 22 * f}" y="${y + 68 * f * kk}" font-size="${17 * f}" fill="#3F435D">${esc(c[1])}</text>`;
                });
            }
        }
        s += `<rect x="${frameX}" y="${top}" width="${frameW}" height="${frameH}" rx="${10 * f}" fill="#FFFFFF" stroke="${C.frame}" stroke-width="${2 * f}"/>`;
        // el mapa se dibuja en un lienzo de 700 px de ancho con la forma del marco, para aprovecharlo entero
        const innerW = frameW - 20 * f;
        const innerH = frameH - 20 * f;
        const h700 = Math.max(120, Math.round((700 * innerH) / Math.max(innerW, 1)));
        const mapInner = window.LayoutMapSvg.mapSvg(data.layout, { theme: th, width: 700, height: h700, layers, measures: view.measures !== false, area: view.area !== false, rotation: view.rotation || 0 }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
        s += `<svg x="${frameX + 10 * f}" y="${top + 10 * f}" width="${innerW}" height="${innerH}" viewBox="0 0 700 ${h700}" preserveAspectRatio="xMidYMid meet">${mapInner}</svg>`;
        legPos.forEach(({ item: [key, text, zone], x, row }) => {
            if (tiny) return;
            const ly = frameBottom + 4 * f + row * 28 * f;
            const sw = 20 * f;
            if (zone) {
                s += window.LayoutMapSvg.zonePaint(`lg-${zone.id}`, zone.fmt).markup(`${x},${ly} ${x + sw},${ly} ${x + sw},${ly + sw} ${x},${ly + sw}`);
            } else {
                let paint;
                if (key === 'door') paint = 'fill="#1E7E34" stroke="#1E7E34"';
                else if (key === 'power') paint = 'fill="#FBF0DE" stroke="#D9A441"';
                else if (key === 'column') paint = 'fill="#6B7089" stroke="#6B7089"';
                else if (key === 'space') paint = `fill="#FFFFFF" stroke="${C.line}"`;
                else { const c = th.types[key]; paint = `fill="${c[0]}" stroke="${c[1]}"${c[2] ? ` stroke-dasharray="${c[2]}"` : ''}`; }
                s += `<rect x="${x}" y="${ly}" width="${sw}" height="${sw}" rx="${4 * f}" ${paint} stroke-width="${1.5 * f}"/>`;
            }
            s += `<text x="${x + 30 * f}" y="${ly + 16 * f}" font-size="${16 * f}" fill="#3F435D">${esc(text)}</text>`;
        });
        s += `<line x1="${m}" y1="${lineY}" x2="${W - m}" y2="${lineY}" stroke="${C.cardBorder}" stroke-width="${2 * f}"/>`;
        s += `<text x="${m}" y="${H - 57 * f}" font-size="${19 * f}" fill="#3F435D">${esc(labels.printed)} <tspan font-weight="700" fill="${C.ink}">${esc(dateFmt(data.printedAt))}</tspan>${tiny ? '' : `. ${esc(labels.snapshot)}`}</text>`;
        s += `<text x="${m}" y="${H - 27 * f}" font-size="${17 * f}" fill="#6B7089">${esc(labels.updated)} ${esc(dateFmt(data.updatedAt))} (UTC ${utc(data.updatedAt)})</text>`;
        s += `<text x="${W - m}" y="${H - 41 * f}" font-size="${34 * f}" font-weight="700" fill="${C.ink}" text-anchor="end">${esc(labels.version)} ${data.version}</text>`;
        return s;
    }

    // El archivo completo: el espacio de wCm × hCm (con su línea punteada para recortar) dentro de la hoja que le toca. makeContent(W, H) dibuja lo de adentro.
    function documentSvg(options, defaults, labels, makeContent) {
        const wCm = clamp(Number(options.widthCm) || defaults[0], LIMITS.min, LIMITS.max);
        const hCm = clamp(Number(options.heightCm) || defaults[1], LIMITS.min, LIMITS.max);
        const cut = options.cut !== false;
        const page = pageFor(wCm, hCm, cut);
        const AW = wCm * PX_CM;
        const AH = hCm * PX_CM;
        const PW = page.w * PX_CM;
        const PH = page.h * PX_CM;
        const ox = page.small ? PX_CM : 0;
        const oy = page.small ? 1.4 * PX_CM : 0;
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}" width="${PW.toFixed(2)}" height="${PH.toFixed(2)}" font-family="${FONT}" data-page-cm="${page.w} ${page.h}">`;
        s += `<rect width="${PW}" height="${PH}" fill="#FFFFFF"/>`;
        if (page.small) s += `<text x="${PX_CM}" y="${0.95 * PX_CM}" font-size="13" fill="#6B7089">${esc(String(labels.cutCaption || '').replace('{w}', dim(wCm)).replace('{h}', dim(hCm)))}</text>`;
        s += `<g transform="translate(${ox.toFixed(2)},${oy.toFixed(2)})">${makeContent(AW, AH)}`;
        if (cut) s += `<rect x="1" y="1" width="${(AW - 2).toFixed(2)}" height="${(AH - 2).toFixed(2)}" fill="none" stroke="#8E94AB" stroke-width="2" stroke-dasharray="9 7"/>`;
        return `${s}</g></svg>`;
    }

    // data: { companyName, siteName (el Sitio que va arriba del nombre; sin él sale labels.area), logoDataUrl, logoRatio, view: { layers, measures, area, totals, rotation }, version, updatedAt (Date), printedAt (Date), url, qrRows, kpis, layout, theme }, labels: textos ya traducidos, lang: 'es' | 'en',
    // options: { widthCm, heightCm, cut } (el espacio que se imprime y si se dibuja la línea punteada para recortar).
    function buildSheetSvg(data, labels, lang, options = {}) {
        return documentSvg(options, [42, 29.7], labels, (W, H) => sheetContent(data, labels, lang, W, H));
    }

    // La tarjeta de categorías de una zona: card = { companyName, siteName (el Sitio, arriba del nombre; sin él sale labels.cardArea), logoDataUrl, logoRatio, theme, zoneName, align ('center' = categorías centradas en el contorno; si no, arriba), categories: [{ name, desc, icon, color, qrRows }] }. Una columna de renglones
    // (icono, nombre, descripción y QR de cada categoría) y, si el espacio es ancho, dos columnas. Con 10.5 × 14.8 cm queda como la tarjeta impresa.
    function cardContent(card, labels, W, H) {
        const th = card.theme || window.LayoutMapSvg.DEFAULT_THEME;
        const C = th.chrome;
        const brand = th.custom ? C.badge : '#6B3E98';
        const ink = th.custom ? C.ink : '#14161F';
        const f = clamp(Math.min(W / 400, H / 564), 0.4, 3.2);
        const m = 22 * f;
        const n = card.categories.length;
        const wide = W / H > 1.25;
        const SERIF = 'Georgia, "Times New Roman", serif';
        let s = `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
        // encabezado: logo (o iniciales) y, a su lado, el Sitio arriba y el nombre de la empresa abajo. El nombre nunca pasa del margen derecho (el espacio de corte): baja de
        // tamaño, se parte en dos renglones y, si aun así no cabe, se comprime (textLength).
        const bs = 34 * f;
        const logoW = card.logoDataUrl ? bs * clamp(Number(card.logoRatio) || 1.4, 0.5, 2.4) : bs;
        if (card.logoDataUrl) s += `<image href="${esc(card.logoDataUrl)}" x="${m}" y="${m}" width="${logoW}" height="${bs}" preserveAspectRatio="xMinYMid meet"/>`;
        else s += `<rect x="${m}" y="${m}" width="${bs}" height="${bs}" rx="${8 * f}" fill="${brand}"/><text x="${m + bs / 2}" y="${m + bs * 0.66}" font-size="${15 * f}" font-weight="700" fill="#FFFFFF" text-anchor="middle">${esc((card.companyName || '').trim().slice(0, 2).toUpperCase() || '··')}</text>`;
        const hx = m + logoW + 12 * f;
        const avail = Math.max(W - m - hx, 20 * f);
        // Lo fuerte arriba y lo débil abajo: el Sitio (grande, en negritas y en el color de la marca) y debajo el nombre de la empresa (chico y en gris).
        const site = String(card.siteName || labels.cardArea || '').trim();
        const company = String(card.companyName || '').trim().toUpperCase();
        const splitTwo = (txt, size, k) => {
            let l1 = '';
            let l2 = '';
            txt.split(/\s+/).forEach((w) => { if (!l2 && `${l1} ${w}`.trim().length * size * k <= avail) l1 = `${l1} ${w}`.trim(); else l2 = `${l2} ${w}`.trim(); });
            return l2 ? [l1, l2] : [l1];
        };
        // k = ancho aproximado de una letra en em; prueba tamaños de grande a chico, de un renglón a dos, y al final comprime lo que no quepa.
        const fitText = (txt, tries, k, fallbackPx) => {
            for (const [count, px] of tries) {
                const size = px * f;
                const lines = count === 1 ? [txt] : splitTwo(txt, size, k);
                if (lines.every((ln) => ln.length * size * k <= avail)) return { lines, size, k };
            }
            const size = fallbackPx * f;
            return { lines: splitTwo(txt, size, k), size, k };
        };
        const strong = site ? fitText(site, [[1, 13.5], [1, 12], [2, 12], [2, 11], [1, 10], [2, 10], [2, 9]], 0.74, 9) : { lines: [], size: 0, k: 0.74 };
        const weak = company ? fitText(company, [[1, 8.5], [1, 8], [2, 8.5], [2, 8]], 0.7, 7.5) : { lines: [], size: 0, k: 0.7 };
        const stackH = strong.lines.length * strong.size * 1.1 + (strong.lines.length && weak.lines.length ? 3 * f : 0) + weak.lines.length * weak.size * 1.2;
        let cursor = m + Math.max(0, (bs - stackH) / 2);
        const squeeze = (ln, size, k) => (ln.length * size * k > avail ? ` textLength="${avail}" lengthAdjust="spacingAndGlyphs"` : '');
        strong.lines.forEach((ln) => {
            s += `<text x="${hx}" y="${cursor + strong.size * 0.82}" font-size="${strong.size}" font-weight="700" fill="${brand}" font-family='${SERIF}'${squeeze(ln, strong.size, strong.k)}>${esc(ln)}</text>`;
            cursor += strong.size * 1.1;
        });
        if (strong.lines.length && weak.lines.length) cursor += 3 * f;
        weak.lines.forEach((ln) => {
            s += `<text x="${hx}" y="${cursor + weak.size * 0.82}" font-size="${weak.size}" fill="#6B7089" font-family='${SERIF}'${squeeze(ln, weak.size, weak.k)}>${esc(ln)}</text>`;
            cursor += weak.size * 1.2;
        });
        // El título es solo el nombre de la zona, centrado.
        const titleText = String(card.zoneName || '').toUpperCase();
        const titleSize = Math.min(17 * f, ((W - 2 * m) / Math.max(titleText.length, 1)) * 1.75);
        s += `<text x="${W / 2}" y="${m + 62 * f}" font-size="${titleSize}" font-weight="700" fill="${ink}" text-anchor="middle">${esc(titleText)}</text>`;
        const cols = wide && n > 1 ? 2 : 1;
        // Una sola categoría: en vez de una fila arriba y un hueco enorme abajo, el nombre grande y centrado va arriba (sobre un fondo suave de su color) y el QR centrado abajo,
        // tan grande como alcance, repartidos en el marco. Vale en tarjetas verticales y anchas (en las anchas el nombre ocupa menos alto para que el QR crezca). Con dos o más
        // categorías la tarjeta sigue como siempre.
        const single = n === 1;
        const gap = 18 * f;
        // El espacio de las categorías lleva su contorno (un marco con las esquinas redondeadas) y todo va adentro, con un poco de aire.
        const pad = 10 * f;
        const colW = (W - 2 * m - 2 * pad - gap * (cols - 1)) / cols;
        // El contorno abarca TODO el espacio donde caben categorías (de abajo del nombre de la zona, con un espacio mínimo, hasta arriba del pie), aunque hoy haya pocas: las categorías
        // se acomodan arriba, dentro del marco, y el resto queda libre para las que se agreguen. Con muchas, los renglones se achican para caber.
        const areaTop = m + 72 * f;
        const bottom = H - m - 22 * f;
        const headH = 14 * f;
        const perCol = Math.ceil(n / cols) || 1;
        const frameH = bottom - areaTop;
        const rowH = Math.min(78 * f, (frameH - headH - 2 * pad) / perCol);
        const frameTop = areaTop;
        // card.align === 'center': CATEGORÍA / BÚSCAME se queda arriba y los renglones se centran en lo que queda libre del contorno (con muchas categorías no queda espacio y no se nota).
        const shiftY = card.align === 'center' ? Math.max(0, (frameH - 2 * pad - headH - perCol * rowH) / 2) : 0;
        const blockTop = frameTop + pad;
        const headY = blockTop + 8 * f;
        const top = blockTop + headH;
        s += `<rect x="${m}" y="${frameTop}" width="${W - 2 * m}" height="${frameH}" rx="${8 * f}" fill="none" stroke="#C9CCDA" stroke-width="${1.4 * f}"/>`;
        for (let c = 0; c < (single ? 0 : cols); c += 1) {
            const x0 = m + pad + c * (colW + gap);
            s += `<text x="${x0}" y="${headY}" font-size="${8 * f}" font-weight="700" fill="#3F435D">${esc(labels.cardCategory)}</text><text x="${x0 + colW}" y="${headY}" font-size="${8 * f}" font-weight="700" fill="${brand}" text-anchor="end">${esc(labels.cardReview)}</text>`;
            s += `<line x1="${x0}" y1="${top}" x2="${x0 + colW}" y2="${top}" stroke="#D9DBE5" stroke-width="${f}"/>`;
        }
        (single ? [] : card.categories).forEach((cat, i) => {
            const col = Math.floor(i / perCol);
            const row = i % perCol;
            const x0 = m + pad + col * (colW + gap);
            const y = top + shiftY + row * rowH;
            const isz = Math.min(34 * f, rowH * 0.56);
            const qs = Math.min(rowH - 10 * f, 76 * f);
            s += `<rect x="${x0}" y="${y + f}" width="${4 * f}" height="${rowH - 2 * f}" fill="${esc(cat.color)}"/>`;
            s += `<rect x="${x0 + 14 * f}" y="${y + rowH / 2 - isz / 2}" width="${isz}" height="${isz}" rx="${isz * 0.24}" fill="${esc(cat.color)}"/>`;
            s += `<g transform="translate(${x0 + 14 * f + isz * 0.2},${y + rowH / 2 - isz * 0.3}) scale(${(isz * 0.6) / 24})">${window.LayoutMapSvg.categoryGlyph(cat.icon, '#FFFFFF', 2.2)}</g>`;
            const tx = x0 + 14 * f + isz + 12 * f;
            const nameMax = (colW - (tx - x0) - qs - 12 * f) / Math.max(cat.name.length, 1) * 1.7;
            s += `<text x="${tx}" y="${y + rowH / 2 - 1 * f}" font-size="${Math.min(13.5 * f, nameMax)}" font-weight="700" fill="${ink}">${esc(cat.name)}</text>`;
            if (cat.desc) s += `<text x="${tx}" y="${y + rowH / 2 + 12 * f}" font-size="${7.6 * f}" fill="#3F435D">${esc(cat.desc)}</text>`;
            s += qrPath(cat.qrRows, x0 + colW - qs, y + (rowH - qs) / 2, qs, '#FFFFFF', 0);
            s += `<line x1="${x0}" y1="${y + rowH}" x2="${x0 + colW}" y2="${y + rowH}" stroke="#D9DBE5" stroke-width="${f}"/>`;
        });
        if (single) {
            const cat = card.categories[0];
            const fx = m + pad;
            const fw = W - 2 * m - 2 * pad;
            const fy0 = frameTop + pad;
            const fy1 = frameTop + frameH - pad;
            const split = fy0 + (fy1 - fy0) * 0.38;
            s += `<text x="${fx}" y="${fy0 + 8 * f}" font-size="${8 * f}" font-weight="700" fill="#3F435D">${esc(labels.cardCategory)}</text>`;
            // el nombre va sobre un fondo suave, difuminado, del color de la categoría
            const gid = `ctint${String(cat.color).replace(/[^0-9a-fA-F]/g, '')}`;
            const panelY = fy0 + 16 * f;
            const panelH = wide ? Math.min((fy1 - panelY) * 0.4, 96 * f) : split - panelY - 4 * f;
            s += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(cat.color)}" stop-opacity="0.26"/><stop offset="1" stop-color="${esc(cat.color)}" stop-opacity="0.07"/></linearGradient></defs>`;
            s += `<rect x="${fx}" y="${panelY}" width="${fw}" height="${panelH}" rx="${10 * f}" fill="url(#${gid})"/>`;
            // el bloque (icono, nombre, descripción) siempre cabe en su fondo aunque la tarjeta sea baja
            const isz = Math.min((wide ? 36 : 44) * f, panelH * 0.42, (panelH - 4 * f) * 0.4);
            const nameSize = Math.min((wide ? 26 : 19) * f, ((fw - 16 * f) / Math.max(cat.name.length, 1)) * 1.75, (panelH - 4 * f) * 0.34);
            const blockH = isz + 8 * f + nameSize + (cat.desc ? 14 * f : 0);
            const by = panelY + (panelH - blockH) / 2;
            s += `<rect x="${W / 2 - isz / 2}" y="${by}" width="${isz}" height="${isz}" rx="${isz * 0.24}" fill="${esc(cat.color)}"/>`;
            s += `<g transform="translate(${W / 2 - isz / 2 + isz * 0.2},${by + isz * 0.2}) scale(${(isz * 0.6) / 24})">${window.LayoutMapSvg.categoryGlyph(cat.icon, '#FFFFFF', 2.2)}</g>`;
            const nameY = by + isz + 8 * f + nameSize * 0.85;
            s += `<text x="${W / 2}" y="${nameY}" font-size="${nameSize}" font-weight="700" fill="${ink}" text-anchor="middle">${esc(cat.name)}</text>`;
            if (cat.desc) s += `<text x="${W / 2}" y="${nameY + 14 * f}" font-size="${8.4 * f}" fill="#3F435D" text-anchor="middle">${esc(cat.desc)}</text>`;
            // el QR grande, abajo, con BÚSCAME encima
            let qs;
            let qy;
            if (wide) {
                // hoja ancha: el QR centrado debajo del nombre, tan grande como el alto que queda
                const qTop = panelY + panelH + 16 * f;
                const rest = fy1 - qTop - 2 * f;
                qs = Math.min(rest, fw * 0.5);
                qy = qTop + (rest - qs) / 2;
            } else {
                qs = Math.min(fw * 0.88, (fy1 - split - 14 * f) * 0.96);
                qy = fy1 - qs - 2 * f;
            }
            s += `<text x="${W / 2}" y="${qy - 8 * f}" font-size="${9 * f}" font-weight="700" fill="${brand}" text-anchor="middle">${esc(labels.cardReview)}</text>`;
            s += qrPath(cat.qrRows, W / 2 - qs / 2, qy, qs, '#FFFFFF', 0);
        }
        if (!n) s += `<text x="${W / 2}" y="${frameTop + frameH / 2 + 4 * f}" font-size="${11 * f}" fill="#8E94AB" text-anchor="middle">${esc(labels.cardEmpty)}</text>`;
        s += `<text x="${W / 2}" y="${H - m - 6 * f}" font-size="${7.6 * f}" fill="${brand}" text-anchor="middle">${esc(labels.cardFooter)}</text>`;
        return s;
    }
    function buildCardSvg(card, labels, options = {}) {
        return documentSvg(options, [10.5, 14.8], labels, (W, H) => cardContent(card, labels, W, H));
    }

    const pageCm = (svg) => { const mt = /data-page-cm="([\d.]+) ([\d.]+)"/.exec(svg); return mt ? [Number(mt[1]), Number(mt[2])] : [42, 29.7]; };

    function svgToCanvas(svg, widthPx) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
                const ratio = vb ? Number(vb[2]) / Number(vb[1]) : 1131 / 1600;
                const canvas = document.createElement('canvas');
                canvas.width = widthPx;
                canvas.height = Math.round(widthPx * ratio);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas);
            };
            img.onerror = () => reject(new Error('svg render failed'));
            // data: (no blob:) porque la política de seguridad del sistema solo deja cargar imágenes propias y data:
            img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        });
    }
    const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality));
    // píxeles del archivo según lo ancha que sea la hoja (unos 210 puntos por pulgada, sin pasar de lo que un navegador pinta con comodidad)
    const pxFor = (svg) => clamp(Math.round(pageCm(svg)[0] * 83.5), 900, 6500);

    // Un PDF de una sola página (del tamaño de la hoja) con la imagen JPEG ocupando toda la hoja.
    function jpegToPdf(jpeg, pxW, pxH, pageWpt = 1190.55, pageHpt = 841.89) {
        const pageW = Math.round(pageWpt * 100) / 100;
        const pageH = Math.round(pageHpt * 100) / 100;
        const enc = new TextEncoder();
        const parts = [];
        const offsets = [];
        let pos = 0;
        const push = (data) => { const b = typeof data === 'string' ? enc.encode(data) : data; parts.push(b); pos += b.length; };
        push('%PDF-1.4\n');
        offsets[1] = pos; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
        offsets[2] = pos; push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
        offsets[3] = pos; push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
        offsets[4] = pos; push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
        push(jpeg); push('\nendstream\nendobj\n');
        const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
        offsets[5] = pos; push(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
        const xrefPos = pos;
        let xref = 'xref\n0 6\n0000000000 65535 f \n';
        for (let i = 1; i <= 5; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
        push(`${xref}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
        return new Blob(parts, { type: 'application/pdf' });
    }

    async function renderPng(svg) {
        const canvas = await svgToCanvas(svg, pxFor(svg));
        return canvasToBlob(canvas, 'image/png');
    }
    async function renderPdf(svg) {
        const canvas = await svgToCanvas(svg, pxFor(svg));
        const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.93)).arrayBuffer());
        const [wCm, hCm] = pageCm(svg);
        return jpegToPdf(jpeg, canvas.width, canvas.height, (wCm / 2.54) * 72, (hCm / 2.54) * 72);
    }
    function saveBlob(blob, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    }

    window.LayoutSheet = { buildSheetSvg, buildCardSvg, renderPng, renderPdf, saveBlob, jpegToPdf, pageFor, PRESETS, PAGES, LIMITS, PX_CM, qrPath, svgToCanvas, canvasToBlob, pageCm, clamp };
}());
