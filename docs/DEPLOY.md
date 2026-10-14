# Sports OMS: deployment guide (Vercel + Neon PostgreSQL)

About 30 minutes. Free tiers are enough to start. For 80 to 100 students at once, use Neon's pooled connection string (step 2) and read "Capacity" at the end.

## 1. Put the code on GitHub
1. Create a free GitHub account and a **private** repository named `sports-oms`.
2. In the unzipped folder: `git init && git add . && git commit -m "Sports OMS" && git branch -M main && git remote add origin https://github.com/YOU/sports-oms.git && git push -u origin main`

## 2. Create the database (Neon)
1. Sign up at neon.tech, create a project in the region closest to your students (India: Singapore).
2. **Connection Details**, tick **Pooled connection**, copy the `postgresql://...` string. This is `DATABASE_URL`. Never share or commit it.

## 3. Generate two secrets
Run `openssl rand -hex 32` twice. First is `JWT_SECRET`, second is `CRON_SECRET`.

## 4. Create the database tables (migrations)
On your computer, in the project folder:
```
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
export DATABASE_URL="paste the Neon string"
alembic upgrade head
```
If you already deployed an earlier version that created tables on its own, run `alembic stamp 0001` once first, then `alembic upgrade head`.
Every future change to the data model is a new migration (`alembic revision --autogenerate -m "describe change"`) that you run with `alembic upgrade head` before deploying the new code. The app never changes the production schema by itself.

## 5. Create the Vercel project
1. Sign up at vercel.com with GitHub, **Add New, Project**, import `sports-oms`. Framework preset: **Other**.
2. **Environment Variables**: `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `ENV=production`. Optional: `EVENT_TZ` (default `Asia/Kolkata`), `JWT_TTL_MIN` (default 720, sign-in lasts 12 hours).
3. **Deploy**. Then open `https://YOUR-URL/api/v1/ready`. It must say `{"status":"ready"}`.

## 6. Create the first Core account (once)
```
export BOOTSTRAP_PASSWORD="a-long-password-you-choose"
python -m festops.cli bootstrap-core --email you@college.edu --name "Your Name"
```
It refuses to run again once a Core account exists.

## 7. Set up your fest (inside the app, signed in as Core)
1. **More > Import workbook** (optional): upload your Excel roster, read the preview, confirm. Existing data is never overwritten, problem rows are listed and downloadable. Imported members have no login yet.
2. **More > Team and roles**: add members, set role and who they report to, set passwords. Open imported members to give them a real email and password. For Coordinators and Super Coordinators, tick the events they manage.
3. **More > Events and sessions**: create events, add sessions, paste meeting and livestream links, move Draft to Published to Active.
4. **Calendar**: tap a session to assign POC, backup and coordinator. Red dots mean a session has no POC.
5. **More > Exports** (Excel and CSV) and **Audit log** are available to managers and Core.

## 8. Escalation job
`vercel.json` runs it hourly. Vercel's free plan only allows daily cron. For every 5 minutes, create a free job at cron-job.org calling `GET https://YOUR-URL/api/v1/jobs/escalate` with header `Authorization: Bearer YOUR_CRON_SECRET`.

## 9. Install on phones
Android Chrome: menu, **Install app**. iPhone Safari: Share, **Add to Home Screen**.

## 10. Test before the fest
- Backend tests: `pip install -r requirements-dev.txt && pytest`
- Browser tests (Playwright, runs the whole workflow with a throwaway database): `cd frontend && npm install && npx playwright install chromium && npm run e2e`
- Load test against your live URL with 100 virtual students: `python scripts/loadtest.py https://YOUR-URL you@college.edu 'password' 100 60`. It prints p50, p95 and errors and says PASS or REVIEW. Run it a day before, never during the event.
- GitHub Actions (`.github/workflows/ci.yml`) runs all of this, including applying migrations to a real PostgreSQL, on every push.

## 11. Backups, rollback, domain
- Backups: Neon keeps point-in-time history. Before each fest day also run `pg_dump "$DATABASE_URL" > backup.sql`. Restore: `psql "$NEW_URL" < backup.sql`, then `alembic upgrade head`.
- Rollback: Vercel **Deployments**, previous one, **Promote to Production**. If a migration was applied, run `alembic downgrade -1` only if the old code needs it.
- Domain: Vercel **Settings > Domains**.

## Capacity: what is done for 80 to 100 students
- Dashboard numbers are SQL aggregates, calendar and duty lists use a fixed number of queries (no per-row lookups), indexes cover the hot filters.
- Screens refresh every 20 seconds and pause while the tab is hidden, so 100 students make about 25 requests per second at most. Responses are compressed.
- Vercel scales the API automatically; Neon's pooled connection handles the connection count. Each warm API instance keeps at most 5 database connections.
- Evidence photos are shrunk on the phone before upload (1600 px JPEG), the server accepts 3 MB at most and checks the real file type.
- The first request after idle can take 1 to 2 seconds (cold start). Open the app yourself 10 minutes before an event.
- Free Neon storage is small. Photos are stored in the database, so watch usage, or move attachments to object storage if you collect many.

## Roles
CORE: everything, including roles, accounts, imports. DEPUTY_CORE: events, duties, accounts below its level, audit log. SUPER_COORDINATOR and COORDINATOR: only their scoped events: issues, attendance corrections, exports. VOLUNTEER: own duties and issues. Anything outside a user's scope returns 404.

## Known limits
Live screens poll instead of using WebSockets (not available on Vercel functions). Password reset is done by Core in Team (no email service is connected). Push notifications and an offline queue are not built.
