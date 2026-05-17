/**
 * Contrato de consumo IA (Fase 1: tracking).
 *
 * `scope`:
 *  - `app`  → consumo autogenerado por el aplicativo (autocategorización,
 *             sugerencias de importación, etc.). NO cuenta para cuota.
 *  - `user` → consumo iniciado por el usuario (asistente, métricas IA,
 *             imagen IA, voz, OCR de recibo, bot WhatsApp). Contará para
 *             cuota en Fase 2.
 */
export type UsageScope = 'app' | 'user';

export type UsageProvider = 'anthropic' | 'openai';

/** Contexto que cada call site pasa explícitamente (no se infiere). */
export interface UsageContext {
  userId?: string | null;
  scope: UsageScope;
  feature: string;
}

export interface RecordUsageParams extends UsageContext {
  provider: UsageProvider;
  model: string;
  /** Tokens reales (Anthropic). */
  inputTokens?: number;
  outputTokens?: number;
  /** Para proveedores sin tokens: nº de imágenes o segundos de audio. */
  units?: number;
  unitType?: 'image' | 'audio_seconds';
  status?: 'ok' | 'error';
  meta?: Record<string, unknown>;
}

/**
 * Rollups (top-level, write bloqueado al cliente):
 *  - `aiUsageMonthly/{uid}_{YYYY-MM}` (scope user) — campo `userId` + `mes`.
 *  - `aiUsageAppMonthly/{YYYY-MM}`    (scope app).
 */

/** Documento `aiUsageEvents/{id}` (auditoría, 1 por llamada). */
export interface AiUsageEvent extends RecordUsageParams {
  totalTokens: number;
  estimatedCostUsd: number;
  repo: 'backend' | 'functions';
  mes: string; // YYYY-MM (UTC)
}
