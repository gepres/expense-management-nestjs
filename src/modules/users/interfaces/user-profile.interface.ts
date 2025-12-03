import { Timestamp } from 'firebase-admin/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  preferences?: {
    currency: string;
    language: string;
  };
  whatsappPhone?: string;
  whatsappLinkedAt?: Date | Timestamp;
}

export interface UserPreferences {
  currency: string;
  language: string;
}
