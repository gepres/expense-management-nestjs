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
import { TransferenciasProgramadasService } from './transferencias-programadas.service';
import { calcularProximaEjecucion } from './utils/calcular-proxima';
import {
  EjecucionDocument,
  GastoProgramadoDocument,
  TransferenciaProgramadaDocument,
} from './interfaces/programado.interface';
import { AccountDocument } from '../accounts/interfaces/account.interface';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { FxService } from './utils/fx.service';

const PROGRAMADOS_COLLECTION = 'gastosProgramados';
const TRANSFERENCIAS_COLLECTION = 'transferenciasProgramadas';
const EJECUCIONES_COLLECTION = 'ejecucionesProgramadas';
const EXPENSES_COLLECTION = 'expenses';
const TRANSFERS_COLLECTION = 'transfers';
const ACCOUNTS_COLLECTION = 'accounts';

function targetBalanceField(
  metodoPago: string | undefined,
): 'bankBalance' | 'cashBalance' {
  return metodoPago === 'efectivo' ? 'cashBalance' : 'bankBalance';
}

@Injectable()
export class ProgramadosCron {
  private readonly logger = new Logger(ProgramadosCron.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly programadosService: ProgramadosService,
    private readonly transferenciasService: TransferenciasProgramadasService,
    private readonly notificacionesService: NotificacionesService,
    private readonly fxService: FxService,
  ) {}

  /**
   * Corre cada 30 minutos. Procesa gastos y transferencias programadas en
   * el mismo ciclo.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async procesarPendientes(): Promise<void> {
    const ahora = new Date();

    // Gastos
    try {
      const gastos = await this.programadosService.findPendientes(ahora);
      if (gastos.length > 0) {
        this.logger.log(`Procesando ${gastos.length} gastos programados`);
        for (const p of gastos) {
          try {
            await this.ejecutarUno(p.id, p.data, ahora);
          } catch (err) {
            this.logger.error(
              `Falló ejecución de gasto programado ${p.id}`,
              err instanceof Error ? err.stack : String(err),
            );
          }
        }
      }
    } catch (err) {
      this.logger.error('Error consultando gastos pendientes', err as Error);
    }

    // Transferencias
    try {
      const transferencias =
        await this.transferenciasService.findPendientes(ahora);
      if (transferencias.length > 0) {
        this.logger.log(
          `Procesando ${transferencias.length} transferencias programadas`,
        );
        for (const t of transferencias) {
          try {
            await this.ejecutarTransferencia(t.id, t.data, ahora);
          } catch (err) {
            this.logger.error(
              `Falló ejecución de transferencia programada ${t.id}`,
              err instanceof Error ? err.stack : String(err),
            );
          }
        }
      }
    } catch (err) {
      this.logger.error(
        'Error consultando transferencias pendientes',
        err as Error,
      );
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
    const ejecucionRef = firestore
      .collection(EJECUCIONES_COLLECTION)
      .doc(lockId);

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
    const programadoRef = firestore
      .collection(PROGRAMADOS_COLLECTION)
      .doc(programadaId);
    const accountRef = firestore
      .collection(ACCOUNTS_COLLECTION)
      .doc(data.cuentaOrigenId);
    const expenseRef = firestore.collection(EXPENSES_COLLECTION).doc();

    try {
      const txResult = await firestore.runTransaction(async (tx) => {
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
          return {
            kind: 'saldo_insuficiente' as const,
            saldoActual,
          };
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

        return { kind: 'exitosa' as const };
      });

      if (txResult.kind === 'saldo_insuficiente') {
        this.logger.warn(
          `Saldo insuficiente en gasto programado ${programadaId} (saldo=${txResult.saldoActual} < monto=${data.monto})`,
        );
        await this.notificacionesService.crear({
          userId: data.userId,
          tipo: 'saldo_insuficiente',
          programadaId,
          programadaTipo: 'gasto',
          mensaje: `No se ejecutó el gasto programado "${data.descripcion}": saldo insuficiente (${data.moneda} ${txResult.saldoActual.toFixed(2)} < ${data.monto.toFixed(2)}).`,
          metadata: {
            monto: data.monto,
            moneda: data.moneda,
            saldoActual: txResult.saldoActual,
          },
          fechaEjecucionId: lockId,
        });
      } else {
        this.logger.log(
          `Ejecutado programado ${programadaId} → expense ${expenseRef.id}`,
        );
      }
    } catch (err) {
      const errorMensaje = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Tx fallida en programado ${programadaId}: ${errorMensaje}`,
      );
      // Marcar ejecución como fallida (best-effort, fuera de la tx)
      try {
        await ejecucionRef.update({
          estado: 'fallida',
          errorMensaje,
        });
      } catch (e) {
        this.logger.warn(`No se pudo marcar ejecución ${lockId} como fallida`);
      }
      await this.notificacionesService.crear({
        userId: data.userId,
        tipo: 'ejecucion_fallida',
        programadaId,
        programadaTipo: 'gasto',
        mensaje: `Error al ejecutar el gasto programado "${data.descripcion}": ${errorMensaje}`,
        metadata: { monto: data.monto, moneda: data.moneda },
        fechaEjecucionId: lockId,
      });
    }
  }

  /**
   * Ejecuta una transferencia programada: lock + transacción Firestore
   * (debit origen, credit destino, crear documento en `transfers`).
   *
   * Diferencias con `ejecutarUno` (gastos):
   *  - Si la cuenta destino fue eliminada → marca fallida y PAUSA el programado
   *    (a diferencia de saldo insuficiente que reintenta).
   *  - Solo mismo currency: la validación se hizo al crear; aquí asumimos OK.
   */
  private async ejecutarTransferencia(
    programadaId: string,
    data: TransferenciaProgramadaDocument,
    ahora: Date,
  ): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    const fechaProgramada = data.proximaEjecucion.toDate();
    const lockId = `${programadaId}_${fechaProgramada.toISOString()}`;
    const ejecucionRef = firestore
      .collection(EJECUCIONES_COLLECTION)
      .doc(lockId);

