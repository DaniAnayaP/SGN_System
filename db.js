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

// --- One-time seed: create the demo admin/admin user if the table is empty.
// This only ever runs once — after that, the row lives in sgn.sqlite and
// survives server restarts. Delete the row (see README) once you're done
// testing, or before this touches anything real.
const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
if (userCount === 0) {
    db.prepare(`
        INSERT INTO users (username, email, password_hash, name)
        VALUES (@username, @email, @passwordHash, @name)
    `).run({
        username: 'admin',
        email: 'admin@geipsa.com',
        passwordHash: hashPassword('admin'),
        name: 'Admin',
    });
    console.log('[db] Seeded demo user admin/admin (first run only).');
}

// --- Query helpers -----------------------------------------------------------
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

module.exports = {
    db,
    findUserByUsername,
    usernameOrEmailExists,
    createUser,
};
