import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PaymentMethod } from './interfaces/payment-method.interface';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { DEFAULT_PAYMENT_METHODS } from './constants/default-payment-methods';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class PaymentMethodsService {
  private readonly logger = new Logger(PaymentMethodsService.name);

  constructor(private firebaseService: FirebaseService) {}

  async initializeDefaultPaymentMethods(
    userId: string,
  ): Promise<PaymentMethod[]> {
    const firestore = this.firebaseService.getFirestore();
    const paymentMethodsRef = firestore
      .collection('users')
      .doc(userId)
      .collection('paymentMethods');

    // Verificar si ya existen métodos de pago
    const existing = await paymentMethodsRef.limit(1).get();
    if (!existing.empty) {
      this.logger.log(
        `Default payment methods already exist for user ${userId}`,
      );
      return this.findAll(userId);
    }

    this.logger.log(`Initializing default payment methods for user ${userId}`);

    const batch = firestore.batch();
    const paymentMethods: PaymentMethod[] = [];

    for (const defaultMethod of DEFAULT_PAYMENT_METHODS) {
      const docRef = paymentMethodsRef.doc(defaultMethod.id);
      const paymentMethod: Omit<PaymentMethod, 'id'> = {
        userId,
        nombre: defaultMethod.nombre,
        icono: defaultMethod.icono,
        descripcion: defaultMethod.descripcion,
        isDefault: true,
        createdAt: Timestamp.now(),
      };

      batch.set(docRef, paymentMethod);
      paymentMethods.push({ id: docRef.id, ...paymentMethod });
    }

    await batch.commit();

    this.logger.log(
      `Created ${paymentMethods.length} default payment methods for user ${userId}`,
    );

    return paymentMethods;
  }

  async create(
    userId: string,
    createPaymentMethodDto: CreatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const firestore = this.firebaseService.getFirestore();
    const paymentMethodsRef = firestore
      .collection('users')
      .doc(userId)
      .collection('paymentMethods');

    // Verificar si el método de pago ya existe por ID
    const docRef = paymentMethodsRef.doc(createPaymentMethodDto.id);
    const doc = await docRef.get();

    if (doc.exists) {
      throw new BadRequestException(
        `Payment method with ID "${createPaymentMethodDto.id}" already exists`,
      );
    }

    const newPaymentMethod: Omit<PaymentMethod, 'id'> = {
      userId,
      nombre: createPaymentMethodDto.nombre,
      icono: createPaymentMethodDto.icono,
      descripcion: createPaymentMethodDto.descripcion,
      isDefault: false,
      createdAt: Timestamp.now(),
    };

    await docRef.set(newPaymentMethod);

    this.logger.log(
      `Created custom payment method "${createPaymentMethodDto.nombre}" for user ${userId}`,
    );

    return { id: docRef.id, ...newPaymentMethod };
  }

  async findAll(userId: string): Promise<PaymentMethod[]> {
    const firestore = this.firebaseService.getFirestore();
    const paymentMethodsRef = firestore
      .collection('users')
      .doc(userId)
      .collection('paymentMethods');

    const snapshot = await paymentMethodsRef.orderBy('nombre', 'asc').get();

    if (snapshot.empty) {
      // Si no hay métodos de pago, crear los predeterminados
      return this.initializeDefaultPaymentMethods(userId);
    }

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as PaymentMethod[];
  }

  async findOne(userId: string, paymentMethodId: string): Promise<PaymentMethod> {
    const firestore = this.firebaseService.getFirestore();
    const paymentMethodRef = firestore
      .collection('users')
      .doc(userId)
      .collection('paymentMethods')
      .doc(paymentMethodId);

    const doc = await paymentMethodRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Payment method not found');
    }

    const data = doc.data() as Omit<PaymentMethod, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return { id: doc.id, ...data };
  }

  async update(
    userId: string,
    paymentMethodId: string,
    updatePaymentMethodDto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const firestore = this.firebaseService.getFirestore();
    const paymentMethodRef = firestore
      .collection('users')
      .doc(userId)
      .collection('paymentMethods')
      .doc(paymentMethodId);

    const doc = await paymentMethodRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Payment method not found');
    }

    const data = doc.data() as Omit<PaymentMethod, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (data.isDefault) {
      throw new BadRequestException('Cannot modify default payment methods');
    }

    await paymentMethodRef.update({
      ...updatePaymentMethodDto,
      updatedAt: Timestamp.now(),
    });

    const updated = await paymentMethodRef.get();
    return { id: updated.id, ...updated.data() } as PaymentMethod;
  }

  async remove(userId: string, paymentMethodId: string): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    const paymentMethodRef = firestore
      .collection('users')
      .doc(userId)
      .collection('paymentMethods')
      .doc(paymentMethodId);

    const doc = await paymentMethodRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Payment method not found');
    }

    const data = doc.data() as Omit<PaymentMethod, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (data.isDefault) {
      throw new BadRequestException('Cannot delete default payment methods');
    }

    // Verificar si hay gastos asociados
    const expensesSnapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('expenses')
      .where('paymentMethod', '==', data.nombre)
      .limit(1)
      .get();

    if (!expensesSnapshot.empty) {
      throw new BadRequestException(
        'Cannot delete payment method with associated expenses',
      );
    }

    await paymentMethodRef.delete();

    this.logger.log(
      `Deleted payment method ${paymentMethodId} for user ${userId}`,
    );
  }
}
