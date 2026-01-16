'use client'

/**
 * メディア詳細ダイアログ
 */

import { useState, useTransition, useRef } from 'react'
import { X, Copy, ExternalLink, Trash2, Save, Loader2, FileText, Film, File } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { updateMedia, deleteMedia, type MediaData } from '@/actions/admin/media'
import { formatBytes, formatDate } from '@/lib/utils'
import { Button } from '@/components/admin/ui'
import { USAGE_OPTIONS } from './constants'
import { isValidMediaUsage } from '@/lib/validations/media'

type Props = {
  item: MediaData | null
  onClose: () => void
}

type FormState = {
  alt: string
  title: string
  description: string
  usage: string
}

function getInitialFormState(item: MediaData | null): FormState {
  return {
    alt: item?.alt || '',
    title: item?.title || '',
    description: item?.description || '',
    usage: item?.usage || 'GENERAL',
  }
}

export function MediaDetailDialog({ item, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [hasChanges, setHasChanges] = useState(false)

  // Track which item the form state is for
  const lastItemIdRef = useRef<string | null>(null)
  const currentItemId = item?.id ?? null

  // Reset form state when item changes
  const initialFormState = getInitialFormState(item)

  const [formData, setFormData] = useState<FormState>(initialFormState)

  // Sync form state when item changes (without useEffect)
  if (currentItemId !== lastItemIdRef.current) {
    lastItemIdRef.current = currentItemId
    // This will be batched with the render, not cause a cascading render
    if (formData !== initialFormState) {
      setFormData(initialFormState)
      setHasChanges(false)
    }
  }

  if (!item) return null

  const handleChange = (field: keyof FormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(item.url)
    toast.success('URLをコピーしました')
  }

  const handleSave = () => {
    const usage = formData.usage
    if (!isValidMediaUsage(usage)) {
      toast.error('無効な用途が選択されています')
      return
    }

    startTransition(async () => {
      const result = await updateMedia(item.id, {
        alt: formData.alt || undefined,
        title: formData.title || undefined,
        description: formData.description || undefined,
        usage,
      })

      if (result.success) {
        toast.success(result.message)
        setHasChanges(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleDelete = () => {
    if (!confirm(`「${item.filename}」を削除しますか？`)) return

    startTransition(async () => {
      const result = await deleteMedia(item.id)
      if (result.success) {
        toast.success(result.message)
        onClose()
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold truncate">{item.filename}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Preview */}
            <div>
              <MediaPreview item={item} />

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleCopyUrl}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  URLをコピー
                </Button>
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    開く
                  </a>
                </Button>
              </div>
            </div>

            {/* Info & Edit Form */}
            <div className="space-y-4">
              {/* File Info */}
              <div className="space-y-2 text-sm">
                <InfoRow label="ファイルサイズ" value={formatBytes(item.size)} />
                <InfoRow label="種別" value={item.mimeType} />
                {item.width && item.height && (
                  <InfoRow label="サイズ" value={`${item.width} x ${item.height} px`} />
                )}
                <InfoRow label="アップロード" value={formatDate(item.createdAt)} />
                <InfoRow label="アップロード者" value={item.uploader.name} />
              </div>

              <hr />

              {/* Edit Form */}
              <div className="space-y-3">
                {/* Usage */}
                <div>
                  <label className="text-sm font-medium block mb-1">用途</label>
                  <select
                    value={formData.usage}
                    onChange={(e) => handleChange('usage', e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    {USAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Alt */}
                {item.type === 'IMAGE' && (
                  <div>
                    <label className="text-sm font-medium block mb-1">
                      代替テキスト（alt）
                    </label>
                    <input
                      type="text"
                      value={formData.alt}
                      onChange={(e) => handleChange('alt', e.target.value)}
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                      placeholder="画像の説明"
                    />
                  </div>
                )}

                {/* Title */}
                <div>
                  <label className="text-sm font-medium block mb-1">タイトル</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                    placeholder="管理用タイトル"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-sm font-medium block mb-1">説明</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none"
                    rows={3}
                    placeholder="メモ・説明"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between p-4 border-t shrink-0">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            削除
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              閉じる
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Save className="h-4 w-4 mr-1" />
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function MediaPreview({ item }: { item: MediaData }) {
  return (
    <div className="rounded-lg overflow-hidden bg-muted aspect-square flex items-center justify-center">
      {item.type === 'IMAGE' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={item.alt || item.filename}
          className="w-full h-full object-contain"
        />
      ) : item.type === 'VIDEO' ? (
        <Film className="h-24 w-24 text-muted-foreground" />
      ) : item.type === 'DOCUMENT' ? (
        <FileText className="h-24 w-24 text-muted-foreground" />
      ) : (
        <File className="h-24 w-24 text-muted-foreground" />
      )}
    </div>
  )
}
