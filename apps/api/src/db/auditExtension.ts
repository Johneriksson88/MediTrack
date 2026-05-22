import { Prisma } from '@prisma/client';
import { als } from '../plugins/requestContext.js';
import {
  AUDITED_MODELS,
  AUDIT_ALLOWLIST,
  type AuditedModel,
  filterAllowlist,
  mapPrismaModelToEntityType,
  resolveEntityId,
} from './auditAllowlist.js';

/**
 * Phase 5 D-90 / D-91 / D-92 / D-93 / D-94 / D-95 / D-97 — Prisma
 * `$extends` query middleware that writes audit_events rows for every
 * mutation against the audited model set, INSIDE the same transaction
 * as the wrapping mutation.
 *
 * # WHY $EXTENDS, NOT SERVICE WRAPPERS OR FASTIFY HOOKS (D-90)
 *
 * Service-layer wrappers (each service imports withAudit(fn, …)) were
 * rejected because they require editing every existing service file,
 * violating Phase 4 D-83's promise of "retrofit without touching Phase
 * 4 code." Fastify onResponse was rejected because it can't get a
 * clean `before` snapshot for compound mutations (deliver touches
 * Order + N CUMs from a single route). The $extends model-method
 * interception gives free 1+N coverage for the deliver fan-out.
 *
 * # SAME-TX GUARANTEE (D-91)
 *
 * The intercepted call runs whatever the caller passed (`query(args)`).
 * If the caller is already inside prisma.$transaction, Prisma's nested
 * tx behavior means our audit-row INSERT lands in the SAME tx — both
 * the mutation and the audit row commit or roll back together. If the
 * caller is bare (e.g. prisma.medication.create(...) outside a tx),
 * Prisma auto-wraps it in an implicit tx and the same guarantee holds.
 *
 * For UPDATE / DELETE, we load the `before` row(s) via
 * `client.<model>.findUnique` (or findMany for updateMany / deleteMany)
 * INSIDE the same tx, then run the original op, then write the audit
 * row. Order matters — load before mutating.
 *
 * # SKIP RULE (D-92)
 *
 * On every intercepted op we read `als.getStore()`. If undefined, we
 * SKIP audit-row creation entirely — just call query(args) and return
 * the result. This is what makes the seed script noiseless. Tests
 * that WANT audit behavior must wrap their setup in an explicit
 * `als.run({ actorUserId: TEST_USER.id, ... }, () => { ... })`.
 *
 * # ENTITYID LEAK PREVENTION (D-97 + T-05-03)
 *
 * For every audit-row write we compute `entityId` via
 * `resolveEntityId(model, row)` — for Session rows that returns
 * `row.userId` (the actor User.id), NEVER `row.id` (which IS the raw
 * signed session token). This is the second of TWO leak paths closed
 * in lockstep — the first is the `AUDIT_ALLOWLIST` which excludes
 * `Session.id` and `User.passwordHash` from the `after` JSON.
 *
 * # OPS INTERCEPTED (D-93)
 *
 * create, update, updateMany, delete, deleteMany. NOT intercepted:
 * upsert, createMany, findMany, findUnique, findFirst, count,
 * aggregate, $queryRaw, $executeRaw. The unaudited surface is
 * documented in the README per D-93.
 */

// Prisma's $extends dynamic-query API is strictly typed: the per-model
// handler maps don't accept arbitrary string keys via TypeScript even
// when the runtime accepts them. We construct the handler maps with
// loose types here and cast at the return point — Prisma still
// enforces the runtime contract.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseQueryHandlers = any;

/**
 * The lowercase Prisma client property name for a given PascalCase
 * model. e.g. 'Medication' → 'medication', 'CareUnitMedication' →
 * 'careUnitMedication'. Prisma keeps this convention strictly.
 */
function clientPropName(model: AuditedModel): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Build the Prisma extension factory. `buildAuditExtension()` is
 * imported once by `db/client.ts` and chained via `.$extends(...)` on
 * the PrismaClient constructor call.
 */
