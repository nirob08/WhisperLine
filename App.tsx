
import React, { useState, useEffect, useRef } from 'react';
import { AppScreen, UserProfile, Message, CallState, NetworkStats } from './types';
import { cryptoService } from './services/crypto';
import { signalingService } from './services/signaling';
import { ICONS, COLORS } from './constants';

// Helper: Seeded Avatar Generator (Fallback)
const getAvatarUrl = (seed: string) => `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}`;

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ONBOARDING);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeChatUser, setActiveChatUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    type: null,
    remoteParticipant: null,
    startTime: null,
    status: 'ended'
  });

  // Edit states
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarSeed, setEditAvatarSeed] = useState('');
  const [editAvatarData, setEditAvatarData] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // PWA Install Prompt Listener
  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null);
      console.log('WhisperLine was installed');
    });
  }, []);

  // Local Storage Initialization
  useEffect(() => {
    const storedUser = localStorage.getItem('whisperline_current_user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      setCurrentUser(parsed);
      setCurrentScreen(AppScreen.CHAT_LIST);
    }
  }, []);

  // Sync edit states
  useEffect(() => {
    if (currentUser) {
      setEditUsername(currentUser.username);
      setEditDisplayName(currentUser.displayName || '');
      setEditBio(currentUser.bio || '');
      setEditAvatarSeed(currentUser.avatarSeed || '');
      setEditAvatarData(currentUser.avatarData);
    }
  }, [currentUser]);

  // Fetch messages interval
  useEffect(() => {
    if (!currentUser) return;

    const fetchInterval = setInterval(async () => {
      const newMessages = await signalingService.getMessagesForUser(currentUser.username);
      if (newMessages.length > 0) {
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          return [...prev, ...newMessages.filter(m => !ids.has(m.id))];
        });
      }
    }, 2000);

    return () => clearInterval(fetchInterval);
  }, [currentUser]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  const handleRegister = async (username: string) => {
    if (!username.trim()) return;
    const { publicKey } = await cryptoService.generateIdentityKeyPair();
    const profile: UserProfile = {
      username: username.toLowerCase().trim(),
      publicKey,
      avatarSeed: Math.random().toString(36).substring(7),
      createdAt: Date.now(),
      displayName: username.trim(),
      bio: "Whispering through the line..."
    };

    const success = await signalingService.registerUser(profile);
    if (success) {
      setCurrentUser(profile);
      localStorage.setItem('whisperline_current_user', JSON.stringify(profile));
      setCurrentScreen(AppScreen.CHAT_LIST);
    } else {
      alert("Username already taken. Please choose another.");
    }
  };

  const handleUpdateProfile = async () => {
    if (!currentUser) return;
    if (!editUsername.trim()) return;

    const updatedProfile: UserProfile = {
      ...currentUser,
      username: editUsername.toLowerCase().trim(),
      displayName: editDisplayName.trim(),
      bio: editBio.trim(),
      avatarSeed: editAvatarSeed,
      avatarData: editAvatarData
    };

    const success = await signalingService.updateUser(currentUser.username, updatedProfile);
    if (success) {
      setCurrentUser(updatedProfile);
      localStorage.setItem('whisperline_current_user', JSON.stringify(updatedProfile));
      setCurrentScreen(AppScreen.SETTINGS);
    } else {
      alert("Username already taken. Please choose another.");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatarData(reader.result as string);
        setEditAvatarSeed('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.length > 1) {
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
  };

  const endCall = () => {
    setCallState(prev => ({ ...prev, isActive: false, status: 'ended' }));
    setCurrentScreen(AppScreen.CHAT_DETAIL);
  };

  const handlePanicWipe = async () => {
    if (confirm("DANGER: This will instantly delete all local identity keys and history. Continue?")) {
      await cryptoService.panicWipe();
      window.location.reload();
    }
  };

  const Avatar = ({ user, size = "w-10 h-10" }: { user: UserProfile | null, size?: string }) => {
    if (!user) return <div className={`${size} rounded-full bg-neutral-800 animate-pulse`} />;
    const src = user.avatarData || getAvatarUrl(user.avatarSeed || 'default');
    return <img src={src} className={`${size} rounded-full border border-neutral-800 bg-neutral-900 object-cover`} alt="avatar" />;
  };

  const renderOnboarding = () => (
    <div className="flex flex-col items-center justify-center h-screen p-8 text-center bg-black">
      <div className="mb-12">
        <div className="relative inline-block">
          <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center emerald-glow border border-emerald-500/50">
            <ICONS.Shield />
          </div>
          <div className="absolute top-0 right-0 w-6 h-6 bg-emerald-500 rounded-full border-4 border-black pulse-animation"></div>
        </div>
        <h1 className="mt-8 text-4xl font-bold tracking-tight text-white">WhisperLine</h1>
        <p className="mt-4 text-neutral-400 font-light max-w-xs">
          Low-latency, privacy-first communication. No phone number, no trackers.
        </p>
      </div>

      <div className="w-full max-w-sm glass rounded-3xl p-6">
        <input 
          type="text" 
          placeholder="Choose a username" 
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-4"
          onKeyDown={(e) => e.key === 'Enter' && handleRegister((e.target as HTMLInputElement).value)}
        />
        <button 
          onClick={() => {
            const input = document.querySelector('input') as HTMLInputElement;
            handleRegister(input.value);
          }}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-xl py-4 transition-all"
        >
          Secure Entry
        </button>
        <p className="mt-4 text-xs text-neutral-500 uppercase tracking-widest">Local Key Generation Only</p>
      </div>
    </div>
  );

  const renderChatList = () => (
    <div className="flex flex-col h-screen bg-black">
      <header className="p-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Messages</h2>
          <div className="flex items-center gap-2 text-xs text-emerald-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            End-to-End Encrypted
          </div>
        </div>
        <button 
          onClick={() => setCurrentScreen(AppScreen.SETTINGS)}
          className="w-10 h-10 rounded-full glass flex items-center justify-center text-neutral-400 hover:text-white transition"
        >
          <ICONS.Settings />
        </button>
      </header>

      <div className="px-6 pb-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-neutral-500">
            <ICONS.Search />
          </div>
          <input 
            type="text" 
            placeholder="Search username..." 
            className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        {searchResults.length > 0 ? (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-neutral-600 uppercase mb-4 tracking-wider">Search Results</h3>
            {searchResults.map(user => (
              <div 
                key={user.username}
                onClick={() => {
                  setActiveChatUser(user);
                  setSearchQuery('');
                  setSearchResults([]);
                  setCurrentScreen(AppScreen.CHAT_DETAIL);
                }}
                className="flex items-center gap-4 p-4 glass rounded-2xl mb-2 cursor-pointer hover:bg-neutral-800/30 transition-all border border-emerald-500/10"
              >
                <Avatar user={user} size="w-12 h-12" />
                <div>
                  <div className="font-semibold text-white">{user.displayName || `@${user.username}`}</div>
                  <div className="text-xs text-neutral-500">@{user.username}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {activeChatUser && (
              <div 
                onClick={() => setCurrentScreen(AppScreen.CHAT_DETAIL)}
                className="flex items-center gap-4 p-4 hover:bg-neutral-900/50 rounded-2xl cursor-pointer transition"
              >
                <Avatar user={activeChatUser} size="w-14 h-14" />
                <div className="flex-1 border-b border-neutral-900 pb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white">{activeChatUser.displayName || `@${activeChatUser.username}`}</span>
                    <span className="text-xs text-neutral-600">Now</span>
                  </div>
                  <div className="text-sm text-neutral-500 truncate">Tap to open encrypted session</div>
                </div>
              </div>
            )}
            {!activeChatUser && (
              <div className="h-64 flex flex-col items-center justify-center opacity-30">
                <ICONS.Shield />
                <p className="mt-4 text-sm font-light">Your inbox is empty</p>
              </div>
            )}
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
            <button onClick={() => setCurrentScreen(AppScreen.CHAT_LIST)} className="p-2 text-neutral-400 hover:text-white transition">
              <ICONS.ArrowLeft />
            </button>
            <div className="flex items-center gap-3">
              <Avatar user={activeChatUser} size="w-10 h-10" />
              <div>
                <div className="font-bold text-white leading-none">{activeChatUser.displayName || `@${activeChatUser.username}`}</div>
                <div className="text-[10px] text-emerald-500 uppercase font-bold tracking-widest mt-1">@{activeChatUser.username} • P2P Secure</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => startCall('audio', activeChatUser)} className="p-2 text-neutral-400 hover:text-emerald-500 transition"><ICONS.Phone /></button>
            <button onClick={() => startCall('video', activeChatUser)} className="p-2 text-neutral-400 hover:text-emerald-500 transition"><ICONS.Video /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col-reverse">
          <div className="space-y-4 flex flex-col">
            {chatMessages.map(m => {
              const isMine = m.sender === currentUser?.username;
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                    isMine ? 'bg-emerald-600 text-black font-medium' : 'bg-neutral-900 text-white'
                  }`}>
                    {m.sender === currentUser?.username ? m.content.replace(/^encrypted_|_via_.*$/g, '') : 'Simulated encrypted payload...'}
                  </div>
                  <div className="flex items-center gap-1 mt-1 px-1">
                    <span className="text-[10px] text-neutral-600">
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isMine && <span className="text-emerald-500"><ICONS.Check /></span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-neutral-900 glass">
          <div className="flex items-center gap-3 bg-neutral-900 rounded-2xl pl-4 pr-2 py-2">
            <input 
              type="text" 
              placeholder="Encrypted message..." 
              className="flex-1 bg-transparent text-white text-sm focus:outline-none py-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  sendMessage((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <button 
              onClick={() => {
                const input = document.querySelector('input[placeholder="Encrypted message..."]') as HTMLInputElement;
                sendMessage(input.value);
                input.value = '';
              }}
              className="p-2 bg-emerald-500 text-black rounded-xl hover:bg-emerald-600 transition"
            >
              <ICONS.Send />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCall = () => (
    <div className="flex flex-col h-screen bg-black relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black opacity-60 z-10"></div>
        {callState.type === 'video' ? (
          <div className="w-full h-full flex items-center justify-center bg-neutral-900">
             <div className="text-neutral-700 animate-pulse text-xl uppercase tracking-[0.4em]">Simulated Video Stream</div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
             <div className="w-64 h-64 rounded-full border border-emerald-500/20 flex items-center justify-center pulse-animation">
               <div className="w-48 h-48 rounded-full border border-emerald-500/40 flex items-center justify-center pulse-animation" style={{ animationDelay: '0.5s' }}></div>
             </div>
          </div>
        )}
      </div>

      <div className="z-20 flex flex-col h-full p-8 items-center justify-between text-center">
        <div>
          <div className="text-emerald-500 text-xs font-bold uppercase tracking-widest mb-4">
            {callState.status === 'dialing' ? 'Dialing Secure Node...' : 'Connected • AES-256'}
          </div>
          <Avatar user={activeChatUser} size="w-32 h-32 mx-auto emerald-glow border-4 border-emerald-500/20" />
          <h2 className="mt-6 text-3xl font-bold text-white">@{callState.remoteParticipant}</h2>
          <div className="mt-2 text-neutral-400 text-sm">
            {callState.status === 'dialing' ? 'Establishing P2P Tunnel' : '01:24'}
          </div>
        </div>

        <div className="w-full max-w-xs glass p-4 rounded-3xl grid grid-cols-2 gap-4">
           <div className="text-left">
             <div className="text-[10px] text-neutral-500 uppercase mb-1">Bandwidth</div>
             <div className="text-sm text-emerald-500 font-mono">12.4 kbps (Opus)</div>
           </div>
           <div className="text-right">
              <div className="text-[10px] text-neutral-500 uppercase mb-1">Latency</div>
              <div className="text-sm text-emerald-500 font-mono">42ms</div>
           </div>
        </div>

        <div className="flex gap-8 items-center">
          <button className="w-16 h-16 rounded-full glass border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition">
            <ICONS.Plus />
          </button>
          <button 
            onClick={endCall}
            className="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center shadow-xl shadow-red-900/40 hover:scale-105 transition active:scale-95"
          >
            <div className="rotate-[135deg]"><ICONS.Phone /></div>
          </button>
          <button className="w-16 h-16 rounded-full glass border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition">
            <ICONS.Video />
          </button>
        </div>
      </div>
    </div>
  );

  const renderEditProfile = () => (
    <div className="flex flex-col h-screen bg-black">
      <header className="p-6 flex items-center gap-4 border-b border-neutral-900">
        <button onClick={() => setCurrentScreen(AppScreen.SETTINGS)} className="p-2 text-neutral-400">
          <ICONS.ArrowLeft />
        </button>
        <h2 className="text-2xl font-bold text-white">Edit Profile</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <div className="flex flex-col items-center">
          <div className="relative group">
            <div className="w-32 h-32 rounded-full border-4 border-emerald-500/20 mb-4 bg-neutral-900 overflow-hidden relative">
              <img src={editAvatarData || getAvatarUrl(editAvatarSeed)} className="w-full h-full object-cover" alt="edit avatar" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange} 
            />
            <button 
              onClick={() => {
                setEditAvatarSeed(Math.random().toString(36).substring(7));
                setEditAvatarData(undefined);
              }}
              className="absolute bottom-4 -right-2 bg-emerald-500 text-black p-2 rounded-full shadow-lg hover:scale-110 transition active:rotate-180"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 16h5v5"></path></svg>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-widest ml-1 mb-1 block">Username</label>
            <input 
              type="text" 
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
              placeholder="Username"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-widest ml-1 mb-1 block">Display Name</label>
            <input 
              type="text" 
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
              placeholder="Display Name"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-widest ml-1 mb-1 block">Bio</label>
            <textarea 
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 min-h-[100px]"
              placeholder="Your bio..."
            />
          </div>
        </div>

        <button 
          onClick={handleUpdateProfile}
          className="w-full bg-emerald-500 text-black font-bold py-4 rounded-2xl hover:bg-emerald-600 transition shadow-lg shadow-emerald-500/20"
        >
          Save Changes
        </button>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="flex flex-col h-screen bg-black">
      <header className="p-6 flex items-center gap-4">
        <button onClick={() => setCurrentScreen(AppScreen.CHAT_LIST)} className="p-2 text-neutral-400">
          <ICONS.ArrowLeft />
        </button>
        <h2 className="text-2xl font-bold text-white">Identity Node</h2>
      </header>

      <div className="flex-1 px-6 space-y-6 overflow-y-auto">
        <div className="p-6 glass rounded-3xl text-center">
          <Avatar user={currentUser} size="w-24 h-24 mx-auto border-2 border-emerald-500/50 mb-4" />
          <h3 className="text-xl font-bold text-white">{currentUser?.displayName || `@${currentUser?.username}`}</h3>
          <p className="text-sm text-neutral-400 mt-1">{currentUser?.bio}</p>
          
          <button 
            onClick={() => setCurrentScreen(AppScreen.EDIT_PROFILE)}
            className="mt-6 px-6 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all"
          >
            Edit Profile
          </button>
        </div>

        <div className="space-y-2">
          {deferredPrompt && (
            <button 
              onClick={handleInstallClick}
              className="w-full flex items-center justify-between p-4 bg-emerald-500 text-black rounded-2xl hover:bg-emerald-600 transition font-bold"
            >
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span className="text-sm">Install WhisperLine App</span>
              </div>
            </button>
          )}

          <button className="w-full flex items-center justify-between p-4 glass rounded-2xl hover:bg-neutral-800 transition">
            <div className="flex items-center gap-3">
              <ICONS.Shield />
              <span className="text-sm">Encryption Protocol</span>
            </div>
            <span className="text-xs text-emerald-500">Signal V3</span>
          </button>
          <button className="w-full flex items-center justify-between p-4 glass rounded-2xl hover:bg-neutral-800 transition">
            <div className="flex items-center gap-3">
              <ICONS.Lock />
              <span className="text-sm">Disappearing Messages</span>
            </div>
            <span className="text-xs text-neutral-500">24 Hours</span>
          </button>
        </div>

        <div className="pt-4 pb-8">
          <button 
            onClick={handlePanicWipe}
            className="w-full bg-red-900/20 border border-red-500/30 text-red-500 font-semibold rounded-2xl py-4 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
          >
            <ICONS.Shield />
            Panic Wipe (Delete All)
          </button>
          <p className="mt-4 text-center text-[10px] text-neutral-600 uppercase tracking-widest leading-loose">
            WhisperLine v1.3.0 - PWA Enabled<br/>
            Distributed P2P Messaging
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen border-x border-neutral-900 shadow-2xl overflow-hidden bg-black">
      {currentScreen === AppScreen.ONBOARDING && renderOnboarding()}
      {currentScreen === AppScreen.CHAT_LIST && renderChatList()}
      {currentScreen === AppScreen.CHAT_DETAIL && renderChatDetail()}
      {currentScreen === AppScreen.CALL && renderCall()}
      {currentScreen === AppScreen.SETTINGS && renderSettings()}
      {currentScreen === AppScreen.EDIT_PROFILE && renderEditProfile()}
    </div>
  );
};

export default App;
