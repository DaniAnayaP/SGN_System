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
const { hashPassword, hashPasswordSync } = require('./password');

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

    -- Centros de Costo: a client's own catalog of cost centers, capped by
    -- clients.cost_centers_limit (set by GEIPSA in Contrataciones). Created
    -- fresh with the FK already in place, so ON DELETE CASCADE works here
    -- (unlike profiles.client_id, added later via ALTER TABLE).
    CREATE TABLE IF NOT EXISTS cost_centers (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        code          TEXT NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT NOT NULL DEFAULT '',
        responsible   TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(client_id, code)
    );

    -- Planes y Paquetes: GEIPSA's own catalog of plan/package types, managed
    -- from Admin-Planes (SaaS admin only). clients.plan just stores the
    -- chosen plan's name as free text (like clients.status) rather than a
    -- foreign key, so renaming/deleting a plan here never breaks an existing
    -- client record.
    CREATE TABLE IF NOT EXISTS plans (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL UNIQUE,
        description   TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
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
// The demo admin/admin account (seeded below) may have been created before
// the ALTER TABLE above existed, in which case it got backfilled with the
// DEFAULT 'user' like every other pre-existing row — leaving the one account
// meant to be GEIPSA's own admin stuck without admin access. Fix it up once.
db.prepare("UPDATE users SET role = 'admin' WHERE username = 'admin' AND role != 'admin'").run();
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
// Branding: logo (stored as a data: URI — small enough not to need real file
// storage) and up to two institutional colors, shown in the client's own
// sidebar and used by the "Institucional" style option.
if (!clientColumns.some((c) => c.name === 'logo_data_url')) {
    db.exec('ALTER TABLE clients ADD COLUMN logo_data_url TEXT');
}
if (!clientColumns.some((c) => c.name === 'primary_color')) {
    db.exec('ALTER TABLE clients ADD COLUMN primary_color TEXT');
}
if (!clientColumns.some((c) => c.name === 'secondary_color')) {
    db.exec('ALTER TABLE clients ADD COLUMN secondary_color TEXT');
}
// Full institutional palette (bg/surface/border/text.../accent/tooltip...),
// generated from seed_color and then hand-tuned — see ColorPalette.js.
// primary_color/secondary_color above still work as a fallback for clients
// configured before this existed.
if (!clientColumns.some((c) => c.name === 'seed_color')) {
    db.exec('ALTER TABLE clients ADD COLUMN seed_color TEXT');
}
if (!clientColumns.some((c) => c.name === 'color_palette')) {
    db.exec('ALTER TABLE clients ADD COLUMN color_palette TEXT');
}
// How many Centros de Costo (cost centers) this client is allowed to create.
// Set from "Contrataciones" alongside the module toggles; enforced wherever
// the client-side cost-center feature eventually gets built.
if (!clientColumns.some((c) => c.name === 'cost_centers_limit')) {
    db.exec('ALTER TABLE clients ADD COLUMN cost_centers_limit INTEGER NOT NULL DEFAULT 0');
}
// Datos de Cliente: the client's core identity (misión, visión, valores,
// historia), set by GEIPSA at client creation/edit time (Clientes Nuevos)
// and shown read-only to the client's own team (Administración del Negocio)
// — so this doesn't get lost once Comercial/Marketing modules connect to it.
// `values` is a SQL keyword, so the column is `core_values` to keep every
// hand-written SQL string in this file unambiguous.
if (!clientColumns.some((c) => c.name === 'mission')) {
    db.exec("ALTER TABLE clients ADD COLUMN mission TEXT NOT NULL DEFAULT ''");
}
if (!clientColumns.some((c) => c.name === 'vision')) {
    db.exec("ALTER TABLE clients ADD COLUMN vision TEXT NOT NULL DEFAULT ''");
}
if (!clientColumns.some((c) => c.name === 'core_values')) {
    db.exec("ALTER TABLE clients ADD COLUMN core_values TEXT NOT NULL DEFAULT ''");
}
if (!clientColumns.some((c) => c.name === 'history')) {
    db.exec("ALTER TABLE clients ADD COLUMN history TEXT NOT NULL DEFAULT ''");
}

// A plan/package can carry a preset of módulos + centros de costo limit —
// the same options as Contrataciones — so assigning a plan to a client
// (Clientes Nuevos) can stamp its Contrataciones automatically instead of
// GEIPSA re-toggling everything by hand for every client on that plan.
const planColumns = db.prepare('PRAGMA table_info(plans)').all();
if (!planColumns.some((c) => c.name === 'modules')) {
    db.exec("ALTER TABLE plans ADD COLUMN modules TEXT NOT NULL DEFAULT '[]'");
}
if (!planColumns.some((c) => c.name === 'cost_centers_limit')) {
    db.exec('ALTER TABLE plans ADD COLUMN cost_centers_limit INTEGER NOT NULL DEFAULT 0');
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

// --- Indexes -------------------------------------------------------------
// Only for FK/lookup columns that actually appear in a WHERE clause below
// and aren't already covered by a UNIQUE constraint's implicit index (e.g.
// client_modules and cost_centers are both UNIQUE(client_id, ...), so a
// lookup by client_id alone already uses that index's leftmost column —
// no separate index needed there). Run after every table/column above
// exists, in dependency order.
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id);
    CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON profiles(client_id);
    CREATE INDEX IF NOT EXISTS idx_profile_grants_profile_id ON profile_grants(profile_id);
    CREATE INDEX IF NOT EXISTS idx_user_grants_user_id ON user_grants(user_id);
`);

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
        // hashPasswordSync, not hashPassword: this runs at module-load time
        // (CommonJS has no top-level await), before the server starts
        // accepting requests — see the comment on hashPasswordSync itself.
        passwordHash: hashPasswordSync('admin'),
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
//
// async: hashPassword is (scrypt is CPU-heavy, see password.js), and
// better-sqlite3 transactions must be fully synchronous — no await allowed
// inside db.transaction(). So the hash is computed BEFORE the transaction
// starts, and only the already-resolved string goes in.
async function activateClient(clientId) {
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
    const passwordHash = await hashPassword(password);

    const create = db.transaction(() => {
        const user = createUser({
            username,
            email,
            passwordHash,
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
// LEFT JOIN so the auto-provisioned admin's username (adminUsername) rides
// along wherever a client record is fetched — used by Clientes Nuevos to
// keep it visible after the one-time "generated credentials" banner is
// dismissed. The password itself is never stored in recoverable form, but
// the username isn't secret, so it's safe to surface here indefinitely.
function listClients() {
    return db
        .prepare(`
            SELECT clients.*, users.username AS adminUsername
            FROM clients LEFT JOIN users ON users.id = clients.admin_user_id
            ORDER BY clients.created_at DESC
        `)
        .all();
}

function getClientById(id) {
    return db
        .prepare(`
            SELECT clients.*, users.username AS adminUsername
            FROM clients LEFT JOIN users ON users.id = clients.admin_user_id
            WHERE clients.id = ?
        `)
        .get(id);
}

function getClientBranding(id) {
    const row = db
        .prepare(`
            SELECT company_name AS companyName, logo_data_url AS logoDataUrl,
                   primary_color AS primaryColor, secondary_color AS secondaryColor,
                   seed_color AS seedColor, color_palette AS colorPaletteRaw
            FROM clients WHERE id = ?
        `)
        .get(id);
    if (!row) return null;
    const { colorPaletteRaw, ...rest } = row;
    let colorPalette = null;
    if (colorPaletteRaw) {
        try { colorPalette = JSON.parse(colorPaletteRaw); } catch { colorPalette = null; }
    }
    return { ...rest, colorPalette };
}

function getClientProfile(id) {
    return db
        .prepare(`
            SELECT company_name AS companyName, mission, vision,
                   core_values AS coreValues, history
            FROM clients WHERE id = ?
        `)
        .get(id);
}

function createClient({ companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette, mission, vision, coreValues, history }) {
    const result = db
        .prepare(`
            INSERT INTO clients (company_name, contact_name, email, phone, plan, status, logo_data_url, primary_color, secondary_color, seed_color, color_palette, mission, vision, core_values, history)
            VALUES (@companyName, @contactName, @email, @phone, @plan, @status, @logoDataUrl, @primaryColor, @secondaryColor, @seedColor, @colorPalette, @mission, @vision, @coreValues, @history)
        `)
        .run({
            companyName, contactName, email, phone: phone || '', plan: plan || '', status: status || 'prospecto',
            logoDataUrl: logoDataUrl || null, primaryColor: primaryColor || null, secondaryColor: secondaryColor || null,
            seedColor: seedColor || null, colorPalette: colorPalette ? JSON.stringify(colorPalette) : null,
            mission: mission || '', vision: vision || '', coreValues: coreValues || '', history: history || '',
        });
    return getClientById(result.lastInsertRowid);
}

function updateClient(id, { companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette, mission, vision, coreValues, history }) {
    db.prepare(`
        UPDATE clients
        SET company_name = @companyName, contact_name = @contactName, email = @email,
            phone = @phone, plan = @plan, status = @status,
            logo_data_url = @logoDataUrl, primary_color = @primaryColor, secondary_color = @secondaryColor,
            seed_color = @seedColor, color_palette = @colorPalette,
            mission = @mission, vision = @vision, core_values = @coreValues, history = @history
        WHERE id = @id
    `).run({
        id, companyName, contactName, email, phone: phone || '', plan: plan || '', status,
        logoDataUrl: logoDataUrl || null, primaryColor: primaryColor || null, secondaryColor: secondaryColor || null,
        seedColor: seedColor || null, colorPalette: colorPalette ? JSON.stringify(colorPalette) : null,
        mission: mission || '', vision: vision || '', coreValues: coreValues || '', history: history || '',
    });
    return getClientById(id);
}

// Self-service version for the client's own admin (Business-Config page):
// only branding fields, never company_name/status/plan/etc.
function updateClientBranding(clientId, { logoDataUrl, seedColor, colorPalette }) {
    db.prepare(`
        UPDATE clients SET logo_data_url = @logoDataUrl, seed_color = @seedColor, color_palette = @colorPalette
        WHERE id = @id
    `).run({
        id: clientId, logoDataUrl: logoDataUrl || null,
        seedColor: seedColor || null, colorPalette: colorPalette ? JSON.stringify(colorPalette) : null,
    });
    return getClientBranding(clientId);
}

// Deleting a client is different from deactivating one: deactivation keeps
// everything and just locks people out (see deactivateClientUsers); deleting
// the client record removes its users and profiles too — there's no client
// left for them to belong to. Deleted explicitly rather than relying on
// ON DELETE CASCADE: profiles.client_id was added via ALTER TABLE on
// already-deployed databases, and SQLite can't attach a cascade action to a
// column after the fact, only on tables created fresh with it already there.
function deleteClient(id) {
    const cleanup = db.transaction(() => {
        // Must clear this first: clients.admin_user_id points at a user we're
        // about to delete, and that FK has no cascade action.
        db.prepare('UPDATE clients SET admin_user_id = NULL WHERE id = ?').run(id);
        db.prepare('DELETE FROM profiles WHERE client_id = ?').run(id);
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

function setClientCostCentersLimit(clientId, limit) {
    db.prepare('UPDATE clients SET cost_centers_limit = ? WHERE id = ?').run(limit, clientId);
    return getClientById(clientId).cost_centers_limit;
}

// --- Query helpers: cost centers (Centros de Costo, scoped to one client) ----
function listCostCenters(clientId) {
    return db.prepare('SELECT * FROM cost_centers WHERE client_id = ? ORDER BY code ASC').all(clientId);
}

function countCostCenters(clientId) {
    return db.prepare('SELECT COUNT(*) AS n FROM cost_centers WHERE client_id = ?').get(clientId).n;
}

function getCostCenterById(id, clientId) {
    return db.prepare('SELECT * FROM cost_centers WHERE id = ? AND client_id = ?').get(id, clientId);
}

function createCostCenter({ clientId, code, name, description, responsible }) {
    const result = db
        .prepare(`
            INSERT INTO cost_centers (client_id, code, name, description, responsible)
            VALUES (@clientId, @code, @name, @description, @responsible)
        `)
        .run({ clientId, code, name, description: description || '', responsible: responsible || '' });
    return getCostCenterById(result.lastInsertRowid, clientId);
}

function updateCostCenter(id, clientId, { code, name, description, responsible }) {
    db.prepare(`
        UPDATE cost_centers
        SET code = @code, name = @name, description = @description, responsible = @responsible
        WHERE id = @id AND client_id = @clientId
    `).run({ id, clientId, code, name, description: description || '', responsible: responsible || '' });
    return getCostCenterById(id, clientId);
}

function deleteCostCenter(id, clientId) {
    db.prepare('DELETE FROM cost_centers WHERE id = ? AND client_id = ?').run(id, clientId);
}

// --- Query helpers: plans (Planes y Paquetes, GEIPSA-wide, not per-client) ---
// modules is stored as a JSON array of MODULE_CATALOG keys; costCentersLimit
// mirrors clients.cost_centers_limit. Together they're the same shape
// Contrataciones edits per-client — see applyPlanToClient in server.js.
function deserializePlan(row) {
    if (!row) return row;
    const { modules, cost_centers_limit, ...rest } = row;
    let parsedModules = [];
    try { parsedModules = JSON.parse(modules) || []; } catch { parsedModules = []; }
    return { ...rest, modules: parsedModules, costCentersLimit: cost_centers_limit };
}

function listPlans() {
    return db.prepare('SELECT * FROM plans ORDER BY name ASC').all().map(deserializePlan);
}

function getPlanById(id) {
    return deserializePlan(db.prepare('SELECT * FROM plans WHERE id = ?').get(id));
}

function getPlanByName(name) {
    return deserializePlan(db.prepare('SELECT * FROM plans WHERE name = ?').get(name));
}

function createPlan({ name, description, modules, costCentersLimit }) {
    const result = db
        .prepare('INSERT INTO plans (name, description, modules, cost_centers_limit) VALUES (@name, @description, @modules, @costCentersLimit)')
        .run({
            name, description: description || '',
            modules: JSON.stringify(modules || []), costCentersLimit: costCentersLimit || 0,
        });
    return getPlanById(result.lastInsertRowid);
}

function updatePlan(id, { name, description, modules, costCentersLimit }) {
    db.prepare('UPDATE plans SET name = @name, description = @description, modules = @modules, cost_centers_limit = @costCentersLimit WHERE id = @id')
        .run({
            id, name, description: description || '',
            modules: JSON.stringify(modules || []), costCentersLimit: costCentersLimit || 0,
        });
    return getPlanById(id);
}

function deletePlan(id) {
    db.prepare('DELETE FROM plans WHERE id = ?').run(id);
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
    getClientBranding,
    getClientProfile,
    createClient,
    updateClient,
    updateClientBranding,
    deleteClient,
    getClientModules,
    setClientModules,
    setClientCostCentersLimit,
    getClientModuleKeys,
    listCostCenters,
    countCostCenters,
    getCostCenterById,
    createCostCenter,
    updateCostCenter,
    deleteCostCenter,
    listPlans,
    getPlanById,
    getPlanByName,
    createPlan,
    updatePlan,
    deletePlan,
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
