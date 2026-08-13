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
    getTableChanges,
    logTableChange,
    logFieldChanges,
    COST_CENTER_FIELDS,
    FUEL_PATCHABLE_FIELDS,
    HR_WORKER_PATCHABLE_FIELDS,
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
// logo image or contract PDF (see MAX_LOGO_DATA_URL_LENGTH/
// MAX_CONTRACT_DATA_URL_LENGTH below). A client save can carry both at once,
// and base64 adds ~33% overhead on top of the ~5MB contract cap — 10mb
// leaves real headroom. validateClientBody still enforces the actual caps;
// this just raises the hard ceiling above them.
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// --- Static frontend ---------------------------------------------------------
// Only files inside public/ are ever served to the browser. server.js,
// db.js, password.js, .env, and the database file all live outside this
// folder and are never web-accessible.
//
// maxAge is intentionally short (1 minute), not the usual long-lived
// "immutable" static-asset cache: none of these filenames are content-hashed
// (Dashboard.js is always Dashboard.js), so a long maxAge would mean a
// deployed fix doesn't show up in an already-open browser tab until it
// expires, no revalidation possible in between. A short maxAge still avoids
// re-fetching everything on every rapid page-to-page navigation within a
// session (the common case), while etag (on by default) handles proper
// revalidation once it expires. Raise this once the UI stabilizes and/or
// filenames get a cache-busting hash.
app.use(express.static(PUBLIC_DIR, { maxAge: '1m' }));
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
    const passwordMatches = await verifyPassword(password, user?.password_hash || dummyHash);

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

    createUser({ username, email, passwordHash: await hashPassword(password), name: username });

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

// Top-bar "Datos de Usuario" / "Datos Personales" panel — always the
// caller's own profile (req.user.sub comes from their verified session
// token), read fresh from the DB rather than the JWT so edits made
// elsewhere show up without waiting for the token to expire.
app.get('/api/me/profile', requireAuth, (req, res) => {
    const profile = getUserProfileById(req.user.sub);
    if (!profile) return res.status(404).json({ message: 'User not found.' });
    res.json({ profile });
});

// Top-bar "Datos de Usuario del Negocio" panel — same "always the caller's
// own, read fresh" reasoning as /api/me/profile above.
app.get('/api/me/business-profile', requireAuth, (req, res) => {
    const profile = getUserBusinessProfileById(req.user.sub);
    if (!profile) return res.status(404).json({ message: 'User not found.' });
    res.json({ profile });
});

// Default Departamento/Área/Centro de Costos, applied by Dashboard.js right
// after a fresh login (see applyLoginDefaults there) — set from
// "Configuración de Botones" > Botón Departamento/Área/C. Costos.
app.get('/api/me/defaults', requireAuth, (req, res) => {
    res.json({ defaults: getUserDefaults(req.user.sub) });
});

app.put('/api/me/defaults', requireAuth, (req, res) => {
    const { department, area, costCenters } = req.body || {};
    if (department !== undefined && department !== null && typeof department !== 'string') {
        return res.status(400).json({ message: 'department must be a string or null.' });
    }
    if (area !== undefined && area !== null && typeof area !== 'string') {
        return res.status(400).json({ message: 'area must be a string or null.' });
    }
    if (costCenters !== undefined && costCenters !== null && costCenters !== 'all' && !Array.isArray(costCenters)) {
        return res.status(400).json({ message: "costCenters must be 'all', null, or an array." });
    }
    res.json({ defaults: setUserDefaults(req.user.sub, { department, area, costCenters }) });
});

// System-wide UI scale ("aumentar/disminuir el tamaño de todo el sistema",
// top-bar control) — per account like the defaults above, not localStorage,
// so it never leaks between different users on a shared browser/computer.
const UI_SCALE_MIN = 1;
const UI_SCALE_MAX = 8;

app.get('/api/me/ui-scale', requireAuth, (req, res) => {
    res.json({ scale: getUserUiScale(req.user.sub) });
});

