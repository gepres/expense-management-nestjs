# Arquitectura — Gastos Backend API

Backend NestJS 11 para un sistema de gestión de gastos con IA, sobre Firebase (Firestore + Auth + Storage) y Anthropic Claude.

---

## 1. Patrón de request

```
Request
  └─▶ FirebaseAuthGuard           (valida el Firebase ID Token del header Authorization)
        └─▶ @CurrentUser()        (inyecta { uid, email, ... } en el handler)
              └─▶ Controller
                    └─▶ Service   (lógica de negocio, SIEMPRE filtra por userId)
                          └─▶ FirebaseService → Firestore / Auth / Storage
```

- **Prefijo global:** todas las rutas cuelgan de `/api` (`app.setGlobalPrefix('api')`).
- **Excepciones de auth:** `GET /api/health` y `GET /` son públicos. El cron de programados usa un esquema propio (`Authorization: Bearer ${CRON_SECRET}`), no `FirebaseAuthGuard`.
- **Bootstrap** (`src/main.ts`):
  - `bodyParser.urlencoded` + `json` **antes** de CORS (necesario para los webhooks de Twilio).
  - CORS desde `CORS_ORIGIN` (lista separada por comas), `credentials: true`.
  - `ValidationPipe` global: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `enableImplicitConversion: true`.
  - `HttpExceptionFilter` global (no expone errores internos).
  - `LoggingInterceptor` global (log de request/response).
  - Swagger en `/api/docs` con `firebase-auth` Bearer scheme.

### Regla de oro: ownership por `userId`

Ningún servicio devuelve datos sin filtrar por el `userId` del token. Antes de update/delete se re-lee el documento y se valida `data.userId === userId` (→ `ForbiddenException`).

```typescript
const expenses = await firestore
  .collection('gastos')
  .where('userId', '==', userId)
  .orderBy('fecha', 'desc')
  .get();
```

---

## 2. Módulos

### Globales (infraestructura)

| Módulo | Responsabilidad |
|---|---|
| `FirebaseModule` | Instancia singleton del Admin SDK. `getFirestore()`, `getAuth()`, `getStorage()`, `verifyIdToken()` |
| `AnthropicModule` | Cliente Claude: `sendMessage()`, `extractReceiptData()` (Vision/OCR), `categorizeExpense()`, `analyzeExpenses()` |

### De negocio

| Módulo | Propósito |
|---|---|
| `users` | Perfil, inicialización del usuario en primer login, link de WhatsApp |
| `categories` | 8 categorías por defecto + personalizadas, subcategorías y sugerencias |
| `payment-methods` | Métodos de pago del usuario |
| `currencies` | Monedas del usuario |
| `expenses` | CRUD, filtros, parseo en lenguaje natural (`/parse`), export JSON/Excel |
| `receipts` | Escaneo de comprobantes con Claude Vision (Yape/Plin/boletas) |
| `chat` | Conversaciones persistentes multi-turno con la IA |
| `import` | Importación masiva Excel/JSON: validate → analyze (IA) → upload, con detección de duplicados |
| `accounts` | Multi-cuenta (banco, ahorro, billetera, tarjeta) con sub-saldos banco/efectivo |
| `transfers` | Transferencias atómicas entre cuentas, con conversión de moneda |
| `cash-movements` | Ingreso / retiro / depósito de efectivo / reversión (atómicos) |
| `presupuestos` | Sub-reservas opcionales por categoría |
| `programados` | Gastos y transferencias recurrentes accionados por cron (ver §4) |
| `notificaciones` | Alertas in-app generadas por el cron, consumidas por el cliente (ver §5) |
| `shortcuts` | Atajos de gasto rápido |
| `voice` | Procesamiento de gastos a partir de audio/voz |
| `shopping-lists` | Listas de compra (items, desde texto libre) |
| `shared` | Grupos de gastos compartidos: presupuestos, miembros, invitaciones, liquidación, insights |
| `whatsapp` | Webhook productor + `link`/`unlink` + ruta legacy (ver [WHATSAPP_FLOW.md](./WHATSAPP_FLOW.md)) |

> `src/modules/fcm/` existe como carpeta vacía y **no** está cableado en `app.module.ts`.

---

## 3. Modelo de datos (Firestore)

### Subcolecciones por usuario

```
users/{userId}/
  ├── profile/                 # datos del usuario (incl. whatsappPhone, zonaHoraria)
  ├── categories/              # categorías personalizadas + subcategorías
  ├── paymentMethods/          # métodos de pago
  ├── currencies/              # monedas
  ├── shortcuts/               # atajos de gasto rápido
  ├── conversations/{id}/
  │     └── messages/          # historial de chat
  └── imports/                 # auditoría de importaciones
```

### Colecciones top-level (filtradas por campo `userId`)

