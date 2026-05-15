# Flujo WhatsApp — Arquitectura productor / consumidor

> **Estado:** en producción. Reemplaza/actualiza la guía histórica
> [`WHATSAPP_HYBRID_SETUP.md`](./WHATSAPP_HYBRID_SETUP.md) (que marcaba la
> Fase 2 como "PENDING"; hoy ya está implementada y desplegada).
>
> **Última actualización:** 2026-05-15
>
> ⚠️ **Cambio de ingestión (2026-05-15):** Twilio ya **no** apunta al
> webhook de Vercel. Ahora apunta a la función **`twilioWebhook` de
> Firebase** (`gastos-firebase-functions`, 2ª gen), que encola en el mismo
> `whatsapp_queue` **y sí valida `X-Twilio-Signature`**. El webhook de
> Vercel sigue desplegado pero **sin tráfico**, como ruta de **rollback**.
> El consumidor (`processWhatsAppQueue`) no cambió (se migró a 2ª gen).

---

## 1. Resumen en una frase

El endpoint que Twilio tiene configurado
(`https://us-central1-expense-app-gepres.cloudfunctions.net/twilioWebhook`,
función `twilioWebhook` de Firebase) **no procesa nada**: valida la firma
`X-Twilio-Signature`, recibe el mensaje y lo **encola** en Firestore.
Quien hace el trabajo real (parsear, clasificar, registrar el gasto,
responder por WhatsApp) es el mismo repo **`gastos-firebase-functions`**
en su trigger `processWhatsAppQueue`, que escucha esa cola.

Es un patrón **productor / consumidor** desacoplado por una colección
Firestore (`whatsapp_queue`). El productor (HTTP) y el consumidor
(trigger) **no se llaman entre sí por HTTP**; se comunican a través de esa
cola, en el mismo proyecto Firebase.

```
WhatsApp ─▶ Twilio ─▶ [Firebase Functions] POST /twilioWebhook
                            │  valida X-Twilio-Signature + encola
                            ▼
                     Firestore: whatsapp_queue/{autoId}        ◀── la cola
                            │
                            ▼  (trigger onDocumentCreated)
                  [Firebase Functions] processWhatsAppQueue
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
           texto         imagen         audio
              │             │             │
              └── registra gasto + responde por Twilio ──▶ WhatsApp

  (rollback) Twilio ─▶ [Vercel · NestJS] POST /api/whatsapp/webhook
                            └─ mismo encolado, SIN validar firma
```

---

## 2. Productores (ingestión → `whatsapp_queue`)

Hay **dos** implementaciones equivalentes del paso de encolado. Solo una
recibe tráfico a la vez (según a dónde apunte Twilio):

| Productor | Estado | Valida firma | ID del doc en la cola |
|---|---|---|---|
| **`twilioWebhook`** (Firebase, `gastos-firebase-functions/src/index.ts`) | **ACTIVO** (Twilio apunta aquí desde 2026-05-15) | **Sí** (`X-Twilio-Signature`) | autogenerado (`.add()`) |
| `POST /api/whatsapp/webhook` (este backend NestJS/Vercel) | **Rollback** (sin tráfico) | No | `MessageSid` (`.doc(MessageSid).set()`) |

> **Caveat de idempotencia:** el productor activo usa ID autogenerado, así
> que un reintento del webhook por parte de Twilio crea **2 docs en la
> cola** → 2 ejecuciones del consumidor. **No se duplica el gasto** (la
> idempotencia por `messageSid` en `finalizeAndRegisterExpense` lo
> protege; el reintento responde "ya estaba registrado"). El productor de
> rollback dedupe a nivel de doc (usa `MessageSid` como ID).

### 2.1 Productor de rollback — `POST /api/whatsapp/webhook` (NestJS/Vercel)

> Hasta 2026-05-15 éste era el endpoint configurado en Twilio. **Ya no.**
> Se mantiene desplegado como ruta de rollback rápido.

Archivo: `src/modules/whatsapp/whatsapp-queue.controller.ts`
→ `WhatsappQueueController`

| Paso | Qué hace |
|---|---|
| 1 | Twilio hace `POST` con el cuerpo del mensaje (`From`, `Body`, `MessageSid`, `NumMedia`, `MediaUrl0`, …) |
| 2 | Normaliza el teléfono (`whatsapp:+51...` → `+51...`) |
| 3 | Guarda el mensaje en Firestore `whatsapp_queue/{MessageSid}` con `status: 'pending'`. Usa el `MessageSid` como **ID del documento** → si Twilio reintenta el webhook, no duplica la entrada en la cola (`set(..., { merge: false })`) |
| 4 | Reintenta el guardado hasta **3 veces** con backoff `[100, 500, 1000]` ms y timeout de **4 s** por intento |
| 5 | **Siempre** responde `200` con TwiML vacío (`<Response></Response>`), haya tenido éxito o no, para que Twilio no reintente ni marque el mensaje como fallido |

