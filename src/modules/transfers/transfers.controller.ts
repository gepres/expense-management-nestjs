import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Transfers')
@ApiBearerAuth('firebase-auth')
@Controller('transfers')
@UseGuards(FirebaseAuthGuard)
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear transferencia entre 2 cuentas',
    description:
      'Atómico: debita la cuenta origen y acredita la destino dentro de una transaction.',
  })
  @ApiResponse({ status: 201, description: 'Transferencia creada' })
  @ApiResponse({ status: 400, description: 'Cuentas iguales o monedas sin tasa' })
  @ApiResponse({ status: 404, description: 'Cuenta origen o destino no encontrada' })
  create(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: CreateTransferDto,
  ) {
    return this.transfersService.create(user.uid, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar transferencias del usuario' })
  @ApiQuery({
    name: 'accountId',
    required: false,
    description: 'Filtra por cuenta (entrantes + salientes)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  findAll(
    @CurrentUser() user: FirebaseUser,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.transfersService.findAll(user.uid, {
      accountId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de transferencia' })
  findOne(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.transfersService.findOne(user.uid, id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar transferencia (revierte saldos)',
    description: 'Suma de vuelta el monto en origen y resta en destino atomicamente.',
  })
  async remove(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.transfersService.remove(user.uid, id);
    return { success: true };
  }
}
