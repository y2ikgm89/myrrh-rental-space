/**
 * Prose スタイル定義
 *
 * 公開ページと編集画面で統一されたスタイルを提供
 * ContentRenderer および InlineEditor で使用
 */

import { cn } from '@/lib/utils'

/**
 * コンテンツ表示用の Prose クラス
 * Tailwind Typography プラグインのスタイルをカスタマイズ
 */
export const PROSE_CLASSES = cn(
  'prose prose-sm sm:prose-base lg:prose-lg max-w-none',
  'prose-headings:font-bold prose-headings:tracking-tight',
  'prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl',
  'prose-p:leading-relaxed prose-p:text-muted-foreground',
  'prose-a:text-primary prose-a:underline prose-a:underline-offset-4',
  'prose-blockquote:border-l-4 prose-blockquote:border-muted-foreground/30',
  'prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground',
  'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:bg-muted prose-pre:rounded-lg prose-pre:p-4',
  'prose-img:rounded-lg prose-img:shadow-md',
  'prose-hr:border-border',
  'prose-strong:font-semibold',
  'prose-ul:list-disc prose-ol:list-decimal',
  'prose-li:text-muted-foreground',
  'prose-table:border-collapse prose-table:w-full',
  'prose-th:border prose-th:p-2 prose-th:bg-muted prose-th:font-bold prose-th:text-left',
  'prose-td:border prose-td:p-2'
)

/**
 * エディター用の Prose クラス
 * エディター内でも公開ページと同じ見た目を実現
 */
export const EDITOR_PROSE_CLASSES = cn(
  PROSE_CLASSES,
  // エディター固有の調整
  'focus:outline-none',
  'min-h-[300px]'
)
