import { Timestamp } from 'firebase-admin/firestore';

export type TipoNotificacion =
  | 'saldo_insuficiente'
  | 'ejecucion_fallida'
  | 'cuenta_destino_eliminada'
  | 'fx_api_error';

export type EntidadNotificacion = 'gasto' | 'transferencia';

/** Documento Firestore en `notificaciones`. */
export interface NotificacionDocument {
  userId: string;
  tipo: TipoNotificacion;
  programadaId: string;
  programadaTipo: EntidadNotificacion;
  mensaje: string;
  metadata?: {
    monto?: number;
    moneda?: string;
    saldoActual?: number;
    [key: string]: string | number | boolean | undefined;
  };
  leida: boolean;
  fechaEjecucionId?: string;
  createdAt: Timestamp;
}

/** Versión serializable para respuestas HTTP. */
export interface Notificacion extends Omit<NotificacionDocument, 'createdAt'> {
  id: string;
  createdAt: string;
}
