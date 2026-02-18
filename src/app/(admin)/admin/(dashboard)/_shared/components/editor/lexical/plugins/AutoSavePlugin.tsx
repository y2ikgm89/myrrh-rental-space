/**
 * Auto Save Plugin
 *
 * @description デバウンス付きオートセーブプラグイン
 *
 * 2層保存:
 * - LocalStorage: 2秒debounce（即時下書き保存）
 * - Server Action: 10秒debounce（親コンポーネント経由）
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

// =============================================================================
// Types
// =============================================================================

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'unsaved' | 'error'

// =============================================================================
// Hook
// =============================================================================

export function useAutoSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>('idle')
  return { saveStatus: status, setSaveStatus: setStatus }
}

// =============================================================================
// Plugin
// =============================================================================

const LOCAL_DEBOUNCE_MS = 2000
const SERVER_DEBOUNCE_MS = 10000

export function AutoSavePlugin({
  onAutoSave,
  autoSaveKey,
  onStatusChange,
}: {
  onAutoSave?: (json: string) => Promise<void>
  autoSaveKey?: string
  onStatusChange?: (status: SaveStatus) => void
}) {
  const [editor] = useLexicalComposerContext()
  const localTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstUpdate = useRef(true)

  useEffect(() => {
    if (!autoSaveKey && !onAutoSave) return

    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      // 初回更新は無視（初期化時）
      if (isFirstUpdate.current) {
        isFirstUpdate.current = false
        return
      }

      // 変更がない場合は無視
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return

      onStatusChange?.('unsaved')

      const json = JSON.stringify(editorState.toJSON())

      // LocalStorage保存（2秒debounce）
      if (autoSaveKey) {
        if (localTimerRef.current) clearTimeout(localTimerRef.current)
        localTimerRef.current = setTimeout(() => {
          try {
            localStorage.setItem(`lexical-draft:${autoSaveKey}`, json)
            localStorage.setItem(`lexical-draft-time:${autoSaveKey}`, new Date().toISOString())
          } catch {
            // QuotaExceeded等は無視
          }
        }, LOCAL_DEBOUNCE_MS)
      }

      // Server保存（10秒debounce）
      if (onAutoSave) {
        if (serverTimerRef.current) clearTimeout(serverTimerRef.current)
        serverTimerRef.current = setTimeout(() => {
          onStatusChange?.('saving')
          onAutoSave(json)
            .then(() => onStatusChange?.('saved'))
            .catch(() => onStatusChange?.('error'))
        }, SERVER_DEBOUNCE_MS)
      }
    })
  }, [editor, onAutoSave, autoSaveKey, onStatusChange])

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current)
      if (serverTimerRef.current) clearTimeout(serverTimerRef.current)
    }
  }, [])

  return null
}

// =============================================================================
// Draft Recovery
// =============================================================================

export function getDraftJson(autoSaveKey: string): { json: string; savedAt: string } | null {
  try {
    const json = localStorage.getItem(`lexical-draft:${autoSaveKey}`)
    const savedAt = localStorage.getItem(`lexical-draft-time:${autoSaveKey}`)
    if (json && savedAt) {
      return { json, savedAt }
    }
  } catch {
    // localStorage不可
  }
  return null
}

export function clearDraft(autoSaveKey: string): void {
  try {
    localStorage.removeItem(`lexical-draft:${autoSaveKey}`)
    localStorage.removeItem(`lexical-draft-time:${autoSaveKey}`)
  } catch {
    // localStorage不可
  }
}
