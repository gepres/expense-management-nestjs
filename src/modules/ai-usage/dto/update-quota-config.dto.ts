import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Reemplazo completo de los límites de cuota IA por rol. Lo escribe el
 * admin desde el panel; el backend lo persiste en `appConfig/aiQuota` y
 * `QuotaService` lo usa con prioridad sobre los env `AI_QUOTA_*`.
 */
export class UpdateQuotaConfigDto {
  @ApiProperty({ description: 'Tokens/mes para rol standard', example: 100000 })
  @IsInt()
  @Min(0)
  standardTokens: number;

  @ApiProperty({ description: 'Tokens/mes para rol pro', example: 2000000 })
  @IsInt()
  @Min(0)
  proTokens: number;

  @ApiProperty({
    description: 'Tokens/mes para el trial promocional',
    example: 80000,
  })
  @IsInt()
  @Min(0)
  promocionalTokens: number;

  @ApiProperty({ description: 'Imágenes IA/mes para rol standard', example: 0 })
  @IsInt()
  @Min(0)
  standardImages: number;

  @ApiProperty({ description: 'Imágenes IA/mes para rol pro', example: 50 })
  @IsInt()
  @Min(0)
  proImages: number;

  @ApiProperty({
    description: 'Imágenes IA/mes para el trial promocional',
    example: 2,
  })
  @IsInt()
  @Min(0)
  promocionalImages: number;

  @ApiProperty({
    description: 'Duración por defecto del trial promocional (días)',
    example: 15,
  })
  @IsInt()
  @Min(1)
  @Max(365)
  promocionalDays: number;

  @ApiProperty({ description: 'Umbral de aviso (%)', example: 80 })
  @IsInt()
  @Min(1)
  @Max(100)
  warnPct: number;
}
