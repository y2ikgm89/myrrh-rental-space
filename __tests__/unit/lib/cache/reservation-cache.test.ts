import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

// next/cache の updateTag を spy 化して、helper が呼ぶタグ群を検証する。
// CACHE_TAGS / getCacheTag は副作用なし純粋モジュールのためモックしない（実 SSoT で期待値を組む）。
const updateTagMock = mock<(tag: string) => void>(() => {});
mock.module("next/cache", () => ({ updateTag: updateTagMock }));

const { invalidateReservationCaches } =
  await import("@/shared/lib/cache/reservation-cache");

const RESERVATION_ID = "res-1";
const CUSTOMER_ID = "cust-1";

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
