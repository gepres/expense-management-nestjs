import { Timestamp } from 'firebase-admin/firestore';

/**
 * Transferencia entre 2 cuentas del mismo usuario.
 *
 * Si las cuentas tienen monedas distintas, `amountConverted` y `exchangeRate`
 * son obligatorios.
 *
 * Las transfers son **inmutables** desde el cliente: para corregir, se borra y
 * se crea una nueva. La regla Firestore impide updates.
 */
export interface TransferDocument {
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number; // monto debitado de la cuenta origen, en su moneda
  amountConverted?: number; // monto acreditado en la cuenta destino (si difiere la moneda)
  exchangeRate?: number; // tipo de cambio aplicado (toCurrency/fromCurrency)
  fromCurrency: string;
  toCurrency: string;
  fee?: number; // comisión cobrada (debitada adicional al amount)
  description?: string;
  date: Timestamp; // cuándo se hizo la transferencia
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Transfer
  extends Omit<TransferDocument, 'date' | 'createdAt' | 'updatedAt'> {
  id: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}
