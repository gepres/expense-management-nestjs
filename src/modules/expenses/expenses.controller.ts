import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Req, Res, HttpStatus } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { ParseExpenseDto } from './dto/parse-expense.dto';
import { GetExpensesFilterDto } from './dto/get-expenses-filter.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import type { Response } from 'express';

@ApiTags('Expenses')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo gasto' })
  @ApiResponse({ status: 201, description: 'Gasto creado exitosamente' })
  create(@Req() req: any, @Body() createExpenseDto: CreateExpenseDto) {
    return this.expensesService.create(req.user.uid, createExpenseDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar gastos con filtros' })
  findAll(@Req() req: any, @Query() query: ExpenseQueryDto) {
    return this.expensesService.findAll(req.user.uid, query);
  }

  @Post('parse')
  @ApiOperation({ summary: 'Analizar texto con IA para extraer datos de gasto' })
  @ApiResponse({ status: 200, description: 'Datos extraídos' })
  parseText(@Req() req: any, @Body() parseExpenseDto: ParseExpenseDto) {
    return this.expensesService.parseExpenseText(req.user.uid, parseExpenseDto.text);
  }

  @Get('export')
  @ApiOperation({ 
    summary: 'Exportar gastos por mes y año',
    description: 'Permite descargar los gastos en formato JSON o Excel filtrando por mes y año.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Gastos exportados correctamente. Si format=excel, devuelve un archivo binario. Si format=json, devuelve un array de objetos.',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              fecha: { type: 'string', format: 'date-time' },
              monto: { type: 'number' },
              concepto: { type: 'string' },
              categoria: { type: 'string' },
            }
          }
        }
      },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: {
          type: 'string',
          format: 'binary'
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos (mes/año incorrectos)' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async exportExpenses(
    @Req() req: any,
    @Query() filter: GetExpensesFilterDto,
    @Res() res: Response,
  ) {
    try {
      const userId = req.user.uid;
      console.log(`Exporting expenses for user ${userId}, filter:`, filter);

      const result = await this.expensesService.exportExpenses(userId, filter);

      if (filter.format === 'json') {
        return res.json(result);
      }

      if (filter.format === 'excel') {
        const rawBuffer = result as unknown as ArrayBuffer;
        const buffer = Buffer.from(rawBuffer);
        const filename = `gastos_${filter.year}_${filter.month}.xlsx`;

        res.set({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': buffer.length.toString(),
        });

        res.end(buffer);
      }
    } catch (error) {
      console.error('Error exporting expenses:', error);
      res.status(500).json({
        statusCode: 500,
        message: 'Error interno al exportar gastos',
        error: error.message,
        details: error.code === 9 ? 'Falta índice compuesto en Firestore' : undefined, // Code 9 is FAILED_PRECONDITION
      });
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un gasto por ID' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.expensesService.findOne(req.user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un gasto' })
  update(@Req() req: any, @Param('id') id: string, @Body() updateExpenseDto: UpdateExpenseDto) {
    return this.expensesService.update(req.user.uid, id, updateExpenseDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un gasto' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.expensesService.remove(req.user.uid, id);
  }
}