```
expenses/                      # gastos
accounts/                      # multi-cuenta
transfers/                     # transferencias (inmutable desde cliente)
cash-movements/                # movimientos de efectivo (inmutable desde cliente)
presupuestos/                  # sub-reservas por categoría
gastosProgramados/             # plantillas de gasto recurrente (write bloqueado al cliente)
transferenciasProgramadas/     # plantillas de transferencia recurrente (write bloqueado, cross-currency)
ejecucionesProgramadas/        # log de auditoría del cron / lock de idempotencia (write bloqueado)
notificaciones/                # alertas del cron (create bloqueado; update solo `leida`)
receipts/                      # documentos de comprobantes
shopping-lists/                # listas de compra
shared_groups/                 # grupos de gastos compartidos
whatsapp_queue/                # cola productor/consumidor de WhatsApp (ver WHATSAPP_FLOW.md)
aiUsageEvents/                 # 1 evento por llamada IA (auditoría; write solo Admin SDK)
aiUsageMonthly/{uid}_{YYYY-MM} # rollup mensual de consumo IA por usuario (cuota)
aiUsageAppMonthly/{YYYY-MM}    # rollup mensual del consumo IA autogenerado (scope app)
```

### Timestamps

```typescript
import { Timestamp } from 'firebase-admin/firestore';
createdAt: Timestamp.now();                       // escritura
const date = (doc.data().fecha as Timestamp).toDate();  // lectura
```

### Bulk inserts

`firestore.batch()` con máximo **500 operaciones** por commit.

### Reglas de seguridad

Las reglas autoritativas viven en el **repo frontend** (`gastos/firestore.rules`) y se despliegan con `firebase deploy --only firestore:rules`. Resumen relevante:

- Colecciones top-level de usuario: el cliente lee/escribe lo suyo (`resource.data.userId == request.auth.uid`). `transfers` y `cash-movements` son inmutables desde el cliente.
- Colecciones de **programados** (`gastosProgramados`, `transferenciasProgramadas`, `ejecucionesProgramadas`): el cliente solo **lee**; las escrituras solo las hace este backend (Admin SDK omite las reglas). **No negociable** — evita que el cliente manipule `proximaEjecucion`.
- `notificaciones`: create bloqueado al cliente; update limitado a marcar `leida`.
- Los índices compuestos se versionan en `gastos/firestore.indexes.json`. Al añadir una query con `where + where/orderBy` sobre un campo nuevo, hay que añadir el índice y `firebase deploy --only firestore:indexes`.

---

## 4. Subsistema de programados (cron)

El módulo `programados` posee 2 colecciones de plantillas (`gastosProgramados`, `transferenciasProgramadas`) y una de auditoría (`ejecucionesProgramadas`).

### Disparo

- **Local:** `@nestjs/schedule` ejecuta `ProgramadosCron.procesarPendientes` cada 30 min.
- **Producción (Vercel serverless):** el `@Cron` **no** corre. En su lugar, un **GitHub Actions** (`.github/workflows/cron-programados.yml`) llama `POST /api/programados/cron/run` cada 15 min con `Authorization: Bearer ${CRON_SECRET}` (`ProgramadosCronController`). Procesa gastos y transferencias en el mismo ciclo.

### Idempotencia (patrón no negociable)

Lock determinístico con ID `{programadaId}_{fechaProgramadaISO}` en `ejecucionesProgramadas`. Se crea con `.create()` (falla con código `6`/`ALREADY_EXISTS` si ya existe) **ANTES** de cualquier efecto secundario. Seguro ante multi-worker, reinicios y disparos concurrentes local+prod.

> **Nunca** mover la creación del lock dentro de la transacción.

### Ejecución atómica

Cada disparo corre dentro de `firestore.runTransaction(...)`:

1. Valida ownership y existencia de la cuenta (re-lee dentro de la tx).
2. Re-lee la plantilla para detectar pausa/borrado a mitad de corrida.
3. Decrementa el saldo del campo correcto (`bankBalance`, o `cashBalance` si `metodoPago === 'efectivo'`).
4. Crea el documento `expense`/`transfer` con el marcador `programadaId`.
5. Recalcula y escribe `proximaEjecucion` (o `activo: false` si no hay más disparos).
6. Marca el lock como `exitosa` / `fallida` / `saldo_insuficiente`.

### Manejo de fallos

- **Saldo insuficiente:** marca `saldo_insuficiente` pero **avanza** `proximaEjecucion` (no se atasca; el usuario debe agregar fondos).
- **Cuenta destino eliminada (solo transferencias):** marca `fallida` y **pausa** la plantilla.

### Timezone-aware

`utils/calcular-proxima.ts` usa `date-fns-tz` respetando la `zonaHoraria` IANA del usuario (p. ej. `America/Lima`). La semántica "día 5 a las 12:00" es hora local; el almacenamiento es UTC.

### Transferencias cross-currency

Cuando `monedaDestino !== moneda`, la tasa de cambio se resuelve **fuera** de `runTransaction` (fetch externo no es retry-safe dentro de una tx). Dos modos:

- **Fija:** `exchangeRate` en el documento de la plantilla.
- **En vivo:** `usarTasaActual: true` → `FxService.getRate()` llama a la API Frankfurter con caché in-memory de 1 h.