**Diseño deliberado:** este controlador es "tonto y rápido". No clasifica,
no llama a la IA, no responde al usuario. Solo asegura que el mensaje quede
persistido antes de que expire el timeout de Twilio. Vercel serverless no es
apto para procesos largos (IA + descarga de media + Firestore), por eso se
delega al consumidor.

### 2.2 Otros endpoints WhatsApp del backend

Archivo: `src/modules/whatsapp/whatsapp.controller.ts` → `WhatsappController`

| Endpoint | Auth | Función |
|---|---|---|
| `POST /api/whatsapp/link` | `FirebaseAuthGuard` | Vincula `whatsappPhone` al usuario en `users/{uid}`. Valida que el número no esté usado por otra cuenta. Envía mensaje de bienvenida |
| `POST /api/whatsapp/unlink` | `FirebaseAuthGuard` | Desvincula el número y envía mensaje de despedida |
| `POST /api/whatsapp/webhook-old` | — | **Legacy / deprecado.** Procesamiento síncrono antiguo: regex simple, solo PEN, registra directo vía `ExpensesService`. **No es el que usa Twilio hoy** (la URL apunta a `/webhook`, no a `/webhook-old`). Se mantiene como fallback de rollback |

### 2.3 `WhatsappService`

Archivo: `src/modules/whatsapp/whatsapp.service.ts`

Wrapper del cliente Twilio: `sendMessage(to, message)` y
`validateTwilioRequest(signature, url, params)`. Lo usan `link`/`unlink` y el
flujo legacy. **No lo usa** `WhatsappQueueController` (ver caveat de
seguridad §6).

---

## 3. La cola — colección Firestore `whatsapp_queue`

Punto de unión entre los dos repos. Documento escrito por el productor,
consumido por el trigger del consumidor.

```typescript
// whatsapp_queue/{MessageSid}
{
  phoneNumber: string;        // "+51999999999" (normalizado)
  message: string;            // texto del usuario (vacío si es media)
  messageSid: string;
  accountSid: string;
  from: string;               // "whatsapp:+51999999999"
  to: string;
  webhookBody: {              // cuerpo Twilio completo
    MessageSid: string;
    From: string;
    Body: string;
    NumMedia?: string;
    MediaUrl0?: string;
    MediaContentType0?: string;
    // ...resto de params Twilio
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Timestamp;
  processedAt: Timestamp | null;
  retryCount: number;         // lo incrementa el consumidor al reintentar
  errors: [];
  error?: string;             // último error (lo escribe el consumidor)
}
```

**Ciclo de vida del `status`:**

```
pending ─▶ processing ─▶ completed
                     └─▶ failed              (tras 3 reintentos)
                     └─▶ pending (retry++)   (reintento < 3)
```

---

## 4. Consumidor — `gastos-firebase-functions`

Repo: `D:\PROYECTOS\gepres\gastos-firebase-functions`
Archivo principal: `src/index.ts`

### 4.1 `processWhatsAppQueue`

