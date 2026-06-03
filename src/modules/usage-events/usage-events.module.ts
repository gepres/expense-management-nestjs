import { Module, Global } from '@nestjs/common';
import { UsageEventsService } from './usage-events.service';
import { UsageEventsController } from './usage-events.controller';

/**
 * Módulo global de analítica de flujos / diagnóstico de producto.
 *  - Fase 0: `GET /usage-events/admin/snapshot` (métricas derivables).
 *  - Fase 1: `track()` (rollups) + instrumentación + overview.
 *  - Fase 2: beacon client (`POST /track`, `/session-end`).
 * `@Global` para inyectar `UsageEventsService` en cualquier módulo sin importarlo.
 */
@Global()
@Module({
  controllers: [UsageEventsController],
  providers: [UsageEventsService],
  exports: [UsageEventsService],
})
export class UsageEventsModule {}
