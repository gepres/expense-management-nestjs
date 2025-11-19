import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Chat AI')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @ApiOperation({ 
    summary: 'Enviar mensaje al asistente IA',
    description: 'Envía una pregunta al asistente, quien responderá basándose en los gastos del usuario del mes indicado (o actual).'
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
