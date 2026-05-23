---
phase: 07
plan: 07-05
type: execute
wave: 3
depends_on: [07-01, 07-04]
files_modified:
  - README.md
autonomous: true
requirements_addressed: [OPS-02, OPS-04]
must_haves:
  truths:
    - "Implements D-124 (unified `## §6-svar` section with 7 sub-headings + Phase 5 audit deep-dive `### §6 supporting bullets` subsection), D-125 (cost + observability answers cite concrete tools, not hedged)"
    - "Reviewer with 5 minutes can walk through every demoable REQ via the new `## Demo-rundtur (5 minuter)` section"
    - "All 7 §6-svar elevator pitches answer the four brief-prescribed questions + 3 anticipated follow-ups in ≤4 sentences each"
    - "Each top-level §6 answer ends with `[Läs mer: §<anchor>]` linking to the lower-page deep dive"
    - "The Phase 5 deep-dive `### §6 supporting bullets` subsection (anchored as placeholder in Slice 1) is populated with compact test+migration+code-path citations"
  artifacts:
    - path: README.md
      provides: "## Demo-rundtur (5 minuter) + ## §6-svar (intervjudiskussion) + §6 supporting bullets in audit deep dive"
      contains:
        - "## Demo-rundtur (5 minuter)"
        - "## §6-svar (intervjudiskussion)"
        - "### Hur hanterar systemet att två sjuksköterskor beställer samtidigt?"
        - "### Hur skulle du skala upp till 50 vårdenheter?"
        - "### Hur skulle du eftermontera autentisering?"
        - "### Vad är du mest stolt över?"
        - "### Vad är du minst stolt över?"
        - "### Vad kostar systemet att köra?"
        - "### Hur skulle du övervaka det i produktion?"
  key_links:
    - from: README.md top §6-svar answers
      to: README.md `## Feature deep dives` audit / AI / banner sections
      via: "[Läs mer: ...](#...) markdown anchor links"
      pattern: "\\[Läs mer.*\\]\\(#"
    - from: Demo-rundtur steps
      to: Six primary routes (login → bestallningar/ny → lakemedel → dashboard → audit)
      via: numbered step prose with explicit URL paths
---

<objective>
Populate the two largest narrative sections of the submission README — both anchored as placeholders by Slice 1 — using the source material drafted in `07-CONTEXT.md <specifics>`:

1. **`## Demo-rundtur (5 minuter)`** — numbered Swedish walkthrough threading every demoable REQ into one ~5-minute path: login as sjuksköterska → multi-line order → login as apotekare → confirm + deliver → dashboard banner refreshes → AI suggestion on a new medication → login as admin → audit log. Source material in `06-CONTEXT.md <specifics>` covers the AI + banner portion in English; this slice translates to Swedish AND expands forward to include the Phase 3/4 order flow steps the Phase 6 draft skipped.

2. **`## §6-svar (intervjudiskussion)`** — 7 Swedish sub-headings, each 2–4 sentences (elevator pitch), each ending with `[Läs mer: §<anchor>](#...)` deep link. Source: the elevator-pitch skeleton in `07-CONTEXT.md <specifics> §6-svar — elevator pitches` (Swedish, pre-drafted for the planner to tighten + finalize).

3. **`### §6 supporting bullets`** inside `## Feature deep dives → ### Audit log (Phase 5)` — replace the placeholder Slice 1 anchored with compact bullets citing tests + migrations + code paths (per D-124). The top-level §6 elevator pitches link DOWN to these bullets via `[Läs mer]`.

This slice depends on **Slice 1** (placeholder anchors + deep-dive structure in place) AND **Slice 4** (the `## Mobil-först verifiering` section landed — relevant for the Demo-rundtur step "viewing on mobile" which can cross-reference the screenshot section).

