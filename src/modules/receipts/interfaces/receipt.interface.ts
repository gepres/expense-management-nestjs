import { Timestamp } from 'firebase-admin/firestore';

export interface Receipt {
  id: string;
  imageUrl: string;
  extractedData?: {
    amount?: number;
    currency?: string;
    date?: string;
    time?: string;
    paymentMethod?: string;
    merchant?: string;
    referenceNumber?: string;
    category?: string;
    subcategory?: string;
    description?: string;
    confidence?: number;
  };
  status: 'pending' | 'processed' | 'failed';
  processedAt?: Timestamp;
  errorMessage?: string;
  createdAt: Timestamp;
}
