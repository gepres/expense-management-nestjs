import { Injectable, Logger } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import type { Query } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import { UsageSnapshot } from './interfaces/usage-snapshot.interface';

/** TTL del caché en memoria del snapshot (control de costo de lecturas). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Servicio de diagnóstico de uso (Fase 0).
 *
 * Agrega métricas DERIVABLES de las colecciones existentes con `count()`
 * aggregation (barato: no lee los documentos). Cada métrica es best-effort:
 * si una query falla (índice/campo), devuelve 0 sin romper el snapshot.
 *
 * Las Fases 1-2 (rollups de eventos) se añadirán a este mismo módulo.
 */
@Injectable()
export class UsageEventsService {
  private readonly logger = new Logger(UsageEventsService.name);
  private cache: { at: number; data: UsageSnapshot } | null = null;

  constructor(private readonly firebase: FirebaseService) {}

  private monthKey(d: Date = new Date()): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private startOfMonthUTC(d: Date = new Date()): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }

  /** Aggregation `count()` best-effort. Nunca lanza; 0 ante error. */
  private async count(q: Query): Promise<number> {
    try {
      const snap = await q.count().get();
      return snap.data().count;
    } catch (err) {
      this.logger.warn(`count() falló (ignorado): ${(err as Error).message}`);
      return 0;
    }
  }

  /** Snapshot agregado (cacheado 5 min; `force` lo recalcula). */
  async getSnapshot(force = false): Promise<UsageSnapshot> {
    if (!force && this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.data;
    }

    const db = this.firebase.getFirestore();
    const mes = this.monthKey();
    const inicioMes = Timestamp.fromDate(this.startOfMonthUTC());

    const [
      usuariosTotal,
      usuariosWhatsapp,
      usuariosAdmins,
      gastosTotal,
      gastosMes,
      transfersTotal,
      recGastosTotal,
      recGastosActivos,
      recTransfTotal,
      recTransfActivos,
      ejecTotal,
      ejecExitosa,
      ejecFallida,
      ejecSaldo,
      ejecPending,
      wspTotal,
      wspPending,
      conversaciones,
      mensajes,
      grupos,
      recibos,
      listas,
    ] = await Promise.all([
      this.count(db.collection('users')),
      this.count(db.collection('users').where('whatsappPhone', '!=', null)),
      this.count(db.collection('users').where('role', '==', 'admin')),
      this.count(db.collection('expenses')),
      this.count(db.collection('expenses').where('fecha', '>=', inicioMes)),
      this.count(db.collection('transfers')),
      this.count(db.collection('gastosProgramados')),
      this.count(
        db.collection('gastosProgramados').where('activo', '==', true),
      ),
      this.count(db.collection('transferenciasProgramadas')),
      this.count(
        db.collection('transferenciasProgramadas').where('activo', '==', true),
      ),
      this.count(db.collection('ejecucionesProgramadas')),
      this.count(
        db.collection('ejecucionesProgramadas').where('estado', '==', 'exitosa'),
      ),
      this.count(
        db.collection('ejecucionesProgramadas').where('estado', '==', 'fallida'),
      ),
      this.count(
        db
          .collection('ejecucionesProgramadas')
          .where('estado', '==', 'saldo_insuficiente'),
      ),
      this.count(
        db.collection('ejecucionesProgramadas').where('estado', '==', 'pending'),
      ),
      this.count(db.collection('whatsapp_queue')),
      this.count(
        db.collection('whatsapp_queue').where('status', '==', 'pending'),
      ),
      this.count(db.collectionGroup('conversations')),
      this.count(db.collectionGroup('messages')),
      this.count(db.collection('shared_groups')),
      this.count(db.collection('receipts')),
      this.count(db.collection('shopping-lists')),
    ]);

    const snapshot: UsageSnapshot = {
      generatedAt: new Date().toISOString(),
      mes,
      usuarios: {
        total: usuariosTotal,
        conWhatsapp: usuariosWhatsapp,
        admins: usuariosAdmins,
      },
      gastos: { total: gastosTotal, esteMes: gastosMes },
      transfers: { total: transfersTotal },
      recurrentes: {
        gastos: {
          total: recGastosTotal,
          activos: recGastosActivos,
          pausados: Math.max(0, recGastosTotal - recGastosActivos),
        },
        transferencias: {
          total: recTransfTotal,
          activos: recTransfActivos,
          pausados: Math.max(0, recTransfTotal - recTransfActivos),
        },
        ejecuciones: {
          total: ejecTotal,
          exitosa: ejecExitosa,
          fallida: ejecFallida,
          saldoInsuficiente: ejecSaldo,
          pending: ejecPending,
        },
      },
      whatsapp: {
        llamadosTotal: wspTotal,
        pendientes: wspPending,
        vinculados: usuariosWhatsapp,
      },
      chat: { conversaciones, mensajes },
      grupos: { total: grupos },
      recibos: { total: recibos },
      listas: { total: listas },
    };

    this.cache = { at: Date.now(), data: snapshot };
    return snapshot;
  }
}
