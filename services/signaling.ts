
import { UserProfile, Message } from '../types';

/**
 * Signaling Server Simulation
 * Enhanced to allow "Direct Peer Discovery" via username.
 */

const STORAGE_KEY_REGISTRY = 'whisperline_registry';
const STORAGE_KEY_QUEUED_MESSAGES = 'whisperline_queued_messages';

const SEED_USERS: UserProfile[] = [
  {
    username: 'support',
    publicKey: 'pub_whisper_official',
    displayName: 'Whisper Support',
    bio: 'End-to-end encrypted support node.',
    avatarSeed: 'support',
    createdAt: Date.now()
  }
];

export const signalingService = {
  _init() {
    const existing = localStorage.getItem(STORAGE_KEY_REGISTRY);
    if (!existing) {
      localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(SEED_USERS));
    }
  },

  async registerUser(profile: UserProfile): Promise<boolean> {
    this._init();
    const registry: UserProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRY) || '[]');
    if (registry.some(u => u.username === profile.username)) return false;
    registry.push(profile);
    localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(registry));
    return true;
  },

  async updateUser(oldUsername: string, updatedProfile: UserProfile): Promise<boolean> {
    const registry: UserProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRY) || '[]');
    const index = registry.findIndex(u => u.username === oldUsername);
    if (index !== -1) {
      registry[index] = updatedProfile;
      localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(registry));
      return true;
    }
    return false;
  },

  async searchUsers(query: string): Promise<UserProfile[]> {
    this._init();
    const registry: UserProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRY) || '[]');
    const results = registry.filter(u => u.username.toLowerCase().includes(query.toLowerCase()));
    
    // Logic: If user types a specific username not in registry, "discover" it
    if (results.length === 0 && query.length >= 3) {
      return [{
        username: query.toLowerCase().trim(),
        publicKey: `pub_ext_${query}`,
        displayName: query,
        avatarSeed: query,
        createdAt: Date.now(),
        bio: "Remote Identity Discovered"
      }];
    }
    return results;
  },

  async findOrCreateUser(username: string): Promise<UserProfile> {
    this._init();
    const registry: UserProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRY) || '[]');
    const existing = registry.find(u => u.username === username);
    if (existing) return existing;

    const newUser: UserProfile = {
      username: username.toLowerCase(),
      publicKey: `pub_remote_${Math.random().toString(36).substr(2, 5)}`,
      displayName: username,
      avatarSeed: username,
      createdAt: Date.now(),
      bio: "Identity Link Active"
    };
    registry.push(newUser);
    localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(registry));
    return newUser;
  },

  async sendMessage(msg: Message): Promise<void> {
    const queue: Message[] = JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUED_MESSAGES) || '[]');
    queue.push({ ...msg, status: 'delivered' });
    localStorage.setItem(STORAGE_KEY_QUEUED_MESSAGES, JSON.stringify(queue));
    
    // Simulate an auto-reply for better UX in a single-device demo
    if (msg.recipient === 'support') {
      setTimeout(() => {
        const reply: Message = {
          id: Math.random().toString(36).substr(2, 9),
          sender: 'support',
          recipient: msg.sender,
          content: 'encrypted_SGVsbG8hIFdlIGhhdmUgcmVjZWl2ZWQgeW91ciBzZWN1cmUgbWVzc2FnZS4=_via_whisper',
          timestamp: Date.now(),
          status: 'sent',
          type: 'text'
        };
        const currentQueue: Message[] = JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUED_MESSAGES) || '[]');
        currentQueue.push(reply);
        localStorage.setItem(STORAGE_KEY_QUEUED_MESSAGES, JSON.stringify(currentQueue));
      }, 1500);
    }
  },

  async getMessagesForUser(username: string): Promise<Message[]> {
    const queue: Message[] = JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUED_MESSAGES) || '[]');
    return queue.filter(m => m.recipient === username);
  }
};
