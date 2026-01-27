/**
 * 遅延読み込みLexicalエディタ
 *
 * @description
 * - SSR無効化済み
 * - ローディングUI組み込み
 * - next/dynamic公式パターン準拠
 */

'use client'

import dynamic from 'next/dynamic'

/**
 * 遅延読み込みLexicalエディタ
 *
 * @description
 * 各エディタコンポーネントで共通使用する遅延読み込み版
 * SSR無効、ローディングUI統一
 */
export const LazyLexicalEditor = dynamic(
  () =>
    import('./LexicalEditor').then((mod) => ({
      default: mod.LexicalEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] flex items-center justify-center bg-muted/50">
        <div className="animate-pulse text-muted-foreground">
          エディタを読み込み中...
        </div>
      </div>
    ),
  }
)
