import { Timestamp } from 'firebase-admin/firestore';
import { ImportExpenseDto } from '../dto/import-expense.dto';

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

// Response for /api/import/validate
export interface ValidateResult {
  success: boolean;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  data: ImportExpenseDto[];
  errors: ImportError[];
  warnings: string[];
}

// Response for /api/import/analyze
export interface AnalyzeResult {
  success: boolean;
  totalProcessed: number;
  data: ImportExpenseDto[];
  duplicatesRemoved: number;
  categorized: number;
  aiSuggestions?: AISuggestion[];
}

// Response for /api/import/upload
export interface UploadResult {
  success: boolean;
  totalRows: number;
  imported: number;
  failed: number;
  importId: string;
  errors: ImportError[];
}

// Legacy - kept for backwards compatibility
export interface ImportResult {
  success: boolean;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: ImportError[];
  warnings: string[];
  aiSuggestions?: AISuggestion[];
  importId?: string;
  data?: ImportExpenseDto[];
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
