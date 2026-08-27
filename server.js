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
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

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
    setClientAppEnabled,
    updateClientBranding,
    findClientByRfc,
    getModuleCosts,
    setModuleCosts,
    getAnexoChanges,
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
    activateHrWorkerUser,
    updateHrWorker,
    deleteHrWorker,
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
    listBusinessSectors,
    createBusinessSector,
    deleteBusinessSector,
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
    // Estatus Operativo, derived from this user's Estatus RH (see
    // computeOperationalStatus in db.js) — a "suspended" or "inactive" RH
    // status (vacaciones, incapacidad, rescisión de contrato...) blocks
    // login entirely, even though users.active itself may still be 1.
    const operationalStatus = getUserOperationalStatus(user.id);
    if (operationalStatus === 'inactive') {
        return res.status(403).json({ message: 'This account cannot access the system due to a contract termination.', operationalStatus });
    }
    if (operationalStatus === 'suspended') {
        return res.status(403).json({ message: 'This account is temporarily suspended.', operationalStatus });
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

// Segundo documento de contrato (editable, Word) junto al PDF firmado —
// mismo tope de tamaño, MIME de .doc o .docx.
const CONTRACT_WORD_MIME_PREFIXES = [
    'data:application/msword',
    'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
function validateContractWordFile(contractWordDataUrl) {
    if (!contractWordDataUrl) return null;
    if (typeof contractWordDataUrl !== 'string' || !CONTRACT_WORD_MIME_PREFIXES.some((p) => contractWordDataUrl.startsWith(p))) {
        return 'contractWordDataUrl must be a Word document data URL.';
    }
    if (contractWordDataUrl.length > MAX_CONTRACT_DATA_URL_LENGTH) {
        return 'Contract Word file is too large (max ~5MB).';
    }
    return null;
}

// RFC es opcional (un prospecto sin RFC aún es válido), pero si SÍ se
// escribe algo debe medir exactamente 13 caracteres — el mensaje es el que
// el usuario pidió mostrar tal cual.
function validateRfc(rfc) {
    if (!rfc) return null;
    if (typeof rfc !== 'string' || rfc.trim().length !== 13) {
        return 'La cantidad de caracteres no corresponden a un RFC';
    }
    return null;
}

function validateCompanyAbbreviation(companyAbbreviation) {
    if (!companyAbbreviation) return null;
    if (typeof companyAbbreviation !== 'string' || companyAbbreviation.length > 6) {
        return 'companyAbbreviation must be at most 6 characters.';
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
        billingEmail, contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractWordDataUrl,
        rfc, companyAbbreviation, monthlyPayment, initialPayment,
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
        || validateContractWordFile(contractWordDataUrl)
        || validateRfc(rfc)
        || validateCompanyAbbreviation(companyAbbreviation)
        || validateOptionalDate(contractStartDate, 'contractStartDate')
        || validateOptionalDate(contractRegisteredDate, 'contractRegisteredDate')
        || validateOptionalDate(contractEndDate, 'contractEndDate')
        || validateOptionalMoney(monthlyPayment, 'monthlyPayment')
        || validateOptionalMoney(initialPayment, 'initialPayment');
}

app.get('/api/admin/modules', requireAuth, requireAdmin, (req, res) => {
    res.json({ modules: MODULE_CATALOG });
});

// Costo Contratado/Pago por Adicionales ya no se guardan a mano — se
// calculan en vivo contra el plan asignado + los adicionales vendidos a
// ESTE cliente (client_permission_grants), cada vez que se pide la lista.
// Un cliente sin plan (o con un plan que ya no existe) da todo en 0, nunca
// truena.
app.get('/api/admin/clients', requireAuth, requireAdmin, (req, res) => {
    const clients = listClients().map((client) => {
        const plan = client.plan ? getPlanByName(client.plan) : null;
        const planAccessPermissionsCost = plan ? computeAccessCostTotal(plan.id) : 0;
        const planCostCentersLimit = plan ? plan.costCentersLimit : 0;
        const planCostPerCostCenter = plan ? plan.costPerCostCenter : 0;
        const planCurrency = plan ? plan.currency : 'MXN';
        const additionalCostCentersPayment = (client.extra_cost_centers || 0) * planCostPerCostCenter;
        const additionalPermissionsPayment = plan ? computeClientAdditionalPermissionsCost(client.id) : 0;
        return {
            ...client,
            costCentersUsed: countCostCenters(client.id),
            planAccessPermissionsCost,
            planCostCentersLimit,
            planCostPerCostCenter,
            planCurrency,
            contractedCostComputed: planAccessPermissionsCost + (planCostCentersLimit * planCostPerCostCenter),
            additionalCostCentersPayment,
            additionalPermissionsPayment,
            additionalsPaymentTotal: additionalCostCentersPayment + additionalPermissionsPayment,
            ...getSystemColumnsForRecord({
                companyName: client.company_name, area: '', modulo: 'Administración del Negocio', pantalla: 'Nuestros Clientes',
                centroCostos: '', createdAt: client.created_at,
            }),
        };
    });
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
// stamped onto the client's own real access every time a client is saved
// with that plan selected — a full replace across MODULE_CATALOG (not just
// enabling the plan's modules), so switching plans also turns off whatever
// the previous plan had on. Then extra_modules/extra_cost_centers (still
// stored via getClientAddenda/setClientAddenda — extraCostCenters is edited
// from the main client PATCH now, extraModules only ever changes via
// syncClientModulesFromPermissionGrants, see the permission-grants routes
// below) are merged in on top, so re-stamping a plan never wipes those out,
// and they never have to be re-entered just because the client's base plan
// was edited or reassigned. No-op on the plan side if the client has none
// selected, or the name doesn't match a real plan (free-text edge case).
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
        rfc, companyNickname, companyAbbreviation, ownerName, billingEmail, razonSocial,
        contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractFileName,
        contractWordDataUrl, contractWordFileName,
        monthlyPayment, initialPayment, sectorNegocio,
    } = body;
    return {
        companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette,
        mission, vision, coreValues, history,
        rfc, companyNickname, companyAbbreviation, ownerName, billingEmail, razonSocial,
        contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractFileName,
        contractWordDataUrl, contractWordFileName,
        // contracted_cost ya no viene de la UI (ver validateClientBody) —
        // updateClient hace COALESCE(@contractedCost, contracted_cost), así
        // que mandar null aquí congela el valor histórico en vez de
        // ponerlo en 0 en cada guardado futuro.
        contractedCost: null, monthlyPayment, initialPayment, sectorNegocio,
    };
}

// A client's Sector de Negocio must match one of the currently-ACTIVE
// Nuestras APPs' sectors (Inactivo/Desarrollo apps never appear in the
// picker, and the server enforces that too, not just the UI) — blank is
// always fine (client with no App assigned yet).
function validateSectorNegocio(sectorNegocio) {
    if (!sectorNegocio) return null;
    const active = listActiveAppSectors();
    if (!active.some((s) => s.sector === sectorNegocio)) {
        return 'El Sector de Negocio elegido no corresponde a ninguna App activa.';
    }
    return null;
}

app.post('/api/admin/clients', requireAuth, requireAdmin, async (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-clients', 'crear')) {
        return res.status(403).json({ message: 'No tienes permiso para crear clientes.' });
    }
    const error = validateClientBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const sectorError = validateSectorNegocio(req.body.sectorNegocio);
    if (sectorError) return res.status(400).json({ message: sectorError });
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
    // Editar and Activar/Desactivar are independent Equipo SaaS leaves — an
    // admin holding only one of them can still save this same form as long
    // as what they're actually changing matches what they hold: any
    // non-status field needs Editar, an actual status flip additionally (or
    // solely) needs Activar. Both apply when a save touches both at once.
    const grants = getSaasUserGrants(req.user.sub);
    const changesStatus = req.body?.status !== undefined && req.body.status !== existing.status;
    const changesOtherFields = Object.keys(req.body || {}).some((k) => k !== 'status');
    if (changesOtherFields && !hasSaasGrant(grants, 'saas-clients', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para editar clientes.' });
    }
    if (changesStatus && !hasSaasGrant(grants, 'saas-clients', 'activar')) {
        return res.status(403).json({ message: 'No tienes permiso para activar/desactivar clientes.' });
    }
    const error = validateClientBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const sectorError = validateSectorNegocio(req.body.sectorNegocio);
    if (sectorError) return res.status(400).json({ message: sectorError });
    const rfc = (req.body.rfc || '').trim();
    if (rfc && findClientByRfc(rfc, existing.id)) {
        return res.status(409).json({ message: 'A client with that RFC already exists.' });
    }
    // extraCostCenters used to live only in the Anexos modal (now removed —
    // see the permission-grants routes below); it's just a plain field on
    // the main client save now. extraModules is preserved as-is since there
    // is no remaining UI to edit it directly (it's only ever touched by
    // syncClientModulesFromPermissionGrants).
    const { extraCostCenters } = req.body || {};
    if (extraCostCenters !== undefined && (!Number.isInteger(extraCostCenters) || extraCostCenters < 0)) {
        return res.status(400).json({ message: 'extraCostCenters must be a non-negative integer.' });
    }
    const client = updateClient(req.params.id, extractClientFields(req.body));
    if (extraCostCenters !== undefined) {
        setClientAddenda(req.params.id, { extraCostCenters, extraModules: getClientAddenda(req.params.id).extraModules });
    }
    applyEffectiveEntitlements(client.id);
    const generatedAdmin = await applyClientLifecycle(client);
    res.json({ client: getClientById(client.id), generatedAdmin });
});

// Independent on/off switch for whether this client can use the mobile App
// at all (separate from Editar — the Acciones icon in Nuestros Clientes),
// same 'saas-clients'/'editar' grant as the rest of the record.
app.patch('/api/admin/clients/:id/app-enabled', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-clients', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para editar clientes.' });
    }
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const client = setClientAppEnabled(req.params.id, !!req.body?.enabled);
    res.json({ client });
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

// Permisos Contratados / + Adicionales: árbol completo (hasta Columna) de
// lo vendido a ESTE cliente por encima de lo que su plan ya incluye — ver
// client_permission_grants en db.js. GET también regresa los grants del
// plan del cliente para que el árbol pinte verde (plan) / amarillo
// (adicional) / rojo (no contratado) del lado del navegador.
app.get('/api/admin/clients/:id/permission-grants', requireAuth, requireAdmin, (req, res) => {
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const plan = client.plan ? getPlanByName(client.plan) : null;
    res.json({
        grants: getClientPermissionGrants(req.params.id),
        planGrants: plan ? getPlanGrants(plan.id) : [],
        planId: plan ? plan.id : null,
    });
});

// Solo acepta tuplas que el plan del cliente TODAVÍA no cubre — rechazado
// del lado servidor (no solo escondido en el árbol), para que un
// "+adicional" nunca pueda duplicar (y cobrar dos veces) algo que el plan
// ya incluye. Al guardar, sincroniza a acceso real (client_modules)
// cualquier departamento/botón que haya quedado 100% cubierto por los
// adicionales de este cliente — nunca al revés, nunca parcial (ver
// syncClientModulesFromPermissionGrants en db.js, Decisión #6: activar
// acceso real nunca pasa sin que su costo ya esté sumado).
app.put('/api/admin/clients/:id/permission-grants', requireAuth, requireAdmin, (req, res) => {
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    const plan = client.plan ? getPlanByName(client.plan) : null;
    const planGrants = plan ? getPlanGrants(plan.id) : [];
    for (const g of grants) {
        if (isTupleGranted(planGrants, g.sectionId, g.itemId, g.submenuId)) {
            return res.status(400).json({ message: 'Ese permiso ya está incluido en el plan del cliente.' });
        }
    }
    const saved = setClientPermissionGrants(req.params.id, grants);
    if (syncClientModulesFromPermissionGrants(req.params.id)) {
        applyEffectiveEntitlements(req.params.id);
    }
    res.json({ grants: saved, additionalPermissionsPayment: computeClientAdditionalPermissionsCost(req.params.id) });
});

// Cambios de Anexos: read-only history for the modal that shows who
// requested each anexo change and when — kept for the record of anexos
// granted the old (flat, whole-module) way; the new permission-grants
// route above doesn't write to this log (see its own comment).
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
    const { name, modules, costCentersLimit, createdAt } = body || {};
    if (!name || !name.trim()) return 'name is required.';
    if (modules !== undefined && !Array.isArray(modules)) return 'modules must be an array.';
    if (costCentersLimit !== undefined && (!Number.isInteger(costCentersLimit) || costCentersLimit < 0)) {
        return 'costCentersLimit must be a non-negative integer.';
    }
    if (createdAt !== undefined && createdAt !== null && (typeof createdAt !== 'string' || !DATE_RE.test(createdAt))) {
        return 'createdAt must be a date in YYYY-MM-DD format.';
    }
    return null;
}

