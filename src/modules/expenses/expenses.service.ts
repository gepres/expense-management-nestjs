import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { GetExpensesFilterDto } from './dto/get-expenses-filter.dto';
import * as ExcelJS from 'exceljs';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  async getExpensesByDateRange(userId: string, month: number, year: number) {
    const firestore = this.firebaseService.getFirestore();
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const expensesRef = firestore.collection('gastos');

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
}
