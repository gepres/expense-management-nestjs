import { Module, Global } from '@nestjs/common';
import { OpenAiImageService } from './openai-image.service';

/**
 * Módulo global de OpenAI (solo imágenes, opcional). Mismo patrón que
 * `AnthropicModule`.
 */
@Global()
@Module({
  providers: [OpenAiImageService],
  exports: [OpenAiImageService],
})
export class OpenAiModule {}
