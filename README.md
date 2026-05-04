# Momentum Ascent

MVP de picks deportivos con IA construido sobre el proyecto existente, reutilizando auth, backend Express, SQLite/Postgres, Render y frontend en `www/`.

## Instalacion

```powershell
npm.cmd install
```

## Variables de entorno

Copia `.env.example` a `.env`.

Claves principales:

- `DB_CLIENT=postgres|sqlite`
- `DATABASE_URL=postgres://user:pass@host:5432/dbname`
- `PGSSL=false`
- `PORT=8787`
- `ADMIN_EMAILS=admin@momentumascent.com`
- `ADMIN_PASSWORDS=admin@momentumascent.com:ChangeMe123`
- `OPENAI_API_KEY=`
- `OPENAI_MODEL=gpt-4o-mini`
- `SPORTS_API_PROVIDER=mock|api-football|the-odds-api`
- `SPORTS_API_KEY=`
- `SPORTS_API_BASE_URL=`
- `ENABLE_LEGACY_MODULES=false`

Si no configuras API deportiva, el backend usa datos mock realistas para desarrollo local.
Si configuras `SPORTS_API_PROVIDER` y `SPORTS_API_KEY`, el backend puede usar URL por defecto sin necesidad de definir `SPORTS_API_BASE_URL`:

- `api-football` -> `https://v3.football.api-sports.io`
- `the-odds-api` -> `https://api.the-odds-api.com/v4`

Los modulos legacy quedan desactivados por defecto.

## Correr local

Postgres:

```powershell
npm.cmd start
```

Modo desarrollo:

```powershell
npm.cmd run backend:dev
```

SQLite local:

```powershell
npm.cmd run backend:sqlite
```

## Flujo del MVP

1. API deportiva o mock obtiene eventos del día.
2. Los eventos y stats se guardan en base de datos.
3. La IA genera picks bajo demanda.
4. Los picks se guardan para reutilización y contexto histórico.
5. El frontend muestra picks del día, análisis e historial.

## Endpoints sports

- `GET /health`
- `POST /auth/login`
- `GET /api/sports/events/today`
- `POST /api/sports/sync`
- `GET /api/sports/sync/logs`
- `POST /api/picks/generate/:eventId`
- `GET /api/picks/today`
- `GET /api/picks/history`

## Nota

La plataforma presenta contenido informativo. No garantiza ganancias. Apuesta con responsabilidad.
