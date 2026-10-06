// ---------------------------------------------------------------------------
// Reinicio del sistema: deja la base como si nunca se hubiera usado (sin clientes, sin usuarios de clientes, sin capturas ni historiales)
// y conserva la configuración (Árbol Maestro, giros, planes, equipo SaaS, catálogos). Sirve para empezar de cero la creación de clientes.
//
// Todo está en TABLES: cada tabla de la base DEBE estar clasificada aquí. Si aparece una tabla nueva sin clasificar, el reinicio se niega a
// correr (preview().ok = false) hasta que se decida si se borra o se conserva: así una tabla futura nunca se borra ni se salta por descuido.
//
// Este módulo no sabe nada de permisos ni de rutas: solo da el respaldo, la vista previa y el borrado. Quién puede pedirlo y con qué
// confirmaciones lo decide server.js (solo admin_saas, respaldo reciente, frase escrita y la variable ALLOW_SYSTEM_RESET).
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const WIPE = 'wipe'; // se borran todas las filas
const KEEP = 'keep'; // no se toca
const PARTIAL = 'partial'; // se borran solo las filas que cumplen `where`

// Los niveles del "Árbol por Nivel" que pertenecen a un cliente; giro y plan son configuración del lado SaaS y se conservan.
const CLIENT_LEVELS_WHERE = "level IN ('cliente','admin','perfil','usuario')";

const TABLES = {
    // Clientes y su contrato
    clients: { action: WIPE, group: 'clients' },
    client_changes: { action: WIPE, group: 'clients' },
    client_modules: { action: WIPE, group: 'clients' },
    client_permission_grants: { action: WIPE, group: 'clients' },
    client_permission_change_log: { action: WIPE, group: 'clients' },
    anexo_changes: { action: WIPE, group: 'clients' },
    // Usuarios de los clientes (los del equipo SaaS, sin client_id, se conservan) y sus permisos
    users: { action: PARTIAL, group: 'clientUsers', where: 'client_id IS NOT NULL' },
    user_grants: { action: WIPE, group: 'clientUsers' },
    user_grant_change_log: { action: WIPE, group: 'clientUsers' },
    user_profiles: { action: WIPE, group: 'clientUsers' },
    profiles: { action: WIPE, group: 'clientUsers' },
    profile_grants: { action: WIPE, group: 'clientUsers' },
    // Organización de cada cliente
    cost_centers: { action: WIPE, group: 'organization' },
    job_positions: { action: WIPE, group: 'organization' },
    job_position_grants: { action: WIPE, group: 'organization' },
    job_position_alt_supervisors: { action: WIPE, group: 'organization' },
    hr_workers: { action: WIPE, group: 'organization' },
    hr_status_catalog: { action: WIPE, group: 'organization' },
    // Lo que los clientes capturaron
    fleet_units: { action: WIPE, group: 'captures' },
    fuel_loading_records: { action: WIPE, group: 'captures' },
    fuel_records: { action: WIPE, group: 'captures' },
    freight_quotes: { action: WIPE, group: 'captures' },
    transfers: { action: WIPE, group: 'captures' },
    sku_items: { action: WIPE, group: 'captures' },
    article_categories: { action: WIPE, group: 'captures' },
    unit_types: { action: WIPE, group: 'captures' },
    catalog_value_requests: { action: WIPE, group: 'captures' },
    catalog_value_request_hops: { action: WIPE, group: 'captures' },
    support_materials: { action: WIPE, group: 'captures' },
    // Personalización y reglas de cada cliente
    field_fill_rules: { action: WIPE, group: 'clientSettings' },
    saved_layouts: { action: WIPE, group: 'clientSettings' },
    saved_searches: { action: WIPE, group: 'clientSettings' },
    column_color_level_overrides: { action: PARTIAL, group: 'clientSettings', where: CLIENT_LEVELS_WHERE },
    classification_level_overrides: { action: PARTIAL, group: 'clientSettings', where: CLIENT_LEVELS_WHERE },
    permission_order_level_overrides: { action: PARTIAL, group: 'clientSettings', where: CLIENT_LEVELS_WHERE },
    intelligent_reports: { action: WIPE, group: 'clientSettings' },
    intelligent_report_columns: { action: WIPE, group: 'clientSettings' },
    scheduled_reports: { action: WIPE, group: 'clientSettings' },
    // Solicitudes y alertas
    pending_changes: { action: WIPE, group: 'requests' },
    column_color_requests: { action: WIPE, group: 'requests' },
    access_denied_alerts: { action: WIPE, group: 'requests' },
    // Historiales de cambios (de clientes y también de la configuración, a petición de Daniel)
    data_table_changes: { action: WIPE, group: 'history' },
    business_sector_changes: { action: WIPE, group: 'history' },
    master_permission_change_log: { action: WIPE, group: 'history' },
    plan_changes: { action: WIPE, group: 'history' },
    saas_master_change_log: { action: WIPE, group: 'history' },
    saas_table_changes: { action: WIPE, group: 'history' },
    saas_user_changes: { action: WIPE, group: 'history' },

    // ---- Configuración: no se toca ----
    // Árbol Maestro (Estatus, orden, clasificación, colores, costos)
    master_cost_settings: { action: KEEP, group: 'masterTree' },
    master_permission_classification_colors: { action: KEEP, group: 'masterTree' },
    master_permission_classification_overrides: { action: KEEP, group: 'masterTree' },
    master_permission_cost: { action: KEEP, group: 'masterTree' },
    master_permission_order: { action: KEEP, group: 'masterTree' },
    master_permission_status: { action: KEEP, group: 'masterTree' },
    module_costs: { action: KEEP, group: 'masterTree' },
    saas_classification_colors: { action: KEEP, group: 'masterTree' },
    saas_classification_overrides: { action: KEEP, group: 'masterTree' },
    saas_master_order: { action: KEEP, group: 'masterTree' },
    saas_master_status: { action: KEEP, group: 'masterTree' },
    // Giros de negocio
    business_sector_types: { action: KEEP, group: 'giros' },
    business_sectors: { action: KEEP, group: 'giros' },
    sector_grants: { action: KEEP, group: 'giros' },
    sector_permission_cost_adjust: { action: KEEP, group: 'giros' },
    sector_permission_order: { action: KEEP, group: 'giros' },
    // Planes
    plans: { action: KEEP, group: 'plans' },
    plan_grants: { action: KEEP, group: 'plans' },
    plan_permission_cost_adjust: { action: KEEP, group: 'plans' },
    plan_permission_costs: { action: KEEP, group: 'plans' },
    // Equipo SaaS y lo suyo
    saas_user_grants: { action: KEEP, group: 'saasTeam' },
    saas_personal_order: { action: KEEP, group: 'saasTeam' },
    saas_saved_layouts: { action: KEEP, group: 'saasTeam' },
    saas_saved_searches: { action: KEEP, group: 'saasTeam' },
    // Catálogos y APPs
    geo_countries: { action: KEEP, group: 'catalogs' },
    geo_states: { action: KEEP, group: 'catalogs' },
    geo_municipalities: { action: KEEP, group: 'catalogs' },
    geo_localities: { action: KEEP, group: 'catalogs' },
    geo_streets: { action: KEEP, group: 'catalogs' },
    saas_apps: { action: KEEP, group: 'catalogs' },
    saas_app_screens: { action: KEEP, group: 'catalogs' },
    saas_app_screen_fields: { action: KEEP, group: 'catalogs' },
    // Sistema (banderas de migraciones y estado)
    schema_migrations_data: { action: KEEP, group: 'system' },
    system_state: { action: KEEP, group: 'system' },
};

