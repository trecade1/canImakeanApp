// MultipeerBridge.m — React Native bridge to native MultipeerConnectivity
// Drop this file into ios/canimakeanApp/ and link/autolink

#import <Foundation/Foundation.h>
#import <MultipeerConnectivity/MultipeerConnectivity.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface MultipeerBridge : RCTEventEmitter <RCTBridgeModule, MCNearbyServiceBrowserDelegate, MCNearbyServiceAdvertiserDelegate, MCSessionDelegate>
@end

@implementation MultipeerBridge
{
  MCPeerID *peerID;
  MCSession *session;
  MCNearbyServiceAdvertiser *advertiser;
  MCNearbyServiceBrowser *browser;
}

RCT_EXPORT_MODULE();

- (NSArray<NSString *> *)supportedEvents {
  return @[@"dataReceived", @"peerConnected", @"peerDisconnected"];
}

RCT_EXPORT_METHOD(startAdvertising:(NSString *)displayName serviceType:(NSString *)serviceType resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    self->peerID = [[MCPeerID alloc] initWithDisplayName:displayName];
    self->session = [[MCSession alloc] initWithPeer:self->peerID];
    self->session.delegate = self;
    
    self->advertiser = [[MCNearbyServiceAdvertiser alloc] initWithPeer:self->peerID discoveryInfo:nil serviceType:serviceType];
    self->advertiser.delegate = self;
    [self->advertiser startAdvertisingPeer];
    
    resolve(@{@"ok": @YES});
  });
}

RCT_EXPORT_METHOD(startBrowsing:(NSString *)serviceType resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    self->peerID = [[MCPeerID alloc] initWithDisplayName:@"Scanner"];
    self->session = [[MCSession alloc] initWithPeer:self->peerID];
    self->session.delegate = self;
    
    self->browser = [[MCNearbyServiceBrowser alloc] initWithPeer:self->peerID serviceType:serviceType];
    self->browser.delegate = self;
    [self->browser startBrowsingForPeers];
    
    resolve(@{@"ok": @YES});
  });
}

RCT_EXPORT_METHOD(sendChallenge:(NSString *)challenge resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSData *data = [challenge dataUsingEncoding:NSUTF8StringEncoding];
  NSError *error = nil;
  BOOL ok = [self->session sendData:data toPeers:self->session.connectedPeers withMode:MCSessionSendDataReliable error:&error];
  if (ok) {
    resolve(@{@"ok": @YES});
  } else {
    reject(@"send_error", error.localizedDescription, error);
  }
}

RCT_EXPORT_METHOD(sendSignature:(NSString *)signature resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSData *data = [signature dataUsingEncoding:NSUTF8StringEncoding];
  NSError *error = nil;
  BOOL ok = [self->session sendData:data toPeers:self->session.connectedPeers withMode:MCSessionSendDataReliable error:&error];
  if (ok) {
    resolve(@{@"ok": @YES});
  } else {
    reject(@"send_error", error.localizedDescription, error);
  }
}

RCT_EXPORT_METHOD(stopSession) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self->session disconnect];
    [self->advertiser stopAdvertisingPeer];
    [self->browser stopBrowsingForPeers];
  });
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
  // Not used
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
  [browser invitePeer:peerID toSession:self->session withContext:nil timeout:30];
}

- (void)browser:(MCNearbyServiceBrowser *)browser lostPeer:(MCPeerID *)peerID {
  // Peer out of range
}

@end
