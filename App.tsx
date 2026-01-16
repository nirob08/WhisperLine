
import React, { useState, useEffect, useRef } from 'react';
import { AppScreen, UserProfile, Message, CallState } from './types';
import { cryptoService } from './services/crypto';
import { signalingService } from './services/signaling';
import { ICONS } from './constants';

const getAvatarUrl = (seed: string) => `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}`;

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ONBOARDING);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeChatUser, setActiveChatUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  
  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    type: null,
    remoteParticipant: null,
    startTime: null,
    status: 'ended'
  });

  // Profile Edit State
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');

  // Handle URL Deep Linking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetUser = params.get('u');
    if (targetUser && currentUser) {
      signalingService.findOrCreateUser(targetUser).then(user => {
        setActiveChatUser(user);
        setCurrentScreen(AppScreen.CHAT_DETAIL);
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    }
  }, [currentUser]);

  // Load user session
  useEffect(() => {
    const storedUser = localStorage.getItem('whisperline_current_user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      setCurrentUser(parsed);
      setEditDisplayName(parsed.displayName || '');
      setEditBio(parsed.bio || '');
      setCurrentScreen(AppScreen.CHAT_LIST);
    }
  }, []);

  // Poll for messages and decrypt them
  useEffect(() => {
    if (!currentUser) return;

    const fetchInterval = setInterval(async () => {
      const incoming = await signalingService.getMessagesForUser(currentUser.username);
      if (incoming.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const filtered = incoming.filter(m => !existingIds.has(m.id));
          return [...prev, ...filtered];
        });
      }
    }, 2000);

    return () => clearInterval(fetchInterval);
  }, [currentUser]);

  // Logic to decrypt messages whenever message list updates
  useEffect(() => {
    const decryptAll = async () => {
      const newDecrypted: Record<string, string> = { ...decryptedMessages };
      let changed = false;
      for (const msg of messages) {
        if (!newDecrypted[msg.id]) {
          newDecrypted[msg.id] = await cryptoService.decryptMessage(msg.content);
          changed = true;
        }
      }
      if (changed) setDecryptedMessages(newDecrypted);
    };
    decryptAll();
  }, [messages]);

  const handleRegister = async (username: string) => {
    if (!username.trim()) return;
    const { publicKey } = await cryptoService.generateIdentityKeyPair();
    const profile: UserProfile = {
      username: username.toLowerCase().trim(),
      publicKey,
      avatarSeed: username,
      createdAt: Date.now(),
      displayName: username,
      bio: "Identity verified via WhisperLine."
    };

    const success = await signalingService.registerUser(profile);
    if (success) {
      setCurrentUser(profile);
      localStorage.setItem('whisperline_current_user', JSON.stringify(profile));
      setCurrentScreen(AppScreen.CHAT_LIST);
    } else {
      alert("Username is locally reserved. Try another.");
    }
  };

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.length >= 1) {
      const results = await signalingService.searchUsers(val);
      setSearchResults(results.filter(r => r.username !== currentUser?.username));
    } else {
      setSearchResults([]);
    }
  };

  const sendMessage = async (text: string) => {
    if (!currentUser || !activeChatUser || !text.trim()) return;

    const encrypted = await cryptoService.encryptMessage(text, activeChatUser.publicKey);
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender: currentUser.username,
      recipient: activeChatUser.username,
      content: encrypted,
      timestamp: Date.now(),
      status: 'sent',
      type: 'text'
    };

    setMessages(prev => [...prev, newMessage]);
    await signalingService.sendMessage(newMessage);
  };

  const startCall = (type: 'audio' | 'video', user: UserProfile) => {
    setCallState({
      isActive: true,
      type,
      remoteParticipant: user.username,
      startTime: Date.now(),
      status: 'dialing'
    });
    setCurrentScreen(AppScreen.CALL);
    
    // Auto "connect" after 2 seconds for demo
    setTimeout(() => {
      setCallState(prev => ({ ...prev, status: 'connected' }));
    }, 2000);
  };

  const endCall = () => {
    setCallState(prev => ({ ...prev, isActive: false, status: 'ended' }));
    setCurrentScreen(AppScreen.CHAT_DETAIL);
  };

  const Avatar = ({ user, size = "w-10 h-10" }: { user: UserProfile | null, size?: string }) => {
    const src = user?.avatarData || getAvatarUrl(user?.avatarSeed || 'default');
    return <img src={src} className={`${size} rounded-full border border-neutral-800 bg-neutral-900 object-cover`} alt="avatar" />;
  };

  // UI Renderers
  const renderOnboarding = () => (
    <div className="flex flex-col items-center justify-center h-screen p-8 text-center bg-black">
      <div className="mb-12">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center emerald-glow mx-auto mb-6">
          <ICONS.Shield />
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">WhisperLine</h1>
        <p className="mt-2 text-neutral-500 text-sm">Create your decentralized identity.</p>
      </div>
      <div className="w-full max-w-sm glass rounded-3xl p-6">
        <input 
          type="text" 
          placeholder="Enter a username..." 
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 mb-4"
          onKeyDown={(e) => e.key === 'Enter' && handleRegister((e.target as HTMLInputElement).value)}
        />
        <button 
          onClick={() => handleRegister((document.querySelector('input') as HTMLInputElement).value)}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-xl py-4 transition-all"
        >
          Begin Session
        </button>
      </div>
    </div>
  );

  const renderChatList = () => (
    <div className="flex flex-col h-screen bg-black">
      <header className="p-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Messages</h2>
        <button onClick={() => setCurrentScreen(AppScreen.SETTINGS)} className="w-10 h-10 rounded-full glass flex items-center justify-center text-neutral-400">
          <ICONS.Settings />
        </button>
      </header>

      <div className="px-6 pb-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-4 flex items-center text-neutral-500"><ICONS.Search /></div>
          <input 
            type="text" 
            placeholder="Search by username..." 
            className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl pl-12 pr-4 py-3 text-white focus:outline-none"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        {searchQuery.length > 0 ? (
          <div className="space-y-2">
            {searchResults.map(user => (
              <div 
                key={user.username}
                onClick={() => {
                  setActiveChatUser(user);
                  setSearchQuery('');
                  setCurrentScreen(AppScreen.CHAT_DETAIL);
                }}
                className="flex items-center gap-4 p-4 glass rounded-2xl cursor-pointer hover:bg-neutral-800/50 transition-all"
              >
                <Avatar user={user} size="w-12 h-12" />
                <div className="flex-1">
                  <div className="font-bold text-white">@{user.username}</div>
                  <div className="text-xs text-neutral-500">{user.bio}</div>
                </div>
                <div className="text-emerald-500"><ICONS.Plus /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {activeChatUser && (
              <div onClick={() => setCurrentScreen(AppScreen.CHAT_DETAIL)} className="flex items-center gap-4 p-4 hover:bg-neutral-900/50 rounded-2xl cursor-pointer transition">
                <Avatar user={activeChatUser} size="w-14 h-14" />
                <div className="flex-1 border-b border-neutral-900 pb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white">@{activeChatUser.username}</span>
                    <span className="text-[10px] text-neutral-600">Active Node</span>
                  </div>
                  <div className="text-sm text-neutral-500 truncate">Tap to resume secure session</div>
                </div>
              </div>
            )}
            {!activeChatUser && <p className="text-center text-neutral-700 text-sm mt-20">No active sessions. Search for a friend.</p>}
          </div>
        )}
      </div>
    </div>
  );

  const renderChatDetail = () => {
    if (!activeChatUser) return null;
    const chatMessages = messages.filter(m => 
      (m.sender === currentUser?.username && m.recipient === activeChatUser.username) ||
      (m.sender === activeChatUser.username && m.recipient === currentUser?.username)
    ).sort((a, b) => a.timestamp - b.timestamp);

    return (
      <div className="flex flex-col h-screen bg-black">
        <header className="p-4 border-b border-neutral-900 flex items-center justify-between glass">
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentScreen(AppScreen.CHAT_LIST)} className="p-2 text-neutral-400"><ICONS.ArrowLeft /></button>
            <Avatar user={activeChatUser} size="w-10 h-10" />
            <div>
              <div className="font-bold text-white text-sm">@{activeChatUser.username}</div>
              <div className="text-[9px] text-emerald-500 uppercase tracking-widest font-bold">End-to-End Encrypted</div>
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => startCall('audio', activeChatUser)} className="p-2 text-neutral-400 hover:text-emerald-500"><ICONS.Phone /></button>
            <button onClick={() => startCall('video', activeChatUser)} className="p-2 text-neutral-400 hover:text-emerald-500"><ICONS.Video /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col-reverse">
          <div className="flex flex-col space-y-3">
            {chatMessages.map(m => (
              <div key={m.id} className={`flex flex-col ${m.sender === currentUser?.username ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] ${
                  m.sender === currentUser?.username ? 'bg-emerald-600 text-black font-medium' : 'bg-neutral-900 text-white'
                }`}>
                  {decryptedMessages[m.id] || "Decrypting..."}
                </div>
                <div className="text-[9px] text-neutral-600 mt-1 px-1">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 glass">
          <div className="flex items-center gap-2 bg-neutral-900 rounded-2xl px-3 py-1">
            <input 
              type="text" 
              placeholder="Secure message..." 
              className="flex-1 bg-transparent text-white text-sm py-3 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  sendMessage((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <button onClick={() => {
              const input = document.querySelector('input[placeholder="Secure message..."]') as HTMLInputElement;
              sendMessage(input.value);
              input.value = '';
            }} className="p-2 text-emerald-500"><ICONS.Send /></button>
          </div>
        </div>
      </div>
    );
  };

  const renderCall = () => (
    <div className="flex flex-col h-screen bg-black items-center justify-between p-12 text-center">
      <div className="mt-10">
        <div className="text-emerald-500 text-[10px] font-bold uppercase tracking-[0.3em] mb-8">
          {callState.status === 'dialing' ? 'Establishing Tunnel...' : 'Session Connected'}
        </div>
        <div className="w-32 h-32 rounded-full border-2 border-emerald-500/30 mx-auto flex items-center justify-center pulse-animation">
          <Avatar user={activeChatUser} size="w-24 h-24" />
        </div>
        <h2 className="text-3xl font-bold text-white mt-8">@{activeChatUser?.username}</h2>
        <p className="text-neutral-500 text-sm mt-2">{callState.status === 'dialing' ? 'Requesting Handshake...' : '00:04'}</p>
      </div>

      <div className="w-full max-w-xs flex justify-center gap-10">
        <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center rotate-[135deg] shadow-2xl shadow-red-900/50 hover:scale-105 transition">
          <ICONS.Phone />
        </button>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="flex flex-col h-screen bg-black">
      <header className="p-6 flex items-center gap-4">
        <button onClick={() => setCurrentScreen(AppScreen.CHAT_LIST)} className="p-2 text-neutral-400"><ICONS.ArrowLeft /></button>
        <h2 className="text-2xl font-bold text-white">Settings</h2>
      </header>
      <div className="p-6 text-center">
        <Avatar user={currentUser} size="w-24 h-24 mx-auto border-2 border-emerald-500/20 mb-4" />
        <h3 className="text-xl font-bold text-white">@{currentUser?.username}</h3>
        <p className="text-xs text-neutral-500 mt-2">Public Key: {currentUser?.publicKey.slice(0, 15)}...</p>
        
        <div className="mt-10 space-y-3">
          <button onClick={() => cryptoService.panicWipe().then(() => window.location.reload())} className="w-full bg-red-900/20 text-red-500 font-bold py-4 rounded-2xl border border-red-500/20 hover:bg-red-500 hover:text-white transition">
            Panic Wipe (Delete Account)
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen border-x border-neutral-900 shadow-2xl overflow-hidden bg-black text-white">
      {currentScreen === AppScreen.ONBOARDING && renderOnboarding()}
      {currentScreen === AppScreen.CHAT_LIST && renderChatList()}
      {currentScreen === AppScreen.CHAT_DETAIL && renderChatDetail()}
      {currentScreen === AppScreen.CALL && renderCall()}
      {currentScreen === AppScreen.SETTINGS && renderSettings()}
    </div>
  );
};

export default App;
