import { Timestamp } from 'firebase-admin/firestore';

/**
 * Presupuesto de una cuenta para un mes.
 *
 * El bucket `'general'` es el techo total del mes para esa cuenta. Los buckets
 * de categoría (alimentacion, transporte, …) y el bucket especial `'efectivo'`
 * son sub-asignaciones dentro del general.
 *
 * Validación: limiteGeneral >= Σ(limitesCategorias) + limiteEfectivo
 *
 * Rollover: solo el bucket `'general'` arrastra `rolloverEntrada` desde el mes
 * anterior. El sobrante (positivo o negativo) de TODOS los buckets se acumula
 * en el general del mes siguiente.
 */

export type PresupuestoBucket =
  | 'general'
  | 'efectivo'
  | string; // categoria real (alimentacion, transporte, …) — string libre

export interface PresupuestoDocument {
  userId: string;
  accountId: string;
  /** Formato YYYY-MM */
  mes: string;
  bucket: PresupuestoBucket;
  limite: number;
  moneda: string;
  /** Solo aplica al bucket 'general'. Se computa lazy en el backend. */
  rolloverEntrada?: number;
  alertaEnviada80?: boolean;
  alertaEnviada100?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Presupuesto extends Omit<PresupuestoDocument, 'createdAt' | 'updatedAt'> {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Calculados al consultar (no persistidos). */
  gastado?: number;
  disponible?: number;
  /** True cuando `gastado` supera el `limite` del bucket. */
  excede?: boolean;
  /** Porcentaje gastado respecto al límite (0–∞). */
  porcentaje?: number;
}

/**
 * Estado de un bucket específico, devuelto por endpoints de mutación
 * (crear/actualizar/borrar gasto) para que el frontend pueda mostrar
 * alertas inmediatas tras la operación.
 */
export interface BucketAlert {
  /** Identificador del bucket (categoría, 'general', 'efectivo'). */
  bucket: string;
  /** Tope del bucket. */
  limite: number;
  /** Suma de gastos en este bucket para el mes consultado. */
  gastado: number;
  /** Disponible = limite − gastado (puede ser negativo). */
  disponible: number;
  /** True cuando gastado > limite. */
  excede: boolean;
  /** Porcentaje gastado respecto al límite. */
  porcentaje: number;
}

/**
 * Snapshot mensual con todos los buckets de una cuenta + cálculos derivados.
 *
 * Modelo Opción B: el "techo" del mes es el saldo actual de la cuenta
 * (`accountBalance`). El bucket `general` queda deprecado pero se sigue
 * devolviendo si existe en datos viejos, para no romper la UI legacy.
 */
export interface ResumenMensual {
  accountId: string;
  mes: string;
  moneda: string;
  /** Bucket general LEGACY. En Opción B no se crean nuevos. */
  general?: Presupuesto;
  categorias: Presupuesto[];
  efectivo?: Presupuesto;
  totalGastado: number;
  totalAsignado: number;
  /** Saldo actual de la cuenta = bankBalance + cashBalance. */
  accountBalance: number;
  /** True cuando la suma de asignaciones excede el saldo de la cuenta. */
  excedeAsignacion: boolean;
  /** Disponible no asignado a ningún bucket = accountBalance − totalAsignado. */
  disponibleSinAsignar: number;
}
