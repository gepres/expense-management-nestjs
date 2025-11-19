import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@ApiTags('Chat')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ==================== CONVERSATION ENDPOINTS ====================

  @Post('conversations')
  @ApiOperation({ 
    summary: 'Crear nueva conversación',
    description: 'Crea una nueva conversación de chat con el asistente. Puedes especificar un título opcional para identificarla fácilmente.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Conversación creada exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        userId: { type: 'string' },
        title: { type: 'string' },
        messageCount: { type: 'number' },
        createdAt: { type: 'object' },
        updatedAt: { type: 'object' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async createConversation(@Req() req: any, @Body() dto: CreateConversationDto) {
    const userId = req.user.uid;
    return this.chatService.createConversation(userId, dto);
  }

  @Get('conversations')
  @ApiOperation({ 
    summary: 'Listar todas las conversaciones',
    description: 'Obtiene el historial completo de conversaciones del usuario, ordenadas por fecha de última actualización.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de conversaciones obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          messageCount: { type: 'number' },
          lastMessagePreview: { type: 'string' },
          updatedAt: { type: 'object' }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getConversations(@Req() req: any) {
    const userId = req.user.uid;
    return this.chatService.getConversations(userId);
  }

  @Get('conversations/:id')
  @ApiOperation({ 
    summary: 'Obtener detalles de una conversación',
    description: 'Obtiene la información completa de una conversación específica por su ID.'
  })
  @ApiParam({ name: 'id', description: 'ID de la conversación' })
  @ApiResponse({ status: 200, description: 'Conversación encontrada' })
  @ApiResponse({ status: 404, description: 'Conversación no encontrada' })
  @ApiResponse({ status: 403, description: 'Acceso denegado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getConversation(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.uid;
    return this.chatService.getConversation(userId, id);
  }

  @Patch('conversations/:id')
  @ApiOperation({ 
    summary: 'Actualizar conversación',
    description: 'Actualiza el título u otros metadatos de una conversación existente.'
  })
  @ApiParam({ name: 'id', description: 'ID de la conversación' })
  @ApiResponse({ status: 200, description: 'Conversación actualizada exitosamente' })
  @ApiResponse({ status: 404, description: 'Conversación no encontrada' })
  @ApiResponse({ status: 403, description: 'Acceso denegado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async updateConversation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    const userId = req.user.uid;
    return this.chatService.updateConversation(userId, id, dto);
  }

  @Delete('conversations/:id')
  @ApiOperation({ 
    summary: 'Eliminar conversación',
    description: 'Elimina permanentemente una conversación y todos sus mensajes asociados.'
  })
  @ApiParam({ name: 'id', description: 'ID de la conversación' })
  @ApiResponse({ status: 200, description: 'Conversación eliminada exitosamente' })
  @ApiResponse({ status: 404, description: 'Conversación no encontrada' })
  @ApiResponse({ status: 403, description: 'Acceso denegado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async deleteConversation(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.uid;
    await this.chatService.deleteConversation(userId, id);
    return { success: true };
  }

  // ==================== MESSAGE ENDPOINTS ====================

  @Get('conversations/:id/messages')
  @ApiOperation({ 
    summary: 'Obtener mensajes de una conversación',
    description: 'Obtiene el historial completo de mensajes de una conversación específica, ordenados cronológicamente.'
  })
  @ApiParam({ name: 'id', description: 'ID de la conversación' })
  @ApiResponse({ 
    status: 200, 
    description: 'Mensajes obtenidos exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          role: { type: 'string', enum: ['user', 'assistant'] },
          content: { type: 'string' },
          timestamp: { type: 'object' }
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Conversación no encontrada' })
  @ApiResponse({ status: 403, description: 'Acceso denegado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getMessages(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.uid;
    return this.chatService.getMessages(userId, id);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ 
    summary: 'Enviar mensaje a una conversación',
    description: 'Envía un nuevo mensaje al asistente dentro del contexto de una conversación existente. El asistente mantendrá el historial de la conversación para respuestas más coherentes.'
  })
  @ApiParam({ name: 'id', description: 'ID de la conversación' })
  @ApiResponse({ 
    status: 201, 
    description: 'Mensaje enviado y respuesta recibida',
    schema: {
      type: 'object',
      properties: {
        response: { type: 'string' },
        conversationId: { type: 'string' },
        contextUsed: {
          type: 'object',
          properties: {
            month: { type: 'number' },
            year: { type: 'number' },
            expensesCount: { type: 'number' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Conversación no encontrada' })
  @ApiResponse({ status: 403, description: 'Acceso denegado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async sendMessageToConversation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const userId = req.user.uid;
    return this.chatService.sendMessageToConversation(userId, id, dto);
  }

  // ==================== LEGACY ENDPOINT (Backward compatibility) ====================

  @Post('message')
  @ApiOperation({ 
    summary: 'Enviar mensaje al asistente de IA',
    description: 'Envía una pregunta o mensaje al asistente de IA. El asistente analizará tus gastos del mes especificado (o el mes actual por defecto) y responderá con información personalizada, consejos financieros y análisis de tus patrones de gasto.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Respuesta generada exitosamente',
    schema: {
      type: 'object',
      properties: {
        response: { 
          type: 'string',
          description: 'Respuesta de texto del asistente'
        },
        contextUsed: {
          type: 'object',
          properties: {
            month: { type: 'number' },
            year: { type: 'number' },
            expensesCount: { type: 'number' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async sendMessage(@Req() req: any, @Body() dto: SendMessageDto) {
    const userId = req.user.uid;
    return this.chatService.sendMessage(userId, dto);
  }
}