app.put('/api/me/ui-scale', requireAuth, (req, res) => {
    const { scale } = req.body || {};
    if (!Number.isInteger(scale) || scale < UI_SCALE_MIN || scale > UI_SCALE_MAX) {
        return res.status(400).json({ message: `scale must be an integer between ${UI_SCALE_MIN} and ${UI_SCALE_MAX}.` });
    }
    res.json({ scale: setUserUiScale(req.user.sub, scale) });
});

// --- SaaS admin: clients + per-client module entitlements ("Contrataciones") -
// Every route below requires an authenticated admin (requireAuth first so
// req.user exists, then requireAdmin checks the role in that token).
const CLIENT_STATUSES = ['activo', 'inactivo', 'prospecto'];
const MAX_LOGO_DATA_URL_LENGTH = 500 * 1024; // ~350KB image once base64-decoded
const MAX_CONTRACT_DATA_URL_LENGTH = 7 * 1024 * 1024; // ~5MB PDF once base64-decoded
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

// Contrato: stored the same way as the logo (a data: URL in the same row),
// just a bigger size cap (real PDFs, not small branding images) and a
// different accepted MIME.
function validateContractFile(contractFileDataUrl) {
    if (!contractFileDataUrl) return null;
    if (typeof contractFileDataUrl !== 'string' || !contractFileDataUrl.startsWith('data:application/pdf')) {
        return 'contractFileDataUrl must be a PDF data URL.';
    }
    if (contractFileDataUrl.length > MAX_CONTRACT_DATA_URL_LENGTH) {
        return 'Contract file is too large (max ~5MB).';
    }
    return null;
}

function validateOptionalDate(value, fieldName) {
    if (!value) return null;
    if (typeof value !== 'string' || !DATE_RE.test(value)) {
        return `${fieldName} must be a date in YYYY-MM-DD format.`;
    }
    return null;
}

function validateOptionalMoney(value, fieldName) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
        return `${fieldName} must be a number >= 0.`;
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
    const {
        companyName, contactName, email, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette,
        billingEmail, contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl,
        contractedCost, monthlyPayment,
    } = body || {};
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
    if (billingEmail && !/^\S+@\S+\.\S+$/.test(billingEmail)) {
        return 'billingEmail must be a valid email address.';
    }
    return validateLogo(logoDataUrl) || validateSeedColor(seedColor) || validateColorPalette(colorPalette)
        || validateContractFile(contractFileDataUrl)
        || validateOptionalDate(contractStartDate, 'contractStartDate')
        || validateOptionalDate(contractRegisteredDate, 'contractRegisteredDate')
        || validateOptionalDate(contractEndDate, 'contractEndDate')
        || validateOptionalMoney(contractedCost, 'contractedCost')
        || validateOptionalMoney(monthlyPayment, 'monthlyPayment');
}

app.get('/api/admin/modules', requireAuth, requireAdmin, (req, res) => {
    res.json({ modules: MODULE_CATALOG });
});

app.get('/api/admin/clients', requireAuth, requireAdmin, (req, res) => {
    const clients = listClients().map((client) => ({
        ...client,
        anexosPayment: getAnexosPaymentTotal(client.id),
        costCentersUsed: countCostCenters(client.id),
    }));
    res.json({ clients });
});

// Runs after every create/update: 'activo' provisions (or reactivates) the
// client's admin user and their whole team; anything else locks all of them
// out. Returns { username, password } only the one time a NEW admin user is
// created — that's the only chance to hand the password to GEIPSA, since it's
// never stored anywhere in recoverable form.
async function applyClientLifecycle(client) {
    if (client.status === 'activo') {
        const { user, generatedPassword } = await activateClient(client.id);
        if (generatedPassword) {
            return { username: user.username, password: generatedPassword };
        }
        return null;
    }
    deactivateClientUsers(client.id);
    return null;
}

