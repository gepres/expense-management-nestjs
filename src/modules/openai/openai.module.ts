import { Module, Global } from '@nestjs/common';
import { OpenAiImageService } from './openai-image.service';
import { OpenAiTranscriptionService } from './openai-transcription.service';

/**
 * Módulo global de OpenAI (imágenes + transcripción de audio, opcional).
 * Mismo patrón que `AnthropicModule`.
 */
@Global()
@Module({
  providers: [OpenAiImageService, OpenAiTranscriptionService],
  exports: [OpenAiImageService, OpenAiTranscriptionService],
})
export class OpenAiModule {}
