import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AnthropicService } from '../anthropic/anthropic.service';
import { GetExpensesFilterDto } from './dto/get-expenses-filter.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import * as ExcelJS from 'exceljs';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly anthropicService: AnthropicService,
  ) {}

  async getExpensesByDateRange(userId: string, month: number, year: number) {
    const firestore = this.firebaseService.getFirestore();
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const expensesRef = firestore.collection('expenses');

    const snapshot = await expensesRef
      .where('userId', '==', userId)
      .where('fecha', '>=', startTimestamp)
      .where('fecha', '<=', endTimestamp)
      .orderBy('fecha', 'desc')
      .get();

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        fecha: (data.fecha as Timestamp).toDate(),
        createdAt: (data.createdAt as Timestamp).toDate(),
      };
    });
  }

  async exportExpenses(userId: string, filter: GetExpensesFilterDto) {
    const expenses = await this.getExpensesByDateRange(userId, filter.month, filter.year);

    if (filter.format === 'json') {
      return expenses;
    }

    if (filter.format === 'excel') {
      return this.generateExcel(expenses);
    }
  }

  private async generateExcel(expenses: any[]): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Gastos');

    worksheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Concepto', key: 'concepto', width: 30 },
      { header: 'Categoría', key: 'categoria', width: 20 },
      { header: 'Monto', key: 'monto', width: 15 },
      { header: 'Moneda', key: 'moneda', width: 10 },
      { header: 'Método de Pago', key: 'metodoPago', width: 20 },
      { header: 'Comercio', key: 'comercio', width: 25 },
      { header: 'Descripción', key: 'descripcion', width: 40 },
    ];

    // Estilo de cabecera
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFCCCCCC' },
    };

    expenses.forEach(expense => {
      worksheet.addRow({
        fecha: expense.fecha,
        concepto: expense.concepto || 'Sin concepto',
        categoria: expense.categoria || 'Sin categoría',
        monto: expense.monto,
        moneda: expense.moneda || 'PEN',
        metodoPago: expense.metodoPago || 'Efectivo',
        comercio: expense.comercio || '',
        descripcion: expense.descripcion || '',
      });
    });

    return await workbook.xlsx.writeBuffer();
  }

  // --- CRUD Methods ---

  async create(userId: string, dto: CreateExpenseDto) {
    const firestore = this.firebaseService.getFirestore();
    const docRef = firestore.collection('expenses').doc();

    const data: any = {
      userId,
      categoria: dto.category,
      subcategoria: dto.subcategory,
      descripcion: dto.description,
      metodoPago: dto.paymentMethod,
      moneda: dto.currency,
      monto: dto.amount,
      fecha: Timestamp.fromDate(new Date(dto.date)),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    delete data.date;

    await docRef.set(data);

    // Si se proporciona shoppingListId, actualizar el estado a "archived"
    if (dto.shoppingListId) {
      try {
        await firestore
          .collection('shopping-lists')
          .doc(dto.shoppingListId)
          .update({
            status: 'archived',
            updatedAt: Timestamp.now(),
          });
        this.logger.log(`Shopping list ${dto.shoppingListId} archived after expense creation`);
      } catch (error) {
        this.logger.warn(`Failed to archive shopping list ${dto.shoppingListId}`, error);
        // No lanzamos error para no bloquear la creación del gasto
      }
    }

    return { id: docRef.id, ...data, fecha: dto.date };
  }

  async findAll(userId: string, query: ExpenseQueryDto) {
    const firestore = this.firebaseService.getFirestore();
    let ref = firestore.collection('expenses').where('userId', '==', userId);

    if (query.startDate) {
      ref = ref.where(
        'fecha',
        '>=',
        Timestamp.fromDate(new Date(query.startDate)),
      );
    }
    if (query.endDate) {
      const endDate = new Date(query.endDate);
      endDate.setHours(23, 59, 59, 999);
      ref = ref.where('fecha', '<=', Timestamp.fromDate(endDate));
    }
    if (query.category) {
      ref = ref.where('category', '==', query.category);
    }
    if (query.paymentMethod) {
      ref = ref.where('paymentMethod', '==', query.paymentMethod);
    }

    ref = ref.orderBy('fecha', 'desc');

    const limit = query.limit || 20;
    const offset = ((query.page || 1) - 1) * limit;

    const snapshot = await ref.limit(limit).offset(offset).get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        fecha: (data.fecha as Timestamp).toDate(),
        createdAt: (data.createdAt as Timestamp).toDate(),
      };
    });
  }

  async findOne(userId: string, id: string) {
    const doc = await this.firebaseService
      .getFirestore()
      .collection('expenses')
      .doc(id)
      .get();
    if (!doc.exists) throw new NotFoundException('Gasto no encontrado');
    const data = doc.data();
    if (!data || data.userId !== userId)
      throw new NotFoundException('Gasto no encontrado');
    return {
      id: doc.id,
      ...data,
      fecha: (data.fecha as Timestamp).toDate(),
    };
  }

  async update(userId: string, id: string, dto: UpdateExpenseDto) {
    const docRef = this.firebaseService
      .getFirestore()
      .collection('expenses')
      .doc(id);
    const doc = await docRef.get();
    const data = doc.data();
    if (!doc.exists || !data || data.userId !== userId)
      throw new NotFoundException('Gasto no encontrado');

    const updates: any = { ...dto, updatedAt: Timestamp.now() };
    if (dto.date) {
      updates.fecha = Timestamp.fromDate(new Date(dto.date));
      delete updates.date;
    }

    await docRef.update(updates);
    return { id, ...doc.data(), ...updates };
  }

  async remove(userId: string, id: string) {
    const docRef = this.firebaseService
      .getFirestore()
      .collection('expenses')
      .doc(id);
    const doc = await docRef.get();
    const data = doc.data();
    if (!doc.exists || !data || data.userId !== userId)
      throw new NotFoundException('Gasto no encontrado');
    await docRef.delete();
    return { id, message: 'Gasto eliminado' };
  }

  async parseExpenseText(userId: string, text: string) {
    const prompt = `Analiza el siguiente texto y extrae la información del gasto en formato JSON.
    Texto: "${text}"
    
    Formato JSON esperado:
    {
      "amount": number,
      "concept": string,
      "category": string (sugerida),
      "subcategory": string (opcional),
      "paymentMethod": string (sugerido, default "Efectivo"),
      "currency": string (default "PEN"),
      "merchant": string (opcional),
      "date": string (ISO date, default hoy)
    }
    
    Si falta información, infiérela o usa defaults. Responde SOLO con el JSON.`;

    const response = await this.anthropicService.sendMessage(prompt, []);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No se pudo parsear la respuesta de IA');
  }
}
