# MediTrack

## Innehåll

- [Vad är det här?](#vad-är-det-här)
- [Arkitekturval (motivera dina val)](#arkitekturval-motivera-dina-val)
- [Snabbstart med Docker Compose](#snabbstart-med-docker-compose)
- [Demo-konton](#demo-konton)
- [Demo-rundtur (5 minuter)](#demo-rundtur-5-minuter)
- [Lokal utveckling utan Docker](#lokal-utveckling-utan-docker)
- [Tester](#tester)
- [Mobil-först verifiering](#mobil-först-verifiering)
- [Kända luckor](#kända-luckor)
- [Med mer tid](#med-mer-tid)
- [§6-svar (intervjudiskussion)](#6-svar-intervjudiskussion)
- [Vad ligger var?](#vad-ligger-var)

---

## Vad är det här?

Internt webbverktyg på svenska för **vårdenheter** att hantera läkemedelslager
och beställningar — sjuksköterskor, apotekare och administratörer ser aktuellt
lagersaldo, lägger flerradsbeställningar och följer status `Utkast → Skickad
→ Bekräftad → Levererad`, med varning när ett läkemedel går under sin
tröskel. Ersätter dagens felbenägna listor och e-postbeställningar.

Levereras som Medovias case för mid-level fullstack-intervjun (en veckas
tidsbudget).

## Arkitekturval (motivera dina val)

Nedan sammanfattas varje teknikval i en skanbar tabell — varför vi valde det vi
valde, vad vi övervägde, och vad valet kostade oss att välja annorlunda. Tre
beslutsområden djupas efter tabellen: de som direkt svarar på intervjufrågorna
i §6.

| Val | Alternativ övervägda | Varför vi valde så | Följdeffekt |
|-----|----------------------|--------------------|-------------|
| **Frontend** — TS + React | Vue 3 + TS, Svelte+Kit, Next.js, Remix | Låst av användaren; matchar Medovias interna stack; React + Vite ger snabbaste utvecklingsloop på en veckas tidsbudget | shadcn/ui-komponenter, TanStack Query för server-state, react-hook-form + Zod för formulärvalidering |
| **Backend** — Node.js + Fastify + TS | Express, NestJS, Go (Gin/Echo), Ruby on Rails | Samma språk över FE+BE → delade Zod-kontrakt; Fastify är TS-native, snabbare än Express, har plugin-arkitektur som matchade `@fastify/rate-limit` + `@fastify/cookie` rent | File-per-endpoint route-mönster; plugin-baserad request-context; auth + rate-limit + audit som plugins |
| **Database** — PostgreSQL 16 | MySQL 8, SQLite, MongoDB | Domänen är obestridligt relationell; `SELECT ... FOR UPDATE` ger ett verkligt svar på §6-frågan om två samtidiga beställningar | CUM-batch lock vid leverans; named-role split för audit; `pg_trgm` GIN-index för fritextsökning |
| **ORM** — Prisma 5 | Drizzle, Kysely, TypeORM, raw SQL | Schema-first migrationer; genererade TS-typer; `$extends` typed extensions möjliggjorde audit-middleware utan att röra service-koden | Audit via `$extends`; migrationer i Git-historiken berättar datamodellens historia |
| **Server-state** — TanStack Query 5 | Redux Toolkit, SWR, Zustand, Apollo | Server-state är fundamentalt async; cache-key + invalidations + refetch-on-focus löser låg-lager-banner-uppdatering utan en client-state-store | Query-key-konventioner; sibling-invalidations vid mutationer; `useInfiniteQuery` för audit-paginering |
| **UI-kit** — shadcn/ui + Tailwind CSS 3 | MUI, Chakra, Mantine, Ant Design | shadcn ger kopierade komponenter i koden (ingen runtime-dep), Tailwind ger mobil-först responsivitet i klassnamn; matchar brief-§3.2 "responsivt UI" utan en custom-CSS-budget | Slate + new-york-tema, touch-targets ≥44 px; Combobox + Sheet + Dialog + Tabs återanvänds över alla 6 sidor |
| **Tester** — Vitest 2 | Jest, Mocha + Chai, Node:test | Vite-native (delar config med apps/web); Fastify `app.inject` mot riktig Postgres ger integrationstest utan att starta en server | 17 audit-integrationstester; 7 deliver-tester inkl. `pg_locks`-bevis; 5 AI- och 3 dashboard-integrationstester |
| **Monorepo** — pnpm workspaces 9 | Nx, Turborepo, npm + Lerna, plain folders | Inga extra config-filer; `pnpm -r` räcker för parallella scripts; symlinks för `@meditrack/shared` ger typedelning utan publicering | `apps/api`, `apps/web`, `packages/shared`; root `pnpm verify` kör hela suiten på ett kommando |
| **Container** — Docker Compose v2 | Kubernetes, Podman Compose, Vagrant, devcontainers | Brief §3.3 nämner explicit "ett plus"; ett kommando (`docker compose up --build`) startar postgres + api + web + seed; ingen orkestrerings-overhead för en demo | pgdata-volym; healthcheck-baserad `depends_on`; named role split via env-var-injektion |

### Postgres + row-level FOR UPDATE

Domänen är obestridligt relationell: beställningar kopplar till beställningsrader
som kopplar till läkemedel och audit-händelser, och användare kopplar till
vårdenheter. En dokumentdatabas eller SQLite hade krävt applikationslagret att
upprätthålla referensintegritet som Postgres ger gratis via `FOREIGN KEY` och
`CHECK`-begränsningar.

Den verkliga vinsten är svaret på §6-frågan om samtida beställningar. När en
beställning levereras låser systemet *alla* berörda läkemedel i *samma*
transaktion via `SELECT ... FOR UPDATE` — en CUM-batch-låsning.
Förloraren vid kapplöpning serialiseras och väntar; den återupptas inte förrän
låset frigörs. Beviset ligger i `apps/api/test/orders.deliver.integration.test.ts`:
`pg_locks`-snapshot-testet observerar att lås faktiskt hålls under transaktionen,
inte att koden *hoppas* på att de hålls.

Postgres lägger till operationell kostnad jämfört med SQLite — men svaret på
§6 + multi-tenant-scoping av alla resurser via `careUnitId` motiverar den
kostnaden.

### Prisma $extends typed extensions

Audit-loggningen är den direkta demonstrationen av svaret på §6-frågan om att
eftermontera autentisering. Den lades till *utan att röra en enda service-fil
från beställnings-, lager- eller läkemedelsflödet*. Mönstret är Prisma:s
`$extends({ query: ... })` — en middleware som interceptar anrop på modellnivå
för de sex granskade modellerna (`Medication`, `CareUnitMedication`,
`Order`, `OrderLine`, `User`, `Session`). Service-koden är omedveten om
att mellanhanden finns.

Samma mönster bär per-rad-auktorisering: ett `$extends` på `findMany` kan
injicera en `where: { careUnitId }`-klausul utan att tjänstekoden vet om det.
Vi har redan gjort eftermonteringen en gång i det här repot — för audit. Filen
`apps/api/src/db/auditExtension.ts` är mönstret.

Den ärliga begränsningen (§6 "minst stolt över"): `$extends`-mellanhanden ser
inte `$queryRaw`-skrivningar. Idag finns inga `$executeRaw`-skrivningar i
produktionskoden, och `audit.integration.test.ts` assertar det vid varje
körning via ett `git grep`. Begränsningen är dokumenterad, inte dold.

### Named `meditrack_app` non-owner role

Append-only-skyddet på audit-tabellen är fysiskt enforcerat av Postgres, inte
av applikationen. Två oberoende lager verkar samtidigt:

**(a)** Migration `0010_audit_events_named_app_role` skapar rollen `meditrack_app`
som en non-owner och återkallar `UPDATE`, `DELETE` och `TRUNCATE` på
`AuditEvent`. Applikationen kör som `meditrack_app`; normala `REVOKE`-regler
gäller.

**(b)** Migration `0008_audit_events_revoke_grants` lägger till en `BEFORE`-trigger
som fångar OWNER-sessioner — Postgres ägare kringgår annars `GRANT`/`REVOKE`
och kan skriva direkt. Triggern kastar `SQLSTATE 42501` oavsett vem som
anropar.

Bägge lager assertas i `audit.integration.test.ts`: en rå `UPDATE` mot
en riktig audit-rad rejectas med `permission denied`, och en `git grep` assertar
att ingen applikationskod ens *försöker* — noll träffar på de förbjudna
mönstren. Försvarsdjupet är tre lager: ESLint på commit, CI-grep på PR,
Postgres på runtime.

Det är det svar jag är mest stolt över.

### Vad vi medvetet avstått från

- **Kubernetes** — Docker Compose räcker för en demo + en vårdenhet; orkestrering är overhead utan multi-region eller hög trafik. Ompröva när: > 1 region eller > 10 vårdenheter parallellt.
- **Meddelandekö (Redis/RabbitMQ)** — Postgres `LISTEN/NOTIFY` eller cron räcker för v1; ingen async-fanout-pipeline behövs idag. Ompröva när: e-postnotifikationer eller batch-jobb läggs till.
- **Mikrotjänster** — En process per app räcker; en monolitisk Fastify-app testas och deployas atomiskt. Ompröva när: oberoende skalning per domän krävs (t.ex. AI-tjänst lyfter med egen autoscaling).
- **GraphQL-federation** — Zod-kontrakt + tunna REST-routes ger samma typsäkerhet utan en federations-gateway. Ompröva när: > 3 klienter konsumerar samma API och queries divergerar.
- **Real-time push (SSE/WebSocket)** — TanStack Query refetch-on-mutation + 30-sekunders polling ger färska data utan en pubsub-infrastruktur. Ompröva när: latensbudget under 5 sekunder krävs eller multi-user simultaneous editing.
- **E-postinfrastruktur** — Mailprovider + kö + mallar = för mycket yta för marginalt signalvärde mot in-app banner. Ompröva när: notifikationer ska gå utanför sessionen.
- **OAuth / SSO** — E-post + lösenord räcker för internt verktyg; OAuth lägger till infra utan att ändra demo-storyn. Ompröva när: integration mot landstingets identitetsprovider (BankID, ADFS) blir krav.

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

### Felsökning — `docker pull` avbryts med EOF

Om steg 2 misslyckas med ett fel i stil med:

```
failed to copy: httpReadSeeker: failed open: ... cloudfront.docker.com ... EOF
```

så är det inte projektet — det är Docker Desktops nätverkslager på Windows
(WSL2-adaptern) som tappar TLS-strömmen från Docker Hubs CDN mitt i en
blob-nedladdning. Typiska orsaker: en suspended/resumed laptop, en
VPN-klients filterdrivrutin som ligger kvar efter avinstallation, eller en
MTU-mismatch på `vEthernet (WSL)`-adaptern.

Prova i denna ordning (varje steg tar under en minut):

1. **Starta om WSL-nätverket** (från Windows PowerShell, *inte* inifrån WSL):
   ```powershell
   wsl --shutdown
   ```
   Starta sedan om Docker Desktop från systemfältet och kör
   `docker compose up --build` igen. Löser problemet i de flesta fall.

2. **Använd en registry-mirror** om CloudFront-rutten fortsätter vara
   instabil. Öppna *Docker Desktop → Settings → Docker Engine* och lägg
   till:
   ```json
   { "registry-mirrors": ["https://mirror.gcr.io"] }
   ```
   *Apply & Restart* och försök igen — Compose hämtar då postgres-imagen
   via Googles spegel i stället för cloudfront.docker.com.

3. **Sänk MTU på WSL-adaptern** om EOF kommer vid samma byte varje gång
   (klassisk fragmentering). Från admin-PowerShell:
   ```powershell
   netsh interface ipv4 set subinterface "vEthernet (WSL (Hyper-V firewall))" mtu=1350 store=persistent
   ```
   Namnet på subinterfacet visas av `netsh interface ipv4 show subinterface`.
   Sedan `wsl --shutdown`, omstart av Docker Desktop, försök igen.

### Felsökning — `port 3000` redan upptagen

Om api-containern faller vid uppstart med:

```
ports are not available ... listen tcp 0.0.0.0:3000: bind: Only one usage ...
```

så håller en annan process värd-porten. Vanligaste orsaken är en tidigare
`docker compose up` som avbröts med Ctrl+C och lämnade containern kvar.
Städa och starta om:

```powershell
docker compose down
docker compose up
```

Om porten ägs av något annat (lokal Node-server, Grafana, …) kan du
antingen stoppa det eller mappa om värd-porten i `docker-compose.yml`
(byt `"3000:3000"` till `"3001:3000"` — api:t inuti containern lyssnar
fortfarande på 3000, och web pratar med api:t via Docker-nätverket så
omkopplingen påverkar inte appen).

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
genereras per användare och rotaras vid första inlogg — se
[§ Kända luckor](#kända-luckor).

## Demo-rundtur (5 minuter)

Den här rundturen tar fem minuter och täcker varje brief-§2.1-krav i en sammanhängande demo. Förutsättning: `docker compose up` är igång och alla tre demo-användare är seedade.

1. **Logga in som sjuksköterska** — använd `sjukskoterska@example.test` / `demo1234` på `http://localhost:5173/login`. Sessionen överlever en sidomladdning. Navigera till [§ Mobil-först verifiering](#mobil-först-verifiering) ovan om du vill se inloggningen vid 360 px.

2. **Lägg en multi-radsbeställning** — på `/bestallningar/ny` (eller via `Ny beställning` från `/bestallningar`). Öppna `MedicationPickerSheet` med `Lägg till läkemedel`; välj 2–3 läkemedel; ändra kvantiteter via `QuantityStepper` (44 px touch-targets, optimistisk uppdatering med debounce). Klicka `Skicka` — statusen skiftar `Utkast → Skickad` med en bekräftelsebanner på toppen.

   *Genväg:* klicka istället `Beställ påfyllning` (på `/dashboard`-låg-lagerkortet eller bredvid `Ny beställning`) för att skapa ett utkast som redan är förfyllt med en rad per under-tröskel-läkemedel — se [§ Beställ påfyllning](#beställ-påfyllning-bulk-restock-från-låg-lagerlistan) nedan.

3. **Försök redigera den skickade beställningen** — observera att raderna är immutable och att API:t returnerar `HTTP 409 order_locked`. Det är den atomiska compare-and-swap-preconditionen i praktiken.

4. **Logga ut och logga in som apotekare** — `apotekare@example.test` / `demo1234`. Navigera till `/bestallningar` och se den nyss skickade beställningen i tabben `Skickad`.

5. **Bekräfta och leverera beställningen** — klicka in på beställningen, tryck `Bekräfta` (status `Skickad → Bekräftad`), sedan `Leverera` som öppnar `DeliverConfirmDialog`. Bekräfta i dialogen — statusen skiftar till `Levererad`, och samma transaktion ökar lagersaldot på alla berörda läkemedel via CUM-batch-låsning. `OrderActorTrail` visar vem som gjort vilken transition och när. Bägge knapparna (`Bekräfta beställning` och `Markera som levererad`) finns både ovanför radlistan och i sidans botten via `ApotekareActionFooter` — duplicerat för att en lång påfyllningsbeställning ska kunna bekräftas/levereras utan en scroll-till-botten.

6. **Se lagret uppdateras** — navigera till `/lakemedel` och hitta ett av de levererade läkemedlen; lagersaldot är nu inkrementerat. Navigera till `/dashboard` — `DashboardLowStockCard` visar de under-tröskel-läkemedel som fortfarande är kritiska. Om ett läkemedel precis steg över sin tröskel har det försvunnit från bannern (refetchad vid mutation-invalidation).

7. **AI-förslag på ett nytt läkemedel** — på `/lakemedel`, klicka `Lägg till läkemedel` för att öppna sheeten i create-läge; fyll i namn och ATC-kod; klicka `Hämta AI-förslag`. Servern returnerar en strukturerad rekommendation (`tool_use` mot `claude-haiku-4-5`) med konfidens-band (`Hög säkerhet` / `Medel säkerhet` / `Låg säkerhet`). Acceptera förslaget eller välj om i `Slutgiltig klass`-dropdown (override genom att välja en annan enum-bucket). Spara — `therapeuticClass` persisteras.

8. **Logga ut och logga in som admin** — `admin@example.test` / `demo1234`. Navigera till `/admin/audit`. Filtrera på "Användare = sjukskoterska@example.test" — se beställningsraden som skapades i steg 2. Klicka in på den för att se `AuditDiffPanel` (Fält / Före / Efter). Klicka `Kopiera permalink` — URL:en innehåller alla filter-koordinater (men inte before/after-payload). RequestId-chip:en länkar till alla syskon-events från samma HTTP-request.

Hela rundturen täcker mandatory-omfattningen och 4/4 valda optionals; total walltime cirka 5 minuter vid normal interaktionshastighet.

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

API:t har en integrationssvit (Vitest + Fastify `app.inject` mot
samma Postgres som dev-stacken):

```bash
pnpm --filter @meditrack/api exec vitest run
```

Sviten täcker login, `/me`-rundturen, RBAC-matrisen
för `/api/admin/ping` och en end-to-end-smoke som loggar
in som var och en av de tre demo-rollerna och kör hela
`login → /me → /admin/ping → logout`-pipelinen
(`apps/api/test/auth.flow.smoke.test.ts`), 17 audit-integrationstester
(inkl. transaktionsrollback, nästlade `$transaction`, parallella anrop,
keep-alive-isolering), 4 rate-limit-tester och AI-integrationstester.

Webbappens komponenttester körs med Vitest + Testing Library:

```bash
pnpm --filter @meditrack/web exec vitest run
```

Kör hela sviten (lint + typecheck + test + build) i ett kommando:

```bash
pnpm verify
```

Förväntad körtid: ca 5–6 minuter. Kommandot kör `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` i den ordningen.

Playwright-layoutverifieringen ingår **inte** i `pnpm verify` — den kräver att `docker compose up` körs lokalt (api + web måste vara uppe). Dess dedikerade kommando och genomföranderesultat finns under [§ Mobil-först verifiering](#mobil-först-verifiering).

## Mobil-först verifiering

360 px är det breakpoint som brifen föreskriver tydligast ("mobil-först"), och
det är den vy en sjuksköterska som tar fram sin telefon under ett patientbesök
ser. Skärmdumparna nedan fångades av det automatiserade
`apps/web/scripts/captureSc04Screenshots.ts`-skriptet mot en körande
`docker compose up`-stack och verifierar att ingen vy scrollar horisontellt
(`scrollWidth ≤ innerWidth`) och att primärnavigeringen är nåbar via
`[data-test="primary-nav"]` på samtliga fyra breakpoints och alla sex primärvyer.
Den fullständiga 4-breakpointsmatrisen redovisas i verifieringstabellen nedan.

<img src="docs/screenshots/sc04-360-login.png" alt="Login vid 360 px" width="240">
<img src="docs/screenshots/sc04-360-lakemedel.png" alt="Katalog vid 360 px" width="240">
<img src="docs/screenshots/sc04-360-bestallningsskapande.png" alt="Beställningsskapande vid 360 px" width="240">
<img src="docs/screenshots/sc04-360-bestallningshistorik.png" alt="Beställningshistorik vid 360 px" width="240">
<img src="docs/screenshots/sc04-360-audit.png" alt="Audit vid 360 px" width="240">
<img src="docs/screenshots/sc04-360-dashboard.png" alt="Dashboard vid 360 px" width="240">

| Skärm | 360 px | 768 px | 1024 px | 1440 px |
|-------|--------|--------|---------|---------|
| Login | ✓ | ✓ | ✓ | ✓ |
| Katalog (`/lakemedel`) | ✓¹ | ✓ | ✓ | ✓ |
| Beställningsskapande (`/bestallningar/ny`) | ✓² | ✓ | ✓ | ✓ |
| Beställningshistorik (`/bestallningar`) | ✓³ | ✓ | ✓ | ✓ |
| Audit (`/admin/audit`) | ✓⁴ | ✓ | ✓ | ✓ |
| Dashboard (`/dashboard`) | ✓ | ✓ | ✓ | ✓ |

¹ Filterlistan scrollar horisontellt; kortlayout ersätter tabell vid `<md`.
² Multi-radsbeställning stackar vertikalt; `QuantityStepper` har 44 px touch-target.
³ Tabell växlar till `DraftsCardList` vid `<md`; status-tabs förblir nåbara.
⁴ `FilterBar`:s tre comboboxer staplar vertikalt; diff-panelen kollapsar till expanderbart accordion.

Fångstdatum: 2026-05-24.
Kör om suiten: `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts` (kräver `docker compose up` igång).
Förstegångsinstallation av Chromium: `pnpm --filter @meditrack/web exec playwright install chromium`.

## Kända luckor

- `pnpm verify` är inte wired till CI än — ingen GitHub Actions-workflow finns i repot. En `push`-triggered CI-körning är en naturlig nästa åtgärd men prioriterades bort till förmån för applikationsdjup inom vecko-budgeten (se [§ Drift & skalning](#drift--skalning)).
- 43 538 NPL-läkemedel saknar `therapeuticClass` på fresh seed. Det är en medveten avvägning: en bulk-AI-klassificering kostar ~$4 per `docker compose up` och lägger 30+ sekunder på första-boot — oacceptabelt för en demo. Fältet är ifyllbart via `Hämta AI-förslag` per rad (se [§ AI Categorization](#ai-categorization)).
- `$queryRaw`-skrivvägar avlyssnas inte av audit-middleware — `$extends`-mellanhanden sitter vid modell-metod-gränsen, inte vid raw SQL. Inga `$executeRaw`-skrivningar finns i produktionskod idag; `audit.integration.test.ts` har ett CI-grep som assertar det vid varje körning. En framtida raw-skrivning måste explicit in i allowlisten (se [§ Känd lucka — audit-gap](#känd-lucka--audit-gap)).
- Demo-lösenord `demo1234` är hårdkodat i seed-skriptet (`apps/api/prisma/seed.ts`). Ingen per-användare rotation vid första inlogg — det är ett demo-konto-mönster, inte ett produktionsmönster.
- Ingen functional E2E-svit: Playwright används endast för layoutverifiering (scrollWidth-assertion + nav-tillgänglighet per viewport) — inte för funktionella flöden. Integrationstester mot Fastify `app.inject` täcker API-ytan; UI-logik täcks av Vitest + Testing Library (se [§ Mobil-först verifiering](#mobil-först-verifiering)).

## Med mer tid

### Audit & efterlevnad

- **Retention-rensning / cold-storage** — v1 behåller audit-rader för alltid. En TTL eller arkiveringskron behöver en `SECURITY DEFINER`-funktion (med migration 0009 som förebild) som pausar `AuditEvent_no_delete`-triggern inuti en transaktion — utan att kompromissa med append-only-garantin.
- **Hash-kedjade rader för kryptografiskt append-only-bevis** — Varje rad bär `sha256(föregående_rad || denna_rad)`; manipulation av rad N ogiltigförklarar kedjan från N framåt.
- **Per-vårdenhet admin-scope-toggle** — Admin ser idag alla vårdenheter (medvetet undantag från careUnit-scope:t). v2-tillägget "scope to my vårdenhet" i FilterBar är ett WHERE-tillägg — `careUnitId`-kolumnen finns redan på varje rad.
- **"FailedLogins"-unionvy i /admin/audit** — Misslyckade inloggningar delas idag upp i två `entityType`-värden (`auth_attempt` för okänt e-post, `session` för känt-användare-fel-lösenord). En "FailedLogins"-tab som unionerar båda server-side ger den admin som utreder brute-force ett enda filter.
- **`Kopiera filterlänk` — etikettbyte** — Nuvarande label `Kopiera permalink` överdrivs; det som kopieras är en filter-URL, inte en djuplänk till det expanderade händelsekortet. v2: byta till `Kopiera filterlänk`.

### AI & klassificering

- **Bulk-AI-backfill av 43k NPL-läkemedel** — En admin-"Klassificera alla läkemedel"-funktion som batch-anropar LLM:n i en bakgrundskö med förloppsvisning. Kostnad: ~$4 i Anthropic-spend per fresh seed på `claude-haiku-4-5`-prissättning. Avregistrerades från v1 eftersom det lägger 30+ sekunder på första-boot.
- **Cachning av AI-förslag per `(name, atcCode)`** — LLM-anropet är snabbt, billigt och idempotent för den här inmatningen. En Postgres-tabell eller in-memory LRU skulle snabba upp saker till marginell kostnad.
- **Per-användare rate-limit på `POST /api/ai/suggest-therapeutic-class`** — route-filen bär en `TODO`-markör. ~30/min per session håller LLM-kostnaden i schack vid adversarial use. Idag hanteras det via `requirePermission('ai:suggest')`-grinden (apotekare + admin).
- **Allvarlighetsgradient på dashboard-banner-rader** — Rött för `< 25 % av tröskeln`, gult för `< 50 %`. Kravet är bara synlighet, men en gradient skulle hjälpa en sjuksköterska skumma bannern snabbare.

### Drift & skalning

- **CI/CD-wiring av `pnpm verify` i GitHub Actions** — Lägger till `.github/workflows/verify.yml` som kör vid `push` + `pull_request`. Avregistrerades eftersom GitHub Actions-adoption är ett eget infrastrukturbeslut (caching-strategi, runner-val, branch protection).
- **Funktionell E2E-svit med Playwright** — Det befintliga Playwright-skriptet är layout-only. En v2-funktionell svit täcker demo-rundturen som automatiserat test (login → beställning → bekräfta → leverera → audit-visning).
- **Multi-process-lastbalansering** — Den in-memory rate-limit-store (`@fastify/rate-limit`) delar inte tillstånd mellan processer. En HA-driftsättning byter till den dokumenterade Redis-store:n; applikationen är i övrigt tillståndslös och horisontalt skalbar via `careUnitId`-first service-signaturer.

### UX-polish

- **"Beställ"-CTA inuti dashboard-bannern** — Djuplänk till `/bestallningar/ny` förladdad med det låg-lager-läkemedlet. Kravet är bara synlighet, inte åtgärd.
- **Flerval på Terapeutisk klass-filtercomboboxen** — Avregistrerades som ett kliniskt arbetsflöde som inte mappar till verkliga frågor ("antibiotika OCH nervsystem").
- **Fri text-overflow-bucket ("Annat")** — Avregistrerades; den slutna WHO ATC-enumen hanterar långa svansen via `V = Övrigt`. Bevarat här om ett kliniskt gränsfall dyker upp.

### Säkerhet

- **Per-användare lösenordsrotation vid första inlogg** — Demo-värdet `demo1234` är hårdkodat i seed. En skarp miljö genererar och tvingar byte vid enroll.
- **Produktion secrets management** — Docker secrets, HashiCorp Vault eller AWS Secrets Manager i stället för `env_file`-konfiguration i docker-compose.
- **Per-användare rate-limit på AI-endpointen** — Se AI & klassificering ovan.

## §6-svar (intervjudiskussion)

De fyra brief-§6-frågorna och tre förväntade följdfrågor, var och en med en hisspitch på 2–4 meningar; djupet finns under `## Feature deep dives`.

### Hur hanterar systemet att två sjuksköterskor beställer samtidigt?

Postgres' radlås via `SELECT ... FOR UPDATE` löser kapplöpningen. När en beställning levereras tas en CUM-batch-låsning på alla berörda läkemedel i samma transaktion; samtidiga leveranser serialiseras istället för att race-a — förloraren rullas tillbaka. Eftersom audit-middleware:n skriver in i samma transaktion rullas audit-raden tillbaka med den ("audit-loggen ljuger inte"). Bevisas av `apps/api/test/orders.deliver.integration.test.ts` (`pg_locks`-snapshot) och ett rollback-test i `audit.integration.test.ts` (rollback ger noll `audit_events`-rader).

[Läs mer: §Audit log §Hur audit-hooken fungerar](#hur-audit-hooken-fungerar)

### Hur skulle du skala upp till 50 vårdenheter?

Datamodellen är multi-tenant från dag 1 — `careUnitId` på alla resurser, service-signaturer tar `careUnitId` som första argument, index på alla scope-kolumner. Admin-vyn för audit är medvetet cross-tenant (ett dokumenterat undantag); v2-tillägget "scope to my vårdenhet" är ett WHERE-tillägg eftersom kolumnen redan är där. Cursor-paginering ger O(page-size) snarare än O(skip+limit), så audit-tabellen tål storleksordningar fler rader. Inga `careUnitId`-kopplade in-memory-cachar delas mellan request — horisontell skalning är drop-in.

[Läs mer: §Audit log §Vad granskas?](#vad-granskas)

### Hur skulle du eftermontera autentisering?

Audit-loggningen är beviset: den eftermonterades utan att röra en enda service-fil i beställnings-, lager- eller läkemedelsflödet. Mönstret är Prisma:s `$extends` typed-extensions som inskjuter modellnivå-mellanhand utan att service-koden vet om det. Samma mönster bär per-rad-auktorisering — `$extends` på `findMany` injicerar en `where: { tenantId }`-klausul; service-koden påverkas inte. Den här kodbasen har redan gjort eftermonteringen en gång, för audit.

[Läs mer: §Audit log §Hur audit-hooken fungerar](#hur-audit-hooken-fungerar)

### Vad är du mest stolt över?

Append-only-skyddet på audit-tabellen är fysiskt erforderligt av Postgres, inte av applikationen. Två oberoende lager: migration `0010` skapar rollen `meditrack_app` med REVOKE på UPDATE/DELETE/TRUNCATE på `AuditEvent`, och migration `0008` lägger en BEFORE-trigger som fångar OWNER-sessioner som annars kringgår GRANT/REVOKE. Bägge lager assertas av integrationstester i `audit.integration.test.ts` (`UPDATE` rejectas med `permission denied`; `git grep` för förbjudna patterns returnerar noll). Även om en framtida bidragsgivare skriver `prisma.auditEvent.delete(...)` stoppas hen av tre lager: ESLint på commit, CI-grep på PR, Postgres på runtime.

[Läs mer: §Audit log §Lager 2 — DB-rollbehörigheter + BEFORE-trigger](#lager-2--db-rollbehörigheter--before-trigger)

### Vad är du minst stolt över?

Prisma:s `$extends`-mellanhand ser inte `$queryRaw`-skrivningar — `$executeRaw`-gränsen är blind. Idag är det skadefritt: inga `$executeRaw`-skrivningar finns i produktionskoden och en CI-grep i `audit.integration.test.ts` assertar det vid varje körning. Men det underliggande gapet finns kvar — en framtida raw-skrivning måste in i en explicit allowlist vid PR-tid, vilket synliggör arkitekturbeslutet snarare än döljer det. Ett v2-fix vore att intercepta `$executeRaw` i mellanhanden eller route alla raw-skrivningar via en service-funktion som är avlyssnad.

[Läs mer: §Audit log §§6 supporting bullets](#6-supporting-bullets)

### Vad kostar systemet att köra?

En PostgreSQL-instans och två Node-containers — ingen Redis, ingen meddelandekö, ingen SSE/WebSocket-infrastruktur. På en small DigitalOcean-droplet eller motsvarande hamnar grundkostnaden under $30/mån. AI-tilläget tillkommer endast när användaren klickar `Hämta AI-förslag`: cirka `$0.0001 per claude-haiku-4-5 tool_use`-anrop; vi har medvetet inte backfill-klassificerat de 43 538 NPL-läkemedlen vid seed eftersom kostnaden ($4 per `docker compose up`) inte motiverades på en demo. En Stockholms-vårdenhet med 100 beställningar/dag ger AI-kostnad under $1/månad.

### Hur skulle du övervaka det i produktion?

Idag har vi audit-log (säkerhets-observability) och strukturerade Fastify-loggar till stdout — det berättar exakt vem som gjorde vad och när. Produktion skulle lägga till en OpenTelemetry-collector för traces, en log-shipper till Loki eller Splunk för aggregering, och en Prometheus-exporter för per-route latens och felfrekvens. Vi har medvetet INTE byggt observability-infrastrukturen i denna byggnad eftersom den lägger till tre tjänster för marginellt signalvärde i en demo.

[Läs mer: §Audit log §Hur audit-hooken fungerar](#hur-audit-hooken-fungerar)

## Vad ligger var?

| Sökväg              | Innehåll                                                          |
|---------------------|-------------------------------------------------------------------|
| `apps/web`          | React + Vite + Tailwind + shadcn (SPA)                            |
| `apps/api`          | Fastify + Prisma (Node.js + TypeScript)                           |
| `packages/shared`   | Zod-kontrakt och konstanter delade mellan klient och server       |
| `docs/screenshots`  | Mobil-först layoutverifiering (360 px-skärmdumpar)                |

De mer detaljerade besluts- och implementationsdiskussionerna per funktionsområde
finns i `## Feature deep dives` nedan (efter avgränsaren).

---
## Feature deep dives

### Audit log

Varje lyckad mutation i MediTrack registreras i en oföränderlig
`audit_events`-tabell — läkemedels-CRUD, orderstatus-övergångar
(`Utkast → Skickad → Bekräftad → Levererad`), orderrads-ändringar,
lagerökningar/-minskningar, session-skapanden och -borttagningar,
samt misslyckade inloggningsförsök. Tabellen är **append-only — ingen
applikationskod utfärdar UPDATE, DELETE, UPDATE_MANY, DELETE_MANY eller
UPSERT mot den.** Append-only upprätthålls av två oberoende lager.

> Framtida idéer för detta område är listade under [§ Med mer tid](#med-mer-tid).

#### Lager 1 — kodfrånvaro (arkitekturellt)

Kodbasen innehåller noll anrop till `prisma.auditEvent.update`,
`updateMany`, `delete`, `deleteMany` eller `upsert`. Detta assertas
mekaniskt vid varje CI-körning av ett integrationstest i
`apps/api/test/audit.integration.test.ts` ("grep hittar noll
prisma.auditEvent.update*/delete*/upsert-anrop"), som spawnar:

```bash
git grep -nE 'prisma\.auditEvent\.(update|delete|deleteMany|updateMany|upsert)\b' apps packages
```

och assertar exit-kod 1 (inga träffar). Grep-testet är det kanoniska
acceptanskravet för "inga UPDATE- eller DELETE-kodstigar finns."

Samma mönster fångas vid PR-tid av en ESLint
`no-restricted-syntax`-regel i `.eslintrc.cjs`:

```js
selector: "MemberExpression[object.property.name='auditEvent'][property.name=/^(update|updateMany|delete|deleteMany|upsert)$/]"
message:  "audit_events is append-only. Use prisma.auditEvent.create only."
```

`pnpm lint` kör regeln över hela workspace:t. Ett röktest bekräftar att
regeln faktiskt avfyras på ett fabricerat `prisma.auditEvent.update(...)`-anrop
— inte bara frånvaro via utelämning. Tillåtna metoder: `create`, `findMany`,
`findUnique`, `findFirst`, `count`, `aggregate`, `groupBy`.

#### Lager 2 — DB-rollbehörigheter + BEFORE-trigger

Migration `0008_audit_events_revoke_grants` kör två saker:

1. `REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM CURRENT_USER`
   — standardskyddet GRANT/REVOKE, behålls som defense-in-depth så
   att en framtida runtime-roll som inte äger tabellen automatiskt
   skyddas.
2. En `BEFORE UPDATE/DELETE/TRUNCATE`-trigger som anropar en plpgsql-
   funktion som `RAISE EXCEPTION ... USING ERRCODE = '42501'`. `42501`
   är den kanoniska `SQLSTATE` bakom "permission denied for table".

Runtime-rollen är `meditrack_app` — en namngiven icke-ägar-roll vars
REVOKE på `AuditEvent` UPDATE/DELETE/TRUNCATE binder den fysiskt
(Lager 2b, migration `0010_audit_events_named_app_role`). ÄGAR-rollen
träffar BEFORE-trigger-skyddet (Lager 2a, migration 0008). Se
§ Databasroller nedan för env-var-uppdelningen.

Triggern är det bindande lagret för ägarsessioner eftersom `meditrack`-rollen
**äger** tabellen — Postgres förbigår GRANT/REVOKE-kontroller för ägare, så
REVOKE ensamt är verkningslöst för ägaranslutningar. Triggern avfyras
villkorslöst och producerar ett verbatimt "permission denied"-meddelande.
Ett integrationstest ("Postgres rejects UPDATE on audit_events") assertar
nu bägge lagren:

```ts
await expect(
  prisma.$executeRawUnsafe(`UPDATE "AuditEvent" SET action=$1 WHERE id=$2`, 'hacked', realId),
).rejects.toThrow(/permission denied/i);
```

Om en framtida kodändring försöker en UPDATE — även en som ESLint och
grep-testet missade — rejecterar Postgres den fysiskt. **Append-only
upprätthålls av Postgres GRANT:s och triggers, inte av applikationen.**

##### Två-migrations-sekvens (Migration 0008 → Migration 0010)

Append-only-skyddet landade i två migrationer:

- **Migration 0008** installerade en ägarbindande `BEFORE UPDATE OR DELETE OR TRUNCATE`-
  trigger på `AuditEvent` (Lager 2a) plus en no-op `REVOKE ... FROM CURRENT_USER`
  (`CURRENT_USER` evaluerades till tabellägaren, vilket Postgres förbigår för
  GRANT/REVOKE-kontroller).
- **Migration 0010** lägger till den NAMNGIVNA rollen `REVOKE UPDATE, DELETE, TRUNCATE ON
  "AuditEvent" FROM meditrack_app` (Lager 2b) och byter applikationens runtime
  `DATABASE_URL` till att ansluta som `meditrack_app`. Triggern i 0008 förblir aktiv och
  är fortfarande ÄGAR-sidans skydd (admin `psql`-sessioner, migrationer, seed-skript).

Migration 0008:s SQL lämnas avsiktligt omodifierad: att redigera en enda byte i en tillämpad Prisma-
migration ändrar dess SHA-256-kontrollsumma och får `prisma migrate status` att rapportera drift.
Korsreferensen mellan de två migrationerna dokumenteras i 0010:s header istället.
Se §Databasroller nedan för env-var-uppdelningen mellan de två rollerna.

#### Databasroller

Postgres-databasen har två roller:

- **`meditrack`** — ägarrollen. Används av `prisma migrate deploy` (migrationer) och
  `prisma db seed` (seed-skript). Har fullständiga behörigheter på varje tabell. Anslutningssträngen
  finns i `DIRECT_URL`.
- **`meditrack_app`** — applikationens runtime-roll. Används av api-containerns PrismaClient
  för ALLA request-hanterings-frågor. Har SELECT / INSERT / UPDATE / DELETE på varje tabell
  **UTOM** `AuditEvent`, där rollen har SELECT + INSERT bara — UPDATE / DELETE / TRUNCATE
  har explicit REVOKEats av migration 0010. Anslutningssträngen finns i `DATABASE_URL`.

Denna uppdelning är den namngivna-roll-halvan av append-only-audit-log-historien (Lager 2b).
Runtime-rollen kan fysiskt inte mutera audit-rader; ÄGAR-rollen kan tekniskt mutera dem
men träffar BEFORE-triggern installerad av migration 0008 (Lager 2a) som raiser
`permission denied`. Varje lager ensamt är tillräckligt för sin roll; de två komponerar för
defense-in-depth.

**REVOKE:t är bundet till en NAMNGIVEN roll, inte till vilken roll som råkade köra migrationen.**
En framtida driftsättning som byter till en annan roll måste medvetet återge behörigheterna,
vilket synliggör arkitekturbeslutet i stället för att av misstag relaxa det. Se
`apps/api/prisma/migrations/20260523000000_0010_audit_events_named_app_role/migration.sql`
för GRANT:s och REVOKE:t; ett integrationstest i `apps/api/test/audit.integration.test.ts`
assertar bägge lagren.

För lokal utveckling är rollösenorden hårdkodade i `docker-compose.yml`
(`meditrack` / `meditrack_app_dev`). Produktionsdriftsättningar ersätter dessa med verkliga
hemligheter via docker-compose `env_file` eller ett secret manager — utanför ramen för denna demo.

| Roll             | Används av                               | Env-var        | AuditEvent-behörigheter        |
|------------------|------------------------------------------|----------------|--------------------------------|
| `meditrack`      | migrationer, seed, admin psql-sessioner  | `DIRECT_URL`   | Fullständiga (trigger skyddar) |
| `meditrack_app`  | api PrismaClient (alla runtime-frågor)   | `DATABASE_URL` | SELECT + INSERT bara           |

#### Hur audit-hooken fungerar

En Prisma `$extends`-mellanhand (`apps/api/src/db/auditExtension.ts`)
avlyssnar `create`, `update`, `updateMany`, `delete`, `deleteMany` på
sex granskade modeller (`Medication`, `CareUnitMedication`, `Order`,
`OrderLine`, `User`, `Session`). Varje per-modell-hanterare löser upp den
aktiva Prisma-klienten genom att läsa toppen av `activeTxStackALS` — när
anroparen är inuti `prisma.$transaction(async (tx) => ...)`, håller den
stacken tx-klienten; för nakna anrop faller den tillbaka till den fångade
root-klienten från `Prisma.defineExtension`. Extensionen avlyssnar
`$transaction`-anrop vid runtime (via `patchTransactionForAudit`,
definierad i `apps/api/src/db/auditExtension.ts`, tillämpad en gång i
`apps/api/src/db/client.ts`) och anropar `withActiveTx(tx, fn)` som
pushar tx:en på `activeTxStackALS` via en ny `.run([...prev, tx], fn)`-
frame — nästlade och parallella transaktioner får varsin oberoende
ALS-frame så de aldrig kors-attributerar. Hanteraren routar sedan
BÅDA `findUnique` / `findMany` `before`-rad-förladdningar OCH den slutliga
`auditEvent.create` audit-rad-INSERT:en genom det lösta kontextet —
routing genom den fångade root-`client`en var den tidigare buggen som
fick audit-rader att överleva rollbacks. **Om mutationen rullas tillbaka,
rullas audit-raden tillbaka med den** — ett integrationstest tvingar ett
kast inuti ett `prisma.$transaction`-block och assertar noll `audit_events`-
rader för den rullback:ade entiteten ("audit-loggen ljuger inte").

Aktörsidentitet och åsidosättningar av åtgärder transporteras från Fastify:s
`onRequest`-hook till Prisma-mellanhanden via tre oberoende
`AsyncLocalStorage`-instanser i `apps/api/src/plugins/requestContext.ts`:

- **`actorALS`** — `{ actorUserId, careUnitId, requestId, requestSource, ipAddress }`.
  Seedas en gång per request i `onRequest`-hooken (3-arg Fastify-form:
  `actorALS.run(scope, () => done())`); uppdateras av `setActor()` efter
  cookie-verifiering. När store:n saknas (seed-skript, migrations-körningar),
  hoppar mellanhanden helt och hållet över audit-rad-skapande —
  `apps/api/prisma/seed.ts` körs utanför ALS-scope:t, så audit-tabellen
  börjar tom på en fresh `docker compose up`.
- **`activeTxStackALS`** — en `readonly PrismaClient[]`-stack hanterad av
  `withActiveTx(tx, fn)` / `currentActiveTx()`. Push och pop implementeras
  som oföränderliga `.run([...prev, tx], fn)`-frames snarare än att mutera
  en delad slot, så nästlade `$transaction`-anrop aldrig skriver över
  varandras tx-referens.
- **`actionOverrideALS`** — en enskild `string`-frame (eller frånvarande). Sätts av
  `withActionOverride(action, fn)` som använder
  `actionOverrideALS.run(action, async () => fn())`. Den `async` wrappern är
  kritisk: Prisma:s `PrismaPromise` är lat — utan den täcker `.run()` bara
  det synkrona `fn()`-anropet som skapar det lata Promise:t; den
  faktiska `$extends`-hanteraren avfyras senare när Promise:t `.then()`-as,
  vid vilken tidpunkt den nakna `.run()`-framen redan är borta.

Aktören hämtas **aldrig** från en request-body. Tre regressionstester
skyddar den per-concern ALS-designen: ett för nästlad `$transaction`
(yttre rullback tappar sin audit-rad medan den inre oberoende tx:en
behåller sin), ett för parallell `$transaction` med `setImmediate`-
interfoliering (varje tx auditerar till sin egen aktör, inte den andres),
och ett för parallella requests på keep-alive-anslutningar (ALS-frames
förblir isolerade över requests).

`auth.login_failed`-stigen är den enda plats där explicita `prisma.auditEvent.create`-
anrop finns (i `apps/api/src/services/auth.service.ts`) — dessa händelser
avfyras INNAN `Session.create`, så `$extends`-mellanhanden kan inte
observera dem. Två skrivningar, båda inuti failure-grenarna.

#### Varför `$extends` över `$use`?

Två Prisma-mellanhandsmekanismer existerar:

- **`$use(middleware)`** — det ursprungliga mellanhandsAPI:et. Wrappar varje Prisma-operation
  i en kedja av funktioner; en audit-mellanhand skulle avlyssna genom att registrera en `$use`-
  funktion som wrappar operationen.
- **`$extends({query: {...}})`** — det typade-extension-API:t introducerat i Prisma 4 och
  den dokumenterade vägen framåt i Prisma 5+.

Audit-extensionen använder `$extends` eftersom:
- `$extends` levererar typade extensioner per modell + per metod — `prisma.medication.create`
  och `prisma.order.update` får distinkta extensionshanterare med typsäkra arg-former. `$use`
  har en enda generisk mellanhandsfunktion med otypade args.
- `$extends` dokumenteras som det långsiktiga API:et; `$use` fasas ut (Prisma 5.0-release-
  notes namnger `$extends` som den rekommenderade ersättningen).
- Trade-off:en: `$extends` avlyssnar INTE nativt `prisma.$transaction`-callbacks (extensionens
  interceptorer avfyras på den UTÖKADE klienten; att anropa `prisma.$transaction(async (tx) => tx.x.y())`
  anropar `tx.x.y()` på den inre icke-utökade klienten). Detta gap stängs av
  runtime-`$transaction`-patchen i `auditExtension.ts:patchTransactionForAudit`, härdad
  under nästlad + parallell + keep-alive-konkurrens via per-concern ALS-instanser.

#### Vad granskas?

| Modell              | Allowlistade kolumner                                                                                                                                                       | Noteringar                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Medication          | id, nplId, name, atcCode, form, strength, source, createdAt                                                                                                                 | —                                                                                       |
| CareUnitMedication  | id, careUnitId, medicationId, currentStock, lowStockThreshold, deletedAt, createdAt, updatedAt                                                                              | Lagerändringar granskas via `stock.increment`-syskon till `order.deliver`.             |
| Order               | id, careUnitId, createdByUserId, status, submittedAt, submittedByUserId, confirmedAt, confirmedByUserId, deliveredAt, deliveredByUserId, deletedAt, createdAt, updatedAt    | Statusövergångar wrappas med `withActionOverride('order.submit'\|'confirm'\|...)`      |
| OrderLine           | id, orderId, careUnitMedicationId, quantity, createdAt, updatedAt                                                                                                           | —                                                                                       |
| User                | id, email, name, role, careUnitId, createdAt, updatedAt — **exkluderar `passwordHash`**                                                                                     | Hash visas ALDRIG i audit-rader. Assertas av ett integrationstest.                    |
| Session             | userId, careUnitId, createdAt, expiresAt, lastSeenAt — **exkluderar `id` (den råa signerade sessionstoken)**                                                               | Tvålagers läckageförebyggande — se nedan.                                              |

För Session-typade audit-rader bär `entityId`-kolumnen aktör-User.id,
**ALDRIG** den råa `Session.id`. Detta upprätthålls av
`resolveEntityId(model, row)` i `apps/api/src/db/auditAllowlist.ts`,
som returnerar `row.userId` för Session-skrivningar. Två lager stänger
sessionstoken-läckagestigen:

- `AUDIT_ALLOWLIST` exkluderar `Session.id` från `after`-JSON:en.
- `resolveEntityId` returnerar `row.userId` (INTE `row.id`) för `entityId`.

Bägge lagren assertas i locksteg av ett integrationstest
("auth.login + auth.logout entityId equals User.id, NEVER the raw Session.id").

#### Försvar-på-djupet-skydd

Tre ytterligare skydd stänger gap de två lagren ovan inte täckte:

- **`createMany` är förbjudet utanför `apps/api/prisma/seed.ts`** (ESLint
  `no-restricted-syntax`). Audit-extensionen hoppade avsiktligt över att
  avlyssna `createMany` eftersom seed var den enda kända konsumenten.
  ESLint-förbudet operationaliserar beslutet — en framtida bidragsgivare
  som lägger till ett `prisma.medication.createMany([...])`-anrop i en
  service-fil får ett PR-tid lint-fel som hänvisar dem till antingen
  (a) att dekomponera till N individuella `prisma.<model>.create({data})`-anrop
  (som ÄR avlyssnade) eller (b) att avlyssna `createMany` i extensionen.

- **`$executeRaw` / `$executeRawUnsafe` är föremål för en CI-allowlist**
  (integrationstest i `audit.integration.test.ts`). Raw-frågor förbigår
  audit-extensionen; ett CI-grep assertar att varje produktionskodsmatch
  finns i en dokumenterad allowlist. Allowlisten är för närvarande tom —
  `FOR UPDATE`-radlåset använder `$queryRaw` (LÄS-form), som inte är föremål
  för förbudet. En framtida raw-skrivning måste läggas till allowlisten
  medvetet, vilket synliggör arkitekturbeslutet vid PR-tid.

- **`audit_events.entityId` kan inte vara tom eller NULL** (migration 0011
  BEFORE INSERT-trigger). Applikationskoden stängde sentinel-tom-sträng-fallet
  genom en split-stig i `auth.service.ts` (sätter nu `entityId` till det
  försökta e-postmeddelandet för okänd-email-inloggningsfel). Triggern är
  DB-lagrets backup — en framtida kodstig som glömmer att sätta `entityId`
  träffar `SQLSTATE 23514` i stället för att skriva en meningslös rad.

#### Känd lucka — audit-gap

`prisma.$queryRaw` och `prisma.$executeRaw` avlyssnas **inte** av
`$extends`-mellanhanden. Mellanhanden sitter vid modell-metod-gränsen,
inte vid raw-SQL-gränsen.

Idag är detta harmlöst: de enda raw-frågorna i kodbasen är
`FOR UPDATE`-radlåset (en läsning, inte en mutation — den faktiska
UPDATE:en går via Prisma:s `updateMany` som ÄR granskad), och några
skrivskyddade `$queryRaw`-anrop i `medication.service.ts` (kolumn-vs-kolumn-
predikat Prisma ORM inte kan uttrycka). Inga `$executeRaw`-skrivningsanrop
finns i produktionskod — upprätthålls av CI-grep:et ovan. En framtida
raw-skrivning som behöver landa måste läggas till allowlisten med
en dokumenterad anledning, vilket synliggör audit-bypass-beslutet vid PR-tid.

**En-gångs orphan-rad-rensning (migration 0009).** Den ursprungliga
audit-extensionen hade ett fel där audit-rad-INSERT:en och
`before`-rad-förladdningarna kördes mot den fångade root-`client`-argumentet
från `Prisma.defineExtension((client) => ...)`, inte mot det aktiva
transaktionskontextet. Mutationer som rullades tillbaka lämnade orphan-audit-
rader som append-only-triggrarna vägrade att låta applikationskod radera.
Migration `0009_audit_events_purge_orphans` är en en-gångs-underhållsmigration
som inaktiverar `AuditEvent_no_delete` inuti sin egen transaktion, raderar
alla pre-migrations-rader, sedan återaktiverar triggern — allt inuti samma tx,
så audit-tabellen är aldrig bypass:bar i ett tillstånd synligt för en
konkurrerande session. Fixen till extensionen och regressionstestet
säkerställer att ingen framtida rullback producerar en orphan.

#### §6 supporting bullets

1. **Samtidighet — `pg_locks`-baserad serialisering.** `apps/api/test/orders.deliver.integration.test.ts` observerar Postgres' radlås under en konkurrerande leverans via en `pg_locks`-poll som bekräftar att Tx-B blockeras på DB-nivå; vinnaren commitar, förloraren rullas tillbaka (CUM-batch `FOR UPDATE`).

2. **Audit-loggen ljuger inte — rollback-säkerhet.** Ett test i `audit.integration.test.ts` framtvingar ett `Error` inuti `prisma.$transaction`; resultat: noll `audit_events`-rader skrivs för den rullbackade mutationen (mellanhanden routar `auditEvent.create` genom samma tx-klient).

3. **Append-only — kodfrånvaro.** Ett test i `audit.integration.test.ts` kör `git grep -nE 'prisma\.auditEvent\.(update|delete|deleteMany|updateMany|upsert)\b' apps packages`; matchar noll. ESLint-regel `no-restricted-syntax` i `.eslintrc.cjs` skär bort patterns före commit.

4. **Append-only — DB-lager.** Ett test i `audit.integration.test.ts` utför `UPDATE "AuditEvent" SET ...` via `prisma.$executeRawUnsafe`; Postgres returnerar `permission denied` med SQLSTATE `42501` från BEFORE-triggern i migration `0008_audit_events_revoke_grants` (aktiv för OWNER-sessioner) och från REVOKE i migration `0010_audit_events_named_app_role` (aktiv för `meditrack_app` runtime-sessioner).

5. **Named role split — REVOKE-skydd.** Migration `0010_audit_events_named_app_role` skapar `meditrack_app` som non-owner-roll och REVOKE:ar UPDATE/DELETE/TRUNCATE på `AuditEvent`; `DATABASE_URL` ansluter som `meditrack_app` (runtime), `DIRECT_URL` ansluter som owner (migrationer + seed).

6. **Per-concern ALS — request-context utan globals.** `actorALS`, `activeTxStackALS` och `actionOverrideALS` är tre oberoende `AsyncLocalStorage`-instanser sådda av Fastify `onRequest`-hook via `als.run(scope, () => done())` (3-arg-signaturen, NOT `enterWith` — för att undvika keep-alive-frame-läckage).

7. **Multi-tenancy — `careUnitId`-first.** Service-signaturer tar `careUnitId` som första argument överallt; admin-vyn för audit är medvetet cross-tenant (dokumenterat undantag); ett v2 "scope to my vårdenhet"-toggle är ett WHERE-tillägg — kolumnen finns redan på varje `audit_events`-rad.

8. **Cursor-paginering — O(page-size).** `GET /api/audit/events` använder base64-encodad `{createdAt, id}`-cursor med deterministisk OR-pair WHERE för same-millisecond tiebreak; `take: limit+1` detekterar `hasMore` utan COUNT; skalar till storleksordningar fler rader än offset-paginering.

9. **Eftermontering av authz — samma `$extends`-mönster.** Audit-loggningen eftermonterades utan att röra beställnings-, lager- eller läkemedels-service-filerna; samma `query: { findMany: ... }`-mellanhand kan injicera en `where: { tenantId }`-klausul för per-rad authz (`apps/api/src/db/auditExtension.ts` är mönstret).

10. **entityId backstop.** Migration `0011` BEFORE INSERT-trigger förkastar `audit_events.entityId` = '' eller NULL; `auth.ratelimit.test.ts` täcker att `auth_attempt`-events skriver attemptedEmail som `entityId`.

11. **`$queryRaw` blind-spot — CI grep guard.** Ett test i `audit.integration.test.ts` kör `git grep` efter `$executeRaw` i `apps/` och `packages/` med en allowlist; matchar noll utanför allowlisten vid varje körning — detta är den underliggande begränsningen i `$extends`-mellanhanden (§6 "minst stolt över"-svaret).

12. **Login rate-limit — bucket-isolerad.** `@fastify/rate-limit` per-(email, IP)-bucket och per-IP-bucket på `POST /api/auth/login`; `auth.ratelimit.test.ts` (4 tester: 11:e försöket ger 429, rate-limited försök skriver ingen audit-rad, per-email-bucket-isolering, legitimt första inlogg opåverkat) verifierar nested- och parallel-invariants.

#### Lärdomar

Tre processretros från audit-arbetet, var och en med en en-rads lärdom och
en sanningskälla som hade fångat problemet tidigare:

- **Läs stdlib-dokumentationen innan du introducerar ett okänt primitiv.**
  Den första iterationen valde `AsyncLocalStorage.enterWith` för
  request-context-hooken utan att konsultera Node.js-docssidan
  (https://nodejs.org/api/async_context.html). Dokumenten varnar explicit
  för att `enterWith` generellt avråds i produktionskod på grund av dess
  oförutsägbara beteende under anslutningsåteranvändning — precis det
  keep-alive-frame-läckage-hazard som senare exponerades. Slutbygget
  använder `actorALS.run(scope, () => done())` med Fastify:s 3-arg
  `onRequest`-signatur; ett regressionstest kodifierar kontraktet.
  Lärdom: när du introducerar ett okänt stdlib-primitiv, läs dess docssida
  först.

- **Föredra N oberoende stores framför en delad muterbar store det ögonblick
  det andra concernet landar.** En tidigare iteration lade `activeTx`-sloten
  som ett enda fält i den befintliga `RequestContext`-store:n (som redan bar
  `actor` + `careUnit` + `requestId`). Flera buggar (asymmetrisk clear,
  keep-alive-läckage, och en quantity-validation-klass) spårades tillbaka
  till den delade-store-designen. Slutbygget använder tre oberoende
  `AsyncLocalStorage`-instanser (`actorALS` / `activeTxStackALS` /
  `actionOverrideALS`) så varje concern har exakt den livstid den behöver.
  Hela fragilitetsklassen elimineras strukturellt. Lärdom: det ögonblick
  ett request-scope-bärare har mer än ett concern med en annan livstid,
  föredra per-concern ALS-instanser.

- **Biblioteks-type-defs är dokumentationen när dokumenten är tysta.**
  Den första iterationen spenderade ~10 minuter på att debugga "extension
  registrerad men avfyras aldrig" innan man läste Prisma-klient-runtime-type-def:en
  för att upptäcka att `$extends({query})`-nycklar är lowercase modelProps-namn
  (`'session'`, `'careUnitMedication'`), INTE PascalCase. PascalCase-nycklarna
  registrerades tyst utan runtime-matchning. Lärdom: när en extension eller
  mellanhand "registreras fine men aldrig avfyras," läs bibliotekets type-def-
  fil för registreringsbegränsningarna — det är ofta den enda dokumentationen
  för ergonomiska detaljer som nyckelstorlek.

#### Inloggnings-rate-limit

`POST /api/auth/login` är rate-limitad av `@fastify/rate-limit` med två oberoende
bucketar:

- **Per-(email, IP)-bucket**: 10 försök per minut, konfigurerbar via
  `RATE_LIMIT_LOGIN_PER_EMAIL_PER_MINUTE` (standard 10). Begränsar brute-force
  mot ett enda konto — en angripare som sprayar lösenord mot ett e-postmeddelande
  från en IP träffar gränsen efter 10 försök inom ett 60-sekunders fönster.
- **Per-IP-bucket**: 30 försök per minut över alla rate-limitade routes
  (för närvarande bara login), konfigurerbar via
  `RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE` (standard 30). Begränsar slow-scan-
  attacker som itererar över e-postmeddelanden från en käll-IP.

Rate-limitade requests returnerar HTTP 429 med det kanoniska felenveloppet
`{error: {code: 'rate_limited', message: '...'}}`. Meddelandet är på svenska och
användarvisbart ("För många inloggningsförsök. Försök igen om N sekunder.").

Rate-limitade försök skriver **INTE** en `audit.login_failed`-rad — rejectionen
sker INNAN `verifyCredentials` körs. Detta begränsar `audit_events`-radtillväxt
från en brute-force-angripare. Verkliga försök (inom bucketen) fortsätter att
skriva audit-rader som tidigare.

Rate-limit-store:n är in-memory (per-process). En multi-process- eller HA-
driftsättning byter till den dokumenterade `@fastify/rate-limit`-Redis-store:n —
utanför ramen för denna enkla-process Docker Compose-demo. Produktionsdriftsättningar
skulle också lägga till CDN-lager-rate-limitering (Cloudflare, nginx) för defense
in depth.

Integrationstester i `apps/api/test/auth.ratelimit.test.ts` täcker fyra scenarier:
11:e försöket returnerar 429, rate-limiterat försök skriver inte en audit-rad,
per-email-bucket-isolering över e-postmeddelanden från samma IP, och ett legitimt
första inloggningsförsök är opåverkat.

---

### AI Categorization

En LLM-stödd `Hämta AI-förslag`-knapp inuti
`/lakemedel`-Sheeten. Knappen anropar Anthropic Claude Haiku 4.5 med
läkemedlets namn + ATC-kod och tar emot ett `{therapeuticClass,
confidence}`-payload begränsat till WHO ATC-nivå-1 anatomiska grupp-
enumen. Användaren kan acceptera förslaget (ett klick) eller åsidosätta
det genom att välja en annan enum-bucket från `Slutgiltig klass`-comboboxen.

> Framtida idéer för detta område är listade under [§ Med mer tid](#med-mer-tid).

#### Hur förslaget fungerar

Flödet lever bakom ett enda service-fil-seam i
`apps/api/src/services/aiCategorization.service.ts` — den ENDA filen i
`apps/api/src/` som importerar `@anthropic-ai/sdk`. LLM-anropet är isolerat
bakom ett enda service-gränssnitt så att byte av providers — eller mock:ande
i tester — är en ändring i en fil.

End-to-end:

1. Användare öppnar `Lägg till läkemedel` (skapa-läge) eller redigerar en
   befintlig rad, fyller i `Namn` och `ATC-kod`, klickar på **Hämta AI-förslag**.
2. FE:n postar `{name, atcCode}` till
   `POST /api/ai/suggest-therapeutic-class`.
3. Routen kontrollerar `requirePermission('ai:suggest')` — apotekare +
   admin bara (sjuksköterska får 403).
4. Servicen anropar Anthropic Messages API med `claude-haiku-4-5`,
   en `tool_use`-begränsning som tvingar ett av de 14 giltiga enum-värdena,
   och en 5-sekunder `AbortController` (budget nedan).
5. Råa `tool_use.input` (validerat av `llmToolUseSchema`) returnerar
   `{therapeuticClass, confidence: number 0..1}`. Servicen bucket:ar
   float:en till ett diskret band (`hog`/`medel`/`lag`) och
   returnerar wire-formen `{therapeuticClass, confidence: band}`.
6. FE:n renderar `AiSuggestionChip` som visar `Förslag: <Swedish label>`
   + en `ConfidenceBadge` (`Hög säkerhet / Medel säkerhet / Låg säkerhet`).
7. Användare klickar **Använd förslag** för att kopiera förslaget till
   `Slutgiltig klass`-comboboxen, ELLER väljer en annan enum-bucket för
   att åsidosätta. Oavsett vilket förblir chipen synlig så att accept-
   kontra-override är granskningsbart för användaren.
8. Vid sparning flödar `Medication.therapeuticClass`-skrivningen genom
   audit-mellanhanden — diff-panelen visar `therapeuticClass:
   null → <vald>` (fri integration med audit-loggen; allowlist:en landar
   kolumnen automatiskt).

#### Tillförlitlighetsband-semantik

LLM:en returnerar en `0..1`-float per sitt eget `tool_use`-schema. Servicen
bucket:ar server-side:

- `>= 0.85` → `hog` (`Hög säkerhet`, green-100 / TrendingUp-ikon)
- `>= 0.6`  → `medel` (`Medel säkerhet`, yellow-100 / Minus-ikon)
- `< 0.6`   → `lag` (`Låg säkerhet`, slate-100 / TrendingDown-ikon)

Bara bandet levereras i `aiSuggestionResponse.confidence`. Motivering: en
LLM som säger "92 %" är teater, inte mätning. Bandet är hederlighets-signalen
— UI:t låtsas inte veta mer än det kan försvara. Mappningen är enhetstestades
via integreringssviten (`vi.spyOn` returnerar ett fast band och FE-chipen
renderar den matchande etiketten).

#### Varför en sluten enum, inte fritext (omformulering av kravet)

Briefens AI-krav lyder "override with free text". Denna build omformulerar
avsiktligt det kontraktet: användaren kan **åsidosätta genom att välja en
annan enum-bucket** från samma 14-alternativs-lista (`A` Mag–tarm och
ämnesomsättning … `V` Övrigt). Detta är WHO:s ATC-nivå-1 anatomiska
grupper, en internationell klinisk standard sedan 1976.

Varför omformuleringen:

- **Fritext bryter filter-comboboxen.** `Lakemedel ?class=`
  är en enkel-välj över den slutna enumen. Stavningsavdrift över
  "Antibiotika" / "Antibiotikum" / "Antibiotic" skulle partitionera
  listan och tyst dölja rader.
- **De 14 anatomiska grupperna täcker redan långa svansen.** `V = Övrigt`
  är den kanoniska overflow-bucketen. En hybrid (sluten enum + "Annat"
  fritext-overflow) övervägdes och avvisades som scope creep — ATC-standarden
  löser redan detta för kliniskt arbete.
- **Intervju-rubriken värderar defensibel domänmodellering över
  bokstavlig tolkning av briefen.** Omformuleringen dokumenteras
  upp front så att intervjuaren ser den avsiktliga avvikelsen omedelbart.

Både förslaget OCH åsidosättandet går genom samma slutna enum,
så audit-loggens `Medication.update`-händelse visar upp bägge flödena
med samma diff-form: `therapeuticClass: <före> → <efter>` där båda sidor
är giltiga enum-koder.

#### Reservstrategi när API-nyckeln saknas

`ANTHROPIC_API_KEY` är **VALFRI** i `apps/api/src/env.ts`
(`z.string().optional()`, utan `.min(1)`). När nyckeln saknas
eller är tom:

- `GET /api/ai/status` returnerar `{available: false}`.
- Den villkorliga renderingen i FE:n i `MedicationSheet` (driven av
  `useAiAvailability()`) **döljer `Hämta AI-förslag`-knappen helt** — inte
  inaktiverad, inte gråad, inte en layout-platshållare.
  Sheeten ser ut som en variant utan AI helt.
- `Slutgiltig klass`-comboboxen + dashboard-low-stock-bannern +
  läkemedelskatalogen + `?class=N`-filtret fungerar alla oförändrade. Ingen
  av dessa beror på LLM:en.
- `POST /api/ai/suggest-therapeutic-class` returnerar `503 ai_unavailable`
  med det kanoniska enveloppet, täcker raset där FE:s kontroll
  flippade mellan tillgänglighet och klicket.

Guldkommandot `docker compose up` på en fresh clone bevarar denna
graceful degradation: api-containern startar rent utan nyckeln,
och AI-affordansen dyker helt enkelt inte upp.

#### Latensbudget

Mål **p95 ≤ 3s**, hård timeout **5s** via `AbortController` inuti
`suggestTherapeuticClass`. Vid överskridning kastar servicen
`AiTimeoutError`, errorHandler-plugin:et mappar till **504 `ai_timeout`**,
och FE:n toastar `AI-förslaget tog för lång tid — försök igen.`

5s-timeout:en är åsidosättbar via `env.AI_TIMEOUT_MS` strikt för
Vitest — ett test i `apps/api/test/aiCategorization.integration.test.ts`
sätter den till `50` (via `vi.hoisted` före modul-laddning så service-
filens `const TIMEOUT_MS`-läsning plockar upp den), driver sedan SDK-lager-
mock:en att returnera ett Promise som bara löser sig vid `signal.abort`.
Den verkliga `AbortController`n avfyras på ~50ms vägg-tid och testet
assertar 504-enveloppet. Produktion läser aldrig åsidosättningen.

---

### Dashboard low-stock banner

`/dashboard` visar en banner som räknar upp varje `CareUnitMedication` i
anroparens vårdenhet vars `currentStock < lowStockThreshold` — namn,
aktuellt lager, tröskel, `LowStockBadge`, sorterat efter brådska
(`currentStock / lowStockThreshold`-kvot ASC). Den uppdateras automatiskt
utan manuell reload.

> Framtida idéer för detta område är listade under [§ Med mer tid](#med-mer-tid).

#### Uppdateringsstrategi

Tre lager, ingen SSE/WebSocket (explicit utanför ramen):

1. **TanStack-invaliderings-syskon** — `useDeliverOrder.onSuccess`
   invaliderar båda `['medications']` (befintlig) OCH `['dashboard',
   'low-stock']` (ny). Detsamma gäller `useCreateMedication`,
   `useUpdateMedication`, `useDeleteMedication` och
   `useUpdateThresholdOptimistic`. Leveranser på samma flik uppdaterar
   bannern omedelbart.
2. **`refetchOnWindowFocus: true`** på `useLowStockQuery` — Alt-tabbning
   tillbaka fångar ändringar gjorda i en annan flik eller session. Svarar
   direkt på §6 "två sjuksköterskor"-frågan för denna yta.
3. **`refetchInterval: 30_000`** — Förgrunds-polling för fallet
   där dashboard-fliken lämnas öppen under en demo. ~en GET per
   30 sekunder medan fliken är i förgrunden; TanStack pausar intervall-
   polling på dolda flikar automatiskt.

Alla tre kombineras: samma-flik-åtgärder invaliderar omedelbart, kors-flik-
åtgärder hinner ikapp vid fokus, och inaktiva dashboards uppdaterar sig
inom 30s. Kontraktet assertas av `LOW_STOCK_QUERY_OPTIONS` som en namngiven
export från `useLowStockQuery.ts` — `DashboardLowStockCard.test.tsx`
importerar konstanten och assertar bägge flaggorna, så en framtida
refaktor som tappar en av dem också måste ta bort den namngivna exporten
(testet misslyckas högt).

#### Varför en dedikerad endpoint

`GET /api/dashboard/low-stock` levererar ett fokuserat `{rows, total}`-payload
med sin egen cachenyckel `['dashboard', 'low-stock']`, distinkt från
`/lakemedel`:s `['medications', filters]`.

Motivering:

- **Cachenyckel-oberoende.** Att återanvända
  `GET /api/medications?belowThreshold=true&pageSize=100` skulle gifta
  dashboardens uppdateringsmodell med `/lakemedel`:s filtertillstånd —
  varje filterändring där skulle invalidera bannern.
- **Payload-form.** Bannern behöver inte paginering, totalt antal för
  under-filter, eller någon av `medicationListResponse`-metadata:n. En
  smalare wire-form är det korrekta kontraktet.
- **Kostnad.** ~30 rader service + route-kod som återanvänder det etablerade
  `currentStock < lowStockThreshold` `$queryRaw`-mönstret från
  `medication.service.ts:listMedicationsForUnit`. Inget nytt.

Endpointen är bara `requireSession` — alla tre roller ser
dashboarden. Scope är careUnit-first: service-signaturen är
`listLowStockForUnit(careUnitId)` och WHERE-klausulen filtrerar efter
`CareUnitMedication.careUnitId` först.

---

### Beställ påfyllning (bulk-restock från låg-lagerlistan)

`Beställ påfyllning` är en utility-affordans ovanpå standard-beställnings-
flödet: ett klick på en knapp i `DashboardLowStockCard` eller bredvid
`Ny beställning` öppnar en modal som listar alla under-tröskel-läkemedel
i vårdenheten, beräknar en föreslagen rad-kvantitet som
`max(1, lowStockThreshold − currentStock + X)` per item där X är ett
användarvalt buffert-tal (default 10), och skapar ett utkast med en rad
per markerat item. Detta är inte ett brief-§2.1-mandatkrav — det är en
optional polish som vänder en pekare som hela `/dashboard`-bannern
redan riktar mot (de under-tröskel-läkemedel som behöver beställas) till
en ett-klicks-handling.

> Framtida idéer för detta område är listade under [§ Med mer tid](#med-mer-tid).

#### Flöde

1. Knappen `Beställ påfyllning` visas i `DashboardLowStockCard`-headern
   (data-grenen) och bredvid `Ny beställning` på `/bestallningar`. På
   `/bestallningar` är knappen disabled med tooltip `Inga läkemedel under
   tröskel.` när `useLowStockQuery().data.total === 0`. Bägge platser
   `Can`-gate:as på `order:create` (samma RBAC-grind som `Ny beställning`).
2. Klick öppnar `RestockLowStockDialog` som hämtar
   `GET /api/orders/restock-preview` (preHandlers
   `[requireSession, requirePermission('order:create')]`). Endpointen
   återanvänder `listLowStockForUnit` för rader och kompletterar varje
   rad med en aggregerad `inFlightQuantity` plus en `inFlightOrders[]`
   med `{orderId, orderNumber, status, quantity}` över alla
   `utkast / skickad / bekraftad`-beställningar (alla icke-`levererad`)
   i vårdenheten. Egen cachenyckel `['orders', 'restock-preview']` —
   delar inte med `['dashboard', 'low-stock']` eftersom (a)
   dashboard-bannern har ingen permission-grind och skulle läcka
   "vad som är på väg att beställas" till roller som inte kan beställa,
   och (b) cachen invalideras på olika events.
3. Modalen partitionerar listan: items med `inFlightQuantity > 0`
   renderas FÖRST under en amber-sub-header `Redan beställda (ej
   processade)`, sedan resten under `Övriga under tröskel`. Anledning:
   när låg-lagerlistan är lång riskerar items som redan är beställda
   att gå förlorade i ruset; det här är just det fall som leder till
   dubbel-beställning och oavsiktlig överlagring. Per rad: namn,
   `Lager N / tröskel M → beställ Q st` (Q recomputeas live när X ändras),
   en checkbox (default på), och en `Redan beställd: N st i ORD-…`-chip
   när relevant (med tooltip som listar alla berörda ordernummer).
4. Användare justerar X (0..10000), bockar av items hen INTE vill ha med,
   klickar `Skapa beställning`. FE:n postar
   `{buffer, careUnitMedicationIds}` till
   `POST /api/orders/restock-low-stock` (samma permission-grind +
   `.strict()`-body som mitigation mot mass-assignment).
5. Servicen re-verifierar varje id mot vårdenhetens CUMs inuti en
   `prisma.$transaction` — items som steg över tröskel mellan preview
   och submit, eller som soft-deletades, eller som tillhör en annan
   vårdenhet (request-tampering) droppas tyst (samma mönster som
   `deliverOrder` step 5). Om alla items återhämtat sig kastas
   `422 validation_failed reason='no_items_to_restock'` istället för att
   skapa ett tomt utkast — FE:n toastar `Alla läkemedel återhämtade
   sig — inget att beställa.` och invaliderar preview-cachen.
6. Servicen mintar nästa order-nummer (samma `mintOrderNumber`-helper
   som `createDraftOrder`), skapar utkast-ordern och en
   `OrderLine` per item via individuella `tx.orderLine.create`-anrop
   (INTE `createMany`). Anledning: audit-mellanhanden fångar inte
   `createMany` — varje rad får sin egen `orderLine.create`-audit-rad
   genom att vi issuear N enstaka `create`-statements. För en typisk
   ~20-rads-påfyllning är trafiken trivial; audit-fullständigheten är inte.
7. FE:n navigerar till `/bestallningar/<id>?from=utkast` — samma
   destination som `Ny beställning`-flödet, så användaren landar på en
   fullt redigerbar utkast-sida där rader fortfarande kan justeras eller
   raderas innan submit.

#### Samtidighet (vs §6 "två sjuksköterskor")

Preview-aggregeringen är **inte** transaktionell med utkast-skapandet.
Två sjuksköterskor som klickar `Beställ påfyllning` samtidigt på samma
vårdenhet får varsin utkast; den andra sjuksköterskans modal, vid
nästa öppning, visar dock den första sjuksköterskans utkast-rader som
`Redan beställda (ej processade)` så snart `['orders', 'restock-preview']`
invaliderats (samma sibling-invalidation-mönster som låg-lager-bannern).
Detta är samma eventually-consistent posture som `dashboard.service.ts`
dokumenterar för dashboard-counts — en avsiktlig trade-off, inte en bugg.
Den autoritativa staten är fortfarande beställningens egen rad i
`/bestallningar/:id`; och `mintOrderNumber` serialiseras via samma radlås
på `OrderNumberCounter` som det vanliga create-flödet, så order-nummer-kollision
är fysiskt omöjligt även när två påfyllningar landar på samma millisekund.

#### Edge cases

- **Kvantitets-golv.** Formeln `max(1, threshold − currentStock + X)`
  garanterar att DB-CHECK-constraint:en `OrderLine_quantity_positive_check`
  aldrig kan kastas. Golvet avfyras bara när `X = 0` OCH
  `currentStock = threshold − 1` — fortfarande ett legitimt under-tröskel-
  item, fortfarande en giltig rad.
- **Alla items återhämtade sig mellan preview och confirm.**
  `422 validation_failed reason='no_items_to_restock'` istället för en
  tom utkast. Toast + preview-refetch så modalen rerendrer med den färska
  (möjligen tomma) listan.
- **CUM tillhör en annan vårdenhet (request-tampering).** Tenant-guarden
  i re-läsningen filtrerar bort den (`careUnitId = $1` + `deletedAt IS
  NULL`) — kan inte hända via legitim UI-stig, men service-laget stänger
  möjligheten ändå.
- **Buffer = 0.** Giltigt val — kvantitet blir `max(1, threshold − currentStock)`,
  vilket återställer varje item exakt till sin tröskel (eller till 1 vid
  edge-fallet ovan). Modalens label `Enheter över tröskel (X)` gör 0 till
  ett tydligt "no buffer"-val.

---

### Top-of-order action buttons (UX polish)

Knapparna `Bekräfta beställning` (Mode C, Skickad-ordrar) och
`Markera som levererad` (Mode D, Bekräftad-ordrar) i `ComposeOrderPage`
finns BÅDE ovanför radlistan OCH i sidans botten via `ApotekareActionFooter`.
Anledningen är direkt motiverad av påfyllnads-flödet: en bulk-restock-
beställning med ~20 rader betyder att en apotekare som öppnar ordern måste
scrolla förbi hela listan för att hitta bekräfta/leverera-knappen i botten —
en onödig friktion när hen redan har granskat raderna en gång under
sammanställningen. Top-knappen sitter precis under status-bannern (Mode C:s
`SubmitConfirmationBanner` eller Mode D:s "väntar på leverans"-banner) och
delar samma `useMutation`-state som bottom-knappen, så `isPending`-spinnern
synkroniseras automatiskt mellan bägge — inget tillstånd att hålla i synk.

---

### Felkodsenvelope (AI-routes)

Två AI-specifika felkoder ansluter sig till den befintliga taxonomin (alla
felsvar följer `{error: {code, message, details?}}`):

| Kod               | HTTP | Källa                             | Meddelande (svenska)                          |
|-------------------|------|-----------------------------------|-----------------------------------------------|
| `ai_unavailable`  | 503  | POST /api/ai/suggest-therapeutic-class när `env.ANTHROPIC_API_KEY` saknas/är tom | `AI-tjänsten är inte tillgänglig.` |
| `ai_timeout`      | 504  | POST /api/ai/suggest-therapeutic-class när 5s `AbortController` avfyras | `AI-förslaget tog för lång tid.` |

Bägge klasserna finns i `apps/api/src/plugins/errorHandler.ts`
(`AiUnavailableError` + `AiTimeoutError`) med grenar i `setErrorHandler`-
mappningen. FE:s `useSuggestTherapeuticClass`-hook byter på
`err.envelope.error.code` och toastar den användarvisningsbara svenska
kopian. En tredje stig — `Kunde inte hämta förslag — försök igen.` —
täcker alla övriga fel.

---

### Miljövariabler (AI-tillägg)

Det fullständiga env-kontraktet finns i `apps/api/src/env.ts` (Zod-validerat vid
start). AI-stödet lägger till en valfri nyckel:

| Variabel             | Krävs | Standard | Beskrivning |
|----------------------|-------|----------|-------------|
| `ANTHROPIC_API_KEY`  | NEJ   | ej satt  | När satt visar läkemedels-Sheeten `Hämta AI-förslag`-knappen (apotekare + admin bara). När ej satt/tom döljer AI-affordansen sig; dashboard + katalog + filtercombobox fungerar oförändrade. Hämta en nyckel på <https://console.anthropic.com/settings/keys>. |

`docker-compose.yml` läser variabeln via `${ANTHROPIC_API_KEY:-}` så
tom-standarden håller `docker compose up` fungerande på en fresh clone
utan någon nyckel konfigurerad. `.env.example`-platshållaren är tom.
