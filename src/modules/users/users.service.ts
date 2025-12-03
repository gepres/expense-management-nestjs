import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { UserProfile } from './interfaces/user-profile.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private firebaseService: FirebaseService) {}

  async getOrCreateProfile(
    userId: string,
    email?: string,
    displayName?: string,
    photoURL?: string,
  ): Promise<UserProfile> {
    const firestore = this.firebaseService.getFirestore();
    const profileRef = firestore.collection('users').doc(userId).collection('profile').doc('data');

    const profileDoc = await profileRef.get();

    if (profileDoc.exists) {
      this.logger.log(`Profile found for user ${userId}`);
      return { uid: userId, ...profileDoc.data() } as UserProfile;
    }

    // Crear perfil si no existe
    this.logger.log(`Creating new profile for user ${userId}`);

    const newProfile: Omit<UserProfile, 'uid'> = {
      email: email || '',
      displayName: displayName || undefined,
      photoURL: photoURL || undefined,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      preferences: {
        currency: 'PEN',
        language: 'es',
      },
    };

    await profileRef.set(newProfile);

    return { uid: userId, ...newProfile } as UserProfile;
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const firestore = this.firebaseService.getFirestore();
    const profileRef = firestore.collection('users').doc(userId).collection('profile').doc('data');

    const profileDoc = await profileRef.get();

    if (!profileDoc.exists) {
      throw new NotFoundException('User profile not found');
    }

    return { uid: userId, ...profileDoc.data() } as UserProfile;
  }

  async updateProfile(
    userId: string,
    updateData: UpdateProfileDto,
  ): Promise<UserProfile> {
    const firestore = this.firebaseService.getFirestore();
    const profileRef = firestore.collection('users').doc(userId).collection('profile').doc('data');

    const profileDoc = await profileRef.get();

    if (!profileDoc.exists) {
      throw new NotFoundException('User profile not found');
    }

    const updatedData = {
      ...updateData,
      updatedAt: Timestamp.now(),
    };

    await profileRef.update(updatedData);

    const updated = await profileRef.get();
    return { uid: userId, ...updated.data() } as UserProfile;
  }

  async deleteProfile(userId: string): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    const auth = this.firebaseService.getAuth();
    const userRef = firestore.collection('users').doc(userId);

    this.logger.log(`Starting account deletion for user ${userId}`);

    try {
      // 1. Obtener datos del usuario para referencias (WhatsApp)
      const userProfile = await this.getProfile(userId).catch(() => null);
      const whatsappPhone = userProfile?.whatsappPhone;

      // 2. Eliminar subcolecciones del usuario
      const subcollections = [
        'profile',
        'conversations', // Y sus mensajes (se maneja recursivamente si es necesario, pero Firestore no borra recursivo por defecto)
        'expenses',
        'categories',
        'receipts',
        'shortcuts',
        'paymentMethods',
      ];

      for (const subcollection of subcollections) {
        await this.deleteCollection(userRef.collection(subcollection));
        // Para conversations, necesitamos borrar los mensajes también
        if (subcollection === 'conversations') {
          const conversationsSnapshot = await userRef
            .collection('conversations')
            .get();
          for (const convDoc of conversationsSnapshot.docs) {
            await this.deleteCollection(convDoc.ref.collection('messages'));
            await convDoc.ref.delete();
          }
        }
      }

      // 3. Eliminar documentos en colecciones de nivel superior
      const topLevelCollections = [
        'shopping-lists',
        'abonosEfectivo',
        'expenses', // Si existe como top-level
        'movimientos',
        'presupuestos',
        'presupuestosEfectivo',
      ];

      for (const collectionName of topLevelCollections) {
        const snapshot = await firestore
          .collection(collectionName)
          .where('userId', '==', userId)
          .get();

        const batch = firestore.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }

      // 4. Manejar grupos compartidos (shared_groups)
      const sharedGroupsSnapshot = await firestore
        .collection('shared_groups')
        .where('members', 'array-contains', userId)
        .get();

      for (const groupDoc of sharedGroupsSnapshot.docs) {
        // Remover usuario del array 'members'
        await groupDoc.ref.update({
          members: FieldValue.arrayRemove(userId),
        });

        // Eliminar documento del usuario en la subcolección 'members' del grupo
        await groupDoc.ref.collection('members').doc(userId).delete();
      }

      // 5. Manejar invitaciones compartidas (shared_invitations)
      // Si el usuario creó invitaciones, las borramos
      const invitationsSnapshot = await firestore
        .collection('shared_invitations')
        .where('createdBy', '==', userId)
        .get();

      const invitesBatch = firestore.batch();
      invitationsSnapshot.docs.forEach((doc) => {
        invitesBatch.delete(doc.ref);
      });
      await invitesBatch.commit();

      // 6. Manejar WhatsApp Queue
      if (whatsappPhone) {
        const whatsappQueueSnapshot = await firestore
          .collection('whatsapp_queue')
          .where('whatsappPhone', '==', whatsappPhone)
          .get();

        const waBatch = firestore.batch();
        whatsappQueueSnapshot.docs.forEach((doc) => {
          waBatch.delete(doc.ref);
        });
        await waBatch.commit();
      }

      // 7. Eliminar documento del usuario
      await userRef.delete();

      // 8. Eliminar usuario de Firebase Authentication
      await auth.deleteUser(userId);

      this.logger.log(`Account and all data deleted for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Error deleting account for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async deleteCollection(
    collectionRef: FirebaseFirestore.CollectionReference,
  ) {
    const snapshot = await collectionRef.get();
    if (snapshot.size === 0) return;

    const batch = this.firebaseService.getFirestore().batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }

  async linkWhatsappNumber(userId: string, phoneNumber: string) {
    const firestore = this.firebaseService.getFirestore();
    await firestore.collection('users').doc(userId).update({
      whatsappPhone: phoneNumber,
      whatsappLinkedAt: new Date(),
    });
    return { success: true };
  }
}
