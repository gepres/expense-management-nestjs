import { Injectable, Logger } from '@nestjs/common';

/**
 * Costo REAL facturado por la organización en cada proveedor, leído de
 * sus Cost APIs oficiales (admin). NO es saldo restante (ningún vendor
 * lo expone por API) — es el gasto del periodo.
 *
 *  - Anthropic: `GET /v1/organizations/cost_report` (header `x-api-key`
 *    con la Admin API key; `anthropic-version: 2023-06-01`).
 *  - OpenAI:    `GET /v1/organization/costs` (Bearer con la Admin key).
 *
 * Ambas son OPCIONALES: sin Admin key → `enabled:false` y el panel cae
 * al costo estimado + link a la consola. Best-effort: nunca lanza.
 */

export interface ProviderCost {
  /** Hay Admin key configurada para este proveedor. */
  enabled: boolean;
  /** Gasto total del mes en USD (si se pudo leer). */
  amountUsd?: number;
  /** Mensaje si la lectura falló (con `enabled:true`). */
  error?: string;
}

export interface VendorCost {
  mes: string;
  anthropic: ProviderCost;
  openai: ProviderCost;
  /** Recordatorio: es gasto facturado, no crédito restante. */
  note: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const MAX_PAGES = 20; // tope defensivo de paginación

@Injectable()
export class VendorCostService {
  private readonly logger = new Logger(VendorCostService.name);
  private readonly anthropicKey = process.env.ANTHROPIC_ADMIN_KEY?.trim();
  private readonly openaiKey = process.env.OPENAI_ADMIN_KEY?.trim();
  private cache = new Map<string, { at: number; value: VendorCost }>();

  /** Rango [inicio, finExclusivo) del mes `YYYY-MM` en UTC. */
  private monthRange(mes: string): { start: Date; end: Date } {
    const [y, m] = mes.split('-').map(Number);
    return {
      start: new Date(Date.UTC(y, m - 1, 1)),
      end: new Date(Date.UTC(y, m, 1)),
    };
  }

  async getMonthlyCost(mes: string): Promise<VendorCost> {
    const cached = this.cache.get(mes);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.value;
    }

    const { start, end } = this.monthRange(mes);
    const [anthropic, openai] = await Promise.all([
      this.anthropicCost(start, end),
      this.openaiCost(start, end),
    ]);

    const value: VendorCost = {
      mes,
      anthropic,
      openai,
      note: 'Gasto facturado del periodo (no es el crédito restante; ese solo se ve en la consola del proveedor).',
    };
    this.cache.set(mes, { at: Date.now(), value });
    return value;
  }

  private async anthropicCost(start: Date, end: Date): Promise<ProviderCost> {
    if (!this.anthropicKey) return { enabled: false };
    try {
      // OJO: el Cost Report devuelve `amount` en la unidad MÍNIMA
      // (centavos) como string decimal — p.ej. "123.45" USD = $1.2345.
      // Acumulamos en centavos y dividimos /100 al final.
      let totalCents = 0;
      let page: string | undefined;
      for (let i = 0; i < MAX_PAGES; i++) {
        const url = new URL(
          'https://api.anthropic.com/v1/organizations/cost_report',
        );
        url.searchParams.set('starting_at', start.toISOString());
        url.searchParams.set('ending_at', end.toISOString());
        url.searchParams.set('bucket_width', '1d');
        url.searchParams.set('limit', '31');
        if (page) url.searchParams.set('page', page);

        const res = await fetch(url, {
          headers: {
            'x-api-key': this.anthropicKey,
            'anthropic-version': '2023-06-01',
          },
        });
        if (!res.ok) {
          return {
            enabled: true,
            error: `Anthropic Cost API ${res.status}`,
          };
        }
        const json = (await res.json()) as {
          data?: Array<{ results?: Array<{ amount?: unknown }> }>;
          has_more?: boolean;
          next_page?: string | null;
        };
        for (const bucket of json.data ?? []) {
          for (const r of bucket.results ?? []) {
            totalCents += Number(r.amount) || 0;
          }
        }
        if (!json.has_more || !json.next_page) break;
        page = json.next_page;
      }
      return {
        enabled: true,
        amountUsd: Number((totalCents / 100).toFixed(4)),
      };
    } catch (e) {
      this.logger.error('Anthropic cost read failed', e as Error);
      return { enabled: true, error: 'No se pudo leer el costo de Anthropic' };
    }
  }

  private async openaiCost(start: Date, end: Date): Promise<ProviderCost> {
    if (!this.openaiKey) return { enabled: false };
    try {
      let total = 0;
      let page: string | undefined;
      for (let i = 0; i < MAX_PAGES; i++) {
        const url = new URL('https://api.openai.com/v1/organization/costs');
        url.searchParams.set(
          'start_time',
          String(Math.floor(start.getTime() / 1000)),
        );
        url.searchParams.set(
          'end_time',
          String(Math.floor(end.getTime() / 1000)),
        );
        url.searchParams.set('bucket_width', '1d');
        url.searchParams.set('limit', '31');
        if (page) url.searchParams.set('page', page);

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${this.openaiKey}` },
        });
        if (!res.ok) {
          return { enabled: true, error: `OpenAI Costs API ${res.status}` };
        }
        const json = (await res.json()) as {
          data?: Array<{
            results?: Array<{ amount?: { value?: unknown } }>;
          }>;
          has_more?: boolean;
          next_page?: string | null;
        };
        for (const bucket of json.data ?? []) {
          for (const r of bucket.results ?? []) {
            total += Number(r.amount?.value) || 0;
          }
        }
        if (!json.has_more || !json.next_page) break;
        page = json.next_page;
      }
      return { enabled: true, amountUsd: Number(total.toFixed(4)) };
    } catch (e) {
      this.logger.error('OpenAI cost read failed', e as Error);
      return { enabled: true, error: 'No se pudo leer el costo de OpenAI' };
    }
  }
}
