// multipeerBridge.js — React Native bridge to native MultipeerConnectivity
import { NativeModules, NativeEventEmitter } from 'react-native';

const { MultipeerBridge } = NativeModules;
const multipeerEmitter = new NativeEventEmitter(MultipeerBridge);

// Start advertising (owner mode)
export async function startAdvertising(displayName = 'Owner') {
  return MultipeerBridge.startAdvertising(displayName, 'canimakeanapp');
}

// Start browsing (scanner mode)
export async function startBrowsing() {
  return MultipeerBridge.startBrowsing('canimakeanapp');
}

// Send challenge from scanner to owner
export async function sendChallenge(challenge) {
  return MultipeerBridge.sendChallenge(challenge);
}

// Send signature from owner back to scanner
export async function sendSignature(signature) {
  return MultipeerBridge.sendSignature(signature);
}

// Listen for data received (could be challenge or signature)
export function onDataReceived(callback) {
  return multipeerEmitter.addListener('dataReceived', callback);
}

// Listen for peer connection
export function onPeerConnected(callback) {
  return multipeerEmitter.addListener('peerConnected', callback);
}

// Listen for peer disconnection
export function onPeerDisconnected(callback) {
  return multipeerEmitter.addListener('peerDisconnected', callback);
}

// Stop the session
export function stopSession() {
  MultipeerBridge.stopSession();
}
