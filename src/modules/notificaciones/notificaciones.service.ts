/**
 * Servicio de notificaciones in-app.
 *
 * Crea documentos en la colección `notificaciones` cuando el cron de
 * programados encuentra fallos (saldo insuficiente, cuentas eliminadas,
 * errores de API externa). El frontend los lee vía `onSnapshot` directo
 * a Firestore y muestra un badge con el contador de no-leídas.
 *
 * Las mutations (crear, marcar leída, eliminar) pasan por el backend.
 * Las reglas Firestore bloquean writes desde el cliente.
 */

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import {
  Notificacion,
  NotificacionDocument,
  TipoNotificacion,
} from './interfaces/notificacion.interface';

const COLLECTION = 'notificaciones';

export interface CrearNotificacionInput {
  userId: string;
  tipo: TipoNotificacion;
  programadaId: string;
  programadaTipo: 'gasto' | 'transferencia';
  mensaje: string;
  metadata?: NotificacionDocument['metadata'];
  fechaEjecucionId?: string;
}

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  private toDto(id: string, data: NotificacionDocument): Notificacion {
    return {
      ...data,
      id,
      createdAt: data.createdAt.toDate().toISOString(),
    };
  }

  /**
   * Crea una notificación. Pensado para uso interno (cron).
   * NO arroja: las notificaciones nunca deben hacer fallar al cron.
   */
  async crear(input: CrearNotificacionInput): Promise<string | null> {
    try {
      const doc: NotificacionDocument = {
        userId: input.userId,
        tipo: input.tipo,
        programadaId: input.programadaId,
        programadaTipo: input.programadaTipo,
        mensaje: input.mensaje,
        leida: false,
        createdAt: Timestamp.now(),
      };
      if (input.metadata) doc.metadata = input.metadata;
      if (input.fechaEjecucionId) doc.fechaEjecucionId = input.fechaEjecucionId;

      const ref = await this.firebaseService
        .getFirestore()
        .collection(COLLECTION)
        .add(doc);

      this.logger.log(
        `Notificación creada ${ref.id} (${input.tipo} para ${input.programadaId})`,
      );
      return ref.id;
    } catch (err) {
      this.logger.error(
        `No se pudo crear notificación ${input.tipo} para ${input.programadaId}`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }

  async findAll(
    userId: string,
    soloNoLeidas = false,
    limit = 100,
  ): Promise<Notificacion[]> {
    let query = this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .where('userId', '==', userId);

    if (soloNoLeidas) {
      query = query.where('leida', '==', false);
    }

    const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();

    return snap.docs.map((d) =>
      this.toDto(d.id, d.data() as NotificacionDocument),
    );
  }

  async contarNoLeidas(userId: string): Promise<number> {
    const snap = await this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .where('leida', '==', false)
      .count()
      .get();
    return snap.data().count;
  }

  private async getOwnedRef(userId: string, id: string) {
    const ref = this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Notificación no encontrada');
    const data = snap.data() as NotificacionDocument;
    if (data.userId !== userId) throw new ForbiddenException('Acceso denegado');
    return { ref, data };
  }

  async marcarLeida(userId: string, id: string): Promise<Notificacion> {
    const { ref, data } = await this.getOwnedRef(userId, id);
    if (!data.leida) {
      await ref.update({ leida: true });
      data.leida = true;
    }
    return this.toDto(id, data);
  }

  async marcarTodasLeidas(userId: string): Promise<{ actualizadas: number }> {
    const snap = await this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .where('leida', '==', false)
      .get();

    if (snap.empty) return { actualizadas: 0 };

    const batch = this.firebaseService.getFirestore().batch();
    snap.docs.forEach((d) => batch.update(d.ref, { leida: true }));
    await batch.commit();

    return { actualizadas: snap.size };
  }

  async eliminar(userId: string, id: string): Promise<void> {
    const { ref } = await this.getOwnedRef(userId, id);
    await ref.delete();
  }
}
