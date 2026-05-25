/**
 * 管理画面レイアウト型定義
 */

import type { ReactNode } from "react";
import type { Action, Resource } from "@/shared/lib/admin-resources";

/** サイドバー状態 */
export type SidebarState = "expanded" | "collapsed" | "hidden";

/** ブレークポイント */
interface Breakpoints {
  mobile: number;
  tablet: number;
  desktop: number;
}

export const BREAKPOINTS: Breakpoints = {
  mobile: 640, // sm
  tablet: 1024, // lg
  desktop: 1280, // xl
};

/** レイアウトコンテキスト */
export type AdminLayoutContextValue = {
  sidebarState: SidebarState;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  isMobile: boolean;
  /** フルスクリーンモード（エディタ使用時にサイドバーを隠す） */
  isFullscreen: boolean;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  /** クライアントサイドでマウント完了したか（Hydration対策用） */
  hasMounted: boolean;
};

/** サイドバーアイテム */
export type SidebarItemPermission = {
  resource: Resource;
  action: Action;
};

export type SidebarItem = {
  label: string;
  href: string;
  icon: ReactNode;
  requiredPermission?: SidebarItemPermission;
};
