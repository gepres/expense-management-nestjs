import {
  IsString,
  IsOptional,
  MinLength,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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

export class CreateCategoryDto {
  @ApiProperty({ example: 'alimentacion' })
  @IsString()
  @MinLength(1)
  id: string;

  @ApiProperty({ example: 'Alimentación' })
  @IsString()
  @MinLength(1)
  nombre: string;

  @ApiPropertyOptional({ example: '🍔' })
  @IsOptional()
  @IsString()
  icono?: string;

  @ApiPropertyOptional({ example: '#FF6B6B' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    example: 'Gastos relacionados con comida y bebidas',
  })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({
    type: [CreateSubcategoryDto],
    example: [
      {
        id: 'supermercado',
        nombre: 'Supermercado',
        descripcion: 'Compras de abarrotes',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubcategoryDto)
  subcategorias?: CreateSubcategoryDto[];
}
