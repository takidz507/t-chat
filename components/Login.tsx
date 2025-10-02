
import React, { useState, useEffect } from 'react';
import { generateUser } from '../services/cryptoService';
import { User, StoredUserIdentity } from '../types';
import { LogoIcon } from './Icons';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check for existing user identity in local storage
    const storedIdentity = localStorage.getItem('aether-user-identity');
    if (storedIdentity) {
      setIsLoading(true);
      try {
        const { id, name: storedName, keys } = JSON.parse(storedIdentity) as StoredUserIdentity;
        // This is a simplified auto-login. In a real app, you might re-verify keys.
        onLogin({ id, name: storedName, keys, isServerMode: false });
      } catch (e) {
        console.error("Failed to parse stored identity", e);
        localStorage.removeItem('aether-user-identity');
        setIsLoading(false);
      }
    }
  }, [onLogin]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 3) {
      setError('Name must be at least 3 characters long.');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const newUser = await generateUser(name);
      const identityToStore: StoredUserIdentity = {
          id: newUser.id,
          name: newUser.name,
          keys: newUser.keys
      };
      localStorage.setItem('aether-user-identity', JSON.stringify(identityToStore));
      
      setIsFlipped(true);
      setTimeout(() => onLogin(newUser), 600); // Wait for flip animation
    } catch (err) {
      console.error("Key generation failed:", err);
      setError('Could not create user. Please try again.');
      setIsLoading(false);
    }
  };

  if (isLoading && !isFlipped) {
      return (
          <div className="flex items-center justify-center min-h-screen">
              <div className="text-white text-xl">Loading session...</div>
          </div>
      )
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gray-100 dark:bg-gray-900" style={{ perspective: '1000px' }}>
      <div
        className={`relative w-full max-w-sm h-64 transition-transform duration-700 ease-in-out`}
        style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* Front of the card */}
        <div className="absolute w-full h-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 flex flex-col justify-center items-center" style={{ backfaceVisibility: 'hidden' }}>
          <div className="flex items-center gap-3 mb-4">
            <LogoIcon className="h-10 w-10 text-indigo-500" />
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Aether</h1>
          </div>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-6">Secure P2P Communication</p>
          <form onSubmit={handleSubmit} className="w-full">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-2 border-transparent focus:border-indigo-500 focus:outline-none transition"
              disabled={isLoading}
            />
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <button
              type="submit"
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? 'Securing...' : 'Enter'}
            </button>
          </form>
        </div>

        {/* Back of the card */}
        <div
          className="absolute w-full h-full bg-indigo-600 rounded-2xl shadow-2xl p-8 flex flex-col justify-center items-center"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <LogoIcon className="h-16 w-16 text-white" />
          <h2 className="text-3xl font-bold text-white mt-4">Welcome</h2>
          <p className="text-indigo-200 text-xl">{name}</p>
          <p className="text-indigo-200 mt-4">Connecting to the network...</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
   