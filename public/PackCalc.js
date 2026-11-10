// Cuántas piezas caben en una posición (cálculo del «mejor acomodo»). Funciona igual en el navegador y en Node (servidor y pruebas).
//
// Una posición es una caja de largo × fondo × alto (en cm). Lo que se acomoda en ella es un nivel de empaque del artículo:
//   · el material principal (la pieza suelta) o un empaque (primario, secundario, terciario…),
//   · con su forma (rectangular o cilíndrica), sus medidas en cm (largo × ancho × alto; un cilindro lleva su diámetro en largo y su alto),
//   · las piezas (UDM) que trae cada uno y si se puede acostar (por defecto solo va de pie, como viene).
// Resultado: cuántos caben, en cuántas capas, las piezas (UDM) totales, lo que sobra de alto y de fondo y las celdas de UNA capa vista desde arriba (para dibujarlas).
//
// Rectangular: por cada vuelta permitida (siempre se puede girar sobre el piso, largo por ancho; si se puede acostar, también las otras) se cuenta una cuadrícula y una cuadrícula
//   de dos bloques (uno con las cajas giradas), y se queda la que más acomoda.
// Cilíndrica: de pie se compara la cuadrícula contra el tresbolillo (filas desfasadas) en las dos direcciones; si se puede acostar, el cilindro acostado se cuenta como una caja de largo × diámetro × diámetro.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PackCalc = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    const EPS = 1e-6;
    const round1 = (v) => Math.round(v * 10) / 10;
    const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

    // Cuadrícula de cajas a × b en un piso L × W: [{x, y, l, w}]
    function gridCells(a, b, L, W) {
        const nx = Math.floor(L / a + EPS);
        const ny = Math.floor(W / b + EPS);
        const cells = [];
        for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) cells.push({ x: i * a, y: j * b, l: a, w: b });
        return cells;
    }
    // Dos bloques a lo largo: k columnas de a × b y, en lo que queda, columnas giradas (b × a). La mejor k.
    function twoBlockCells(a, b, L, W) {
        let best = [];
        const maxK = Math.floor(L / a + EPS);
        for (let k = 0; k <= maxK; k += 1) {
            const cells = [];
            const ny1 = Math.floor(W / b + EPS);
            for (let j = 0; j < ny1; j += 1) for (let i = 0; i < k; i += 1) cells.push({ x: i * a, y: j * b, l: a, w: b });
            const rest = L - k * a;
            const nx2 = Math.floor(rest / b + EPS);
            const ny2 = Math.floor(W / a + EPS);
            for (let j = 0; j < ny2; j += 1) for (let i = 0; i < nx2; i += 1) cells.push({ x: k * a + i * b, y: j * a, l: b, w: a });
            if (cells.length > best.length) best = cells;
        }
        return best;
    }
    // La mejor distribución de cajas a × b sobre un piso L × W (se prueba también girada).
    function bestRectFloor(a, b, L, W) {
        const options = [gridCells(a, b, L, W), gridCells(b, a, L, W), twoBlockCells(a, b, L, W), twoBlockCells(b, a, L, W)];
        return options.reduce((best, cur) => (cur.length > best.length ? cur : best), []);
    }

    // Círculos de diámetro d en un piso L × W: cuadrícula o tresbolillo (filas a lo largo o a lo fondo). Devuelve [{cx, cy, r}].
    function circleCells(d, L, W) {
        const r = d / 2;
        const out = [];
        const grid = (LL, WW, swap) => {
            const list = [];
            const nx = Math.floor(LL / d + EPS);
            const ny = Math.floor(WW / d + EPS);
            for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) list.push(swap ? { cx: r + j * d, cy: r + i * d, r } : { cx: r + i * d, cy: r + j * d, r });
            return list;
        };
        const stagger = (LL, WW, swap) => {
            const list = [];
            const h = d * Math.sqrt(3) / 2;
            for (let j = 0; r + j * h <= WW - r + EPS; j += 1) {
                const off = j % 2 === 0 ? r : d;
                for (let i = 0; off + i * d <= LL - r + EPS; i += 1) {
                    const x = off + i * d;
                    const y = r + j * h;
                    list.push(swap ? { cx: y, cy: x, r } : { cx: x, cy: y, r });
                }
            }
            return list;
        };
        [grid(L, W, false), stagger(L, W, false), stagger(W, L, true)].forEach((cand) => { if (cand.length > out.length) out.splice(0, out.length, ...cand); });
        return out;
    }

    // pack = { shape: 'rectangular' | 'cilindrica', l, w, h, pieces, lay }  (cilíndrica: l = diámetro, h = alto)
    // box  = { l, w, h } la posición en cm
    function fit(box, pack) {
        const L = num(box && box.l); const W = num(box && box.w); const H = num(box && box.h);
        const pieces = Math.max(1, Math.floor(num(pack && pack.pieces)) || 1);
        const empty = { count: 0, layers: 0, perLayer: 0, pieces, capacity: 0, leftH: round1(H), leftD: round1(W), cells: [], shape: pack && pack.shape === 'cilindrica' ? 'cilindrica' : 'rectangular', lay: false, fits: false };
        if (!(L && W && H) || !pack) return empty;
        const shape = pack.shape === 'cilindrica' ? 'cilindrica' : 'rectangular';
        const lay = !!pack.lay;
        const pl = num(pack.l); const pw = shape === 'cilindrica' ? pl : num(pack.w); const ph = num(pack.h);
        if (!(pl && pw && ph)) return { ...empty, shape };
        let best = null;
        const consider = (cells, height, layFlag, circle) => {
            if (!cells.length || !(height > 0)) return;
            const layers = Math.floor(H / height + EPS);
            if (!layers) return;
            const count = cells.length * layers;
            if (!best || count > best.count) best = { count, layers, perLayer: cells.length, cells, height, lay: layFlag, circle };
        };
        if (shape === 'cilindrica') {
            consider(circleCells(pl, L, W), ph, false, true);
            if (lay) consider(bestRectFloor(ph, pl, L, W), pl, true, false); // acostado: largo = el alto del cilindro, ancho y alto = el diámetro
        } else {
            consider(bestRectFloor(pl, pw, L, W), ph, false, false);
            if (lay) {
                // las otras caras hacia abajo: (l × h) con alto w, y (w × h) con alto l
                consider(bestRectFloor(pl, ph, L, W), pw, true, false);
                consider(bestRectFloor(pw, ph, L, W), pl, true, false);
            }
        }
        if (!best) return { ...empty, shape };
        const usedH = best.layers * best.height;
        const usedD = best.cells.reduce((m, c) => Math.max(m, c.r ? c.cy + c.r : c.y + c.w), 0);
        return {
            count: best.count, layers: best.layers, perLayer: best.perLayer, pieces, capacity: best.count * pieces,
            leftH: round1(H - usedH), leftD: round1(W - usedD), layerHeight: best.height, cells: best.cells, circle: !!best.circle, shape, lay: best.lay, fits: true,
        };
    }

    // Los niveles de empaque de un artículo, del principal hacia afuera: [{ level: 0, name, shape, l, w, h, pieces, lay }, …]
    // art = { dims: { length, width, height }, packaging: { main: { shape, lay }, levels: [{ name, shape, l, w, h, pieces, lay }] } }
    // ¿Esta presentación se puede acomodar? Sin tipos capturados (datos de antes) sí; con tipos, solo si tiene al menos uno habilitado (Unidad de Medida por Distribución).
    const enabled = (lv) => !Array.isArray(lv && lv.types) || lv.types.length > 0;
    function levelsOf(art) {
        const p = (art && art.packaging) || {};
        const main = p.main || {};
        const out = [{ level: 0, name: String(main.name || ''), shape: main.shape === 'cilindrica' ? 'cilindrica' : 'rectangular', l: num(art && art.length), w: num(art && art.width), h: num(art && art.height), pieces: 1, lay: !!main.lay, weightG: num(main.weightG), types: Array.isArray(main.types) ? main.types : null }];
        (Array.isArray(p.levels) ? p.levels : []).forEach((lv, i) => out.push({ level: i + 1, name: String(lv.name || ''), shape: lv.shape === 'cilindrica' ? 'cilindrica' : 'rectangular', l: num(lv.l), w: num(lv.w), h: num(lv.h), pieces: Math.max(1, Math.floor(num(lv.pieces)) || 1), lay: !!lv.lay, weightG: num(lv.weightG), types: Array.isArray(lv.types) ? lv.types : null }));
        return out;
    }

    // Limpia lo que llega de la pantalla o de un archivo: máximo 6 niveles, formas válidas, medidas y piezas positivas. Devuelve null si no hay nada que guardar.
    function sanitize(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const main = raw.main && typeof raw.main === 'object' ? { shape: raw.main.shape === 'cilindrica' ? 'cilindrica' : 'rectangular', lay: !!raw.main.lay } : null;
        const levels = (Array.isArray(raw.levels) ? raw.levels : []).slice(0, 6).map((lv) => {
            if (!lv || typeof lv !== 'object') return null;
            const shape = lv.shape === 'cilindrica' ? 'cilindrica' : 'rectangular';
            const l = round1(num(lv.l)); const h = round1(num(lv.h)); const w = shape === 'cilindrica' ? l : round1(num(lv.w));
            if (!(l && w && h)) return null;
            return { name: String(lv.name || '').trim().slice(0, 60), shape, l, w, h, pieces: Math.max(1, Math.min(1000000, Math.floor(num(lv.pieces)) || 1)), lay: !!lv.lay };
        }).filter(Boolean);
        if (!levels.length && !(main && (main.shape === 'cilindrica' || main.lay))) return null;
        return { main: main || { shape: 'rectangular', lay: false }, levels };
    }

    return { fit, levelsOf, enabled, sanitize, circleCells, bestRectFloor };
}));
