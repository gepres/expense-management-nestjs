import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  constructor(private configService: ConfigService) {
    // Configurar Cloudinary
    cloudinary.config({
      cloud_name: this.configService.get<string>('cloudinary.cloudName'),
      api_key: this.configService.get<string>('cloudinary.apiKey'),
      api_secret: this.configService.get<string>('cloudinary.apiSecret'),
    });

    this.logger.log('Cloudinary configured successfully');
  }

  /**
   * Validar imagen
   */
  validateImage(file: Express.Multer.File): void {
    const maxSize = this.configService.get<number>('MAX_FILE_SIZE') || 5242880; // 5MB
    const allowedTypes = this.configService.get<string>('ALLOWED_IMAGE_TYPES')?.split(',') ||
      ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedTypes.includes(file.mimetype)) {
      const types = allowedTypes.join(', ');
      throw new BadRequestException(
        `Tipo de archivo no permitido. Tipos aceptados: ${types}`,
      );
    }

    if (file.size > maxSize) {
      const maxMB = maxSize / 1024 / 1024;
      throw new BadRequestException(
        `El archivo es demasiado grande. Tama�o m�ximo: ${maxMB}MB`,
      );
    }

    this.logger.log(`Imagen validada: ${file.originalname} (${file.size} bytes)`);
  }

  /**
   * Comprimir imagen si es necesario
   */
  async compressImage(buffer: Buffer): Promise<Buffer> {
    const maxSize = 2 * 1024 * 1024; // 2MB

    if (buffer.length <= maxSize) {
      this.logger.log('Imagen no requiere compresi�n');
      return buffer;
    }

    this.logger.log(`Comprimiendo imagen de ${buffer.length} bytes`);

    const compressed = await sharp(buffer)
      .resize(1920, 1920, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    this.logger.log(`Imagen comprimida a ${compressed.length} bytes`);

    return compressed;
  }

  /**
   * Subir imagen a Cloudinary
   */
  async uploadToCloudinary(
    buffer: Buffer,
    filename: string,
  ): Promise<{ url: string; publicId: string }> {
    try {
      this.logger.log(`Subiendo imagen a Cloudinary: ${filename}`);

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'receipts',
            public_id: `receipt_${Date.now()}_${filename.replace(/\.[^/.]+$/, '')}`,
            resource_type: 'image',
            overwrite: true,
          },
          (error, result) => {
            if (error) {
              this.logger.error('Error al subir a Cloudinary', error);
              reject(error);
            } else if (result) {
              this.logger.log(
                `Imagen subida exitosamente: ${result.secure_url}`,
              );
              resolve({
                url: result.secure_url,
                publicId: result.public_id,
              });
            } else {
              reject(new Error('No se recibió resultado de Cloudinary'));
            }
          },
        );

        uploadStream.end(buffer);
      });
    } catch (error) {
      this.logger.error('Error al subir imagen a Cloudinary', error);
      throw new BadRequestException('Error al procesar la imagen');
    }
  }

  /**
   * Convertir buffer a base64 para Anthropic
   */
  convertToBase64(buffer: Buffer): string {
    return buffer.toString('base64');
  }

  /**
   * Eliminar imagen de Cloudinary
   */
  async deleteFromCloudinary(publicId: string): Promise<void> {
    try {
      this.logger.log(`Eliminando imagen de Cloudinary: ${publicId}`);
      await cloudinary.uploader.destroy(publicId);
      this.logger.log('Imagen eliminada exitosamente');
    } catch (error) {
      this.logger.error('Error al eliminar imagen de Cloudinary', error);
      throw error;
    }
  }

  /**
   * Proceso completo: validar, comprimir y subir
   */
  async processAndUpload(
    file: Express.Multer.File,
  ): Promise<{ url: string; publicId: string; base64: string }> {
    // Validar
    this.validateImage(file);

    // Comprimir si es necesario
    const compressedBuffer = await this.compressImage(file.buffer);

    // Subir a Cloudinary
    const { url, publicId } = await this.uploadToCloudinary(
      compressedBuffer,
      file.originalname,
    );

    // Convertir a base64 para Anthropic
    const base64 = this.convertToBase64(compressedBuffer);

    return { url, publicId, base64 };
  }
}