Trigger `onDocumentCreated("whatsapp_queue/{queueId}")`. **Se dispara
automáticamente** cuando el backend de Vercel inserta un doc en la cola.
Secrets vía `defineSecret`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_WHATSAPP_NUMBER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`.

| Paso | Qué hace |
|---|---|
| 1 | Marca el doc `status: 'processing'` + `processedAt` |
| 2 | Valida que el teléfono esté registrado (`users.whatsappPhone`). Si no → responde "No estás registrado" y `completed` |
| 3 | Resuelve la **cuenta activa** del usuario (override de sesión → principal → primera → creación lazy). Multi-cuenta, Opción B |
| 4 | Detecta el tipo de mensaje: **texto / imagen / audio** |
| 5 | Procesa según tipo (ver §4.2) |
| 6 | Responde al usuario por WhatsApp (Twilio) y marca `status: 'completed'` |
| 7 | **Errores:** si `retryCount < 3` → `status: 'pending'` + `retryCount++` (re-dispara el trigger). Si ≥ 3 → `status: 'failed'` + avisa al usuario |

### 4.2 Ramas de procesamiento

| Tipo | Flujo |
|---|---|
| **Texto** | 1) comandos de cuenta (`usar cuenta`, `cuenta actual`, `cuenta principal`) → 2) comandos de bot (`saldo`, `saldos`, `movimientos`, `ingreso`, `transferir`, `pendientes`, `clasificar`, `historial`, `olvidar historial`) → 3) comandos (`resumen`, `ayuda`, `inicio`) → 4) gasto: regex primero, fallback a Anthropic para mensajes complejos |
| **Imagen** | Descarga media de Twilio → **Anthropic Vision** (`extractReceiptData`): comprobantes, capturas Yape/Plin, boletas |
| **Audio** | Descarga media de Twilio → transcripción con **Whisper** (OpenAI) → parseo con Anthropic |

### 4.3 `finalizeAndRegisterExpense` (paso común a los 3 tipos)

1. Valida el monto.
2. **Idempotencia (§ C.1):** busca un gasto previo con el mismo
   `MessageSid`. Si existe → no duplica, avisa "ya estaba registrado".
3. Clasifica categoría/subcategoría (`InferenceService`: history → llm →
   user_correction → default/regex).
4. Resuelve método de pago (con desambiguación vía Anthropic si es
   ambiguo), moneda y fecha (regex → LLM si hay pista temporal).
5. Detecta **monto atípico** (vs mediana del histórico del usuario): no
   bloquea, marca `amountFlagged`.
6. Persiste: `expense` + `movement` + actualización de saldo de la cuenta.
7. Escribe `learning_log` (para mejorar futuras clasificaciones).
8. Responde al usuario con el detalle (monto, categoría, método, saldo
   nuevo) + avisos si quedó sin clasificar / método no reconocido / monto
   atípico.

---

## 5. Relación entre los dos repos

| | `gastos-backend` (Vercel/NestJS) | `gastos-firebase-functions` |
|---|---|---|
| **Rol** | Productor de **rollback** (sin tráfico) | Productor **activo** (`twilioWebhook`) **+** consumidor (`processWhatsAppQueue`) |
| **Entrada** | `POST /api/whatsapp/webhook` (rollback; ya NO está en Twilio) | `twilioWebhook` HTTP (lo que está en Twilio) + trigger Firestore |
| **Conexión** | Escribe en `whatsapp_queue` | Escribe (`twilioWebhook`) y escucha/procesa (`processWhatsAppQueue`) `whatsapp_queue` |
| **IA / lógica** | Ninguna (solo enruta + persiste) | Toda (Anthropic, Whisper, clasificación, learning, saldos) |
| **Por qué dos productores** | Vercel fue el original; queda como rollback sin validación de firma | `twilioWebhook` (2ª gen) valida firma y unifica el flujo en un solo repo |

> **Nota:** ambos repos comparten el **mismo proyecto Firebase**. Una
> mutación local impacta producción (igual que con `programados`).

---

## 6. Detalles importantes / caveats

- **Doble puerta de entrada al mismo queue.** Existen dos productores
  equivalentes (ver §2). Desde 2026-05-15 Twilio apunta a `twilioWebhook`
  (Firebase), que **sí valida `X-Twilio-Signature`** en producción (el
  bypass de firma solo aplica al emulador, no a Cloud Run). El webhook de
  Vercel queda como rollback sin tráfico.

- **El webhook de Vercel (rollback) NO valida la firma de Twilio.**
  `WhatsappQueueController` recibe `x-twilio-signature` pero **nunca la
  verifica** (`WhatsappService.validateTwilioRequest` existe pero no se
  invoca ahí). ⚠️ Si se hace rollback a Vercel, la cola vuelve a quedar
  expuesta (cualquiera con la URL puede inyectar mensajes). Antes de un
  rollback prolongado, activar la validación de firma en el controlador.

- **Idempotencia en dos niveles:** el doc de la cola usa `MessageSid` como
  ID (no duplica la entrada), y `finalizeAndRegisterExpense` busca gastos
  por `messageSid` antes de crear (no duplica el gasto). Un reintento de
  Twilio es seguro.

- **`webhook-old` sigue vivo** como ruta de rollback rápido, pero es
  inferior (regex-only, solo PEN, sin multi-cuenta ni IA). No apuntar
  Twilio ahí salvo emergencia.

---

## 7. Testing / debugging

```bash
# 1. Productor (Vercel) — verificar encolado
#    Logs de Vercel: buscar "✅ Message enqueued successfully"
#    Firestore: ver doc nuevo en whatsapp_queue/{MessageSid}

# 2. Consumidor (Firebase Functions) — verificar procesamiento
firebase functions:log         # buscar "📨 Processing queue item"
#    Firestore: status pending → processing → completed
#    Confirmar respuesta recibida en WhatsApp
```

Si un mensaje queda en `processing` o `failed`, revisar el campo `error`
del doc en `whatsapp_queue` y los logs de la function.

---

## 8. Referencias

- `src/modules/whatsapp/whatsapp-queue.controller.ts` — productor de rollback (ya no es el webhook activo)
- `gastos-firebase-functions/src/index.ts` → `twilioWebhook` — **productor activo** (lo que está en Twilio, valida firma)
- `src/modules/whatsapp/whatsapp.controller.ts` — link/unlink + legacy `webhook-old`
- `src/modules/whatsapp/whatsapp.service.ts` — wrapper Twilio
- `gastos-firebase-functions/src/index.ts` — consumidor (`processWhatsAppQueue`, `twilioWebhook`)
- [`WHATSAPP_HYBRID_SETUP.md`](./WHATSAPP_HYBRID_SETUP.md) — guía histórica de la migración