Output: 3 sections of README.md populated (Demo-rundtur, §6-svar at top, §6 supporting bullets in audit deep dive); cross-anchor links resolve.
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-ops-submission-polish/07-CONTEXT.md
@.planning/phases/07-ops-submission-polish/07-PATTERNS.md
@.planning/phases/04-confirm-deliver-stock/04-CONTEXT.md
@.planning/phases/05-audit-log/05-CONTEXT.md
@.planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md
@apps/api/test/orders.deliver.integration.test.ts
@apps/api/test/audit.integration.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Populate `## Demo-rundtur (5 minuter)` with numbered Swedish walkthrough</name>
  <files>README.md</files>
  <read_first>
    - README.md (current state after Slice 1 + Slice 4; the `<!-- Populated by Slice 5 -->` placeholder under `## Demo-rundtur (5 minuter)`)
    - .planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md (`<specifics>` — drafts the AI + banner portion in English; the source material for translating to Swedish + expanding)
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-46..D-73 — for the multi-line order step semantics: Utkast → Skickad transition, MedicationPickerSheet, QuantityStepper)
    - .planning/phases/04-confirm-deliver-stock/04-CONTEXT.md (D-74..D-89 — for the confirm + deliver step semantics: DeliverConfirmDialog, OrderActorTrail, status transition)
    - .planning/phases/05-audit-log/05-CONTEXT.md (D-90..D-105 — for the audit-browse step semantics: /admin/audit URL-as-state filters, AuditDiffPanel, requestId-group chip)
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (`<domain>` "Demo-rundtur (5 minuter)" + `<specifics>` Swedish-language conventions)
    - .planning/phases/07-ops-submission-polish/07-PATTERNS.md (Pattern C — Swedish prose conventions)
  </read_first>
  <action>
    Replace the `<!-- Populated by Slice 5 -->` placeholder line under `## Demo-rundtur (5 minuter)` in README.md with a numbered Swedish walkthrough.

    **Opening framing** (1 sentence): "Den här rundturen tar fem minuter och täcker varje brief-§2.1-krav i en sammanhängande demo. Förutsättning: `docker compose up` är igång och alla tre demo-användare är seedade."

    **Numbered steps** — 8 steps minimum, each step is 1–3 sentences in Swedish, each names the exact UI string in code-fences when relevant, each cites the URL path:

    1. **Logga in som sjuksköterska** — `sjukskoterska@example.test` / `demo1234` på `http://localhost:5173/login`. Sessionen överlever en sidomladdning (AUTH-02). Navigera till `## Mobil-först verifiering` ovan om du vill se inloggningen vid 360 px.

    2. **Lägg en multi-radsbeställning** — på `/bestallningar/ny` (eller via "Ny beställning" från `/bestallningar`). Öppna `MedicationPickerSheet` med "Lägg till läkemedel"; pluck ut 2–3 mediciner; ändra kvantiteter via `QuantityStepper` (44 px touch-targets, optimistiskt+debounced). Klicka "Skicka" — statusen flyttar `Utkast → Skickad` med en `SubmitConfirmationBanner` på toppen (ORD-01 + ORD-02 + ORD-03).

    3. **Försök redigera den skickade beställningen** — observera att raderna är immutable och `HTTP 409 order_locked` returneras av API:t. Detta är ORD-06 + Phase 3's `D-54` atomic compare-and-swap-precondition.

    4. **Logga ut + logga in som apotekare** — `apotekare@example.test` / `demo1234`. Navigera till `/bestallningar` och se den nyss skickade beställningen i tabben "Skickad".

    5. **Bekräfta och leverera beställningen** — klicka in på beställningen, tryck "Bekräfta" (status `Skickad → Bekräftad`), sedan "Leverera" som öppnar `DeliverConfirmDialog`. Bekräfta i dialogen — statusen flyttar till `Levererad` (ORD-04 + ORD-05), och samma transaktion ökar lagersaldot på alla berörda mediciner (STK-01 + STK-02 + D-79 CUM-batch lock). `OrderActorTrail` visar vem som gjort vilken transition + när.

    6. **Se lagret uppdateras** — navigera till `/lakemedel` och hitta en av de levererade medicinerna; lagersaldot är nu inkrementerat. Navigera till `/dashboard` — `DashboardLowStockCard` visar de under-tröskel-mediciner som finns kvar (NTF-01 + NTF-02). Om en medicin precis steg över sin tröskel är den borta från bannern (refetched på mutation-invalidation per D-119).

    7. **AI-förslag på en ny medicin** — på `/lakemedel`, klicka "Lägg till nytt läkemedel"; öppna sheeten i create-läge; fyll i namn + ATC-kod; klicka `Hämta AI-förslag`. Servern returnerar en strukturerad rekommendation (`tool_use` mot `claude-haiku-4-5`) med konfidens-band (`Hög säkerhet` / `Medel säkerhet` / `Låg säkerhet` per D-111). Acceptera förslaget eller skriv om i `Slutgiltig klass` dropdown (override-by-enum-bucket per D-113). Spara — `therapeuticClass` persisteras (AI-01 + AI-02).

    8. **Logga ut + logga in som admin** — `admin@example.test` / `demo1234`. Navigera till `/admin/audit`. Filtrera på "Användare = sjukskoterska@example.test" — se beställningsraden som skapades i steg 2. Klicka in på den för att se `AuditDiffPanel` (Fält / Före / Efter). Klicka `Kopiera permalink` — URL:en innehåller alla filter-koordinater (men inte before/after-payload, per D-104). RequestId-chip:en länkar till alla syskon-events från samma HTTP-request (AUD-01 + AUD-02 + AUD-03).

    **Closing line** (1 sentence): "Hela rundturen täcker mandatory-omfattningen + 4/4 valda optionals; total walltime cirka 5 minuter vid normal interaktionshastighet."

    Apply Pattern C — Swedish prose; UI strings (`Hämta AI-förslag`, `Slutgiltig klass`, `Hög säkerhet`, `Utkast → Skickad`, `Bekräfta`, `Leverera`, `Skicka`, `Lägg till läkemedel`, `MedicationPickerSheet`, `QuantityStepper`, `DashboardLowStockCard`, `AuditDiffPanel`, `Kopiera permalink`, `Ny beställning`) verbatim in code-fences; technical names (`HTTP 409`, `order_locked`, `claude-haiku-4-5`, `tool_use`, `Hämta AI-förslag`) in code-fences; file paths in code-fences. REQ-IDs (ORD-01, AUD-02, etc.) in raw form for grep-ability.

    Do NOT touch other sections.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. Section placeholder removed:
      ! awk '/^## Demo-rundtur/,/^## /' README.md | grep -F "<!-- Populated by Slice 5 -->"
      # 2. Section exists with at least 8 numbered steps:
      awk '/^## Demo-rundtur \(5 minuter\)$/,/^## /' README.md | grep -E "^[1-9][0-9]?\. \*\*" | wc -l | xargs test 8 -le
      # 3. All three demo users referenced:
      awk '/^## Demo-rundtur/,/^## /' README.md | grep -F "sjukskoterska@example.test"
      awk '/^## Demo-rundtur/,/^## /' README.md | grep -F "apotekare@example.test"
      awk '/^## Demo-rundtur/,/^## /' README.md | grep -F "admin@example.test"
      # 4. Critical UI strings present:
      for s in "Hämta AI-förslag" "MedicationPickerSheet" "Levererad" "AuditDiffPanel" "Kopiera permalink" "DashboardLowStockCard"; do
        awk '/^## Demo-rundtur/,/^## /' README.md | grep -F "$s" >/dev/null || (echo "missing UI string: $s"; exit 1)
      done
      # 5. Status machine progression present:
      awk '/^## Demo-rundtur/,/^## /' README.md | grep -F "Utkast → Skickad"
      # 6. REQ-ID grep-ability (at least 5 distinct REQs cited):
      awk '/^## Demo-rundtur/,/^## /' README.md | grep -oE "(AUTH|CAT|ORD|STK|AI|AUD|NTF|UX|OPS)-[0-9]+" | sort -u | wc -l | xargs test 5 -le
    </automated>
  </verify>
  <done>
    `## Demo-rundtur (5 minuter)` populated with ≥8 numbered Swedish steps spanning all 3 roles + all 4 status transitions + AI suggestion + audit browse. UI strings verbatim per Pattern C. ≥5 REQ-IDs cited inline.
  </done>
