import { Timestamp } from 'firebase-admin/firestore';

export interface Currency {
  id: string;
  userId: string;
  nombre: string;
  simbolo: string;
  icono?: string;
  codigoISO: string;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
