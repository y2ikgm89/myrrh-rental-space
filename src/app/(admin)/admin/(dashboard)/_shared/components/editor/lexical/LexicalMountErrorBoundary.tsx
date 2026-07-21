/**
 * LexicalMountErrorBoundary
 *
 * @description Lexical エディタマウント時の想定外例外に対する保険的な副防御。
 *
 * 主防御（LexicalEditorDesktop / MobileEditorFallback の事前検証）が捕捉できない
 * 未知の例外（例: `editor.setEditorState()` が同期 throw する Lexical error #38）を
 * 共有 `(dashboard)/error.tsx` まで伝播させず、この境界内で吸収する。
 *
 * `componentDidCatch` が捕捉する例外は「未登録 node type による本文破損」に
 * 限らない（例: dynamic chunk の読み込み失敗、子コンポーネントの無関係な
 * render/lifecycle 例外）。原因を確認せずに破壊的リセットを提示すると、
 * 正常な本文を持つ記事を管理者が誤って消去しうる（PR#1346 レビュー指摘 P1）。
 * そのため `findUnregisteredLexicalNodeTypes` を実際に呼び出し、未登録 type を
 * 1 件以上検出できた場合のみ `LexicalCorruptedContentNotice`（破壊的リセット可）を
 * 表示し、それ以外（未検証 or 検証済みで未登録 type なし）は
 * `LexicalGenericMountErrorNotice`（非破壊・再試行のみ）にフォールバックする。
 *
 * `findUnregisteredLexicalNodeTypes`（`./config/registered-node-types`）は
 * Lexical コア + 全カスタム node class を静的 import する重量モジュール
 * （`./config/nodes`）に依存する。このモジュールをトップレベルで static import
 * すると、このコンポーネント自身を static import する `LazyLexicalEditor` の
 * `next/dynamic` によるコード分割が無効化される（PR#1346 レビュー指摘 P2）。
 * そのため実際にエラーを捕捉した後にのみ動的 `import()` する
 * （通常時・かつマウント成功時は一切ロードされない）。
 *
 * React Error Boundary は class component の `getDerivedStateFromError` /
 * `componentDidCatch` でしか実装できない（React 19 時点で hooks 版は存在しない）。
 * React Compiler は function component のみ最適化対象のため class component との
 * 技術的衝突はなく、`forwardRef`/`useMemo`/`useCallback` 直 import 禁止規約にも抵触しない。
 *
 * ## 汎用フォールバックの「再試行」と dynamic import のキャッシュ（PR#1352 レビュー指摘 P2 対応）
 *
 * `componentDidCatch` が捕捉する例外には `next/dynamic`（`LazyLexicalEditor` が
 * ラップする `LexicalEditorDynamic`）の chunk 読み込み失敗も含まれる。
 * `next/dynamic` は内部で `React.lazy(loader)` を 1 度だけ呼び出し、その結果
 * （`_status`/`_result` を持つ payload オブジェクト）をコンポーネント参照の
 * クロージャに保持する。React 19 の `lazyInitializer`（`react/cjs/react.development.js`
 * 実装で実測確認済み）は `payload._status` が一度 `2`（rejected）になると、
 * 以後同じ payload に対する render では loader を再実行せず、キャッシュ済みの
 * Error を同期的に re-throw する — この挙動は React コア自体の恒久キャッシュで、
 * Turbopack/webpack いずれのバンドラー実装にも依存しない。
 * そのため `generation` を key にした Fragment remount だけでは、
 * `LexicalEditorDynamic` が同一コンポーネント参照（＝同一 payload）である限り
 * dynamic import は再実行されず、「再試行する」ボタンがこの一時的な chunk
 * 読み込み失敗を回復できない。
 *
 * 対策として、呼び出し元（`LazyLexicalEditor`）は `onRetryDynamicImport` に
 * 「新しい `dynamic()` 呼び出し（＝新しい `React.lazy()` payload、`_status: -1`
 * の未検証状態）を生成して children に渡す component を差し替える」処理を渡す。
 * `handleRetry` はこれを generation 更新の直前に呼び出すことで、再試行のたびに
 * 実際に import が再試行されるようにする。省略可能（children が dynamic import を
 * 経由しない場合は不要）。
 */

"use client";

import { Component, Fragment, type ReactNode } from "react";
import { logger } from "@/shared/lib/errors/logger-core";
import { LexicalCorruptedContentNotice } from "./parts/LexicalCorruptedContentNotice";
import { LexicalGenericMountErrorNotice } from "./parts/LexicalGenericMountErrorNotice";
import type { LexicalEditorProps } from "./types";

