import { Module } from '@nestjs/common';
import { PresupuestosController } from './presupuestos.controller';
import { PresupuestosService } from './presupuestos.service';

@Module({
  controllers: [PresupuestosController],
  providers: [PresupuestosService],
  exports: [PresupuestosService],
})
export class PresupuestosModule {}
