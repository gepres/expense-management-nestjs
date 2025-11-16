import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { Receipt } from './interfaces/receipt.interface';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(private firebaseService: FirebaseService) {}

  /**
   * Crear un nuevo recibo
   */
  async create(receiptData: Partial<Receipt>): Promise<Receipt> {
    try {
      const firestore = this.firebaseService.getFirestore();
      const receiptsRef = firestore.collection('receipts');

      const newReceipt = {
        ...receiptData,
        status: receiptData.status || 'pending',
        createdAt: Timestamp.now(),
      };

      const docRef = await receiptsRef.add(newReceipt);

      this.logger.log(`Receipt created with ID: ${docRef.id}`);

      return {
        id: docRef.id,
        ...newReceipt,
      } as Receipt;
    } catch (error) {
      this.logger.error('Error creating receipt', error);
      throw new InternalServerErrorException('Error al guardar el recibo');
    }
  }

  /**
   * Obtener todos los recibos
   */
  async findAll(filters?: {
    status?: string;
    limit?: number;
  }): Promise<Receipt[]> {
    try {
      const firestore = this.firebaseService.getFirestore();
      let query = firestore.collection('receipts').orderBy('createdAt', 'desc');

      if (filters?.status) {
        query = query.where('status', '==', filters.status) as any;
      }

      if (filters?.limit) {
        query = query.limit(filters.limit) as any;
      }

      const snapshot = await query.get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Receipt[];
    } catch (error) {
      this.logger.error('Error fetching receipts', error);
      throw new InternalServerErrorException('Error al obtener los recibos');
    }
  }

  /**
   * Obtener un recibo por ID
   */
  async findOne(receiptId: string): Promise<Receipt> {
    try {
      const firestore = this.firebaseService.getFirestore();
      const receiptRef = firestore.collection('receipts').doc(receiptId);

      const doc = await receiptRef.get();

      if (!doc.exists) {
        throw new NotFoundException('Recibo no encontrado');
      }

      return {
        id: doc.id,
        ...doc.data(),
      } as Receipt;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Error fetching receipt', error);
      throw new InternalServerErrorException('Error al obtener el recibo');
    }
  }

  /**
   * Actualizar un recibo
   */
  async update(
    receiptId: string,
    updateData: Partial<Receipt>,
  ): Promise<Receipt> {
    try {
      const firestore = this.firebaseService.getFirestore();
      const receiptRef = firestore.collection('receipts').doc(receiptId);

      const doc = await receiptRef.get();

      if (!doc.exists) {
        throw new NotFoundException('Recibo no encontrado');
      }

      await receiptRef.update({
        ...updateData,
        processedAt: Timestamp.now(),
      });

      const updated = await receiptRef.get();

      return {
        id: updated.id,
        ...updated.data(),
      } as Receipt;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Error updating receipt', error);
      throw new InternalServerErrorException('Error al actualizar el recibo');
    }
  }

  /**
   * Eliminar un recibo
   */
  async delete(receiptId: string): Promise<void> {
    try {
      const firestore = this.firebaseService.getFirestore();
      const receiptRef = firestore.collection('receipts').doc(receiptId);

      const doc = await receiptRef.get();

      if (!doc.exists) {
        throw new NotFoundException('Recibo no encontrado');
      }

      await receiptRef.delete();

      this.logger.log(`Receipt deleted: ${receiptId}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Error deleting receipt', error);
      throw new InternalServerErrorException('Error al eliminar el recibo');
    }
  }

  /**
   * Actualizar estado de procesamiento
   */
  async updateStatus(
    receiptId: string,
    status: 'pending' | 'processed' | 'failed',
    errorMessage?: string,
  ): Promise<Receipt> {
    return this.update(receiptId, {
      status,
      errorMessage,
      processedAt: Timestamp.now(),
    } as any);
  }
}
