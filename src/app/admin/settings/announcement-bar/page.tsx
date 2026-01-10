'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Badge,
} from '@/components/admin/ui'
import {
  getAnnouncementBars,
  createAnnouncementBar,
  updateAnnouncementBar,
  deleteAnnouncementBar,
  toggleAnnouncementBarActive,
} from '@/actions/admin/announcement-bar'
import type { AnnouncementBarData, AnnouncementBarInput } from '@/actions/admin/announcement-bar'
import { cn } from '@/lib/utils'

// =============================================================================
// Form Schema
// =============================================================================

type FormData = {
  message: string
  type: 'info' | 'warning' | 'promo'
  linkUrl: string
  linkText: string
  bgColor: string
  textColor: string
  isActive: boolean
  priority: number
  startAt: string
  endAt: string
}

const formSchema = z.object({
  message: z.string().min(1, 'メッセージは必須です').max(200, 'メッセージは200文字以内'),
  type: z.enum(['info', 'warning', 'promo']),
  linkUrl: z.string().url('有効なURLを入力してください').or(z.literal('')),
  linkText: z.string().max(50, 'リンクテキストは50文字以内'),
  bgColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '有効な色コードを入力してください').or(z.literal('')),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '有効な色コードを入力してください').or(z.literal('')),
  isActive: z.boolean(),
  priority: z.number().int().min(0).max(100),
  startAt: z.string(),
  endAt: z.string(),
}) satisfies z.ZodType<FormData>

// =============================================================================
// Type Badge Component
// =============================================================================

