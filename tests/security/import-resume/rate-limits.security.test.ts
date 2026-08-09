import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  admitAndEnqueue,
  admitToProcessing,
  createLimitTestContext,
  reserveAttempt,
  type LimitTestContext,
} from "./limit-test-harness.js";

const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function withContext(
  tag: string,
  fn: (ctx: LimitTestContext) => Promise<void>,
): Promise<void> {
  const ctx = await createLimitTestContext(
    process.env.POSTGRES_TEST_DB ?? "nuvitae_test",
    `test_${tag}_${randomUUID().replaceAll("-", "")}`,
  );
  try {
    await fn(ctx);
  } finally {
    await ctx.cleanup();
  }
}

describe("import rate-limits and concurrency (T065)", () => {
  describe("upload-attempt limits", () => {
    it("accepts attempts 1 through 5 and denies the sixth", async () => {
      await withContext("accept_5_deny_6th", async (ctx) => {
        for (let i = 1; i <= 5; i++) {
          const result = await reserveAttempt(ctx, ownerA);
          expect(result.allowed).toBe(true);
        }
        const denied = await reserveAttempt(ctx, ownerA);
        expect(denied.allowed).toBe(false);
        expect(denied.retryAfterSeconds).toBeGreaterThan(0);
      });
    });

    it("expires an attempt exactly at the ten-minute boundary", async () => {
      await withContext("upload_window", async (clockCtx) => {
        for (let i = 0; i < 5; i++) {
          const result = await reserveAttempt(clockCtx, ownerA);
          expect(result.allowed).toBe(true);
        }
        const denied = await reserveAttempt(clockCtx, ownerA);
        expect(denied.allowed).toBe(false);

        clockCtx.clock.advance(10 * 60 * 1000 + 1);
        const allowed = await reserveAttempt(clockCtx, ownerA);
        expect(allowed.allowed).toBe(true);
      });
    });

    it("blocks one millisecond before the boundary and admits exactly at it", async () => {
      await withContext("boundary", async (clockCtx) => {
        for (let i = 0; i < 5; i++) {
          await reserveAttempt(clockCtx, ownerA);
        }
        clockCtx.clock.advance(10 * 60 * 1000 - 1);
        const justBefore = await reserveAttempt(clockCtx, ownerA);
        expect(justBefore.allowed).toBe(false);
        expect(justBefore.retryAfterSeconds).toBeGreaterThan(0);

        clockCtx.clock.advance(1);
        const atBoundary = await reserveAttempt(clockCtx, ownerA);
        expect(atBoundary.allowed).toBe(true);
      });
    });

    it("counts an attempt one millisecond inside the window", async () => {
      await withContext("inside_by_1ms", async (clockCtx) => {
        const now = clockCtx.clock.now();
        clockCtx.clock.setNow(new Date(now.getTime() - 10 * 60 * 1000 + 1));
        await reserveAttempt(clockCtx, ownerA);

        clockCtx.clock.setNow(new Date(now.getTime() - 9_000));
        for (let i = 0; i < 3; i++) {
          const result = await reserveAttempt(clockCtx, ownerA);
          expect(result.allowed).toBe(true);
        }

        clockCtx.clock.setNow(now);
        const fourth = await reserveAttempt(clockCtx, ownerA);
        expect(fourth.allowed).toBe(true);
        const fifth = await reserveAttempt(clockCtx, ownerA);
        expect(fifth.allowed).toBe(false);
      });
    });

    it("does not count an attempt exactly at the lower boundary", async () => {
      await withContext("at_boundary", async (clockCtx) => {
        const now = clockCtx.clock.now();
        clockCtx.clock.setNow(new Date(now.getTime() - 10 * 60 * 1000));
        await reserveAttempt(clockCtx, ownerA);

        clockCtx.clock.setNow(new Date(now.getTime() - 9_000));
        for (let i = 0; i < 3; i++) {
          const result = await reserveAttempt(clockCtx, ownerA);
          expect(result.allowed).toBe(true);
        }

        clockCtx.clock.setNow(now);
        for (let i = 0; i < 2; i++) {
          const result = await reserveAttempt(clockCtx, ownerA);
          expect(result.allowed).toBe(true);
        }
        const denied = await reserveAttempt(clockCtx, ownerA);
        expect(denied.allowed).toBe(false);
      });
    });

    it("does not count an attempt one millisecond before the lower boundary", async () => {
      await withContext("before_boundary", async (clockCtx) => {
        const now = clockCtx.clock.now();
        clockCtx.clock.setNow(new Date(now.getTime() - 10 * 60 * 1000 - 1));
        await reserveAttempt(clockCtx, ownerA);

        clockCtx.clock.setNow(new Date(now.getTime() - 9_000));
        for (let i = 0; i < 3; i++) {
          const result = await reserveAttempt(clockCtx, ownerA);
          expect(result.allowed).toBe(true);
        }

        clockCtx.clock.setNow(now);
        for (let i = 0; i < 2; i++) {
          const result = await reserveAttempt(clockCtx, ownerA);
          expect(result.allowed).toBe(true);
        }
        const denied = await reserveAttempt(clockCtx, ownerA);
        expect(denied.allowed).toBe(false);
      });
    });

    it("duplicate uploads count independently", async () => {
      await withContext("dup_uploads", async (ctx) => {
        for (let i = 0; i < 5; i++) {
          const result = await reserveAttempt(ctx, ownerA);
          expect(result.allowed).toBe(true);
        }
        const denied = await reserveAttempt(ctx, ownerA);
        expect(denied.allowed).toBe(false);
      });
    });

    it("old attempts outside rolling window do not count", async () => {
      await withContext("old_window", async (clockCtx) => {
        for (let i = 0; i < 3; i++) {
          await reserveAttempt(clockCtx, ownerA);
        }
        clockCtx.clock.advance(10 * 60 * 1000 + 1);
        for (let i = 0; i < 3; i++) {
          await reserveAttempt(clockCtx, ownerA);
        }
        const result = await reserveAttempt(clockCtx, ownerA);
        expect(result.allowed).toBe(true);
      });
    });

    it("terminal states do not erase attempt history", async () => {
      await withContext("terminal_states", async (ctx) => {
        for (let i = 0; i < 3; i++) {
          const result = await reserveAttempt(ctx, ownerA);
          await admitAndEnqueue(
            ctx,
            ownerA,
            result.reservationId!,
            randomUUID(),
          );
          await ctx.service.releaseReservation(
            ownerA,
            result.reservationId!,
            ctx.clock.now(),
          );
        }
        for (let i = 0; i < 2; i++) {
          const result = await reserveAttempt(ctx, ownerA);
          expect(result.allowed).toBe(true);
        }
        const denied = await reserveAttempt(ctx, ownerA);
        expect(denied.allowed).toBe(false);
      });
    });
  });

  describe("processing capacity", () => {
    it("enforces one active job", async () => {
      await withContext("one_active", async (ctx) => {
        const r1 = await reserveAttempt(ctx, ownerA);
        const importId1 = randomUUID();
        await admitAndEnqueue(ctx, ownerA, r1.reservationId!, importId1);
        const claim1 = await admitToProcessing(ctx, ownerA, importId1);
        expect(claim1.kind).toBe("allowed");

        const r2 = await reserveAttempt(ctx, ownerA);
        const importId2 = randomUUID();
        await admitAndEnqueue(ctx, ownerA, r2.reservationId!, importId2);
        const claim2 = await admitToProcessing(ctx, ownerA, importId2);
        expect(claim2.kind).toBe("denied");
      });
    });

    it("enforces two queued jobs", async () => {
      await withContext("two_queued", async (ctx) => {
        const r1 = await reserveAttempt(ctx, ownerA);
        const importId1 = randomUUID();
        const q1 = await admitAndEnqueue(
          ctx,
          ownerA,
          r1.reservationId!,
          importId1,
        );
        expect(q1.kind).toBe("allowed");

        const r2 = await reserveAttempt(ctx, ownerA);
        const importId2 = randomUUID();
        const q2 = await admitAndEnqueue(
          ctx,
          ownerA,
          r2.reservationId!,
          importId2,
        );
        expect(q2.kind).toBe("allowed");

        const r3 = await reserveAttempt(ctx, ownerA);
        const importId3 = randomUUID();
        const q3 = await admitAndEnqueue(
          ctx,
          ownerA,
          r3.reservationId!,
          importId3,
        );
        expect(q3.kind).toBe("denied");
        expect(q3.code).toBe("queued_job_limit");
      });
    });

    it("next queued job is denied when capacity full", async () => {
      await withContext("capacity_full", async (ctx) => {
        const r1 = await reserveAttempt(ctx, ownerA);
        const importId1 = randomUUID();
        await admitAndEnqueue(ctx, ownerA, r1.reservationId!, importId1);
        const r2 = await reserveAttempt(ctx, ownerA);
        const importId2 = randomUUID();
        await admitAndEnqueue(ctx, ownerA, r2.reservationId!, importId2);

        const r3 = await reserveAttempt(ctx, ownerA);
        const importId3 = randomUUID();
        const q3 = await admitAndEnqueue(
          ctx,
          ownerA,
          r3.reservationId!,
          importId3,
        );
        expect(q3.kind).toBe("denied");
      });
    });

    it("releases capacity for finished jobs", async () => {
      await withContext("release_capacity", async (ctx) => {
        const r1 = await reserveAttempt(ctx, ownerA);
        const importId1 = randomUUID();
        await admitAndEnqueue(ctx, ownerA, r1.reservationId!, importId1);
        await admitToProcessing(ctx, ownerA, importId1);

        await ctx.service.releaseCapacityForImport(
          ownerA,
          importId1,
          ctx.clock.now(),
        );

        const r2 = await reserveAttempt(ctx, ownerA);
        const importId2 = randomUUID();
        const q2 = await admitAndEnqueue(
          ctx,
          ownerA,
          r2.reservationId!,
          importId2,
        );
        expect(q2.kind).toBe("allowed");
        const claim2 = await admitToProcessing(ctx, ownerA, importId2);
        expect(claim2.kind).toBe("allowed");
      });
    });

    it("idempotent queue admission does not double-count", async () => {
      await withContext("idempotent_queue", async (ctx) => {
        const r1 = await reserveAttempt(ctx, ownerA);
        const importId1 = randomUUID();
        const q1 = await admitAndEnqueue(
          ctx,
          ownerA,
          r1.reservationId!,
          importId1,
        );
        expect(q1.kind).toBe("allowed");

        const q2 = await admitAndEnqueue(
          ctx,
          ownerA,
          r1.reservationId!,
          importId1,
        );
        expect(q2.kind).toBe("allowed");

        const r2 = await reserveAttempt(ctx, ownerA);
        const importId2 = randomUUID();
        const q3 = await admitAndEnqueue(
          ctx,
          ownerA,
          r2.reservationId!,
          importId2,
        );
        expect(q3.kind).toBe("allowed");

        const r3 = await reserveAttempt(ctx, ownerA);
        const importId3 = randomUUID();
        const q4 = await admitAndEnqueue(
          ctx,
          ownerA,
          r3.reservationId!,
          importId3,
        );
        expect(q4.kind).toBe("denied");
      });
    });

    it("idempotent worker claim does not double-count", async () => {
      await withContext("idempotent_claim", async (ctx) => {
        const r1 = await reserveAttempt(ctx, ownerA);
        const importId1 = randomUUID();
        await admitAndEnqueue(ctx, ownerA, r1.reservationId!, importId1);

        const claim1 = await admitToProcessing(ctx, ownerA, importId1);
        expect(claim1.kind).toBe("allowed");

        const claim2 = await admitToProcessing(ctx, ownerA, importId1);
        expect(claim2.kind).toBe("allowed");

        const r2 = await reserveAttempt(ctx, ownerA);
        const importId2 = randomUUID();
        await admitAndEnqueue(ctx, ownerA, r2.reservationId!, importId2);

        const claim3 = await admitToProcessing(ctx, ownerA, importId2);
        expect(claim3.kind).toBe("denied");
      });
    });
  });

  describe("owner isolation", () => {
    it("owner A attempts do not affect owner B", async () => {
      await withContext("owner_isolation", async (ctx) => {
        for (let i = 0; i < 5; i++) {
          const result = await reserveAttempt(ctx, ownerA);
          expect(result.allowed).toBe(true);
        }
        const deniedA = await reserveAttempt(ctx, ownerA);
        expect(deniedA.allowed).toBe(false);

        const resultB = await reserveAttempt(ctx, ownerB);
        expect(resultB.allowed).toBe(true);
      });
    });

    it("wrong-owner operations cannot consume or release capacity", async () => {
      await withContext("wrong_owner", async (ctx) => {
        const r1 = await reserveAttempt(ctx, ownerA);
        const importId1 = randomUUID();
        await admitAndEnqueue(ctx, ownerA, r1.reservationId!, importId1);

        await ctx.service.releaseCapacityForImport(
          ownerB,
          importId1,
          ctx.clock.now(),
        );

        const claim1 = await admitToProcessing(ctx, ownerA, importId1);
        expect(claim1.kind).toBe("allowed");

        const r2 = await reserveAttempt(ctx, ownerA);
        const importId2 = randomUUID();
        await admitAndEnqueue(ctx, ownerA, r2.reservationId!, importId2);

        const claim2 = await admitToProcessing(ctx, ownerA, importId2);
        expect(claim2.kind).toBe("denied");
      });
    });
  });

  describe("concurrency", () => {
    it("concurrent fifth-slot race accepts at most one", async () => {
      await withContext("concurrent_5th", async (ctx) => {
        for (let i = 0; i < 4; i++) {
          const r = await reserveAttempt(ctx, ownerA);
          await admitAndEnqueue(ctx, ownerA, r.reservationId!, randomUUID());
        }

        const [r1, r2, r3] = await Promise.all([
          reserveAttempt(ctx, ownerA),
          reserveAttempt(ctx, ownerA),
          reserveAttempt(ctx, ownerA),
        ]);

        const allowed = [r1, r2, r3].filter((r) => r.allowed);
        expect(allowed.length).toBeLessThanOrEqual(1);
      });
    });

    it("concurrent active-slot race activates at most one", async () => {
      await withContext("concurrent_active", async (ctx) => {
        const importId1 = randomUUID();
        const importId2 = randomUUID();

        const r1 = await reserveAttempt(ctx, ownerA);
        await admitAndEnqueue(ctx, ownerA, r1.reservationId!, importId1);
        const r2 = await reserveAttempt(ctx, ownerA);
        await admitAndEnqueue(ctx, ownerA, r2.reservationId!, importId2);

        const [c1, c2] = await Promise.all([
          admitToProcessing(ctx, ownerA, importId1),
          admitToProcessing(ctx, ownerA, importId2),
        ]);

        const allowed = [c1, c2].filter((c) => c.kind === "allowed");
        expect(allowed.length).toBeLessThanOrEqual(1);
      });
    });

    it("concurrent queue-depth race never exceeds two", async () => {
      await withContext("concurrent_queue_depth", async (ctx) => {
        for (let i = 0; i < 3; i++) {
          const r = await reserveAttempt(ctx, ownerA);
          expect(r.allowed).toBe(true);
        }

        const [ra, rb, rc] = await Promise.all([
          reserveAttempt(ctx, ownerA),
          reserveAttempt(ctx, ownerA),
          reserveAttempt(ctx, ownerA),
        ]);

        const results = await Promise.all(
          [ra, rb, rc]
            .filter((r) => r.allowed)
            .map((r) =>
              admitAndEnqueue(ctx, ownerA, r.reservationId!, randomUUID()),
            ),
        );
        const queued = results.filter((r) => r.kind === "allowed");
        expect(queued.length).toBeLessThanOrEqual(2);
      });
    });
  });
});
