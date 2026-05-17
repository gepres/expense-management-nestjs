# Referencia de API — Gastos Backend

Inventario completo de endpoints. Complementa la documentación interactiva de **Swagger** (`http://localhost:3000/api/docs`), que incluye los esquemas de request/response.

## Convenciones

- **Prefijo global:** todas las rutas cuelgan de `/api`.
- **Auth (por defecto):** `Authorization: Bearer <firebase-id-token>` — vía `FirebaseAuthGuard`.
- **Públicos:** `GET /api/health`, `GET /api`.
- **Twilio:** los webhooks de WhatsApp no usan auth Firebase (los llama Twilio).
- **Cron:** `POST /api/programados/cron/run` usa `Authorization: Bearer ${CRON_SECRET}` (no Firebase).
- Parámetros de path en `:camelCase`. Filtros comunes vía query string (`?soloNoLeidas=true`, `?status=processed&limit=10`, etc.).

---

## Health / raíz · `AppController`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/api/health` | — | Health check (estado de Firebase y Anthropic) |
| GET | `/api` | — | Información básica del API |

## Users · `/api/users`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/users/profile` | 🔒 | Obtener perfil |
| PATCH | `/users/profile` | 🔒 | Actualizar perfil |
| DELETE | `/users/profile` | 🔒 | Eliminar perfil/cuenta |
| POST | `/users/initialize` | 🔒 | Inicializar usuario (defaults en primer login) |
| POST | `/users/whatsapp/link` | 🔒 | Vincular número de WhatsApp al usuario |

## Categories · `/api/categories`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/categories` | 🔒 | Listar categorías |
| POST | `/categories` | 🔒 | Crear categoría |
| GET | `/categories/:id` | 🔒 | Obtener categoría |
| PATCH | `/categories/:id` | 🔒 | Actualizar categoría |
| DELETE | `/categories/:id` | 🔒 | Eliminar categoría (bloqueada si tiene gastos) |
| POST | `/categories/:categoryId/subcategories` | 🔒 | Agregar subcategoría |
| PATCH | `/categories/:categoryId/subcategories/:subcategoryId` | 🔒 | Actualizar subcategoría |
| DELETE | `/categories/:categoryId/subcategories/:subcategoryId` | 🔒 | Eliminar subcategoría |
| POST | `/categories/:categoryId/subcategories/:subcategoryId/suggestions` | 🔒 | Agregar sugerencia (keyword) |
| GET | `/categories/:categoryId/subcategories/:subcategoryId/suggestions` | 🔒 | Listar sugerencias |
| PATCH | `/categories/:categoryId/subcategories/:subcategoryId/suggestions/:index` | 🔒 | Actualizar sugerencia |
| DELETE | `/categories/:categoryId/subcategories/:subcategoryId/suggestions/:index` | 🔒 | Eliminar sugerencia |

## Payment Methods · `/api/payment-methods`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/payment-methods` | 🔒 | Listar métodos de pago |
| POST | `/payment-methods` | 🔒 | Crear método de pago |
| GET | `/payment-methods/:id` | 🔒 | Obtener método de pago |
| PATCH | `/payment-methods/:id` | 🔒 | Actualizar método de pago |
| DELETE | `/payment-methods/:id` | 🔒 | Eliminar método de pago |

## Currencies · `/api/currencies`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/currencies` | 🔒 | Listar monedas |
| POST | `/currencies` | 🔒 | Crear moneda |
| GET | `/currencies/:id` | 🔒 | Obtener moneda |
| PATCH | `/currencies/:id` | 🔒 | Actualizar moneda |
| DELETE | `/currencies/:id` | 🔒 | Eliminar moneda |

## Expenses · `/api/expenses`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/expenses` | 🔒 | Listar gastos (filtros por fecha, categoría, monto, método) |
| POST | `/expenses` | 🔒 | Crear gasto |
| POST | `/expenses/parse` | 🔒 | Parsear gasto desde lenguaje natural (IA) |
| GET | `/expenses/export` | 🔒 | Exportar gastos (JSON / Excel) |
| GET | `/expenses/:id` | 🔒 | Obtener gasto |
| PATCH | `/expenses/:id` | 🔒 | Actualizar gasto |
| DELETE | `/expenses/:id` | 🔒 | Eliminar gasto |

## Receipts · `/api/receipts`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| POST | `/receipts/scan` | 🔒 | Escanear comprobante (multipart `image`, Claude Vision) |
| GET | `/receipts` | 🔒 | Listar comprobantes (`?status=&limit=`) |
| GET | `/receipts/:id` | 🔒 | Obtener comprobante |
| DELETE | `/receipts/:id` | 🔒 | Eliminar comprobante (doc + imagen) |

