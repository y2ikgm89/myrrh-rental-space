/**
 * Block Template Plugin
 *
 * @description ブロックテンプレートの保存・挿入を提供するプラグイン
 *
 * 選択中のブロックをテンプレートとして保存し、後から挿入できる
 */

'use client'

import { useEffect, useState, useTransition } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  $isNodeSelection,
  $getRoot,
  $insertNodes,
  $parseSerializedNode,
  createCommand,
  COMMAND_PRIORITY_EDITOR,
  type LexicalCommand,
  type SerializedLexicalNode,
} from 'lexical'
import { z } from 'zod'
import { Blocks, Trash2, Loader2, Save } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Textarea,
} from '@/admin/components/ui'
import {
  createBlockTemplate,
  deleteBlockTemplate,
} from '@/admin/actions/block-template'
import type { BlockTemplateListItem } from '@/shared/domain/block-template/types'
import { toast } from 'sonner'

// =============================================================================
// Validation
// =============================================================================

const serializedNodeSchema = z
  .object({
    type: z.string(),
    version: z.number(),
  })
  .passthrough()

const serializedNodeArraySchema = z.array(serializedNodeSchema)

// =============================================================================
// Commands
// =============================================================================

export const SAVE_BLOCK_TEMPLATE_COMMAND: LexicalCommand<undefined> = createCommand('SAVE_BLOCK_TEMPLATE')
export const INSERT_BLOCK_TEMPLATE_COMMAND: LexicalCommand<undefined> = createCommand('INSERT_BLOCK_TEMPLATE')

async function fetchBlockTemplates(): Promise<BlockTemplateListItem[]> {
  const response = await fetch('/admin/api/block-templates', {
    credentials: 'same-origin',
  })

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'テンプレートの取得に失敗しました'
    throw new Error(message)
  }

  const data: BlockTemplateListItem[] = await response.json()
  return data
}

async function fetchBlockTemplateById(id: string): Promise<{ nodeJson: unknown }> {
  const response = await fetch(`/admin/api/block-templates/${id}`, {
    credentials: 'same-origin',
  })

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'テンプレートの取得に失敗しました'
    throw new Error(message)
  }

  const data: { nodeJson: unknown } = await response.json()
  return data
}

// =============================================================================
// Save Dialog
// =============================================================================

function SaveTemplateDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [editor] = useLexicalComposerContext()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPending, startTransition] = useTransition()

  const resetForm = () => {
    setName('')
    setDescription('')
  }

  const handleSave = () => {
    if (!name.trim()) return

    editor.getEditorState().read(() => {
      const selection = $getSelection()
      let serializedNodes: SerializedLexicalNode[] = []

      if ($isRangeSelection(selection) || $isNodeSelection(selection)) {
        const nodes = selection.getNodes()
        // 選択されたノードの最上位要素を取得してシリアライズ
        const topLevelNodes = new Set<string>()
        for (const node of nodes) {
          const topLevel = node.getTopLevelElement()
          if (topLevel) {
            topLevelNodes.add(topLevel.getKey())
          }
        }
        const root = $getRoot()
        for (const child of root.getChildren()) {
          if (topLevelNodes.has(child.getKey())) {
            serializedNodes.push(child.exportJSON())
          }
        }
      }

      if (serializedNodes.length === 0) {
        // 選択がない場合は全ブロックを保存
        const root = $getRoot()
        serializedNodes = root.getChildren().map((child) => child.exportJSON())
      }

      if (serializedNodes.length === 0) {
        toast.error('保存するブロックがありません')
        return
      }

      startTransition(async () => {
        const result = await createBlockTemplate({
          name: name.trim(),
          description: description.trim() || undefined,
          nodeJson: serializedNodes,
        })

        if (result.success) {
          toast.success(result.message)
          resetForm()
          onClose()
        } else {
          toast.error(result.error)
        }
      })
    })
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>テンプレートとして保存</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">テンプレート名</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: お知らせヘッダー"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-desc">説明（任意）</Label>
            <Textarea
              id="template-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="テンプレートの用途や内容を記載"
              rows={2}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            選択中のブロックがテンプレートとして保存されます。
            選択がない場合はエディタ全体が保存されます。
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Insert Dialog
// =============================================================================

function InsertTemplateDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [editor] = useLexicalComposerContext()
  const [templates, setTemplates] = useState<BlockTemplateListItem[] | null>(null)
  const [isInserting, setIsInserting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const isLoading = isOpen && templates === null

  useEffect(() => {
    if (!isOpen) {
      return () => {
        setTemplates(null)
      }
    }
    void fetchBlockTemplates()
      .then(setTemplates)
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'テンプレートの取得に失敗しました'
        toast.error(message)
        setTemplates([])
      })
  }, [isOpen])

  const handleInsert = (templateId: string) => {
    setIsInserting(true)
    void fetchBlockTemplateById(templateId).then((result) => {
      setIsInserting(false)

      const parsed = serializedNodeArraySchema.safeParse(result.nodeJson)
      if (!parsed.success) {
        toast.error('テンプレートデータが不正です')
        return
      }

      editor.update(() => {
        const nodes = parsed.data.map((serialized) =>
          $parseSerializedNode(serialized)
        )
        $insertNodes(nodes)
      })

      toast.success('テンプレートを挿入しました')
      onClose()
    }).catch((error: unknown) => {
      setIsInserting(false)
      const message =
        error instanceof Error ? error.message : 'テンプレートの取得に失敗しました'
      toast.error(message)
    })
  }

  const handleDelete = (templateId: string) => {
    setDeletingId(templateId)
    void deleteBlockTemplate(templateId).then((result) => {
      setDeletingId(null)
      if (result.success) {
        setTemplates((prev) => prev !== null ? prev.filter((t) => t.id !== templateId) : null)
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>テンプレートから挿入</DialogTitle>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !templates || templates.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              保存されたテンプレートがありません
            </div>
          ) : (
            <div className="space-y-1">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="group flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-accent"
                >
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => handleInsert(template.id)}
                    disabled={isInserting}
                  >
                    <div className="flex items-center gap-2">
                      <Blocks className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{template.name}</span>
                    </div>
                    {template.description && (
                      <p className="mt-0.5 pl-6 text-xs text-muted-foreground line-clamp-1">
                        {template.description}
                      </p>
                    )}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                    onClick={() => handleDelete(template.id)}
                    disabled={deletingId === template.id}
                    title="削除"
                  >
                    {deletingId === template.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Plugin
// =============================================================================

export function BlockTemplatePlugin({
  isSaveOpen,
  isInsertOpen,
  onClose,
}: {
  isSaveOpen: boolean
  isInsertOpen: boolean
  onClose: () => void
}) {
  const [editor] = useLexicalComposerContext()
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [insertDialogOpen, setInsertDialogOpen] = useState(false)

  // コマンド登録
  useEffect(() => {
    const unregisterSave = editor.registerCommand(
      SAVE_BLOCK_TEMPLATE_COMMAND,
      () => {
        setSaveDialogOpen(true)
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )

    const unregisterInsert = editor.registerCommand(
      INSERT_BLOCK_TEMPLATE_COMMAND,
      () => {
        setInsertDialogOpen(true)
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )

    return () => {
      unregisterSave()
      unregisterInsert()
    }
  }, [editor])

  // Props経由 or コマンド経由、どちらでもダイアログが開く
  const isSaveDialogOpen = isSaveOpen || saveDialogOpen
  const isInsertDialogOpen = isInsertOpen || insertDialogOpen

  const handleSaveClose = () => {
    setSaveDialogOpen(false)
    onClose()
  }

  const handleInsertClose = () => {
    setInsertDialogOpen(false)
    onClose()
  }

  return (
    <>
      <SaveTemplateDialog isOpen={isSaveDialogOpen} onClose={handleSaveClose} />
      <InsertTemplateDialog isOpen={isInsertDialogOpen} onClose={handleInsertClose} />
    </>
  )
}
