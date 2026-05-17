/**
 * Contrato del resumen de métricas (`GET /api/analytics/summary`).
 * Todo se calcula server-side a partir de `expenses` del periodo, en UNA
 * sola moneda (no se mezclan PEN/USD). El frontend (Bloque 2) refleja
 * exactamente esta forma en `types/metricas.ts`.
 */
export interface AnalyticsSummary {
  periodo: {
    month: number;
    year: number;
    desde: string; // ISO
    hasta: string; // ISO
    diasTranscurridos: number;
    diasTotales: number;
  };
  moneda: string;
  /** accountIds incluidos; vacío = todas las cuentas del usuario. */
  cuentasIncluidas: string[];
  totales: {
    totalGastado: number;
    numTransacciones: number;
    promedioPorGasto: number;
    promedioDiario: number;
    gastoMaximo: number;
    gastoMinimo: number;
    diasConGasto: number;
  };
  comparativaMesAnterior: {
    totalAnterior: number;
    diferencia: number;
    diferenciaPorcentaje: number;
    tendencia: 'creciente' | 'decreciente' | 'estable';
  };
  /** Proyección lineal de gasto a fin de mes. */
  proyeccionFinMes: number;
  porCategoria: Array<{
    categoria: string;
    total: number;
    porcentaje: number;
    numGastos: number;
  }>;
  porSubcategoria: Array<{
    categoria: string;
    subcategoria: string;
    total: number;
  }>;
  porMetodoPago: Array<{
    metodoPago: string;
    total: number;
    porcentaje: number;
  }>;
  /** Serie diaria ordenada ascendente con acumulado para el área chart. */
  porDia: Array<{ fecha: string; total: number; acumulado: number }>;
  tendenciasCategoria: Array<{
    categoria: string;
    tendencia: 'creciente' | 'decreciente' | 'estable';
    porcentajeCambio: number;
    actual: number;
    anterior: number;
  }>;
  topGastos: Array<{
    id: string;
    descripcion: string;
    monto: number;
    categoria: string;
    fecha: string;
  }>;
  /** Outliers por desviación estándar (2σ) calculados localmente. */
  anomalias: Array<{
    id: string;
    descripcion: string;
    monto: number;
    categoria: string;
    fecha: string;
    razon: string;
    desviacion: number;
  }>;
  topTags: Array<{ tag: string; total: number; count: number }>;
  /** Monedas presentes en el periodo (para que el cliente ofrezca el selector). */
  monedasDisponibles: string[];
}
