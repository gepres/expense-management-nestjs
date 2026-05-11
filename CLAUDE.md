# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference Commands

```bash
# Development
npm run start:dev        # Hot-reload development server (port 3000)
npm run dev              # Alias for start:dev

# Build & Production
npm run build            # Compile to dist/
npm run start:prod       # Run production build

# Testing
npm run test             # Run unit tests
npm run test:watch       # Tests in watch mode
npm run test:cov         # Tests with coverage report
npm run test:e2e         # End-to-end tests

# Code Quality
npm run lint             # ESLint with auto-fix
npm run format           # Prettier formatting
```

## Architecture Overview

This is a NestJS 11 backend for an AI-powered expense management system using Firebase (Firestore + Auth) and Anthropic Claude.

### Core Architecture Pattern

```
Request → FirebaseAuthGuard → @CurrentUser() decorator → Service → FirebaseService → Firestore
```

All endpoints (except `/api/health`) require Firebase ID Token authentication via `Authorization: Bearer <token>` header.

### Global Modules

- **FirebaseModule** - Singleton Firebase Admin SDK instance (Auth, Firestore, Storage)
- **AnthropicModule** - Claude API integration for chat, vision, categorization

### Feature Modules

| Module | Purpose |
|--------|---------|
| `users` | Profile management, user initialization |
| `categories` | 8 default + custom categories with subcategories |
| `expenses` | CRUD, filtering, export (JSON/Excel) |
| `chat` | Persistent multi-turn conversations with AI |
| `receipts` | Image processing + Claude Vision OCR |
| `import` | Bulk Excel/JSON import with validation & AI suggestions |
| `payment-methods` | Payment method management |
| `currencies` | Currency management |
| `accounts` | Multi-account (bank, savings, wallet, card) with bank/cash sub-balances |
| `transfers` | Atomic inter-account transfers with currency conversion |
| `cash-movements` | Income / withdraw / deposit / revert (atomic) |
| `presupuestos` | Optional sub-reservations per category |
| `programados` | **Recurring scheduled expenses & transfers**. Cron-driven. See section below. |

### Database Structure (Firestore)

```
users/{userId}/
  ├── profile/                    # User data
  ├── categories/                 # Custom categories with subcategories
  ├── paymentMethods/             # Custom payment methods
  ├── currencies/                 # Custom currencies
  ├── shortcuts/                  # Quick expense shortcuts
  ├── conversations/{conversationId}/
  │   └── messages/              # Chat history
  └── imports/                    # Import audit trail

# Top-level collections (filtered by userId field)
expenses/                         # User expenses
accounts/                         # Multi-account
transfers/                        # Atomic inter-account transfers
cash-movements/                   # Income / withdraw / deposit / revert
presupuestos/                     # Sub-reservations per category
gastosProgramados/                # Recurring expense templates (write-blocked from client)
transferenciasProgramadas/        # Recurring transfer templates (write-blocked from client)
ejecucionesProgramadas/           # Cron audit log (idempotency lock; write-blocked from client)
receipts/                         # Receipt documents
shopping-lists/                   # Shopping lists
shared_groups/                    # Shared expense groups
```

## Critical Development Patterns

### User Authentication & Authorization

```typescript
// All services must filter by userId - NEVER return data without ownership check
const expenses = await firestore
  .collection('gastos')
  .where('userId', '==', userId)
  .orderBy('fecha', 'desc')
  .get();

// Verify ownership before update/delete
const doc = await firestore.collection('gastos').doc(id).get();
if (doc.data().userId !== userId) {
  throw new ForbiddenException('Access denied');
}
```

### Firestore Timestamps

```typescript
import { Timestamp } from 'firebase-admin/firestore';

// Store
createdAt: Timestamp.now()

// Read
const date = (doc.data().fecha as Timestamp).toDate();
```

### Batch Operations for Bulk Inserts

```typescript
const batch = firestore.batch();
for (const item of items) {
  const ref = collection.doc();
  batch.set(ref, item);
}
await batch.commit(); // Max 500 operations per batch
```

### DTOs and Validation

All request bodies must have corresponding DTOs with `class-validator` decorators. The global `ValidationPipe` auto-validates and transforms incoming data.

## Environment Configuration

Required variables in `.env`:

```env
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173

# Firebase (file-based OR environment variables)
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
FIREBASE_STORAGE_BUCKET=your-project.appspot.com

# OR for production:
# FIREBASE_PROJECT_ID=...
# FIREBASE_PRIVATE_KEY=...
# FIREBASE_CLIENT_EMAIL=...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Rate Limiting
THROTTLE_LIMIT=100
SCAN_THROTTLE_LIMIT=10
AI_THROTTLE_LIMIT=20
```

Environment validation occurs on startup via `src/config/env.validation.ts` - invalid config causes immediate failure.

## Rate Limiting

Configured in `app.module.ts` with three tiers:
- Default: 100 requests/minute
- Receipt scanning: 10 requests/minute
- AI calls: 20 requests/minute

## API Documentation

Swagger UI available at `http://localhost:3000/api/docs` when server is running.

Global API prefix: `/api`