// A plan's módulos + centros de costo limit (set in Planes y Paquetes) get
// stamped onto the client's own Contrataciones every time a client is
// saved with that plan selected — a full replace across MODULE_CATALOG
// (not just enabling the plan's modules), so switching plans also turns
// off whatever the previous plan had on. Then Anexos (per-client extras —
// see the addenda routes below) are merged in on top, so re-stamping a plan
// never wipes out an anexo, and an anexo never has to be re-entered just
// because the client's base plan was edited or reassigned. No-op on the
// plan side if the client has none selected, or the name doesn't match a
// real plan (free-text edge case).
function applyEffectiveEntitlements(clientId) {
    const client = getClientById(clientId);
    if (!client) return;
    const plan = client.plan ? getPlanByName(client.plan) : null;
    const baseModules = plan ? plan.modules : [];
    const baseCostCenters = plan ? plan.costCentersLimit : 0;
    const addenda = getClientAddenda(clientId);
    const moduleStates = MODULE_CATALOG.map((m) => ({
        key: m.key,
        enabled: baseModules.includes(m.key) || addenda.extraModules.includes(m.key),
    }));
    setClientModules(clientId, moduleStates);
    setClientCostCentersLimit(clientId, baseCostCenters + addenda.extraCostCenters);
}

// Extracts every field createClient/updateClient know how to persist, in one
// place, so the create and update routes below (and any future one) can't
// drift out of sync with each other on which fields get passed through.
function extractClientFields(body) {
    const {
        companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette,
        mission, vision, coreValues, history,
        rfc, companyNickname, companyAbbreviation, ownerName, billingEmail,
        contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractFileName,
        contractedCost, monthlyPayment,
    } = body;
    return {
        companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette,
        mission, vision, coreValues, history,
        rfc, companyNickname, companyAbbreviation, ownerName, billingEmail,
        contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractFileName,
        contractedCost, monthlyPayment,
    };
}

app.post('/api/admin/clients', requireAuth, requireAdmin, async (req, res) => {
    const error = validateClientBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const rfc = (req.body.rfc || '').trim();
    if (rfc && findClientByRfc(rfc)) {
        return res.status(409).json({ message: 'A client with that RFC already exists.' });
    }
    const client = createClient(extractClientFields(req.body));
    applyEffectiveEntitlements(client.id);
    const generatedAdmin = await applyClientLifecycle(client);
    res.status(201).json({ client: getClientById(client.id), generatedAdmin });
});

app.patch('/api/admin/clients/:id', requireAuth, requireAdmin, async (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const error = validateClientBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const rfc = (req.body.rfc || '').trim();
    if (rfc && findClientByRfc(rfc, existing.id)) {
        return res.status(409).json({ message: 'A client with that RFC already exists.' });
    }
    const client = updateClient(req.params.id, extractClientFields(req.body));
    applyEffectiveEntitlements(client.id);
    const generatedAdmin = await applyClientLifecycle(client);
    res.json({ client: getClientById(client.id), generatedAdmin });
});

// No hard-delete route: a client can only ever be Edited or Activado/
// Desactivado (see PATCH above, status field) — once a client is on file it
// stays on file. Deleting also isn't possible from the UI (see Admin-SaaS.js
// renderClients) — this comment is the one remaining trace of the old
// DELETE /api/admin/clients/:id route.

app.get('/api/admin/clients/:id/modules', requireAuth, requireAdmin, (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    res.json({ modules: getClientModules(req.params.id), costCentersLimit: existing.cost_centers_limit });
});

