import type { DashboardRange } from '../dto/summary-query.dto';

export interface DashboardSummaryAccount {
  id: string;
  nombre: string;
  tipo: string;
  moneda: string;
  bankBalance: number;
  cashBalance: number;
  total: number;
  isDefault: boolean;
}

export interface DashboardSummaryCategoria {
  categoria: string;
  total: number;
  count: number;
}

export interface DashboardSummary {
  range: DashboardRange;
  /** ISO de inicio del periodo (en TZ del usuario, con offset). */
  rangeFrom: string;
  /** ISO de fin del periodo (inclusive, fin del día). */
  rangeTo: string;
  /** Moneda principal del usuario (la de la primera cuenta default). */
  moneda: string;
  /** Zona horaria usada para calcular el rango (default America/Lima). */
  tz: string;
  gastos: {
    /** Total gastado en el periodo, en la moneda principal. */
    total: number;
    /** Cantidad de gastos en el periodo (todas las monedas). */
    count: number;
    /** Top 3 categorías por monto (solo moneda principal). */
    topCategorias: DashboardSummaryCategoria[];
  };
  cuentas: DashboardSummaryAccount[];
  /** Suma de saldos de las cuentas en la moneda principal. */
  totalCuentas: number;
  /** True si el usuario tiene cuentas en monedas distintas a la principal. */
  mixedCurrencies: boolean;
  /** ISO UTC del momento en que se calculó el summary. */
  generatedAt: string;
}
