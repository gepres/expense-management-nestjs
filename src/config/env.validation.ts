import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:5173';

  // Firebase
  @IsString()
  @IsOptional()
  FIREBASE_SERVICE_ACCOUNT_PATH: string;

  @IsString()
  @IsOptional()
  FIREBASE_PROJECT_ID: string;

  @IsString()
  @IsOptional()
  FIREBASE_PRIVATE_KEY: string;

  @IsString()
  @IsOptional()
  FIREBASE_CLIENT_EMAIL: string;

  @IsString()
  @IsOptional()
  FIREBASE_STORAGE_BUCKET: string;

  // Anthropic
  @IsString()
  ANTHROPIC_API_KEY: string;

  @IsString()
  @IsOptional()
  ANTHROPIC_MODEL: string = 'claude-sonnet-4-20250514';

  // Cloudinary
  @IsString()
  @IsOptional()
  CLOUDINARY_CLOUD_NAME: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_API_KEY: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_API_SECRET: string;

  // Upload
  @IsNumber()
  @IsOptional()
  MAX_FILE_SIZE: number = 5242880;

  @IsString()
  @IsOptional()
  ALLOWED_IMAGE_TYPES: string = 'image/jpeg,image/png,image/webp';

  // Rate Limiting
  @IsNumber()
  @IsOptional()
  THROTTLE_TTL: number = 60000;

  @IsNumber()
  @IsOptional()
  THROTTLE_LIMIT: number = 100;

  @IsNumber()
  @IsOptional()
  SCAN_THROTTLE_LIMIT: number = 10;

  @IsNumber()
  @IsOptional()
  AI_THROTTLE_LIMIT: number = 20;

  // Logging
  @IsString()
  @IsOptional()
  LOG_LEVEL: string = 'debug';
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
