import { Module, Global } from '@nestjs/common';
import { UsageService } from './usage.service';

/**
 * Módulo global de consumo IA (Fase 1: tracking). `FirebaseService` y
 * `ConfigService` son globales, así que solo expone `UsageService`.
 * Mismo patrón que `AnthropicModule`.
 */
@Global()
@Module({
  providers: [UsageService],
  exports: [UsageService],
})
export class AiUsageModule {}
