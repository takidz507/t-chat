
import React, { useState, useCallback } from 'react';
import Login from './components/Login';
import ChatView from './components/ChatView';
import { User } from './types';
import { ThemeProvider } from './hooks/useTheme';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  const handleLogin = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
  }, []);

  const handleLogout = useCallback(() => {
    // In a real app, you would also clear any session data, disconnect peers, etc.
    setUser(null);
    localStorage.removeItem('aether-user-identity');
    window.location.reload(); // Easiest way to reset state for this demo
  }, []);

  return (
    <ThemeProvider>
      <div className="min-h-screen text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
        {user ? (
          <ChatView user={user} onLogout={handleLogout} />
        ) : (
          <Login onLogin={handleLogin} />
        )}
      </div>
    </ThemeProvider>
  );
};

export default App;
   