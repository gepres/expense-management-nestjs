import { registerAs } from '@nestjs/config';

/**
 * Configuración de Anthropic.
 *
 * - `model`: modelo general (chat, recibos, categorización). Claude 4.x moderno.
 * - `analyticsModel`: modelo dedicado al análisis de métricas/insights. Se
 *   configura aparte para poder ajustar costo/calidad (p.ej. Haiku para bajar
 *   costo, Opus para más profundidad) sin afectar el resto de la app.
 *
 * Ambos son configurables por variables de entorno.
 */
export default registerAs('anthropic', () => ({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  analyticsModel:
    process.env.ANTHROPIC_ANALYTICS_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    'claude-sonnet-4-6',
}));
