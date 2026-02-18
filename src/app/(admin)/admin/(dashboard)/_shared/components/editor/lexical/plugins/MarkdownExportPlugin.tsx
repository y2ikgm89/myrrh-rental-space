/**
 * Markdown Export Plugin
 *
 * @description Markdownエクスポート機能を提供するプラグイン
 */

'use client'

import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $convertToMarkdownString } from '@lexical/markdown'
import { createPortal } from 'react-dom'
import { FileDown, Copy, Check, Download, X } from 'lucide-react'
import { Button } from '@/admin/components/ui/button'
import { EDITOR_TRANSFORMERS } from '../MarkdownTransformers'

// =============================================================================
// Export Dialog
// =============================================================================

function MarkdownExportDialog({
  markdown,
  onClose,
}: {
  markdown: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    void navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `export-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <FileDown className="h-4 w-4" />
            <span>Markdownエクスポート</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="text-xs">{copied ? 'コピー済み' : 'コピー'}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={handleDownload}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="text-xs">ダウンロード</span>
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
            {markdown}
          </pre>
        </div>
      </div>
    </div>,
    document.body
  )
}

// =============================================================================
// Plugin
// =============================================================================

export function MarkdownExportPlugin() {
  const [editor] = useLexicalComposerContext()
  const [markdown, setMarkdown] = useState<string | null>(null)

  const handleExport = () => {
    editor.getEditorState().read(() => {
      const md = $convertToMarkdownString(EDITOR_TRANSFORMERS)
      setMarkdown(md)
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleExport}
        title="Markdownエクスポート"
      >
        <FileDown className="h-3.5 w-3.5" />
      </Button>
      {markdown !== null && (
        <MarkdownExportDialog
          markdown={markdown}
          onClose={() => setMarkdown(null)}
        />
      )}
    </>
  )
}
