iOS Multipeer Integration Guide — Native Bridge Sketch

Goal
- Enable scanner and owner iPhones to discover each other, exchange a challenge, and sign it live using Multipeer Connectivity.
- Provide a React Native bridge to native MultipeerConnectivity (MCNearbyServiceBrowser, MCSession, etc.).

High-level approach
1. Use native Objective-C code to handle Multipeer discovery, session management, and data exchange.
2. Create a React Native bridge module that exposes Multipeer API to JavaScript.
3. JavaScript handles crypto (challenge generation, signing) and UI.
4. Native code handles Bluetooth discovery and connection lifecycle.

File structure
```
mobile/
  ios/
    canimakeanApp/
      MultipeerBridge.h
      MultipeerBridge.m
      MultipeerBridge.swift (or rewrite in Swift if preferred)
  src/
    multipeerBridge.js (RN bridge module)
    App.js (updated UI)
```

Native Multipeer Bridge (Objective-C / Swift)
- Implement MultipeerConnectivity framework:
  - MCNearbyServiceAdvertiser: advertises the owner device as available for pairing
  - MCNearbyServiceBrowser: scanner searches for nearby owner devices
  - MCSession: manages peer-to-peer connection
  - MCPeerID: unique device identifier

Core methods to expose to React Native
1. `startAdvertising(displayName, serviceType)` — owner calls to advertise
2. `startBrowsing(serviceType)` — scanner calls to search for owner
3. `sendChallenge(peerId, challenge)` — scanner sends challenge to owner
4. `sendSignature(peerId, signature)` — owner sends signature back to scanner
5. `onChallengeReceived(callback)` — owner listens for incoming challenge
6. `onSignatureReceived(callback)` — scanner listens for incoming signature
7. `stopSession()` — cleanup

Sample Objective-C sketch
```objc
// MultipeerBridge.h
#import <Foundation/Foundation.h>
#import <MultipeerConnectivity/MultipeerConnectivity.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface MultipeerBridge : RCTEventEmitter <RCTBridgeModule, MCNearbyServiceBrowserDelegate, MCNearbyServiceAdvertiserDelegate, MCSessionDelegate>
@end

// MultipeerBridge.m
#import "MultipeerBridge.h"

@implementation MultipeerBridge
{
  MCPeerID *peerID;
  MCSession *session;
  MCNearbyServiceAdvertiser *advertiser;
  MCNearbyServiceBrowser *browser;
}

RCT_EXPORT_MODULE();

- (NSArray<NSString *> *)supportedEvents {
  return @[@"challengeReceived", @"signatureReceived", @"peerConnected", @"peerDisconnected"];
}

RCT_EXPORT_METHOD(startAdvertising:(NSString *)displayName serviceType:(NSString *)serviceType resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  peerID = [[MCPeerID alloc] initWithDisplayName:displayName];
  session = [[MCSession alloc] initWithPeer:peerID];
  session.delegate = self;
  
  advertiser = [[MCNearbyServiceAdvertiser alloc] initWithPeer:peerID discoveryInfo:nil serviceType:serviceType];
  advertiser.delegate = self;
  [advertiser startAdvertisingPeer];
  
  resolve(@{@"ok": @YES});
}

RCT_EXPORT_METHOD(startBrowsing:(NSString *)serviceType resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  peerID = [[MCPeerID alloc] initWithDisplayName:@"Scanner"];
  session = [[MCSession alloc] initWithPeer:peerID];
  session.delegate = self;
  
  browser = [[MCNearbyServiceBrowser alloc] initWithPeer:peerID serviceType:serviceType];
  browser.delegate = self;
  [browser startBrowsingForPeers];
  
  resolve(@{@"ok": @YES});
}

RCT_EXPORT_METHOD(sendChallenge:(NSString *)peerId challenge:(NSString *)challenge resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSData *data = [challenge dataUsingEncoding:NSUTF8StringEncoding];
  NSError *error = nil;
  BOOL ok = [session sendData:data toPeers:session.connectedPeers withMode:MCSessionSendDataReliable error:&error];
  if (ok) {
    resolve(@{@"ok": @YES});
  } else {
    reject(@"send_error", error.localizedDescription, error);
  }
}

RCT_EXPORT_METHOD(sendSignature:(NSString *)peerId signature:(NSString *)signature resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSData *data = [signature dataUsingEncoding:NSUTF8StringEncoding];
  NSError *error = nil;
  BOOL ok = [session sendData:data toPeers:session.connectedPeers withMode:MCSessionSendDataReliable error:&error];
  if (ok) {
    resolve(@{@"ok": @YES});
  } else {
    reject(@"send_error", error.localizedDescription, error);
  }
}

RCT_EXPORT_METHOD(stopSession) {
  [session disconnect];
  [advertiser stopAdvertisingPeer];
  [browser stopBrowsingForPeers];
}

// MCSessionDelegate methods
- (void)session:(MCSession *)session didReceiveData:(NSData *)data fromPeer:(MCPeerID *)peerID {
  NSString *str = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  [self sendEventWithName:@"dataReceived" body:@{@"data": str}];
}

- (void)session:(MCSession *)session peer:(MCPeerID *)peerID didChangeState:(MCSessionState)state {
  if (state == MCSessionStateConnected) {
    [self sendEventWithName:@"peerConnected" body:@{@"peer": peerID.displayName}];
  } else if (state == MCSessionStateNotConnected) {
    [self sendEventWithName:@"peerDisconnected" body:@{@"peer": peerID.displayName}];
  }
}

- (void)session:(MCSession *)session didReceiveStream:(NSInputStream *)stream withName:(NSString *)streamName fromPeer:(MCPeerID *)peerID {
  // Not used for this flow
}

- (void)session:(MCSession *)session didStartReceivingResourceWithName:(NSString *)resourceName fromPeer:(MCPeerID *)peerID withProgress:(NSProgress *)progress {
  // Not used
}

- (void)session:(MCSession *)session didFinishReceivingResourceWithName:(NSString *)resourceName fromPeer:(MCPeerID *)peerID atURL:(NSURL *)localURL withError:(NSError *)error {
  // Not used
}

// MCNearbyServiceAdvertiserDelegate
- (void)advertiser:(MCNearbyServiceAdvertiser *)advertiser didReceiveInvitationFromPeer:(MCPeerID *)peerID withContext:(NSData *)context invitationHandler:(void(^)(BOOL accept))invitationHandler {
  invitationHandler(YES);
}

// MCNearbyServiceBrowserDelegate
- (void)browser:(MCNearbyServiceBrowser *)browser foundPeer:(MCPeerID *)peerID withDiscoveryInfo:(NSDictionary<NSString *,NSString *> *)info {
  [browser invitePeer:peerID toSession:session withContext:nil timeout:30];
}

- (void)browser:(MCNearbyServiceBrowser *)browser lostPeer:(MCPeerID *)peerID {
  // Peer out of range
}

@end
```

