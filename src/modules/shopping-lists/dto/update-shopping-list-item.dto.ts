import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateShoppingListItemDto {
  @ApiPropertyOptional({ description: 'Nombre del producto', example: 'Pan Integral' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Estado de marcado', example: true })
  @IsOptional()
  @IsBoolean()
  checked?: boolean;

  @ApiPropertyOptional({ description: 'Cantidad', example: 2 })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Precio unitario', example: 5.50 })
  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'Monto total', example: 11.00 })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Categoría del producto', example: 'Panadería' })
  @IsOptional()
  @IsString()
  category?: string;
}
