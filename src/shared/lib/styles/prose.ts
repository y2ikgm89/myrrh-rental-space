/**
 * Prose スタイル定義
 *
 * 公開ページと編集画面で統一されたスタイルを提供
 * ContentRenderer および InlineEditor で使用
 *
 * Medium/Notion準拠の美しいタイポグラフィを実現
 * @see https://medium.com/design-bootcamp/ux-golden-tip-1-the-magic-number-for-line-height-aae93cd1a35
 */

import { cn } from '@/shared/lib/cn'

/**
 * Medium/Notion品質の統一タイポグラフィ
 *
 * 設計原則:
 * - Line Height: 1.6（本文）、1.2-1.35（見出し）
 * - Font Size: ベース16px、見出しは段階的スケール
 * - 読みやすさを最優先
 */
export const ENHANCED_PROSE_CLASSES = cn(
  // ベースproseサイズ（レスポンシブ）
  'prose prose-base lg:prose-lg max-w-none',

  // ダークモード対応
  'dark:prose-invert',

  // 見出し（leading-tight = 1.25）
  'prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-foreground',
  'prose-h1:text-3xl prose-h1:sm:text-4xl prose-h1:leading-tight prose-h1:mb-6 prose-h1:mt-8',
  'prose-h2:text-2xl prose-h2:sm:text-3xl prose-h2:leading-tight prose-h2:mb-5 prose-h2:mt-8',
  'prose-h3:text-xl prose-h3:sm:text-2xl prose-h3:leading-snug prose-h3:mb-4 prose-h3:mt-6',
  'prose-h4:text-lg prose-h4:sm:text-xl prose-h4:leading-snug prose-h4:mb-3 prose-h4:mt-5',

  // 本文（line-height 1.6 = Medium基準）
  'prose-p:leading-relaxed prose-p:text-foreground prose-p:mb-5',

  // リンク（アンダーラインのアニメーション）
  'prose-a:text-primary prose-a:underline prose-a:underline-offset-4',
  'prose-a:decoration-primary/40 hover:prose-a:decoration-primary',
  'prose-a:transition-colors',

  // 引用（目立つデザイン）
  'prose-blockquote:border-l-4 prose-blockquote:border-primary/40',
  'prose-blockquote:pl-6 prose-blockquote:py-1 prose-blockquote:italic',
  'prose-blockquote:text-muted-foreground prose-blockquote:not-italic',
  'prose-blockquote:bg-muted/30 prose-blockquote:rounded-r-lg',

  // インラインコード（Notion風）
  'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5',
  'prose-code:text-[0.9em] prose-code:font-mono prose-code:text-foreground',
  'prose-code:before:content-none prose-code:after:content-none',

  // コードブロック
  'prose-pre:bg-muted prose-pre:rounded-xl prose-pre:p-5',
  'prose-pre:overflow-x-auto prose-pre:text-sm',

  // 画像（シャドウとラウンド）
  'prose-img:rounded-xl prose-img:shadow-lg prose-img:my-8',

  // リスト（適切な行間）
  'prose-ul:list-disc prose-ul:my-5',
  'prose-ol:list-decimal prose-ol:my-5',
  'prose-li:text-foreground prose-li:my-1.5 prose-li:leading-relaxed',

  // テーブル（モダンなデザイン）
  'prose-table:border-collapse prose-table:w-full prose-table:my-8',
  'prose-th:border prose-th:border-border prose-th:p-3 prose-th:bg-muted prose-th:font-semibold prose-th:text-left',
  'prose-td:border prose-td:border-border prose-td:p-3',

  // 区切り線
  'prose-hr:border-border prose-hr:my-10',

  // 太字・斜体
  'prose-strong:font-semibold prose-strong:text-foreground',
  'prose-em:italic'
)

/**
 * コンテンツ表示用の Prose クラス
 * ENHANCED_PROSE_CLASSESのエイリアス（可読性のため維持）
 */
export const PROSE_CLASSES = ENHANCED_PROSE_CLASSES

/**
 * エディター用の Prose クラス
 * エディター内でも公開ページと同じ見た目を実現
 */
export const EDITOR_PROSE_CLASSES = cn(
  ENHANCED_PROSE_CLASSES,
  // エディター固有の調整
  'focus:outline-none',
  'min-h-[300px]'
)
