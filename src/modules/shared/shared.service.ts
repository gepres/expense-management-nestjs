import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateSharedGroupDto } from './dto/create-shared-group.dto';
import { UpdateSharedGroupDto } from './dto/update-shared-group.dto';
import { CreateSharedBudgetDto } from './dto/create-shared-budget.dto';
import { CreateSharedExpenseDto } from './dto/create-shared-expense.dto';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

@Injectable()
export class SharedService {
  private readonly logger = new Logger(SharedService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  // --- Groups ---

  async createGroup(userId: string, dto: CreateSharedGroupDto) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc();

    const groupData = {
      ...dto,
      createdBy: userId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      members: [userId],
    };

    await groupRef.set(groupData);

    await groupRef.collection('members').doc(userId).set({
      userId,
      role: 'admin',
      joinedAt: Timestamp.now(),
    });

    return { id: groupRef.id, ...groupData };
  }

  async findAllGroups(userId: string) {
    const firestore = this.firebaseService.getFirestore();
    const snapshot = await firestore
      .collection('shared_groups')
      .where('members', 'array-contains', userId)
      .get();

    const groups = await Promise.all(snapshot.docs.map(async (doc) => {
      const data = doc.data();
      
      // Get creator name
      let creatorName = 'Usuario';
      try {
        const creatorRecord = await this.firebaseService.getAuth().getUser(data.createdBy);
        creatorName = creatorRecord.displayName || creatorRecord.email || 'Usuario';
      } catch (error) {
        this.logger.warn(`Could not fetch creator info for ${data.createdBy}`);
      }

      return {
        id: doc.id,
        ...data,
        creatorName,
        createdAt: (data.createdAt as Timestamp).toDate(),
        updatedAt: (data.updatedAt as Timestamp).toDate(),
      };
    }));

    // Sort in-memory instead of using Firestore orderBy (avoids index requirement)
    return groups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findOneGroup(userId: string, groupId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Group not found');
    }
    const data = doc.data();
    if (!data) {
      throw new NotFoundException('Group data not found');
    }
    
    if (!data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    // Get or create active invitation token
    let invitationToken: string | null = null;
    let invitationLink: string | null = null;

    // Check if there's an active invitation for this group
    const invitationsSnapshot = await firestore
      .collection('shared_invitations')
      .where('groupId', '==', groupId)
      .get();

    // Filter active invitations in-memory (avoids index requirement)
    const activeInvites = invitationsSnapshot.docs.filter(doc => {
      const inviteData = doc.data();
      return inviteData.expiresAt.toDate() > new Date();
    });

    if (activeInvites.length > 0) {
      // Use existing active invitation
      const inviteDoc = activeInvites[0];
      invitationToken = inviteDoc.id;
      invitationLink = `/compartidos/unirse/${invitationToken}`;
    } else if (data.createdBy === userId) {
      // Only creator can generate new invitations
      // Generate new invitation token
      const token = crypto.randomUUID();
      const invitationRef = firestore.collection('shared_invitations').doc(token);
      
      await invitationRef.set({
        groupId,
        createdBy: userId,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 days
      });

      invitationToken = token;
      invitationLink = `/compartidos/unirse/${token}`;
    }

    // Get full member details
    const membersDetails = await Promise.all(
      data.members.map(async (memberId: string) => {
        try {
          // Get user info from Auth
          const userRecord = await this.firebaseService.getAuth().getUser(memberId);
          
          // Get role and joinedAt from members subcollection
          const memberDoc = await groupRef.collection('members').doc(memberId).get();
          const memberData = memberDoc.data();
          
          return {
            odId: memberId,
            name: userRecord.displayName || userRecord.email || 'Usuario',
            email: userRecord.email || '',
            photoURL: userRecord.photoURL || null,
            role: memberData?.role || 'member',
            joinedAt: memberData?.joinedAt ? (memberData.joinedAt as Timestamp).toDate() : null,
          };
        } catch (error) {
          this.logger.warn(`Could not fetch member info for ${memberId}`);
          return {
            odId: memberId,
            name: 'Usuario',
            email: '',
            photoURL: null,
            role: 'member',
            joinedAt: null,
          };
        }
      })
    );

    return {
      id: doc.id,
      ...data,
      members: membersDetails, // Replace member IDs with full objects
      createdAt: (data.createdAt as Timestamp).toDate(),
      updatedAt: (data.updatedAt as Timestamp).toDate(),
      invitationToken,
      invitationLink,
    };
  }

  async updateGroup(userId: string, groupId: string, dto: UpdateSharedGroupDto) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data) throw new NotFoundException('Group data not found');