// Same filtering setClientModules does — silently drop anything that isn't
// a real module key, rather than storing garbage a client could never have.
function sanitizePlanModules(modules) {
    const validKeys = new Set(MODULE_CATALOG.map((m) => m.key));
    return Array.isArray(modules) ? modules.filter((key) => validKeys.has(key)) : [];
}

// Once a plan's access tree is saved, it's meant to be final ("al generar
// un plan es para siempre" — a plan's DEFINITION shouldn't shift under
// clients already assigned to it). While the project is still being built,
// that lock is relaxed so plans can keep being iterated on — flip this to
// false before launch, and every plan saved with a full access tree from
// then on locks for real. Never read from an env var on purpose: this is a
// one-time, deliberate release switch, not a per-environment setting.
const DEV_MODE_ALLOW_LOCKED_PLAN_EDITS = true;

app.get('/api/admin/plans', requireAuth, requireAdmin, (req, res) => {
    const plans = listPlans().map((plan) => ({ ...plan, accessPermissionsCost: computeAccessCostTotal(plan.id) }));
    res.json({ plans, devModeOverride: DEV_MODE_ALLOW_LOCKED_PLAN_EDITS });
});

app.post('/api/admin/plans', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-plans', 'crear')) {
        return res.status(403).json({ message: 'No tienes permiso para crear planes.' });
    }
    const error = validatePlanBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { name, description, modules, costCentersLimit } = req.body;
    try {
        const plan = createPlan({
            name: name.trim(), description,
            modules: sanitizePlanModules(modules), costCentersLimit: costCentersLimit || 0,
            createdBy: req.user.name,
        });
        logPlanChange({ planId: plan.id, action: 'create', changedBy: req.user.name });
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
    const { status, endDate, currency, costPerCostCenter, createdAt, createdBy } = req.body || {};
    // The FIRST Revisión -> Activo transition only ever happens through the
    // gated POST .../activate below (requires the 'activate' SaaS grant) —
    // this plain PATCH can never do that one. Once a plan has been through
    // that gate at least once (existing.locked), its definition is already
    // frozen, so freely toggling active <-> inactive afterward needs no
    // further authorization — it's just a visibility flag at that point.
    if (status === 'active' && !existing.locked) {
        return res.status(400).json({ message: 'Usa el botón Activar para pasar un plan a Activo.' });
    }
    // This one route serves 3 different screens' saves, each its own Equipo
    // SaaS leaf: plan fields/endDate (Nuestros Planes -> Editar), status
    // (Nuestros Planes -> Activar/Desactivar toggle once already locked;
    // the one-time Revisión->Activo transition stays gated by 'activate'
    // via POST .../activate above, not here), and currency/
    // costPerCostCenter (Costo Accesos-Permisos -> Editar, see
    // Admin-CostosModulos.js's patchPlanField, which calls this same
    // route). A save can touch more than one bucket at once, so each is
    // checked independently against whatever it actually changes.
    const grants = getSaasUserGrants(req.user.sub);
    const bodyKeys = Object.keys(req.body || {});
    const changesStatus = status !== undefined && status !== existing.status;
    const changesPricing = bodyKeys.some((k) => k === 'currency' || k === 'costPerCostCenter');
    const changesPlanFields = bodyKeys.some((k) => k !== 'status' && k !== 'currency' && k !== 'costPerCostCenter');
    if (changesPlanFields && !hasSaasGrant(grants, 'saas-plans', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para editar planes.' });
    }
    if (changesStatus && !hasSaasGrant(grants, 'saas-plans', 'activate')) {
        return res.status(403).json({ message: 'No tienes permiso para activar/desactivar planes.' });
    }
    if (changesPricing && !hasSaasGrant(grants, 'saas-module-costs', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para editar costos de accesos-permisos.' });
    }
    if (currency !== undefined && !['MXN', 'USD'].includes(currency)) {
        return res.status(400).json({ message: 'currency must be MXN or USD.' });
    }
    if (costPerCostCenter !== undefined && (typeof costPerCostCenter !== 'number' || Number.isNaN(costPerCostCenter) || costPerCostCenter < 0)) {
        return res.status(400).json({ message: 'costPerCostCenter must be a number >= 0.' });
    }
    // Lifecycle-only patch (status/endDate) and pricing (currency/
    // costPerCostCenter) — always allowed, even locked. Pricing is a
    // separate, ongoing commercial concern from the frozen access-tree
    // definition (see Costo Accesos-Permisos) — never gated by `locked`.
    const isDefinitionChange = ['name', 'description', 'modules', 'costCentersLimit', 'createdAt', 'createdBy']
        .some((k) => Object.prototype.hasOwnProperty.call(req.body || {}, k));
    if (isDefinitionChange && existing.locked && !DEV_MODE_ALLOW_LOCKED_PLAN_EDITS) {
        return res.status(409).json({ message: 'Este plan ya fue guardado y no puede modificarse.' });
    }
    if (isDefinitionChange) {
        const error = validatePlanBody({ ...existing, ...req.body });
        if (error) return res.status(400).json({ message: error });
    }
    const { name, description, modules, costCentersLimit } = req.body;
    try {
        const plan = updatePlan(req.params.id, {
            name: name != null ? name.trim() : undefined,
            description,
            modules: modules != null ? sanitizePlanModules(modules) : undefined,
            costCentersLimit,
            status,
            endDate,
            currency,
            costPerCostCenter,
            createdAt,
            createdBy: createdBy != null ? createdBy.trim() : undefined,
        });
        logPlanChange({ planId: plan.id, action: 'update', changedBy: req.user.name });
        if (currency !== undefined && currency !== existing.currency) {
            logPlanChange({ planId: plan.id, action: 'update', fieldKey: 'admin.planCurrency', oldValue: existing.currency, newValue: currency, changedBy: req.user.name });
        }
        if (costPerCostCenter !== undefined && costPerCostCenter !== existing.costPerCostCenter) {
            logPlanChange({ planId: plan.id, action: 'update', fieldKey: 'admin.costPerCostCenter', oldValue: String(existing.costPerCostCenter), newValue: String(costPerCostCenter), changedBy: req.user.name });
        }
        res.json({ plan: { ...plan, accessPermissionsCost: computeAccessCostTotal(plan.id) } });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A plan with that name already exists.' });
        }
        throw err;
    }
});

// The one-time Revisión -> Activo gate (Tarea 4): only an admin holding
// the 'activate' grant under 'saas-plans' (or an unrestricted admin — see
// hasSaasGrant) can flip this. Locks the plan's definition + access tree
// for good in the same step (activatePlan in db.js) — matches "al generar
// un plan es para siempre".
app.post('/api/admin/plans/:id/activate', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    if (existing.status !== 'revision') {
        return res.status(409).json({ message: 'Solo un plan en Revisión puede activarse.' });
    }
    const grants = getSaasUserGrants(req.user.sub);
    if (!hasSaasGrant(grants, 'saas-plans', 'activate')) {
        return res.status(403).json({ message: 'No tienes permiso para autorizar planes.' });
    }
    const plan = activatePlan(req.params.id);
    logPlanChange({
        planId: plan.id, action: 'update', fieldKey: 'admin.planStatus',
        oldValue: 'revision', newValue: 'active', changedBy: req.user.name,
    });
    res.json({ plan });
});

app.delete('/api/admin/plans/:id', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-plans', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para editar planes.' });
    }
    deletePlan(req.params.id);
    res.status(204).end();
});

