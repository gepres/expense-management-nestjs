import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { Transfer, TransferDocument } from './interfaces/transfer.interface';
import { AccountDocument } from '../accounts/interfaces/account.interface';

const TRANSFERS_COLLECTION = 'transfers';
const ACCOUNTS_COLLECTION = 'accounts';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  private toTransfer(id: string, data: TransferDocument): Transfer {
    return {
      ...data,
      id,
      date: data.date.toDate().toISOString(),
      createdAt: data.createdAt.toDate().toISOString(),
      updatedAt: data.updatedAt.toDate().toISOString(),
    };
  }

  // ==========================================================================
  // CREATE — atomic con transaction
  // ==========================================================================

  async create(userId: string, dto: CreateTransferDto): Promise<Transfer> {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException(
        'La cuenta origen y destino no pueden ser iguales',
      );
    }

    const firestore = this.firebaseService.getFirestore();
    const fromRef = firestore
      .collection(ACCOUNTS_COLLECTION)
      .doc(dto.fromAccountId);
    const toRef = firestore
      .collection(ACCOUNTS_COLLECTION)
      .doc(dto.toAccountId);
    const transferRef = firestore.collection(TRANSFERS_COLLECTION).doc();

    const fee = dto.fee ?? 0;
    const date = dto.date ? new Date(dto.date) : new Date();

    const result = await firestore.runTransaction(async (tx) => {
      const [fromSnap, toSnap] = await Promise.all([
        tx.get(fromRef),
        tx.get(toRef),
      ]);

      if (!fromSnap.exists)
        throw new NotFoundException('Cuenta origen no encontrada');
      if (!toSnap.exists)
        throw new NotFoundException('Cuenta destino no encontrada');

      const from = fromSnap.data() as AccountDocument;
      const to = toSnap.data() as AccountDocument;

      if (from.userId !== userId)
        throw new NotFoundException('Cuenta origen no encontrada');
      if (to.userId !== userId)
        throw new NotFoundException('Cuenta destino no encontrada');

      // Resolver monto destino y tipo de cambio
      let amountConverted: number | undefined;
      let exchangeRate: number | undefined;

      if (from.currency === to.currency) {
        amountConverted = dto.amount;
        exchangeRate = 1;
      } else {
        if (
          dto.amountConverted === undefined &&
          dto.exchangeRate === undefined
        ) {
          throw new BadRequestException(
            'Para transferencias entre monedas distintas, envía amountConverted o exchangeRate',
          );
        }
        if (dto.amountConverted !== undefined) {
          amountConverted = dto.amountConverted;
          exchangeRate = +(amountConverted / dto.amount).toFixed(6);
        } else {
          exchangeRate = dto.exchangeRate!;
          amountConverted = +(dto.amount * exchangeRate).toFixed(2);
        }
      }

      const now = Timestamp.now();

      // Construir documento de transfer
      const transferDoc: TransferDocument = {
        userId,
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        amount: dto.amount,
        amountConverted,
        exchangeRate,
        fromCurrency: from.currency,
        toCurrency: to.currency,
        date: Timestamp.fromDate(date),
        createdAt: now,
        updatedAt: now,
      };
      if (fee > 0) transferDoc.fee = fee;
      if (dto.description) transferDoc.description = dto.description.trim();

      tx.set(transferRef, transferDoc);

      // Actualizar saldos atomicamente — las transfers afectan SOLO bankBalance
      tx.update(fromRef, {
        bankBalance: from.bankBalance - dto.amount - fee,
        updatedAt: now,
      });
      tx.update(toRef, {
        bankBalance: to.bankBalance + amountConverted,
        updatedAt: now,
      });

      return { transferDoc, id: transferRef.id };
    });

    this.logger.log(
      `Transfer ${result.id}: ${dto.fromAccountId} → ${dto.toAccountId}, ` +
        `${dto.amount} ${result.transferDoc.fromCurrency} → ${result.transferDoc.amountConverted} ${result.transferDoc.toCurrency}`,
    );

    return this.toTransfer(result.id, result.transferDoc);
  }

  // ==========================================================================
  // QUERY
  // ==========================================================================

  async findAll(
    userId: string,
    opts: { accountId?: string; limit?: number } = {},
  ): Promise<Transfer[]> {
    const firestore = this.firebaseService.getFirestore();
    const limit = opts.limit ?? 100;

    if (opts.accountId) {
      // Combinar transfers entrantes y salientes de la cuenta
      const [outSnap, inSnap] = await Promise.all([
        firestore
          .collection(TRANSFERS_COLLECTION)
          .where('userId', '==', userId)
          .where('fromAccountId', '==', opts.accountId)
          .orderBy('date', 'desc')
          .limit(limit)
          .get(),
        firestore
          .collection(TRANSFERS_COLLECTION)
          .where('userId', '==', userId)
          .where('toAccountId', '==', opts.accountId)
          .orderBy('date', 'desc')
          .limit(limit)
          .get(),
      ]);

      const all = [
        ...outSnap.docs.map((d) =>
          this.toTransfer(d.id, d.data() as TransferDocument),
        ),
        ...inSnap.docs.map((d) =>
          this.toTransfer(d.id, d.data() as TransferDocument),
        ),
      ];

      // Dedupe (no debería haber duplicados pero por si acaso) y ordenar
      const map = new Map(all.map((t) => [t.id, t]));
      return Array.from(map.values())
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit);
    }

    const snap = await firestore
      .collection(TRANSFERS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map((d) =>
      this.toTransfer(d.id, d.data() as TransferDocument),
    );
  }

  async findOne(userId: string, id: string): Promise<Transfer> {
    const doc = await this.firebaseService
      .getFirestore()
      .collection(TRANSFERS_COLLECTION)
      .doc(id)
      .get();
    if (!doc.exists) throw new NotFoundException('Transferencia no encontrada');
    const data = doc.data() as TransferDocument;
    if (data.userId !== userId)
      throw new NotFoundException('Transferencia no encontrada');
    return this.toTransfer(id, data);
  }

  // ==========================================================================
  // DELETE — revierte saldos atomicamente
  // ==========================================================================

  async remove(userId: string, id: string): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    const transferRef = firestore.collection(TRANSFERS_COLLECTION).doc(id);

    await firestore.runTransaction(async (tx) => {
      const transferSnap = await tx.get(transferRef);
      if (!transferSnap.exists)
        throw new NotFoundException('Transferencia no encontrada');

      const transfer = transferSnap.data() as TransferDocument;
      if (transfer.userId !== userId)
        throw new NotFoundException('Transferencia no encontrada');

      const fromRef = firestore
        .collection(ACCOUNTS_COLLECTION)
        .doc(transfer.fromAccountId);
      const toRef = firestore
        .collection(ACCOUNTS_COLLECTION)
        .doc(transfer.toAccountId);
      const [fromSnap, toSnap] = await Promise.all([
        tx.get(fromRef),
        tx.get(toRef),
      ]);

      const now = Timestamp.now();

      // Revertir saldos en bankBalance. Si una cuenta fue eliminada, omitir su reverso.
      if (fromSnap.exists) {
        const from = fromSnap.data() as AccountDocument;
        tx.update(fromRef, {
          bankBalance: from.bankBalance + transfer.amount + (transfer.fee ?? 0),
          updatedAt: now,
        });
      }
      if (toSnap.exists) {
        const to = toSnap.data() as AccountDocument;
        tx.update(toRef, {
          bankBalance:
            to.bankBalance - (transfer.amountConverted ?? transfer.amount),
          updatedAt: now,
        });
      }

      tx.delete(transferRef);
    });

    this.logger.log(`Transfer reverted and deleted: ${id}`);
  }
}