`POST /receipts/scan` requiere token Firebase. Tras el OCR, `categoria`/
`subcategoria` se refinan contra la **taxonomía del usuario** (clasificador
compartido `@gastos/expense-ai`, homologado con WhatsApp); `data.category`
es el **id de categoría del usuario**. El OCR consume cuota IA `scope:user`.

Detalle de pruebas y respuestas: [RECEIPTS_TESTING.md](./RECEIPTS_TESTING.md).

## Chat · `/api/chat`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| POST | `/chat/conversations` | 🔒 | Crear conversación |
| GET | `/chat/conversations` | 🔒 | Listar conversaciones |
| GET | `/chat/conversations/:id` | 🔒 | Obtener conversación |
| PATCH | `/chat/conversations/:id` | 🔒 | Actualizar conversación |
| DELETE | `/chat/conversations/:id` | 🔒 | Eliminar conversación + mensajes |
| GET | `/chat/conversations/:id/messages` | 🔒 | Listar mensajes |
| POST | `/chat/conversations/:id/messages` | 🔒 | Enviar mensaje (responde la IA) |
| POST | `/chat/message` | 🔒 | Mensaje suelto sin conversación persistida |

## Import · `/api/import`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/import/template` | 🔒 | Descargar plantilla Excel |
| POST | `/import/validate` | 🔒 | Validar archivo antes de importar |
| POST | `/import/analyze` | 🔒 | Mejora con IA (categorías/descripciones) |
| POST | `/import/upload` | 🔒 | Importación masiva definitiva |
| GET | `/import/history` | 🔒 | Historial de importaciones |

## Accounts · `/api/accounts`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/accounts` | 🔒 | Listar cuentas |
| POST | `/accounts` | 🔒 | Crear cuenta |
| GET | `/accounts/:id` | 🔒 | Obtener cuenta |
| PATCH | `/accounts/:id` | 🔒 | Actualizar cuenta |
| DELETE | `/accounts/:id` | 🔒 | Eliminar cuenta |
| POST | `/accounts/:id/recalculate` | 🔒 | Recalcular saldos de la cuenta |

## Transfers · `/api/transfers`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/transfers` | 🔒 | Listar transferencias |
| POST | `/transfers` | 🔒 | Crear transferencia atómica (soporta cross-currency) |
| GET | `/transfers/:id` | 🔒 | Obtener transferencia |
| DELETE | `/transfers/:id` | 🔒 | Eliminar transferencia |

## Cash Movements · `/api`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| POST | `/accounts/:accountId/income` | 🔒 | Registrar ingreso |
| POST | `/accounts/:accountId/withdraw` | 🔒 | Retiro de efectivo |
| POST | `/accounts/:accountId/deposit-cash` | 🔒 | Depósito de efectivo |
| GET | `/cash-movements` | 🔒 | Listar movimientos |
| GET | `/cash-movements/:id` | 🔒 | Obtener movimiento |
| POST | `/cash-movements/:id/revert` | 🔒 | Revertir movimiento (atómico) |
| DELETE | `/cash-movements/:id` | 🔒 | Eliminar movimiento |

## Presupuestos · `/api/presupuestos`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/presupuestos` | 🔒 | Listar presupuestos |
| POST | `/presupuestos` | 🔒 | Crear presupuesto |
| GET | `/presupuestos/resumen` | 🔒 | Resumen agregado |
| GET | `/presupuestos/:id` | 🔒 | Obtener presupuesto |
| PATCH | `/presupuestos/:id` | 🔒 | Actualizar presupuesto |
| DELETE | `/presupuestos/:id` | 🔒 | Eliminar presupuesto |

## Programados — Gastos · `/api/programados/gastos`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/programados/gastos` | 🔒 | Listar plantillas de gasto recurrente |
| POST | `/programados/gastos` | 🔒 | Crear plantilla |
| GET | `/programados/gastos/:id` | 🔒 | Obtener plantilla |
| PATCH | `/programados/gastos/:id` | 🔒 | Actualizar (recalcula `proximaEjecucion`) |
| DELETE | `/programados/gastos/:id` | 🔒 | Eliminar plantilla |
| GET | `/programados/gastos/:id/ejecuciones` | 🔒 | Historial de ejecuciones (máx. 100) |
| POST | `/programados/gastos/:id/pause` | 🔒 | Pausar |
| POST | `/programados/gastos/:id/resume` | 🔒 | Reanudar |

