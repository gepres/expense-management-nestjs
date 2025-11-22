import { IsString, IsNumber, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShoppingListItemDto {
  @ApiProperty({ description: 'Nombre del producto', example: 'Leche' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Cantidad', example: 2, default: 1 })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Precio unitario', example: 6.25, default: 0 })
  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @ApiProperty({ description: 'Monto total', example: 12.50 })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({ description: 'Categoría del producto', example: 'Lácteos' })
  @IsOptional()
  @IsString()
  category?: string;
}
