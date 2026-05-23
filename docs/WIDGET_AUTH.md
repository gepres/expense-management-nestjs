# Widget Auth — Custom Token + Deep Link

> Cómo el widget Windows (Tauri) inicia sesión sin pedir email/password.
> Reusa la sesión web ya autenticada del usuario.

**Versión introducida**: v2.11.0 (en progreso) — 2026-05-23.

---

## Visión general

```
┌────────────────┐        ┌──────────────┐        ┌──────────────────┐        ┌────────────────┐
│ Usuario (web)  │        │ Frontend Web │        │ Backend NestJS   │        │ Widget Tauri   │
└───────┬────────┘        └──────┬───────┘        └────────┬─────────┘        └────────┬───────┘
        │                        │                          │                            │
        │ 1. Abre /widget-link   │                          │                            │
        ├───────────────────────►│                          │                            │
        │ 2. Click "Conectar"    │                          │                            │
        ├───────────────────────►│                          │                            │
        │                        │ 3. POST /widget/issue-token (Bearer idToken)          │
        │                        ├─────────────────────────►│                            │
        │                        │                          │ 4. createCustomToken(uid,  │
        │                        │                          │    { source: 'widget' })   │
        │                        │ 5. { customToken, uid }  │                            │
        │                        │◄─────────────────────────┤                            │
        │                        │ 6. window.location =                                  │
        │                        │    gastos://auth?customToken=<JWT>                    │
        │                        ├───────────────────────────────────────────────────────►│
        │                        │                          │                            │
        │                        │                          │ 7. signInWithCustomToken   │
        │                        │                          │ ◄──────────────────────────┤
        │                        │                          │    (Firebase Web SDK)      │
        │                        │                          │ 8. idToken + refreshToken  │
        │                        │                          ├───────────────────────────►│
        │                        │                          │                            │
        │                        │                          │ 9. GET /dashboard/summary  │
        │                        │                          │    (Bearer nuevo idToken)  │
        │                        │                          │◄───────────────────────────┤
        │                        │                          │                            │
```

---

## Endpoint backend

### `POST /api/widget/issue-token`

- **Guard**: `FirebaseAuthGuard` — requiere idToken válido del usuario.
- **Rate limit**: `@Throttle({ default: { ttl: 60_000, limit: 5 } })` — máx 5 emisiones/min por usuario+IP.
- **Body**: ninguno.
- **Response 201**:

```json
{
  "customToken": "eyJhbGciOiJSUzI1NiIs...",
  "uid": "QEsEjeUW6PeiEnM56utcjBXKhi02",
  "issuedAt": "2026-05-23T14:32:18.421Z"
}
```

### Custom token

- Generado con `admin.auth().createCustomToken(uid, { source: 'widget' })`.
- **TTL natural**: 1 hora.
- **Uso único**: tras `signInWithCustomToken`, Firebase descarta el custom token y emite idToken+refreshToken normales.
- **Claim adicional**: `source: 'widget'` — disponible en `request.user.firebase.sign_in_attributes` para auditoría futura (telemetría, políticas diferenciadas).

---

## Frontend web

### `/widget-link`

- Pública pero requiere login (redirige a `/login?redirect=/widget-link` si no hay sesión).
- Botón "Conectar widget" llama `issueWidgetToken()` (`src/services/widget.ts`) y redirige a `gastos://auth?customToken=<JWT>`.
- Muestra instrucciones, badge de seguridad, link de descarga del widget (próximamente).

---

## Esquema URI — `gastos://`

El widget Tauri **debe** registrar el protocolo `gastos://` durante la instalación. Configuración en `tauri.conf.json`:

```jsonc
{
  "tauri": {
    "bundle": {
      "identifier": "com.gepres.gastos.widget",
      "windows": {
        "wix": {
          // Registro del esquema en HKEY_CLASSES_ROOT durante install
        }
      }
    },
    "plugins": {
      "deep-link": {
        "schemes": ["gastos"]
      }
    }
  }
}
```

Para Tauri 2: usar `tauri-plugin-deep-link` con `.register("gastos")`.

### Captura del deep link en el widget

```ts
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { signInWithCustomToken } from 'firebase/auth';

await onOpenUrl(async (urls) => {
  for (const url of urls) {
    const parsed = new URL(url);
    if (parsed.host === 'auth') {
      const customToken = parsed.searchParams.get('customToken');
      if (customToken) {
        await signInWithCustomToken(auth, customToken);
        // → idToken+refreshToken quedan en localStorage del WebView2.
      }
    }
  }
});
```

---

## Seguridad

| Defensa | Implementación |
|---|---|
| Sin credenciales en el widget | El widget NUNCA pide email/password; usa custom token de un solo uso |
| Custom token con claim de origen | `source: 'widget'` permite diferenciar consumo widget vs web |
| TTL corto | 1 hora, sin renovación. Si caduca antes de canjearse, hay que volver a `/widget-link` |
| Rate limit | Máx 5 emisiones/min por usuario+IP previene abuso |
| Misma sesión Firebase | Las reglas Firestore/Storage aplican igual al widget que a la web (mismo uid) |
| Refresh token aislado | Firebase Web SDK persiste el refresh en localStorage del WebView2; revocar sesiones desde la consola de Firebase elimina ambas |
| Sin cuota separada | Las llamadas IA del widget (si las hay en el futuro) cuentan a la misma cuota mensual del usuario |

---

## Consideraciones operativas

- **Logout en la web NO desloguea al widget** (sesiones independientes). Para forzar logout global, revocar tokens en Firebase Console.
- **Cambio de contraseña** invalida todos los refresh tokens del usuario (web + widget).
- **El widget no requiere el frontend web corriendo** una vez emparejado; va directo al backend.
