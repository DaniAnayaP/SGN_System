'use strict';
// Pasar un registro Mensual o Diaria al tipo único, la tabla libre (Daniel, 2026-11-27: «cuando termines de hacer, tú pasa los datos y pégalos como deben de estar»).
// Se COPIA a un registro nuevo (lo anterior no se toca), se COMPRUEBA contra lo anterior (renglones, valores y la suma de cada periodo) y solo al confirmar el anterior pasa a «Obsoletos».
//   - La copia es UNA carga de tabla libre (o varias, si pasan de CHUNK periodos): Unidad y Código son la Llave, el resto de las columnas de referencia son Dato, y cada periodo es una «columna nueva» de nombre fijo
//     (un mes: «ene-25»; un día: «<lo que mide> 27/nov/2026»), con la clasificación «Año 2025» o el nombre de lo que mide. Se guarda con los mismos bloques empaquetados que una carga normal.
//   - La comprobación lee lo guardado de nuevo desde la base (no usa lo que se escribió) y lo compara con lo anterior.
const db = require('./db');
const flex = require('./flexRegistries');
const manual = require('./manualRegistries');
const manualAnalyses = require('./manualAnalyses');
const analysisSources = require('./analysisSources');
const analysisRepoint = require('./analysisRepoint');

const sqlite = db.db;
const CHUNK = 300; // columnas de valor por carga (el tope de una carga es flex.MAX_COLUMNS, con las de referencia)
const BATCH = 2000;
// Las seis columnas de referencia de los registros de siempre, en el orden de su tabla: la llave es Unidad + Código.
const DIMS = [
    { name: 'Unidad', field: 'unidad', role: 'key' },
    { name: 'Descripción Unidad', field: 'unidad_nombre', role: 'data' },
    { name: 'Código', field: 'codigo', role: 'key' },
    { name: 'Descripción', field: 'descripcion', role: 'data' },
    { name: 'Categoría', field: 'categoria', role: 'data' },
    { name: 'UDM', field: 'udm', role: 'data' },
];
const REF_CLASS = 'Referencia';
const jobs = new Map(); // `${cliente}:${carril}:${registro}` → { phase, done, total }
const tick = () => new Promise((resolve) => setImmediate(resolve));
const sameNumber = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const jobKey = (clientId, lane, oldKey) => `${clientId}:${lane}:${oldKey}`;
const nowStamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function readOldRows(clientId, lane, key) {
    return sqlite.prepare(`SELECT r.id, r.unidad, r.unidad_nombre, r.codigo, r.descripcion, r.categoria, r.udm FROM manual_registry_rows r
        WHERE r.client_id = ? AND r.is_test_data = ? AND r.registry_key = ? AND EXISTS (SELECT 1 FROM manual_registry_values v JOIN manual_registry_loads l ON l.id = v.load_id WHERE v.row_id = r.id AND l.status = 'vigente')
        ORDER BY r.unidad, r.codigo`).all(clientId, lane, key);
}
function readOldPeriod(clientId, lane, key, period) {
    return sqlite.prepare("SELECT v.row_id, v.value FROM manual_registry_values v JOIN manual_registry_loads l ON l.id = v.load_id WHERE l.client_id = ? AND l.is_test_data = ? AND l.registry_key = ? AND l.status = 'vigente' AND v.period = ?").all(clientId, lane, key, period);
}

// La columna de la tabla nueva que es un periodo: su nombre fijo, su clasificación y su color.
function valueColumn(period, kind, valueName, lang) {
    const label = manual.periodLabel(period, lang);
    if (kind === 'month') { const year = period.slice(0, 4); return { name: label, cls: `Año ${year}`, color: Number(year) % flex.CLASS_COLORS, label }; }
    return { name: `${valueName} ${label}`.slice(0, flex.MAX_NAME), cls: String(valueName).slice(0, flex.MAX_CLASS), color: 1, label };
}
function chunkConfig(periods, first, ctx) {
    const columns = [];
    DIMS.forEach((d) => { if (first || d.role === 'key') columns.push({ src: d.name, name: d.name, role: d.role, agg: 'sum', stampName: false, cls: REF_CLASS, color: 0 }); });
    periods.forEach((p) => { const v = valueColumn(p, ctx.kind, ctx.valueName, ctx.lang); columns.push({ src: v.name, name: v.name, role: 'value', agg: 'one', stampName: false, cls: v.cls, color: v.color }); });
    return { mode: 'roles', columns, skipped: [] };
}
const chunksOf = (periods) => { const out = []; for (let i = 0; i < periods.length; i += CHUNK) out.push(periods.slice(i, i + CHUNK)); return out; };

