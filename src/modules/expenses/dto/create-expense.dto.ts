import {
  IsNumber,
  IsString,
  IsIn,
  IsOptional,
  IsBoolean,
  IsDateString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseDto {
  @ApiProperty({ example: 45.50, description: 'Amount of the expense' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'PEN', description: 'Currency code' })
  @IsString()
  @MinLength(3)
  currency: string;

  @ApiProperty({ example: 'Alimentación', description: 'Expense category' })
  @IsString()
  @MinLength(1)
  category: string;

  @ApiProperty({ example: 'Almuerzo en restaurante', description: 'Description of the expense' })
  @IsString()
  @MinLength(1)
  description: string;

  @ApiProperty({ example: '2025-11-15T12:00:00Z', description: 'Date of the expense' })
  @IsDateString()
  date: string;

  @ApiProperty({
    example: 'yape',
    enum: ['yape', 'plin', 'transferencia', 'efectivo', 'tarjeta', 'otro'],
    description: 'Payment method used',
  })
  @IsIn(['yape', 'plin', 'transferencia', 'efectivo', 'tarjeta', 'otro'])
  paymentMethod: 'yape' | 'plin' | 'transferencia' | 'efectivo' | 'tarjeta' | 'otro';

  @ApiPropertyOptional({ example: 'Restaurant El Buen Sabor', description: 'Merchant name' })
  @IsOptional()
  @IsString()
  merchant?: string;

  @ApiPropertyOptional({ example: 'REF-123456', description: 'Transaction reference number' })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional({ example: 'https://...', description: 'URL of receipt image' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Extracted data from receipt' })
  @IsOptional()
  extractedData?: {
    rawText?: string;
    fields?: Record<string, any>;
  };

  @ApiPropertyOptional({ example: 0.95, description: 'Confidence score of extraction' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  confidence?: number;

  @ApiPropertyOptional({ example: false, description: 'Whether expense is verified' })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}
