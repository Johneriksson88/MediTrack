# MediTrack

## Vad är det här?

Internt webbverktyg på svenska för **vårdenheter** att hantera läkemedelslager
och beställningar — sjuksköterskor, apotekare och administratörer ser aktuellt
lagersaldo, lägger flerradsbeställningar och följer status `Utkast → Skickad
→ Bekräftad → Levererad`, med varning när ett läkemedel går under sin
tröskel. Ersätter dagens felbenägna listor och e-postbeställningar.

Levereras som Medovias case för senior-fullstack-intervjun (en veckas
tidsbudget).

## Snabbstart med Docker Compose

`docker compose up` är guldkommandot — postgres, api och web startar
tillsammans, migrationerna körs, seedningen lägger upp tre demo-användare och
SPA:n nås på `http://localhost:5173`.

### Förkrav

- **Docker Desktop ≥ 4.x** (eller Docker Engine + Compose v2)
- Node 20 och pnpm 8+ behövs bara för lokal utveckling utanför Docker
  (se nedan). Aktivera pnpm via Corepack vid behov:
  `corepack enable && corepack prepare pnpm@9.0.0 --activate`.

### Tre steg

1. Skapa `.env` från mallen och generera ett riktigt cookie-hemligt värde:
   ```bash
   cp .env.example .env
   # Lägg in 32 slumpade bytes som COOKIE_SECRET:
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
   Klistra in resultatet bakom `COOKIE_SECRET=` i `.env`.

2. Starta hela stacken (första körningen drar postgres-imagen och bygger
   api + web — räkna med ett par minuter på kallt cache):
   ```bash
   docker compose up --build
   ```

3. Öppna `http://localhost:5173` i webbläsaren och logga in med ett av
   demo-kontona nedan.

### Återställning

För att rensa databasvolymen och börja om från start:
```bash
docker compose down -v && docker compose up --build
```
Seedningen är idempotent — du kan köra `docker compose up` om och om igen
utan att antalet användare växer.

## Demo-konton

Tre seedade användare på samma vårdenhet, alla med samma demo-lösenord:

| E-post                       | Lösenord  | Roll          | Vårdenhet               |
|------------------------------|-----------|---------------|-------------------------|
| `apotekare@example.test`     | `demo1234`| Apotekare     | Avdelning 4, Karolinska |
| `sjukskoterska@example.test` | `demo1234`| Sjuksköterska | Avdelning 4, Karolinska |
| `admin@example.test`         | `demo1234`| Admin         | Avdelning 4, Karolinska |

Lösenorden är ett medvetet trivialt demo-värde och finns i klartext i
seed-skriptet (`apps/api/prisma/seed.ts`). I en skarp miljö skulle de
genereras per användare och rotaras vid första inlogg — det är inte
inom ramen för Phase 1.

## Lokal utveckling utan Docker

För snabbare iteration (HMR i Vite, `tsx watch` på api:t) kan postgres
ligga i Docker medan api och web kör direkt på värddatorn:

1. Starta bara postgres-tjänsten:
   ```bash
   docker compose up postgres -d
   ```

2. Installera beroenden vid första körningen:
   ```bash
   pnpm install
   ```

3. Kör initial migration + seed (en gång efter `down -v` eller schemaändring):
   ```bash
   pnpm --filter @meditrack/api exec prisma migrate dev
   pnpm --filter @meditrack/api exec prisma db seed
   ```

4. Starta api och web i parallell (alternativt i två terminaler):
   ```bash
   pnpm -r --parallel dev
   ```
   - api lyssnar på `http://localhost:3000`
   - web kör Vite dev-server på `http://localhost:5173` med proxy till api

## Tester

API:t har en integrations-smoke-svit (Vitest + Fastify `app.inject` mot
samma Postgres som dev-stacken):

```bash
pnpm --filter @meditrack/api exec vitest run
```

Suiten täcker login (AUTH-01), `/me`-rundturen (AUTH-02), RBAC-matrisen
för `/api/admin/ping` (AUTH-05/06) och en end-to-end-smoke som loggar
in som var och en av de tre demo-rollerna och kör hela
`login → /me → /admin/ping → logout`-pipelinen
(`apps/api/test/auth.flow.smoke.test.ts` — Phase 1 success-kriterium #4).

## Status

Phase 1 — Foundation & Auth — är klar. Phases 2–7 är planerade men inte
implementerade ännu. Se `.planning/ROADMAP.md` för fasplanen och
`.planning/REQUIREMENTS.md` för alla 38 v1-requirements med spårbarhet.

Phase 7 kommer utöka denna README med det fulla brief-kravet:
arkitektur-motivering, svaren på §6 (samtidighet, skalning, retrofitting
av auth), och "kända luckor + vad jag skulle göra med mer tid".

## Vad ligger var?

| Sökväg              | Innehåll                                                          |
|---------------------|-------------------------------------------------------------------|
| `apps/web`          | React + Vite + Tailwind + shadcn (SPA)                            |
| `apps/api`          | Fastify + Prisma (Node.js + TypeScript)                           |
| `packages/shared`   | Zod-kontrakt och konstanter delade mellan klient och server       |
| `.planning`         | Planeringsartefakter (PROJECT, REQUIREMENTS, ROADMAP, fas-planer) |
| `local`             | Lokala filer (brief-PDF m.m.); committas inte                     |
