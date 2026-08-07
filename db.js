/**
 * SQLite persistence layer using better-sqlite3.
 *
 * The database lives OUTSIDE public/ on purpose — anything in public/ is
 * served directly to the browser by express.static, and the .sqlite file
 * must never be downloadable.
 *
 * Default location: ./storage/sgn.sqlite (created automatically).
 * On Railway (or any host with a persistent volume), set the DB_PATH env
 * var to the volume's mount path, e.g. DB_PATH=/data/sgn.sqlite, so the
 * database survives deploys and restarts.
 *
 * Multi-client note: if this backend will ever serve more than one client
 * company, add a `client_id` column to `users` (and any other table) and
 * scope every query below by it — right now this is single-tenant.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { hashPassword } = require('./password');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'storage', 'sgn.sqlite');
const DATA_DIR = path.dirname(DB_PATH);

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
console.log(`[db] Using SQLite database at: ${DB_PATH}`);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL UNIQUE,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name          TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
`);

// role was added after the initial release — add it to pre-existing
// databases instead of requiring a fresh one.
const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some((c) => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}

// --- SaaS admin: clients and their per-module entitlements ------------------
// "Contrataciones" = which SGN modules (matching the section ids in
// public/data/menu.json) are turned on for a given client, based on what
// they've contracted. MODULE_CATALOG is the fixed list of togglable modules.
db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name  TEXT NOT NULL,
        contact_name  TEXT NOT NULL,
        email         TEXT NOT NULL,
        phone         TEXT NOT NULL DEFAULT '',
        plan          TEXT NOT NULL DEFAULT '',
        status        TEXT NOT NULL DEFAULT 'prospecto',
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS client_modules (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        module_key  TEXT NOT NULL,
        enabled     INTEGER NOT NULL DEFAULT 0,
        UNIQUE(client_id, module_key)
    );
`);

const MODULE_CATALOG = [
    { key: 'steering-committee', labelKey: 'menu.steeringCommittee' },
    { key: 'general-management', labelKey: 'menu.generalManagement' },
    { key: 'management-control', labelKey: 'menu.managementControl' },
    { key: 'supply-chain', labelKey: 'menu.supplyChain' },
    { key: 'purchasing', labelKey: 'menu.purchasing' },
    { key: 'commercial', labelKey: 'menu.commercial' },
    { key: 'marketing', labelKey: 'menu.marketing' },
    { key: 'human-resources', labelKey: 'menu.humanResources' },
    { key: 'accounting', labelKey: 'menu.accounting' },
    { key: 'finance', labelKey: 'menu.finance' },
];

// --- One-time seed: create the demo admin/admin user if the table is empty.
// This only ever runs once — after that, the row lives in sgn.sqlite and
// survives server restarts. Delete the row (see README) once you're done
// testing, or before this touches anything real.
const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
if (userCount === 0) {
    db.prepare(`
        INSERT INTO users (username, email, password_hash, name, role)
        VALUES (@username, @email, @passwordHash, @name, @role)
    `).run({
        username: 'admin',
        email: 'admin@geipsa.com',
        passwordHash: hashPassword('admin'),
        name: 'Admin',
        role: 'admin',
    });
    console.log('[db] Seeded demo user admin/admin (first run only).');
}

// --- Query helpers: users -----------------------------------------------------
function findUserByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function usernameOrEmailExists(username, email) {
    return db
        .prepare('SELECT 1 FROM users WHERE username = ? OR email = ?')
        .get(username, email);
}

function createUser({ username, email, passwordHash, name }) {
    const result = db
        .prepare(`
            INSERT INTO users (username, email, password_hash, name)
            VALUES (@username, @email, @passwordHash, @name)
        `)
        .run({ username, email, passwordHash, name });
    return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

function promoteToAdmin(username) {
    const result = db.prepare("UPDATE users SET role = 'admin' WHERE username = ?").run(username);
    return result.changes > 0;
}

// --- Query helpers: clients (SaaS admin) --------------------------------------
function listClients() {
    return db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
}

function getClientById(id) {
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
}

function createClient({ companyName, contactName, email, phone, plan, status }) {
    const result = db
        .prepare(`
            INSERT INTO clients (company_name, contact_name, email, phone, plan, status)
            VALUES (@companyName, @contactName, @email, @phone, @plan, @status)
        `)
        .run({ companyName, contactName, email, phone: phone || '', plan: plan || '', status: status || 'prospecto' });
    return getClientById(result.lastInsertRowid);
}

function updateClient(id, { companyName, contactName, email, phone, plan, status }) {
    db.prepare(`
        UPDATE clients
        SET company_name = @companyName, contact_name = @contactName, email = @email,
            phone = @phone, plan = @plan, status = @status
        WHERE id = @id
    `).run({ id, companyName, contactName, email, phone: phone || '', plan: plan || '', status });
    return getClientById(id);
}

function deleteClient(id) {
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
}

// --- Query helpers: client module entitlements ("Contrataciones") ------------
function getClientModules(clientId) {
    const rows = db
        .prepare('SELECT module_key, enabled FROM client_modules WHERE client_id = ?')
        .all(clientId);
    const enabledByKey = new Map(rows.map((r) => [r.module_key, !!r.enabled]));
    return MODULE_CATALOG.map((m) => ({ ...m, enabled: enabledByKey.get(m.key) || false }));
}

const upsertClientModule = db.prepare(`
    INSERT INTO client_modules (client_id, module_key, enabled)
    VALUES (@clientId, @moduleKey, @enabled)
    ON CONFLICT(client_id, module_key) DO UPDATE SET enabled = @enabled
`);

function setClientModules(clientId, moduleStates) {
    const validKeys = new Set(MODULE_CATALOG.map((m) => m.key));
    const apply = db.transaction((states) => {
        for (const { key, enabled } of states) {
            if (!validKeys.has(key)) continue;
            upsertClientModule.run({ clientId, moduleKey: key, enabled: enabled ? 1 : 0 });
        }
    });
    apply(moduleStates);
    return getClientModules(clientId);
}

module.exports = {
    db,
    MODULE_CATALOG,
    findUserByUsername,
    usernameOrEmailExists,
    createUser,
    promoteToAdmin,
    listClients,
    getClientById,
    createClient,
    updateClient,
    deleteClient,
    getClientModules,
    setClientModules,
};
