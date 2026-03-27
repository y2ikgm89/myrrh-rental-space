/**
 * Inspector Sidebar の開閉状態を LexicalComposer 配下で共有する Context。
 *
 * @description
 * ツールバー・キーボードショートカット・サイドバー本体が同一の状態を参照する。
 * 開閉は localStorage に永続化し、再訪時もユーザー希望を尊重する。
 */

"use client";

import { createContext, use, useState, type ReactNode } from "react";

/** 値: `"1"` = 展開、`"0"` = 折りたたみ。未設定時は折りたたみ（執筆領域を広く取る）。 */
const STORAGE_KEY = "myrrh-lexical-inspector-panel";

/**
 * localStorage から初期の開閉状態を読む（クライアントのみ）。
 * 未設定時は折りたたみを既定とする。
 */
function readInitialExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export type InspectorSidebarContextValue = {
  /** パネルが画面上で展開されているか（サイドバー無効時は常に false） */
  isExpanded: boolean;
  /** インスペクターがこのエディタで有効か（showInspector） */
  isInspectorAvailable: boolean;
  /** 開閉を切り替え（無効時は no-op） */
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
};

const InspectorSidebarContext = createContext<
  InspectorSidebarContextValue | undefined
>(undefined);

type InspectorSidebarProviderProps = {
  children: ReactNode;
  /** LexicalEditor の showInspector。false のときパネル・トグルは無効 */
  enabled: boolean;
};

export function InspectorSidebarProvider({
  children,
  enabled,
}: InspectorSidebarProviderProps) {
  const [isExpanded, setIsExpanded] = useState(() =>
    enabled ? readInitialExpanded() : false,
  );

  const persist = (next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* Storage 利用不可（プライベートモード等）は無視 */
    }
  };

  const setExpanded = (next: boolean) => {
    if (!enabled) return;
    setIsExpanded(next);
    persist(next);
  };

  const toggle = () => {
    if (!enabled) return;
    setIsExpanded((prev) => {
      const next = !prev;
      persist(next);
      return next;
    });
  };

  const expand = () => {
    setExpanded(true);
  };

  const collapse = () => {
    setExpanded(false);
  };

  const value: InspectorSidebarContextValue = {
    isExpanded: Boolean(enabled && isExpanded),
    isInspectorAvailable: enabled,
    toggle,
    expand,
    collapse,
  };

  return (
    <InspectorSidebarContext value={value}>{children}</InspectorSidebarContext>
  );
}

export function useInspectorSidebar(): InspectorSidebarContextValue {
  const ctx = use(InspectorSidebarContext);
  if (ctx === undefined) {
    throw new Error(
      "useInspectorSidebar must be used within InspectorSidebarProvider",
    );
  }
  return ctx;
}
