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

### Database Structure (Firestore)

```
users/{userId}/
  ├── profile/                    # User data
  ├── categories/                 # Custom categories with subcategories
  ├── conversations/{conversationId}/
  │   └── messages/              # Chat history
  └── imports/                    # Import audit trail

gastos/                           # Centralized expenses (filtered by userId)
receipts/                         # Receipt documents
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

## Firestore Security Rules

Must be configured in Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /gastos/{document=**} {
      allow read, write: if request.auth != null;
    }
    match /receipts/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

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