// Copia lo vigente de un registro a otro (que ya existe y está vacío). Devuelve { loadIds, rows, values }.
async function copy(ctx, progress) {
    const { clientId, lane, oldKey, newKey } = ctx;
    const rows = readOldRows(clientId, lane, oldKey);
    const periods = db.registryPeriods(clientId, lane === 1, oldKey);
    if (!rows.length || !periods.length) { const e = new Error('NO_DATA'); e.code = 'NO_DATA'; throw e; }
    const index = new Map();
    rows.forEach((r, i) => index.set(r.id, i));
    const chunks = chunksOf(periods);
    const total = rows.length * chunks.length;
    let done = 0;
    const loadIds = [];
    const rowIds = new Array(rows.length);
    let values = 0;
    const stamp = nowStamp();
    try {
        for (let c = 0; c < chunks.length; c += 1) {
            const chunk = chunks[c];
            const fileName = `Pasado de «${ctx.oldName}»${chunks.length > 1 ? ` (${c + 1} de ${chunks.length})` : ''}`.slice(0, 160);
            const loadId = db.createRegistryLoad({ clientId, isTestData: lane === 1, registryKey: newKey, source: 'excel', fileName, sheet: '', day: '', loadedBy: ctx.byLabel, loadedByUserId: ctx.byUserId });
            loadIds.push(loadId);
            db.setFlexLoadInfo(loadId, stamp, chunkConfig(chunk, c === 0, ctx));
            const store = db.flexStore({ clientId, isTestData: lane === 1, registryKey: newKey, loadId });
            // los valores de este tramo de periodos, por renglón
            const present = chunk.map(() => new Uint8Array(rows.length));
            const vals = chunk.map(() => new Float64Array(rows.length));
            for (let pi = 0; pi < chunk.length; pi += 1) {
                readOldPeriod(clientId, lane, oldKey, chunk[pi]).forEach((v) => { const i = index.get(v.row_id); if (i !== undefined) { vals[pi][i] = v.value; present[pi][i] = 1; } });
                await tick();
            }
            let added = 0;
            for (let at = 0; at < rows.length; at += BATCH) {
                const end = Math.min(rows.length, at + BATCH);
                if (c === 0) {
                    const items = [];
                    for (let i = at; i < end; i += 1) {
                        const r = rows[i];
                        const cells = {};
                        DIMS.forEach((d) => { cells[flex.foldName(d.name)] = String(r[d.field] == null ? '' : r[d.field]); });
                        items.push({ keyText: flex.keyTextOf(DIMS.filter((d) => d.role === 'key').map((d) => [d.name, String(r[d.field] == null ? '' : r[d.field])])), cells });
                    }
                    store.addRows(items).forEach((id, k) => { rowIds[at + k] = id; });
                }
                const ops = [];
                for (let i = at; i < end; i += 1) {
                    const arr = chunk.map((_, pi) => (present[pi][i] ? vals[pi][i] : null));
                    const n = arr.filter((v) => v !== null).length;
                    if (!n) continue;
                    added += n;
                    ops.push([rowIds[i], flex.packValues(arr)]);
                }
                if (ops.length) store.addPacked(ops);
                done += end - at;
                if (progress) progress({ done, total });
                await tick();
            }
            values += added;
            db.finishRegistryLoad(loadId, { rowsInFile: rows.length, newRows: c === 0 ? rows.length : 0, valuesAdded: added, untouched: 0, different: 0, errors: 0, periods: [], newPeriods: [] });
        }
    } catch (err) {
        for (const id of loadIds) { try { await db.discardFlexLoadData(id); db.failRegistryLoad(id, 'ERROR'); } catch (cleanErr) { console.error('Pasar registro: no se pudo limpiar:', cleanErr); } }
        throw err;
    }
    return { loadIds, rows: rows.length, values, periods };
}

