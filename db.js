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

    -- Costo $ de cada botón/módulo de MODULE_CATALOG — configurado en su
    -- propia pantalla (Costos de Módulos), usado para calcular "Pago por
    -- Anexos" en Nuestros Clientes (suma del costo de cada módulo que un
    -- cliente tiene como anexo, no como parte de su plan).
    CREATE TABLE IF NOT EXISTS module_costs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        module_key  TEXT NOT NULL UNIQUE,
        cost        REAL NOT NULL DEFAULT 0
    );

    -- Auditoría de "Cambios de Anexos": una fila por cada módulo que entra o
    -- sale de clients.extra_modules, la vez que se guarda el modal de Anexos
    -- (ver PUT /api/admin/clients/:id/addenda) — quién lo solicitó y cuándo
    -- se escribe a mano ahí mismo (no hay flujo de autoservicio del cliente
    -- todavía), changed_at se registra solo.
    CREATE TABLE IF NOT EXISTS anexo_changes (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id            INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        module_key           TEXT NOT NULL,
        action               TEXT NOT NULL,
        requested_by         TEXT NOT NULL DEFAULT '',
        requested_at         TEXT,
        changed_at           TEXT NOT NULL DEFAULT (datetime('now')),
        contracted_duration  TEXT NOT NULL DEFAULT ''
    );

    -- Registro Combustible (Operaciones > Transporte Volumen): one row per
    -- fuel ticket. Only record_date/eco_unit/driver/coordinator are required
    -- at creation ("+ Nuevo Registro"); everything else starts empty and is
    -- filled in later via inline edits in the table (PATCH). year/month/week/
    -- day are deliberately NOT stored — they're derived from record_date on
    -- the client, same as before this table existed.
    CREATE TABLE IF NOT EXISTS fuel_records (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        db_id               TEXT NOT NULL,
        record_number       INTEGER NOT NULL,
        record_date         TEXT NOT NULL,
        eco_unit            TEXT NOT NULL,
        plates              TEXT NOT NULL DEFAULT '',
        driver              TEXT NOT NULL,
        coordinator         TEXT NOT NULL,
        ticket_evidence     TEXT NOT NULL DEFAULT '',
        trip_km_before      REAL NOT NULL DEFAULT 0,
        trip_km_after       REAL NOT NULL DEFAULT 0,
        fuel_type           TEXT NOT NULL DEFAULT '',
        liters              REAL NOT NULL DEFAULT 0,
        subtotal            REAL NOT NULL DEFAULT 0,
        vat                 REAL NOT NULL DEFAULT 0,
        reason              TEXT NOT NULL DEFAULT '',
        transfer_service    TEXT NOT NULL DEFAULT '',
        internal_movement   TEXT NOT NULL DEFAULT '',
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Mi Recurso Humano (Operaciones > Recursos Humanos > Administración de
    -- Personal): one row per worker registration. Only full_name/position/
    -- start_date/department are required at creation; area/email/phone are
    -- filled in later via inline edits, status defaults to 'active'. Does
    -- NOT create an actual system user yet (see OpRRHHMiRecursoHumano.js).
    CREATE TABLE IF NOT EXISTS hr_workers (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        db_id          TEXT NOT NULL,
        record_number  INTEGER NOT NULL,
        full_name      TEXT NOT NULL,
        position       TEXT NOT NULL,
        start_date     TEXT NOT NULL,
        department     TEXT NOT NULL,
        area           TEXT NOT NULL DEFAULT '',
        email          TEXT NOT NULL DEFAULT '',
        phone          TEXT NOT NULL DEFAULT '',
        status         TEXT NOT NULL DEFAULT 'active',
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Historial de cambios ("control de cambios" icon on every .data-table):
    -- one row per created/updated/deleted record on any client-scoped
    -- business table. table_key matches that table's data-table-id.
    -- field_key is the FULL dotted i18n key (e.g. "main.colFuelPlates") so
    -- the frontend can call Dashboard.t(field_key) directly regardless of
    -- which i18n namespace that table uses — empty for create/delete rows.
    CREATE TABLE IF NOT EXISTS data_table_changes (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        table_key     TEXT NOT NULL,
        record_id     INTEGER NOT NULL,
        record_label  TEXT NOT NULL DEFAULT '',
        action        TEXT NOT NULL,
        field_key     TEXT NOT NULL DEFAULT '',
        old_value     TEXT NOT NULL DEFAULT '',
        new_value     TEXT NOT NULL DEFAULT '',
        changed_by    TEXT NOT NULL DEFAULT '',
        changed_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
`);

// A big, date-derived unique identifier shown as "No. Único de Big Date" on
// records like clients (and, going forward, other record types that want
// the same convention — traslados, etc.). Timestamp down to the millisecond
// plus a wrapping call counter, so even several calls inside the same
// millisecond (e.g. the backfill loop below) never collide. Stored as TEXT
// everywhere — 20 digits is past Number.MAX_SAFE_INTEGER.
let bigDateSequence = 0;
function generateBigDateId() {
    const now = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
        + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
    bigDateSequence = (bigDateSequence + 1) % 1000;
    return `${stamp}${pad(bigDateSequence, 3)}`;
}

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
// Self-service profile fields shown in the top-bar "Datos de Usuario" /
// "Datos Personales" panel — all optional (blank until someone fills them
// in), so a plain '' default reads as "not set" without needing NULL checks.
for (const col of ['nickname', 'business_email', 'phone', 'address', 'birth_date', 'id_number']) {
    if (!userColumns.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
}
// "Datos de Usuario del Negocio" panel — position and the assigned
// cost-center/areas/departments have no assignment UI yet (unlike Rol and
// Permisos below, which already come from the real profiles/grants
// tables), so these just start blank like the fields above.
for (const col of ['position', 'assigned_cost_center', 'assigned_areas', 'assigned_departments', 'hire_date', 'reports_to']) {
    if (!userColumns.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
}
// Default Departamento/Área/Centro de Costos the user wants pre-selected
// every time they log in (set from "Configuración de Botones" > Botón
// Departamento/Área/C. Costos) — server-side so it follows the account
// across devices, unlike the plain localStorage pick used while just
// browsing mid-session. default_cost_centers holds either '' (no default),
// 'all', or a JSON array of cost center ids.
for (const col of ['default_department', 'default_area', 'default_cost_centers']) {
    if (!userColumns.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
}
// System-wide UI scale ("aumentar/disminuir el tamaño de todo el sistema")
// — per ACCOUNT, not per browser/localStorage like lang/style/etc., so two
// different users sharing the same computer never affect each other's size.
// Stored as a 1-8 level index into UI_SCALE_LEVELS (Dashboard.js); 4 is the
// default (100%, labeled "Ideal" in the UI — today's normal look).
if (!userColumns.some((c) => c.name === 'ui_scale')) {
    db.exec('ALTER TABLE users ADD COLUMN ui_scale INTEGER NOT NULL DEFAULT 4');
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
// Anexos: per-client extras on top of whatever their plan already grants
// (e.g. plan gives 5 centros de costo, an anexo adds 2 more for THIS client
// only — the plan itself, and every other client on it, stays untouched).
// Kept separate from cost_centers_limit/client_modules (the actual applied
// state) so re-stamping a plan never wipes these out — see
// applyEffectiveEntitlements in server.js, which always merges plan + anexo.
if (!clientColumns.some((c) => c.name === 'extra_cost_centers')) {
    db.exec('ALTER TABLE clients ADD COLUMN extra_cost_centers INTEGER NOT NULL DEFAULT 0');
}
if (!clientColumns.some((c) => c.name === 'extra_modules')) {
    db.exec("ALTER TABLE clients ADD COLUMN extra_modules TEXT NOT NULL DEFAULT '[]'");
}
// "Nuestros Clientes" full commercial record: fiscal identity, contract
// dates/file, and pricing — on top of the operational fields above. rfc is
// the business key used to reject duplicate clients (see createClient); the
// rest are plain display/record-keeping fields, no other code depends on
// their values.
for (const col of ['rfc', 'company_nickname', 'company_abbreviation', 'owner_name', 'billing_email', 'big_date_number']) {
    if (!clientColumns.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE clients ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
}
for (const col of ['contract_start_date', 'contract_registered_date', 'contract_end_date']) {
    if (!clientColumns.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE clients ADD COLUMN ${col} TEXT`);
    }
}
if (!clientColumns.some((c) => c.name === 'contract_file_data_url')) {
    db.exec('ALTER TABLE clients ADD COLUMN contract_file_data_url TEXT');
}
if (!clientColumns.some((c) => c.name === 'contract_file_name')) {
    db.exec('ALTER TABLE clients ADD COLUMN contract_file_name TEXT');
}
for (const col of ['contracted_cost', 'monthly_payment']) {
    if (!clientColumns.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE clients ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`);
    }
}
// Existing clients (created before this migration) get backfilled with a
// generated id here instead of staying blank — every client should have
// one, not just ones created going forward. One at a time (not a single
// bulk UPDATE) so each row gets its OWN generated id instead of all of them
// sharing whatever a single call produced.
const clientsMissingBigDate = db.prepare("SELECT id FROM clients WHERE big_date_number = ''").all();
const backfillBigDate = db.prepare('UPDATE clients SET big_date_number = ? WHERE id = ?');
clientsMissingBigDate.forEach((row) => backfillBigDate.run(generateBigDateId(), row.id));
// Two clients could legitimately share an empty rfc (not yet on file), but
// never a real one — WHERE clause excludes '' so pre-migration rows with no
// RFC on record don't collide with each other.
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_rfc ON clients(rfc) WHERE rfc != ''");

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
    { key: 'certifications', labelKey: 'menu.certifications' },
    // Top-bar buttons — contracted at the client level same as departments;
    // a button only actually shows for a given user when it's BOTH
    // contracted here AND granted to them in Accesos y Permisos (see
    // btn-mensajes/btn-chatbot/etc. under "General" in menu.json).
    { key: 'btn-mensajes', labelKey: 'main.messages' },
    { key: 'btn-chatbot', labelKey: 'main.chatbot' },
    { key: 'btn-notificaciones', labelKey: 'main.notifications' },
    { key: 'btn-marcadores', labelKey: 'main.bookmarks' },
    { key: 'btn-configuracion', labelKey: 'main.settings' },
    { key: 'btn-datos-usuario', labelKey: 'main.userInfo' },
    { key: 'btn-datos-usuario-negocio', labelKey: 'main.businessProfile' },
    { key: 'btn-departamento', labelKey: 'sidebar.department' },
    { key: 'btn-area', labelKey: 'sidebar.area' },
    { key: 'btn-cc', labelKey: 'sidebar.costCenters' },
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

// TRIP KM (odómetro antes/después de carga) added after fuel_records already
// shipped once.
const fuelRecordColumns = db.prepare('PRAGMA table_info(fuel_records)').all();
if (!fuelRecordColumns.some((c) => c.name === 'trip_km_before')) {
    db.exec('ALTER TABLE fuel_records ADD COLUMN trip_km_before REAL NOT NULL DEFAULT 0');
}
if (!fuelRecordColumns.some((c) => c.name === 'trip_km_after')) {
    db.exec('ALTER TABLE fuel_records ADD COLUMN trip_km_after REAL NOT NULL DEFAULT 0');
}

// Tipo Combustible / Cant Litros added after fuel_records already shipped
// once. Costo x Litro is NOT stored — computed from subtotal/liters on the
// client, same as Total and Total TRIP KM.
if (!fuelRecordColumns.some((c) => c.name === 'fuel_type')) {
    db.exec("ALTER TABLE fuel_records ADD COLUMN fuel_type TEXT NOT NULL DEFAULT ''");
}
if (!fuelRecordColumns.some((c) => c.name === 'liters')) {
    db.exec('ALTER TABLE fuel_records ADD COLUMN liters REAL NOT NULL DEFAULT 0');
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

function createClient({
    companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette,
    mission, vision, coreValues, history,
    rfc, companyNickname, companyAbbreviation, ownerName, billingEmail,
    contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractFileName,
    contractedCost, monthlyPayment,
}) {
    const result = db
        .prepare(`
            INSERT INTO clients (
                company_name, contact_name, email, phone, plan, status, logo_data_url, primary_color, secondary_color, seed_color, color_palette,
                mission, vision, core_values, history,
                rfc, company_nickname, company_abbreviation, owner_name, billing_email, big_date_number,
                contract_start_date, contract_registered_date, contract_end_date, contract_file_data_url, contract_file_name,
                contracted_cost, monthly_payment
            )
            VALUES (
                @companyName, @contactName, @email, @phone, @plan, @status, @logoDataUrl, @primaryColor, @secondaryColor, @seedColor, @colorPalette,
                @mission, @vision, @coreValues, @history,
                @rfc, @companyNickname, @companyAbbreviation, @ownerName, @billingEmail, @bigDateNumber,
                @contractStartDate, @contractRegisteredDate, @contractEndDate, @contractFileDataUrl, @contractFileName,
                @contractedCost, @monthlyPayment
            )
        `)
        .run({
            companyName, contactName, email, phone: phone || '', plan: plan || '', status: status || 'prospecto',
            logoDataUrl: logoDataUrl || null, primaryColor: primaryColor || null, secondaryColor: secondaryColor || null,
            seedColor: seedColor || null, colorPalette: colorPalette ? JSON.stringify(colorPalette) : null,
            mission: mission || '', vision: vision || '', coreValues: coreValues || '', history: history || '',
            rfc: rfc || '', companyNickname: companyNickname || '', companyAbbreviation: companyAbbreviation || '',
            ownerName: ownerName || '', billingEmail: billingEmail || '', bigDateNumber: generateBigDateId(),
            contractStartDate: contractStartDate || null, contractRegisteredDate: contractRegisteredDate || null,
            contractEndDate: contractEndDate || null, contractFileDataUrl: contractFileDataUrl || null, contractFileName: contractFileName || null,
            contractedCost: contractedCost || 0, monthlyPayment: monthlyPayment || 0,
        });
    return getClientById(result.lastInsertRowid);
}

function updateClient(id, {
    companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette,
    mission, vision, coreValues, history,
    rfc, companyNickname, companyAbbreviation, ownerName, billingEmail,
    contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractFileName,
    contractedCost, monthlyPayment,
}) {
    db.prepare(`
        UPDATE clients
        SET company_name = @companyName, contact_name = @contactName, email = @email,
            phone = @phone, plan = @plan, status = @status,
            logo_data_url = @logoDataUrl, primary_color = @primaryColor, secondary_color = @secondaryColor,
            seed_color = @seedColor, color_palette = @colorPalette,
            mission = @mission, vision = @vision, core_values = @coreValues, history = @history,
            rfc = @rfc, company_nickname = @companyNickname, company_abbreviation = @companyAbbreviation,
            owner_name = @ownerName, billing_email = @billingEmail,
            contract_start_date = @contractStartDate, contract_registered_date = @contractRegisteredDate,
            contract_end_date = @contractEndDate, contract_file_data_url = @contractFileDataUrl, contract_file_name = @contractFileName,
            contracted_cost = @contractedCost, monthly_payment = @monthlyPayment
        WHERE id = @id
    `).run({
        id, companyName, contactName, email, phone: phone || '', plan: plan || '', status,
        logoDataUrl: logoDataUrl || null, primaryColor: primaryColor || null, secondaryColor: secondaryColor || null,
        seedColor: seedColor || null, colorPalette: colorPalette ? JSON.stringify(colorPalette) : null,
        mission: mission || '', vision: vision || '', coreValues: coreValues || '', history: history || '',
        rfc: rfc || '', companyNickname: companyNickname || '', companyAbbreviation: companyAbbreviation || '',
        ownerName: ownerName || '', billingEmail: billingEmail || '',
        contractStartDate: contractStartDate || null, contractRegisteredDate: contractRegisteredDate || null,
        contractEndDate: contractEndDate || null, contractFileDataUrl: contractFileDataUrl || null, contractFileName: contractFileName || null,
        contractedCost: contractedCost || 0, monthlyPayment: monthlyPayment || 0,
    });
    return getClientById(id);
}

// --- RFC duplicate check ------------------------------------------------------
// Business key for "no duplicate clients" — see POST /api/admin/clients.
// excludeId lets an update check against every OTHER client (a client
// keeping its own RFC on save isn't a duplicate of itself).
function findClientByRfc(rfc, excludeId) {
    if (!rfc) return null;
    return db
        .prepare('SELECT id, company_name FROM clients WHERE rfc = ? AND id != ?')
        .get(rfc, excludeId || 0);
}

// --- Costo por módulo (Costos de Módulos) -------------------------------------
function getModuleCosts() {
    return db.prepare('SELECT module_key, cost FROM module_costs').all();
}

const upsertModuleCost = db.prepare(`
    INSERT INTO module_costs (module_key, cost) VALUES (@moduleKey, @cost)
    ON CONFLICT(module_key) DO UPDATE SET cost = @cost
`);

function setModuleCosts(costStates) {
    const apply = db.transaction((states) => {
        for (const { key, cost } of states) {
            upsertModuleCost.run({ moduleKey: key, cost: Math.max(0, Number(cost) || 0) });
        }
    });
    apply(costStates);
    return getModuleCosts();
}

// Sum of module_costs.cost for every key in this client's extra_modules
// (anexos) — what the plan itself includes is never charged again here.
function getAnexosPaymentTotal(clientId) {
    const client = getClientById(clientId);
    if (!client) return 0;
    let extraModules = [];
    try { extraModules = JSON.parse(client.extra_modules || '[]'); } catch { extraModules = []; }
    if (!extraModules.length) return 0;
    const costs = getModuleCosts();
    const costByKey = new Map(costs.map((c) => [c.module_key, c.cost]));
    return extraModules.reduce((sum, key) => sum + (costByKey.get(key) || 0), 0);
}

// --- Cambios de Anexos (audit trail) ------------------------------------------
function getAnexoChanges(clientId) {
    return db
        .prepare('SELECT * FROM anexo_changes WHERE client_id = ? ORDER BY changed_at DESC, id DESC')
        .all(clientId);
}

function recordAnexoChange(clientId, { moduleKey, action, requestedBy, requestedAt, contractedDuration }) {
    db.prepare(`
        INSERT INTO anexo_changes (client_id, module_key, action, requested_by, requested_at, contracted_duration)
        VALUES (@clientId, @moduleKey, @action, @requestedBy, @requestedAt, @contractedDuration)
    `).run({
        clientId, moduleKey, action,
        requestedBy: requestedBy || '', requestedAt: requestedAt || null, contractedDuration: contractedDuration || '',
    });
}

// --- Historial de cambios (generic "control de cambios" icon on every ------
// --- .data-table — see renderDataTableColumnControls in Dashboard.js) -------
// table_key matches that table's data-table-id. field_key is the FULL
// dotted i18n key (e.g. "main.colFuelPlates") so the frontend can call
// Dashboard.t(field_key) directly no matter which i18n namespace that table
// uses — left empty for create/delete rows, which have no single field.
function getTableChanges(clientId, tableKey) {
    return db
        .prepare('SELECT * FROM data_table_changes WHERE client_id = ? AND table_key = ? ORDER BY changed_at DESC, id DESC')
        .all(clientId, tableKey);
}

function logTableChange({ clientId, tableKey, recordId, recordLabel, action, fieldKey, oldValue, newValue, changedBy }) {
    db.prepare(`
        INSERT INTO data_table_changes (client_id, table_key, record_id, record_label, action, field_key, old_value, new_value, changed_by)
        VALUES (@clientId, @tableKey, @recordId, @recordLabel, @action, @fieldKey, @oldValue, @newValue, @changedBy)
    `).run({
        clientId, tableKey, recordId, recordLabel: recordLabel || '', action,
        fieldKey: fieldKey || '',
        oldValue: oldValue == null ? '' : String(oldValue),
        newValue: newValue == null ? '' : String(newValue),
        changedBy: changedBy || '',
    });
}

// "Modificar columna guardada" permission — each editable pantalla is a
// real node in the SAME menu tree PermissionTree.js already renders (see
// public/data/menu.json — the pantalla's own entry now carries a `submenu`
// of its columns), so a column's grant is just that pantalla's normal
// {sectionId, itemId, submenuId} leaf, one level deeper, with NO new
// sectionId namespace and no schema change. TABLE_GRANT_PATHS mirrors each
// table's actual position in menu.json — kept in sync by hand (a future
// table just needs its own entry here, matching wherever its pantalla
// already lives in the tree).
// colKey is fieldKey's last segment (e.g. "main.colFuelPlates" ->
// "colFuelPlates") — reused from FUEL_PATCHABLE_FIELDS/
// HR_WORKER_PATCHABLE_FIELDS/COST_CENTER_FIELDS, and must match the `id` of
// that pantalla's column entries in menu.json exactly.
const TABLE_GRANT_PATHS = {
    'centros-costo': { sectionId: 'main', itemId: 'btn-configuracion', submenuPrefix: 'btn-admin-negocio/ab-contracted-service' },
    'registro-combustible': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-operaciones/cat-operaciones-transporte-vol-combustible' },
    'mi-recurso-humano': { sectionId: 'human-resources', itemId: 'hr-area-personnel-admin', submenuPrefix: 'cat-operaciones/cat-operaciones-rrhh-mi-recurso-humano' },
};

function hasColumnEditGrant(grants, tableKey, colKey) {
    const path = TABLE_GRANT_PATHS[tableKey];
    if (!path) return false;
    const submenuId = `${path.submenuPrefix}/${colKey}`;
    return grants.some((g) => g.sectionId === path.sectionId && g.itemId === path.itemId && g.submenuId === submenuId);
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

// --- Anexos: per-client extras on top of their plan --------------------------
function getClientAddenda(clientId) {
    const row = db.prepare('SELECT extra_cost_centers, extra_modules FROM clients WHERE id = ?').get(clientId);
    if (!row) return null;
    let extraModules = [];
    try { extraModules = JSON.parse(row.extra_modules) || []; } catch { extraModules = []; }
    return { extraCostCenters: row.extra_cost_centers, extraModules };
}

function setClientAddenda(clientId, { extraCostCenters, extraModules }) {
    db.prepare('UPDATE clients SET extra_cost_centers = @extraCostCenters, extra_modules = @extraModules WHERE id = @id')
        .run({
            id: clientId,
            extraCostCenters: extraCostCenters || 0,
            extraModules: JSON.stringify(extraModules || []),
        });
    return getClientAddenda(clientId);
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

// Used only for change-history diffing (see logFieldChanges) — updateCostCenter
// itself always overwrites all 4 columns, same as before this map existed.
const COST_CENTER_FIELDS = {
    code: { column: 'code', fieldKey: 'business.ccCode' },
    name: { column: 'name', fieldKey: 'business.ccName' },
    responsible: { column: 'responsible', fieldKey: 'business.ccResponsible' },
    description: { column: 'description', fieldKey: 'business.ccDescription' },
};

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

// --- Query helpers: Registro Combustible (fuel_records, scoped to a client) -
function listFuelRecords(clientId) {
    return db.prepare('SELECT * FROM fuel_records WHERE client_id = ? ORDER BY record_number ASC').all(clientId);
}

function getFuelRecordById(id, clientId) {
    return db.prepare('SELECT * FROM fuel_records WHERE id = ? AND client_id = ?').get(id, clientId);
}

function createFuelRecord({ clientId, date, ecoUnit, driver, coordinator }) {
    const recordNumber = db
        .prepare('SELECT COALESCE(MAX(record_number), 0) + 1 AS n FROM fuel_records WHERE client_id = ?')
        .get(clientId).n;
    const result = db
        .prepare(`
            INSERT INTO fuel_records (client_id, db_id, record_number, record_date, eco_unit, driver, coordinator)
            VALUES (@clientId, @dbId, @recordNumber, @date, @ecoUnit, @driver, @coordinator)
        `)
        .run({ clientId, dbId: generateBigDateId(), recordNumber, date, ecoUnit, driver, coordinator });
    return getFuelRecordById(result.lastInsertRowid, clientId);
}

// Whitelist of columns a PATCH may touch — everything filled in later via
// inline edit in the table. code/eco_unit/driver/coordinator/record_date are
// set once at creation and never patched. fieldKey is the dotted i18n key
// used for change-history labels (see logFieldChanges).
const FUEL_PATCHABLE_FIELDS = {
    plates: { column: 'plates', fieldKey: 'main.colFuelPlates' },
    ticketEvidence: { column: 'ticket_evidence', fieldKey: 'main.colFuelTicketEvidence' },
    tripKmBefore: { column: 'trip_km_before', fieldKey: 'main.colFuelTripKmBefore' },
    tripKmAfter: { column: 'trip_km_after', fieldKey: 'main.colFuelTripKmAfter' },
    fuelType: { column: 'fuel_type', fieldKey: 'main.colFuelType' },
    liters: { column: 'liters', fieldKey: 'main.colFuelLiters' },
    subtotal: { column: 'subtotal', fieldKey: 'main.colFuelSubtotal' },
    vat: { column: 'vat', fieldKey: 'main.colFuelVat' },
    reason: { column: 'reason', fieldKey: 'main.colFuelReason' },
    transferService: { column: 'transfer_service', fieldKey: 'main.colFuelTransferService' },
    internalMovement: { column: 'internal_movement', fieldKey: 'main.colFuelInternalMovement' },
};

function updateFuelRecord(id, clientId, patch) {
    const sets = [];
    const params = { id, clientId };
    for (const [key, { column }] of Object.entries(FUEL_PATCHABLE_FIELDS)) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            sets.push(`${column} = @${key}`);
            params[key] = patch[key];
        }
    }
    if (sets.length) {
        db.prepare(`UPDATE fuel_records SET ${sets.join(', ')} WHERE id = @id AND client_id = @clientId`).run(params);
    }
    return getFuelRecordById(id, clientId);
}

function deleteFuelRecord(id, clientId) {
    db.prepare('DELETE FROM fuel_records WHERE id = ? AND client_id = ?').run(id, clientId);
}

// --- Query helpers: Mi Recurso Humano (hr_workers, scoped to a client) ------
function listHrWorkers(clientId) {
    return db.prepare('SELECT * FROM hr_workers WHERE client_id = ? ORDER BY record_number ASC').all(clientId);
}

function getHrWorkerById(id, clientId) {
    return db.prepare('SELECT * FROM hr_workers WHERE id = ? AND client_id = ?').get(id, clientId);
}

function createHrWorker({ clientId, fullName, position, startDate, department }) {
    const recordNumber = db
        .prepare('SELECT COALESCE(MAX(record_number), 0) + 1 AS n FROM hr_workers WHERE client_id = ?')
        .get(clientId).n;
    const result = db
        .prepare(`
            INSERT INTO hr_workers (client_id, db_id, record_number, full_name, position, start_date, department)
            VALUES (@clientId, @dbId, @recordNumber, @fullName, @position, @startDate, @department)
        `)
        .run({ clientId, dbId: generateBigDateId(), recordNumber, fullName, position, startDate, department });
    return getHrWorkerById(result.lastInsertRowid, clientId);
}

const HR_WORKER_PATCHABLE_FIELDS = {
    area: { column: 'area', fieldKey: 'main.colHrArea' },
    email: { column: 'email', fieldKey: 'main.colHrEmail' },
    phone: { column: 'phone', fieldKey: 'main.colHrPhone' },
    status: { column: 'status', fieldKey: 'main.colHrStatus' },
};

function updateHrWorker(id, clientId, patch) {
    const sets = [];
    const params = { id, clientId };
    for (const [key, { column }] of Object.entries(HR_WORKER_PATCHABLE_FIELDS)) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            sets.push(`${column} = @${key}`);
            params[key] = patch[key];
        }
    }
    if (sets.length) {
        db.prepare(`UPDATE hr_workers SET ${sets.join(', ')} WHERE id = @id AND client_id = @clientId`).run(params);
    }
    return getHrWorkerById(id, clientId);
}

function deleteHrWorker(id, clientId) {
    db.prepare('DELETE FROM hr_workers WHERE id = ? AND client_id = ?').run(id, clientId);
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
// Excludes the auto-provisioned client admin (is_client_admin) — that one
// user isn't part of the client's own team management; their access is
// contracted-by-default and only editable from GEIPSA's Admin-SaaS (see
// /api/admin/clients/:id/admin-access in server.js).
function listBusinessUsers(clientId) {
    return db
        .prepare(`
            SELECT id, username, email, name, role, active, is_client_admin, created_at
            FROM users WHERE client_id = ? AND is_client_admin = 0 ORDER BY created_at DESC
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

// Unscoped by client_id on purpose — this is always called with the caller's
// own id straight from their verified session token (see GET /api/me/profile
// in server.js), never an id supplied by the client, so there's no
// cross-tenant lookup to guard against.
function getUserProfileById(id) {
    return db
        .prepare(`
            SELECT id, username, email, name, nickname, business_email, phone, address, birth_date, id_number
            FROM users WHERE id = ?
        `)
        .get(id);
}

// Backs the top-bar "Datos de Usuario del Negocio" panel — Rol and Permisos
// come from the real profiles/grants tables (getUserProfiles/getUserGrants,
// defined further down); business_email/phone are the same columns already
// shown in "Datos de Usuario" (reused here, not duplicated data); position,
// assigned cost-center/areas/departments, hire_date and reports_to are
// plain columns with no assignment UI yet (see the migration above), same
// "blank until someone fills it in" idea.
function getUserBusinessProfileById(id) {
    const user = db
        .prepare(`
            SELECT id, position, assigned_cost_center, assigned_areas, assigned_departments,
                   business_email, phone, hire_date, reports_to
            FROM users WHERE id = ?
        `)
        .get(id);
    if (!user) return null;
    const effectiveGrants = getUserEffectiveGrants(id);
    return {
        ...user,
        profileNames: getUserProfiles(id).map((p) => p.name),
        effectiveGrants,
        grantsCount: effectiveGrants.length,
    };
}

// Default Departamento/Área/Centro de Costos applied right after login (see
// "applyLoginDefaults" in Dashboard.js) — distinct from whatever's just
// sitting in localStorage from browsing mid-session. costCenters is 'all'
// when unset/explicitly "todos", otherwise an array of cost center ids.
function getUserDefaults(userId) {
    const row = db
        .prepare('SELECT default_department, default_area, default_cost_centers FROM users WHERE id = ?')
        .get(userId);
    if (!row) return null;
    let costCenters = 'all';
    if (row.default_cost_centers && row.default_cost_centers !== 'all') {
        try {
            const parsed = JSON.parse(row.default_cost_centers);
            if (Array.isArray(parsed)) costCenters = parsed;
        } catch { /* fall through to 'all' */ }
    }
    return {
        department: row.default_department || null,
        area: row.default_area || null,
        costCenters,
    };
}

// Partial update — a field left undefined keeps its current stored value
// instead of being wiped, so setting a default Departamento doesn't also
// blank out an unrelated default Centro de Costos in the same call.
function setUserDefaults(userId, { department, area, costCenters }) {
    const current = getUserDefaults(userId) || { department: null, area: null, costCenters: 'all' };
    const next = {
        department: department !== undefined ? department : current.department,
        area: area !== undefined ? area : current.area,
        costCenters: costCenters !== undefined ? costCenters : current.costCenters,
    };
    db.prepare(`
        UPDATE users SET default_department = @department, default_area = @area, default_cost_centers = @costCenters
        WHERE id = @userId
    `).run({
        userId,
        department: next.department || '',
        area: next.area || '',
        costCenters: !next.costCenters || next.costCenters === 'all' ? 'all' : JSON.stringify(next.costCenters),
    });
    return getUserDefaults(userId);
}

// System-wide UI scale, per account (see the ui_scale migration above for
// why this isn't just another localStorage key like lang/style).
function getUserUiScale(userId) {
    const row = db.prepare('SELECT ui_scale FROM users WHERE id = ?').get(userId);
    return row ? row.ui_scale : 4;
}

function setUserUiScale(userId, level) {
    db.prepare('UPDATE users SET ui_scale = ? WHERE id = ?').run(level, userId);
    return getUserUiScale(userId);
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

// Union of what every profile assigned to this user grants (via
// getUserProfiles) plus their own extra grants (getUserGrants) — the full
// "everything this user can actually see" set shown by the "Permisos" field
// in Datos de Usuario del Negocio, deduplicated by section/item/submenu.
function getUserEffectiveGrants(userId) {
    const profileGrants = db
        .prepare(`
            SELECT DISTINCT pg.section_id AS sectionId, pg.item_id AS itemId, pg.submenu_id AS submenuId
            FROM profile_grants pg
            JOIN user_profiles up ON up.profile_id = pg.profile_id
            WHERE up.user_id = ?
        `)
        .all(userId);
    const seen = new Set();
    const combined = [];
    for (const g of [...profileGrants, ...getUserGrants(userId)]) {
        const key = `${g.sectionId}::${g.itemId || ''}::${g.submenuId || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        combined.push(g);
    }
    return combined;
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
    findClientByRfc,
    getModuleCosts,
    setModuleCosts,
    getAnexosPaymentTotal,
    getAnexoChanges,
    recordAnexoChange,
    getTableChanges,
    logTableChange,
    hasColumnEditGrant,
    COST_CENTER_FIELDS,
    FUEL_PATCHABLE_FIELDS,
    HR_WORKER_PATCHABLE_FIELDS,
    getClientModules,
    setClientModules,
    setClientCostCentersLimit,
    getClientAddenda,
    setClientAddenda,
    getClientModuleKeys,
    listCostCenters,
    countCostCenters,
    getCostCenterById,
    createCostCenter,
    updateCostCenter,
    deleteCostCenter,
    listFuelRecords,
    getFuelRecordById,
    createFuelRecord,
    updateFuelRecord,
    deleteFuelRecord,
    listHrWorkers,
    getHrWorkerById,
    createHrWorker,
    updateHrWorker,
    deleteHrWorker,
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
    getUserProfileById,
    getUserBusinessProfileById,
    getUserEffectiveGrants,
    getUserDefaults,
    setUserDefaults,
    getUserUiScale,
    setUserUiScale,
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
