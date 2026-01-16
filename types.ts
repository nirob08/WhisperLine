
export interface UserProfile {
  username: string;
  publicKey: string;
  displayName?: string;
  bio?: string;
  avatarSeed?: string;
  avatarData?: string; // Base64 encoded image data
  createdAt: number;
}

export interface Message {
  id: string;
  sender: string;
  recipient: string;
  content: string; // Encrypted string
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
  type: 'text' | 'system';
  isEphemeral?: boolean;
}

export interface CallState {
  isActive: boolean;
  type: 'audio' | 'video' | null;
  remoteParticipant: string | null;
  startTime: number | null;
  status: 'dialing' | 'connecting' | 'connected' | 'ended';
}

export interface NetworkStats {
  bitrate: number; // kbps
  latency: number; // ms
  packetLoss: number; // percentage
  quality: 'Excellent' | 'Good' | 'Fair' | 'Poor';
}

export enum AppScreen {
  ONBOARDING = 'ONBOARDING',
  CHAT_LIST = 'CHAT_LIST',
  CHAT_DETAIL = 'CHAT_DETAIL',
  CALL = 'CALL',
  SETTINGS = 'SETTINGS',
  EDIT_PROFILE = 'EDIT_PROFILE'
}
