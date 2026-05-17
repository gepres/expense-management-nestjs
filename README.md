# Gastos Backend API

API REST para un asistente de IA especializado en gestión de gastos personales. Construida con **NestJS 11**, **Firebase** (Auth + Firestore + Storage) y **Anthropic Claude**, con ingestión por **WhatsApp**, escaneo de comprobantes con **Claude Vision**, importación desde Excel/JSON y operaciones recurrentes (gastos y transferencias programadas) accionadas por cron.

> **Idioma de la documentación:** la documentación de usuario está en español. `CLAUDE.md` (guía para Claude Code) se mantiene en inglés a propósito.

---

## 📚 Índice de documentación

Toda la documentación detallada vive en [`docs/`](./docs). Punto de entrada: [`docs/README.md`](./docs/README.md).

| Documento | Contenido |
|---|---|
| [docs/QUICKSTART.md](./docs/QUICKSTART.md) | Puesta en marcha en ~5 minutos |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Arquitectura, módulos, modelo de datos Firestore, flujo de request, cron de programados |
| [docs/API.md](./docs/API.md) | Referencia completa de endpoints (todos los módulos) |
| [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md) | Cómo autenticarse (Swagger, cURL, Postman, scripts) y obtener un Firebase ID Token |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Despliegue en Vercel, variables de producción, cron vía GitHub Actions, reglas/índices Firestore |
| [docs/RECEIPTS_TESTING.md](./docs/RECEIPTS_TESTING.md) | Guía de pruebas del módulo de comprobantes (OCR/Vision) |
| [docs/WHATSAPP_FLOW.md](./docs/WHATSAPP_FLOW.md) | Flujo WhatsApp productor/consumidor end-to-end (al día) |
| [docs/WHATSAPP_HYBRID_SETUP.md](./docs/WHATSAPP_HYBRID_SETUP.md) | Guía histórica de la migración a arquitectura híbrida |

---

## ✨ Características

- **Autenticación Firebase** — todos los endpoints (salvo `/api/health` y la raíz) requieren un Firebase ID Token.
- **Gestión de gastos** — CRUD, filtros, parseo en lenguaje natural, export JSON/Excel.
- **Asistente IA (Claude)** — chat contextual multi-turno, análisis de patrones de gasto, categorización.
- **Escaneo de comprobantes** — OCR con Claude Vision (Yape/Plin/boletas/transferencias), detección de subcategorías.
- **Importación masiva** — Excel/JSON con validación, detección de duplicados y mejora con IA.
- **Multi-cuenta** — cuentas (banco, ahorro, billetera, tarjeta) con sub-saldos banco/efectivo.
- **Transferencias atómicas** — entre cuentas, con conversión de moneda.
- **Movimientos de efectivo** — ingreso / retiro / depósito / reversión (atómicos).
- **Presupuestos** — sub-reservas opcionales por categoría.
- **Programados (recurrentes)** — gastos y transferencias automáticas vía cron, timezone-aware, idempotentes.
- **Notificaciones in-app** — alertas generadas por el cron (saldo insuficiente, ejecución fallida, error FX, etc.).
- **Métricas PRO** — KPIs/series + análisis IA (insights, roast, ilustración OpenAI), PRO-gated.
- **Consumo IA (tracking + cuotas)** — registra tokens por usuario/aplicativo y aplica cuota mensual por rol (429 al exceder). Ver [docs/ARCHITECTURE.md §7](./docs/ARCHITECTURE.md) y `gastos/docs/ai-usage.md`.
- **Ingestión WhatsApp** — webhook productor/consumidor desacoplado por una cola Firestore (consumidor en repo aparte).
- **Voz, atajos, listas de compra, grupos compartidos** — módulos complementarios.

---

