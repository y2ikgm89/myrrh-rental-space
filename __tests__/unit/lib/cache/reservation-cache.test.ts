import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

// next/cache の updateTag を spy 化して、helper が呼ぶタグ群を検証する。
// CACHE_TAGS / getCacheTag は副作用なし純粋モジュールのためモックしない（実 SSoT で期待値を組む）。
const updateTagMock = mock<(tag: string) => void>(() => {});
const actualNextCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...actualNextCache,
  updateTag: updateTagMock,
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

const { invalidateReservationCaches, invalidateReservationSeriesCaches } =
  await import("@/shared/lib/cache/reservation-cache");

const RESERVATION_ID = "res-1";
const CUSTOMER_ID = "cust-1";
const SERIES_ID = "series-1";
const INSTANCE_IDS = ["inst-1", "inst-2", "inst-3"];

describe("invalidateReservationCaches", () => {
  beforeEach(() => {
    updateTagMock.mockClear();
  });

  describe("基本（オプションなし）", () => {
    test("予約 3 点セット + CUSTOMERS を無効化する（customerId なし）", () => {
      invalidateReservationCaches(RESERVATION_ID, null);

      expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.RESERVATIONS);
      expect(updateTagMock).toHaveBeenCalledWith(
        getCacheTag.reservations.detail(RESERVATION_ID),
      );
      expect(updateTagMock).toHaveBeenCalledWith(
        getCacheTag.reservations.calendar(),
      );
      expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.CUSTOMERS);
      expect(updateTagMock).toHaveBeenCalledTimes(4);
    });

    test("customerId 指定時は customers.detail も無効化する", () => {
      invalidateReservationCaches(RESERVATION_ID, CUSTOMER_ID);

      expect(updateTagMock).toHaveBeenCalledWith(
        getCacheTag.customers.detail(CUSTOMER_ID),
      );
      expect(updateTagMock).toHaveBeenCalledTimes(5);
    });
  });

  describe("オプション", () => {
    test("options.coupons で COUPONS を追加無効化する", () => {
      invalidateReservationCaches(RESERVATION_ID, null, { coupons: true });

      expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.COUPONS);
      expect(updateTagMock).toHaveBeenCalledTimes(5);
    });

    test("全オプション + customerId 有効時は 6 タグを無効化する", () => {
      invalidateReservationCaches(RESERVATION_ID, CUSTOMER_ID, {
        coupons: true,
      });

      expect(updateTagMock).toHaveBeenCalledTimes(6);
      expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.COUPONS);
      expect(updateTagMock).toHaveBeenCalledWith(
        getCacheTag.customers.detail(CUSTOMER_ID),
      );
    });

    test("オプションが false なら COUPONS は無効化しない", () => {
      invalidateReservationCaches(RESERVATION_ID, null, {
        coupons: false,
      });

      expect(updateTagMock).not.toHaveBeenCalledWith(CACHE_TAGS.COUPONS);
      expect(updateTagMock).toHaveBeenCalledTimes(4);
    });
  });
});

// -----------------------------------------------------------------------------
// invalidateReservationSeriesCaches (CRITIC-5)
//
// series 経路で dead tag `reservations-<seriesId>` を emit しないことを固定する。
// 「seriesId は tag emit の材料にしない、代わりに instance detail を必要に応じて
// 展開する」という契約を実測で保証する。
// -----------------------------------------------------------------------------
describe("invalidateReservationSeriesCaches (CRITIC-5)", () => {
  beforeEach(() => {
    updateTagMock.mockClear();
  });

  test("最小: RESERVATIONS + calendar + CUSTOMERS の 3 タグを emit する (dead tag 無し)", () => {
    invalidateReservationSeriesCaches(SERIES_ID, null);

    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.RESERVATIONS);
    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.reservations.calendar(),
    );
    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.CUSTOMERS);
    expect(updateTagMock).toHaveBeenCalledTimes(3);

    // CRITIC-5: 以前の regression では `reservations-<seriesId>` が dead tag
    // として emit されていた。この関数では絶対に emit されないことを固定。
    expect(updateTagMock).not.toHaveBeenCalledWith(
      getCacheTag.reservations.detail(SERIES_ID),
    );
  });

  test("customerId 指定時は customers.detail も emit する", () => {
    invalidateReservationSeriesCaches(SERIES_ID, CUSTOMER_ID);

    expect(updateTagMock).toHaveBeenCalledWith(
      getCacheTag.customers.detail(CUSTOMER_ID),
    );
    expect(updateTagMock).toHaveBeenCalledTimes(4);
  });

  test("options.instanceIds で各 instance detail タグを emit する", () => {
    invalidateReservationSeriesCaches(SERIES_ID, CUSTOMER_ID, {
      instanceIds: INSTANCE_IDS,
    });

    for (const instanceId of INSTANCE_IDS) {
      expect(updateTagMock).toHaveBeenCalledWith(
        getCacheTag.reservations.detail(instanceId),
      );
    }
    // 3 (base) + 1 (customer.detail) + 3 (instances)
    expect(updateTagMock).toHaveBeenCalledTimes(7);
    // dead tag は emit しない
    expect(updateTagMock).not.toHaveBeenCalledWith(
      getCacheTag.reservations.detail(SERIES_ID),
    );
  });

  test("options.coupons で COUPONS を追加 emit する", () => {
    invalidateReservationSeriesCaches(SERIES_ID, CUSTOMER_ID, {
      coupons: true,
    });

    expect(updateTagMock).toHaveBeenCalledWith(CACHE_TAGS.COUPONS);
    expect(updateTagMock).toHaveBeenCalledTimes(5);
  });
});
