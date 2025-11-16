import { Timestamp } from 'firebase-admin/firestore';

export interface Expense {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  date: Timestamp;
  paymentMethod: 'yape' | 'plin' | 'transferencia' | 'efectivo' | 'tarjeta' | 'otro';
  merchant?: string;
  referenceNumber?: string;
  imageUrl?: string;
  extractedData?: {
    rawText?: string;
    fields?: Record<string, any>;
  };
  confidence?: number;
  verified: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
