import { beforeEach, describe, expect, mock, test } from "bun:test";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";

type RegistrationEmailRow = {
  id: string;
  eventId: string;
  slotId: string;
  quantity: number;
  ticket: { price: number; name?: string };
  slot: {
    startAt: Date;
    endAt: Date;
    capacity?: number;
  };
  event: {
    id?: string;
    title: string;
    slug?: string;
    status?: string;
    format: string;
    meetingUrl: string | null;
    addressDetail: string | null;
    location: { name: string } | null;
    space: { name: string } | null;
  };
  status?: RegistrationStatus;
  cancelledAt?: Date | null;
  createdAt?: Date;
  waitlistedAt?: Date | null;
  offeredAt?: Date | null;
  expiresAt?: Date | null;
  paymentStatus?: string;
  ticketId?: string;
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
const mockRegistrationFindMany = mock((args?: Record<string, unknown>) => {
  const where = args?.["where"];
  if (
    where &&
    typeof where === "object" &&
    "customerId" in where &&
    where.customerId
  ) {
    return mockRegistrationFindManyForCustomer();
  }
  return Promise.resolve([] as ExportRow[]);
});
const mockRegistrationFindManyForCustomer = mock<
  () => Promise<RegistrationEmailRow[]>
>(() => Promise.resolve([]));

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

import {
  getEventRegistrationDetailsForEmail,
  findEventRegistrationsForReminderWindow,
  getCustomerEventRegistrationDetail,
  getCustomerEventRegistrations,
} from "@/shared/domain/events/registration-queries";
import { getEventRegistrationsForExport } from "@/shared/domain/events/export-queries";

describe("event registration query slot consistency", () => {
  beforeEach(() => {
    mockRegistrationFindFirst.mockReset();
    mockRegistrationAggregate.mockReset();
    mockRegistrationFindMany.mockReset();
    mockRegistrationFindManyForCustomer.mockReset();
    mockRegistrationFindMany.mockImplementation((args) => {
      const where = args?.["where"];
      if (
        where &&
        typeof where === "object" &&
        "customerId" in where &&
        where.customerId
      ) {
        return mockRegistrationFindManyForCustomer();
      }
      return Promise.resolve([] as ExportRow[]);
    });
  });

  test("email details use the registration slot rather than the event first slot", async () => {
    const selectedStart = new Date("2026-05-02T05:00:00.000Z");
    const selectedEnd = new Date("2026-05-02T06:00:00.000Z");
    mockRegistrationFindFirst.mockResolvedValue({
      id: "reg-1",
      eventId: "event-1",
      slotId: "slot-selected",
      quantity: 2,
      ticket: { price: 1500 },
      slot: {
        startAt: selectedStart,
        endAt: selectedEnd,
        capacity: 8,
      },
      event: {
        title: "テストイベント",
        addressDetail: "3F",
        location: { name: "青山" },
        space: { name: "Room A" },
        format: "OFFLINE",
        meetingUrl: null,
      },
    });
    mockRegistrationAggregate.mockResolvedValue({
      _sum: { quantity: 6 },
    });

    const details = await getEventRegistrationDetailsForEmail("reg-1");

    expect(details).toEqual({
      eventTitle: "テストイベント",
      startTime: selectedStart,
      endTime: selectedEnd,
      location: "青山 / Room A（3F）",
      capacity: 8,
      confirmedCount: 6,
      format: "OFFLINE",
      meetingUrl: null,
      ticketUnitPrice: 1500,
      quantity: 2,
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
    mockRegistrationFindMany.mockImplementationOnce(() =>
      Promise.resolve([
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
      ]),
    );

    const rows = await getEventRegistrationsForExport("event-1");

    expect(rows[0]?.event.startTime).toBe(selectedStart);
    expect(rows[0]?.event.endTime).toBe(selectedEnd);
    expect(rows[0]?.event.location).toBe("青山");
  });

  test("findEventRegistrationsForReminderWindow は CONFIRMED + 未送信 + 窓内 + email あり + 未削除イベントで絞り込む", async () => {
    const start = new Date("2026-07-15T00:00:00.000Z");
    const end = new Date("2026-07-15T23:59:59.999Z");
    mockRegistrationFindMany.mockImplementationOnce(() => Promise.resolve([]));

    await findEventRegistrationsForReminderWindow(start, end);

    expect(mockRegistrationFindMany).toHaveBeenCalledTimes(1);
    expect(mockRegistrationFindMany.mock.calls[0]?.[0]).toEqual({
      where: {
        status: RegistrationStatus.CONFIRMED,
        reminderSentAt: null,
        email: { not: null },
        event: { deletedAt: null },
        slot: { startAt: { gte: start, lte: end } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        quantity: true,
        icsSequence: true,
        customerId: true,
        slot: {
          select: { startAt: true, endAt: true },
        },
        event: {
          select: {
            title: true,
            format: true,
            meetingUrl: true,
            addressDetail: true,
            location: { select: { name: true } },
            space: { select: { name: true } },
          },
        },
      },
    });
  });

  test("getCustomerEventRegistrationDetail は customerId 一致で絞り込み ticketName を返す", async () => {
    const startAt = new Date("2026-08-01T01:00:00.000Z");
    const endAt = new Date("2026-08-01T02:00:00.000Z");
    mockRegistrationFindFirst.mockResolvedValue({
      id: "reg-detail",
      eventId: "event-1",
      quantity: 2,
      status: RegistrationStatus.CONFIRMED,
      cancelledAt: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      waitlistedAt: null,
      offeredAt: null,
      expiresAt: null,
      paymentStatus: "UNPAID",
      ticket: { price: 3000, name: "一般チケット" },
      slotId: "slot-1",
      ticketId: "ticket-1",
      slot: { startAt, endAt },
      event: {
        id: "event-1",
        title: "詳細テストイベント",
        slug: "detail-event",
        addressDetail: null,
        status: "PUBLISHED",
        format: "OFFLINE",
        meetingUrl: null,
        location: { name: "会場A" },
        space: null,
      },
    });

    const detail = await getCustomerEventRegistrationDetail(
      "reg-detail",
      "customer-1",
    );

    expect(mockRegistrationFindFirst).toHaveBeenCalledWith({
      where: {
        id: "reg-detail",
        customerId: "customer-1",
        event: { deletedAt: null },
      },
      select: expect.objectContaining({
        id: true,
        ticket: { select: { price: true, name: true } },
      }),
    });
    expect(detail?.ticketName).toBe("一般チケット");
    expect(detail?.event.title).toBe("詳細テストイベント");
    expect(detail?.ticketTotalPrice).toBe(6000);
  });

  test("getCustomerEventRegistrationDetail は ownership 不一致時 null", async () => {
    mockRegistrationFindFirst.mockResolvedValue(null);

    const detail = await getCustomerEventRegistrationDetail(
      "reg-other",
      "customer-1",
    );

    expect(detail).toBeNull();
  });

  test("getCustomerEventRegistrations は CONFIRMED 以外の meetingUrl を null にする", async () => {
    mockRegistrationFindManyForCustomer.mockResolvedValueOnce([
      {
        id: "reg-waitlisted",
        eventId: "event-1",
        slotId: "slot-1",
        quantity: 1,
        status: RegistrationStatus.WAITLISTED,
        cancelledAt: null,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        waitlistedAt: new Date("2026-07-01T00:00:00.000Z"),
        offeredAt: null,
        expiresAt: null,
        paymentStatus: "UNPAID",
        ticket: { price: 1000 },
        ticketId: "ticket-1",
        slot: {
          startAt: new Date("2026-08-01T01:00:00.000Z"),
          endAt: new Date("2026-08-01T02:00:00.000Z"),
        },
        event: {
          id: "event-1",
          title: "待機中イベント",
          slug: "waitlisted-event",
          status: "PUBLISHED",
          format: "ONLINE",
          meetingUrl: "https://meet.example.com/secret",
          addressDetail: null,
          location: null,
          space: null,
        },
      },
    ]);
    mockRegistrationFindManyForCustomer.mockResolvedValueOnce([]);

    const result = await getCustomerEventRegistrations("customer-1");

    expect(result.active[0]?.event.meetingUrl).toBeNull();
  });
});
