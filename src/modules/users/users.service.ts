import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { UserProfile } from './interfaces/user-profile.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Timestamp } from 'firebase-admin/firestore';

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
    const userRef = firestore.collection('users').doc(userId);

    // Eliminar todas las subcolecciones
    const subcollections = ['profile', 'conversations', 'expenses', 'categories', 'receipts'];

    for (const subcollection of subcollections) {
      const snapshot = await userRef.collection(subcollection).get();
      const batch = firestore.batch();

      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
    }

    this.logger.log(`Profile deleted for user ${userId}`);
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
