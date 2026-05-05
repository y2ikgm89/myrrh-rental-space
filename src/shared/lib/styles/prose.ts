/**
 * Editorial Magazine prose スタイル（公開・編集の SSoT）
 *
 * Kinfolk / Cereal Magazine 準拠（Cormorant Garamond serif heading（light） +
 * italic blockquote + bronze accent link + drop-cap は editorial variant のみ）。
 *
 * 公開: `Prose` Primitive (`design-system/prose.tsx`) が参照
 * 編集: Lexical エディタの ContentEditable 親 div に `EDITOR_PROSE_CLASSES` で適用
 *
 * 編集中の見た目を公開ページと一致させ、保存前に視覚差で迷わないようにする。
 *
 * Tailwind Typography v4 の `prose-*` variant で要素別にスタイル指定。
 * CSS 変数 `@theme --text-h*--*` は `text-h*` utility 専用で prose 配下には効かないため
 * 必要な見出しスタイルは prose-headings variant で明示する。
 */

import { cn } from "@/shared/lib/cn";

/**
 * Editorial Magazine prose クラス — 公開／編集共通の SSoT
 */
export const EDITORIAL_PROSE_CLASSES = cn(
  "prose prose-neutral leading-[var(--leading-normal)]",
  // 見出し: Cormorant Garamond light（公開ページ project-design-config と一致）
  "prose-headings:font-heading prose-headings:font-light prose-headings:text-foreground",
  "prose-headings:tracking-[0.01em]",
  // 本文段落
  "prose-p:text-foreground",
  // リンク: bronze accent、下線なし、hover で accent-light
  "prose-a:text-accent prose-a:no-underline hover:prose-a:text-accent-light",
  "prose-a:transition-colors",
  // 引用: serif italic light + accent border
  "prose-blockquote:font-heading prose-blockquote:italic prose-blockquote:font-light",
  "prose-blockquote:border-accent prose-blockquote:not-italic prose-blockquote:text-foreground",
  // 強調
  "prose-strong:font-semibold prose-strong:text-foreground",
  "prose-em:italic",
  // リスト
  "prose-li:text-foreground",
  // 太字下線（h タグ等で utility が当たる場面の foreground 統一）
  "prose-th:text-foreground prose-td:text-foreground",
);

/**
 * Lexical エディタ専用 prose クラス
 *
 * - `max-w-none`: エディタは外側コンテナで幅制御するため measure 制限を解除
 * - `focus:outline-none`: ContentEditable のフォーカスリングを抑制（外枠で表現）
 * - `min-h-[300px]`: 空エディタの最低高さ
 */
export const EDITOR_PROSE_CLASSES = cn(
  EDITORIAL_PROSE_CLASSES,
  "max-w-none focus:outline-none min-h-[300px]",
);
