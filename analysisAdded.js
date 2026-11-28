// Análisis Registros Manuales — columnas AGREGADAS en el Archivo (Daniel, 2026-11-26): se agregan sobre el archivo ya extraído y no vienen de ningún registro.
// Pieza 1: «Operación paso a paso». Cada columna agregada es { id, kind: 'op', name, cls, color, decimals, steps } y vive en el diseño del análisis (design.added), así que se repite sola en cada versión y se
// RECALCULA con los datos de esa versión (los datos de la versión no cambian; lo agregado se calcula al leerla). Las piezas siguientes (criterio, fórmula, captura) agregan sus propios «kind».
//
// Pieza 2, «Criterio»: { id, kind: 'criterion', name, cls, color, decimals, rules: [{ conds: [{ col, op, value, value2 }], join: 'and' | 'or', result }], otherwise } — las reglas se revisan de arriba abajo y gana la primera que
// se cumple; si ninguna, vale «otherwise» (o queda vacía). Un resultado es un texto, un número, el valor de otra columna o vacío. Operadores: lt, lte, gt, gte, between, eq, neq, contains, empty, notEmpty.
// Una celda vacía no cumple ninguna comparación (solo «está vacío» y «es distinto de»).
//
// Pieza «Varias columnas (bloque)» (Daniel, 2026-11-27, «Sí a las recomendadas»): { id, kind: 'block', name, cls, color, decimals, fn, blocks: [{ from, to }] } — una función sobre un grupo de columnas del archivo, como un rango de Excel
// (F2:AM2): fn = blank (cuántas están vacías), filled (cuántas tienen dato), zero (cuántas valen cero), sum, avg, min, max. El bloque se guarda por sus DOS PUNTAS (from, to): lo que quede entre ellas, en el orden del archivo, entra solo.
// Las columnas de referencia y las de comentarios no cuentan. Varios bloques se suman como en Excel (F2:H2; AK2).
// «Criterio» suma una REGLA DE BLOQUE: { scan: { from, to, dir: 'asc' | 'desc', cond: { op, value, value2 } }, result } que recorre las columnas del bloque (de izquierda a derecha o al revés) y se queda con la primera donde se cumple
// la condición; su resultado puede ser { name: true } (el nombre de esa columna), { found: true } (su valor), un texto, un número, el valor de otra columna o vacío. Y la condición nueva blankZero («vacío o 0»).
//
// Los pasos de «Operación» se aplican de arriba abajo sobre un acumulador: el primero toma una columna o un valor; los demás hacen una operación con otra columna o con un valor (o sobre el acumulador solo).
//   con argumento (columna o valor): add, sub, mul, div, pow, min, max, logbase (base), round (decimales)
//   sin argumento:                   sqrt, ln, log10, exp, abs
// Una celda vacía o que no es número en cualquier columna usada deja el resultado vacío; dividir entre cero, un logaritmo de un número que no es positivo o una raíz negativa también (no se inventa nada).

