import { Timestamp } from 'firebase-admin/firestore';

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  lastMessagePreview?: string;
  messageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
