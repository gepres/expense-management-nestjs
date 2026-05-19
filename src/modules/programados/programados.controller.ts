import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProgramadosService } from './programados.service';
import { CreateGastoProgramadoDto } from './dto/create-gasto-programado.dto';
import { UpdateGastoProgramadoDto } from './dto/update-gasto-programado.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Programados')
@ApiBearerAuth('firebase-auth')
@Controller('programados/gastos')
@UseGuards(FirebaseAuthGuard)
export class ProgramadosController {
  constructor(private readonly programadosService: ProgramadosService) {}

  @Post()
  @ApiOperation({ summary: 'Crear gasto programado (recurrente)' })
  create(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: CreateGastoProgramadoDto,
  ) {
    return this.programadosService.create(user.uid, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar gastos programados del usuario' })
  findAll(@CurrentUser() user: FirebaseUser) {
    return this.programadosService.findAll(user.uid);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un gasto programado' })
  findOne(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.programadosService.findOne(user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un gasto programado',
    description:
      'Si cambian campos del schedule, recalcula automáticamente proximaEjecucion.',
  })
  update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() dto: UpdateGastoProgramadoDto,
  ) {
    return this.programadosService.update(user.uid, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar gasto programado (no borra ejecuciones pasadas)',
  })
  async remove(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.programadosService.remove(user.uid, id);
  }

  @Get(':id/ejecuciones')
  @ApiOperation({
    summary: 'Historial de ejecuciones de un gasto programado',
    description:
      'Devuelve hasta 100 ejecuciones (auditoría del cron) ordenadas por fechaEjecutada descendente.',
  })
  findEjecuciones(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.programadosService.findEjecuciones(user.uid, id);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pausar (no se ejecutará hasta reanudar)' })
  pause(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.programadosService.pause(user.uid, id);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Reanudar (recalcula próxima ejecución)' })
  resume(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.programadosService.resume(user.uid, id);
  }
}
