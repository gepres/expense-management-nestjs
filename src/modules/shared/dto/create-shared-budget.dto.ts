import {
  IsNumber,
  IsNotEmpty,
  IsString,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSharedBudgetDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({ example: 'PEN' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Aporte inicial' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'contribution' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'yape' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: '2025-11-26' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: '23:45:52' })
  @IsOptional()
  @IsString()
  time?: string;

  @ApiPropertyOptional({ example: 'Factura' })
  @IsOptional()
  @IsString()
  voucherType?: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  voucherNumber?: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  ruc?: string;

  @ApiPropertyOptional({
    example: 'https://firebasestorage.googleapis.com/...',
    description:
      'URL pública de la foto del comprobante. null para limpiarla en update.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  receiptUrl?: string | null;

  @ApiPropertyOptional({
    example: 'shared-groups/{groupId}/budgets/{uid}_{ts}.jpg',
    description:
      'Path interno en Firebase Storage. null para limpiarlo en update.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  receiptPath?: string | null;
}
