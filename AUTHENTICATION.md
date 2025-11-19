# 🔐 Guía de Autenticación - Gastos Backend API

Esta API usa **Firebase Authentication** para proteger los endpoints. Aquí encontrarás todas las formas de autenticarte y usar las APIs.

---

## 📋 Índice

1. [Configuración Inicial](#configuración-inicial)
2. [Métodos de Autenticación](#métodos-de-autenticación)
3. [Usando Swagger UI](#usando-swagger-ui)
4. [Usando Postman/Thunder Client](#usando-postmanthunder-client)
5. [Usando cURL](#usando-curl)
6. [Usando Scripts Node.js](#usando-scripts-nodejs)
7. [Usando el HTML de Testing](#usando-el-html-de-testing)

---

## Configuración Inicial

### 1. Configurar Firebase

Asegúrate de tener configuradas las credenciales de Firebase:

```bash
# .env
FIREBASE_SERVICE_ACCOUNT_PATH=/ruta/a/tu/serviceAccountKey.json
```

### 2. Iniciar el servidor

```bash
npm run dev
```

El servidor estará disponible en: `http://localhost:3000`

---

## Métodos de Autenticación

### Opción 1: Swagger UI (Recomendado para desarrollo)

La forma más fácil para probar los endpoints:

1. **Abre Swagger:**
   ```
   http://localhost:3000/api/docs
   ```

2. **Obtén un token de Firebase** (usa uno de los métodos descritos abajo)

3. **Haz clic en "Authorize"** (botón con candado verde arriba a la derecha)

4. **Ingresa tu token:**
   ```
   tu-firebase-id-token-aqui
   ```

5. **Click en "Authorize" y luego "Close"**

6. **¡Listo!** Ahora puedes usar todos los endpoints protegidos

---

### Opción 2: HTML de Testing (La más simple)

Usa el archivo HTML para autenticarte visualmente:

1. **Edita el archivo:**
   ```bash
   scripts/login-test.html
   ```

2. **Reemplaza los valores de Firebase:**
   ```javascript
   const firebaseConfig = {
       apiKey: "TU_API_KEY",
       authDomain: "TU_AUTH_DOMAIN",
       projectId: "TU_PROJECT_ID",
       // ... otros valores
   };
   ```

3. **Abre el archivo en tu navegador:**
   ```bash
   # Windows
   start scripts/login-test.html

   # Mac
   open scripts/login-test.html

   # Linux
   xdg-open scripts/login-test.html
   ```

4. **Regístrate o inicia sesión**

5. **Copia el token generado**

---

### Opción 3: Scripts de Node.js

#### Crear usuario y obtener token:

```bash
# Configurar variable de entorno
export FIREBASE_SERVICE_ACCOUNT_PATH=/ruta/a/serviceAccountKey.json

# Windows PowerShell
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\ruta\a\serviceAccountKey.json"

# Generar token para un usuario
node scripts/get-token.js usuario@ejemplo.com
```

#### Probar las APIs:

```bash
# Usar el token obtenido para probar las APIs
node scripts/test-api.js tu-firebase-id-token
```

---

### Opción 4: Postman / Thunder Client

1. **Crea una nueva petición**

2. **Configura la autenticación:**
   - Ve a la pestaña **"Authorization"**
   - Tipo: **Bearer Token**
   - Token: pega tu Firebase ID Token

3. **Configura los headers:**
   ```
   Authorization: Bearer tu-firebase-id-token
   Content-Type: application/json
   ```

4. **Ejemplo de petición:**
   ```
   GET http://localhost:3000/api/categories
   ```

---

### Opción 5: cURL

```bash
# Obtener categorías
curl -H "Authorization: Bearer TU_FIREBASE_TOKEN" \
     http://localhost:3000/api/categories

# Crear una categoría
curl -X POST \
     -H "Authorization: Bearer TU_FIREBASE_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "id": "mi_categoria",
       "nombre": "Mi Categoría",
       "icono": "🎯",
       "color": "#FF5733"
     }' \
     http://localhost:3000/api/categories

# Obtener métodos de pago
curl -H "Authorization: Bearer TU_FIREBASE_TOKEN" \
     http://localhost:3000/api/payment-methods

# Obtener monedas
curl -H "Authorization: Bearer TU_FIREBASE_TOKEN" \
     http://localhost:3000/api/currencies
```

---

## 🔑 ¿Cómo obtener un Firebase ID Token?

### Método 1: Desde el SDK de Firebase (Cliente Web)

```javascript
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const auth = getAuth();
const userCredential = await signInWithEmailAndPassword(auth, email, password);
const token = await userCredential.user.getIdToken();

console.log('Token:', token);
```

### Método 2: Desde Firebase Admin (Servidor)

```javascript
const admin = require('firebase-admin');

// Crear custom token
const customToken = await admin.auth().createCustomToken(uid);

// Luego el cliente debe cambiarlo por un ID token:
// firebase.auth().signInWithCustomToken(customToken)
```

### Método 3: Usando la API REST de Firebase

```bash
# Exchange custom token por ID token
curl -X POST \
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "token": "CUSTOM_TOKEN",
    "returnSecureToken": true
  }'
```

---

## 📚 Endpoints Disponibles

### Usuarios
- `GET /api/users/profile` - Obtener perfil
- `PATCH /api/users/profile` - Actualizar perfil
- `POST /api/users/initialize` - Inicializar usuario

### Categorías
- `GET /api/categories` - Listar todas
- `GET /api/categories/:id` - Obtener una
- `POST /api/categories` - Crear
- `PATCH /api/categories/:id` - Actualizar
- `DELETE /api/categories/:id` - Eliminar
- `POST /api/categories/:categoryId/subcategories` - Agregar subcategoría
- `PATCH /api/categories/:categoryId/subcategories/:subcategoryId` - Actualizar subcategoría
- `DELETE /api/categories/:categoryId/subcategories/:subcategoryId` - Eliminar subcategoría

### Métodos de Pago
- `GET /api/payment-methods` - Listar todos
- `GET /api/payment-methods/:id` - Obtener uno
- `POST /api/payment-methods` - Crear
- `PATCH /api/payment-methods/:id` - Actualizar
- `DELETE /api/payment-methods/:id` - Eliminar

### Monedas
- `GET /api/currencies` - Listar todas
- `GET /api/currencies/:id` - Obtener una
- `POST /api/currencies` - Crear
- `PATCH /api/currencies/:id` - Actualizar
- `DELETE /api/currencies/:id` - Eliminar

---

## 🔒 Notas de Seguridad

1. **Los tokens expiran**: Los ID tokens de Firebase expiran después de 1 hora
2. **Renovar tokens**: El cliente debe renovar el token automáticamente
3. **No compartir tokens**: Los tokens son personales y no deben compartirse
4. **HTTPS en producción**: Siempre usa HTTPS en producción

---

## 🐛 Troubleshooting

### Error: "No token provided"
- Verifica que estés enviando el header: `Authorization: Bearer TOKEN`

### Error: "Token expired"
- Genera un nuevo token, los tokens expiran después de 1 hora

### Error: "Invalid token"
- Verifica que sea un ID Token de Firebase (no un Custom Token)
- Verifica que el proyecto de Firebase sea el correcto

### Error: "User not found"
- El usuario debe existir en Firebase Authentication
- Usa el script `get-token.js` para crear un usuario de prueba

---

## 💡 Tips

1. **Usa Swagger para desarrollo**: Es la forma más rápida de probar endpoints
2. **Guarda tus tokens**: Usa variables de entorno o archivos `.env.local`
3. **Automatiza con scripts**: Los scripts de Node.js son útiles para CI/CD
4. **Postman Collections**: Crea una colección de Postman para reutilizar peticiones

---

## 📞 Soporte

Si tienes problemas, revisa:
- La documentación de Swagger: `http://localhost:3000/api/docs`
- Los logs del servidor en la consola
- La configuración de Firebase en `.env`