Fallo de FX → ejecución `fallida` + notificación `fx_api_error`, sin tocar saldos. `amountConverted` **no** se persiste en la plantilla: se recalcula en cada ejecución (para que `usarTasaActual` produzca valores frescos).

### Endpoints

```
/api/programados/gastos           → ProgramadosController + ProgramadosService
/api/programados/transferencias    → TransferenciasProgramadasController + TransferenciasProgramadasService
/api/programados/cron/run   POST   → ProgramadosCronController (auth: Bearer CRON_SECRET)
```

Ambos exponen `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/pause`, `POST /:id/resume`, `GET /:id/ejecuciones` (historial, máx. 100). El `PATCH` recalcula `proximaEjecucion` si cambia algún campo de la plantilla.

### Al añadir una frecuencia nueva

Actualizar el enum `FrecuenciaProgramado` **y** añadir el caso en `calcularProximaEjecucion` **y** un test en `calcular-proxima.spec.ts`.

---

## 5. Subsistema de notificaciones

`NotificacionesService.crear` se llama desde el cron ante un fallo. Es **best-effort y NUNCA lanza** (captura internamente) — una notificación no puede romper la ejecución del cron.

Tipos actuales (`notificaciones/interfaces/notificacion.interface.ts`): `saldo_insuficiente`, `ejecucion_fallida`, `cuenta_destino_eliminada`, `fx_api_error`. Al añadir un tipo, mantener sincronizado el frontend (`types/notificaciones.ts`: labels + icons).

Endpoints:

```
GET    /api/notificaciones                 # ?soloNoLeidas=true filtra
GET    /api/notificaciones/contar-no-leidas
PATCH  /api/notificaciones/:id/leida
POST   /api/notificaciones/marcar-todas-leidas
DELETE /api/notificaciones/:id
```

---

## 6. WhatsApp (productor/consumidor)

El módulo `whatsapp` es un **productor delgado**: el webhook solo normaliza el teléfono y encola el mensaje en `whatsapp_queue` (no hace IA ni responde). El **consumidor vive en un repo aparte** (`gastos-firebase-functions`) y se comunica solo a través de esa colección Firestore.

Detalle end-to-end, esquema de la cola, ciclo de vida y caveats de seguridad: **[WHATSAPP_FLOW.md](./WHATSAPP_FLOW.md)**.

---

## 7. Subsistema de consumo IA (tracking + cuotas)

Módulo global `ai-usage`. Atraviesa todos los call sites de IA.

### Tracking (Fase 1)

`UsageService.record()` se invoca tras cada llamada a Anthropic/OpenAI con
un `usageCtx = { userId, scope, feature }` **explícito** del call site:

- `scope: 'user'` → consumo iniciado por el usuario (asistente, métricas
  IA, voz, y todo el bot de WhatsApp). Cuenta para cuota.
- `scope: 'app'` → autogenerado (autocategorización, sugerencias de
  import, OCR sin auth, parseos internos). Solo se registra.

Escribe (Admin SDK, best-effort, **nunca** rompe el flujo IA):
`aiUsageEvents/{id}` (auditoría) + `increment` en
`aiUsageMonthly/{uid}_{YYYY-MM}` (scope user) o `aiUsageAppMonthly/{YYYY-MM}`
(scope app). Anthropic da tokens reales; OpenAI imágenes/Whisper → costo
estimado por unidad (env `AI_PRICE_*`). Mes en **UTC**.

### Enforcement (Fase 2)

`QuotaService.assertWithinQuota(uid, { feature, isImage? })` se llama
**antes** de cada operación `scope:'user'` (chat, analytics
insights/ask/roast/image, voz). Lee el rol (`users/{uid}.role`) + el
rollup mensual (O(1), 1 doc). Si `usado >= límiteRol` → **429**
`{ error: 'AiQuotaExceeded' | 'AiImageQuotaExceeded', message, used,
limit, resetAt }`. `admin` = ilimitado; `scope:'app'` no se bloquea.
Límites por env `AI_QUOTA_*`. Reset natural por la clave de mes (sin job).
`GET /api/ai-usage/me` expone el snapshot para el medidor del cliente.

El **consumidor de WhatsApp** (`gastos-firebase-functions`) replica el
mismo cálculo (`checkQuota`, lectura del mismo doc) y, si excede, responde
por WhatsApp y cierra el item sin reintento — best-effort (si la lectura
falla, no bloquea). Las reglas/índices de estas colecciones viven en el
repo frontend `gastos`. Contrato completo: `gastos/docs/ai-usage.md`.

---

## 8. Convenciones de código

- **Path alias:** `@/` → `src/` (`import { FirebaseService } from '@/modules/firebase/firebase.service';`).
- **DTOs obligatorios:** todo body tiene un DTO con decoradores `class-validator`; el `ValidationPipe` global valida y transforma.
- **Swagger:** documentar controllers con `@ApiTags`, `@ApiBearerAuth('firebase-auth')`, `@ApiOperation`, `@ApiResponse`.
- **Tests:** co-localizados como `*.spec.ts`, Jest + ts-jest.
