import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceService } from './voice.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ProcessVoiceDto } from './dto/process-voice.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Voice')
@ApiBearerAuth('firebase-auth')
@Controller('voice')
@UseGuards(FirebaseAuthGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('process-expense')
  @ApiOperation({ summary: 'Procesar transcripción de voz a gasto' })
  @ApiResponse({ status: 201, description: 'Datos extraídos exitosamente' })
  async processExpenseFromVoice(
    @CurrentUser() user: FirebaseUser,
    @Body() processVoiceDto: ProcessVoiceDto,
  ) {
    return this.voiceService.extractExpenseData(
      processVoiceDto.transcript,
      user.uid,
    );
  }

  @Post('process-audio')
  @ApiOperation({
    summary: 'Procesar audio (Whisper server-side) → gasto clasificado',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description: 'Audio grabado (webm/ogg/mp4/wav)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Gasto extraído del audio' })
  @UseInterceptors(FileInterceptor('audio'))
  async processExpenseFromAudio(
    @CurrentUser() user: FirebaseUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún audio');
    }
    return this.voiceService.processAudioExpense(
      file.buffer,
      file.originalname,
      user.uid,
    );
  }
}
