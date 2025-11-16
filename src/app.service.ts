import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from './modules/firebase/firebase.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private firebaseService: FirebaseService,
    private configService: ConfigService,
  ) {}

  getHello(): string {
    return 'Gastos Backend API - Running';
  }

  async healthCheck() {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        firebase: 'unknown',
        anthropic: 'unknown',
      },
    };

    // Check Firebase
    try {
      const firestore = this.firebaseService.getFirestore();
      await firestore.listCollections();
      checks.services.firebase = 'ok';
    } catch (error) {
      this.logger.error('Firebase health check failed', error);
      checks.services.firebase = 'error';
      checks.status = 'degraded';
    }

    // Check Anthropic API key exists
    const anthropicKey = this.configService.get<string>('anthropic.apiKey');
    if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
      checks.services.anthropic = 'ok';
    } else {
      checks.services.anthropic = 'not configured';
      checks.status = 'degraded';
    }

    return checks;
  }
}
