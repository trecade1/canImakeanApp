// App_multipeer.js — iOS Challenge-Response with Multipeer Integration (sketch)
// This is a reference implementation showing how to integrate the native bridge

import React, { useEffect, useState, useRef } from 'react';
import { Button, SafeAreaView, Text, View, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import * as Keychain from 'react-native-keychain';
import nacl from 'tweetnacl';
import { Base64 } from 'js-base64';
import crypto from 'react-native-crypto';
import * as MultipeerBridge from './multipeerBridge';

// ============ KEYPAIR MANAGEMENT ============
const KEY_SERVICE = 'canimakeanapp_privkey';

async function ensureKeypair(userId) {
  const creds = await Keychain.getGenericPassword({ service: KEY_SERVICE });
  if (creds) {
    const priv = Base64.toUint8Array(creds.password);
    const kp = nacl.sign.keyPair.fromSecretKey(priv);
    const pubBase64 = Base64.fromUint8Array(kp.publicKey);
    return { publicKey: pubBase64, privateKeyStored: true };
  }
  const kp = nacl.sign.keyPair();
  const pubBase64 = Base64.fromUint8Array(kp.publicKey);
  const privBase64 = Base64.fromUint8Array(kp.secretKey);
  await Keychain.setGenericPassword('ed25519', privBase64, { service: KEY_SERVICE });
  return { publicKey: pubBase64, privateKeyStored: true };
}

async function getPublicKey() {
  const creds = await Keychain.getGenericPassword({ service: KEY_SERVICE });
  if (!creds) return null;
  const priv = Base64.toUint8Array(creds.password);
  const kp = nacl.sign.keyPair.fromSecretKey(priv);
  return Base64.fromUint8Array(kp.publicKey);
}

async function signChallenge(challenge) {
  const creds = await Keychain.getGenericPassword({ service: KEY_SERVICE });
  if (!creds) throw new Error('private key not found');
  const priv = Base64.toUint8Array(creds.password);
  const challengeBuf = Buffer.from(challenge, 'base64');
  const sig = nacl.sign.detached(new Uint8Array(challengeBuf), new Uint8Array(priv));
  return Base64.fromUint8Array(sig);
}

// ============ SERVER COMMUNICATION ============
async function registerPublicKeyWithServer(backendUrl, accessToken, publicKey) {
  const url = `${backendUrl.replace(/\/$/, '')}/pairing/register-key`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ public_key: publicKey })
  });
  if (!res.ok) throw new Error(`register key failed: ${res.status}`);
  return res.json();
}

async function postChallengeToServer(backendUrl, accessToken, ownerId, challenge, sig) {
  const url = `${backendUrl.replace(/\/$/, '')}/pairing/challenge`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ owner_id: ownerId, challenge, sig })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`server error ${res.status}: ${text}`);
  }
  return res.json();
}

