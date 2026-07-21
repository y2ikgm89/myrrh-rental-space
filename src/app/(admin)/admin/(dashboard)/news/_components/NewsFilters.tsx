"use client";

/**
 * ニュース一覧フィルター
 */

import { BaseFilters, type StatusOption } from "@/admin/components/table";
import { POST_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";

// News は isPublished (boolean) 方式（PostStatus の ARCHIVED に相当する概念が存在しない）。
// BaseFilters の DEFAULT_STATUS_OPTIONS（Post 用、ARCHIVED を含む）をそのまま使うと、
// 「アーカイブ」を選択しても parseNewsStatusFilter が黙って "ALL" にフォールバックし、
// UI 上は選択中のまま実際は全件表示される不整合が起きるため、NewsStatusFilter
// ("ALL" | "PUBLISHED" | "DRAFT") と一致する 3 択に明示的に限定する。
// ラベル文言は status-badges.tsx の newsPublishConfig と同じく POST_STATUS_LABELS を再利用する。
const NEWS_STATUS_OPTIONS: StatusOption[] = [
  { value: "ALL", label: "すべて" },
  { value: "PUBLISHED", label: POST_STATUS_LABELS.PUBLISHED },
  { value: "DRAFT", label: POST_STATUS_LABELS.DRAFT },
];

export function NewsFilters() {
  return (
    <BaseFilters
      statusOptions={NEWS_STATUS_OPTIONS}
      searchPlaceholder="タイトル、本文で検索..."
    />
  );
}