React Native Bridge Usage (multipeerBridge.js)
```javascript
import { NativeModules, NativeEventEmitter } from 'react-native';

const { MultipeerBridge } = NativeModules;
const multipeerEmitter = new NativeEventEmitter(MultipeerBridge);

export async function startAdvertising(displayName = 'Owner') {
  return MultipeerBridge.startAdvertising(displayName, 'canimakeanapp');
}

export async function startBrowsing() {
  return MultipeerBridge.startBrowsing('canimakeanapp');
}

export async function sendChallenge(peerId, challenge) {
  return MultipeerBridge.sendChallenge(peerId, challenge);
}

export async function sendSignature(peerId, signature) {
  return MultipeerBridge.sendSignature(peerId, signature);
}

export function onDataReceived(callback) {
  return multipeerEmitter.addListener('dataReceived', callback);
}

export function onPeerConnected(callback) {
  return multipeerEmitter.addListener('peerConnected', callback);
}

export function onPeerDisconnected(callback) {
  return multipeerEmitter.addListener('peerDisconnected', callback);
}

export function stopSession() {
  MultipeerBridge.stopSession();
}
```

Updated App.js flow (pseudocode)
```javascript
// Owner mode
async function handleOwnerMode() {
  await startAdvertising('Owner-' + userId.substring(0, 8));
  onDataReceived(async (event) => {
    const { data } = event;
    const sig = await signChallenge(data); // sign the received challenge
    await sendSignature(peerId, sig);
  });
}

// Scanner mode
async function handleScannerMode() {
  await startBrowsing();
  onPeerConnected(async (event) => {
    const challenge = await generateChallenge();
    await sendChallenge(event.peer, challenge);
    onDataReceived(async (event) => {
      const { data: sig } = event;
      // Post { owner_id, challenge, sig } to backend
    });
  });
}
```

Integration steps
1. Create `ios/canimakeanApp/MultipeerBridge.m` with the native code above.
2. Link the module in `package.json` or use autolinking (React Native 0.60+).
3. Update `mobile/App.js` to use the bridge (replace placeholders in Owner/Scanner mode handlers).
4. Test on two devices: one in Owner mode, one in Scanner mode. They should discover each other automatically over Bluetooth.

Platform-specific notes
- iOS only (as requested). MultipeerConnectivity is iOS-specific and works over Bluetooth (BLE) and Wi-Fi Direct.
- Requires iOS 7+. Works well on iOS 13+.
- User must grant Bluetooth permission in app (add to `Info.plist`): `NSLocalNetworkUsageDescription`, `NSBonjourServices`.

Testing locally
- Run on two physical iOS devices connected to the same Wi-Fi or with Bluetooth enabled.
- Owner taps "Owner Mode", Scanner taps "Scanner Mode".
- They should discover each other and exchange challenge/signature automatically.
- On success, scanner receives signature and POSTs to backend.

Next: Update App.js to integrate the bridge and test on devices.
