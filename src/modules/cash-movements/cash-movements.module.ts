import { Module } from '@nestjs/common';
import { CashMovementsController } from './cash-movements.controller';
import { CashMovementsService } from './cash-movements.service';

@Module({
  controllers: [CashMovementsController],
  providers: [CashMovementsService],
  exports: [CashMovementsService],
})
export class CashMovementsModule {}
