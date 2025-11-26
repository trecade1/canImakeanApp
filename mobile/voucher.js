// voucher.js — keypair generation, secure storage, signing utilities
import * as Keychain from 'react-native-keychain';
import nacl from 'tweetnacl';
import { Base64 } from 'js-base64';
import { v4 as uuidv4 } from 'uuid';

// Constants
const KEY_SERVICE = 'canimakeanapp_privkey';

export async function ensureKeypair(ownerId) {
  // Check if a private key exists
  const creds = await Keychain.getGenericPassword({ service: KEY_SERVICE });
  if (creds) {
    // creds.username can hold metadata, creds.password holds private key (base64)
    const privBase64 = creds.password;
    const priv = Base64.toUint8Array(privBase64);
    const keyPair = nacl.sign.keyPair.fromSecretKey(priv);
    const pubBase64 = Base64.fromUint8Array(keyPair.publicKey);
    return { publicKey: pubBase64, privateKeyStored: true };
  }

  // generate new keypair
  const kp = nacl.sign.keyPair();
  const pub = kp.publicKey; // Uint8Array(32)
  const priv = kp.secretKey; // Uint8Array(64)
  const pubBase64 = Base64.fromUint8Array(pub);
  const privBase64 = Base64.fromUint8Array(priv);

  // Store private key securely
  await Keychain.setGenericPassword('ed25519', privBase64, { service: KEY_SERVICE });
  return { publicKey: pubBase64, privateKeyStored: true };
}

export async function getPublicKey() {
  const creds = await Keychain.getGenericPassword({ service: KEY_SERVICE });
  if (!creds) return null;
  const privBase64 = creds.password;
  const priv = Base64.toUint8Array(privBase64);
  const keyPair = nacl.sign.keyPair.fromSecretKey(priv);
  return Base64.fromUint8Array(keyPair.publicKey);
}

export async function signVoucher({ owner_id, voucher_id, expires_at }) {
  const creds = await Keychain.getGenericPassword({ service: KEY_SERVICE });
  if (!creds) throw new Error('private key not found');
  const privBase64 = creds.password;
  const priv = Base64.toUint8Array(privBase64);
  const message = JSON.stringify({ owner_id, voucher_id, expires_at });
  const sig = nacl.sign.detached(new TextEncoder().encode(message), priv);
  return Base64.fromUint8Array(sig);
}

export function createVoucherPayload(owner_id, ttlSeconds = 300) {
  const voucher_id = uuidv4();
  const expires_at = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  return { owner_id, voucher_id, expires_at };
}
