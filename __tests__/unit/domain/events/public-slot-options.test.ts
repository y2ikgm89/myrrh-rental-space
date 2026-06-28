import { describe, expect, test } from "bun:test";
import {
  buildPublicEventSlotOptions,
  derivePublicEventRegistrationState,
  shouldExposePublicEventSlotSelector,
} from "@/shared/domain/events/public-slot-options";

const NOW = new Date("2026-05-01T03:30:00.000Z");

describe("public event slot options", () => {
  test("null registrationDeadline uses each slot start time, so later slots remain available", () => {
    const slots = buildPublicEventSlotOptions({
      now: NOW,
      registrationDeadline: null,
      slots: [
        {
          id: "slot-past",
          startAt: "2026-05-01T02:00:00.000Z",
          endAt: "2026-05-01T03:00:00.000Z",
          capacity: 10,
          confirmedCount: 0,
        },
        {
          id: "slot-future",
          startAt: "2026-05-01T05:00:00.000Z",
          endAt: "2026-05-01T06:00:00.000Z",
          capacity: 10,
          confirmedCount: 3,
        },
      ],
    });

    expect(slots).toEqual([
      {
        id: "slot-past",
        startTime: "2026-05-01T02:00:00.000Z",
        endTime: "2026-05-01T03:00:00.000Z",
        capacity: 10,
        confirmedCount: 0,
        remaining: 10,
        status: "deadline-passed",
      },
      {
        id: "slot-future",
        startTime: "2026-05-01T05:00:00.000Z",
        endTime: "2026-05-01T06:00:00.000Z",
        capacity: 10,
        confirmedCount: 3,
        remaining: 7,
        status: "available",
      },
    ]);

    expect(
      derivePublicEventRegistrationState({
        eventStatus: "PUBLISHED",
        registrationOpen: true,
        slots,
      }),
    ).toEqual({
      kind: "open",
      availableSlotCount: 1,
      remainingCapacity: 7,
    });
  });

  test("global registrationDeadline closes every slot when it has passed", () => {
    const slots = buildPublicEventSlotOptions({
      now: NOW,
      registrationDeadline: "2026-05-01T03:00:00.000Z",
      slots: [
        {
          id: "slot-future",
          startAt: "2026-05-01T05:00:00.000Z",
          endAt: "2026-05-01T06:00:00.000Z",
          capacity: 10,
          confirmedCount: 0,
        },
      ],
    });

    expect(slots[0]?.status).toBe("deadline-passed");
    expect(
      derivePublicEventRegistrationState({
        eventStatus: "PUBLISHED",
        registrationOpen: true,
        slots,
      }),
    ).toEqual({ kind: "deadline-passed" });
  });

  test("future sold-out slots produce full state instead of deadline-passed", () => {
    const slots = buildPublicEventSlotOptions({
      now: NOW,
      registrationDeadline: null,
      slots: [
        {
          id: "slot-full",
          startAt: "2026-05-01T05:00:00.000Z",
          endAt: "2026-05-01T06:00:00.000Z",
          capacity: 5,
          confirmedCount: 5,
        },
      ],
    });

    expect(slots[0]?.status).toBe("sold-out");
    expect(
      derivePublicEventRegistrationState({
        eventStatus: "PUBLISHED",
        registrationOpen: true,
        slots,
      }),
    ).toEqual({ kind: "full" });
  });

  test("draft or closed events do not expose registration even with available slots", () => {
    const slots = buildPublicEventSlotOptions({
      now: NOW,
      registrationDeadline: null,
      slots: [
        {
          id: "slot-future",
          startAt: "2026-05-01T05:00:00.000Z",
          endAt: "2026-05-01T06:00:00.000Z",
          capacity: 10,
          confirmedCount: 0,
        },
      ],
    });

    expect(
      derivePublicEventRegistrationState({
        eventStatus: "DRAFT",
        registrationOpen: true,
        slots,
      }),
    ).toEqual({ kind: "closed" });
    expect(
      derivePublicEventRegistrationState({
        eventStatus: "PUBLISHED",
        registrationOpen: false,
        slots,
      }),
    ).toEqual({ kind: "closed" });
  });

  test("single occurrence events do not expose a slot selector", () => {
    expect(
      shouldExposePublicEventSlotSelector({
        scheduleMode: "SINGLE_OCCURRENCE",
        slots: [
          {
            id: "slot-1",
            startTime: "2026-05-01T05:00:00.000Z",
            endTime: "2026-05-01T06:00:00.000Z",
            capacity: 10,
            confirmedCount: 0,
            remaining: 10,
            status: "available",
          },
        ],
      }),
    ).toBe(false);
  });

  test("timed entry events expose a slot selector only when multiple slots exist", () => {
    const slot = {
      id: "slot-1",
      startTime: "2026-05-01T05:00:00.000Z",
      endTime: "2026-05-01T06:00:00.000Z",
      capacity: 10,
      confirmedCount: 0,
      remaining: 10,
      status: "available" as const,
    };

    expect(
      shouldExposePublicEventSlotSelector({
        scheduleMode: "TIMED_ENTRY",
        slots: [
          slot,
          {
            ...slot,
            id: "slot-2",
            startTime: "2026-05-01T07:00:00.000Z",
            endTime: "2026-05-01T08:00:00.000Z",
          },
        ],
      }),
    ).toBe(true);

    expect(
      shouldExposePublicEventSlotSelector({
        scheduleMode: "TIMED_ENTRY",
        slots: [slot],
      }),
    ).toBe(false);
  });
});