// --- Plan access tree ("Mis Planes" — árbol de accesos por plan) -----------
// Same {sectionId, itemId, submenuId} grant shape PermissionTree.js already
// saves for a client's profiles, mounted here against a plan instead. The
// first save locks the plan (see DEV_MODE_ALLOW_LOCKED_PLAN_EDITS above).
app.get('/api/admin/plans/:id/grants', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ grants: getPlanGrants(req.params.id), locked: existing.locked });
});

// Editable freely while the plan is in Revisión (any number of saves) —
// locked for good the moment it's Activo (see POST .../activate above,
// which is the ONLY thing that ever locks a plan now; saving the tree by
// itself no longer locks anything, unlike the earlier version of this
// route).
app.put('/api/admin/plans/:id/grants', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-plans', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para editar planes.' });
    }
    if (existing.locked && !DEV_MODE_ALLOW_LOCKED_PLAN_EDITS) {
        return res.status(409).json({ message: 'Este plan ya está activo y no puede modificarse.' });
    }
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    const saved = setPlanGrants(req.params.id, grants);
    // The old manual module checklist on "Editar plan" is gone — a
    // department/button now turns on for real the moment ANY permission
    // under it is granted here, so a plan never ends up feature-complete in
    // its access tree but invisible everywhere modules gate real behavior.
    syncPlanModulesFromGrants(req.params.id);
    logPlanChange({
        planId: req.params.id, action: 'update', fieldKey: 'admin.activeTree',
        oldValue: '', newValue: `${saved.length}`, changedBy: req.user.name,
    });
    res.json({ grants: saved });
});

function validatePlanPermissionCosts(costs) {
    if (!Array.isArray(costs)) return 'costs must be an array.';
    for (const c of costs) {
        if (!c || typeof c.sectionId !== 'string' || !c.sectionId) return 'each cost row needs a sectionId.';
        if (typeof c.cost !== 'number' || Number.isNaN(c.cost) || c.cost < 0) return 'cost must be a number >= 0.';
    }
    return null;
}

// --- Costo Accesos-Permisos ("Nuestros Planes" — precio por nodo del árbol,
// por plan) ------------------------------------------------------------
// Never lock-gated (see updatePlan's comment) — pricing stays editable even
// once a plan is Activo/bloqueado, unlike name/description/modules/
// costCentersLimit/the grant tree itself.
app.get('/api/admin/plans/:id/permission-costs', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ costs: getPlanPermissionCosts(req.params.id), currency: existing.currency });
});

app.put('/api/admin/plans/:id/permission-costs', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-module-costs', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para editar costos de accesos-permisos.' });
    }
    const { costs, currency } = req.body || {};
    const error = validatePlanPermissionCosts(costs);
    if (error) return res.status(400).json({ message: error });
    if (currency !== undefined && !['MXN', 'USD'].includes(currency)) {
        return res.status(400).json({ message: 'currency must be MXN or USD.' });
    }
    const saved = setPlanPermissionCosts(req.params.id, costs);
    let plan = existing;
    if (currency !== undefined && currency !== existing.currency) {
        plan = updatePlan(req.params.id, { currency });
        logPlanChange({
            planId: req.params.id, action: 'update', fieldKey: 'admin.planCurrency',
            oldValue: existing.currency, newValue: currency, changedBy: req.user.name,
        });
    }
    logPlanChange({
        planId: req.params.id, action: 'update', fieldKey: 'admin.accessPermissionsCost',
        oldValue: '', newValue: `${saved.length}`, changedBy: req.user.name,
    });
    res.json({ costs: saved, plan: { ...plan, accessPermissionsCost: computeAccessCostTotal(req.params.id) } });
});

app.get('/api/admin/plans/:id/changes', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ changes: getPlanChanges(req.params.id) });
});

// --- Nuestras APPs -----------------------------------------------------------
// The catalog of end-user app "kinds" (one per business vertical), each
// filled in over time with its own operational screens — see the
// saas_apps/saas_app_screens comment in db.js. Same 'saas-apps' grant
// shape (Ver/Editar/Crear) as saas-clients/saas-plans above, checked
// against Equipo SaaS's SAAS_PERMISSION_CATALOG.
const SAAS_APP_STATUSES = ['active', 'inactive', 'development'];

app.get('/api/admin/saas-apps', requireAuth, requireAdmin, (req, res) => {
    res.json({ apps: listSaasApps() });
});

// Read-only lookup behind the "Sector de Negocio" picker in Nuestros
// Clientes — only ACTIVE apps' sectors are offered (see validateSectorNegocio
// above, which enforces the same rule server-side on save).
app.get('/api/admin/app-sectors', requireAuth, requireAdmin, (req, res) => {
    res.json({ sectors: listActiveAppSectors() });
});

// The fixed catalog of Web screens/tables an App screen can map to — same
// keys as db.js's TABLE_GRANT_PATHS, see the "add screen" modal.
app.get('/api/admin/web-screens-catalog', requireAuth, requireAdmin, (req, res) => {
    res.json({ screens: WEB_SCREEN_CATALOG });
});

app.get('/api/admin/saas-apps/:id', requireAuth, requireAdmin, (req, res) => {
    const app_ = getSaasAppById(req.params.id);
    if (!app_) return res.status(404).json({ message: 'App not found.' });
    res.json({ app: app_ });
});

app.post('/api/admin/saas-apps', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'crear')) {
        return res.status(403).json({ message: 'No tienes permiso para crear apps.' });
    }
    const { name, icon, colorFrom, colorTo, sector, status } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'El nombre es requerido.' });
    if (status !== undefined && !SAAS_APP_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'Estatus inválido.' });
    }
    try {
        const app_ = createSaasApp({
            name: name.trim(), icon, colorFrom, colorTo,
            sector: (sector || '').trim(), status, createdBy: req.user.name,
        });
        res.status(201).json({ app: app_ });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'Ya existe una app con ese nombre o ese sector.' });
        }
        throw err;
    }
});

app.patch('/api/admin/saas-apps/:id', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para editar apps.' });
    }
    const existing = getSaasAppById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'App not found.' });
    const { name, icon, colorFrom, colorTo, sector, status } = req.body || {};
    if (status !== undefined && !SAAS_APP_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'Estatus inválido.' });
    }
    try {
        const app_ = updateSaasApp(req.params.id, {
            name, icon, colorFrom, colorTo,
            sector: sector !== undefined ? sector.trim() : undefined, status,
        });
        res.json({ app: app_ });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'Ya existe una app con ese nombre o ese sector.' });
        }
        throw err;
    }
});

app.delete('/api/admin/saas-apps/:id', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para eliminar apps.' });
    }
    const existing = getSaasAppById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'App not found.' });
    deleteSaasApp(req.params.id);
    res.status(204).end();
});

app.post('/api/admin/saas-apps/:id/screens', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para editar apps.' });
    }
    const existing = getSaasAppById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'App not found.' });
    const { name, screenType, webScreenKey } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'El nombre de la pantalla es requerido.' });
    // Every App screen fills a real Web table — see WEB_SCREEN_CATALOG in
    // db.js. This is what lets the permission tree lock an App screen until
    // its Web sibling already has at least one grant.
    if (!WEB_SCREEN_CATALOG.some((s) => s.key === webScreenKey)) {
        return res.status(400).json({ message: 'Selecciona a qué pantalla Web corresponde.' });
    }
    res.status(201).json({ app: addSaasAppScreen(req.params.id, { name: name.trim(), screenType, webScreenKey }) });
});

app.delete('/api/admin/saas-apps/:id/screens/:screenId', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'editar')) {
        return res.status(403).json({ message: 'No tienes permiso para editar apps.' });
    }
    const existing = getSaasAppById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'App not found.' });
    res.json({ app: deleteSaasAppScreen(req.params.id, req.params.screenId) });
});

// --- Nuestros Sectores de Negocio (catalog Nuestras APPs' Sector field ------
// picks from — see business_sectors in db.js) ---------------------------------
app.get('/api/admin/business-sectors', requireAuth, requireAdmin, (req, res) => {
    res.json({ sectors: listBusinessSectors() });
});

app.post('/api/admin/business-sectors', requireAuth, requireAdmin, (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'El nombre es requerido.' });
    try {
        const sector = createBusinessSector({ name: name.trim(), createdBy: req.user.name });
        res.status(201).json({ sector });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'Ya existe ese sector de negocio.' });
        }
        throw err;
    }
});

app.delete('/api/admin/business-sectors/:id', requireAuth, requireAdmin, (req, res) => {
    deleteBusinessSector(req.params.id);
    res.status(204).end();
});

// --- Equipo SaaS (GEIPSA's own staff — role='admin' accounts) ---------------
// Before this, the only way to have a role='admin' account was the seeded
// admin/admin user — no endpoint ever created another one. This is the
// first: any existing admin can create more (requireAdmin, not a narrower
// "can manage staff" grant — that would need a grant to bootstrap itself
// out of, a chicken-and-egg problem this small a team doesn't need solved).
app.get('/api/admin/saas-users', requireAuth, requireAdmin, (req, res) => {
    res.json({ users: listSaasAdmins() });
});

app.post('/api/admin/saas-users', requireAuth, requireAdmin, async (req, res) => {
    const { username, email, password, name } = req.body || {};
    if (!username || !email || !name || !password || password.length < 8) {
        return res.status(400).json({ message: 'username, email, name and a password of at least 8 characters are required.' });
    }
    if (usernameOrEmailExists(username, email)) {
        return res.status(409).json({ message: 'Username or email already taken.' });
    }
    const user = createUser({ username, email, passwordHash: await hashPassword(password), name, role: 'admin' });
    res.status(201).json({
        user: { id: user.id, username: user.username, email: user.email, name: user.name, active: user.active, created_at: user.created_at },
    });
});

function validateSaasGrants(grants) {
    if (!Array.isArray(grants)) return 'grants must be an array.';
    for (const g of grants) {
        if (!g || typeof g.itemId !== 'string' || !g.itemId) return 'Each grant needs a non-empty itemId.';
    }
    return null;
}

app.get('/api/admin/saas-users/:id/grants', requireAuth, requireAdmin, (req, res) => {
    res.json({ grants: getSaasUserGrants(req.params.id) });
});

