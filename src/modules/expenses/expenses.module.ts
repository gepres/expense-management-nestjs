import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { AnthropicModule } from '../anthropic/anthropic.module';

@Module({
  imports: [FirebaseModule, AnthropicModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