// ============ APP COMPONENT ============
export default function App() {
  const [userId, setUserId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [pubkey, setPubkey] = useState(null);
  const [backendUrl, setBackendUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pairingResult, setPairingResult] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  
  const dataReceivedListenerRef = useRef(null);
  const peerConnectedListenerRef = useRef(null);
  const currentChallengeRef = useRef(null);

  useEffect(() => {
    return () => {
      // Cleanup listeners on unmount
      if (dataReceivedListenerRef.current) dataReceivedListenerRef.current.remove();
      if (peerConnectedListenerRef.current) peerConnectedListenerRef.current.remove();
      MultipeerBridge.stopSession();
    };
  }, []);

  async function handleInitKeys() {
    if (!userId) return Alert.alert('User ID required');
    setLoading(true);
    try {
      const kp = await ensureKeypair(userId);
      const p = await getPublicKey();
      setPubkey(p);
      Alert.alert('Keys ready', 'Public key generated');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterPublicKey() {
    if (!backendUrl || !accessToken || !pubkey) return Alert.alert('All fields required');
    setLoading(true);
    try {
      await registerPublicKeyWithServer(backendUrl, accessToken, pubkey);
      Alert.alert('Success', 'Public key registered with server');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleOwnerMode() {
    if (!pubkey) return Alert.alert('Generate keys first');
    setLoading(true);
    setMode('owner');
    setStatusMessage('Advertising for scanner discovery...');
    
    try {
      // Start advertising
      await MultipeerBridge.startAdvertising(`Owner-${userId.substring(0, 8)}`);
      setStatusMessage('Advertised. Waiting for scanner to connect...');

      // Listen for incoming challenge
      if (dataReceivedListenerRef.current) dataReceivedListenerRef.current.remove();
      dataReceivedListenerRef.current = MultipeerBridge.onDataReceived(async (event) => {
        try {
          const challenge = event.data;
          setStatusMessage(`Received challenge, signing...`);
          const sig = await signChallenge(challenge);
          await MultipeerBridge.sendSignature(sig);
          setStatusMessage('Signature sent to scanner');
        } catch (e) {
          Alert.alert('Error signing', e.message);
        }
      });

      if (peerConnectedListenerRef.current) peerConnectedListenerRef.current.remove();
      peerConnectedListenerRef.current = MultipeerBridge.onPeerConnected((event) => {
        setStatusMessage(`Scanner connected: ${event.peer}`);
      });
    } catch (e) {
      Alert.alert('Error', e.message);
      setMode(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleScannerMode() {
    if (!backendUrl || !accessToken) return Alert.alert('Backend URL and token required');
    if (!ownerId) return Alert.alert('Owner user ID required');
    setLoading(true);
    setMode('scanner');
    setStatusMessage('Browsing for owner device...');

    try {
      // Start browsing
      await MultipeerBridge.startBrowsing();
      setStatusMessage('Searching for owner...');

      // Listen for peer connection
      if (peerConnectedListenerRef.current) peerConnectedListenerRef.current.remove();
      peerConnectedListenerRef.current = MultipeerBridge.onPeerConnected(async (event) => {
        try {
          setStatusMessage('Owner connected! Generating challenge...');
          // Generate challenge
          const randomBytes = crypto.getRandomValues(new Uint8Array(32));
          const challenge = Base64.fromUint8Array(randomBytes);
          currentChallengeRef.current = challenge;
          
          // Send challenge to owner
          await MultipeerBridge.sendChallenge(challenge);
          setStatusMessage('Challenge sent. Waiting for signature...');
        } catch (e) {
          Alert.alert('Error', e.message);
        }
      });

      // Listen for signature response
      if (dataReceivedListenerRef.current) dataReceivedListenerRef.current.remove();
      dataReceivedListenerRef.current = MultipeerBridge.onDataReceived(async (event) => {
        try {
          const sig = event.data;
          setStatusMessage('Signature received. Claiming pairing...');
          const challenge = currentChallengeRef.current;
          
          if (!challenge) throw new Error('No challenge found');
          
          const resp = await postChallengeToServer(backendUrl, accessToken, ownerId, challenge, sig);
          setPairingResult({ challenge: challenge.substring(0, 20) + '...', resp });
          setStatusMessage('Pairing successful!');
        } catch (e) {
          Alert.alert('Error', e.message);
        }
      });
    } catch (e) {
      Alert.alert('Error', e.message);
      setMode(null);
    } finally {
      setLoading(false);
    }
  }

  function dismissResult() {
    setPairingResult(null);
    setStatusMessage('');
    MultipeerBridge.stopSession();
    setMode(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>canImakeanApp — iOS Multipeer Pairing</Text>
      <ScrollView style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: 'bold', marginTop: 16 }}>Setup</Text>
        <Text>Your User ID:</Text>
        <TextInput value={userId} onChangeText={setUserId} style={{ borderWidth: 1, padding: 8, marginTop: 4 }} placeholder="UUID" />
        <View style={{ marginTop: 8 }} />
        <Button title="Generate/Ensure Keypair" onPress={handleInitKeys} disabled={loading} />
        <Text style={{ marginTop: 8, fontSize: 12 }}>{pubkey ? `Public key: ${pubkey.substring(0, 20)}...` : 'No key'}</Text>

        <Text style={{ fontWeight: 'bold', marginTop: 16 }}>Backend Configuration</Text>
        <Text>Backend URL:</Text>
        <TextInput value={backendUrl} onChangeText={setBackendUrl} style={{ borderWidth: 1, padding: 8, marginTop: 4 }} placeholder="https://api.example.com" />
        <Text style={{ marginTop: 8 }}>Access Token:</Text>
        <TextInput value={accessToken} onChangeText={setAccessToken} style={{ borderWidth: 1, padding: 8, marginTop: 4 }} placeholder="Bearer token" secureTextEntry />
        <View style={{ marginTop: 8 }} />
        <Button title="Register Public Key with Server" onPress={handleRegisterPublicKey} disabled={loading} />

        <Text style={{ fontWeight: 'bold', marginTop: 16 }}>Pairing Mode</Text>
        <View style={{ marginVertical: 8 }}>
          <Button title="Owner Mode (Accept Pairing)" onPress={handleOwnerMode} disabled={loading || mode === 'scanner'} />
        </View>
        <View style={{ marginBottom: 8 }}>
          <Text>Owner User ID (for scanner):</Text>
          <TextInput value={ownerId} onChangeText={setOwnerId} style={{ borderWidth: 1, padding: 8, marginTop: 4 }} placeholder="Owner's UUID" />
        </View>
        <View style={{ marginBottom: 8 }}>
          <Button title="Scanner Mode (Initiate Pairing)" onPress={handleScannerMode} disabled={loading || mode === 'owner'} />
        </View>
        <Text style={{ marginTop: 8, fontSize: 12 }}>Mode: {mode ? mode.toUpperCase() : 'None'}</Text>

        <Text style={{ fontWeight: 'bold', marginTop: 16 }}>Status</Text>
        {loading && <ActivityIndicator size="large" />}
        <Text style={{ marginTop: 8, fontSize: 12, color: '#666' }}>{statusMessage}</Text>

        {pairingResult && (
          <View style={{ marginTop: 20, padding: 12, borderWidth: 1, borderColor: '#4caf50', backgroundColor: '#e8f5e9' }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Pairing Success!</Text>
            <Text>Challenge: {pairingResult.challenge}</Text>
            <Text>Server: {JSON.stringify(pairingResult.resp)}</Text>
            <View style={{ marginTop: 8 }} />
            <Button title="Dismiss" onPress={dismissResult} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
