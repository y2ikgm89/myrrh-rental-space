"use client";

/**
 * AdminLayoutContext
 *
 * 管理画面のサイドバー状態を管理するContext
 * レスポンシブ対応: モバイル時はドロワー、デスクトップ時は固定
 *
 * React 19 ベストプラクティス準拠:
 * - use() フックでContext読み取り（条件分岐後でも呼べる）
 * - useSyncExternalStore でhydration対策
 * - useEffect内での同期的setStateを回避
 */

import {
  createContext,
  use,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  AdminLayoutContextValue,
  SidebarState,
} from "@/admin/types/admin-layout";
import { BREAKPOINTS } from "@/admin/types/admin-layout";

const AdminLayoutContext = createContext<AdminLayoutContextValue | undefined>(
  undefined,
);

// =============================================================================
// Hydration-safe hooks using useSyncExternalStore
// =============================================================================

const emptySubscribe = () => () => {};

/** クライアントサイドでのみtrueを返す */
function useHasMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function subscribeWindowResize(callback: () => void): () => void {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

function getWindowWidth(): number {
  return window.innerWidth;
}

function getServerWindowWidth(): number {
  return 1024; // SSRではデスクトップ想定
}

/** 画面幅を監視（SSRではデスクトップ想定） */
function useWindowWidth(): number {
  return useSyncExternalStore(
    subscribeWindowResize,
    getWindowWidth,
    getServerWindowWidth,
  );
}

// =============================================================================
// Provider
// =============================================================================

type AdminLayoutProviderProps = {
  children: ReactNode;
};

export function AdminLayoutProvider({ children }: AdminLayoutProviderProps) {
  const hasMounted = useHasMounted();
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < BREAKPOINTS.tablet;

  const [isFullscreen, setIsFullscreen] = useState(false);

  // ユーザーがオーバーライドした状態（null = デフォルトを使用）
  // forMobile: どの画面サイズでオーバーライドしたか（画面サイズ変更時に自動リセット）
  const [sidebarOverride, setSidebarOverride] = useState<{
    state: SidebarState;
    forMobile: boolean;
  } | null>(null);

  // 画面サイズに基づくデフォルト状態
  const defaultSidebarState: SidebarState = isMobile ? "hidden" : "expanded";

  // 実際のサイドバー状態（派生値として計算、useEffect不要）
  const sidebarState: SidebarState = (() => {
    // フルスクリーン時は常にhidden
    if (isFullscreen) return "hidden";
    // オーバーライドがあり、かつ同じ画面サイズの場合のみ適用
    if (sidebarOverride && sidebarOverride.forMobile === isMobile) {
      return sidebarOverride.state;
    }
    return defaultSidebarState;
  })();

  const toggleSidebar = () => {
    setSidebarOverride((prev) => {
      const current =
        prev?.forMobile === isMobile ? prev.state : defaultSidebarState;
      return {
        state: current === "hidden" ? "expanded" : "hidden",
        forMobile: isMobile,
      };
    });
  };

  const closeSidebar = () => {
    setSidebarOverride({ state: "hidden", forMobile: isMobile });
  };

  const enterFullscreen = () => {
    setIsFullscreen(true);
  };

  const exitFullscreen = () => {
    setIsFullscreen(false);
  };

  return (
    <AdminLayoutContext
      value={{
        sidebarState,
        toggleSidebar,
        closeSidebar,
        isMobile,
        isFullscreen,
        enterFullscreen,
        exitFullscreen,
        hasMounted,
      }}
    >
      {children}
    </AdminLayoutContext>
  );
}

export function useAdminLayout() {
  const context = use(AdminLayoutContext);
  if (context === undefined) {
    throw new Error("useAdminLayout must be used within AdminLayoutProvider");
  }
  return context;
}