</task>

<task type="auto">
  <name>Task 2: Populate `## §6-svar (intervjudiskussion)` — 7 elevator pitches + `[Läs mer]` deep links</name>
  <files>README.md</files>
  <read_first>
    - README.md (current state after Task 1; the `<!-- Populated by Slice 5 -->` placeholder under `## §6-svar (intervjudiskussion)`)
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (`<specifics>` "§6-svar — elevator pitches" — 7 Swedish pitches pre-drafted; D-124 + D-125 — answer specs)
    - .planning/phases/04-confirm-deliver-stock/04-CONTEXT.md (D-79 — CUM-batch FOR UPDATE; cited in answer 1)
    - .planning/phases/05-audit-log/05-CONTEXT.md (D-83, D-90, D-91, D-93, D-98, D-99 — cited across answers 1, 3, 4, 5)
    - .planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md (cost figures + AI service single-seam — cited in answer 6 + 7)
    - apps/api/test/orders.deliver.integration.test.ts (cited by name in answer 1)
    - apps/api/test/audit.integration.test.ts (Tests 2, 3, 4, 15 — cited across answers)
  </read_first>
  <action>
    Replace the `<!-- Populated by Slice 5 -->` placeholder line under `## §6-svar (intervjudiskussion)` in README.md.

    Sub-structure: opening 1-sentence framing ("De fyra brief-§6-frågorna + tre förväntade följdfrågor, var och en med en hisspitch på 2–4 meningar; djupet finns under `## Feature deep dives`."), then 7 `###` subsections in this exact order:

    1. `### Hur hanterar systemet att två sjuksköterskor beställer samtidigt?` — use the pre-drafted text from `07-CONTEXT.md <specifics>` §6-svar item 1, tightening to ≤4 sentences. Must cite by name: `apps/api/test/orders.deliver.integration.test.ts` (`pg_locks`-snapshot) AND Test 2 in `audit.integration.test.ts`. Must reference D-79 (CUM-batch FOR UPDATE) AND D-91 ("audit-loggen ljuger inte"). End with `[Läs mer: §Audit log § Hur audit-hooken fungerar](#hur-audit-hooken-fungerar)`.

    2. `### Hur skulle du skala upp till 50 vårdenheter?` — use the pre-drafted text from `<specifics>` §6-svar item 2, tightening to ≤4 sentences. Must reference `careUnitId` multi-tenant model, cursor pagination (D-105), D-16 cross-tenant admin exception. End with `[Läs mer: §Audit log § Vad granskas?](#vad-granskas)`.

    3. `### Hur skulle du eftermontera autentisering?` — use the pre-drafted text from `<specifics>` §6-svar item 3, tightening to ≤4 sentences. Must reference Phase 5 audit-middleware retrofit + Prisma `$extends` + D-83 + D-90. End with `[Läs mer: §Audit log § Hur audit-hooken fungerar](#hur-audit-hooken-fungerar)`.

    4. `### Vad är du mest stolt över?` — use the pre-drafted text from `<specifics>` §6-svar item 4, tightening to ≤4 sentences. Must reference migration 0010 (`meditrack_app` non-owner role REVOKE) + migration 0008 (BEFORE-trigger) + `audit.integration.test.ts` Test 3 (grep) + Test 4 (raw SQL UPDATE rejected). End with `[Läs mer: §Audit log § Lager 2 — DB-rollbehörigheter + BEFORE-trigger](#lager-2--db-rollbehörigheter--before-trigger)`.

    5. `### Vad är du minst stolt över?` — use the pre-drafted text from `<specifics>` §6-svar item 5, tightening to ≤4 sentences. Must reference `$queryRaw` / `$executeRaw` blind-spot, CI grep Test 15, the v2 fix path (allowlist or service routing). Tone: engineering-honest — DO NOT soften. End with `[Läs mer: §Audit log § §6 supporting bullets](#6-supporting-bullets)` (anchored by Task 3 below).

    6. `### Vad kostar systemet att köra?` — use the pre-drafted text from `<specifics>` §6-svar item 6, tightening to ≤4 sentences. Must name concrete numbers: $30/mån grundkostnad floor; `~$0.0001 per claude-haiku-4-5 tool_use call`; reference D-115 (no NPL backfill at seed → $4 saved per fresh `docker compose up`). No `[Läs mer]` link required (cost is self-contained).

    7. `### Hur skulle du övervaka det i produktion?` — use the pre-drafted text from `<specifics>` §6-svar item 7, tightening to ≤4 sentences. Must name concrete tools (OpenTelemetry, Loki/Splunk, Prometheus). Reference D-125 honesty: "today we have X; production would add Y; we deliberately did NOT build Y because Z." End with `[Läs mer: §Audit log § Hur audit-hooken fungerar](#hur-audit-hooken-fungerar)` (the audit log IS the security-observability story today).

    Each answer is exactly 2–4 sentences (target 3). The pre-drafted text in `<specifics>` is already at this length — the executor's job is to copy/tighten, not redraft.

    Apply Pattern C — Swedish prose; technical names + file paths + REQ-IDs in code-fences. UI strings irrelevant in this section.

    `[Läs mer]` anchor format follows GitHub-flavored markdown auto-anchor rules: lowercase, spaces→hyphens, Swedish characters (å/ä/ö) preserved, `?` `!` removed. The executor MUST verify each anchor resolves by checking the corresponding `###` heading exists in `## Feature deep dives` (Slice 1 created them with the same Swedish names). If an anchor doesn't resolve, fix the heading or the link — they must match.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. Section placeholder removed:
      ! awk '/^## §6-svar/,/^## /' README.md | grep -F "<!-- Populated by Slice 5 -->"
      # 2. All 7 ### subsections present in order:
      for q in \
        "### Hur hanterar systemet att två sjuksköterskor beställer samtidigt?" \
        "### Hur skulle du skala upp till 50 vårdenheter?" \
        "### Hur skulle du eftermontera autentisering?" \
        "### Vad är du mest stolt över?" \
        "### Vad är du minst stolt över?" \
        "### Vad kostar systemet att köra?" \
        "### Hur skulle du övervaka det i produktion?"; do
        grep -F "$q" README.md >/dev/null || (echo "MISSING: $q"; exit 1)
      done
      # 3. Each answer is ≤4 sentences. Implemented as a single-line python3 -c invocation per checker
      #    hint (issue 6) — NO heredoc, NO embedded newlines in the script (the entire `python3 -c "..."`
      #    sits on one logical line, so Python's `-c` arg has no leading whitespace and IndentationError
      #    is impossible). Counts terminal punctuation (.!?) after stripping code-fences + closing
      #    [Läs mer](...) link. The list-comprehension is inline; no multi-line block needed.
      python3 -c "import re; d=open('README.md','r',encoding='utf-8').read(); m=re.search(r'^## §6-svar.*?(?=^## )',d,re.M|re.S); assert m,'§6-svar section not found'; subs=re.split(r'^### ',m.group(0),flags=re.M)[1:]; strip=lambda t: re.sub(r'\[Läs mer.*?\]\(.*?\)','',re.sub(r'\x60[^\x60]*\x60','',re.sub(r'\x60\x60\x60[\s\S]*?\x60\x60\x60','',t))); count=lambda t: len(re.findall(r'[.!?](?:\s|\Z)',t)); pairs=[(s.split(chr(10),1)[0].strip(), count(strip(s.split(chr(10),1)[1] if chr(10) in s else ''))) for s in subs]; bad=[(h,n) for h,n in pairs if n>4]; assert not bad, f'answers exceeding 4 sentences: {bad}'; print('OK: all 7 answers <=4 sentences ({})'.format([n for _,n in pairs]))"
      # 4. Each of the first 5 + 7th answer has a [Läs mer] link:
      for q in "Hur hanterar systemet" "Hur skulle du skala" "Hur skulle du eftermontera" "Vad är du mest stolt över" "Vad är du minst stolt över" "Hur skulle du övervaka"; do
        awk -v RS="### " -v ORS="### " '/^'"$q"'/' README.md | grep -E "\[Läs mer.*\]\(#" >/dev/null || (echo "missing [Läs mer] for: $q"; exit 1)
      done
      # 5. Critical citations present in their respective answers:
      awk -v RS="### " '/^Hur hanterar systemet/' README.md | grep -F "orders.deliver.integration.test.ts"
      awk -v RS="### " '/^Vad är du mest stolt över/' README.md | grep -F "0010"
      awk -v RS="### " '/^Vad är du mest stolt över/' README.md | grep -F "0008"
      awk -v RS="### " '/^Vad är du minst stolt över/' README.md | grep -F "queryRaw"
      awk -v RS="### " '/^Vad kostar systemet/' README.md | grep -F "claude-haiku-4-5"
      awk -v RS="### " '/^Hur skulle du övervaka/' README.md | grep -F "OpenTelemetry"
    </automated>
  </verify>
  <done>
    `## §6-svar (intervjudiskussion)` populated with 7 Swedish `###` subsections in canonical order; each ≤4 sentences; 6 of 7 end with a `[Läs mer]` deep-link; required citations grep-findable.
  </done>
