# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

No source code yet — Phase 1 has not started. Planning is complete: `.planning/` contains PROJECT.md, REQUIREMENTS.md (38 v1 REQ-IDs), ROADMAP.md (7 phases), STATE.md, and config.json. Other artifacts:

- `local/intervju-testcase-1-1-.pdf` — the assignment brief (Swedish). Local only; do not commit binaries from here.
- `.claude/` — GSD tooling: agents, commands, hooks, settings. See `.claude/settings.json` for active hooks.

When source code lands, update the Status section and the GSD-managed Stack / Conventions / Architecture sections (below) with actual build/lint/test commands and real architecture. Do not invent them in the meantime.

## Project context (from the brief)

**MediTrack** is a Medovia interview case: a fullstack internal tool for managing medication orders and stock levels at a healthcare unit (Swedish vårdenhet). One-week timeframe, mid-level fullstack, presented live in a technical interview.

Mandatory feature scope:

- **Medication registry** — list/CRUD/search/filter on name, ATC code, form (tablett/injektion/etc.), strength, current stock.
- **Order flow** — multi-line orders with status machine `Utkast → Skickad → Bekräftad → Levererad`; per-unit history.
- **Stock logic** — stock decremented/incremented on delivery; low-stock warning when below a per-medication threshold.

Optional (any subset, justify in README): AI feature (auto-categorization / predictive restock / chatbot), role-based auth (apotekare/sjuksköterska/admin), audit log, low-stock notifications, CSV/PDF export.

## Constraints that shape decisions

- **Stack is unchosen by design.** The brief says "Frihet inom ramar" — pick your stack and motivate it in the README. Medovia uses TypeScript, React, Go, and Ruby on Rails internally (a plus, not a requirement). When the user picks, write down the choice in README and update this file.
- **Domain language is Swedish.** Field names in the spec are Swedish (läkemedel, beställning, vårdenhet, lagersaldo, ATC-kod). Decide early whether the data model uses Swedish or English identifiers and stay consistent — the interviewer will read both code and commits.
- **Git history is graded.** The brief explicitly says "vi läser dina commits." Atomic, well-messaged commits matter as much as the code.
- **Evaluation weights** (from brief §5): code quality & architecture ★★★★★, API design & data modeling ★★★★, system design & scalability ★★★★, UI/UX ★★★, README & communication ★★★. Reviewers explicitly value a well-justified half-finished solution over an uncommented complete one — don't ship features at the cost of readability or commit clarity.
- **Required deliverable in README.md:** purpose, architecture choices, how to run, known gaps, and "what I'd do with more time." Treat this as part of the work, not an afterthought.
- **Interview questions to design for** (brief §6): concurrent updates from two nurses ordering simultaneously, scaling from 1 to 50 vårdenheter, how auth would be retrofitted. Leave hooks in the data model and architecture that make good answers possible.

## GSD tooling

This repo is set up with the GSD (Get Shit Done) workflow. Hooks in `.claude/settings.json` run on SessionStart, PreToolUse (Write/Edit/Bash), and PostToolUse (Read/Write/Edit/Bash/Agent/Task):

- `gsd-check-update.js`, `gsd-session-state.sh` — session bootstrap.
- `gsd-prompt-guard.js`, `gsd-read-guard.js`, `gsd-workflow-guard.js` — gate Write/Edit operations.
- `gsd-validate-commit.sh` — gates `git commit` Bash calls.
- `gsd-context-monitor.js`, `gsd-phase-boundary.sh`, `gsd-read-injection-scanner.js` — observability.

GSD slash-commands live under `.claude/commands/gsd/` and the supporting agents under `.claude/agents/`. The intended workflow is `/gsd:new-project` → `/gsd:plan-phase` → `/gsd:execute-phase` per phase, with planning artifacts written to `.planning/` (not yet created). If the user runs GSD commands, defer to them rather than ad-hoc planning.

## Directory conventions

- `local/` — non-source artifacts (the brief PDF lives here). Treat as local-only / gitignore candidate. Don't commit binaries from here.
- `.claude/` — tooling, committed. Don't edit hook scripts without a reason.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**MediTrack**

An internal web tool for Swedish healthcare units (vårdenheter) to manage medication stock and ordering. Nurses, pharmacists, and admins view current stock, place multi-line medication orders, track them through `Utkast → Skickad → Bekräftad → Levererad`, and see low-stock warnings — replacing today's error-prone manual lists and email.

Delivered as the Medovia mid-level fullstack interview submission (one-week timebox).

**Core Value:** A nurse can place an order for a low-stock medication and, when delivered, the stock balance and audit trail update atomically — reliably, with no manual reconciliation. Everything else (auth, AI, notifications, history views) supports this one loop.

### Constraints

- **Tech (frontend)**: TypeScript + React — locked by user.
- **Tech (backend)**: Node.js + TypeScript — proposed; same-language stack keeps cognitive load low and lets DTOs/types be shared end-to-end. Subject to confirmation on approval.
- **Tech (database)**: PostgreSQL — the domain is unambiguously relational (orders → order_lines → medications, audit, user → unit) and Postgres' row-level locking gives a real answer to the §6 concurrency question.
- **Tech (ORM)**: Prisma — TS-native, schema-first migrations, generated types. Fastest path to a defensible data model in a one-week budget.
- **Tech (local run)**: Docker Compose — `docker compose up` is the README's golden command (brief §3.3 calls this "ett plus").
- **Timeline**: full week from `2026-05-19`. Reviewer reads commit history → must be atomic and narrative throughout, not back-loaded.
- **Domain fidelity**: Swedish UI labels match brief vocabulary verbatim (e.g., the status pills must read `Utkast / Skickad / Bekräftad / Levererad`).
- **Audit + concurrency + multi-tenancy are non-negotiable architecturally**, even where the UI doesn't surface them, because they're the questions the interviewer will ask.
- **Lightweight bias**: no Kubernetes, no message queues, no microservices, no GraphQL federation — every added moving part must be motivated in the README.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
