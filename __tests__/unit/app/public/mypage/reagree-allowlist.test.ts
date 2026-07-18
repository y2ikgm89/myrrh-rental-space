import { describe, test, expect } from "bun:test";
import {
  isReagreeAllowlisted,
  REAGREE_ALLOWLIST_PREFIXES,
} from "@/app/(public)/mypage/_lib/reagree-allowlist";

describe("isReagreeAllowlisted", () => {
  test("reagree 本体は allowlist", () => {
    expect(isReagreeAllowlisted("/mypage/terms/reagree")).toBe(true);
    expect(isReagreeAllowlisted("/mypage/terms/reagree?returnTo=/mypage")).toBe(
      true,
    );
  });

  test("settings は allowlist (email 未登録の循環回避)", () => {
    expect(isReagreeAllowlisted("/mypage/settings")).toBe(true);
  });

  test("reservations / inquiries / events は履歴閲覧のため allowlist", () => {
    expect(isReagreeAllowlisted("/mypage/reservations")).toBe(true);
    expect(isReagreeAllowlisted("/mypage/reservations/abc-123")).toBe(true);
    expect(isReagreeAllowlisted("/mypage/reservations/abc-123/edit")).toBe(
      true,
    );
    expect(isReagreeAllowlisted("/mypage/inquiries")).toBe(true);
    expect(isReagreeAllowlisted("/mypage/inquiries/abc-123")).toBe(true);
    expect(isReagreeAllowlisted("/mypage/events")).toBe(true);
  });

  test("dashboard (/mypage) 直下は allowlist ではない (最短で trip wire)", () => {
    expect(isReagreeAllowlisted("/mypage")).toBe(false);
    expect(isReagreeAllowlisted("/mypage/")).toBe(false);
  });

  test("空文字列 / mypage 外の pathname も allowlist ではない", () => {
    expect(isReagreeAllowlisted("")).toBe(false);
    expect(isReagreeAllowlisted("/login")).toBe(false);
    expect(isReagreeAllowlisted("/admin/settings")).toBe(false);
  });

  test("REAGREE_ALLOWLIST_PREFIXES は 5 件 (SSoT 契約の回帰テスト)", () => {
    expect(REAGREE_ALLOWLIST_PREFIXES).toEqual([
      "/mypage/terms/reagree",
      "/mypage/settings",
      "/mypage/reservations",
      "/mypage/inquiries",
      "/mypage/events",
    ]);
  });
});
