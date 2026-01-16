'use client'

/**
 * Media Library Plugin
 *
 * エディター内からメディアライブラリを開いて画像を選択・挿入する機能
 */

import { useState, useEffect, useRef, useTransition } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { X, Search, Upload, Check, Loader2, Image as ImageIcon, Grid, List } from 'lucide-react'
import { toast } from 'sonner'
import { getMediaList, uploadMedia, type MediaData } from '@/actions/admin/media'
import { formatBytes } from '@/lib/utils'
import { INSERT_IMAGE_COMMAND } from './ImagePlugin'
import { Button } from '@/components/admin/ui'
import {
  validateFile,
  inferMediaType,
  type MediaUsage,
} from '@/lib/validations/media'

// =============================================================================
// Types
// =============================================================================

type MediaLibraryDialogProps = {
  isOpen: boolean
  onClose: () => void
  usage?: MediaUsage
}

// =============================================================================
// Hook
// =============================================================================

export function useMediaLibrary() {
  const [isOpen, setIsOpen] = useState(false)
  const [usage, setUsage] = useState<MediaUsage>('GENERAL')

  const openMediaLibrary = (defaultUsage?: MediaUsage) => {
    if (defaultUsage) setUsage(defaultUsage)
    setIsOpen(true)
  }

  const closeMediaLibrary = () => {
    setIsOpen(false)
  }

  const MediaLibraryComponent = () => (
    <MediaLibraryDialog isOpen={isOpen} onClose={closeMediaLibrary} usage={usage} />
  )

  return {
    openMediaLibrary,
    closeMediaLibrary,
    MediaLibrary: MediaLibraryComponent,
  }
}

// =============================================================================
// Dialog Component
// =============================================================================

