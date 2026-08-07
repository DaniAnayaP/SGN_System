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

// --- Schema migrations for columns added after the initial release ----------
// Run in dependency order: `clients` must exist before `users.client_id` and
// `profiles.client_id` reference it; `users` must exist before
// `clients.admin_user_id` references it.
const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some((c) => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}
if (!userColumns.some((c) => c.name === 'client_id')) {
    db.exec('ALTER TABLE users ADD COLUMN client_id INTEGER REFERENCES clients(id)');
}
if (!userColumns.some((c) => c.name === 'active')) {
    db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
}
if (!userColumns.some((c) => c.name === 'is_client_admin')) {
    db.exec('ALTER TABLE users ADD COLUMN is_client_admin INTEGER NOT NULL DEFAULT 0');
}

const clientColumns = db.prepare('PRAGMA table_info(clients)').all();
if (!clientColumns.some((c) => c.name === 'admin_user_id')) {
    db.exec('ALTER TABLE clients ADD COLUMN admin_user_id INTEGER REFERENCES users(id)');
}

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

// --- Business admin: profiles and permission grants --------------------------
// "Administración del Negocio" — this is the CLIENT COMPANY's own admin
// tooling (distinct from the GEIPSA SaaS admin panel above). A "profile"
// (perfil) is a reusable bundle of access to modules/apartados/pantallas —
// the same three levels as public/data/menu.json (section > item > submenu
// entry). Users can hold one or more profiles, plus individual grants on top
// of whatever their profile(s) already give them.
//
// Access note: every profile/user/grant here is scoped to a client_id — see
// requireClientAdmin in server.js. Only that client's own admin_user (the
// auto-provisioned "Admin+ABBR" account, see activateClient below) can manage
// them, and every query is filtered by their client_id.
db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profile_grants (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        section_id  TEXT NOT NULL,
        item_id     TEXT,
        submenu_id  TEXT
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS user_grants (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        section_id  TEXT NOT NULL,
        item_id     TEXT,
        submenu_id  TEXT
    );
`);

// profiles.client_id was added after profiles already shipped once — add it
// to pre-existing databases (nullable there; any pre-migration profile rows
// become orphaned/inaccessible via the client-scoped queries below, which is
// fine, they were test data from before multi-tenant scoping existed).
const profileColumns = db.prepare('PRAGMA table_info(profiles)').all();
if (!profileColumns.some((c) => c.name === 'client_id')) {
    db.exec('ALTER TABLE profiles ADD COLUMN client_id INTEGER REFERENCES clients(id)');
}

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

function createUser({ username, email, passwordHash, name, clientId = null, isClientAdmin = false }) {
    const result = db
        .prepare(`
            INSERT INTO users (username, email, password_hash, name, client_id, is_client_admin)
            VALUES (@username, @email, @passwordHash, @name, @clientId, @isClientAdmin)
        `)
        .run({ username, email, passwordHash, name, clientId, isClientAdmin: isClientAdmin ? 1 : 0 });
    return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

function promoteToAdmin(username) {
    const result = db.prepare("UPDATE users SET role = 'admin' WHERE username = ?").run(username);
    return result.changes > 0;
}

// --- Client lifecycle: auto-provisioned "Admin+ABBR" user -------------------
// When a client is set to status 'activo', it gets exactly one admin user
// (username "Admin" + an abbreviation derived from the company name). That
// user — and only that user — can then manage the client's own
// users/profiles/access (see requireClientAdmin in server.js). Setting the
// client to any other status deactivates that admin and every user they (or
// anyone else at that client) created — nothing is deleted, just locked out.
function generateClientAbbreviation(companyName) {
    const firstWord = (companyName || '').trim().split(/\s+/)[0] || 'CLIENTE';
    const letters = firstWord.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return (letters || 'CLIENTE').slice(0, 10);
}

function generateUniqueUsername(baseUsername) {
    let candidate = baseUsername;
    let suffix = 2;
    while (findUserByUsername(candidate)) {
        candidate = `${baseUsername}${suffix}`;
        suffix += 1;
    }
    return candidate;
}

function generateRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
        pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    return pwd;
}

// Returns { user, generatedPassword } when a NEW admin was created (only
// happens the first time a client is activated), or { user, generatedPassword:
// null } when an existing admin (and their team) was just reactivated.
function activateClient(clientId) {
    const client = getClientById(clientId);
    if (!client) throw new Error('Client not found.');

    if (client.admin_user_id) {
        db.prepare('UPDATE users SET active = 1 WHERE client_id = ?').run(clientId);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(client.admin_user_id);
        return { user, generatedPassword: null };
    }

    const abbr = generateClientAbbreviation(client.company_name);
    const username = generateUniqueUsername(`Admin${abbr}`);
    const password = generateRandomPassword();
    const email = client.email || `${username.toLowerCase()}@example.invalid`;

    const create = db.transaction(() => {
        const user = createUser({
            username,
            email,
            passwordHash: hashPassword(password),
            name: `Admin ${client.company_name}`,
            clientId,
            isClientAdmin: true,
        });
        db.prepare('UPDATE clients SET admin_user_id = ? WHERE id = ?').run(user.id, clientId);
        return user;
    });
    const user = create();
    return { user, generatedPassword: password };
}

function deactivateClientUsers(clientId) {
    db.prepare('UPDATE users SET active = 0 WHERE client_id = ?').run(clientId);
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

// Deleting a client is different from deactivating one: deactivation keeps
// everything and just locks people out (see deactivateClientUsers); deleting
// the client record removes its users too (profiles/grants cascade off
// clients.id already) — there's no client left for them to belong to.
function deleteClient(id) {
    const cleanup = db.transaction(() => {
        db.prepare('DELETE FROM users WHERE client_id = ?').run(id);
        db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    });
    cleanup();
}

// --- Query helpers: client module entitlements ("Contrataciones") ------------
function getClientModules(clientId) {
    const rows = db
        .prepare('SELECT module_key, enabled FROM client_modules WHERE client_id = ?')
        .all(clientId);
    const enabledByKey = new Map(rows.map((r) => [r.module_key, !!r.enabled]));
    return MODULE_CATALOG.map((m) => ({ ...m, enabled: enabledByKey.get(m.key) || false }));
}

function getClientModuleKeys(clientId) {
    return getClientModules(clientId)
        .filter((m) => m.enabled)
        .map((m) => m.key);
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

// --- Query helpers: business users (scoped to one client) --------------------
function listBusinessUsers(clientId) {
    return db
        .prepare(`
            SELECT id, username, email, name, role, active, is_client_admin, created_at
            FROM users WHERE client_id = ? ORDER BY created_at DESC
        `)
        .all(clientId);
}

function getUserById(id, clientId) {
    return db
        .prepare(`
            SELECT id, username, email, name, role, active, is_client_admin, created_at
            FROM users WHERE id = ? AND client_id = ?
        `)
        .get(id, clientId);
}

// --- Query helpers: profiles (perfiles, scoped to one client) ----------------
function listProfiles(clientId) {
    return db.prepare('SELECT * FROM profiles WHERE client_id = ? ORDER BY created_at DESC').all(clientId);
}

function getProfileById(id, clientId) {
    return db.prepare('SELECT * FROM profiles WHERE id = ? AND client_id = ?').get(id, clientId);
}

function createProfile({ clientId, name, description }) {
    const result = db
        .prepare('INSERT INTO profiles (client_id, name, description) VALUES (@clientId, @name, @description)')
        .run({ clientId, name, description: description || '' });
    return getProfileById(result.lastInsertRowid, clientId);
}

function updateProfile(id, clientId, { name, description }) {
    db.prepare('UPDATE profiles SET name = @name, description = @description WHERE id = @id AND client_id = @clientId')
        .run({ id, clientId, name, description: description || '' });
    return getProfileById(id, clientId);
}

function deleteProfile(id, clientId) {
    db.prepare('DELETE FROM profiles WHERE id = ? AND client_id = ?').run(id, clientId);
}

// --- Query helpers: permission grants (módulo / apartado / pantalla) ---------
function getProfileGrants(profileId) {
    return db
        .prepare('SELECT section_id AS sectionId, item_id AS itemId, submenu_id AS submenuId FROM profile_grants WHERE profile_id = ?')
        .all(profileId);
}

function setProfileGrants(profileId, grants) {
    const replace = db.transaction((rows) => {
        db.prepare('DELETE FROM profile_grants WHERE profile_id = ?').run(profileId);
        const insert = db.prepare(`
            INSERT INTO profile_grants (profile_id, section_id, item_id, submenu_id)
            VALUES (@profileId, @sectionId, @itemId, @submenuId)
        `);
        for (const g of rows) {
            insert.run({ profileId, sectionId: g.sectionId, itemId: g.itemId || null, submenuId: g.submenuId || null });
        }
    });
    replace(grants);
    return getProfileGrants(profileId);
}

function getUserGrants(userId) {
    return db
        .prepare('SELECT section_id AS sectionId, item_id AS itemId, submenu_id AS submenuId FROM user_grants WHERE user_id = ?')
        .all(userId);
}

function setUserGrants(userId, grants) {
    const replace = db.transaction((rows) => {
        db.prepare('DELETE FROM user_grants WHERE user_id = ?').run(userId);
        const insert = db.prepare(`
            INSERT INTO user_grants (user_id, section_id, item_id, submenu_id)
            VALUES (@userId, @sectionId, @itemId, @submenuId)
        `);
        for (const g of rows) {
            insert.run({ userId, sectionId: g.sectionId, itemId: g.itemId || null, submenuId: g.submenuId || null });
        }
    });
    replace(grants);
    return getUserGrants(userId);
}

// --- Query helpers: user <-> profile assignment -------------------------------
function getUserProfiles(userId) {
    return db
        .prepare(`
            SELECT p.* FROM profiles p
            JOIN user_profiles up ON up.profile_id = p.id
            WHERE up.user_id = ?
            ORDER BY p.name
        `)
        .all(userId);
}

function setUserProfiles(userId, profileIds) {
    const replace = db.transaction((ids) => {
        db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(userId);
        const insert = db.prepare('INSERT INTO user_profiles (user_id, profile_id) VALUES (?, ?)');
        for (const profileId of ids) insert.run(userId, profileId);
    });
    replace(profileIds);
    return getUserProfiles(userId);
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
    getClientModuleKeys,
    activateClient,
    deactivateClientUsers,
    listBusinessUsers,
    getUserById,
    listProfiles,
    getProfileById,
    createProfile,
    updateProfile,
    deleteProfile,
    getProfileGrants,
    setProfileGrants,
    getUserGrants,
    setUserGrants,
    getUserProfiles,
    setUserProfiles,
};