app.put('/api/admin/saas-users/:id/grants', requireAuth, requireAdmin, (req, res) => {
    const { grants } = req.body || {};
    const error = validateSaasGrants(grants);
    if (error) return res.status(400).json({ message: error });
    res.json({ grants: setSaasUserGrants(req.params.id, grants) });
});

// The current admin's own SaaS grants — used by Dashboard.js to filter the
// sidebar/block direct URLs, and by Nuestros Planes to decide whether to
// even show the Activar button. Not client-scoped (this is a role='admin'
// account, never has a clientId).
app.get('/api/me/saas-grants', requireAuth, requireAdmin, (req, res) => {
    res.json({ grants: getSaasUserGrants(req.user.sub) });
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
// Backs the "Aplicación Móvil" tab in the permission tree (Otorgar Accesos /
// Nuestros Perfiles) and, later, the mobile home screen — any authenticated
// business user can read it (same visibility as branding/client-data above),
// it's just "what App does my company have" info, nothing sensitive.
app.get('/api/business/app-screens', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json(getClientAppScreens(req.user.clientId));
});

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

// No POST here — users are never created directly on this screen. Each one
// is auto-provisioned the moment its person is registered in Mi Recurso
// Humano (see createHrWorker in db.js); this screen only enables/disables
// the account and assigns its profiles/permissions below.
app.patch('/api/business/users/:id', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
    const { active } = req.body || {};
    if (typeof active !== 'boolean') {
        return res.status(400).json({ message: 'active must be a boolean.' });
    }
    setUserActive(req.params.id, active);
    res.json({ user: { ...user, active: active ? 1 : 0 } });
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

// Self-service version of the route below -- any authenticated business
// user can check their OWN active permissions ("Servicio Contratado" ->
// "Mis Accesos y Permisos"), no admin grant required, since it's their own
// data. Same profile + extra shape "Permisos Activados" already uses.
app.get('/api/business/me/grants', requireAuth, (req, res) => {
    res.json({ grants: getUserGrants(req.user.sub), profileGrants: getUserProfileGrants(req.user.sub) });
});

app.get('/api/business/users/:id/grants', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
    // grants = the extra layer this screen's own edit modal manages;
    // profileGrants = everything this user already gets from their assigned
    // profile(s) -- surfaced here too so "Permisos Activados" (read-only)
    // can show the full effective picture (profile + extra) without a
    // second round trip.
    res.json({ grants: getUserGrants(req.params.id), profileGrants: getUserProfileGrants(req.params.id) });
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

// --- Column-level permission enforcement (Solo Ver / Ver y Operar / -------
// --- Editar + Autorizar approval workflow) ----------------------------------
// The FIRST real server-side grant check in this app (menu/section grants
// are otherwise only enforced client-side by hiding UI — see PermissionTree.js).
// Per-field, NOT all-or-nothing: every field in `patch` is evaluated on its
// own against its own column-level grant, so one locked field in a PATCH
// never blocks the others in the same request. For each field that actually
// changed (comparing RAW values — see below):
//   - the client's own admin: always applied immediately, no exceptions.
//   - empty -> filled: applied only with 'ver-y-operar' or 'editar' on that
//     column, otherwise rejected (no approval flow for a first-time fill —
//     only touching an already-saved value needs a second person's OK).
//   - filled -> different, level 'editar': NOT applied now — diverted into
//     a pending_changes row (see Parte C) for whoever holds Autorizar on
//     that column to approve/reject; the field is dropped from what
//     actually gets written to the record right now.
//   - filled -> different, any other level ('solo-ver'/'ver-y-operar'/none):
//     rejected outright, same as an empty-fill without permission.
//   - a field with an ALREADY-pending change for the same record+column is
//     rejected too (not queued again) — avoids 2 competing pending rows for
//     one field.
//
// The diff always runs on the RAW existing/patch values — `sanitizers[key]`
// only transforms what gets written to the change-history log (used by
// fuel-records' ticketEvidence, so the base64 photo never hits the audit
// table) — never the value used to decide whether something actually
// changed, and never what's stored in pending_changes (which needs the raw
// value to actually reconstruct the field once approved).
function checkAndLogFieldChanges(req, existing, patch, fieldsMap, tableKey, recordLabel, sanitizers = {}) {
    const applied = [];
    const pending = [];
    const rejected = [];
    let grants = null;
    for (const [key, { column, fieldKey }] of Object.entries(fieldsMap)) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        const oldValue = existing[column];
        const newValue = patch[key];
        if (String(oldValue ?? '') === String(newValue ?? '')) continue;

        if (req.user.isClientAdmin) {
            applied.push({ key, fieldKey, oldValue, newValue });
            continue;
        }

        grants = grants || getUserEffectiveGrants(req.user.sub);
        const colKey = fieldKey.split('.').pop();
        const level = getColumnGrantLevel(grants, tableKey, colKey);

        if (!oldValue) {
            if (level === 'ver-y-operar' || level === 'editar') {
                applied.push({ key, fieldKey, oldValue, newValue });
            } else {
                rejected.push(fieldKey);
            }
            continue;
        }

        if (level === 'editar' && !hasPendingChangeForField(existing.client_id, tableKey, existing.id, key)) {
            pending.push({ key, fieldKey, oldValue, newValue });
        } else {
            rejected.push(fieldKey);
        }
    }

    const appliedPatch = {};
    applied.forEach(({ key, newValue }) => { appliedPatch[key] = newValue; });
    applied.forEach((c) => {
        const sanitize = sanitizers[c.key];
        logTableChange({
            clientId: existing.client_id, tableKey, recordId: existing.id, recordLabel, action: 'update',
            fieldKey: c.fieldKey,
            oldValue: sanitize ? sanitize(c.oldValue) : c.oldValue,
            newValue: sanitize ? sanitize(c.newValue) : c.newValue,
            changedBy: req.user.name,
        });
    });
    pending.forEach((c) => createPendingChange({
        clientId: existing.client_id, tableKey, recordId: existing.id, recordLabel,
        fieldKey: c.fieldKey, columnKey: c.key, oldValue: c.oldValue, newValue: c.newValue,
        requestedBy: req.user.name, requestedByUserId: req.user.sub,
    }));

    return { appliedPatch, pendingFields: pending.map((c) => c.fieldKey), rejectedFields: rejected };
}

// --- Centros de Costo (cost centers, scoped to one client) -------------------
// Capped by clients.cost_centers_limit, which GEIPSA sets from Contrataciones
// (Admin-SaaS) — see setClientCostCentersLimit. Managing the catalog (create/
// edit/delete) stays admin-only, same as the rest of "Administración del
// Negocio" — but any authenticated user at the client can READ the list,
// since every client user needs it for the sidebar's Centro de Costo picker.
function validateCostCenterBody(body) {
    const { countryId, stateId, localityId, streetId, sucursal, name } = body || {};
    if (!countryId || !stateId || !localityId || !streetId || !sucursal || !name) {
        return 'countryId, stateId, localityId, streetId, sucursal and name are required.';
    }
    return null;
}

// Control Interno for Servicio Contratado's own table -- same recipe as
// FUEL_RECORD_*_LABEL/mapFuelRecord above, this table's 3 fixed labels.
// Centro Costos itself stays blank: a cost center record isn't tied to
// ANOTHER cost center the way an operational record (a fuel purchase, an
// HR worker) is, so there's nothing meaningful to put there.
const COST_CENTER_AREA_LABEL = '';
const COST_CENTER_MODULE_LABEL = 'Administración del Negocio';
const COST_CENTER_SCREEN_LABEL = 'Servicio Contratado';

function mapCostCenter(row, companyName) {
    if (!row) return row;
    return {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        responsible: row.responsible,
        status: row.status,
        accountNumber: row.account_number,
        recordCode: row.record_code,
        countryId: row.country_id,
        stateId: row.state_id,
        localityId: row.locality_id,
        streetId: row.street_id,
        sucursal: row.sucursal,
        ...getSystemColumnsForRecord({
            companyName,
            area: COST_CENTER_AREA_LABEL,
            modulo: COST_CENTER_MODULE_LABEL,
            pantalla: COST_CENTER_SCREEN_LABEL,
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/cost-centers', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const client = getClientById(req.user.clientId);
    res.json({
        costCenters: listCostCenters(req.user.clientId).map((cc) => mapCostCenter(cc, client.company_name)),
        limit: client.cost_centers_limit,
    });
});

app.post('/api/business/cost-centers', requireAuth, requireClientAdmin, (req, res) => {
    const error = validateCostCenterBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const client = getClientById(req.user.clientId);
    if (countCostCenters(req.user.clientId) >= client.cost_centers_limit) {
        return res.status(409).json({ message: 'Cost center limit reached for this client.' });
    }
    const { countryId, stateId, localityId, streetId, sucursal, name, description, responsible } = req.body;
    try {
        const costCenter = createCostCenter({
            clientId: req.user.clientId, countryId, stateId, localityId, streetId, sucursal, name, description, responsible,
        });
        logTableChange({
            clientId: req.user.clientId, tableKey: 'centros-costo', recordId: costCenter.id,
            recordLabel: costCenter.code, action: 'create', changedBy: req.user.name,
        });
        res.status(201).json({ costCenter: mapCostCenter(costCenter, client.company_name) });
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
    const { countryId, stateId, localityId, streetId, sucursal, name, description, responsible } = req.body;
    try {
        const costCenter = updateCostCenter(req.params.id, req.user.clientId, {
            countryId, stateId, localityId, streetId, sucursal, name, description, responsible,
        });
        // requireClientAdmin-gated route: req.user.isClientAdmin is always
        // true here, so every field always lands in appliedPatch and
        // pending/rejected are always empty — this call only exists for its
        // logTableChange side effect. Logged AFTER updateCostCenter (using
        // its own computed code/sucursal) since código is no longer part of
        // the submitted body — it's derived from the geo ids.
        checkAndLogFieldChanges(req, existing, {
            code: costCenter.code, name: costCenter.name, description: costCenter.description,
            responsible: costCenter.responsible, sucursal: costCenter.sucursal,
        }, COST_CENTER_FIELDS, 'centros-costo', existing.code);
        res.json({ costCenter: mapCostCenter(costCenter, getClientById(req.user.clientId).company_name) });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A cost center with that code already exists.' });
        }
        throw err;
    }
});

// No DELETE route -- a cost center's account_number/record_code are a
// permanent accounting sequence (same reasoning as clients themselves, see
// db.js's own migration comment), so only Activar/Desactivar from here on.
app.patch('/api/business/cost-centers/:id/status', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getCostCenterById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Cost center not found.' });
    const { status } = req.body || {};
    if (status !== 'active' && status !== 'inactive') return res.status(400).json({ message: 'status must be active or inactive.' });
    const costCenter = setCostCenterStatus(req.params.id, req.user.clientId, status);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'centros-costo', recordId: costCenter.id,
        recordLabel: costCenter.code, action: 'update', changedBy: req.user.name,
    });
    res.json({ costCenter: mapCostCenter(costCenter, getClientById(req.user.clientId).company_name) });
});

// --- Geo catalog (País/Estado/Localidad/Calle behind a Centro de Costos'
// código) -- shared across every client on the SaaS, see db.js's own comment
// on the geo_* tables. Reads are open to any authenticated user (harmless,
// and future screens may want them); adding a new entry is gated the same
// as creating/editing a Centro de Costos itself, since that's the only
// place these "+" buttons live today.
app.get('/api/business/geo/countries', requireAuth, (req, res) => {
    res.json({ items: listCountries() });
});
app.get('/api/business/geo/states', requireAuth, (req, res) => {
    const countryId = Number(req.query.countryId) || 0;
    if (!countryId) return res.status(400).json({ message: 'countryId is required.' });
    res.json({ items: listStates(countryId) });
});
app.get('/api/business/geo/localities', requireAuth, (req, res) => {
    const stateId = Number(req.query.stateId) || 0;
    if (!stateId) return res.status(400).json({ message: 'stateId is required.' });
    res.json({ items: listLocalities(stateId) });
});
app.get('/api/business/geo/streets', requireAuth, (req, res) => {
    const localityId = Number(req.query.localityId) || 0;
    if (!localityId) return res.status(400).json({ message: 'localityId is required.' });
    res.json({ items: listStreets(localityId) });
});
app.post('/api/business/geo/countries', requireAuth, requireClientAdmin, (req, res) => {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'name is required.' });
    res.status(201).json({ item: createCountry(name) });
});
app.post('/api/business/geo/states', requireAuth, requireClientAdmin, (req, res) => {
    const countryId = Number(req.body?.countryId) || 0;
    const name = (req.body?.name || '').trim();
    if (!countryId || !name) return res.status(400).json({ message: 'countryId and name are required.' });
    res.status(201).json({ item: createState(countryId, name) });
});
app.post('/api/business/geo/localities', requireAuth, requireClientAdmin, (req, res) => {
    const stateId = Number(req.body?.stateId) || 0;
    const name = (req.body?.name || '').trim();
    if (!stateId || !name) return res.status(400).json({ message: 'stateId and name are required.' });
    res.status(201).json({ item: createLocality(stateId, name) });
});
app.post('/api/business/geo/streets', requireAuth, requireClientAdmin, (req, res) => {
    const localityId = Number(req.body?.localityId) || 0;
    const name = (req.body?.name || '').trim();
    if (!localityId || !name) return res.status(400).json({ message: 'localityId and name are required.' });
    res.status(201).json({ item: createStreet(localityId, name) });
});

