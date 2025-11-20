import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AnthropicService } from '../anthropic/anthropic.service';
import { CategoriesService } from '../categories/categories.service';
import { ImportExpenseDto } from './dto/import-expense.dto';
import { ImportOptionsDto } from './dto/import-options.dto';
import {
  ImportResult,
  ImportError,
  AISuggestion,
  ImportRecord,
} from './interfaces/import-result.interface';
import { ExcelParserUtil } from './utils/excel-parser.util';
import { ExpenseValidatorUtil } from './utils/expense-validator.util';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_ROWS = 5000;

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly anthropicService: AnthropicService,
    private readonly categoriesService: CategoriesService,
  ) {}

  /**
   * Process uploaded file (Excel or JSON)
   */
  async processFile(
    userId: string,
    file: Express.Multer.File,
    format: 'excel' | 'json',
    options: ImportOptionsDto,
  ): Promise<ImportResult> {
    // Validate file size
    if (file.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException(
        `El archivo excede el tamaño máximo permitido de ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    this.logger.log(
      `Processing ${format} file for user ${userId}: ${file.originalname}`,
    );

    // Parse file
    let expenses: ImportExpenseDto[];
    try {
      if (format === 'excel') {
        expenses = ExcelParserUtil.parseExcelFile(file.buffer);
      } else {
        expenses = JSON.parse(file.buffer.toString('utf-8'));
      }
    } catch (error) {
      throw new BadRequestException(
        `Error al procesar el archivo: ${error.message}`,
      );
    }

    // Validate row count
    if (expenses.length > this.MAX_ROWS) {
      throw new BadRequestException(
        `El archivo contiene ${expenses.length} filas, el máximo permitido es ${this.MAX_ROWS}`,
      );
    }

    if (expenses.length === 0) {
      throw new BadRequestException('El archivo no contiene datos');
    }

    // Validate expenses
    const { valid, errors } = await ExpenseValidatorUtil.validateExpenses(
      expenses,
    );

    if (errors.length > 0) {
      this.logger.warn(`Validation failed for ${errors.length} rows`);
      this.logger.debug(JSON.stringify(errors.slice(0, 5), null, 2));
    }

    // Generate warnings
    const warnings = ExpenseValidatorUtil.generateWarnings(valid);

    // If validate only, return early
    if (options.validateOnly) {
      return {
        success: errors.length === 0,
        totalRows: expenses.length,
        imported: 0,
        skipped: expenses.length - valid.length,
        errors,
        warnings,
      };
    }

    // Auto-categorize if requested
    if (options.autoCategorizate) {
      await this.autoCategorizateExpenses(userId, valid);
    }

    // Create import record
    const importRecord = await this.createImportRecord(
      userId,
      file.originalname,
      format,
      expenses.length,
    );

    // Import valid expenses
    const imported = await this.importExpenses(
      userId,
      valid,
      options,
      importRecord.id,
    );

    // Update import record
    await this.updateImportRecord(importRecord.id, userId, {
      imported,
      skipped: expenses.length - imported,
      status: 'completed',
      errors,
      completedAt: Timestamp.now(),
    });

    // Generate AI suggestions
    let aiSuggestions: AISuggestion[] | undefined;
    try {
      aiSuggestions = await this.analyzeImportWithAI(valid, errors);
    } catch (error) {
      this.logger.error('Error generating AI suggestions', error);
    }

    return {
      success: true,
      totalRows: expenses.length,
      imported,
      skipped: expenses.length - imported,
      errors,
      warnings,
      aiSuggestions,
      importId: importRecord.id,
    };
  }

  /**
   * Import validated expenses to Firestore
   */
  private async importExpenses(
    userId: string,
    expenses: ImportExpenseDto[],
    options: ImportOptionsDto,
    importId: string,
  ): Promise<number> {
    const firestore = this.firebaseService.getFirestore();
    const gastosRef = firestore.collection('gastos');
    const batchSize = options.batchSize || 100;
    let imported = 0;

    // Process in batches
    for (let i = 0; i < expenses.length; i += batchSize) {
      const batch = firestore.batch();
      const chunk = expenses.slice(i, i + batchSize);

      for (const expense of chunk) {
        // Check for duplicates if requested
        if (options.skipDuplicates) {
          const isDuplicate = await this.checkDuplicate(
            userId,
            expense,
          );
          if (isDuplicate) {
            continue;
          }
        }

        // Create expense document
        const docRef = gastosRef.doc();
        const expenseData = {
          userId,
          fecha: Timestamp.fromDate(new Date(expense.fecha)),
          monto: expense.monto,
          concepto: expense.concepto,
          categoria: expense.categoria || 'Sin categoría',
          subcategoria: expense.subcategoria,
          metodoPago: expense.metodoPago || 'Efectivo',
          moneda: expense.moneda || 'PEN',
          comercio: expense.comercio,
          descripcion: expense.descripcion,
          importId,
          createdAt: Timestamp.now(),
        };

        batch.set(docRef, expenseData);
        imported++;
      }

      await batch.commit();
      this.logger.log(
        `Imported batch ${Math.floor(i / batchSize) + 1}: ${chunk.length} expenses`,
      );
    }

    return imported;
  }

  /**
   * Check if expense is duplicate
   */
  private async checkDuplicate(
    userId: string,
    expense: ImportExpenseDto,
  ): Promise<boolean> {
    const firestore = this.firebaseService.getFirestore();
    const expenseDate = Timestamp.fromDate(new Date(expense.fecha));

    const snapshot = await firestore
      .collection('gastos')
      .where('userId', '==', userId)
      .where('fecha', '==', expenseDate)
      .where('monto', '==', expense.monto)
      .where('concepto', '==', expense.concepto)
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  /**
   * Auto-categorize expenses using AI
   */
  private async autoCategorizateExpenses(
    userId: string,
    expenses: ImportExpenseDto[],
  ): Promise<void> {
    const categories = await this.categoriesService.getCategoryNames(userId);

    for (const expense of expenses) {
      if (!expense.categoria) {
        try {
          const suggestedCategory =
            await this.anthropicService.categorizeExpense(
              expense.concepto,
              expense.monto,
              expense.comercio,
              categories,
            );

          if (categories.includes(suggestedCategory)) {
            expense.categoria = suggestedCategory;
          }
        } catch (error) {
          this.logger.error(
            `Error auto-categorizing expense: ${expense.concepto}`,
            error,
          );
        }
      }
    }
  }

  /**
   * Analyze import with AI for suggestions
   */
  async analyzeImportWithAI(
    expenses: ImportExpenseDto[],
    errors: ImportError[],
  ): Promise<AISuggestion[]> {
    const suggestions: AISuggestion[] = [];

    // Prepare data summary for AI
    const summary = {
      totalExpenses: expenses.length,
      totalErrors: errors.length,
      withoutCategory: expenses.filter((e) => !e.categoria).length,
      withoutPaymentMethod: expenses.filter((e) => !e.metodoPago).length,
      dateRange: {
        min: Math.min(...expenses.map((e) => new Date(e.fecha).getTime())),
        max: Math.max(...expenses.map((e) => new Date(e.fecha).getTime())),
      },
      sampleExpenses: expenses.slice(0, 5),
      sampleErrors: errors.slice(0, 5),
    };

    const prompt = `Analiza los siguientes datos de importación de gastos y proporciona sugerencias para mejorar la calidad de los datos:

${JSON.stringify(summary, null, 2)}

Proporciona sugerencias en las siguientes categorías:
1. Categorización faltante
2. Posibles duplicados
3. Problemas de formato
4. Datos faltantes importantes
5. Anomalías detectadas

Responde en formato JSON con un array de sugerencias, cada una con: type, message, affectedRows (array de números), suggestion, confidence (0-1).`;

    try {
      const response = await this.anthropicService.sendMessage(prompt, []);
      
      // Parse AI response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const aiSuggestions = JSON.parse(jsonMatch[0]);
        suggestions.push(...aiSuggestions);
      }
    } catch (error) {
      this.logger.error('Error analyzing import with AI', error);
    }

    return suggestions;
  }

  /**
   * Get import history for user
   */
  async getImportHistory(userId: string): Promise<ImportRecord[]> {
    const firestore = this.firebaseService.getFirestore();
    const snapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('imports')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ImportRecord[];
  }

  /**
   * Create import record in Firestore
   */
  private async createImportRecord(
    userId: string,
    fileName: string,
    format: 'excel' | 'json',
    totalRows: number,
  ): Promise<ImportRecord> {
    const firestore = this.firebaseService.getFirestore();
    const importRef = firestore
      .collection('users')
      .doc(userId)
      .collection('imports');

    const record = {
      userId,
      fileName,
      format,
      totalRows,
      imported: 0,
      skipped: 0,
      status: 'processing' as const,
      errors: [],
      createdAt: Timestamp.now(),
    };

    const docRef = await importRef.add(record);

    return {
      id: docRef.id,
      ...record,
    };
  }

  /**
   * Update import record
   */
  private async updateImportRecord(
    importId: string,
    userId: string,
    updates: Partial<ImportRecord>,
  ): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    await firestore
      .collection('users')
      .doc(userId)
      .collection('imports')
      .doc(importId)
      .update(updates);
  }

  /**
   * Generate template (Excel or JSON)
   */
  async generateTemplate(format: 'excel' | 'json' = 'excel'): Promise<Buffer> {
    if (format === 'json') {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const formatDate = (date: Date) => date.toISOString().split('T')[0];

      const exampleData = [
        {
          fecha: formatDate(today),
          monto: 45.50,
          concepto: 'Almuerzo ejecutivo',
          categoria: 'Alimentación',
          subcategoria: 'Restaurantes',
          metodoPago: 'Tarjeta Crédito',
          moneda: 'PEN',
          comercio: 'Restaurante El Buen Sabor',
          descripcion: 'Almuerzo con cliente',
        },
        {
          fecha: formatDate(yesterday),
          monto: 120.00,
          concepto: 'Combustible',
          categoria: 'Transporte',
          subcategoria: 'Gasolina',
          metodoPago: 'Efectivo',
          moneda: 'PEN',
          comercio: 'Grifo Primax',
          descripcion: 'Llenado de tanque',
        },
        {
          fecha: formatDate(yesterday),
          monto: 29.90,
          concepto: 'Suscripción Netflix',
          categoria: 'Entretenimiento',
          subcategoria: 'Streaming',
          metodoPago: 'Tarjeta Débito',
          moneda: 'PEN',
          comercio: 'Netflix',
          descripcion: 'Mensualidad',
        },
        {
          fecha: formatDate(today),
          monto: 15.00,
          concepto: 'Taxi a oficina',
          categoria: 'Transporte',
          subcategoria: 'Taxi',
          metodoPago: 'Yape',
          moneda: 'PEN',
          comercio: 'Uber',
          descripcion: '',
        }
      ];
      
      return Buffer.from(JSON.stringify(exampleData, null, 2));
    }

    return await ExcelParserUtil.generateTemplate();
  }
}
