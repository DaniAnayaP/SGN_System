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
    getClientBranding,
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
} = require('./db');

const app = express();

// Railway (like Heroku/most PaaS) puts the app behind a reverse proxy, which
// sets X-Forwarded-For on every request. Without this, Express doesn't trust
// that header, so express-rate-limit can't tell real client IPs apart —
// every request behind the proxy looks like it's coming from the same
// address, which both breaks per-IP rate limiting and logs a validation
// error on every single request. `1` trusts exactly one hop (Railway's own
// proxy), not arbitrary client-supplied headers.
app.set('trust proxy', 1);

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
// Default express.json() caps requests at 100kb — too small for a base64
// logo image (see MAX_LOGO_DATA_URL_LENGTH below). validateClientBody still
// enforces the real ~350KB cap; this just raises the hard ceiling above it.
app.use(express.json({ limit: '1mb' }));
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

// --- Client-admin guard (Administración del Negocio: users, roles, access) --
// Only the one auto-provisioned "Admin+ABBR" user for a client (see
// activateClient in db.js) can manage that client's own users/profiles/
// grants — regular staff accounts created by that admin cannot. Every
// /api/business/* route below also scopes its queries to req.user.clientId,
// so one client can never see or touch another's data.
function requireClientAdmin(req, res, next) {
    if (!req.user?.clientId || !req.user?.isClientAdmin) {
        return res.status(403).json({ message: 'Client admin access required.' });
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
    // Credentials matched, so revealing "inactive" here doesn't leak whether
    // an unknown username exists — the deactivation only ever fires for a
    // client whose status left 'activo' (see activateClient/deactivateClientUsers).
    if (!user.active) {
        return res.status(403).json({ message: 'This account is inactive.' });
    }

    const token = jwt.sign(
        {
            sub: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            clientId: user.client_id,
            isClientAdmin: !!user.is_client_admin,
        },
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
const MAX_LOGO_DATA_URL_LENGTH = 500 * 1024; // ~350KB image once base64-decoded
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const PALETTE_KEYS = ['bg', 'surface', 'border', 'textPrimary', 'textSecondary', 'accent', 'accentText', 'tooltipBg', 'tooltipText'];

function validateLogo(logoDataUrl) {
    if (!logoDataUrl) return null;
    if (typeof logoDataUrl !== 'string' || !logoDataUrl.startsWith('data:image/')) {
        return 'logoDataUrl must be an image data URL.';
    }
    if (logoDataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
        return 'Logo image is too large (max ~350KB).';
    }
    return null;
}

function validateSeedColor(seedColor) {
    if (seedColor && !HEX_COLOR_RE.test(seedColor)) {
        return 'seedColor must be a hex color like #1a73e8.';
    }
    return null;
}

function validateColorPalette(colorPalette) {
    if (colorPalette == null) return null;
    if (typeof colorPalette !== 'object' || Array.isArray(colorPalette)) {
        return 'colorPalette must be an object.';
    }
    for (const [key, value] of Object.entries(colorPalette)) {
        if (!PALETTE_KEYS.includes(key)) return `colorPalette has an unknown key: ${key}.`;
        if (!HEX_COLOR_RE.test(value)) return `colorPalette.${key} must be a hex color like #1a73e8.`;
    }
    return null;
}

function validateClientBody(body) {
    const { companyName, contactName, email, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette } = body || {};
    if (!companyName || !contactName || !email) {
        return 'companyName, contactName and email are required.';
    }
    if (status && !CLIENT_STATUSES.includes(status)) {
        return `status must be one of: ${CLIENT_STATUSES.join(', ')}.`;
    }
    if (primaryColor && !HEX_COLOR_RE.test(primaryColor)) {
        return 'primaryColor must be a hex color like #1a73e8.';
    }
    if (secondaryColor && !HEX_COLOR_RE.test(secondaryColor)) {
        return 'secondaryColor must be a hex color like #1a73e8.';
    }
    return validateLogo(logoDataUrl) || validateSeedColor(seedColor) || validateColorPalette(colorPalette);
}

app.get('/api/admin/modules', requireAuth, requireAdmin, (req, res) => {
    res.json({ modules: MODULE_CATALOG });
});

app.get('/api/admin/clients', requireAuth, requireAdmin, (req, res) => {
    res.json({ clients: listClients() });
});

// Runs after every create/update: 'activo' provisions (or reactivates) the
// client's admin user and their whole team; anything else locks all of them
// out. Returns { username, password } only the one time a NEW admin user is
// created — that's the only chance to hand the password to GEIPSA, since it's
// never stored anywhere in recoverable form.
function applyClientLifecycle(client) {
    if (client.status === 'activo') {
        const { user, generatedPassword } = activateClient(client.id);
        if (generatedPassword) {
            return { username: user.username, password: generatedPassword };
        }
        return null;
    }
    deactivateClientUsers(client.id);
    return null;
}

app.post('/api/admin/clients', requireAuth, requireAdmin, (req, res) => {
    const error = validateClientBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette } = req.body;
    const client = createClient({ companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette });
    const generatedAdmin = applyClientLifecycle(client);
    res.status(201).json({ client: getClientById(client.id), generatedAdmin });
});

app.patch('/api/admin/clients/:id', requireAuth, requireAdmin, (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const error = validateClientBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette } = req.body;
    const client = updateClient(req.params.id, { companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette });
    const generatedAdmin = applyClientLifecycle(client);
    res.json({ client: getClientById(client.id), generatedAdmin });
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
    res.json({ modules: getClientModules(req.params.id), costCentersLimit: existing.cost_centers_limit });
});

app.put('/api/admin/clients/:id/modules', requireAuth, requireAdmin, (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const { modules, costCentersLimit } = req.body || {};
    if (!Array.isArray(modules)) {
        return res.status(400).json({ message: 'modules must be an array of { key, enabled }.' });
    }
    if (costCentersLimit !== undefined && (!Number.isInteger(costCentersLimit) || costCentersLimit < 0)) {
        return res.status(400).json({ message: 'costCentersLimit must be a non-negative integer.' });
    }
    const updatedModules = setClientModules(req.params.id, modules);
    const updatedLimit = costCentersLimit !== undefined
        ? setClientCostCentersLimit(req.params.id, costCentersLimit)
        : existing.cost_centers_limit;
    res.json({ modules: updatedModules, costCentersLimit: updatedLimit });
});

// --- Business admin: users, profiles, and permission grants ------------------
// "Administración del Negocio" — the client company's own admin tooling for
// managing its users, reusable permission profiles ("perfiles"), and each
// profile/user's access to modules ("módulos"), sections within them
// ("apartados"), and individual pages ("pantallas") — the same three levels
// as public/data/menu.json (section > item > submenu entry).
//
// Access: requireAuth + requireClientAdmin — only the one auto-provisioned
// admin for a client can reach these, and every query below is additionally
// scoped to req.user.clientId so clients can never see each other's data.
function validateGrants(grants) {
    if (!Array.isArray(grants)) return 'grants must be an array.';
    for (const g of grants) {
        if (!g || typeof g.sectionId !== 'string' || !g.sectionId) {
            return 'each grant needs a sectionId.';
        }
    }
    return null;
}

app.get('/api/business/contracted-modules', requireAuth, requireClientAdmin, (req, res) => {
    res.json({ moduleKeys: getClientModuleKeys(req.user.clientId) });
});

// Branding (company name, logo, institutional colors) — any authenticated
// user AT a client can see their own company's branding, not just that
// client's admin (everyone on the team sees the same sidebar identity).
// GEIPSA/SGN staff (no clientId) get a 404: there's no client to brand for.
app.get('/api/business/branding', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const branding = getClientBranding(req.user.clientId);
    if (!branding) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ branding });
});

