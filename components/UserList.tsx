import React, { useState, useMemo } from 'react';
import { Peer, Chat } from '../types';
import { ConnectIcon, PlusIcon, UsersIcon } from './Icons';
import Modal from './Modal';

interface UserListProps {
  peers: Peer[];
  onSelectChat: (id: string, name: string) => void;
  createOffer: () => Promise<string>;
  handleAnswer: (answerCode: string) => Promise<void>;
  activeChatId: string | null;
  chats: Map<string, Chat>;
  onCreateGroup: (name: string) => void;
  onJoinGroup: (inviteCode: string) => void;
}

const UserList: React.FC<UserListProps> = ({ peers, onSelectChat, createOffer, handleAnswer, activeChatId, chats, onCreateGroup, onJoinGroup }) => {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  
  const [inviteCode, setInviteCode] = useState('');
  const [answerCode, setAnswerCode] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [groupInviteCode, setGroupInviteCode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const allChats = useMemo(() => {
    const connectedPeerChats = peers.map(p => ({
        id: p.id,
        name: p.name,
        type: 'dm' as const,
        unreadCount: chats.get(p.id)?.unreadCount || 0,
        status: p.status
    }));
    
    const groupChats = Array.from(chats.values())
        .filter(c => c.type === 'group')
        .map(c => ({
            id: c.id,
            name: c.name,
            type: 'group' as const,
            unreadCount: c.unreadCount,
            status: 'connected' as const // Groups are always 'connected' locally
        }));

    const dmChatsFromStorage = Array.from(chats.values())
        .filter(c => c.type === 'dm' && !peers.some(p => p.id === c.id))
        .map(c => ({
            id: c.id,
            name: c.name,
            type: 'dm' as const,
            unreadCount: c.unreadCount,
            status: 'disconnected' as const
        }));

    const combined = [...connectedPeerChats, ...groupChats, ...dmChatsFromStorage];
    const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
    return unique;

  }, [peers, chats]);


  const handleCreateOffer = async () => {
    setIsLoading(true);
    setError('');
    try {
      const code = await createOffer();
      setInviteCode(code);
    } catch (e) {
      setError('Failed to create invite code.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!answerCode.trim()) {
      setError('Please paste an invite or answer code.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await handleAnswer(answerCode);
      setIsConnectModalOpen(false);
      setAnswerCode('');
      setInviteCode('');
    } catch (e) {
      setError('Invalid code or connection failed.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGroupName.trim().length < 3) {
      setError("Group name must be at least 3 characters.");
      return;
    }
    onCreateGroup(newGroupName.trim());
    setNewGroupName('');
    setIsGroupModalOpen(false);
  }

  const handleJoinGroup = () => {
    if (!groupInviteCode.trim()) {
        setError("Please enter a group invite code.");
        return;
    }
    onJoinGroup(groupInviteCode);
    setGroupInviteCode('');
    setIsGroupModalOpen(false);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setIsConnectModalOpen(true)}
          className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
        >
          <ConnectIcon className="w-5 h-5 mr-2" />
          Peer
        </button>
        <button
          onClick={() => setIsGroupModalOpen(true)}
          className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 dark:focus:ring-offset-gray-800"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Group
        </button>
      </div>
      <h3 className="px-4 pt-2 pb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
        Conversations
      </h3>
      <ul>
        {allChats.map((chat) => (
            <li key={chat.id}>
              <button
                onClick={() => onSelectChat(chat.id, chat.name)}
                className={`flex items-center w-full px-4 py-3 text-left transition-colors duration-150 ${
                  activeChatId === chat.id
                    ? 'bg-indigo-100 dark:bg-indigo-900/50'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="relative">
                   <div className={`w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center font-bold text-gray-800 dark:text-gray-200`}>
                        {chat.type === 'group' ? <UsersIcon className="w-5 h-5" /> : chat.name.charAt(0).toUpperCase()}
                    </div>
                  {chat.type === 'dm' && <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ${chat.status === 'connected' ? 'bg-green-500' : 'bg-gray-400'} ring-2 ring-white dark:ring-gray-800`}></span>}
                </div>
                <div className="ml-3 flex-1">
                  <p className="font-semibold">{chat.name}</p>
                  {chat.type === 'dm' && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{chat.status}</p>}
                </div>
                 {chat.unreadCount > 0 && (
                    <span className="ml-auto bg-indigo-600 text-white text-xs font-bold rounded-full px-2 py-1">
                        {chat.unreadCount}
                    </span>
                 )}
              </button>
            </li>
          ))}
        {allChats.length === 0 && (
          <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">No conversations yet.</p>
        )}
      </ul>

      <Modal isOpen={isConnectModalOpen} onClose={() => setIsConnectModalOpen(false)} title="Connect with a Peer">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Step 1: Create an Invite</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Generate an invite code and send it to your peer.</p>
            <button onClick={handleCreateOffer} disabled={isLoading} className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400">
              {isLoading ? 'Generating...' : 'Generate Invite Code'}
            </button>
            {inviteCode && (
              <textarea
                readOnly
                value={inviteCode}
                className="w-full h-24 p-2 mt-2 text-xs bg-gray-100 dark:bg-gray-900 border rounded-md resize-none"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            )}
          </div>
          <hr className="dark:border-gray-600" />
          <div>
            <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Step 2: Accept an Invite</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Paste the code you received from your peer here.</p>
            <textarea
              placeholder="Paste invite or answer code here..."
              value={answerCode}
              onChange={(e) => setAnswerCode(e.target.value)}
              className="w-full h-24 p-2 text-xs bg-gray-100 dark:bg-gray-700 border rounded-md resize-none"
            />
            <button onClick={handleAcceptInvite} disabled={isLoading} className="w-full mt-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400">
              {isLoading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>
      </Modal>

      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} title="Create or Join Group">
          <div className="space-y-4">
              <form onSubmit={handleCreateGroup}>
                  <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Create New Group</h4>
                  <input
                      type="text"
                      placeholder="Enter group name..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border rounded-md"
                  />
                  <button type="submit" className="w-full mt-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700">
                      Create Group
                  </button>
              </form>
              <hr className="dark:border-gray-600" />
              <div>
                  <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Join Existing Group</h4>
                  <textarea
                      placeholder="Paste group invite code here..."
                      value={groupInviteCode}
                      onChange={(e) => setGroupInviteCode(e.target.value)}
                      className="w-full h-24 p-2 text-xs bg-gray-100 dark:bg-gray-700 border rounded-md resize-none"
                  />
                  <button onClick={handleJoinGroup} className="w-full mt-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700">
                      Join Group
                  </button>
              </div>
               {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>
      </Modal>

    </div>
  );
};

export default UserList;