/**
 * Z-Index Token System
 *
 * 一元管理されたz-index値システム
 * アプリケーション全体でのz-index競合を防止
 *
 * @example
 * import { Z_INDEX } from '@/lib/styles/z-index'
 * className={`z-[${Z_INDEX.editorToolbar}]`}
 */

export const Z_INDEX = {
  // Base layers (0-9)
  base: 0,

  // Content layers (10-29)
  sticky: 10,
  dropdown: 20,

  // Popover layers (30-39)
  popover: 30,

  // Overlay layers (40-49)
  overlay: 40,

  // Modal layers (50-59)
  modal: 50,

  // Editor layers (60-79)
  editorCanvas: 60,
  editorToolbar: 65,
  editorSidePanel: 70,
  editorFloating: 75,

  // Admin layers (80-89)
  adminSidebar: 80,
  adminHeader: 85,

  // System layers (90-99)
  toast: 90,
  tooltip: 95,
  emergency: 99,
} as const

export type ZIndexKey = keyof typeof Z_INDEX

