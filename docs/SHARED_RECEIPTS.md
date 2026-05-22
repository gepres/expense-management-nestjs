# Shared Group Receipts (F1 storage + F2 AI extraction)

> Foto opcional adjunta a aportes (`budgets`) y gastos (`expenses`) de grupos
> compartidos, con extracción IA opcional para autocompletar el formulario.
> Disponible **solo para usuarios PRO** (frontend + backend gating).

**Versión introducida**: v2.10.0 — 2026-05-22.

---

## Visión general

Dos fases:

| Fase | Qué hace | Costo |
|---|---|---|
| **F1 — Storage** | Subida opcional de la foto desde el frontend a Firebase Storage. URL/path se persisten en el doc del budget/expense. | Storage GCS (centavos/mes a escala actual) |
| **F2 — Extracción IA** | Botón "Autocompletar con IA" tras subir la foto. Backend descarga la imagen, llama Claude Sonnet Vision, devuelve campos prellenados al form. | ~$0.006 por extracción (Sonnet 4.6, ~1500+300 tokens) |

Las dos fases son independientes: F2 requiere que F1 haya subido la foto, pero el usuario puede subir foto sin pedir IA.

---

## Modelo de datos

### `SharedBudget` y `SharedExpense` (campos nuevos)

```ts
receiptUrl?: string;   // URL pública de Firebase Storage (con token)
receiptPath?: string;  // Path interno: shared-groups/{groupId}/{kind}s/{uid}_{ts}.{ext}
```

Convención del path (impuesta por las Storage rules):
```
shared-groups/{groupId}/expenses/{uid}_{timestamp}.{ext}
shared-groups/{groupId}/budgets/{uid}_{timestamp}.{ext}
```

El prefijo `{uid}_` permite a la Storage rule validar ownership al borrar.

---

## Firebase Storage

### Reglas (`storage.rules` en repo frontend `gastos`)

| Operación | Restricción |
|---|---|
| `read` | El usuario debe ser miembro del grupo (`shared_groups/{groupId}.members`) |
| `create` / `update` | Miembro del grupo + filename empieza con `{uid}_` + content-type `image/*` + `<5MB` |
| `delete` | Solo el dueño del archivo (filename empieza con su uid) |

Deploy: `firebase deploy --only storage`.

### Subida (frontend)

`src/services/shared-receipts.ts`:
- `uploadReceipt(groupId, kind, file)` — comprime si >500KB (canvas, max 1600px, JPEG 0.82), sube con Admin/Client SDK, devuelve `{url, path}`.
- `deleteReceipt(path)` — best-effort, no lanza si ya no existe.
- `validateReceiptFile(file)` — formato (JPG/PNG/WEBP) y tamaño (<5MB).

---

## Endpoint de extracción IA (F2)

```http
POST /api/shared-groups/{groupId}/extract-receipt
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json
```

Guards: `FirebaseAuthGuard` + `ProGuard` (`@RequirePro()`).

### Request body (`ExtractReceiptDto`)

```jsonc
{
  "kind": "expense" | "budget",
  "receiptUrl": "https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded-path>?alt=media&token=...",
  // Solo si kind === 'expense':
  "categories": ["alimentacion", "transporte", "servicios"],
  "subcategoriesByCategory": {
    "alimentacion": ["restaurantes", "mercado"]
  }
}
```

### Response 201

```jsonc
{
  "amount": 45.5,                  // null si no legible
  "description": "Almuerzo en Pardos Chicken",
  "date": "2026-05-22",            // YYYY-MM-DD
  "time": "13:30",                  // HH:mm
  "voucherType": "boleta",          // boleta|factura|recibo|ticket|null
  "voucherNumber": "B001-1234",
  "ruc": "20123456789",
  "paymentMethod": "yape",          // efectivo|yape|plin|transferencia|tarjeta_*|otro
  "category": "alimentacion",       // null si kind=budget o no calza
  "subcategory": "restaurantes",
  "confidence": 0.87                // 0-1
}
```

### Errors

| Status | Causa |
|---|---|
| 400 | URL inválida, no es de Firebase Storage, o no es una imagen |
| 403 | No es PRO (`ProGuard`), no es miembro del grupo, o la URL apunta a otro grupo |
| 404 | Grupo no existe |
| 429 | Cuota IA mensual del usuario excedida |
| 500 | Anthropic falló o respuesta JSON inválida |

---

## Flujo end-to-end

