import { Module } from '@nestjs/common';
import { InferenceService } from './inference.service';
import { CategoriesModule } from '../categories/categories.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';

// AnthropicModule es @Global() → AnthropicService se inyecta sin importar.
@Module({
  imports: [CategoriesModule, PaymentMethodsModule],
  providers: [InferenceService],
  exports: [InferenceService],
})
export class InferenceModule {}
