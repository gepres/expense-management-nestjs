import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseDto {
  @ApiProperty({ description: 'Monto del gasto', example: 50.0 })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ description: 'Concepto o título', example: 'Almuerzo' })
  @IsString()
  @IsNotEmpty()
  concept: string;

  @ApiProperty({ description: 'Fecha del gasto (ISO)', example: '2024-11-20T12:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ description: 'Categoría', example: 'Alimentación' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ description: 'Subcategoría', example: 'Restaurantes' })
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiProperty({ description: 'Método de pago', example: 'Tarjeta Crédito' })
  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @ApiProperty({ description: 'Moneda', example: 'PEN', default: 'PEN' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ description: 'Comercio o lugar', example: 'Restaurante X' })
  @IsOptional()
  @IsString()
  merchant?: string;

  @ApiPropertyOptional({ description: 'Descripción detallada' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Etiquetas', example: ['trabajo'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Es recurrente', default: false })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional({ description: 'ID de lista de compras asociada' })
  @IsOptional()
  @IsString()
  shoppingListId?: string;
}
