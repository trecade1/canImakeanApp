React Native Mobile — Voucher (Option 3) Example

Dependencies (install in `mobile/` project root):
- react-native-keychain
- react-native-nfc-manager
- tweetnacl
- js-base64 (optional) or tweetnacl-util for encoding helpers

Install (example):

```powershell
cd canImakeanApp\mobile
npm install react-native-keychain react-native-nfc-manager tweetnacl js-base64
# then follow each native module's linking/installation steps (autolinking usually handles it)
```

Files provided
- `voucher.js` — utility to generate keypair, store private key, export public key, sign voucher.
- `App.js` — minimal example using `voucher.js` to generate keys, create a voucher, sign, and write to NFC.

Notes
- This is a minimal example for prototyping. For production, use hardware-backed key storage and careful error handling.
- On iOS, to use Secure Enclave with `react-native-keychain`, set appropriate options. On Android, ensure `react-native-keychain` supports hardware-backed keystore on the device.

Scanner & Claim
- The `Scan Tag & Claim` button in `App.js` will read the voucher JSON payload from a tag and POST it to your backend's `/pairing/claim-voucher` endpoint.
- Provide the backend URL and a scanner access token (JWT) in the UI before scanning.

Sample voucher payload fields read from tag:
- `owner_id`, `voucher_id`, `expires_at`, `pubkey` (base64), `sig` (base64)

Server endpoint expected: `POST /pairing/claim-voucher` with JSON body containing the above fields and `Authorization: Bearer <scanner-jwt>` header.

Testing tips
- Use two devices: one to write a voucher, the other to scan and claim.
- Ensure the backend is reachable from the scanner device and that the scanner's JWT has been generated via `/auth/login`.
