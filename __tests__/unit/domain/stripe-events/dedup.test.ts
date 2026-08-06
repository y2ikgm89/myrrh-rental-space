import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockCreate = mock<(args: unknown) => Promise<unknown>>();
const mockFindUnique = mock<(args: unknown) => Promise<unknown>>();
const mockUpdate = mock<(args: unknown) => Promise<unknown>>();

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    stripeEvent: {
      create: (args: unknown) => mockCreate(args),
      findUnique: (args: unknown) => mockFindUnique(args),
      update: (args: unknown) => mockUpdate(args),
    },
  },
}));

mock.module("@/shared/lib/prisma-errors", () => ({
  isPrismaUniqueConstraintError: (error: unknown, field?: string) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return field === undefined || field === "StripeEvent.id";
    }
    return false;
  },
}));

const { claimStripeEventForProcessing, markStripeEventProcessed } =
  await import("@/shared/domain/stripe-events/dedup");

describe("claimStripeEventForProcessing", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  test("新規 insert 成功 → claimed", async () => {
    mockCreate.mockResolvedValueOnce({ id: "evt_1" });
    await expect(
      claimStripeEventForProcessing({
        eventId: "evt_1",
        eventType: "checkout.session.completed",
      }),
    ).resolves.toBe("claimed");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  test("P2002 + processedAt あり → already_processed", async () => {
    mockCreate.mockRejectedValueOnce({ code: "P2002" });
    mockFindUnique.mockResolvedValueOnce({
      processedAt: new Date("2026-07-23T00:00:00Z"),
    });
    await expect(
      claimStripeEventForProcessing({
        eventId: "evt_1",
        eventType: "checkout.session.completed",
      }),
    ).resolves.toBe("already_processed");
  });

  test("P2002 + processedAt null → retry_unprocessed", async () => {
    mockCreate.mockRejectedValueOnce({ code: "P2002" });
    mockFindUnique.mockResolvedValueOnce({ processedAt: null });
    await expect(
      claimStripeEventForProcessing({
        eventId: "evt_1",
        eventType: "checkout.session.completed",
      }),
    ).resolves.toBe("retry_unprocessed");
  });
});

describe("markStripeEventProcessed", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
  });

  test("processedAt を更新する", async () => {
    mockUpdate.mockResolvedValueOnce({ id: "evt_1" });
    await markStripeEventProcessed("evt_1");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt_1" },
        data: expect.objectContaining({ processedAt: expect.any(Date) }),
      }),
    );
  });
});
