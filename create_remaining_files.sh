#!/bin/bash

# DTOs Chat
cat > src/modules/chat/dto/send-message.dto.ts << 'EOF'
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: '¿Cuánto gasté en alimentación este mes?' })
  @IsString()
  @MinLength(1)
  content: string;
}
EOF

cat > src/modules/chat/dto/update-conversation.dto.ts << 'EOF'
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConversationDto {
  @ApiProperty({ example: 'Presupuesto actualizado' })
  @IsString()
  @MinLength(1)
  title: string;
}
EOF

# Expenses Interfaces
cat > src/modules/expenses/interfaces/expense.interface.ts << 'EOF'
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
EOF

cat > src/modules/expenses/interfaces/expense-summary.interface.ts << 'EOF'
export interface ExpenseSummary {
  period: { start: string; end: string };
  total: number;
  currency: string;
  count: number;
  byCategory: Array<{
    category: string;
    amount: number;
    percentage: number;
    count: number;
  }>;
  byPaymentMethod: Array<{
    method: string;
    amount: number;
    count: number;
  }>;
  dailyAverage: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  topExpenses: any[];
}
EOF

# Receipts Interfaces
cat > src/modules/receipts/interfaces/receipt.interface.ts << 'EOF'
import { Timestamp } from 'firebase-admin/firestore';

export interface Receipt {
  id: string;
  userId: string;
  imageUrl: string;
  extractedData?: Record<string, any>;
  expenseId?: string;
  status: 'pending' | 'processed' | 'failed' | 'saved';
  processedAt?: Timestamp;
  errorMessage?: string;
  createdAt: Timestamp;
}
EOF

cat > src/modules/receipts/interfaces/scan-result.interface.ts << 'EOF'
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
EOF

echo "Archivos creados exitosamente"
