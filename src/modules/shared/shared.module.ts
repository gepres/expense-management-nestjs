import { Module } from '@nestjs/common';
import { SharedController } from './shared.controller';
import { SharedService } from './shared.service';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';

@Module({
  imports: [AnthropicModule, AiUsageModule],
  controllers: [SharedController],
  providers: [SharedService],
})
export class SharedModule {}
