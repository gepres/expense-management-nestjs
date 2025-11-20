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
import { UploadFileDto, ImportOptionsDto } from './dto/import-options.dto';

@ApiTags('Import')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Importar gastos desde archivo',
    description:
      'Sube un archivo Excel o JSON con gastos para importarlos masivamente. El archivo será validado, procesado por lotes y los gastos se guardarán en Firestore. Opcionalmente, puede usar IA para categorizar automáticamente.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'format'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo Excel (.xlsx, .xls) o JSON',
        },
        format: {
          type: 'string',
          enum: ['excel', 'json'],
          description: 'Formato del archivo (opcional)',
        },
        batchSize: {
          type: 'number',
          description: 'Tamaño del lote (50-500)',
          default: 100,
        },
        skipDuplicates: {
          type: 'boolean',
          description: 'Omitir duplicados',
          default: true,
        },
        autoCategorizate: {
          type: 'boolean',
          description: 'Categorizar automáticamente con IA',
          default: false,
        },
        validateOnly: {
          type: 'boolean',
          description: 'Solo validar sin importar',
          default: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Archivo procesado exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        totalRows: { type: 'number' },
        imported: { type: 'number' },
        skipped: { type: 'number' },
        errors: { type: 'array' },
        warnings: { type: 'array' },
        aiSuggestions: { type: 'array' },
        importId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Archivo inválido o demasiado grande' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async uploadFile(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const userId = req.user.uid;
    const format = this.detectFormat(file, dto.format);
    return this.importService.processFile(userId, file, format, dto);
  }

  @Post('validate')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Validar archivo sin importar',
    description:
      'Valida un archivo Excel o JSON sin importar los datos. Útil para verificar la estructura y detectar errores antes de la importación real.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        format: {
          type: 'string',
          enum: ['excel', 'json'],
          description: 'Formato del archivo (opcional)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Validación completada',
  })
  @ApiResponse({ status: 400, description: 'Archivo inválido' })
  async validateFile(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { format?: 'excel' | 'json' },
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const userId = req.user.uid;
    const format = this.detectFormat(file, body.format);
    const options: ImportOptionsDto = {
      validateOnly: true,
      batchSize: 100,
      skipDuplicates: false,
      autoCategorizate: false,
    };
    console.log('userId', userId);
    console.log('format', format);
    console.log('options', options);
    

    return this.importService.processFile(userId, file, format, options);
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Vista previa de datos del archivo',
    description:
      'Obtiene una vista previa de los primeros registros del archivo sin importarlos. Muestra cómo se interpretarán los datos.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'format'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        format: {
          type: 'string',
          enum: ['excel', 'json'],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Vista previa generada',
  })
  async previewFile(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { format?: 'excel' | 'json' },
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const userId = req.user.uid;
    const format = this.detectFormat(file, body.format);
    const options: ImportOptionsDto = {
      validateOnly: true,
      batchSize: 10, // Solo preview de 10 registros
      skipDuplicates: false,
      autoCategorizate: false,
    };

    return this.importService.processFile(userId, file, format, options);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Obtener historial de importaciones',
    description:
      'Obtiene el historial de las últimas 50 importaciones realizadas por el usuario, incluyendo estadísticas y errores.',
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
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getHistory(@Req() req: any) {
    const userId = req.user.uid;
    return this.importService.getImportHistory(userId);
  }

  @Get('template')
  @ApiOperation({
    summary: 'Descargar plantilla (Excel o JSON)',
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
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: { type: 'string', format: 'binary' },
      },
      'application/json': {
        schema: { type: 'array', items: { type: 'object' } },
      },
    },
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

  @Post('analyze')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Analizar archivo con IA',
    description:
      'Analiza el archivo con IA para obtener sugerencias de mejora, detectar anomalías y recomendar categorizaciones. No importa los datos.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'format'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        format: {
          type: 'string',
          enum: ['excel', 'json'],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Análisis completado',
    schema: {
      type: 'object',
      properties: {
        aiSuggestions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              message: { type: 'string' },
              affectedRows: { type: 'array' },
              suggestion: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
        },
        summary: { type: 'object' },
      },
    },
  })
  async analyzeFile(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { format?: 'excel' | 'json' },
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const userId = req.user.uid;
    const format = this.detectFormat(file, body.format);
    const options: ImportOptionsDto = {
      validateOnly: true,
      batchSize: 100,
      skipDuplicates: false,
      autoCategorizate: false,
    };

    const result = await this.importService.processFile(
      userId,
      file,
      format,
      options,
    );

    return {
      aiSuggestions: result.aiSuggestions,
      summary: {
        totalRows: result.totalRows,
        errors: result.errors.length,
        warnings: result.warnings.length,
      },
    };
  }


  private detectFormat(
    file: Express.Multer.File,
    requestedFormat?: 'excel' | 'json',
  ): 'excel' | 'json' {
    // 1. Si se especificó formato explícito, usarlo
    if (requestedFormat) {
      return requestedFormat;
    }

    // 2. Intentar detectar por mimetype
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

    // 3. Intentar detectar por extensión
    const originalName = file.originalname.toLowerCase();
    if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls')) {
      return 'excel';
    }

    if (originalName.endsWith('.json')) {
      return 'json';
    }

    // 4. Si no se puede detectar, lanzar error
    throw new BadRequestException(
      'No se pudo determinar el formato del archivo. Por favor especifica el formato (excel o json) o usa un archivo con extensión válida.',
    );
  }
}