// Read-only, for the "Accesos del Administrador" and Contrataciones-adjacent
// tree in Admin-SaaS — GEIPSA has no clientId of its own, so it needs a
// client-scoped route (unlike /api/business/cost-centers, which relies on
// the caller's own session clientId).
app.get('/api/admin/clients/:id/cost-centers', requireAuth, requireAdmin, (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    res.json({ costCenters: listCostCenters(req.params.id) });
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

// Read-only support views: lets GEIPSA see a client's own team (Business-
// Usuarios list, minus the auto-provisioned admin) and one user's actual
// access (profiles + extra grants + the effective union of both) without
// needing that client's own login — useful for diagnosing "I granted
// everything but the buttons still don't show" style reports.
app.get('/api/admin/clients/:id/business-users', requireAuth, requireAdmin, (req, res) => {
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    res.json({ users: listBusinessUsers(req.params.id) });
});

app.get('/api/admin/clients/:id/business-users/:userId/access', requireAuth, requireAdmin, (req, res) => {
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const user = getUserById(req.params.userId, req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({
        profiles: getUserProfiles(req.params.userId),
        extraGrants: getUserGrants(req.params.userId),
        effectiveGrants: getUserEffectiveGrants(req.params.userId),
    });
});

// Accesos del Administrador: the auto-provisioned client admin sees every
// módulo/apartado/pantalla the client has contracted by default (no grants
// needed) — this only exists for GEIPSA to explicitly RESTRICT that default
// down to a specific set, same grant shape as a normal user's extra grants
// (reuses user_grants via getUserGrants/setUserGrants), just reachable only
// from here. An empty grants array here means "no override" — Dashboard.js
// treats that as full access to whatever's contracted, not "nothing".
app.get('/api/admin/clients/:id/admin-access', requireAuth, requireAdmin, (req, res) => {
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    if (!client.admin_user_id) return res.status(404).json({ message: 'This client has no admin user yet.' });
    res.json({ grants: getUserGrants(client.admin_user_id) });
});

app.put('/api/admin/clients/:id/admin-access', requireAuth, requireAdmin, (req, res) => {
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    if (!client.admin_user_id) return res.status(404).json({ message: 'This client has no admin user yet.' });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    res.json({ grants: setUserGrants(client.admin_user_id, grants) });
});

// Anexos: per-client extras on top of their plan (e.g. +2 centros de costo
// beyond what the plan gives, or a module the plan doesn't include). GET
// also returns the plan's own base numbers so the UI can show them as
// context ("this plan gives 5, you're adding 2 more for this client").
app.get('/api/admin/clients/:id/addenda', requireAuth, requireAdmin, (req, res) => {
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const plan = client.plan ? getPlanByName(client.plan) : null;
    res.json({
        addenda: getClientAddenda(req.params.id),
        planBase: { modules: plan ? plan.modules : [], costCentersLimit: plan ? plan.costCentersLimit : 0 },
    });
});

app.put('/api/admin/clients/:id/addenda', requireAuth, requireAdmin, (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const { extraModules, extraCostCenters, requestedBy, requestedAt, contractedDuration } = req.body || {};
    if (extraModules !== undefined && !Array.isArray(extraModules)) {
        return res.status(400).json({ message: 'extraModules must be an array.' });
    }
    if (extraCostCenters !== undefined && (!Number.isInteger(extraCostCenters) || extraCostCenters < 0)) {
        return res.status(400).json({ message: 'extraCostCenters must be a non-negative integer.' });
    }
    const dateError = validateOptionalDate(requestedAt, 'requestedAt');
    if (dateError) return res.status(400).json({ message: dateError });

    // "Cambios de Anexos": one audit row per módulo that actually enters or
    // leaves extra_modules on this save — diffed against what was there
    // right before, not against the plan's own modules (those were never
    // anexos to begin with, so toggling the plan itself doesn't log here).
    const previousModules = getClientAddenda(req.params.id).extraModules;
    const nextModules = sanitizePlanModules(extraModules);
    const added = nextModules.filter((key) => !previousModules.includes(key));
    const removed = previousModules.filter((key) => !nextModules.includes(key));

    setClientAddenda(req.params.id, {
        extraModules: nextModules,
        extraCostCenters: extraCostCenters || 0,
    });
    applyEffectiveEntitlements(req.params.id);

    added.forEach((moduleKey) => recordAnexoChange(req.params.id, {
        moduleKey, action: 'added', requestedBy, requestedAt, contractedDuration,
    }));
    removed.forEach((moduleKey) => recordAnexoChange(req.params.id, {
        moduleKey, action: 'removed', requestedBy, requestedAt, contractedDuration,
    }));

    res.json({
        addenda: getClientAddenda(req.params.id),
        modules: getClientModules(req.params.id),
        costCentersLimit: getClientById(req.params.id).cost_centers_limit,
    });
});

// Cambios de Anexos: read-only history for the modal that shows who
// requested each anexo change and when — the actual writes happen inside
// the addenda PUT above, never directly.
app.get('/api/admin/clients/:id/anexo-changes', requireAuth, requireAdmin, (req, res) => {
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    res.json({ changes: getAnexoChanges(req.params.id) });
});

// --- SaaS admin: costo por módulo (Costos de Módulos) ------------------------
// Used to compute "Pago por Anexos" per client (see getAnexosPaymentTotal) —
// completely separate from Planes y Paquetes, which only decides which
// módulos a plan includes, not what any of them cost.
app.get('/api/admin/module-costs', requireAuth, requireAdmin, (req, res) => {
    const costByKey = new Map(getModuleCosts().map((c) => [c.module_key, c.cost]));
    res.json({ costs: MODULE_CATALOG.map((m) => ({ ...m, cost: costByKey.get(m.key) || 0 })) });
});

app.put('/api/admin/module-costs', requireAuth, requireAdmin, (req, res) => {
    const { costs } = req.body || {};
    if (!Array.isArray(costs)) return res.status(400).json({ message: 'costs must be an array.' });
    const validKeys = new Set(MODULE_CATALOG.map((m) => m.key));
    for (const { key, cost } of costs) {
        if (!validKeys.has(key)) return res.status(400).json({ message: `Unknown module key: ${key}.` });
        if (typeof cost !== 'number' || Number.isNaN(cost) || cost < 0) {
            return res.status(400).json({ message: `cost for ${key} must be a number >= 0.` });
        }
    }
    setModuleCosts(costs);
    const costByKey = new Map(getModuleCosts().map((c) => [c.module_key, c.cost]));
    res.json({ costs: MODULE_CATALOG.map((m) => ({ ...m, cost: costByKey.get(m.key) || 0 })) });
});

// --- SaaS admin: plans / packages (Planes y Paquetes) ------------------------
// GEIPSA's own catalog of plan types, shown as options on the "Plan /
// paquete" field in Clientes Nuevos. Not tied to module entitlements —
// clients.plan just stores the chosen name as free text (see db.js).
function validatePlanBody(body) {
    const { name, modules, costCentersLimit } = body || {};
    if (!name || !name.trim()) return 'name is required.';
    if (modules !== undefined && !Array.isArray(modules)) return 'modules must be an array.';
    if (costCentersLimit !== undefined && (!Number.isInteger(costCentersLimit) || costCentersLimit < 0)) {
        return 'costCentersLimit must be a non-negative integer.';
    }
    return null;
}

// Same filtering setClientModules does — silently drop anything that isn't
// a real module key, rather than storing garbage a client could never have.
function sanitizePlanModules(modules) {
    const validKeys = new Set(MODULE_CATALOG.map((m) => m.key));
    return Array.isArray(modules) ? modules.filter((key) => validKeys.has(key)) : [];
}

app.get('/api/admin/plans', requireAuth, requireAdmin, (req, res) => {
    res.json({ plans: listPlans() });
});

app.post('/api/admin/plans', requireAuth, requireAdmin, (req, res) => {
    const error = validatePlanBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { name, description, modules, costCentersLimit } = req.body;
    try {
        const plan = createPlan({
            name: name.trim(), description,
            modules: sanitizePlanModules(modules), costCentersLimit: costCentersLimit || 0,
        });
        res.status(201).json({ plan });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A plan with that name already exists.' });
        }
        throw err;
    }
});

app.patch('/api/admin/plans/:id', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    const error = validatePlanBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { name, description, modules, costCentersLimit } = req.body;
    try {
        const plan = updatePlan(req.params.id, {
            name: name.trim(), description,
            modules: sanitizePlanModules(modules), costCentersLimit: costCentersLimit || 0,
        });
        res.json({ plan });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A plan with that name already exists.' });
        }
        throw err;
    }
});

