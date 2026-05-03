# MOMENTUM ASCENT

Base APK (Capacitor) + backend local para soportar la app web en `www/`, ahora adaptada como MVP de picks deportivos con IA.

## 1) Instalar dependencias

```powershell
npm.cmd install
```

## 2) Configurar backend PostgreSQL

1. Copia `.env.example` a `.env` (o define variables de entorno en tu sistema).
2. Ajusta `DATABASE_URL` a tu instancia Postgres.

Variables:

- `DB_CLIENT=postgres` (default)
- `DATABASE_URL=postgres://user:pass@host:5432/dbname`
- `PGSSL=false`
- `PORT=8787`

Las tablas se crean automáticamente al arrancar backend.
También tienes el esquema manual en `backend/sql/schema.postgres.sql`.

## 3) Levantar backend (puerto 8787)

Postgres:

```powershell
npm.cmd run backend
```

Modo desarrollo:

```powershell
npm.cmd run backend:dev
```

Fallback/local rápido con SQLite:

```powershell
npm.cmd run backend:sqlite
```

## 4) Flujo Capacitor Android

Crear proyecto Android (una sola vez):

```powershell
npx cap add android
```

Copiar cambios web al contenedor nativo:

```powershell
npx cap copy
```

Abrir Android Studio:

```powershell
npx cap open android
```

## Variables nuevas del MVP sports

- `SPORTS_API_PROVIDER=mock|api-football|the-odds-api`
- `SPORTS_API_KEY=...`
- `SPORTS_API_BASE_URL=https://...`
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-4o-mini`

Si no configuras API deportiva, el backend usa eventos mock realistas para desarrollo local.

## Endpoints implementados

- `GET /health`
- `POST /auth/login`
- `GET /users?search=...`
- `GET /feed/:userId`
- `GET /metrics/:userId`
- `POST /admin/routines`
- `POST /admin/nutrition`
- `POST /admin/assignments`
- `POST /checkins`
- `GET /mindset/daily`
- `GET /ranking/weekly`
- `GET /api/sports/events/today`
- `POST /api/sports/sync`
- `GET /api/sports/sync/logs`
- `POST /api/picks/generate/:eventId`
- `GET /api/picks/today`
- `GET /api/picks/history`