// Compara lo guardado en la tabla nueva (leído otra vez de la base) con lo anterior: renglones, valores por periodo (cuántos y su suma) y cuántas celdas de referencia traen texto.
// Lee por tandas y cede el turno entre una y otra (una comprobación de 100 mil renglones no debe congelar a los demás usuarios).
async function verify(ctx, copied) {
    const { clientId, lane, oldKey, newKey } = ctx;
    const oldRows = readOldRows(clientId, lane, oldKey);
    await tick();
    const chunks = chunksOf(copied.periods);
    const slotOf = new Map(); // periodo → { load, slot }
    chunks.forEach((chunk, c) => chunk.forEach((p, k) => slotOf.set(p, { load: copied.loadIds[c], slot: k })));
    const sums = new Map(); // `${carga}:${posición}` → { count, sum }
    const packedPage = sqlite.prepare('SELECT row_id, data FROM manual_flex_packed WHERE load_id = ? AND row_id > ? ORDER BY row_id LIMIT 4000');
    for (const loadId of copied.loadIds) {
        let after = 0;
        for (;;) {
            const page = packedPage.all(loadId, after);
            if (!page.length) break;
            page.forEach((r) => {
                flex.unpackValues(r.data).forEach((v, k) => {
                    if (v === null || v === undefined) return;
                    const key = `${loadId}:${k}`;
                    const s2 = sums.get(key) || { count: 0, sum: 0 };
                    s2.count += 1; s2.sum += v;
                    sums.set(key, s2);
                });
            });
            after = page[page.length - 1].row_id;
            await tick();
        }
    }
    const periods = [];
    for (const p of copied.periods) {
        const old = readOldPeriod(clientId, lane, oldKey, p);
        const oldSum = old.reduce((acc, v) => acc + v.value, 0);
        const at = slotOf.get(p);
        const now = sums.get(`${at.load}:${at.slot}`) || { count: 0, sum: 0 };
        periods.push({ period: p, label: manual.periodLabel(p, ctx.lang), oldCount: old.length, newCount: now.count, oldSum, newSum: now.sum, ok: old.length === now.count && sameNumber(oldSum, now.sum) });
        await tick();
    }
    const newRows = sqlite.prepare('SELECT COUNT(*) AS n FROM manual_flex_rows WHERE client_id = ? AND is_test_data = ? AND registry_key = ?').get(clientId, lane, newKey).n;
    const newCells = new Map();
    const cellsPage = sqlite.prepare('SELECT id, cells FROM manual_flex_rows WHERE client_id = ? AND is_test_data = ? AND registry_key = ? AND id > ? ORDER BY id LIMIT 4000');
    let afterRow = 0;
    for (;;) {
        const page = cellsPage.all(clientId, lane, newKey, afterRow);
        if (!page.length) break;
        page.forEach((r) => {
            let cells = {};
            try { cells = JSON.parse(r.cells || '{}'); } catch { cells = {}; }
            DIMS.forEach((d) => { const fold = flex.foldName(d.name); if (cells[fold] !== undefined && cells[fold] !== '') newCells.set(fold, (newCells.get(fold) || 0) + 1); });
        });
        afterRow = page[page.length - 1].id;
        await tick();
    }
    const data = DIMS.map((d) => {
        const old = oldRows.filter((r) => r[d.field] !== null && r[d.field] !== undefined && r[d.field] !== '').length;
        const now = newCells.get(flex.foldName(d.name)) || 0;
        return { name: d.name, old, new: now, ok: old === now };
    });
    const oldValues = periods.reduce((acc, p) => acc + p.oldCount, 0);
    const newValues = periods.reduce((acc, p) => acc + p.newCount, 0);
    const rowsOk = oldRows.length === newRows;
    return { ok: rowsOk && periods.every((p) => p.ok) && data.every((d) => d.ok), rows: { old: oldRows.length, new: newRows, ok: rowsOk }, values: { old: oldValues, new: newValues }, periods, data, at: new Date().toISOString() };
}

