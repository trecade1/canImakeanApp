canImakeanApp — API Spec (MVP)

Auth
- POST /auth/signup
  - body: { email, password, display_name }
  - returns: { user, access_token }

- POST /auth/login
  - body: { email, password }
  - returns: { user, access_token }

Pairing
- POST /pairing/request-code
  - auth: required
  - body: { ttl_seconds }
  - returns: { code_id, payload }
  - Notes: `payload` is a server-signed JSON or JWT containing { owner_id, code_id, expires_at } that is written to NFC tag.

- POST /pairing/claim
  - auth: required
  - body: { payload }
  - returns: { pairing: { user_a, user_b, created_at } }
  - Notes: server validates signature, TTL, and one-time use.

Posts / Feed
- POST /posts
  - auth: required
  - body: { content }
  - returns: { post }

- GET /feed
  - auth: required
  - query: ?limit=20&after=<cursor>
  - returns: { posts: [...] }
  - Behavior: returns posts authored by users paired with current user, ordered by `created_at` desc.

Pairings management
- GET /pairings
  - auth: required
  - returns: list of pairings for current user

- DELETE /pairings/:pairing_id
  - auth: required
  - revokes a pairing (removes from feed)

Notes
- All endpoints should return proper HTTP status codes (400/401/403/404/500) and structured JSON errors.
- Use rate-limits on `/pairing/request-code` to prevent abuse.
