/**
 * メディア管理 - 共通定数
 */

import { MediaType, MediaUsage } from "@/admin/lib/validations/media";

// =============================================================================
// Type-safe option types
// =============================================================================

type TypeFilterOption = { value: "" | MediaType; label: string };
type UsageOption = { value: MediaUsage; label: string };
type UsageFilterOption = { value: "" | MediaUsage; label: string };

// =============================================================================
// Options
// =============================================================================

export const TYPE_OPTIONS: readonly TypeFilterOption[] = [
  { value: "", label: "すべての種別" },
  { value: MediaType.IMAGE, label: "画像" },
  { value: MediaType.VIDEO, label: "動画" },
  { value: MediaType.DOCUMENT, label: "ドキュメント" },
];

export const USAGE_OPTIONS: readonly UsageOption[] = [
  { value: MediaUsage.GENERAL, label: "未分類" },
  { value: MediaUsage.POST, label: "投稿" },
  { value: MediaUsage.NEWS, label: "お知らせ" },
  { value: MediaUsage.PAGE, label: "ページ" },
  { value: MediaUsage.SPACE, label: "スペース" },
  { value: MediaUsage.SITE, label: "サイト" },
];

export const USAGE_FILTER_OPTIONS: readonly UsageFilterOption[] = [
  { value: "", label: "すべての用途" },
  ...USAGE_OPTIONS,
];

export const USAGE_LABELS: Record<MediaUsage, string> = {
  [MediaUsage.GENERAL]: "未分類",
  [MediaUsage.POST]: "投稿",
  [MediaUsage.NEWS]: "お知らせ",
  [MediaUsage.PAGE]: "ページ",
  [MediaUsage.SPACE]: "スペース",
  [MediaUsage.SITE]: "サイト",
};

export const TYPE_CONFIG: Record<MediaType, { label: string; color: string }> =
  {
    [MediaType.IMAGE]: { label: "画像", color: "bg-media-image" },
    [MediaType.VIDEO]: { label: "動画", color: "bg-media-video" },
    [MediaType.DOCUMENT]: { label: "PDF", color: "bg-media-document" },
    [MediaType.OTHER]: { label: "その他", color: "bg-media-other" },
  };