// Self-service: only the client's own admin can change their branding
// (logo + institutional palette), and only for their own client_id — never
// company_name/status/plan, which stay GEIPSA-controlled (see Admin-SaaS).
app.put('/api/business/branding', requireAuth, requireClientAdmin, (req, res) => {
    const { logoDataUrl, seedColor, colorPalette } = req.body || {};
    const error = validateLogo(logoDataUrl) || validateSeedColor(seedColor) || validateColorPalette(colorPalette);
    if (error) return res.status(400).json({ message: error });
    const branding = updateClientBranding(req.user.clientId, { logoDataUrl, seedColor, colorPalette });
    res.json({ branding });
});

app.get('/api/business/users', requireAuth, requireClientAdmin, (req, res) => {
    res.json({ users: listBusinessUsers(req.user.clientId) });
});

app.post('/api/business/users', requireAuth, requireClientAdmin, async (req, res) => {
    const { username, email, password, name } = req.body || {};
    if (!username || !email || !name || !password || password.length < 8) {
        return res.status(400).json({ message: 'username, email, name and a password of at least 8 characters are required.' });
    }
    if (usernameOrEmailExists(username, email)) {
        return res.status(409).json({ message: 'Username or email already taken.' });
    }
    const user = createUser({
        username, email, passwordHash: hashPassword(password), name,
        clientId: req.user.clientId, isClientAdmin: false,
    });
    res.status(201).json({
        user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role, created_at: user.created_at },
    });
});

