import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [AnthropicModule, ExpensesModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