const MAX_ADDED = 40;
const MAX_STEPS = 20;
const MAX_NAME = 80;
const MAX_CLASS = 40;
const CLASS_COLORS = 6;
// El color de una clasificación (Daniel, 2026-11-26, «Sí, agrégalo»): un número de la paleta (0 a 5) o cualquier color #rrggbb que la persona elija; lo demás no se guarda (null).
function normalizeClassColor(v) {
    if (Number.isInteger(v) && v >= 0 && v < CLASS_COLORS) return v;
    return /^#[0-9a-fA-F]{6}$/.test(String(v === undefined || v === null ? '' : v)) ? String(v).toLowerCase() : null;
}
const COLUMN_KEY = /^(ref_[A-Za-z]+|c_[A-Za-z0-9_]+|a_[A-Za-z0-9_]+)$/;
const WITH_ARG = new Set(['add', 'sub', 'mul', 'div', 'pow', 'min', 'max', 'logbase', 'round']);
const NO_ARG = new Set(['sqrt', 'ln', 'log10', 'exp', 'abs']);
const VALUE_ONLY = new Set(['logbase', 'round']); // la base y los decimales son un valor, no una columna
const MAX_RULES = 20;
const MAX_CONDS = 5;
const MAX_TEXT = 80;
const COND_OPS = new Set(['lt', 'lte', 'gt', 'gte', 'between', 'eq', 'neq', 'contains', 'empty', 'notEmpty', 'blankZero']);
const BLOCK_FNS = new Set(['blank', 'filled', 'zero', 'meet', 'sum', 'avg', 'min', 'max', 'median']);
// «Cuántas cumplen…» necesita su condición; la suma, el promedio, el menor y el mayor la aceptan opcional («solo las que…»); el resto no la lleva (Daniel, 2026-11-27)
const BLOCK_COND_FNS = new Set(['meet', 'sum', 'avg', 'min', 'max']);
const BLOCK_COND_OPS = new Set(['eq', 'neq', 'lt', 'lte', 'gt', 'gte']);
const MAX_BLOCKS = 10;
const NUMERIC_COND_OPS = new Set(['lt', 'lte', 'gt', 'gte']);

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
const numericOf = (v) => {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && Math.abs(n) <= 1e12 ? n : null;
};
function normalizeCond(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.col !== 'string' || !COLUMN_KEY.test(raw.col) || !COND_OPS.has(raw.op)) return null;
    const cond = { col: raw.col, op: raw.op };
    if (raw.op === 'empty' || raw.op === 'notEmpty' || raw.op === 'blankZero') return cond;
    if (raw.op === 'between') {
        const a = numericOf(raw.value); const b = numericOf(raw.value2);
        if (a === null || b === null) return null;
        return { ...cond, value: a, value2: b };
    }
    if (NUMERIC_COND_OPS.has(raw.op)) {
        const n = numericOf(raw.value);
        return n === null ? null : { ...cond, value: n };
    }
    // eq, neq, contains: un texto o un número tal como se escribió
    const v = typeof raw.value === 'number' ? (Number.isFinite(raw.value) ? raw.value : null) : cleanText(raw.value, MAX_TEXT);
    return v === null || v === '' ? null : { ...cond, value: v };
}
function normalizeResult(raw, scan) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.empty === true) return { empty: true };
    if (scan && raw.name === true) return { name: true }; // el nombre de la columna que cumplió (solo en una regla de bloque)
    if (scan && raw.found === true) return { found: true }; // el valor de la columna que cumplió
    if (typeof raw.col === 'string' && COLUMN_KEY.test(raw.col)) return { col: raw.col };
    if (typeof raw.value === 'number' && Number.isFinite(raw.value) && Math.abs(raw.value) <= 1e12) return { value: raw.value };
    if (typeof raw.text === 'string') { const t = cleanText(raw.text, MAX_TEXT); return t === '' ? null : { text: t }; }
    return null;
}
function normalizeRules(raw) {
    if (!Array.isArray(raw) || !raw.length || raw.length > MAX_RULES) return null;
    const rules = [];
    for (const r of raw) {
        if (r && typeof r === 'object' && r.scan) {
            const s = r.scan;
            if (!s || typeof s !== 'object' || typeof s.from !== 'string' || !COLUMN_KEY.test(s.from)) return null;
            const to = typeof s.to === 'string' && s.to ? s.to : s.from;
            if (!COLUMN_KEY.test(to)) return null;
            const c = normalizeCond({ ...(s.cond && typeof s.cond === 'object' ? s.cond : {}), col: s.from });
            if (!c) return null;
            const { col, ...cond } = c;
            const sres = normalizeResult(r.result, true);
            if (!sres) return null;
            rules.push({ scan: { from: s.from, to, dir: s.dir === 'desc' ? 'desc' : 'asc', cond }, result: sres });
            continue;
        }
        if (!r || typeof r !== 'object' || !Array.isArray(r.conds) || !r.conds.length || r.conds.length > MAX_CONDS) return null;
        const conds = r.conds.map(normalizeCond);
        if (conds.some((c) => !c)) return null;
        const result = normalizeResult(r.result);
        if (!result) return null;
        rules.push({ conds, join: r.join === 'or' ? 'or' : 'and', result });
    }
    return rules;
}
function normalizeBlocks(raw) {
    if (!Array.isArray(raw) || !raw.length || raw.length > MAX_BLOCKS) return null;
    const out = [];
    for (const b of raw) {
        if (!b || typeof b !== 'object' || typeof b.from !== 'string' || !COLUMN_KEY.test(b.from)) return null;
        const to = typeof b.to === 'string' && b.to ? b.to : b.from;
        if (!COLUMN_KEY.test(to)) return null;
        out.push({ from: b.from, to });
    }
    return out;
}
// la condición de un bloque: { op, value } con un número; null si no sirve
function normalizeBlockCond(raw) {
    if (!raw || typeof raw !== 'object' || !BLOCK_COND_OPS.has(raw.op)) return null;
    const value = typeof raw.value === 'number' ? raw.value : Number(String(raw.value == null ? '' : raw.value).replace(',', '.'));
    if (String(raw.value == null ? '' : raw.value).trim() === '' || !Number.isFinite(value)) return null;
    return { op: raw.op, value };
}
// Devuelve { added } o { error }. Los ids no se repiten; el color es el de la paleta de clasificaciones (0 a 5) o vacío.
function normalizeAdded(raw) {
    const list = Array.isArray(raw) ? raw : [];
    if (list.length > MAX_ADDED) return { error: 'ADDED_TOO_MANY' };
    const added = [];
    const ids = new Set();
    for (const c of list) {
        if (!c || typeof c !== 'object') continue;
        if (c.kind !== 'op' && c.kind !== 'criterion' && c.kind !== 'comment' && c.kind !== 'block') return { error: 'ADDED_KIND' };
        const name = cleanText(c.name, MAX_NAME);
        if (!name) return { error: 'ADDED_NAME' };
        let body;
        if (c.kind === 'comment') body = {}; // «Comentarios» (2026-11-27): no se calcula, la persona la escribe renglón por renglón (analysis_comments)
        else if (c.kind === 'op') {
            const steps = normalizeSteps(c.steps);
            if (!steps) return { error: 'ADDED_STEPS' };
            body = { steps };
        } else if (c.kind === 'block') {
            const blocks = normalizeBlocks(c.blocks);
            if (!blocks || !BLOCK_FNS.has(c.fn)) return { error: 'ADDED_BLOCK' };
            let cond = null;
            if (c.cond !== undefined && c.cond !== null) { cond = BLOCK_COND_FNS.has(c.fn) ? normalizeBlockCond(c.cond) : null; if (!cond) return { error: 'ADDED_BLOCK' }; }
            if (c.fn === 'meet' && !cond) return { error: 'ADDED_BLOCK' };
            body = cond ? { fn: c.fn, blocks, cond } : { fn: c.fn, blocks };
        } else {
            const rules = normalizeRules(c.rules);
            if (!rules) return { error: 'ADDED_RULES' };
            let otherwise = null;
            if (c.otherwise !== undefined && c.otherwise !== null) { otherwise = normalizeResult(c.otherwise); if (!otherwise) return { error: 'ADDED_RULES' }; }
            body = { rules, otherwise };
        }
        let id = cleanText(c.id, 20).replace(/[^a-zA-Z0-9_]/g, '');
        if (!id || ids.has(id)) id = `a${added.length + 1}`;
        while (ids.has(id)) id += '_';
        ids.add(id);
        const cls = cleanText(c.cls, MAX_CLASS);
        const decimals = c.kind !== 'comment' && Number.isInteger(c.decimals) && c.decimals >= 0 && c.decimals <= 6 ? c.decimals : null;
        added.push({ id, kind: c.kind, name, cls, color: cls ? normalizeClassColor(c.color) : null, decimals, ...body });
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
// El orden de las columnas del archivo (las de siempre y, después, las agregadas) para resolver un bloque: las columnas ENTRE sus dos puntas, solo las anteriores a la columna que se está calculando (limit),
// sin las de referencia ni las de comentarios. Devuelve null si una punta ya no existe (la columna se quitó) o si el bloque no alcanza a una columna anterior.
function makeContext(added, baseColumns) {
    const order = baseColumns.map((c) => ({ key: c.key, group: c.group, kind: null, label: c.label || '' })).concat(added.map((c) => ({ key: `a_${c.id}`, group: 'added', kind: c.kind, label: c.name })));
    const at = new Map(order.map((o, i) => [o.key, i]));
    const memo = new Map();
    const rangeOf = (from, to, limit) => {
        const id = `${from}|${to}|${limit}`;
        if (memo.has(id)) return memo.get(id);
        let out = null;
        if (at.has(from) && at.has(to)) {
            const a = at.get(from); const b = at.get(to);
            const lo = Math.min(a, b); const hi = Math.max(a, b);
            if (hi < limit) {
                const items = [];
                for (let i = lo; i <= hi; i += 1) { const o = order[i]; if (o.group !== 'reference' && o.kind !== 'comment') items.push(o); }
                if (items.length) out = { items, lo, hi };
            }
        }
        memo.set(id, out);
        return out;
    };
    return { rangeOf };
}
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

const quote = (text) => `"${String(text).replace(/"/g, '""')}"`;
// un valor escrito en una regla: número si lo es, texto entre comillas si no
const valueText = (v) => (typeof v === 'number' ? numText(v) : (numericOf(v) !== null ? numText(numericOf(v)) : quote(v)));
function formulaOfCriterion(def, letterOf, ctx, limit) {
    const ref = (key) => { const l = letterOf(key); return l ? `${l}2` : '#REF!'; };
    const condText = (c) => {
        const r = ref(c.col);
        switch (c.op) {
            case 'lt': return `${r}<${numText(c.value)}`;
            case 'lte': return `${r}<=${numText(c.value)}`;
            case 'gt': return `${r}>${numText(c.value)}`;
            case 'gte': return `${r}>=${numText(c.value)}`;
            case 'between': return `Y(${r}>=${numText(c.value)};${r}<=${numText(c.value2)})`;
            case 'eq': return `${r}=${valueText(c.value)}`;
            case 'neq': return `${r}<>${valueText(c.value)}`;
            case 'contains': return `ESNUMERO(HALLAR(${quote(c.value)};${r}))`;
            case 'empty': return `${r}=""`;
            case 'notEmpty': return `${r}<>""`;
            case 'blankZero': return `O(${r}="";${r}=0)`;
            default: return '';
        }
    };
    const resultText = (res) => (res.empty ? '""' : (res.col !== undefined ? ref(res.col) : (res.text !== undefined ? quote(res.text) : numText(res.value))));
    // una regla de bloque: «hay una columna del bloque donde se cumple» (SUMAPRODUCT) o, si el resultado es el nombre o el valor de esa columna, la primera/última que la cumple (SI.ERROR cae a lo que sigue)
    const scanText = (rule, rest) => {
        const rg = rangeFormulaOf(ctx, limit, rule.scan.from, rule.scan.to);
        if (!rg) return `SI(#REF!;"";${rest})`;
        const c = rule.scan.cond; const q = rg.row;
        let bool;
        switch (c.op) {
            case 'lt': bool = `${q}<${numText(c.value)}`; break;
            case 'lte': bool = `${q}<=${numText(c.value)}`; break;
            case 'gt': bool = `${q}>${numText(c.value)}`; break;
            case 'gte': bool = `${q}>=${numText(c.value)}`; break;
            case 'between': bool = `((${q}>=${numText(c.value)})*(${q}<=${numText(c.value2)}))=1`; break;
            case 'eq': bool = `${q}=${valueText(c.value)}`; break;
            case 'neq': bool = `${q}<>${valueText(c.value)}`; break;
            case 'contains': bool = `ESNUMERO(HALLAR(${quote(c.value)};${q}))`; break;
            case 'empty': bool = `${q}=""`; break;
            case 'notEmpty': bool = `${q}<>""`; break;
            case 'blankZero': bool = `((${q}="")+(${q}=0))>0`; break;
            default: bool = 'FALSO';
        }
        if (rule.result.name || rule.result.found) {
            const target = rule.result.name ? rg.head : q;
            const pick = rule.scan.dir === 'desc' ? `BUSCAR(2;1/(${bool});${target})` : `INDICE(${target};COINCIDIR(VERDADERO;INDICE(${bool};0);0))`;
            return `SI.ERROR(${pick};${rest})`;
        }
        return `SI(SUMAPRODUCT(--(${bool}))>0;${resultText(rule.result)};${rest})`;
    };
    let expr = def.otherwise ? resultText(def.otherwise) : '""';
    for (let i = def.rules.length - 1; i >= 0; i -= 1) {
        const rule = def.rules[i];
        if (rule.scan) { expr = scanText(rule, expr); continue; }
        const cond = rule.conds.length === 1 ? condText(rule.conds[0]) : `${rule.join === 'or' ? 'O' : 'Y'}(${rule.conds.map(condText).join(';')})`;
        expr = `SI(${cond};${resultText(rule.result)};${expr})`;
    }
    return `=${expr}`;
}
// el bloque como en Excel: fila 2 de la primera a la última letra (F2:AM2), y sus títulos (fila 1, fijos). null si una punta ya no existe.
function rangeFormulaOf(ctx, limit, from, to) {
    const r = ctx ? ctx.rangeOf(from, to, limit) : null;
    if (!r) return null;
    const a = columnLetter(r.lo); const b = columnLetter(r.hi);
    return { row: r.lo === r.hi ? `${a}2` : `${a}2:${b}2`, head: r.lo === r.hi ? `$${a}$1` : `$${a}$1:$${b}$1` };
}
const BLOCK_FORMULA = { blank: 'CONTAR.BLANCO', filled: 'CONTARA', zero: 'CONTAR.SI', sum: 'SUMA', avg: 'PROMEDIO', min: 'MIN', max: 'MAX', median: 'MEDIANA' };
const CRIT_SYMBOL = { eq: '', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' };
// el criterio como lo escribe Excel: el número solo si es «igual a»; si no, entre comillas con su signo
const critText = (cond) => (cond.op === 'eq' ? numText(cond.value) : `"${CRIT_SYMBOL[cond.op]}${numText(cond.value)}"`);
function formulaOfBlock(def, ctx, limit) {
    const parts = def.blocks.map((b) => { const rg = rangeFormulaOf(ctx, limit, b.from, b.to); return rg ? rg.row : '#REF!'; });
    // CONTAR.BLANCO y CONTAR.SI reciben un solo rango: varios bloques se suman
    if (def.fn === 'blank') return `=${parts.map((p) => `CONTAR.BLANCO(${p})`).join('+')}`;
    if (def.fn === 'zero') return `=${parts.map((p) => `CONTAR.SI(${p};0)`).join('+')}`;
    if (def.fn === 'meet') {
        // «distinto de» cuenta solo las celdas con dato (CONTAR.SI con «<>» contaría también las vacías)
        const one = (p) => (def.cond.op === 'neq' ? `CONTARA(${p})-CONTAR.SI(${p};${numText(def.cond.value)})` : `CONTAR.SI(${p};${critText(def.cond)})`);
        return `=${parts.map(one).join('+')}`;
    }
    if (def.cond) {
        const c = critText(def.cond);
        if (def.fn === 'sum') return `=${parts.map((p) => `SUMAR.SI(${p};${c})`).join('+')}`;
        if (def.fn === 'avg') return parts.length === 1 ? `=PROMEDIO.SI(${parts[0]};${c})` : `=(${parts.map((p) => `SUMAR.SI(${p};${c})`).join('+')})/(${parts.map((p) => `CONTAR.SI(${p};${c})`).join('+')})`;
        const fn = def.fn === 'min' ? 'MIN' : 'MAX';
        const each = parts.map((p) => `${fn}.SI.CONJUNTO(${p};${p};${c})`);
        return each.length === 1 ? `=${each[0]}` : `=${fn}(${each.join(';')})`;
    }
    return `=${BLOCK_FORMULA[def.fn]}(${parts.join(';')})`;
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

const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const foldText = (v) => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function testCond(c, v) {
    const empty = isBlank(v);
    if (c.op === 'blankZero') return empty || toNumber(v) === 0; // «no tiene valor»: vacío o cero
    if (c.op === 'empty') return empty;
    if (c.op === 'notEmpty') return !empty;
    if (empty) return c.op === 'neq'; // una celda vacía no cumple una comparación; solo «es distinto de»
    if (c.op === 'contains') return foldText(v).includes(foldText(c.value));
    const n = toNumber(v);
    if (NUMERIC_COND_OPS.has(c.op) || c.op === 'between') {
        if (n === null) return false;
        if (c.op === 'lt') return n < c.value;
        if (c.op === 'lte') return n <= c.value;
        if (c.op === 'gt') return n > c.value;
        if (c.op === 'gte') return n >= c.value;
        return n >= Math.min(c.value, c.value2) && n <= Math.max(c.value, c.value2);
    }
    const cn = numericOf(c.value);
    const same = n !== null && cn !== null ? n === cn : foldText(v) === foldText(c.value);
    return c.op === 'eq' ? same : !same;
}
// el valor de un resultado: texto, número, lo que trae otra columna, o vacío
function resultOf(res, get) {
    if (!res || res.empty) return null;
    if (res.col !== undefined) { const v = get(res.col); return typeof v === 'number' ? round6(v) : (v === undefined ? null : v); }
    if (res.text !== undefined) return res.text;
    return res.value;
}
// la regla de bloque: recorre las columnas del bloque (de izquierda a derecha o al revés) y devuelve la primera donde se cumple la condición; ctx/limit resuelven el bloque (sin ellos no encuentra nada)
function scanHit(rule, get, ctx, limit) {
    const r = ctx ? ctx.rangeOf(rule.scan.from, rule.scan.to, limit) : null;
    if (!r) return null;
    const items = rule.scan.dir === 'desc' ? r.items.slice().reverse() : r.items;
    return items.find((o) => testCond(rule.scan.cond, get(o.key))) || null;
}
function runCriterion(def, get, ctx, limit) {
    for (const rule of def.rules) {
        if (rule.scan) {
            const hit = scanHit(rule, get, ctx, limit);
            if (!hit) continue;
            if (rule.result.name) return hit.label || hit.key;
            if (rule.result.found) { const v = get(hit.key); return typeof v === 'number' ? round6(v) : (v === undefined ? null : v); }
            return resultOf(rule.result, get);
        }
        const results = rule.conds.map((c) => testCond(c, get(c.col)));
        if (rule.join === 'or' ? results.some(Boolean) : results.every(Boolean)) return resultOf(rule.result, get);
    }
    return def.otherwise ? resultOf(def.otherwise, get) : null;
}
// La columna de bloque: junta las celdas de todos sus bloques (como en Excel) y aplica la función. Vacías/con dato/ceros cuentan celdas; suma, promedio, menor y mayor usan solo las que son número (y quedan vacías si no hay ninguna).
function runBlock(def, get, ctx, limit) {
    const cells = [];
    for (const b of def.blocks) {
        const r = ctx ? ctx.rangeOf(b.from, b.to, limit) : null;
        if (!r) return null;
        r.items.forEach((o) => cells.push(get(o.key)));
    }
    const blanks = cells.filter(isBlank).length;
    if (def.fn === 'blank') return blanks;
    if (def.fn === 'filled') return cells.length - blanks;
    if (def.fn === 'zero') return cells.filter((v) => !isBlank(v) && toNumber(v) === 0).length;
    // la condición opcional (solo las que…): una celda con dato que no es número solo cumple «distinto de»; una vacía nunca cumple
    const meets = (v) => {
        if (isBlank(v)) return false;
        const n = toNumber(v);
        if (n === null) return def.cond.op === 'neq';
        switch (def.cond.op) { case 'eq': return n === def.cond.value; case 'neq': return n !== def.cond.value; case 'lt': return n < def.cond.value; case 'lte': return n <= def.cond.value; case 'gt': return n > def.cond.value; default: return n >= def.cond.value; }
    };
    if (def.fn === 'meet') return cells.filter(meets).length;
    const nums = (def.cond ? cells.filter(meets) : cells).map(toNumber).filter((n) => n !== null);
    if (!nums.length) return null;
    if (def.fn === 'median') { const sorted = nums.slice().sort((a, b) => a - b); const mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : round6((sorted[mid - 1] + sorted[mid]) / 2); }
    if (def.fn === 'sum') return round6(nums.reduce((a, b) => a + b, 0));
    if (def.fn === 'avg') return round6(nums.reduce((a, b) => a + b, 0) / nums.length);
    return def.fn === 'min' ? Math.min(...nums) : Math.max(...nums);
}
const runColumn = (c, get, ctx, limit) => {
    if (c.kind === 'comment') return null; // una columna de comentarios la llena el servidor con lo que se escribió
    if (c.kind === 'criterion') return runCriterion(c, get, ctx, limit);
    if (c.kind === 'block') return runBlock(c, get, ctx, limit);
    return runSteps(c.steps, get);
};
const formulaOfColumn = (c, letterOf, ctx, limit) => {
    if (c.kind === 'comment') return '';
    if (c.kind === 'criterion') return formulaOfCriterion(c, letterOf, ctx, limit);
    if (c.kind === 'block') return formulaOfBlock(c, ctx, limit);
    return formulaOfSteps(c.steps, letterOf);
};

const addedKey = (c) => `a_${c.id}`;
// Las columnas que se agregan al final del archivo: [{ key, group: 'added', id, kind, label, cls, color, decimals, formula }]
function addedColumnDefs(added, baseColumns) {
    const keys = baseColumns.map((c) => c.key);
    const all = [...keys, ...added.map(addedKey)];
    const letterOf = (key) => { const i = all.indexOf(key); return i < 0 ? '' : columnLetter(i); };
    const ctx = makeContext(added, baseColumns);
    return added.map((c, i) => ({
        key: addedKey(c), group: 'added', id: c.id, kind: c.kind, label: c.name, cls: c.cls || '', color: c.cls ? c.color : null, decimals: c.decimals,
        letter: columnLetter(baseColumns.length + i), formula: formulaOfColumn(c, (key) => (all.indexOf(key) < i + baseColumns.length ? letterOf(key) : ''), ctx, baseColumns.length + i),
    }));
}
// A cada renglón (arreglo de valores en el orden de baseColumns) le agrega lo calculado, en el orden de `added`; una columna agregada puede usar las anteriores.
function applyAdded(added, baseColumns, rows) {
    if (!added.length) return rows;
    const index = new Map(baseColumns.map((c, i) => [c.key, i]));
    const ctx = makeContext(added, baseColumns);
    return rows.map((row) => {
        const extra = [];
        const get = (key) => {
            if (index.has(key)) return row[index.get(key)];
            const at = added.findIndex((c) => addedKey(c) === key);
            return at >= 0 && at < extra.length ? extra[at] : null;
        };
        added.forEach((c, k) => { extra.push(runColumn(c, get, ctx, baseColumns.length + k)); });
        return row.concat(extra);
    });
}

module.exports = { MAX_ADDED, MAX_STEPS, MAX_RULES, MAX_BLOCKS, BLOCK_FNS, normalizeClassColor, normalizeAdded, columnLetter, formulaOfSteps, formulaOfCriterion, formulaOfBlock, runSteps, runCriterion, runBlock, makeContext, addedColumnDefs, applyAdded, addedKey };