```
┌─────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ Frontend        │      │ Firebase Storage │      │ Backend NestJS   │
│ ReceiptUploader │      │                  │      │                  │
└────────┬────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                        │                          │
         │ 1. uploadReceipt(file) │                          │
         │ (compresión cliente)   │                          │
         │ ─────────────────────► │                          │
         │ ◄───── url + path ──── │                          │
         │                        │                          │
         │ 2. "Autocompletar IA"  │                          │
         │ POST extract-receipt   │                          │
         │ { kind, receiptUrl,    │                          │
         │   categories, subs }   │                          │
         │ ──────────────────────────────────────────────►   │
         │                        │                          │
         │                        │ 3. assertWithinQuota()   │
         │                        │ 4. fetch(receiptUrl)     │
         │                        │ ◄─── image bytes ────    │
         │                        │ 5. validate groupId      │
         │                        │ 6. Anthropic Vision      │
         │                        │ 7. parse JSON            │
         │                        │ 8. record aiUsage        │
         │ ◄────── ExtractedReceipt ─────────────────────    │
         │                        │                          │
         │ 9. setFormData(...)    │                          │
         │ 10. highlight 2s       │                          │
```

---

## Prompt y modelo

- **Modelo**: tier `primary` del paquete `@gastos/expense-ai` (default `claude-sonnet-4-6`).
- **Idioma**: prompt y salida en español.
- **Validaciones server-side**:
  - `voucherType` solo si está en `{boleta, factura, recibo, ticket}`.
  - `category` solo si está en la lista enviada por el frontend.
  - `subcategory` solo si está en `subcategoriesByCategory[category]`.
  - `confidence` clamp 0-1.
- **Métodos de pago detectables**: `efectivo`, `yape`, `plin`, `transferencia`, `tarjeta_debito`, `tarjeta_credito`, `otro`. La IA infiere por logos/textos visibles en la boleta (sticker amarillo Yape, sticker azul Plin, voucher BCP/BBVA/Interbank, etc.).

---

## Tracking y cuota IA

- Cada extracción registra un evento en `aiUsageEvents/{id}` con:
  ```
  feature: 'shared-receipt-scan'
  scope: 'user'
  provider: 'anthropic'
  model: <primary>
  ```
- Se acumula en `aiUsageMonthly/{uid}_{YYYY-MM}` (cuota mensual PRO).
- `assertWithinQuota()` se llama **antes** de Anthropic; lanza 429 si el usuario ya excedió.

---

## Seguridad

| Defensa | Implementación |
|---|---|
| Acceso a la foto | Storage rule lee `shared_groups/{groupId}.members` desde Firestore |
| Cross-group attack | El backend valida que `receiptUrl` apunta al `groupId` del path (`shared-groups/{expectedGroupId}/...`) antes de descargar |
| PRO gating | Doble: frontend no muestra el botón si `!isPro`, backend `ProGuard` rechaza con 403 |
| Cuota IA | `QuotaService.assertWithinQuota` pre-check; rol `admin` ilimitado |
| Tamaño/formato | Frontend valida cliente (<5MB, JPG/PNG/WEBP) + Storage rule (<5MB, `image/(jpeg\|jpg\|png\|webp)`) |

---

## Componentes frontend involucrados

| Archivo | Responsabilidad |
|---|---|
| `services/shared-receipts.ts` | Subida/borrado en Firebase Storage + compresión cliente |
| `services/shared.ts` | `extractReceipt()` API call + clases `ProRequiredError`/`AiQuotaExceededError` |
| `components/compartidos/ReceiptUploader.tsx` | UI de subida + botón IA + gate PRO con teaser |
| `components/compartidos/ReceiptViewer.tsx` | Lightbox para la foto completa |
| `components/compartidos/useExtractedHighlight.ts` | Hook para anillo verde 2s sobre campos prellenados |
| `components/compartidos/SharedBudgetsTab.tsx` | Integración en aportes (sin category/subcategory) |
| `components/compartidos/SharedExpensesTab.tsx` | Integración en gastos (con category/subcategory) |
| `components/compartidos/SharedGroupDetail.tsx` | onSnapshot listeners que mapean `receiptUrl`/`receiptPath` a `SharedBudget`/`SharedExpense` |

> **Cuidado**: los listeners en `SharedGroupDetail` mapean campo por campo, no usan spread. Cualquier campo nuevo en `SharedBudget`/`SharedExpense` debe añadirse explícitamente al map.

---

## Configuración

Sin variables nuevas. Reusa:

| Var | Para |
|---|---|
| `VITE_FIREBASE_STORAGE_BUCKET` (frontend) | Bucket del Storage |
| `FIREBASE_STORAGE_BUCKET` (backend) | Mismo bucket |
| `ANTHROPIC_API_KEY` | Llamadas Sonnet Vision |
| `ANTHROPIC_MODEL_PRIMARY` (opcional) | Override del modelo Vision |
| `AI_QUOTA_PRO_TOKENS` (opcional, admin override en `appConfig/aiQuota`) | Cuota mensual PRO |
