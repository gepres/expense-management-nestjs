import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, SetMetadata } from '@nestjs/common';
import { SharedService } from './shared.service';
import { CreateSharedGroupDto } from './dto/create-shared-group.dto';
import { UpdateSharedGroupDto } from './dto/update-shared-group.dto';
import { CreateSharedBudgetDto } from './dto/create-shared-budget.dto';
import { CreateSharedExpenseDto } from './dto/create-shared-expense.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

@ApiTags('Shared Groups')
@ApiBearerAuth('firebase-auth')
@Controller('shared-groups')
@UseGuards(FirebaseAuthGuard)
export class SharedController {
  constructor(private readonly sharedService: SharedService) {}

  @Post()
  @ApiOperation({ summary: 'Crear grupo compartido' })
  create(@CurrentUser() user: FirebaseUser, @Body() createSharedGroupDto: CreateSharedGroupDto) {
    return this.sharedService.createGroup(user.uid, createSharedGroupDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar mis grupos compartidos' })
  findAll(@CurrentUser() user: FirebaseUser) {
    return this.sharedService.findAllGroups(user.uid);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de grupo' })
  findOne(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.sharedService.findOneGroup(user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar grupo' })
  update(@CurrentUser() user: FirebaseUser, @Param('id') id: string, @Body() updateSharedGroupDto: UpdateSharedGroupDto) {
    return this.sharedService.updateGroup(user.uid, id, updateSharedGroupDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar grupo' })
  remove(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.sharedService.deleteGroup(user.uid, id);
  }

  @Post(':id/budgets')
  @ApiOperation({ summary: 'Agregar aporte (budget)' })
  addBudget(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string, @Body() dto: CreateSharedBudgetDto) {
    return this.sharedService.addBudget(user.uid, groupId, dto);
  }

  @Get(':id/budgets')
  @ApiOperation({ summary: 'Listar aportes' })
  getBudgets(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string) {
    return this.sharedService.getBudgets(user.uid, groupId);
  }

  @Patch(':id/budgets/:budgetId')
  @ApiOperation({ summary: 'Actualizar aporte' })
  updateBudget(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string, @Param('budgetId') budgetId: string, @Body() dto: Partial<CreateSharedBudgetDto>) {
    return this.sharedService.updateBudget(user.uid, groupId, budgetId, dto);
  }

  @Delete(':id/budgets/:budgetId')
  @ApiOperation({ summary: 'Eliminar aporte' })
  deleteBudget(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string, @Param('budgetId') budgetId: string) {
    return this.sharedService.deleteBudget(user.uid, groupId, budgetId);
  }

  @Post(':id/expenses')
  @ApiOperation({ summary: 'Agregar gasto compartido' })
  addExpense(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string, @Body() dto: CreateSharedExpenseDto) {
    return this.sharedService.addExpense(user.uid, groupId, dto);
  }

  @Get(':id/expenses')
  @ApiOperation({ summary: 'Listar gastos compartidos' })
  getExpenses(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string) {
    return this.sharedService.getExpenses(user.uid, groupId);
  }

  @Patch(':id/expenses/:expenseId')
  @ApiOperation({ summary: 'Actualizar gasto' })
  updateExpense(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string, @Param('expenseId') expenseId: string, @Body() dto: Partial<CreateSharedExpenseDto>) {
    return this.sharedService.updateExpense(user.uid, groupId, expenseId, dto);
  }

  @Delete(':id/expenses/:expenseId')
  @ApiOperation({ summary: 'Eliminar gasto' })
  deleteExpense(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string, @Param('expenseId') expenseId: string) {
    return this.sharedService.deleteExpense(user.uid, groupId, expenseId);
  }

  // --- Invitations ---

  @Post(':id/invitations')
  @ApiOperation({ summary: 'Crear invitación' })
  createInvitation(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string) {
    return this.sharedService.createInvitation(user.uid, groupId);
  }

  @Get('invitations/:token/verify')
  @ApiOperation({ summary: 'Verificar invitación (público)' })
  @ApiResponse({ status: 200, description: 'Invitación válida' })
  @ApiResponse({ status: 404, description: 'Invitación no encontrada' })
  @SetMetadata('isPublic', true)
  verifyInvitation(@Param('token') token: string) {
    return this.sharedService.verifyInvitation(token);
  }

  @Post('invitations/:token/accept')
  @ApiOperation({ summary: 'Aceptar invitación' })
  acceptInvitation(@CurrentUser() user: FirebaseUser, @Param('token') token: string) {
    return this.sharedService.acceptInvitation(user.uid, token);
  }

  // --- Members ---

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Eliminar miembro' })
  removeMember(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string, @Param('memberId') memberId: string) {
    return this.sharedService.removeMember(user.uid, groupId, memberId);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Salir del grupo' })
  leaveGroup(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string) {
    return this.sharedService.leaveGroup(user.uid, groupId);
  }

  // --- Stats ---

  @Get(':id/stats')
  @ApiOperation({ summary: 'Estadísticas del grupo' })
  getStats(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string) {
    return this.sharedService.getStats(user.uid, groupId);
  }

  @Get(':id/settlement')
  @ApiOperation({ summary: 'Liquidación de deudas' })
  getSettlement(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string) {
    return this.sharedService.getSettlement(user.uid, groupId);
  }

  @Get(':id/insights')
  @ApiOperation({ summary: 'Insights IA' })
  getInsights(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string) {
    return this.sharedService.getInsights(user.uid, groupId);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Actividad reciente' })
  getActivity(@CurrentUser() user: FirebaseUser, @Param('id') groupId: string) {
    return this.sharedService.getActivity(user.uid, groupId);
  }
}
