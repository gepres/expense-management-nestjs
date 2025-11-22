import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ShoppingListsService } from './shopping-lists.service';
import { CreateShoppingListDto } from './dto/create-shopping-list.dto';
import { UpdateShoppingListDto } from './dto/update-shopping-list.dto';
import { CreateShoppingListItemDto } from './dto/create-shopping-list-item.dto';
import { UpdateShoppingListItemDto } from './dto/update-shopping-list-item.dto';
import { ParseItemsFromTextDto } from './dto/parse-items-from-text.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Shopping Lists')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('shopping-lists')
export class ShoppingListsController {
  constructor(private readonly shoppingListsService: ShoppingListsService) {}

  // ==================== SHOPPING LISTS ====================

  @Post()
  @ApiOperation({ summary: 'Crear nueva lista de compras' })
  @ApiResponse({ status: 201, description: 'Lista creada exitosamente' })
  create(
    @CurrentUser() user: FirebaseUser,
    @Body() createShoppingListDto: CreateShoppingListDto,
  ) {
    return this.shoppingListsService.createList(user.uid, createShoppingListDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las listas de compras' })
  @ApiResponse({ status: 200, description: 'Listas obtenidas exitosamente' })
  findAll(@CurrentUser() user: FirebaseUser) {
    return this.shoppingListsService.findAllLists(user.uid);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una lista con sus items' })
  @ApiResponse({ status: 200, description: 'Lista obtenida exitosamente' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  findOne(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
  ) {
    return this.shoppingListsService.findOneList(user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar metadatos de la lista' })
  @ApiResponse({ status: 200, description: 'Lista actualizada exitosamente' })
  update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() updateShoppingListDto: UpdateShoppingListDto,
  ) {
    return this.shoppingListsService.updateList(user.uid, id, updateShoppingListDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar lista de compras' })
  @ApiResponse({ status: 204, description: 'Lista eliminada exitosamente' })
  remove(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
  ) {
    return this.shoppingListsService.deleteList(user.uid, id);
  }

  // ==================== SHOPPING LIST ITEMS ====================

  @Post(':id/items')
  @ApiOperation({ summary: 'Agregar item a la lista' })
  @ApiResponse({ status: 201, description: 'Item agregado exitosamente' })
  addItem(
    @CurrentUser() user: FirebaseUser,
    @Param('id') listId: string,
    @Body() createItemDto: CreateShoppingListItemDto,
  ) {
    return this.shoppingListsService.addItem(user.uid, listId, createItemDto);
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Actualizar item de la lista' })
  @ApiResponse({ status: 200, description: 'Item actualizado exitosamente' })
  updateItem(
    @CurrentUser() user: FirebaseUser,
    @Param('id') listId: string,
    @Param('itemId') itemId: string,
    @Body() updateItemDto: UpdateShoppingListItemDto,
  ) {
    return this.shoppingListsService.updateItem(user.uid, listId, itemId, updateItemDto);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar item de la lista' })
  @ApiResponse({ status: 204, description: 'Item eliminado exitosamente' })
  deleteItem(
    @CurrentUser() user: FirebaseUser,
    @Param('id') listId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.shoppingListsService.deleteItem(user.uid, listId, itemId);
  }

  @Post(':id/items/from-text')
  @ApiOperation({ summary: 'Parsear texto y agregar items en lote' })
  @ApiResponse({ 
    status: 201, 
    description: 'Items procesados y agregados',
    schema: {
      type: 'object',
      properties: {
        addedItems: {
          type: 'array',
          items: { type: 'object' }
        },
        failedLines: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  })
  parseText(
    @CurrentUser() user: FirebaseUser,
    @Param('id') listId: string,
    @Body() parseDto: ParseItemsFromTextDto,
  ) {
    return this.shoppingListsService.parseItemsFromText(user.uid, listId, parseDto.text);
  }
}
