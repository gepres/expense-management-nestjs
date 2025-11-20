import { Timestamp } from 'firebase-admin/firestore';

export interface ImportError {
  row: number;
  field: string;
  message: string;
  value?: any;
}

export interface AISuggestion {
  type: 'category' | 'duplicate' | 'format' | 'missing' | 'anomaly';
  message: string;
  affectedRows: number[];
  suggestion: string;
  confidence?: number;
}

export interface ImportResult {
  success: boolean;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: ImportError[];
  warnings: string[];
  aiSuggestions?: AISuggestion[];
  importId?: string;
}

export interface ImportRecord {
  id: string;
  userId: string;
  fileName: string;
  format: 'excel' | 'json';
  totalRows: number;
  imported: number;
  skipped: number;
  status: 'processing' | 'completed' | 'failed';
  errors: ImportError[];
  createdAt: Timestamp;
  completedAt?: Timestamp;
}
