import { Module } from '@nestjs/common';
import { UsageEventsService } from './usage-events.service';
import { UsageEventsController } from './usage-events.controller';

/**
 * Módulo de analítica de flujos / diagnóstico de producto.
 *  - Fase 0: `GET /usage-events/admin/snapshot` (métricas derivables).
 *  - Fases 1-2 (futuro): rollups de eventos (`track`) + endpoints overview/daily.
 * `FirebaseService` es global.
 */
@Module({
  controllers: [UsageEventsController],
  providers: [UsageEventsService],
  exports: [UsageEventsService],
})
export class UsageEventsModule {}
