"use client";

/**
 * ニュース一覧フィルター
 */

import { BaseFilters, type StatusOption } from "@/admin/components/table";
import { NEWS_STATUS_FILTER_LABELS } from "@/shared/lib/validations/enums/helpers";

// News は isPublished + publishedAt 方式（PostStatus の ARCHIVED に相当する概念が存在しない）。
// BaseFilters の DEFAULT_STATUS_OPTIONS（Post 用、ARCHIVED を含む）をそのまま使うと、
// 「アーカイブ」を選択しても parseNewsStatusFilter が黙って "ALL" にフォールバックし、
// UI 上は選択中のまま実際は全件表示される不整合が起きるため、NewsStatusFilter
// ("ALL" | "PUBLISHED" | "SCHEDULED" | "DRAFT") と一致する 4 択に明示的に限定する。
// ラベル文言は status-badges / NEWS_PUBLISH_VISIBILITY_LABELS と揃える。
const NEWS_STATUS_OPTIONS: StatusOption[] = [
  { value: "ALL", label: "すべて" },
  { value: "PUBLISHED", label: NEWS_STATUS_FILTER_LABELS.PUBLISHED },
  { value: "SCHEDULED", label: NEWS_STATUS_FILTER_LABELS.SCHEDULED },
  { value: "DRAFT", label: NEWS_STATUS_FILTER_LABELS.DRAFT },
];

export function NewsFilters() {
  return (
    <BaseFilters
      statusOptions={NEWS_STATUS_OPTIONS}
      searchPlaceholder="タイトル、本文で検索..."
    />
  );
}
