import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { UsageService } from '../ai-usage/usage.service';
import { UsageContext } from '../ai-usage/interfaces/ai-usage.interface';

/**
 * Generación de imágenes vía OpenAI (`gpt-image-1`).
 * Solo se usa para la ilustración IA del roast de Métricas (fase-2).
 *
 * Es OPCIONAL: si no hay `OPENAI_API_KEY`, `enabled` es false y el resto
 * de la app funciona igual (el frontend oculta el botón).
 */
@Injectable()
export class OpenAiImageService {
  private readonly logger = new Logger(OpenAiImageService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly usageService: UsageService,
  ) {
    const apiKey = this.configService.get<string>('openai.apiKey');
    this.model =
      this.configService.get<string>('openai.imageModel') || 'gpt-image-1';

    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.logger.log(
      `OpenAI image service ${this.client ? 'initialized' : 'DISABLED (no OPENAI_API_KEY)'}`,
    );
  }

  /** True si hay API key configurada. */
  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * Genera una imagen a partir del prompt. Devuelve un data URL PNG
   * (`data:image/png;base64,...`) listo para mostrar/compartir.
   */
  async generate(
    prompt: string,
    usageCtx?: Partial<UsageContext>,
  ): Promise<string> {
    if (!this.client) {
      throw new BadRequestException(
        'La ilustración IA no está configurada (OPENAI_API_KEY).',
      );
    }

    try {
      const res = await this.client.images.generate({
        model: this.model,
        prompt,
        size: '1024x1024',
        quality: 'medium',
        n: 1,
      });

      const b64 = res.data?.[0]?.b64_json;
      if (!b64) {
        throw new ServiceUnavailableException('OpenAI no devolvió imagen.');
      }

      // Registro de consumo (best-effort): imágenes no devuelven tokens.
      void this.usageService.record({
        provider: 'openai',
        model: this.model,
        units: 1,
        unitType: 'image',
        userId: usageCtx?.userId ?? null,
        scope: usageCtx?.scope ?? 'app',
        feature: usageCtx?.feature ?? 'metrics_image',
      });

      return `data:image/png;base64,${b64}`;
    } catch (error) {
      // Re-lanzar nuestras propias excepciones (p.ej. "no devolvió imagen").
      if (error instanceof HttpException) throw error;

      // Importante: NO dejar que un 401 de OpenAI se propague como HTTP 401,
      // porque el frontend lo confundiría con "sesión expirada" (auth Firebase).
      if (error instanceof OpenAI.APIError) {
        this.logger.error(
          `OpenAI images error ${error.status} ${error.code}: ${error.message}`,
        );
        if (error.status === 401) {
          throw new BadRequestException(
            'La OPENAI_API_KEY configurada es inválida. Debe ser una clave secreta que empieza con "sk-" (no el Project ID "proj-"). Genérala en platform.openai.com/api-keys y reinicia el backend.',
          );
        }
        if (error.status === 403) {
          throw new BadRequestException(
            'OpenAI rechazó la solicitud (403). Verifica que tu organización tenga acceso a generación de imágenes (verificación de identidad completada).',
          );
        }
        if (error.status === 429) {
          throw new ServiceUnavailableException(
            'OpenAI sin cuota/crédito o límite excedido. Revisa el plan/billing de tu cuenta OpenAI.',
          );
        }
        throw new ServiceUnavailableException(
          `No se pudo generar la imagen IA (OpenAI: ${error.message}).`,
        );
      }

      this.logger.error('Error inesperado generando imagen IA', error as Error);
      throw new ServiceUnavailableException(
        'No se pudo generar la imagen IA. Intenta de nuevo.',
      );
    }
  }
}
