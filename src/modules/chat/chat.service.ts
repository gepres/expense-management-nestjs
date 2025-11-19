import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AnthropicService } from '../anthropic/anthropic.service';
import { ExpensesService } from '../expenses/expenses.service';
import { FirebaseService } from '../firebase/firebase.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { Conversation } from './interfaces/conversation.interface';
import { Message } from './interfaces/message.interface';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly anthropicService: AnthropicService,
    private readonly expensesService: ExpensesService,
    private readonly firebaseService: FirebaseService,
  ) {}

  // ==================== CONVERSATION MANAGEMENT ====================

  async createConversation(userId: string, dto: CreateConversationDto): Promise<Conversation> {
    const firestore = this.firebaseService.getFirestore();
    const conversationsRef = firestore
      .collection('users')
      .doc(userId)
      .collection('conversations');

    const newConversation = {
      userId,
      title: dto.title || 'Nueva conversación',
      messageCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await conversationsRef.add(newConversation);

    this.logger.log(`Created conversation ${docRef.id} for user ${userId}`);

    return {
      id: docRef.id,
      ...newConversation,
    };
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    const firestore = this.firebaseService.getFirestore();
    const snapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .orderBy('updatedAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Conversation[];
  }

  async getConversation(userId: string, conversationId: string): Promise<Conversation> {
    const firestore = this.firebaseService.getFirestore();
    const docRef = firestore
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId);

    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Conversation not found');
    }

    const data = doc.data();
    if (data?.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return {
      id: doc.id,
      ...data,
    } as Conversation;
  }

  async updateConversation(
    userId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ): Promise<Conversation> {
    const firestore = this.firebaseService.getFirestore();
    const docRef = firestore
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId);

    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Conversation not found');
    }

    const data = doc.data();
    if (data?.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    await docRef.update({
      title: dto.title,
      updatedAt: Timestamp.now(),
    });

    const updated = await docRef.get();
    return {
      id: updated.id,
      ...updated.data(),
    } as Conversation;
  }

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    const conversationRef = firestore
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId);

    const doc = await conversationRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Conversation not found');
    }

    const data = doc.data();
    if (data?.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Delete all messages in the conversation
    const messagesSnapshot = await conversationRef.collection('messages').get();
    const batch = firestore.batch();
    messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // Delete the conversation
    await conversationRef.delete();

    this.logger.log(`Deleted conversation ${conversationId} for user ${userId}`);
  }

  // ==================== MESSAGE MANAGEMENT ====================

  async getMessages(userId: string, conversationId: string): Promise<Message[]> {
    // Verify conversation belongs to user
    await this.getConversation(userId, conversationId);

    const firestore = this.firebaseService.getFirestore();
    const snapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Message[];
  }

  async sendMessageToConversation(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    // Verify conversation belongs to user
    await this.getConversation(userId, conversationId);

    const firestore = this.firebaseService.getFirestore();
    const conversationRef = firestore
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId);

    // 1. Get conversation history
    const messages = await this.getMessages(userId, conversationId);
    const conversationHistory = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    // 2. Get expense context
    const now = new Date();
    const month = dto.month || now.getMonth() + 1;
    const year = dto.year || now.getFullYear();

    const expenses = await this.expensesService.getExpensesByDateRange(
      userId,
      month,
      year,
    );

    const context = `
Datos de gastos del usuario para ${month}/${year}:
Total de transacciones: ${expenses.length}
Detalle de gastos:
${JSON.stringify(expenses.map((e: any) => ({
  fecha: e.fecha,
  monto: e.monto,
  concepto: e.concepto,
  categoria: e.categoria,
  comercio: e.comercio
})), null, 2)}
`;

    // 3. Send to AI
    const response = await this.anthropicService.sendMessage(
      dto.message,
      conversationHistory as any,
      context,
    );

    // 4. Save user message
    const userMessage = {
      conversationId,
      role: 'user' as const,
      content: dto.message,
      timestamp: Timestamp.now(),
    };

    await conversationRef.collection('messages').add(userMessage);

    // 5. Save assistant message
    const assistantMessage = {
      conversationId,
      role: 'assistant' as const,
      content: response,
      timestamp: Timestamp.now(),
      metadata: {
        model: 'claude-sonnet-4',
      },
    };

    await conversationRef.collection('messages').add(assistantMessage);

    // 6. Update conversation metadata
    await conversationRef.update({
      messageCount: messages.length + 2,
      lastMessagePreview: response.substring(0, 100),
      updatedAt: Timestamp.now(),
    });

    return {
      response,
      conversationId,
      contextUsed: {
        month,
        year,
        expensesCount: expenses.length,
      },
    };
  }

  // ==================== LEGACY METHOD (Keep for backward compatibility) ====================

  async sendMessage(userId: string, dto: SendMessageDto) {
    try {
      // 1. Determinar el rango de fechas para el contexto
      const now = new Date();
      const month = dto.month || now.getMonth() + 1;
      const year = dto.year || now.getFullYear();

      // 2. Obtener gastos del usuario para ese periodo
      const expenses = await this.expensesService.getExpensesByDateRange(
        userId,
        month,
        year,
      );

      // 3. Construir el contexto con los datos de gastos
      const context = `
Datos de gastos del usuario para ${month}/${year}:
Total de transacciones: ${expenses.length}
Detalle de gastos:
${JSON.stringify(expenses.map((e: any) => ({
  fecha: e.fecha,
  monto: e.monto,
  concepto: e.concepto,
  categoria: e.categoria,
  comercio: e.comercio
})), null, 2)}
`;

      // 4. Enviar mensaje a Anthropic con el contexto
      const response = await this.anthropicService.sendMessage(
        dto.message,
        [],
        context,
      );

      return {
        response,
        contextUsed: {
          month,
          year,
          expensesCount: expenses.length,
        },
      };
    } catch (error) {
      this.logger.error('Error processing chat message', error);
      throw error;
    }
  }
}
