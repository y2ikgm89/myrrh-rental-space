/**
 * スキップリンク設定
 *
 * キーボードナビゲーション改善のためのスキップリンク定義
 */

export interface SkipLinkTarget {
  id: string;
  label: string;
}

/**
 * デフォルトのスキップリンクターゲット
 */
export const DEFAULT_SKIP_TARGETS: SkipLinkTarget[] = [
  { id: "main-content", label: "メインコンテンツへスキップ" },
];

/**
 * スキップリンクのスタイルクラス
 * - 通常: スクリーンリーダー専用（視覚的に非表示）
 * - フォーカス時: 表示されて操作可能
 */
export const SKIP_LINK_CLASSES = {
  base: [
    "sr-only",
    "focus-visible:not-sr-only",
    "focus-visible:absolute",
    "focus-visible:top-4",
    "focus-visible:left-4",
    "focus-visible:z-[100]",
    "focus-visible:px-4",
    "focus-visible:py-2",
    "focus-visible:bg-accent",
    "focus-visible:text-accent-foreground",
    "focus-visible:rounded-md",
    "focus-visible:shadow-lg",
    "focus-visible:outline-none",
    "focus-visible:ring-2",
    "focus-visible:ring-ring",
    "focus-visible:ring-offset-2",
  ].join(" "),
};
