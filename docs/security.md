canImakeanApp — Security & Pairing Protocol

Threat Model
- Adversary can read and clone consumer NFC tags (NTAG). Tags have no secure element.
- Adversary may find or steal a tag and attempt to claim pairings.
- Adversary may attempt to replay a captured payload to create unauthorized pairings.

Recommended Pairing Protocol (MVP)
- Use server-signed one-time pairing codes with TTL (e.g., 5 minutes) and single-use.
- Workflow:
  1. Owner requests a pairing code from server. Server generates a random `code_id`, payload `{owner_id, code_id, expires_at}` and signs it with server HMAC (or uses JWT).
  2. Owner writes payload to NFC tag.
  3. Recipient reads payload and sends it to `/pairing/claim` with their auth token.
  4. Server verifies signature, ensures `expires_at` not passed, and that `code_id` is unused. Then create pairing and mark `code_id` used.

Security Considerations & Mitigations
- One-time codes reduce the value of cloning: a copied tag is only useful until the code is used or TTL expires.
- Require owner to be online when requesting a code (server-generated), preventing offline arbitrary codes.
- If a tag is stolen, the tag can be invalidated by the owner by revoking the associated `code_id` (or rotating future codes).
- Optionally bind code issuance to physical tag UID: owner writes both `code_payload` and `tag_uid` to server; server records tag_uid as expected and rejects claims from different tag_uids. Note: tag UID can be cloned on some hardware.

Future improvements
- Use asymmetric signatures and user keypairs to enable owner-signed codes without server mediation.
- Use secure elements (e.g., phone-backed credentials) or hardware tokens for stronger authentication.
- Add heuristics for suspicious behavior and rate-limit pairing claims per account.
