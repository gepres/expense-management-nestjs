import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';
import { UsageEventsService } from './usage-events.service';
import { TrackEventDto } from './dto/track-event.dto';
import { SessionEndDto } from './dto/session-end.dto';

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

  @Get('admin/overview')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Overview mensual de eventos (admin)',
    description:
      'Contadores del rollup mensual (recurrentes, funnels, etc.) + gastos ' +
      'por canal de origen. `?mes=YYYY-MM` (default: mes en curso).',
  })
  @ApiResponse({ status: 200, description: 'Overview mensual' })
  async overview(@Query('mes') mes?: string) {
    return this.usageEvents.getOverview(mes);
  }

  // --- Beacons del cliente (cualquier usuario autenticado) ---

  @Post('track')
  @ApiOperation({
    summary: 'Registrar un evento de funnel (cliente)',
    description: 'Beacon de UI. Solo eventos de la allowlist client.',
  })
  @ApiResponse({ status: 201, description: 'Evento registrado' })
  async track(@CurrentUser() user: FirebaseUser, @Body() dto: TrackEventDto) {
    await this.usageEvents.trackClient(dto.event, user.uid);
    return { ok: true };
  }

  @Post('session-end')
  @ApiOperation({
    summary: 'Resumen de sesión de navegación (cliente)',
    description:
      'Page-views por ruta + métricas de sesión (bounce/duración). Rutas ' +
      'validadas contra la allowlist.',
  })
  @ApiResponse({ status: 201, description: 'Sesión registrada' })
  async sessionEnd(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: SessionEndDto,
  ) {
    await this.usageEvents.trackSession(dto, user.uid);
    return { ok: true };
  }
}