// --- Reglas de Orden de Llenado (field_fill_rules, scoped to one client) ---
// Reads are open to any authenticated user at the client -- every table
// viewer needs the rules to know which cells are locked, and someone with
// ONLY the Autorizar grant (not a client admin) still needs to see pending
// ones on the Gestión concentrator screen. A rule has no effect on any
// table until authorized (see mapFieldFillRule's authorized flag) -- only
// a client admin can create/edit/delete (a configuration decision, same
// gating as everything else under "Administración del Negocio"), and
// authorizing needs the specific colFieldRuleAuthorization grant.
function mapFieldFillRule(row) {
    if (!row) return row;
    return {
        id: row.id,
        tableKey: row.table_key,
        gateCol: row.gate_col,
        gateLabel: row.gate_label,
        dependentCol: row.dependent_col,
        dependentLabel: row.dependent_label,
        createdBy: row.created_by,
        createdAt: row.created_at,
        authorizedBy: row.authorized_by,
        authorizedAt: row.authorized_at,
        authorized: !!row.authorized_at,
    };
}
function validateFieldFillRuleBody(body) {
    const tableKey = (body?.tableKey || '').trim();
    const gateCol = (body?.gateCol || '').trim();
    const dependentCol = (body?.dependentCol || '').trim();
    if (!tableKey || !gateCol || !dependentCol) return 'tableKey, gateCol and dependentCol are required.';
    if (gateCol === dependentCol) return 'gateCol and dependentCol must be different columns.';
    return null;
}
app.get('/api/business/field-fill-rules', requireAuth, (req, res) => {
    const tableKey = (req.query.tableKey || '').trim();
    if (!tableKey) return res.status(400).json({ message: 'tableKey is required.' });
    if (!req.user.clientId) return res.json({ rules: [] });
    res.json({ rules: listFieldFillRules(req.user.clientId, tableKey).map(mapFieldFillRule) });
});
app.get('/api/business/field-fill-rules/all', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.json({ rules: [] });
    res.json({ rules: listAllFieldFillRules(req.user.clientId).map(mapFieldFillRule) });
});
app.post('/api/business/field-fill-rules', requireAuth, requireClientAdmin, (req, res) => {
    const error = validateFieldFillRuleBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { tableKey, gateCol, gateLabel, dependentCol, dependentLabel } = req.body;
    const rule = createFieldFillRule({
        clientId: req.user.clientId, tableKey, gateCol, gateLabel, dependentCol, dependentLabel, createdBy: req.user.name,
    });
    res.status(201).json({ rule: mapFieldFillRule(rule) });
});
app.patch('/api/business/field-fill-rules/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getFieldFillRuleById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Rule not found.' });
    const error = validateFieldFillRuleBody({ tableKey: existing.table_key, ...req.body });
    if (error) return res.status(400).json({ message: error });
    const { gateCol, gateLabel, dependentCol, dependentLabel } = req.body;
    try {
        const rule = updateFieldFillRule(req.params.id, req.user.clientId, { gateCol, gateLabel, dependentCol, dependentLabel });
        res.json({ rule: mapFieldFillRule(rule) });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'That dependent field already has a different rule.' });
        }
        throw err;
    }
});
app.post('/api/business/field-fill-rules/:id/authorize', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFieldFillRuleById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Rule not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canAuthorizeColumn(grants, 'reglas-orden-llenado', 'colFieldRuleAuthorization')) {
            return res.status(403).json({ message: 'No tienes permiso para autorizar reglas.' });
        }
    }
    const rule = authorizeFieldFillRule(req.params.id, req.user.clientId, req.user.name);
    res.json({ rule: mapFieldFillRule(rule) });
});
app.delete('/api/business/field-fill-rules/:id', requireAuth, requireClientAdmin, (req, res) => {
    deleteFieldFillRule(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Puestos de Trabajo (job positions, scoped to one client) ---------------
// Managing the catalog stays admin-only, same as Centros de Costo above —
// but any authenticated user at the client can READ it, since Mi Recurso
// Humano's Puesto field needs the (active-only) list for its own dropdown.
const JOB_POSITION_STATUSES = ['active', 'inactive'];
// requireName: false for PATCH — Centros de Costo Habilitados is edited
// from its own table-column modal now (see Business-PuestosTrabajo.js),
// sending a patch body with ONLY costCenterScope, so name can't be
// required there the way it is for a full create/edit-modal save.
function validateJobPositionBody(body, { requireName = true } = {}) {
    const { name, status, costCenterScope } = body || {};
    if (requireName && (!name || !name.trim())) return 'name is required.';
    if (!requireName && name !== undefined && !name.trim()) return 'name is required.';
    if (status !== undefined && !JOB_POSITION_STATUSES.includes(status)) {
        return `status must be one of: ${JOB_POSITION_STATUSES.join(', ')}.`;
    }
    if (costCenterScope !== undefined && costCenterScope !== 'all'
        && (!Array.isArray(costCenterScope) || !costCenterScope.length)) {
        return 'costCenterScope must be "all" or a non-empty array of cost center ids.';
    }
    return null;
}

app.get('/api/business/job-positions', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ jobPositions: listJobPositions(req.user.clientId) });
});

app.post('/api/business/job-positions', requireAuth, requireClientAdmin, (req, res) => {
    const error = validateJobPositionBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { name, abbreviation, costCenterScope, status } = req.body;
    if (Array.isArray(costCenterScope) && costCenterScope.some((id) => !getCostCenterById(id, req.user.clientId))) {
        return res.status(400).json({ message: 'costCenterScope contains a cost center that does not belong to this client.' });
    }
    try {
        const jobPosition = createJobPosition({
            clientId: req.user.clientId, name: name.trim(), abbreviation: (abbreviation || '').trim(),
            costCenterScope: Array.isArray(costCenterScope) ? JSON.stringify(costCenterScope) : 'all',
            status,
        });
        logTableChange({
            clientId: req.user.clientId, tableKey: 'puestos-trabajo', recordId: jobPosition.id,
            recordLabel: jobPosition.name, action: 'create', changedBy: req.user.name,
        });
        res.status(201).json({ jobPosition });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A job position with that name already exists.' });
        }
        throw err;
    }
});

