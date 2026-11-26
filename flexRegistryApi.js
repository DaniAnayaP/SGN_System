'use strict';
// Rutas de los registros de TABLA LIBRE (kind 'tabla'): las mismas direcciones de /api/business/manual-registries/:key/... que los demás registros, pero con su propia lógica (flexRegistries.js).
// server.js las llama cuando registry.kind === 'tabla'. Todo lo del servidor que hace falta (permisos, bitácora, lock) llega en `deps`.
const ExcelJS = require('exceljs');
const flex = require('./flexRegistries');
const SearchSyntax = require('./public/SearchSyntax.js');
const db = require('./db');

const PAGE = 2000;
const CELL_BUDGET = 20000; // celdas (renglones x columnas) que se mandan para dibujar de una vez
const DISTINCT_LIMIT = 150;
const MESSAGES = {
    FLEX_CONFIG: 'La elección de columnas no es válida.', FLEX_DUP_NAME: 'Dos columnas se llaman igual: cambia el nombre de una.', FLEX_NO_KEY: 'Elige al menos una columna como llave (va hacia abajo).',
    IMPORT_TOO_MANY_COLUMNS: 'El archivo trae demasiadas columnas.', IMPORT_STAMP: 'El día y la hora no son válidos.', BAD_FILTER: 'El filtro no es válido.', BAD_COLUMN: 'Esa columna no existe.',
};
const compareText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const stampToDb = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 10 * 60000 || d.getFullYear() < 2000) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

module.exports = function createFlexApi(deps) {
    const { regAbilities, regForbidden, hasCompleteCostCenter, changedByLabel, logTableChange, notifyButtonAction, buildContentDisposition, REG_TABLE, REG_LOADS_TABLE, regLoading, REG_MESSAGES } = deps;
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
        res.set('Cache-Control', 'no-store');
        res.json({
            registry: { key: registry.key, kind: registry.kind, name: registry.name, custom: registry.custom, status: registry.status },
            periods: [], lastLoad: lastLoad ? { id: lastLoad.id, createdAt: lastLoad.createdAt, stamp: lastLoad.stamp, fileName: lastLoad.fileName, loadedBy: lastLoad.loadedBy } : null,
            columns: ctx.columns.map((c, i) => ({ key: c.key, label: c.label, name: c.name, group: c.group, kind: c.kind, cls: c.cls, color: c.color, num: num[i] })), classes: ctx.classes,
            rows, total, truncated: total > rows.length, scope: { asis: ctx.scopeAsis.map((l) => ctx.labels.get(l.id)), hasAsis: ctx.asisLoads.length > 0 }, ...regAbilities(req),
        });
    }
    function valuesRoute(req, res, registry) {
        const ctx = context(req, registry, { ...(req.query || {}), cf: undefined });
        const idx = ctx.columns.findIndex((c) => c.key === String(req.query.col || ''));
        if (idx < 0) return fail(res, 400, 'BAD_COLUMN');
        const seen = new Set();
        scan(ctx, (get) => { const v = get(idx); seen.add(flex.shownOf(v)); return seen.size <= DISTINCT_LIMIT; });
        const all = [...seen].sort(compareText);
        res.set('Cache-Control', 'no-store');
        res.json({ col: ctx.columns[idx].key, values: all.slice(0, DISTINCT_LIMIT), complete: all.length <= DISTINCT_LIMIT });
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
        const headers = (only || ctx.columns.map((c, i) => i)).map((i) => ctx.columns[i].label);
        const exportRow = (get) => { const full = rowArray(ctx, get); return only ? only.map((i) => full[i]) : full; };
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
                const csv = (v) => { const text = String(v ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
                const send = (chunk) => (res.write(chunk) ? Promise.resolve() : new Promise((resolve) => res.once('drain', resolve)));
                await send(`﻿${headers.map(csv).join(',')}\r\n`);
                while (batches.length) {
                    if (res.destroyed) return;
                    await send(`${batches.shift().map((r) => r.map(csv).join(',')).join('\r\n')}\r\n`);
                    await yieldToOthers();
                }
                res.end();
            } else {
                const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: false, useSharedStrings: false });
                const sheet = workbook.addWorksheet(String(registry.name || 'Datos').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Datos', { views: [{ state: 'frozen', ySplit: 1 }] });
                sheet.addRow(headers).commit();
                while (batches.length) {
                    if (res.destroyed) return;
                    batches.shift().forEach((r) => sheet.addRow(r).commit());
                    await yieldToOthers();
                }
                sheet.commit();
                await workbook.commit();
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
        const prev = registry ? db.flexLastConfig(req.user.clientId, req.user.isTestAccount, registry.key) : null;
        if (prev && Array.isArray(prev.columns)) { flex.prefillHeaders(info.headers, prev); info.prevMode = prev.mode === 'roles' ? 'roles' : 'asis'; }
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
            db.finishRegistryLoad(loadId, { ...result.summary, periods: [], newPeriods: [] });
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
    return { dataRoute, valuesRoute, exportRoute, inspectRoute, importRoute };
};
