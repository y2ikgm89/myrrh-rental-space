import type { Route } from "next";

/**
 * /mypage NAV 項目の定義と feature-module prune（テスト可能な pure 層）。
 *
 * `"use client"` 境界外に切り出し、unit test が next/navigation に依存せず
 * 可視項目と grid columns class を検証できるようにする。
 */

export type MypageNavFeature = "events" | "contact";

export type MypageNavItem = {
  readonly href: Route;
  readonly label: string;
  /** 未指定 = 常時表示。指定時は対応 feature が ON のときのみ表示 */
  readonly feature?: MypageNavFeature;
};

export type MypageNavFeatureFlags = {
  readonly eventsEnabled: boolean;
  readonly contactEnabled: boolean;
};

export const MYPAGE_NAV_ITEMS: readonly MypageNavItem[] = [
  { href: "/mypage", label: "予約" },
  { href: "/mypage/events", label: "イベント", feature: "events" },
  { href: "/mypage/receipts", label: "領収書" },
  { href: "/mypage/inquiries", label: "お問い合わせ", feature: "contact" },
  { href: "/mypage/settings", label: "設定" },
];

/** 項目数 → mobile grid columns class（clean-break: 固定 grid-cols-5 を廃止） */
const MYPAGE_NAV_GRID_COLS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
} as const;

function isFeatureEnabledForNavItem(
  feature: MypageNavFeature,
  flags: MypageNavFeatureFlags,
): boolean {
  switch (feature) {
    case "events":
      return flags.eventsEnabled;
    case "contact":
      return flags.contactEnabled;
    default: {
      const _exhaustive: never = feature;
      return _exhaustive;
    }
  }
}

export function getVisibleMypageNavItems(
  flags: MypageNavFeatureFlags,
): readonly MypageNavItem[] {
  return MYPAGE_NAV_ITEMS.filter((item) => {
    if (item.feature === undefined) return true;
    return isFeatureEnabledForNavItem(item.feature, flags);
  });
}

export function getMypageNavGridClass(itemCount: number): string {
  if (
    itemCount === 1 ||
    itemCount === 2 ||
    itemCount === 3 ||
    itemCount === 4 ||
    itemCount === 5
  ) {
    return MYPAGE_NAV_GRID_COLS[itemCount];
  }
  // 想定外件数は desktop flex に任せ、mobile は等分を諦めて 1 列にフォールバック
  return "grid-cols-1";
}
