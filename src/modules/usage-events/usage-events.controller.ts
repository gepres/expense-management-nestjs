import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { UsageEventsService } from './usage-events.service';

/**
 * Diagnóstico de uso (analítica de flujos) — solo admin.
 * Fase 0: snapshot agregado de colecciones existentes.
 */
@ApiTags('Usage Events')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('usage-events')
export class UsageEventsController {
  constructor(private readonly usageEvents: UsageEventsService) {}

  @Get('admin/snapshot')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Snapshot de diagnóstico de uso (admin)',
    description:
      'Métricas derivables (gastos, recurrentes, bot, chat, grupos, etc.) ' +
      'vía count() aggregation. Caché 5 min; `?force=true` lo recalcula.',
  })
  @ApiResponse({ status: 200, description: 'Snapshot de diagnóstico' })
  async snapshot(@Query('force') force?: string) {
    return this.usageEvents.getSnapshot(force === 'true');
  }
}
