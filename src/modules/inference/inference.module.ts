import { Module } from '@nestjs/common';
import { InferenceService } from './inference.service';
import { LearningLogService } from './learning-log.service';
import { CategoriesModule } from '../categories/categories.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';

// AnthropicModule y FirebaseModule son @Global() → se inyectan sin importar.
@Module({
  imports: [CategoriesModule, PaymentMethodsModule],
  providers: [InferenceService, LearningLogService],
  exports: [InferenceService],
})
export class InferenceModule {}
