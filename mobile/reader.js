// reader.js — NFC read and claim helper
import NfcManager, { Ndef } from 'react-native-nfc-manager';

export async function readTagPayload() {
  try {
    await NfcManager.requestTechnology(Ndef.tech);
    const tag = await NfcManager.getTag();
    // ndefMessage is an array of records
    const ndef = tag.ndefMessage;
    if (!ndef || ndef.length === 0) throw new Error('no NDEF message');
    // Assuming first record is text record
    const record = ndef[0];
    const payload = Ndef.text.decodePayload(record.payload);
    // payload is the JSON string we wrote (voucher)
    try {
      const obj = JSON.parse(payload);
      return obj;
    } catch (e) {
      throw new Error('invalid payload JSON');
    }
  } finally {
    try { await NfcManager.cancelTechnologyRequest(); } catch (e) { /* ignore */ }
  }
}

export async function claimVoucherOnServer({ backendUrl, accessToken, voucherPayload }) {
  // voucherPayload should contain owner_id, voucher_id, expires_at, pubkey (base64), sig (base64)
  const url = `${backendUrl.replace(/\/$/, '')}/pairing/claim-voucher`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(voucherPayload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`server error ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json;
}
