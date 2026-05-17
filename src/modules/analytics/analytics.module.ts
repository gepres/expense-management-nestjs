import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ExpensesModule } from '../expenses/expenses.module';

/**
 * Métricas PRO. `AnthropicService` y `FirebaseService` son globales;
 * `ExpensesService` se obtiene importando `ExpensesModule`.
 */
@Module({
  imports: [ExpensesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
