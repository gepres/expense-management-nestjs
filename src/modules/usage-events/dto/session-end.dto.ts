import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Resumen de una sesión de navegación (enviado en `visibilitychange`).
 * Las rutas se validan contra la allowlist en el backend.
 */
export class SessionEndDto {
  @ApiProperty({
    description: 'Vistas por ruta normalizada { ruta: conteo }',
    example: { dashboard: 3, gastos: 2 },
  })
  @IsObject()
  views: Record<string, number>;

  @ApiProperty({ description: 'Total de vistas en la sesión', example: 5 })
  @IsInt()
  @Min(0)
  totalViews: number;

  @ApiProperty({ description: 'Duración de la sesión (ms)', example: 124000 })
  @IsInt()
  @Min(0)
  durationMs: number;

  @ApiPropertyOptional({ description: 'Ruta de entrada' })
  @IsOptional()
  @IsString()
  entryRoute?: string;

  @ApiPropertyOptional({ description: 'Ruta de salida' })
  @IsOptional()
  @IsString()
  exitRoute?: string;
}
