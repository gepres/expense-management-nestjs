/**
 * Backup de colecciones críticas de Firestore antes de la migración a multi-cuenta.
 *
 * Uso:
 *   node scripts/backup-firestore.js
 *   node scripts/backup-firestore.js --collections=expenses,presupuestos
 *
 * Salida:
 *   backups/firestore-YYYY-MM-DD-HHMMSS/
 *     <collection>.json     # array de documentos
 *     _manifest.json        # resumen (counts, sizes, timestamps)
 *
 * Requisitos:
 *   - firebase-service-account.json en la raíz del repo backend
 *   - firebase-admin instalado (ya está en dependencies)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '..', 'firebase-service-account.json');

// Colecciones top-level críticas
const DEFAULT_COLLECTIONS = [
  'users',
  'expenses',
  'presupuestos',
  'presupuestosEfectivo',
  'movimientos',
  'abonosEfectivo',
  'receipts',
  'shopping-lists',
  'shared_groups',
  'shared_invitations',
  'whatsapp_queue',
];

// Subcolecciones bajo users/{uid}/ que también respaldamos
const USER_SUBCOLLECTIONS = [
  'profile',
  'categories',
  'paymentMethods',
  'currencies',
  'shortcuts',
  'conversations',
  'imports',
];

// Subcolecciones bajo shared_groups/{groupId}/
const SHARED_GROUP_SUBCOLLECTIONS = [
  'members',
  'budgets',
  'expenses',
  'activity',
];

// ============================================================================
// HELPERS
// ============================================================================

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v ?? true;
  }
  return args;
}

function timestampFolder() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `firestore-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Convierte un valor de Firestore a algo serializable a JSON.
 * Maneja Timestamp, GeoPoint, DocumentReference, Buffer, etc.
 */
function toSerializable(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) {
    return { __type: 'Timestamp', iso: value.toDate().toISOString(), seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return { __type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value && typeof value.path === 'string' && typeof value.id === 'string') {
    // DocumentReference
    return { __type: 'DocumentReference', path: value.path };
  }
  if (Array.isArray(value)) return value.map(toSerializable);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toSerializable(v);
    return out;
  }
  return value;
}

