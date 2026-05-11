import { Timestamp } from 'firebase-admin/firestore';

export type FrecuenciaProgramado =
  | 'diaria'
  | 'semanal'
  | 'quincenal'
  | 'mensual'
  | 'personalizada'
  | 'unica';

export type EstadoEjecucion =
  | 'exitosa'
  | 'fallida'
  | 'saldo_insuficiente'
  | 'cancelada'
  | 'pending';

/**
 * Documento Firestore en `gastosProgramados`.
 *
 * Plantilla que el cron ejecuta automáticamente generando un Expense real
 * en cada disparo. Los movimientos generados aparecen en la colección
 * `expenses` con la misma forma que un gasto creado manualmente.
 */
export interface GastoProgramadoDocument {
  userId: string;

  // Datos del gasto a generar
  cuentaOrigenId: string;
  monto: number;
  moneda: string; // 'PEN' | 'USD'
  descripcion: string;
  categoria: string;
  subcategoria?: string;
  metodoPago: string;
  tags?: string[];

  // Schedule
  frecuencia: FrecuenciaProgramado;
  diaEjecucion?: number; // 0-6 si semanal, 1-31 si mensual
  ultimoDiaDelMes?: boolean; // solo mensual
  intervaloDias?: number; // solo personalizada
  fechaUnica?: Timestamp; // solo unica
  hora: string; // 'HH:mm' en zona local del usuario
  zonaHoraria: string; // IANA, ej 'America/Lima'
  fechaInicio: Timestamp;
  fechaFin?: Timestamp;

  // Estado
  activo: boolean;
  proximaEjecucion: Timestamp;
  ultimaEjecucion?: Timestamp;
  totalEjecuciones: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GastoProgramado
  extends Omit<
    GastoProgramadoDocument,
    'fechaInicio' | 'fechaFin' | 'fechaUnica' | 'proximaEjecucion' | 'ultimaEjecucion' | 'createdAt' | 'updatedAt'
  > {
  id: string;
  fechaInicio: string;
  fechaFin?: string;
  fechaUnica?: string;
  proximaEjecucion: string;
  ultimaEjecucion?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Documento Firestore en `transferenciasProgramadas`.
 * Cada disparo genera un documento en `transfers` con la misma forma
 * que una transferencia creada manualmente.
 */
export interface TransferenciaProgramadaDocument {
  userId: string;

  cuentaOrigenId: string;
  cuentaDestinoId: string;
  monto: number;
  moneda: string;
  descripcion?: string;

  // Schedule (idéntico a GastoProgramadoDocument)
  frecuencia: FrecuenciaProgramado;
  diaEjecucion?: number;
  ultimoDiaDelMes?: boolean;
  intervaloDias?: number;
  fechaUnica?: Timestamp;
  hora: string;
  zonaHoraria: string;
  fechaInicio: Timestamp;
  fechaFin?: Timestamp;

  activo: boolean;
  proximaEjecucion: Timestamp;
  ultimaEjecucion?: Timestamp;
  totalEjecuciones: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TransferenciaProgramada
  extends Omit<
    TransferenciaProgramadaDocument,
    | 'fechaInicio'
    | 'fechaFin'
    | 'fechaUnica'
    | 'proximaEjecucion'
    | 'ultimaEjecucion'
    | 'createdAt'
    | 'updatedAt'
  > {
  id: string;
  fechaInicio: string;
  fechaFin?: string;
  fechaUnica?: string;
  proximaEjecucion: string;
  ultimaEjecucion?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Documento Firestore en `ejecucionesProgramadas`. Auditoría de cada disparo
 * del cron, con ID determinístico `{programadaId}_{fechaProgramadaISO}` para
 * garantizar idempotencia ante reentradas.
 */
export interface EjecucionDocument {
  programadaId: string;
  userId: string;
  tipo: 'gasto' | 'transferencia';
  fechaProgramada: Timestamp;
  fechaEjecutada: Timestamp;
  estado: EstadoEjecucion;
  gastoCreadoId?: string;
  transferCreadoId?: string;
  errorMensaje?: string;
}