</task>

<task type="auto">
  <name>Task 3: Populate `### §6 supporting bullets` in the audit deep dive</name>
  <files>README.md</files>
  <read_first>
    - README.md (current state; the `<!-- §6 supporting bullets — populated by Slice 5 -->` placeholder anchored by Slice 1 under `## Feature deep dives → ### Audit log (Phase 5) → ### §6 supporting bullets`)
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (D-124 — convert existing §6 prose to bullet-level supporting evidence; `<specifics>` example shape: "Audit-loggen ljuger inte: integrationstest #2 framtvingar rollback inuti $transaction, verifierar noll audit_events-rader")
    - apps/api/test/audit.integration.test.ts (Tests 2, 3, 4, 15 — cited in bullets)
    - apps/api/prisma/migrations/ (verify migration filenames 0008, 0010, 0011 exist)
    - .planning/phases/05-audit-log/05-CONTEXT.md (D-91, D-93, D-98, D-99 — bullet sources)
  </read_first>
  <action>
    Replace the `<!-- §6 supporting bullets — populated by Slice 5 -->` placeholder line inside `## Feature deep dives → ### Audit log (Phase 5) → ### §6 supporting bullets` (Slice 1 anchored this) with compact Swedish bullets citing tests + migrations + code paths.

    Each bullet is one sentence, in this exact shape:
    > `<thesis-statement> — <test|migration|code-path-citation>`

    Bullets to land (12 minimum):

    1. **Samtidighet — `pg_locks`-baserad serialisering.** `apps/api/test/orders.deliver.integration.test.ts` Test 8 observerar Postgres' radlås under en konkurrerande leverans; vinnaren commitar, förloraren rullas tillbaka (D-79).
    2. **Audit-loggen ljuger inte — rollback-säkerhet.** `audit.integration.test.ts` Test 2 framtvingar ett `Error` inuti `$transaction`; resultat: noll `audit_events`-rader skrivs (D-91 transactional contract).
    3. **Append-only — kodfrånvaro.** `audit.integration.test.ts` Test 3 git-grepar för `prisma.auditEvent.update/updateMany/delete/deleteMany/upsert` i `apps/`; matchar noll. ESLint-regel i `.eslintrc.cjs` skär bort patterns före commit (D-99).
    4. **Append-only — DB-lager.** `audit.integration.test.ts` Test 4 utför `UPDATE audit_event SET ...` via `$queryRaw`; Postgres returnerar `permission denied` med `SQLSTATE 42501` från BEFORE-triggern i migration `0008_audit_events_revoke_grants` (kopplad till OWNER-bindning).
    5. **Named role split — REVOKE-skydd.** Migration `0010_audit_events_named_app_role` skapar `meditrack_app` non-owner-roll och REVOKE:ar UPDATE/DELETE/TRUNCATE på `AuditEvent`. `DATABASE_URL` använder `meditrack_app`; `DIRECT_URL` använder owner endast för migrationer (D-98).
    6. **Per-concern ALS — request-context utan globals.** `actorALS` / `activeTxStackALS` / `actionOverrideALS` är tre oberoende `AsyncLocalStorage`-instanser sådda av Fastify `onRequest`-hook via `als.run` (3-arg signature, NOT `enterWith`; Plan 05-06 review fix).
    7. **Multi-tenancy — `careUnitId`-first.** Service-signaturer tar `careUnitId` som första argument överallt (D-16). Admin-vyn för audit är medvetet cross-tenant; en v2 toggle "scope to my vårdenhet" är en WHERE-tillägg eftersom kolumnen redan är där.
    8. **Cursor-paginering — O(page-size).** `GET /api/audit/events` använder base64-encoded `{createdAt, id}`-cursor + deterministisk OR-pair WHERE för same-millisecond tiebreak; `take: limit+1` detekterar `hasMore` utan COUNT (D-105). Skalar till storleksordningar fler rader än offset-paginering.
    9. **Eftermontering av authz — samma `$extends`-mönster.** Phase 5 eftermonterade audit-logging utan att röra Phase 2/3/4 service-filer; samma `query: { findMany: ... }`-mellanhand injicerar en `where: { tenantId }`-klausul när per-rad authz kommer (D-83 + D-90).
    10. **CR-02 — entityId backstop.** Migration `0011` BEFORE INSERT trigger förkastar `audit_events.entityId` = '' eller NULL; failing-login `auth.ratelimit.test.ts` testet täcker att `auth_attempt`-events skriver attemptedEmail (WR-07 closure).
    11. **`$queryRaw` blind-spot — CI grep guard.** `audit.integration.test.ts` Test 15 git-grepar efter `$executeRaw` med en allowlist; matchar noll utanför allowlist. Detta är den underliggande limitationen i §6 "minst stolt över"-svaret.
    12. **Login rate-limit — bucket-isolerad.** `@fastify/rate-limit` per-email + per-IP buckets på `POST /api/auth/login`; `auth.ratelimit.test.ts` (4 tester) verifierar nested + parallel + cross-request invariants.

    Apply Pattern C — Swedish prose; file paths + test names + migration names + SQLSTATE codes in code-fences; decision IDs (D-79, D-91, etc.) raw for grep-ability.

    Do NOT touch sections outside the §6 supporting bullets subsection. Do NOT alter the heading itself.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. Placeholder gone:
      ! grep -F "<!-- §6 supporting bullets — populated by Slice 5 -->" README.md
      # 2. Heading exists:
      grep -F "### §6 supporting bullets" README.md
      # 3. >=12 bullets in the section. Single-line python3 -c per checker hint (issue 6) — no heredoc.
      python3 -c "import re; d=open('README.md','r',encoding='utf-8').read(); m=re.search(r'^### §6 supporting bullets$(.*?)(?=^### |^## )',d,re.M|re.S); assert m,'§6 supporting bullets section not found'; b=re.findall(r'^[0-9]+\.\s+\*\*|^- ',m.group(1),re.M); assert len(b)>=12, f'bullet count = {len(b)}, expected >= 12'; print(f'OK: {len(b)} bullets')"
      # 4. Critical citations grep-findable in the section. Single-line python3 -c per checker hint (issue 6).
      python3 -c "import re; d=open('README.md','r',encoding='utf-8').read(); m=re.search(r'^### §6 supporting bullets$(.*?)(?=^### |^## )',d,re.M|re.S); body=m.group(1); needed=['orders.deliver.integration.test.ts','audit.integration.test.ts','Test 2','Test 3','Test 4','0008','0010','0011','D-91','D-99','meditrack_app','careUnitId','\$extends','\$queryRaw','AsyncLocalStorage','@fastify/rate-limit']; missing=[c for c in needed if c not in body]; assert not missing, f'missing citations: {missing}'; print('OK: all citations present')"
    </automated>
  </verify>
  <done>
    `### §6 supporting bullets` placeholder replaced with ≥12 compact Swedish bullets citing tests + migrations + decisions; all expected citations grep-findable.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| README.md → reviewer | Static rendered markdown viewed on GitHub. No code execution. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-14 | Information Disclosure | §6 supporting bullets | accept | All bullets cite files, tests, migrations, and decision IDs that are already public in the repo. The §6 "least proud" answer (Task 2 answer 5) honestly discloses the `$queryRaw` blind-spot — this is intentional engineering honesty per CONTEXT D-131, NOT an information-disclosure threat. |
