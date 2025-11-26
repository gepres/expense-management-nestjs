# WhatsApp Hybrid Architecture - Setup Guide

## Overview

The WhatsApp integration now uses a **hybrid architecture**:

- **NestJS API (Vercel)**: Handles webhook enqueueing and link/unlink endpoints
- **Firebase Functions**: Processes WhatsApp messages asynchronously with AI

## Architecture

```
WhatsApp → Twilio → NestJS (Vercel) → Firestore Queue
                                          ↓
                                    Firebase Function
                                          ↓
                                    Process with AI
                                          ↓
                                    Send response via Twilio
```

## Current Status

### ✅ Phase 1: NestJS API (COMPLETED)

Created `whatsapp-queue.controller.ts` that:
- Receives webhooks from Twilio
- Responds immediately with empty TwiML (prevents timeouts)
- Enqueues messages to Firestore collection `whatsapp_queue`

**Files Modified:**
- `src/modules/whatsapp/whatsapp-queue.controller.ts` (NEW)
- `src/modules/whatsapp/whatsapp.module.ts` (registered new controller)

**Original Controller:**
- `whatsapp.controller.ts` remains unchanged
- Still handles `/whatsapp/link` and `/whatsapp/unlink` endpoints

### ⏳ Phase 2: Firebase Functions (PENDING)

**Next Steps:**

1. **Initialize Firebase Functions**
   ```bash
   firebase init functions
   ```

2. **Create Function Structure**
   ```
   functions/
   ├── package.json
   ├── tsconfig.json
   └── src/
       ├── index.ts (main trigger)
       ├── services/
       │   ├── anthropic.service.ts
       │   ├── expense.service.ts
       │   └── twilio.service.ts
       └── utils/
           └── message-parser.ts
   ```

3. **Configure Environment Variables**
   ```bash
   firebase functions:config:set \
     twilio.account_sid="ACxxxxx" \
     twilio.auth_token="xxxxx" \
     twilio.whatsapp_number="whatsapp:+14155238886" \
     anthropic.api_key="sk-ant-xxxxx"
   ```

4. **Deploy**
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions
   ```

## Firestore Queue Schema

**Collection**: `whatsapp_queue`

```typescript
{
  phoneNumber: string;        // +51999999999
  message: string;            // User's text message
  webhookBody: {              // Full Twilio webhook data
    MessageSid: string;
    From: string;
    Body: string;
    NumMedia?: string;
    MediaUrl0?: string;
    MediaContentType0?: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Timestamp;
  processedAt?: Timestamp;
  error?: string;
  retryCount: number;
}
```

## Benefits

✅ **No Timeouts**: Firebase Functions have 540s limit (vs 60s Vercel)  
✅ **Retry Logic**: Automatic retries on failure  
✅ **Audit Trail**: All messages logged in Firestore  
✅ **Scalability**: Auto-scales with demand  
✅ **Separation**: API endpoints separate from heavy processing

## Testing

### Test Enqueueing (Phase 1)

1. Send WhatsApp message to your Twilio number
2. Check Vercel logs for "✅ Message enqueued successfully"
3. Verify document created in Firestore `whatsapp_queue` collection

### Test Processing (Phase 2 - After Firebase Functions)

1. Send message
2. Check Firebase Functions logs: `firebase functions:log`
3. Verify status changes: `pending` → `processing` → `completed`
4. Confirm WhatsApp response received

## Rollback

If issues occur:

1. Revert to direct processing:
   - Remove `WhatsappQueueController` from `whatsapp.module.ts`
   - Uncomment webhook in original `WhatsappController`

2. Delete Firebase Function:
   ```bash
   firebase functions:delete processWhatsappMessage
   ```

3. Clear queue:
   ```bash
   firebase firestore:delete whatsapp_queue --recursive
   ```

## Next Implementation Steps

See `implementation_plan.md` for detailed Firebase Functions implementation plan.
