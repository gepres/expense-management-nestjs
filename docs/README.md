# Documentación — Gastos Backend API

Índice de la documentación del proyecto. El punto de entrada general es el [`README.md`](../README.md) de la raíz; `CLAUDE.md` es la guía para Claude Code.

## Por dónde empezar

| Si quieres… | Lee |
|---|---|
| Levantar el proyecto local | [QUICKSTART.md](./QUICKSTART.md) |
| Entender cómo está construido | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Consumir la API | [API.md](./API.md) + Swagger en `/api/docs` |
| Autenticarte / obtener un token | [AUTHENTICATION.md](./AUTHENTICATION.md) |
| Desplegar a producción | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| Probar el escaneo de comprobantes | [RECEIPTS_TESTING.md](./RECEIPTS_TESTING.md) |
| Entender el flujo de WhatsApp | [WHATSAPP_FLOW.md](./WHATSAPP_FLOW.md) |

## Catálogo

### [QUICKSTART.md](./QUICKSTART.md)
Puesta en marcha en ~5 minutos: dependencias, Firebase, Anthropic, Cloudinary, `.env`, verificación con health check y Swagger.

### [ARCHITECTURE.md](./ARCHITECTURE.md)
Arquitectura del sistema: patrón de request, módulos globales y de negocio, modelo de datos Firestore (colecciones y subcolecciones), el subsistema de **programados** (cron idempotente, timezone-aware, transferencias cross-currency) y el de **notificaciones**.

### [API.md](./API.md)
Referencia completa de **todos los endpoints** agrupados por módulo: método, ruta, auth requerida y propósito. Complementa la documentación interactiva de Swagger (`/api/docs`).

### [AUTHENTICATION.md](./AUTHENTICATION.md)
Cómo autenticarse contra la API: Swagger UI, HTML de testing, scripts Node, Postman/Thunder Client, cURL. Cómo obtener un Firebase ID Token y troubleshooting de auth.

### [DEPLOYMENT.md](./DEPLOYMENT.md)
Despliegue en Vercel (serverless), variables de entorno de producción, el cron de programados vía GitHub Actions, y las reglas e índices de Firestore (que viven en el repo frontend).

### [RECEIPTS_TESTING.md](./RECEIPTS_TESTING.md)
Guía práctica del módulo `receipts`: configuración de Cloudinary, pruebas con Postman/cURL, ejemplos de respuesta, extracción de fecha/hora, detección automática de subcategorías y costos estimados.

### [WHATSAPP_FLOW.md](./WHATSAPP_FLOW.md)
**(Al día)** Flujo WhatsApp end-to-end: arquitectura productor/consumidor desacoplada por la colección `whatsapp_queue`, esquema de la cola, ciclo de vida del estado, ramas de procesamiento (texto/imagen/audio) y caveats de seguridad/idempotencia.

### [WHATSAPP_HYBRID_SETUP.md](./WHATSAPP_HYBRID_SETUP.md)
**(Histórico)** Guía original de la migración a la arquitectura híbrida. Conservada como referencia; para el estado actual usar `WHATSAPP_FLOW.md`.

---

> Los documentos `NEXT_STEPS.md` y `PROJECT_STATUS.md` fueron eliminados por estar obsoletos (describían como "pendientes" módulos que ya están implementados). El estado real del proyecto se refleja en este conjunto de documentos actualizados.