type LexicalMountErrorBoundaryProps = LexicalEditorProps & {
  children: ReactNode;
  /**
   * 汎用フォールバックの「再試行する」押下時、generation を更新して children を
   * 再マウントする直前に呼ばれる。`next/dynamic` でラップされた child が
   * chunk 読み込み失敗で reject した場合、同一コンポーネント参照のまま
   * remount しても React.lazy のキャッシュにより import は再実行されない
   * （詳細はファイル先頭 doc comment）。呼び出し元はこのコールバックで
   * 新しい `dynamic()` 呼び出しに差し替えた children を用意し、実際に
   * import が再試行されるようにする。省略時は remount のみ行う。
   */
  onRetryDynamicImport?: (() => void) | undefined;
};

type LexicalMountErrorBoundaryState = {
  hasError: boolean;
  /**
   * 未登録 node type の検出結果。
   * - `null`: 未検証（`componentDidCatch` 直後、動的 import 解決前）
   * - `[]`: 検証済み・未登録 type なし（本文破損ではない＝原因不明の例外）
   * - 非空配列: 検証済み・未登録 type を確認（本文破損を確認済み）
   */
  unregisteredTypes: string[] | null;
  /** リセット/再試行後に children を強制的に unmount → mount するための世代カウンタ */
  generation: number;
};

export class LexicalMountErrorBoundary extends Component<
  LexicalMountErrorBoundaryProps,
  LexicalMountErrorBoundaryState
> {
  override state: LexicalMountErrorBoundaryState = {
    hasError: false,
    unregisteredTypes: null,
    generation: 0,
  };

  static getDerivedStateFromError(): Partial<LexicalMountErrorBoundaryState> {
    return { hasError: true, unregisteredTypes: null };
  }

  override componentDidCatch(error: Error): void {
    logger.error("Lexical editor mount error", { error: error.message });
    // 破壊的リセットを提示してよいかは、未登録 node type を実際に検出できた
    // 場合のみ（P1）。判定用モジュールは重量物のため、実際にエラーを捕捉した
    // 後にのみ動的 import する（P2）。
    void this.detectUnregisteredTypes();
  }

  private async detectUnregisteredTypes(): Promise<void> {
    const { contentJson } = this.props;
    try {
      const { findUnregisteredLexicalNodeTypes } =
        await import("./config/registered-node-types");
      this.setState({
        unregisteredTypes: findUnregisteredLexicalNodeTypes(contentJson.trim()),
      });
    } catch (importError) {
      // 判定用モジュール自体の読み込みに失敗した場合（例: chunk 取得失敗）は
      // 安全側（本文破損は未確認＝汎用フォールバック・リセット不可）に倒す。
      logger.error("Failed to load registered-node-types for diagnosis", {
        error:
          importError instanceof Error
            ? importError.message
            : String(importError),
      });
      this.setState({ unregisteredTypes: [] });
    }
  }

  private handleChange = (json: string): void => {
    this.props.onChange?.(json);
    this.setState((prev) => ({
      hasError: false,
      unregisteredTypes: null,
      generation: prev.generation + 1,
    }));
  };

  /**
   * 汎用フォールバックの「再試行」: 本文には一切触れず children を再マウントする。
   * dynamic import の再試行が必要な場合は、remount 前に `onRetryDynamicImport` で
   * 呼び出し元に新しい component 差し替えを要求する（ファイル先頭 doc comment参照）。
   */
  private handleRetry = (): void => {
    this.props.onRetryDynamicImport?.();
    this.setState((prev) => ({
      hasError: false,
      unregisteredTypes: null,
      generation: prev.generation + 1,
    }));
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      const { unregisteredTypes } = this.state;
      if (unregisteredTypes && unregisteredTypes.length > 0) {
        // 未登録 node type を実際に確認済み: 破壊的リセットを提示してよい
        return (
          <LexicalCorruptedContentNotice
            unregisteredTypes={unregisteredTypes}
            contentJson={this.props.contentJson}
            onChange={this.props.onChange ? this.handleChange : undefined}
          />
        );
      }
      // 未検証、または検証済みで未登録 type なし（＝原因不明の例外）:
      // 本文が破損している確証がないため、破壊的リセットは提示しない
      return <LexicalGenericMountErrorNotice onRetry={this.handleRetry} />;
    }
    // key を世代カウンタにすることで、リセット/再試行後は children を完全に
    // 再マウントする（LexicalEditorDesktopMounted の非制御 useState 初期化を
    // 新しい contentJson でやり直させるため）。
    return (
      <Fragment key={this.state.generation}>{this.props.children}</Fragment>
    );
  }
}
