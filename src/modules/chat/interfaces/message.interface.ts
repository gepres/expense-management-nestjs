import { Timestamp } from 'firebase-admin/firestore';

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Timestamp;
  metadata?: {
    model?: string;
    tokens?: number;
  };
}
