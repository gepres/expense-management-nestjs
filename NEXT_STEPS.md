# Próximos Pasos - Guía para Completar el Proyecto

## Archivos que Faltan Implementar

### 1. ChatModule - Servicios y Controller

**conversations.service.ts** (seguir patrón de categories.service.ts)
```typescript
// Ubicación: src/modules/chat/conversations.service.ts
- create(userId, createDto) → Firestore users/{userId}/conversations/{id}
- findAll(userId, pagination) → Lista con paginación
- findOne(userId, conversationId) → Con validación de ownership
- update(userId, conversationId, updateDto)
- delete(userId, conversationId) → Eliminar conv + todos sus mensajes
```

**messages.service.ts**
```typescript
// Ubicación: src/modules/chat/messages.service.ts
- create(userId, conversationId, messageDto) → Guardar mensaje
- findByConversation(userId, convId, pagination) → Lista de mensajes
- Actualizar lastMessagePreview en conversation
- Incrementar messageCount
```

**chat.controller.ts**
```typescript
// Ubicación: src/modules/chat/chat.controller.ts
POST   /chat/conversations
GET    /chat/conversations
GET    /chat/conversations/:id
POST   /chat/conversations/:id/messages  ← Aquí llamar a AnthropicService
PATCH  /chat/conversations/:id
DELETE /chat/conversations/:id
```

### 2. ExpensesModule - Servicio y Controller Completo

**expenses.service.ts**
```typescript
// Ubicación: src/modules/expenses/expenses.service.ts
- create(userId, createDto) → Firestore users/{userId}/expenses/{id}
- createBulk(userId, expenses[])
- findAll(userId, filters) → Con filtrado y paginación
- findOne(userId, expenseId)
- update(userId, expenseId, updateDto)
- delete(userId, expenseId)
- getSummary(userId, startDate, endDate)
  * Calcular totales por categoría
  * Promedios diarios
  * Tendencia (comparing with previous period)
  * Top gastos
- analyze(userId, filters, question?) 
  * Llamar a AnthropicService.analyzeExpenses()
  * Pasar datos agregados
```

**expenses.controller.ts**
```typescript
// Ubicación: src/modules/expenses/expenses.controller.ts
POST   /expenses
POST   /expenses/bulk
GET    /expenses
GET    /expenses/:id
PUT    /expenses/:id
PATCH  /expenses/:id/verify
PATCH  /expenses/:id/categorize  ← Usar AnthropicService
DELETE /expenses/:id
GET    /expenses/summary
POST   /expenses/analyze
```

**bulk-expenses.dto.ts**
```typescript
// Ubicación: src/modules/expenses/dto/bulk-expenses.dto.ts
export class BulkExpensesDto {
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  expenses: CreateExpenseDto[];
}
```

### 3. ReceiptsModule - Completo

**image-processor.service.ts**
```typescript
// Ubicación: src/modules/receipts/image-processor.service.ts
- validateImage(file: Express.Multer.File) → Tipo y tamaño
- compressImage(buffer: Buffer) → Si >2MB, comprimir con sharp
- uploadToFirebase(userId, buffer, filename) → Storage
- convertToBase64(buffer) → Para Anthropic
```

**receipts.service.ts**
```typescript
// Ubicación: src/modules/receipts/receipts.service.ts
- create(userId, receiptData)
- findAll(userId, filters)
- findOne(userId, receiptId)
- delete(userId, receiptId) → Eliminar doc + imagen
```

**receipts.controller.ts**
```typescript
// Ubicación: src/modules/receipts/receipts.controller.ts
POST   /receipts/scan  
  1. Upload imagen
  2. ImageProcessor → compress + upload + base64
  3. AnthropicService.extractReceiptData()
  4. Guardar receipt en Firestore
  5. Retornar datos extraídos

POST   /receipts/scan-and-save
  1-4. Igual que scan
  5. Crear expense automáticamente
  6. Retornar { receipt, expense }

GET    /receipts
GET    /receipts/:id
DELETE /receipts/:id
```

