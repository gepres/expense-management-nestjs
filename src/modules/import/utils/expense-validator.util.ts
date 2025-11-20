import { ImportExpenseDto } from '../dto/import-expense.dto';
import { ImportError } from '../interfaces/import-result.interface';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

export class ExpenseValidatorUtil {
  /**
   * Validate array of expenses
   */
  static async validateExpenses(
    expenses: ImportExpenseDto[],
  ): Promise<{ valid: ImportExpenseDto[]; errors: ImportError[] }> {
    const valid: ImportExpenseDto[] = [];
    const errors: ImportError[] = [];

    for (let i = 0; i < expenses.length; i++) {
      const expense = expenses[i];
      const rowNumber = i + 2; // +2 porque fila 1 es header, índice empieza en 0

      // Convertir a clase para validación
      const expenseDto = plainToClass(ImportExpenseDto, expense);
      const validationErrors = await validate(expenseDto);

      if (validationErrors.length > 0) {
        // Agregar errores de validación
        for (const error of validationErrors) {
          errors.push({
            row: rowNumber,
            field: error.property,
            message: Object.values(error.constraints || {}).join(', '),
            value: expense[error.property as keyof ImportExpenseDto],
          });
        }
      } else {
        // Validaciones adicionales
        const customErrors = this.customValidations(expense, rowNumber);
        if (customErrors.length > 0) {
          errors.push(...customErrors);
        } else {
          valid.push(expenseDto);
        }
      }
    }

    return { valid, errors };
  }

  /**
   * Custom validations beyond class-validator
   */
  private static customValidations(
    expense: ImportExpenseDto,
    rowNumber: number,
  ): ImportError[] {
    const errors: ImportError[] = [];

    // Validar fecha no sea futura
    // Validar fecha no sea futura (permitir hoy con margen por zona horaria)
    const expenseDate = new Date(expense.fecha);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Final del día de hoy
    
    // Añadir 1 día de margen por diferencias de zona horaria
    today.setDate(today.getDate() + 1);

    if (expenseDate > today) {
      errors.push({
        row: rowNumber,
        field: 'fecha',
        message: 'La fecha no puede ser futura',
        value: expense.fecha,
      });
    }

    // Validar fecha no sea muy antigua (más de 5 años)
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    if (expenseDate < fiveYearsAgo) {
      errors.push({
        row: rowNumber,
        field: 'fecha',
        message: 'La fecha es demasiado antigua (más de 5 años)',
        value: expense.fecha,
      });
    }

    // Validar monto no sea excesivamente alto (posible error)
    if (expense.monto > 100000) {
      errors.push({
        row: rowNumber,
        field: 'monto',
        message: 'El monto parece excesivamente alto. Verifica que sea correcto.',
        value: expense.monto,
      });
    }

    // Validar concepto no sea muy corto
    if (expense.concepto && expense.concepto.length < 3) {
      errors.push({
        row: rowNumber,
        field: 'concepto',
        message: 'El concepto es demasiado corto (mínimo 3 caracteres)',
        value: expense.concepto,
      });
    }

    // Validar código de moneda si está presente
    const validCurrencies = ['PEN', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'MXN'];
    if (expense.moneda && !validCurrencies.includes(expense.moneda.toUpperCase())) {
      errors.push({
        row: rowNumber,
        field: 'moneda',
        message: `Código de moneda no válido. Debe ser uno de: ${validCurrencies.join(', ')}`,
        value: expense.moneda,
      });
    }

    return errors;
  }

  /**
   * Detect potential duplicates
   */
  static detectDuplicates(expenses: ImportExpenseDto[]): number[][] {
    const duplicates: number[][] = [];
    const seen = new Map<string, number[]>();

    expenses.forEach((expense, index) => {
      // Crear clave única basada en fecha, monto y concepto
      const key = `${expense.fecha}-${expense.monto}-${expense.concepto.toLowerCase().trim()}`;
      
      if (seen.has(key)) {
        const existingIndices = seen.get(key)!;
        existingIndices.push(index + 2); // +2 para número de fila real
        seen.set(key, existingIndices);
      } else {
        seen.set(key, [index + 2]);
      }
    });

    // Filtrar solo los que tienen duplicados
    seen.forEach((indices) => {
      if (indices.length > 1) {
        duplicates.push(indices);
      }
    });

    return duplicates;
  }

  /**
   * Generate warnings for data quality issues
   */
  static generateWarnings(expenses: ImportExpenseDto[]): string[] {
    const warnings: string[] = [];

    // Contar gastos sin categoría
    const withoutCategory = expenses.filter(e => !e.categoria).length;
    if (withoutCategory > 0) {
      warnings.push(
        `${withoutCategory} gasto(s) sin categoría. Considera usar la categorización automática con IA.`,
      );
    }

    // Contar gastos sin método de pago
    const withoutPaymentMethod = expenses.filter(e => !e.metodoPago).length;
    if (withoutPaymentMethod > 0) {
      warnings.push(
        `${withoutPaymentMethod} gasto(s) sin método de pago especificado.`,
      );
    }

    // Detectar duplicados
    const duplicates = this.detectDuplicates(expenses);
    if (duplicates.length > 0) {
      warnings.push(
        `Se detectaron ${duplicates.length} grupo(s) de posibles duplicados. Revisa las filas: ${duplicates.map(d => d.join(', ')).join(' | ')}`,
      );
    }

    // Verificar distribución de fechas
    const dates = expenses.map(e => new Date(e.fecha));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const daysDiff = Math.floor((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 365) {
      warnings.push(
        `Los gastos abarcan un rango de ${daysDiff} días (${minDate.toLocaleDateString()} - ${maxDate.toLocaleDateString()}). Verifica que todas las fechas sean correctas.`,
      );
    }

    return warnings;
  }
}
