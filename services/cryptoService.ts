import { User, CryptoKeys } from '../types';

const KEY_ALG = { name: 'ECDH', namedCurve: 'P-384' };
const ENCRYPT_ALG = { name: 'AES-GCM', length: 256 };
const SYMMETRIC_KEY_ALG = { name: 'AES-GCM', length: 256 };


/**
 * Security Note:
 * This service implements the fundamental cryptographic operations for E2EE.
 * - Key Generation: ECDH for establishing a shared secret between two parties.
 * - Encryption: AES-GCM for symmetric encryption of messages. AES-GCM is an authenticated
 *   encryption mode, which provides both confidentiality and integrity.
 * - Keys are marked as `extractable` for this demo to allow storing them in localStorage.
 *   In a production app, keys should be non-extractable (`extractable: false`) for better security,
 *   though this makes key backup/recovery more complex.
 */

// Generates a new ECDH key pair for a user.
export const generateKeys = async (): Promise<CryptoKeys> => {
  const keyPair = await window.crypto.subtle.generateKey(KEY_ALG, true, ['deriveKey']);
  const publicKey = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey!);
  const privateKey = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey!);
  return { publicKey, privateKey };
};

// Creates a new user with a unique ID and a fresh key pair.
export const generateUser = async (name: string): Promise<User> => {
  const keys = await generateKeys();
  const id = await generateUserIdFromPublicKey(keys.publicKey);
  return { id, name, keys, isServerMode: false };
};

// Derives a stable user ID from their public key to avoid random UUIDs.
const generateUserIdFromPublicKey = async (publicKey: JsonWebKey): Promise<string> => {
    const pubKeyString = JSON.stringify(publicKey);
    const encoder = new TextEncoder();
    const data = encoder.encode(pubKeyString);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
};


// Derives a shared secret key for symmetric encryption between two users.
export const deriveSharedSecret = async (
  myPrivateKey: JsonWebKey,
  peerPublicKey: JsonWebKey
): Promise<CryptoKey> => {
  const privateKey = await window.crypto.subtle.importKey(
    'jwk',
    myPrivateKey,
    KEY_ALG,
    true,
    ['deriveKey']
  );
  const publicKey = await window.crypto.subtle.importKey(
    'jwk',
    peerPublicKey,
    KEY_ALG,
    true,
    []
  );

  return window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    ENCRYPT_ALG,
    true,
    ['encrypt', 'decrypt']
  );
};

// Generates a new symmetric key for group chats.
export const generateSymmetricKey = async (): Promise<CryptoKey> => {
    return window.crypto.subtle.generateKey(SYMMETRIC_KEY_ALG, true, ['encrypt', 'decrypt']);
};

// Exports a symmetric key to a storable format (JWK).
export const exportSymmetricKey = async (key: CryptoKey): Promise<JsonWebKey> => {
    return window.crypto.subtle.exportKey('jwk', key);
};

// Imports a symmetric key from a storable format (JWK).
export const importSymmetricKey = async (jwk: JsonWebKey): Promise<CryptoKey> => {
    return window.crypto.subtle.importKey('jwk', jwk, SYMMETRIC_KEY_ALG, true, ['encrypt', 'decrypt']);
};

// Encrypts a text message using the shared secret.
export const encryptTextMessage = async (
  content: string,
  sharedSecret: CryptoKey
): Promise<{ encryptedContent: string; iv: string }> => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedContent = new TextEncoder().encode(content);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedSecret,
    encodedContent
  );

  const encryptedContent = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  const ivString = btoa(String.fromCharCode(...iv));

  return { encryptedContent, iv: ivString };
};

// Decrypts a text message using the shared secret.
export const decryptTextMessage = async (
  encryptedContent: string,
  ivString: string,
  sharedSecret: CryptoKey
): Promise<string> => {
  const encryptedBuffer = Uint8Array.from(atob(encryptedContent), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivString), c => c.charCodeAt(0));

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedSecret,
    encryptedBuffer
  );

  return new TextDecoder().decode(decryptedBuffer);
};