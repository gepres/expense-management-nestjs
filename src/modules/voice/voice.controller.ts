import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ProcessVoiceDto } from './dto/process-voice.dto';

@ApiTags('Voice')
@ApiBearerAuth('firebase-auth')
@Controller('voice')
@UseGuards(FirebaseAuthGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('process-expense')
  @ApiOperation({ summary: 'Procesar transcripción de voz a gasto' })
  @ApiResponse({ status: 201, description: 'Datos extraídos exitosamente' })
  async processExpenseFromVoice(@Body() processVoiceDto: ProcessVoiceDto) {
    return this.voiceService.extractExpenseData(processVoiceDto.transcript);
  }
}
