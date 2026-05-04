import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const VOUCHER_TYPES = ['boleta', 'factura', 'recibo', 'ticket', 'nota-debito', 'nota-credito'] as const;
const REIMBURSEMENT_STATUSES = ['pending', 'approved', 'rejected', 'paid'] as const;

/**
 * DTO para crear un gasto.
 *
 * Todos los nombres en español para coincidir con el modelo de datos en
 * Firestore y el frontend (que ya estaba en español).
 */
export class CreateExpenseDto {
  @ApiProperty({
    description: 'ID de la cuenta de la que sale el dinero',
    example: 'acc_abc123',
  })
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @ApiProperty({ description: 'Monto del gasto', example: 50.0 })
  @IsNumber()
  @Min(0.01)
  monto: number;

  @ApiProperty({ description: 'Fecha del gasto (ISO)', example: '2026-04-28T12:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  fecha: string;

  @ApiProperty({ description: 'Categoría', example: 'alimentacion' })
  @IsString()
  @IsNotEmpty()
  categoria: string;

  @ApiPropertyOptional({ description: 'Subcategoría', example: 'restaurantes' })
  @IsOptional()
  @IsString()
  subcategoria?: string;

  @ApiProperty({
    description: 'Método de pago. Si es "efectivo" descuenta cashBalance, sino bankBalance.',
    example: 'yape',
  })
  @IsString()
  @IsNotEmpty()
  metodoPago: string;

  @ApiProperty({ description: 'Moneda (ISO)', example: 'PEN' })
  @IsString()
  @IsNotEmpty()
  moneda: string;

  @ApiPropertyOptional({ description: 'Descripción del gasto' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Comercio o lugar', example: 'Restaurante X' })
  @IsOptional()
  @IsString()
  comercio?: string;

  @ApiPropertyOptional({ description: 'Etiquetas', example: ['trabajo'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Es recurrente', default: false })
  @IsOptional()
  @IsBoolean()
  recurrente?: boolean;

  @ApiPropertyOptional({ description: 'ID de lista de compras asociada' })
  @IsOptional()
  @IsString()
  shoppingListId?: string;

  // Información tributaria (opcional)

  @ApiPropertyOptional({ enum: VOUCHER_TYPES, example: 'boleta' })
  @IsOptional()
  @IsString()
  @IsIn(VOUCHER_TYPES as unknown as string[])
  voucherType?: string;

  @ApiPropertyOptional({ description: 'Número de boleta/factura' })
  @IsOptional()
  @IsString()
  voucherNumber?: string;

  @ApiPropertyOptional({ description: 'RUC del emisor' })
  @IsOptional()
  @IsString()
  ruc?: string;

  @ApiPropertyOptional({ description: 'IGV (impuesto)' })
  @IsOptional()
  @IsNumber()
  igv?: number;

  @ApiPropertyOptional({ description: 'Subtotal antes de impuestos' })
  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @ApiPropertyOptional({ enum: REIMBURSEMENT_STATUSES })
  @IsOptional()
  @IsString()
  @IsIn(REIMBURSEMENT_STATUSES as unknown as string[])
  reimbursementStatus?: string;
}
