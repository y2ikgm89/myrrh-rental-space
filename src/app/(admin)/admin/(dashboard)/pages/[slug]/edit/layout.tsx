/**
 * ページエディター専用レイアウト
 *
 * Lexicalエディター向けフルスクリーンレイアウト
 * 親レイアウトのTopBar/Sidebarを上書きしてフルスクリーン表示
 */

import type { ReactElement, ReactNode } from 'react'
import { Z_INDEX } from '@/lib/styles/z-index'

export default function PageEditorLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <div
      className="fixed inset-0 flex flex-col bg-white overflow-hidden"
      style={{ zIndex: Z_INDEX.editorFullscreen }}
    >
      {children}
    </div>
  )
}
