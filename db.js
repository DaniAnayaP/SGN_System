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

    -- Geographic catalog behind a Centro de Costos' código (País/Estado/
    -- Localidad/Calle, each first-letter contributing to the composed code —
    -- see computeCostCenterCodeBase below). Shared across every client on the
    -- SaaS rather than per-client: real-world geography is the same fact
    -- regardless of which client references it, so one client adding
    -- "Zapopan" under Jalisco makes it available to every other client too,
    -- instead of everyone re-typing the same catalog. Seeded once (see
    -- seedGeoCatalog below) with real países + México's own estados; every
    -- other level starts empty and grows only from admins clicking "+" in
    -- the Centro de Costos modal.
    CREATE TABLE IF NOT EXISTS geo_countries (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        name  TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS geo_states (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        country_id  INTEGER NOT NULL REFERENCES geo_countries(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        UNIQUE(country_id, name)
    );
    CREATE TABLE IF NOT EXISTS geo_localities (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        state_id  INTEGER NOT NULL REFERENCES geo_states(id) ON DELETE CASCADE,
        name      TEXT NOT NULL,
        UNIQUE(state_id, name)
    );
    CREATE TABLE IF NOT EXISTS geo_streets (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        locality_id  INTEGER NOT NULL REFERENCES geo_localities(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        UNIQUE(locality_id, name)
    );

    -- "Reglas de Orden de Llenado" -- a client admin can require one column
    -- ("gate") to have a value before another ("dependent") becomes
    -- editable, on any .data-table (see Dashboard.js's applyFieldFillRules).
    -- A dependent has at most one gate at a time (re-creating a rule for an
    -- already-gated dependent replaces it, see createFieldFillRule below),
    -- but the SAME gate can unlock any number of different dependents, and
    -- those dependents don't block each other -- only their own gate does.
    CREATE TABLE IF NOT EXISTS field_fill_rules (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        table_key      TEXT NOT NULL,
        gate_col       TEXT NOT NULL,
        dependent_col  TEXT NOT NULL,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(client_id, table_key, dependent_col)
    );

    -- Puestos de Trabajo (Administración de Personal, human-resources área):
    -- the client's own catalog of job titles, managed from
    -- Business-PuestosTrabajo.html. Mi Recurso Humano's Puesto field reads
    -- only the 'active' ones (see GET /api/business/job-positions) — a
    -- position can be retired without losing its label on already-created
    -- workers, same "deactivate, never delete the history" idea as
    -- clients.status.
    CREATE TABLE IF NOT EXISTS job_positions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        abbreviation  TEXT NOT NULL DEFAULT '',
        cost_center_id INTEGER REFERENCES cost_centers(id),
        status        TEXT NOT NULL DEFAULT 'active',
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(client_id, name)
    );

    -- Transacciones Inteligentes de Negocio: a client-defined report is just
    -- a name + an ordered list of columns, each either pulled straight from
    -- Base de Datos Global (type 'base') or computed from other columns
    -- already in the same report (type 'calculated', see
    -- intelligent_report_columns.formula_json below). Running the report to
    -- see real computed data is a future step -- this only stores the
    -- report's own definition.
    CREATE TABLE IF NOT EXISTS intelligent_reports (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        created_by    TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        authorized_by TEXT,
        authorized_at TEXT
    );
    -- source_table_key/col_key (base columns only) match the exact keys
    -- Base de Datos Global already renders with -- see
    -- BASE_DATOS_GLOBAL_COLUMNS in server.js, the shared source of truth for
    -- what "Columna Base de Registro" can offer. formula_json (calculated
    -- columns only) is a flat left-to-right "calculator tape": { operands:
    -- [{kind:'column', reportColumnId} | {kind:'constant', value}, ...],
    -- operators: [...] }, operands.length === operators.length + 1. A
    -- column operand references another row in this same table by id, so a
    -- calculated column can be built from another calculated column with no
    -- extra modeling.
    CREATE TABLE IF NOT EXISTS intelligent_report_columns (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id        INTEGER NOT NULL REFERENCES intelligent_reports(id) ON DELETE CASCADE,
        position         INTEGER NOT NULL,
        type             TEXT NOT NULL,
        source_table_key TEXT,
        col_key          TEXT,
        label            TEXT NOT NULL,
        formula_json     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_intelligent_report_columns_report_id ON intelligent_report_columns(report_id);

    -- Reportes Programados: a recurring "send this saved report to these
    -- recipients" definition -- doesn't send anything itself (no mailer/
    -- WhatsApp integration built yet), just records the schedule so the
    -- future sending job has something to read. delivery_method is one of
    -- 'email' | 'whatsapp' | 'internal_chat' (the last one has no actual
    -- delivery path yet either -- see ScheduledReportes.js's own note).
    -- end_date is optional (NULL = runs indefinitely).
    CREATE TABLE IF NOT EXISTS scheduled_reports (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        report_id       INTEGER NOT NULL REFERENCES intelligent_reports(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        created_by      TEXT NOT NULL,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        authorized_by   TEXT,
        authorized_at   TEXT,
        end_date        TEXT,
        delivery_method TEXT NOT NULL,
        recipients      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_reports_client_id ON scheduled_reports(client_id);

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

    -- Nuestras APPs: GEIPSA's catalog of end-user mobile app "kinds", one
    -- per business vertical (3PL, Restaurante, Control de Acceso...). Each
    -- app is filled in incrementally with its own operational screens
    -- (saas_app_screens) as that vertical's needs get built out — a plan
    -- then picks ONE of these (plans.app_id below) to decide what its
    -- clients' phones show. Nothing here defines the underlying data
    -- (that's still Registro Combustible/Control Interno/etc.) — this is
    -- purely which guided-screen experience wraps around it.
    CREATE TABLE IF NOT EXISTS saas_apps (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE,
        icon        TEXT NOT NULL DEFAULT 'bx-mobile-alt',
        color_from  TEXT NOT NULL DEFAULT '#6C7CF0',
        color_to    TEXT NOT NULL DEFAULT '#3A4BC9',
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS saas_app_screens (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id       INTEGER NOT NULL REFERENCES saas_apps(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        screen_type  TEXT NOT NULL DEFAULT 'guided',
        position     INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_saas_app_screens_app_id ON saas_app_screens(app_id);

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
        trip_km_before_evidence TEXT NOT NULL DEFAULT '',
        trip_km_after       REAL NOT NULL DEFAULT 0,
        trip_km_after_evidence  TEXT NOT NULL DEFAULT '',
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
        record_code    TEXT NOT NULL DEFAULT '',
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

    -- Catálogo Estatus RH (Administración de Personal > Catálogos): the
    -- client's own list of HR status options (Activo, De vacaciones,
    -- Rescisión de Contrato...). operational_effect is set per entry by
    -- whoever maintains the catalog ('active' | 'suspended' | 'inactive')
    -- so a brand-new status added later doesn't need any code change to be
    -- classified correctly — see computeOperationalStatus below for how
    -- this feeds hr_workers.hr_status_id into Estatus Operativo.
    CREATE TABLE IF NOT EXISTS hr_status_catalog (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id          INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name               TEXT NOT NULL,
        operational_effect TEXT NOT NULL DEFAULT 'suspended',
        status             TEXT NOT NULL DEFAULT 'active',
        created_at         TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(client_id, name)
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

    -- Flujo de aprobación real para cambios "Editar" sobre columnas ya
    -- guardadas (ver Autorizar en el árbol de permisos) — una fila por
    -- campo que queda pendiente hasta que alguien con Autorizar en esa
    -- columna lo aprueba o rechaza. column_key es la clave que la función
    -- update* de esa tabla espera en su patch (ej. "subtotal"); field_key
    -- es la clave i18n punteada completa (ej. "main.colFuelSubtotal"),
    -- usada tanto para mostrarlo como para derivar el colKey de
    -- canAuthorizeColumn (su último segmento) — son claves DISTINTAS a
    -- propósito, una identifica la columna de negocio, la otra el permiso.
    CREATE TABLE IF NOT EXISTS pending_changes (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id             INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        table_key             TEXT NOT NULL,
        record_id             INTEGER NOT NULL,
        record_label          TEXT NOT NULL DEFAULT '',
        field_key             TEXT NOT NULL,
        column_key            TEXT NOT NULL,
        old_value             TEXT NOT NULL DEFAULT '',
        new_value             TEXT NOT NULL,
        status                TEXT NOT NULL DEFAULT 'pending',
        requested_by          TEXT NOT NULL DEFAULT '',
        requested_by_user_id  INTEGER NOT NULL,
        requested_at          TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_by           TEXT,
        resolved_by_user_id   INTEGER,
        resolved_at           TEXT
    );

    -- Marca de migraciones de DATOS de una sola vez (a diferencia de las
    -- migraciones de ESQUEMA de más abajo, que se auto-verifican con PRAGMA
    -- table_info) — para operaciones tipo "sembrar Ver y Operar" que sólo
    -- deben correr una vez en la vida de la base, nunca reaplicarse (si se
    -- re-derivaran del estado actual, revocar un permiso a propósito más
    -- tarde se volvería a sembrar solo en el siguiente reinicio).
    CREATE TABLE IF NOT EXISTS schema_migrations_data (
        key         TEXT PRIMARY KEY,
        applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
// razon_social: net-new field, distinct from company_name (see Nuestros
// Clientes redesign) — company_name stays as-is, an internal form field
// with no table column of its own.
if (!clientColumns.some((c) => c.name === 'razon_social')) {
    db.exec("ALTER TABLE clients ADD COLUMN razon_social TEXT NOT NULL DEFAULT ''");
}
// Segundo documento de contrato (editable, Word) junto al PDF firmado ya
// existente — mismo par data-URL/filename, mismo patrón de subida/quitar.
if (!clientColumns.some((c) => c.name === 'contract_word_data_url')) {
    db.exec('ALTER TABLE clients ADD COLUMN contract_word_data_url TEXT');
}
if (!clientColumns.some((c) => c.name === 'contract_word_file_name')) {
    db.exec('ALTER TABLE clients ADD COLUMN contract_word_file_name TEXT');
}
if (!clientColumns.some((c) => c.name === 'initial_payment')) {
    db.exec('ALTER TABLE clients ADD COLUMN initial_payment REAL NOT NULL DEFAULT 0');
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

// # Registro Único (Contable): the client's own 6-digit accounting account
// number, global across the whole SaaS (client #1 ever created is 000001,
// and so on) — assigned once at creation and never reused, which is exactly
// why a client can only ever be Activado/Desactivado, never deleted (see the
// "no hard-delete" note above createClient). Existing rows (created before
// this migration) get backfilled here from their own id order, which is a
// safe proxy for creation order since ids are AUTOINCREMENT (never reused)
// and no client has ever actually been deletable.
if (!clientColumns.some((c) => c.name === 'account_number')) {
    db.exec('ALTER TABLE clients ADD COLUMN account_number INTEGER');
    db.exec(`
        UPDATE clients SET account_number = (
            SELECT COUNT(*) FROM clients c2 WHERE c2.id <= clients.id
        ) WHERE account_number IS NULL
    `);
}
// Sector de Negocio: replaces the old plans.app_id link (a Plan is no longer
// what decides a client's mobile-app experience). Free text matching
// saas_apps.sector, same "no FK" convention as clients.plan -- renaming or
// retiring an app here never breaks an existing client record. app_enabled
// is the independent on/off toggle in Nuestros Clientes' Acciones column
// (a client can have a sector assigned but still be switched off).
if (!clientColumns.some((c) => c.name === 'sector_negocio')) {
    db.exec("ALTER TABLE clients ADD COLUMN sector_negocio TEXT NOT NULL DEFAULT ''");
}
if (!clientColumns.some((c) => c.name === 'app_enabled')) {
    db.exec('ALTER TABLE clients ADD COLUMN app_enabled INTEGER NOT NULL DEFAULT 0');
}

const costCenterColumns = db.prepare('PRAGMA table_info(cost_centers)').all();
// Same "no hard-delete, only Activar/Desactivar" rule as clients, for the
// same reason (a Centro de Costos also gets its own 6-digit accounting
// account number, account_number below -- this time sequential PER CLIENT,
// each client's own cost centers starting at 000001 independently).
if (!costCenterColumns.some((c) => c.name === 'status')) {
    db.exec("ALTER TABLE cost_centers ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}
if (!costCenterColumns.some((c) => c.name === 'account_number')) {
    db.exec('ALTER TABLE cost_centers ADD COLUMN account_number INTEGER');
    db.exec(`
        UPDATE cost_centers SET account_number = (
            SELECT COUNT(*) FROM cost_centers c2
            WHERE c2.client_id = cost_centers.client_id AND c2.id <= cost_centers.id
        ) WHERE account_number IS NULL
    `);
}
// # Registro Único Base de Datos -- same composite-code idea as Mi Recurso
// Humano's own computeHrRecordCode (company abbreviation + this record's own
// code + a fixed 3-letter screen code + the consecutivo), frozen at creation
// like that one is, not recomputed on every render. Backfilled one row at a
// time (needs each row's own client lookup, not expressible as a single SQL
// UPDATE) for any cost center created before this migration.
if (!costCenterColumns.some((c) => c.name === 'record_code')) {
    db.exec("ALTER TABLE cost_centers ADD COLUMN record_code TEXT NOT NULL DEFAULT ''");
    const costCentersMissingRecordCode = db.prepare("SELECT id, client_id, code, account_number FROM cost_centers WHERE record_code = ''").all();
    const backfillCostCenterRecordCode = db.prepare('UPDATE cost_centers SET record_code = ? WHERE id = ?');
    costCentersMissingRecordCode.forEach((row) => {
        backfillCostCenterRecordCode.run(computeCostCenterRecordCode(row.client_id, row.code, row.account_number), row.id);
    });
}
// País/Estado/Localidad/Calle + Sucursal behind the new cascading código
// builder. A cost center created before this migration keeps its old
// free-typed code (these columns stay NULL/'' for it) until it's next
// edited, at which point the modal requires real selections and the code
// gets recomputed like any other record.
if (!costCenterColumns.some((c) => c.name === 'country_id')) {
    db.exec('ALTER TABLE cost_centers ADD COLUMN country_id INTEGER REFERENCES geo_countries(id)');
    db.exec('ALTER TABLE cost_centers ADD COLUMN state_id INTEGER REFERENCES geo_states(id)');
    db.exec('ALTER TABLE cost_centers ADD COLUMN locality_id INTEGER REFERENCES geo_localities(id)');
    db.exec('ALTER TABLE cost_centers ADD COLUMN street_id INTEGER REFERENCES geo_streets(id)');
    db.exec("ALTER TABLE cost_centers ADD COLUMN sucursal TEXT NOT NULL DEFAULT ''");
}

// Seed data for the geo catalog — a real, well-known list of países (not a
// live internet fetch: no outbound access from this server has been set up,
// and the world's country list is static enough to hardcode reliably) plus
// México's 32 estados, since GEIPSA and its first clients are Mexican and
// this is the catalog's most immediately useful depth. Every other
// país/estado, plus every localidad/calle, starts empty and grows only from
// an admin clicking "+" in the Centro de Costos modal — there's no
// realistic way to preload those exhaustively. Runs once, guarded by
// geo_countries already having rows.
if (db.prepare('SELECT COUNT(*) AS n FROM geo_countries').get().n === 0) {
    const GEO_COUNTRIES_SEED = [
        'Afganistán', 'Albania', 'Alemania', 'Andorra', 'Angola', 'Antigua y Barbuda', 'Arabia Saudita',
        'Argelia', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaiyán', 'Bahamas', 'Baréin',
        'Bangladés', 'Barbados', 'Bélgica', 'Belice', 'Benín', 'Bielorrusia', 'Birmania (Myanmar)',
        'Bolivia', 'Bosnia y Herzegovina', 'Botsuana', 'Brasil', 'Brunéi', 'Bulgaria', 'Burkina Faso',
        'Burundi', 'Bután', 'Cabo Verde', 'Camboya', 'Camerún', 'Canadá', 'Catar', 'Chad', 'Chile',
        'China', 'Chipre', 'Ciudad del Vaticano', 'Colombia', 'Comoras', 'Corea del Norte',
        'Corea del Sur', 'Costa de Marfil', 'Costa Rica', 'Croacia', 'Cuba', 'Dinamarca', 'Dominica',
        'Ecuador', 'Egipto', 'El Salvador', 'Emiratos Árabes Unidos', 'Eritrea', 'Eslovaquia',
        'Eslovenia', 'España', 'Estados Unidos', 'Estonia', 'Esuatini', 'Etiopía', 'Filipinas',
        'Finlandia', 'Fiyi', 'Francia', 'Gabón', 'Gambia', 'Georgia', 'Ghana', 'Granada', 'Grecia',
        'Guatemala', 'Guyana', 'Guinea', 'Guinea-Bisáu', 'Guinea Ecuatorial', 'Haití', 'Honduras',
        'Hungría', 'India', 'Indonesia', 'Irak', 'Irán', 'Irlanda', 'Islandia', 'Islas Marshall',
        'Islas Salomón', 'Israel', 'Italia', 'Jamaica', 'Japón', 'Jordania', 'Kazajistán', 'Kenia',
        'Kirguistán', 'Kiribati', 'Kuwait', 'Laos', 'Lesoto', 'Letonia', 'Líbano', 'Liberia', 'Libia',
        'Liechtenstein', 'Lituania', 'Luxemburgo', 'Macedonia del Norte', 'Madagascar', 'Malasia',
        'Malaui', 'Maldivas', 'Malí', 'Malta', 'Marruecos', 'Mauricio', 'Mauritania', 'México',
        'Micronesia', 'Moldavia', 'Mónaco', 'Mongolia', 'Montenegro', 'Mozambique', 'Namibia', 'Nauru',
        'Nepal', 'Nicaragua', 'Níger', 'Nigeria', 'Noruega', 'Nueva Zelanda', 'Omán', 'Países Bajos',
        'Pakistán', 'Palaos', 'Panamá', 'Papúa Nueva Guinea', 'Paraguay', 'Perú', 'Polonia', 'Portugal',
        'Reino Unido', 'República Centroafricana', 'República Checa', 'República del Congo',
        'República Democrática del Congo', 'República Dominicana', 'Ruanda', 'Rumanía', 'Rusia',
        'Samoa', 'San Cristóbal y Nieves', 'San Marino', 'San Vicente y las Granadinas', 'Santa Lucía',
        'Santo Tomé y Príncipe', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leona', 'Singapur', 'Siria',
        'Somalia', 'Sri Lanka', 'Sudáfrica', 'Sudán', 'Sudán del Sur', 'Suecia', 'Suiza', 'Surinam',
        'Tailandia', 'Tanzania', 'Tayikistán', 'Timor Oriental', 'Togo', 'Tonga', 'Trinidad y Tobago',
        'Túnez', 'Turkmenistán', 'Turquía', 'Tuvalu', 'Ucrania', 'Uganda', 'Uruguay', 'Uzbekistán',
        'Vanuatu', 'Venezuela', 'Vietnam', 'Yemen', 'Yibuti', 'Zambia', 'Zimbabue',
    ];
    const GEO_MEXICO_STATES_SEED = [
        'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
        'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Guanajuato', 'Guerrero', 'Hidalgo',
        'Jalisco', 'Estado de México', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca',
        'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco',
        'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
    ];
    const insertCountry = db.prepare('INSERT INTO geo_countries (name) VALUES (?)');
    const insertState = db.prepare('INSERT INTO geo_states (country_id, name) VALUES (?, ?)');
    const seedGeoCatalog = db.transaction(() => {
        let mexicoId = null;
        GEO_COUNTRIES_SEED.forEach((name) => {
            const { lastInsertRowid } = insertCountry.run(name);
            if (name === 'México') mexicoId = lastInsertRowid;
        });
        GEO_MEXICO_STATES_SEED.forEach((name) => insertState.run(mexicoId, name));
    });
    seedGeoCatalog();
}

// field_fill_rules gains an authorization workflow (Reglas de Orden de
// Llenado, its own screen under Gestión) -- a new rule is created but has
// no effect (applyFieldFillRules only enforces authorized rules) until
// someone with the colFieldRuleAuthorization grant authorizes it, same
// two-step idea as Transacciones Inteligentes' own report authorization.
// gate_label/dependent_label are denormalized at creation time so the
// concentrator screen can show every rule from every table without needing
// to know each table's live column list.
const fieldFillRuleColumns = db.prepare('PRAGMA table_info(field_fill_rules)').all();
if (!fieldFillRuleColumns.some((c) => c.name === 'gate_label')) {
    db.exec("ALTER TABLE field_fill_rules ADD COLUMN gate_label TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE field_fill_rules ADD COLUMN dependent_label TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE field_fill_rules ADD COLUMN created_by TEXT NOT NULL DEFAULT ''");
    db.exec('ALTER TABLE field_fill_rules ADD COLUMN authorized_by TEXT');
    db.exec('ALTER TABLE field_fill_rules ADD COLUMN authorized_at TEXT');
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
if (!planColumns.some((c) => c.name === 'created_by')) {
    db.exec("ALTER TABLE plans ADD COLUMN created_by TEXT NOT NULL DEFAULT ''");
}
if (!planColumns.some((c) => c.name === 'end_date')) {
    db.exec('ALTER TABLE plans ADD COLUMN end_date TEXT');
}
if (!planColumns.some((c) => c.name === 'status')) {
    db.exec("ALTER TABLE plans ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}
if (!planColumns.some((c) => c.name === 'locked')) {
    db.exec('ALTER TABLE plans ADD COLUMN locked INTEGER NOT NULL DEFAULT 0');
}
// Costo Accesos-Permisos: unlike name/description/modules/costCentersLimit
// (frozen forever once a plan is activated), pricing stays editable always
// — see updatePlan/PATCH /api/admin/plans/:id, never gated by `locked`.
if (!planColumns.some((c) => c.name === 'currency')) {
    db.exec("ALTER TABLE plans ADD COLUMN currency TEXT NOT NULL DEFAULT 'MXN'");
}
if (!planColumns.some((c) => c.name === 'cost_per_cost_center')) {
    db.exec('ALTER TABLE plans ADD COLUMN cost_per_cost_center REAL NOT NULL DEFAULT 0');
}
// DEPRECATED: a Plan no longer decides a client's mobile-app experience —
// that's now clients.sector_negocio, matched against saas_apps.sector (see
// Nuestras APPs redesign). Column kept (never drop columns in this file) but
// nothing reads or writes it anymore.
if (!planColumns.some((c) => c.name === 'app_id')) {
    db.exec('ALTER TABLE plans ADD COLUMN app_id INTEGER REFERENCES saas_apps(id)');
}

// Nuestras APPs gains: sector (the business vertical this app serves —
// what clients.sector_negocio is matched against, one app per sector),
// status (Activo/Inactivo/Desarrollo — only 'active' apps' sectors are
// offered on the client Sector picker), created_by (who made it, shown in
// the table). Partial unique index (like idx_clients_rfc) so multiple
// still-blank sectors from before this migration don't collide.
const saasAppColumns = db.prepare('PRAGMA table_info(saas_apps)').all();
if (!saasAppColumns.some((c) => c.name === 'sector')) {
    db.exec("ALTER TABLE saas_apps ADD COLUMN sector TEXT NOT NULL DEFAULT ''");
}
if (!saasAppColumns.some((c) => c.name === 'status')) {
    db.exec("ALTER TABLE saas_apps ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}
if (!saasAppColumns.some((c) => c.name === 'created_by')) {
    db.exec("ALTER TABLE saas_apps ADD COLUMN created_by TEXT NOT NULL DEFAULT ''");
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_apps_sector ON saas_apps(sector) WHERE sector != \'\'');

// Each App screen must map to a real Web screen/table (one of
// TABLE_GRANT_PATHS' keys, below) — it fills that same table's data, just
// through a more guided/mobile-friendly UI. Enforced at creation (see
// addSaasAppScreen); this is what lets the permission tree lock an App
// screen's grant picker until its Web sibling already has one.
const saasAppScreenColumns = db.prepare('PRAGMA table_info(saas_app_screens)').all();
if (!saasAppScreenColumns.some((c) => c.name === 'web_screen_key')) {
    db.exec("ALTER TABLE saas_app_screens ADD COLUMN web_screen_key TEXT NOT NULL DEFAULT ''");
}

// plan_grants: same {sectionId, itemId, submenuId} shape as profile_grants —
// what a Plan bundles in (which departamentos/áreas/apartados/pantallas/
// columnas it includes), edited with the SAME PermissionTree.js component,
// just mounted against a plan instead of a client's profile. Separate table
// (not reusing profile_grants) since a plan isn't a profile and isn't
// scoped to any one client.
//
// plan_changes: same idea as data_table_changes, but plans are GEIPSA-wide
// (not owned by any client), so it can't reuse that table — data_table_changes.client_id
// is NOT NULL. Kept minimal on purpose, no requested_by/authorized_by
// (plans have no approval workflow).
db.exec(`
    CREATE TABLE IF NOT EXISTS plan_grants (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        section_id  TEXT NOT NULL,
        item_id     TEXT,
        submenu_id  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_plan_grants_plan_id ON plan_grants(plan_id);

    CREATE TABLE IF NOT EXISTS plan_changes (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id       INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        action        TEXT NOT NULL,
        field_key     TEXT NOT NULL DEFAULT '',
        old_value     TEXT NOT NULL DEFAULT '',
        new_value     TEXT NOT NULL DEFAULT '',
        changed_by    TEXT NOT NULL DEFAULT '',
        changed_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Costo Accesos-Permisos: a price per plan per tree node, at EVERY
    -- level (Departamento/Área/Categoría/Pantalla/Columna), stored and
    -- summed independently per level ON PURPOSE (a priced Departamento AND
    -- a priced Pantalla underneath it both count toward the total). The
    -- plan's own total (computeAccessCostTotal) is a plain sum of every row
    -- here — pricing a node is independent from granting it in the plan's
    -- separate access tree (plan_grants); a client's ADDITIONAL cost
    -- (computeClientAdditionalPermissionsCost) still gates on
    -- client_permission_grants, since that one represents what was
    -- actually sold to that client, not just priced on the plan's sheet.
    CREATE TABLE IF NOT EXISTS plan_permission_costs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        section_id  TEXT NOT NULL,
        item_id     TEXT,
        submenu_id  TEXT,
        cost        REAL NOT NULL DEFAULT 0,
        UNIQUE(plan_id, section_id, item_id, submenu_id)
    );
    CREATE INDEX IF NOT EXISTS idx_plan_permission_costs_plan_id ON plan_permission_costs(plan_id);

    -- client_permission_grants: the client-level counterpart of
    -- plan_grants — a "+ adicional" sold to THIS client beyond what their
    -- plan already includes, at the exact same {sectionId, itemId,
    -- submenuId} leaf granularity (hasta Columna). Never contains a tuple
    -- already covered by the client's plan (enforced server-side on PUT
    -- /api/admin/clients/:id/permission-grants, not just in the UI).
    -- Colors PERMISOS CONTRATADOS' tree yellow and feeds PAGO POR
    -- ADICIONALES' permissions component, priced against the SAME plan's
    -- plan_permission_costs — a client never gets its own separate price
    -- sheet, GEIPSA only ever prices things once, per plan.
    CREATE TABLE IF NOT EXISTS client_permission_grants (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        section_id  TEXT NOT NULL,
        item_id     TEXT,
        submenu_id  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_client_permission_grants_client_id ON client_permission_grants(client_id);

    -- Access tree for GEIPSA's own SaaS-side staff (role='admin' users) —
    -- a much smaller, flat namespace than the client-side department tree
    -- (PermissionTree.js): itemId is one of the 3 SaaS screens
    -- ('saas-clients' | 'saas-plans' | 'saas-module-costs'), subItemId is
    -- an optional granular action under that screen (today only
    -- 'activate', under 'saas-plans' — "Autorizar Planes"). No
    -- profiles/roles layer on purpose (direct per-admin grants) — there
    -- are only ever a handful of GEIPSA staff accounts, a whole reusable-
    -- profile system would be overkill for that scale. An admin with ZERO
    -- rows here is UNRESTRICTED (sees/can do everything) — same convention
    -- as isUnrestrictedClientAdmin on the client side: empty means "no
    -- override was ever set", not "nothing granted".
    CREATE TABLE IF NOT EXISTS saas_user_grants (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id      TEXT NOT NULL,
        sub_item_id  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_saas_user_grants_user_id ON saas_user_grants(user_id);
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

// Evidencia fotográfica for Trip KM Antes/Después, added after fuel_records
// already shipped once — same data: URL pattern as ticket_evidence.
if (!fuelRecordColumns.some((c) => c.name === 'trip_km_before_evidence')) {
    db.exec("ALTER TABLE fuel_records ADD COLUMN trip_km_before_evidence TEXT NOT NULL DEFAULT ''");
}
if (!fuelRecordColumns.some((c) => c.name === 'trip_km_after_evidence')) {
    db.exec("ALTER TABLE fuel_records ADD COLUMN trip_km_after_evidence TEXT NOT NULL DEFAULT ''");
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

// Centro Costos ("Control Interno" system column) added after fuel_records
// already shipped once — captured once at creation from whatever Centro de
// Costos is active in the top-bar picker at that moment, never patched
// afterward (see FUEL_PATCHABLE_FIELDS, which intentionally excludes it).
if (!fuelRecordColumns.some((c) => c.name === 'centro_costos')) {
    db.exec("ALTER TABLE fuel_records ADD COLUMN centro_costos TEXT NOT NULL DEFAULT ''");
}

// given_names/surnames (separate from full_name, needed to compute the
// auto-generated username — see computeHrUsername), departments (JSON
// array, replacing the old single `department` column so a worker can
// belong to more than one), cost_center_id (which Centro de Costos this
// worker is billed against), and user_id (the login account auto-created
// alongside this worker — see createHrWorker) all added after hr_workers
// already shipped once.
// Seed set for a brand-new client's Estatus RH catalog (also used to
// backfill any client that predates hr_status_catalog, below). A client can
// freely rename/add/remove entries afterward from Business-EstatusRH.html —
// this only fires once per client, when their catalog is still empty.
const DEFAULT_HR_STATUSES = [
    ['Activo', 'active'],
    ['De vacaciones', 'suspended'],
    ['Incapacidad', 'suspended'],
    ['Permiso sin Goce de Sueldo', 'suspended'],
    ['Permiso con Goce de Sueldo', 'suspended'],
    ['Rescisión de Contrato', 'inactive'],
];
const insertHrStatusCatalogEntry = db.prepare('INSERT INTO hr_status_catalog (client_id, name, operational_effect) VALUES (?, ?, ?)');
function ensureDefaultHrStatusCatalog(clientId) {
    const existing = db.prepare('SELECT COUNT(*) AS n FROM hr_status_catalog WHERE client_id = ?').get(clientId).n;
    if (existing > 0) return;
    const seed = db.transaction(() => {
        DEFAULT_HR_STATUSES.forEach(([name, effect]) => insertHrStatusCatalogEntry.run(clientId, name, effect));
    });
    seed();
}
// Every worker is Activo by definition the moment they're registered (see
// createHrWorker below) — looks up this client's own Activo entry,
// seeding their catalog first if it's still empty.
function getDefaultActiveHrStatusId(clientId) {
    ensureDefaultHrStatusCatalog(clientId);
    const row = db.prepare("SELECT id FROM hr_status_catalog WHERE client_id = ? AND name = 'Activo' ORDER BY id ASC LIMIT 1").get(clientId)
        || db.prepare("SELECT id FROM hr_status_catalog WHERE client_id = ? AND operational_effect = 'active' ORDER BY id ASC LIMIT 1").get(clientId);
    return row ? row.id : null;
}

const hrWorkerColumns = db.prepare('PRAGMA table_info(hr_workers)').all();
if (!hrWorkerColumns.some((c) => c.name === 'given_names')) {
    db.exec("ALTER TABLE hr_workers ADD COLUMN given_names TEXT NOT NULL DEFAULT ''");
}
if (!hrWorkerColumns.some((c) => c.name === 'surnames')) {
    db.exec("ALTER TABLE hr_workers ADD COLUMN surnames TEXT NOT NULL DEFAULT ''");
}
if (!hrWorkerColumns.some((c) => c.name === 'departments')) {
    db.exec("ALTER TABLE hr_workers ADD COLUMN departments TEXT NOT NULL DEFAULT '[]'");
}
if (!hrWorkerColumns.some((c) => c.name === 'cost_center_id')) {
    db.exec('ALTER TABLE hr_workers ADD COLUMN cost_center_id INTEGER REFERENCES cost_centers(id)');
}
if (!hrWorkerColumns.some((c) => c.name === 'user_id')) {
    db.exec('ALTER TABLE hr_workers ADD COLUMN user_id INTEGER REFERENCES users(id)');
}
if (!hrWorkerColumns.some((c) => c.name === 'record_code')) {
    db.exec("ALTER TABLE hr_workers ADD COLUMN record_code TEXT NOT NULL DEFAULT ''");
}
// hr_status_id replaces the old free-standing status ('active'/'inactive')
// with a reference into the new hr_status_catalog. One-time backfill, right
// when the column is first added: every client with existing workers gets
// their catalog seeded (if not already), then each worker is pointed at
// Activo or Rescisión de Contrato depending on their old status — Rescisión
// de Contrato because that's the only new entry whose operational_effect
// ('inactive') matches what old status='inactive' already did (revoke
// login, see updateHrWorker's cascade). The legacy `status` column is left
// in place, unused, rather than risk a destructive DROP COLUMN on live data.
if (!hrWorkerColumns.some((c) => c.name === 'hr_status_id')) {
    db.exec('ALTER TABLE hr_workers ADD COLUMN hr_status_id INTEGER REFERENCES hr_status_catalog(id)');
    const workerClientIds = db.prepare('SELECT DISTINCT client_id FROM hr_workers').all().map((r) => r.client_id);
    const setWorkerHrStatus = db.prepare('UPDATE hr_workers SET hr_status_id = ? WHERE client_id = ? AND status = ?');
    workerClientIds.forEach((clientId) => {
        ensureDefaultHrStatusCatalog(clientId);
        const activeId = db.prepare("SELECT id FROM hr_status_catalog WHERE client_id = ? AND name = 'Activo'").get(clientId)?.id;
        const rescindedId = db.prepare("SELECT id FROM hr_status_catalog WHERE client_id = ? AND name = 'Rescisión de Contrato'").get(clientId)?.id;
        if (activeId) setWorkerHrStatus.run(activeId, clientId, 'active');
        if (rescindedId) setWorkerHrStatus.run(rescindedId, clientId, 'inactive');
    });
}

// abbreviation added after job_positions already shipped once.
const jobPositionColumns = db.prepare('PRAGMA table_info(job_positions)').all();
if (!jobPositionColumns.some((c) => c.name === 'abbreviation')) {
    db.exec("ALTER TABLE job_positions ADD COLUMN abbreviation TEXT NOT NULL DEFAULT ''");
}
if (!jobPositionColumns.some((c) => c.name === 'cost_center_id')) {
    db.exec('ALTER TABLE job_positions ADD COLUMN cost_center_id INTEGER REFERENCES cost_centers(id)');
}
// cost_center_scope replaces cost_center_id (kept, but frozen/unused going
// forward — same "add alongside, never drop" convention as contracted_cost)
// with a job position now enabled for 'all' cost centers or a specific JSON
// array of ids — confirmed with the user: a Puesto can be enabled for one,
// several, or every active cost center. Existing single-value rows are
// backfilled into a one-item array; a Puesto with none set becomes 'all'
// (available everywhere) rather than silently disappearing from every cost
// center's Mi Recurso Humano dropdown.
if (!jobPositionColumns.some((c) => c.name === 'cost_center_scope')) {
    db.exec("ALTER TABLE job_positions ADD COLUMN cost_center_scope TEXT NOT NULL DEFAULT 'all'");
    const jobPositionsWithSingleCC = db.prepare('SELECT id, cost_center_id FROM job_positions WHERE cost_center_id IS NOT NULL').all();
    const backfillScope = db.prepare('UPDATE job_positions SET cost_center_scope = ? WHERE id = ?');
    jobPositionsWithSingleCC.forEach((row) => backfillScope.run(JSON.stringify([row.cost_center_id]), row.id));
}

// requested_by/authorized_by added after data_table_changes already shipped
// once — nullable, only ever filled for rows created via an approved
// pending_changes row (see resolvePendingChange's caller in server.js);
// changed_by alone still covers every direct (non-approval) edit, same as
// before these 2 columns existed.
const dataTableChangesColumns = db.prepare('PRAGMA table_info(data_table_changes)').all();
if (!dataTableChangesColumns.some((c) => c.name === 'requested_by')) {
    db.exec('ALTER TABLE data_table_changes ADD COLUMN requested_by TEXT');
}
if (!dataTableChangesColumns.some((c) => c.name === 'authorized_by')) {
    db.exec('ALTER TABLE data_table_changes ADD COLUMN authorized_by TEXT');
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
    CREATE INDEX IF NOT EXISTS idx_pending_changes_client_status ON pending_changes(client_id, status);
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

function createUser({ username, email, passwordHash, name, clientId = null, isClientAdmin = false, role = 'user', active = true }) {
    const result = db
        .prepare(`
            INSERT INTO users (username, email, password_hash, name, client_id, is_client_admin, role, active)
            VALUES (@username, @email, @passwordHash, @name, @clientId, @isClientAdmin, @role, @active)
        `)
        .run({ username, email, passwordHash, name, clientId, isClientAdmin: isClientAdmin ? 1 : 0, role, active: active ? 1 : 0 });
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
            SELECT company_name AS companyName, company_abbreviation AS companyAbbreviation,
                   logo_data_url AS logoDataUrl,
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
    rfc, companyNickname, companyAbbreviation, ownerName, billingEmail, razonSocial,
    contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractFileName,
    contractWordDataUrl, contractWordFileName,
    contractedCost, monthlyPayment, initialPayment, sectorNegocio,
}) {
    const create = db.transaction(() => {
        const accountNumber = db.prepare('SELECT COALESCE(MAX(account_number), 0) + 1 AS n FROM clients').get().n;
        return db
            .prepare(`
                INSERT INTO clients (
                    company_name, contact_name, email, phone, plan, status, logo_data_url, primary_color, secondary_color, seed_color, color_palette,
                    mission, vision, core_values, history,
                    rfc, company_nickname, company_abbreviation, owner_name, billing_email, razon_social, big_date_number, account_number,
                    contract_start_date, contract_registered_date, contract_end_date, contract_file_data_url, contract_file_name,
                    contract_word_data_url, contract_word_file_name,
                    contracted_cost, monthly_payment, initial_payment, sector_negocio
                )
                VALUES (
                    @companyName, @contactName, @email, @phone, @plan, @status, @logoDataUrl, @primaryColor, @secondaryColor, @seedColor, @colorPalette,
                    @mission, @vision, @coreValues, @history,
                    @rfc, @companyNickname, @companyAbbreviation, @ownerName, @billingEmail, @razonSocial, @bigDateNumber, @accountNumber,
                    @contractStartDate, @contractRegisteredDate, @contractEndDate, @contractFileDataUrl, @contractFileName,
                    @contractWordDataUrl, @contractWordFileName,
                    @contractedCost, @monthlyPayment, @initialPayment, @sectorNegocio
                )
            `)
            .run({
                companyName, contactName, email, phone: phone || '', plan: plan || '', status: status || 'prospecto',
                logoDataUrl: logoDataUrl || null, primaryColor: primaryColor || null, secondaryColor: secondaryColor || null,
                seedColor: seedColor || null, colorPalette: colorPalette ? JSON.stringify(colorPalette) : null,
                mission: mission || '', vision: vision || '', coreValues: coreValues || '', history: history || '',
                rfc: rfc || '', companyNickname: companyNickname || '', companyAbbreviation: companyAbbreviation || '',
                ownerName: ownerName || '', billingEmail: billingEmail || '', razonSocial: razonSocial || '',
                bigDateNumber: generateBigDateId(), accountNumber,
                contractStartDate: contractStartDate || null, contractRegisteredDate: contractRegisteredDate || null,
                contractEndDate: contractEndDate || null, contractFileDataUrl: contractFileDataUrl || null, contractFileName: contractFileName || null,
                contractWordDataUrl: contractWordDataUrl || null, contractWordFileName: contractWordFileName || null,
                contractedCost: contractedCost || 0, monthlyPayment: monthlyPayment || 0, initialPayment: initialPayment || 0,
                sectorNegocio: sectorNegocio || '',
            }).lastInsertRowid;
    });
    return getClientById(create());
}

// contractedCost is intentionally handled with COALESCE, not a plain
// overwrite (see Nuestros Clientes redesign) — the field stopped being
// accepted from the new UI (COSTO $ CONTRATADO is now always computed live
// from the plan), so every future save passes contractedCost: null here,
// freezing whatever historical value the column already had instead of
// zeroing it out on every save.
function updateClient(id, {
    companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette,
    mission, vision, coreValues, history,
    rfc, companyNickname, companyAbbreviation, ownerName, billingEmail, razonSocial,
    contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractFileName,
    contractWordDataUrl, contractWordFileName,
    contractedCost, monthlyPayment, initialPayment, sectorNegocio,
}) {
    const existing = getClientById(id);
    db.prepare(`
        UPDATE clients
        SET company_name = @companyName, contact_name = @contactName, email = @email,
            phone = @phone, plan = @plan, status = @status,
            logo_data_url = @logoDataUrl, primary_color = @primaryColor, secondary_color = @secondaryColor,
            seed_color = @seedColor, color_palette = @colorPalette,
            mission = @mission, vision = @vision, core_values = @coreValues, history = @history,
            rfc = @rfc, company_nickname = @companyNickname, company_abbreviation = @companyAbbreviation,
            owner_name = @ownerName, billing_email = @billingEmail, razon_social = @razonSocial,
            contract_start_date = @contractStartDate, contract_registered_date = @contractRegisteredDate,
            contract_end_date = @contractEndDate, contract_file_data_url = @contractFileDataUrl, contract_file_name = @contractFileName,
            contract_word_data_url = @contractWordDataUrl, contract_word_file_name = @contractWordFileName,
            contracted_cost = COALESCE(@contractedCost, contracted_cost),
            monthly_payment = @monthlyPayment, initial_payment = @initialPayment, sector_negocio = @sectorNegocio
        WHERE id = @id
    `).run({
        id, companyName, contactName, email, phone: phone || '', plan: plan || '', status,
        logoDataUrl: logoDataUrl || null, primaryColor: primaryColor || null, secondaryColor: secondaryColor || null,
        seedColor: seedColor || null, colorPalette: colorPalette ? JSON.stringify(colorPalette) : null,
        mission: mission || '', vision: vision || '', coreValues: coreValues || '', history: history || '',
        rfc: rfc || '', companyNickname: companyNickname || '', companyAbbreviation: companyAbbreviation || '',
        ownerName: ownerName || '', billingEmail: billingEmail || '', razonSocial: razonSocial || '',
        contractStartDate: contractStartDate || null, contractRegisteredDate: contractRegisteredDate || null,
        contractEndDate: contractEndDate || null, contractFileDataUrl: contractFileDataUrl || null, contractFileName: contractFileName || null,
        contractWordDataUrl: contractWordDataUrl || null, contractWordFileName: contractWordFileName || null,
        contractedCost: contractedCost ?? null, monthlyPayment: monthlyPayment || 0, initialPayment: initialPayment || 0,
        sectorNegocio: sectorNegocio ?? (existing ? existing.sector_negocio : '') ?? '',
    });
    return getClientById(id);
}

// Independent from the rest of the client record (own PATCH route, its own
// icon in Nuestros Clientes' Acciones column) — a client can have a Sector
// assigned but still be switched off, same idea as a Plan's own
// active/inactive status being separate from its definition fields.
function setClientAppEnabled(id, enabled) {
    db.prepare('UPDATE clients SET app_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
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
// recordId is optional — pass it to scope the same query to a single row's
// history (the per-row "control de cambios" icon), omit it for the
// table-wide one (the toolbar icon).
function getTableChanges(clientId, tableKey, recordId) {
    if (recordId != null) {
        return db
            .prepare('SELECT * FROM data_table_changes WHERE client_id = ? AND table_key = ? AND record_id = ? ORDER BY changed_at DESC, id DESC')
            .all(clientId, tableKey, recordId);
    }
    return db
        .prepare('SELECT * FROM data_table_changes WHERE client_id = ? AND table_key = ? ORDER BY changed_at DESC, id DESC')
        .all(clientId, tableKey);
}

function logTableChange({ clientId, tableKey, recordId, recordLabel, action, fieldKey, oldValue, newValue, changedBy, requestedBy, authorizedBy }) {
    db.prepare(`
        INSERT INTO data_table_changes (client_id, table_key, record_id, record_label, action, field_key, old_value, new_value, changed_by, requested_by, authorized_by)
        VALUES (@clientId, @tableKey, @recordId, @recordLabel, @action, @fieldKey, @oldValue, @newValue, @changedBy, @requestedBy, @authorizedBy)
    `).run({
        clientId, tableKey, recordId, recordLabel: recordLabel || '', action,
        fieldKey: fieldKey || '',
        oldValue: oldValue == null ? '' : String(oldValue),
        newValue: newValue == null ? '' : String(newValue),
        changedBy: changedBy || '',
        requestedBy: requestedBy || null,
        authorizedBy: authorizedBy || null,
    });
}

// Column-level permission ("Solo Ver" / "Ver y Operar" / "Editar" +
// "Autorizar") — each editable pantalla is a real node in the SAME menu
// tree PermissionTree.js already renders (see public/data/menu.json — the
// pantalla's own entry carries a `submenu` of its columns, and
// PermissionTree.js renders a "Tabla <Nombre>" sub-tree under it), so each
// level is just that pantalla's normal {sectionId, itemId, submenuId} leaf,
// two levels deeper: `${submenuPrefix}/${colKey}/${level}`. The pantalla's
// OWN visibility leaf is `submenuId === submenuPrefix` exactly (no column
// suffix) — used by the Parte F migration below to find who already sees a
// table's screen. TABLE_GRANT_PATHS mirrors each table's actual position in
// menu.json — kept in sync by hand (a future table just needs its own entry
// here, matching wherever its pantalla already lives in the tree).
// colKey is fieldKey's last segment (e.g. "main.colFuelPlates" ->
// "colFuelPlates") — reused from FUEL_PATCHABLE_FIELDS/
// HR_WORKER_PATCHABLE_FIELDS/COST_CENTER_FIELDS, and must match the `id` of
// that pantalla's column entries in menu.json exactly.
const TABLE_GRANT_PATHS = {
    'centros-costo': { sectionId: 'main', itemId: 'btn-configuracion', submenuPrefix: 'btn-admin-negocio/ab-contracted-service/ab-our-cost-centers' },
    'registro-combustible': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-operaciones/cat-operaciones-transporte-vol-combustible' },
    'mi-recurso-humano': { sectionId: 'human-resources', itemId: 'hr-area-personnel-admin', submenuPrefix: 'cat-operaciones/cat-operaciones-rrhh-mi-recurso-humano' },
    'transacciones-inteligentes': { sectionId: 'main', itemId: 'btn-configuracion', submenuPrefix: 'btn-negocio-inteligente/nit-transacciones' },
    'reportes-programados': { sectionId: 'main', itemId: 'btn-configuracion', submenuPrefix: 'btn-negocio-inteligente/nit-reportes-programados' },
    'reglas-orden-llenado': { sectionId: 'main', itemId: 'btn-configuracion', submenuPrefix: 'btn-gestion-reglas-orden' },
};

// The 13 "Control Interno" system columns (see getSystemColumnsForRecord
// below) sit one level deeper than a table's own columns in menu.json —
// nested inside a classification group (id "class-control-interno")
// instead of directly under the pantalla. getColumnGrantLevel/
// canAuthorizeColumn need that extra segment only for these ids; every
// other column keeps its existing (shallower) path.
const SYSTEM_COLUMN_CLASSIFICATION = 'class-control-interno';
const SYSTEM_COLUMN_IDS = new Set([
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
]);
function columnSubmenuBase(path, colKey) {
    return SYSTEM_COLUMN_IDS.has(colKey) ? `${path.submenuPrefix}/${SYSTEM_COLUMN_CLASSIFICATION}/${colKey}` : `${path.submenuPrefix}/${colKey}`;
}

// No grant at all on a column behaves as 'solo-ver' (confirmed product
// default). The 3 levels are mutually exclusive by UI convention only —
// PermissionTree.js enforces that in its own checkbox-group handler — so
// 'editar' takes priority here only as defensive ordering in case a grant
// row was ever written any other way (direct API, old data, etc.).
function getColumnGrantLevel(grants, tableKey, colKey) {
    const path = TABLE_GRANT_PATHS[tableKey];
    if (!path) return 'solo-ver';
    const base = columnSubmenuBase(path, colKey);
    const has = (level) => grants.some((g) => g.sectionId === path.sectionId && g.itemId === path.itemId && g.submenuId === `${base}/${level}`);
    if (has('editar')) return 'editar';
    if (has('ver-y-operar')) return 'ver-y-operar';
    return 'solo-ver';
}

function canAuthorizeColumn(grants, tableKey, colKey) {
    const path = TABLE_GRANT_PATHS[tableKey];
    if (!path) return false;
    const base = columnSubmenuBase(path, colKey);
    return grants.some((g) => g.sectionId === path.sectionId && g.itemId === path.itemId && g.submenuId === `${base}/autorizar`);
}

// --- Pending changes (real approval workflow for "Editar" on an ---------
// --- already-saved value — see checkAndLogFieldChanges in server.js) -----
function createPendingChange({ clientId, tableKey, recordId, recordLabel, fieldKey, columnKey, oldValue, newValue, requestedBy, requestedByUserId }) {
    const result = db.prepare(`
        INSERT INTO pending_changes (client_id, table_key, record_id, record_label, field_key, column_key, old_value, new_value, requested_by, requested_by_user_id)
        VALUES (@clientId, @tableKey, @recordId, @recordLabel, @fieldKey, @columnKey, @oldValue, @newValue, @requestedBy, @requestedByUserId)
    `).run({
        clientId, tableKey, recordId, recordLabel: recordLabel || '', fieldKey, columnKey,
        oldValue: oldValue == null ? '' : String(oldValue),
        newValue: newValue == null ? '' : String(newValue),
        requestedBy: requestedBy || '', requestedByUserId,
    });
    return getPendingChangeById(result.lastInsertRowid);
}

function getPendingChangeById(id) {
    return db.prepare('SELECT * FROM pending_changes WHERE id = ?').get(id);
}

// Whether this exact field already has an outstanding pending request —
// checked before creating a new one, so 2 back-to-back "Editar" attempts on
// the same field (e.g. a user retrying, or 2 different users) never create
// 2 competing pending rows for the same value.
function hasPendingChangeForField(clientId, tableKey, recordId, columnKey) {
    return !!db.prepare(`
        SELECT 1 FROM pending_changes
        WHERE client_id = ? AND table_key = ? AND record_id = ? AND column_key = ? AND status = 'pending'
    `).get(clientId, tableKey, recordId, columnKey);
}

function listPendingChangesForClient(clientId, status = 'pending') {
    return db.prepare('SELECT * FROM pending_changes WHERE client_id = ? AND status = ? ORDER BY requested_at DESC, id DESC').all(clientId, status);
}

// Column bodyKeys (e.g. "subtotal") currently pending per record, grouped
// by table — used by the fuel-records/hr-workers GET routes to flag each
// record's pending fields for the frontend (see attachInlineEdit's
// `pending` option in Dashboard.js).
function getPendingColumnsByRecord(clientId, tableKey) {
    const rows = db.prepare(`
        SELECT record_id AS recordId, column_key AS columnKey FROM pending_changes
        WHERE client_id = ? AND table_key = ? AND status = 'pending'
    `).all(clientId, tableKey);
    const byRecord = new Map();
    rows.forEach(({ recordId, columnKey }) => {
        if (!byRecord.has(recordId)) byRecord.set(recordId, []);
        byRecord.get(recordId).push(columnKey);
    });
    return byRecord;
}

function resolvePendingChange(id, { status, resolvedBy, resolvedByUserId }) {
    db.prepare(`
        UPDATE pending_changes SET status = @status, resolved_by = @resolvedBy, resolved_by_user_id = @resolvedByUserId, resolved_at = datetime('now')
        WHERE id = @id
    `).run({ id, status, resolvedBy: resolvedBy || '', resolvedByUserId });
    return getPendingChangeById(id);
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

// --- Query helpers: geo catalog (País/Estado/Localidad/Calle, global) -------
function listCountries() {
    return db.prepare('SELECT * FROM geo_countries ORDER BY name ASC').all();
}
function listStates(countryId) {
    return db.prepare('SELECT * FROM geo_states WHERE country_id = ? ORDER BY name ASC').all(countryId);
}
function listLocalities(stateId) {
    return db.prepare('SELECT * FROM geo_localities WHERE state_id = ? ORDER BY name ASC').all(stateId);
}
function listStreets(localityId) {
    return db.prepare('SELECT * FROM geo_streets WHERE locality_id = ? ORDER BY name ASC').all(localityId);
}
// Each "add new" is idempotent (COLLATE NOCASE) rather than erroring on a
// duplicate -- two admins typing "Jalisco" a moment apart should both just
// end up pointing at the same catalog row, not fight over a UNIQUE error.
function createCountry(name) {
    const trimmed = (name || '').trim();
    const existing = db.prepare('SELECT * FROM geo_countries WHERE name = ? COLLATE NOCASE').get(trimmed);
    if (existing) return existing;
    const { lastInsertRowid } = db.prepare('INSERT INTO geo_countries (name) VALUES (?)').run(trimmed);
    return db.prepare('SELECT * FROM geo_countries WHERE id = ?').get(lastInsertRowid);
}
function createState(countryId, name) {
    const trimmed = (name || '').trim();
    const existing = db.prepare('SELECT * FROM geo_states WHERE country_id = ? AND name = ? COLLATE NOCASE').get(countryId, trimmed);
    if (existing) return existing;
    const { lastInsertRowid } = db.prepare('INSERT INTO geo_states (country_id, name) VALUES (?, ?)').run(countryId, trimmed);
    return db.prepare('SELECT * FROM geo_states WHERE id = ?').get(lastInsertRowid);
}
function createLocality(stateId, name) {
    const trimmed = (name || '').trim();
    const existing = db.prepare('SELECT * FROM geo_localities WHERE state_id = ? AND name = ? COLLATE NOCASE').get(stateId, trimmed);
    if (existing) return existing;
    const { lastInsertRowid } = db.prepare('INSERT INTO geo_localities (state_id, name) VALUES (?, ?)').run(stateId, trimmed);
    return db.prepare('SELECT * FROM geo_localities WHERE id = ?').get(lastInsertRowid);
}
function createStreet(localityId, name) {
    const trimmed = (name || '').trim();
    const existing = db.prepare('SELECT * FROM geo_streets WHERE locality_id = ? AND name = ? COLLATE NOCASE').get(localityId, trimmed);
    if (existing) return existing;
    const { lastInsertRowid } = db.prepare('INSERT INTO geo_streets (locality_id, name) VALUES (?, ?)').run(localityId, trimmed);
    return db.prepare('SELECT * FROM geo_streets WHERE id = ?').get(lastInsertRowid);
}

// --- Query helpers: "Reglas de Orden de Llenado" (field_fill_rules) --------
// Returns every rule for the table regardless of authorization status --
// both the per-table 🔗 modal (which needs to show pending ones too, not
// just make them disappear after creation) and the Gestión concentrator
// screen read this shape. Only Dashboard.js's applyFieldFillRules (the live
// locking engine) filters to authorized-only, since that's the one place
// an unauthorized rule must have zero effect.
function listFieldFillRules(clientId, tableKey) {
    return db.prepare('SELECT * FROM field_fill_rules WHERE client_id = ? AND table_key = ? ORDER BY id ASC').all(clientId, tableKey);
}

function listAllFieldFillRules(clientId) {
    return db.prepare('SELECT * FROM field_fill_rules WHERE client_id = ? ORDER BY table_key ASC, id ASC').all(clientId);
}

function getFieldFillRuleById(id, clientId) {
    return db.prepare('SELECT * FROM field_fill_rules WHERE id = ? AND client_id = ?').get(id, clientId);
}

// A dependent can only have one gate -- creating a new rule for a dependent
// that's already gated silently replaces the old one instead of erroring,
// matching "puedes... invertir la regla cuando quieras" (delete + re-add
// would work too, but this is the same one-step action from the admin's
// point of view). Starts unauthorized -- see the module-load migration
// comment on field_fill_rules for why.
function createFieldFillRule({ clientId, tableKey, gateCol, gateLabel, dependentCol, dependentLabel, createdBy }) {
    const create = db.transaction(() => {
        db.prepare('DELETE FROM field_fill_rules WHERE client_id = ? AND table_key = ? AND dependent_col = ?').run(clientId, tableKey, dependentCol);
        return db
            .prepare(`
                INSERT INTO field_fill_rules (client_id, table_key, gate_col, gate_label, dependent_col, dependent_label, created_by)
                VALUES (@clientId, @tableKey, @gateCol, @gateLabel, @dependentCol, @dependentLabel, @createdBy)
            `)
            .run({
                clientId, tableKey, gateCol, gateLabel: gateLabel || gateCol,
                dependentCol, dependentLabel: dependentLabel || dependentCol, createdBy: createdBy || '',
            }).lastInsertRowid;
    });
    const id = create();
    return db.prepare('SELECT * FROM field_fill_rules WHERE id = ?').get(id);
}

// Editing what a rule actually says invalidates whatever was authorized
// before -- the person who authorized it approved THAT specific gate ->
// dependent pair, not whatever it might change into later.
function updateFieldFillRule(id, clientId, { gateCol, gateLabel, dependentCol, dependentLabel }) {
    db.prepare(`
        UPDATE field_fill_rules
        SET gate_col = @gateCol, gate_label = @gateLabel, dependent_col = @dependentCol, dependent_label = @dependentLabel,
            authorized_by = NULL, authorized_at = NULL
        WHERE id = @id AND client_id = @clientId
    `).run({
        id, clientId, gateCol, gateLabel: gateLabel || gateCol, dependentCol, dependentLabel: dependentLabel || dependentCol,
    });
    return getFieldFillRuleById(id, clientId);
}

function authorizeFieldFillRule(id, clientId, authorizedBy) {
    db.prepare(`
        UPDATE field_fill_rules SET authorized_by = @authorizedBy, authorized_at = datetime('now')
        WHERE id = @id AND client_id = @clientId
    `).run({ id, clientId, authorizedBy });
    return getFieldFillRuleById(id, clientId);
}

function deleteFieldFillRule(id, clientId) {
    db.prepare('DELETE FROM field_fill_rules WHERE id = ? AND client_id = ?').run(id, clientId);
}

function createCostCenter({ clientId, countryId, stateId, localityId, streetId, sucursal, name, description, responsible }) {
    const client = getClientById(clientId);
    const baseCode = buildCostCenterCodeBase(client, countryId, stateId, localityId, streetId, sucursal);
    const create = db.transaction(() => {
        const code = generateUniqueCostCenterCode(clientId, baseCode);
        const accountNumber = db
            .prepare('SELECT COALESCE(MAX(account_number), 0) + 1 AS n FROM cost_centers WHERE client_id = ?')
            .get(clientId).n;
        const result = db
            .prepare(`
                INSERT INTO cost_centers (
                    client_id, code, name, description, responsible,
                    country_id, state_id, locality_id, street_id, sucursal,
                    account_number, record_code
                )
                VALUES (
                    @clientId, @code, @name, @description, @responsible,
                    @countryId, @stateId, @localityId, @streetId, @sucursal,
                    @accountNumber, @recordCode
                )
            `)
            .run({
                clientId, code, name, description: description || '', responsible: responsible || '',
                countryId, stateId, localityId, streetId, sucursal: sucursal || '',
                accountNumber, recordCode: computeCostCenterRecordCode(clientId, code, accountNumber),
            });
        return result.lastInsertRowid;
    });
    return getCostCenterById(create(), clientId);
}

// Used only for change-history diffing (see logFieldChanges) — updateCostCenter
// itself always overwrites every column, same as before this map existed.
const COST_CENTER_FIELDS = {
    code: { column: 'code', fieldKey: 'business.ccCode' },
    name: { column: 'name', fieldKey: 'business.ccName' },
    responsible: { column: 'responsible', fieldKey: 'business.ccResponsible' },
    description: { column: 'description', fieldKey: 'business.ccDescription' },
    sucursal: { column: 'sucursal', fieldKey: 'business.ccBranch' },
};

// code is recomputed from the new geo selections (not resubmitted directly)
// -- unlike record_code (frozen forever at creation, see
// computeCostCenterRecordCode's own comment), código is allowed to change on
// edit since it exists to reflect the currently-selected location.
function updateCostCenter(id, clientId, { countryId, stateId, localityId, streetId, sucursal, name, description, responsible }) {
    const client = getClientById(clientId);
    const baseCode = buildCostCenterCodeBase(client, countryId, stateId, localityId, streetId, sucursal);
    const code = generateUniqueCostCenterCode(clientId, baseCode, id);
    db.prepare(`
        UPDATE cost_centers
        SET code = @code, name = @name, description = @description, responsible = @responsible,
            country_id = @countryId, state_id = @stateId, locality_id = @localityId, street_id = @streetId, sucursal = @sucursal
        WHERE id = @id AND client_id = @clientId
    `).run({
        id, clientId, code, name, description: description || '', responsible: responsible || '',
        countryId, stateId, localityId, streetId, sucursal: sucursal || '',
    });
    return getCostCenterById(id, clientId);
}

// No hard-delete -- account_number/record_code are a permanent accounting
// sequence, same "Activar/Desactivar only" reasoning as clients (see the
// migration block near the top of this file). Deleting a row here would
// leave a hole in that sequence, which is exactly what this rule exists to
// prevent.
function setCostCenterStatus(id, clientId, status) {
    db.prepare('UPDATE cost_centers SET status = @status WHERE id = @id AND client_id = @clientId').run({ id, clientId, status });
    return getCostCenterById(id, clientId);
}

// --- Query helpers: job positions (Puestos de Trabajo, scoped to one client) -
function listJobPositions(clientId) {
    return db.prepare('SELECT * FROM job_positions WHERE client_id = ? ORDER BY name ASC').all(clientId);
}

function getJobPositionById(id, clientId) {
    return db.prepare('SELECT * FROM job_positions WHERE id = ? AND client_id = ?').get(id, clientId);
}

function createJobPosition({ clientId, name, abbreviation, costCenterScope, status }) {
    const result = db
        .prepare('INSERT INTO job_positions (client_id, name, abbreviation, cost_center_scope, status) VALUES (@clientId, @name, @abbreviation, @costCenterScope, @status)')
        .run({ clientId, name, abbreviation: abbreviation || '', costCenterScope: costCenterScope || 'all', status: status || 'active' });
    return getJobPositionById(result.lastInsertRowid, clientId);
}

const JOB_POSITION_FIELDS = {
    name: { column: 'name', fieldKey: 'business.jobPositionName' },
    abbreviation: { column: 'abbreviation', fieldKey: 'business.jobPositionAbbreviation' },
    costCenterScope: { column: 'cost_center_scope', fieldKey: 'business.jobPositionCostCenters' },
    status: { column: 'status', fieldKey: 'business.jobPositionStatus' },
};

function updateJobPosition(id, clientId, { name, abbreviation, costCenterScope, status }) {
    db.prepare(`
        UPDATE job_positions SET name = @name, abbreviation = @abbreviation, cost_center_scope = @costCenterScope, status = @status
        WHERE id = @id AND client_id = @clientId
    `).run({ id, clientId, name, abbreviation: abbreviation || '', costCenterScope: costCenterScope || 'all', status });
    return getJobPositionById(id, clientId);
}

function deleteJobPosition(id, clientId) {
    db.prepare('DELETE FROM job_positions WHERE id = ? AND client_id = ?').run(id, clientId);
}

// --- Query helpers: Estatus RH catalog (Administración de Personal, scoped
// to one client) — see DEFAULT_HR_STATUSES/ensureDefaultHrStatusCatalog
// above for the seed this starts from.
function listHrStatusCatalog(clientId) {
    ensureDefaultHrStatusCatalog(clientId);
    return db.prepare('SELECT * FROM hr_status_catalog WHERE client_id = ? ORDER BY id ASC').all(clientId);
}

function getHrStatusCatalogById(id, clientId) {
    return db.prepare('SELECT * FROM hr_status_catalog WHERE id = ? AND client_id = ?').get(id, clientId);
}

function createHrStatusCatalogEntry({ clientId, name, operationalEffect, status }) {
    const result = db
        .prepare('INSERT INTO hr_status_catalog (client_id, name, operational_effect, status) VALUES (@clientId, @name, @operationalEffect, @status)')
        .run({ clientId, name, operationalEffect: operationalEffect || 'suspended', status: status || 'active' });
    return getHrStatusCatalogById(result.lastInsertRowid, clientId);
}

const HR_STATUS_CATALOG_FIELDS = {
    name: { column: 'name', fieldKey: 'business.hrStatusName' },
    operationalEffect: { column: 'operational_effect', fieldKey: 'business.hrStatusEffect' },
    status: { column: 'status', fieldKey: 'business.hrStatusCatalogStatus' },
};

function updateHrStatusCatalogEntry(id, clientId, { name, operationalEffect, status }) {
    db.prepare(`
        UPDATE hr_status_catalog SET name = @name, operational_effect = @operationalEffect, status = @status
        WHERE id = @id AND client_id = @clientId
    `).run({ id, clientId, name, operationalEffect: operationalEffect || 'suspended', status: status || 'active' });
    return getHrStatusCatalogById(id, clientId);
}

function deleteHrStatusCatalogEntry(id, clientId) {
    db.prepare('DELETE FROM hr_status_catalog WHERE id = ? AND client_id = ?').run(id, clientId);
}

// Estatus Operativo (Business-Accesos.html): 'active' follows the manual
// users.active toggle (habilitar/inactivar) same as before this feature —
// any other bucket ('suspended'/'inactive') is FORCED by the worker's
// current Estatus RH entry, overriding whatever users.active happens to
// hold, and the manual toggle is locked from that screen while it's forced.
function computeOperationalStatus({ active, hrStatusEffect }) {
    if (hrStatusEffect === 'suspended' || hrStatusEffect === 'inactive') return hrStatusEffect;
    return active ? 'active' : 'inactive';
}

// --- Query helpers: Transacciones Inteligentes de Negocio (reports) --------
function mapIntelligentReportColumn(row) {
    let formula = null;
    if (row.formula_json) {
        try { formula = JSON.parse(row.formula_json); } catch { formula = null; }
    }
    return {
        id: row.id,
        type: row.type,
        sourceTableKey: row.source_table_key,
        colKey: row.col_key,
        label: row.label,
        formula,
    };
}

function listIntelligentReports(clientId) {
    return db.prepare('SELECT * FROM intelligent_reports WHERE client_id = ? ORDER BY created_at DESC, id DESC').all(clientId);
}

function getIntelligentReportById(id, clientId) {
    const report = db.prepare('SELECT * FROM intelligent_reports WHERE id = ? AND client_id = ?').get(id, clientId);
    if (!report) return null;
    const columns = db
        .prepare('SELECT * FROM intelligent_report_columns WHERE report_id = ? ORDER BY position ASC')
        .all(id)
        .map(mapIntelligentReportColumn);
    return { ...report, columns };
}

function insertIntelligentReportColumns(reportId, columns) {
    const insert = db.prepare(`
        INSERT INTO intelligent_report_columns (report_id, position, type, source_table_key, col_key, label, formula_json)
        VALUES (@reportId, @position, @type, @sourceTableKey, @colKey, @label, @formulaJson)
    `);
    columns.forEach((col, index) => {
        insert.run({
            reportId,
            position: index,
            type: col.type,
            sourceTableKey: col.sourceTableKey || null,
            colKey: col.colKey || null,
            label: col.label,
            formulaJson: col.formula ? JSON.stringify(col.formula) : null,
        });
    });
}

function createIntelligentReport({ clientId, name, createdBy, columns }) {
    const create = db.transaction(() => {
        const result = db
            .prepare('INSERT INTO intelligent_reports (client_id, name, created_by) VALUES (@clientId, @name, @createdBy)')
            .run({ clientId, name, createdBy });
        insertIntelligentReportColumns(result.lastInsertRowid, columns || []);
        return result.lastInsertRowid;
    });
    return getIntelligentReportById(create(), clientId);
}

function updateIntelligentReport(id, clientId, { name, columns }) {
    const update = db.transaction(() => {
        db.prepare('UPDATE intelligent_reports SET name = @name WHERE id = @id AND client_id = @clientId').run({ id, clientId, name });
        db.prepare('DELETE FROM intelligent_report_columns WHERE report_id = ?').run(id);
        insertIntelligentReportColumns(id, columns || []);
    });
    update();
    return getIntelligentReportById(id, clientId);
}

function deleteIntelligentReport(id, clientId) {
    db.prepare('DELETE FROM intelligent_reports WHERE id = ? AND client_id = ?').run(id, clientId);
}

function authorizeIntelligentReport(id, clientId, authorizedBy) {
    db.prepare(`
        UPDATE intelligent_reports SET authorized_by = @authorizedBy, authorized_at = datetime('now')
        WHERE id = @id AND client_id = @clientId
    `).run({ id, clientId, authorizedBy });
    return getIntelligentReportById(id, clientId);
}

// --- Query helpers: Reportes Programados (scoped to a client) --------------
// reportName rides along via a join purely for display (the create/edit
// modal needs it to show which saved report a schedule points at) -- never
// written back, the real relationship is report_id.
function listScheduledReports(clientId) {
    return db
        .prepare(`
            SELECT scheduled_reports.*, intelligent_reports.name AS reportName
            FROM scheduled_reports JOIN intelligent_reports ON intelligent_reports.id = scheduled_reports.report_id
            WHERE scheduled_reports.client_id = ?
            ORDER BY scheduled_reports.created_at DESC, scheduled_reports.id DESC
        `)
        .all(clientId);
}

function getScheduledReportById(id, clientId) {
    return db
        .prepare(`
            SELECT scheduled_reports.*, intelligent_reports.name AS reportName
            FROM scheduled_reports JOIN intelligent_reports ON intelligent_reports.id = scheduled_reports.report_id
            WHERE scheduled_reports.id = ? AND scheduled_reports.client_id = ?
        `)
        .get(id, clientId);
}

function createScheduledReport({ clientId, reportId, name, createdBy, endDate, deliveryMethod, recipients }) {
    const result = db
        .prepare(`
            INSERT INTO scheduled_reports (client_id, report_id, name, created_by, end_date, delivery_method, recipients)
            VALUES (@clientId, @reportId, @name, @createdBy, @endDate, @deliveryMethod, @recipients)
        `)
        .run({ clientId, reportId, name, createdBy, endDate: endDate || null, deliveryMethod, recipients });
    return getScheduledReportById(result.lastInsertRowid, clientId);
}

function updateScheduledReport(id, clientId, { reportId, name, endDate, deliveryMethod, recipients }) {
    db.prepare(`
        UPDATE scheduled_reports
        SET report_id = @reportId, name = @name, end_date = @endDate, delivery_method = @deliveryMethod, recipients = @recipients
        WHERE id = @id AND client_id = @clientId
    `).run({ id, clientId, reportId, name, endDate: endDate || null, deliveryMethod, recipients });
    return getScheduledReportById(id, clientId);
}

function deleteScheduledReport(id, clientId) {
    db.prepare('DELETE FROM scheduled_reports WHERE id = ? AND client_id = ?').run(id, clientId);
}

function authorizeScheduledReport(id, clientId, authorizedBy) {
    db.prepare(`
        UPDATE scheduled_reports SET authorized_by = @authorizedBy, authorized_at = datetime('now')
        WHERE id = @id AND client_id = @clientId
    `).run({ id, clientId, authorizedBy });
    return getScheduledReportById(id, clientId);
}

// --- Query helpers: Registro Combustible (fuel_records, scoped to a client) -
function listFuelRecords(clientId) {
    return db.prepare('SELECT * FROM fuel_records WHERE client_id = ? ORDER BY record_number ASC').all(clientId);
}

function getFuelRecordById(id, clientId) {
    return db.prepare('SELECT * FROM fuel_records WHERE id = ? AND client_id = ?').get(id, clientId);
}

function createFuelRecord({ clientId, date, ecoUnit, driver, coordinator, centroCostos }) {
    const recordNumber = db
        .prepare('SELECT COALESCE(MAX(record_number), 0) + 1 AS n FROM fuel_records WHERE client_id = ?')
        .get(clientId).n;
    const result = db
        .prepare(`
            INSERT INTO fuel_records (client_id, db_id, record_number, record_date, eco_unit, driver, coordinator, centro_costos)
            VALUES (@clientId, @dbId, @recordNumber, @date, @ecoUnit, @driver, @coordinator, @centroCostos)
        `)
        .run({ clientId, dbId: generateBigDateId(), recordNumber, date, ecoUnit, driver, coordinator, centroCostos: centroCostos || '' });
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
    tripKmBeforeEvidence: { column: 'trip_km_before_evidence', fieldKey: 'main.colFuelTripKmBeforeEvidence' },
    tripKmAfter: { column: 'trip_km_after', fieldKey: 'main.colFuelTripKmAfter' },
    tripKmAfterEvidence: { column: 'trip_km_after_evidence', fieldKey: 'main.colFuelTripKmAfterEvidence' },
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

const SYSTEM_COLUMN_MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const SYSTEM_COLUMN_DAY_ABBR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// The 13 "Control Interno" columns for one row — Empresa/Área/Módulo/
// Pantalla are fixed per table (same value for every row/client) and never
// stored; Fecha/Día/Mes/Año/Semana/Hora are derived from createdAt (when the
// record was actually entered, not the fuel event's own record_date, which
// is a separate pre-existing column) using the same day/month abbreviations
// and week formula OpTransVolCombustible.js already uses client-side for
// Año/Mes/Semana/Día — computed here instead so every table's system columns
// come from one consistent, server-side source, and so a future Reportes
// query can rely on them without re-deriving anything per screen. Centro
// Costos is the one real per-row value, passed in from the stored column.
// Mexico Central Time, fixed (no DST since 2022 in most of the country) —
// hardcoded rather than read from the Node process' own local timezone,
// because that varies by deployment (this dev machine runs -0600, but a
// plain Railway deployment defaults to UTC) and would silently shift "Hora"
// depending on where the server happens to run. created_at is stored in UTC
// (SQLite's datetime('now')); shifting it here, then reading every field
// with the UTC getters, makes the result deterministic regardless of host.
const SYSTEM_COLUMN_UTC_OFFSET_HOURS = -6;

function getSystemColumnsForRecord({ companyName, area, modulo, pantalla, centroCostos, createdAt }) {
    const utc = createdAt ? new Date(`${createdAt.replace(' ', 'T')}Z`) : new Date();
    const d = new Date(utc.getTime() + SYSTEM_COLUMN_UTC_OFFSET_HOURS * 60 * 60 * 1000);
    const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((Math.floor((d - start) / 86400000) + start.getUTCDay() + 1) / 7);
    const pad = (n) => String(n).padStart(2, '0');
    return {
        colSysEmpresa: companyName || '',
        colSysArea: area || '',
        colSysModulo: modulo || '',
        colSysPantalla: pantalla || '',
        colSysCentroCostos: centroCostos || '',
        colSysFecha: `${pad(d.getUTCDate())}/${SYSTEM_COLUMN_MONTH_ABBR[d.getUTCMonth()].toLowerCase()}/${d.getUTCFullYear()}`,
        colSysDiaNum: pad(d.getUTCDate()),
        colSysDiaTexto: SYSTEM_COLUMN_DAY_ABBR[d.getUTCDay()],
        colSysMesNum: pad(d.getUTCMonth() + 1),
        colSysMesTexto: SYSTEM_COLUMN_MONTH_ABBR[d.getUTCMonth()],
        colSysAnio: String(d.getUTCFullYear()),
        colSysSemana: `Sem${week}_${d.getUTCFullYear()}`,
        colSysHora: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
    };
}

const SYSTEM_COLUMN_MONTH_INDEX = SYSTEM_COLUMN_MONTH_ABBR.reduce((map, abbr, i) => {
    map[abbr.toLowerCase()] = i;
    return map;
}, {});

// Turns one raw base-column value into a number a calculated column's
// formula can do arithmetic on -- an operand can be a plain number, a
// currency-formatted amount ($/,), or one of the 2 date shapes this system
// already produces (dd/mmm/aaaa from Control Interno's colSysFecha,
// dd-mm-aa or yyyy-mm-dd from Registro Combustible's own date columns).
// Dates become an epoch day count so "Fecha − Fecha" naturally comes out in
// days. Anything unrecognized returns null (that cell is blank in the
// results, not a crash for the whole report).
function evaluateOperandValue(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const value = raw.trim();

    const cleaned = value.replace(/[$,%\s]/g, '');
    if (cleaned && !Number.isNaN(Number(cleaned)) && /^-?\d+(\.\d+)?$/.test(cleaned)) {
        return Number(cleaned);
    }

    const slashMatch = value.match(/^(\d{1,2})\/([A-Za-zÀ-ÿ]{3,4})\.?\/(\d{4})$/);
    if (slashMatch) {
        const monthIndex = SYSTEM_COLUMN_MONTH_INDEX[slashMatch[2].toLowerCase()];
        if (monthIndex != null) {
            return Math.floor(Date.UTC(Number(slashMatch[3]), monthIndex, Number(slashMatch[1])) / 86400000);
        }
    }

    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return Math.floor(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])) / 86400000);
    }

    const shortMatch = value.match(/^(\d{2})-(\d{2})-(\d{2})$/);
    if (shortMatch) {
        return Math.floor(Date.UTC(2000 + Number(shortMatch[3]), Number(shortMatch[2]) - 1, Number(shortMatch[1])) / 86400000);
    }

    return null;
}

function applyOperator(operator, a, b) {
    if (a == null || b == null) return null;
    switch (operator) {
        case 'add': return a + b;
        case 'subtract': return a - b;
        case 'multiply': return a * b;
        case 'divide': return b === 0 ? null : a / b;
        default: return null;
    }
}

function reportWeekOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - start) / 86400000);
    return Math.ceil((days + start.getDay() + 1) / 7);
}

// A report's "Base de Registro" columns are picked from Base de Datos
// Global's own column list, so they carry ITS colKey ids (colFuelEcoUnit,
// colFuelLiters, ...) -- BaseDatos-Empresa.js's own display ids, several of
// which (colFuelCostPerLiter, colFuelTotal, colFuelDate, colFuelYear, ...)
// are derived on the fly there and never exist as a literal property on the
// mapFuelRecord() record object. A plain record[colKey] lookup (the naive
// approach) silently returns undefined for every one of those -- and for
// EVERY colFuel* key, since even the ones backed by a real field use a
// different property name (record.ecoUnit, not record.colFuelEcoUnit).
// This mirrors BaseDatos-Empresa.js's own buildFuelRow derivations, minus
// its $/L/km cosmetic suffixes and translated labels (a calculated column
// needs to feed these back into evaluateOperandValue as plain numbers, and
// there's no client-side i18n dictionary available on the server) -- money
// fields keep the $ sign since evaluateOperandValue already strips it.
// Falls back to a direct record[colKey] lookup for anything not listed here
// (covers every colSys* Control Interno key today, which mapFuelRecord
// already attaches under that exact property name, and any future table's
// own columns whose colKey already matches its record property 1:1).
function resolveFuelReportColumnValue(record, colKey) {
    const liters = parseFloat(record.liters) || 0;
    const subtotal = parseFloat(record.subtotal) || 0;
    const vat = parseFloat(record.vat) || 0;
    const tripKmBefore = parseFloat(record.tripKmBefore) || 0;
    const tripKmAfter = parseFloat(record.tripKmAfter) || 0;
    const [year, month, day] = (record.date || '').split('-').map(Number);
    const dateObj = year && month && day ? new Date(year, month - 1, day) : null;
    const pad = (n) => String(n).padStart(2, '0');
    switch (colKey) {
        case 'colFuelDbId': return record.dbId;
        case 'colFuelRecordId': return record.recordNumber != null ? String(record.recordNumber) : null;
        case 'colFuelDate': return dateObj ? `${pad(day)}-${pad(month)}-${pad(year % 100)}` : null;
        case 'colFuelYear': return dateObj ? String(year) : null;
        case 'colFuelMonth': return dateObj ? SYSTEM_COLUMN_MONTH_ABBR[month - 1] : null;
        case 'colFuelWeek': return dateObj ? `Sem${reportWeekOfYear(dateObj)}_${year}` : null;
        case 'colFuelDayNum': return dateObj ? String(day) : null;
        case 'colFuelDayText': return dateObj ? SYSTEM_COLUMN_DAY_ABBR[dateObj.getDay()] : null;
        case 'colFuelTicketEvidence': return record.ticketEvidence ? 'Sí' : null;
        case 'colFuelTripKmBefore': return tripKmBefore ? tripKmBefore.toLocaleString() : null;
        case 'colFuelTripKmBeforeEvidence': return record.tripKmBeforeEvidence ? 'Sí' : null;
        case 'colFuelTripKmAfter': return tripKmAfter ? tripKmAfter.toLocaleString() : null;
        case 'colFuelTripKmAfterEvidence': return record.tripKmAfterEvidence ? 'Sí' : null;
        case 'colFuelTripKmTotal': return Math.max(tripKmAfter - tripKmBefore, 0).toLocaleString();
        case 'colFuelLiters': return liters ? liters.toLocaleString() : null;
        case 'colFuelCostPerLiter': return liters > 0 ? `$${(subtotal / liters).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
        case 'colFuelSubtotal': return subtotal ? `$${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
        case 'colFuelVat': return vat ? `$${vat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
        case 'colFuelTotal': return (subtotal || vat) ? `$${(subtotal + vat).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
        case 'colFuelEcoUnit': return record.ecoUnit;
        case 'colFuelPlates': return record.plates;
        case 'colFuelDriver': return record.driver;
        case 'colFuelCoordinator': return record.coordinator;
        case 'colFuelType': return record.fuelType;
        case 'colFuelReason': return record.reason;
        case 'colFuelTransferService': return record.transferService;
        case 'colFuelInternalMovement': return record.internalMovement;
        default: return record[colKey];
    }
}

// Evaluates one report's columns (in position order, so a calculated column
// can reference an earlier one) against every underlying record already
// mapped by its own screen (mapFuelRecord today; a future screen's own
// map*Record concatenates in the same way base-datos-global does). Returns
// one ARRAY per record, one value per report column, in report.columns'
// own order -- never keyed by label, since 2 columns could share the same
// user-given name and a label key would silently drop one. Base columns
// display their raw value untouched (text stays text, e.g. Conductor/
// Placas) -- evaluateOperandValue only ever runs on a value at the moment
// some OTHER (calculated) column references it as an operand, never on a
// base column's own display value, so a text column never gets forced into
// a number just for being shown in the report.
function computeIntelligentReportRows(report, records) {
    return records.map((record) => {
        const rawByPosition = [];
        report.columns.forEach((col) => {
            let displayValue = null;
            if (col.type === 'base') {
                const value = resolveFuelReportColumnValue(record, col.colKey);
                displayValue = value != null && value !== '' ? value : null;
            } else if (col.type === 'calculated' && col.formula) {
                const operandValues = col.formula.operands.map((op) => (
                    op.kind === 'constant' ? op.value : evaluateOperandValue(rawByPosition[op.reportColumnId])
                ));
                const numeric = operandValues.reduce((acc, next, i) => (
                    i === 0 ? next : applyOperator(col.formula.operators[i - 1], acc, next)
                ), null);
                displayValue = numeric == null ? null : Math.round(numeric * 100) / 100;
            }
            rawByPosition.push(displayValue);
        });
        return rawByPosition;
    });
}

// --- Query helpers: Mi Recurso Humano (hr_workers, scoped to a client) ------
// LEFT JOIN so the auto-created account's username/active state rides along
// wherever a worker record is fetched — same pattern as listClients'
// adminUsername join.
function listHrWorkers(clientId) {
    return db
        .prepare(`
            SELECT hr_workers.*, users.username AS username, users.active AS userActive,
                   hr_status_catalog.name AS hrStatusName, hr_status_catalog.operational_effect AS hrStatusEffect
            FROM hr_workers
            LEFT JOIN users ON users.id = hr_workers.user_id
            LEFT JOIN hr_status_catalog ON hr_status_catalog.id = hr_workers.hr_status_id
            WHERE hr_workers.client_id = ?
            ORDER BY hr_workers.record_number ASC
        `)
        .all(clientId);
}

function getHrWorkerById(id, clientId) {
    return db
        .prepare(`
            SELECT hr_workers.*, users.username AS username, users.active AS userActive,
                   hr_status_catalog.name AS hrStatusName, hr_status_catalog.operational_effect AS hrStatusEffect
            FROM hr_workers
            LEFT JOIN users ON users.id = hr_workers.user_id
            LEFT JOIN hr_status_catalog ON hr_status_catalog.id = hr_workers.hr_status_id
            WHERE hr_workers.id = ? AND hr_workers.client_id = ?
        `)
        .get(id, clientId);
}

// First-name-initial + second-name-initial (duplicated if there's only one
// given name; a 3rd+ given name is ignored) + first-2-letters of each of
// up to 2 apellidos (the 2nd duplicated if there's only one apellido) +
// "HRP" (Recurso Humano Propio). Confirmed with the user: "Daniel Anaya
// Pérez" (one given name, 2 apellidos) -> "DDANPEHRP". Collisions are
// resolved by the caller via generateUniqueUsername, same as every other
// auto-provisioned username in this app — this only computes the base.
// Strips accents (é -> e, ñ -> n, ...) so "Pérez" contributes "PE", not
// "PÉ" — confirmed by the user's own example, which uses plain ASCII.
function stripAccents(word) {
    return (word || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function computeHrUsername(givenNames, surnames) {
    const given = (givenNames || '').trim().split(/\s+/).filter(Boolean);
    const sur = (surnames || '').trim().split(/\s+/).filter(Boolean);
    const initial = (word) => stripAccents(word).charAt(0).toUpperCase();
    const first2 = (word) => stripAccents(word).slice(0, 2).toUpperCase();
    const g1 = initial(given[0]);
    const g2 = initial(given[1] || given[0]);
    const s1 = first2(sur[0]);
    const s2 = first2(sur[1] || sur[0]);
    return `${g1}${g2}${s1}${s2}HRP`;
}

// "# Único de Registro" display format, confirmed with the user: 3 letters
// of the company's own abbreviation + the assigned Centro de Costos' code
// (or SCC, "sin centro de costos", when none is assigned) + a fixed
// 3-letter code for this screen + the creation consecutivo (record_number).
// Frozen at creation time (like db_id) rather than recomputed on every
// render — a client renaming its abbreviation, or a cost center's code
// changing, later must not retroactively rewrite an already-issued
// worker's record number.
const HR_RECORD_SCREEN_CODE = 'MRH';
function computeHrRecordCode(clientId, costCenterId, recordNumber) {
    const client = getClientById(clientId);
    const companyCode = stripAccents(client?.company_abbreviation || client?.company_name || '')
        .replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3) || 'CLI';
    const costCenter = costCenterId ? getCostCenterById(costCenterId, clientId) : null;
    const costCenterCode = costCenter ? costCenter.code : 'SCC';
    return `${companyCode}${costCenterCode}${HR_RECORD_SCREEN_CODE}${recordNumber}`;
}

// 6-digit accounting account number ("000001", "000002"...) -- clients and
// cost centers both get one of these (see the migration blocks above),
// clients global across the SaaS, cost centers sequential per client.
function padAccountNumber(n) {
    return String(n).padStart(6, '0');
}

// Centro de Costos' own "# Registro Único Base de Datos" -- same composite-
// code idea as computeHrRecordCode just above (company abbreviation + this
// record's own code + a fixed 3-letter screen code + its own 6-digit
// account_number), frozen at creation for the same reason: a later rename
// (company abbreviation, or this cost center's own code) must not
// retroactively rewrite an already-issued record's code.
const COST_CENTER_RECORD_SCREEN_CODE = 'CCT';
function computeCostCenterRecordCode(clientId, code, accountNumber) {
    const client = getClientById(clientId);
    const companyCode = stripAccents(client?.company_abbreviation || client?.company_name || '')
        .replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3) || 'CLI';
    return `${companyCode}${code}${COST_CENTER_RECORD_SCREEN_CODE}${padAccountNumber(accountNumber)}`;
}

// A Centro de Costos' own código -- Empresa + País + Estado + Localidad +
// Calle + Sucursal, one letter each (see the cascading picker in
// Business-CentrosCosto.js). Unlike record_code above, this one is allowed
// to change on edit, since it exists to describe the currently-selected
// location, not to act as a permanent accounting reference.
function costCenterCodeLetter(word) {
    return (stripAccents(word || '').trim().charAt(0) || 'X').toUpperCase();
}
function buildCostCenterCodeBase(client, countryId, stateId, localityId, streetId, sucursal) {
    const country = countryId ? db.prepare('SELECT name FROM geo_countries WHERE id = ?').get(countryId) : null;
    const state = stateId ? db.prepare('SELECT name FROM geo_states WHERE id = ?').get(stateId) : null;
    const locality = localityId ? db.prepare('SELECT name FROM geo_localities WHERE id = ?').get(localityId) : null;
    const street = streetId ? db.prepare('SELECT name FROM geo_streets WHERE id = ?').get(streetId) : null;
    return [
        client?.company_abbreviation || client?.company_name,
        country?.name, state?.name, locality?.name, street?.name, sucursal,
    ].map(costCenterCodeLetter).join('');
}
// Two different real places can share the same 6 first letters (two states
// both starting with "J", say) -- rather than reject the second one, append
// "-2", "-3"... until it's unique for this client. excludeId lets an edit
// re-check against every OTHER cost center without colliding with itself.
function generateUniqueCostCenterCode(clientId, baseCode, excludeId) {
    const exists = db.prepare('SELECT 1 FROM cost_centers WHERE client_id = ? AND code = ? AND id != ?');
    let candidate = baseCode;
    let n = 2;
    while (exists.get(clientId, candidate, excludeId || 0)) {
        candidate = `${baseCode}-${n}`;
        n += 1;
    }
    return candidate;
}

// Also creates the worker's own login account in the same step — "en
// automático se crea el único Usuario asignado" — but INACTIVE with an
// unusable throwaway password until activateHrWorkerUser below is called
// from the table (that's the only place a real, usable password ever gets
// issued). async because hashing can't happen inside db.transaction()
// (must stay fully synchronous — see activateClient's own note above).
async function createHrWorker({ clientId, givenNames, surnames, position, startDate, departments, costCenterId, email }) {
    const fullName = `${givenNames} ${surnames}`.replace(/\s+/g, ' ').trim();
    const username = generateUniqueUsername(computeHrUsername(givenNames, surnames));
    const passwordHash = await hashPassword(generateRandomPassword());

    const recordNumber = db
        .prepare('SELECT COALESCE(MAX(record_number), 0) + 1 AS n FROM hr_workers WHERE client_id = ?')
        .get(clientId).n;
    const recordCode = computeHrRecordCode(clientId, costCenterId, recordNumber);
    // Outside the transaction below since it may itself seed (and thus
    // write to) hr_status_catalog on this client's very first worker.
    const activeHrStatusId = getDefaultActiveHrStatusId(clientId);

    const create = db.transaction(() => {
        const user = createUser({
            username, email, passwordHash, name: fullName,
            clientId, isClientAdmin: false, active: false,
        });
        const result = db
            .prepare(`
                INSERT INTO hr_workers (
                    client_id, db_id, record_number, record_code, given_names, surnames, full_name,
                    position, start_date, department, departments, cost_center_id, email, user_id, hr_status_id
                )
                VALUES (
                    @clientId, @dbId, @recordNumber, @recordCode, @givenNames, @surnames, @fullName,
                    @position, @startDate, @department, @departments, @costCenterId, @email, @userId, @hrStatusId
                )
            `)
            .run({
                clientId, dbId: generateBigDateId(), recordNumber, recordCode, givenNames, surnames, fullName,
                position, startDate,
                // Legacy single-value column, kept NOT NULL by its original
                // schema (no default) — no longer read anywhere (departments
                // below is authoritative), just satisfied here so the insert
                // doesn't fail its constraint.
                department: (departments && departments[0]) || '',
                departments: JSON.stringify(departments || []),
                costCenterId: costCenterId || null, email, userId: user.id, hrStatusId: activeHrStatusId,
            });
        return result.lastInsertRowid;
    });
    return getHrWorkerById(create(), clientId);
}

// Issues a brand-new password and turns on login for this worker's account
// — the only way it ever becomes usable, since createHrWorker always
// leaves it inactive. Safe to call again later too (e.g. the employee
// forgot their password): always issues a fresh one and returns it
// exactly once, same convention as every other auto-provisioned account
// in this app (see activateClient). Returns null if this worker has no
// linked account (shouldn't happen for anything created after this
// feature shipped).
async function activateHrWorkerUser(workerId, clientId) {
    const worker = getHrWorkerById(workerId, clientId);
    if (!worker || !worker.user_id) return null;
    const password = generateRandomPassword();
    const passwordHash = await hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, active = 1 WHERE id = ?').run(passwordHash, worker.user_id);
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(worker.user_id);
    return { username: user.username, password };
}

const HR_WORKER_PATCHABLE_FIELDS = {
    area: { column: 'area', fieldKey: 'main.colHrArea' },
    email: { column: 'email', fieldKey: 'main.colHrEmail' },
    phone: { column: 'phone', fieldKey: 'main.colHrPhone' },
    hrStatusId: { column: 'hr_status_id', fieldKey: 'main.colHrStatus' },
    departments: { column: 'departments', fieldKey: 'main.colHrDepartment' },
    costCenterId: { column: 'cost_center_id', fieldKey: 'main.colHrCostCenter' },
};

// departments arrives already JSON-stringified by the caller (server.js) —
// never re-serialized here, so it diffs/compares as a plain string exactly
// like every other column (see checkAndLogFieldChanges' raw-value diff).
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
    // A status whose catalog entry is marked "Inactivo" (e.g. Rescisión de
    // Contrato) also revokes the worker's login, matching the old
    // status='inactive' cascade this replaces. Does NOT auto-reactivate when
    // it moves off that entry — restoring login needs an explicit "Activar"
    // click, same as a brand-new worker. A "Suspendido" entry (vacaciones,
    // incapacidad, permisos...) does NOT revoke login by itself — Estatus
    // Operativo (see computeOperationalStatus) already blocks their access
    // independently of users.active while their status stays in that bucket.
    if (Object.prototype.hasOwnProperty.call(patch, 'hrStatusId')) {
        const entry = db.prepare('SELECT operational_effect FROM hr_status_catalog WHERE id = ? AND client_id = ?').get(patch.hrStatusId, clientId);
        if (entry?.operational_effect === 'inactive') {
            const worker = getHrWorkerById(id, clientId);
            if (worker?.user_id) db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(worker.user_id);
        }
    }
    return getHrWorkerById(id, clientId);
}

function deleteHrWorker(id, clientId) {
    db.prepare('DELETE FROM hr_workers WHERE id = ? AND client_id = ?').run(id, clientId);
}

// --- One-time data migration: seed "Ver y Operar" for pre-existing access --
// Before this round, filling an EMPTY cell in these tables was always
// unrestricted for anyone who could see the pantalla at all (no grant check
// server-side, ever), and "can re-edit an already-saved value" was a single
// flat leaf (`${submenuPrefix}/${colKey}`, no level). Both branches of
// checkAndLogFieldChanges now require an explicit Ver y Operar/Editar grant
// per column — without this one-time seed, every profile/user that could
// already use these tables would suddenly be unable to fill so much as an
// empty cell. Confirmed with the user: seed Ver y Operar for anyone who
// already sees the pantalla (its own visibility leaf) OR still holds the
// old flat single-checkbox column grant.
//
// A grant can cover a leaf via 3 tiers, same as PermissionTree.js's own
// isGranted()/Dashboard.js's hasSettingsSubPermission: an exact match, OR a
// broader item-level grant (submenu_id IS NULL), OR a broader section-level
// grant (item_id IS NULL AND submenu_id IS NULL) — a lingering grant from
// before Área/Apartado/Pantalla existed would otherwise be invisible to
// this migration and silently lose today's blanket fill-access.
//
// Runs exactly ONCE, ever (tracked in schema_migrations_data, never
// re-derived from current grant state) — an admin who later intentionally
// revokes a column's access must not be silently re-granted on the next
// server restart. The legacy flat-shape grant is deleted as part of the
// same seed, which is what makes that guarantee hold: once deleted, the
// "still holds the old flat grant" trigger can never fire again for that
// owner+table on a later run (moot anyway once the marker row exists, but
// keeps this function safe to call more than once if that ever changes).
const COLUMN_LEVEL_SEED_KEY = 'seed-ver-y-operar-column-levels-v1';
function seedColumnLevelGrants() {
    if (db.prepare('SELECT 1 FROM schema_migrations_data WHERE key = ?').get(COLUMN_LEVEL_SEED_KEY)) return;

    const tableColumns = {
        'registro-combustible': Object.values(FUEL_PATCHABLE_FIELDS).map((f) => f.fieldKey.split('.').pop()),
        'mi-recurso-humano': Object.values(HR_WORKER_PATCHABLE_FIELDS).map((f) => f.fieldKey.split('.').pop()),
        'centros-costo': Object.values(COST_CENTER_FIELDS).map((f) => f.fieldKey.split('.').pop()),
    };

    const seed = db.transaction(() => {
        for (const [ownerTable, ownerColumn] of [['profile_grants', 'profile_id'], ['user_grants', 'user_id']]) {
            for (const [tableKey, path] of Object.entries(TABLE_GRANT_PATHS)) {
                const columns = tableColumns[tableKey] || [];
                if (!columns.length) continue;

                const legacyIds = columns.map((c) => `${path.submenuPrefix}/${c}`);
                const owners = db.prepare(`
                    SELECT DISTINCT ${ownerColumn} AS ownerId FROM ${ownerTable}
                    WHERE section_id = ? AND (
                        (item_id = ? AND (submenu_id = ? OR submenu_id IN (${legacyIds.map(() => '?').join(',')})))
                        OR (item_id = ? AND submenu_id IS NULL)
                        OR (item_id IS NULL AND submenu_id IS NULL)
                    )
                `).all(path.sectionId, path.itemId, path.submenuPrefix, ...legacyIds, path.itemId);

                if (!owners.length) continue;

                const hasGrant = db.prepare(`SELECT 1 FROM ${ownerTable} WHERE ${ownerColumn} = ? AND section_id = ? AND item_id = ? AND submenu_id = ?`);
                const insertGrant = db.prepare(`INSERT INTO ${ownerTable} (${ownerColumn}, section_id, item_id, submenu_id) VALUES (?, ?, ?, ?)`);
                const deleteLegacy = db.prepare(`DELETE FROM ${ownerTable} WHERE ${ownerColumn} = ? AND section_id = ? AND item_id = ? AND submenu_id = ?`);

                owners.forEach(({ ownerId }) => {
                    if (!hasGrant.get(ownerId, path.sectionId, path.itemId, path.submenuPrefix)) {
                        insertGrant.run(ownerId, path.sectionId, path.itemId, path.submenuPrefix);
                    }
                    columns.forEach((colKey) => {
                        const base = `${path.submenuPrefix}/${colKey}`;
                        const hasAnyLevel = ['solo-ver', 'ver-y-operar', 'editar'].some((level) => (
                            hasGrant.get(ownerId, path.sectionId, path.itemId, `${base}/${level}`)
                        ));
                        if (!hasAnyLevel) {
                            insertGrant.run(ownerId, path.sectionId, path.itemId, `${base}/ver-y-operar`);
                        }
                        deleteLegacy.run(ownerId, path.sectionId, path.itemId, base);
                    });
                });
            }
        }
        db.prepare('INSERT INTO schema_migrations_data (key) VALUES (?)').run(COLUMN_LEVEL_SEED_KEY);
    });
    seed();
    console.log('[db] Seeded Ver y Operar for pre-existing column access (one-time migration).');
}
seedColumnLevelGrants();

// --- One-time data migration: seed pantalla-visibility for pre-existing --
// --- access ("Pantalla habilitada" in the permission tree) ---------------
// Before this round, the department sidebar showed every pantalla (real
// and placeholder) inside a contracted department to any user, regardless
// of their profile's grants — the pantalla checkbox in the tree was purely
// informational. Now the sidebar (and, for the handful of pantallas with a
// real page, direct URL navigation too — see SCREEN_GRANT_PATHS in
// Dashboard.js) filters by grant. Without this seed, every existing
// profile/user would suddenly see an empty (or near-empty) sidebar for
// departments they use today, since almost none were ever configured
// leaf-by-leaf at the pantalla level — it had no effect before now, so
// there was no reason to.
//
// For every profile/user that already has SOME grant intersecting a given
// {sectionId, areaId} (any submenuId under it, or a broader área/
// departamento "select all"), seeds full pantalla-leaf visibility for
// EVERY pantalla under that área — walking the same areaCategories/
// areaOverrides template PermissionTree.js and Dashboard.js's own sidebar
// chain already use, read directly from public/data/menu.json (the single
// source of truth for the tree shape, not a hand-copied duplicate). Runs
// exactly once (schema_migrations_data), same reasoning as
// seedColumnLevelGrants above: an admin who later intentionally restricts
// a profile's screens must not be silently re-granted on the next restart.
const SCREEN_VISIBILITY_SEED_KEY = 'seed-screen-visibility-v1';
// Must match GENERIC_AREAS in PermissionTree.js/Dashboard.js exactly — the
// fallback área list for any department with no real named áreas.
const GENERIC_AREA_IDS = ['area-1', 'area-2', 'area-3'];

function categoriesForAreaServer(sectionId, areaId, categories, areaOverrides) {
    const overrides = areaOverrides && areaOverrides[`${sectionId}/${areaId}`];
    if (!overrides) return categories;
    return categories.map((cat) => (
        overrides[cat.id] && overrides[cat.id].length ? { ...cat, submenu: overrides[cat.id] } : cat
    ));
}

function seedScreenVisibilityGrants() {
    if (db.prepare('SELECT 1 FROM schema_migrations_data WHERE key = ?').get(SCREEN_VISIBILITY_SEED_KEY)) return;

    let menuJson;
    try {
        menuJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'data', 'menu.json'), 'utf8'));
    } catch (err) {
        console.error('[db] Could not read menu.json for screen-visibility migration, skipping:', err.message);
        return;
    }
    const departmentIds = (menuJson.sections || []).map((s) => s.id).filter((id) => id !== 'main');
    const areaCategories = menuJson.areaCategories || [];
    const areaOverrides = menuJson.areaOverrides || {};
    const areasByDept = menuJson.areas || {};

    const seed = db.transaction(() => {
        for (const [ownerTable, ownerColumn] of [['profile_grants', 'profile_id'], ['user_grants', 'user_id']]) {
            for (const sectionId of departmentIds) {
                const areaIds = areasByDept[sectionId] ? areasByDept[sectionId].map((a) => a.id) : GENERIC_AREA_IDS;
                for (const itemId of areaIds) {
                    // Owners with ANY existing grant intersecting this área
                    // (exact leaf under it, OR the whole área/department
                    // broadly "select all"-ed).
                    const owners = db.prepare(`
                        SELECT DISTINCT ${ownerColumn} AS ownerId FROM ${ownerTable}
                        WHERE (section_id = ? AND item_id = ?)
                           OR (section_id = ? AND item_id IS NULL AND submenu_id IS NULL)
                    `).all(sectionId, itemId, sectionId);
                    if (!owners.length) continue;

                    const categories = categoriesForAreaServer(sectionId, itemId, areaCategories, areaOverrides);
                    const submenuIds = categories.flatMap((cat) => (cat.submenu || []).map((pantalla) => `${cat.id}/${pantalla.id}`));
                    if (!submenuIds.length) continue;

                    const hasGrant = db.prepare(`SELECT 1 FROM ${ownerTable} WHERE ${ownerColumn} = ? AND section_id = ? AND item_id = ? AND submenu_id = ?`);
                    const insertGrant = db.prepare(`INSERT INTO ${ownerTable} (${ownerColumn}, section_id, item_id, submenu_id) VALUES (?, ?, ?, ?)`);
                    owners.forEach(({ ownerId }) => {
                        submenuIds.forEach((submenuId) => {
                            if (!hasGrant.get(ownerId, sectionId, itemId, submenuId)) {
                                insertGrant.run(ownerId, sectionId, itemId, submenuId);
                            }
                        });
                    });
                }
            }
        }
        db.prepare('INSERT INTO schema_migrations_data (key) VALUES (?)').run(SCREEN_VISIBILITY_SEED_KEY);
    });
    seed();
    console.log('[db] Seeded pantalla visibility for pre-existing department/área access (one-time migration).');
}
seedScreenVisibilityGrants();

// --- One-time data migration: seed acciones-por-pantalla for pre-existing --
// --- Equipo SaaS grants ---------------------------------------------------
// Before this round, a bare {itemId, subItemId: null} row in
// saas_user_grants meant "full access to that screen" (create/edit/
// activate, everything) — the "Accesos de esta cuenta SaaS" modal was a
// flat per-screen checkbox. Now that same tuple means "Ver" only, with
// Editar/Crear/Activar as independent opt-in leaves (see the tree built in
// Admin-EquipoSaaS.js and the grant checks added throughout server.js).
// Without this seed, any admin who was ALREADY restricted to specific
// screens would suddenly lose every action on them the moment this
// deployed. Deliberately does NOT touch 'activate' under saas-plans
// (Autorizar Planes) — that was already its own independent opt-in leaf
// before this change and still is; a plain "sees Nuestros Planes" grant
// never implied it, so backfilling it here would be a privilege escalation,
// not a preservation of existing access. Runs exactly once
// (schema_migrations_data), same reasoning as the two migrations above.
const SAAS_ACTIONS_SEED_KEY = 'seed-saas-screen-actions-v1';
const SAAS_SCREEN_BACKFILL_SUBITEMS = {
    'saas-clients': ['editar', 'crear', 'activar'],
    'saas-plans': ['editar', 'crear'],
    'saas-module-costs': ['editar'],
};
function seedSaasScreenActionGrants() {
    if (db.prepare('SELECT 1 FROM schema_migrations_data WHERE key = ?').get(SAAS_ACTIONS_SEED_KEY)) return;

    const baseRows = db.prepare('SELECT user_id AS userId, item_id AS itemId FROM saas_user_grants WHERE sub_item_id IS NULL').all();
    const hasGrant = db.prepare('SELECT 1 FROM saas_user_grants WHERE user_id = ? AND item_id = ? AND sub_item_id = ?');
    const insertGrant = db.prepare('INSERT INTO saas_user_grants (user_id, item_id, sub_item_id) VALUES (?, ?, ?)');

    const seed = db.transaction(() => {
        baseRows.forEach(({ userId, itemId }) => {
            (SAAS_SCREEN_BACKFILL_SUBITEMS[itemId] || []).forEach((subItemId) => {
                if (!hasGrant.get(userId, itemId, subItemId)) insertGrant.run(userId, itemId, subItemId);
            });
        });
        db.prepare('INSERT INTO schema_migrations_data (key) VALUES (?)').run(SAAS_ACTIONS_SEED_KEY);
    });
    seed();
    console.log('[db] Seeded Equipo SaaS per-screen actions for pre-existing restricted admins (one-time migration).');
}
seedSaasScreenActionGrants();

// --- Query helpers: plans (Planes y Paquetes, GEIPSA-wide, not per-client) ---
// modules is stored as a JSON array of MODULE_CATALOG keys; costCentersLimit
// mirrors clients.cost_centers_limit. Together they're the same shape
// Contrataciones edits per-client — see applyPlanToClient in server.js.
function deserializePlan(row) {
    if (!row) return row;
    const { modules, cost_centers_limit, created_by, end_date, locked, cost_per_cost_center, app_id, ...rest } = row;
    let parsedModules = [];
    try { parsedModules = JSON.parse(modules) || []; } catch { parsedModules = []; }
    return {
        ...rest, // currency passes through as-is (already camelCase-compatible column name)
        modules: parsedModules,
        costCentersLimit: cost_centers_limit,
        createdBy: created_by || '',
        endDate: end_date || '',
        locked: !!locked,
        costPerCostCenter: cost_per_cost_center || 0,
    };
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

// New plans start in 'revision' — they only reach 'active' through the
// dedicated activatePlan() below (gated server-side by the 'activate'
// SaaS grant), never directly via a plain field edit.
function createPlan({ name, description, modules, costCentersLimit, createdBy }) {
    const result = db
        .prepare(`
            INSERT INTO plans (name, description, modules, cost_centers_limit, created_by, status)
            VALUES (@name, @description, @modules, @costCentersLimit, @createdBy, 'revision')
        `)
        .run({
            name, description: description || '',
            modules: JSON.stringify(modules || []), costCentersLimit: costCentersLimit || 0,
            createdBy: createdBy || '',
        });
    return getPlanById(result.lastInsertRowid);
}

// Definition fields (name/description/modules/costCentersLimit) are the
// caller's responsibility to block once a plan is locked — see
// server.js's PATCH route, which checks `locked` before calling this at
// all. status/endDate/currency/costPerCostCenter are always editable
// regardless of lock — status/endDate are lifecycle fields (marking a plan
// Inactivo, or giving it an end date, isn't "redefining what it grants"),
// and currency/costPerCostCenter are pricing, a separate ongoing commercial
// concern from the frozen access-tree definition (see Costo Accesos-Permisos).
function updatePlan(id, {
    name, description, modules, costCentersLimit, status, endDate, currency, costPerCostCenter,
    createdAt, createdBy,
}) {
    const existing = getPlanById(id);
    db.prepare(`
        UPDATE plans SET name = @name, description = @description, modules = @modules,
            cost_centers_limit = @costCentersLimit, status = @status, end_date = @endDate,
            currency = @currency, cost_per_cost_center = @costPerCostCenter,
            created_at = @createdAt, created_by = @createdBy
        WHERE id = @id
    `).run({
        id,
        name: name ?? existing.name,
        description: (description ?? existing.description) || '',
        modules: JSON.stringify(modules ?? existing.modules ?? []),
        costCentersLimit: costCentersLimit ?? existing.costCentersLimit ?? 0,
        status: status ?? existing.status ?? 'active',
        endDate: endDate ?? existing.end_date ?? null,
        currency: currency ?? existing.currency ?? 'MXN',
        costPerCostCenter: costPerCostCenter ?? existing.costPerCostCenter ?? 0,
        createdAt: createdAt ?? existing.created_at,
        createdBy: (createdBy ?? existing.createdBy) || '',
    });
    return getPlanById(id);
}

function lockPlan(id) {
    db.prepare('UPDATE plans SET locked = 1 WHERE id = ?').run(id);
    return getPlanById(id);
}

// The one-time gate: 'revision' -> 'active'. Locks the plan's definition
// (name/description/modules/costCentersLimit/access tree) for good in the
// same step — once a plan has gone live, its shape is final, even if it's
// later marked Inactivo (status can still move active <-> inactive freely
// after this, see updatePlan — but locked never clears).
function activatePlan(id) {
    db.prepare("UPDATE plans SET status = 'active', locked = 1 WHERE id = ?").run(id);
    return getPlanById(id);
}

function deletePlan(id) {
    db.prepare('DELETE FROM plans WHERE id = ?').run(id);
}

// --- Nuestras APPs ---------------------------------------------------------
// Catalog of Web screens/tables an App screen is allowed to map to — the
// same keys TABLE_GRANT_PATHS above already uses for column-level
// permissions, so "which table does this App screen fill" and "how do we
// check its permission grants" are always the same key, never two catalogs
// drifting apart.
// labelKey matches that screen's own entry in menu.json exactly, so the
// "which Web screen" picker always shows the same name (in whichever
// language is active) as the screen itself does everywhere else.
const WEB_SCREEN_CATALOG = [
    { key: 'centros-costo', labelKey: 'menu.ourCostCenters' },
    { key: 'registro-combustible', labelKey: 'menu.opTransVolCombustible' },
    { key: 'mi-recurso-humano', labelKey: 'menu.opRrhhMiRecursoHumano' },
    { key: 'transacciones-inteligentes', labelKey: 'menu.smartBusinessTransactions' },
    { key: 'reportes-programados', labelKey: 'menu.scheduledReportsScreen' },
    { key: 'reglas-orden-llenado', labelKey: 'menu.fieldRulesGroup' },
];

function deserializeSaasApp(row) {
    if (!row) return row;
    const { color_from, color_to, created_at, created_by, ...rest } = row;
    return { ...rest, colorFrom: color_from, colorTo: color_to, createdAt: created_at, createdBy: created_by || '' };
}

function listSaasApps() {
    const apps = db.prepare('SELECT * FROM saas_apps ORDER BY name ASC').all().map(deserializeSaasApp);
    const screenCounts = db.prepare('SELECT app_id, COUNT(*) AS n FROM saas_app_screens GROUP BY app_id').all();
    const screenMap = Object.fromEntries(screenCounts.map((r) => [r.app_id, r.n]));
    return apps.map((a) => ({ ...a, screenCount: screenMap[a.id] || 0 }));
}

function getSaasAppById(id) {
    const app = deserializeSaasApp(db.prepare('SELECT * FROM saas_apps WHERE id = ?').get(id));
    if (!app) return app;
    const screens = db
        .prepare('SELECT id, name, screen_type AS screenType, web_screen_key AS webScreenKey, position FROM saas_app_screens WHERE app_id = ? ORDER BY position ASC, id ASC')
        .all(id);
    return { ...app, screens };
}

// Every ACTIVE app's sector — what Nuestros Clientes' Sector picker offers
// (Inactivo/Desarrollo apps never appear there, even if their sector is
// already set — see Nuestras APPs redesign).
function listActiveAppSectors() {
    return db
        .prepare("SELECT sector, name, icon, color_from AS colorFrom, color_to AS colorTo FROM saas_apps WHERE status = 'active' AND sector != '' ORDER BY sector ASC")
        .all();
}

// What a given client sees in the "Aplicación Móvil" permission tab and
// (later) their phone's home screen: their assigned App (found by matching
// clients.sector_negocio against an ACTIVE saas_apps.sector — same rule as
// validateSectorNegocio in server.js) and its screens, each enriched with
// where its underlying Web screen lives (from TABLE_GRANT_PATHS) so the
// permission tree can check "does the Web screen already have a grant"
// without duplicating that lookup client-side.
function getClientAppScreens(clientId) {
    const client = getClientById(clientId);
    if (!client || !client.sector_negocio) return { app: null, screens: [] };
    const app = db.prepare("SELECT * FROM saas_apps WHERE sector = ? AND status = 'active'").get(client.sector_negocio);
    if (!app) return { app: null, screens: [] };
    const rawScreens = db
        .prepare('SELECT id, name, web_screen_key AS webScreenKey, position FROM saas_app_screens WHERE app_id = ? ORDER BY position ASC, id ASC')
        .all(app.id);
    const screens = rawScreens.map((s) => {
        const catalogEntry = WEB_SCREEN_CATALOG.find((w) => w.key === s.webScreenKey);
        const path = TABLE_GRANT_PATHS[s.webScreenKey];
        return {
            ...s,
            webScreenLabelKey: catalogEntry ? catalogEntry.labelKey : s.webScreenKey,
            sectionId: path ? path.sectionId : null,
            itemId: path ? path.itemId : null,
            submenuPrefix: path ? path.submenuPrefix : null,
        };
    });
    return {
        app: { id: app.id, name: app.name, sector: app.sector, icon: app.icon, colorFrom: app.color_from, colorTo: app.color_to },
        screens,
    };
}

function createSaasApp({ name, icon, colorFrom, colorTo, sector, status, createdBy }) {
    const result = db
        .prepare('INSERT INTO saas_apps (name, icon, color_from, color_to, sector, status, created_by) VALUES (@name, @icon, @colorFrom, @colorTo, @sector, @status, @createdBy)')
        .run({
            name, icon: icon || 'bx-mobile-alt',
            colorFrom: colorFrom || '#6C7CF0', colorTo: colorTo || '#3A4BC9',
            sector: sector || '', status: status || 'active', createdBy: createdBy || '',
        });
    return getSaasAppById(result.lastInsertRowid);
}

function updateSaasApp(id, { name, icon, colorFrom, colorTo, sector, status }) {
    const existing = getSaasAppById(id);
    db.prepare(`
        UPDATE saas_apps SET name = @name, icon = @icon, color_from = @colorFrom, color_to = @colorTo,
            sector = @sector, status = @status
        WHERE id = @id
    `).run({
            id,
            name: name ?? existing.name,
            icon: icon ?? existing.icon,
            colorFrom: colorFrom ?? existing.colorFrom,
            colorTo: colorTo ?? existing.colorTo,
            sector: sector ?? existing.sector,
            status: status ?? existing.status,
        });
    return getSaasAppById(id);
}

function deleteSaasApp(id) {
    db.prepare('DELETE FROM saas_apps WHERE id = ?').run(id);
}

function addSaasAppScreen(appId, { name, screenType, webScreenKey }) {
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM saas_app_screens WHERE app_id = ?').get(appId).maxPos;
    db.prepare('INSERT INTO saas_app_screens (app_id, name, screen_type, web_screen_key, position) VALUES (@appId, @name, @screenType, @webScreenKey, @position)')
        .run({ appId, name, screenType: screenType || 'guided', webScreenKey, position: maxPos + 1 });
    return getSaasAppById(appId);
}

function deleteSaasAppScreen(appId, screenId) {
    db.prepare('DELETE FROM saas_app_screens WHERE id = ? AND app_id = ?').run(screenId, appId);
    return getSaasAppById(appId);
}

function getPlanGrants(planId) {
    return db
        .prepare('SELECT section_id AS sectionId, item_id AS itemId, submenu_id AS submenuId FROM plan_grants WHERE plan_id = ?')
        .all(planId);
}

function setPlanGrants(planId, grants) {
    const replace = db.transaction((rows) => {
        db.prepare('DELETE FROM plan_grants WHERE plan_id = ?').run(planId);
        const insert = db.prepare(`
            INSERT INTO plan_grants (plan_id, section_id, item_id, submenu_id)
            VALUES (@planId, @sectionId, @itemId, @submenuId)
        `);
        for (const g of rows) {
            insert.run({ planId, sectionId: g.sectionId, itemId: g.itemId || null, submenuId: g.submenuId || null });
        }
    });
    replace(grants);
    return getPlanGrants(planId);
}

// Replaces the old manual module-toggle checklist on "Editar plan" — a
// MODULE_CATALOG key (department, or a 'main'-section button like
// btn-mensajes) turns on automatically the moment ANY permission under it
// gets granted in this plan's access tree (the shield-icon modal), not
// only when everything under it is fully granted (unlike
// syncClientModulesFromPermissionGrants below, which requires 100%
// coverage — a PLAN's own module list is meant to be a coarse "does this
// plan touch this department at all" flag, not a billing gate). Only ever
// ADDS — never auto-disables a module an admin already turned on, so
// unchecking every grant under a department doesn't silently revoke it.
function syncPlanModulesFromGrants(planId) {
    const plan = getPlanById(planId);
    if (!plan) return false;
    const grants = getPlanGrants(planId);
    const modulesSet = new Set(plan.modules);
    let changed = false;

    MODULE_CATALOG.forEach((m) => {
        if (modulesSet.has(m.key)) return;
        const hasAnyGrant = grants.some((g) => g.sectionId === m.key || (g.sectionId === 'main' && g.itemId === m.key));
        if (hasAnyGrant) { modulesSet.add(m.key); changed = true; }
    });

    if (changed) updatePlan(planId, { modules: Array.from(modulesSet) });
    return changed;
}

function getPlanPermissionCosts(planId) {
    return db
        .prepare('SELECT section_id AS sectionId, item_id AS itemId, submenu_id AS submenuId, cost FROM plan_permission_costs WHERE plan_id = ?')
        .all(planId);
}

function setPlanPermissionCosts(planId, costs) {
    const replace = db.transaction((rows) => {
        db.prepare('DELETE FROM plan_permission_costs WHERE plan_id = ?').run(planId);
        const insert = db.prepare(`
            INSERT INTO plan_permission_costs (plan_id, section_id, item_id, submenu_id, cost)
            VALUES (@planId, @sectionId, @itemId, @submenuId, @cost)
        `);
        for (const c of rows) {
            if (!(Number(c.cost) > 0)) continue; // sparse storage, same convention as plan_grants (no zero-value rows)
            insert.run({
                planId, sectionId: c.sectionId, itemId: c.itemId || null, submenuId: c.submenuId || null,
                cost: Math.max(0, Number(c.cost) || 0),
            });
        }
    });
    replace(costs);
    return getPlanPermissionCosts(planId);
}

// --- buildPlanTreeSections / computeCostTotalForGrantSet: walk the SAME ---
// --- universal tree PermissionTree.js builds, for whichever grant set ----
// --- actually needs gating (a client's ADDITIONAL cost, not a plan's own
// --- total — see computeAccessCostTotal below, which is just a plain sum)
// This is a hand-kept-in-sync port of PermissionTree.js's init()/render()
// tree-construction logic (browser code can't be required from Node in this
// bundler-less multi-page app — same reasoning as categoriesForAreaServer
// above). A plan's tree is ALWAYS the full universal one (allowedSectionIds:
// null, costCenters: []), so this only needs to port that one code path, not
// the allowedSectionIds-filtering / costCenters-injection branches.
//
// "Selected" for a level with descendants (Departamento/Área/
// Categoría-with-children) means fully checked (every descendant leaf
// granted, non-empty) — the exact same rollup math PermissionTree.js's
// render() already computes for indeterminate/checked display. A Columna
// (whose real grants are its 4 Solo Ver/Ver y Operar/Editar/Autorizar
// sub-permissions, never the column itself) counts as selected if AT LEAST
// ONE of those 4 is granted.
let cachedPlanTreeSections = null;
const PLAN_TREE_BUTTON_CONFIG_ITEM_IDS = ['btn-salir', 'btn-departamento', 'btn-area', 'btn-cc'];

function buildPlanTreeSections() {
    if (cachedPlanTreeSections) return cachedPlanTreeSections;
    const menuJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'data', 'menu.json'), 'utf8'));
    const allSections = menuJson.sections || [];
    const areaCategories = menuJson.areaCategories || [];
    const areaOverrides = menuJson.areaOverrides || {};
    const areasByDept = menuJson.areas || {};
    const mainSection = allSections.find((s) => s.id === 'main');
    const adminBusinessItem = mainSection?.items.find((i) => i.id === 'admin-business');
    const buttonConfigItems = PLAN_TREE_BUTTON_CONFIG_ITEM_IDS
        .map((id) => mainSection?.items.find((i) => i.id === id))
        .filter(Boolean)
        .map((i) => ({ ...i, standalone: true }));

    cachedPlanTreeSections = allSections.map((s) => {
        if (s.id !== 'main') {
            const deptAreaIds = areasByDept[s.id] ? areasByDept[s.id].map((a) => a.id) : GENERIC_AREA_IDS;
            const areaItems = deptAreaIds.map((areaId) => ({
                id: areaId,
                submenu: categoriesForAreaServer(s.id, areaId, areaCategories, areaOverrides),
            }));
            return { id: s.id, items: areaItems };
        }
        const items = s.items
            .filter((i) => i.id !== 'admin-business' && !PLAN_TREE_BUTTON_CONFIG_ITEM_IDS.includes(i.id))
            .map((i) => {
                if (i.id !== 'btn-configuracion' || !i.submenu) return i;
                return {
                    ...i,
                    submenu: i.submenu.map((sm) => {
                        if (sm.id === 'btn-admin-negocio' && adminBusinessItem) return { id: 'btn-admin-negocio', submenu: adminBusinessItem.submenu };
                        if (sm.id === 'btn-config-botones' && buttonConfigItems.length) return { id: 'btn-config-botones', submenu: buttonConfigItems };
                        return sm;
                    }),
                };
            });
        return { id: 'main', items };
    });
    return cachedPlanTreeSections;
}

function planTupleKey(sectionId, itemId, submenuId) {
    return `${sectionId}::${itemId || ''}::${submenuId || ''}`;
}

// Mirrors leafKeysUnder(section, item) in PermissionTree.js exactly.
function planItemLeafKeys(section, item) {
    if (item.submenu && item.submenu.length) {
        return item.submenu.flatMap((sm) => planSmLeafKeys(section, item, sm));
    }
    return [planTupleKey(section.id, item.id, null)];
}

// Mirrors the inline smLeafKeys computed in render() for a categoría with
// children, but also handles the leaf case (no 3rd level) by degenerating
// to a single-element list — fullyChecked() over a 1-element list is
// exactly the same as an exact-match check, so callers don't need to branch.
function planSmLeafKeys(section, item, sm) {
    if (sm.submenu && sm.submenu.length) {
        return sm.submenu.map((subSm) => (
            subSm.standalone ? planTupleKey(section.id, subSm.id, null) : planTupleKey(section.id, item.id, `${sm.id}/${subSm.id}`)
        ));
    }
    return [planTupleKey(section.id, item.id, sm.id)];
}

// Used by computeClientAdditionalPermissionsCost (client_permission_grants)
// to gate which priced nodes actually count toward a client's additional
// cost — container = fully checked, Columna = any of its 4 sub-permission
// levels. NOT used by computeAccessCostTotal below (a plan's own total is
// a plain sum of every priced row, independent of plan_grants).
function computeCostTotalForGrantSet(grantSet, costMap) {
    const costOf = (sectionId, itemId, submenuId) => costMap.get(planTupleKey(sectionId, itemId, submenuId)) || 0;
    const fullyChecked = (keys) => keys.length > 0 && keys.every((k) => grantSet.has(k));

    let total = 0;
    buildPlanTreeSections().forEach((section) => {
        const sectionLeafKeys = section.items.flatMap((item) => planItemLeafKeys(section, item));
        if (fullyChecked(sectionLeafKeys)) total += costOf(section.id, null, null);

        section.items.forEach((item) => {
            const itemLeafKeys = planItemLeafKeys(section, item);
            if (fullyChecked(itemLeafKeys)) total += costOf(section.id, item.id, null);
            if (!(item.submenu && item.submenu.length)) return;

            item.submenu.forEach((sm) => {
                const smLeafKeys = planSmLeafKeys(section, item, sm);
                if (fullyChecked(smLeafKeys)) total += costOf(section.id, item.id, sm.id);
                if (!(sm.submenu && sm.submenu.length)) return;

                sm.submenu.forEach((subSm) => {
                    // Pantalla's OWN price (PermissionCostTree.js's costEdit
                    // mode always shows an editable row for every subSm here,
                    // regardless of whether it also has columns below it —
                    // see its render()'s sm.submenu.forEach) — independent
                    // from, and in addition to, the Categoría rollup above
                    // and any Columna prices below (double-counting across
                    // levels is the accepted design, see file header).
                    const subSmItemId = subSm.standalone ? subSm.id : item.id;
                    const subSmSubmenuId = subSm.standalone ? null : `${sm.id}/${subSm.id}`;
                    if (grantSet.has(planTupleKey(section.id, subSmItemId, subSmSubmenuId))) {
                        total += costOf(section.id, subSmItemId, subSmSubmenuId);
                    }
                    if (!(subSm.submenu && subSm.submenu.length)) return;
                    subSm.submenu.forEach((col) => {
                        const base = `${sm.id}/${subSm.id}/${col.id}`;
                        const colSelected = ['solo-ver', 'ver-y-operar', 'editar', 'autorizar']
                            .some((lvl) => grantSet.has(planTupleKey(section.id, item.id, `${base}/${lvl}`)));
                        if (colSelected) total += costOf(section.id, item.id, base);
                    });
                });
            });
        });
    });
    return total;
}

// A plan's own "Costo Accesos-Permisos" total is just the sum of every
// price entered in its cost tree — it does NOT require the same node to
// also be granted in the plan's separate access tree (the shield-icon
// modal). Pricing and granting are independent actions on purpose: a price
// alone is enough to say "this plan charges for this," so this is a plain
// sum, not computeCostTotalForGrantSet (that shared per-level traversal is
// still what computeClientAdditionalPermissionsCost uses below, where
// gating by an actual grant IS correct — it represents what was really
// sold to that one client, not just priced on the plan's sheet).
// plan_permission_costs is sparse (cost > 0 only, see
// setPlanPermissionCosts), so no filtering is needed here.
function computeAccessCostTotal(planId) {
    return getPlanPermissionCosts(planId).reduce((sum, c) => sum + (Number(c.cost) || 0), 0);
}

function getClientPermissionGrants(clientId) {
    return db
        .prepare('SELECT section_id AS sectionId, item_id AS itemId, submenu_id AS submenuId FROM client_permission_grants WHERE client_id = ?')
        .all(clientId);
}

function setClientPermissionGrants(clientId, grants) {
    const replace = db.transaction((rows) => {
        db.prepare('DELETE FROM client_permission_grants WHERE client_id = ?').run(clientId);
        const insert = db.prepare(`
            INSERT INTO client_permission_grants (client_id, section_id, item_id, submenu_id)
            VALUES (@clientId, @sectionId, @itemId, @submenuId)
        `);
        for (const g of rows) {
            insert.run({ clientId, sectionId: g.sectionId, itemId: g.itemId || null, submenuId: g.submenuId || null });
        }
    });
    replace(grants);
    return getClientPermissionGrants(clientId);
}

// Sum of the CLIENT's plan's plan_permission_costs for every node "fully
// selected" via THIS client's own extra grants alone
// (client_permission_grants) — never mixed with what the plan itself
// already covers (a node that's fully covered by a MIX of plan+client
// grants shows as neither green nor yellow at that rollup level — see
// PermissionCostTree.js's clientTricolor mode — so it never double-prices
// here either). Returns 0 if the client has no plan / the plan name
// doesn't resolve.
function computeClientAdditionalPermissionsCost(clientId) {
    const client = getClientById(clientId);
    if (!client || !client.plan) return 0;
    const plan = getPlanByName(client.plan);
    if (!plan) return 0;
    const grantSet = new Set(getClientPermissionGrants(clientId).map((g) => planTupleKey(g.sectionId, g.itemId, g.submenuId)));
    const costMap = new Map(getPlanPermissionCosts(plan.id).map((c) => [planTupleKey(c.sectionId, c.itemId, c.submenuId), c.cost]));
    return computeCostTotalForGrantSet(grantSet, costMap);
}

// 3-tier "is this tuple covered" check (exact match / broadened to the
// whole item / broadened to the whole section) — mirrors
// PermissionCostTree.js's client-side isGranted() exactly, ported
// server-side so PUT .../permission-grants can reject a submitted tuple
// that's already covered by the plan without trusting the client.
function isTupleGranted(grants, sectionId, itemId, submenuId) {
    const set = new Set(grants.map((g) => planTupleKey(g.sectionId, g.itemId, g.submenuId)));
    if (set.has(planTupleKey(sectionId, itemId, submenuId))) return true;
    if (itemId && set.has(planTupleKey(sectionId, itemId, null))) return true;
    if (set.has(planTupleKey(sectionId, null, null))) return true;
    return false;
}

// Decisión #6 (ver plan): guardar un adicional en el árbol nunca prende un
// departamento/botón completo "gratis" — solo se agrega de verdad a
// extra_modules (acceso real, sidebar) cuando ese MODULE_CATALOG key queda
// TOTALMENTE cubierto por los adicionales de este cliente (misma regla de
// "completamente marcado" que decide qué cuenta en el costo), así activar
// acceso real nunca pasa sin que su costo ya se haya sumado. Solo agrega,
// nunca quita — desmarcar algo en el árbol no revoca acceso ya otorgado.
// Only writes extra_modules (returns whether it changed anything) — the
// caller (server.js, same as every other route that touches
// extra_modules) is responsible for re-running applyEffectiveEntitlements
// afterward, since that function lives there, not here.
function syncClientModulesFromPermissionGrants(clientId) {
    const client = getClientById(clientId);
    if (!client) return false;
    const grantSet = new Set(getClientPermissionGrants(clientId).map((g) => planTupleKey(g.sectionId, g.itemId, g.submenuId)));
    const fullyChecked = (keys) => keys.length > 0 && keys.every((k) => grantSet.has(k));
    let extraModules = [];
    try { extraModules = JSON.parse(client.extra_modules || '[]'); } catch { extraModules = []; }
    const extraModulesSet = new Set(extraModules);
    let changed = false;

    buildPlanTreeSections().forEach((section) => {
        // Department-level MODULE_CATALOG keys (e.g. 'supply-chain').
        if (MODULE_CATALOG.some((m) => m.key === section.id) && !extraModulesSet.has(section.id)) {
            const sectionLeafKeys = section.items.flatMap((item) => planItemLeafKeys(section, item));
            if (fullyChecked(sectionLeafKeys)) { extraModulesSet.add(section.id); changed = true; }
        }
        // main-section btn-* items (e.g. 'btn-mensajes') — only ones that
        // are themselves MODULE_CATALOG keys; most main items aren't.
        section.items.forEach((item) => {
            if (!MODULE_CATALOG.some((m) => m.key === item.id) || extraModulesSet.has(item.id)) return;
            const itemLeafKeys = planItemLeafKeys(section, item);
            if (fullyChecked(itemLeafKeys)) { extraModulesSet.add(item.id); changed = true; }
        });
    });

    if (changed) {
        setClientAddenda(clientId, { extraCostCenters: client.extra_cost_centers || 0, extraModules: Array.from(extraModulesSet) });
    }
    return changed;
}

function getPlanChanges(planId) {
    return db
        .prepare('SELECT * FROM plan_changes WHERE plan_id = ? ORDER BY changed_at DESC, id DESC')
        .all(planId);
}

function logPlanChange({ planId, action, fieldKey, oldValue, newValue, changedBy }) {
    db.prepare(`
        INSERT INTO plan_changes (plan_id, action, field_key, old_value, new_value, changed_by)
        VALUES (@planId, @action, @fieldKey, @oldValue, @newValue, @changedBy)
    `).run({
        planId, action, fieldKey: fieldKey || '',
        oldValue: oldValue == null ? '' : String(oldValue),
        newValue: newValue == null ? '' : String(newValue),
        changedBy: changedBy || '',
    });
}

// --- Query helpers: business users (scoped to one client) --------------------
// Excludes the auto-provisioned client admin (is_client_admin) — that one
// user isn't part of the client's own team management; their access is
// contracted-by-default and only editable from GEIPSA's Admin-SaaS (see
// /api/admin/clients/:id/admin-access in server.js).
// --- Query helpers: GEIPSA's own SaaS-side staff (Equipo SaaS) ---------------
// Plain role='admin' users, same `users` table as everything else — no
// separate table needed, "SaaS admin" is just what that role already means.
function listSaasAdmins() {
    return db
        .prepare("SELECT id, username, email, name, active, created_at FROM users WHERE role = 'admin' ORDER BY created_at ASC")
        .all();
}

function getSaasUserGrants(userId) {
    return db
        .prepare('SELECT item_id AS itemId, sub_item_id AS subItemId FROM saas_user_grants WHERE user_id = ?')
        .all(userId);
}

function setSaasUserGrants(userId, grants) {
    const replace = db.transaction((rows) => {
        db.prepare('DELETE FROM saas_user_grants WHERE user_id = ?').run(userId);
        const insert = db.prepare('INSERT INTO saas_user_grants (user_id, item_id, sub_item_id) VALUES (@userId, @itemId, @subItemId)');
        for (const g of rows) {
            insert.run({ userId, itemId: g.itemId, subItemId: g.subItemId || null });
        }
    });
    replace(grants);
    return getSaasUserGrants(userId);
}

// grants.length === 0 means unrestricted (see saas_user_grants' own
// comment) — mirrors isUnrestrictedClientAdmin's exact convention on the
// client side. subItemId null matches the screen-level grant itself
// (itemId with no sub-permission) OR is used to check a specific granular
// action (e.g. itemId:'saas-plans', subItemId:'activate').
function hasSaasGrant(grants, itemId, subItemId = null) {
    if (!grants.length) return true;
    return grants.some((g) => g.itemId === itemId && (subItemId ? g.subItemId === subItemId : true));
}

// Estatus RH (hr_workers -> hr_status_catalog) is a separate concept from
// users.active -- LEFT JOIN twice since not every business user is
// necessarily tied to an hr_workers row. Estatus Operativo (Accesos y
// Permisos) is derived from both, see computeOperationalStatus.
function listBusinessUsers(clientId) {
    const rows = db
        .prepare(`
            SELECT users.id, users.username, users.email, users.name, users.role, users.active,
                   users.is_client_admin, users.created_at,
                   hr_status_catalog.name AS hrStatusName, hr_status_catalog.operational_effect AS hrStatusEffect
            FROM users
            LEFT JOIN hr_workers ON hr_workers.user_id = users.id
            LEFT JOIN hr_status_catalog ON hr_status_catalog.id = hr_workers.hr_status_id
            WHERE users.client_id = ? AND users.is_client_admin = 0
            ORDER BY users.created_at DESC
        `)
        .all(clientId);
    return rows.map((row) => ({ ...row, operationalStatus: computeOperationalStatus(row) }));
}

// Login gate (POST /api/auth/login) -- same derivation as listBusinessUsers,
// for the one user who just typed in a username/password.
function getUserOperationalStatus(userId) {
    const row = db
        .prepare(`
            SELECT users.active, hr_status_catalog.operational_effect AS hrStatusEffect
            FROM users
            LEFT JOIN hr_workers ON hr_workers.user_id = users.id
            LEFT JOIN hr_status_catalog ON hr_status_catalog.id = hr_workers.hr_status_id
            WHERE users.id = ?
        `)
        .get(userId);
    return row ? computeOperationalStatus(row) : 'active';
}

function getUserById(id, clientId) {
    return db
        .prepare(`
            SELECT id, username, email, name, role, active, is_client_admin, created_at
            FROM users WHERE id = ? AND client_id = ?
        `)
        .get(id, clientId);
}

// The Habilitar/Deshabilitar toggle on Business-Usuarios.html — independent
// of deactivateClientUsers (which flips every user at a client at once when
// the CLIENT itself is deactivated); this is the one-user-at-a-time version.
function setUserActive(id, active) {
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
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

// What every profile assigned to this user grants (via getUserProfiles),
// on its own -- e.g. for Accesos y Permisos' read-only "Permisos Activados"
// view, which needs profile-derived and extra grants as 2 separate sets
// (see PermissionCostTree.js's clientTricolor mode) rather than the single
// deduplicated union getUserEffectiveGrants returns below.
function getUserProfileGrants(userId) {
    return db
        .prepare(`
            SELECT DISTINCT pg.section_id AS sectionId, pg.item_id AS itemId, pg.submenu_id AS submenuId
            FROM profile_grants pg
            JOIN user_profiles up ON up.profile_id = pg.profile_id
            WHERE up.user_id = ?
        `)
        .all(userId);
}

// Union of what every profile assigned to this user grants plus their own
// extra grants (getUserGrants) — the full "everything this user can
// actually see" set shown by the "Permisos" field in Datos de Usuario del
// Negocio, deduplicated by section/item/submenu.
function getUserEffectiveGrants(userId) {
    const seen = new Set();
    const combined = [];
    for (const g of [...getUserProfileGrants(userId), ...getUserGrants(userId)]) {
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
    setClientAppEnabled,
    updateClientBranding,
    findClientByRfc,
    getModuleCosts,
    setModuleCosts,
    getAnexosPaymentTotal,
    getAnexoChanges,
    recordAnexoChange,
    getTableChanges,
    logTableChange,
    getColumnGrantLevel,
    canAuthorizeColumn,
    createPendingChange,
    getPendingChangeById,
    hasPendingChangeForField,
    listPendingChangesForClient,
    getPendingColumnsByRecord,
    resolvePendingChange,
    COST_CENTER_FIELDS,
    JOB_POSITION_FIELDS,
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
    setCostCenterStatus,
    listCountries,
    listStates,
    listLocalities,
    listStreets,
    createCountry,
    createState,
    createLocality,
    createStreet,
    listFieldFillRules,
    listAllFieldFillRules,
    getFieldFillRuleById,
    createFieldFillRule,
    updateFieldFillRule,
    authorizeFieldFillRule,
    deleteFieldFillRule,
    listJobPositions,
    getJobPositionById,
    createJobPosition,
    updateJobPosition,
    deleteJobPosition,
    listHrStatusCatalog,
    getHrStatusCatalogById,
    createHrStatusCatalogEntry,
    updateHrStatusCatalogEntry,
    deleteHrStatusCatalogEntry,
    HR_STATUS_CATALOG_FIELDS,
    computeOperationalStatus,
    getUserOperationalStatus,
    listIntelligentReports,
    getIntelligentReportById,
    createIntelligentReport,
    updateIntelligentReport,
    deleteIntelligentReport,
    authorizeIntelligentReport,
    computeIntelligentReportRows,
    listScheduledReports,
    getScheduledReportById,
    createScheduledReport,
    updateScheduledReport,
    deleteScheduledReport,
    authorizeScheduledReport,
    listFuelRecords,
    getFuelRecordById,
    createFuelRecord,
    updateFuelRecord,
    deleteFuelRecord,
    getSystemColumnsForRecord,
    listHrWorkers,
    getHrWorkerById,
    createHrWorker,
    computeHrUsername,
    activateHrWorkerUser,
    updateHrWorker,
    deleteHrWorker,
    listPlans,
    getPlanById,
    getPlanByName,
    createPlan,
    updatePlan,
    lockPlan,
    activatePlan,
    deletePlan,
    listSaasApps,
    getSaasAppById,
    createSaasApp,
    updateSaasApp,
    deleteSaasApp,
    addSaasAppScreen,
    deleteSaasAppScreen,
    listActiveAppSectors,
    getClientAppScreens,
    WEB_SCREEN_CATALOG,
    getPlanGrants,
    setPlanGrants,
    syncPlanModulesFromGrants,
    getPlanPermissionCosts,
    setPlanPermissionCosts,
    computeAccessCostTotal,
    getClientPermissionGrants,
    setClientPermissionGrants,
    computeClientAdditionalPermissionsCost,
    isTupleGranted,
    syncClientModulesFromPermissionGrants,
    getPlanChanges,
    logPlanChange,
    listSaasAdmins,
    getSaasUserGrants,
    setSaasUserGrants,
    hasSaasGrant,
    activateClient,
    deactivateClientUsers,
    listBusinessUsers,
    getUserById,
    setUserActive,
    getUserProfileById,
    getUserBusinessProfileById,
    getUserEffectiveGrants,
    getUserProfileGrants,
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