app.get('/api/business/users/:id/profiles', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ profiles: getUserProfiles(req.params.id) });
});

app.put('/api/business/users/:id/profiles', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const { profileIds } = req.body || {};
    if (!Array.isArray(profileIds)) {
        return res.status(400).json({ message: 'profileIds must be an array.' });
    }
    // Every profileId must belong to this same client — otherwise a client
    // admin could assign another client's profile by guessing its id.
    const validIds = profileIds.filter((pid) => getProfileById(pid, req.user.clientId));
    res.json({ profiles: setUserProfiles(req.params.id, validIds) });
});

app.get('/api/business/users/:id/grants', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ grants: getUserGrants(req.params.id) });
});

app.put('/api/business/users/:id/grants', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    res.json({ grants: setUserGrants(req.params.id, grants) });
});

app.get('/api/business/profiles', requireAuth, requireClientAdmin, (req, res) => {
    res.json({ profiles: listProfiles(req.user.clientId) });
});

app.post('/api/business/profiles', requireAuth, requireClientAdmin, (req, res) => {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name is required.' });
    res.status(201).json({ profile: createProfile({ clientId: req.user.clientId, name, description }) });
});

app.patch('/api/business/profiles/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getProfileById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Profile not found.' });
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name is required.' });
    res.json({ profile: updateProfile(req.params.id, req.user.clientId, { name, description }) });
});

app.delete('/api/business/profiles/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getProfileById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Profile not found.' });
    deleteProfile(req.params.id, req.user.clientId);
    res.status(204).end();
});

app.get('/api/business/profiles/:id/grants', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getProfileById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Profile not found.' });
    res.json({ grants: getProfileGrants(req.params.id) });
});

app.put('/api/business/profiles/:id/grants', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getProfileById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Profile not found.' });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    res.json({ grants: setProfileGrants(req.params.id, grants) });
});

// --- Centros de Costo (cost centers, scoped to one client) -------------------
// Capped by clients.cost_centers_limit, which GEIPSA sets from Contrataciones
// (Admin-SaaS) — see setClientCostCentersLimit. Managing the catalog (create/
// edit/delete) stays admin-only, same as the rest of "Administración del
// Negocio" — but any authenticated user at the client can READ the list,
// since every client user needs it for the sidebar's Centro de Costo picker.
function validateCostCenterBody(body) {
    const { code, name } = body || {};
    if (!code || !name) return 'code and name are required.';
    return null;
}

app.get('/api/business/cost-centers', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const client = getClientById(req.user.clientId);
    res.json({ costCenters: listCostCenters(req.user.clientId), limit: client.cost_centers_limit });
});

app.post('/api/business/cost-centers', requireAuth, requireClientAdmin, (req, res) => {
    const error = validateCostCenterBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const client = getClientById(req.user.clientId);
    if (countCostCenters(req.user.clientId) >= client.cost_centers_limit) {
        return res.status(409).json({ message: 'Cost center limit reached for this client.' });
    }
    const { code, name, description, responsible } = req.body;
    try {
        const costCenter = createCostCenter({ clientId: req.user.clientId, code, name, description, responsible });
        res.status(201).json({ costCenter });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A cost center with that code already exists.' });
        }
        throw err;
    }
});

app.patch('/api/business/cost-centers/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getCostCenterById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Cost center not found.' });
    const error = validateCostCenterBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { code, name, description, responsible } = req.body;
    try {
        const costCenter = updateCostCenter(req.params.id, req.user.clientId, { code, name, description, responsible });
        res.json({ costCenter });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A cost center with that code already exists.' });
        }
        throw err;
    }
});

app.delete('/api/business/cost-centers/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getCostCenterById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Cost center not found.' });
    deleteCostCenter(req.params.id, req.user.clientId);
    res.status(204).end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SGN app listening on port ${PORT}`));