app.patch('/api/business/job-positions/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getJobPositionById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Job position not found.' });
    const error = validateJobPositionBody(req.body, { requireName: false });
    if (error) return res.status(400).json({ message: error });
    const { name, abbreviation, costCenterScope, status } = req.body;
    if (Array.isArray(costCenterScope) && costCenterScope.some((id) => !getCostCenterById(id, req.user.clientId))) {
        return res.status(400).json({ message: 'costCenterScope contains a cost center that does not belong to this client.' });
    }
    const patch = {
        name: name !== undefined ? name.trim() : existing.name,
        abbreviation: abbreviation !== undefined ? abbreviation.trim() : existing.abbreviation,
        costCenterScope: costCenterScope !== undefined
            ? (costCenterScope === 'all' ? 'all' : JSON.stringify(costCenterScope))
            : existing.cost_center_scope,
        status: status ?? existing.status,
    };
    // requireClientAdmin-gated: same reasoning as Centros de Costo's own
    // PATCH above — always fully applied, this call only exists for its
    // logTableChange side effect.
    checkAndLogFieldChanges(req, existing, patch, JOB_POSITION_FIELDS, 'puestos-trabajo', existing.name);
    try {
        const jobPosition = updateJobPosition(req.params.id, req.user.clientId, patch);
        res.json({ jobPosition });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A job position with that name already exists.' });
        }
        throw err;
    }
});

app.delete('/api/business/job-positions/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getJobPositionById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Job position not found.' });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'puestos-trabajo', recordId: existing.id,
        recordLabel: existing.name, action: 'delete', changedBy: req.user.name,
    });
    deleteJobPosition(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Estatus RH catalog (Administración de Personal > Catálogos) -----------
// Same read-for-everyone/write-for-admins split as job positions: Mi
// Recurso Humano's own Estatus dropdown (any authenticated client user)
// needs the (active-only, filtered client-side same as Puesto's dropdown)
// list to render at all.
const HR_STATUS_EFFECTS = ['active', 'suspended', 'inactive'];
const HR_STATUS_CATALOG_STATUSES = ['active', 'inactive'];
function validateHrStatusCatalogBody(body, { requireName = true } = {}) {
    const { name, operationalEffect, status } = body || {};
    if (requireName && (!name || !name.trim())) return 'name is required.';
    if (!requireName && name !== undefined && !name.trim()) return 'name is required.';
    if (operationalEffect !== undefined && !HR_STATUS_EFFECTS.includes(operationalEffect)) {
        return `operationalEffect must be one of: ${HR_STATUS_EFFECTS.join(', ')}.`;
    }
    if (status !== undefined && !HR_STATUS_CATALOG_STATUSES.includes(status)) {
        return `status must be one of: ${HR_STATUS_CATALOG_STATUSES.join(', ')}.`;
    }
    return null;
}

app.get('/api/business/hr-status-catalog', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ hrStatuses: listHrStatusCatalog(req.user.clientId) });
});

app.post('/api/business/hr-status-catalog', requireAuth, requireClientAdmin, (req, res) => {
    const error = validateHrStatusCatalogBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { name, operationalEffect, status } = req.body;
    try {
        const hrStatus = createHrStatusCatalogEntry({
            clientId: req.user.clientId, name: name.trim(), operationalEffect, status,
        });
        logTableChange({
            clientId: req.user.clientId, tableKey: 'estatus-rh', recordId: hrStatus.id,
            recordLabel: hrStatus.name, action: 'create', changedBy: req.user.name,
        });
        res.status(201).json({ hrStatus });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'An HR status with that name already exists.' });
        }
        throw err;
    }
});

app.patch('/api/business/hr-status-catalog/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getHrStatusCatalogById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'HR status not found.' });
    const error = validateHrStatusCatalogBody(req.body, { requireName: false });
    if (error) return res.status(400).json({ message: error });
    const { name, operationalEffect, status } = req.body;
    const patch = {
        name: name !== undefined ? name.trim() : existing.name,
        operationalEffect: operationalEffect ?? existing.operational_effect,
        status: status ?? existing.status,
    };
    checkAndLogFieldChanges(req, existing, patch, HR_STATUS_CATALOG_FIELDS, 'estatus-rh', existing.name);
    try {
        const hrStatus = updateHrStatusCatalogEntry(req.params.id, req.user.clientId, patch);
        res.json({ hrStatus });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'An HR status with that name already exists.' });
        }
        throw err;
    }
});

app.delete('/api/business/hr-status-catalog/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getHrStatusCatalogById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'HR status not found.' });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'estatus-rh', recordId: existing.id,
        recordLabel: existing.name, action: 'delete', changedBy: req.user.name,
    });
    deleteHrStatusCatalogEntry(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Transacciones Inteligentes de Negocio (Negocio Inteligente) -----------
// A report is a name + an ordered list of columns (base, pulled straight
// from Base de Datos Global, or calculated, a formula over other columns
// already in the same report) -- see intelligent_report_columns in db.js for
// the exact shapes. This only stores/lists/edits the definition; running a
// report to see real computed data is a future piece, not built yet.
function validateReportColumns(columns) {
    if (!Array.isArray(columns)) return 'columns must be an array.';
    const ids = new Set(columns.map((_, i) => i));
    for (const col of columns) {
        if (!col || typeof col.label !== 'string' || !col.label.trim()) return 'Every column needs a label.';
        if (col.type === 'base') continue;
        if (col.type !== 'calculated') return 'Each column must be type "base" or "calculated".';
        const formula = col.formula;
        if (!formula || !Array.isArray(formula.operands) || !Array.isArray(formula.operators)) {
            return 'A calculated column needs a formula.';
        }
        if (formula.operands.length < 2 || formula.operands.length !== formula.operators.length + 1) {
            return 'A calculated column needs at least 2 operands, one fewer operator than operands.';
        }
        for (const op of formula.operands) {
            if (op.kind === 'constant') {
                if (typeof op.value !== 'number' || Number.isNaN(op.value)) return 'A constant operand needs a number.';
            } else if (op.kind === 'column') {
                if (!ids.has(op.reportColumnId)) return 'A column operand must reference another column in this same report.';
            } else {
                return 'Each operand must be a column or a constant.';
            }
        }
    }
    return null;
}

app.get('/api/business/intelligent-reports', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ reports: listIntelligentReports(req.user.clientId) });
});

app.get('/api/business/intelligent-reports/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const report = getIntelligentReportById(req.params.id, req.user.clientId);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    res.json({ report });
});

// Real computed data for a saved report -- same underlying records
// base-datos-global already assembles (mapFuelRecord already carries the 13
// Control Interno columns), run through computeIntelligentReportRows. A
// future screen's own map*Record output gets concatenated into `records`
// here the same way it will in base-datos-global once it exists.
app.get('/api/business/intelligent-reports/:id/results', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const report = getIntelligentReportById(req.params.id, req.user.clientId);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    const client = getClientById(req.user.clientId);
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'registro-combustible');
    const records = listFuelRecords(req.user.clientId).map((r) => mapFuelRecord(r, pendingByRecord, client?.company_name));
    const rows = computeIntelligentReportRows(report, records);
    res.json({ report: { name: report.name, columns: report.columns }, rows });
});

