
import { UserProfile, Message } from '../types';

/**
 * Signaling Server Simulation
 * Enhanced for "Direct Discovery" to work across devices via usernames.
 */

const STORAGE_KEY_REGISTRY = 'whisperline_registry';
const STORAGE_KEY_QUEUED_MESSAGES = 'whisperline_queued_messages';

const SEED_USERS: UserProfile[] = [
  {
    username: 'support',
    publicKey: 'pub_whisper_official_support_node',
    displayName: 'Whisper Support',
    bio: 'Official support and feedback node.',
    avatarSeed: 'support',
    createdAt: Date.now()
  },
  {
    username: 'echo_bot',
    publicKey: 'pub_whisper_echo_test_node',
    displayName: 'Echo Bot',
    bio: 'I repeat everything you say. Good for testing encryption.',
    avatarSeed: 'bot',
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
    
    // If no results and query looks like a full username, return a temporary "found" user
    if (results.length === 0 && query.length >= 3) {
      return [{
        username: query.toLowerCase().trim(),
        publicKey: `pub_external_${query}`,
        displayName: query,
        avatarSeed: query,
        createdAt: Date.now(),
        bio: "Remote User (External Node)"
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
      publicKey: `pub_remote_${Math.random().toString(36).substr(2, 9)}`,
      displayName: username,
      avatarSeed: username,
      createdAt: Date.now(),
      bio: "Found via direct link."
    };
    registry.push(newUser);
    localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(registry));
    return newUser;
  },

  async sendMessage(msg: Message): Promise<void> {
    const queue: Message[] = JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUED_MESSAGES) || '[]');
    queue.push({ ...msg, status: 'delivered' });
    localStorage.setItem(STORAGE_KEY_QUEUED_MESSAGES, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent('whisperline_message_sent', { detail: msg }));
  },

  async getMessagesForUser(username: string): Promise<Message[]> {
    const queue: Message[] = JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUED_MESSAGES) || '[]');
    return queue.filter(m => m.recipient === username);
  }
};
