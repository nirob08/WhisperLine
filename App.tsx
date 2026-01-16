
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

  // Handle incoming messages from Signaling Service
  const handleIncomingMessage = (msg: Message) => {
    setMessages(prev => {
      if (prev.find(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  };

  const handleIncomingCall = (type: 'audio' | 'video', from: string) => {
    signalingService.findOrCreateUser(from).then(user => {
      setActiveChatUser(user);
      setCallState({
        isActive: true,
        type,
        remoteParticipant: from,
        startTime: Date.now(),
        status: 'connecting'
      });
      setCurrentScreen(AppScreen.CALL);
    });
  };

  // Initialize Signaling when user is logged in
  useEffect(() => {
    if (currentUser) {
      signalingService.init(currentUser.username, handleIncomingMessage, handleIncomingCall);
    }
  }, [currentUser]);

  // Load user session
  useEffect(() => {
    const storedUser = localStorage.getItem('whisperline_current_user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      setCurrentUser(parsed);
      setCurrentScreen(AppScreen.CHAT_LIST);
    }
  }, []);

  // Decrypt messages
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
      username: username.toLowerCase().replace(/\s+/g, '_'),
      publicKey,
      avatarSeed: username,
      createdAt: Date.now(),
      displayName: username,
      bio: "Secure P2P Node"
    };

    await signalingService.registerUser(profile);
    setCurrentUser(profile);
    setCurrentScreen(AppScreen.CHAT_LIST);
  };

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.length >= 3) {
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
      id: Math.random().toString(36).substr(2, 12),
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

  const Avatar = ({ user, size = "w-10 h-10" }: { user: UserProfile | null, size?: string }) => {
    const src = user?.avatarData || getAvatarUrl(user?.avatarSeed || 'default');
    return <img src={src} className={`${size} rounded-full border border-neutral-800 bg-neutral-900 object-cover`} alt="avatar" />;
  };

  // Render Screens
  const renderOnboarding = () => (
    <div className="flex flex-col items-center justify-center h-screen p-8 text-center bg-[#050505]">
      <div className="mb-12">
        <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center emerald-glow mx-auto mb-8 animate-pulse">
          <ICONS.Shield />
        </div>
        <h1 className="text-5xl font-black text-white tracking-tighter mb-2">WhisperLine</h1>
        <p className="text-neutral-500 text-sm font-light">Global P2P Secure Messenger</p>
      </div>
      <div className="w-full max-w-sm glass rounded-[2.5rem] p-8">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-3 ml-2 font-bold">Identity Username</label>
        <input 
          type="text" 
          placeholder="e.g. nirob_07" 
          className="w-full bg-black border border-neutral-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 mb-6"
          onKeyDown={(e) => e.key === 'Enter' && handleRegister((e.target as HTMLInputElement).value)}
        />
        <button 
          onClick={() => handleRegister((document.querySelector('input') as HTMLInputElement).value)}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-2xl py-4 transition-all transform active:scale-95 shadow-xl shadow-emerald-500/10"
        >
          GO ONLINE
        </button>
      </div>
    </div>
  );

  const renderChatList = () => (
    <div className="flex flex-col h-screen bg-black">
      <header className="px-6 pt-10 pb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-white">Inbox</h2>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-widest">P2P Network Active</span>
          </div>
        </div>
        <button onClick={() => setCurrentScreen(AppScreen.SETTINGS)} className="w-12 h-12 rounded-2xl glass flex items-center justify-center text-neutral-400 hover:text-white transition">
          <ICONS.Settings />
        </button>
      </header>

      <div className="px-6 pb-6">
        <div className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center text-neutral-500 group-focus-within:text-emerald-500 transition-colors"><ICONS.Search /></div>
          <input 
            type="text" 
            placeholder="Search global username..." 
            className="w-full bg-neutral-900/50 border border-neutral-800/50 rounded-[1.5rem] pl-14 pr-6 py-4 text-white focus:outline-none focus:bg-neutral-900 focus:border-emerald-500/30 transition-all"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 space-y-2">
        {searchQuery.length > 0 ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.2em] mb-4 ml-2">Global Discovery</h3>
            {searchResults.length > 0 ? (
              searchResults.map(user => (
                <div 
                  key={user.username}
                  onClick={() => {
                    setActiveChatUser(user);
                    setSearchQuery('');
                    setCurrentScreen(AppScreen.CHAT_DETAIL);
                  }}
                  className="flex items-center gap-4 p-5 glass rounded-3xl cursor-pointer hover:bg-emerald-500/5 transition-all border border-transparent hover:border-emerald-500/20"
                >
                  <Avatar user={user} size="w-12 h-12" />
                  <div className="flex-1">
                    <div className="font-bold text-white">@{user.username}</div>
                    <div className="text-[10px] text-neutral-500 font-medium">Ready to connect</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500"><ICONS.Plus /></div>
                </div>
              ))
            ) : (
              <div className="p-10 text-center opacity-30 italic text-sm">Searching network...</div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeChatUser && (
              <div 
                onClick={() => setCurrentScreen(AppScreen.CHAT_DETAIL)} 
                className="flex items-center gap-4 p-5 hover:bg-neutral-900/40 rounded-[2rem] cursor-pointer transition-all border border-transparent active:bg-neutral-900"
              >
                <div className="relative">
                  <Avatar user={activeChatUser} size="w-14 h-14" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-4 border-black rounded-full"></div>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-bold text-white">@{activeChatUser.username}</span>
                    <span className="text-[10px] font-bold text-neutral-600">NOW</span>
                  </div>
                  <div className="text-sm text-neutral-500 truncate font-medium">Active session established</div>
                </div>
              </div>
            )}
            {!activeChatUser && (
              <div className="flex flex-col items-center justify-center pt-20 opacity-20">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-neutral-500 flex items-center justify-center mb-4"><ICONS.Plus /></div>
                <p className="text-sm font-bold uppercase tracking-widest">No Active Connections</p>
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
        <header className="p-5 border-b border-neutral-900/50 flex items-center justify-between glass">
          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentScreen(AppScreen.CHAT_LIST)} className="p-2 -ml-2 text-neutral-400 hover:text-white transition"><ICONS.ArrowLeft /></button>
            <div className="relative">
              <Avatar user={activeChatUser} size="w-11 h-11" />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-[3px] border-black rounded-full"></div>
            </div>
            <div>
              <div className="font-black text-white text-sm tracking-tight">@{activeChatUser.username}</div>
              <div className="text-[9px] text-emerald-500 uppercase tracking-[0.15em] font-black">Connected P2P</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentScreen(AppScreen.CALL)} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-neutral-400 hover:text-emerald-500 transition"><ICONS.Phone /></button>
            <button onClick={() => setCurrentScreen(AppScreen.CALL)} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-neutral-400 hover:text-emerald-500 transition"><ICONS.Video /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 flex flex-col-reverse">
          <div className="flex flex-col space-y-4">
            {chatMessages.length === 0 && (
              <div className="text-center py-10 opacity-20 flex flex-col items-center">
                <ICONS.Lock />
                <p className="text-[9px] mt-3 uppercase tracking-[0.3em] font-bold">End-to-End Encrypted Tunnel Active</p>
              </div>
            )}
            {chatMessages.map(m => {
              const isMine = m.sender === currentUser?.username;
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[80%] px-5 py-3.5 rounded-[1.5rem] text-sm leading-relaxed shadow-sm ${
                    isMine ? 'bg-emerald-600 text-black font-bold rounded-tr-none' : 'bg-neutral-900 text-white rounded-tl-none border border-neutral-800'
                  }`}>
                    {decryptedMessages[m.id] || "Decrypting..."}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 px-1 opacity-40">
                    <span className="text-[9px] font-bold uppercase">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {isMine && <ICONS.Check />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-5 glass border-t border-neutral-900/50">
          <div className="flex items-center gap-3 bg-neutral-900/80 rounded-[1.8rem] px-4 py-2 border border-neutral-800">
            <input 
              type="text" 
              placeholder="Type secure message..." 
              className="flex-1 bg-transparent text-white text-sm py-3 focus:outline-none font-medium"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  sendMessage((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <button 
              onClick={() => {
                const input = document.querySelector('input[placeholder="Type secure message..."]') as HTMLInputElement;
                sendMessage(input.value);
                input.value = '';
              }} 
              className="w-10 h-10 rounded-full bg-emerald-500 text-black flex items-center justify-center hover:bg-emerald-400 transition transform active:scale-90"
            >
              <ICONS.Send />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCall = () => (
    <div className="flex flex-col h-screen bg-[#050505] items-center justify-between p-12 text-center overflow-hidden">
      <div className="mt-16 animate-in zoom-in duration-500">
        <div className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.4em] mb-12 animate-pulse">
          {callState.status === 'dialing' ? 'Establishing P2P Tunnel...' : 'Live Session Connected'}
        </div>
        <div className="relative w-40 h-40 mx-auto">
          <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
          <div className="relative w-40 h-40 rounded-full border-2 border-emerald-500/40 flex items-center justify-center p-2 bg-black">
            <Avatar user={activeChatUser} size="w-36 h-36" />
          </div>
        </div>
        <h2 className="text-4xl font-black text-white mt-10 tracking-tight">@{activeChatUser?.username}</h2>
        <div className="mt-4 flex items-center justify-center gap-2">
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
           <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest">{callState.status === 'dialing' ? 'Connecting Node' : '00:08'}</p>
        </div>
      </div>

      <div className="w-full flex justify-center gap-8 mb-10">
        <button onClick={() => setCallState(prev => ({ ...prev, isActive: false }))} className="w-20 h-20 rounded-3xl bg-red-600/10 border border-red-600/30 text-red-600 flex items-center justify-center transition-all hover:bg-red-600 hover:text-white transform active:scale-90 shadow-2xl shadow-red-600/10">
          <div className="rotate-[135deg] scale-125"><ICONS.Phone /></div>
        </button>
        {callState.status === 'connecting' && (
           <button onClick={() => setCallState(prev => ({...prev, status: 'connected'}))} className="w-20 h-20 rounded-3xl bg-emerald-500 text-black flex items-center justify-center transition-all transform active:scale-90 shadow-2xl shadow-emerald-500/20">
             <div className="scale-125"><ICONS.Phone /></div>
           </button>
        )}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="flex flex-col h-screen bg-black">
      <header className="p-6 flex items-center gap-4 border-b border-neutral-900/50">
        <button onClick={() => setCurrentScreen(AppScreen.CHAT_LIST)} className="p-2 text-neutral-400 hover:text-white"><ICONS.ArrowLeft /></button>
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Profile</h2>
      </header>
      <div className="p-8 text-center">
        <div className="relative inline-block mb-6">
          <Avatar user={currentUser} size="w-32 h-32 border-4 border-emerald-500/10" />
          <div className="absolute bottom-1 right-1 w-6 h-6 bg-emerald-500 border-4 border-black rounded-full"></div>
        </div>
        <h3 className="text-3xl font-black text-white tracking-tight">@{currentUser?.username}</h3>
        <p className="text-[10px] text-neutral-600 mt-2 font-black uppercase tracking-widest break-all px-10">ID: {currentUser?.publicKey}</p>
        
        <div className="mt-16 space-y-3">
          <button 
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }} 
            className="w-full bg-neutral-900 text-red-500 font-black py-5 rounded-3xl border border-red-500/10 hover:bg-red-500 hover:text-white transition-all transform active:scale-95 uppercase text-xs tracking-[0.2em]"
          >
            TERMINATE SESSION
          </button>
          <p className="text-[9px] text-neutral-700 uppercase tracking-widest pt-4">WhisperLine P2P Engine v2.0.1</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen border-x border-neutral-900/50 shadow-2xl overflow-hidden bg-black text-white relative">
      {currentScreen === AppScreen.ONBOARDING && renderOnboarding()}
      {currentScreen === AppScreen.CHAT_LIST && renderChatList()}
      {currentScreen === AppScreen.CHAT_DETAIL && renderChatDetail()}
      {currentScreen === AppScreen.CALL && renderCall()}
      {currentScreen === AppScreen.SETTINGS && renderSettings()}
    </div>
  );
};

export default App;
