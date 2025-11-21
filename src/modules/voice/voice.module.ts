import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { AnthropicModule } from '../anthropic/anthropic.module';

@Module({
  imports: [AnthropicModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