**receipts.module.ts**
```typescript
// Ubicación: src/modules/receipts/receipts.module.ts
@Module({
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ImageProcessorService],
  exports: [ReceiptsService],
})
```

### 4. ImportModule - Módulo Completo

Crear todos los archivos según la especificación original:
- `src/modules/import/import.module.ts`
- `src/modules/import/import.controller.ts`
- `src/modules/import/excel-import.service.ts`
- `src/modules/import/excel-parser.service.ts`
- `src/modules/import/excel-validator.service.ts`
- `src/modules/import/template-generator.service.ts`
- `src/modules/import/dto/import-file.dto.ts`
- `src/modules/import/interfaces/*.ts`

## Patrón de Implementación

### Para cada Service:

1. **Inyectar dependencias**
```typescript
constructor(
  private firebaseService: FirebaseService,
  // otros servicios si necesitas
) {}
```

2. **Operaciones Firestore**
```typescript
const firestore = this.firebaseService.getFirestore();
const collection = firestore.collection('users')
  .doc(userId)
  .collection('subcollection');
```

3. **Siempre validar ownership**
```typescript
if (data.userId !== userId) {
  throw new ForbiddenException('Access denied');
}
```

4. **Usar Timestamps de Firestore**
```typescript
import { Timestamp } from 'firebase-admin/firestore';

createdAt: Timestamp.now();
```

### Para cada Controller:

1. **Usar guards y decorators**
```typescript
@UseGuards(FirebaseAuthGuard)
@Controller('endpoint')
export class MyController {
  
  @Get()
  async findAll(@CurrentUser() user: FirebaseUser) {
    return this.service.findAll(user.uid);
  }
}
```

2. **Documentar con Swagger**
```typescript
@ApiTags('ModuleName')
@ApiBearerAuth('firebase-auth')
@ApiOperation({ summary: '...' })
@ApiResponse({ status: 200, description: '...' })
```

3. **Validar con DTOs**
```typescript
@Post()
async create(@Body() createDto: CreateDto) {
  // Validación automática por ValidationPipe
}
```

## Testing del Código

### Verificar compilación
```bash
npm run build
```

### Iniciar en desarrollo
```bash
npm run start:dev
```

### Verificar health check
```bash
curl http://localhost:3000/api/health
```

### Ver Swagger docs
```
http://localhost:3000/api/docs
```

## Prioridad de Implementación

1. **ExpensesModule** (Core del negocio)
   - Service completo
   - Controller completo
   - Probar CRUD básico

2. **ReceiptsModule** (Funcionalidad diferenciadora)
   - ImageProcessor
   - Service
   - Controller
   - Probar scan

3. **ChatModule** (IA conversacional)
   - Services
   - Controller
   - Probar chat

4. **ImportModule** (Nice to have)
   - Implementar cuando lo anterior funcione

## Recursos Útiles

- **Firestore Queries**: https://firebase.google.com/docs/firestore/query-data/queries
- **NestJS Modules**: https://docs.nestjs.com/modules
- **Class Validator**: https://github.com/typestack/class-validator
- **Anthropic API**: https://docs.anthropic.com/claude/reference

## Siguientes Comandos

```bash
# Ver estructura
ls -R src/modules/

# Compilar y verificar errores
npm run build

# Iniciar desarrollo
npm run start:dev

# Ver logs
# El LoggingInterceptor ya está configurado

# Testing (cuando implementes)
npm run test
```

## Ayuda

Si tienes dudas:
1. Revisa **CategoriesModule** - Es un ejemplo completo funcional
2. Revisa **UsersModule** - Otro ejemplo completo
3. Las interfaces ya están creadas, solo sigue el patrón
4. Todos los helpers (FirebaseService, AnthropicService) ya están listos

