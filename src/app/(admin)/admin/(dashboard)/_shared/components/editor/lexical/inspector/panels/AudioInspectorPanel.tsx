/**
 * Audio Inspector Panel
 *
 * @description AudioNode のプロパティ編集パネル
 */

'use client'

import { useEffect, useState } from 'react'
import { $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isAudioNode, audioUrlState, audioTitleState, audioArtistState } from '../../nodes/AudioNode'
import type { AudioNode } from '../../nodes/AudioNode'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorFields } from '../InspectorFields'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Input, Label } from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type AudioInspectorPanelProps = {
  nodeKey: string
  node: AudioNode
}

// =============================================================================
// Component
// =============================================================================

export function AudioInspectorPanel({ nodeKey, node }: AudioInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isAudioNode)

  const [url, setUrl] = useState(() =>
    editor.getEditorState().read(() => $getState(node, audioUrlState))
  )
  const [title, setTitle] = useState(() =>
    editor.getEditorState().read(() => $getState(node, audioTitleState))
  )
  const [artist, setArtist] = useState(() =>
    editor.getEditorState().read(() => $getState(node, audioArtistState))
  )

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        setUrl($getState(node, audioUrlState))
        setTitle($getState(node, audioTitleState))
        setArtist($getState(node, audioArtistState))
      })
    })
  }, [editor, node])

  const handleTitleChange = (value: string) => {
    updateNode((n) => {
      $setState(n, audioTitleState, value)
    })
  }

  const handleArtistChange = (value: string) => {
    updateNode((n) => {
      $setState(n, audioArtistState, value)
    })
  }

  return (
    <div>
      <InspectorHeader title="音声プレイヤー" />

      <InspectorFields title="基本設定">
        <div className="space-y-2">
          <Label className="text-xs">音声URL</Label>
          <p className="text-xs text-muted-foreground truncate">{url}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-audio-title" className="text-xs">
            タイトル
          </Label>
          <Input
            id="inspector-audio-title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="楽曲タイトル"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-audio-artist" className="text-xs">
            アーティスト
          </Label>
          <Input
            id="inspector-audio-artist"
            value={artist}
            onChange={(e) => handleArtistChange(e.target.value)}
            placeholder="アーティスト名"
            className="h-8 text-sm"
          />
        </div>
      </InspectorFields>
    </div>
  )
}