    // ---- Lock idempotente -------------------------------------------------
    try {
      await ejecucionRef.create({
        programadaId,
        userId: data.userId,
        tipo: 'transferencia',
        fechaProgramada: data.proximaEjecucion,
        fechaEjecutada: Timestamp.fromDate(ahora),
        estado: 'pending',
      } satisfies EjecucionDocument);
    } catch (err: any) {
      if (err?.code === 6 /* ALREADY_EXISTS */) return;
      throw err;
    }

    const programadoRef = firestore
      .collection(TRANSFERENCIAS_COLLECTION)
      .doc(programadaId);
    const fromRef = firestore
      .collection(ACCOUNTS_COLLECTION)
      .doc(data.cuentaOrigenId);
    const toRef = firestore
      .collection(ACCOUNTS_COLLECTION)
      .doc(data.cuentaDestinoId);
    const transferRef = firestore.collection(TRANSFERS_COLLECTION).doc();

    // Resolver tipo de cambio FUERA de la transacción (fetch externo no debe
    // estar dentro de runTransaction). Si la API falla y usarTasaActual=true
    // → abortar antes de tocar el lock para que reintente en el siguiente tick.
    const monedaDestino = data.monedaDestino ?? data.moneda;
    const esCrossCurrency = monedaDestino !== data.moneda;
    let exchangeRate = 1;
    let amountConverted = data.monto;
    if (esCrossCurrency) {
      try {
        if (data.usarTasaActual) {
          exchangeRate = await this.fxService.getRate(
            data.moneda,
            monedaDestino,
          );
        } else if (data.exchangeRate && data.exchangeRate > 0) {
          exchangeRate = data.exchangeRate;
        } else {
          throw new Error(
            `Programado ${programadaId}: cross-currency sin exchangeRate ni usarTasaActual`,
          );
        }
        amountConverted = Number((data.monto * exchangeRate).toFixed(2));
      } catch (err) {
        const errorMensaje = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `FX error en transferencia ${programadaId}: ${errorMensaje}`,
        );
        await ejecucionRef.update({
          estado: 'fallida',
          errorMensaje: `FX: ${errorMensaje}`,
        });
        await this.notificacionesService.crear({
          userId: data.userId,
          tipo: 'fx_api_error',
          programadaId,
          programadaTipo: 'transferencia',
          mensaje: `No se ejecutó la transferencia "${data.descripcion ?? ''}": no se pudo obtener el tipo de cambio ${data.moneda}→${monedaDestino}.`,
          metadata: { monto: data.monto, moneda: data.moneda },
          fechaEjecucionId: lockId,
        });
        return;
      }
    }

    try {
      const txResult = await firestore.runTransaction(async (tx) => {
        const [fromSnap, toSnap, programadoSnap] = await Promise.all([
          tx.get(fromRef),
          tx.get(toRef),
          tx.get(programadoRef),
        ]);

        if (!programadoSnap.exists) {
          throw new Error(
            'Transferencia programada eliminada durante ejecución',
          );
        }
        const fresco = programadoSnap.data() as TransferenciaProgramadaDocument;
        if (!fresco.activo) throw new Error('Transferencia fue pausada');

        // Cuenta destino borrada → pausar (no podemos completar la transferencia)
        if (!toSnap.exists) {
          tx.update(ejecucionRef, {
            estado: 'fallida',
            errorMensaje: 'Cuenta destino fue eliminada',
          });
          tx.update(programadoRef, {
            activo: false,
            updatedAt: Timestamp.now(),
          });
          return { kind: 'cuenta_destino_eliminada' as const };
        }

        if (!fromSnap.exists) {
          tx.update(ejecucionRef, {
            estado: 'fallida',
            errorMensaje: 'Cuenta origen fue eliminada',
          });
          tx.update(programadoRef, {
            activo: false,
            updatedAt: Timestamp.now(),
          });
          return { kind: 'cuenta_origen_eliminada' as const };
        }

        const from = fromSnap.data() as AccountDocument;
        const to = toSnap.data() as AccountDocument;

        if (from.userId !== data.userId || to.userId !== data.userId) {
          throw new Error('Cuenta de otro usuario');
        }

        // Saldo insuficiente en bankBalance del origen → registrar y avanzar.
        if (from.bankBalance < data.monto) {
          tx.update(ejecucionRef, {
            estado: 'saldo_insuficiente',
            errorMensaje: `Saldo insuficiente: ${from.bankBalance} < ${data.monto}`,
          });
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
          return {
            kind: 'saldo_insuficiente' as const,
            saldoActual: from.bankBalance,
          };
        }

        const now = Timestamp.now();

        // Crear documento Transfer (misma forma que TransfersService.create).
        // amountConverted y exchangeRate ya están resueltos arriba (mismo
        // currency = 1, cross-currency = tasa fija o de Frankfurter).
        const transferDoc: Record<string, any> = {
          userId: data.userId,
          fromAccountId: data.cuentaOrigenId,
          toAccountId: data.cuentaDestinoId,
          amount: data.monto,
          amountConverted,
          exchangeRate,
          fromCurrency: from.currency,
          toCurrency: to.currency,
          date: data.proximaEjecucion,
          createdAt: now,
          updatedAt: now,
          // Marca para identificar transfers generadas por programación
          programadaId,
        };
        if (data.descripcion) transferDoc.description = data.descripcion;

        tx.set(transferRef, transferDoc);
        tx.update(fromRef, {
          bankBalance: from.bankBalance - data.monto,
          updatedAt: now,
        });
        tx.update(toRef, {
          bankBalance: to.bankBalance + amountConverted,
          updatedAt: now,
        });

        // Recalcular próxima
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
          programadoUpdate.activo = false;
        }
        tx.update(programadoRef, programadoUpdate);

        tx.update(ejecucionRef, {
          estado: 'exitosa',
          transferCreadoId: transferRef.id,
        });

        return { kind: 'exitosa' as const };
      });

      const descripcionPrograma = data.descripcion ?? 'transferencia';

      if (txResult.kind === 'saldo_insuficiente') {
        this.logger.warn(
          `Saldo insuficiente en transferencia programada ${programadaId} (saldo=${txResult.saldoActual} < monto=${data.monto})`,
        );
        await this.notificacionesService.crear({
          userId: data.userId,
          tipo: 'saldo_insuficiente',
          programadaId,
          programadaTipo: 'transferencia',
          mensaje: `No se ejecutó la transferencia "${descripcionPrograma}": saldo insuficiente (${data.moneda} ${txResult.saldoActual.toFixed(2)} < ${data.monto.toFixed(2)}).`,
          metadata: {
            monto: data.monto,
            moneda: data.moneda,
            saldoActual: txResult.saldoActual,
          },
          fechaEjecucionId: lockId,
        });
      } else if (txResult.kind === 'cuenta_destino_eliminada') {
        this.logger.warn(
          `Transferencia programada ${programadaId} pausada: cuenta destino eliminada`,
        );
        await this.notificacionesService.crear({
          userId: data.userId,
          tipo: 'cuenta_destino_eliminada',
          programadaId,
          programadaTipo: 'transferencia',
          mensaje: `Transferencia programada "${descripcionPrograma}" pausada porque la cuenta destino fue eliminada.`,
          fechaEjecucionId: lockId,
        });
      } else if (txResult.kind === 'cuenta_origen_eliminada') {
        this.logger.warn(
          `Transferencia programada ${programadaId} pausada: cuenta origen eliminada`,
        );
        await this.notificacionesService.crear({
          userId: data.userId,
          tipo: 'ejecucion_fallida',
          programadaId,
          programadaTipo: 'transferencia',
          mensaje: `Transferencia programada "${descripcionPrograma}" pausada porque la cuenta origen fue eliminada.`,
          fechaEjecucionId: lockId,
        });
      } else {
        this.logger.log(
          `Ejecutada transferencia programada ${programadaId} → transfer ${transferRef.id}`,
        );
      }
    } catch (err) {
      const errorMensaje = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Tx fallida en transferencia ${programadaId}: ${errorMensaje}`,
      );
      try {
        await ejecucionRef.update({
          estado: 'fallida',
          errorMensaje,
        });
      } catch {
        this.logger.warn(`No se pudo marcar ejecución ${lockId} como fallida`);
      }
      await this.notificacionesService.crear({
        userId: data.userId,
        tipo: 'ejecucion_fallida',
        programadaId,
        programadaTipo: 'transferencia',
        mensaje: `Error al ejecutar la transferencia programada "${data.descripcion ?? ''}": ${errorMensaje}`,
        metadata: { monto: data.monto, moneda: data.moneda },
        fechaEjecucionId: lockId,
      });
    }
  }
}
