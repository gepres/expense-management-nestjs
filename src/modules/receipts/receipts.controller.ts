import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { ReceiptsService } from './receipts.service';
import { ImageProcessorService } from './image-processor.service';
import { AnthropicService } from '../anthropic/anthropic.service';
import { CategoryMatcherService } from '../../utils/category-matcher.service';

@ApiTags('Receipts')
@Controller('receipts')
export class ReceiptsController {
  private readonly logger = new Logger(ReceiptsController.name);

  constructor(
    private readonly receiptsService: ReceiptsService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly anthropicService: AnthropicService,
    private readonly categoryMatcher: CategoryMatcherService,
  ) {}

  @Post('scan')
  @ApiOperation({
    summary: 'Escanear comprobante/boleta y extraer datos con IA',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Imagen del comprobante (JPG, PNG, WEBP)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Comprobante escaneado exitosamente',
    schema: {
      example: {
        success: true,
        receiptId: '123abc',
        imageUrl: 'https://res.cloudinary.com/...',
        data: {
          amount: 45.5,
          currency: 'PEN',
          date: '2025-01-15',
          time: '14:30:45',
          paymentMethod: 'yape',
          merchant: 'Restaurante El Paisa',
          referenceNumber: '123456',
          category: 'Alimentación',
          subcategory: 'Restaurante',
          description: 'Almuerzo',
          confidence: 95,
        },
        suggestions: [],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Archivo inválido' })
  @UseInterceptors(FileInterceptor('image'))
  async scanReceipt(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ninguna imagen');
    }

    this.logger.log(`Procesando imagen: ${file.originalname}`);

    try {
      // 1. Procesar y subir imagen a Cloudinary
      const { url, publicId, base64 } =
        await this.imageProcessor.processAndUpload(file);

      // 2. Crear registro del recibo en Firestore
      const receipt = await this.receiptsService.create({
        imageUrl: url,
        status: 'pending',
      });

      this.logger.log(`Receipt created: ${receipt.id}`);

      // 3. Extraer datos con Anthropic Vision
      let extractedData;
      let status: 'processed' | 'failed' = 'processed';
      let errorMessage: string | undefined;

      try {
        extractedData = await this.anthropicService.extractReceiptData(base64);
        this.logger.log(
          `Datos extraídos con confianza: ${extractedData.confidence}%`,
        );

        // 3.1. Buscar subcategoría basada en keywords
        if (extractedData) {
          const matchResult = this.categoryMatcher.findSubcategory(
            extractedData.description,
            extractedData.merchant,
          );

          if (matchResult) {
            this.logger.log(
              `Subcategoría encontrada: ${matchResult.category} > ${matchResult.subcategory}`,
            );

            // Actualizar categoría y agregar subcategoría
            extractedData.category = matchResult.category;
            extractedData.subcategory = matchResult.subcategory;
          } else {
            this.logger.log(
              'No se encontró subcategoría específica, usando categoría general de IA',
            );
          }

          // 3.2. Si no hay hora en la boleta, usar hora actual de la solicitud
          if (!extractedData.time) {
            const now = new Date();
            extractedData.time = now.toTimeString().split(' ')[0]; // Formato HH:mm:ss
            this.logger.log(
              `No se encontró hora en la boleta, usando hora de solicitud: ${extractedData.time}`,
            );
          }
        }
      } catch (error) {
        this.logger.error('Error al extraer datos con IA', error);
        status = 'failed';
        errorMessage = 'Error al procesar la imagen con IA';
      }

      // 4. Actualizar recibo con los datos extraídos
      await this.receiptsService.update(receipt.id, {
        extractedData,
        status,
        errorMessage,
      });

      // 5. Preparar respuesta
      const suggestions: string[] = [];
      if (extractedData?.confidence && extractedData.confidence < 70) {
        suggestions.push(
          'La confianza en la extracción es baja. Verifica los datos manualmente.',
        );
      }

      return {
        success: status === 'processed',
        receiptId: receipt.id,
        imageUrl: url,
        cloudinaryPublicId: publicId,
        data: extractedData || {},
        suggestions,
        status,
        errorMessage,
      };
    } catch (error) {
      this.logger.error('Error en el proceso de escaneo', error);
      throw new BadRequestException('Error al procesar el comprobante');
    }
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los comprobantes procesados' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'processed', 'failed'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Lista de comprobantes',
    schema: {
      example: [
        {
          id: '123abc',
          imageUrl: 'https://res.cloudinary.com/...',
          extractedData: {
            amount: 45.5,
            currency: 'PEN',
          },
          status: 'processed',
          createdAt: '2025-01-15T10:30:00Z',
        },
      ],
    },
  })
  async findAll(@Query('status') status?: string, @Query('limit') limit?: number) {
    const filters = {
      status,
      limit: limit ? Number(limit) : undefined,
    };

    return this.receiptsService.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un comprobante' })
  @ApiResponse({
    status: 200,
    description: 'Comprobante encontrado',
  })
  @ApiResponse({ status: 404, description: 'Comprobante no encontrado' })
  async findOne(@Param('id') id: string) {
    return this.receiptsService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un comprobante' })
  @ApiResponse({
    status: 200,
    description: 'Comprobante eliminado exitosamente',
    schema: {
      example: {
        success: true,
        message: 'Comprobante eliminado',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Comprobante no encontrado' })
  async delete(@Param('id') id: string) {
    // Obtener el recibo para obtener el publicId de Cloudinary
    const receipt = await this.receiptsService.findOne(id);

    // Extraer publicId de la URL de Cloudinary si existe
    if (receipt.imageUrl?.includes('cloudinary.com')) {
      try {
        const urlParts = receipt.imageUrl.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `receipts/${filename.split('.')[0]}`;

        // Eliminar de Cloudinary
        await this.imageProcessor.deleteFromCloudinary(publicId);
        this.logger.log(`Imagen eliminada de Cloudinary: ${publicId}`);
      } catch (error) {
        this.logger.warn('No se pudo eliminar la imagen de Cloudinary', error);
      }
    }

    // Eliminar de Firestore
    await this.receiptsService.delete(id);

    return {
      success: true,
      message: 'Comprobante eliminado exitosamente',
    };
  }
}
