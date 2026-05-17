import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Ajuste de cuota IA de un usuario para el mes en curso. NO toca el
 * rollup de tracking (`aiUsageMonthly`) — escribe un doc aparte
 * (`aiQuotaAdjust/{uid}_{mes}.bonusTokens`) que el cálculo de cuota suma
 * al límite del rol. Así el costo/analytics quedan intactos.
 *
 *  - `reset`: perdona el consumo del mes (remaining vuelve al límite del rol).
 *  - `bonus`: suma `tokens` extra al límite de este mes.
 */
export class AdjustQuotaDto {
  @ApiProperty({ description: 'UID del usuario' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: ['reset', 'bonus'] })
  @IsIn(['reset', 'bonus'])
  mode: 'reset' | 'bonus';

  @ApiPropertyOptional({
    description: 'Tokens extra (requerido si mode=bonus)',
    example: 500000,
  })
  @ValidateIf((o) => o.mode === 'bonus')
  @IsInt()
  @Min(1)
  tokens?: number;

  @ApiPropertyOptional({ description: 'Nota interna del ajuste' })
  @IsOptional()
  @IsString()
  note?: string;
}
