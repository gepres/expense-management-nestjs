/**
 * Servicio de tipo de cambio para transferencias programadas cross-currency.
 *
 * Usa la API pública Frankfurter (https://www.frankfurter.app/), gratuita y
 * sin API key, basada en datos del European Central Bank.
 *
 * Tiene un cache en memoria de 1 hora por par de monedas para no consultar
 * en cada disparo del cron.
 */

import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry {
  rate: number;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
const FRANKFURTER_URL = 'https://api.frankfurter.app/latest';

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * Devuelve la tasa actual `from → to`. Lanza si la API falla y no hay
   * fallback en cache. El cron decide qué hacer con el error.
   */
  async getRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    const key = `${from}:${to}`;
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.rate;
    }

    const url = `${FRANKFURTER_URL}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch (err) {
      this.logger.error(
        `Frankfurter fetch falló (${from}→${to}): ${err instanceof Error ? err.message : String(err)}`,
      );
      if (cached) {
        this.logger.warn(
          `Usando cache stale para ${key} (edad=${Math.round((now - cached.fetchedAt) / 1000)}s)`,
        );
        return cached.rate;
      }
      throw new Error(
        `No se pudo obtener tasa ${from}→${to}: API de tipo de cambio no responde`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Frankfurter respondió ${response.status} al pedir ${from}→${to}`,
      );
    }

    const data = (await response.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];
    if (typeof rate !== 'number' || rate <= 0) {
      throw new Error(
        `Frankfurter no devolvió tasa válida para ${from}→${to}: ${JSON.stringify(data)}`,
      );
    }

    this.cache.set(key, { rate, fetchedAt: now });
    this.logger.log(`Tasa actualizada ${from}→${to}: ${rate}`);
    return rate;
  }
}
