/* Fila de totales (Daniel, 2026-11-27): los cálculos que se ponen al pie de una tabla filtrada. UN solo motor para todo el sistema: el servidor lo usa para sumar o contar TODOS los renglones que pasan el filtro
 * (Registros Información) y la pantalla lo usa sobre los renglones que ya trae (Análisis).
 *
 * Un cálculo (spec) es { fn } o { fn: 'where', rule }:
 *   count     contar con dato          empty   contar vacíos
 *   distinct  contar sin repetir       once    contar los que salen una sola vez
 *   where     contar solo los que cumplen una condición (rule: { kind: 'text', mode: 'contains' | 'startsWith' | 'equals', text } o { kind: 'range', from, to })
 *   sum / avg / min / max   solo con números
 * La condición de texto usa la misma escritura de los filtros (SearchSyntax: $ antes, @ después, coma = varias búsquedas). */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./SearchSyntax.js'));
    else root.TotalsCalc = factory(root.SearchSyntax);
}(typeof self !== 'undefined' ? self : this, function (SearchSyntax) {
    const FNS = ['count', 'empty', 'distinct', 'once', 'where', 'sum', 'avg', 'min', 'max'];
    const NUMERIC_FNS = ['sum', 'avg', 'min', 'max'];
    const MODES = ['contains', 'startsWith', 'equals'];
    const MAX_TEXT = 200;
    const MAX_COLUMNS = 80;
    const MAX_JSON = 20000;
    const isEmpty = (v) => v === null || v === undefined || v === '';
    const shownOf = (v) => (isEmpty(v) ? '—' : String(v));
    // el número de una celda: un número tal cual o un texto que lo parece («$1,234.50», «12%»); lo demás no es número
    const toNumber = (v) => {
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (isEmpty(v)) return null;
        const s = String(v).trim().replace(/[$,\s%]/g, '');
        return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
    };
    const round = (n) => Math.round(n * 1e6) / 1e6; // sin la basura de los decimales de la suma (0.1 + 0.2)

    // Deja el cálculo limpio o devuelve null si no vale (una función que no existe, una condición vacía).
    function normalizeSpec(raw) {
        if (!raw || typeof raw !== 'object' || !FNS.includes(raw.fn)) return null;
        if (raw.fn !== 'where') return { fn: raw.fn };
        const rule = raw.rule;
        if (!rule || typeof rule !== 'object') return null;
        if (rule.kind === 'range') {
            const from = toNumber(rule.from);
            const to = toNumber(rule.to);
            if (from === null && to === null) return null;
            return { fn: 'where', rule: { kind: 'range', from, to } };
        }
        const text = String(rule.text === undefined || rule.text === null ? '' : rule.text).trim().slice(0, MAX_TEXT);
        if (!text || !SearchSyntax.split(text).length) return null;
        return { fn: 'where', rule: { kind: 'text', mode: MODES.includes(rule.mode) ? rule.mode : 'contains', text } };
    }
    // { columna: cálculo } tal como viaja (texto JSON) → { specs: Map(columna → cálculo limpio) } o { error }
    function parseCalcs(raw) {
        if (raw === undefined || raw === null || raw === '') return { specs: new Map() };
        if (typeof raw !== 'string' || raw.length > MAX_JSON) return { error: 'BAD_CALCS' };
        let obj;
        try { obj = JSON.parse(raw); } catch { return { error: 'BAD_CALCS' }; }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { error: 'BAD_CALCS' };
        const keys = Object.keys(obj);
        if (keys.length > MAX_COLUMNS) return { error: 'BAD_CALCS' };
        const specs = new Map();
        keys.forEach((key) => { const spec = normalizeSpec(obj[key]); if (spec) specs.set(key, spec); });
        return { specs };
    }

    // Un acumulador por columna: add(valor, texto que se ve) por cada renglón y result() al final. needsShown: pide el texto que se ve (solo la condición de texto lo usa).
    function accumulator(spec) {
        const fn = spec.fn;
        if (fn === 'count') { let n = 0; return { add: (v) => { if (!isEmpty(v)) n += 1; }, result: () => n }; }
        if (fn === 'empty') { let n = 0; return { add: (v) => { if (isEmpty(v)) n += 1; }, result: () => n }; }
        if (fn === 'distinct') { const seen = new Set(); return { add: (v) => { if (!isEmpty(v)) seen.add(String(v)); }, result: () => seen.size }; }
        if (fn === 'once') {
            const seen = new Map();
            return { add: (v) => { if (isEmpty(v)) return; const k = String(v); seen.set(k, (seen.get(k) || 0) + 1); }, result: () => { let n = 0; seen.forEach((c) => { if (c === 1) n += 1; }); return n; } };
        }
        if (fn === 'where') {
            let n = 0;
            if (spec.rule.kind === 'range') {
                const { from, to } = spec.rule;
                return { add: (v) => { const x = toNumber(v); if (x === null) return; if ((from !== null && x < from) || (to !== null && x > to)) return; n += 1; }, result: () => n };
            }
            const test = SearchSyntax.compile(spec.rule.mode, spec.rule.text);
            return { needsShown: true, add: (v, shown) => { if (isEmpty(v)) return; if (test(shown === undefined || shown === null ? String(v) : shown)) n += 1; }, result: () => n };
        }
        // los de números
        let sum = 0; let count = 0; let min = null; let max = null;
        return {
            add: (v) => { const x = toNumber(v); if (x === null) return; sum += x; count += 1; if (min === null || x < min) min = x; if (max === null || x > max) max = x; },
            result: () => {
                if (fn === 'sum') return round(sum);
                if (!count) return null; // sin ningún número no hay promedio, mínimo ni máximo
                if (fn === 'avg') return round(sum / count);
                return fn === 'min' ? min : max;
            },
        };
    }
    // specs: Map(columna → cálculo); indexOf(columna) → posición (undefined si no existe); scan(onRow): llama onRow(get, getShown) por cada renglón que cuenta, con get(posición) = lo que trae el renglón.
    function compute(specs, indexOf, scan) {
        const entries = [];
        specs.forEach((spec, key) => { const idx = indexOf(key); if (idx !== undefined && idx !== null && idx >= 0) entries.push({ key, idx, acc: accumulator(spec) }); });
        let rows = 0;
        scan((get, getShown) => {
            rows += 1;
            for (let i = 0; i < entries.length; i += 1) {
                const e = entries[i];
                e.acc.add(get(e.idx), e.acc.needsShown && getShown ? getShown(e.idx) : undefined);
            }
        });
        const values = {};
        entries.forEach((e) => { values[e.key] = e.acc.result(); });
        return { rows, values };
    }
    // El número como se ve en el pie de la tabla: enteros con comas, con decimales hasta dos.
    function formatValue(value, locale) {
        if (value === null || value === undefined) return '—';
        const n = Number(value);
        if (!Number.isFinite(n)) return '—';
        return n.toLocaleString(locale || 'es-MX', { maximumFractionDigits: 2 });
    }
    return { FNS, NUMERIC_FNS, MODES, normalizeSpec, parseCalcs, accumulator, compute, formatValue, toNumber, isEmpty, shownOf };
}));