## Programados — Transferencias · `/api/programados/transferencias`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/programados/transferencias` | 🔒 | Listar plantillas de transferencia recurrente |
| POST | `/programados/transferencias` | 🔒 | Crear plantilla (soporta cross-currency) |
| GET | `/programados/transferencias/:id` | 🔒 | Obtener plantilla |
| PATCH | `/programados/transferencias/:id` | 🔒 | Actualizar (recalcula `proximaEjecucion`) |
| DELETE | `/programados/transferencias/:id` | 🔒 | Eliminar plantilla |
| GET | `/programados/transferencias/:id/ejecuciones` | 🔒 | Historial de ejecuciones (máx. 100) |
| POST | `/programados/transferencias/:id/pause` | 🔒 | Pausar |
| POST | `/programados/transferencias/:id/resume` | 🔒 | Reanudar |

## Programados — Cron · `/api/programados/cron`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| POST | `/programados/cron/run` | 🔑 `CRON_SECRET` | Procesa pendientes (gastos + transferencias). Lo llama GitHub Actions cada 15 min en producción |

## Notificaciones · `/api/notificaciones`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/notificaciones` | 🔒 | Listar (`?soloNoLeidas=true`) |
| GET | `/notificaciones/contar-no-leidas` | 🔒 | Conteo de no leídas |
| PATCH | `/notificaciones/:id/leida` | 🔒 | Marcar como leída |
| POST | `/notificaciones/marcar-todas-leidas` | 🔒 | Marcar todas como leídas |
| DELETE | `/notificaciones/:id` | 🔒 | Eliminar notificación |

## Analytics (Métricas PRO) · `/api/analytics`

> Todo el controlador está detrás de `FirebaseAuthGuard` + `ProGuard`
> (`@RequirePro()`). `ProGuard` lee `users/{uid}.role` de Firestore; solo
> `pro`/`admin` pasan, el resto recibe **403**.

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/analytics/summary` | 🔒 PRO | KPIs/series del periodo (sin IA). Query: `month`, `year`, `accountIds?`, `moneda?` |
| POST | `/analytics/ai-insights` | 🔒 PRO | Análisis IA estructurado (`resumen`, `recomendaciones`, `insights`, `anomalias`, `ahorroEstimado`) |
| POST | `/analytics/ai-ask` | 🔒 PRO | Pregunta libre con el summary como contexto |
| POST | `/analytics/ai-roast` | 🔒 PRO | Roast sarcástico compartible (`titulo`, `puntuacionDesastre`, `frases`, `veredicto`, `hashtags`). Body acepta `tono: suave\|picante` |
| POST | `/analytics/ai-image` | 🔒 PRO | Ilustración IA del roast (OpenAI `gpt-image-1`) → data URL PNG. Requiere `OPENAI_API_KEY`; sin ella responde 400 y `summary.aiImageEnabled=false` |
| GET | `/analytics/export` | 🔒 PRO | Descarga `format=excel\|csv` (xlsx multi-hoja / csv con BOM) |

Modelo IA configurable: `ANTHROPIC_ANALYTICS_MODEL` (hereda `ANTHROPIC_MODEL`,
default `claude-sonnet-4-6`). Nunca se mezclan monedas en los cálculos.

> **Cuota IA**: `ai-insights`/`ai-ask`/`ai-roast`/`ai-image` (y el chat/voz)
> validan la cuota mensual del usuario antes de llamar al modelo. Si se
> excede responden **429** con cuerpo `{ error: "AiQuotaExceeded" |
> "AiImageQuotaExceeded", message, used, limit, resetAt }`. `admin` y el
> consumo `scope:"app"` no se bloquean. Ver `docs/ARCHITECTURE.md` §7 y
> `gastos/docs/ai-usage.md`.

## AI Usage (consumo IA) · `/api/ai-usage`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/ai-usage/me` | 🔒 | Snapshot de cuota del usuario del mes: `{ mes, role, used, limit, remaining, pct, warn, blocked, imagesUsed, imagesLimit, imagesBlocked, resetAt, warnPct }`. `limit: null` = admin (ilimitado) |

Tracking/cuotas configurables por env `AI_PRICE_*` y `AI_QUOTA_*` (ver
`.env` / `docs/ARCHITECTURE.md` §7). Las colecciones `aiUsageEvents`,
`aiUsageMonthly`, `aiUsageAppMonthly` las escribe solo el Admin SDK.

## Shortcuts · `/api/shortcuts`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/shortcuts` | 🔒 | Listar atajos |
| POST | `/shortcuts` | 🔒 | Crear atajo |
| GET | `/shortcuts/:id` | 🔒 | Obtener atajo |
| PATCH | `/shortcuts/:id` | 🔒 | Actualizar atajo |
| DELETE | `/shortcuts/:id` | 🔒 | Eliminar atajo |

