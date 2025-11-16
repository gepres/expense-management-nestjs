# Gastos Backend API

API REST para asistente IA especializado en gestión de gastos personales, construida con NestJS, Firebase (Auth + Firestore) y Anthropic Claude.

## Descripción

Backend completo que proporciona:
- Autenticación con Firebase Authentication
- Almacenamiento en Firestore
- Asistente IA con Claude (Anthropic)
- Gestión de gastos personales
- Escaneo de comprobantes con OCR/Vision
- Importación desde Excel
- Análisis financiero con IA

## Tecnologías

- **NestJS** - Framework backend
- **TypeScript** - Lenguaje
- **Firebase Admin SDK** - Auth + Firestore + Storage
- **Anthropic Claude** - IA para chat y análisis
- **Swagger/OpenAPI** - Documentación de API
- **Class-validator** - Validación de DTOs
- **Sharp** - Procesamiento de imágenes
- **ExcelJS** - Importación de Excel

## Requisitos Previos

- Node.js >= 18.x
- npm >= 9.x
- Cuenta de Firebase con proyecto configurado
- API Key de Anthropic
- Archivo de credenciales de Firebase Admin SDK

## Instalación

### 1. Clonar el repositorio

```bash
git clone <repository-url>
cd gastos-backend
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copiar el archivo de ejemplo y configurar:

```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:

```env
# Application
NODE_ENV=development
PORT=3000

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:3001

# Firebase
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
FIREBASE_STORAGE_BUCKET=your-project.appspot.com

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### 4. Configurar Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto
3. Ve a **Project Settings** → **Service Accounts**
4. Click en **Generate new private key**
5. Guarda el archivo como `firebase-service-account.json` en la raíz del proyecto

**IMPORTANTE:** Nunca commitees este archivo. Ya está en `.gitignore`.

### 5. Configurar Firestore Rules

En Firebase Console → Firestore Database → Rules:

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

### 6. Configurar Storage Rules

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

## Scripts Disponibles

```bash
# Desarrollo
npm run start:dev      # Modo watch con hot-reload

# Producción
npm run build          # Compilar proyecto
npm run start:prod     # Ejecutar versión compilada

# Testing
npm run test           # Unit tests
npm run test:watch     # Tests en modo watch
npm run test:cov       # Coverage
npm run test:e2e       # End-to-end tests

# Linting y formato
npm run lint           # ESLint
npm run format         # Prettier
```

## Estructura del Proyecto

```
src/
├── config/                    # Configuraciones
│   ├── env.validation.ts      # Validación de variables de entorno
│   ├── firebase.config.ts     # Config Firebase
│   └── anthropic.config.ts    # Config Anthropic
├── common/                    # Utilidades compartidas
│   ├── decorators/           # @CurrentUser(), etc.
│   ├── filters/              # Exception filters
│   ├── guards/               # FirebaseAuthGuard
│   ├── interceptors/         # Logging interceptor
│   └── interfaces/           # Interfaces compartidas
├── modules/
│   ├── firebase/             # Firebase Admin SDK
│   ├── anthropic/            # Anthropic/Claude service
│   ├── users/                # Gestión de usuarios
│   ├── categories/           # Categorías de gastos
│   ├── chat/                 # Conversaciones con IA
│   ├── expenses/             # CRUD de gastos
│   ├── receipts/             # Escaneo de comprobantes
│   └── import/               # Importación desde Excel
├── app.module.ts             # Módulo principal
└── main.ts                   # Bootstrap de la aplicación
```

## Uso de la API

### Autenticación

Todos los endpoints (excepto `/health`) requieren autenticación con Firebase ID Token:

```bash
Authorization: Bearer <firebase-id-token>
```

### Documentación Swagger

Una vez iniciado el servidor, accede a:

```
http://localhost:3000/api/docs
```

### Ejemplos de Endpoints

#### Obtener perfil del usuario

```bash
GET /api/users/profile
Authorization: Bearer <token>
```

#### Listar categorías

```bash
GET /api/categories
Authorization: Bearer <token>
```

#### Crear gasto

```bash
POST /api/expenses
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 45.50,
  "currency": "PEN",
  "category": "Alimentación",
  "description": "Almuerzo",
  "date": "2025-01-15T12:00:00Z",
  "paymentMethod": "yape",
  "merchant": "Restaurante El Paisa"
}
```

#### Escanear comprobante

```bash
POST /api/receipts/scan
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <imagen-del-comprobante.jpg>
```

#### Chat con IA

```bash
POST /api/chat/conversations/:conversationId/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "¿Cuánto gasté en alimentación este mes?"
}
```

## Integración con Frontend

### Flujo de Autenticación

```javascript
// 1. Autenticar en Firebase (frontend)
import { signInWithEmailAndPassword } from 'firebase/auth';

const userCredential = await signInWithEmailAndPassword(auth, email, password);
const idToken = await userCredential.user.getIdToken();

// 2. Usar token en requests al backend
const response = await fetch('http://localhost:3000/api/expenses', {
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  },
});

// 3. Refresh automático del token
onIdTokenChanged(auth, async (user) => {
  if (user) {
    const token = await user.getIdToken(true);
    // Actualizar token en tu estado global
  }
});
```

## Características Principales

### 1. Gestión de Gastos
- CRUD completo de gastos
- Filtrado por fecha, categoría, monto, método de pago
- Verificación manual de gastos
- Estadísticas y resúmenes

### 2. Asistente IA
- Chat contextual sobre finanzas personales
- Análisis de patrones de gasto
- Recomendaciones personalizadas
- Generación de reportes

### 3. Escaneo de Comprobantes
- OCR con Claude Vision
- Extracción automática de datos (monto, fecha, comercio)
- Detección de Yape, Plin, transferencias
- Sugerencia de categoría
- Nivel de confianza de extracción

### 4. Importación de Datos
- Descarga de plantilla Excel
- Validación de datos antes de importar
- Mejora con IA (categorización, descripciones)
- Detección de duplicados
- Importación masiva eficiente

### 5. Categorías
- 8 categorías predeterminadas
- Creación de categorías personalizadas
- Validación de eliminación (sin gastos asociados)

## Seguridad

- Autenticación obligatoria con Firebase ID Tokens
- Validación de ownership en todas las operaciones
- Validación de DTOs con class-validator
- Rate limiting configurado
- CORS configurado para orígenes específicos
- Sanitización de inputs
- No exposición de errores internos

## Rate Limiting

- General: 100 requests/minuto
- Escaneo de recibos: 10 requests/minuto
- Llamadas a IA: 20 requests/minuto

## Deployment

### Variables de Entorno para Producción

En lugar de usar archivo `firebase-service-account.json`, configura:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
```

### Build para Producción

```bash
npm run build
npm run start:prod
```

### Health Check

```bash
GET /api/health
```

Verifica el estado de Firebase y Anthropic.

## Troubleshooting

### Error: Firebase credentials not found

Asegúrate de que:
- El archivo `firebase-service-account.json` existe
- O las variables `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` están configuradas

### Error: Anthropic API key invalid

Verifica que `ANTHROPIC_API_KEY` en `.env` es válida y tiene créditos.

### Error: CORS

Agrega el origen de tu frontend a `CORS_ORIGIN` en `.env`:

```env
CORS_ORIGIN=http://localhost:5173,https://tu-dominio.com
```

### Token expired

Los tokens de Firebase expiran cada hora. El frontend debe refrescarlos automáticamente.

## Contribuir

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## Licencia

MIT

## Soporte

Para preguntas y soporte, abre un issue en el repositorio.
