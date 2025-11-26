// Minimal React Native example showing key generation, voucher signing and NFC write
import React, { useEffect, useState } from 'react';
import { Button, SafeAreaView, Text, View, TextInput, Alert, ScrollView } from 'react-native';
import NfcManager, { Ndef } from 'react-native-nfc-manager';
import { ensureKeypair, createVoucherPayload, signVoucher, getPublicKey } from './voucher';
import { readTagPayload, claimVoucherOnServer } from './reader';

export default function App() {
  const [ownerId, setOwnerId] = useState('');
  const [pubkey, setPubkey] = useState(null);

  useEffect(() => {
    NfcManager.start();
  }, []);

  async function initKeys() {
    if (!ownerId) return Alert.alert('Owner ID required');
    const kp = await ensureKeypair(ownerId);
    const p = await getPublicKey();
    setPubkey(p);
    Alert.alert('Keypair ready', `Public key: ${p}`);
  }

  async function writeVoucherToTag() {
    if (!ownerId) return Alert.alert('Owner ID required');
    const voucher = createVoucherPayload(ownerId, 300);
    const sig = await signVoucher(voucher);
    const pub = await getPublicKey();

    const payloadObj = { ...voucher, pubkey: pub, sig };
    const payloadStr = JSON.stringify(payloadObj);

    try {
      // Request NFC write
      await NfcManager.requestTechnology(Ndef.tech);
      const bytes = Ndef.encodeMessage([Ndef.textRecord(payloadStr)]);
      await NfcManager.writeNdefMessage(bytes);
      Alert.alert('Wrote voucher to tag');
    } catch (e) {
      console.warn(e);
      Alert.alert('Error writing tag', e.message || String(e));
    } finally {
      NfcManager.cancelTechnologyRequest();
    }
  }

  async function scanAndClaim() {
    if (!backendUrl) return Alert.alert('Backend URL required');
    if (!accessToken) return Alert.alert('Access token required');
    try {
      const payload = await readTagPayload();
      // payload should have owner_id, voucher_id, expires_at, pubkey, sig
      const resp = await claimVoucherOnServer({ backendUrl, accessToken, voucherPayload: payload });
      Alert.alert('Claim result', JSON.stringify(resp));
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', e.message || String(e));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>canImakeanApp — Voucher prototype</Text>
      <ScrollView style={{ marginTop: 12 }}>
        <Text>Owner ID (your user id):</Text>
        <TextInput value={ownerId} onChangeText={setOwnerId} style={{ borderWidth: 1, padding: 8, marginTop: 8 }} />
        <Button title="Generate/Ensure Keypair" onPress={initKeys} />

        <View style={{ height: 16 }} />
        <Button title="Write Voucher to NFC Tag" onPress={writeVoucherToTag} />

        <View style={{ height: 24 }} />
        <Text style={{ fontWeight: 'bold' }}>Scanner / Claim</Text>
        <Text>Backend URL:</Text>
        <TextInput value={backendUrl} onChangeText={setBackendUrl} style={{ borderWidth: 1, padding: 8, marginTop: 8 }} placeholder="https://api.example.com" />
        <Text>Access token (scanner JWT):</Text>
        <TextInput value={accessToken} onChangeText={setAccessToken} style={{ borderWidth: 1, padding: 8, marginTop: 8 }} placeholder="Bearer token" />
        <View style={{ height: 8 }} />
        <Button title="Scan Tag & Claim" onPress={scanAndClaim} />

        <View style={{ height: 24 }} />
        <Text>Public key: {pubkey || 'not generated'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
