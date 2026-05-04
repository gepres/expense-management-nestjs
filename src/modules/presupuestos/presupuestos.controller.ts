import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PresupuestosService } from './presupuestos.service';
import { CreatePresupuestoDto } from './dto/create-presupuesto.dto';
import { UpdatePresupuestoDto } from './dto/update-presupuesto.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Presupuestos')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('presupuestos')
export class PresupuestosController {
  constructor(private readonly service: PresupuestosService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un presupuesto (cuenta + mes + bucket)' })
  @ApiResponse({ status: 201, description: 'Creado' })
  @ApiResponse({ status: 409, description: 'Ya existe o excede asignación' })
  create(@CurrentUser() user: FirebaseUser, @Body() dto: CreatePresupuestoDto) {
    return this.service.create(user.uid, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los presupuestos del usuario' })
  findAll(@CurrentUser() user: FirebaseUser) {
    return this.service.findAll(user.uid);
  }

  @Get('resumen')
  @ApiOperation({
    summary: 'Resumen mensual de una cuenta con gastado y rollover calculados',
  })
  @ApiQuery({ name: 'accountId', required: true })
  @ApiQuery({ name: 'mes', required: true, example: '2026-04' })
  resumen(
    @CurrentUser() user: FirebaseUser,
    @Query('accountId') accountId: string,
    @Query('mes') mes: string,
  ) {
    return this.service.getResumenMensual(user.uid, accountId, mes);
  }

  @Get(':id')
  findOne(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.service.findOne(user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un presupuesto (solo límite editable)' })
  update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() dto: UpdatePresupuestoDto,
  ) {
    return this.service.update(user.uid, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un presupuesto' })
  async remove(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.service.remove(user.uid, id);
    return { success: true };
  }
}
