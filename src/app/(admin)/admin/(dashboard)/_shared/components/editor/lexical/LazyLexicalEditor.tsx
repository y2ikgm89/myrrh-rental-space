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
 *
 * ## 再試行時の dynamic import 再実行（PR#1352 レビュー指摘 P2 対応、要点）
 *
 * `next/dynamic` は内部で `React.lazy(loader)` を 1 度だけ呼び出し、結果
 * （`_status`/`_result` を持つ payload）をコンポーネント参照のクロージャに
 * 保持する。React 19 の `lazyInitializer` は payload が一度 rejected に
 * なると、以後同じ payload に対する render では loader を再実行せず
 * キャッシュ済みの Error を re-throw する（`node_modules/react/cjs/react.development.js`
 * の実装で実測確認済み。バンドラー実装（Turbopack/webpack）非依存の
 * React コア自体の挙動）。そのため、`LexicalMountErrorBoundary` が
 * Fragment の key を変えて children を remount しても、`LexicalEditorDynamic`
 * が同一コンポーネント参照である限り chunk 読み込み失敗からは回復できない。
 *
 * 対策として、通常時（エラーなし）の初回マウントはモジュール直下で 1 度だけ
 * 生成した `InitialLexicalEditorDynamic` を使う一方、boundary から
 * `onRetryDynamicImport` が呼ばれたタイミングでのみ `createLexicalEditorDynamic()`
 * を呼び直し、新しい `dynamic()` 呼び出し（＝新しい `React.lazy()` payload、
 * `_status: -1` の未検証状態）に差し替える。`ssr: false` のため Next.js の
 * SSR プリロード最適化（`dynamic()` をトップレベルで呼ぶ理由）の対象外であり
 * （`next/dynamic` の `loadable.js` 実装は `ssr: false` を `noSSR()` 経由で
 * `.webpack`/`.modules` を破棄し `PreloadChunks` を経由しないことを確認済み）、
 * 実行時に何度呼び出しても安全。
 */

"use client";

import { useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { LexicalMountErrorBoundary } from "./LexicalMountErrorBoundary";
import type { LexicalEditorProps } from "./types";

function LexicalEditorLoadingFallback() {
  return (
    <div className="h-[500px] flex items-center justify-center bg-muted/50">
      <div className="animate-pulse text-muted-foreground">
        エディタを読み込み中...
      </div>
    </div>
  );
}

/**
 * `next/dynamic` でラップした LexicalEditor コンポーネントを新規生成する。
 * 呼び出すたびに新しい `React.lazy()` payload を持つコンポーネント参照になる
 * （詳細は上部 doc comment）。
 */
function createLexicalEditorDynamic(): ComponentType<LexicalEditorProps> {
  return dynamic(
    () =>
      import("./LexicalEditor").then((mod) => ({
        default: mod.LexicalEditor,
      })),
    {
      ssr: false,
      loading: LexicalEditorLoadingFallback,
    },
  );
}

/** 通常時（エラーなし）の初回マウントで使う、モジュール直下の唯一のインスタンス。 */
const InitialLexicalEditorDynamic = createLexicalEditorDynamic();

/**
 * 遅延読み込みLexicalエディタ
 *
 * @description
 * 各エディタコンポーネントで共通使用する遅延読み込み版
 * SSR無効、ローディングUI統一。想定外の mount エラー（未登録 node type 由来の
 * 同期 throw や dynamic chunk の読み込み失敗等）は LexicalMountErrorBoundary が
 * 吸収し、共有 error.tsx まで伝播させない（副防御）。エクスポート名・
 * シグネチャは変更前と同一のため利用側フォームは無改修で済む。
 */
export function LazyLexicalEditor(props: LexicalEditorProps) {
  // 関数（コンポーネント）を state に保持する場合、useState の初期値・
  // setState の引数どちらも「値」をそのまま渡すと React が updater
  // 関数として誤解釈するため、必ず `() => component` の形で包む。
  //
  // `@eslint-react/static-components` は「render 中に呼ばれた式に由来する
  // ローカル変数を JSX tag として使っている」ことを構文的に検出して警告する
  // （毎 render で新しい component 関数が生成される典型的なアンチパターン用）。
  // ここでは `useState` により実際には retry（明示的な再試行操作）でのみ
  // 新しい component 参照に差し替わり、通常の再 render では同一参照が
  // 維持される（意図的な dynamic import 再試行のための正当なパターン）ため、
  // false positive として抑制する。
  // eslint-disable-next-line @eslint-react/static-components
  const [EditorComponent, setEditorComponent] = useState<
    ComponentType<LexicalEditorProps>
  >(() => InitialLexicalEditorDynamic);

  const handleRetryDynamicImport = (): void => {
    setEditorComponent(() => createLexicalEditorDynamic());
  };

  return (
    <LexicalMountErrorBoundary
      {...props}
      onRetryDynamicImport={handleRetryDynamicImport}
    >
      {/* eslint-disable-next-line @eslint-react/static-components -- 上記 useState 参照。retry 時のみ差し替わる意図的な dynamic component */}
      <EditorComponent {...props} />
    </LexicalMountErrorBoundary>
  );
}
