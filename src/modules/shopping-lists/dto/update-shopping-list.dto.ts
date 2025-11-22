import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateShoppingListDto {
  @ApiPropertyOptional({ description: 'Nombre de la lista', example: 'Lista Actualizada' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Presupuesto estimado', example: 200.0 })
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiPropertyOptional({ description: 'Fecha de compra', example: '2023-10-28' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: 'Hora de compra', example: '10:00' })
  @IsOptional()
  @IsString()
  time?: string;

  @ApiPropertyOptional({ description: 'Categoría', example: 'Alimentación' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Subcategoría', example: 'Mercado' })
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiPropertyOptional({ description: 'Método de pago', example: 'credit_card_id' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Moneda', example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ 
    description: 'Estado de la lista', 
    example: 'active',
    enum: ['active', 'completed', 'archived']
  })
  @IsOptional()
  @IsEnum(['active', 'completed', 'archived'])
  status?: 'active' | 'completed' | 'archived';
}
