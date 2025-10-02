import { Chat, TextMessage } from '../types';

const DB_NAME = 'AetherChatDB';
const DB_VERSION = 1;
const CHAT_STORE = 'chats';
const MESSAGE_STORE = 'messages';

class DatabaseService {
  private db: IDBDatabase | null = null;

  constructor() {
    this.init();
  }

  private async init(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject('Error opening IndexedDB');
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(CHAT_STORE)) {
          db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
          const messageStore = db.createObjectStore(MESSAGE_STORE, { keyPath: 'id' });
          messageStore.createIndex('chatId', 'recipientId', { unique: false });
        }
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    return this.db || this.init();
  }

  public async saveChat(chat: Chat): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(CHAT_STORE, 'readwrite');
    const store = transaction.objectStore(CHAT_STORE);
    
    // We can't store non-serializable objects like CryptoKey directly
    const storableChat = { ...chat, messages: undefined, groupKey: undefined };
    store.put(storableChat);

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
  
  public async getChats(): Promise<Chat[]> {
      const db = await this.getDB();
      const transaction = db.transaction(CHAT_STORE, 'readonly');
      const store = transaction.objectStore(CHAT_STORE);
      const request = store.getAll();

      return new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });
  }

  public async saveMessage(message: TextMessage, chatId: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(MESSAGE_STORE, 'readwrite');
    const store = transaction.objectStore(MESSAGE_STORE);
    store.put({ ...message, chatId }); // Add chatId for indexing

     return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  public async getMessagesForChat(chatId: string): Promise<TextMessage[]> {
      const db = await this.getDB();
      const transaction = db.transaction(MESSAGE_STORE, 'readonly');
      const store = transaction.objectStore(MESSAGE_STORE);
      const index = store.index('chatId');
      const request = index.getAll(chatId);

      return new Promise((resolve, reject) => {
          request.onsuccess = () => {
              const messages = request.result.sort((a,b) => a.timestamp - b.timestamp);
              resolve(messages);
          }
          request.onerror = () => reject(request.error);
      });
  }

}

export const db = new DatabaseService();
