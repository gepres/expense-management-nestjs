/**
 * Proyector de saldo para gastos creados FUERA de `ExpensesService.create()`.
 *
 * Contexto (Opción A — desacople): el bot de WhatsApp
 * (`gastos-firebase-functions`) escribe `expenses` directo a Firestore por
 * Admin SDK y NO toca saldo. Por eso un gasto en efectivo por WhatsApp no
 * descontaba del bolsillo (`cashBalance`): nadie aplicaba `targetBalanceField`.
 *
 * Contrato: el bot escribe el expense con `balanceApplied: false` (marcador
 * POSITIVO). Los expenses de la web/import/programados NO tienen el campo →
 * la query `balanceApplied == false` jamás los matchea (no se re-debitan).
 * Este cron, cada minuto, debita el sub-saldo correcto en una transacción
 * idempotente y pone `balanceApplied: true`.
 *
 * Solo igualdad por un campo (`balanceApplied`) → índice automático de
 * Firestore; no requiere índice compuesto (las rules/indexes las gestiona
 * el repo web, no éste).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Timestamp } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import { AccountDocument } from '../accounts/interfaces/account.interface';

const EXPENSES_COLLECTION = 'expenses';
const ACCOUNTS_COLLECTION = 'accounts';
const BATCH_LIMIT = 200;

/** Forma parcial del expense — solo los campos que lee el proyector. */
interface ExternalExpenseDoc {
  balanceApplied?: unknown;
  monto?: unknown;
  accountId?: string;
  userId?: string;
  moneda?: string;
  metodoPago?: string;
}

/**
 * Mismo criterio que `ExpensesService` / `ProgramadosCron` (el codebase ya
 * duplica este helper por módulo; se mantiene la convención):
 *  - 'efectivo' → cashBalance (bolsillo)
 *  - cualquier otro → bankBalance (cuenta)
 */
export function targetBalanceField(
  metodoPago: string | undefined,
): 'bankBalance' | 'cashBalance' {
  return metodoPago === 'efectivo' ? 'cashBalance' : 'bankBalance';
}

@Injectable()
export class ExternalBalanceCron {
  private readonly logger = new Logger(ExternalBalanceCron.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async proyectarPendientes(): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    let snap: FirebaseFirestore.QuerySnapshot;
    try {
      snap = await firestore
        .collection(EXPENSES_COLLECTION)
        .where('balanceApplied', '==', false)
        .limit(BATCH_LIMIT)
        .get();
    } catch (err) {
      this.logger.error(
        'Error consultando expenses con balanceApplied=false',
        err instanceof Error ? err.stack : String(err),
      );
      return;
    }

    if (snap.empty) return;
    this.logger.log(`Proyectando saldo de ${snap.size} gasto(s) externos`);

    let ok = 0;
    let errores = 0;
    for (const doc of snap.docs) {
      try {
        const r = await this.aplicarUno(doc.id);
        if (r === 'ok') ok++;
        else if (r === 'error') errores++;
      } catch (err) {
        errores++;
        this.logger.error(
          `Fallo proyectando expense ${doc.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    this.logger.log(
      `Proyección saldo externa: ${ok} aplicados, ${errores} con error`,
    );
  }

  /**
   * Aplica el débito de un gasto a su sub-saldo en una transacción
   * idempotente. Devuelve 'ok' | 'error' | 'skip'.
   */
  private async aplicarUno(
    expenseId: string,
  ): Promise<'ok' | 'error' | 'skip'> {
    const firestore = this.firebaseService.getFirestore();
    const expenseRef = firestore.collection(EXPENSES_COLLECTION).doc(expenseId);

    return firestore.runTransaction(async (tx) => {
      const expSnap = await tx.get(expenseRef);
      if (!expSnap.exists) return 'skip';
      const exp = (expSnap.data() ?? {}) as ExternalExpenseDoc;

      // Idempotencia: solo si sigue exactamente en false (otra corrida o el
      // proceso ya lo aplicó / lo marcó error).
      if (exp.balanceApplied !== false) return 'skip';

      const now = Timestamp.now();
      const markError = (motivo: string): 'error' => {
        tx.update(expenseRef, {
          balanceApplied: 'error',
          balanceError: motivo,
          updatedAt: now,
        });
        this.logger.warn(`expense ${expenseId}: ${motivo} (no se debita)`);
        return 'error';
      };

      const monto = Number(exp.monto);
      if (!isFinite(monto) || monto <= 0) {
        return markError(`monto inválido (${String(exp.monto)})`);
      }
      if (!exp.accountId) return markError('expense sin accountId');

      const accountRef = firestore
        .collection(ACCOUNTS_COLLECTION)
        .doc(exp.accountId);
      const accSnap = await tx.get(accountRef);
      if (!accSnap.exists) {
        return markError(`cuenta ${exp.accountId} no encontrada`);
      }
      const account = accSnap.data() as AccountDocument;
      if (account.userId !== exp.userId) {
        return markError('cuenta de otro usuario');
      }
      if (exp.moneda && account.currency !== exp.moneda) {
        return markError(
          `moneda del gasto (${exp.moneda}) ≠ cuenta (${account.currency})`,
        );
      }

      // Mismo criterio y semántica que ExpensesService.create (no se bloquea
      // por saldo insuficiente: el saldo puede quedar negativo, igual que un
      // gasto creado por la web).
      const field = targetBalanceField(exp.metodoPago);
      tx.update(accountRef, {
        [field]: account[field] - monto,
        updatedAt: now,
      });
      tx.update(expenseRef, {
        balanceApplied: true,
        balanceAppliedAt: now,
        updatedAt: now,
      });
      return 'ok';
    });
  }
}