app.delete('/api/admin/plans/:id', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    deletePlan(req.params.id);
    res.status(204).end();
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

// Any authenticated user AT a client needs this to filter their OWN
// sidebar/top-bar correctly (department picker, the 7 top-bar buttons) —
// not just that client's admin. Read-only, scoped to the caller's own
// clientId, same reasoning as /api/business/branding below.
app.get('/api/business/contracted-modules', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
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

// Datos de Cliente (misión, visión, valores, historia) — read-only here on
// purpose: GEIPSA sets these from Clientes Nuevos (Admin-SaaS), the client's
// own team can only view them. Same visibility as branding: any
// authenticated user at the client, not just their admin.
app.get('/api/business/client-data', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const profile = getClientProfile(req.user.clientId);
    if (!profile) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ profile });
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
        username, email, passwordHash: await hashPassword(password), name,
        clientId: req.user.clientId, isClientAdmin: false,
    });
    res.status(201).json({
        user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role, created_at: user.created_at },
    });
});

// The auto-provisioned client admin (is_client_admin) is managed from the
// GEIPSA side only (Admin-SaaS > "Accesos del Administrador" — see
// /api/admin/clients/:id/admin-access below), never from this client's own
// Administración del Negocio — hence the 403s below on every route in this
// file that would otherwise let a client touch that one user's
// profiles/grants.
app.get('/api/business/users/:id/profiles', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
    res.json({ profiles: getUserProfiles(req.params.id) });
});

