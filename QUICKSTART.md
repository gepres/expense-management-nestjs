# Guía Rápida de Inicio

## Pasos para comenzar en 5 minutos

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita Authentication (Email/Password)
4. Habilita Firestore Database
5. Habilita Storage
6. Descarga credenciales:
   - Project Settings → Service Accounts
   - Generate new private key
   - Guarda como `firebase-service-account.json`

### 3. Obtener API Key de Anthropic

1. Ve a [Anthropic Console](https://console.anthropic.com/)
2. Crea una cuenta / Inicia sesión
3. Ve a API Keys
4. Crea una nueva API key
5. Copia la key (empieza con `sk-ant-`)

### 4. Configurar .env

```bash
cp .env.example .env
```

Edita `.env` y configura:
```env
ANTHROPIC_API_KEY=sk-ant-TU_API_KEY_AQUI
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
```

### 5. Iniciar el servidor

```bash
npm run start:dev
```

### 6. Verificar que funciona

Abre en tu navegador:
- API: http://localhost:3000/api/health
- Docs: http://localhost:3000/api/docs

Deberías ver:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T...",
  "services": {
    "firebase": "ok",
    "anthropic": "ok"
  }
}
```

## Próximos pasos

### Configurar reglas de Firestore

En Firebase Console → Firestore → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Configurar reglas de Storage

En Firebase Console → Storage → Rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /receipts/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Probar la API

#### 1. Crear un usuario en Firebase (desde tu frontend o Firebase Console)

#### 2. Obtener el ID Token

Desde tu frontend o usando Firebase CLI:
```javascript
const idToken = await user.getIdToken();
```

#### 3. Hacer requests al backend

```bash
curl -H "Authorization: Bearer YOUR_ID_TOKEN" \
     http://localhost:3000/api/users/profile
```

## Endpoints principales

- `GET /api/health` - Health check (sin auth)
- `GET /api/users/profile` - Obtener perfil
- `GET /api/categories` - Listar categorías
- `POST /api/expenses` - Crear gasto
- `POST /api/receipts/scan` - Escanear comprobante
- `POST /api/chat/conversations` - Nueva conversación

## Documentación completa

Ver [README.md](./README.md) para documentación completa.

## Problemas comunes

### Error: Firebase credentials not found
- Verifica que `firebase-service-account.json` existe en la raíz
- O configura las variables de entorno individuales

### Error: Anthropic API key invalid
- Verifica que la API key es válida
- Verifica que tienes créditos en tu cuenta Anthropic

### Puerto 3000 en uso
Cambia el puerto en `.env`:
```env
PORT=3001
```

## Ayuda

Para más ayuda, consulta:
- [README.md](./README.md) - Documentación completa
- [Swagger Docs](http://localhost:3000/api/docs) - Documentación de API
- [Issues](https://github.com/tu-repo/issues) - Reportar problemas
