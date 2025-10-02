import React, { useState, useRef, useEffect } from 'react';
import { Chat, User, TextMessage, Peer } from '../types';
import { decryptTextMessage } from '../services/cryptoService';
import { SendIcon, WorldIcon, InviteIcon } from './Icons';
import MicroWorld from './MicroWorld';
import Modal from './Modal';

interface ChatWindowProps {
  chat: Chat;
  user: User;
  onSendMessage: (content: string) => void;
  peer: Peer | undefined;
  onGenerateInvite: (groupId: string) => Promise<string>;
}

interface DecryptedMessage extends TextMessage {
  decryptedContent: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ chat, user, onSendMessage, peer, onGenerateInvite }) => {
  const [newMessage, setNewMessage] = useState('');
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage[]>([]);
  const [isMicroWorldOpen, setIsMicroWorldOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const decryptAll = async () => {
        const key = chat.type === 'group' ? chat.groupKey : peer?.sharedSecret;

        if (!key) {
            console.warn(`Cannot decrypt messages for chat ${chat.id}, no key available.`);
            // Set messages as undecryptable
            const results = chat.messages.map(msg => ({...msg, decryptedContent: '[Waiting for secure connection...]' }));
            setDecryptedMessages(results);
            return;
        }

        const promises = chat.messages.map(async (msg) => {
            try {
            const decryptedContent = await decryptTextMessage(msg.encryptedContent, msg.iv, key);
            return { ...msg, decryptedContent };
            } catch (e) {
            console.error(`Failed to decrypt message ${msg.id}`, e);
            return { ...msg, decryptedContent: '[Decryption Failed]' };
            }
        });

        const results = await Promise.all(promises);
        setDecryptedMessages(results);
    };

    decryptAll();
  }, [chat.messages, peer?.sharedSecret, chat.groupKey, chat.id, chat.type]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [decryptedMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
    }
  };
  
  const handleGenerateInvite = async () => {
      const code = await onGenerateInvite(chat.id);
      setInviteCode(code);
      setIsInviteModalOpen(true);
  }

  const isConnected = chat.type === 'dm' ? peer?.status === 'connected' : true;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between p-4 bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center">
            <div className={`relative mr-3`}>
                <div className={`w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center font-bold text-gray-800 dark:text-gray-200`}>
                    {chat.name.charAt(0).toUpperCase()}
                </div>
                {chat.type === 'dm' && <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ${peer?.status === 'connected' ? 'bg-green-500' : 'bg-gray-400'} ring-2 ring-white dark:ring-gray-800`}></span>}
            </div>
            <div>
                <h2 className="text-lg font-semibold">{chat.name}</h2>
                {chat.type === 'group' && <p className="text-xs text-gray-500">{chat.members.length} members</p>}
            </div>
        </div>
        <div className="flex items-center space-x-2">
            {chat.type === 'group' && (
                <button onClick={handleGenerateInvite} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" title="Invite to group">
                    <InviteIcon className="w-6 h-6" />
                </button>
            )}
            <button onClick={() => setIsMicroWorldOpen(!isMicroWorldOpen)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" title="Open Shared Micro-World">
                <WorldIcon className="w-6 h-6" />
            </button>
        </div>
      </header>
      
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col p-4 overflow-y-auto">
            <div className="flex-1 space-y-4">
            {decryptedMessages.map((msg) => (
                <div key={msg.id} className={`flex items-end gap-2 ${msg.senderId === user.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex flex-col ${msg.senderId === user.id ? 'items-end' : 'items-start'}`}>
                      {chat.type === 'group' && msg.senderId !== user.id && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 ml-3">
                          {chat.members.find(m => m.id === msg.senderId)?.name || 'Unknown'}
                        </span>
                      )}
                      <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${msg.senderId === user.id ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'}`}>
                          <p className="break-words">{msg.decryptedContent}</p>
                          <p className={`text-xs mt-1 ${msg.senderId === user.id ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'} text-right`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                      </div>
                  </div>
                </div>
            ))}
            <div ref={messagesEndRef} />
            </div>
        </div>

        {isMicroWorldOpen && (
          <div className="w-1/3 min-w-[300px] max-w-[400px] border-l border-gray-200 dark:border-gray-700 flex flex-col">
            <MicroWorld />
          </div>
        )}

      </div>

      <div className="p-4 bg-white border-t border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <form onSubmit={handleSubmit} className="flex items-center">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={isConnected ? `Message ${chat.name}` : `Waiting for connection...`}
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={!isConnected}
          />
          <button type="submit" className="ml-3 p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:bg-indigo-400" disabled={!isConnected}>
            <SendIcon className="w-5 h-5" />
          </button>
        </form>
      </div>

       <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Group Invite Code">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Share this code with a connected peer to invite them to the "{chat.name}" group.</p>
            <textarea
                readOnly
                value={inviteCode}
                className="w-full h-32 p-2 mt-2 text-xs bg-gray-100 dark:bg-gray-900 border rounded-md resize-none"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
       </Modal>
    </div>
  );
};

export default ChatWindow;