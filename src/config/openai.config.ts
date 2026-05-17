import { registerAs } from '@nestjs/config';

/**
 * Configuración de OpenAI (solo para generación de imágenes del roast,
 * fase-2 de Métricas). Opcional: si `apiKey` está vacío, el endpoint
 * `/analytics/ai-image` queda deshabilitado y el frontend oculta el botón.
 */
export default registerAs('openai', () => ({
  apiKey: process.env.OPENAI_API_KEY || '',
  imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
}));
