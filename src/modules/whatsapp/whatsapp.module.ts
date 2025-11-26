import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappQueueController } from './whatsapp-queue.controller';
import { WhatsappService } from './whatsapp.service';
import { ConfigModule } from '@nestjs/config';
import { FirebaseModule } from '../firebase/firebase.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { CategoriesModule } from '../categories/categories.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';

@Module({
  imports: [
    ConfigModule,
    FirebaseModule,
    ExpensesModule,
    CategoriesModule,
    PaymentMethodsModule,
  ],
  controllers: [WhatsappController, WhatsappQueueController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
