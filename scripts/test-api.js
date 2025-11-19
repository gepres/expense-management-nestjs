/**
 * Script para probar las APIs con autenticación
 *
 * Uso:
 * node scripts/test-api.js <firebase-id-token>
 */

const BASE_URL = 'http://localhost:3000/api';

async function testAPIs(token) {
  console.log('🧪 Probando APIs protegidas...\n');

  // Helper para hacer peticiones
  const request = async (method, endpoint, body = null) => {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, options);
      const data = await response.json();

      return {
        status: response.status,
        ok: response.ok,
        data,
      };
    } catch (error) {
      return {
        status: 500,
        ok: false,
        error: error.message,
      };
    }
  };

  // 1. Probar perfil de usuario
  console.log('1️⃣  GET /users/profile');
  const profile = await request('GET', '/users/profile');
  console.log('Status:', profile.status);
  console.log('Respuesta:', JSON.stringify(profile.data, null, 2));
  console.log('\n' + '─'.repeat(80) + '\n');

  // 2. Listar categorías
  console.log('2️⃣  GET /categories');
  const categories = await request('GET', '/categories');
  console.log('Status:', categories.status);
  console.log('Categorías encontradas:', categories.data?.length || 0);
  if (categories.data?.length > 0) {
    console.log('Primera categoría:', JSON.stringify(categories.data[0], null, 2));
  }
  console.log('\n' + '─'.repeat(80) + '\n');

  // 3. Listar métodos de pago
  console.log('3️⃣  GET /payment-methods');
  const paymentMethods = await request('GET', '/payment-methods');
  console.log('Status:', paymentMethods.status);
  console.log('Métodos de pago encontrados:', paymentMethods.data?.length || 0);
  if (paymentMethods.data?.length > 0) {
    console.log('Primer método:', JSON.stringify(paymentMethods.data[0], null, 2));
  }
  console.log('\n' + '─'.repeat(80) + '\n');

  // 4. Listar monedas
  console.log('4️⃣  GET /currencies');
  const currencies = await request('GET', '/currencies');
  console.log('Status:', currencies.status);
  console.log('Monedas encontradas:', currencies.data?.length || 0);
  if (currencies.data?.length > 0) {
    console.log('Primera moneda:', JSON.stringify(currencies.data[0], null, 2));
  }
  console.log('\n' + '─'.repeat(80) + '\n');

  // 5. Crear una categoría personalizada
  console.log('5️⃣  POST /categories');
  const newCategory = await request('POST', '/categories', {
    id: 'mi_categoria_test',
    nombre: 'Mi Categoría Test',
    icono: '🎯',
    color: '#FF5733',
    descripcion: 'Categoría de prueba',
    subcategorias: [
      {
        id: 'subcategoria_1',
        nombre: 'Subcategoría 1',
        descripcion: 'Test'
      }
    ]
  });
  console.log('Status:', newCategory.status);
  console.log('Respuesta:', JSON.stringify(newCategory.data, null, 2));
  console.log('\n' + '─'.repeat(80) + '\n');

  console.log('✅ Pruebas completadas!');
}

// Ejecutar
const token = process.argv[2];

if (!token) {
  console.error('❌ Debes proporcionar un Firebase ID Token');
  console.log('\nUso:');
  console.log('node scripts/test-api.js <tu-firebase-id-token>');
  console.log('\nPara obtener un token, usa:');
  console.log('node scripts/get-token.js usuario@ejemplo.com');
  process.exit(1);
}

testAPIs(token).catch(console.error);
