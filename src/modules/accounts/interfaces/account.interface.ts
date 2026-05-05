import { Timestamp } from 'firebase-admin/firestore';
import { AccountStatus, AccountType } from '../constants/account-types.constants';

/**
 * Datos de tarjeta asociados a una cuenta. El backend NO descifra
 * `cardNumberEnc`: solo lo persiste tal cual. CVC NUNCA se almacena.
 */
export interface EncryptedCardData {
  cardNumberEnc: string;
  cardLast4: string;
  holderName: string;
  expMonth: number;
  expYear: number;
  brand?: 'visa' | 'mastercard' | 'amex' | 'other';
}

/**
 * Documento Firestore en la colección `accounts`.
 *
 * Saldos:
 *   - bankBalance: dinero que está en la cuenta bancaria/wallet/tarjeta.
 *   - cashBalance: dinero ya retirado (en efectivo) que vino de esta cuenta.
 *   El saldo total disponible = bankBalance + cashBalance.
 *
 * Operaciones:
 *   - Gasto con metodoPago != 'efectivo': descuenta de bankBalance.
 *   - Gasto con metodoPago == 'efectivo': descuenta de cashBalance.
 *   - Movimiento "retiro": mueve bankBalance → cashBalance dentro de la MISMA cuenta.
 *   - Transfer entre cuentas: descuenta bankBalance origen, suma bankBalance destino.
 */
export interface AccountDocument {
  userId: string;
  name: string;
  type: AccountType;
  bank?: string;
  currency: string;
  icon?: string;
  color?: string;
  initialBankBalance: number;
  initialCashBalance: number;
  bankBalance: number;
  cashBalance: number;
  includeInTotal: boolean;
  isDefault: boolean;
  status: AccountStatus;
  // Para tarjetas de crédito (modelo simple, opción A)
  creditLimit?: number;
  // Datos de tarjeta cifrados (opcional, para type=card o bank con débito)
  cardData?: EncryptedCardData;
  // Auditoría
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Account expuesto en la API (con `id` y fechas como ISO strings).
 */
export interface Account extends Omit<AccountDocument, 'createdAt' | 'updatedAt'> {
  id: string;
  createdAt: string;
  updatedAt: string;
}
