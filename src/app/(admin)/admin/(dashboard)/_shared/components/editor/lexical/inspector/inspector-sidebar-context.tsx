/**
 * Inspector Sidebar の開閉状態を LexicalComposer 配下で共有する Context。
 *
 * @description
 * ツールバー・キーボードショートカット・サイドバー本体が同一の状態を参照する。
 * 開閉は localStorage に永続化し、再訪時もユーザー希望を尊重する。
 */

"use client";

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "myrrh-lexical-inspector-expanded";

/**
 * localStorage から初期の開閉状態を読む（クライアントのみ）。
 * 未設定または破損時は開いた状態を既定とする。
 */
function readInitialExpanded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
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

  const persist = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* Storage 利用不可（プライベートモード等）は無視 */
    }
  }, []);

  const setExpanded = useCallback(
    (next: boolean) => {
      if (!enabled) return;
      setIsExpanded(next);
      persist(next);
    },
    [enabled, persist],
  );

  const toggle = useCallback(() => {
    if (!enabled) return;
    setIsExpanded((prev) => {
      const next = !prev;
      persist(next);
      return next;
    });
  }, [enabled, persist]);

  const expand = useCallback(() => {
    setExpanded(true);
  }, [setExpanded]);

  const collapse = useCallback(() => {
    setExpanded(false);
  }, [setExpanded]);

  const value = useMemo(
    (): InspectorSidebarContextValue => ({
      isExpanded: Boolean(enabled && isExpanded),
      isInspectorAvailable: enabled,
      toggle,
      expand,
      collapse,
    }),
    [enabled, isExpanded, toggle, expand, collapse],
  );

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
