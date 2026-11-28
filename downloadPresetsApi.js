'use strict';
// ---------------------------------------------------------------------------
// «Mi personalización de Descarga» (Daniel, 2026-11-28): las rutas y la elección de cuál se aplica en cada descarga. La lógica de lo que es una personalización está en downloadPresets.js.
//   /api/business/download-presets ................ las MÍAS: listar, crear, cambiar, borrar y elegir cuál uso (null = ninguna, 'factory' = «Como siempre», o el id de una)
//   /api/business/manual-registries/:key/download-preset ... la personalización DEL REGISTRO (la que ve quien no eligió la suya; la cambia quien puede cambiar el registro)
// Al descargar se aplica, en este orden: la que la persona manda para esa descarga (?preset=<id>|factory, o ?p=<personalización en JSON> para probar una sin guardarla), la que tiene elegida, la del registro y,
// si ninguna, nada (la descarga sale como siempre).
// ---------------------------------------------------------------------------
const db = require('./db');
const presets = require('./downloadPresets');

const MESSAGES = {
    NO_CLIENT: 'Esta cuenta no tiene personalizaciones de descarga.',
    NAME_REQUIRED: 'Escribe un nombre para la personalización.',
    NAME_TAKEN: 'Ya tienes una personalización con ese nombre.',
    TOO_MANY: `Ya tienes ${presets.MAX_PRESETS} personalizaciones: borra alguna para guardar otra.`,
    NOT_FOUND: 'Esa personalización no existe.',
    PRESET_INVALID: 'La personalización no es válida.',
};
const asId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

