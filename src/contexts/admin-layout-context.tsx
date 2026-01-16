'use client'

/**
 * AdminLayoutContext
 *
 * 管理画面のサイドバー状態を管理するContext
 * レスポンシブ対応: モバイル時はドロワー、デスクトップ時は固定
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import type { AdminLayoutContextValue, SidebarState } from '@/types/admin-layout'
import { BREAKPOINTS } from '@/types/admin-layout'

const AdminLayoutContext = createContext<AdminLayoutContextValue | null>(null)

type AdminLayoutProviderProps = {
  children: ReactNode
}

export function AdminLayoutProvider({ children }: AdminLayoutProviderProps) {
  const [sidebarState, setSidebarState] = useState<SidebarState>('expanded')
  const [isMobile, setIsMobile] = useState(false)

  // ブレークポイント検出
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      const mobile = width < BREAKPOINTS.tablet
      setIsMobile(mobile)

      // モバイル時は自動的にhidden
      if (mobile) {
        setSidebarState('hidden')
      } else {
        setSidebarState('expanded')
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleSidebar = () => {
    setSidebarState((prev) => (prev === 'hidden' ? 'expanded' : 'hidden'))
  }

  const closeSidebar = () => {
    setSidebarState('hidden')
  }

  return (
    <AdminLayoutContext.Provider
      value={{
        sidebarState,
        toggleSidebar,
        closeSidebar,
        isMobile,
      }}
    >
      {children}
    </AdminLayoutContext.Provider>
  )
}

export function useAdminLayout() {
  const context = useContext(AdminLayoutContext)
  if (!context) {
    throw new Error('useAdminLayout must be used within AdminLayoutProvider')
  }
  return context
}
