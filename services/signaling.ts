
import { Peer, DataConnection } from 'peerjs';
import { UserProfile, Message } from '../types';

/**
 * Real-time P2P Signaling Service using PeerJS.
 * This replaces the local-only simulation with actual network connectivity.
 */

class SignalingService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private onMessageCallback: ((msg: Message) => void) | null = null;
  private onCallCallback: ((type: 'audio' | 'video', from: string) => void) | null = null;

  // Unique prefix to avoid collisions on the public PeerJS server
  private ID_PREFIX = 'wline_v2_';

  init(username: string, onMessage: (msg: Message) => void, onCall: (type: 'audio' | 'video', from: string) => void) {
    this.onMessageCallback = onMessage;
    this.onCallCallback = onCall;

    if (this.peer) return;

    this.peer = new Peer(`${this.ID_PREFIX}${username.toLowerCase()}`);

    this.peer.on('open', (id) => {
      console.log('My peer ID is: ' + id);
    });

    this.peer.on('connection', (conn) => {
      this.setupConnection(conn);
    });

    this.peer.on('call', (call) => {
      // In a real app, we'd handle the stream here. For now, we signal the UI.
      const from = call.peer.replace(this.ID_PREFIX, '');
      this.onCallCallback?.('video', from);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS Error:', err);
    });
  }

  private setupConnection(conn: DataConnection) {
    const remoteUsername = conn.peer.replace(this.ID_PREFIX, '');
    this.connections.set(remoteUsername, conn);

    conn.on('data', (data: any) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(data as Message);
      }
    });

    conn.on('close', () => {
      this.connections.delete(remoteUsername);
    });
  }

  async searchUsers(query: string): Promise<UserProfile[]> {
    // In P2P, we "discover" by attempting to connect or via a simplified result
    if (query.length < 3) return [];
    
    // Simulate finding a user. In reality, PeerJS doesn't have a public "search" list for privacy.
    // We treat the query as a direct ID.
    return [{
      username: query.toLowerCase().trim(),
      publicKey: `pub_${query}`,
      displayName: query,
      avatarSeed: query,
      createdAt: Date.now(),
      bio: "Global Identity Node"
    }];
  }

  async connectToUser(username: string): Promise<boolean> {
    if (!this.peer) return false;
    const targetId = `${this.ID_PREFIX}${username.toLowerCase()}`;
    
    if (this.connections.has(username)) return true;

    const conn = this.peer.connect(targetId);
    return new Promise((resolve) => {
      conn.on('open', () => {
        this.setupConnection(conn);
        resolve(true);
      });
      setTimeout(() => resolve(false), 5000); // Timeout after 5s
    });
  }

  async sendMessage(msg: Message): Promise<void> {
    let conn = this.connections.get(msg.recipient);
    
    if (!conn) {
      const connected = await this.connectToUser(msg.recipient);
      if (connected) {
        conn = this.connections.get(msg.recipient);
      }
    }

    if (conn && conn.open) {
      conn.send(msg);
    } else {
      console.error('Could not send message: Connection not open');
    }
  }

  async registerUser(profile: UserProfile): Promise<boolean> {
    // In PeerJS mode, "registration" is just saving locally
    localStorage.setItem('whisperline_current_user', JSON.stringify(profile));
    return true;
  }

  async findOrCreateUser(username: string): Promise<UserProfile> {
    return {
      username: username.toLowerCase(),
      publicKey: `pub_${username}`,
      displayName: username,
      avatarSeed: username,
      createdAt: Date.now(),
      bio: "Found via P2P Link"
    };
  }
}

export const signalingService = new SignalingService();
