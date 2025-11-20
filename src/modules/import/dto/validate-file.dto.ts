import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ValidateFileDto {
  @ApiPropertyOptional({
    description: 'Formato del archivo (opcional, se detecta automáticamente)',
    enum: ['excel', 'json'],
    example: 'excel',
  })
  @IsOptional()
  @IsEnum(['excel', 'json'])
  format?: 'excel' | 'json';
}
