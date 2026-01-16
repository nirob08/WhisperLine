
import { UserProfile, Message } from '../types';

/**
 * Signaling Server Simulation
 * Real production would use WebSockets/Socket.io with a lightweight Node.js/Rust backend.
 */

const STORAGE_KEY_REGISTRY = 'whisperline_registry';
const STORAGE_KEY_QUEUED_MESSAGES = 'whisperline_queued_messages';

export const signalingService = {
  /**
   * Registers a username in the global discovery "registry"
   */
  async registerUser(profile: UserProfile): Promise<boolean> {
    const registry: UserProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRY) || '[]');
    
    if (registry.some(u => u.username === profile.username)) {
      return false; // Already exists
    }
    
    registry.push(profile);
    localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(registry));
    return true;
  },

  /**
   * Updates an existing user's profile info
   */
  async updateUser(oldUsername: string, updatedProfile: UserProfile): Promise<boolean> {
    const registry: UserProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRY) || '[]');
    
    // Check if new username is taken by someone else
    if (oldUsername !== updatedProfile.username && registry.some(u => u.username === updatedProfile.username)) {
      return false;
    }

    const index = registry.findIndex(u => u.username === oldUsername);
    if (index !== -1) {
      registry[index] = updatedProfile;
      localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(registry));
      return true;
    }
    return false;
  },

  /**
   * Discovery: Search for a user by partial username
   */
  async searchUsers(query: string): Promise<UserProfile[]> {
    const registry: UserProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRY) || '[]');
    return registry.filter(u => u.username.toLowerCase().includes(query.toLowerCase()));
  },

  /**
   * Sends a message through the signaling server
   */
  async sendMessage(msg: Message): Promise<void> {
    const queue: Message[] = JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUED_MESSAGES) || '[]');
    queue.push({ ...msg, status: 'delivered' });
    localStorage.setItem(STORAGE_KEY_QUEUED_MESSAGES, JSON.stringify(queue));
    
    // Simulate real-time event
    window.dispatchEvent(new CustomEvent('whisperline_message_sent', { detail: msg }));
  },

  /**
   * Fetches messages for a specific user (Poll simulation)
   */
  async getMessagesForUser(username: string): Promise<Message[]> {
    const queue: Message[] = JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUED_MESSAGES) || '[]');
    const userMessages = queue.filter(m => m.recipient === username);
    return userMessages;
  }
};
