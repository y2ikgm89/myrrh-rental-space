import { describe, expect, test } from "bun:test";
import { validateStatusTransition } from "@/shared/domain/reservations/status";
import { ReservationStatus } from "@generated/prisma/enums";

describe("validateStatusTransition", () => {
  const allowedTransitions: [ReservationStatus, ReservationStatus][] = [
    [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
    [ReservationStatus.PENDING, ReservationStatus.CANCELLED],
    [ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED],
    [ReservationStatus.CONFIRMED, ReservationStatus.NO_SHOW],
    [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED],
  ];

  for (const [from, to] of allowedTransitions) {
    test(`${from} → ${to} is allowed`, () => {
      expect(() => validateStatusTransition(from, to)).not.toThrow();
    });
  }

  const terminalStatuses = [
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
    ReservationStatus.NO_SHOW,
  ];

  for (const terminal of terminalStatuses) {
    for (const target of Object.values(ReservationStatus)) {
      if (terminal === target) continue;
      test(`${terminal} → ${target} is rejected`, () => {
        expect(() => validateStatusTransition(terminal, target)).toThrow();
      });
    }
  }

  test("PENDING → COMPLETED is rejected", () => {
    expect(() =>
      validateStatusTransition(
        ReservationStatus.PENDING,
        ReservationStatus.COMPLETED,
      ),
    ).toThrow();
  });

  test("PENDING → NO_SHOW is rejected", () => {
    expect(() =>
      validateStatusTransition(
        ReservationStatus.PENDING,
        ReservationStatus.NO_SHOW,
      ),
    ).toThrow();
  });

  test("same status is allowed (no-op)", () => {
    expect(() =>
      validateStatusTransition(
        ReservationStatus.CONFIRMED,
        ReservationStatus.CONFIRMED,
      ),
    ).not.toThrow();
  });
});
