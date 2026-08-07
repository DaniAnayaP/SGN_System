/**
 * SGN — unified app server.
 *
 * Serves the frontend (public/) and the auth API (/api/*) from the SAME
 * Express app and port, so the whole system lives behind one URL. This is
 * the deployment target for Railway: no CORS setup needed since the
 * frontend and API share an origin, and no need to manage two separate
 * hosting providers.
 *
 * DEMO USER (seeded once into the database on first run — see db.js):
 *   username: admin
 *   password: admin
 * Remove it (see README) before this touches anything real.
 *
 * To adapt for real use:
 *   1. Swap SQLite for Postgres/MySQL if you need multiple app server
 *      instances writing concurrently (SQLite is fine for a single
 *      instance, which is what a typical Railway deployment runs).
 *   2. Delete the seeded admin/admin user, or force a password change on
 *      first login.
 *   3. Set JWT_SECRET via environment variables, never hardcoded.
 *   4. Add per-client (multi-tenant) scoping if this backend will serve
 *      more than one company/client — see the note in db.js.
 */

const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const { hashPassword, verifyPassword } = require('./password');
const {
    findUserByUsername,
    usernameOrEmailExists,
    createUser,
    MODULE_CATALOG,
    listClients,
    getClientById,
    createClient,
    updateClient,
    deleteClient,
    getClientModules,
    setClientModules,
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
} = require('./db');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const IS_PROD = process.env.NODE_ENV === 'production';
const PUBLIC_DIR = path.join(__dirname, 'public');

if (IS_PROD && JWT_SECRET === 'CHANGE_ME_IN_PRODUCTION') {
    console.warn('[WARNING] JWT_SECRET is not set. Set it as an environment variable before real use.');
}

// helmet's default CSP is strict and will block the boxicons CDN + inline
// scripts this frontend currently uses. Loosen just enough for that;
// tighten further once you stop relying on inline <script> blocks.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://unpkg.com', 'https://fonts.gstatic.com', 'data:'],
        },
    },
}));
app.use(express.json());
app.use(cookieParser());

// --- Static frontend ---------------------------------------------------------
// Only files inside public/ are ever served to the browser. server.js,
// db.js, password.js, .env, and the database file all live outside this
// folder and are never web-accessible.
app.use(express.static(PUBLIC_DIR));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'Login.html')));

// --- Rate limiting on auth routes -------------------------------------------
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                  // 10 attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Try again later.' },
});

// --- Auth middleware (protects any route that follows it) ------------------
function requireAuth(req, res, next) {
    const token = req.cookies?.sgn_session || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Not authenticated.' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ message: 'Invalid or expired session.' });
    }
}

// --- Admin-only guard (SaaS control panel: clients, module entitlements) ---
// Must run after requireAuth so req.user is populated. The role lives in the
// JWT issued at login, so a promotion to admin only takes effect on the
// user's next login (token is valid for up to 8h).
function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required.' });
    }
    next();
}

// --- POST /api/auth/login ----------------------------------------------------
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    const user = findUserByUsername(username);
    // Always run the hash comparison even if the user is missing, using a
    // dummy hash of the same shape, so response time doesn't leak whether
    // the username exists ("timing attack").
    const dummyHash = '00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
    const passwordMatches = verifyPassword(password, user?.password_hash || dummyHash);

    if (!user || !passwordMatches) {
        return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const token = jwt.sign(
        { sub: user.id, username: user.username, name: user.name, role: user.role },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    res.cookie('sgn_session', token, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({
        user: { id: user.id, username: user.username, name: user.name, email: user.email },
    });
});

// --- POST /api/auth/register --------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password || password.length < 8) {
        return res.status(400).json({ message: 'All fields are required; password must be at least 8 characters.' });
    }
    if (usernameOrEmailExists(username, email)) {
        return res.status(409).json({ message: 'Username or email already taken.' });
    }

    createUser({ username, email, passwordHash: hashPassword(password), name: username });

    res.status(201).json({ message: 'Account created.' });
});

// --- POST /api/auth/logout ----------------------------------------------------
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('sgn_session');
    res.json({ message: 'Logged out.' });
});

// --- Example protected route --------------------------------------------------
app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

// --- SaaS admin: clients + per-client module entitlements ("Contrataciones") -
// Every route below requires an authenticated admin (requireAuth first so
// req.user exists, then requireAdmin checks the role in that token).
const CLIENT_STATUSES = ['activo', 'inactivo', 'prospecto'];

function validateClientBody(body) {
    const { companyName, contactName, email, status } = body || {};
    if (!companyName || !contactName || !email) {
        return 'companyName, contactName and email are required.';
    }
    if (status && !CLIENT_STATUSES.includes(status)) {
        return `status must be one of: ${CLIENT_STATUSES.join(', ')}.`;
    }
    return null;
}

