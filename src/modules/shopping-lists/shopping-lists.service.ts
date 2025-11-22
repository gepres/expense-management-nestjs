import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AnthropicService } from '../anthropic/anthropic.service';
import { CreateShoppingListDto } from './dto/create-shopping-list.dto';
import { UpdateShoppingListDto } from './dto/update-shopping-list.dto';
import { CreateShoppingListItemDto } from './dto/create-shopping-list-item.dto';
import { UpdateShoppingListItemDto } from './dto/update-shopping-list-item.dto';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class ShoppingListsService {
  private readonly logger = new Logger(ShoppingListsService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly anthropicService: AnthropicService,
  ) {}

  // ==================== LIST MANAGEMENT ====================

  async createList(userId: string, dto: CreateShoppingListDto) {
    this.logger.log(`Creating shopping list for user ${userId}`);

    const listData = {
      userId,
      name: dto.name,
      status: 'active',
      currency: dto.currency || 'PEN',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .add(listData);

    return {
      id: docRef.id,
      ...listData,
    };
  }

  async findAllLists(userId: string) {
    this.logger.log(`Finding all shopping lists for user ${userId}`);

    const snapshot = await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const lists: any[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Calculate summary for each list
      const itemsSnapshot = await this.firebaseService.getFirestore()
        .collection('shopping-lists')
        .doc(doc.id)
        .collection('items')
        .get();

      let itemCount = 0;
      let checkedCount = 0;
      let totalEstimated = 0;

      itemsSnapshot.forEach(itemDoc => {
        const item = itemDoc.data();
        itemCount++;
        if (item.checked) checkedCount++;
        totalEstimated += item.amount || 0;
      });

      lists.push({
        id: doc.id,
        name: data.name,
        status: data.status,
        createdAt: data.createdAt?.toDate().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
        itemCount,
        checkedCount,
        totalEstimated,
      });
    }

    return lists;
  }

  async findOneList(userId: string, listId: string) {
    this.logger.log(`Finding shopping list ${listId} for user ${userId}`);

    await this.verifyListOwnership(userId, listId);

    const doc = await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .get();

    if (!doc.exists) {
      throw new NotFoundException('Lista de compras no encontrada');
    }

    const data = doc.data();
    if (!data) {
      throw new NotFoundException('Lista de compras no encontrada');
    }

    // Get all items
    const itemsSnapshot = await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .collection('items')
      .orderBy('createdAt', 'asc')
      .get();

    const items = itemsSnapshot.docs.map(itemDoc => ({
      id: itemDoc.id,
      ...itemDoc.data(),
      createdAt: itemDoc.data().createdAt?.toDate().toISOString(),
      updatedAt: itemDoc.data().updatedAt?.toDate().toISOString(),
    }));

    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate().toISOString(),
      updatedAt: data.updatedAt?.toDate().toISOString(),
      items,
    };
  }

  async updateList(userId: string, listId: string, dto: UpdateShoppingListDto) {
    this.logger.log(`Updating shopping list ${listId} for user ${userId}`);

    await this.verifyListOwnership(userId, listId);

    const updateData = {
      ...dto,
      updatedAt: Timestamp.now(),
    };

    await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .update(updateData);

    const updated = await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .get();

    return {
      id: updated.id,
      ...updated.data(),
    };
  }

  async deleteList(userId: string, listId: string) {
    this.logger.log(`Deleting shopping list ${listId} for user ${userId}`);

    await this.verifyListOwnership(userId, listId);

    // Delete all items first
    const itemsSnapshot = await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .collection('items')
      .get();

    const batch = this.firebaseService.getFirestore().batch();

    itemsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    // Delete the list
    await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .delete();

    return { message: 'Lista eliminada exitosamente' };
  }

  // ==================== ITEM MANAGEMENT ====================

  async addItem(userId: string, listId: string, dto: CreateShoppingListItemDto) {
    this.logger.log(`Adding item to shopping list ${listId}`);

    await this.verifyListOwnership(userId, listId);

    const itemData = {
      name: dto.name,
      quantity: dto.quantity || 1,
      unitPrice: dto.unitPrice || 0,
      amount: dto.amount,
      category: dto.category || null,
      checked: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .collection('items')
      .add(itemData);

    // Update list's updatedAt
    await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .update({ updatedAt: Timestamp.now() });

    return {
      id: docRef.id,
      ...itemData,
    };
  }

  async updateItem(userId: string, listId: string, itemId: string, dto: UpdateShoppingListItemDto) {
    this.logger.log(`Updating item ${itemId} in list ${listId}`);

    await this.verifyListOwnership(userId, listId);

    const updateData = {
      ...dto,
      updatedAt: Timestamp.now(),
    };

    await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .collection('items')
      .doc(itemId)
      .update(updateData);

    // Update list's updatedAt
    await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .update({ updatedAt: Timestamp.now() });

    const updated = await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .collection('items')
      .doc(itemId)
      .get();

    return {
      id: updated.id,
      ...updated.data(),
    };
  }

  async deleteItem(userId: string, listId: string, itemId: string) {
    this.logger.log(`Deleting item ${itemId} from list ${listId}`);

    await this.verifyListOwnership(userId, listId);

    await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .collection('items')
      .doc(itemId)
      .delete();

    // Update list's updatedAt
    await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .update({ updatedAt: Timestamp.now() });

    return { message: 'Item eliminado exitosamente' };
  }

  // ==================== AI TEXT PARSING ====================

  async parseItemsFromText(userId: string, listId: string, text: string) {
    this.logger.log(`Parsing items from text for list ${listId}`);

    await this.verifyListOwnership(userId, listId);

    const prompt = `Analiza el siguiente texto de lista de compras y extrae los items en formato JSON.
Cada línea puede tener diferentes formatos:
- "producto - precio" (ej: "leche - 5.00")
- "producto, cantidadxprecio" (ej: "pan, 2x3")
- Solo el nombre del producto (ej: "manzanas")

Texto:
${text}

Responde SOLO con un array JSON válido de objetos con esta estructura:
[
  {
    "name": "nombre del producto",
    "quantity": número (default 1),
    "unitPrice": número (default 0),
    "amount": número (cantidad * precio unitario)
  }
]

Si una línea no se puede parsear, ignórala. NO incluyas texto adicional, solo el JSON.`;

    try {
      const response = await this.anthropicService.sendMessage(prompt);

      // Extract JSON from response
      let jsonText = response.trim();
      
      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      const parsedItems = JSON.parse(jsonText);

      if (!Array.isArray(parsedItems)) {
        throw new Error('Response is not an array');
      }

      const addedItems: any[] = [];
      const failedLines: any[] = [];

      for (const item of parsedItems) {
        try {
          const itemDto: CreateShoppingListItemDto = {
            name: item.name,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            amount: item.amount || 0,
          };

          const added = await this.addItem(userId, listId, itemDto);
          addedItems.push(added);
        } catch (error) {
          this.logger.error(`Failed to add item: ${JSON.stringify(item)}`, error);
          failedLines.push(item.name);
        }
      }

      return {
        addedItems,
        failedLines,
      };
    } catch (error) {
      this.logger.error('Error parsing items from text', error);
      throw new Error('No se pudo procesar el texto. Por favor, verifica el formato.');
    }
  }

  // ==================== HELPER METHODS ====================

  private async verifyListOwnership(userId: string, listId: string) {
    const doc = await this.firebaseService.getFirestore()
      .collection('shopping-lists')
      .doc(listId)
      .get();

    if (!doc.exists) {
      throw new NotFoundException('Lista de compras no encontrada');
    }

    const data = doc.data();
    if (!data || data.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para acceder a esta lista');
    }
  }
}
