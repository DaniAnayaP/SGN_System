// Cómo se escribe una búsqueda o un filtro de texto en TODO el sistema (tablas, filtro avanzado, búsquedas guardadas, buscador del QR…). Un solo motor: lo usan la pantalla y el servidor.
//
// Lo escrito se parte por COMAS en búsquedas independientes (basta con cumplir CUALQUIERA, un «o», nunca un «y»). Cada una es una palabra buscada y, pegados a ella, signos con otras palabras:
//   $palabra = esa otra palabra va ANTES de la buscada      rack$cajón        → «rack» con «cajón» antes
//   @palabra = esa otra palabra va DESPUÉS de la buscada    rack@cajón        → «rack» con «cajón» después
//   rack$número@cajón                                        → «número» antes y «cajón» después; varias palabras con el mismo signo piden todas: rack@cajón@tapa
//   rack$cajón, estante                                      → lo uno, o bien «estante»
// «Antes» y «después» valen en cualquier parte del texto (no hace falta que estén pegadas). Mayúsculas, acentos y espacios junto a la coma o al signo no cuentan.
// Con el tipo de filtro: Contiene = la palabra puede estar en cualquier parte; Inicia con = debe abrir el texto (así que solo sirve @); Igual que = el texto es exactamente esa palabra y los signos
// no se usan (ahí «$» y «@» son letras normales). El signo # todavía no tiene significado: se busca como una letra más.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SearchSyntax = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    const MARKS = /[̀-ͯ]/g;
    const fold = (text) => String(text == null ? '' : text).normalize('NFD').replace(MARKS, '').toLowerCase();
    const trimFold = (text) => fold(text).trim();

    // Las búsquedas independientes de lo escrito: [{ raw, main, before: [...], after: [...], parts: { main, before, after } }]. main/before/after ya van sin acentos ni mayúsculas;
    // parts trae las palabras como se escribieron (para mostrarlas). Una búsqueda sin palabra buscada pero con «antes» o «después» (@cajón) busca esa palabra en cualquier parte.
    function parse(query) {
        const out = [];
        String(query == null ? '' : query).split(',').forEach((piece) => {
            const raw = piece.trim();
            if (!raw) return;
            const tokens = raw.split(/([$@])/);
            const main = tokens[0].trim();
            const before = [];
            const after = [];
            for (let i = 1; i < tokens.length; i += 2) {
                const word = (tokens[i + 1] || '').trim();
                if (!word) continue;
                (tokens[i] === '$' ? before : after).push(word);
            }
            if (!main && !before.length && !after.length) return;
            out.push({ raw, main: trimFold(main), before: before.map(trimFold), after: after.map(trimFold), parts: { main, before, after } });
        });
        return out;
    }

    // Palabras sueltas, como las separaba la tabla antes (por coma, sin mayúsculas); los signos se quedan dentro de cada una.
    function split(text, keepCase = false) {
        return String(text == null ? '' : text).split(',').map((s) => s.trim()).filter(Boolean).map((s) => (keepCase ? s : s.toLowerCase()));
    }

    // ¿El texto de la búsqueda ya sirve? Contiene pide al menos 2 letras o números (con 1 saldría casi todo); Inicia con e Igual que sirven con 1.
    function ready(mode, query) {
        if (mode === 'equals') return split(query).length > 0;
        const alts = parse(query);
        if (!alts.length) return false;
        const longest = Math.max(...alts.map((a) => Math.max(a.main.length, ...a.before.map((w) => w.length), ...a.after.map((w) => w.length))));
        return longest >= (mode === 'contains' ? 2 : 1);
    }

    // Dónde cae la palabra buscada en el texto (ya sin acentos) y si cumple sus «antes» y «después». Devuelve las posiciones que cumplen.
    function hits(mode, alt, v) {
        const out = [];
        const m = alt.main;
        const ok = (pos) => {
            const end = pos + m.length;
            const left = v.slice(0, pos);
            const right = v.slice(end);
            return alt.before.every((w) => left.includes(w)) && alt.after.every((w) => right.includes(w));
        };
        if (mode === 'startsWith') {
            if (v.startsWith(m) && ok(0)) out.push(0);
            return out;
        }
        if (m === '') {
            // sin palabra buscada (@cajón, $número): sirve cualquier punto del texto en el que se cumplan sus «antes» y «después»
            for (let pos = 0; pos <= v.length; pos += 1) if (ok(pos)) { out.push(pos); break; }
            return out;
        }
        let at = v.indexOf(m);
        while (at >= 0) {
            if (ok(at)) out.push(at);
            at = v.indexOf(m, at + 1);
        }
        return out;
    }

    // La prueba de una búsqueda: compile(modo, texto)(valor) → true/false. Sin nada escrito todo cumple.
    function compile(mode, query) {
        if (mode === 'equals') {
            // Igual que: ambos lados se parten por coma (una celda puede traer varios valores, p. ej. los Centros de Costos); aquí los signos son letras normales.
            const wanted = String(query == null ? '' : query).split(',').map(trimFold).filter(Boolean);
            if (!wanted.length) return () => true;
            return (value) => {
                const parts = fold(value).split(',').map((s) => s.trim());
                return wanted.some((w) => parts.includes(w));
            };
        }
        const alts = parse(query);
        if (!alts.length) return () => true;
        return (value) => {
            const v = fold(value);
            return alts.some((alt) => hits(mode, alt, v).length > 0);
        };
    }
    const matches = (mode, query, value) => compile(mode, query)(value);

    // Lo que se marca en el texto original: [{ start, end, role }] sin encimarse, role = main (la palabra buscada), before o after. Con Igual que no se marca nada.
    function ranges(mode, query, value) {
        const text = String(value == null ? '' : value);
        if (mode === 'equals' || !text) return [];
        const alts = parse(query);
        if (!alts.length) return [];
        let folded = '';
        const map = [];
        for (let i = 0; i < text.length; i += 1) {
            const piece = fold(text[i]);
            for (let k = 0; k < piece.length; k += 1) map.push(i);
            folded += piece;
        }
        map.push(text.length);
        const found = [];
        const add = (from, to, role) => { if (to > from) found.push({ start: map[from], end: map[to] === undefined ? text.length : map[to], role }); };
        alts.forEach((alt) => {
            hits(mode, alt, folded).forEach((pos) => {
                const end = pos + alt.main.length;
                add(pos, end, 'main');
                alt.before.forEach((w) => { const i = folded.slice(0, pos).indexOf(w); if (i >= 0) add(i, i + w.length, 'before'); });
                alt.after.forEach((w) => { const i = folded.indexOf(w, end); if (i >= 0) add(i, i + w.length, 'after'); });
            });
        });
        found.sort((a, b) => a.start - b.start || (a.role === 'main' ? -1 : 1));
        const clean = [];
        found.forEach((r) => { if (!clean.length || r.start >= clean[clean.length - 1].end) clean.push(r); });
        return clean;
    }

    return { fold, parse, split, ready, compile, matches, ranges };
}));
