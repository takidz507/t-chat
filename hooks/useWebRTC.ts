import { useState, useEffect, useCallback, useRef } from 'react';
import { User, Peer, AppMessage, MessageType, UserInfoMessage } from '../types';
import { deriveSharedSecret } from '../services/cryptoService';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Production Security Note: A TURN server is essential for NAT traversal and IP address privacy.
    // Without a TURN server, connections may fail between users behind restrictive firewalls,
    // and direct IP addresses may be exposed to peers.
    // {
    //   urls: 'turn:your.turn.server.com:3478',
    //   username: 'user',
    //   credential: 'password'
    // }
  ],
};

export const useWebRTC = (user: User, onNewMessage: (senderId: string, message: AppMessage) => void) => {
  const [peers, setPeers] = useState<Peer[]>([]);
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const addPeer = useCallback((newPeer: Peer) => {
    setPeers(prev => [...prev.filter(p => p.id !== newPeer.id), newPeer]);
  }, []);

  const handleDataChannelMessage = useCallback((event: MessageEvent, peerId: string) => {
    try {
      const message = JSON.parse(event.data) as AppMessage;
      console.log(`Received message of type ${message.type} from ${peerId}`);

      if (message.type === MessageType.USER_INFO) {
        const userInfo = (message as UserInfoMessage).payload;
        setPeers(prev => prev.map(p => 
            p.id === peerId 
            ? { 
                ...p, 
                name: userInfo.name, 
                keys: { ...p.keys, publicKey: userInfo.publicKey },
                isServerMode: userInfo.isServerMode
              } 
            : p
        ));
      }

      onNewMessage(peerId, message);
    } catch (error) {
      console.error('Failed to parse incoming message:', error);
    }
  }, [onNewMessage]);

  const setupDataChannelEvents = useCallback((dataChannel: RTCDataChannel, peerId: string) => {
    dataChannel.onmessage = (event) => handleDataChannelMessage(event, peerId);
    dataChannel.onopen = () => {
      console.log(`Data channel with ${peerId} opened.`);
      setPeers(prev => prev.map(p => p.id === peerId ? { ...p, status: 'connected' } : p));
      
      // Exchange user info upon connection
      const userInfoMessage: UserInfoMessage = {
          type: MessageType.USER_INFO,
          payload: {
              id: userRef.current.id,
              name: userRef.current.name,
              publicKey: userRef.current.keys.publicKey,
              isServerMode: userRef.current.isServerMode,
          },
          timestamp: Date.now(),
      }
      dataChannel.send(JSON.stringify(userInfoMessage));
    };
    dataChannel.onclose = () => {
      console.log(`Data channel with ${peerId} closed.`);
      setPeers(prev => prev.map(p => p.id === peerId ? { ...p, status: 'disconnected' } : p));
    };
  }, [handleDataChannelMessage]);

  const createPeerConnection = useCallback((peerId: string): Peer => {
    const connection = new RTCPeerConnection(RTC_CONFIG);
    const dataChannel = connection.createDataChannel('chat');

    const newPeer: Peer = {
      id: peerId,
      name: `Peer-${peerId.substring(0, 6)}`, // Placeholder name
      connection,
      dataChannel,
      status: 'connecting',
      keys: {publicKey: {} as any, privateKey: {} as any}, // placeholder
      isServerMode: false
    };

    setupDataChannelEvents(dataChannel, peerId);

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        // In a real app with a signaling server, you'd send this candidate.
        // For this demo, we bundle all candidates into the initial offer/answer.
      }
    };
    
    connection.ondatachannel = (event) => {
      const receiveChannel = event.channel;
      newPeer.dataChannel = receiveChannel;
      setupDataChannelEvents(receiveChannel, peerId);
    };

    return newPeer;
  }, [setupDataChannelEvents]);

  const createOffer = useCallback(async (): Promise<string> => {
    const tempId = crypto.randomUUID();
    const peer = createPeerConnection(tempId);
    addPeer(peer);

    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    
    // Wait for ICE gathering to complete to create a single payload
    return new Promise((resolve) => {
      peer.connection.onicegatheringstatechange = () => {
        if (peer.connection.iceGatheringState === 'complete') {
           const offerPayload = {
             sdp: peer.connection.localDescription,
             sender: { id: user.id, name: user.name, publicKey: user.keys.publicKey },
           };
           resolve(btoa(JSON.stringify(offerPayload)));
        }
      };
    });
  }, [createPeerConnection, addPeer, user]);

  const handleOffer = useCallback(async (offerCode: string) => {
    const { sdp, sender } = JSON.parse(atob(offerCode));
    
    const existingPeer = peers.find(p => p.id === sender.id);
    if(existingPeer) {
        console.warn("Already have a connection with this peer.");
        return; // Or handle re-connection logic
    }

    const peer = createPeerConnection(sender.id);
    await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));

    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);
    
    const sharedSecret = await deriveSharedSecret(user.keys.privateKey, sender.publicKey);
    peer.sharedSecret = sharedSecret;
    peer.name = sender.name;
    // @ts-ignore
    peer.keys.publicKey = sender.publicKey;
    
    addPeer(peer);
    
     return new Promise<string>((resolve) => {
      peer.connection.onicegatheringstatechange = () => {
        if (peer.connection.iceGatheringState === 'complete') {
           const answerPayload = {
             sdp: peer.connection.localDescription,
             sender: { id: user.id, name: user.name, publicKey: user.keys.publicKey },
           };
           resolve(btoa(JSON.stringify(answerPayload)));
        }
      };
    });
  }, [createPeerConnection, peers, addPeer, user]);
  
  const handleAnswer = useCallback(async (answerCode: string) => {
    try {
        const { sdp, sender } = JSON.parse(atob(answerCode));
        
        // The "tempId" peer created by `createOffer` should be the one to handle this answer.
        // This logic is simplified; a robust solution would use a map of pending offers.
        const pendingPeer = peers.find(p => p.connection.signalingState === 'have-local-offer');
        if (!pendingPeer) {
          // This might be an offer, not an answer.
          const offerCode = await handleOffer(answerCode);
          if(offerCode) {
              // This is a special case: we received an offer, so we need to return an answer code to the user.
              // This breaks the simple flow a bit, but is necessary for two-way initiation.
              // In a real UI, you'd show this code to the user to send back.
              alert(`You received an invite! Send this code back:\n\n${offerCode}`);
          }
          return;
        }
        
        await pendingPeer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
        
        const sharedSecret = await deriveSharedSecret(user.keys.privateKey, sender.publicKey);
        
        // Update the peer from its temporary state to a permanent one
        setPeers(prev => prev.map(p => {
            if (p.id === pendingPeer.id) {
                return { ...p, id: sender.id, name: sender.name, sharedSecret, keys: { publicKey: sender.publicKey, privateKey: {} as any } };
            }
            return p;
        }).filter(p => p.id !== pendingPeer.id || p.id === sender.id)); // Clean up temp peer
    } catch (e) {
        console.error("Failed to handle answer:", e);
        // If parsing fails, it might be an offer code. Try to handle it as such.
        const offerCode = await handleOffer(answerCode);
        if (offerCode) {
            alert(`You received an invite! Send this code back:\n\n${offerCode}`);
        } else {
            throw new Error("Invalid answer/offer code.");
        }
    }
  }, [peers, user.keys, handleOffer]);
  
  const broadcastMessage = useCallback((message: AppMessage, recipientIds: string[]) => {
      peers.forEach(peer => {
          if (recipientIds.includes(peer.id) && peer.dataChannel && peer.dataChannel.readyState === 'open') {
              peer.dataChannel.send(JSON.stringify(message));
          }
      });
  }, [peers]);

  return { peers, createOffer, handleAnswer, broadcastMessage, setPeers };
};