import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { ImportService } from './import.service';
import { ValidateFileDto } from './dto/validate-file.dto';
import { AnalyzeExpensesDto } from './dto/analyze-expenses.dto';
import { UploadExpensesDto } from './dto/upload-expenses.dto';

@ApiTags('Import')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /**
   * Step 1: Validate file and return array of valid expenses
   */
  @Post('validate')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Paso 1: Validar archivo',
    description:
      'Valida un archivo Excel o JSON y retorna un array de gastos válidos. El frontend debe almacenar este array para enviarlo al endpoint /analyze.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo Excel (.xlsx, .xls) o JSON',
        },
        format: {
          type: 'string',
          enum: ['excel', 'json'],
          description: 'Formato del archivo (opcional, se detecta automáticamente)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Validación completada',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        totalRows: { type: 'number' },
        validCount: { type: 'number' },
        invalidCount: { type: 'number' },
        data: {
          type: 'array',
          description: 'Array de gastos válidos para enviar a /analyze',
        },
        errors: { type: 'array' },
        warnings: { type: 'array' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Archivo inválido o demasiado grande' })
  async validateFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ValidateFileDto,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const format = this.detectFormat(file, dto.format);
    return this.importService.validateFile(file, format);
  }

  /**
   * Step 2: Analyze expenses with options
   */
  @Post('analyze')
  @ApiOperation({
    summary: 'Paso 2: Analizar y mejorar gastos',
    description:
      'Recibe el array de gastos validados, aplica las opciones (omitir duplicados, auto-categorizar) y retorna el array mejorado. El frontend debe almacenar este array para enviarlo al endpoint /upload.',
  })
  @ApiBody({ type: AnalyzeExpensesDto })
  @ApiResponse({
    status: 200,
    description: 'Análisis completado',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        totalProcessed: { type: 'number' },
        data: {
          type: 'array',
          description: 'Array de gastos mejorados para enviar a /upload',
        },
        duplicatesRemoved: { type: 'number' },
        categorized: { type: 'number' },
        aiSuggestions: { type: 'array' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async analyzeExpenses(
    @Req() req: any,
    @Body() dto: AnalyzeExpensesDto,
  ) {
    const userId = req.user.uid;
    return this.importService.analyzeExpenses(userId, dto.expenses, dto.options);
  }

  /**
   * Step 3: Upload expenses to database
   */
  @Post('upload')
  @ApiOperation({
    summary: 'Paso 3: Guardar gastos en base de datos',
    description:
      'Recibe el array de gastos finales (validados y mejorados) y los guarda en Firestore. Retorna el resultado de la importación.',
  })
  @ApiBody({ type: UploadExpensesDto })
  @ApiResponse({
    status: 201,
    description: 'Importación completada',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        totalRows: { type: 'number' },
        imported: { type: 'number' },
        failed: { type: 'number' },
        importId: { type: 'string' },
        errors: { type: 'array' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async uploadExpenses(
    @Req() req: any,
    @Body() dto: UploadExpensesDto,
  ) {
    const userId = req.user.uid;
    return this.importService.uploadExpenses(userId, dto.expenses, dto.batchSize);
  }

  /**
   * Get import history
   */
  @Get('history')
  @ApiOperation({
    summary: 'Obtener historial de importaciones',
    description:
      'Obtiene el historial de las últimas 50 importaciones realizadas por el usuario.',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial obtenido exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          fileName: { type: 'string' },
          format: { type: 'string' },
          totalRows: { type: 'number' },
          imported: { type: 'number' },
          skipped: { type: 'number' },
          status: { type: 'string' },
          createdAt: { type: 'object' },
          completedAt: { type: 'object' },
        },
      },
    },
  })
  async getHistory(@Req() req: any) {
    const userId = req.user.uid;
    return this.importService.getImportHistory(userId);
  }

  /**
   * Download template
   */
  @Get('template')
  @ApiOperation({
    summary: 'Descargar plantilla',
    description:
      'Descarga una plantilla con el formato correcto y datos de ejemplo. Soporta Excel (por defecto) y JSON.',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['excel', 'json'],
    description: 'Formato de la plantilla (default: excel)',
  })
  @ApiResponse({
    status: 200,
    description: 'Plantilla descargada exitosamente',
  })
  async downloadTemplate(
    @Res() res: Response,
    @Query('format') format: 'excel' | 'json' = 'excel',
  ) {
    const template = await this.importService.generateTemplate(format);

    if (format === 'json') {
      res.set({
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="plantilla_gastos.json"',
      });
    } else {
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="plantilla_gastos.xlsx"',
      });
    }

    res.set('Content-Length', template.length.toString());
    res.status(HttpStatus.OK).send(template);
  }

  /**
   * Detect file format from mimetype or extension
   */
  private detectFormat(
    file: Express.Multer.File,
    requestedFormat?: 'excel' | 'json',
  ): 'excel' | 'json' {
    if (requestedFormat) {
      return requestedFormat;
    }

    const mime = file.mimetype;
    if (
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel'
    ) {
      return 'excel';
    }

    if (mime === 'application/json') {
      return 'json';
    }

    const originalName = file.originalname.toLowerCase();
    if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls')) {
      return 'excel';
    }

    if (originalName.endsWith('.json')) {
      return 'json';
    }

    throw new BadRequestException(
      'No se pudo determinar el formato del archivo. Por favor especifica el formato (excel o json) o usa un archivo con extensión válida.',
    );
  }
}