app.get('/api/admin/modules', requireAuth, requireAdmin, (req, res) => {
    res.json({ modules: MODULE_CATALOG });
});

app.get('/api/admin/clients', requireAuth, requireAdmin, (req, res) => {
    res.json({ clients: listClients() });
});

app.post('/api/admin/clients', requireAuth, requireAdmin, (req, res) => {
    const error = validateClientBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { companyName, contactName, email, phone, plan, status } = req.body;
    const client = createClient({ companyName, contactName, email, phone, plan, status });
    res.status(201).json({ client });
});

app.patch('/api/admin/clients/:id', requireAuth, requireAdmin, (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const error = validateClientBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { companyName, contactName, email, phone, plan, status } = req.body;
    const client = updateClient(req.params.id, { companyName, contactName, email, phone, plan, status });
    res.json({ client });
});

app.delete('/api/admin/clients/:id', requireAuth, requireAdmin, (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    deleteClient(req.params.id);
    res.status(204).end();
});

app.get('/api/admin/clients/:id/modules', requireAuth, requireAdmin, (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    res.json({ modules: getClientModules(req.params.id) });
});

app.put('/api/admin/clients/:id/modules', requireAuth, requireAdmin, (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const { modules } = req.body || {};
    if (!Array.isArray(modules)) {
        return res.status(400).json({ message: 'modules must be an array of { key, enabled }.' });
    }
    res.json({ modules: setClientModules(req.params.id, modules) });
});

// --- Business admin: users, profiles, and permission grants ------------------
// "Administración del Negocio" — the client company's own admin tooling for
// managing its users, reusable permission profiles ("perfiles"), and each
// profile/user's access to modules ("módulos"), sections within them
// ("apartados"), and individual pages ("pantallas") — the same three levels
// as public/data/menu.json (section > item > submenu entry).
//
// Access note: only requireAuth for now, not the SaaS `role` — see the
// longer note above the profiles/user_grants tables in db.js.
function validateGrants(grants) {
    if (!Array.isArray(grants)) return 'grants must be an array.';
    for (const g of grants) {
        if (!g || typeof g.sectionId !== 'string' || !g.sectionId) {
            return 'each grant needs a sectionId.';
        }
    }
    return null;
}

app.get('/api/business/users', requireAuth, (req, res) => {
    res.json({ users: listBusinessUsers() });
});

app.post('/api/business/users', requireAuth, async (req, res) => {
    const { username, email, password, name } = req.body || {};
    if (!username || !email || !name || !password || password.length < 8) {
        return res.status(400).json({ message: 'username, email, name and a password of at least 8 characters are required.' });
    }
    if (usernameOrEmailExists(username, email)) {
        return res.status(409).json({ message: 'Username or email already taken.' });
    }
    const user = createUser({ username, email, passwordHash: hashPassword(password), name });
    res.status(201).json({
        user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role, created_at: user.created_at },
    });
});

app.get('/api/business/users/:id/profiles', requireAuth, (req, res) => {
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ profiles: getUserProfiles(req.params.id) });
});

app.put('/api/business/users/:id/profiles', requireAuth, (req, res) => {
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const { profileIds } = req.body || {};
    if (!Array.isArray(profileIds)) {
        return res.status(400).json({ message: 'profileIds must be an array.' });
    }
    res.json({ profiles: setUserProfiles(req.params.id, profileIds) });
});

app.get('/api/business/users/:id/grants', requireAuth, (req, res) => {
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ grants: getUserGrants(req.params.id) });
});

app.put('/api/business/users/:id/grants', requireAuth, (req, res) => {
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    res.json({ grants: setUserGrants(req.params.id, grants) });
});

app.get('/api/business/profiles', requireAuth, (req, res) => {
    res.json({ profiles: listProfiles() });
});

app.post('/api/business/profiles', requireAuth, (req, res) => {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name is required.' });
    res.status(201).json({ profile: createProfile({ name, description }) });
});

app.patch('/api/business/profiles/:id', requireAuth, (req, res) => {
    const existing = getProfileById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Profile not found.' });
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name is required.' });
    res.json({ profile: updateProfile(req.params.id, { name, description }) });
});

app.delete('/api/business/profiles/:id', requireAuth, (req, res) => {
    const existing = getProfileById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Profile not found.' });
    deleteProfile(req.params.id);
    res.status(204).end();
});

app.get('/api/business/profiles/:id/grants', requireAuth, (req, res) => {
    const existing = getProfileById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Profile not found.' });
    res.json({ grants: getProfileGrants(req.params.id) });
});

app.put('/api/business/profiles/:id/grants', requireAuth, (req, res) => {
    const existing = getProfileById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Profile not found.' });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    res.json({ grants: setProfileGrants(req.params.id, grants) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SGN app listening on port ${PORT}`));
