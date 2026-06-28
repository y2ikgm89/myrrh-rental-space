import { beforeEach, describe, expect, mock, test } from "bun:test";
import { RegistrationStatus } from "@generated/prisma/enums";

type RegistrationEmailRow = {
  id: string;
  eventId: string;
  slotId: string;
  slot: {
    startAt: Date;
    endAt: Date;
    capacity: number;
  };
  event: {
    addressDetail: string | null;
    location: { name: string } | null;
    space: { name: string } | null;
  };
};

type ExportRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  quantity: number;
  status: RegistrationStatus;
  cancelledAt: Date | null;
  attendedAt: Date | null;
  createdAt: Date;
  slot: {
    startAt: Date;
    endAt: Date;
  };
  event: {
    title: string;
    addressDetail: string | null;
    location: { name: string } | null;
    space: { name: string } | null;
  };
};

const mockRegistrationFindFirst = mock<
  () => Promise<RegistrationEmailRow | null>
>(() => Promise.resolve(null));
const mockRegistrationAggregate = mock<
  () => Promise<{ _sum: { quantity: number | null } }>
>(() => Promise.resolve({ _sum: { quantity: null } }));
const mockRegistrationFindMany = mock<() => Promise<ExportRow[]>>(() =>
  Promise.resolve([]),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    eventRegistration: {
      findFirst: mockRegistrationFindFirst,
      aggregate: mockRegistrationAggregate,
      findMany: mockRegistrationFindMany,
    },
  },
}));

import { getEventRegistrationDetailsForEmail } from "@/shared/domain/events/registration-queries";
import { getEventRegistrationsForExport } from "@/shared/domain/events/export-queries";

describe("event registration query slot consistency", () => {
  beforeEach(() => {
    mockRegistrationFindFirst.mockReset();
    mockRegistrationAggregate.mockReset();
    mockRegistrationFindMany.mockReset();
  });

  test("email details use the registration slot rather than the event first slot", async () => {
    const selectedStart = new Date("2026-05-02T05:00:00.000Z");
    const selectedEnd = new Date("2026-05-02T06:00:00.000Z");
    mockRegistrationFindFirst.mockResolvedValue({
      id: "reg-1",
      eventId: "event-1",
      slotId: "slot-selected",
      slot: {
        startAt: selectedStart,
        endAt: selectedEnd,
        capacity: 8,
      },
      event: {
        addressDetail: "3F",
        location: { name: "青山" },
        space: { name: "Room A" },
      },
    });
    mockRegistrationAggregate.mockResolvedValue({
      _sum: { quantity: 6 },
    });

    const details = await getEventRegistrationDetailsForEmail("reg-1");

    expect(details).toEqual({
      startTime: selectedStart,
      endTime: selectedEnd,
      location: "青山 / Room A（3F）",
      capacity: 8,
      confirmedCount: 6,
    });
    expect(mockRegistrationAggregate).toHaveBeenCalledWith({
      where: {
        slotId: "slot-selected",
        status: RegistrationStatus.CONFIRMED,
      },
      _sum: { quantity: true },
    });
  });

  test("CSV export uses each registration slot as the event datetime", async () => {
    const selectedStart = new Date("2026-05-03T07:00:00.000Z");
    const selectedEnd = new Date("2026-05-03T08:00:00.000Z");
    mockRegistrationFindMany.mockResolvedValue([
      {
        id: "reg-2",
        name: "佐藤花子",
        email: "sato@example.com",
        phone: null,
        note: null,
        quantity: 2,
        status: RegistrationStatus.CONFIRMED,
        cancelledAt: null,
        attendedAt: null,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        slot: {
          startAt: selectedStart,
          endAt: selectedEnd,
        },
        event: {
          title: "複数枠イベント",
          addressDetail: null,
          location: { name: "青山" },
          space: null,
        },
      },
    ]);

    const rows = await getEventRegistrationsForExport("event-1");

    expect(rows[0]?.event.startTime).toBe(selectedStart);
    expect(rows[0]?.event.endTime).toBe(selectedEnd);
    expect(rows[0]?.event.location).toBe("青山");
  });
});
