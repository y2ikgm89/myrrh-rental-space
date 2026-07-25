import { describe, test, expect } from "bun:test";
import {
  getMypageNavMobileGridClass,
  getVisibleMypageNavItems,
  MYPAGE_NAV_ITEMS,
} from "@/app/(public)/mypage/_components/mypage-nav-items";

describe("getVisibleMypageNavItems", () => {
  test("events / contact とも ON のとき 5 項目を返す", () => {
    expect(
      getVisibleMypageNavItems({ showEvents: true, showContact: true }),
    ).toHaveLength(5);
  });

  test("events OFF のときイベントリンクを除外する", () => {
    const items = getVisibleMypageNavItems({
      showEvents: false,
      showContact: true,
    });

    expect(items).toHaveLength(4);
    expect(items.some((item) => item.href === "/mypage/events")).toBe(false);
    expect(items.some((item) => item.href === "/mypage/inquiries")).toBe(true);
  });

  test("contact OFF のときお問い合わせリンクを除外する", () => {
    const items = getVisibleMypageNavItems({
      showEvents: true,
      showContact: false,
    });

    expect(items).toHaveLength(4);
    expect(items.some((item) => item.href === "/mypage/inquiries")).toBe(false);
    expect(items.some((item) => item.href === "/mypage/events")).toBe(true);
  });

  test("events / contact とも OFF のとき 3 項目を返す", () => {
    const items = getVisibleMypageNavItems({
      showEvents: false,
      showContact: false,
    });

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.href)).toEqual([
      "/mypage",
      "/mypage/receipts",
      "/mypage/settings",
    ]);
  });

  test("ベース項目は MYPAGE_NAV_ITEMS の部分集合", () => {
    const items = getVisibleMypageNavItems({
      showEvents: false,
      showContact: false,
    });

    for (const item of items) {
      expect(MYPAGE_NAV_ITEMS).toContainEqual(item);
    }
  });
});

describe("getMypageNavMobileGridClass", () => {
  test("表示件数に応じた grid-cols クラスを返す", () => {
    expect(getMypageNavMobileGridClass(3)).toBe("grid-cols-3");
    expect(getMypageNavMobileGridClass(4)).toBe("grid-cols-4");
    expect(getMypageNavMobileGridClass(5)).toBe("grid-cols-5");
  });
});
