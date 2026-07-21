/**
 * 遅延読み込みLexicalエディタ
 *
 * @description
 * - SSR無効化済み
 * - ローディングUI組み込み
 * - next/dynamic公式パターン準拠
 * - LexicalMountErrorBoundaryによる副防御付き
 *
 * `LexicalMountErrorBoundary` は class component である都合上ここで static
 * import しているが、それ自体は軽量（class 定義 + Notice UI 2 種のみ）。
 * Lexical コア + 全カスタム node class を抱える重量モジュール
 * （`config/registered-node-types` → `config/nodes`）は boundary 側が
 * 実際にエラーを捕捉した後にのみ動的 `import()` するため、この static import
 * によって `LexicalEditorDynamic` の code splitting 契約（本体の遅延取得）は
 * 破られない（PR#1346 レビュー指摘 P2 対応）。boundary 側で再び
 * `registered-node-types` / `config/nodes` を static import しないこと。
 */

"use client";

import dynamic from "next/dynamic";
import { LexicalMountErrorBoundary } from "./LexicalMountErrorBoundary";
import type { LexicalEditorProps } from "./types";

const LexicalEditorDynamic = dynamic(
  () =>
    import("./LexicalEditor").then((mod) => ({
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
  },
);

/**
 * 遅延読み込みLexicalエディタ
 *
 * @description
 * 各エディタコンポーネントで共通使用する遅延読み込み版
 * SSR無効、ローディングUI統一。想定外の mount エラー（未登録 node type 由来の
 * 同期 throw 等）は LexicalMountErrorBoundary が吸収し、共有 error.tsx まで
 * 伝播させない（副防御）。エクスポート名・シグネチャは変更前と同一のため
 * 利用側フォームは無改修で済む。
 */
export function LazyLexicalEditor(props: LexicalEditorProps) {
  return (
    <LexicalMountErrorBoundary {...props}>
      <LexicalEditorDynamic {...props} />
    </LexicalMountErrorBoundary>
  );
}
