/**
 * Snapshot de diagnóstico (Fase 0).
 *
 * Métricas DERIVABLES de colecciones existentes vía `count()` aggregation
 * (no requiere instrumentar eventos). Todo es best-effort: una métrica que
 * falle devuelve 0 y no rompe el resto del snapshot.
 */
export interface UsageSnapshot {
  /** ISO timestamp de generación. */
  generatedAt: string;
  /** Mes en curso `YYYY-MM` (UTC). */
  mes: string;

  usuarios: {
    total: number;
    /** Con WhatsApp vinculado (adopción del bot). */
    conWhatsapp: number;
    admins: number;
  };

  gastos: {
    total: number;
    /** Creados este mes (campo `fecha`). */
    esteMes: number;
  };

  transfers: {
    total: number;
  };

  recurrentes: {
    gastos: { total: number; activos: number; pausados: number };
    transferencias: { total: number; activos: number; pausados: number };
    /** Ejecuciones del cron por estado (auditoría). */
    ejecuciones: {
      total: number;
      exitosa: number;
      fallida: number;
      saldoInsuficiente: number;
      pending: number;
    };
  };

  whatsapp: {
    /** Mensajes entrantes encolados (histórico). */
    llamadosTotal: number;
    pendientes: number;
    /** Usuarios con número vinculado. */
    vinculados: number;
  };

  chat: {
    conversaciones: number;
    mensajes: number;
  };

  grupos: { total: number };
  recibos: { total: number };
  listas: { total: number };
}

/** Overview mensual: contadores de eventos (rollup) + gastos por origen. */
export interface UsageOverview {
  mes: string;
  generatedAt: string;
  /** Contadores del rollup `usageEventsAppMonthly/{mes}` (event → n). */
  counters: Record<string, number>;
  /** Gastos creados por canal de origen (derivable del campo `origen`). */
  gastosPorOrigen: Record<string, number>;
}

/** Fila de actividad por usuario (rollup `usageEventsMonthly`). */
export interface UsageUserRow {
  userId: string;
  /** Suma de todos los contadores del mes. */
  total: number;
  counters: Record<string, number>;
}

/** Punto de la serie diaria de actividad. */
export interface UsageDailyPoint {
  dia: string;
  total: number;
}