const GROUPS_TO_DELETE = ['clients', 'clientUsers', 'organization', 'captures', 'clientSettings', 'requests', 'history'];
const GROUPS_TO_KEEP = ['masterTree', 'giros', 'plans', 'saasTeam', 'catalogs', 'system'];
const MAX_BACKUP_AGE_MS = 60 * 60 * 1000;
const BACKUP_ID_PATTERN = /^sgn-respaldo-\d{8}-\d{6}$/;
// Los archivos de los clientes en el almacenamiento de objetos (R2): evidencias y material de apoyo.
const FILE_PREFIXES = ['evidence/', 'material-apoyo/'];

function pad(n) { return String(n).padStart(2, '0'); }
function stampFor(date) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function createSystemReset(db, dataDir) {
    const backupsDir = path.join(dataDir, 'backups');

    function tableNames() {
        return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
    }
    // Los nombres de tabla se interpolan en el SQL, pero solo si están en TABLES (o salen de la propia base): nunca vienen de una petición.
    function count(table, where) {
        return db.prepare(`SELECT COUNT(*) AS n FROM "${table}"${where ? ` WHERE ${where}` : ''}`).get().n;
    }
    function unclassified() {
        return tableNames().filter((name) => !TABLES[name]);
    }

    // Qué se borraría y qué se conservaría, por tabla, sin tocar nada.
    function preview() {
        const missing = unclassified();
        if (missing.length) return { ok: false, unclassified: missing, rows: [] };
        const rows = tableNames().map((table) => {
            const rule = TABLES[table];
            const total = count(table);
            const toDelete = rule.action === WIPE ? total : rule.action === PARTIAL ? count(table, rule.where) : 0;
            return { table, action: rule.action, group: rule.group, total, toDelete };
        });
        return { ok: true, unclassified: [], rows };
    }

    function readMeta(file) {
        try { return JSON.parse(fs.readFileSync(path.join(backupsDir, file), 'utf8')); } catch { return null; }
    }
    function listBackups() {
        if (!fs.existsSync(backupsDir)) return [];
        return fs.readdirSync(backupsDir)
            .filter((f) => f.endsWith('.json'))
            .map(readMeta)
            .filter((m) => m && m.id && fs.existsSync(path.join(backupsDir, m.file)))
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    function lastBackup() {
        return listBackups()[0] || null;
    }
    function backupFilePath(id) {
        if (!BACKUP_ID_PATTERN.test(String(id || ''))) return null;
        const file = path.join(backupsDir, `${id}.sqlite`);
        return fs.existsSync(file) ? file : null;
    }

    // Copia completa y consistente de la base (VACUUM INTO) que se revisa antes de darla por buena: se abre aparte, se le pasa el
    // integrity_check y se compara que tenga las mismas tablas que la base viva.
    function createBackup() {
        fs.mkdirSync(backupsDir, { recursive: true });
        const id = `sgn-respaldo-${stampFor(new Date())}`;
        const file = path.join(backupsDir, `${id}.sqlite`);
        if (fs.existsSync(file)) throw new Error('Ya hay un respaldo de este mismo segundo; intenta de nuevo.');
        db.prepare('VACUUM INTO ?').run(file);
        const copy = new Database(file, { readonly: true });
        let integrity;
        let tables;
        try {
            integrity = copy.prepare('PRAGMA integrity_check').get().integrity_check;
            tables = copy.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().n;
        } finally {
            copy.close();
        }
        const meta = {
            id,
            file: `${id}.sqlite`,
            size: fs.statSync(file).size,
            sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
            integrity,
            tables,
            createdAt: new Date().toISOString(),
            ok: integrity === 'ok' && tables === tableNames().length,
        };
        fs.writeFileSync(path.join(backupsDir, `${id}.json`), JSON.stringify(meta));
        return meta;
    }

    function backupIsFresh(meta, now = Date.now()) {
        return !!(meta && meta.ok && now - Date.parse(meta.createdAt) <= MAX_BACKUP_AGE_MS);
    }

    // El borrado. Exige un respaldo bueno y reciente y que todas las tablas estén clasificadas; corre en UNA transacción (si algo falla,
    // no se borra nada) con las llaves foráneas diferidas al final. Reinicia la numeración de las tablas que se vacían; la de `users` no
    // se toca a propósito, para que el id de un usuario borrado nunca se reutilice (una sesión vieja no debe coincidir con un usuario nuevo).
    function run() {
        const pv = preview();
        if (!pv.ok) {
            const err = new Error(`Hay tablas sin clasificar: ${pv.unclassified.join(', ')}`);
            err.code = 'unclassified-tables';
            throw err;
        }
        const backup = lastBackup();
        if (!backupIsFresh(backup)) {
            const err = new Error('Se necesita un respaldo de la última hora.');
            err.code = 'backup-required';
            throw err;
        }
        const deleted = {};
        db.transaction(() => {
            db.exec('PRAGMA defer_foreign_keys = ON');
            for (const row of pv.rows) {
                const rule = TABLES[row.table];
                if (rule.action === KEEP) continue;
                db.prepare(`DELETE FROM "${row.table}"${rule.action === PARTIAL ? ` WHERE ${rule.where}` : ''}`).run();
                if (row.table === 'users') continue;
                if (rule.action === WIPE) {
                    db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(row.table);
                } else {
                    const max = db.prepare(`SELECT COALESCE(MAX(id), 0) AS m FROM "${row.table}"`).get().m;
                    if (max > 0) db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(max, row.table);
                    else db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(row.table);
                }
            }
            // Comprobación final, dentro de la misma transacción (si algo no cuadra, se deshace todo): lo que se borra quedó en cero, lo parcial
            // perdió exactamente lo previsto y lo que se conserva sigue con las mismas filas (un borrado en cascada no debe llevarse nada de ahí).
            // Los conteos se toman de la vista previa, no de lo que reporta cada DELETE: borrar un cliente ya borra en cascada parte de sus datos.
            for (const row of pv.rows) {
                const expected = row.action === WIPE ? 0 : row.total - row.toDelete;
                const left = count(row.table);
                if (left !== expected) throw new Error(`El reinicio no cuadró en ${row.table} (quedaron ${left}, se esperaban ${expected}); se deshizo todo.`);
                if (row.action !== KEEP) deleted[row.table] = row.toDelete;
            }
        })();
        // Libera las páginas con datos viejos (contraseñas, correos...) para que no queden restos dentro del archivo.
        try { db.exec('VACUUM'); } catch { /* no es crítico: el borrado ya se confirmó */ }
        const totalRows = Object.values(deleted).reduce((a, b) => a + b, 0);
        return { deleted, totalRows, backup };
    }

    return { preview, createBackup, listBackups, lastBackup, backupFilePath, backupIsFresh, run };
}

module.exports = { createSystemReset, TABLES, GROUPS_TO_DELETE, GROUPS_TO_KEEP, MAX_BACKUP_AGE_MS, FILE_PREFIXES, BACKUP_ID_PATTERN };
