# Deploying Divebar Jukebox to Render

You’ll create **three** things on Render: a **PostgreSQL** database, a **Web Service** (backend), and a **Static Site** (frontend). The “Web Services” option is only for the backend; the frontend is a separate Static Site.

---

## 1. Prerequisites

- Code in a Git repo (GitHub or GitLab) that Render can access.
- A Render account at [render.com](https://render.com).

---

## 2. Create the PostgreSQL database

1. In the Render dashboard, click **New +** → **PostgreSQL**.
2. Name it (e.g. `divebar-jukebox-db`).
3. Region: choose one close to you.
4. **PostgreSQL version:** Use the default (e.g. 15 or 16). The app works with any supported Postgres version.
5. Plan: **Free** (or paid if you prefer).
6. Click **Create Database**.
7. When it’s ready, open the database and copy the **Internal Database URL** (use this for the backend; it’s only reachable from other Render services). If you need to connect from outside Render, use **External Database URL** instead.

Keep this URL for the next step; you’ll set it as `DATABASE_URL` for the backend.

---

## 3. Create the Backend (Web Service)

1. Click **New +** → **Web Service**.
2. Connect your repo and select the **divebar-jukebox** repository.
3. Configure:
   - **Name:** e.g. `divebar-jukebox-api`
   - **Region:** same as the database.
   - **Branch:** `main` (or your deploy branch).
   - **Root Directory:** `backend` (so build/start run from the backend folder).
   - **Runtime:** **Python 3**.
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Render sets `PORT` automatically; your app must use it.

4. **Environment variables** (Add in the Render Web Service dashboard):

   | Key | Value / notes |
   |-----|----------------|
   | `DATABASE_URL` | Paste the **Internal Database URL** from your Render Postgres (use `postgresql://...`; if it’s `postgres://`, Render usually accepts it, or change to `postgresql://`). |
   | `MUSIC_LIBRARY_PATH` | Not used in Spotify-only deploy; can set to any placeholder, e.g. `/tmp/library`. |
   | `ENABLE_LOCAL_LIBRARY` | `false` |
   | `CORS_ORIGINS` | Your frontend URL (e.g. `https://divebar-jukebox.onrender.com`) — add after you create the Static Site. |
   | `SECRET_KEY` | A long random string (e.g. `openssl rand -hex 32`). |
   | `FRONTEND_URL` | Your frontend URL (e.g. `https://divebar-jukebox.onrender.com`). |
   | `SPOTIFY_CLIENT_ID` | From [Spotify Dashboard](https://developer.spotify.com/dashboard). |
   | `SPOTIFY_CLIENT_SECRET` | From Spotify Dashboard. |
   | `API_BASE_URL` or leave unset | If your backend URL is e.g. `https://divebar-jukebox-api.onrender.com`, set `API_BASE_URL` to that so OAuth redirects work. Or rely on Render’s default URL. |

   **Required for login and collection URLs:** set the first admin user so you can log in and so `/:user_slug/:collection_slug` works (e.g. `/dfranklin/the-motivator`):
   - `ADMIN_SEED_EMAIL` = your email
   - `ADMIN_SEED_PASSWORD` = your password
   - `ADMIN_SEED_SLUG` = URL slug (e.g. `dfranklin`). If unset, the slug is derived from your email (e.g. `drakewilcox`). The frontend homepage redirect must match this slug.

5. Click **Create Web Service**. Wait for the first deploy. Note the URL (e.g. `https://divebar-jukebox-api.onrender.com`).

6. **Migrations:** Run DB migrations before the app starts. Either add to Start Command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`, or run `alembic upgrade head` once via Render’s **Shell** (from the service page).

7. **CORS:** After you have the frontend URL, set `CORS_ORIGINS` (and `FRONTEND_URL`) to that URL so the browser allows API calls.

---

## 4. Create the Frontend (Static Site)

1. Click **New +** → **Static Site** (not Web Service).
2. Connect the same repo.
3. Configure:
   - **Name:** e.g. `divebar-jukebox`
   - **Branch:** `main`.
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist` (Vite’s default output).

4. **Environment variables** (so the frontend talks to your backend):

   | Key | Value |
   |-----|--------|
   | `VITE_API_BASE_URL` | Your backend URL, e.g. `https://divebar-jukebox-api.onrender.com` (no trailing slash). |
   | `VITE_ENABLE_LOCAL_FILES` | `false` (for Spotify-only deploy). |

5. Click **Create Static Site**. Wait for the build. Note the URL (e.g. `https://divebar-jukebox.onrender.com`).

6. **SPA routing (required for /login, /register, /admin, etc.):** In the Render dashboard, open your **Static Site** → **Redirects/Rewrites**. Add a **Rewrite** rule so client-side routes work when users open or refresh a URL like `/login`:
   - **Source:** `/*`
   - **Destination:** `/index.html`
   - **Action:** Rewrite  
   Save. Without this, only the root URL works; `/login` and other routes return 404.

7. Go back to the **backend** Web Service → **Environment** and set:
   - `CORS_ORIGINS` = `https://divebar-jukebox.onrender.com` (your Static Site URL).
   - `FRONTEND_URL` = same.
   Redeploy the backend if needed.

---

## 5. Spotify Dashboard

1. Open [Spotify for Developers](https://developer.spotify.com/dashboard) → your app → **Settings**.
2. Under **Redirect URIs** add:
   - Frontend (listener OAuth): e.g. `https://divebar-jukebox.onrender.com/api/auth/spotify` (or the path your app uses for the callback).
   - Admin (if different): e.g. `https://divebar-jukebox.onrender.com/admin/spotify-callback` (or your actual admin callback path).
   Use the exact paths your backend expects (check your backend routes and `FRONTEND_URL` usage).
3. Save.

---

## 6. Summary

| Render type   | Use for              | Your choice              |
|---------------|----------------------|--------------------------|
| **Web Service** | Backend (FastAPI)    | Yes — one Web Service    |
| **Static Site** | Frontend (Vite/React) | Yes — one Static Site    |
| **PostgreSQL**  | Database             | Yes — one Postgres       |

You do **not** put both frontend and backend in a single “Web Service.” The backend is one Web Service; the frontend is one Static Site. That’s how you host “both” on Render.

---

## 7. Troubleshooting

- **Login returns 404 or “Failed to load resource”:** The frontend is calling the static site instead of the backend. In Render → your **Static Site** (frontend) → **Environment**, add **`VITE_API_BASE_URL`** = your backend Web Service URL (e.g. `https://divebar-jukebox-api.onrender.com`, no trailing slash). Then trigger a **redeploy** of the Static Site so the new value is baked into the build. Without this, all API requests (login, collections, etc.) go to the static host and get 404.

---

## 8. Free tier notes

- **Web Service (backend):** sleeps after ~15 minutes of no traffic; first request after that has a cold start (often 30–60 seconds).
- **Static Site:** no sleep; always fast.
- **Postgres (free):** data is removed after 90 days on the free plan; use a paid plan for persistent production data.

---

## 9. What to do next (after everything is set up)

1. **Run database migrations** (if you didn’t add them to the Start Command):
   - Open your **backend Web Service** on Render → **Shell**.
   - Run: `alembic upgrade head`
   - Exit the shell. The DB will now have all tables.

2. **Confirm env vars on the backend:**
   - `CORS_ORIGINS` and `FRONTEND_URL` are set to your **frontend** URL (e.g. `https://your-app.onrender.com`).
   - `DATABASE_URL` is the Postgres **Internal** URL from your Render Postgres.
   - If the backend fails with a driver error for Postgres, add `psycopg2-binary` to `backend/requirements.txt`, commit, and let Render redeploy.

3. **Spotify redirect URIs:**
   - In [Spotify Dashboard](https://developer.spotify.com/dashboard) → your app → **Settings** → **Redirect URIs**, add:
     - `https://<your-frontend-url>/api/auth/spotify` (listener OAuth)
     - `https://<your-frontend-url>/admin/spotify-callback` (admin Connect)
   - Use your real Static Site URL. Save.

4. **Create your first user (required for login and /user_slug/collection_slug routes):**
   - On the **backend** Web Service → **Environment**, set `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, and `ADMIN_SEED_SLUG` (e.g. `dfranklin`) so the slug matches your frontend homepage redirect. Redeploy the backend so the user is created or updated on startup. Or register via the frontend and then set the redirect in App.tsx to your slug and collection.

5. **Test the app:**
   - Open your **frontend** URL in a browser.
   - Log in (or register).
   - Connect Spotify (Authorize) if you’re in Spotify-only mode.
   - Create a collection, add an album (e.g. via Add by URL or Sync Saved Albums), and confirm playback works.

6. **If the backend was sleeping:** The first load after idle can take 30–60 seconds; that’s normal on the free tier.

---

## 10. Seeding the deployed database from your local DB

To copy your **Spotify-only** data (albums, tracks, collections) from your local SQLite DB into the deployed Postgres DB:

1. **Ensure the deployed DB has a user** (e.g. from `ADMIN_SEED_EMAIL` on first deploy). All seeded data will be assigned to that user.

2. **From your machine** (with the repo and local `backend/jukebox.db`):
   - Get the **External Database URL** from your Render Postgres service.
   - **Option A — env file (easiest for repeated runs):** Create `backend/.env.deployed` (gitignored) with one line:
     ```
     DEPLOYED_DATABASE_URL=postgresql://user:pass@host/dbname
     ```
     Then from the `backend` directory:
     ```bash
     cd backend
     ./scripts/run_seed_to_deployed.sh
     ```
     Add `--copy-spotify-tokens` or `--dry-run` as needed: `./scripts/run_seed_to_deployed.sh --copy-spotify-tokens`
   - **Option B — one-off:** `export DEPLOYED_DATABASE_URL="postgresql://..."` then `python scripts/seed_deployed_from_local.py`
   - **Option C:** `python scripts/seed_deployed_from_local.py --deployed "postgresql://..."`

3. **What gets copied:** Only albums whose `file_path` starts with `spotify/`, their tracks, and collections that contain at least one such album (only the Spotify album links). Local file path albums and collections that only contain them are skipped. All copied rows are assigned to the first user in the deployed DB (or use `--deployed-user-email your@email.com` to pick by email).

4. **Optional — keep Spotify connected on deploy:** To copy your local user’s Spotify tokens into the deployed user so you don’t have to re-authorize, add:
   ```bash
   python scripts/seed_deployed_from_local.py --copy-spotify-tokens
   ```

5. **Dry run:** To see what would be copied without writing: `./scripts/run_seed_to_deployed.sh --dry-run` (or `python scripts/seed_deployed_from_local.py --dry-run`).

6. **Cron (optional):** To run the seed on a schedule (e.g. nightly), use the wrapper script and `backend/.env.deployed` so the URL is not in crontab. Example (run at 2:00 a.m. daily; replace `/path/to/divebar-jukebox` with your repo path):
   ```bash
   0 2 * * * cd /path/to/divebar-jukebox/backend && ./scripts/run_seed_to_deployed.sh >> /tmp/seed-deployed.log 2>&1
   ```
   Ensure `backend/.env.deployed` exists and contains `DEPLOYED_DATABASE_URL=...`. The script loads it automatically.