async function backupCollection(db, collectionName, outDir) {
  const start = Date.now();
  const snapshot = await db.collection(collectionName).get();
  const docs = [];

  snapshot.forEach((doc) => {
    docs.push({
      id: doc.id,
      data: toSerializable(doc.data()),
    });
  });

  const filePath = path.join(outDir, `${collectionName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');

  const stats = fs.statSync(filePath);
  return {
    collection: collectionName,
    count: docs.length,
    sizeBytes: stats.size,
    sizeMB: +(stats.size / (1024 * 1024)).toFixed(3),
    durationMs: Date.now() - start,
    file: path.relative(process.cwd(), filePath),
  };
}

/**
 * Respalda subcolecciones de cada documento en una colección parent.
 * Por ejemplo: users/{uid}/categories, users/{uid}/conversations/{convId}/messages
 */
async function backupSubcollections(db, parentCollection, parentDocs, subcollections, outDir, depth = 0) {
  const start = Date.now();
  const allDocs = [];
  let messagesCount = 0;

  for (const parentId of parentDocs) {
    for (const subName of subcollections) {
      const subSnap = await db
        .collection(parentCollection)
        .doc(parentId)
        .collection(subName)
        .get();

      subSnap.forEach((doc) => {
        allDocs.push({
          parentId,
          subcollection: subName,
          id: doc.id,
          data: toSerializable(doc.data()),
        });
      });

      // Caso especial: conversations tienen subcolección messages
      if (subName === 'conversations' && depth === 0) {
        for (const convDoc of subSnap.docs) {
          const messagesSnap = await convDoc.ref.collection('messages').get();
          messagesSnap.forEach((msgDoc) => {
            allDocs.push({
              parentId,
              subcollection: 'conversations',
              conversationId: convDoc.id,
              messageId: msgDoc.id,
              data: toSerializable(msgDoc.data()),
            });
            messagesCount++;
          });
        }
      }
    }
  }

  const filename = `${parentCollection}__subcollections.json`;
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(allDocs, null, 2), 'utf-8');

  const stats = fs.statSync(filePath);
  return {
    collection: `${parentCollection}/<id>/{${subcollections.join(',')}}`,
    count: allDocs.length,
    messagesNested: messagesCount,
    sizeMB: +(stats.size / (1024 * 1024)).toFixed(3),
    durationMs: Date.now() - start,
    file: path.relative(process.cwd(), filePath),
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = parseArgs(process.argv);
  const collections = args.collections
    ? String(args.collections).split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_COLLECTIONS;

  console.log('🔐 Cargando service account…');
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ No existe ${SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
  }
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  const db = admin.firestore();

  const folder = timestampFolder();
  const outDir = path.resolve(__dirname, '..', 'backups', folder);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`📦 Proyecto: ${serviceAccount.project_id}`);
  console.log(`📁 Salida: ${path.relative(process.cwd(), outDir)}`);
  console.log(`📋 Colecciones: ${collections.join(', ')}`);
  console.log('');

  const results = [];
  let userIds = [];
  let groupIds = [];

  for (const collectionName of collections) {
    process.stdout.write(`  • ${collectionName.padEnd(28)} `);
    try {
      const result = await backupCollection(db, collectionName, outDir);
      results.push(result);
      console.log(`✓ ${result.count} docs (${result.sizeMB} MB) en ${result.durationMs}ms`);

      // Capturar IDs para luego respaldar subcolecciones
      if (collectionName === 'users') {
        const raw = JSON.parse(fs.readFileSync(path.join(outDir, `${collectionName}.json`), 'utf-8'));
        userIds = raw.map((d) => d.id);
      }
      if (collectionName === 'shared_groups') {
        const raw = JSON.parse(fs.readFileSync(path.join(outDir, `${collectionName}.json`), 'utf-8'));
        groupIds = raw.map((d) => d.id);
      }
    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`);
      results.push({ collection: collectionName, error: err.message });
    }
  }

  // Respaldar subcolecciones de users
  if (userIds.length > 0 && !args['skip-subcollections']) {
    console.log('');
    console.log(`📂 Respaldando subcolecciones de users (${userIds.length} usuarios)…`);
    process.stdout.write(`  • users/<uid>/{${USER_SUBCOLLECTIONS.join(',')}}  `);
    try {
      const result = await backupSubcollections(db, 'users', userIds, USER_SUBCOLLECTIONS, outDir);
      results.push(result);
      console.log(`✓ ${result.count} docs (${result.messagesNested} messages) en ${result.durationMs}ms`);
    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`);
      results.push({ collection: 'users/subcollections', error: err.message });
    }
  }

  // Respaldar subcolecciones de shared_groups
  if (groupIds.length > 0 && !args['skip-subcollections']) {
    console.log(`📂 Respaldando subcolecciones de shared_groups (${groupIds.length} grupos)…`);
    process.stdout.write(`  • shared_groups/<id>/{${SHARED_GROUP_SUBCOLLECTIONS.join(',')}}  `);
    try {
      const result = await backupSubcollections(db, 'shared_groups', groupIds, SHARED_GROUP_SUBCOLLECTIONS, outDir);
      results.push(result);
      console.log(`✓ ${result.count} docs en ${result.durationMs}ms`);
    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`);
      results.push({ collection: 'shared_groups/subcollections', error: err.message });
    }
  }

  const manifest = {
    projectId: serviceAccount.project_id,
    backupAt: new Date().toISOString(),
    folder,
    totalCollections: results.length,
    totalDocs: results.reduce((sum, r) => sum + (r.count || 0), 0),
    totalSizeMB: +results.reduce((sum, r) => sum + (r.sizeMB || 0), 0).toFixed(3),
    collections: results,
  };

  fs.writeFileSync(
    path.join(outDir, '_manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  console.log('');
  console.log(`✅ Backup completo: ${manifest.totalDocs} documentos (${manifest.totalSizeMB} MB)`);
  console.log(`📄 Manifest: ${path.relative(process.cwd(), path.join(outDir, '_manifest.json'))}`);
  console.log('');
  console.log('🔁 Para restaurar (no implementado aún):');
  console.log('   node scripts/restore-firestore.js --from=' + folder);
}

main().catch((err) => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
