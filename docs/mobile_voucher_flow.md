Mobile Voucher Flow (Option 3) — Keypair + Signed Vouchers

Goal
- Create an on-device Ed25519 keypair for each user, keep private key in secure storage, and allow the owner to create signed vouchers that can be written to NFC tags. A scanner reads voucher data and sends it to the server to create a pairing.

High-level steps
1. Key generation
   - On first app run (or when user enables pairing), generate an Ed25519 keypair on-device.
   - Store the private key securely in platform-provided secure storage (iOS Keychain / Secure Enclave, Android Keystore). Store public key in app state or server if desired.
2. Voucher creation (owner)
   - Owner creates a voucher object: { owner_id, voucher_id (UUID), expires_at }
   - Owner signs the canonical serialized voucher (e.g., JSON with keys in canonical order) using the private key — produce signature (raw bytes -> base64).
   - Owner writes compact payload to NFC tag: `{ owner_id, voucher_id, expires_at, pubkey_base64, sig_base64 }` (store as short JSON or CBOR).
3. Voucher claim (scanner)
   - Scanner app reads payload from the NFC tag and sends those fields to `POST /pairing/claim-voucher` along with scanner's auth token.
   - Server verifies signature using provided `pubkey`, checks `expires_at` and `voucher_id` unused, then creates pairing and marks voucher used.

Security notes
- Store private key securely and prefer hardware-backed keystore on devices.
- Use sufficiently short TTL for vouchers to reduce exposure (e.g., minutes to hours depending on UX).
- Include a UUID `voucher_id` to prevent replay; server marks voucher as used.
- Provide key rotation and voucher revocation UX for lost devices.

Storage choices in React Native
- Use `react-native-keychain` to store private key as a secret.
- Keep public key in app state and optionally upload to server for discovery or recoverability.

Data size
- Keep payload compact. A JSON payload with base64-encoded pubkey (32 bytes -> 44 chars) and signature (64 bytes -> 88 chars) is small enough for typical NTAGs.

Example field layout (JSON)
{
  "owner_id": "<uuid>",
  "voucher_id": "<uuid>",
  "expires_at": "2025-11-26T12:34:56Z",
  "pubkey": "<base64>",
  "sig": "<base64>"
}

Next: sample RN code shows generation, storage, signing and NFC write/read.