function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; className: string }> = {
    info: { label: 'お知らせ', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
    warning: { label: '重要', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' },
    promo: { label: 'キャンペーン', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  }

  const { label, className } = config[type] || config.info

  return <Badge className={className}>{label}</Badge>
}

// =============================================================================
// Preview Component
// =============================================================================

function BarPreview({ data }: { data: FormData }) {
  const typeStyles: Record<string, { bg: string; text: string }> = {
    info: { bg: 'bg-blue-600', text: 'text-white' },
    warning: { bg: 'bg-amber-500', text: 'text-black' },
    promo: { bg: 'bg-green-600', text: 'text-white' },
  }

  const defaultStyle = typeStyles[data.type] || typeStyles.info
  const bgStyle = data.bgColor ? { backgroundColor: data.bgColor } : {}
  const textStyle = data.textColor ? { color: data.textColor } : {}

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 text-sm',
        !data.bgColor && defaultStyle.bg,
        !data.textColor && defaultStyle.text
      )}
      style={{ ...bgStyle, ...textStyle }}
    >
      <span>{data.message || 'プレビューメッセージ'}</span>
      {data.linkUrl && data.linkText && (
        <span className="underline underline-offset-2">{data.linkText}</span>
      )}
    </div>
  )
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function AnnouncementBarPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [bars, setBars] = useState<AnnouncementBarData[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingBar, setEditingBar] = useState<AnnouncementBarData | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      message: '',
      type: 'info',
      linkUrl: '',
      linkText: '',
      bgColor: '',
      textColor: '',
      isActive: true,
      priority: 0,
      startAt: '',
      endAt: '',
    },
  })

  const formValues = watch()

  // Load data
  useEffect(() => {
    loadBars()
  }, [])

  const loadBars = async () => {
    const result = await getAnnouncementBars()
    setBars(result.items)
  }

  // Open dialog for create/edit
  const openDialog = (bar?: AnnouncementBarData) => {
    if (bar) {
      setEditingBar(bar)
      reset({
        message: bar.message,
        type: bar.type as 'info' | 'warning' | 'promo',
        linkUrl: bar.linkUrl || '',
        linkText: bar.linkText || '',
        bgColor: bar.bgColor || '',
        textColor: bar.textColor || '',
        isActive: bar.isActive,
        priority: bar.priority,
        startAt: bar.startAt ? format(new Date(bar.startAt), "yyyy-MM-dd'T'HH:mm") : '',
        endAt: bar.endAt ? format(new Date(bar.endAt), "yyyy-MM-dd'T'HH:mm") : '',
      })
    } else {
      setEditingBar(null)
      reset({
        message: '',
        type: 'info',
        linkUrl: '',
        linkText: '',
        bgColor: '',
        textColor: '',
        isActive: true,
        priority: 0,
        startAt: '',
        endAt: '',
      })
    }
    setIsDialogOpen(true)
  }

  // Submit form
  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const input: AnnouncementBarInput = {
        message: data.message,
        type: data.type,
        linkUrl: data.linkUrl || null,
        linkText: data.linkText || null,
        bgColor: data.bgColor || null,
        textColor: data.textColor || null,
        isActive: data.isActive,
        priority: data.priority,
        startAt: data.startAt || null,
        endAt: data.endAt || null,
      }

      if (editingBar) {
        const result = await updateAnnouncementBar(editingBar.id, input)
        if (result.success) {
          setIsDialogOpen(false)
          loadBars()
        } else {
          alert(result.error)
        }
      } else {
        const result = await createAnnouncementBar(input)
        if (result.success) {
          setIsDialogOpen(false)
          loadBars()
        } else {
          alert(result.error)
        }
      }
    })
  }

  // Toggle active
  const handleToggleActive = (id: string) => {
    startTransition(async () => {
      const result = await toggleAnnouncementBarActive(id)
      if (result.success) {
        loadBars()
      } else {
        alert(result.error)
      }
    })
  }

  // Delete
  const handleDelete = () => {
    if (!deletingId) return

    startTransition(async () => {
      const result = await deleteAnnouncementBar(deletingId)
      if (result.success) {
        setDeleteDialogOpen(false)
        setDeletingId(null)
        loadBars()
      } else {
        alert(result.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">お知らせバー</h1>
          <p className="text-muted-foreground">
            サイト上部に表示するお知らせバーを管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/admin/settings')}>
            戻る
          </Button>
          <Button onClick={() => openDialog()}>
            新規作成
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>お知らせバー一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {bars.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              お知らせバーがありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">状態</TableHead>
                  <TableHead className="w-[100px]">タイプ</TableHead>
                  <TableHead>メッセージ</TableHead>
                  <TableHead className="w-[80px]">優先度</TableHead>
                  <TableHead className="w-[150px]">表示期間</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bars.map((bar) => (
                  <TableRow key={bar.id}>
                    <TableCell>
                      <Switch
                        checked={bar.isActive}
                        onCheckedChange={() => handleToggleActive(bar.id)}
                        disabled={isPending}
                      />
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={bar.type} />
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {bar.message}
                    </TableCell>
                    <TableCell>{bar.priority}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {bar.startAt || bar.endAt ? (
                        <>
                          {bar.startAt && format(new Date(bar.startAt), 'MM/dd HH:mm')}
                          {bar.startAt && bar.endAt && ' 〜 '}
                          {bar.endAt && format(new Date(bar.endAt), 'MM/dd HH:mm')}
                        </>
                      ) : (
                        '常時'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(bar)}
                          disabled={isPending}
                        >
                          編集
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeletingId(bar.id)
                            setDeleteDialogOpen(true)
                          }}
                          disabled={isPending}
                        >
                          削除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingBar ? 'お知らせバーを編集' : 'お知らせバーを作成'}
            </DialogTitle>
            <DialogDescription>
              サイト上部に表示するお知らせバーの内容を設定します
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Preview */}
            <div className="space-y-2">
              <Label>プレビュー</Label>
              <div className="overflow-hidden rounded-md border">
                <BarPreview data={formValues} />
              </div>
            </div>

            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="message">メッセージ *</Label>
                <Input
                  id="message"
                  {...register('message')}
                  placeholder="お知らせのメッセージを入力"
                  disabled={isPending}
                />
                {errors.message && (
                  <p className="text-sm text-destructive">{errors.message.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">タイプ</Label>
                <Select
                  value={formValues.type}
                  onValueChange={(value) => setValue('type', value as 'info' | 'warning' | 'promo')}
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">お知らせ（青）</SelectItem>
                    <SelectItem value="warning">重要（黄）</SelectItem>
                    <SelectItem value="promo">キャンペーン（緑）</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">優先度</Label>
                <Input
                  id="priority"
                  type="number"
                  {...register('priority', { valueAsNumber: true })}
                  min={0}
                  max={100}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  数字が大きいほど優先的に表示
                </p>
              </div>
            </div>

            {/* Link */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="linkUrl">リンクURL</Label>
                <Input
                  id="linkUrl"
                  {...register('linkUrl')}
                  placeholder="https://example.com"
                  disabled={isPending}
                />
                {errors.linkUrl && (
                  <p className="text-sm text-destructive">{errors.linkUrl.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkText">リンクテキスト</Label>
                <Input
                  id="linkText"
                  {...register('linkText')}
                  placeholder="詳しくはこちら"
                  disabled={isPending}
                />
              </div>
            </div>

            {/* Colors */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bgColor">背景色（オプション）</Label>
                <div className="flex gap-2">
                  <Input
                    id="bgColor"
                    {...register('bgColor')}
                    placeholder="#000000"
                    disabled={isPending}
                  />
                  {formValues.bgColor && (
                    <div
                      className="h-10 w-10 shrink-0 rounded border"
                      style={{ backgroundColor: formValues.bgColor }}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="textColor">文字色（オプション）</Label>
                <div className="flex gap-2">
                  <Input
                    id="textColor"
                    {...register('textColor')}
                    placeholder="#ffffff"
                    disabled={isPending}
                  />
                  {formValues.textColor && (
                    <div
                      className="h-10 w-10 shrink-0 rounded border"
                      style={{ backgroundColor: formValues.textColor }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startAt">表示開始日時</Label>
                <Input
                  id="startAt"
                  type="datetime-local"
                  {...register('startAt')}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endAt">表示終了日時</Label>
                <Input
                  id="endAt"
                  type="datetime-local"
                  {...register('endAt')}
                  disabled={isPending}
                />
              </div>
            </div>

            {/* Active */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="isActive" className="text-base">有効にする</Label>
                <p className="text-sm text-muted-foreground">
                  オフにするとサイトに表示されません
                </p>
              </div>
              <Switch
                id="isActive"
                checked={formValues.isActive}
                onCheckedChange={(checked) => setValue('isActive', checked)}
                disabled={isPending}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isPending}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? '保存中...' : editingBar ? '更新' : '作成'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>お知らせバーを削除しますか？</DialogTitle>
            <DialogDescription>
              この操作は取り消せません。本当に削除してもよろしいですか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? '削除中...' : '削除する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