| T-07-15 | Information Disclosure | Demo-rundtur instructions | accept | Demo-rundtur references demo credentials (`sjukskoterska@example.test` etc.) that are already documented in `## Demo-konton`. No real-world credentials disclosed. |
| T-07-16 | All other ASVS L1 categories | N/A | out-of-scope | Documentation-only edit — no inputs, no auth code, no DB access, no new attack surface. No new dependencies added. |
</threat_model>

<verification>
- All `[Läs mer]` anchor links resolve to actual `###` headings in `## Feature deep dives` (GitHub-flavored auto-anchor rules).
- Each §6 answer is ≤4 sentences (mechanically asserted by single-line python3 -c invocation in Task 2 `<verify>`).
- Demo-rundtur threads all 8 demoable REQ groups (auth, catalog, multi-line order, status machine, stock, AI, audit, banner) in ≤8 numbered steps.
- §6 supporting bullets cite ≥4 tests, ≥3 migrations, ≥4 decision IDs.
</verification>

<success_criteria>
- 3 sections of README.md populated (Demo-rundtur, §6-svar top-level, §6 supporting bullets inside audit deep dive).
- All grep + Python assertions in `<verify>` blocks pass.
- Slice 1 placeholders all consumed (Slice 5 is the final consumer of the `<!-- Populated by Slice 5 -->` and `<!-- §6 supporting bullets — populated by Slice 5 -->` anchors).
- Commit chain follows Pattern B (`docs(07-05): ...`).
</success_criteria>

<output>
Create `.planning/phases/07-ops-submission-polish/07-05-SUMMARY.md` when done, listing: the 8+ Demo-rundtur step headlines; the 7 §6-svar headings + their target `[Läs mer]` anchors; the 12+ §6 supporting bullet headlines. Note any anchor links that needed fixing because Slice 1's deep-dive heading didn't match the predicted slug.
</output>