## 🧱 Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | NestJS 11 (Express) |
| Lenguaje | TypeScript 5.7 |
| Auth + BD + Storage | Firebase Admin SDK 13 (Auth, Firestore, Storage) |
| IA | Anthropic Claude (`@anthropic-ai/sdk`) + OpenAI (Whisper STT, ilustración) |
| IA compartida | `@gastos/expense-ai` (vendoreada) — modelos, prompts, parsers, clasificador y schema `learning_log`; single source of truth con el bot de WhatsApp |
| Imágenes | Sharp + Cloudinary |
| Excel | ExcelJS + xlsx |
| Cron | `@nestjs/schedule` (local) + GitHub Actions (producción serverless) |
| Fechas/TZ | `date-fns` + `date-fns-tz` |
| Mensajería | Twilio (WhatsApp) |
| Validación | class-validator / class-transformer |
| Docs API | Swagger / OpenAPI (`@nestjs/swagger`) |

---

## 🚀 Inicio rápido

```bash
npm install
cp .env.example .env        # editar con tus credenciales
npm run start:dev           # http://localhost:3000
```

- API: `http://localhost:3000/api`
- Health: `http://localhost:3000/api/health`
- Swagger: `http://localhost:3000/api/docs`

Guía paso a paso (Firebase, Anthropic, Cloudinary, reglas): **[docs/QUICKSTART.md](./docs/QUICKSTART.md)**.

---

## 🛠️ Scripts

```bash
npm run start:dev    # desarrollo con hot-reload (alias: npm run dev)
npm run build        # compilar a dist/
npm run start:prod   # ejecutar build de producción
npm run test         # tests unitarios
npm run test:watch   # tests en watch
npm run test:cov     # coverage
npm run test:e2e     # tests end-to-end
npm run lint         # ESLint con --fix
npm run format       # Prettier
```

```bash
# Test individual
npx jest src/modules/expenses/expenses.service.spec.ts
npx jest --testNamePattern="should create expense"
```

---

## 📂 Estructura del proyecto

```
src/
├── config/                       # env.validation, firebase/anthropic/cloudinary config
├── common/                       # decorators (@CurrentUser), guards (FirebaseAuthGuard),
│                                 # filters, interceptors, interfaces compartidas
├── modules/
│   ├── firebase/                 # Firebase Admin SDK (global)
│   ├── anthropic/                # Cliente Claude: chat, vision, categorización (global)
│   ├── users/                    # Perfil, inicialización, link WhatsApp
│   ├── categories/               # Categorías + subcategorías + sugerencias
│   ├── payment-methods/          # Métodos de pago
│   ├── currencies/               # Monedas
│   ├── expenses/                 # CRUD de gastos, parseo NL, export JSON/Excel
│   ├── receipts/                 # Escaneo OCR Claude Vision (auth; clasifica vs taxonomía del usuario)
│   ├── inference/                # Clasificador compartido (@gastos/expense-ai) + learning_log
│   ├── chat/                     # Conversaciones persistentes con IA
│   ├── import/                   # Importación Excel/JSON (validate/analyze/upload)
│   ├── accounts/                 # Multi-cuenta (banco/ahorro/billetera/tarjeta)
│   ├── transfers/                # Transferencias atómicas entre cuentas
│   ├── cash-movements/           # Ingreso / retiro / depósito / reversión
│   ├── presupuestos/             # Sub-reservas por categoría
│   ├── programados/              # ⏰ Gastos y transferencias recurrentes (cron)
│   ├── notificaciones/           # Alertas in-app generadas por el cron
│   ├── shortcuts/                # Atajos de gasto rápido
│   ├── voice/                    # Procesamiento de gastos por voz
│   ├── shopping-lists/           # Listas de compra
│   ├── shared/                   # Grupos de gastos compartidos
│   └── whatsapp/                 # Webhook (productor) + link/unlink + legacy
├── app.module.ts
└── main.ts                       # Bootstrap: prefix /api, CORS, ValidationPipe, Swagger
```

