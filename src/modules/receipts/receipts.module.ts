import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ImageProcessorService } from './image-processor.service';
import { InferenceModule } from '../inference/inference.module';

@Module({
  imports: [InferenceModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ImageProcessorService],
  exports: [ReceiptsService, ImageProcessorService],
})
export class ReceiptsModule {}
