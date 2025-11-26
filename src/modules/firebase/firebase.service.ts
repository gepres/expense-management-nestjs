import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App;
  private firestore: admin.firestore.Firestore;
  private auth: admin.auth.Auth;
  private storage: admin.storage.Storage;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      const serviceAccountPath = this.configService.get<string>(
        'firebase.serviceAccountPath',
      );

      let credential: admin.credential.Credential;

      // Opción 1: Usar archivo de service account
      if (serviceAccountPath) {
        try {
          const serviceAccountPath = this.configService.get<string>(
            'firebase.serviceAccountPath',
          );
          if (!serviceAccountPath) {
            throw new Error('Service account path not configured');
          }
          const absolutePath = join(process.cwd(), serviceAccountPath);
          const serviceAccount = JSON.parse(
            readFileSync(absolutePath, 'utf8'),
          );
          credential = admin.credential.cert(serviceAccount);
          this.logger.log('Firebase initialized with service account file');
        } catch (error) {
          this.logger.warn(
            'Could not load service account from file, trying environment variables',
          );
          credential = this.getCredentialFromEnv();
        }
      } else {
        // Opción 2: Usar variables de entorno
        credential = this.getCredentialFromEnv();
      }

      this.app = admin.initializeApp({
        credential,
      });

      this.firestore = this.app.firestore();
      this.auth = this.app.auth();
      this.storage = this.app.storage();

      // Configurar Firestore
      this.firestore.settings({
        ignoreUndefinedProperties: true,
        preferRest: true, // CRÍTICO: Usar REST en lugar de gRPC para evitar timeouts en Vercel
      });

      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error);
      throw error;
    }
  }

  private getCredentialFromEnv(): admin.credential.Credential {
    const projectId = this.configService.get<string>('firebase.projectId');
    const privateKey = this.configService.get<string>('firebase.privateKey');
    const clientEmail = this.configService.get<string>('firebase.clientEmail');
    const privateKeyId = this.configService.get<string>('firebase.privateKeyId');
    const clientId = this.configService.get<string>('firebase.clientId');

    if (!projectId || !privateKey || !clientEmail) {
      throw new Error(
        'Firebase credentials not found in environment variables',
      );
    }

    // Usar camelCase como espera el SDK
    const serviceAccount = {
      type: 'service_account',
      projectId: projectId, // camelCase
      privateKeyId: privateKeyId, // camelCase
      privateKey: privateKey, // camelCase
      clientEmail: clientEmail, // camelCase
      clientId: clientId, // camelCase
      authUri: 'https://accounts.google.com/o/oauth2/auth', // camelCase
      tokenUri: 'https://oauth2.googleapis.com/token', // camelCase
      authProviderX509CertUrl: 'https://www.googleapis.com/oauth2/v1/certs', // camelCase
      clientX509CertUrl: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(clientEmail)}`, // camelCase
      universe_domain: 'googleapis.com', // Este se mantiene en snake_case
    };

    return admin.credential.cert(serviceAccount);
  }

  getApp(): admin.app.App {
    return this.app;
  }

  getFirestore(): admin.firestore.Firestore {
    return this.firestore;
  }

  getAuth(): admin.auth.Auth {
    return this.auth;
  }

  getStorage(): admin.storage.Storage {
    return this.storage;
  }

  async verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
    return this.auth.verifyIdToken(token);
  }
}
