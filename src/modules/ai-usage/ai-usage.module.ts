import { Module, Global } from '@nestjs/common';
import { UsageService } from './usage.service';
import { QuotaService } from './quota.service';
import { VendorCostService } from './vendor-cost.service';
import { AiUsageController } from './ai-usage.controller';

/**
 * Módulo global de consumo IA.
 *  - Fase 1: `UsageService` (tracking).
 *  - Fase 2: `QuotaService` (enforcement) + `GET /api/ai-usage/me`.
 *  - Admin: config de cuota, ajuste por usuario y `VendorCostService`
 *    (costo real facturado de Anthropic/OpenAI).
 * `FirebaseService`/`ConfigService` son globales.
 */
@Global()
@Module({
  controllers: [AiUsageController],
  providers: [UsageService, QuotaService, VendorCostService],
  exports: [UsageService, QuotaService],
})
export class AiUsageModule {}
