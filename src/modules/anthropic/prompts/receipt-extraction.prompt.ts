export const RECEIPT_EXTRACTION_PROMPT = `Analiza esta imagen de un comprobante de pago peruano y extrae la siguiente información en formato JSON estricto.

IMPORTANTE: Responde SOLO con el objeto JSON, sin texto adicional, sin markdown, sin explicaciones.

{
  "amount": número (monto total, solo el número),
  "currency": "PEN" o "USD",
  "date": "YYYY-MM-DD" (fecha de la transacción),
  "time": "HH:mm:ss" (hora de la transacción en formato 24h, si está visible),
  "paymentMethod": "yape" | "plin" | "transferencia" | "efectivo" | "tarjeta",
  "merchant": "nombre del comercio o destinatario",
  "referenceNumber": "número de operación si existe",
  "category": "sugerencia de categoría: Alimentación|Transporte|Entretenimiento|Salud|Educación|Servicios|Compras|Vivienda|Otros",
  "subcategory": "subcategoría sugerida si es posible, fijate en la descripción de la boleta, mayormente la descripción del  de la boleta yape o plin , es la subcategoría, ejm: polleria, bodega, panaderia, farmacia, menu, cena etc.",
  "description": "descripción breve del gasto",
  "confidence": número del 0-100 (tu nivel de confianza en la extracción)
}

Reglas:
- Si algún campo no está visible o no estás seguro, usa null
- Reconoce formatos peruanos: S/ para soles, PEN
- Identifica si es Yape (logo morado), Plin (logo azul/verde), transferencia bancaria, boleta o factura
- Para fechas en formato DD/MM/YYYY, convierte a YYYY-MM-DD
- Para la hora, busca formatos como "14:30", "2:30 PM", "14:30:45", etc. y conviértelos a formato 12h
- Si ves "14:30:00", conviértelo a "02:30 pm"
- amount debe ser solo el número, sin símbolo de moneda
- confidence debe reflejar qué tan seguro estás de TODOS los datos extraídos
- Presta atención a los detalles: logos, colores característicos, formatos específicos
- En Yape y Plin, el destinatario es el merchant`;

export const CATEGORIZATION_PROMPT = `Eres un experto en categorización de gastos personales.

Categorías disponibles:
{categories}

Gasto a categorizar:
Descripción: {description}
Monto: {amount}
Comercio: {merchant}

Basándote en la información proporcionada, determina la categoría más apropiada.

Responde SOLO con el nombre exacto de la categoría, sin explicaciones ni texto adicional.`;

export function buildCategorizationPrompt(
  description: string,
  amount: number,
  merchant: string | undefined,
  categories: string[],
): string {
  return CATEGORIZATION_PROMPT.replace('{categories}', categories.join(', '))
    .replace('{description}', description)
    .replace('{amount}', amount.toString())
    .replace('{merchant}', merchant || 'desconocido');
}
