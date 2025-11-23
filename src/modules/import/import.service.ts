import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AnthropicService } from '../anthropic/anthropic.service';
import { CategoriesService } from '../categories/categories.service';
import { ImportExpenseDto } from './dto/import-expense.dto';
import { AnalyzeOptionsDto } from './dto/analyze-expenses.dto';
import {
  ValidateResult,
  AnalyzeResult,
  UploadResult,
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

  /**
   * Normalize text: lowercase, remove accents, replace spaces with underscore
   */
  private normalizeText(text: string | undefined): string | undefined {
    if (!text) return text;
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  }

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly anthropicService: AnthropicService,
    private readonly categoriesService: CategoriesService,
  ) {}

  /**
   * Step 1: Validate file and return array of valid expenses
   */
  async validateFile(
    file: Express.Multer.File,
    format: 'excel' | 'json',
  ): Promise<ValidateResult> {
    // Validate file size
    if (file.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException(
        `El archivo excede el tamaño máximo permitido de ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    this.logger.log(`Validating ${format} file: ${file.originalname}`);

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
    const { valid, errors } = await ExpenseValidatorUtil.validateExpenses(expenses);

    // Generate warnings
    const warnings = ExpenseValidatorUtil.generateWarnings(valid);

    this.logger.log(`Validation complete: ${valid.length} valid, ${errors.length} errors`);

    return {
      success: errors.length === 0,
      totalRows: expenses.length,
      validCount: valid.length,
      invalidCount: expenses.length - valid.length,
      data: valid,
      errors,
      warnings,
    };
  }

  /**
   * Step 2: Analyze expenses with options (skip duplicates, auto-categorize)
   */
  async analyzeExpenses(
    userId: string,
    expenses: ImportExpenseDto[],
    options: AnalyzeOptionsDto,
  ): Promise<AnalyzeResult> {
    this.logger.log(`Analyzing ${expenses.length} expenses for user ${userId}`);

    let processedExpenses = [...expenses];
    let duplicatesRemoved = 0;
    let categorized = 0;

    // Skip duplicates if requested
    if (options.skipDuplicates) {
      const { filtered, removed } = await this.filterDuplicates(userId, processedExpenses);
      processedExpenses = filtered;
      duplicatesRemoved = removed;
      this.logger.log(`Removed ${duplicatesRemoved} duplicates`);
    }

    // Auto-categorize with AI if requested
    if (options.autoCategorizate) {
      categorized = await this.autoCategorizeExpenses(userId, processedExpenses);
      this.logger.log(`Categorized ${categorized} expenses with AI`);
    }

    // Generate AI suggestions for improvement
    let aiSuggestions: AISuggestion[] | undefined;
    try {
      aiSuggestions = await this.generateAISuggestions(processedExpenses);
    } catch (error) {
      this.logger.error('Error generating AI suggestions', error);
    }

    // Normalize categoria, subcategoria, metodoPago (lowercase, no accents)
    const normalizedExpenses = processedExpenses.map(expense => ({
      ...expense,
      categoria: this.normalizeText(expense.categoria),
      subcategoria: this.normalizeText(expense.subcategoria),
      metodoPago: this.normalizeText(expense.metodoPago),
    }));

    return {
      success: true,
      totalProcessed: normalizedExpenses.length,
      data: normalizedExpenses,
      duplicatesRemoved,
      categorized,
      aiSuggestions,
    };
  }

  /**
   * Step 3: Upload expenses to Firestore
   */
  async uploadExpenses(
    userId: string,
    expenses: ImportExpenseDto[],
    batchSize: number = 100,
  ): Promise<UploadResult> {
    this.logger.log(`Uploading ${expenses.length} expenses for user ${userId}`);

    const firestore = this.firebaseService.getFirestore();
    const gastosRef = firestore.collection('expenses');
    const errors: ImportError[] = [];
    let imported = 0;

    // Create import record
    const importRecord = await this.createImportRecord(
      userId,
      'import_from_app',
      'json',
      expenses.length,
    );

    // Process in batches
    for (let i = 0; i < expenses.length; i += batchSize) {
      const batch = firestore.batch();
      const chunk = expenses.slice(i, i + batchSize);

      for (let j = 0; j < chunk.length; j++) {
        const expense = chunk[j];
        const rowNumber = i + j + 1;

        try {
          const docRef = gastosRef.doc();
          const expenseData = {
            userId,
            fecha: Timestamp.fromDate(new Date(expense.fecha)),
            monto: expense.monto,
            concepto: expense.concepto,
            categoria: expense.categoria || 'Sin categoría',
            subcategoria: expense.subcategoria || null,
            metodoPago: expense.metodoPago || 'Efectivo',
            moneda: expense.moneda || 'PEN',
            comercio: expense.comercio || null,
            descripcion: expense.descripcion || null,
            importId: importRecord.id,
            createdAt: Timestamp.now(),
          };

          batch.set(docRef, expenseData);
          imported++;
        } catch (error) {
          errors.push({
            row: rowNumber,
            field: 'general',
            message: error.message,
          });
        }
      }

      try {
        await batch.commit();
        this.logger.log(`Committed batch ${Math.floor(i / batchSize) + 1}: ${chunk.length} expenses`);
      } catch (error) {
        this.logger.error(`Batch commit failed: ${error.message}`);
        // Add errors for all items in failed batch
        for (let j = 0; j < chunk.length; j++) {
          errors.push({
            row: i + j + 1,
            field: 'batch',
            message: `Error en batch: ${error.message}`,
          });
        }
        imported -= chunk.length;
      }
    }

    // Update import record
    await this.updateImportRecord(importRecord.id, userId, {
      imported,
      skipped: expenses.length - imported,
      status: errors.length === 0 ? 'completed' : 'failed',
      errors,
      completedAt: Timestamp.now(),
    });

    this.logger.log(`Upload complete: ${imported} imported, ${errors.length} failed`);

    return {
      success: errors.length === 0,
      totalRows: expenses.length,
      imported,
      failed: expenses.length - imported,
      importId: importRecord.id,
      errors,
    };
  }

  /**
   * Filter duplicates by checking against existing expenses in DB
   */
  private async filterDuplicates(
    userId: string,
    expenses: ImportExpenseDto[],
  ): Promise<{ filtered: ImportExpenseDto[]; removed: number }> {
    const firestore = this.firebaseService.getFirestore();
    const filtered: ImportExpenseDto[] = [];
    let removed = 0;

    for (const expense of expenses) {
      const expenseDate = Timestamp.fromDate(new Date(expense.fecha));

      const snapshot = await firestore
        .collection('expenses')
        .where('userId', '==', userId)
        .where('fecha', '==', expenseDate)
        .where('monto', '==', expense.monto)
        .where('concepto', '==', expense.concepto)
        .limit(1)
        .get();

      if (snapshot.empty) {
        filtered.push(expense);
      } else {
        removed++;
      }
    }

    return { filtered, removed };
  }

  /**
   * Auto-categorize expenses without category using AI
   */
  private async autoCategorizeExpenses(
    userId: string,
    expenses: ImportExpenseDto[],
  ): Promise<number> {
    const categories = await this.categoriesService.getCategoryNames(userId);
    let categorized = 0;

    for (const expense of expenses) {
      if (!expense.categoria) {
        try {
          const suggestedCategory = await this.anthropicService.categorizeExpense(
            expense.concepto,
            expense.monto,
            expense.comercio,
            categories,
          );

          if (categories.includes(suggestedCategory)) {
            expense.categoria = suggestedCategory;
            categorized++;
          }
        } catch (error) {
          this.logger.error(`Error auto-categorizing: ${expense.concepto}`, error);
        }
      }
    }

    return categorized;
  }

  /**
   * Generate AI suggestions for data improvement
   */
  private async generateAISuggestions(
    expenses: ImportExpenseDto[],
  ): Promise<AISuggestion[]> {
    const suggestions: AISuggestion[] = [];

    const summary = {
      totalExpenses: expenses.length,
      withoutCategory: expenses.filter((e) => !e.categoria).length,
      withoutPaymentMethod: expenses.filter((e) => !e.metodoPago).length,
      sampleExpenses: expenses.slice(0, 5),
    };

    const prompt = `Analiza los siguientes datos de importación de gastos y proporciona sugerencias breves para mejorar la calidad:

${JSON.stringify(summary, null, 2)}

Proporciona máximo 3 sugerencias en formato JSON con un array, cada una con: type (category|duplicate|format|missing|anomaly), message, affectedRows (array de números), suggestion, confidence (0-1).`;

    try {
      const response = await this.anthropicService.sendMessage(prompt, []);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const aiSuggestions = JSON.parse(jsonMatch[0]);
        suggestions.push(...aiSuggestions);
      }
    } catch (error) {
      this.logger.error('Error generating AI suggestions', error);
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
          monto: 45.5,
          concepto: 'Almuerzo ejecutivo',
          categoria: 'alimentacion',
          subcategoria: 'restaurantes',
          metodoPago: 'tarjeta credito',
          moneda: 'PEN',
          comercio: 'Restaurante El Buen Sabor',
          descripcion: 'Almuerzo con cliente',
        },
        {
          fecha: formatDate(yesterday),
          monto: 20.0,
          concepto: 'combustible',
          categoria: 'transporte',
          subcategoria: 'gasolina',
          metodoPago: 'efectivo',
          moneda: 'PEN',
          comercio: 'grifo primax',
          descripcion: 'Llenado de tanque',
        },
        {
          fecha: formatDate(yesterday),
          monto: 40,
          concepto: 'suscripción Netflix',
          categoria: 'entretenimiento',
          subcategoria: 'streaming',
          metodoPago: 'tarjeta debito',
          moneda: 'PEN',
          comercio: 'Netflix',
          descripcion: 'Mensualidad',
        },
        {
          fecha: formatDate(today),
          monto: 15.0,
          concepto: 'taxi a oficina',
          categoria: 'transporte',
          subcategoria: 'taxi',
          metodoPago: 'yape',
          moneda: 'PEN',
          comercio: 'Uber',
          descripcion: '',
        },
      ];

      return Buffer.from(JSON.stringify(exampleData, null, 2));
    }

    return await ExcelParserUtil.generateTemplate();
  }
}
