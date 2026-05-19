import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShortcutDto {
  @ApiProperty({
    description: 'Nombre del atajo',
    example: 'Almuerzo Diario',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Icono del atajo (emoji o identificador)',
    example: '🍔',
  })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Categoría del gasto',
    example: 'Alimentación',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Subcategoría del gasto',
    example: 'Restaurantes',
  })
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiPropertyOptional({
    description: 'Monto del gasto',
    example: 15.5,
  })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Moneda del gasto',
    example: 'PEN',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description: 'Método de pago',
    example: 'Tarjeta Crédito',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({
    description: 'Descripción del gasto',
    example: 'Menú ejecutivo',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Etiquetas del gasto',
    example: ['trabajo', 'almuerzo'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Indica si es un gasto recurrente',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
}
