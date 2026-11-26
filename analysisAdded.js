// Análisis Registros Manuales — columnas AGREGADAS en el Archivo (Daniel, 2026-11-26): se agregan sobre el archivo ya extraído y no vienen de ningún registro.
// Pieza 1: «Operación paso a paso». Cada columna agregada es { id, kind: 'op', name, cls, color, decimals, steps } y vive en el diseño del análisis (design.added), así que se repite sola en cada versión y se
// RECALCULA con los datos de esa versión (los datos de la versión no cambian; lo agregado se calcula al leerla). Las piezas siguientes (criterio, fórmula, captura) agregan sus propios «kind».
//
// Los pasos se aplican de arriba abajo sobre un acumulador: el primero toma una columna o un valor; los demás hacen una operación con otra columna o con un valor (o sobre el acumulador solo).
//   con argumento (columna o valor): add, sub, mul, div, pow, min, max, logbase (base), round (decimales)
//   sin argumento:                   sqrt, ln, log10, exp, abs
// Una celda vacía o que no es número en cualquier columna usada deja el resultado vacío; dividir entre cero, un logaritmo de un número que no es positivo o una raíz negativa también (no se inventa nada).

const MAX_ADDED = 40;
const MAX_STEPS = 20;
const MAX_NAME = 80;
const MAX_CLASS = 40;
const CLASS_COLORS = 6;
const COLUMN_KEY = /^(ref_[A-Za-z]+|c_[A-Za-z0-9_]+|a_[A-Za-z0-9_]+)$/;
const WITH_ARG = new Set(['add', 'sub', 'mul', 'div', 'pow', 'min', 'max', 'logbase', 'round']);
const NO_ARG = new Set(['sqrt', 'ln', 'log10', 'exp', 'abs']);
const VALUE_ONLY = new Set(['logbase', 'round']); // la base y los decimales son un valor, no una columna

const round6 = (n) => Math.round(n * 1e6) / 1e6;
const cleanText = (value, max) => String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// ---- revisar lo que manda la pantalla --------------------------------------------------------------------------------------------------------------------
function normalizeArg(raw, valueOnly) {
    if (!raw || typeof raw !== 'object') return null;
    if (!valueOnly && typeof raw.col === 'string' && COLUMN_KEY.test(raw.col)) return { col: raw.col };
    const n = typeof raw.value === 'number' ? raw.value : Number(String(raw.value == null ? '' : raw.value).replace(',', '.'));
    if (raw.value !== null && raw.value !== undefined && String(raw.value).trim() !== '' && Number.isFinite(n) && Math.abs(n) <= 1e12) return { value: n };
    return null;
}
function normalizeSteps(raw) {
    if (!Array.isArray(raw) || !raw.length || raw.length > MAX_STEPS) return null;
    const steps = [];
    for (let i = 0; i < raw.length; i += 1) {
        const s = raw[i];
        if (!s || typeof s !== 'object') return null;
        if (i === 0) {
            if (s.op !== 'start') return null;
            const arg = normalizeArg(s.arg, false);
            if (!arg) return null;
            steps.push({ op: 'start', arg });
            continue;
        }
        if (NO_ARG.has(s.op)) { steps.push({ op: s.op }); continue; }
        if (!WITH_ARG.has(s.op)) return null;
        const arg = normalizeArg(s.arg, VALUE_ONLY.has(s.op));
        if (!arg) return null;
        if (s.op === 'round' && !(Number.isInteger(arg.value) && arg.value >= 0 && arg.value <= 10)) return null;
        if (s.op === 'logbase' && !(arg.value > 0 && arg.value !== 1)) return null;
        steps.push({ op: s.op, arg });
    }
    return steps;
}
// Devuelve { added } o { error }. Los ids no se repiten; el color es el de la paleta de clasificaciones (0 a 5) o vacío.
function normalizeAdded(raw) {
    const list = Array.isArray(raw) ? raw : [];
    if (list.length > MAX_ADDED) return { error: 'ADDED_TOO_MANY' };
    const added = [];
    const ids = new Set();
    for (const c of list) {
        if (!c || typeof c !== 'object') continue;
        if (c.kind !== 'op') return { error: 'ADDED_KIND' };
        const name = cleanText(c.name, MAX_NAME);
        if (!name) return { error: 'ADDED_NAME' };
        const steps = normalizeSteps(c.steps);
        if (!steps) return { error: 'ADDED_STEPS' };
        let id = cleanText(c.id, 20).replace(/[^a-zA-Z0-9_]/g, '');
        if (!id || ids.has(id)) id = `a${added.length + 1}`;
        while (ids.has(id)) id += '_';
        ids.add(id);
        const cls = cleanText(c.cls, MAX_CLASS);
        const decimals = Number.isInteger(c.decimals) && c.decimals >= 0 && c.decimals <= 6 ? c.decimals : null;
        added.push({ id, kind: 'op', name, cls, color: cls && Number.isInteger(c.color) && c.color >= 0 && c.color < CLASS_COLORS ? c.color : null, decimals, steps });
    }
    return { added };
}

