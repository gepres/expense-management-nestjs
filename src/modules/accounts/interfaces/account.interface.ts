import { Timestamp } from 'firebase-admin/firestore';
import { AccountStatus, AccountType } from '../constants/account-types.constants';

/**
 * Documento Firestore en la colección `accounts`.
 */
export interface AccountDocument {
  userId: string;
  name: string;
  type: AccountType;
  bank?: string;
  currency: string;
  icon?: string;
  color?: string;
  initialBalance: number;
  currentBalance: number;
  includeInTotal: boolean;
  isDefault: boolean;
  status: AccountStatus;
  // Para tarjetas de crédito (modelo simple, opción A)
  creditLimit?: number;
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
