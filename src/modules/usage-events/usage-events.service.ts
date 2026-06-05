import { Injectable, Logger } from '@nestjs/common';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Query } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import {
  UsageSnapshot,
  UsageOverview,
  UsageUserRow,
  UsageDailyPoint,
} from './interfaces/usage-snapshot.interface';
import {
  ALLOWED_EVENTS,
  CLIENT_EVENT_SET,
  KNOWN_ROUTES,
} from './usage-events.constants';

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

  private dayKey(d: Date = new Date()): string {
    return `${this.monthKey(d)}-${String(d.getUTCDate()).padStart(2, '0')}`;
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

  /**
   * Overview mensual: contadores de eventos del rollup app + gastos por
   * origen (derivable del campo `origen`).
   */
  async getOverview(mesParam?: string): Promise<UsageOverview> {
    const db = this.firebase.getFirestore();
    const mes =
      mesParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam)
        ? mesParam
        : this.monthKey();

    const snap = await db.collection('usageEventsAppMonthly').doc(mes).get();
    const counters = (
      snap.exists ? (snap.data()?.counters ?? {}) : {}
    ) as Record<string, number>;

    const origenes = [
      'web',
      'scan',
      'voz',
      'lista',
      'whatsapp',
      'import',
      'shared',
    ];
    const counts = await Promise.all(
      origenes.map((o) =>
        this.count(db.collection('expenses').where('origen', '==', o)),
      ),
    );
    const gastosPorOrigen: Record<string, number> = {};
    origenes.forEach((o, i) => {
      gastosPorOrigen[o] = counts[i];
    });

    return {
      mes,
      generatedAt: new Date().toISOString(),
      counters,
      gastosPorOrigen,
    };
  }

  /**
   * Top usuarios por actividad del mes (suma de contadores). Lee los rollups
   * por usuario y ordena en memoria (sin índice compuesto).
   */
  async getTopUsers(mesParam?: string, max = 15): Promise<UsageUserRow[]> {
    const db = this.firebase.getFirestore();
    const mes =
      mesParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam)
        ? mesParam
        : this.monthKey();
    const limit = Math.min(Math.max(max, 1), 50);

    const snap = await db
      .collection('usageEventsMonthly')
      .where('mes', '==', mes)
      .limit(1000)
      .get();

    const rows: UsageUserRow[] = snap.docs.map((d) => {
      const data = d.data();
      const counters = (data.counters ?? {}) as Record<string, number>;
      const total = Object.values(counters).reduce(
        (a, b) => a + (Number(b) || 0),
        0,
      );
      return { userId: (data.userId as string) ?? d.id, total, counters };
    });
    rows.sort((a, b) => b.total - a.total);
    return rows.slice(0, limit);
  }

  /**
   * Serie diaria de actividad (suma de contadores por día) de los últimos
   * `dias` días. Lee los docs `usageEventsAppDaily/{YYYY-MM-DD}` por clave.
   */
  async getDaily(diasParam?: number): Promise<UsageDailyPoint[]> {
    const dias = Math.min(Math.max(diasParam ?? 14, 1), 90);
    const db = this.firebase.getFirestore();
    const now = new Date();

    const keys: string[] = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
      );
      keys.push(this.dayKey(d));
    }

    const refs = keys.map((k) =>
      db.collection('usageEventsAppDaily').doc(k),
    );
    const snaps = await db.getAll(...refs);

    return snaps.map((s, i) => {
      const counters = (
        s.exists ? (s.data()?.counters ?? {}) : {}
      ) as Record<string, number>;
      const total = Object.values(counters).reduce(
        (a, b) => a + (Number(b) || 0),
        0,
      );
      return { dia: keys[i], total };
    });
  }

  // ==========================================================================
  // Tracking de eventos (Fase 1-2) — escribe rollups con FieldValue.increment.
  // Solo el Admin SDK escribe estas colecciones (rules: WRITE bloqueado).
  // ==========================================================================

  /**
   * Registra UN evento incrementando los rollups (app mensual + diario +
   * por usuario si hay `userId`). Best-effort: valida la allowlist y nunca
   * lanza (el tracking jamás debe romper el flujo principal).
   */
  async track(
    event: string,
    opts: { userId?: string; count?: number } = {},
  ): Promise<void> {
    if (!ALLOWED_EVENTS.has(event)) {
      this.logger.warn(`track(): evento no permitido "${event}" (ignorado)`);
      return;
    }
    await this.trackCounters({ [event]: opts.count ?? 1 }, opts);
  }

  /**
   * Incrementa varios contadores en un solo batch (navegación / sesiones).
   * No valida allowlist: el caller construye claves seguras (p. ej. el
   * endpoint `session-end` valida rutas contra `KNOWN_ROUTES`).
   */
  async trackCounters(
    counters: Record<string, number>,
    opts: { userId?: string } = {},
  ): Promise<void> {
    try {
      const entries = Object.entries(counters).filter(([, n]) => n > 0);
      if (entries.length === 0) return;

      const db = this.firebase.getFirestore();
      const now = Timestamp.now();
      const mes = this.monthKey();
      const dia = this.dayKey();

      const toInc = (): Record<string, FieldValue> => {
        const out: Record<string, FieldValue> = {};
        for (const [k, n] of entries) out[k] = FieldValue.increment(n);
        return out;
      };

      const batch = db.batch();
      batch.set(
        db.collection('usageEventsAppMonthly').doc(mes),
        { scope: 'app', mes, updatedAt: now, counters: toInc() },
        { merge: true },
      );
      batch.set(
        db.collection('usageEventsAppDaily').doc(dia),
        { scope: 'app', dia, updatedAt: now, counters: toInc() },
        { merge: true },
      );
      if (opts.userId) {
        batch.set(
          db.collection('usageEventsMonthly').doc(`${opts.userId}_${mes}`),
          {
            scope: 'user',
            userId: opts.userId,
            mes,
            updatedAt: now,
            counters: toInc(),
          },
          { merge: true },
        );
      }
      await batch.commit();
    } catch (err) {
      this.logger.error('trackCounters falló (ignorado)', err as Error);
    }
  }

  /**
   * Evento de funnel emitido por el cliente. Valida contra la allowlist
   * client (un cliente no puede inflar contadores server como `wsp.*`).
   */
  async trackClient(event: string, userId: string): Promise<void> {
    if (!CLIENT_EVENT_SET.has(event)) {
      this.logger.warn(`trackClient(): evento no permitido "${event}"`);
      return;
    }
    await this.track(event, { userId });
  }

  /**
   * Resumen de una sesión de navegación: page-views por ruta (validadas
   * contra `KNOWN_ROUTES`) + métricas de sesión (count/bounce/views/duración).
   */
  async trackSession(
    dto: {
      views?: Record<string, number>;
      totalViews?: number;
      durationMs?: number;
    },
    userId: string,
  ): Promise<void> {
    const counters: Record<string, number> = {};
    for (const [ruta, n] of Object.entries(dto.views ?? {})) {
      if (KNOWN_ROUTES.has(ruta) && typeof n === 'number' && n > 0) {
        counters[`view.${ruta}`] = Math.floor(n);
      }
    }
    const totalViews = Math.max(0, Math.floor(dto.totalViews ?? 0));
    const durationMs = Math.max(0, Math.floor(dto.durationMs ?? 0));
    counters['nav.session.count'] = 1;
    counters['nav.session.bounce'] = totalViews <= 1 ? 1 : 0;
    counters['nav.session.viewsSum'] = totalViews;
    counters['nav.session.durationMsSum'] = durationMs;
    await this.trackCounters(counters, { userId });
  }
}
