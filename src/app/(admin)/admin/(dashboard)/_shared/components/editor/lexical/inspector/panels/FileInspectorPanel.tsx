/**
 * File Inspector Panel
 *
 * @description FileNode のプロパティ編集パネル
 */

'use client'

import { useEffect, useState } from 'react'
import { $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isFileNode, fileUrlState, fileNameState, fileSizeState, fileMimeState, formatFileSize } from '../../nodes/FileNode'
import type { FileNode } from '../../nodes/FileNode'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorFields } from '../InspectorFields'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Input, Label } from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type FileInspectorPanelProps = {
  nodeKey: string
  node: FileNode
}

// =============================================================================
// Component
// =============================================================================

export function FileInspectorPanel({ nodeKey, node }: FileInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isFileNode)

  const [url, setUrl] = useState(() =>
    editor.getEditorState().read(() => $getState(node, fileUrlState))
  )
  const [fileName, setFileName] = useState(() =>
    editor.getEditorState().read(() => $getState(node, fileNameState))
  )
  const [fileSize, setFileSize] = useState(() =>
    editor.getEditorState().read(() => $getState(node, fileSizeState))
  )
  const [mime, setMime] = useState(() =>
    editor.getEditorState().read(() => $getState(node, fileMimeState))
  )

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        setUrl($getState(node, fileUrlState))
        setFileName($getState(node, fileNameState))
        setFileSize($getState(node, fileSizeState))
        setMime($getState(node, fileMimeState))
      })
    })
  }, [editor, node])

  const handleFileNameChange = (value: string) => {
    updateNode((n) => {
      $setState(n, fileNameState, value)
    })
  }

  return (
    <div>
      <InspectorHeader title="ファイル添付" />

      <InspectorFields title="基本設定">
        <div className="space-y-2">
          <Label className="text-xs">ファイルURL</Label>
          <p className="text-xs text-muted-foreground truncate">{url}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-file-name" className="text-xs">
            ファイル名
          </Label>
          <Input
            id="inspector-file-name"
            value={fileName}
            onChange={(e) => handleFileNameChange(e.target.value)}
            placeholder="document.pdf"
            className="h-8 text-sm"
          />
        </div>

        {fileSize > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">ファイルサイズ</Label>
            <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
          </div>
        )}

        {mime && (
          <div className="space-y-2">
            <Label className="text-xs">MIMEタイプ</Label>
            <p className="text-xs text-muted-foreground">{mime}</p>
          </div>
        )}
      </InspectorFields>
    </div>
  )
}
