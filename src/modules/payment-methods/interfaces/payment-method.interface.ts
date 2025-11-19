import { Timestamp } from 'firebase-admin/firestore';

export interface PaymentMethod {
  id: string;
  userId: string;
  nombre: string;
  icono?: string;
  descripcion?: string;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
