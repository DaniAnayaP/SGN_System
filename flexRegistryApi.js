'use strict';
// Rutas de los registros de TABLA LIBRE (kind 'tabla'): las mismas direcciones de /api/business/manual-registries/:key/... que los demás registros, pero con su propia lógica (flexRegistries.js).
// server.js las llama cuando registry.kind === 'tabla'. Todo lo del servidor que hace falta (permisos, bitácora, lock) llega en `deps`.
const ExcelJS = require('exceljs');
const flex = require('./flexRegistries');
const flexExcel = require('./flexExcel');
const downloadPresets = require('./downloadPresets');
const SearchSyntax = require('./public/SearchSyntax.js');
const db = require('./db');
const analysisSources = require('./analysisSources');
const totalsCalc = require('./public/TotalsCalc.js');

const PAGE = 2000;
const CELL_BUDGET = 20000; // celdas (renglones x columnas) que se mandan para dibujar de una vez
const DISTINCT_LIMIT = 5000; // más valores distintos que esto: el filtro no ofrece la lista de casillas, solo escribir lo buscado (con 5,000 el menú abre en ~0.3 s)
const MESSAGES = {
    FLEX_CONFIG: 'La elección de columnas no es válida.', FLEX_DUP_NAME: 'Dos columnas se llaman igual: cambia el nombre de una.', FLEX_NO_KEY: 'Elige al menos una columna como llave (va hacia abajo).',
    IMPORT_TOO_MANY_COLUMNS: 'El archivo trae demasiadas columnas.', IMPORT_STAMP: 'El día y la hora no son válidos.', BAD_FILTER: 'El filtro no es válido.', BAD_COLUMN: 'Esa columna no existe.', BAD_CALCS: 'Los cálculos de la fila de totales no son válidos.', FLEX_NO_NAME: 'La columna necesita un nombre.', FLEX_NAME_LOCKED: 'El nombre de una llave o de un dato no se puede cambiar.',
};
const compareText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const stampToDb = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 10 * 60000 || d.getFullYear() < 2000) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

