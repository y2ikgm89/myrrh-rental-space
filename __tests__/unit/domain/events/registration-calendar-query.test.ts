import { beforeEach, describe, expect, mock, test } from "bun:test";
import { RegistrationStatus } from "@generated/prisma/enums";

type CalendarRegistrationRow = {
  id: string;
  name: string;
  quantity: number;
  icsSequence: number;
  status: RegistrationStatus;
  slot: { startAt: Date; endAt: Date };
  event: {
    title: string;
    format: "ONLINE" | "OFFLINE" | "HYBRID";
    meetingUrl: string | null;
    addressDetail: string | null;
    location: { name: string } | null;
    space: { name: string } | null;
  };
};

const mockRegistrationFindFirst = mock<
  () => Promise<CalendarRegistrationRow | null>
>(() => Promise.resolve(null));

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    eventRegistration: {
      findFirst: mockRegistrationFindFirst,
    },
  },
}));

import { getEventRegistrationForCalendar } from "@/shared/domain/events/registration-queries";

function calendarRow(
  overrides: Partial<CalendarRegistrationRow> & {
    status: RegistrationStatus;
    meetingUrl?: string | null;
  },
): CalendarRegistrationRow {
  return {
    id: "reg-1",
    name: "山田 太郎",
    quantity: 1,
    icsSequence: 0,
    status: overrides.status,
    slot: {
      startAt: new Date("2026-05-01T01:00:00.000Z"),
      endAt: new Date("2026-05-01T03:00:00.000Z"),
    },
    event: {
      title: "オンライン講座",
      format: "ONLINE",
      meetingUrl:
        overrides.meetingUrl === undefined
          ? "https://meet.example.com/secret"
          : overrides.meetingUrl,
      addressDetail: null,
      location: null,
      space: null,
    },
  };
}

describe("getEventRegistrationForCalendar meetingUrl gate", () => {
  beforeEach(() => {
    mockRegistrationFindFirst.mockReset();
  });

  test("CONFIRMED のとき event.meetingUrl を返す", async () => {
    mockRegistrationFindFirst.mockResolvedValue(
      calendarRow({ status: RegistrationStatus.CONFIRMED }),
    );

    const result = await getEventRegistrationForCalendar({
      registrationId: "reg-1",
      customerId: "cust-1",
    });

    expect(result?.status).toBe(RegistrationStatus.CONFIRMED);
    expect(result?.meetingUrl).toBe("https://meet.example.com/secret");
  });

  test("CANCELLED のとき meetingUrl は null（cancel ICS 用に行自体は返す）", async () => {
    mockRegistrationFindFirst.mockResolvedValue(
      calendarRow({ status: RegistrationStatus.CANCELLED }),
    );

    const result = await getEventRegistrationForCalendar({
      registrationId: "reg-1",
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe(RegistrationStatus.CANCELLED);
    expect(result?.meetingUrl).toBeNull();
  });

  test("WAITLISTED のとき meetingUrl は null", async () => {
    mockRegistrationFindFirst.mockResolvedValue(
      calendarRow({ status: RegistrationStatus.WAITLISTED }),
    );

    const result = await getEventRegistrationForCalendar({
      registrationId: "reg-1",
    });

    expect(result?.meetingUrl).toBeNull();
  });

  test("WAITLISTED_OFFERED のとき meetingUrl は null", async () => {
    mockRegistrationFindFirst.mockResolvedValue(
      calendarRow({ status: RegistrationStatus.WAITLISTED_OFFERED }),
    );

    const result = await getEventRegistrationForCalendar({
      registrationId: "reg-1",
    });

    expect(result?.meetingUrl).toBeNull();
  });
});
