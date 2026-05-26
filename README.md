# MediTrack

## Innehåll

- [Vad är det här?](#vad-är-det-här)
- [Arkitekturval (motivera dina val)](#arkitekturval-motivera-dina-val)
- [Snabbstart med Docker Compose](#snabbstart-med-docker-compose)
- [Demo-konton](#demo-konton)
- [Lokal utveckling utan Docker](#lokal-utveckling-utan-docker)
- [Tester](#tester)
- [Appens delar](#appens-delar)
- [Mobil-först](#mobil-först)
- [Kända luckor](#kända-luckor)
- [Med mer tid](#med-mer-tid)
- [Vad ligger var?](#vad-ligger-var)
- [AI-Categorization](#ai-categorization)

---

## Vad är det här?

Internt webbverktyg på svenska för **vårdenheter** att hantera läkemedelslager och beställningar. Sjuksköterskor, apotekare och administratörer ser aktuellt lagersaldo, lägger flerradsbeställningar och följer status `Utkast → Skickad → Bekräftad → Levererad`, med varning vid under-tröskel. Ersätter dagens felbenägna listor och e-postbeställningar.

Levereras som Medovias case för mid-level fullstack-intervjun (en veckas tidsbudget).

## Arkitekturval (motivera dina val)

Varje teknikval i en skanbar tabell — varför, alternativ, följdeffekt. Tre beslutsområden som direkt svarar på §6 djupas efter tabellen.

| Val | Alternativ övervägda | Varför vi valde så | Följdeffekt |
|-----|----------------------|--------------------|-------------|
| **Frontend** — TS + React | Vue 3 + TS, Svelte+Kit, Next.js, Remix | Låst av användaren; matchar Medovias interna stack; React + Vite ger snabbaste utvecklingsloop på en veckas tidsbudget | shadcn/ui, TanStack Query för server-state, react-hook-form + Zod för formulär |
| **Backend** — Node.js + Fastify + TS | Express, NestJS, Go (Gin/Echo), Rails | Samma språk över FE+BE → delade Zod-kontrakt; Fastify är TS-native, snabbare än Express, plugin-arkitektur passar `@fastify/rate-limit` + `@fastify/cookie` | File-per-endpoint route-mönster; plugin-baserad request-context; auth + rate-limit + audit som plugins |
| **Database** — PostgreSQL 16 | MySQL 8, SQLite, MongoDB | Domänen är obestridligt relationell; `SELECT ... FOR UPDATE` ger ett verkligt svar på §6-frågan om två samtidiga beställningar | CUM-batch lock vid leverans; named-role split för audit; `pg_trgm` GIN-index för fritextsökning |
| **ORM** — Prisma 5 | Drizzle, Kysely, TypeORM, raw SQL | Schema-first migrationer; genererade TS-typer; `$extends` möjliggjorde audit-middleware utan att röra service-koden | Audit via `$extends`; migrationer i Git-historiken berättar datamodellens historia |
| **Server-state** — TanStack Query 5 | Redux Toolkit, SWR, Zustand, Apollo | Server-state är fundamentalt async; cache-key + invalidations + refetch-on-focus löser låg-lager-banner utan client-state-store | Query-key-konventioner; sibling-invalidations vid mutationer; `useInfiniteQuery` för audit-paginering |
| **UI-kit** — shadcn/ui + Tailwind 3 | MUI, Chakra, Mantine, Ant Design | shadcn ger kopierade komponenter (ingen runtime-dep); Tailwind ger mobil-först responsivitet i klassnamn; matchar §3.2 "responsivt UI" utan custom-CSS-budget | Slate + new-york-tema, touch-targets ≥44 px; Combobox + Sheet + Dialog + Tabs återanvänds över alla 6 sidor |
| **Tester** — Vitest 2 | Jest, Mocha + Chai, Node:test | Vite-native (delar config med apps/web); Fastify `app.inject` mot riktig Postgres ger integrationstest utan att starta en server | 17 audit-integrationstester; 7 deliver-tester inkl. `pg_locks`-bevis; 5 AI- och 3 dashboard-integrationstester |
| **Monorepo** — pnpm workspaces 9 | Nx, Turborepo, npm + Lerna, plain folders | Inga extra config-filer; `pnpm -r` räcker för parallella scripts; symlinks för `@meditrack/shared` ger typedelning utan publicering | `apps/api`, `apps/web`, `packages/shared`; root `pnpm verify` kör hela suiten |
| **Container** — Docker Compose v2 | Kubernetes, Podman Compose, Vagrant, devcontainers | Brief §3.3 nämner explicit "ett plus"; ett kommando startar postgres + api + web + seed; ingen orkestrerings-overhead för en demo | pgdata-volym; healthcheck-baserad `depends_on`; named role split via env-var-injektion |

### Postgres + row-level FOR UPDATE

Domänen är obestridligt relationell: beställningar → beställningsrader → läkemedel → audit, användare → vårdenheter. Postgres ger referensintegritet gratis via `FOREIGN KEY` och `CHECK` som en dokumentdatabas hade tvingat upp i applikationen.

Den verkliga vinsten är svaret på §6 om samtida beställningar. När en beställning levereras låses *alla* berörda läkemedel i *samma* transaktion via `SELECT ... FOR UPDATE` — en CUM-batch-låsning. Förloraren serialiseras. Beviset ligger i `apps/api/test/orders.deliver.integration.test.ts`: `pg_locks`-snapshot-testet observerar att lås faktiskt hålls under transaktionen.


### Named `meditrack_app` non-owner role

Append-only-skyddet på audit-tabellen är fysiskt enforcerat av Postgres, inte av applikationen. Två oberoende lager:

**(a)** Migration `0010_audit_events_named_app_role` skapar `meditrack_app` som non-owner och återkallar `UPDATE`, `DELETE`, `TRUNCATE` på `AuditEvent`. Applikationen kör som `meditrack_app`; normala `REVOKE`-regler gäller.

**(b)** Migration `0008_audit_events_revoke_grants` lägger en `BEFORE`-trigger som fångar OWNER-sessioner — Postgres ägare kringgår annars `GRANT`/`REVOKE`. Triggern kastar `SQLSTATE 42501` oavsett anropare.

Bägge lagren assertas i `audit.integration.test.ts`: rå `UPDATE` mot audit-rad rejectas med `permission denied`, och `git grep` assertar att applikationskoden inte ens *försöker*. Försvarsdjupet är tre lager: ESLint på commit, CI-grep på PR, Postgres på runtime. Det här är det svar jag är mest stolt över.

### Vad jag medvetet avstått från

- **Kubernetes** — Docker Compose räcker när allt körs på en server för en demo. Värt att tänka om när vi ska köra i flera regioner eller över
  tio vårdenheter samtidigt.
  - **Meddelandekö (Redis/RabbitMQ)** — Postgres egna notifieringar eller ett enkelt schemalagt jobb täcker behovet i v1. Värt att tänka om när vi
  börjar skicka mejl eller köra tunga batch-jobb.
  - **Mikrotjänster** — En sammanhållen app är enklare att testa och deploya som en enhet. Värt att dela upp först när olika delar behöver
  skalas oberoende av varandra.
  - **GraphQL-federation** — Våra REST-endpoints med typkontroll ger samma trygghet utan att vi behöver bygga och underhålla en extra gateway. Värt att tänka om när fler än tre olika klienter börjar ställa väldigt olika frågor till API:t.
  - **Realtidsuppdateringar (WebSocket/SSE)** — Vi hämtar färska data var 30:e sekund och direkt efter varje ändring, vilket räcker för det här
  flödet. Värt att tänka om om data måste vara färska inom några sekunder eller om flera användare ska kunna redigera samma sak samtidigt.
  - **E-postinfrastruktur** — En mejlleverantör, kö och mallar är mycket att underhålla för marginell nytta jämfört med en varningsbanner i appen. Värt att tänka om när notiser behöver nå användare även när de inte är inloggade.
  - **OAuth / SSO** — E-post och lösenord räcker för ett internt verktyg. Värt att tänka om när vi ska koppla ihop med BankID eller företagets inloggning.

## Snabbstart med Docker Compose

`docker compose up` är guldkommandot — postgres, api och web startar tillsammans, migrationer körs, seedningen lägger tre demo-användare, SPA:n nås på `http://localhost:5173`.

### Förkrav

- **Docker Desktop ≥ 4.x** (eller Docker Engine + Compose v2)
- Node 20 och pnpm 8+ behövs bara för lokal utveckling utanför Docker. Aktivera pnpm via Corepack vid behov: `corepack enable && corepack prepare pnpm@9.0.0 --activate`.

### Tre steg

1. Skapa `.env` i root-mappen från mallen och generera ett riktigt COOKIE_SECRET-värde:
   ```bash
   cp .env.example .env
   # Lägg in 32 slumpade bytes som COOKIE_SECRET:
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
   Klistra in resultatet bakom `COOKIE_SECRET=` i `.env`.
   
   Skapa en Anthropic API-key och lägg i .env som 'ANTHROPIC_API_KEY'

2. Starta hela stacken (första körningen drar postgres-imagen och bygger api + web — räkna med ett par minuter på kallt cache):
   ```bash
   docker compose up --build
   ```

3. Öppna `http://localhost:5173` och logga in med ett av demo-kontona nedan.

### Felsökning — `docker pull` avbryts med EOF

Om steg 2 misslyckas med `failed to copy: httpReadSeeker: failed open: ... cloudfront.docker.com ... EOF` är det Docker Desktops nätverkslager på Windows (WSL2-adaptern) som tappar TLS-strömmen från Docker Hubs CDN. Typiska orsaker: suspended/resumed laptop, VPN-klients filterdrivrutin som ligger kvar, MTU-mismatch på `vEthernet (WSL)`.

Prova i denna ordning:

1. **Starta om WSL-nätverket** (från Windows PowerShell, *inte* inifrån WSL):
   ```powershell
   wsl --shutdown
   ```
   Starta om Docker Desktop och kör `docker compose up --build` igen. Löser problemet i de flesta fall.

2. **Använd en registry-mirror** om CloudFront-rutten är fortsatt instabil. *Docker Desktop → Settings → Docker Engine*:
   ```json
   { "registry-mirrors": ["https://mirror.gcr.io"] }
   ```
   *Apply & Restart*. Compose hämtar då postgres-imagen via Googles spegel.

3. **Sänk MTU på WSL-adaptern** om EOF kommer vid samma byte varje gång. Från admin-PowerShell:
   ```powershell
   netsh interface ipv4 set subinterface "vEthernet (WSL (Hyper-V firewall))" mtu=1350 store=persistent
   ```
   Sedan `wsl --shutdown`, omstart av Docker Desktop, försök igen.

### Felsökning — `port 3000` redan upptagen

Om api-containern faller med `ports are not available ... bind: Only one usage ...` håller en annan process värd-porten. Vanligaste orsaken: en avbruten `docker compose up`. Städa och starta om:

```powershell
docker compose down
docker compose up
```

Om porten ägs av något annat, mappa om värd-porten i `docker-compose.yml` (byt `"3000:3000"` till `"3001:3000"` — api:t lyssnar fortfarande på 3000 internt).

### Återställning

För att rensa databasvolymen och börja om:
```bash
docker compose down -v && docker compose up --build
```
Seedningen är idempotent.

## Demo-konton

Tre seedade användare på samma vårdenhet, alla med samma demo-lösenord:

| E-post                       | Lösenord  | Roll          | Vårdenhet               |
|------------------------------|-----------|---------------|-------------------------|
| `apotekare@example.test`     | `demo1234`| Apotekare     | Avdelning 4, Karolinska |
| `sjukskoterska@example.test` | `demo1234`| Sjuksköterska | Avdelning 4, Karolinska |
| `admin@example.test`         | `demo1234`| Admin         | Avdelning 4, Karolinska |

Lösenorden är ett medvetet trivialt demo-värde i klartext i `apps/api/prisma/seed.ts`. I produktion skulle de genereras per användare och rotaras vid första inlogg — se [§ Kända luckor](#kända-luckor).

## Lokal utveckling utan Docker

För snabbare iteration (HMR i Vite, `tsx watch` på api:t) kan postgres ligga i Docker medan api och web kör direkt på värddatorn:

1. Starta bara postgres:
   ```bash
   docker compose up postgres -d
   ```

2. Installera beroenden:
   ```bash
   pnpm install
   ```

3. Kör migration + seed (en gång efter `down -v` eller schemaändring):
   ```bash
   pnpm --filter @meditrack/api exec prisma migrate dev
   pnpm --filter @meditrack/api exec prisma db seed
   ```

4. Starta api och web parallellt:
   ```bash
   pnpm -r --parallel dev
   ```
   - api: `http://localhost:3000`
   - web: `http://localhost:5173` (Vite dev-server med proxy)

## Tester

API-integrationssvit (Vitest + Fastify `app.inject` mot samma Postgres som dev-stacken):

```bash
pnpm --filter @meditrack/api exec vitest run
```

Täcker login, `/me`, RBAC-matris för `/api/admin/ping`, end-to-end-smoke över alla tre roller (`apps/api/test/auth.flow.smoke.test.ts`), 17 audit-integrationstester (inkl. transaktionsrollback, nästlade `$transaction`, parallella anrop, keep-alive-isolering), 4 rate-limit-tester och AI-integrationstester.

Webbkomponenter med Vitest + Testing Library:

```bash
pnpm --filter @meditrack/web exec vitest run
```

Hela sviten (lint + typecheck + test + build):

```bash
pnpm verify
```

Förväntad körtid: 5–6 minuter. Playwright-layoutverifiering ingår **inte** — den kräver en körande `docker compose up`.

## Appens delar

### Top nav

- Hem-länk på logon
- Visar användarnamn, roll, vårdenhet samt en Logga ut-knapp

### Side nav

Rollbaserade länkar till appens olika delar:

- **Sjuksköterskor** ser: Dashboard, läkemedel, beställningar, konto
- **Apotekare** ser: Dashboard, läkemedel, beställningar, sortiment, konto
- **Admin** ser: Dashboard, läkemedel, beställningar, sortiment, konto, användare, granskning

### Dashboard

Två sektioner:

#### Lågt lager-varningar

Visar läkemedel som är under deras tröskelnivå. Knappen **Beställ påfyllning** skapar en order i Utkast (under beställningar) för alla läkemedel under tröskelnivå.

#### Att göra

Visar ordrar som behöver hanteras för den relevanta användarrollen enligt följande:

- För **admin** och **apotekare** visas beställningar som behöver bekräftas och markeras som levererade
- För **sjuksköterskor** visas ordrar i utkast som behöver skickas (ej skickade ordrar)

### Läkemedel

Visar vårdenhetens läkemedel med urval från vårdenhetens sortiment.

- Sökruta för att söka på läkemedelsnamn
- Filter för klass, ATC-kod och former
- **Visa endast under tröskel** visar läkemedel vars lagersaldo är under dess angivna tröskelvärde

Klicka på ett läkemedel för att se/redigera dess information och lagersaldo baserat på roll:

- **Sjuksköterska** kan endast se läkemedlets information
- **Apotekare** och **admin** kan redigera lagersaldo, tröskel, terapeutisk klass (inklusive [§ AI-kategorisering](#ai-categorization)), samt ta bort läkemedel (tas endast bort ur vårdenhetens sortiment)

#### Lägg till läkemedel

Endast tillgänglig för apotekare och admin-roller. Lägger till läkemedel i vårdenhetens sortiment utifrån de läkemedel som finns i NPL (Nationellt produktregister för läkemedel) och EJ finns i vårdenhetens sortiment. Tanken är att en vårdenhet inte behöver hela NPL:s katalog, utan det är upp till administratör och/eller apotekare att bestämma vilket urval vårdenheten kan beställa från.

### Beställningar

Listar vårdenhetens beställningar med flikar för varje status: Utkast, Skickade, Bekräftade, Levererade och Alla. Vald flik finns i URL:en så att man kan dela en länk eller gå bakåt i webbläsaren utan att tappa läget.

- **Ny beställning** skapar ett tomt utkast och öppnar beställningssidan direkt
- **Beställ påfyllning** skapar ett utkast förfyllt med en rad per läkemedel som är under tröskel (samma genväg som på dashboarden). Inaktiverad när inget är under tröskel.

Klicka på en rad för att öppna beställningen.

#### Vem ser och gör vad

- Sjuksköterskor, apotekare och admin ser samma lista
- Endast inloggad användare på vårdenheten ser vårdenhetens beställningar
- **Ny beställning** och **Beställ påfyllning** är tillgängliga för alla roller som får skapa beställningar (sjuksköterska, apotekare, admin)

### Beställningsdetalj (en enskild beställning)

Visar beställningens rader, status och historik (vem som skapat, skickat, bekräftat, levererat och när).

Innehåll och åtgärder växlar med status:

- **Utkast** — radlistan är redigerbar. **Lägg till läkemedel** öppnar en väljare där man söker bland vårdenhetens sortiment och lägger till en eller flera rader. Kvantitet justeras med stora plus/minus-knappar (anpassade för touch). **Skicka** skickar iväg beställningen, **Kasta** tar bort utkastet efter bekräftelse.
- **Skickad / Bekräftad / Levererad** — raderna är låsta och kan inte ändras. En banner visar vad som hänt senast. Apotekare och admin ser **Bekräfta**- och **Leverera**-knappar (både högst upp och längst ned på sidan, så långa beställningar inte kräver att man scrollar tillbaka). **Leverera** öppnar en bekräftelsedialog — vid bekräftelse ökas lagersaldot för samtliga rader i en och samma transaktion.

#### Vem ser och gör vad

- **Sjuksköterska** kan skapa utkast, lägga till/ta bort rader, ändra kvantitet, skicka och kasta egna utkast
- **Apotekare** och **admin** kan dessutom bekräfta skickade beställningar och markera bekräftade som levererade

### Sortiment

Hantering av vilka läkemedel vårdenheten har att beställa från. Två flikar:

- **I sortimentet** — läkemedel som redan ingår. Markera en eller flera rader och tryck **Ta bort** för att massradera ur sortimentet (befintliga lagersaldon påverkas inte direkt — läkemedlet försvinner ur listan men datan finns kvar för historik).
- **Lägg till** — läkemedel ur NPL som ännu inte finns i sortimentet. Markera flera, tryck **Lägg till i sortimentet**, sätt en gemensam tröskelnivå (eller justera per rad) och bekräfta.

Sökruta och filter (namn, klass, ATC-kod, form) gäller båda flikarna så man kan t.ex. filtrera på en klass och massåtgärda hela urvalet på en gång.

#### Vem ser och gör vad

- Endast apotekare och admin har åtkomst till sortimentet
- Sjuksköterskor ser inte länken i menyn

### Användare

Adminens vy för att hantera konton i den egna vårdenheten. Sorterbar lista med namn, e-post, roll och skapat-datum.

- **Skapa konto** öppnar ett formulär för att lägga till en ny användare (namn, e-post, roll, lösenord)
- **Redigera** per rad uppdaterar namn, e-post eller roll
- **Ta bort** raderar kontot efter bekräftelse. Den inloggade adminens egen rad är markerad "(du)" och borttagningen är spärrad — man kan inte radera sig själv

#### Vem ser och gör vad

- Endast admin har åtkomst
- Apotekare och sjuksköterskor ser varken länken eller sidan

### Granskning

Adminens forensik-vy över allt som hänt i systemet — varje skapad, ändrad eller borttagen rad, samt inloggningsförsök. Listan är reverskronologisk och oföränderlig (ingen kan redigera eller radera poster, inte ens admin).

- Filtrera på användare, entitetstyp (läkemedel, beställning, konto, session m.m.), åtgärd eller request-id (för att hitta alla händelser som hör till samma anrop)
- Klicka på en rad för att fälla ut en diff-panel som visar fält, värde före och efter ändringen
- **Kopiera permalink** ger en URL med aktuella filter så man kan dela en specifik vy
- Listan laddar 50 rader i taget — **Läs in fler** hämtar nästa sida

#### Vem ser och gör vad

- Endast admin har åtkomst
- Loggen omfattar alla roller och alla vårdenheter (admin ser även händelser från andra vårdenheter — medvetet, så man kan utreda över hela systemet)

### Konto

Användarens egen sida. Visar namn, roll och vårdenhet, samt en **Logga ut**-knapp.

#### Vem ser och gör vad

- Alla inloggade användare ser sin egen konto-sida
- Admin ser även en **Admin ping**-knapp som verifierar att den admin-skyddade backend-rutten fungerar (diagnostik/röktest)

### Inloggning

Startsidan för utloggade besökare. E-post + lösenord; vid lyckad inloggning landar man på dashboarden.

- Skydd mot lösenordsgissning: efter för många försök från samma användare eller samma IP-adress under en minut blockeras nya försök en kort stund
- Misslyckade försök loggas i granskningsloggen (synligt för admin)


## Mobil-först 

Appen är utvecklad för att vara användbar på alla skärmstorlekar, från mobil till desktop. Detta i linje med att stressade sjuksköterskor enkelt ska kunna använda appen. Vid mer tid hade en mer genomgående UI-testning genomförts, framför allt på mobil.

## Kända luckor

- `pnpm verify` är inte wired till CI — ingen GitHub Actions-workflow finns. Push-triggered CI är naturlig nästa åtgärd men prioriterades bort till förmån för applikationsdjup.
- 43 538 NPL-läkemedel saknar `therapeuticClass` på fresh seed. Medveten avvägning: bulk-AI-klassificering kostar ~$4 per `docker compose up` och lägger 30+ sekunder på första-boot. Fältet är ifyllbart via `Hämta AI-förslag` per rad (se [§ AI Categorization](#ai-categorization)).
- `$queryRaw`-skrivvägar avlyssnas inte av audit-middleware — `$extends` sitter vid modell-metod-gränsen, inte raw SQL. Inga `$executeRaw`-skrivningar i produktionskod idag; CI-grep assertar det. En framtida raw-skrivning måste explicit in i allowlisten.
- Demo-lösenord `demo1234` är hårdkodat i seed-skriptet. Ingen per-användare rotation vid första inlogg — demo-mönster, inte produktionsmönster.
- Ingen funktionell E2E-svit: Playwright används endast för layoutverifiering. Integrationstester mot Fastify `app.inject` täcker API-ytan; UI-logik täcks av Vitest + Testing Library.

## Med mer tid

### Audit & efterlevnad

- Audit-sidan för admin kunde ha varit tydligare. En tydlig event logg med vem som gjorde vad, när, och hur state var före och efter ändringen.

### AI & klassificering

- Funktion som hämtar terapeutisk klass för alla läkemedel via AI
- En AI-chattbot som kan svara på frågor om lagersaldo, och kanske till och med skapa utkast för ordrar med en prompt som t.ex. "Vi behöver fylla upp lagersaldo på alla former av Alvedon till 100 st".
- Kvaliteten på AI-klassifieringen är ej verifierad. Se den mer som ett proof of concept än en sann klassning.

### Drift & skalning

- CI/CD-pipelines i GitHub

### UX-polish

- Djupare UX-tester för varje sida, knapp osv.

### Säkerhet

- Per-användare lösenordsrotation vid första inlogg
- Produktion secrets management — Docker secrets, HashiCorp Vault eller AWS Secrets Manager i stället för `env_file`.
- Per-användare rate-limit på AI-endpointen
- MFA/2-faktorsautentisering

### Läkemedel

- Varje läkemedel bör ha ett varunummer som ett säkrare sätt att urskilja de olika produkterna
- Ta bort dubbletter från NPL-listan

### README

- Denna README blev tyvärr en eftertanke då jag var så inne i projektet. AI uppdaterade readmen under projektets gång, och jag insåg för sen att den var alldeles för lång.

### Vad är du mest stolt över?

Att jag fick ihop en fungerande app i relativt gott skick för att vara en prototyp. Jag är nöjd med att UX möter kraven för stressade sjuksköterskor och att appen är allmänt lätt att använda

### Vad är du minst stolt över?

Att jag inte hann med mer, se sektionen [Med mer tid](#med-mer-tid). Jag valde att använda GSD (get shit done), en AI-plugin med verktyg för att skapa en rigid plan och genomföra den. Detta ledde till robust men väldigt långsam utveckling.



## Vad ligger var?

| Sökväg              | Innehåll                                                          |
|---------------------|-------------------------------------------------------------------|
| `apps/web`          | React + Vite + Tailwind + shadcn (SPA)                            |
| `apps/api`          | Fastify + Prisma (Node.js + TypeScript)                           |
| `packages/shared`   | Zod-kontrakt och konstanter delade mellan klient och server       |
| `docs/screenshots`  | Mobil-först layoutverifiering (360 px-skärmdumpar)                |


### AI-Categorization

LLM-stödd `Hämta AI-förslag`-knapp i `/lakemedel`-Sheeten. Knappen anropar Anthropic Claude Haiku 4.5 med läkemedlets namn + ATC-kod och tar emot `{therapeuticClass, confidence}` begränsat till WHO ATC-nivå-1-enumen. Användaren accepterar (ett klick) eller åsidosätter via `Slutgiltig klass`-comboboxen.


#### Hur förslaget fungerar

Flödet lever bakom ett enda service-fil-seam i `apps/api/src/services/aiCategorization.service.ts` — den ENDA filen i `apps/api/src/` som importerar `@anthropic-ai/sdk`. Byte av providers eller mock i tester är en ändring i en fil.

End-to-end:

1. Användare öppnar `Lägg till läkemedel` (eller redigerar rad), fyller `Namn` + `ATC-kod`, klickar **Hämta AI-förslag**.
2. FE postar `{name, atcCode}` till `POST /api/ai/suggest-therapeutic-class`.
3. Routen kontrollerar `requirePermission('ai:suggest')` — apotekare + admin (sjuksköterska får 403).
4. Servicen anropar Anthropic Messages API med `claude-haiku-4-5`, en `tool_use`-begränsning som tvingar ett av de 14 enum-värdena, och en 5s `AbortController`.
5. `tool_use.input` (validerat av `llmToolUseSchema`) returnerar `{therapeuticClass, confidence: number 0..1}`. Servicen bucket:ar float:en till ett band (`hog`/`medel`/`lag`) och returnerar wire-formen.
6. FE renderar `AiSuggestionChip` (`Förslag: <svenska label>`) + `ConfidenceBadge` (`Hög/Medel/Låg säkerhet`).
7. Användare klickar **Använd förslag** för att kopiera till `Slutgiltig klass`, ELLER väljer annan enum-bucket för override. Chipen förblir synlig så att accept-vs-override är granskningsbart.
8. Vid sparning flödar `Medication.therapeuticClass`-skrivningen genom audit-mellanhanden — diff-panelen visar `therapeuticClass: null → <vald>` (fri integration; allowlist:en landar kolumnen automatiskt).

#### Tillförlitlighetsband-semantik

LLM returnerar `0..1`-float per sitt `tool_use`-schema. Servicen bucket:ar server-side:

- `>= 0.85` → `hog` (`Hög säkerhet`, green-100 / TrendingUp)
- `>= 0.6`  → `medel` (`Medel säkerhet`, yellow-100 / Minus)
- `< 0.6`   → `lag` (`Låg säkerhet`, slate-100 / TrendingDown)

Bara bandet levereras i `aiSuggestionResponse.confidence`. Motivering: en LLM som säger "92 %" är teater, inte mätning. Bandet är hederlighets-signalen — UI låtsas inte veta mer än det kan försvara. Mappningen enhetstestades via integreringssviten.

#### Varför en sluten enum, inte fritext (omformulering av kravet)

Briefens AI-krav lyder "override with free text". Denna build omformulerar kontraktet: användaren åsidosätter genom att **välja en annan enum-bucket** från samma 14-alternativs-lista (`A` Mag–tarm och ämnesomsättning … `V` Övrigt). Det är WHO:s ATC-nivå-1-grupper, internationell klinisk standard sedan 1976.

Varför:

- **Fritext bryter filter-comboboxen.** `Lakemedel ?class=` är enkel-välj över den slutna enumen. Stavningsavdrift över "Antibiotika"/"Antibiotikum"/"Antibiotic" skulle partitionera listan och tyst dölja rader.
- **De 14 grupperna täcker långa svansen.** `V = Övrigt` är den kanoniska overflow-bucketen.
- **Defensibel domänmodellering över bokstavlig brief-tolkning.** Omformuleringen dokumenteras upp front så intervjuaren ser den avsiktliga avvikelsen.

Både förslag och override går genom samma slutna enum, så audit-loggens `Medication.update` visar bägge flöden med samma diff-form.

#### Reservstrategi när API-nyckeln saknas

`ANTHROPIC_API_KEY` är **VALFRI** i `apps/api/src/env.ts` (`z.string().optional()`). När nyckeln saknas eller är tom:

- `GET /api/ai/status` returnerar `{available: false}`.
- Villkorlig rendering i `MedicationSheet` (driven av `useAiAvailability()`) **döljer `Hämta AI-förslag`-knappen helt** — inte inaktiverad, inte gråad. Sheeten ser ut som en variant utan AI.
- `Slutgiltig klass`-comboboxen + dashboard-banner + katalog + `?class=N`-filtret fungerar oförändrade.
- `POST /api/ai/suggest-therapeutic-class` returnerar `503 ai_unavailable` med kanoniskt envelope, täcker raset mellan tillgänglighets-check och klick.

`docker compose up` på fresh clone bevarar graceful degradation: api-containern startar utan nyckeln, AI-affordansen dyker inte upp.

#### Latensbudget

Mål **p95 ≤ 3s**, hård timeout **5s** via `AbortController` i `suggestTherapeuticClass`. Vid överskridning kastar servicen `AiTimeoutError`, errorHandler mappar till **504 `ai_timeout`**, FE toastar `AI-förslaget tog för lång tid — försök igen.`

5s-timeout:en är åsidosättbar via `env.AI_TIMEOUT_MS` strikt för Vitest — test i `aiCategorization.integration.test.ts` sätter den till `50` (via `vi.hoisted` före modul-laddning), driver SDK-mock:en att returnera ett Promise som bara löser sig vid `signal.abort`. `AbortController` avfyras på ~50ms vägg-tid, testet assertar 504-envelope. Produktion läser aldrig åsidosättningen.
