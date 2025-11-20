import { IsString, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportExpenseDto {
  @ApiProperty({
    description: 'Fecha del gasto en formato ISO 8601 o DD/MM/YYYY',
    example: '2024-11-15',
  })
  @IsDateString()
  fecha: string;

  @ApiProperty({
    description: 'Monto del gasto (debe ser positivo)',
    example: 45.50,
  })
  @IsNumber()
  @Min(0.01)
  monto: number;

  @ApiProperty({
    description: 'Concepto o descripción breve del gasto',
    example: 'Almuerzo en restaurante',
  })
  @IsString()
  concepto: string;

  @ApiPropertyOptional({
    description: 'Categoría del gasto',
    example: 'Alimentación',
  })
  @IsOptional()
  @IsString()
  categoria?: string;

  @ApiPropertyOptional({
    description: 'Subcategoría del gasto',
    example: 'Restaurantes',
  })
  @IsOptional()
  @IsString()
  subcategoria?: string;

  @ApiPropertyOptional({
    description: 'Método de pago utilizado',
    example: 'Tarjeta de Crédito',
  })
  @IsOptional()
  @IsString()
  metodoPago?: string;

  @ApiPropertyOptional({
    description: 'Código de moneda (ISO 4217)',
    example: 'PEN',
  })
  @IsOptional()
  @IsString()
  moneda?: string;

  @ApiPropertyOptional({
    description: 'Nombre del comercio o establecimiento',
    example: 'Restaurant El Buen Sabor',
  })
  @IsOptional()
  @IsString()
  comercio?: string;

  @ApiPropertyOptional({
    description: 'Descripción adicional del gasto',
    example: 'Reunión de trabajo con cliente',
  })
  @IsOptional()
  @IsString()
  descripcion?: string;
}