    if (data.createdBy !== userId) {
      throw new ForbiddenException('Only creator can edit group');
    }

    await groupRef.update({
      ...dto,
      updatedAt: Timestamp.now(),
    });

    return { id: groupId, ...data, ...dto };
  }

  async deleteGroup(userId: string, groupId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data) throw new NotFoundException('Group data not found');

    if (data.createdBy !== userId) {
      throw new ForbiddenException('Only creator can delete group');
    }

    await groupRef.delete();
    return { success: true };
  }

  // --- Budgets ---

  async addBudget(userId: string, groupId: string, dto: CreateSharedBudgetDto) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    // Get user info from Firebase Auth
    let userName = 'Usuario';
    let userPhoto: string | null = null;
    try {
      const userRecord = await this.firebaseService.getAuth().getUser(userId);
      userName = userRecord.displayName || userRecord.email || 'Usuario';
      userPhoto = userRecord.photoURL || null;
    } catch (error) {
      this.logger.warn(`Could not fetch user info for ${userId}`);
    }

    const budgetRef = groupRef.collection('budgets').doc();
    const budgetData = {
      ...dto,
      odId: userId,
      userName,
      userPhoto,
      createdAt: Timestamp.now(),
    };

    await budgetRef.set(budgetData);
    return { id: budgetRef.id, ...budgetData };
  }

  async getBudgets(userId: string, groupId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    const snapshot = await groupRef.collection('budgets').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: (d.data().createdAt as Timestamp).toDate(),
    }));
  }

  async updateBudget(userId: string, groupId: string, budgetId: string, dto: Partial<CreateSharedBudgetDto>) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    const budgetRef = groupRef.collection('budgets').doc(budgetId);
    const budgetDoc = await budgetRef.get();
    
    if (!budgetDoc.exists) throw new NotFoundException('Budget not found');
    const budgetData = budgetDoc.data();
    if (!budgetData) throw new NotFoundException('Budget data not found');
    
    if (budgetData.odId !== userId) {
      throw new ForbiddenException('Can only edit your own budgets');
    }

    await budgetRef.update({
      ...dto,
      updatedAt: Timestamp.now(),
    });

    return { id: budgetId, ...budgetData, ...dto };
  }

  async deleteBudget(userId: string, groupId: string, budgetId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    const budgetRef = groupRef.collection('budgets').doc(budgetId);
    const budgetDoc = await budgetRef.get();
    
    if (!budgetDoc.exists) throw new NotFoundException('Budget not found');
    const budgetData = budgetDoc.data();
    if (!budgetData) throw new NotFoundException('Budget data not found');
    
    if (budgetData.odId !== userId) {
      throw new ForbiddenException('Can only delete your own budgets');
    }

    await budgetRef.delete();
    return { success: true };
  }

  // --- Expenses ---

  async addExpense(userId: string, groupId: string, dto: CreateSharedExpenseDto) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    // Get user info from Firebase Auth
    let userName = 'Usuario';
    let userPhoto: string | null = null;
    try {
      const userRecord = await this.firebaseService.getAuth().getUser(userId);
      userName = userRecord.displayName || userRecord.email || 'Usuario';
      userPhoto = userRecord.photoURL || null;
    } catch (error) {
      this.logger.warn(`Could not fetch user info for ${userId}`);
    }

    const expenseRef = groupRef.collection('expenses').doc();
    const expenseData = {
      ...dto,
      paidBy: dto.paidBy || userId, // Use current user if paidBy not specified
      odId: userId,
      userName,
      userPhoto,
      createdAt: Timestamp.now(),
    };

    await expenseRef.set(expenseData);
    return { id: expenseRef.id, ...expenseData };
  }

  async getExpenses(userId: string, groupId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    const snapshot = await groupRef.collection('expenses').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: (d.data().createdAt as Timestamp).toDate(),
    }));
  }

  async updateExpense(userId: string, groupId: string, expenseId: string, dto: Partial<CreateSharedExpenseDto>) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    const expenseRef = groupRef.collection('expenses').doc(expenseId);
    const expenseDoc = await expenseRef.get();
    
    if (!expenseDoc.exists) throw new NotFoundException('Expense not found');
    const expenseData = expenseDoc.data();
    if (!expenseData) throw new NotFoundException('Expense data not found');
    
    if (expenseData.odId !== userId) {
      throw new ForbiddenException('Can only edit your own expenses');
    }

    await expenseRef.update({
      ...dto,
      updatedAt: Timestamp.now(),
    });

    return { id: expenseId, ...expenseData, ...dto };
  }

  async deleteExpense(userId: string, groupId: string, expenseId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    const expenseRef = groupRef.collection('expenses').doc(expenseId);
    const expenseDoc = await expenseRef.get();
    
    if (!expenseDoc.exists) throw new NotFoundException('Expense not found');
    const expenseData = expenseDoc.data();
    if (!expenseData) throw new NotFoundException('Expense data not found');
    
    if (expenseData.odId !== userId) {
      throw new ForbiddenException('Can only delete your own expenses');
    }

    await expenseRef.delete();
    return { success: true };
  }

  // --- Invitations ---

  async createInvitation(userId: string, groupId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || data.createdBy !== userId) {
      throw new ForbiddenException('Only creator can invite');
    }

    const token = crypto.randomUUID();
    const invitationRef = firestore.collection('shared_invitations').doc(token);
    
    await invitationRef.set({
      groupId,
      createdBy: userId,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 days
    });

    return { token, link: `/compartidos/unirse/${token}` };
  }

  async verifyInvitation(token: string) {
    const firestore = this.firebaseService.getFirestore();
    const inviteRef = firestore.collection('shared_invitations').doc(token);
    const doc = await inviteRef.get();

    if (!doc.exists) throw new NotFoundException('Invitation not found');
    const data = doc.data();
    if (!data) throw new NotFoundException('Invitation data not found');
    
    if (data.expiresAt.toDate() < new Date()) {
      throw new ForbiddenException('Invitation expired');
    }

    const groupDoc = await firestore.collection('shared_groups').doc(data.groupId).get();
    if (!groupDoc.exists) throw new NotFoundException('Group not found');
    const groupData = groupDoc.data();

    return { 
      valid: true, 
      group: { id: groupDoc.id, ...groupData },
      invitation: data 
    };
  }

  async acceptInvitation(userId: string, token: string) {
    const firestore = this.firebaseService.getFirestore();
    const inviteRef = firestore.collection('shared_invitations').doc(token);
    const doc = await inviteRef.get();

    if (!doc.exists) throw new NotFoundException('Invitation not found');
    const data = doc.data();
    if (!data) throw new NotFoundException('Invitation data not found');

    if (data.expiresAt.toDate() < new Date()) {
      throw new ForbiddenException('Invitation expired');
    }

    const groupId = data.groupId;
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    
    await groupRef.update({
      members: FieldValue.arrayUnion(userId)
    });

    await groupRef.collection('members').doc(userId).set({
      userId,
      role: 'member',
      joinedAt: Timestamp.now(),
      joinedVia: token
    });

    return { success: true, groupId };
  }

  // --- Members ---

  async removeMember(userId: string, groupId: string, memberIdToRemove: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data) throw new NotFoundException('Group data not found');
    
    if (data.createdBy !== userId) {
      throw new ForbiddenException('Only creator can remove members');
    }

    if (userId === memberIdToRemove) {
      throw new ForbiddenException('Cannot remove yourself, use leave instead');
    }

    await groupRef.update({
      members: FieldValue.arrayRemove(memberIdToRemove)
    });

    await groupRef.collection('members').doc(memberIdToRemove).delete();

    return { success: true };
  }

  async leaveGroup(userId: string, groupId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data) throw new NotFoundException('Group data not found');

    if (data.createdBy === userId) {
      throw new ForbiddenException('Creator cannot leave group, delete it instead');
    }

    await groupRef.update({
      members: FieldValue.arrayRemove(userId)
    });

    await groupRef.collection('members').doc(userId).delete();

    return { success: true };
  }

  // --- Stats & Insights ---

  async getStats(userId: string, groupId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    // Get all budgets and expenses
    const budgetsSnapshot = await groupRef.collection('budgets').get();
    const expensesSnapshot = await groupRef.collection('expenses').get();

    const budgets = budgetsSnapshot.docs.map(d => d.data());
    const expenses = expensesSnapshot.docs.map(d => d.data());

    // Calculate totals
    const totalBudget = budgets.reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // By category
    const byCategory = expenses.reduce((acc, e) => {
      const cat = e.category || 'otros';
      acc[cat] = (acc[cat] || 0) + (e.amount || 0);
      return acc;
    }, {} as Record<string, number>);

    // Calculate per-member statistics
    const memberBalances: Record<string, { contributed: number; spent: number }> = {};
    
    // Initialize all members
    data.members.forEach((memberId: string) => {
      memberBalances[memberId] = { contributed: 0, spent: 0 };
    });

    // Add contributions (budgets)
    budgets.forEach(b => {
      const uid = b.odId || b.userId; // Support both old and new format
      if (memberBalances[uid]) {
        memberBalances[uid].contributed += b.amount || 0;
      }
    });

    // Add expenses
    expenses.forEach(e => {
      const splitAmong = e.splitAmong || data.members;
      const sharePerPerson = (e.amount || 0) / splitAmong.length;
      
      splitAmong.forEach((memberId: string) => {
        if (memberBalances[memberId]) {
          memberBalances[memberId].spent += sharePerPerson;
        }
      });
    });

    // Get member details for stats
    const memberStats = await Promise.all(
      Object.entries(memberBalances).map(async ([memberId, stats]) => {
        try {
          const userRecord = await this.firebaseService.getAuth().getUser(memberId);
          return {
            odId: memberId,
            name: userRecord.displayName || userRecord.email || 'Usuario',
            photoURL: userRecord.photoURL || null,
            contributed: Math.round(stats.contributed * 100) / 100,
            spent: Math.round(stats.spent * 100) / 100,
            balance: Math.round((stats.contributed - stats.spent) * 100) / 100,
          };
        } catch (error) {
          this.logger.warn(`Could not fetch member info for ${memberId}`);
          return {
            odId: memberId,
            name: 'Usuario',
            photoURL: null,
            contributed: Math.round(stats.contributed * 100) / 100,
            spent: Math.round(stats.spent * 100) / 100,
            balance: Math.round((stats.contributed - stats.spent) * 100) / 100,
          };
        }
      })
    );

    return {
      totalBudget,
      totalExpenses,
      balance: totalBudget - totalExpenses,
      byCategory,
      memberStats,
      memberCount: data.members.length,
    };
  }

  async getSettlement(userId: string, groupId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    // Get all budgets and expenses
    const budgetsSnapshot = await groupRef.collection('budgets').get();
    const expensesSnapshot = await groupRef.collection('expenses').get();

    const budgets = budgetsSnapshot.docs.map(d => d.data());
    const expenses = expensesSnapshot.docs.map(d => d.data());

    // Calculate member balances
    const balances: Record<string, number> = {};
    
    // Initialize all members with 0
    data.members.forEach((memberId: string) => {
      balances[memberId] = 0;
    });

    // Add contributions (budgets)
    budgets.forEach(b => {
      balances[b.userId] = (balances[b.userId] || 0) + (b.amount || 0);
    });

    // Subtract expenses
    expenses.forEach(e => {
      const splitAmong = e.splitAmong || data.members;
      const sharePerPerson = (e.amount || 0) / splitAmong.length;
      
      // Person who paid gets credit
      balances[e.paidBy] = (balances[e.paidBy] || 0) + (e.amount || 0);
      
      // Everyone in split owes their share
      splitAmong.forEach((memberId: string) => {
        balances[memberId] = (balances[memberId] || 0) - sharePerPerson;
      });
    });

    // Simplify debts (greedy algorithm)
    const settlements: Array<{ from: string; to: string; amount: number }> = [];
    const debtors = Object.entries(balances).filter(([_, bal]) => bal < -0.01).map(([id, bal]) => ({ id, amount: -bal }));
    const creditors = Object.entries(balances).filter(([_, bal]) => bal > 0.01).map(([id, bal]) => ({ id, amount: bal }));

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(debtor.amount, creditor.amount);

      if (amount > 0.01) {
        settlements.push({
          from: debtor.id,
          to: creditor.id,
          amount: Math.round(amount * 100) / 100,
        });
      }

      debtor.amount -= amount;
      creditor.amount -= amount;

      if (debtor.amount < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    return { balances, settlements };
  }

  async getInsights(userId: string, groupId: string) {
    return { message: 'AI Insights coming soon' };
  }

  async getActivity(userId: string, groupId: string) {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    // Get recent budgets and expenses
    const budgetsSnapshot = await groupRef.collection('budgets').orderBy('createdAt', 'desc').limit(10).get();
    const expensesSnapshot = await groupRef.collection('expenses').orderBy('createdAt', 'desc').limit(10).get();

    const budgets = budgetsSnapshot.docs.map(d => ({
      type: 'budget',
      ...d.data(),
      id: d.id,
      createdAt: (d.data().createdAt as Timestamp).toDate(),
    }));

    const expenses = expensesSnapshot.docs.map(d => ({
      type: 'expense',
      ...d.data(),
      id: d.id,
      createdAt: (d.data().createdAt as Timestamp).toDate(),
    }));

    // Merge and sort by date
    const activity = [...budgets, ...expenses].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ).slice(0, 20);

    return activity;
  }

  // --- Export ---

  async exportGroupExpenses(userId: string, groupId: string, format: 'json' | 'excel') {
    const firestore = this.firebaseService.getFirestore();
    const groupRef = firestore.collection('shared_groups').doc(groupId);
    const doc = await groupRef.get();

    if (!doc.exists) throw new NotFoundException('Group not found');
    const data = doc.data();
    if (!data || !data.members.includes(userId)) {
      throw new ForbiddenException('Access denied');
    }

    // 1. Fetch all data
    const [budgetsSnapshot, expensesSnapshot, membersSnapshot] = await Promise.all([
      groupRef.collection('budgets').get(),
      groupRef.collection('expenses').get(),
      groupRef.collection('members').get(),
    ]);

    const budgets = budgetsSnapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: (d.data().createdAt as Timestamp).toDate(),
    }));

    const expenses = expensesSnapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: (d.data().createdAt as Timestamp).toDate(),
    }));

    // Get member details
    const members = await Promise.all(data.members.map(async (mid: string) => {
      try {
        const userRecord = await this.firebaseService.getAuth().getUser(mid);
        return {
          id: mid,
          name: userRecord.displayName || userRecord.email || 'Usuario',
          email: userRecord.email || '',
        };
      } catch (e) {
        return { id: mid, name: 'Usuario', email: '' };
      }
    }));

    // Calculate stats for summary
    const stats = await this.getStats(userId, groupId);

    if (format === 'json') {
      return {
        group: {
          id: doc.id,
          name: data.name,
          description: data.description,
          createdAt: (data.createdAt as Timestamp).toDate(),
        },
        members,
        stats,
        expenses,
        budgets,
      };
    }

    // Excel Generation
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Gastos App';
    workbook.created = new Date();

    // Sheet 1: Summary
    const summarySheet = workbook.addWorksheet('Resumen');
    summarySheet.columns = [
      { header: 'Concepto', key: 'concept', width: 30 },
      { header: 'Valor', key: 'value', width: 20 },
    ];
    summarySheet.addRows([
      { concept: 'Grupo', value: data.name },
      { concept: 'Total Gastos', value: stats.totalExpenses },
      { concept: 'Total Aportes', value: stats.totalBudget },
      { concept: 'Balance', value: stats.balance },
      {},
      { concept: 'Balances por Miembro', value: '' },
    ]);

    stats.memberStats.forEach((m: any) => {
      summarySheet.addRow({ concept: m.name, value: m.balance });
    });

    // Sheet 2: Expenses
    const expensesSheet = workbook.addWorksheet('Gastos');
    expensesSheet.columns = [
      { header: 'Fecha', key: 'date', width: 15 },
      { header: 'Descripción', key: 'description', width: 30 },
      { header: 'Categoría', key: 'category', width: 15 },
      { header: 'Monto', key: 'amount', width: 15 },
      { header: 'Pagado Por', key: 'paidBy', width: 20 },
      { header: 'Dividido Entre', key: 'split', width: 30 },
    ];

    expenses.forEach((e: any) => {
      const payer = members.find(m => m.id === e.paidBy)?.name || 'Desconocido';
      const splitNames = (e.splitAmong || []).map((uid: string) => members.find(m => m.id === uid)?.name).join(', ');
      
      expensesSheet.addRow({
        date: e.createdAt,
        description: e.description,
        category: e.category,
        amount: e.amount,
        paidBy: payer,
        split: splitNames,
      });
    });

    // Sheet 3: Budgets
    const budgetsSheet = workbook.addWorksheet('Aportes');
    budgetsSheet.columns = [
      { header: 'Fecha', key: 'date', width: 15 },
      { header: 'Usuario', key: 'user', width: 20 },
      { header: 'Monto', key: 'amount', width: 15 },
      { header: 'Nota', key: 'note', width: 30 },
    ];

    budgets.forEach((b: any) => {
      const user = members.find(m => m.id === (b.odId || b.userId))?.name || 'Desconocido';
      budgetsSheet.addRow({
        date: b.createdAt,
        user: user,
        amount: b.amount,
        note: b.note || '',
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }
}
