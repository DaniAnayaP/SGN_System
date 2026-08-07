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
const { findUserByUsername, usernameOrEmailExists, createUser } = require('./db');

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
            'style-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
            'font-src': ["'self'", 'https://unpkg.com', 'data:'],
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
        { sub: user.id, username: user.username, name: user.name },
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SGN app listening on port ${PORT}`));
