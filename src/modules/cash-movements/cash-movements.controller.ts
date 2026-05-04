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
import { CashMovementsService } from './cash-movements.service';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { CreateIncomeDto } from './dto/create-income.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('CashMovements')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller()
export class CashMovementsController {
  constructor(private readonly service: CashMovementsService) {}

  @Post('accounts/:accountId/withdraw')
  @ApiOperation({
    summary: 'Retirar dinero de la cuenta al efectivo (bank → cash)',
    description:
      'Mueve `amount` desde `bankBalance` hacia `cashBalance` de la MISMA cuenta atomicamente.',
  })
  @ApiResponse({ status: 201, description: 'Retiro registrado' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada' })
  withdraw(
    @CurrentUser() user: FirebaseUser,
    @Param('accountId') accountId: string,
    @Body() dto: CreateCashMovementDto,
  ) {
    return this.service.withdraw(user.uid, accountId, dto);
  }

  @Post('accounts/:accountId/deposit-cash')
  @ApiOperation({
    summary: 'Depositar efectivo en la cuenta (cash → bank)',
    description:
      'Mueve `amount` desde `cashBalance` hacia `bankBalance` de la MISMA cuenta atomicamente.',
  })
  @ApiResponse({ status: 201, description: 'Depósito registrado' })
  depositCash(
    @CurrentUser() user: FirebaseUser,
    @Param('accountId') accountId: string,
    @Body() dto: CreateCashMovementDto,
  ) {
    return this.service.depositCash(user.uid, accountId, dto);
  }

  @Post('accounts/:accountId/income')
  @ApiOperation({
    summary: 'Registrar un ingreso externo a la cuenta',
    description:
      'Aumenta el saldo de la cuenta. En modelo Opción B este monto pasa a ser parte del presupuesto general del mes en curso. Origen requerido (sueldo, préstamo, CTS, AFP, etc.).',
  })
  @ApiResponse({ status: 201, description: 'Ingreso registrado' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada' })
  @ApiResponse({ status: 409, description: 'Cuenta archivada' })
  addIncome(
    @CurrentUser() user: FirebaseUser,
    @Param('accountId') accountId: string,
    @Body() dto: CreateIncomeDto,
  ) {
    return this.service.addIncome(user.uid, accountId, dto);
  }

  @Get('cash-movements')
  @ApiOperation({ summary: 'Listar movimientos de efectivo del usuario' })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  findAll(
    @CurrentUser() user: FirebaseUser,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(user.uid, {
      accountId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('cash-movements/:id')
  findOne(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.service.findOne(user.uid, id);
  }

  @Post('cash-movements/:id/revert')
  @ApiOperation({
    summary: 'Revertir un movimiento (crea contra-asiento, idempotente)',
    description:
      'Crea un nuevo registro tipo `reversal` que deshace el efecto del original sobre los saldos. El original queda marcado como revertido y no se puede revertir de nuevo.',
  })
  @ApiResponse({ status: 201, description: 'Reverso creado' })
  @ApiResponse({ status: 404, description: 'Movimiento no encontrado' })
  @ApiResponse({ status: 409, description: 'Ya fue revertido o no se puede revertir' })
  revert(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.service.revert(user.uid, id);
  }

  @Delete('cash-movements/:id')
  @ApiOperation({
    summary: 'Eliminar movimiento (revierte saldos atómicamente)',
  })
  async remove(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.service.remove(user.uid, id);
    return { success: true };
  }
}
