export interface CryptoKeys {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface User {
  id: string;
  name: string;
  keys: CryptoKeys;
  isServerMode: boolean;
}

export interface Peer extends User {
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel;
  status: 'connecting' | 'connected' | 'disconnected';
  sharedSecret?: CryptoKey;
}

export enum MessageType {
  TEXT = 'TEXT',
  USER_INFO = 'USER_INFO',
  GROUP_KEY = 'GROUP_KEY',
  MICRO_WORLD_UPDATE = 'MICRO_WORLD_UPDATE',
  SIGNALING_REQUEST = 'SIGNALING_REQUEST',
  SIGNALING_RESPONSE = 'SIGNALING_RESPONSE',
}

export interface BaseMessage {
  type: MessageType;
  timestamp: number;
}

export interface TextMessage extends BaseMessage {
  type: MessageType.TEXT;
  id: string;
  senderId: string;
  recipientId: string; // Can be a user ID or group ID
  encryptedContent: string;
  iv: string; // Initialization Vector as a base64 string
}

export interface UserInfoMessage extends BaseMessage {
  type: MessageType.USER_INFO;
  payload: Omit<User, 'keys'> & { publicKey: JsonWebKey };
}

export interface GroupKeyMessage extends BaseMessage {
  type: MessageType.GROUP_KEY;
  groupId: string;
  encryptedKey: string;
  iv: string;
}

export interface MicroWorldUpdateMessage extends BaseMessage {
  type: MessageType.MICRO_WORLD_UPDATE;
  groupId: string;
  encryptedState: string;
  iv: string;
}

export type AppMessage = TextMessage | UserInfoMessage | GroupKeyMessage | MicroWorldUpdateMessage;

export interface ChatMember {
    id: string;
    name: string;
}

export interface Chat {
  id: string; // User ID for DMs, or a generated ID for groups
  name: string;
  type: 'dm' | 'group';
  messages: TextMessage[];
  unreadCount: number;
  members: ChatMember[]; // For group chats
  groupKey?: CryptoKey; // Symmetric key for group chat
  groupKeyJwk?: JsonWebKey; // Storable version of the group key
}

export interface MicroWorldState {
  cards: { id: string; content: string; position: { x: number; y: number } }[];
}

// Security Note: Storing private keys in localStorage is not ideal for production.
// For a real-world application, consider using the browser's SubtleCrypto with non-extractable keys
// or a more secure storage mechanism. This is a simplified approach for the demo.
export interface StoredUserIdentity {
  id: string;
  name: string;
  keys: CryptoKeys;
}