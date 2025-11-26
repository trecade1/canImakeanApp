React Native Mobile — iOS Challenge-Response Pairing (Option B)

Goal
- iOS-only app that enables two users to pair via a live challenge-response exchange using iOS MultipeerConnectivity.
- Owner signs a random challenge from the scanner using Ed25519 private key (stored in Keychain).
- Scanner verifies the signature server-side and creates a pairing.
- Design ensures screenshots or static token sharing is useless; interaction must be live and in-person.

Flow
1. Both users generate Ed25519 keypairs on-device (private key in Secure Enclave/Keychain).
2. Owner registers public key with backend via `POST /pairing/register-key`.
3. Scanner and owner connect via MultipeerConnectivity (in-person Bluetooth discovery).
4. Scanner generates a random challenge and sends it to the owner.
5. Owner signs the challenge with their private key and sends the signature back.
6. Scanner POSTs { owner_id, challenge, sig } to backend `/pairing/challenge`.
7. Backend verifies signature using owner's stored public key and creates a pairing.

Dependencies (install in `mobile/` project root):
```
npm install react-native-keychain tweetnacl js-base64 uuid react-native-crypto
```

Note: `react-native-multipeer` or a native Multipeer module is required for device-to-device communication. For now, the prototype includes a local simulation mode for testing the crypto flow.

Backend API changes
- `POST /pairing/register-key` — stores owner's public key server-side
- `POST /pairing/challenge` — accepts challenge and signature, verifies, creates pairing
- users table now has `public_key` column

Files provided
- `App.js` — main UI with modes (Owner, Scanner) and test/simulation buttons
- `multipeer.js` — placeholder for future Multipeer connectivity helpers

