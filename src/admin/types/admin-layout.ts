/**
 * 管理画面レイアウト型定義
 */

import type { ReactNode } from 'react'

/** サイドバー状態 */
export type SidebarState = 'expanded' | 'collapsed' | 'hidden'

/** ブレークポイント */
interface Breakpoints {
  mobile: number
  tablet: number
  desktop: number
}

export const BREAKPOINTS: Breakpoints = {
  mobile: 640, // sm
  tablet: 1024, // lg
  desktop: 1280, // xl
}

/** レイアウトコンテキスト */
export type AdminLayoutContextValue = {
  sidebarState: SidebarState
  toggleSidebar: () => void
  closeSidebar: () => void
  isMobile: boolean
}

/** サイドバーアイテム */
export type SidebarItem = {
  label: string
  href: string
  icon: ReactNode
}