app.put('/api/business/users/:id/profiles', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
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
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
    res.json({ grants: getUserGrants(req.params.id) });
});

app.put('/api/business/users/:id/grants', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
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
        logTableChange({
            clientId: req.user.clientId, tableKey: 'centros-costo', recordId: costCenter.id,
            recordLabel: costCenter.code, action: 'create', changedBy: req.user.name,
        });
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
        logFieldChanges('centros-costo', existing.id, existing.code, req.user.name, COST_CENTER_FIELDS, existing, { code, name, description, responsible });
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
    logTableChange({
        clientId: req.user.clientId, tableKey: 'centros-costo', recordId: existing.id,
        recordLabel: existing.code, action: 'delete', changedBy: req.user.name,
    });
    deleteCostCenter(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Registro Combustible (Operaciones > Transporte Volumen) ----------------
// Any authenticated staff member at a client can read/create/edit these —
// unlike cost centers, this is day-to-day operational data entry, not
// account administration, so it's not gated by requireClientAdmin. Page-level
// access is already enforced by the sidebar/menu grant system on the client
// (Dashboard.initDashboard); these routes only require the caller to belong
// to a client at all.
function mapFuelRecord(row) {
    if (!row) return row;
    return {
        id: row.id,
        dbId: row.db_id,
        recordNumber: row.record_number,
        date: row.record_date,
        ecoUnit: row.eco_unit,
        plates: row.plates,
        driver: row.driver,
        coordinator: row.coordinator,
        ticketEvidence: row.ticket_evidence,
        tripKmBefore: row.trip_km_before,
        tripKmAfter: row.trip_km_after,
        fuelType: row.fuel_type,
        liters: row.liters,
        subtotal: row.subtotal,
        vat: row.vat,
        reason: row.reason,
        transferService: row.transfer_service,
        internalMovement: row.internal_movement,
    };
}

app.get('/api/business/fuel-records', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ records: listFuelRecords(req.user.clientId).map(mapFuelRecord) });
});

