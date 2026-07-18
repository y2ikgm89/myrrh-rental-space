import { describe, expect, test } from "bun:test";
import { isMypageNavActive } from "@/app/(public)/mypage/_components/mypage-nav-active";

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
