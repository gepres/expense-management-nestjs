import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubcategoryDto {
  @ApiProperty({ example: 'supermercado' })
  @IsString()
  @MinLength(1)
  id: string;

  @ApiProperty({ example: 'Supermercado' })
  @IsString()
  @MinLength(1)
  nombre: string;

  @ApiPropertyOptional({ example: 'Compras de abarrotes y productos básicos' })
  @IsOptional()
  @IsString()
  descripcion?: string;
}
