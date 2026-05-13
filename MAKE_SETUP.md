# Setup Make.com para publicar en FB / IG automáticamente

Esta guía configura un scenario en Make.com Free Tier que recibe un webhook
desde el backend de Momentum Ascent y publica el post en Facebook (y opcionalmente
Instagram, X). El plan Free de Make da **1,000 operations/mes** — suficiente para
**~250 posts FB+IG diarios** (~8/día durante 30 días).

---

## Paso 1 — Crear cuenta y scenario base

1. Ve a https://make.com → registra cuenta gratis (Google login funciona).
2. Click **"Create a new scenario"**.
3. Click el círculo grande con `+` en el centro → busca **"Webhooks"** → elige **"Custom webhook"**.
4. Click **"Add"** → nombre: `momentum-ascent-posts` → **Save**.
5. Make te da una URL tipo:
   ```
   https://hook.us2.make.com/abc123xyz...
   ```
   **Copia esa URL**. La necesitas en el paso 4.

---

## Paso 2 — Probar el webhook desde tu backend

1. En Render → tu servicio backend → **Environment** → agrega:
   ```
   MAKE_WEBHOOK_URL = https://hook.us2.make.com/abc123xyz...
   ```
2. Render auto-redeploya (~2 min).
3. Ve a admin de Momentum Ascent → cualquier pick → click el botón **📘** azul.
4. En el modal, click **"🧪 Test webhook"**.
5. Vuelve a Make.com → tu scenario debe mostrar **"Successfully determined"** con un payload de ejemplo.

Si no llega: revisa que la URL no tenga espacios y que Render terminó deploy.

---

## Paso 3 — Agregar módulo de Facebook

1. En el scenario, click `+` después del webhook.
2. Busca **"Facebook Pages"** → elige **"Create a Post"**.
3. **Connection**:
   - Click "Add" → "Add a connection"
   - Login con tu cuenta de FB que administra la página Momentum Ascent
   - Acepta los permisos solicitados (Make tiene su app aprobada por Meta — esto sí funciona)
4. **Page**: selecciona "Momentum Ascent"
5. **Message**: click en el campo → del panel derecho elige `1. text` (del webhook).
6. **Photo**: click → mappea `1. imageUrl` (puede estar vacío en tests).
7. **Scheduled Publish Time**: opcional. Mappea `1. scheduledAt`.
8. **Save** y prueba: click "Run once" → desde admin manda otro Test → Make publica.

✅ Si publica, ¡felicidades! Ya tienes FB automatizado.

---

## Paso 4 — (Opcional) Agregar Instagram

Requiere que tu cuenta IG sea **"Business" o "Creator"** y esté vinculada a una página de FB.

1. En el scenario, después del webhook agrega un **Router** (`+` → Flow Control → Router).
2. Una rama hacia Facebook Pages (ya existe).
3. Otra rama nueva: **Instagram for Business** → "Create a Post".
4. **Filter** en la rama de IG:
   - Field: `1. channels`
   - Condition: `Array operators → Contains`
   - Value: `instagram`
5. **Filter** en la rama de FB:
   - Igual pero value: `facebook`
6. **Image URL**: mappea `1. imageUrl` (IG **requiere** imagen — no acepta solo texto).
7. **Caption**: mappea `1. text`.

---

## Paso 5 — (Opcional) Agregar X / Twitter

X (Twitter) requiere su propia API key paga ahora. Skip si no tienes una.
Si tienes: agrega "Twitter Ads" → "Create a Tweet" en otra rama del router.

---

## Paso 6 — Activar el scenario

1. Click el switch **OFF/ON** abajo a la izquierda → ponlo en **ON**.
2. En "Scheduling": elige **"On Demand"** (solo se ejecuta cuando llega webhook).
3. Save.

¡Listo! Ahora cada vez que en admin de Momentum Ascent uses el botón 📘 azul:
- El backend manda payload al webhook de Make
- Make lo recibe y según los filters publica en FB, IG, o ambos
- Cada operación cuenta como 1-2 ops del free tier

---

## Estructura del payload que llega a Make

```json
{
  "channel": "facebook",
  "channels": ["facebook", "instagram"],
  "text": "⚾ PICK GRATIS — MLB ...",
  "imageUrl": "https://i.ibb.co/...",
  "scheduledAt": null,
  "meta": {
    "pickId": 123,
    "kind": "free_pick",
    "league": "MLB",
    "market": "moneyline",
    "confidence": 70,
    "isPremium": false,
    "topRank": 1,
    "homeTeam": "Dodgers",
    "awayTeam": "Giants"
  }
}
```

Puedes filtrar por cualquier campo de `meta` para crear lógica condicional
(ej: solo publicar premium teasers a una página distinta).

---

## Endpoints del backend

| Endpoint | Uso |
|---|---|
| `GET /api/admin/social/status` | Ver si MAKE_WEBHOOK_URL está configurada |
| `GET /api/admin/social/preview/:pickId?kind=auto\|free_pick\|premium_teaser` | Preview del texto sin enviar |
| `POST /api/admin/social/publish` | Mandar al webhook (`{pickId, channels, kind, customText?, imageUrl?, scheduledAt?}`) |
| `POST /api/admin/social/test` | Test ping al webhook |

Todos requieren `requireAdmin` (god-token o admin email).

---

## Env vars

```
MAKE_WEBHOOK_URL  = https://hook.us2.make.com/xxxxxxxxxx  # OBLIGATORIA
MAKE_WEBHOOK_AUTH = opcional_token_extra                  # opcional, se manda en x-make-auth
PUBLIC_APP_URL    = https://app.momentumascent.com        # usada en textos
```

---

## Cuánto consume tu free tier

| Setup | Ops por post | Posts máx/mes |
|---|---|---|
| Solo FB | 2 | 500 |
| FB + IG (router con filter) | 4 | 250 |
| FB + IG + X | 5-6 | 166-200 |

Tu volumen actual (~4 posts/día = 120/mes) consume:
- Solo FB: 240 ops = 24% del free
- FB + IG: 480 ops = 48% del free

Bastante margen.

---

## Troubleshooting

**Test webhook → 404 not found**
- URL mal copiada o scenario aún OFF. Asegúrate que el switch está en ON.

**Test ok pero FB no publica**
- Verifica que la conexión de FB Pages en Make sigue válida (a veces caduca).
- En el run de Make, mira si el módulo de FB muestra error 200 vs 4xx.

**Image no se ve en IG**
- IG requiere imagen JPG/PNG pública. Si imageUrl es una URL de imgbb verifica que sea `i.ibb.co/...` directo y no la página intermedia.

**Llega a Make pero el text está vacío**
- Mira el run de Make: el bundle 1 debe tener el campo `text`. Si está vacío significa que el customText era null y el preview no se generó.

---

## Próximos pasos (opcionales)

1. **Auto-disparo al publicar pick**: que cuando se publica un pick desde admin, automáticamente se mande al webhook (sin click manual del botón 📘). Lo dejé desactivado por seguridad — pídeme cuando lo quieras.
2. **Programación inteligente**: usar `scheduledAt` para que un solo run publique posts a lo largo del día (7am free, 1pm free, 8pm premium teaser).
3. **Cross-post a Telegram**: agregar un módulo de Telegram en el mismo scenario para que el webhook también dispare ahí (ahorra el script Python).
