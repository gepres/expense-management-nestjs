import { Module } from '@nestjs/common';
import { ProgramadosController } from './programados.controller';
import { ProgramadosService } from './programados.service';
import { ProgramadosCron } from './programados.cron';

@Module({
  controllers: [ProgramadosController],
  providers: [ProgramadosService, ProgramadosCron],
  exports: [ProgramadosService],
})
export class ProgramadosModule {}
