/**
 * Cron de ejecución de Gastos Programados.
 *
 * Corre cada 15 minutos:
 *  1. Busca programados activos con `proximaEjecucion <= ahora`.
 *  2. Para cada uno, intenta crear un lock determinístico en
 *     `ejecucionesProgramadas/{programadaId}_{fechaProgramadaISO}`.
 *     Si ya existe → otro worker lo ejecutó, skip (idempotencia).
 *  3. En transacción Firestore: crea el `expense`, decrementa saldo de la
 *     cuenta, recalcula `proximaEjecucion`, actualiza la ejecución a
 *     `exitosa`. Si saldo insuficiente → marca `saldo_insuficiente`.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Timestamp } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import { ProgramadosService } from './programados.service';
import { calcularProximaEjecucion } from './utils/calcular-proxima';
import {
  EjecucionDocument,
  GastoProgramadoDocument,
} from './interfaces/programado.interface';
import { AccountDocument } from '../accounts/interfaces/account.interface';

const PROGRAMADOS_COLLECTION = 'gastosProgramados';
const EJECUCIONES_COLLECTION = 'ejecucionesProgramadas';
const EXPENSES_COLLECTION = 'expenses';
const ACCOUNTS_COLLECTION = 'accounts';

function targetBalanceField(metodoPago: string | undefined): 'bankBalance' | 'cashBalance' {
  return metodoPago === 'efectivo' ? 'cashBalance' : 'bankBalance';
}

@Injectable()
export class ProgramadosCron {
  private readonly logger = new Logger(ProgramadosCron.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly programadosService: ProgramadosService,
  ) {}

  /**
   * Corre cada 15 minutos. La precisión de "hora exacta" es ±15 min, suficiente
   * para gastos programados (no para alertas en tiempo real).
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async procesarPendientes(): Promise<void> {
    const ahora = new Date();
    let pendientes;
    try {
      pendientes = await this.programadosService.findPendientes(ahora);
    } catch (err) {
      this.logger.error('Error consultando pendientes', err as Error);
      return;
    }

    if (pendientes.length === 0) return;

    this.logger.log(`Procesando ${pendientes.length} programados pendientes`);

    for (const p of pendientes) {
      try {
        await this.ejecutarUno(p.id, p.data, ahora);
      } catch (err) {
        this.logger.error(
          `Falló ejecución de programado ${p.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }

  /**
   * Ejecuta una programación: lock + transacción Firestore.
   */
  private async ejecutarUno(
    programadaId: string,
    data: GastoProgramadoDocument,
    ahora: Date,
  ): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    const fechaProgramada = data.proximaEjecucion.toDate();
    const lockId = `${programadaId}_${fechaProgramada.toISOString()}`;
    const ejecucionRef = firestore.collection(EJECUCIONES_COLLECTION).doc(lockId);

    // ---- 1. LOCK idempotente ------------------------------------------------
    try {
      await ejecucionRef.create({
        programadaId,
        userId: data.userId,
        tipo: 'gasto',
        fechaProgramada: data.proximaEjecucion,
        fechaEjecutada: Timestamp.fromDate(ahora),
        estado: 'pending',
      } satisfies EjecucionDocument);
    } catch (err: any) {
      if (err?.code === 6 /* ALREADY_EXISTS */) {
        // Otro worker ya tomó este disparo. Skip silencioso.
        return;
      }
      throw err;
    }

    // ---- 2. Transacción: crear expense + decrementar saldo ------------------
    const programadoRef = firestore.collection(PROGRAMADOS_COLLECTION).doc(programadaId);
    const accountRef = firestore.collection(ACCOUNTS_COLLECTION).doc(data.cuentaOrigenId);
    const expenseRef = firestore.collection(EXPENSES_COLLECTION).doc();

    try {
      await firestore.runTransaction(async (tx) => {
        const [accountSnap, programadoSnap] = await Promise.all([
          tx.get(accountRef),
          tx.get(programadoRef),
        ]);

        if (!accountSnap.exists) {
          throw new Error('Cuenta no encontrada');
        }
        const account = accountSnap.data() as AccountDocument;
        if (account.userId !== data.userId) {
          throw new Error('Cuenta de otro usuario');
        }
        if (!programadoSnap.exists) {
          throw new Error('Programado eliminado durante ejecución');
        }
        const fresco = programadoSnap.data() as GastoProgramadoDocument;
        if (!fresco.activo) {
          throw new Error('Programado fue pausado');
        }

        const field = targetBalanceField(data.metodoPago);
        const saldoActual = account[field];

        // Saldo insuficiente: NO crear expense, marcar ejecución y skipear.
        if (saldoActual < data.monto) {
          tx.update(ejecucionRef, {
            estado: 'saldo_insuficiente',
            errorMensaje: `Saldo insuficiente en ${field}: ${saldoActual} < ${data.monto}`,
          });
          // Aún así avanzamos proximaEjecucion para no atascarnos
          const proxima = calcularProximaEjecucion({
            frecuencia: data.frecuencia,
            hora: data.hora,
            zonaHoraria: data.zonaHoraria,
            fechaInicio: data.fechaInicio.toDate(),
            fechaFin: data.fechaFin?.toDate(),
            ultimaEjecucion: fechaProgramada,
            diaEjecucion: data.diaEjecucion,
            ultimoDiaDelMes: data.ultimoDiaDelMes,
            intervaloDias: data.intervaloDias,
            fechaUnica: data.fechaUnica?.toDate(),
          });
          if (proxima) {
            tx.update(programadoRef, {
              proximaEjecucion: Timestamp.fromDate(proxima),
              updatedAt: Timestamp.now(),
            });
          } else {
            tx.update(programadoRef, {
              activo: false,
              updatedAt: Timestamp.now(),
            });
          }
          return { skipped: true as const };
        }

        // Crear expense con misma forma que ExpensesService.create
        const now = Timestamp.now();
        const expenseDoc: Record<string, any> = {
          userId: data.userId,
          accountId: data.cuentaOrigenId,
          categoria: data.categoria,
          descripcion: data.descripcion,
          metodoPago: data.metodoPago,
          moneda: data.moneda,
          monto: data.monto,
          fecha: data.proximaEjecucion, // se contabiliza en la fecha programada
          createdAt: now,
          updatedAt: now,
          // Marcador para distinguir gastos generados por programación
          programadaId,
        };
        if (data.subcategoria) expenseDoc.subcategoria = data.subcategoria;
        if (data.tags?.length) expenseDoc.tags = data.tags;

        tx.set(expenseRef, expenseDoc);
        tx.update(accountRef, {
          [field]: saldoActual - data.monto,
          updatedAt: now,
        });

        // Recalcular próxima ejecución
        const proxima = calcularProximaEjecucion({
          frecuencia: data.frecuencia,
          hora: data.hora,
          zonaHoraria: data.zonaHoraria,
          fechaInicio: data.fechaInicio.toDate(),
          fechaFin: data.fechaFin?.toDate(),
          ultimaEjecucion: fechaProgramada,
          diaEjecucion: data.diaEjecucion,
          ultimoDiaDelMes: data.ultimoDiaDelMes,
          intervaloDias: data.intervaloDias,
          fechaUnica: data.fechaUnica?.toDate(),
        });

        const programadoUpdate: Record<string, any> = {
          ultimaEjecucion: data.proximaEjecucion,
          totalEjecuciones: (fresco.totalEjecuciones ?? 0) + 1,
          updatedAt: now,
        };
        if (proxima) {
          programadoUpdate.proximaEjecucion = Timestamp.fromDate(proxima);
        } else {
          // Frecuencia única o fechaFin alcanzada → desactivar
          programadoUpdate.activo = false;
        }
        tx.update(programadoRef, programadoUpdate);

        // Marcar ejecución como exitosa
        tx.update(ejecucionRef, {
          estado: 'exitosa',
          gastoCreadoId: expenseRef.id,
        });

        return { skipped: false as const };
      });

      this.logger.log(
        `Ejecutado programado ${programadaId} → expense ${expenseRef.id}`,
      );
    } catch (err) {
      const errorMensaje = err instanceof Error ? err.message : String(err);
      this.logger.error(`Tx fallida en programado ${programadaId}: ${errorMensaje}`);
      // Marcar ejecución como fallida (best-effort, fuera de la tx)
      try {
        await ejecucionRef.update({
          estado: 'fallida',
          errorMensaje,
        });
      } catch (e) {
        this.logger.warn(`No se pudo marcar ejecución ${lockId} como fallida`);
      }
    }
  }
}
