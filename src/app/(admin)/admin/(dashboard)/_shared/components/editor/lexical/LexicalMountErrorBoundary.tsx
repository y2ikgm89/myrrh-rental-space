/**
 * LexicalMountErrorBoundary
 *
 * @description Lexical エディタマウント時の想定外例外に対する保険的な副防御。
 *
 * 主防御（LexicalEditorDesktop / MobileEditorFallback の事前検証）が捕捉できない
 * 未知の例外（例: `editor.setEditorState()` が同期 throw する Lexical error #38）を
 * 共有 `(dashboard)/error.tsx` まで伝播させず、この境界内で吸収する。
 *
 * React Error Boundary は class component の `getDerivedStateFromError` /
 * `componentDidCatch` でしか実装できない（React 19 時点で hooks 版は存在しない）。
 * React Compiler は function component のみ最適化対象のため class component との
 * 技術的衝突はなく、`forwardRef`/`useMemo`/`useCallback` 直 import 禁止規約にも抵触しない。
 */

"use client";

import { Component, Fragment, type ReactNode } from "react";
import { logger } from "@/shared/lib/errors/logger-core";
import { findUnregisteredLexicalNodeTypes } from "./config/registered-node-types";
import { LexicalCorruptedContentNotice } from "./parts/LexicalCorruptedContentNotice";
import type { LexicalEditorProps } from "./types";

type LexicalMountErrorBoundaryProps = LexicalEditorProps & {
  children: ReactNode;
};

type LexicalMountErrorBoundaryState = {
  hasError: boolean;
  unregisteredTypes: string[];
  /** リセット後に children を強制的に unmount → mount するための世代カウンタ */
  generation: number;
};

export class LexicalMountErrorBoundary extends Component<
  LexicalMountErrorBoundaryProps,
  LexicalMountErrorBoundaryState
> {
  override state: LexicalMountErrorBoundaryState = {
    hasError: false,
    unregisteredTypes: [],
    generation: 0,
  };

  static getDerivedStateFromError(): Partial<LexicalMountErrorBoundaryState> {
    return { hasError: true };
  }

  override componentDidCatch(error: Error): void {
    logger.error("Lexical editor mount error", { error: error.message });
    // ベストエフォート: 原因が未登録 node type なら文言に反映する。
    // 取れなければ空のまま（Notice 側が汎用文言にフォールバックする）。
    this.setState({
      unregisteredTypes: findUnregisteredLexicalNodeTypes(
        this.props.contentJson.trim(),
      ),
    });
  }

  private handleChange = (json: string): void => {
    this.props.onChange?.(json);
    this.setState((prev) => ({
      hasError: false,
      unregisteredTypes: [],
      generation: prev.generation + 1,
    }));
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <LexicalCorruptedContentNotice
          unregisteredTypes={this.state.unregisteredTypes}
          contentJson={this.props.contentJson}
          onChange={this.props.onChange ? this.handleChange : undefined}
        />
      );
    }
    // key を世代カウンタにすることで、リセット後は children を完全に
    // 再マウントする（LexicalEditorDesktopMounted の非制御 useState 初期化を
    // 新しい contentJson でやり直させるため）。
    return (
      <Fragment key={this.state.generation}>{this.props.children}</Fragment>
    );
  }
}