// Filename for Content-Disposition -- strips CR/LF and quotes (header
// injection) regardless of source, then offers both a plain ASCII fallback
// and the real UTF-8 name (RFC 5987) so accented report names (any user-
// given text ends up here) still show up correctly in browsers that honor
// filename*, instead of forcing every download into ASCII.
function buildContentDisposition(filename) {
    const clean = String(filename).replace(/[\r\n"]/g, ' ').trim() || 'archivo';
    const asciiSafe = clean.replace(/[^\x20-\x7E]/g, '_');
    return `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

// Exports whatever a .data-table's CURRENT view looks like (Dashboard.js:
// getVisibleTableSnapshot already narrows this down to visible columns, in
// their current order, and only rows passing every active filter) -- these
// 2 routes don't touch the database at all, they just format whatever the
// already-authenticated caller is already looking at, so requireAuth alone
// (no client-scoping needed) is the right gate, same reasoning as any other
// purely-formatting endpoint.
const EXPORT_MAX_ROWS = 20000;
const EXPORT_MAX_COLUMNS = 200;

function validateExportPayload(req, res) {
    const { columns, rows } = req.body || {};
    if (!Array.isArray(columns) || !columns.length || !Array.isArray(rows)) {
        res.status(400).json({ message: 'columns and rows are required.' });
        return null;
    }
    if (rows.length > EXPORT_MAX_ROWS || columns.length > EXPORT_MAX_COLUMNS) {
        res.status(400).json({ message: 'Too many rows or columns to export.' });
        return null;
    }
    return { columns, rows };
}

app.post('/api/business/export/xlsx', requireAuth, async (req, res) => {
    const payload = validateExportPayload(req, res);
    if (!payload) return;
    const { columns, rows } = payload;
    const title = String(req.body.title || 'Reporte').trim() || 'Reporte';
    const workbook = new ExcelJS.Workbook();
    // Excel sheet names: max 31 chars, can't contain \ / * ? : [ ]
    const sheet = workbook.addWorksheet(title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Reporte');
    sheet.columns = columns.map((col) => {
        const label = String(col?.label ?? '');
        return { header: label, width: Math.max(12, label.length + 4) };
    });
    rows.forEach((row) => {
        sheet.addRow(Array.isArray(row) ? row.map((cell) => (cell == null ? '' : String(cell))) : []);
    });
    sheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', buildContentDisposition(`${title}.xlsx`));
    await workbook.xlsx.write(res);
    res.end();
});

// pdfkit has no built-in table widget -- draws a simple even-width grid by
// hand, breaking to a new page (and re-measuring from the top margin) once
// a row would run past the bottom margin. Long cell text is clipped with
// an ellipsis rather than wrapped, so every row stays the same height and
// the grid lines stay simple to draw.
function drawPdfTable(doc, columns, rows) {
    const startX = doc.page.margins.left;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = pageWidth / columns.length;
    const rowHeight = 20;
    let y = doc.y;

    function drawRow(values, isHeader) {
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            y = doc.page.margins.top;
        }
        let x = startX;
        doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        values.forEach((val) => {
            doc.rect(x, y, colWidth, rowHeight).stroke('#CCCCCC');
            doc.fillColor('#000000').text(String(val ?? ''), x + 3, y + 5, {
                width: colWidth - 6, height: rowHeight - 6, ellipsis: true, lineBreak: false,
            });
            x += colWidth;
        });
        y += rowHeight;
    }

    drawRow(columns.map((c) => c.label), true);
    rows.forEach((row) => drawRow(row, false));
}

app.post('/api/business/export/pdf', requireAuth, (req, res) => {
    const payload = validateExportPayload(req, res);
    if (!payload) return;
    const { columns, rows } = payload;
    const title = String(req.body.title || 'Reporte').trim() || 'Reporte';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildContentDisposition(`${title}.pdf`));
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: columns.length > 5 ? 'landscape' : 'portrait' });
    doc.pipe(res);
    doc.fontSize(14).text(title, { align: 'center' });
    doc.moveDown();
    drawPdfTable(doc, columns, rows);
    doc.end();
});

app.post('/api/business/intelligent-reports', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { name, columns } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ message: 'name is required.' });
    const columnsError = validateReportColumns(columns || []);
    if (columnsError) return res.status(400).json({ message: columnsError });
    const report = createIntelligentReport({
        clientId: req.user.clientId, name: name.trim(), createdBy: req.user.name, columns,
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'transacciones-inteligentes', recordId: report.id,
        recordLabel: report.name, action: 'create', changedBy: req.user.name,
    });
    res.status(201).json({ report });
});

app.patch('/api/business/intelligent-reports/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getIntelligentReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Report not found.' });
    const { name, columns } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ message: 'name is required.' });
    const columnsError = validateReportColumns(columns || []);
    if (columnsError) return res.status(400).json({ message: columnsError });
    const report = updateIntelligentReport(req.params.id, req.user.clientId, { name: name.trim(), columns });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'transacciones-inteligentes', recordId: report.id,
        recordLabel: report.name, action: 'update', changedBy: req.user.name,
    });
    res.json({ report });
});

app.delete('/api/business/intelligent-reports/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getIntelligentReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Report not found.' });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'transacciones-inteligentes', recordId: existing.id,
        recordLabel: existing.name, action: 'delete', changedBy: req.user.name,
    });
    deleteIntelligentReport(req.params.id, req.user.clientId);
    res.status(204).end();
});

app.post('/api/business/intelligent-reports/:id/authorize', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getIntelligentReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Report not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canAuthorizeColumn(grants, 'transacciones-inteligentes', 'colReportAuthorization')) {
            return res.status(403).json({ message: 'No tienes permiso para autorizar reportes.' });
        }
    }
    const report = authorizeIntelligentReport(req.params.id, req.user.clientId, req.user.name);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'transacciones-inteligentes', recordId: report.id,
        recordLabel: report.name, action: 'update', changedBy: req.user.name,
    });
    res.json({ report });
});

// --- Reportes Programados (Configuración > Negocio Inteligente) ------------
// No mailer/WhatsApp/internal-chat delivery integration exists yet -- this
// only records the schedule definition for whenever that job gets built
// (same "define, don't execute" scope Transacciones Inteligentes itself
// started with).
const SCHEDULED_REPORT_DELIVERY_METHODS = ['email', 'whatsapp', 'internal_chat'];

function validateScheduledReportPayload(req, res) {
    const { reportId, name, endDate, deliveryMethod, recipients } = req.body || {};
    if (!name?.trim()) { res.status(400).json({ message: 'name is required.' }); return null; }
    if (!reportId) { res.status(400).json({ message: 'reportId is required.' }); return null; }
    if (!SCHEDULED_REPORT_DELIVERY_METHODS.includes(deliveryMethod)) {
        res.status(400).json({ message: 'deliveryMethod must be email, whatsapp, or internal_chat.' });
        return null;
    }
    if (!recipients?.trim()) { res.status(400).json({ message: 'recipients is required.' }); return null; }
    const report = getIntelligentReportById(reportId, req.user.clientId);
    if (!report) { res.status(400).json({ message: 'reportId does not match an existing report.' }); return null; }
    return { reportId, name: name.trim(), endDate: endDate?.trim() || null, deliveryMethod, recipients: recipients.trim() };
}

app.get('/api/business/scheduled-reports', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ scheduledReports: listScheduledReports(req.user.clientId) });
});

app.post('/api/business/scheduled-reports', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const payload = validateScheduledReportPayload(req, res);
    if (!payload) return;
    const scheduledReport = createScheduledReport({ clientId: req.user.clientId, createdBy: req.user.name, ...payload });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'reportes-programados', recordId: scheduledReport.id,
        recordLabel: scheduledReport.name, action: 'create', changedBy: req.user.name,
    });
    res.status(201).json({ scheduledReport });
});

app.patch('/api/business/scheduled-reports/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getScheduledReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Scheduled report not found.' });
    const payload = validateScheduledReportPayload(req, res);
    if (!payload) return;
    const scheduledReport = updateScheduledReport(req.params.id, req.user.clientId, payload);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'reportes-programados', recordId: scheduledReport.id,
        recordLabel: scheduledReport.name, action: 'update', changedBy: req.user.name,
    });
    res.json({ scheduledReport });
});

app.delete('/api/business/scheduled-reports/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getScheduledReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Scheduled report not found.' });
    deleteScheduledReport(req.params.id, req.user.clientId);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'reportes-programados', recordId: existing.id,
        recordLabel: existing.name, action: 'delete', changedBy: req.user.name,
    });
    res.status(204).end();
});

app.post('/api/business/scheduled-reports/:id/authorize', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getScheduledReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Scheduled report not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canAuthorizeColumn(grants, 'reportes-programados', 'colScheduledAuthorizedBy')) {
            return res.status(403).json({ message: 'No tienes permiso para autorizar envíos programados.' });
        }
    }
    const scheduledReport = authorizeScheduledReport(req.params.id, req.user.clientId, req.user.name);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'reportes-programados', recordId: scheduledReport.id,
        recordLabel: scheduledReport.name, action: 'update', changedBy: req.user.name,
    });
    res.json({ scheduledReport });
});

// --- Registro Combustible (Operaciones > Transporte Volumen) ----------------
// Any authenticated staff member at a client can read/create/edit these —
// unlike cost centers, this is day-to-day operational data entry, not
// account administration, so it's not gated by requireClientAdmin. Page-level
// access is already enforced by the sidebar/menu grant system on the client
// (Dashboard.initDashboard); these routes only require the caller to belong
// to a client at all.
// Control Interno's Área/Módulo/Pantalla are fixed for this one screen
// (matches its own position in menu.json: sc-area-transport-1 /
// supply-chain / cat-operaciones-transporte-vol-combustible) -- a future
// table repeats this same recipe with its own 3 fixed labels.
const FUEL_RECORD_AREA_LABEL = 'Transporte Volumen';
const FUEL_RECORD_MODULE_LABEL = 'Cadena de Suministro';
const FUEL_RECORD_SCREEN_LABEL = 'Registro Combustible';

function mapFuelRecord(row, pendingByRecord, companyName) {
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
        tripKmBeforeEvidence: row.trip_km_before_evidence,
        tripKmAfter: row.trip_km_after,
        tripKmAfterEvidence: row.trip_km_after_evidence,
        fuelType: row.fuel_type,
        liters: row.liters,
        subtotal: row.subtotal,
        vat: row.vat,
        reason: row.reason,
        transferService: row.transfer_service,
        internalMovement: row.internal_movement,
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: FUEL_RECORD_AREA_LABEL,
            modulo: FUEL_RECORD_MODULE_LABEL,
            pantalla: FUEL_RECORD_SCREEN_LABEL,
            centroCostos: row.centro_costos,
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/fuel-records', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'registro-combustible');
    const client = getClientById(req.user.clientId);
    res.json({ records: listFuelRecords(req.user.clientId).map((r) => mapFuelRecord(r, pendingByRecord, client?.company_name)) });
});

app.post('/api/business/fuel-records', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { date, ecoUnit, driver, coordinator, centroCostos } = req.body || {};
    if (!date || !ecoUnit?.trim() || !driver?.trim() || !coordinator?.trim()) {
        return res.status(400).json({ message: 'date, ecoUnit, driver and coordinator are required.' });
    }
    // Centro Costos is a Control Interno column -- it must be filled in
    // from creation, same as the fields above, not left to be silently
    // blank (the client only ever sends a value when exactly one cost
    // center is active in the top-bar picker; see
    // Dashboard.selectedCostCenterLabel's own comment for why).
    if (!centroCostos?.trim()) {
        return res.status(400).json({ message: 'centroCostos is required.' });
    }
    const record = createFuelRecord({
        clientId: req.user.clientId,
        date,
        ecoUnit: ecoUnit.trim(),
        driver: driver.trim(),
        coordinator: coordinator.trim(),
        centroCostos: (centroCostos || '').trim(),
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'registro-combustible', recordId: record.id,
        recordLabel: record.eco_unit, action: 'create', changedBy: req.user.name,
    });
    const client = getClientById(req.user.clientId);
    res.status(201).json({ record: mapFuelRecord(record, null, client?.company_name) });
});

app.patch('/api/business/fuel-records/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFuelRecordById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Fuel record not found.' });
    const patch = req.body || {};
    // The lock/diff check runs on the raw patch (never sanitized — see
    // checkAndLogFieldChanges' own note); only what gets WRITTEN to the
    // change-history log is sanitized, so the raw base64 ticket photo never
    // lands in the audit table. No longer all-or-nothing: appliedPatch may
    // be a subset of `patch` — anything diverted to pendingFields or
    // rejectedFields is simply excluded from what actually gets written.
    const { appliedPatch, pendingFields, rejectedFields } = checkAndLogFieldChanges(req, existing, patch, FUEL_PATCHABLE_FIELDS, 'registro-combustible', existing.eco_unit, {
        ticketEvidence: (v) => (v ? '[imagen]' : ''),
        tripKmBeforeEvidence: (v) => (v ? '[imagen]' : ''),
        tripKmAfterEvidence: (v) => (v ? '[imagen]' : ''),
    });
    const record = updateFuelRecord(req.params.id, req.user.clientId, appliedPatch);
    const client = getClientById(req.user.clientId);
    res.json({ record: mapFuelRecord(record, null, client?.company_name), pendingFields, rejectedFields });
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

// --- Base de Datos Global (Configuración > Base de Datos) -------------------
// Read-only union of every record from every pantalla that has Control
// Interno columns wired -- today just Registro Combustible. Reuses
// mapFuelRecord as-is (already carries the 13 Control Interno columns, see
// the Registro Combustible pilot above) rather than inventing a separate
// mapping shape; the day another pantalla gets Control Interno, its own
// map*Record output gets concatenated into `records` here the same way.
app.get('/api/business/base-datos-global', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const client = getClientById(req.user.clientId);
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'registro-combustible');
    const records = listFuelRecords(req.user.clientId).map((r) => ({
        ...mapFuelRecord(r, pendingByRecord, client?.company_name),
        sourceTable: 'registro-combustible',
    }));
    res.json({ records });
});

// --- Mi Recurso Humano (Operaciones > Recursos Humanos > Administración de --
// --- Personal) — same access model as fuel records above. ------------------
// Fixed per menu.json's own placement of this screen (human-resources /
// hr-area-personnel-admin / Mi Recurso Humano) — same recipe as
// FUEL_RECORD_*_LABEL above, see TABLE_GRANT_PATHS['mi-recurso-humano'] in
// db.js for where these 3 come from.
const HR_WORKER_MODULE_LABEL = 'Recursos Humanos';
const HR_WORKER_AREA_LABEL = 'Administración de Personal';
const HR_WORKER_SCREEN_LABEL = 'Mi Recurso Humano';

function mapHrWorker(row, pendingByRecord, companyName) {
    if (!row) return row;
    const costCenter = row.cost_center_id ? getCostCenterById(row.cost_center_id, row.client_id) : null;
    return {
        id: row.id,
        dbId: row.db_id,
        recordNumber: row.record_number,
        recordCode: row.record_code,
        givenNames: row.given_names,
        surnames: row.surnames,
        fullName: row.full_name,
        position: row.position,
        startDate: row.start_date,
        departments: JSON.parse(row.departments || '[]'),
        costCenterId: row.cost_center_id,
        area: row.area,
        email: row.email,
        phone: row.phone,
        hrStatusId: row.hr_status_id,
        hrStatusName: row.hrStatusName,
        hrStatusEffect: row.hrStatusEffect,
        username: row.username,
        // NULL (no linked account, shouldn't happen for anything created
        // after this feature shipped) reads as false, same as inactive.
        userActive: !!row.userActive,
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: HR_WORKER_AREA_LABEL,
            modulo: HR_WORKER_MODULE_LABEL,
            pantalla: HR_WORKER_SCREEN_LABEL,
            centroCostos: costCenter?.name || '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/hr-workers', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'mi-recurso-humano');
    const client = getClientById(req.user.clientId);
    res.json({ workers: listHrWorkers(req.user.clientId).map((w) => mapHrWorker(w, pendingByRecord, client?.company_name)) });
});

app.post('/api/business/hr-workers', requireAuth, async (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { givenNames, surnames, position, startDate, departments, costCenterId, email } = req.body || {};
    if (!givenNames?.trim() || !surnames?.trim() || !position?.trim() || !startDate || !Array.isArray(departments) || !departments.length || !email?.trim()) {
        return res.status(400).json({ message: 'givenNames, surnames, position, startDate, at least one department, and email are required.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        return res.status(400).json({ message: 'email must be a valid email address.' });
    }
    if (usernameOrEmailExists(null, email.trim())) {
        return res.status(409).json({ message: 'That email is already in use by another account.' });
    }
    if (costCenterId != null && !getCostCenterById(costCenterId, req.user.clientId)) {
        return res.status(400).json({ message: 'costCenterId does not belong to this client.' });
    }
    const worker = await createHrWorker({
        clientId: req.user.clientId,
        givenNames: givenNames.trim(),
        surnames: surnames.trim(),
        position: position.trim(),
        startDate,
        departments,
        costCenterId: costCenterId || null,
        email: email.trim(),
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'mi-recurso-humano', recordId: worker.id,
        recordLabel: worker.full_name, action: 'create', changedBy: req.user.name,
    });
    res.status(201).json({ worker: mapHrWorker(worker, null, getClientById(req.user.clientId)?.company_name) });
});

app.patch('/api/business/hr-workers/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getHrWorkerById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Worker not found.' });
    const patch = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(patch, 'departments')) {
        if (!Array.isArray(patch.departments) || !patch.departments.length) {
            return res.status(400).json({ message: 'departments must be a non-empty array.' });
        }
        // Stringified up front so it diffs/compares as a plain string
        // against existing.departments (also a JSON string) in
        // checkAndLogFieldChanges — an array would never equal that via
        // its raw-value String() comparison.
        patch.departments = JSON.stringify(patch.departments);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'costCenterId') && patch.costCenterId != null
        && !getCostCenterById(patch.costCenterId, req.user.clientId)) {
        return res.status(400).json({ message: 'costCenterId does not belong to this client.' });
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'hrStatusId')
        && !getHrStatusCatalogById(patch.hrStatusId, req.user.clientId)) {
        return res.status(400).json({ message: 'hrStatusId does not belong to this client.' });
    }
    const { appliedPatch, pendingFields, rejectedFields } = checkAndLogFieldChanges(req, existing, patch, HR_WORKER_PATCHABLE_FIELDS, 'mi-recurso-humano', existing.full_name);
    const worker = updateHrWorker(req.params.id, req.user.clientId, appliedPatch);
    res.json({ worker: mapHrWorker(worker, null, getClientById(req.user.clientId)?.company_name), pendingFields, rejectedFields });
});

// Issues this worker's login for the first time (or resets it later, e.g.
// a forgotten password) — the ONLY place a real password for their
// auto-created account (see createHrWorker) ever gets generated, shown
// once in the response, same one-time-credentials convention as
// activating a client (see applyClientLifecycle).
app.post('/api/business/hr-workers/:id/activate-user', requireAuth, async (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getHrWorkerById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Worker not found.' });
    const generated = await activateHrWorkerUser(req.params.id, req.user.clientId);
    if (!generated) return res.status(409).json({ message: 'This worker has no linked account.' });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'mi-recurso-humano', recordId: existing.id,
        recordLabel: existing.full_name, action: 'update', fieldKey: 'main.colHrUserActivated', changedBy: req.user.name,
    });
    res.json({ worker: mapHrWorker(getHrWorkerById(req.params.id, req.user.clientId), null, getClientById(req.user.clientId)?.company_name), generated });
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
    const recordId = req.query.recordId ? Number(req.query.recordId) : undefined;
    res.json({ changes: getTableChanges(req.user.clientId, req.params.tableKey, recordId) });
});

// --- Pending changes (Autorizar approval workflow) --------------------------
// Applies an approved pending_changes row back onto its real record — one
// entry per patchable table, mirroring FUEL_PATCHABLE_FIELDS/
// HR_WORKER_PATCHABLE_FIELDS' partial-SET update* functions (cost centers
// isn't listed: its PATCH route is requireClientAdmin-only and the admin
// bypass means a pending row can never be created for it in the first
// place). Sanitizers here mirror each PATCH route's own — approving a
// pending change must sanitize the audit-log write exactly like a direct
// edit does, or the raw value (e.g. a ticketEvidence base64 photo) would
// leak into data_table_changes at approval time even though the direct-edit
// path already protects against that.
const PENDING_CHANGE_APPLIERS = {
    'registro-combustible': (recordId, clientId, patch) => updateFuelRecord(recordId, clientId, patch),
    'mi-recurso-humano': (recordId, clientId, patch) => updateHrWorker(recordId, clientId, patch),
};
const PENDING_CHANGE_SANITIZERS = {
    'registro-combustible': {
        ticketEvidence: (v) => (v ? '[imagen]' : ''),
        tripKmBeforeEvidence: (v) => (v ? '[imagen]' : ''),
        tripKmAfterEvidence: (v) => (v ? '[imagen]' : ''),
    },
};

app.get('/api/business/pending-changes', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const all = listPendingChangesForClient(req.user.clientId);
    if (req.user.isClientAdmin) return res.json({ changes: all });
    const grants = getUserEffectiveGrants(req.user.sub);
    res.json({ changes: all.filter((c) => canAuthorizeColumn(grants, c.table_key, c.field_key.split('.').pop())) });
});

app.post('/api/business/pending-changes/:id/approve', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pc = getPendingChangeById(req.params.id);
    if (!pc || pc.client_id !== req.user.clientId) return res.status(404).json({ message: 'Pending change not found.' });
    if (pc.status !== 'pending') return res.status(409).json({ message: 'This change was already resolved.' });
    const colKey = pc.field_key.split('.').pop();
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canAuthorizeColumn(grants, pc.table_key, colKey)) {
            return res.status(403).json({ message: 'No tienes permiso para autorizar esta columna.' });
        }
    }
    const apply = PENDING_CHANGE_APPLIERS[pc.table_key];
    if (!apply) return res.status(500).json({ message: `No hay forma de aplicar cambios de la tabla "${pc.table_key}".` });
    apply(pc.record_id, pc.client_id, { [pc.column_key]: pc.new_value });
    const sanitize = PENDING_CHANGE_SANITIZERS[pc.table_key]?.[pc.column_key];
    logTableChange({
        clientId: pc.client_id, tableKey: pc.table_key, recordId: pc.record_id, recordLabel: pc.record_label, action: 'update',
        fieldKey: pc.field_key,
        oldValue: sanitize ? sanitize(pc.old_value) : pc.old_value,
        newValue: sanitize ? sanitize(pc.new_value) : pc.new_value,
        changedBy: pc.requested_by, requestedBy: pc.requested_by, authorizedBy: req.user.name,
    });
    resolvePendingChange(pc.id, { status: 'approved', resolvedBy: req.user.name, resolvedByUserId: req.user.sub });
    res.json({ ok: true });
});

app.post('/api/business/pending-changes/:id/reject', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pc = getPendingChangeById(req.params.id);
    if (!pc || pc.client_id !== req.user.clientId) return res.status(404).json({ message: 'Pending change not found.' });
    if (pc.status !== 'pending') return res.status(409).json({ message: 'This change was already resolved.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canAuthorizeColumn(grants, pc.table_key, pc.field_key.split('.').pop())) {
            return res.status(403).json({ message: 'No tienes permiso para rechazar esta columna.' });
        }
    }
    resolvePendingChange(pc.id, { status: 'rejected', resolvedBy: req.user.name, resolvedByUserId: req.user.sub });
    res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SGN app listening on port ${PORT}`));