## Voice · `/api/voice`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| POST | `/voice/process-expense` | 🔒 | Texto transcrito → gasto (compat/fallback). Body `{ transcript }` |
| POST | `/voice/process-audio` | 🔒 | **Audio (multipart `audio`) → Whisper server-side → gasto clasificado**. Mismo pipeline que WhatsApp (transcripción → parseo canónico → `InferenceService`). Consume cuota IA `scope:user` (transcripción + parseo) |

> El dictado web graba con `MediaRecorder` y sube el audio (ya no usa la Web Speech API del navegador). Requiere `OPENAI_API_KEY` (modelo `OPENAI_MODEL_TRANSCRIBE`, default `gpt-4o-mini-transcribe`).

## Shopping Lists · `/api/shopping-lists`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/shopping-lists` | 🔒 | Listar listas |
| POST | `/shopping-lists` | 🔒 | Crear lista |
| GET | `/shopping-lists/:id` | 🔒 | Obtener lista |
| PATCH | `/shopping-lists/:id` | 🔒 | Actualizar lista |
| DELETE | `/shopping-lists/:id` | 🔒 | Eliminar lista |
| POST | `/shopping-lists/:id/items` | 🔒 | Agregar ítem |
| PATCH | `/shopping-lists/:id/items/:itemId` | 🔒 | Actualizar ítem |
| DELETE | `/shopping-lists/:id/items/:itemId` | 🔒 | Eliminar ítem |
| POST | `/shopping-lists/:id/items/from-text` | 🔒 | Agregar ítems desde texto libre |

## Shared Groups · `/api/shared-groups`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| GET | `/shared-groups` | 🔒 | Listar grupos |
| POST | `/shared-groups` | 🔒 | Crear grupo |
| GET | `/shared-groups/:id` | 🔒 | Obtener grupo |
| PATCH | `/shared-groups/:id` | 🔒 | Actualizar grupo |
| DELETE | `/shared-groups/:id` | 🔒 | Eliminar grupo |
| POST | `/shared-groups/:id/budgets` | 🔒 | Crear presupuesto del grupo |
| GET | `/shared-groups/:id/budgets` | 🔒 | Listar presupuestos del grupo |
| PATCH | `/shared-groups/:id/budgets/:budgetId` | 🔒 | Actualizar presupuesto |
| DELETE | `/shared-groups/:id/budgets/:budgetId` | 🔒 | Eliminar presupuesto |
| POST | `/shared-groups/:id/expenses` | 🔒 | Agregar gasto compartido |
| GET | `/shared-groups/:id/expenses` | 🔒 | Listar gastos del grupo |
| PATCH | `/shared-groups/:id/expenses/:expenseId` | 🔒 | Actualizar gasto del grupo |
| DELETE | `/shared-groups/:id/expenses/:expenseId` | 🔒 | Eliminar gasto del grupo |
| POST | `/shared-groups/:id/invitations` | 🔒 | Crear invitación |
| GET | `/shared-groups/invitations/:token/verify` | 🔒 | Verificar invitación |
| POST | `/shared-groups/invitations/:token/accept` | 🔒 | Aceptar invitación |
| DELETE | `/shared-groups/:id/members/:memberId` | 🔒 | Remover miembro |
| POST | `/shared-groups/:id/leave` | 🔒 | Salir del grupo |
| GET | `/shared-groups/:id/stats` | 🔒 | Estadísticas del grupo |
| GET | `/shared-groups/:id/settlement` | 🔒 | Liquidación (quién debe a quién) |
| GET | `/shared-groups/:id/insights` | 🔒 | Insights del grupo |
| GET | `/shared-groups/:id/activity` | 🔒 | Actividad reciente |
| GET | `/shared-groups/:id/export` | 🔒 | Exportar datos del grupo |

## WhatsApp · `/api/whatsapp`

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| POST | `/whatsapp/webhook` | Twilio | **Productor activo de rollback.** Encola en `whatsapp_queue` y responde TwiML vacío. No procesa |
| POST | `/whatsapp/webhook-old` | Twilio | **Legacy/deprecado.** Procesamiento síncrono regex-only (solo PEN). No usar salvo emergencia |
| POST | `/whatsapp/link` | 🔒 | Vincular `whatsappPhone` al usuario |
| POST | `/whatsapp/unlink` | 🔒 | Desvincular número |

> El webhook **activo en Twilio** apunta hoy a la Firebase Function `twilioWebhook` (repo `gastos-firebase-functions`), no a este backend. Flujo completo: [WHATSAPP_FLOW.md](./WHATSAPP_FLOW.md).

---

**Leyenda:** 🔒 Firebase ID Token · 🔑 `CRON_SECRET` · — público · Twilio = lo invoca Twilio (sin auth Firebase).
