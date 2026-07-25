import { describe, expect, test } from "bun:test";
import { isMypageNavActive } from "@/app/(public)/mypage/_components/mypage-nav-active";
import {
  getMypageNavGridClass,
  getVisibleMypageNavItems,
} from "@/app/(public)/mypage/_components/mypage-nav-items";

describe("getVisibleMypageNavItems", () => {
  test("全 feature ON なら 5 項目", () => {
    const items = getVisibleMypageNavItems({
      eventsEnabled: true,
      contactEnabled: true,
    });
    expect(items.map((item) => item.href)).toEqual([
      "/mypage",
      "/mypage/events",
      "/mypage/receipts",
      "/mypage/inquiries",
      "/mypage/settings",
    ]);
  });

  test("events OFF なら /mypage/events を prune", () => {
    const items = getVisibleMypageNavItems({
      eventsEnabled: false,
      contactEnabled: true,
    });
    expect(items.map((item) => item.href)).toEqual([
      "/mypage",
      "/mypage/receipts",
      "/mypage/inquiries",
      "/mypage/settings",
    ]);
  });

  test("contact OFF なら /mypage/inquiries を prune", () => {
    const items = getVisibleMypageNavItems({
      eventsEnabled: true,
      contactEnabled: false,
    });
    expect(items.map((item) => item.href)).toEqual([
      "/mypage",
      "/mypage/events",
      "/mypage/receipts",
      "/mypage/settings",
    ]);
  });

  test("events + contact OFF なら常時項目のみ", () => {
    const items = getVisibleMypageNavItems({
      eventsEnabled: false,
      contactEnabled: false,
    });
    expect(items.map((item) => item.href)).toEqual([
      "/mypage",
      "/mypage/receipts",
      "/mypage/settings",
    ]);
  });
});

describe("getMypageNavGridClass", () => {
  test("可視件数に応じた grid-cols-* を返す", () => {
    expect(getMypageNavGridClass(5)).toBe("grid-cols-5");
    expect(getMypageNavGridClass(4)).toBe("grid-cols-4");
    expect(getMypageNavGridClass(3)).toBe("grid-cols-3");
  });

  test("想定外件数は grid-cols-1 にフォールバック", () => {
    expect(getMypageNavGridClass(0)).toBe("grid-cols-1");
    expect(getMypageNavGridClass(6)).toBe("grid-cols-1");
  });
});

describe("isMypageNavActive", () => {
  describe("/mypage (予約タブ)", () => {
    test("root で active", () => {
      expect(isMypageNavActive("/mypage", "/mypage")).toBe(true);
    });

    test("予約詳細 /mypage/reservations/[id] でも active (NAV-01 回帰防止)", () => {
      expect(isMypageNavActive("/mypage/reservations/abc-123", "/mypage")).toBe(
        true,
      );
    });

    test("予約編集 /mypage/reservations/[id]/edit でも active (NAV-01 回帰防止)", () => {
      expect(
        isMypageNavActive("/mypage/reservations/abc-123/edit", "/mypage"),
      ).toBe(true);
    });

    test("他タブ配下は false", () => {
      expect(isMypageNavActive("/mypage/events", "/mypage")).toBe(false);
      expect(isMypageNavActive("/mypage/settings", "/mypage")).toBe(false);
      expect(isMypageNavActive("/mypage/inquiries/abc", "/mypage")).toBe(false);
    });
  });

  describe("bare href (events / inquiries / settings)", () => {
    test("完全一致で active", () => {
      expect(isMypageNavActive("/mypage/events", "/mypage/events")).toBe(true);
      expect(isMypageNavActive("/mypage/settings", "/mypage/settings")).toBe(
        true,
      );
    });

    test("サブルート (/mypage/events/abc) で active", () => {
      expect(isMypageNavActive("/mypage/events/xyz", "/mypage/events")).toBe(
        true,
      );
    });

    test("他タブ pathname では false", () => {
      expect(isMypageNavActive("/mypage/settings", "/mypage/events")).toBe(
        false,
      );
      expect(isMypageNavActive("/mypage", "/mypage/events")).toBe(false);
    });

    test("prefix だけで別 top level にはならない (誤マッチ防止)", () => {
      // "/mypage/events" が "/mypage/eventsX" に誤マッチしない
      expect(
        isMypageNavActive("/mypage/eventsX-not-real", "/mypage/events"),
      ).toBe(false);
    });
  });
});
