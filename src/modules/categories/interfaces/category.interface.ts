import { Timestamp } from 'firebase-admin/firestore';

export interface Subcategory {
  id: string;
  nombre: string;
  descripcion?: string;
  suggestions_ideas?: string[];
}

export interface Category {
  id: string;
  userId: string;
  nombre: string;
  icono?: string;
  color?: string;
  descripcion?: string;
  subcategorias?: Subcategory[];
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
