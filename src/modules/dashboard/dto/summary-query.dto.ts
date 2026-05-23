import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type DashboardRange = 'today' | 'yesterday' | 'week' | 'month';

export const DASHBOARD_RANGES: DashboardRange[] = [
  'today',
  'yesterday',
  'week',
  'month',
];

export class SummaryQueryDto {
  @ApiPropertyOptional({
    enum: DASHBOARD_RANGES,
    default: 'today',
    description:
      'Rango temporal del resumen. Calculado en la zona horaria del usuario (default America/Lima).',
  })
  @IsOptional()
  @IsIn(DASHBOARD_RANGES)
  range?: DashboardRange = 'today';
}
