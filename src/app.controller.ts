import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ 
    summary: 'Verificar estado del servicio',
    description: 'Endpoint de health check para verificar que el servicio está funcionando correctamente. Útil para monitoreo y balanceadores de carga.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Servicio funcionando correctamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' }
      }
    }
  })
  async healthCheck() {
    return this.appService.healthCheck();
  }

  @Get()
  @ApiOperation({ 
    summary: 'Mensaje de bienvenida',
    description: 'Endpoint raíz que devuelve un mensaje de bienvenida de la API.'
  })
  @ApiResponse({
    status: 200,
    description: 'Mensaje de bienvenida',
    schema: {
      type: 'string',
      example: 'Gastos Backend API - v1.0.0'
    }
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
