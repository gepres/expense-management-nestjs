import { IsEnum, IsBoolean, IsInt, Min, Max, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportOptionsDto {
  @ApiPropertyOptional({
    description: 'Tamaño del lote para procesamiento (50-500)',
    example: 100,
    default: 100,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(50)
  @Max(500)
  batchSize?: number = 100;

  @ApiPropertyOptional({
    description: 'Omitir gastos duplicados durante la importación',
    example: true,
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  skipDuplicates?: boolean = true;

  @ApiPropertyOptional({
    description: 'Usar IA para categorizar automáticamente los gastos',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  autoCategorizate?: boolean = false;

  @ApiPropertyOptional({
    description: 'Solo validar sin importar los datos',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  validateOnly?: boolean = false;
}

export class UploadFileDto extends ImportOptionsDto {
  @ApiPropertyOptional({
    description: 'Formato del archivo (opcional, se detecta automáticamente si no se envía)',
    enum: ['excel', 'json'],
    example: 'excel',
  })
  @IsOptional()
  @IsEnum(['excel', 'json'])
  format?: 'excel' | 'json';
}
