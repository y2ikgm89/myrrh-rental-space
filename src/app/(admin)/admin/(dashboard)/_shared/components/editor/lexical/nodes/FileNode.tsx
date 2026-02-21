/**
 * File Node
 *
 * @description ファイル添付ダウンロードリンクを埋め込むDecoratorNode
 */

'use client'

import type { ReactElement } from 'react'
import type {
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
} from 'lexical'
import { $create, $getState, $setState, createState, DecoratorNode } from 'lexical'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'

// =============================================================================
// State
// =============================================================================

export const fileUrlState = createState('url', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

export const fileNameState = createState('filename', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

export const fileSizeState = createState('filesize', {
  parse: (v: unknown): number => (typeof v === 'number' && v >= 0 ? v : 0),
})

export const fileMimeState = createState('mime', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

// =============================================================================
// Utilities
// =============================================================================

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '不明'
  const units = ['B', 'KB', 'MB', 'GB'] as const
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]!}`
}

function getFileIconEmoji(mime: string): string {
  if (mime.includes('pdf')) return '📕'
  if (mime.includes('word') || mime.includes('doc')) return '📘'
  if (mime.includes('sheet') || mime.includes('xls') || mime.includes('csv')) return '📗'
  if (mime.includes('zip') || mime.includes('archive') || mime.includes('tar') || mime.includes('gz')) return '📦'
  if (mime.includes('image')) return '🖼️'
  if (mime.includes('video')) return '🎬'
  if (mime.includes('audio')) return '🎵'
  return '📄'
}

// =============================================================================
// Component
// =============================================================================

function FileComponent({
  url,
  fileName,
  fileSize,
  mime,
  nodeKey,
}: {
  url: string
  fileName: string
  fileSize: number
  mime: string
  nodeKey: NodeKey
}) {
  const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey)
  const icon = getFileIconEmoji(mime)
  const sizeText = formatFileSize(fileSize)

  return (
    <a
      href={url}
      download
      onClick={(e) => {
        e.preventDefault()
        setSelected(true)
      }}
      className={`flex items-center gap-3 rounded-lg border bg-card p-3 my-2 no-underline hover:bg-accent transition-colors ${
        isSelected ? 'ring-2 ring-ring' : ''
      }`}
    >
      <span className="text-2xl flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-card-foreground">{fileName || url}</p>
        {fileSize > 0 && (
          <p className="text-xs text-muted-foreground">{sizeText}</p>
        )}
      </div>
    </a>
  )
}

// =============================================================================
// Node Class
// =============================================================================

export class FileNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('file', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: fileUrlState },
        { flat: true, stateConfig: fileNameState },
        { flat: true, stateConfig: fileSizeState },
        { flat: true, stateConfig: fileMimeState },
      ],
    })
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-lexical-file', 'true')
    return div
  }

  override updateDOM(): false {
    return false
  }

  override exportDOM(): DOMExportOutput {
    const a = document.createElement('a')
    a.setAttribute('data-file', 'true')
    a.setAttribute('href', $getState(this, fileUrlState))
    a.setAttribute('download', '')
    a.setAttribute('data-file-name', $getState(this, fileNameState))
    a.setAttribute('data-file-size', String($getState(this, fileSizeState)))
    a.setAttribute('data-file-mime', $getState(this, fileMimeState))
    const name = $getState(this, fileNameState)
    const size = formatFileSize($getState(this, fileSizeState))
    a.textContent = `ダウンロード: ${name} (${size})`
    return { element: a }
  }

  override decorate(): ReactElement {
    return (
      <FileComponent
        url={$getState(this, fileUrlState)}
        fileName={$getState(this, fileNameState)}
        fileSize={$getState(this, fileSizeState)}
        mime={$getState(this, fileMimeState)}
        nodeKey={this.__key}
      />
    )
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * FileNodeを作成する
 *
 * @param params - ファイルのパラメータ
 * @returns FileNode インスタンス
 */
export function $createFileNode(params: {
  url: string
  fileName: string
  fileSize?: number
  mime?: string
}): FileNode {
  const node = $create(FileNode)
  $setState(node, fileUrlState, params.url)
  $setState(node, fileNameState, params.fileName)
  $setState(node, fileSizeState, params.fileSize ?? 0)
  $setState(node, fileMimeState, params.mime ?? '')
  return node
}

/**
 * ノードがFileNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns FileNodeの場合true
 */
export function $isFileNode(
  node: LexicalNode | null | undefined,
): node is FileNode {
  return node instanceof FileNode
}
