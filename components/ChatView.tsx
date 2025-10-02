import React, { useState, useCallback, useEffect } from 'react';
import { User, Peer, Chat, TextMessage, MessageType, AppMessage } from '../types';
import UserList from './UserList';
import ChatWindow from './ChatWindow';
import { decryptTextMessage, encryptTextMessage, generateSymmetricKey, exportSymmetricKey, importSymmetricKey } from '../services/cryptoService';
import { useWebRTC } from '../hooks/useWebRTC';
import { ThemeToggle } from './ThemeToggle';
import { InfoIcon, LogoutIcon } from './Icons';
import Modal from './Modal';
import { db } from '../services/dbService';

interface ChatViewProps {
  user: User;
  onLogout: () => void;
}

const ChatView: React.FC<ChatViewProps> = ({ user, onLogout }) => {
  const [chats, setChats] = useState<Map<string, Chat>>(new Map());
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  
  const handleNewMessage = useCallback(async (senderId: string, message: AppMessage) => {
    if (message.type !== MessageType.TEXT) return;

    const textMessage = message as TextMessage;
    const chatId = textMessage.recipientId.startsWith('group-') ? textMessage.recipientId : senderId;

    setChats(prevChats => {
      const newChats = new Map(prevChats);
      const chat = newChats.get(chatId);

      if (chat) {
        if (!chat.messages.some(m => m.id === textMessage.id)) {
            chat.messages.push(textMessage);
            chat.messages.sort((a, b) => a.timestamp - b.timestamp);
            if (chatId !== activeChatId) {
                chat.unreadCount = (chat.unreadCount || 0) + 1;
            }
            db.saveMessage(textMessage, chatId);
        }
      }
      return newChats;
    });
  }, [user.id, activeChatId]);

  const { peers, createOffer, handleAnswer, broadcastMessage } = useWebRTC(user, handleNewMessage);

  useEffect(() => {
    const loadChats = async () => {
        const savedChats = await db.getChats();
        const chatMap = new Map<string, Chat>();
        for (const savedChat of savedChats) {
            const messages = await db.getMessagesForChat(savedChat.id);
            let groupKey: CryptoKey | undefined = undefined;
            if (savedChat.groupKeyJwk) {
                groupKey = await importSymmetricKey(savedChat.groupKeyJwk);
            }
            chatMap.set(savedChat.id, { ...savedChat, messages, groupKey });
        }
        setChats(chatMap);
    };
    loadChats();
  }, []);


  const selectChat = useCallback((peerOrChatId: string, name: string) => {
    const peer = peers.find(p => p.id === peerOrChatId);
    const chatId = peerOrChatId;

    if (!chats.has(chatId) && peer) {
      const newChat: Chat = {
        id: peer.id,
        name: peer.name,
        type: 'dm',
        messages: [],
        unreadCount: 0,
        members: [{id: user.id, name: user.name}, {id: peer.id, name: peer.name}]
      };
      setChats(prev => new Map(prev).set(chatId, newChat));
      db.saveChat(newChat);
    }
    setActiveChatId(chatId);
  }, [chats, peers, user]);
  
  const sendMessage = useCallback(async (content: string) => {
    if (!activeChatId) return;

    const chat = chats.get(activeChatId);
    if (!chat) return;
    
    let encryptedContent: string, iv: string;
    let recipientIds: string[] = [];

    if (chat.type === 'dm') {
        const peer = peers.find(p => p.id === chat.id);
        if (!peer || !peer.sharedSecret) {
            console.error("Cannot send DM: no peer or shared secret.");
            return;
        }
        ({ encryptedContent, iv } = await encryptTextMessage(content, peer.sharedSecret));
        recipientIds = [peer.id];
    } else { // Group chat
        if (!chat.groupKey) {
            console.error("Cannot send group message: no group key.");
            return;
        }
        ({ encryptedContent, iv } = await encryptTextMessage(content, chat.groupKey));
        recipientIds = chat.members.map(m => m.id).filter(id => id !== user.id);
    }

    const message: TextMessage = {
      id: crypto.randomUUID(),
      type: MessageType.TEXT,
      senderId: user.id,
      recipientId: chat.id,
      encryptedContent,
      iv,
      timestamp: Date.now(),
    };
    
    setChats(prev => {
        const newChats = new Map(prev);
        const currentChat = newChats.get(activeChatId);
        if (currentChat) {
            currentChat.messages.push(message);
            db.saveMessage(message, activeChatId);
        }
        return newChats;
    });

    const connectedRecipients = recipientIds.filter(id => peers.some(p => p.id === id && p.status === 'connected'));
    broadcastMessage(message, connectedRecipients);
  }, [activeChatId, chats, user.id, peers, broadcastMessage]);

  const createGroup = useCallback(async (name: string) => {
    const groupId = `group-${crypto.randomUUID()}`;
    const groupKey = await generateSymmetricKey();
    const groupKeyJwk = await exportSymmetricKey(groupKey);

    const newGroup: Chat = {
      id: groupId,
      name,
      type: 'group',
      messages: [],
      unreadCount: 0,
      members: [{ id: user.id, name: user.name }],
      groupKey,
      groupKeyJwk,
    };
    setChats(prev => new Map(prev).set(groupId, newGroup));
    db.saveChat(newGroup);
    setActiveChatId(groupId);
  }, [user]);

  const joinGroup = useCallback(async (inviteCode: string) => {
      try {
        const decoded = atob(inviteCode);
        const { groupId, groupName, key: groupKeyJwk } = JSON.parse(decoded);
        
        if (chats.has(groupId)) {
            setActiveChatId(groupId);
            return;
        }

        const groupKey = await importSymmetricKey(groupKeyJwk);

        const newGroup: Chat = {
            id: groupId,
            name: groupName,
            type: 'group',
            messages: [],
            unreadCount: 0,
            members: [{id: user.id, name: user.name}], // Simplified, needs member sync
            groupKey,
            groupKeyJwk
        };

        setChats(prev => new Map(prev).set(groupId, newGroup));
        db.saveChat(newGroup);
        setActiveChatId(groupId);
        // TODO: Announce presence to other group members
      } catch (e) {
          console.error("Failed to join group with invite code", e);
          alert("Invalid invite code.");
      }
  }, [user, chats]);

  const generateGroupInviteCode = useCallback(async (groupId: string): Promise<string> => {
      const chat = chats.get(groupId);
      if (!chat || chat.type !== 'group' || !chat.groupKeyJwk) {
          throw new Error("Invalid group or missing key");
      }
      const payload = {
          groupId: chat.id,
          groupName: chat.name,
          key: chat.groupKeyJwk
      };
      return btoa(JSON.stringify(payload));
  }, [chats]);


  useEffect(() => {
    // Clear unread count when a chat is opened
    if (activeChatId) {
        setChats(prev => {
            const newChats = new Map(prev);
            const chat = newChats.get(activeChatId);
            if (chat && chat.unreadCount > 0) {
                chat.unreadCount = 0;
                db.saveChat(chat);
            }
            return newChats;
        });
    }
  }, [activeChatId]);


  return (
    <div className="flex h-screen font-sans antialiased text-gray-900 bg-gray-100 dark:bg-gray-900 dark:text-gray-100 animate-fade-in">
      <div className="flex flex-col w-full max-w-xs bg-white border-r border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-white">
                {user.name.charAt(0).toUpperCase()}
            </div>
          <h2 className="text-xl font-bold ml-2 truncate">{user.name}</h2>
          <div className="flex items-center space-x-2">
            <ThemeToggle />
            <button onClick={onLogout} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" title="Logout">
              <LogoutIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
        <UserList
          peers={peers}
          onSelectChat={selectChat}
          createOffer={createOffer}
          handleAnswer={handleAnswer}
          activeChatId={activeChatId}
          chats={chats}
          onCreateGroup={createGroup}
          onJoinGroup={joinGroup}
        />
        <div className="p-4 mt-auto border-t border-gray-200 dark:border-gray-700">
            <button onClick={() => setIsInfoModalOpen(true)} className="flex items-center justify-center w-full text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400">
                <InfoIcon className="w-4 h-4 mr-2" />
                <span>How this works & Security</span>
            </button>
        </div>
      </div>
      <main className="flex-1 flex flex-col">
        {activeChatId && chats.has(activeChatId) ? (
          <ChatWindow
            chat={chats.get(activeChatId)!}
            user={user}
            onSendMessage={sendMessage}
            peer={peers.find(p => p.id === activeChatId)}
            onGenerateInvite={generateGroupInviteCode}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center bg-gray-50 dark:bg-gray-800/50 p-8">
            <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Welcome to Aether</h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">Select a peer or group from the list to start a secure chat.</p>
            <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">
              Use the buttons on the left to connect to peers, create, or join groups.
            </p>
          </div>
        )}
      </main>
      <Modal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} title="Application Information">
        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
            <p><strong className="text-gray-800 dark:text-white">End-to-End Encryption:</strong> All messages are encrypted on your device and can only be decrypted by the recipient. No one in the middle, not even a server, can read them. This demo uses the Web Crypto API (ECDH for key exchange, AES-GCM for encryption).</p>
            <p><strong className="text-gray-800 dark:text-white">Peer-to-Peer (P2P):</strong> After a manual "handshake" (exchanging invite codes), your devices connect directly using WebRTC. This minimizes server reliance.</p>
            <p><strong className="text-gray-800 dark:text-white">IP Address Privacy:</strong> In a real-world app, a TURN server would be configured to relay traffic, hiding your direct IP address from peers. This demo relies on your browser's default WebRTC behavior, which may expose your IP to connected peers.</p>
            <p><strong className="text-gray-800 dark:text-white">Data Storage:</strong> Your user identity (including private key) and encrypted message history are stored in your browser's local storage and IndexedDB. Clearing your browser data will erase them.</p>
            <p><strong className="text-gray-800 dark:text-white">Security Notice:</strong> This is a technology demonstration. While it implements cryptographic principles, it has not undergone a formal security audit. Do not use it for sensitive communications.</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">App Version: 1.1.0-demo | Build Hash: [dev-build-no-hash]</p>
        </div>
      </Modal>
    </div>
  );
};

export default ChatView;