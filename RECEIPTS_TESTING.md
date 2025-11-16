# Testing del Módulo Receipts

## Configuración Rápida

### 1. Obtener Credenciales de Cloudinary (GRATIS)

1. Ve a [https://cloudinary.com](https://cloudinary.com)
2. Click en "Sign Up for Free"
3. Completa el registro
4. En tu Dashboard verás:
   - **Cloud Name**: tu-nombre-de-cloud
   - **API Key**: 123456789012345
   - **API Secret**: xxxxxxxxxxxxxxxxx

### 2. Configurar Variables de Entorno

Abre tu archivo `.env` y agrega:

```env
# Cloudinary
CLOUDINARY_CLOUD_NAME=tu-nombre-de-cloud
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxx

# Anthropic (si aún no lo tienes)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

### 3. Iniciar el Servidor

```bash
npm run dev
```

Deberías ver:

```
[Nest] LOG [Bootstrap] 🚀 Application is running on: http://localhost:3000
[Nest] LOG [ImageProcessorService] Cloudinary configured successfully
```

---

## Pruebas con Postman

### Método 1: Request Manual

1. **Abre Postman**

2. **Crea un nuevo Request**
   - Method: `POST`
   - URL: `http://localhost:3000/api/receipts/scan`

3. **Configura el Body**
   - Click en la pestaña "Body"
   - Selecciona "form-data"
   - Agrega una fila:
     - Key: `image` (cambia el tipo a "File" en el dropdown)
     - Value: Click en "Select Files" y elige una imagen de comprobante

4. **Enviar**
   - Click en "Send"
   - Espera la respuesta (puede tomar 3-10 segundos)

### Método 2: Colección Importable

Copia este JSON y guárdalo como `receipts-collection.json`:

```json
{
  "info": {
    "name": "Receipts API Tests",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Scan Receipt",
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "image",
              "type": "file",
              "src": ""
            }
          ]
        },
        "url": {
          "raw": "http://localhost:3000/api/receipts/scan",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "receipts", "scan"]
        }
      }
    },
    {
      "name": "2. Get All Receipts",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/receipts",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "receipts"]
        }
      }
    },
    {
      "name": "3. Get Receipts (Processed Only)",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/receipts?status=processed&limit=10",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "receipts"],
          "query": [
            {
              "key": "status",
              "value": "processed"
            },
            {
              "key": "limit",
              "value": "10"
            }
          ]
        }
      }
    },
    {
      "name": "4. Get Receipt by ID",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/receipts/{{receiptId}}",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "receipts", "{{receiptId}}"]
        }
      }
    },
    {
      "name": "5. Delete Receipt",
      "request": {
        "method": "DELETE",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/receipts/{{receiptId}}",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "receipts", "{{receiptId}}"]
        }
      }
    }
  ]
}
```

Luego en Postman:
1. File → Import
2. Selecciona `receipts-collection.json`
3. La colección aparecerá en el sidebar

---

## Pruebas con cURL

### Escanear Comprobante

```bash
# Windows PowerShell
curl.exe -X POST http://localhost:3000/api/receipts/scan `
  -F "image=@C:\ruta\a\tu\comprobante.jpg"

# Linux/Mac
curl -X POST http://localhost:3000/api/receipts/scan \
  -F "image=@/ruta/a/tu/comprobante.jpg"
```

### Listar Todos los Comprobantes

```bash
curl http://localhost:3000/api/receipts
```

### Obtener Comprobante por ID

```bash
curl http://localhost:3000/api/receipts/abc123xyz
```

### Eliminar Comprobante

```bash
curl -X DELETE http://localhost:3000/api/receipts/abc123xyz
```

---

## Ejemplos de Respuestas

### ✅ Escaneo Exitoso (Confianza Alta)

```json
{
  "success": true,
  "receiptId": "g7X9mK2pLqR",
  "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1705334400/receipts/receipt_1705334400000_yape.jpg",
  "cloudinaryPublicId": "receipts/receipt_1705334400000_yape",
  "data": {
    "amount": 45.5,
    "currency": "PEN",
    "date": "2025-01-15",
    "time": "14:30:45",
    "paymentMethod": "yape",
    "merchant": "Restaurante El Paisa",
    "referenceNumber": "987654321",
    "category": "Alimentación",
    "subcategory": "Restaurante",
    "description": "Almuerzo",
    "confidence": 95
  },
  "suggestions": [],
  "status": "processed"
}
```

**Nota sobre el campo `time`:**
- Si la hora está visible en la boleta, el sistema la extrae automáticamente (formato 24h: "HH:mm:ss")
- Si NO se encuentra la hora en la boleta, el sistema usa la hora de la solicitud del API
- Ejemplos: "14:30:45", "09:15:00", "18:45:30"

### ⚠️ Escaneo con Confianza Baja

```json
{
  "success": true,
  "receiptId": "h8Y1nL3qMrS",
  "imageUrl": "https://res.cloudinary.com/demo/image/upload/...",
  "data": {
    "amount": 120.0,
    "currency": "PEN",
    "date": null,
    "time": "16:22:10",
    "paymentMethod": null,
    "merchant": null,
    "category": "Otros",
    "confidence": 65
  },
  "suggestions": [
    "La confianza en la extracción es baja. Verifica los datos manualmente."
  ],
  "status": "processed"
}
```

**Nota:** En este caso, aunque la fecha no se pudo extraer (`date: null`), el sistema asignó la hora de la solicitud del API (`time: "16:22:10"`).

### ❌ Error de Procesamiento

```json
{
  "success": false,
  "receiptId": "i9Z2oM4rNsT",
  "imageUrl": "https://res.cloudinary.com/demo/image/upload/...",
  "data": {},
  "suggestions": [],
  "status": "failed",
  "errorMessage": "Error al procesar la imagen con IA"
}
```

---

## Extracción de Fecha y Hora

El sistema extrae automáticamente la **fecha** y **hora** del comprobante:

### Fecha (`date`)
- Formato de salida: `YYYY-MM-DD`
- Convierte formatos peruanos como `DD/MM/YYYY` automáticamente
- Si no se encuentra, retorna `null`

### Hora (`time`)
- Formato de salida: `HH:mm:ss` (formato 24 horas)
- **Si está visible en la boleta**: La extrae automáticamente
  - Reconoce formatos: "14:30", "2:30 PM", "14:30:45"
  - Convierte AM/PM a formato 24h ("2:30 PM" → "14:30:00")
- **Si NO está visible**: Usa la hora actual de la solicitud del API
  - Ejemplo: Si haces la petición a las 16:22:10, retorna `"time": "16:22:10"`

### Ejemplos:

```json
// Boleta con hora visible
{
  "date": "2025-01-15",
  "time": "14:30:45"  // Extraída de la boleta
}

// Boleta sin hora visible
{
  "date": "2025-01-15",
  "time": "16:22:10"  // Hora de la solicitud API
}

// Boleta sin fecha ni hora
{
  "date": null,
  "time": "16:22:10"  // Hora de la solicitud API (siempre presente)
}
```

**💡 Importante:** El campo `time` SIEMPRE estará presente en la respuesta, incluso si no se encuentra en la boleta.

---

## Detección Automática de Subcategorías

El sistema ahora incluye **detección inteligente de subcategorías** basada en keywords:

### ¿Cómo funciona?

1. **La IA extrae** el texto del comprobante (description, merchant)
2. **El sistema busca** palabras clave en el archivo `categories-subcategories.json`
3. **Coincide automáticamente** con la subcategoría más específica
4. **Retorna** tanto la categoría como la subcategoría

### Ejemplos de Keywords que Detecta

**Alimentación:**
- "bodega", "minimarket" → Subcategoría: **Bodega**
- "panadería", "pastelería" → Subcategoría: **Panadería**
- "pollería", "broaster" → Subcategoría: **Pollería**
- "restaurante", "cevichería" → Subcategoría: **Restaurante**
- "supermercado", "metro", "plaza vea" → Subcategoría: **Supermercado**
- "mcdonald", "pizza", "bembos" → Subcategoría: **Fast Food**
- "starbucks", "café" → Subcategoría: **Cafetería**

**Transporte:**
- "taxi", "cabify", "beat" → Subcategoría: **Taxi**
- "uber" → Subcategoría: **Uber**
- "bus", "combi", "metropolitano" → Subcategoría: **Bus**
- "gasolina", "grifo", "primax" → Subcategoría: **Gasolina**
- "estacionamiento", "parking" → Subcategoría: **Estacionamiento**

**Salud:**
- "farmacia", "inkafarma", "mifarma" → Subcategoría: **Farmacia**
- "doctor", "consulta" → Subcategoría: **Consulta Médica**
- "dentista", "odontólogo" → Subcategoría: **Dentista**

**Vivienda:**
- "alquiler", "renta", "arriendo" → Subcategoría: **Alquiler**
- "hipoteca", "préstamo hipotecario" → Subcategoría: **Hipoteca**
- "mantenimiento", "plomero", "electricista" → Subcategoría: **Mantenimiento**
- "limpieza", "empleada doméstica" → Subcategoría: **Limpieza**
- "condominio", "cuota de mantenimiento" → Subcategoría: **Condominio**

Y muchas más en el archivo `categories-subcategories.json`.

### Caso de Uso: Yape/Plin

Cuando escanees un comprobante de **Yape** o **Plin**, asegúrate de que la descripción incluya palabras clave:

```
Descripción en Yape: "bodega"
→ Resultado: category: "Alimentación", subcategory: "Bodega"

Descripción en Yape: "taxi"
→ Resultado: category: "Transporte", subcategory: "Taxi"

Descripción en Plin: "panadería"
→ Resultado: category: "Alimentación", subcategory: "Panadería"

Descripción en Yape: "alquiler"
→ Resultado: category: "Vivienda", subcategory: "Alquiler"

Descripción en Plin: "condominio"
→ Resultado: category: "Vivienda", subcategory: "Condominio"
```

**💡 Tip:** Mientras más específica sea la descripción en Yape/Plin, mejor será la categorización automática.

---

## Prueba con Imágenes de Ejemplo

### Tipos de Comprobantes para Probar

1. **Yape**
   - Busca una captura de pantalla de una transacción Yape
   - Debe tener el logo morado y la información de la transacción

2. **Plin**
   - Captura de transacción Plin
   - Logo azul/verde característico

3. **Boleta**
   - Foto de una boleta física
   - Asegúrate de que el texto sea legible

4. **Transferencia**
   - Captura de constancia de transferencia bancaria

### Consejos para Mejores Resultados

✅ **Buenas Prácticas:**
- Imagen clara y enfocada
- Buena iluminación
- Todo el texto legible
- Sin reflejos ni sombras
- Formato horizontal

❌ **Evitar:**
- Imágenes borrosas
- Texto muy pequeño
- Mal iluminadas
- Cortadas o incompletas

---

## Verificar que Todo Funciona

### 1. Health Check

```bash
curl http://localhost:3000/api/health
```

Deberías ver:

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T...",
  "services": {
    "firebase": "ok",
    "anthropic": "ok"
  }
}
```

### 2. Swagger UI

Abre en tu navegador:

```
http://localhost:3000/api/docs
```

Deberías ver la documentación interactiva con el módulo "Receipts".

### 3. Test Rápido

```bash
# Escanear una imagen
curl -X POST http://localhost:3000/api/receipts/scan \
  -F "image=@mi-comprobante.jpg"

# Listar comprobantes
curl http://localhost:3000/api/receipts
```

---

## Troubleshooting

### Error: "No se proporcionó ninguna imagen"

**Causa**: El campo `image` no está siendo enviado correctamente.

**Solución**:
- En Postman: Verifica que el key sea exactamente `image`
- Verifica que hayas seleccionado "File" como tipo
- Asegúrate de haber seleccionado una imagen

---

### Error: "Tipo de archivo no permitido"

**Causa**: El archivo no es JPG, PNG o WEBP.

**Solución**: Convierte tu imagen a uno de estos formatos.

---

### Error: "El archivo es demasiado grande"

**Causa**: La imagen supera 5MB.

**Solución**: Reduce el tamaño de la imagen antes de subirla.

---

### Error: "Error al procesar la imagen con IA"

**Posibles causas**:
1. API key de Anthropic inválida o sin créditos
2. Imagen no legible
3. Problema de conexión

**Solución**:
1. Verifica tu `ANTHROPIC_API_KEY` en `.env`
2. Prueba con una imagen más clara
3. Revisa los logs del servidor

---

### Error de Cloudinary

**Causa**: Credenciales incorrectas.

**Solución**:
1. Verifica `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` en `.env`
2. Asegúrate de que no haya espacios extra
3. Reinicia el servidor después de cambiar `.env`

---

### La imagen se sube pero no se procesan los datos

**Causa**: Problema con Anthropic API.

**Solución**:
1. Verifica los logs: Busca mensajes de error de Anthropic
2. Verifica que tengas créditos en tu cuenta de Anthropic
3. La imagen puede no ser legible para el OCR

---

## Costos Estimados

### Cloudinary (Free Tier)
- **Incluye**: 25 créditos mensuales
- **Equivalente a**: ~10,000 imágenes/mes
- **Costo extra**: $0 (no llegarás al límite en pruebas)

### Anthropic Claude
- **Costo por imagen**: ~$0.003 - $0.005
- **100 pruebas**: ~$0.30 - $0.50

**Total para pruebas**: Prácticamente gratis con el free tier de ambos.

---

## Próximos Pasos

Una vez que hayas probado el escaneo básico, puedes:

1. **Integrar con frontend**: Crear un formulario de upload
2. **Crear endpoints de gastos**: Convertir recibos en gastos
3. **Agregar validaciones**: Verificar duplicados
4. **Mejorar la IA**: Ajustar los prompts para mejor precisión
5. **Agregar categorización automática**: Usar la IA para sugerir categorías

---

## Recursos

- **Cloudinary Docs**: https://cloudinary.com/documentation
- **Anthropic Docs**: https://docs.anthropic.com/claude/docs
- **Postman Learning**: https://learning.postman.com/

---

¡Listo para empezar! 🚀

Prueba escaneando tu primer comprobante con Postman.
