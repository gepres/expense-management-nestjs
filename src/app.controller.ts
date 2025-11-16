import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Servicio funcionando correctamente' })
  async healthCheck() {
    return this.appService.healthCheck();
  }

  @Get()
  @ApiOperation({ summary: 'Endpoint de bienvenida' })
  getHello(): string {
    return this.appService.getHello();
  }
}
