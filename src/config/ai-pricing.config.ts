import { registerAs } from '@nestjs/config';

/**
 * Tarifas para ESTIMAR el costo de consumo IA (best-effort, no facturación).
 *
 * - Anthropic devuelve tokens reales → costo = tokens × tarifa/1M.
 * - OpenAI imágenes / Whisper no devuelven tokens → costo por unidad fija.
 *
 * Todo configurable por env. Defaults razonables para los modelos actuales.
 */
export default registerAs('aiPricing', () => ({
  anthropicInputPer1M: Number(
    process.env.AI_PRICE_ANTHROPIC_INPUT_PER_1M ?? 3,
  ),
  anthropicOutputPer1M: Number(
    process.env.AI_PRICE_ANTHROPIC_OUTPUT_PER_1M ?? 15,
  ),
  /** USD por imagen generada (gpt-image-1, calidad media ≈ 0.04). */
  openaiImageUsd: Number(process.env.AI_PRICE_OPENAI_IMAGE_USD ?? 0.04),
  /** USD por minuto de audio transcrito (Whisper ≈ 0.006). */
  whisperPerMinUsd: Number(process.env.AI_PRICE_WHISPER_PER_MIN_USD ?? 0.006),
}));
