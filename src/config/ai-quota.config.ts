import { registerAs } from '@nestjs/config';

/**
 * Cuotas de consumo IA por usuario/mes (Fase 2: enforcement).
 *
 * Solo el consumo `scope: 'user'` cuenta. `admin` = ilimitado (no aparece
 * acá). Bloqueo duro al 100%, aviso al `warnPct`%. Reset natural por mes.
 * Todo configurable por env.
 */
export default registerAs('aiQuota', () => ({
  standardTokens: Number(process.env.AI_QUOTA_STANDARD_TOKENS ?? 100000),
  proTokens: Number(process.env.AI_QUOTA_PRO_TOKENS ?? 2000000),
  /**
   * Trial "promocional": acceso PRO acotado durante N días para usuarios
   * recién creados. Al vencer se degrada a `standard`.
   */
  promocionalTokens: Number(process.env.AI_QUOTA_PROMOCIONAL_TOKENS ?? 80000),
  /** Sub-límite duro de imágenes IA/mes (caras). */
  standardImages: Number(process.env.AI_QUOTA_STANDARD_IMAGES ?? 0),
  proImages: Number(process.env.AI_QUOTA_PRO_IMAGES ?? 50),
  promocionalImages: Number(process.env.AI_QUOTA_PROMOCIONAL_IMAGES ?? 2),
  /** Duración por defecto del trial promocional (días). */
  promocionalDays: Number(process.env.AI_QUOTA_PROMOCIONAL_DAYS ?? 15),
  /** Umbral de aviso (porcentaje). */
  warnPct: Number(process.env.AI_QUOTA_WARN_PCT ?? 80),
}));
