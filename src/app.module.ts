import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/env.validation';
import firebaseConfig from './config/firebase.config';
import anthropicConfig from './config/anthropic.config';
import cloudinaryConfig from './config/cloudinary.config';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { AnthropicModule } from './modules/anthropic/anthropic.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ChatModule } from './modules/chat/chat.module';
import { ImportModule } from './modules/import/import.module';
import { ShortcutsModule } from './modules/shortcuts/shortcuts.module';
import { VoiceModule } from './modules/voice/voice.module';
import { SharedModule } from './modules/shared/shared.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: [firebaseConfig, anthropicConfig, cloudinaryConfig],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'scan',
        ttl: 60000,
        limit: 10,
      },
      {
        name: 'ai',
        ttl: 60000,
        limit: 20,
      },
    ]),
    FirebaseModule,
    AnthropicModule,
    UsersModule,
    CategoriesModule,
    ReceiptsModule,
    PaymentMethodsModule,
    CurrenciesModule,
    ExpensesModule,
    ChatModule,
    ImportModule,
    ShortcutsModule,
    VoiceModule,
    SharedModule,
    WhatsappModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