export function buildAuditExtension() {
  return Prisma.defineExtension((client) => {
    const modelHandlers: Record<string, LooseQueryHandlers> = {};

    for (const model of AUDITED_MODELS) {
      const propName = clientPropName(model);
      const handlers: LooseQueryHandlers = {};

      // ---- create ----
      handlers.create = async ({
        args,
        query,
      }: {
        args: Record<string, unknown>;
        query: (a: Record<string, unknown>) => Promise<unknown>;
      }) => {
        const store = als.getStore();
        if (!store) return query(args);

        const result = await query(args);
        const row = result as Record<string, unknown>;
        await writeAuditRow(client, store, model, {
          before: null,
          after: row,
          row,
          defaultAction: 'create',
        });
        return result;
      };

      // ---- update ----
      handlers.update = async ({
        args,
        query,
      }: {
        args: Record<string, unknown>;
        query: (a: Record<string, unknown>) => Promise<unknown>;
      }) => {
        const store = als.getStore();
        if (!store) return query(args);

        const where = args.where as Record<string, unknown> | undefined;
        let beforeRow: Record<string, unknown> | null = null;
        if (where) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const modelClient = (client as any)[propName];
          beforeRow = await modelClient.findUnique({ where });
        }

        const result = await query(args);
        const row = result as Record<string, unknown>;
        await writeAuditRow(client, store, model, {
          before: beforeRow,
          after: row,
          row,
          defaultAction: 'update',
        });
        return result;
      };

      // ---- updateMany ----
      handlers.updateMany = async ({
        args,
        query,
      }: {
        args: Record<string, unknown>;
        query: (a: Record<string, unknown>) => Promise<unknown>;
      }) => {
        const store = als.getStore();
        if (!store) return query(args);

        const where = (args.where as Record<string, unknown> | undefined) ?? {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modelClient = (client as any)[propName];
        const beforeRows: Array<Record<string, unknown>> = await modelClient.findMany({ where });

        const result = await query(args);

        for (const beforeRow of beforeRows) {
          const id = beforeRow.id as string | undefined;
          if (!id) continue;
          const afterRow: Record<string, unknown> | null = await modelClient.findUnique({
            where: { id },
          });
          await writeAuditRow(client, store, model, {
            before: beforeRow,
            after: afterRow,
            row: afterRow ?? beforeRow,
            defaultAction: 'update',
          });
        }
        return result;
      };

      // ---- delete ----
      handlers.delete = async ({
        args,
        query,
      }: {
        args: Record<string, unknown>;
        query: (a: Record<string, unknown>) => Promise<unknown>;
      }) => {
        const store = als.getStore();
        if (!store) return query(args);

        const where = args.where as Record<string, unknown> | undefined;
        let beforeRow: Record<string, unknown> | null = null;
        if (where) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const modelClient = (client as any)[propName];
          beforeRow = await modelClient.findUnique({ where });
        }

        const result = await query(args);
        // For delete, Prisma's result IS the deleted row.
        const row = (result as Record<string, unknown>) ?? beforeRow ?? {};
        await writeAuditRow(client, store, model, {
          before: beforeRow ?? (result as Record<string, unknown>),
          after: null,
          row,
          defaultAction: 'delete',
        });
        return result;
      };

      // ---- deleteMany ----
      handlers.deleteMany = async ({
        args,
        query,
      }: {
        args: Record<string, unknown>;
        query: (a: Record<string, unknown>) => Promise<unknown>;
      }) => {
        const store = als.getStore();
        if (!store) return query(args);

        const where = (args.where as Record<string, unknown> | undefined) ?? {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modelClient = (client as any)[propName];
        const beforeRows: Array<Record<string, unknown>> = await modelClient.findMany({ where });

        const result = await query(args);

        for (const beforeRow of beforeRows) {
          await writeAuditRow(client, store, model, {
            before: beforeRow,
            after: null,
            row: beforeRow,
            defaultAction: 'delete',
          });
        }
        return result;
      };

      // Prisma `$extends({ query })` keys models by their lowercase
      // client prop name (e.g. `session`, `careUnitMedication`), NOT
      // by PascalCase. Without this mapping the handlers register
      // successfully but the runtime never matches the actual ops.
      modelHandlers[propName] = handlers;
    }

    return client.$extends({
      name: 'meditrack-audit',
      query: modelHandlers as LooseQueryHandlers,
    });
  });
}

/**
 * Internal helper — writes ONE audit row for an intercepted mutation.
 * Filters before/after through the per-model allowlist (D-97 layer 1)
 * and computes entityId via resolveEntityId (D-97 layer 2 / T-05-03).
 */
async function writeAuditRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  store: NonNullable<ReturnType<typeof als.getStore>>,
  model: AuditedModel,
  payload: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    row: Record<string, unknown>;
    defaultAction: 'create' | 'update' | 'delete';
  },
): Promise<void> {
  const action = store.actionOverride ?? payload.defaultAction;
  const entityId = resolveEntityId(model, payload.row);
  const filteredBefore = payload.before ? filterAllowlist(model, payload.before) : null;
  const filteredAfter = payload.after ? filterAllowlist(model, payload.after) : null;
  // careUnitId denormalization: prefer the row's own careUnitId, fall
  // back to the actor's careUnitId from the ALS store.
  const rowCareUnitId =
    (payload.row.careUnitId as string | undefined) ?? store.careUnitId ?? null;

  const data: Record<string, unknown> = {
    actorUserId: store.actorUserId,
    careUnitId: rowCareUnitId,
    entityType: mapPrismaModelToEntityType(model),
    entityId,
    action,
    requestId: store.requestId,
    ipAddress: store.ipAddress ?? null,
  };
  // Only set before/after when non-null — leaving them undefined makes
  // Prisma default to DB NULL, avoiding the NullableJsonNullValueInput
  // type-system dance for explicit nulls.
  if (filteredBefore) data.before = filteredBefore;
  if (filteredAfter) data.after = filteredAfter;

  await client.auditEvent.create({ data });
}

// Silence unused-import warnings for AUDIT_ALLOWLIST when this file is
// imported in environments that don't tree-shake — the symbol is part
// of the public surface that the extension closes over via the
// `filterAllowlist` helper, but TS doesn't recognize the indirect use.
void AUDIT_ALLOWLIST;