app.post('/api/business/fuel-records', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { date, ecoUnit, driver, coordinator } = req.body || {};
    if (!date || !ecoUnit?.trim() || !driver?.trim() || !coordinator?.trim()) {
        return res.status(400).json({ message: 'date, ecoUnit, driver and coordinator are required.' });
    }
    const record = createFuelRecord({
        clientId: req.user.clientId,
        date,
        ecoUnit: ecoUnit.trim(),
        driver: driver.trim(),
        coordinator: coordinator.trim(),
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'registro-combustible', recordId: record.id,
        recordLabel: record.eco_unit, action: 'create', changedBy: req.user.name,
    });
    res.status(201).json({ record: mapFuelRecord(record) });
});

app.patch('/api/business/fuel-records/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFuelRecordById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Fuel record not found.' });
    const patch = req.body || {};
    // Never log the raw base64 ticket photo into the audit table — just
    // whether one is present, before and after.
    const loggablePatch = Object.prototype.hasOwnProperty.call(patch, 'ticketEvidence')
        ? { ...patch, ticketEvidence: patch.ticketEvidence ? '[imagen]' : '' }
        : patch;
    const loggableExisting = { ...existing, ticket_evidence: existing.ticket_evidence ? '[imagen]' : '' };
    logFieldChanges('registro-combustible', existing.id, existing.eco_unit, req.user.name, FUEL_PATCHABLE_FIELDS, loggableExisting, loggablePatch);
    const record = updateFuelRecord(req.params.id, req.user.clientId, patch);
    res.json({ record: mapFuelRecord(record) });
});

app.delete('/api/business/fuel-records/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFuelRecordById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Fuel record not found.' });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'registro-combustible', recordId: existing.id,
        recordLabel: existing.eco_unit, action: 'delete', changedBy: req.user.name,
    });
    deleteFuelRecord(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Mi Recurso Humano (Operaciones > Recursos Humanos > Administración de --
// --- Personal) — same access model as fuel records above. ------------------
function mapHrWorker(row) {
    if (!row) return row;
    return {
        id: row.id,
        dbId: row.db_id,
        recordNumber: row.record_number,
        fullName: row.full_name,
        position: row.position,
        startDate: row.start_date,
        department: row.department,
        area: row.area,
        email: row.email,
        phone: row.phone,
        status: row.status,
    };
}

app.get('/api/business/hr-workers', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ workers: listHrWorkers(req.user.clientId).map(mapHrWorker) });
});

app.post('/api/business/hr-workers', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { fullName, position, startDate, department } = req.body || {};
    if (!fullName?.trim() || !position?.trim() || !startDate || !department?.trim()) {
        return res.status(400).json({ message: 'fullName, position, startDate and department are required.' });
    }
    const worker = createHrWorker({
        clientId: req.user.clientId,
        fullName: fullName.trim(),
        position: position.trim(),
        startDate,
        department: department.trim(),
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'mi-recurso-humano', recordId: worker.id,
        recordLabel: worker.full_name, action: 'create', changedBy: req.user.name,
    });
    res.status(201).json({ worker: mapHrWorker(worker) });
});

app.patch('/api/business/hr-workers/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getHrWorkerById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Worker not found.' });
    logFieldChanges('mi-recurso-humano', existing.id, existing.full_name, req.user.name, HR_WORKER_PATCHABLE_FIELDS, existing, req.body || {});
    const worker = updateHrWorker(req.params.id, req.user.clientId, req.body || {});
    res.json({ worker: mapHrWorker(worker) });
});

app.delete('/api/business/hr-workers/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getHrWorkerById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Worker not found.' });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'mi-recurso-humano', recordId: existing.id,
        recordLabel: existing.full_name, action: 'delete', changedBy: req.user.name,
    });
    deleteHrWorker(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Historial de cambios (control de cambios icon, generic across every ---
// --- .data-table — see openChangeHistory in Dashboard.js) -------------------
// tableKey is whatever data-table-id the caller is looking at; tables with
// no business backend yet (or GEIPSA-admin-only ones, which have no
// req.user.clientId) simply degrade to a 404/empty list, same as
// contracted-modules/branding above.
app.get('/api/business/table-changes/:tableKey', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ changes: getTableChanges(req.user.clientId, req.params.tableKey) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SGN app listening on port ${PORT}`));