## Key Service Methods

### AnthropicService (`src/modules/anthropic/anthropic.service.ts`)
- `sendMessage()` - Chat with context
- `extractReceiptData()` - OCR with Claude Vision
- `categorizeExpense()` - AI category suggestions
- `analyzeExpenses()` - Spending pattern analysis

### FirebaseService (`src/modules/firebase/firebase.service.ts`)
- `getFirestore()` - Primary database access
- `getAuth()` - Authentication operations
- `getStorage()` - File storage
- `verifyIdToken()` - Token validation

## Testing

Test files are co-located with source files as `*.spec.ts`. The project uses Jest with ts-jest transformer.

```bash
# Run single test file
npx jest src/modules/expenses/expenses.service.spec.ts

# Run tests matching pattern
npx jest --testNamePattern="should create expense"
```

## Programados Module (cron-driven recurring operations)

The `programados` module owns 2 collections (`gastosProgramados`, `transferenciasProgramadas`) and an audit collection (`ejecucionesProgramadas`).

### Critical patterns

- **Cron** runs every 30 min via `@nestjs/schedule` (`ProgramadosCron.procesarPendientes`). Processes both expense and transfer schedules in the same cycle.
- **Idempotency**: deterministic lock ID `{programadaId}_{fechaProgramadaISO}` in `ejecucionesProgramadas`. The lock is created with `.create()` (fails if exists with code `6`/`ALREADY_EXISTS`) BEFORE any side-effects. Safe under multi-worker / restarts.
- **Atomic execution**: each disparo runs inside `firestore.runTransaction(...)`:
  - Validates account ownership and existence (re-reads inside tx).
  - Re-reads the schedule to detect mid-run pause/delete.
  - Decrements balance from correct field (`bankBalance` or `cashBalance` for `metodoPago === 'efectivo'`).
  - Creates the `expense`/`transfer` document with `programadaId` marker.
  - Recalculates and writes `proximaEjecucion` (or sets `activo: false` if no more disparos).
  - Marks the lock as `exitosa`/`fallida`/`saldo_insuficiente`.
- **Insufficient balance**: marks execution `saldo_insuficiente` but ADVANCES `proximaEjecucion` so the schedule doesn't get stuck. User is responsible for adding funds.
- **Deleted account** (transfers only): marks `fallida` and PAUSES the schedule (different from insufficient balance which retries).
- **TZ-aware calculation** (`utils/calcular-proxima.ts`): uses `date-fns-tz` to respect user's `zonaHoraria` (IANA, e.g. `America/Lima`). The "day 5 at 12:00" semantics is in local time; storage in UTC.

### Endpoint pattern

```
/api/programados/gastos              → ProgramadosController + ProgramadosService
/api/programados/transferencias      → TransferenciasProgramadasController + TransferenciasProgramadasService
```

Both expose: `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/pause`, `POST /:id/resume`. Update endpoint recalculates `proximaEjecucion` if any schedule field changes.

### When modifying

- **NEVER** remove the lock-create-before-tx pattern — that's what guarantees idempotency.
- **NEVER** allow client writes to these collections (Firestore rules enforce this).
- If adding new frequency: update `FrecuenciaProgramado` enum AND add a case in `calcularProximaEjecucion` AND a test in `calcular-proxima.spec.ts`.
- If adding cross-currency transfers: validate exchange rate at create time, store `amountConverted` and `exchangeRate` in the schedule itself (don't compute at execution time — rates change).

## Firestore Security Rules

The authoritative rules live in the **frontend repo** (`gastos/firestore.rules`) and are deployed with `firebase deploy --only firestore:rules`. Highlights relevant to this backend:

- **Top-level collections** (`expenses`, `accounts`, `transfers`, `cash-movements`, `presupuestos`, `shopping-lists`, `receipts`): client can read/write its own data (`resource.data.userId == request.auth.uid`). Some collections are immutable from client (`transfers`, `cash-movements`).
- **Programados collections** (`gastosProgramados`, `transferenciasProgramadas`, `ejecucionesProgramadas`): client can only **read**. Writes are blocked at the rules level — only this backend (Admin SDK bypasses rules) can mutate them. This is non-negotiable: it prevents clients from manipulating `proximaEjecucion` to force immediate execution or skip validations.
- **Composite indexes** are also versioned in `gastos/firestore.indexes.json`. New indexes for programados:
  - `gastosProgramados`: `activo+proximaEjecucion`, `userId+proximaEjecucion`
  - `transferenciasProgramadas`: same two
- Whenever you add a query with `where` + `where`/`orderBy` on a new field, add the index to that file and `firebase deploy --only firestore:indexes`.

## Common Imports

```typescript
// Firebase
import { Timestamp } from 'firebase-admin/firestore';

// NestJS
import { Injectable, BadRequestException, NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

// Decorators
import { CurrentUser } from '@/common/decorators/current-user.decorator';

// DTOs
import { IsString, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiOperation, ApiTags } from '@nestjs/swagger';
```

## Module Path Alias

The project uses `@/` as path alias for `src/`:
```typescript
import { FirebaseService } from '@/modules/firebase/firebase.service';
```
