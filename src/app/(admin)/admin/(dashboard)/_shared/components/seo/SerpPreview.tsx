/**
 * Google 検索結果プレビュー
 *
 * SERPでの表示をリアルタイムにプレビューするコンポーネント。
 * title / description / slug を受け取り、Google 検索結果風のカードを表示。
 */

import { SITE_DEFAULTS, getBaseUrl } from "@/shared/lib/constants";

interface SerpPreviewProps {
  title: string;
  description: string;
  slug: string;
  siteName?: string;
}

/** Google SERP のタイトル表示上限 */
const TITLE_DISPLAY_LIMIT = 60;
/** Google SERP のデスクリプション表示上限 */
const DESCRIPTION_DISPLAY_LIMIT = 160;

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

/**
 * 最終表示タイトルを 60 文字以内に収める。
 * サイト名サフィックスは可能な限り残し、余白でタイトル側を切り詰める。
 */
function formatSerpTitle(title: string, siteName: string): string {
  if (!title) {
    return truncate(siteName, TITLE_DISPLAY_LIMIT);
  }
  const suffix = ` | ${siteName}`;
  const full = `${title}${suffix}`;
  if (full.length <= TITLE_DISPLAY_LIMIT) {
    return full;
  }
  const ellipsis = "...";
  const titleBudget = TITLE_DISPLAY_LIMIT - suffix.length - ellipsis.length;
  if (titleBudget <= 0) {
    return truncate(full, TITLE_DISPLAY_LIMIT);
  }
  return `${title.slice(0, titleBudget)}${ellipsis}${suffix}`;
}

export function SerpPreview({
  title,
  description,
  slug,
  siteName,
}: SerpPreviewProps) {
  const baseUrl = getBaseUrl();
  const displaySiteName = siteName || SITE_DEFAULTS.name;
  const fullTitle = formatSerpTitle(title, displaySiteName);

  // URL表示: 'home' はルート、それ以外は breadcrumb 形式
  const displayUrl = slug === "home" ? baseUrl : `${displaySiteName} › ${slug}`;

  const displayDescription = description
    ? truncate(description, DESCRIPTION_DISPLAY_LIMIT)
    : "ページの説明文が表示されます...";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        検索結果プレビュー
      </p>
      <div className="space-y-0.5">
        {/* URL */}
        <p className="truncate text-xs text-muted-foreground">{displayUrl}</p>
        {/* Title */}
        <p className="truncate text-base font-medium text-primary">
          {fullTitle}
        </p>
        {/* Description */}
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {displayDescription}
        </p>
      </div>
    </div>
  );
}