> **Modelo de datos Firestore, patrón de request y detalle de cada módulo:** ver [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## 🔐 Autenticación

Todos los endpoints (excepto `GET /api/health` y `GET /`) requieren un **Firebase ID Token**:

```
Authorization: Bearer <firebase-id-token>
```

El cron de programados usa un esquema aparte: `Authorization: Bearer ${CRON_SECRET}` sobre `POST /api/programados/cron/run`.

Métodos para obtener un token y probar la API: **[docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md)**.

---

## ⚙️ Variables de entorno

Definidas y validadas al arrancar en `src/config/env.validation.ts` (config inválida → fallo inmediato). Plantilla completa en [`.env.example`](./.env.example).

| Variable | Req. | Default | Descripción |
|---|:---:|---|---|
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `PORT` | no | `3000` | Puerto HTTP |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Orígenes permitidos, separados por coma |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | * | — | Ruta al JSON de service account (modo archivo) |
| `FIREBASE_PROJECT_ID` | * | — | Alternativa por variables (producción) |
| `FIREBASE_PRIVATE_KEY` | * | — | Idem (con `\n` escapados) |
| `FIREBASE_CLIENT_EMAIL` | * | — | Idem |
| `FIREBASE_STORAGE_BUCKET` | no | — | Bucket de Storage |
| `ANTHROPIC_API_KEY` | **sí** | — | API key de Anthropic |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-20250514` | Modelo de Claude |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | no | — | Credenciales Cloudinary (receipts) |
| `MAX_FILE_SIZE` | no | `5242880` | Tamaño máx. de imagen (bytes) |
| `ALLOWED_IMAGE_TYPES` | no | `image/jpeg,image/png,image/webp` | MIME permitidos |
| `THROTTLE_TTL` | no | `60000` | Ventana de rate limit (ms) |
| `THROTTLE_LIMIT` | no | `100` | Límite general / minuto |
| `SCAN_THROTTLE_LIMIT` | no | `10` | Límite escaneo / minuto |
| `AI_THROTTLE_LIMIT` | no | `20` | Límite llamadas IA / minuto |
| `LOG_LEVEL` | no | `debug` | Nivel de log |
| `CRON_SECRET` | no | — | Token Bearer del cron externo (producción serverless) |

`*` Firebase admite **dos modos**: archivo (`FIREBASE_SERVICE_ACCOUNT_PATH`) **o** variables individuales (`FIREBASE_PROJECT_ID` + `FIREBASE_PRIVATE_KEY` + `FIREBASE_CLIENT_EMAIL`).

---

## 🚦 Rate limiting

Tres niveles (`app.module.ts` → `ThrottlerModule`):

- **default**: 100 req/min
- **scan**: 10 req/min (escaneo de comprobantes)
- **ai**: 20 req/min (llamadas a IA)

---

## ☁️ Despliegue

El backend corre en **Vercel (serverless)**. En ese entorno `@nestjs/schedule` **no** mantiene un proceso vivo, por lo que el cron de programados se dispara con un **GitHub Actions** cada 15 min (`POST /api/programados/cron/run` con `Authorization: Bearer ${CRON_SECRET}`).

Guía completa (variables de producción, workflow del cron, reglas e índices de Firestore): **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**.

---

## 🩺 Troubleshooting

| Síntoma | Causa probable / solución |
|---|---|
| `Firebase credentials not found` | Falta `firebase-service-account.json` o las 3 variables `FIREBASE_*` |
| `Anthropic API key invalid` | `ANTHROPIC_API_KEY` inválida o sin créditos |
| Error CORS | Agregar el origen del frontend a `CORS_ORIGIN` |
| `Token expired` | Los ID Token de Firebase expiran cada hora; el cliente debe refrescarlos |
| Puerto 3000 ocupado | Cambiar `PORT` en `.env` |
| Config inválida al arrancar | Revisar `src/config/env.validation.ts` y `.env` |

Más detalle por módulo en [docs/RECEIPTS_TESTING.md](./docs/RECEIPTS_TESTING.md) (comprobantes) y [docs/WHATSAPP_FLOW.md](./docs/WHATSAPP_FLOW.md) (WhatsApp).

---

## 🤝 Contribuir

1. Crea una rama (`git checkout -b feature/nueva-funcionalidad`)
2. Commitea los cambios
3. Abre un Pull Request

Antes de cualquier cambio revisa **[CLAUDE.md](./CLAUDE.md)** y **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** para respetar los patrones críticos (ownership por `userId`, idempotencia del cron, escrituras bloqueadas al cliente en colecciones de programados).

## Licencia

MIT
