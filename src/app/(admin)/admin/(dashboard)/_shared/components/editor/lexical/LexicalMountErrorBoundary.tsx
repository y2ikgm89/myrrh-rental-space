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
 */

"use client";

import { Component, Fragment, type ReactNode } from "react";
import { logger } from "@/shared/lib/errors/logger-core";
import { LexicalCorruptedContentNotice } from "./parts/LexicalCorruptedContentNotice";
import { LexicalGenericMountErrorNotice } from "./parts/LexicalGenericMountErrorNotice";
import type { LexicalEditorProps } from "./types";

type LexicalMountErrorBoundaryProps = LexicalEditorProps & {
  children: ReactNode;
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

  /** 汎用フォールバックの「再試行」: 本文には一切触れず children を再マウントするのみ */
  private handleRetry = (): void => {
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
