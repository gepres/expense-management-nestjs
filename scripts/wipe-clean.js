/**
 * Wipe limpio de Firestore para empezar el modelo multi-cuenta v2 desde cero.
 *
 * BORRA todas las colecciones de datos y subcolecciones de usuarios.
 * PRESERVA Firebase Auth y los documentos `users/{uid}` (perfil principal).
 *
 * ⚠️ DESTRUCTIVO E IRREVERSIBLE. Asegúrate de tener backup primero:
 *   node scripts/backup-firestore.js
 *
 * Uso:
 *   node scripts/wipe-clean.js --dry-run          # solo reporta, no borra
 *   node scripts/wipe-clean.js --confirm          # ejecuta de verdad (requiere flag)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '..', 'firebase-service-account.json');

// Colecciones top-level a borrar
const TOP_LEVEL_COLLECTIONS = [
  'expenses',
  'presupuestos',
  'presupuestosEfectivo',
  'movimientos',
  'abonosEfectivo',
  'accounts',
  'transfers',
  'receipts',
  'shopping-lists',
  'shared_groups',
  'shared_invitations',
  'whatsapp_queue',
];

// Subcolecciones de users/{uid}/ a borrar
const USER_SUBCOLLECTIONS = [
  'categories',
  'paymentMethods',
  'currencies',
  'shortcuts',
  'conversations', // mensajes anidados se borran con su conversation
  'imports',
];

// Subcolecciones de shared_groups (se borran al borrar el grupo, pero por las dudas)
const SHARED_GROUP_SUBCOLLECTIONS = ['members', 'budgets', 'expenses', 'activity'];

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v ?? true;
  }
  return args;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Borra una colección entera en batches de 400.
 */
async function deleteCollection(db, collectionRef, dryRun) {
  const snapshot = await collectionRef.get();
  if (snapshot.empty) return 0;

  if (dryRun) return snapshot.size;

  let deleted = 0;
  let batch = db.batch();
  let opCount = 0;

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    opCount++;
    deleted++;
    if (opCount >= 400) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) await batch.commit();

  return deleted;
}

/**
 * Borra recursivamente todas las subcolecciones de un doc parent.
 */
async function deleteSubcollections(db, parentRef, subcollectionNames, dryRun, depth = 0) {
  let totalDeleted = 0;
  for (const subName of subcollectionNames) {
    const subRef = parentRef.collection(subName);
    const snap = await subRef.get();

    // Caso especial: conversations tienen messages anidados
    if (subName === 'conversations' && depth === 0) {
      for (const convDoc of snap.docs) {
        const messagesDeleted = await deleteCollection(
          db,
          convDoc.ref.collection('messages'),
          dryRun,
        );
        totalDeleted += messagesDeleted;
      }
    }

    const docsDeleted = await deleteCollection(db, subRef, dryRun);
    totalDeleted += docsDeleted;
  }
  return totalDeleted;
}

