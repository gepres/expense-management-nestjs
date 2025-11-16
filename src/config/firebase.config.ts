import { registerAs } from '@nestjs/config';

export default registerAs('firebase', () => ({
  serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID, // Nuevo
  clientId: process.env.FIREBASE_CLIENT_ID, // Nuevo
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
}));