function MediaLibraryDialog({ isOpen, onClose, usage = 'GENERAL' }: MediaLibraryDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [activeTab, setActiveTab] = useState<'library' | 'upload'>('library')
  const [media, setMedia] = useState<MediaData[]>([])
  const [selectedItem, setSelectedItem] = useState<MediaData | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadAlt, setUploadAlt] = useState('')

  // Track search debounce
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileReaderRef = useRef<FileReader | null>(null)
  const isMountedRef = useRef(true)

  // Fetch media on dialog open (runs only when isOpen changes to true)
  // Note: search state is reset in handleClose, so opening always starts fresh
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    startTransition(async () => {
      const result = await getMediaList(
        { type: 'IMAGE', search: undefined },
        { page: 1, limit: 50 }
      )
      // ダイアログが閉じられた場合は更新しない
      if (!cancelled && isMountedRef.current) {
        setMedia(result.items)
      }
    })

    return () => {
      cancelled = true
    }
  }, [isOpen])

  // レースコンディション対策用のジェネレーションカウンター
  const searchGenerationRef = useRef(0)

  // Debounced search handler
  const handleSearchChange = (value: string) => {
    setSearch(value)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // 新しい検索を開始（古いリクエストを無効化）
    const generation = ++searchGenerationRef.current

    searchTimeoutRef.current = setTimeout(() => {
      startTransition(async () => {
        const result = await getMediaList(
          { type: 'IMAGE', search: value || undefined },
          { page: 1, limit: 50 }
        )
        // 古いリクエストの結果は無視
        if (generation === searchGenerationRef.current && isMountedRef.current) {
          setMedia(result.items)
        }
      })
    }, 300)
  }

  // マウント状態を追跡し、クリーンアップ
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      if (fileReaderRef.current) {
        fileReaderRef.current.abort()
      }
    }
  }, [])

  const handleSelect = (item: MediaData) => {
    setSelectedItem(selectedItem?.id === item.id ? null : item)
  }

  const handleInsert = () => {
    if (!selectedItem) return

    editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
      src: selectedItem.url,
      alt: selectedItem.alt || selectedItem.filename,
    })

    handleClose()
  }

  const handleFileSelect = (file: File) => {
    const type = inferMediaType(file.type)
    const validation = validateFile(file, type)

    if (!validation.valid) {
      toast.error(validation.error)
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.error('画像ファイルを選択してください')
      return
    }

    setUploadFile(file)

    // 既存のFileReaderをキャンセル
    if (fileReaderRef.current) {
      fileReaderRef.current.abort()
    }

    const reader = new FileReader()
    fileReaderRef.current = reader

    reader.onload = (e) => {
      // アンマウント後にsetStateしない
      if (!isMountedRef.current) return
      setPreviewUrl(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!uploadFile) return

    setIsUploading(true)

    const data = new FormData()
    data.append('file', uploadFile)
    data.append('usage', usage)
    if (uploadAlt) data.append('alt', uploadAlt)

    const result = await uploadMedia(data)

    setIsUploading(false)

    if (result.success) {
      toast.success('アップロードしました')

      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
        src: result.data.url,
        alt: uploadAlt || uploadFile.name,
      })

      handleClose()
    } else {
      toast.error(result.error)
    }
  }

  const handleClose = () => {
    setSelectedItem(null)
    setUploadFile(null)
    setPreviewUrl(null)
    setUploadAlt('')
    setSearch('')
    setActiveTab('library')
    onClose()
  }

  const clearUploadFile = () => {
    setUploadFile(null)
    setPreviewUrl(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="bg-background rounded-lg shadow-lg w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">メディアライブラリ</h2>
          <button type="button" onClick={handleClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'library'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ImageIcon className="w-4 h-4 inline mr-1" />
            ライブラリ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'upload'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-1" />
            アップロード
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'library' ? (
            <div className="space-y-4">
              {/* Search & View Toggle */}
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="search"
                    placeholder="画像を検索..."
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
                  />
                </div>
                <div className="flex border rounded overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`p-2 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`p-2 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Media Grid/List */}
              {isPending ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : media.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  画像が見つかりません
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                  {media.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={`
                        relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                        hover:ring-2 hover:ring-primary
                        ${selectedItem?.id === item.id ? 'border-primary ring-2 ring-primary' : 'border-transparent'}
                      `}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={item.alt || item.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {selectedItem?.id === item.id && (
                        <div className="absolute top-1 right-1 p-1 rounded-full bg-primary">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {media.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={`
                        w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors
                        hover:bg-muted
                        ${selectedItem?.id === item.id ? 'bg-primary/10' : ''}
                      `}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={item.alt || item.filename}
                        className="w-12 h-12 rounded object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.filename}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatBytes(item.size)}
                        </p>
                      </div>
                      {selectedItem?.id === item.id && (
                        <Check className="h-5 w-5 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Upload Zone */}
              {!uploadFile ? (
                <div
                  className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const file = e.dataTransfer.files[0]
                    if (file) handleFileSelect(file)
                  }}
                  onClick={() => document.getElementById('library-file-input')?.click()}
                >
                  <Upload className="h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">
                    ドラッグ&ドロップ または クリックして選択
                  </p>
                  <input
                    id="library-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileSelect(file)
                    }}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Preview */}
                  <div className="rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center">
                    {previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt="プレビュー"
                        className="max-w-full max-h-full object-contain"
                      />
                    )}
                  </div>

                  {/* File info */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{uploadFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatBytes(uploadFile.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearUploadFile}
                      className="p-1 rounded hover:bg-muted"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Alt text */}
                  <div>
                    <label className="text-sm font-medium block mb-1">
                      代替テキスト（alt）
                    </label>
                    <input
                      type="text"
                      value={uploadAlt}
                      onChange={(e) => setUploadAlt(e.target.value)}
                      placeholder="画像の説明"
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t shrink-0">
          <Button variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          {activeTab === 'library' ? (
            <Button onClick={handleInsert} disabled={!selectedItem}>
              挿入
            </Button>
          ) : (
            <Button onClick={handleUpload} disabled={!uploadFile || isUploading}>
              {isUploading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              アップロードして挿入
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// Plugin (registers nothing, just exports the hook)
export function MediaLibraryPlugin() {
  return null
}
