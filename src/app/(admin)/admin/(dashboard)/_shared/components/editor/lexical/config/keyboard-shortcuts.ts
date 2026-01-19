/**
 * Keyboard Shortcuts Configuration
 *
 * エディターのキーボードショートカット定義
 * ツールチップやヘルプで使用
 */

export type ShortcutKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bulletList'
  | 'numberedList'
  | 'quote'
  | 'undo'
  | 'redo'
  | 'save'

type ShortcutDefinition = {
  key: string
  mac: string
  win: string
  label: string
}

/**
 * キーボードショートカット定義
 */
export const KEYBOARD_SHORTCUTS: Record<ShortcutKey, ShortcutDefinition> = {
  // テキストフォーマット
  bold: {
    key: 'mod+b',
    mac: '⌘B',
    win: 'Ctrl+B',
    label: '太字',
  },
  italic: {
    key: 'mod+i',
    mac: '⌘I',
    win: 'Ctrl+I',
    label: '斜体',
  },
  underline: {
    key: 'mod+u',
    mac: '⌘U',
    win: 'Ctrl+U',
    label: '下線',
  },
  strikethrough: {
    key: 'mod+shift+s',
    mac: '⌘⇧S',
    win: 'Ctrl+Shift+S',
    label: '打消し線',
  },
  code: {
    key: 'mod+e',
    mac: '⌘E',
    win: 'Ctrl+E',
    label: 'インラインコード',
  },

  // リンク
  link: {
    key: 'mod+k',
    mac: '⌘K',
    win: 'Ctrl+K',
    label: 'リンク挿入',
  },

  // ブロックフォーマット
  h1: {
    key: 'mod+alt+1',
    mac: '⌘⌥1',
    win: 'Ctrl+Alt+1',
    label: '見出し1',
  },
  h2: {
    key: 'mod+alt+2',
    mac: '⌘⌥2',
    win: 'Ctrl+Alt+2',
    label: '見出し2',
  },
  h3: {
    key: 'mod+alt+3',
    mac: '⌘⌥3',
    win: 'Ctrl+Alt+3',
    label: '見出し3',
  },

  // リスト
  bulletList: {
    key: 'mod+shift+8',
    mac: '⌘⇧8',
    win: 'Ctrl+Shift+8',
    label: '箇条書き',
  },
  numberedList: {
    key: 'mod+shift+7',
    mac: '⌘⇧7',
    win: 'Ctrl+Shift+7',
    label: '番号付きリスト',
  },

  // 引用
  quote: {
    key: 'mod+shift+q',
    mac: '⌘⇧Q',
    win: 'Ctrl+Shift+Q',
    label: '引用',
  },

  // 履歴
  undo: {
    key: 'mod+z',
    mac: '⌘Z',
    win: 'Ctrl+Z',
    label: '元に戻す',
  },
  redo: {
    key: 'mod+shift+z',
    mac: '⌘⇧Z',
    win: 'Ctrl+Shift+Z',
    label: 'やり直す',
  },

  // 保存
  save: {
    key: 'mod+s',
    mac: '⌘S',
    win: 'Ctrl+S',
    label: '保存',
  },
}

/**
 * プラットフォームに応じたショートカット表示を取得
 */
export function getShortcutDisplay(shortcutKey: ShortcutKey): string {
  const isMac =
    typeof navigator !== 'undefined' &&
    (/Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ||
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS')
  const shortcut = KEYBOARD_SHORTCUTS[shortcutKey]
  return isMac ? shortcut.mac : shortcut.win
}

