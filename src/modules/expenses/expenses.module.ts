import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExternalBalanceCron } from './external-balance.cron';
import { FirebaseModule } from '../firebase/firebase.module';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { PresupuestosModule } from '../presupuestos/presupuestos.module';
import { InferenceModule } from '../inference/inference.module';

@Module({
  imports: [
    FirebaseModule,
    AnthropicModule,
    PresupuestosModule,
    InferenceModule,
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExternalBalanceCron],
  exports: [ExpensesService],
})
export class ExpensesModule {}
