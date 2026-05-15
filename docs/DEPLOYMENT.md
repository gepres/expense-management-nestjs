# Despliegue — Gastos Backend API

El backend se despliega en **Vercel (serverless)**. Esto tiene una implicación clave: **`@nestjs/schedule` no corre** (no hay proceso vivo entre requests), por lo que el cron de programados se dispara externamente con **GitHub Actions**.

---

## 1. Build

```bash
npm run build        # compila a dist/
npm run start:prod   # node dist/main (para entornos con proceso persistente)
```

En Vercel el build/serverless lo maneja la plataforma; localmente `start:prod` sirve para validar el artefacto compilado.

---

## 2. Variables de entorno de producción

En lugar del archivo `firebase-service-account.json`, usar las tres variables individuales (Firebase Admin SDK):

```env
NODE_ENV=production
CORS_ORIGIN=https://tu-frontend.com

FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=your-project.appspot.com

ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

CRON_SECRET=<openssl rand -hex 32>
```

> `FIREBASE_PRIVATE_KEY` debe llevar los saltos de línea escapados como `\n`. La config (`src/config/firebase.config.ts`) los reconvierte. Tabla completa de variables y defaults en el [README](../README.md#️-variables-de-entorno).

La configuración se valida al arrancar (`src/config/env.validation.ts`); una config inválida aborta el arranque.

---

## 3. Cron de programados (producción)

### Por qué un cron externo

En Vercel serverless el decorador `@Cron` de `@nestjs/schedule` no se ejecuta de forma fiable porque no hay un proceso de larga vida. La solución: un scheduler externo que llame al endpoint dedicado.

### GitHub Actions

Workflow: `.github/workflows/cron-programados.yml`

- Se ejecuta cada **15 minutos** (`cron: '*/15 * * * *'`) — GitHub puede retrasarlo hasta ~10 min en picos; aceptable para la frecuencia diaria del cron interno.
- También disparable manualmente (`workflow_dispatch`).
- `concurrency` con `cancel-in-progress: false` (no solapa corridas).
- Hace `POST` a `${BACKEND_BASE_URL}/programados/cron/run` con `Authorization: Bearer ${CRON_SECRET}`, timeout 60 s. Falla el job si el status no es 200/201.

### Secrets requeridos en el repo

`Settings → Secrets and variables → Actions`:

| Secret | Valor |
|---|---|
| `CRON_SECRET` | El **mismo** token que la variable `CRON_SECRET` del backend |
| `BACKEND_BASE_URL` | `https://<tu-backend>.vercel.app/api` (sin trailing slash) |

### Verificación manual

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  https://<tu-backend>.vercel.app/api/programados/cron/run
```

Detalle del comportamiento del cron (idempotencia, atomicidad, timezone, cross-currency): [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-subsistema-de-programados-cron).

---

## 4. Reglas e índices de Firestore

> **Importante:** las reglas e índices **autoritativos viven en el repo frontend** (`gastos/firestore.rules` y `gastos/firestore.indexes.json`), no en este backend. Este backend usa el Admin SDK, que **omite** las reglas; las reglas protegen el acceso del *cliente*.

Desplegar desde el repo frontend:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Puntos clave de las reglas:

- Colecciones de usuario (`expenses`, `accounts`, etc.): el cliente accede solo a lo suyo (`resource.data.userId == request.auth.uid`).
- `transfers`, `cash-movements`: inmutables desde el cliente.
- `gastosProgramados`, `transferenciasProgramadas`, `ejecucionesProgramadas`: el cliente **solo lee**; las escrituras solo las hace este backend. No negociable (evita manipular `proximaEjecucion`).
- `notificaciones`: create bloqueado al cliente; update limitado a `leida`.

Índices compuestos de programados ya versionados:

- `gastosProgramados`: `activo+proximaEjecucion`, `userId+proximaEjecucion`
- `transferenciasProgramadas`: los mismos dos

Al añadir una query con `where + where/orderBy` sobre un campo nuevo, agregar el índice en `gastos/firestore.indexes.json` y redeployar.

---

## 5. Checklist de despliegue

- [ ] Variables `FIREBASE_*` (modo producción), `ANTHROPIC_API_KEY`, `CLOUDINARY_*` configuradas en Vercel.
- [ ] `CRON_SECRET` igual en Vercel y en los secrets de GitHub Actions.
- [ ] `BACKEND_BASE_URL` en los secrets de GitHub apunta a `…/api` sin trailing slash.
- [ ] `CORS_ORIGIN` incluye el dominio real del frontend.
- [ ] Reglas e índices de Firestore desplegados desde el repo frontend.
- [ ] `GET /api/health` responde `{ status: "ok" }` con Firebase y Anthropic en `ok`.
- [ ] Disparo manual del workflow `Programados Cron` → status 200/201.
- [ ] Swagger accesible en `/api/docs`.

---

## 6. Rollback de WhatsApp

El webhook activo en Twilio apunta a la Firebase Function `twilioWebhook` (repo `gastos-firebase-functions`). Para rollback rápido a este backend, apuntar Twilio a `POST /api/whatsapp/webhook` (productor de rollback, **sin** validación de firma — ver caveat en [WHATSAPP_FLOW.md §6](./WHATSAPP_FLOW.md)).
