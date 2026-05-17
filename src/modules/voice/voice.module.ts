import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { InferenceModule } from '../inference/inference.module';

@Module({
  imports: [AnthropicModule, InferenceModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
