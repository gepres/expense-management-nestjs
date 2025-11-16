export interface ScanResult {
  success: boolean;
  receiptId: string;
  data: {
    amount: number;
    currency: string;
    date: string;
    paymentMethod: string;
    merchant?: string;
    referenceNumber?: string;
    category?: string;
    description?: string;
    confidence: number;
  };
  imageUrl: string;
  suggestions?: string[];
}