// ---- letras y fórmula de Excel ------------------------------------------------------------------------------------------------------------------------
// A, B, … Z, AA, AB… (la posición de la columna en el archivo, como en Excel)
function columnLetter(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
    return out;
}
const numText = (n) => String(n);
// ¿la expresión tiene una suma o resta fuera de paréntesis? Entonces va entre paréntesis antes de multiplicar o dividir.
function hasTopLevelSum(expr) {
    let depth = 0;
    for (let i = 0; i < expr.length; i += 1) {
        const ch = expr[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        else if (depth === 0 && i > 0 && (ch === '+' || ch === '-')) return true;
    }
    return false;
}
const wrap = (expr) => (hasTopLevelSum(expr) ? `(${expr})` : expr);
// letterOf(key) → letra de esa columna en el archivo (o '' si esa versión no la trae). La fila 2 es el primer renglón (la 1 son los títulos): la fórmula vale para todos.
function formulaOfSteps(steps, letterOf) {
    const ref = (arg) => {
        if (arg.col !== undefined) { const l = letterOf(arg.col); return l ? `${l}2` : '#REF!'; }
        return numText(arg.value);
    };
    let expr = '';
    steps.forEach((s) => {
        switch (s.op) {
            case 'start': expr = ref(s.arg); break;
            case 'add': expr = `${expr}+${ref(s.arg)}`; break;
            case 'sub': expr = `${expr}-${ref(s.arg)}`; break;
            case 'mul': expr = `${wrap(expr)}*${ref(s.arg)}`; break;
            case 'div': expr = `${wrap(expr)}/${ref(s.arg)}`; break;
            case 'pow': expr = `POTENCIA(${expr};${ref(s.arg)})`; break;
            case 'min': expr = `MIN(${expr};${ref(s.arg)})`; break;
            case 'max': expr = `MAX(${expr};${ref(s.arg)})`; break;
            case 'logbase': expr = `LOG(${expr};${ref(s.arg)})`; break;
            case 'round': expr = `REDONDEAR(${expr};${ref(s.arg)})`; break;
            case 'sqrt': expr = `RAIZ(${expr})`; break;
            case 'ln': expr = `LN(${expr})`; break;
            case 'log10': expr = `LOG10(${expr})`; break;
            case 'exp': expr = `EXP(${expr})`; break;
            case 'abs': expr = `ABS(${expr})`; break;
            default: break;
        }
    });
    return `=${expr}`;
}

// ---- calcular --------------------------------------------------------------------------------------------------------------------------------------------
const toNumber = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : null; }
    return null;
};
// get(key) → lo que trae esa columna en este renglón (número, texto o null)
function runSteps(steps, get) {
    let acc = null;
    const argOf = (arg) => (arg.col !== undefined ? toNumber(get(arg.col)) : arg.value);
    for (const s of steps) {
        if (s.op === 'start') { acc = argOf(s.arg); if (acc === null) return null; continue; }
        if (acc === null) return null;
        let b = null;
        if (s.arg) { b = argOf(s.arg); if (b === null) return null; }
        switch (s.op) {
            case 'add': acc += b; break;
            case 'sub': acc -= b; break;
            case 'mul': acc *= b; break;
            case 'div': if (b === 0) return null; acc /= b; break;
            case 'pow': acc = Math.pow(acc, b); break;
            case 'min': acc = Math.min(acc, b); break;
            case 'max': acc = Math.max(acc, b); break;
            case 'logbase': if (!(acc > 0)) return null; acc = Math.log(acc) / Math.log(b); break;
            case 'round': { const f = 10 ** b; acc = Math.round(acc * f) / f; break; }
            case 'sqrt': if (acc < 0) return null; acc = Math.sqrt(acc); break;
            case 'ln': if (!(acc > 0)) return null; acc = Math.log(acc); break;
            case 'log10': if (!(acc > 0)) return null; acc = Math.log10(acc); break;
            case 'exp': if (acc > 700) return null; acc = Math.exp(acc); break;
            case 'abs': acc = Math.abs(acc); break;
            default: return null;
        }
        if (!Number.isFinite(acc)) return null;
    }
    return round6(acc);
}

const addedKey = (c) => `a_${c.id}`;
// Las columnas que se agregan al final del archivo: [{ key, group: 'added', id, kind, label, cls, color, decimals, formula }]
function addedColumnDefs(added, baseColumns) {
    const keys = baseColumns.map((c) => c.key);
    const all = [...keys, ...added.map(addedKey)];
    const letterOf = (key) => { const i = all.indexOf(key); return i < 0 ? '' : columnLetter(i); };
    return added.map((c, i) => ({
        key: addedKey(c), group: 'added', id: c.id, kind: c.kind, label: c.name, cls: c.cls || '', color: c.cls ? c.color : null, decimals: c.decimals,
        letter: columnLetter(baseColumns.length + i), formula: formulaOfSteps(c.steps, (key) => (all.indexOf(key) < i + baseColumns.length ? letterOf(key) : '')),
    }));
}
// A cada renglón (arreglo de valores en el orden de baseColumns) le agrega lo calculado, en el orden de `added`; una columna agregada puede usar las anteriores.
function applyAdded(added, baseColumns, rows) {
    if (!added.length) return rows;
    const index = new Map(baseColumns.map((c, i) => [c.key, i]));
    return rows.map((row) => {
        const extra = [];
        const get = (key) => {
            if (index.has(key)) return row[index.get(key)];
            const at = added.findIndex((c) => addedKey(c) === key);
            return at >= 0 && at < extra.length ? extra[at] : null;
        };
        added.forEach((c) => { extra.push(runSteps(c.steps, get)); });
        return row.concat(extra);
    });
}

module.exports = { MAX_ADDED, MAX_STEPS, normalizeAdded, columnLetter, formulaOfSteps, runSteps, addedColumnDefs, applyAdded, addedKey };
