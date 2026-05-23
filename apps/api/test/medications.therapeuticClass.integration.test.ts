import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { medicationListResponse, medicationListItem } from '@meditrack/shared';
import {
  TEST_APOTEKARE,
  buildTestApp,
  ensureAllRolesSeeded,
  loginAs,
  prisma,
  resetSessions,
} from './helpers/buildTestApp.js';

/**
 * Phase 6 Plan 02 Task 3 — therapeuticClass BE integration tests.
 *
 * Four scenarios covering the AI-03 list filter, the user-source create
 * path, the D-32 carve-out for NPL-source meds, and the Phase 5 audit
 * pipeline (D-95 diff-at-read) surfacing the new column automatically.
 *
 *   Test 1 (list filter, AI-03): seed two CUMs with different
 *     therapeuticClass values on the apotekare's vårdenhet; assert
 *     GET /api/medications?therapeuticClass=N returns exactly the 'N' row.
 *
 *   Test 2 (user-source persistence): PATCH /api/medications/:id with
 *     `{ therapeuticClass: 'J' }` on a user-source med returns 200 + the
 *     persisted value reads back via a subsequent GET.
 *
 *   Test 3 (D-32 carve-out, D-115): PATCH /api/medications/:id with
 *     `{ therapeuticClass: 'N' }` on an NPL-source med returns 200 —
 *     therapeuticClass IS editable on NPL meds (classification is
 *     metadata, not pharmaceutical identity). Confirm via subsequent GET.
 *
 *   Test 4 (audit, D-95 + D-97 extension): after the Test-2 PATCH, the
 *     Phase 5 audit middleware writes a `medication.update` event whose
 *     `after` JSON contains the new therapeuticClass value. Asserts the
 *     allowlist extension surfaced the new field without requiring a new
 *     audit action.
 *
 * All four tests share the apotekare session (requires
 * `medication:update` per Phase 2 D-32 RBAC).
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await ensureAllRolesSeeded();
});

beforeEach(async () => {
  await resetSessions();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('Phase 6 Plan 02 — therapeuticClass BE behavior', () => {
  it('Test 1 (list filter, AI-03): GET /api/medications?therapeuticClass=N returns only N-class rows', async () => {
    const cookie = await loginAs(app, TEST_APOTEKARE);

    // Seed two user-source meds with distinct classes for this apotekare's
    // vårdenhet. Use unique nplId=null + distinctive names so we can find
    // them by name in the response and clean up at the end of the test.
    const nameN = `__phase6plan02_test1_N_${Date.now()}`;
    const nameJ = `__phase6plan02_test1_J_${Date.now() + 1}`;

    const medN = await prisma.medication.create({
      data: {
        name: nameN,
        atcCode: 'N02BE01',
        form: 'Tablett',
        source: 'user',
        nplId: null,
        therapeuticClass: 'N',
      },
    });
    const medJ = await prisma.medication.create({
      data: {
        name: nameJ,
        atcCode: 'J01CA04',
        form: 'Tablett',
        source: 'user',
        nplId: null,
        therapeuticClass: 'J',
      },
    });

    const cumN = await prisma.careUnitMedication.create({
      data: {
        careUnitId: TEST_APOTEKARE.careUnitId,
        medicationId: medN.id,
        currentStock: 100,
        lowStockThreshold: 10,
      },
    });
    const cumJ = await prisma.careUnitMedication.create({
      data: {
        careUnitId: TEST_APOTEKARE.careUnitId,
        medicationId: medJ.id,
        currentStock: 100,
        lowStockThreshold: 10,
      },
    });

    try {
      // Filter to therapeuticClass=N — both seeded rows should appear in the
      // careUnit but only the 'N' one matches. Use a high page size so any
      // seed noise doesn't push the test rows off the page.
      const res = await app.inject({
        method: 'GET',
        url: '/api/medications?therapeuticClass=N&pageSize=100',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = medicationListResponse.parse(res.json());

      // The N-class seed row must appear in the result set.
      const namesInResponse = body.rows.map((r) => r.name);
      expect(namesInResponse).toContain(nameN);

      // The J-class seed row MUST NOT appear — the filter is exclusive.
      expect(namesInResponse).not.toContain(nameJ);

      // Every returned row carries therapeuticClass === 'N'.
      for (const row of body.rows) {
        expect(row.therapeuticClass).toBe('N');
      }
    } finally {
      // Cleanup — delete the test CUMs and the two test Medications.
      // CareUnitMedication first (FK to Medication).
      await prisma.careUnitMedication.delete({ where: { id: cumN.id } });
      await prisma.careUnitMedication.delete({ where: { id: cumJ.id } });
      await prisma.medication.delete({ where: { id: medN.id } });
      await prisma.medication.delete({ where: { id: medJ.id } });
    }
  });

  it('Test 2 (user-source persistence): PATCH therapeuticClass=J on a user-source med persists', async () => {
    const cookie = await loginAs(app, TEST_APOTEKARE);

    // Seed a user-source med with no class set.
    const med = await prisma.medication.create({
      data: {
        name: `__phase6plan02_test2_user_${Date.now()}`,
        atcCode: 'A02BC01',
        form: 'Tablett',
        source: 'user',
        nplId: null,
        therapeuticClass: null,
      },
    });
    const cum = await prisma.careUnitMedication.create({
      data: {
        careUnitId: TEST_APOTEKARE.careUnitId,
        medicationId: med.id,
        currentStock: 50,
        lowStockThreshold: 5,
      },
    });

    try {
      // PATCH therapeuticClass: 'J' — expect 200 + the returned row carries
      // the new value via the toListItem mapping.
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/medications/${cum.id}`,
        headers: { cookie },
        payload: { therapeuticClass: 'J' },
      });
      expect(patchRes.statusCode).toBe(200);
      const patched = medicationListItem.parse(patchRes.json());
      expect(patched.therapeuticClass).toBe('J');

      // Reload via DB to confirm persistence on the global Medication row
      // (not just on the response object).
      const reloaded = await prisma.medication.findUniqueOrThrow({
        where: { id: med.id },
      });
      expect(reloaded.therapeuticClass).toBe('J');
    } finally {
      await prisma.careUnitMedication.delete({ where: { id: cum.id } });
      await prisma.medication.delete({ where: { id: med.id } });
    }
  });

  it('Test 3 (D-32 carve-out, D-115): PATCH therapeuticClass=N on an NPL-source med succeeds', async () => {
    const cookie = await loginAs(app, TEST_APOTEKARE);

    // Seed an NPL-source med (nplId non-null, source='npl'). Classification
    // metadata is editable on NPL meds per D-32 carve-out documented in
    // D-115; identity fields (name/atc/form/strength) remain server-side
    // stripped (verified by other Phase 2 tests, not this one).
    const med = await prisma.medication.create({
      data: {
        name: `__phase6plan02_test3_npl_${Date.now()}`,
        atcCode: 'N02BE01',
        form: 'Tablett',
        strength: '500 mg',
        source: 'npl',
        nplId: `phase6_plan02_test3_npl_${Date.now()}`,
        therapeuticClass: null,
      },
    });
    const cum = await prisma.careUnitMedication.create({
      data: {
        careUnitId: TEST_APOTEKARE.careUnitId,
        medicationId: med.id,
        currentStock: 50,
        lowStockThreshold: 5,
      },
    });

    try {
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/medications/${cum.id}`,
        headers: { cookie },
        payload: { therapeuticClass: 'N' },
      });
      expect(patchRes.statusCode).toBe(200);
      const patched = medicationListItem.parse(patchRes.json());
      expect(patched.therapeuticClass).toBe('N');
      // Source unchanged — Test 3's whole point is that NPL identity
      // (source='npl') is preserved while classification is editable.
      expect(patched.source).toBe('npl');

      // Reload via DB to confirm the global Medication row carries the new
      // value AND its NPL-locked fields (name/atc/form/strength) were NOT
      // modified by this PATCH.
      const reloaded = await prisma.medication.findUniqueOrThrow({
        where: { id: med.id },
      });
      expect(reloaded.therapeuticClass).toBe('N');
      expect(reloaded.source).toBe('npl');
      expect(reloaded.name).toBe(med.name);
      expect(reloaded.atcCode).toBe(med.atcCode);
      expect(reloaded.form).toBe(med.form);
      expect(reloaded.strength).toBe(med.strength);
    } finally {
      await prisma.careUnitMedication.delete({ where: { id: cum.id } });
      await prisma.medication.delete({ where: { id: med.id } });
    }
  });

  it('Test 4 (audit, D-95 + D-97 extension): medication.update event surfaces therapeuticClass in after JSON', async () => {
    const cookie = await loginAs(app, TEST_APOTEKARE);

    const med = await prisma.medication.create({
      data: {
        name: `__phase6plan02_test4_audit_${Date.now()}`,
        atcCode: 'A02BC02',
        form: 'Tablett',
        source: 'user',
        nplId: null,
        therapeuticClass: null,
      },
    });
    const cum = await prisma.careUnitMedication.create({
      data: {
        careUnitId: TEST_APOTEKARE.careUnitId,
        medicationId: med.id,
        currentStock: 50,
        lowStockThreshold: 5,
      },
    });

    const testStartedAt = new Date();

    try {
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/medications/${cum.id}`,
        headers: { cookie },
        payload: { therapeuticClass: 'J' },
      });
      expect(patchRes.statusCode).toBe(200);

      // Look up the audit row created by the PATCH above. D-93: the Phase 5
      // $extends middleware intercepts `update` on Medication and writes
      // an audit_events row whose defaultAction is plain `'update'`
      // (auditExtension.ts:172 — no overrideAction is set for a vanilla
      // Medication update). D-97 extension: the Medication allowlist now
      // includes 'therapeuticClass', so it appears in the after JSON.
      const row = await prisma.auditEvent.findFirst({
        where: {
          entityType: 'medication',
          entityId: med.id,
          action: 'update',
          createdAt: { gte: testStartedAt },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(row).not.toBeNull();

      const after = row!.after as Record<string, unknown> | null;
      expect(after).not.toBeNull();
      // D-97 extension — the new column is structurally present in the
      // after JSON because auditAllowlist.ts:AUDIT_ALLOWLIST.Medication
      // includes 'therapeuticClass'.
      expect(after).toHaveProperty('therapeuticClass');
      expect((after as Record<string, unknown>).therapeuticClass).toBe('J');
    } finally {
      await prisma.careUnitMedication.delete({ where: { id: cum.id } });
      await prisma.medication.delete({ where: { id: med.id } });
    }
  });
});
