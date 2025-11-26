canImakeanApp — Backend (Express + Postgres)

Quick start (Windows PowerShell)

1. Copy the example env and edit:

```powershell
cd canImakeanApp\backend
copy .env.example .env
# edit .env to set DATABASE_URL and JWT_SECRET
```

2. Install dependencies:

```powershell
npm install
```

3. Create the database and run schema (requires psql):

```powershell
# from project root adjust connection string as needed
psql "$(Get-Content .env | Select-String DATABASE_URL).Line -replace 'DATABASE_URL=', ''" -f ..\backend\schema.sql
```

Alternatively run the SQL manually against your Postgres instance using `backend/schema.sql`.

4. Start the server:

```powershell
npm start
```

API Endpoints
- `POST /auth/signup` — body: `{ email, password, display_name }`
- `POST /auth/login` — body: `{ email, password }`
- `POST /pairing/request-code` — auth required, body: `{ ttl_seconds }` returns `{ code_id, payload }`
- `POST /pairing/claim` — auth required, body: `{ payload }` to claim pairing
- `POST /posts` — auth required, body: `{ content }`
- `GET /feed` — auth required

Notes
- This is a minimal scaffold intended for local development and iteration. Add error handling, input validation, tests, and production hardening before deploying.