async function main() {
  const args = parseArgs(process.argv);
  const dryRun = !!args['dry-run'];
  const hasConfirmFlag = !!args.confirm;

  console.log('🔐 Cargando service account…');
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  const db = admin.firestore();

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  WIPE CLEAN — borrado total de Firestore');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📦 Proyecto: ${serviceAccount.project_id}`);
  console.log(`🔧 Modo: ${dryRun ? 'DRY-RUN (no escribe)' : '⚠️  EJECUCIÓN REAL'}`);
  console.log('');
  console.log('Se BORRARÁN todos los documentos de:');
  TOP_LEVEL_COLLECTIONS.forEach((c) => console.log(`   - ${c}/`));
  console.log('');
  console.log('Y para cada user, sus subcolecciones:');
  USER_SUBCOLLECTIONS.forEach((c) => console.log(`   - users/{uid}/${c}/`));
  console.log('');
  console.log('Se PRESERVARÁ:');
  console.log('   - Firebase Authentication (todos los users de auth)');
  console.log('   - users/{uid} (doc principal: nombre, email, role, etc.)');
  console.log('   - users/{uid}/profile/ (datos de perfil del backend)');
  console.log('');

  // Confirmación interactiva (excepto en dry-run)
  if (!dryRun) {
    if (!hasConfirmFlag) {
      console.log('❌ Esta operación es IRREVERSIBLE.');
      console.log('   Para ejecutar: node scripts/wipe-clean.js --confirm');
      process.exit(1);
    }

    console.log('⚠️  Has pasado --confirm. Confirmación final requerida.');
    const projectInput = await ask(
      `Para confirmar, escribe el ID del proyecto exactamente (${serviceAccount.project_id}): `,
    );
    if (projectInput !== serviceAccount.project_id) {
      console.log('❌ ID del proyecto no coincide. Abortando.');
      process.exit(1);
    }

    const finalAnswer = await ask("Última oportunidad. Escribe 'BORRAR TODO' para proceder: ");
    if (finalAnswer !== 'BORRAR TODO') {
      console.log('❌ Cancelado por el usuario.');
      process.exit(1);
    }

    console.log('');
    console.log('🚀 Iniciando wipe en 3 segundos…');
    await new Promise((r) => setTimeout(r, 3000));
  }

  const results = {
    topLevel: {},
    userSubcollections: 0,
    sharedGroupSubcollections: 0,
    flagsReset: 0,
  };

  // 1. Subcolecciones de cada user
  console.log('');
  console.log('📂 Procesando subcolecciones de users…');
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const deleted = await deleteSubcollections(
      db,
      userDoc.ref,
      USER_SUBCOLLECTIONS,
      dryRun,
    );
    if (deleted > 0) {
      console.log(`   user ${userDoc.id}: ${deleted} docs en subcolecciones`);
    }
    results.userSubcollections += deleted;

    // Resetear flags relacionadas con migración (si existían)
    if (!dryRun) {
      await userDoc.ref.update({
        migratedToAccounts: admin.firestore.FieldValue.delete(),
        migratedToAccountsAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
      results.flagsReset++;
    }
  }

  // 2. Subcolecciones de shared_groups (deberían vaciarse al borrar shared_groups, pero por las dudas)
  console.log('');
  console.log('📂 Procesando subcolecciones de shared_groups…');
  const groupsSnap = await db.collection('shared_groups').get();
  for (const groupDoc of groupsSnap.docs) {
    const deleted = await deleteSubcollections(
      db,
      groupDoc.ref,
      SHARED_GROUP_SUBCOLLECTIONS,
      dryRun,
    );
    results.sharedGroupSubcollections += deleted;
  }

  // 3. Colecciones top-level
  console.log('');
  console.log('🗑️  Borrando colecciones top-level…');
  for (const colName of TOP_LEVEL_COLLECTIONS) {
    const deleted = await deleteCollection(db, db.collection(colName), dryRun);
    results.topLevel[colName] = deleted;
    console.log(`   ${colName}: ${deleted} docs`);
  }

  // Resumen
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('RESUMEN');
  console.log('═══════════════════════════════════════════════════════════');
  const totalTopLevel = Object.values(results.topLevel).reduce((sum, n) => sum + n, 0);
  console.log(`📊 Top-level: ${totalTopLevel} docs`);
  console.log(`📊 User subcollections: ${results.userSubcollections} docs`);
  console.log(`📊 Shared group subcollections: ${results.sharedGroupSubcollections} docs`);
  console.log(`🔁 Flags reseteadas: ${results.flagsReset} users`);
  console.log(`📦 TOTAL: ${totalTopLevel + results.userSubcollections + results.sharedGroupSubcollections} docs`);

  if (dryRun) {
    console.log('');
    console.log('💡 Dry-run. Para ejecutar de verdad:');
    console.log('   node scripts/wipe-clean.js --confirm');
  } else {
    console.log('');
    console.log('✅ Wipe completado. La base de datos está lista para el modelo v2.');
    console.log('   Próximo paso: redesplegar backend y frontend, hacer login y crear tu primera cuenta.');
  }
}

main().catch((err) => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
