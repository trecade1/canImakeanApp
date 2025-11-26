canImakeanApp — Requirements & MVP

Overview
- Purpose: A privacy-first social app where users only see posts from people they've exchanged a physical token with (e.g., NFC tag). There is no "follow" graph — connections are created exclusively via physical token exchange.

MVP Features
- Sign up / sign in (email + password or magic link)
- Authenticated user profile (display name, optional bio)
- Create a short post (text, optional image attachment later)
- Request a one-time pairing code (server-issued) and write it to an NFC tag
- Scan/tag-claim flow: read pairing payload from tag and claim a connection
- Feed: shows posts only from users you've paired with (bidirectional pairing)
- Pairing management: list paired contacts and ability to revoke pairings

User Stories
- As a new user, I can sign up and create a profile so I can post.
- As a user, I can request a one-time code and write it to a physical tag so another user can pair with me.
- As a user, I can read a tag and claim a pairing so that both of us appear in each other's feed.
- As a user, my feed shows only posts from users I have a pairing with.
- As a user, I can revoke a pairing to remove someone from my feed.

Flows (high-level)
- Signup/Login: create account -> receive access token -> open app.
- Issue Code (owner): authenticated request to `/pairing/request-code` -> server returns a signed, single-use payload (TTL) -> owner writes payload to NFC tag.
- Claim Code (scanner): read payload with app -> send to `/pairing/claim` with scanner auth -> server validates, creates Pairing record, marks code used.
- Feed: client GET `/feed` -> server returns posts where author in the user's pairing list.

Constraints & Non-goals
- No social graph beyond pairings. There is no public timeline or discovery via follows in MVP.
- Tag hardware: tags may be consumer NFC NTAGs — assume limited storage and no secure element for MVP.
- Threats from cloned tags or stolen tags must be mitigated, but a fully hardware-backed key storage is out-of-scope for the MVP.

Acceptance Criteria
- A developer can run the backend and create valid pairing codes.
- A mobile app can request a pairing code, write it to a tag, and another device can claim it to create a pairing.
- Feed API returns only posts from paired users.
- Each pairing code is one-time-use and expires after a TTL.