// Los análisis que leen el registro anterior y qué pasaría con cada uno (Daniel, 2026-11-27: los análisis deben seguir con la tabla nueva). Para cada uno se convierte su diseño (analysisRepoint.js), se arma el análisis de las dos formas
// (con el registro anterior y con la tabla nueva) y solo si sale IDÉNTICO se marca para pasar. Nada se guarda aquí: el plan va en el reporte y se aplica al confirmar (applyAnalyses). Cede el turno entre un paso y otro.
// Devuelve [{ id, name, status: 'ok' | 'skip', reason?, detail?, rows?, before?, design? }]; ctx.listRegistries() da los registros del cliente.
async function analysesPlan(ctx) {
    const { clientId, lane, oldKey, newKey } = ctx;
    const isTest = lane === 1;
    const regs = ctx.listRegistries();
    const registryKeys = regs.map((r) => r.key);
    const newReg = regs.find((r) => r.key === newKey);
    if (!newReg) return [];
    const maps = analysisRepoint.keyMaps(analysisSources.describe(clientId, isTest, newReg, ctx.lang));
    const tablesFor = (design) => { const out = {}; design.registries.forEach((key) => { const reg = regs.find((r) => r.key === key); if (reg) out[key] = analysisSources.loadTable(clientId, isTest, reg, ctx.lang); }); return out; };
    const plan = [];
    for (const row of db.listAnalysisDesigns()) {
        if (row.clientId !== clientId || row.isTest !== isTest) continue;
        await tick();
        const fixed = analysisRepoint.repointDesign(row.design, oldKey, newKey, maps, registryKeys);
        if (fixed.none) continue;
        const info = db.getAnalysis(row.id, clientId, isTest);
        const item = { id: row.id, name: info ? info.name : `#${row.id}` };
        if (fixed.skip) { plan.push({ ...item, status: 'skip', reason: fixed.skip, ...(fixed.detail ? { detail: String(fixed.detail) } : {}) }); continue; }
        try {
            const before = manualAnalyses.normalizeDesign(row.design, registryKeys).design;
            const newTables = tablesFor(fixed.design);
            const missing = analysisRepoint.missingColumns(fixed.design, newTables);
            if (missing) { plan.push({ ...item, status: 'skip', reason: 'COLUMN', detail: String(missing) }); continue; }
            await tick();
            const oldBuilt = analysisRepoint.build(before, tablesFor(before));
            await tick();
            const newBuilt = analysisRepoint.build(fixed.design, newTables);
            await tick();
            const same = analysisRepoint.sameBuilt(oldBuilt, newBuilt);
            if (!same.ok) { plan.push({ ...item, status: 'skip', reason: 'DIFF', ...(same.detail ? { detail: `${same.why}: ${same.detail}` } : { detail: same.why }) }); continue; }
            plan.push({ ...item, status: 'ok', rows: newBuilt.rows.length, before: JSON.stringify(row.design), design: fixed.design });
        } catch (err) {
            console.error(`Pasar registro: no se pudo revisar el análisis ${row.id}:`, err);
            plan.push({ ...item, status: 'skip', reason: 'ERROR' });
        }
    }
    return plan;
}
// Al confirmar: los análisis marcados para pasar pasan a leer la tabla nueva (el diseño nuevo ya está revisado). Si alguien cambió el análisis desde la comprobación, no se toca.
function applyAnalyses(clientId, lane, plan) {
    const isTest = lane === 1;
    const current = new Map(db.listAnalysisDesigns().filter((r) => r.clientId === clientId && r.isTest === isTest).map((r) => [r.id, r]));
    let moved = 0;
    let changed = 0;
    for (const item of plan || []) {
        if (item.status !== 'ok' || !item.design) continue;
        const row = current.get(item.id);
        if (!row || JSON.stringify(row.design) !== item.before) { changed += 1; continue; }
        db.setAnalysisDesignRaw(item.id, item.design);
        moved += 1;
    }
    return { moved, changed };
}

// Arranca la copia en segundo plano (la petición responde al instante; la pantalla pregunta el avance). ctx: { clientId, lane, oldKey, oldName, newKey, kind, valueName, lang, byLabel, byUserId, migrationId }
function start(ctx) {
    const key = jobKey(ctx.clientId, ctx.lane, ctx.oldKey);
    jobs.set(key, { phase: 'copiando', done: 0, total: 0 });
    (async () => {
        try {
            const copied = await copy(ctx, (p) => { jobs.set(key, { phase: 'copiando', ...p }); });
            db.updateRegistryMigration(ctx.migrationId, { loadIds: copied.loadIds });
            jobs.set(key, { phase: 'comprobando', done: 0, total: 0 });
            await tick();
            const report = await verify(ctx, copied);
            // los análisis que leen el registro anterior: se arman de las dos formas y solo se marcan para pasar los que salen idénticos
            jobs.set(key, { phase: 'analisis', done: 0, total: 0 });
            try { report.analyses = ctx.listRegistries ? await analysesPlan(ctx) : []; } catch (err) { console.error('Pasar registro: no se pudieron revisar los análisis:', err); report.analyses = []; report.analysesFailed = true; }
            db.updateRegistryMigration(ctx.migrationId, { status: 'copiado', report });
        } catch (err) {
            console.error('Pasar registro al tipo único: falló:', err);
            const full = /SQLITE_FULL|database or disk is full/i.test(`${err && err.code} ${err && err.message}`);
            db.updateRegistryMigration(ctx.migrationId, { status: 'error', error: full ? 'DISK_FULL' : (err && err.code === 'NO_DATA' ? 'NO_DATA' : 'ERROR') });
        } finally {
            jobs.delete(key);
            if (ctx.onDone) { try { ctx.onDone(); } catch { /* sin candado */ } }
        }
    })();
}
const progressOf = (clientId, lane, oldKey) => jobs.get(jobKey(clientId, lane, oldKey)) || null;
const isRunning = (clientId, lane, oldKey) => jobs.has(jobKey(clientId, lane, oldKey));

// Quita lo copiado (los datos de la tabla nueva); el registro anterior no se toca.
async function discard(migration) {
    for (const id of migration.loadIds || []) {
        try { await db.discardFlexLoadData(id); } catch (err) { console.error('Pasar registro: no se pudo quitar la copia:', err); }
        sqlite.prepare("UPDATE manual_registry_loads SET status = 'anulada', annulled_at = datetime('now'), annulled_by = 'sistema', annul_note = 'COPIA_DESCARTADA', data_deleted_at = datetime('now') WHERE id = ?").run(id);
    }
}

module.exports = { start, progressOf, isRunning, discard, verify, copy, analysesPlan, applyAnalyses, chunksOf, CHUNK, DIMS };
