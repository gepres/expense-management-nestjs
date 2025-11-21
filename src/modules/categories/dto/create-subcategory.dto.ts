import { IsString, IsOptional, MinLength, IsArray } from 'class-validator';
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

  @ApiPropertyOptional({ example: ['Leche', 'Pan'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestions_ideas?: string[];
}
