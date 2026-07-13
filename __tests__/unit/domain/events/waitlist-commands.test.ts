/**
 * waitlist-commands.ts の offerNextWaitlistEntryCommand テスト。
 *
 * tx を module-level mock ではなく引数として直接渡す設計のため、mock.module() は
 * 不要（プレーンな jest.fn() スタブを持つオブジェクトを渡すだけで検証できる）。
 */

import { describe, expect, it, jest } from "bun:test";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  offerNextWaitlistEntryCommand,
  WAITLIST_OFFER_TTL_MS,
} from "@/shared/domain/events/waitlist-commands";

describe("offerNextWaitlistEntryCommand", () => {
  it("no candidate → promoted: null", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const updateMany = jest.fn();
    const tx = {
      eventRegistration: {
        findFirst,
        updateMany,
        findUnique: jest.fn(),
      },
    };
    const now = new Date("2026-07-13T10:00:00Z");
    const result = await offerNextWaitlistEntryCommand(tx, {
      slotId: "slot-1",
      ticketId: "ticket-1",
      now,
    });
    expect(result.promoted).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("FIFO head found → updateMany claim → returns promoted", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: "reg-1", email: "a@b.co" });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      eventRegistration: {
        findFirst,
        updateMany,
        findUnique: jest.fn(),
      },
    };
    const now = new Date("2026-07-13T10:00:00Z");
    const result = await offerNextWaitlistEntryCommand(tx, {
      slotId: "slot-1",
      ticketId: "ticket-1",
      now,
    });
    expect(result.promoted).toEqual({
      id: "reg-1",
      email: "a@b.co",
      offeredAt: now,
      expiresAt: new Date(now.getTime() + WAITLIST_OFFER_TTL_MS),
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slotId: "slot-1",
          ticketId: "ticket-1",
          status: RegistrationStatus.WAITLISTED,
        },
        orderBy: { waitlistedAt: "asc" },
      }),
    );
    // 二重昇格防止の atomic claim: WHERE に id + status: WAITLISTED の両方が
    // 揃っていないと、race で 2 箇所から呼ばれたときに同じ候補を二重に
    // WAITLISTED_OFFERED へ昇格させてしまう（このテストが唯一の安全網）。
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "reg-1",
          status: RegistrationStatus.WAITLISTED,
        }),
        data: expect.objectContaining({
          status: RegistrationStatus.WAITLISTED_OFFERED,
          offeredAt: now,
          expiresAt: new Date(now.getTime() + WAITLIST_OFFER_TTL_MS),
        }),
      }),
    );
  });

  it("candidate found but updateMany count=0 → race lost → null", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: "reg-1", email: "a@b.co" });
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      eventRegistration: {
        findFirst,
        updateMany,
        findUnique: jest.fn(),
      },
    };
    const now = new Date();
    const result = await offerNextWaitlistEntryCommand(tx, {
      slotId: "slot-1",
      ticketId: "ticket-1",
      now,
    });
    expect(result.promoted).toBeNull();
  });
});
