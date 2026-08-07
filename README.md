# SGN — unified system (frontend + backend + database, one URL)

This is the deploy-ready version: a single Node/Express app serves both the
frontend (`public/`) and the auth API (`/api/*`) from the same server and
port. That means one URL, one deployment, no CORS configuration to manage.

```
sgn-system/
├── server.js          # the app: static frontend + auth API
├── db.js              # SQLite persistence layer
├── password.js         # password hashing (scrypt, built into Node)
├── package.json
├── .env.example
└── public/             # everything the browser loads directly
    ├── Login.html / Login.css / login.js
    ├── Inicio-en.html / Inicio-en.css / Inicio-en.js
    ├── data/menu.json
    └── i18n/en.json, es.json
```

Nothing outside `public/` is ever reachable from the browser — the database
file, `server.js`, `db.js`, and `.env` are not web-servable, only what
`express.static` points at.

## Deploying to Railway

1. **Push this folder to a GitHub repo** (Railway deploys from Git).
   ```bash
   git init
   git add .
   git commit -m "Initial deploy"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Create a Railway project**
   - Go to [railway.app](https://railway.app), sign in, click **New Project**
     → **Deploy from GitHub repo** → select this repo.
   - Railway detects `package.json` and runs `npm install && npm start`
     automatically — no extra config needed for this step.

3. **Add a persistent volume** (so your users survive redeploys/restarts)
   - In the Railway project, go to your service → **Settings** → **Volumes**
     → **New Volume**.
   - Mount path: `/data`

4. **Set environment variables**
   - In the service → **Variables**, add:
     - `NODE_ENV` = `production`
     - `JWT_SECRET` = a long random string — generate one with:
       ```bash
       node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
       ```
     - `DB_PATH` = `/data/sgn.sqlite` (matches the volume mount path above)

5. **Deploy** — Railway redeploys automatically on every push to `main`
   once connected. You'll get a `*.up.railway.app` URL immediately.

6. **Connect your own domain** (optional but recommended for clients)
   - Service → **Settings** → **Networking** → **Custom Domain**.
   - Add a `CNAME` record at your DNS provider pointing to the value Railway
     gives you. SSL is issued automatically.

Open your Railway URL — `Login.html` is served at `/`.

## Logging in (demo user)

On first run, the app seeds one demo account so you can confirm everything
works end to end:

```
username: admin
password: admin
```

**Before this goes anywhere real:** delete the seeded admin row. You can do
this by connecting to the volume via Railway's shell (service → the `>_`
icon) and running:

```bash
sqlite3 /data/sgn.sqlite "DELETE FROM users WHERE username='admin';"
```

Then register a real account through the registration form.

## Running it locally (optional, for development)

```bash
npm install
cp .env.example .env      # set JWT_SECRET; leave DB_PATH blank locally
npm start                 # http://localhost:3000 — serves everything
```

No separate frontend server needed locally anymore — `server.js` serves
`public/` directly, so `http://localhost:3000` already shows the login page.

## What's still needed before this serves real clients

1. **Database at scale** — SQLite (via `db.js`) is solid for a single
   Railway instance. If you outgrow it (multiple app instances, heavy
   concurrent writes), swap it for Postgres — Railway offers a managed
   Postgres add-on, and `db.js`'s query helpers (`findUserByUsername`,
   `createUser`, etc.) give you one place to change the implementation.
2. **Multi-tenant scoping** — if one deployment will serve more than one
   client company, add a `client_id` column to `users` (see the note in
   `db.js`) and scope every query by it.
3. **CSRF protection** if you keep cookie-based sessions (e.g. a
   double-submit token pattern).
4. **Password reset flow** — "Forgot password" currently links to `#`.
5. **Server-side authorization on every route** that returns per-user or
   per-client data, not just `/api/me`.
6. **Content-Security-Policy hardening** — `server.js` currently allows
   `'unsafe-inline'` for scripts/styles to match the existing inline
   `<script>`/`<style>` usage. Move those into external files and tighten
   the CSP in `server.js` once you do.
7. **Other referenced pages** (`Comite-Directivo-en.html`,
   `Cadena-Suministro.html`, etc.) weren't provided, so apply the same
   pattern (place them in `public/`, use the i18n/menu system) when you
   build them out.
