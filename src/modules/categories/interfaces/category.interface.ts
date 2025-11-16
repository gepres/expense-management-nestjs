import { Timestamp } from 'firebase-admin/firestore';

export interface Category {
  id: string;
  userId: string;
  name: string;
  icon?: string;
  color?: string;
  isDefault: boolean;
  createdAt: Timestamp;
}
