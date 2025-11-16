import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ImageProcessorService } from './image-processor.service';
import { CategoryMatcherService } from '../../utils/category-matcher.service';

@Module({
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ImageProcessorService, CategoryMatcherService],
  exports: [ReceiptsService, ImageProcessorService, CategoryMatcherService],
})
export class ReceiptsModule {}
