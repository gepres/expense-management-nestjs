import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { Currency } from './interfaces/currency.interface';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { DEFAULT_CURRENCIES } from './constants/default-currencies';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class CurrenciesService {
  private readonly logger = new Logger(CurrenciesService.name);

  constructor(private firebaseService: FirebaseService) {}

  async initializeDefaultCurrencies(userId: string): Promise<Currency[]> {
    const firestore = this.firebaseService.getFirestore();
    const currenciesRef = firestore
      .collection('users')
      .doc(userId)
      .collection('currencies');

    // Verificar si ya existen monedas
    const existing = await currenciesRef.limit(1).get();
    if (!existing.empty) {
      this.logger.log(`Default currencies already exist for user ${userId}`);
      return this.findAll(userId);
    }

    this.logger.log(`Initializing default currencies for user ${userId}`);

    const batch = firestore.batch();
    const currencies: Currency[] = [];

    for (const defaultCurrency of DEFAULT_CURRENCIES) {
      const docRef = currenciesRef.doc(defaultCurrency.id);
      const currency: Omit<Currency, 'id'> = {
        userId,
        nombre: defaultCurrency.nombre,
        simbolo: defaultCurrency.simbolo,
        icono: defaultCurrency.icono,
        codigoISO: defaultCurrency.codigoISO,
        isDefault: true,
        createdAt: Timestamp.now(),
      };

      batch.set(docRef, currency);
      currencies.push({ id: docRef.id, ...currency });
    }

    await batch.commit();

    this.logger.log(
      `Created ${currencies.length} default currencies for user ${userId}`,
    );

    return currencies;
  }

  async create(
    userId: string,
    createCurrencyDto: CreateCurrencyDto,
  ): Promise<Currency> {
    const firestore = this.firebaseService.getFirestore();
    const currenciesRef = firestore
      .collection('users')
      .doc(userId)
      .collection('currencies');

    // Verificar si la moneda ya existe por ID
    const docRef = currenciesRef.doc(createCurrencyDto.id);
    const doc = await docRef.get();

    if (doc.exists) {
      throw new BadRequestException(
        `Currency with ID "${createCurrencyDto.id}" already exists`,
      );
    }

    const newCurrency: Omit<Currency, 'id'> = {
      userId,
      nombre: createCurrencyDto.nombre,
      simbolo: createCurrencyDto.simbolo,
      icono: createCurrencyDto.icono,
      codigoISO: createCurrencyDto.codigoISO,
      isDefault: false,
      createdAt: Timestamp.now(),
    };

    await docRef.set(newCurrency);

    this.logger.log(
      `Created custom currency "${createCurrencyDto.nombre}" for user ${userId}`,
    );

    return { id: docRef.id, ...newCurrency };
  }

  async findAll(userId: string): Promise<Currency[]> {
    const firestore = this.firebaseService.getFirestore();
    const currenciesRef = firestore
      .collection('users')
      .doc(userId)
      .collection('currencies');

    const snapshot = await currenciesRef.orderBy('nombre', 'asc').get();

    if (snapshot.empty) {
      // Si no hay monedas, crear las predeterminadas
      return this.initializeDefaultCurrencies(userId);
    }

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Currency[];
  }

  async findOne(userId: string, currencyId: string): Promise<Currency> {
    const firestore = this.firebaseService.getFirestore();
    const currencyRef = firestore
      .collection('users')
      .doc(userId)
      .collection('currencies')
      .doc(currencyId);

    const doc = await currencyRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Currency not found');
    }

    const data = doc.data() as Omit<Currency, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return { id: doc.id, ...data };
  }

  async update(
    userId: string,
    currencyId: string,
    updateCurrencyDto: UpdateCurrencyDto,
  ): Promise<Currency> {
    const firestore = this.firebaseService.getFirestore();
    const currencyRef = firestore
      .collection('users')
      .doc(userId)
      .collection('currencies')
      .doc(currencyId);

    const doc = await currencyRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Currency not found');
    }

    const data = doc.data() as Omit<Currency, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (data.isDefault) {
      throw new BadRequestException('Cannot modify default currencies');
    }

    await currencyRef.update({
      ...updateCurrencyDto,
      updatedAt: Timestamp.now(),
    });

    const updated = await currencyRef.get();
    return { id: updated.id, ...updated.data() } as Currency;
  }

  async remove(userId: string, currencyId: string): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    const currencyRef = firestore
      .collection('users')
      .doc(userId)
      .collection('currencies')
      .doc(currencyId);

    const doc = await currencyRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Currency not found');
    }

    const data = doc.data() as Omit<Currency, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (data.isDefault) {
      throw new BadRequestException('Cannot delete default currencies');
    }

    // Verificar si hay gastos asociados
    const expensesSnapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('expenses')
      .where('currency', '==', data.codigoISO)
      .limit(1)
      .get();

    if (!expensesSnapshot.empty) {
      throw new BadRequestException(
        'Cannot delete currency with associated expenses',
      );
    }

    await currencyRef.delete();

    this.logger.log(`Deleted currency ${currencyId} for user ${userId}`);
  }
}
