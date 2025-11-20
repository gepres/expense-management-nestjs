import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { ImportExpenseDto } from '../dto/import-expense.dto';

export class ExcelParserUtil {
  /**
   * Parse Excel file buffer to expense array
   */
  static parseExcelFile(buffer: Buffer): ImportExpenseDto[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    
    if (!sheetName) {
      throw new Error('El archivo Excel está vacío');
    }

    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

    return jsonData.map((row: any, index: number) => {
      return this.normalizeRow(row, index + 2); // +2 porque fila 1 es header
    });
  }

  /**
   * Normalize row data to ImportExpenseDto format
   */
  private static normalizeRow(row: any, rowNumber: number): ImportExpenseDto {
    // Mapeo de nombres de columnas comunes
    const fieldMappings = {
      fecha: ['fecha', 'date', 'dia', 'day'],
      monto: ['monto', 'amount', 'precio', 'price', 'total'],
      concepto: ['concepto', 'concept', 'descripcion', 'description', 'detalle'],
      categoria: ['categoria', 'category', 'tipo', 'type'],
      subcategoria: ['subcategoria', 'subcategory'],
      metodoPago: ['metodoPago', 'metodo_pago', 'paymentMethod', 'payment_method', 'pago'],
      moneda: ['moneda', 'currency', 'divisa'],
      comercio: ['comercio', 'merchant', 'tienda', 'store', 'establecimiento'],
      descripcion: ['descripcion', 'description', 'notas', 'notes', 'comentarios'],
    };

    const normalized: any = {};

    // Normalizar cada campo
    for (const [targetField, possibleNames] of Object.entries(fieldMappings)) {
      for (const name of possibleNames) {
        const value = row[name] || row[name.toLowerCase()] || row[name.toUpperCase()];
        if (value !== undefined && value !== null && value !== '') {
          normalized[targetField] = value;
          break;
        }
      }
    }

    // Convertir monto a número
    if (normalized.monto) {
      normalized.monto = this.parseAmount(normalized.monto);
    }

    // Normalizar fecha
    if (normalized.fecha) {
      normalized.fecha = this.parseDate(normalized.fecha);
    }

    return normalized as ImportExpenseDto;
  }

  /**
   * Parse amount from various formats
   */
  private static parseAmount(value: any): number {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      // Remover símbolos de moneda y espacios
      const cleaned = value.replace(/[^\d.,-]/g, '');
      // Reemplazar coma por punto si es separador decimal
      const normalized = cleaned.replace(',', '.');
      return parseFloat(normalized);
    }

    return 0;
  }

  /**
   * Parse date from various formats
   */
  private static parseDate(value: any): string {
    if (!value) return '';

    // Si ya es una fecha ISO
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
      return value;
    }

    // Si es un número de Excel (serial date)
    if (typeof value === 'number') {
      const date = XLSX.SSF.parse_date_code(value);
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }

    // Intentar parsear formato DD/MM/YYYY o similar
    if (typeof value === 'string') {
      const parts = value.split(/[/-]/);
      if (parts.length === 3) {
        // Asumir DD/MM/YYYY
        const [day, month, year] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    return value.toString();
  }

  /**
   * Generate Excel template using ExcelJS
   */
  static async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Plantilla Gastos');

    // Datos de ejemplo dinámicos (fechas recientes)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // Definir columnas con headers
    worksheet.columns = [
      { header: 'fecha', key: 'fecha', width: 12 },
      { header: 'monto', key: 'monto', width: 10 },
      { header: 'concepto', key: 'concepto', width: 25 },
      { header: 'categoria', key: 'categoria', width: 15 },
      { header: 'subcategoria', key: 'subcategoria', width: 15 },
      { header: 'metodoPago', key: 'metodoPago', width: 15 },
      { header: 'moneda', key: 'moneda', width: 8 },
      { header: 'comercio', key: 'comercio', width: 25 },
      { header: 'descripcion', key: 'descripcion', width: 30 },
    ];

    // Estilo para el header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Agregar datos de ejemplo
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

    worksheet.addRows(exampleData);

    // Generar buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