module.exports = function createDownloadPresetsApi(deps) {
    const { regAbilities, regForbidden, regRegistry, changedByLabel, logTableChange, REG_TABLE } = deps;
    const fail = (res, status, code) => res.status(status).json({ code, message: MESSAGES[code] || code });
    const ownerOf = (req) => (req.user && req.user.clientId && req.user.sub ? { clientId: req.user.clientId, isTest: !!req.user.isTestAccount, userId: Number(req.user.sub) } : null);
    const shape = (p) => ({ id: p.id, name: p.name, preset: presets.cleanPreset(p.preset), updatedAt: p.updatedAt });

    // La que se aplica a esta descarga: { preset, source } con preset = null cuando no hay ninguna (la descarga sale como siempre).
    // source: 'inline' | 'chosen' | 'active' | 'registry' | 'factory' | null
    // explicitOnly: solo vale lo que la descarga manda (?p= o ?preset=); sin ello no se mira la elegida ni la del registro (las descargas genéricas de otras pantallas no cambian solas)
    function resolve(req, { registryKey = '', explicitOnly = false } = {}) {
        const owner = ownerOf(req);
        const query = (req.method === 'GET' ? req.query : { ...(req.query || {}), ...(req.body || {}) }) || {};
        if (typeof query.p === 'string' && query.p) {
            try { return { preset: presets.cleanPreset(JSON.parse(query.p)), source: 'inline' }; } catch { /* un JSON roto se ignora: se sigue con la elegida */ }
        }
        if (query.preset !== undefined && query.preset !== '' && query.preset !== null && owner) {
            if (query.preset === 'factory') return { preset: presets.cleanPreset(presets.FACTORY), source: 'factory' };
            const id = asId(query.preset);
            const mine = id ? db.getDownloadPreset(owner.clientId, owner.isTest, owner.userId, id) : null;
            if (mine) return { preset: presets.cleanPreset(mine.preset), source: 'chosen' };
        }
        if (explicitOnly) return { preset: null, source: null };
        if (owner) {
            const active = db.getActiveDownloadPreset(owner.clientId, owner.isTest, owner.userId);
            if (active) return { preset: presets.cleanPreset(active.kind === 'factory' ? presets.FACTORY : active.preset), source: active.kind === 'factory' ? 'factory' : 'active' };
        }
        if (registryKey && req.user && req.user.clientId) {
            const reg = db.getRegistryPreset(req.user.clientId, !!req.user.isTestAccount, registryKey);
            if (reg) return { preset: presets.cleanPreset(reg.preset), source: 'registry' };
        }
        return { preset: null, source: null };
    }

    // ---- las mías ------------------------------------------------------------------------------------------------------------------------------------------------
    function listRoute(req, res) {
        const owner = ownerOf(req);
        res.set('Cache-Control', 'no-store');
        if (!owner) return res.json({ available: false, presets: [], active: null, factory: presets.FACTORY, max: presets.MAX_PRESETS });
        const mine = db.listDownloadPresets(owner.clientId, owner.isTest, owner.userId);
        return res.json({ available: true, presets: mine.presets.map(shape), active: mine.active, factory: presets.FACTORY, max: presets.MAX_PRESETS });
    }
    function createRoute(req, res) {
        const owner = ownerOf(req);
        if (!owner) return fail(res, 400, 'NO_CLIENT');
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const name = presets.cleanName(body.name);
        if (!name || !presets.nameKey(name)) return fail(res, 400, 'NAME_REQUIRED');
        if (body.preset !== undefined && (!body.preset || typeof body.preset !== 'object')) return fail(res, 400, 'PRESET_INVALID');
        const key = presets.nameKey(name);
        if (db.downloadPresetNameTaken(owner.clientId, owner.isTest, owner.userId, key)) return fail(res, 409, 'NAME_TAKEN');
        if (db.countDownloadPresets(owner.clientId, owner.isTest, owner.userId) >= presets.MAX_PRESETS) return fail(res, 409, 'TOO_MANY');
        const clean = presets.cleanPreset(body.preset);
        const id = db.createDownloadPreset(owner.clientId, owner.isTest, owner.userId, name, key, clean);
        if (body.activate === true) db.setActiveDownloadPreset(owner.clientId, owner.isTest, owner.userId, id);
        const mine = db.listDownloadPresets(owner.clientId, owner.isTest, owner.userId);
        return res.status(201).json({ id, active: mine.active, presets: mine.presets.map(shape) });
    }
    function updateRoute(req, res) {
        const owner = ownerOf(req);
        if (!owner) return fail(res, 400, 'NO_CLIENT');
        const id = asId(req.params.id);
        const current = id ? db.getDownloadPreset(owner.clientId, owner.isTest, owner.userId, id) : null;
        if (!current) return fail(res, 404, 'NOT_FOUND');
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const change = {};
        if (body.name !== undefined) {
            const name = presets.cleanName(body.name);
            const key = presets.nameKey(name);
            if (!name || !key) return fail(res, 400, 'NAME_REQUIRED');
            if (db.downloadPresetNameTaken(owner.clientId, owner.isTest, owner.userId, key, id)) return fail(res, 409, 'NAME_TAKEN');
            change.name = name; change.nameKey = key;
        }
        if (body.preset !== undefined) {
            if (!body.preset || typeof body.preset !== 'object') return fail(res, 400, 'PRESET_INVALID');
            change.preset = presets.cleanPreset(body.preset);
        }
        db.updateDownloadPreset(owner.clientId, owner.isTest, owner.userId, id, change);
        const mine = db.listDownloadPresets(owner.clientId, owner.isTest, owner.userId);
        return res.json({ id, active: mine.active, presets: mine.presets.map(shape) });
    }
    function deleteRoute(req, res) {
        const owner = ownerOf(req);
        if (!owner) return fail(res, 400, 'NO_CLIENT');
        const id = asId(req.params.id);
        if (!id || !db.deleteDownloadPreset(owner.clientId, owner.isTest, owner.userId, id)) return fail(res, 404, 'NOT_FOUND');
        const mine = db.listDownloadPresets(owner.clientId, owner.isTest, owner.userId);
        return res.json({ active: mine.active, presets: mine.presets.map(shape) });
    }
    // PUT { id: null | 'factory' | número }
    function activeRoute(req, res) {
        const owner = ownerOf(req);
        if (!owner) return fail(res, 400, 'NO_CLIENT');
        const raw = req.body && typeof req.body === 'object' ? req.body.id : undefined;
        let choice = null;
        if (raw !== null && raw !== undefined && raw !== '') {
            choice = raw === 'factory' ? 'factory' : asId(raw);
            if (!choice) return fail(res, 404, 'NOT_FOUND');
        }
        if (!db.setActiveDownloadPreset(owner.clientId, owner.isTest, owner.userId, choice)) return fail(res, 404, 'NOT_FOUND');
        const mine = db.listDownloadPresets(owner.clientId, owner.isTest, owner.userId);
        return res.json({ active: mine.active, presets: mine.presets.map(shape) });
    }

    // ---- la del registro ---------------------------------------------------------------------------------------------------------------------------------------
    // GET: lo guardado (null = ninguna). PUT { preset }: la guarda (revisada). DELETE: la quita. Cambiarla es de quien puede cambiar el registro.
    function registryRoute(req, res) {
        const registry = regRegistry(req, res);
        if (!registry) return undefined;
        const { clientId, isTestAccount } = req.user;
        const canEdit = regAbilities(req).canCreateRegistry;
        res.set('Cache-Control', 'no-store');
        if (req.method === 'GET') {
            const saved = db.getRegistryPreset(clientId, isTestAccount, registry.key);
            return res.json({ preset: saved ? presets.cleanPreset(saved.preset) : null, updatedAt: saved ? saved.updatedAt : null, updatedBy: saved ? saved.updatedBy : '', canEdit, factory: presets.FACTORY });
        }
        if (!canEdit) return regForbidden(res);
        const before = db.getRegistryPreset(clientId, isTestAccount, registry.key);
        if (req.method === 'DELETE') {
            db.setRegistryPreset(clientId, isTestAccount, registry.key, null);
            if (before) logTableChange({ clientId, tableKey: REG_TABLE, recordId: 0, recordLabel: registry.name || registry.key, action: 'update', fieldKey: 'main.regPersonalizacionDescarga', oldValue: 'personalizada', newValue: 'de siempre', changedBy: changedByLabel(req) });
            return res.json({ preset: null });
        }
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        if (!body.preset || typeof body.preset !== 'object') return fail(res, 400, 'PRESET_INVALID');
        const clean = presets.cleanPreset(body.preset);
        db.setRegistryPreset(clientId, isTestAccount, registry.key, clean, changedByLabel(req));
        logTableChange({ clientId, tableKey: REG_TABLE, recordId: 0, recordLabel: registry.name || registry.key, action: 'update', fieldKey: 'main.regPersonalizacionDescarga', oldValue: before ? 'personalizada' : 'de siempre', newValue: 'personalizada', changedBy: changedByLabel(req) });
        return res.json({ preset: clean });
    }

    return { resolve, listRoute, createRoute, updateRoute, deleteRoute, activeRoute, registryRoute };
};
