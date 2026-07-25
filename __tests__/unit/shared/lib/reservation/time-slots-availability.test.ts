import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { BusinessHours } from "@/shared/lib/json-validators";

const mockGetBusinessHoursSettingsQuery = mock<
  () => Promise<BusinessHours | null>
>(() => Promise.resolve(null));
const mockGetReservationRuleSettings = mock<
  () => Promise<{
    defaultTimeSlot: number;
    minReservationDuration: number;
    maxReservationDuration: number;
  }>
>(() =>
  Promise.resolve({
    defaultTimeSlot: 60,
    minReservationDuration: 60,
    maxReservationDuration: 480,
  }),
);
const mockGetReservationsForDateQuery = mock<
  (
    _spaceId: string,
    _dateStart: Date,
    _dateEnd: Date,
  ) => Promise<Array<{ startTime: Date; endTime: Date }>>
>(() => Promise.resolve([]));
const mockGetEventSlotsForDateQuery = mock<
  (
    _spaceId: string,
    _dateStart: Date,
    _dateEnd: Date,
  ) => Promise<Array<{ startTime: Date; endTime: Date }>>
>(() => Promise.resolve([]));
const mockGetSpaceLocationIdQuery = mock<
  (_spaceId: string) => Promise<string | null>
>(() => Promise.resolve("loc-1"));
const mockIsDateBlocked = mock<
  (
    _spaceId: string,
    _locationId: string,
    _date: string,
  ) => Promise<{ blocked: false } | { blocked: true; reason: string | null }>
>(() => Promise.resolve({ blocked: false }));

mock.module("server-only", () => ({}));

mock.module("@/shared/domain/reservations/availability", () => ({
  getBusinessHoursSettingsQuery: mockGetBusinessHoursSettingsQuery,
  getReservationRuleSettings: mockGetReservationRuleSettings,
  getReservationsForDateQuery: mockGetReservationsForDateQuery,
  getEventSlotsForDateQuery: mockGetEventSlotsForDateQuery,
  getSpaceLocationIdQuery: mockGetSpaceLocationIdQuery,
  isDateBlocked: mockIsDateBlocked,
}));

const { getAvailableTimeSlots } =
  await import("@/shared/lib/reservation/time-slots");

/** 月曜 9:00–23:00（日跨ぎテスト用に 23 時まで延長） */
const BUSINESS_HOURS: BusinessHours = {
  sunday: { isOpen: false, slots: [] },
  monday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "23:00" }] },
  tuesday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "23:00" }] },
  wednesday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "23:00" }],
  },
  thursday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "23:00" }],
  },
  friday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "23:00" }] },
  saturday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "23:00" }],
  },
};

const MONDAY = "2026-07-27"; // 月曜
const TUESDAY = "2026-07-28"; // 火曜

function slotAvailability(
  slots: Array<{ time: string; available: boolean }>,
): Record<string, boolean> {
  return Object.fromEntries(slots.map((s) => [s.time, s.available]));
}

beforeEach(() => {
  mockGetBusinessHoursSettingsQuery.mockReset();
  mockGetReservationRuleSettings.mockReset();
  mockGetReservationsForDateQuery.mockReset();
  mockGetEventSlotsForDateQuery.mockReset();
  mockGetSpaceLocationIdQuery.mockReset();
  mockIsDateBlocked.mockReset();

  mockGetBusinessHoursSettingsQuery.mockResolvedValue(BUSINESS_HOURS);
  mockGetReservationRuleSettings.mockResolvedValue({
    defaultTimeSlot: 60,
    minReservationDuration: 60,
    maxReservationDuration: 480,
  });
  mockGetReservationsForDateQuery.mockResolvedValue([]);
  mockGetEventSlotsForDateQuery.mockResolvedValue([]);
  mockGetSpaceLocationIdQuery.mockResolvedValue("loc-1");
  mockIsDateBlocked.mockResolvedValue({ blocked: false });
});

describe("getAvailableTimeSlots cross-midnight occupancy", () => {
  test("前日開始・当日午前終了: 当日 09:00 スロットが unavailable", async () => {
    mockGetReservationsForDateQuery.mockResolvedValue([
      {
        startTime: new Date("2026-07-26T22:00:00+09:00"),
        endTime: new Date("2026-07-27T10:00:00+09:00"),
      },
    ]);

    const slots = await getAvailableTimeSlots("space-1", MONDAY);
    const map = slotAvailability(slots);

    expect(map["09:00"]).toBe(false);
    expect(map["10:00"]).toBe(true);
  });

  test("当日夜開始・翌日早朝終了: 当日 22:00 スロットが unavailable", async () => {
    mockGetReservationsForDateQuery.mockResolvedValue([
      {
        startTime: new Date("2026-07-27T22:00:00+09:00"),
        endTime: new Date("2026-07-28T02:00:00+09:00"),
      },
    ]);

    const slots = await getAvailableTimeSlots("space-1", MONDAY);
    const map = slotAvailability(slots);

    expect(map["21:00"]).toBe(true);
    expect(map["22:00"]).toBe(false);
  });

  test("翌日側: 前日開始・当日午前終了の tail が unavailable", async () => {
    mockGetReservationsForDateQuery.mockResolvedValue([
      {
        startTime: new Date("2026-07-27T22:00:00+09:00"),
        endTime: new Date("2026-07-28T10:00:00+09:00"),
      },
    ]);

    const slots = await getAvailableTimeSlots("space-1", TUESDAY);
    const map = slotAvailability(slots);

    expect(map["09:00"]).toBe(false);
    expect(map["10:00"]).toBe(true);
    expect(map["11:00"]).toBe(true);
  });

  test("当日完結の予約は従来どおり start/end 内スロットのみ unavailable", async () => {
    mockGetReservationsForDateQuery.mockResolvedValue([
      {
        startTime: new Date("2026-07-27T14:00:00+09:00"),
        endTime: new Date("2026-07-27T16:00:00+09:00"),
      },
    ]);

    const slots = await getAvailableTimeSlots("space-1", MONDAY);
    const map = slotAvailability(slots);

    expect(map["13:00"]).toBe(true);
    expect(map["14:00"]).toBe(false);
    expect(map["15:00"]).toBe(false);
    expect(map["16:00"]).toBe(true);
  });
});
