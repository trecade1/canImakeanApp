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

Auth
- `POST /auth/signup` — body: `{ email, password, display_name }`
- `POST /auth/login` — body: `{ email, password }`

Pairing (new iOS challenge-response flow)
- `POST /pairing/register-key` — auth required, body: `{ public_key }` (registers user's Ed25519 public key)
- `POST /pairing/challenge` — auth required, body: `{ owner_id, challenge, sig }` (verifies signature and creates pairing)

Posts & Feed
- `POST /posts` — auth required, body: `{ content }`
- `GET /feed` — auth required

Pairings management
- `GET /pairings` — auth required
- `DELETE /pairings/:id` — auth required

Notes
- This is a minimal scaffold intended for local development and iteration. Add error handling, input validation, tests, and production hardening before deploying.
- The challenge-response flow uses Ed25519 signatures over raw challenge bytes (base64-encoded). Both challenge and signature are base64-encoded in the request body.