module.exports = function createFlexApi(deps) {
    const { regAbilities, regForbidden, hasCompleteCostCenter, changedByLabel, logTableChange, notifyButtonAction, buildContentDisposition, REG_TABLE, REG_LOADS_TABLE, regLoading, REG_MESSAGES, resolveDownloadPreset } = deps;
    const fail = (res, status, code) => res.status(status).json({ code, message: MESSAGES[code] || REG_MESSAGES[code] || REG_MESSAGES.IMPORT_FILE });

    // ---- lo que se ve: las columnas y los renglones de lo vigente ------------------------------------------------------------------------------------------------
    // Devuelve el contexto de una consulta: columnas, cargas, filtro. tz = minutos que la hora de quien mira va detrás de UTC (Date.getTimezoneOffset()).
    function context(req, registry, query) {
        const { clientId, isTestAccount } = req.user;
        const lang = query.lang === 'en' ? 'en' : 'es';
        const tz = Number.isFinite(Number(query.tz)) ? Number(query.tz) : 0;
        const loads = db.flexVigenteLoads(clientId, isTestAccount, registry.key);
        const built = flex.buildColumns(loads, { tz, lang });
        const parsed = flex.parseFilter(query.cf, built.columns);
        if (parsed.error) return { error: parsed.error };
        const rolesLoads = loads.filter((l) => l.config.mode === 'roles');
        const asisLoads = loads.filter((l) => l.config.mode === 'asis');
        const cargaIdx = built.columns.findIndex((c) => c.kind === 'carga');
        // «tal cual»: sin elegir carga se ve la última; con el filtro de la columna Carga, las que se elijan
        let scopeAsis = asisLoads.slice(-1);
        const cargaCond = parsed.filter && parsed.filter.conds.find((c) => c.idx === cargaIdx && c.set);
        if (cargaCond) scopeAsis = asisLoads.filter((l) => cargaCond.set.has(built.labels.get(l.id)));
        const text = String(query.text || '').trim().slice(0, 200);
        const textTest = text && SearchSyntax.ready('contains', text) ? SearchSyntax.compile('contains', text) : null;
        return { clientId, isTestAccount, lang, tz, loads, rolesLoads, asisLoads, scopeAsis, columns: built.columns, classes: built.classes, labels: built.labels, filter: parsed.filter, textTest, cargaIdx, registry };
    }
    // Recorre los renglones que cumplen el filtro: los que tienen llave (en el orden en que se agregaron) y luego los de las cargas «tal cual» elegidas. onMatch(get) con get(columna) → texto, número o null.
    // Si onMatch devuelve false, se detiene. Con `count` en false no se sigue contando después de parar.
    function scan(ctx, onMatch) {
        const { columns, filter } = ctx;
        const colByName = new Map();
        columns.forEach((c, i) => { if (c.kind === 'cell') colByName.set(c.srcKey.slice(2), i); });
        const loadIds = ctx.rolesLoads.map((l) => l.id);
        // renglones con llave
        if (loadIds.length) {
            const valueMaps = new Map(); // solo las columnas de valor que el filtro usa se leen enteras; las demás se leen por tandas
            const needCols = new Set(filter ? filter.conds.map((c) => c.idx).filter((i) => columns[i].kind === 'value') : []);
            needCols.forEach((i) => valueMaps.set(i, db.flexColumnMap(columns[i].srcKey, loadIds)));
            let afterId = 0;
            for (;;) {
                const batch = db.flexListRows(ctx.clientId, ctx.isTestAccount, ctx.registry.key, loadIds, { afterId, limit: 5000 });
                if (!batch.length) break;
                afterId = batch[batch.length - 1].id;
                let vals = null; // los valores de las columnas que el filtro no usa se leen solo de las tandas de las que se arma un renglón para mostrar
                for (const r of batch) {
                    const get = (i) => {
                        const c = columns[i];
                        if (c.kind === 'cell') { const v = r.cells[c.srcKey.slice(2)]; return v === undefined || v === '' ? null : v; }
                        if (c.kind === 'value') {
                            if (valueMaps.has(i)) { const v = valueMaps.get(i).get(r.id); return v === undefined ? null : v; }
                            if (!vals) vals = db.flexValuesFor(batch.map((x) => x.id), loadIds);
                            const v = vals.get(r.id) && vals.get(r.id).get(c.srcKey);
                            return v === undefined ? null : v;
                        }
                        return null;
                    };
                    if (filter && !filter.matches(get)) continue;
                    if (ctx.textTest && !columns.some((c, i) => c.kind !== 'value' && ctx.textTest(flex.shownOf(get(i))))) continue;
                    if (onMatch(get) === false) return;
                }
            }
        }
        // cargas «tal cual»
        for (const load of ctx.scopeAsis) {
            const block = db.flexBlock(load.id);
            if (!block) continue;
            const label = ctx.labels.get(load.id);
            const map = block.columns.map((name) => colByName.get(flex.foldName(name)));
            for (const row of block.rows) {
                const cells = new Array(columns.length).fill(null);
                map.forEach((ci, k) => { if (ci !== undefined) cells[ci] = row[k] === undefined ? null : row[k]; });
                if (ctx.cargaIdx >= 0) cells[ctx.cargaIdx] = label;
                const get = (i) => cells[i];
                if (filter && !filter.matches(get)) continue;
                if (ctx.textTest && !columns.some((c, i) => c.kind !== 'value' && ctx.textTest(flex.shownOf(get(i))))) continue;
                if (onMatch(get) === false) return;
            }
        }
    }
    const rowArray = (ctx, get) => ctx.columns.map((c, i) => { const v = get(i); return v === undefined ? null : v; });

    // ---- rutas ----------------------------------------------------------------------------------------------------------------------------------------------
    function dataRoute(req, res, registry) {
        const ctx = context(req, registry, req.query || {});
        if (ctx.error) return fail(res, 400, ctx.error);
        let total = 0;
        const rows = [];
        // cuántos renglones se mandan para dibujar: máximo 2,000, y menos si la tabla es ancha (2,000 renglones x 35 columnas son 70 mil celdas y el navegador se traba al moverla); el resto se alcanza buscando, filtrando o descargando
        const pageRows = Math.max(200, Math.min(PAGE, Math.floor(CELL_BUDGET / Math.max(1, ctx.columns.length))));
        if (!ctx.filter && !ctx.textTest) {
            // sin filtro: el total sale de contar y los primeros renglones de leer solo la primera página (no se recorren los 140 mil)
            const loadIds = ctx.rolesLoads.map((l) => l.id);
            const keyed = loadIds.length ? db.flexCountRows(ctx.clientId, ctx.isTestAccount, registry.key, loadIds) : 0;
            total = keyed + db.flexBlockCount(ctx.scopeAsis.map((l) => l.id));
            scan(ctx, (get) => { rows.push(rowArray(ctx, get)); return rows.length < pageRows; });
        } else {
            scan(ctx, (get) => { total += 1; if (rows.length < pageRows) rows.push(rowArray(ctx, get)); return true; });
        }
        const num = ctx.columns.map((c, i) => c.kind === 'value' || (rows.length > 0 && rows.every((r) => r[i] === null || typeof r[i] === 'number') && rows.some((r) => typeof r[i] === 'number')));
        const lastLoad = ctx.loads.length ? ctx.loads[ctx.loads.length - 1] : null;
        // el formato que la persona dejó guardado para cada columna (número, sombreado, letra, encabezado): la tabla lo aplica y el Excel sale igual
        const savedFmt = db.getRegistryFormat(ctx.clientId, ctx.isTestAccount, registry.key);
        const screenFmts = flexExcel.screenFormats(ctx.columns, savedFmt && savedFmt.format);
        res.set('Cache-Control', 'no-store');
        res.json({
            registry: { key: registry.key, kind: registry.kind, name: registry.name, custom: registry.custom, status: registry.status },
            periods: [], lastLoad: lastLoad ? { id: lastLoad.id, createdAt: lastLoad.createdAt, stamp: lastLoad.stamp, fileName: lastLoad.fileName, loadedBy: lastLoad.loadedBy } : null,
            columns: ctx.columns.map((c, i) => ({ key: c.key, sid: c.sid, label: c.label, name: c.name, group: c.group, kind: c.kind, cls: c.cls, color: c.color, num: num[i], ...(screenFmts[i] ? { fmt: screenFmts[i] } : {}) })), classes: ctx.classes,
            // sid: la llave ESTABLE de cada columna (key es la posición: cambia si llegan columnas nuevas); el acomodo original se guarda con ella
            layout: db.getRegistryLayout(ctx.clientId, ctx.isTestAccount, registry.key),
            rows, total, truncated: total > rows.length, scope: { asis: ctx.scopeAsis.map((l) => ctx.labels.get(l.id)), hasAsis: ctx.asisLoads.length > 0 }, ...regAbilities(req),
        });
    }
    function valuesRoute(req, res, registry) {
        const ctx = context(req, registry, { ...(req.query || {}), cf: undefined });
        const idx = ctx.columns.findIndex((c) => c.key === String(req.query.col || ''));
        if (idx < 0) return fail(res, 400, 'BAD_COLUMN');
        const seen = new Set();
        // con q (lo escrito en el buscador del filtro) se buscan entre TODOS los valores de la columna, sin el tope de la lista completa
        const typed = String(req.query.q || '').slice(0, 200);
        if (typed) {
            scan(ctx, (get) => { seen.add(flex.shownOf(get(idx))); return true; });
            res.set('Cache-Control', 'no-store');
            return res.json({ col: ctx.columns[idx].key, ...flex.searchValues(seen, String(req.query.mode || ''), typed, ctx.lang), query: true });
        }
        scan(ctx, (get) => { const v = get(idx); seen.add(flex.shownOf(v)); return seen.size <= DISTINCT_LIMIT; });
        const all = [...seen].sort(compareText);
        res.set('Cache-Control', 'no-store');
        res.json({ col: ctx.columns[idx].key, values: all.slice(0, DISTINCT_LIMIT), complete: all.length <= DISTINCT_LIMIT });
    }
    // La fila de totales (Daniel, 2026-11-27): suma o cuenta TODOS los renglones que pasan el filtro y el texto de la pantalla (no solo los que se dibujan). calcs = { columna: cálculo } (ver public/TotalsCalc.js).
    function totalsRoute(req, res, registry) {
        const ctx = context(req, registry, req.query || {});
        if (ctx.error) return fail(res, 400, ctx.error);
        const parsed = totalsCalc.parseCalcs(req.query.calcs);
        if (parsed.error) return fail(res, 400, parsed.error);
        const at = new Map(ctx.columns.map((c, i) => [c.key, i]));
        const out = parsed.specs.size ? totalsCalc.compute(parsed.specs, (key) => at.get(key), (onRow) => scan(ctx, (get) => { onRow(get); return true; })) : { rows: 0, values: {} };
        res.set('Cache-Control', 'no-store');
        res.json(out);
    }
    async function exportRoute(req, res, registry) {
        const ctx = context(req, registry, req.query || {});
        if (ctx.error) return fail(res, 400, ctx.error);
        const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
        const base = String(req.query.file || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || `Registro-${registry.key}`;
        // las columnas que la persona dejó visibles (cols = claves separadas por coma, en el orden en que las ve); sin cols, todas
        const asked = String(req.query.cols || '').split(',').map((k) => k.trim()).filter(Boolean);
        const picked = asked.map((k) => ctx.columns.findIndex((c) => c.key === k)).filter((i) => i >= 0);
        const only = asked.length && picked.length ? picked : null;
        // dec: los decimales que la persona ve en pantalla («Encabezados y celdas»): la descarga baja lo que se ve (Daniel, 2026-11-28)
        const decAsked = req.query.dec === undefined || req.query.dec === '' ? null : Number(req.query.dec);
        // Mi personalización de Descarga: la que se manda para esta descarga, la elegida o la del registro (sin ninguna, sale como siempre). Si fija los decimales manda sobre lo que se ve.
        const chosenPreset = resolveDownloadPreset(req, { registryKey: registry.key }).preset;
        const pickedNumbers = chosenPreset ? downloadPresets.numbersOf(chosenPreset) : null;
        const decFromScreen = Number.isInteger(decAsked) && decAsked >= 0 && decAsked <= 6 ? decAsked : null;
        const decOverride = pickedNumbers && pickedNumbers.dec !== null ? pickedNumbers.dec : decFromScreen;
        const csvOpt = chosenPreset ? downloadPresets.csvOptions(chosenPreset) : { sep: ',', bom: true, title: false, titleText: '' };
        const headers = (only || ctx.columns.map((c, i) => i)).map((i) => ctx.columns[i].label);
        const exportRow = (get) => { const full = rowArray(ctx, get); const row = only ? only.map((i) => full[i]) : full; return format === 'csv' && decOverride !== null ? row.map((v) => (typeof v === 'number' ? v.toFixed(decOverride) : v)) : row; };
        res.set('Cache-Control', 'no-store');
        res.setHeader('Content-Type', format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', buildContentDisposition(`${base}.${format}`));
        const yieldToOthers = () => new Promise((resolve) => setImmediate(resolve));
        try {
            // se junta por tandas de 2,000 y se manda: así 140 mil renglones no se arman todos juntos en la respuesta
            const batches = [];
            let current = [];
            scan(ctx, (get) => { current.push(exportRow(get)); if (current.length >= PAGE) { batches.push(current); current = []; } return true; });
            if (current.length) batches.push(current);
            if (format === 'csv') {
                const csv = (v) => { const text = String(v ?? ''); return text.includes(csvOpt.sep) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
                const send = (chunk) => (res.write(chunk) ? Promise.resolve() : new Promise((resolve) => res.once('drain', resolve)));
                await send(`${csvOpt.bom ? '\ufeff' : ''}${csvOpt.title ? `${csv(csvOpt.titleText || registry.name || registry.key)}\r\n` : ''}${headers.map(csv).join(csvOpt.sep)}\r\n`);
                while (batches.length) {
                    if (res.destroyed) return;
                    await send(`${batches.shift().map((r) => r.map(csv).join(csvOpt.sep)).join('\r\n')}\r\n`);
                    await yieldToOthers();
                }
                res.end();
            } else {
                // el Excel lleva el formato del registro (o el de siempre): encabezado, fila de apoyo, formato de cada columna, filtro, paneles fijos y la hoja «Resumen»
                const saved = db.getRegistryFormat(ctx.clientId, ctx.isTestAccount, registry.key);
                const columnsOut = (only || ctx.columns.map((c, i) => i)).map((i) => ctx.columns[i]);
                const lastLoad = ctx.loads.length ? ctx.loads[ctx.loads.length - 1] : null;
                await flexExcel.writeWorkbook({
                    stream: res, batches, columns: columnsOut, format: downloadPresets.flexFormatFor(chosenPreset, saved && saved.format), decOverride,
                    meta: { lang: ctx.lang, tz: ctx.tz, registryName: registry.name || registry.key, by: changedByLabel(req), lastLoad: lastLoad ? { fileName: lastLoad.fileName, loadedBy: lastLoad.loadedBy, createdAt: lastLoad.createdAt } : null, searchText: String(req.query.text || '').trim().slice(0, 100), hasColumnFilters: !!req.query.cf, totalColumns: ctx.columns.length },
                });
            }
        } catch (err) {
            console.error('Registros (tabla libre): la descarga completa falló:', err);
            if (!res.headersSent) res.status(500).json({ code: 'EXPORT_ERROR', message: 'No se pudo armar la descarga.' }); else res.destroy();
        }
    }
    async function inspectRoute(req, res, registry) {
        const ability = regAbilities(req);
        if (!ability.canTemplate && !ability.canExcel) return regForbidden(res);
        if (!Buffer.isBuffer(req.body)) return fail(res, 400, 'IMPORT_FILE');
        const info = await flex.inspect(req.body, { sheet: req.query.sheet ? String(req.query.sheet) : undefined });
        res.set('Cache-Control', 'no-store');
        if (info.error && !info.sheets) return fail(res, 400, info.error);
        if (info.error) return res.status(400).json({ code: info.error, message: MESSAGES[info.error] || REG_MESSAGES[info.error] || REG_MESSAGES.IMPORT_FILE, sheets: info.sheets, sheet: info.sheet });
        // el cuadro de columnas viene ya llenado con la elección de la última carga de este registro (si la hay)
        const history = registry ? db.flexConfigHistory(req.user.clientId, req.user.isTestAccount, registry.key) : [];
        if (history.length) {
            // con papeles: se reconoce por el título que traía la columna en CUALQUIER carga (la más reciente manda) y se listan las columnas que el registro ya tiene; a los títulos que no se reconocen se les sugiere la que se parece
            flex.prefillHeaders(info.headers, { mode: 'roles', columns: history.flatMap((cfg) => cfg.columns), skipped: history.flatMap((cfg) => (Array.isArray(cfg.skipped) ? cfg.skipped : [])) });
            info.prevMode = 'roles';
            const byName = new Map();
            history.slice().reverse().forEach((cfg) => cfg.columns.forEach((c) => { if (c.role && c.role !== 'skip') byName.set(flex.foldName(c.name), { name: c.name, role: c.role, agg: c.agg === 'one' ? 'one' : 'sum', stampName: c.stampName !== false, cls: c.cls || '', color: Number.isInteger(c.color) ? c.color : null }); }));
            info.existing = [...byName.values()];
            flex.suggestLinks(info.headers, info.existing);
        } else {
            const prev = registry ? db.flexLastConfig(req.user.clientId, req.user.isTestAccount, registry.key) : null;
            if (prev && Array.isArray(prev.columns)) { flex.prefillHeaders(info.headers, prev); info.prevMode = prev.mode === 'roles' ? 'roles' : 'asis'; }
        }
        res.json(info);
    }
    async function importRoute(req, res, registry) {
        if (!regAbilities(req).canExcel) return regForbidden(res);
        const { clientId, isTestAccount } = req.user;
        const commit = req.query.mode === 'commit';
        if (commit && !hasCompleteCostCenter(clientId, isTestAccount)) {
            return res.status(409).json({ code: 'COST_CENTER_REQUIRED', message: 'Primero crea un centro de costos completo en Nuestros Centros Costos: toda operación va ligada a uno.' });
        }
        if (!Buffer.isBuffer(req.body) || !req.body.length) return fail(res, 400, 'IMPORT_FILE');
        const parsed = flex.parseConfig(req.query.cfg);
        if (parsed.error) return res.status(400).json({ code: parsed.error, message: MESSAGES[parsed.error], detail: parsed.detail });
        const stamp = stampToDb(req.query.stamp ? String(req.query.stamp) : '');
        if (!stamp) return fail(res, 400, 'IMPORT_STAMP');
        const headerRow = Number(req.query.header) || 0;
        if (!headerRow) return fail(res, 400, 'IMPORT_HEADERS');
        const sheet = req.query.sheet ? String(req.query.sheet) : undefined;
        const lockKey = `${clientId}:${isTestAccount ? 1 : 0}:${registry.key}`;
        if (regLoading.has(lockKey)) return res.status(409).json({ code: 'REG_BUSY', message: 'Ya hay una carga de este registro en curso. Espera a que termine.' });
        regLoading.add(lockKey);
        const fileName = String(req.query.file || '').replace(/[\u0000-\u001f]/g, '').slice(0, 160);
        const options = { sheet, headerRow };
        res.set('Cache-Control', 'no-store');
        let loadId = null;
        try {
            if (!commit) {
                const store = db.flexStore({ clientId, isTestData: isTestAccount, registryKey: registry.key, loadId: 0 });
                const result = await flex.run(req.body, options, parsed.cfg, store, 0, { dryRun: true });
                if (result.error) return res.status(result.error === 'IMPORT_TOO_BIG' ? 413 : 400).json({ code: result.error, message: MESSAGES[result.error] || REG_MESSAGES[result.error] || REG_MESSAGES.IMPORT_FILE });
                return res.json({ mode: 'preview', sheet, headerRow, summary: result.summary, issues: result.issues });
            }
            loadId = db.createRegistryLoad({ clientId, isTestData: isTestAccount, registryKey: registry.key, source: 'excel', fileName, sheet, day: '', loadedBy: changedByLabel(req), loadedByUserId: req.user.sub });
            db.setFlexLoadInfo(loadId, stamp, { mode: parsed.cfg.mode, columns: parsed.cfg.columns.filter((c) => c.role !== 'skip').map((c) => ({ src: c.src, name: c.name, role: c.role, agg: c.agg, stampName: c.stampName, cls: c.cls, color: c.color })), skipped: parsed.cfg.columns.filter((c) => c.role === 'skip').map((c) => c.src || c.name) });
            const store = db.flexStore({ clientId, isTestData: isTestAccount, registryKey: registry.key, loadId });
            const result = await flex.run(req.body, options, parsed.cfg, store, loadId, { dryRun: false });
            if (result.error) {
                db.failRegistryLoad(loadId, result.error);
                return res.status(result.error === 'IMPORT_TOO_BIG' ? 413 : 400).json({ code: result.error, message: MESSAGES[result.error] || REG_MESSAGES[result.error] || REG_MESSAGES.IMPORT_FILE });
            }
            if (!result.summary.added) {
                db.discardEmptyRegistryLoad(loadId);
                return res.json({ mode: 'commit', loadId: null, sheet, headerRow, summary: result.summary, issues: result.issues });
            }
            // en el historial, «Agregados» cuenta también los datos que la carga completó en renglones que ya existían (si no, una carga que solo completa saldría con 0)
            db.finishRegistryLoad(loadId, { ...result.summary, valuesAdded: (result.summary.valuesAdded || 0) + (result.summary.filledCells || 0), periods: [], newPeriods: [] });
            logTableChange({ clientId, tableKey: REG_LOADS_TABLE, recordId: loadId, recordLabel: fileName || registry.key, action: 'create', fieldKey: 'main.regCargaArchivo', newValue: fileName, changedBy: changedByLabel(req) });
            notifyButtonAction(req, REG_TABLE, 'importExcel', `${result.summary.added} renglones y valores`);
            return res.json({ mode: 'commit', loadId, sheet, headerRow, summary: result.summary, issues: result.issues });
        } catch (err) {
            console.error('Registros (tabla libre): la carga falló:', err);
            // lo que alcanzó a escribir se quita: «no se agregó nada» tiene que ser cierto (y el reintento parte de cero)
            if (loadId) { try { await db.discardFlexLoadData(loadId); } catch (cleanErr) { console.error('Registros (tabla libre): no se pudo limpiar la carga fallida:', cleanErr); } }
            const full = /SQLITE_FULL|database or disk is full/i.test(`${err && err.code} ${err && err.message}`);
            if (loadId) db.failRegistryLoad(loadId, full ? 'DISK_FULL' : 'ERROR');
            if (full) {
                const space = db.diskSpace();
                const mb = (b) => Math.max(0, Math.round(b / 1048576));
                return res.status(507).json({ code: 'DISK_FULL', message: 'El servidor se quedó sin espacio para guardar esta carga. No se agregó nada.', ...(space ? { freeMb: mb(space.freeBytes), reusableMb: mb(space.reusableBytes), totalMb: mb(space.totalBytes), dbMb: mb(space.dbBytes) } : {}) });
            }
            return res.status(500).json({ code: 'IMPORT_ERROR', message: 'La carga no se pudo completar. No se agregó nada.' });
        } finally {
            regLoading.delete(lockKey);
        }
    }
    // ---- el formato de la descarga de este registro ----------------------------------------------------------------------------------------------------------
    // GET: lo guardado (o null = el de siempre), lo que se aplica y las columnas de la tabla (para el panel). PUT: guarda (revisado). DELETE: vuelve al formato de siempre.
    function formatRoute(req, res, registry) {
        const { clientId, isTestAccount } = req.user;
        const canEdit = regAbilities(req).canCreateRegistry;
        res.set('Cache-Control', 'no-store');
        if (req.method === 'GET') {
            const saved = db.getRegistryFormat(clientId, isTestAccount, registry.key);
            const ctx = context(req, registry, { lang: req.query.lang, tz: req.query.tz });
            return res.json({
                format: saved ? saved.format : null, effective: flexExcel.mergeFormat(saved && saved.format), updatedAt: saved ? saved.updatedAt : null, updatedBy: saved ? saved.updatedBy : '', canEdit,
                fonts: flexExcel.FONTS, columns: ctx.columns.filter((c) => c.kind !== 'carga').map((c) => ({ key: c.key, label: c.label, name: c.name, group: c.group, kind: c.kind })),
            });
        }
        if (!canEdit) return regForbidden(res);
        if (req.method === 'DELETE') {
            const had = db.clearRegistryFormat(clientId, isTestAccount, registry.key);
            if (had) logTableChange({ clientId, tableKey: REG_TABLE, recordId: 0, recordLabel: registry.name || registry.key, action: 'update', fieldKey: 'main.regFormatoDescarga', oldValue: 'personalizado', newValue: 'de siempre', changedBy: changedByLabel(req) });
            return res.json({ format: null, effective: flexExcel.mergeFormat(null) });
        }
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        if (!body.format || typeof body.format !== 'object') return res.status(400).json({ code: 'FORMAT_INVALID', message: 'El formato no es válido.' });
        const clean = flexExcel.cleanFormat(body.format);
        const before = db.getRegistryFormat(clientId, isTestAccount, registry.key);
        db.setRegistryFormat(clientId, isTestAccount, registry.key, clean, changedByLabel(req));
        logTableChange({ clientId, tableKey: REG_TABLE, recordId: 0, recordLabel: registry.name || registry.key, action: 'update', fieldKey: 'main.regFormatoDescarga', oldValue: before ? 'personalizado' : 'de siempre', newValue: 'personalizado', changedBy: changedByLabel(req) });
        return res.json({ format: clean, effective: flexExcel.mergeFormat(clean) });
    }
    // El formato de UNA columna (el menú ⋮ del encabezado, Daniel, 2026-11-26): PUT { name, format } lo guarda, DELETE { name } lo borra. Se guarda con el formato del registro, así que vale para todas las cargas de esa columna
    // (se empareja por el nombre) y el Excel que se descarga sale igual. Lo puede hacer quien puede modificar registros (igual que el formato de la descarga).
    function columnFormatRoute(req, res, registry) {
        const { clientId, isTestAccount } = req.user;
        if (!regAbilities(req).canCreateRegistry) return regForbidden(res);
        res.set('Cache-Control', 'no-store');
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const name = String(body.name || '').trim();
        const key = flexExcel.columnKey(name);
        if (!key) return fail(res, 400, 'BAD_COLUMN');
        const ctx = context(req, registry, {});
        if (!ctx.columns.some((c) => c.kind !== 'carga' && flexExcel.columnKey(c.name) === key)) return fail(res, 400, 'BAD_COLUMN');
        const before = db.getRegistryFormat(clientId, isTestAccount, registry.key);
        const out = flexExcel.setColumnFormat(before && before.format, name, req.method === 'DELETE' ? {} : body.format);
        db.setRegistryFormat(clientId, isTestAccount, registry.key, out.format, changedByLabel(req));
        logTableChange({ clientId, tableKey: REG_TABLE, recordId: 0, recordLabel: registry.name || registry.key, action: 'update', fieldKey: 'main.regFormatoColumna', oldValue: name, newValue: out.fmt ? 'con formato' : 'sin formato', changedBy: changedByLabel(req) });
        return res.json({ name, key, fmt: out.fmt });
    }
    // ---- «Columnas del registro» (Daniel, 2026-11-26): GET la lista de columnas que ya existen; PUT { changes: [{ id, name?, cls?, color? }] } cambia su nombre (solo valores con día y hora) y su clasificación en TODAS las cargas.
    // Lo puede hacer quien puede cargar un Excel (la misma persona que ya elige esos nombres al cargar). No toca ningún dato: solo la elección de columnas guardada con cada carga.
    function columnsRoute(req, res, registry) {
        const { clientId, isTestAccount } = req.user;
        const abilities = regAbilities(req);
        const lang = req.query && req.query.lang === 'en' ? 'en' : 'es';
        res.set('Cache-Control', 'no-store');
        const listing = () => { const loads = db.flexVigenteLoads(clientId, isTestAccount, registry.key); return { loads, ...flex.registryColumns(loads, { tz: 0, lang }) }; };
        const view = (l) => { const roles = l.loads.filter((x) => x.config.mode === 'roles').map((x) => x.id); return { columns: l.columns, classes: l.classes, colors: flex.CLASS_COLORS, loads: l.loads.length, rows: roles.length ? db.flexCountRows(clientId, isTestAccount, registry.key, roles) : 0, canEdit: abilities.canExcel }; };
        if (req.method === 'GET') return res.json(view(listing()));
        if (!abilities.canExcel) return regForbidden(res);
        const lockKey = `${clientId}:${isTestAccount ? 1 : 0}:${registry.key}`;
        if (regLoading.has(lockKey)) return res.status(409).json({ code: 'REG_BUSY', message: 'Ya hay una carga de este registro en curso. Espera a que termine.' });
        const before = listing();
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const plan = flex.planColumnChanges(db.flexConfigLoads(clientId, isTestAccount, registry.key), body.changes, before);
        if (plan.error) return res.status(plan.error === 'BAD_COLUMN' ? 404 : (plan.error === 'FLEX_NAME_LOCKED' ? 409 : 400)).json({ code: plan.error, message: MESSAGES[plan.error] || REG_MESSAGES[plan.error] || REG_MESSAGES.IMPORT_FILE, detail: plan.detail });
        if (plan.updates.length) {
            db.updateFlexConfigs(clientId, isTestAccount, registry.key, plan.updates);
            // el formato que la columna tenía guardado la sigue cuando cambia de nombre
            let fmt = db.getRegistryFormat(clientId, isTestAccount, registry.key);
            let moved = false;
            plan.entries.forEach((e) => { if (e.name !== undefined && fmt) { const next = flexExcel.renameColumnFormat(fmt.format, e.now.name, e.name); if (next) { fmt = { ...fmt, format: next }; moved = true; } } });
            if (moved) db.setRegistryFormat(clientId, isTestAccount, registry.key, fmt.format, changedByLabel(req));
            const who = changedByLabel(req);
            plan.entries.forEach((e) => {
                if (e.name !== undefined) {
                    logTableChange({ clientId, tableKey: REG_TABLE, recordId: 0, recordLabel: registry.name || registry.key, action: 'update', fieldKey: 'main.regColumnaNombre', oldValue: e.now.name, newValue: e.name, changedBy: who });
                    analysisSources.renameLive(clientId, isTestAccount, registry.key, e.id, `v:${flex.foldName(e.name)}`); // los análisis que pedían «la más reciente» de esta columna siguen pidiéndola con el nombre nuevo
                }
                if (e.cls !== undefined) logTableChange({ clientId, tableKey: REG_TABLE, recordId: 0, recordLabel: `${registry.name || registry.key} · ${e.name !== undefined ? e.name : e.now.name}`, action: 'update', fieldKey: 'main.regColumnaClasificacion', oldValue: e.now.cls || '—', newValue: e.cls || '—', changedBy: who });
            });
        }
        return res.json({ changed: plan.entries.length, loadsTouched: plan.updates.length, ...view(listing()) });
    }
    // ---- Cargas: «Sí considerar» y «Eliminar los datos» de una carga (Daniel, 2026-11-26) ---------------------------------------------------------------------------
    // «No considerar» es la ruta de siempre /annul (la carga queda en el historial y sus datos dejan de contar). Aquí: volver a considerarla, o eliminar sus datos (solo si ya no se considera; el registro y la línea del historial se quedan).
    async function loadActionRoute(req, res, registry, action) {
        if (!regAbilities(req).canAnnul) return regForbidden(res);
        const { clientId, isTestAccount } = req.user;
        const load = db.getRegistryLoad(Number(req.params.id) || 0, clientId, isTestAccount);
        if (!load || load.registryKey !== registry.key) return res.status(404).json({ code: 'LOAD_NOT_FOUND', message: 'Esa carga no existe.' });
        const lockKey = `${clientId}:${isTestAccount ? 1 : 0}:${registry.key}`;
        if (regLoading.has(lockKey)) return res.status(409).json({ code: 'REG_BUSY', message: 'Ya hay una carga de este registro en curso. Espera a que termine.' });
        if (load.annulledBy === 'sistema') return res.status(409).json({ code: 'LOAD_FAILED', message: 'Esa carga falló: no tiene datos que considerar ni eliminar.' });
        if (load.dataDeleted) return res.status(409).json({ code: 'LOAD_DATA_DELETED', message: 'Los datos de esa carga ya se eliminaron.' });
        if (load.status === 'vigente') return res.status(409).json({ code: 'LOAD_ACTIVE', message: action === 'delete-data' ? 'Primero deja de considerar la carga.' : 'Esa carga ya se considera.' });
        if (load.status !== 'anulada') return res.status(409).json({ code: 'LOAD_NOT_ACTIVE', message: 'Esa carga todavía no terminó.' });
        res.set('Cache-Control', 'no-store');
        const label = load.fileName || registry.key;
        if (action === 'reconsider') {
            const done = db.reconsiderRegistryLoad(load.id, clientId, isTestAccount);
            if (!done) return res.status(409).json({ code: 'LOAD_NOT_ACTIVE', message: 'Esa carga no se puede volver a considerar.' });
            logTableChange({ clientId, tableKey: REG_LOADS_TABLE, recordId: load.id, recordLabel: label, action: 'update', fieldKey: 'main.regCargaEstado', oldValue: 'no considerada', newValue: 'vigente', changedBy: changedByLabel(req) });
            notifyButtonAction(req, REG_TABLE, 'annul', label);
            return res.json({ load: done });
        }
        regLoading.add(lockKey);
        try {
            const deleted = await db.deleteFlexLoadData(load.id);
            logTableChange({ clientId, tableKey: REG_LOADS_TABLE, recordId: load.id, recordLabel: label, action: 'update', fieldKey: 'main.regCargaEstado', oldValue: 'no considerada', newValue: `datos eliminados (${deleted.rows} renglones, ${deleted.values} valores)`, changedBy: changedByLabel(req) });
            notifyButtonAction(req, REG_TABLE, 'annul', label);
            return res.json({ load: db.getRegistryLoad(load.id, clientId, isTestAccount), deleted });
        } catch (err) {
            console.error('Registros (tabla libre): no se pudieron eliminar los datos de la carga:', err);
            return res.status(500).json({ code: 'DELETE_ERROR', message: 'No se pudieron eliminar los datos. Vuelve a intentarlo.' });
        } finally {
            regLoading.delete(lockKey);
        }
    }
    return { dataRoute, valuesRoute, totalsRoute, exportRoute, inspectRoute, importRoute, formatRoute, columnFormatRoute, columnsRoute, loadActionRoute };
};
