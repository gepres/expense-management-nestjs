import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateShortcutDto } from './dto/create-shortcut.dto';
import { UpdateShortcutDto } from './dto/update-shortcut.dto';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class ShortcutsService {
  constructor(private readonly firebaseService: FirebaseService) {}

  private getCollection(userId: string) {
    return this.firebaseService
      .getFirestore()
      .collection('users')
      .doc(userId)
      .collection('shortcuts');
  }

  async create(userId: string, createShortcutDto: CreateShortcutDto) {
    const docRef = this.getCollection(userId).doc();
    const data = {
      ...createShortcutDto,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await docRef.set(data);
    return { id: docRef.id, ...data };
  }

  async findAll(userId: string) {
    const snapshot = await this.getCollection(userId).orderBy('createdAt', 'desc').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async findOne(userId: string, id: string) {
    const doc = await this.getCollection(userId).doc(id).get();
    if (!doc.exists) {
      throw new NotFoundException(`Shortcut with ID ${id} not found`);
    }
    return { id: doc.id, ...doc.data() };
  }

  async update(userId: string, id: string, updateShortcutDto: UpdateShortcutDto) {
    const docRef = this.getCollection(userId).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new NotFoundException(`Shortcut with ID ${id} not found`);
    }
    const data = {
      ...updateShortcutDto,
      updatedAt: Timestamp.now(),
    };
    await docRef.update(data);
    return { id, ...doc.data(), ...data };
  }

  async remove(userId: string, id: string) {
    const docRef = this.getCollection(userId).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new NotFoundException(`Shortcut with ID ${id} not found`);
    }
    await docRef.delete();
    return { id, message: 'Shortcut deleted successfully' };
  }
}
