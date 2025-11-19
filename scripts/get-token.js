/**
 * Script para obtener un token de Firebase para testing
 *
 * Uso:
 * node scripts/get-token.js <email>
 *
 * Requisitos:
 * - El usuario debe existir en Firebase Authentication
 * - Debes tener las credenciales de Firebase configuradas
 */

const admin = require('firebase-admin');
const path = require('path');

// Cargar las credenciales de Firebase
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  console.error('❌ Error: FIREBASE_SERVICE_ACCOUNT_PATH no está configurada');
  console.log('\nConfigura la variable de entorno:');
  console.log('export FIREBASE_SERVICE_ACCOUNT_PATH=/ruta/a/tu/serviceAccountKey.json');
  process.exit(1);
}

try {
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (error) {
  console.error('❌ Error al inicializar Firebase:', error.message);
  process.exit(1);
}

async function getCustomToken(email) {
  try {
    // Buscar usuario por email
    const user = await admin.auth().getUserByEmail(email);

    // Generar custom token
    const customToken = await admin.auth().createCustomToken(user.uid);

    console.log('\n✅ Custom Token generado exitosamente\n');
    console.log('━'.repeat(80));
    console.log('Usuario:', user.email);
    console.log('UID:', user.uid);
    console.log('━'.repeat(80));
    console.log('\nCUSTOM TOKEN (usar para login en cliente):');
    console.log(customToken);
    console.log('\n━'.repeat(80));
    console.log('\n⚠️  IMPORTANTE:');
    console.log('Este es un CUSTOM TOKEN. Debes cambiarlo por un ID TOKEN usando:');
    console.log('firebase.auth().signInWithCustomToken(customToken)');
    console.log('\nO usa el siguiente endpoint para obtener un ID Token:');
    console.log('POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=[API_KEY]');
    console.log('Body: { "token": "' + customToken + '", "returnSecureToken": true }');

  } catch (error) {
    console.error('❌ Error:', error.message);

    if (error.code === 'auth/user-not-found') {
      console.log('\n💡 El usuario no existe. Creando usuario...');
      await createUser(email);
    }
  }
}

async function createUser(email) {
  try {
    const password = 'Test123456!'; // Contraseña temporal

    const user = await admin.auth().createUser({
      email: email,
      password: password,
      emailVerified: true,
      displayName: email.split('@')[0],
    });

    console.log('✅ Usuario creado exitosamente');
    console.log('Email:', email);
    console.log('Password temporal:', password);
    console.log('UID:', user.uid);

    // Generar token para el nuevo usuario
    const customToken = await admin.auth().createCustomToken(user.uid);
    console.log('\nCustom Token:', customToken);

  } catch (error) {
    console.error('❌ Error al crear usuario:', error.message);
  }
}

// Ejecutar
const email = process.argv[2];

if (!email) {
  console.error('❌ Debes proporcionar un email');
  console.log('\nUso:');
  console.log('node scripts/get-token.js usuario@ejemplo.com');
  process.exit(1);
}

getCustomToken(email).then(() => {
  process.exit(0);
});
