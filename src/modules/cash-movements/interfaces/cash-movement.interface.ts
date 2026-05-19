import { Timestamp } from 'firebase-admin/firestore';

/**
 * Movimiento que afecta los sub-saldos de UNA cuenta:
 *
 *   - withdrawal:    bankBalance → cashBalance  (retirar al bolsillo)
 *   - deposit_cash:  cashBalance → bankBalance  (depositar efectivo en el banco)
 *   - income:        external → bankBalance|cashBalance  (ingreso externo,
 *                    aumenta el saldo total de la cuenta. En modelo Opción B
 *                    "la cuenta es el presupuesto general" → este movimiento
 *                    incrementa el presupuesto disponible del mes.)
 *   - reversal:      contra-asiento de un movimiento previo. Su efecto sobre
 *                    los saldos es exactamente el OPUESTO del original. Se
 *                    crea via POST /cash-movements/:id/revert. Solo se puede
 *                    revertir una vez (campo `revertedBy` se setea en el
 *                    original).
 */
export type CashMovementType =
  | 'withdrawal'
  | 'deposit_cash'
  | 'income'
  | 'reversal';

/**
 * Origen del ingreso (solo aplica cuando type='income').
 */
export type IncomeSource =
  | 'unspecified'
  | 'salary'
  | 'loan'
  | 'debt'
  | 'cts'
  | 'afp'
  | 'other';

export const INCOME_SOURCES: readonly IncomeSource[] = [
  'unspecified',
  'salary',
  'loan',
  'debt',
  'cts',
  'afp',
  'other',
] as const;

/**
 * Destino del ingreso dentro de la cuenta.
 * Por defecto va al saldo bancario (`bank`); pero un regalo en efectivo
 * puede ir directo al `cash`.
 */
export type IncomeDestination = 'bank' | 'cash';

export interface CashMovementDocument {
  userId: string;
  accountId: string;
  type: CashMovementType;
  amount: number;
  currency: string;
  description?: string;
  /** Solo presente cuando type='income'. */
  source?: IncomeSource;
  /** Solo presente cuando type='income'. Default 'bank'. */
  destination?: IncomeDestination;
  /** Solo presente cuando type='reversal': id del movimiento que revierte. */
  revertsMovementId?: string;
  /** Cuando un movimiento fue revertido, guarda el id del 'reversal'. */
  revertedBy?: string;
  /** Timestamp en que fue revertido. */
  revertedAt?: Timestamp;
  date: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CashMovement
  extends Omit<
    CashMovementDocument,
    'date' | 'createdAt' | 'updatedAt' | 'revertedAt'
  > {
  id: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  revertedAt?: string;
}
