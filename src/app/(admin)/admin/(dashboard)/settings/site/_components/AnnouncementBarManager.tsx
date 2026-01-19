'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/admin/components/ui'
import {
  getAnnouncementBars,
  createAnnouncementBar,
  updateAnnouncementBar,
  deleteAnnouncementBar,
  toggleAnnouncementBarActive,
} from '@/admin/actions/announcement-bar'
import type { AnnouncementBarData, AnnouncementBarInput } from '@/admin/actions/announcement-bar'
import {
  updateAnnouncementBarCarouselSettings,
  type AnnouncementBarCarouselSettingsInput,
} from '@/admin/actions/settings'
import { cn } from '@/shared/lib/utils'
import {
  TYPE_STYLES,
  getStripedStyle,
  validateAnimation,
  validateDesignStyle,
  type DesignStyle,
  type AnimationType,
} from '@/public/lib/announcement-bar-utils'

// =============================================================================
// Constants
// =============================================================================

const ANIMATION_OPTIONS: readonly { value: AnimationType; label: string; description: string }[] = [
  { value: 'fade', label: 'フェード', description: '透明度でふわっと切り替え' },
  { value: 'slideX', label: '横スライド', description: '左右にスライドして切り替え' },
  { value: 'slideY', label: '縦スライド', description: '上下にスライドして切り替え' },
]

const DESIGN_STYLE_OPTIONS: readonly { value: DesignStyle; label: string; description: string }[] = [
  { value: 'solid', label: 'ソリッド', description: 'シンプルなベタ塗り' },
  { value: 'gradient', label: 'グラデーション', description: 'モダンなグラデーション背景' },
  { value: 'outlined', label: 'アウトライン', description: '枠線スタイルですっきり' },
  { value: 'glass', label: 'グラス', description: '半透明のグラスモーフィズム' },
  { value: 'minimal', label: 'ミニマル', description: '細い帯のミニマルスタイル' },
  { value: 'striped', label: 'ストライプ', description: 'さりげない斜めストライプ' },
]

/** HEXカラー形式の正規表現 (#RRGGBB) */
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

/** HEXカラーのバリデーション */
function isValidHexColor(value: string | null | undefined): boolean {
  if (!value) return true // 空は許可
  return HEX_COLOR_REGEX.test(value)
}

// =============================================================================
// Form Schema (お知らせバー作成/編集用)
// =============================================================================

type BarFormData = {
  message: string
  type: 'info' | 'warning' | 'promo'
  linkUrl: string
  linkText: string
  isActive: boolean
  priority: number
  startAt: string
  endAt: string
}

const barFormSchema = z.object({
  message: z.string().min(1, 'メッセージは必須です').max(200, 'メッセージは200文字以内'),
  type: z.enum(['info', 'warning', 'promo']),
  linkUrl: z.string().url('有効なURLを入力してください').or(z.literal('')),
  linkText: z.string().max(50, 'リンクテキストは50文字以内'),
  isActive: z.boolean(),
  priority: z.number().int().min(0).max(100),
  startAt: z.string(),
  endAt: z.string(),
}) satisfies z.ZodType<BarFormData>

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

function BarPreview({
  message,
  linkText,
  designStyle,
  bgColor,
  textColor,
  stripeColor,
  stripeAnimation,
  gradientAnimation,
  glassAnimation,
}: {
  message: string
  linkText?: string
  designStyle: DesignStyle
  bgColor: string | null
  textColor: string | null
  stripeColor: string | null
  stripeAnimation: boolean
  gradientAnimation: boolean
  glassAnimation: boolean
}): React.ReactElement {
  const defaultColors = TYPE_STYLES.info

  // スタイル計算
  const customStyles: React.CSSProperties = {}
  if (bgColor) customStyles.backgroundColor = bgColor
  if (textColor) customStyles.color = textColor

  // ストライプスタイル（共通ユーティリティを使用）
  if (designStyle === 'striped') {
    const baseColor = bgColor || defaultColors.hex
    const stripedStyles = getStripedStyle(baseColor, stripeColor, stripeAnimation)
    Object.assign(customStyles, stripedStyles)
  }

  // グラデーションアニメーション
  if (designStyle === 'gradient' && gradientAnimation) {
    customStyles.backgroundSize = '200% 100%'
    customStyles.animation = 'gradient-flow 3s ease infinite'
  }

  // グラスアニメーション用
  if (designStyle === 'glass' && glassAnimation) {
    customStyles.position = 'relative'
    customStyles.overflow = 'hidden'
  }

  // デザインスタイル別のクラス
  function getStyleClasses(): string {
    switch (designStyle) {
      case 'solid':
        return !bgColor ? defaultColors.bg : ''
      case 'gradient':
        return `bg-gradient-to-r ${defaultColors.gradient}`
      case 'outlined':
        return 'bg-transparent border-y border-gray-400'
      case 'glass':
        return 'backdrop-blur-md bg-white/10 border-y border-white/20'
      case 'minimal':
        return 'bg-transparent border-b border-gray-300'
      case 'striped':
        return !bgColor ? defaultColors.bg : ''
    }
  }

  function getTextClasses(): string {
    if (textColor) return ''
    switch (designStyle) {
      case 'solid':
      case 'gradient':
      case 'glass':
      case 'striped':
        return 'text-white'
      case 'outlined':
      case 'minimal':
        return 'text-gray-800'
    }
  }

  return (
    <>
      {designStyle === 'striped' && stripeAnimation && (
        <style>{`
          @keyframes stripe-slide {
            from { background-position: 0 0; }
            to { background-position: 28.28px 0; }
          }
        `}</style>
      )}
      {designStyle === 'gradient' && gradientAnimation && (
        <style>{`
          @keyframes gradient-flow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}</style>
      )}
      {designStyle === 'glass' && glassAnimation && (
        <style>{`
          @keyframes glass-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      )}
      <div
        className={cn(
          'flex items-center justify-center gap-2 px-4 py-2 text-sm',
          getStyleClasses(),
          getTextClasses()
        )}
        style={customStyles}
      >
        {/* グラスシマーオーバーレイ */}
        {designStyle === 'glass' && glassAnimation && (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
              style={{ animation: 'glass-shimmer 3s ease-in-out infinite' }}
            />
          </div>
        )}
        <span>{message || 'サンプルお知らせメッセージ'}</span>
        {linkText && (
          <span className="underline underline-offset-2">{linkText}</span>
        )}
      </div>
    </>
  )
}

// =============================================================================
// Props
// =============================================================================

type AnnouncementBarManagerProps = {
  initialBars: AnnouncementBarData[]
  initialCarouselSettings: AnnouncementBarCarouselSettingsInput
}

// =============================================================================
// Main Component
// =============================================================================

export function AnnouncementBarManager({
  initialBars,
  initialCarouselSettings,
}: AnnouncementBarManagerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [bars, setBars] = useState<AnnouncementBarData[]>(initialBars)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingBar, setEditingBar] = useState<AnnouncementBarData | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // カルーセル設定のステート
  const [carouselSettings, setCarouselSettings] = useState({
    announcementBarAnimation: validateAnimation(initialCarouselSettings.announcementBarAnimation ?? 'fade'),
    announcementBarDuration: initialCarouselSettings.announcementBarDuration,
    announcementBarAutoPlay: initialCarouselSettings.announcementBarAutoPlay,
    announcementBarPauseOnHover: initialCarouselSettings.announcementBarPauseOnHover,
    announcementBarShowArrows: initialCarouselSettings.announcementBarShowArrows,
    announcementBarShowIndicator: initialCarouselSettings.announcementBarShowIndicator,
    announcementBarDesignStyle: validateDesignStyle(initialCarouselSettings.announcementBarDesignStyle ?? 'solid'),
    announcementBarBgColor: initialCarouselSettings.announcementBarBgColor || '',
    announcementBarTextColor: initialCarouselSettings.announcementBarTextColor || '',
    announcementBarStripeColor: initialCarouselSettings.announcementBarStripeColor || '',
    announcementBarStripeAnimation: initialCarouselSettings.announcementBarStripeAnimation,
    announcementBarGradientAnimation: initialCarouselSettings.announcementBarGradientAnimation,
    announcementBarGlassAnimation: initialCarouselSettings.announcementBarGlassAnimation,
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<BarFormData>({
    resolver: zodResolver(barFormSchema),
    defaultValues: {
      message: '',
      type: 'info',
      linkUrl: '',
      linkText: '',
      isActive: true,
      priority: 0,
      startAt: '',
      endAt: '',
    },
  })

  const formValues = useWatch({ control }) as BarFormData

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
        isActive: true,
        priority: 0,
        startAt: '',
        endAt: '',
      })
    }
    setIsDialogOpen(true)
  }

  // Submit form
  const onSubmit = (data: BarFormData) => {
    startTransition(async () => {
      const input: AnnouncementBarInput = {
        message: data.message,
        type: data.type,
        linkUrl: data.linkUrl || null,
        linkText: data.linkText || null,
        bgColor: null, // 個別色設定は廃止、共通設定を使用
        textColor: null,
        isActive: data.isActive,
        priority: data.priority,
        startAt: data.startAt || null,
        endAt: data.endAt || null,
      }

      if (editingBar) {
        const result = await updateAnnouncementBar(editingBar.id, input)
        if (result.success) {
          toast.success('お知らせバーを更新しました')
          setIsDialogOpen(false)
          loadBars()
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createAnnouncementBar(input)
        if (result.success) {
          toast.success('お知らせバーを作成しました')
          setIsDialogOpen(false)
          loadBars()
        } else {
          toast.error(result.error)
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
        toast.error(result.error)
      }
    })
  }

  // Delete
  const handleDelete = () => {
    if (!deletingId) return

    startTransition(async () => {
      const result = await deleteAnnouncementBar(deletingId)
      if (result.success) {
        toast.success('お知らせバーを削除しました')
        setDeleteDialogOpen(false)
        setDeletingId(null)
        loadBars()
      } else {
        toast.error(result.error)
      }
    })
  }

  // Save carousel settings
  const handleSaveCarouselSettings = () => {
    // クライアントサイドのHEXカラーバリデーション
    const colorFields = [
      { name: '背景色', value: carouselSettings.announcementBarBgColor },
      { name: '文字色', value: carouselSettings.announcementBarTextColor },
      { name: 'ストライプ色', value: carouselSettings.announcementBarStripeColor },
    ]
    for (const field of colorFields) {
      if (field.value && !isValidHexColor(field.value)) {
        toast.error(`${field.name}は#RRGGBB形式で入力してください（例: #2563eb）`)
        return
      }
    }

    startTransition(async () => {
      const result = await updateAnnouncementBarCarouselSettings({
        announcementBarAnimation: carouselSettings.announcementBarAnimation,
        announcementBarDuration: carouselSettings.announcementBarDuration,
        announcementBarAutoPlay: carouselSettings.announcementBarAutoPlay,
        announcementBarPauseOnHover: carouselSettings.announcementBarPauseOnHover,
        announcementBarShowArrows: carouselSettings.announcementBarShowArrows,
        announcementBarShowIndicator: carouselSettings.announcementBarShowIndicator,
        announcementBarDesignStyle: carouselSettings.announcementBarDesignStyle,
        announcementBarBgColor: carouselSettings.announcementBarBgColor || null,
        announcementBarTextColor: carouselSettings.announcementBarTextColor || null,
        announcementBarStripeColor: carouselSettings.announcementBarStripeColor || null,
        announcementBarStripeAnimation: carouselSettings.announcementBarStripeAnimation,
        announcementBarGradientAnimation: carouselSettings.announcementBarGradientAnimation,
        announcementBarGlassAnimation: carouselSettings.announcementBarGlassAnimation,
      })
      if (result.success) {
        toast.success('デザイン・カルーセル設定を保存しました')
      } else {
        toast.error(result.error)
      }
    })
  }

  const durationSeconds = carouselSettings.announcementBarDuration / 1000

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">お知らせバー管理</h1>
          <p className="text-muted-foreground">
            サイト上部に表示するお知らせバーを管理します
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/admin/settings')}>
          戻る
        </Button>
      </div>

      <Tabs defaultValue="bars" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bars">お知らせ一覧</TabsTrigger>
          <TabsTrigger value="design">デザイン・カルーセル設定</TabsTrigger>
        </TabsList>

        {/* お知らせ一覧タブ */}
        <TabsContent value="bars" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openDialog()}>
              新規作成
            </Button>
          </div>

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
        </TabsContent>

        {/* デザイン・カルーセル設定タブ */}
        <TabsContent value="design" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>デザイン設定</CardTitle>
              <CardDescription>
                お知らせバーの見た目とカラーを設定します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* デザインスタイル */}
              <div className="space-y-2">
                <Label htmlFor="designStyle">デザインスタイル</Label>
                <Select
                  value={carouselSettings.announcementBarDesignStyle}
                  onValueChange={(value: DesignStyle) =>
                    setCarouselSettings({ ...carouselSettings, announcementBarDesignStyle: value })
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id="designStyle">
                    <SelectValue placeholder="デザインスタイルを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {DESIGN_STYLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {DESIGN_STYLE_OPTIONS.find((o) => o.value === carouselSettings.announcementBarDesignStyle)?.description}
                </p>
              </div>

              {/* プレビュー */}
              <div className="space-y-2">
                <Label>プレビュー</Label>
                <div className="rounded-lg border bg-gradient-to-br from-gray-100 to-gray-200 p-4">
                  <BarPreview
                    message="サンプルお知らせメッセージ"
                    linkText="詳細はこちら"
                    designStyle={carouselSettings.announcementBarDesignStyle}
                    bgColor={carouselSettings.announcementBarBgColor || null}
                    textColor={carouselSettings.announcementBarTextColor || null}
                    stripeColor={carouselSettings.announcementBarStripeColor || null}
                    stripeAnimation={carouselSettings.announcementBarStripeAnimation}
                    gradientAnimation={carouselSettings.announcementBarGradientAnimation}
                    glassAnimation={carouselSettings.announcementBarGlassAnimation}
                  />
                </div>
              </div>

              {/* 共通カラー設定 */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bgColor">背景色（カスタム）</Label>
                  <div className="flex gap-2">
                    <Input
                      id="bgColor"
                      value={carouselSettings.announcementBarBgColor}
                      onChange={(e) => setCarouselSettings({ ...carouselSettings, announcementBarBgColor: e.target.value })}
                      placeholder="#2563eb"
                      disabled={isPending}
                    />
                    {carouselSettings.announcementBarBgColor && (
                      <div
                        className="h-10 w-10 shrink-0 rounded border"
                        style={{ backgroundColor: carouselSettings.announcementBarBgColor }}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    空欄の場合はデフォルト色を使用
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="textColor">文字色（カスタム）</Label>
                  <div className="flex gap-2">
                    <Input
                      id="textColor"
                      value={carouselSettings.announcementBarTextColor}
                      onChange={(e) => setCarouselSettings({ ...carouselSettings, announcementBarTextColor: e.target.value })}
                      placeholder="#ffffff"
                      disabled={isPending}
                    />
                    {carouselSettings.announcementBarTextColor && (
                      <div
                        className="h-10 w-10 shrink-0 rounded border"
                        style={{ backgroundColor: carouselSettings.announcementBarTextColor }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* ストライプ設定（stripedスタイル選択時のみ） */}
              {carouselSettings.announcementBarDesignStyle === 'striped' && (
                <div className="rounded-lg border p-4 space-y-4">
                  <h4 className="font-medium">ストライプ設定</h4>

                  <div className="space-y-2">
                    <Label htmlFor="stripeColor">ストライプ色</Label>
                    <div className="flex gap-2">
                      <Input
                        id="stripeColor"
                        value={carouselSettings.announcementBarStripeColor}
                        onChange={(e) => setCarouselSettings({ ...carouselSettings, announcementBarStripeColor: e.target.value })}
                        placeholder="#ffffff"
                        disabled={isPending}
                      />
                      {carouselSettings.announcementBarStripeColor && (
                        <div
                          className="h-10 w-10 shrink-0 rounded border"
                          style={{ backgroundColor: carouselSettings.announcementBarStripeColor }}
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      空欄の場合は背景色を少し明るくした色を使用
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="stripeAnimation" className="font-medium">
                        ストライプアニメーション
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        ストライプが流れるアニメーションを有効にします
                      </p>
                    </div>
                    <Switch
                      id="stripeAnimation"
                      checked={carouselSettings.announcementBarStripeAnimation}
                      onCheckedChange={(checked) =>
                        setCarouselSettings({ ...carouselSettings, announcementBarStripeAnimation: checked })
                      }
                      disabled={isPending}
                    />
                  </div>
                </div>
              )}

              {/* グラデーション設定（gradientスタイル選択時のみ） */}
              {carouselSettings.announcementBarDesignStyle === 'gradient' && (
                <div className="rounded-lg border p-4 space-y-4">
                  <h4 className="font-medium">グラデーション設定</h4>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="gradientAnimation" className="font-medium">
                        グラデーションアニメーション
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        グラデーションが左右に流れるアニメーションを有効にします
                      </p>
                    </div>
                    <Switch
                      id="gradientAnimation"
                      checked={carouselSettings.announcementBarGradientAnimation}
                      onCheckedChange={(checked) =>
                        setCarouselSettings({ ...carouselSettings, announcementBarGradientAnimation: checked })
                      }
                      disabled={isPending}
                    />
                  </div>
                </div>
              )}

              {/* グラス設定（glassスタイル選択時のみ） */}
              {carouselSettings.announcementBarDesignStyle === 'glass' && (
                <div className="rounded-lg border p-4 space-y-4">
                  <h4 className="font-medium">グラス設定</h4>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="glassAnimation" className="font-medium">
                        シマーアニメーション
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        光の反射が流れるようなシマー効果を有効にします
                      </p>
                    </div>
                    <Switch
                      id="glassAnimation"
                      checked={carouselSettings.announcementBarGlassAnimation}
                      onCheckedChange={(checked) =>
                        setCarouselSettings({ ...carouselSettings, announcementBarGlassAnimation: checked })
                      }
                      disabled={isPending}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>カルーセル設定</CardTitle>
              <CardDescription>
                複数のお知らせバーがある場合の表示アニメーションと切り替え動作を設定します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* アニメーション種類 */}
              <div className="space-y-2">
                <Label htmlFor="animation">アニメーション種類</Label>
                <Select
                  value={carouselSettings.announcementBarAnimation}
                  onValueChange={(value: AnimationType) =>
                    setCarouselSettings({ ...carouselSettings, announcementBarAnimation: value })
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id="animation">
                    <SelectValue placeholder="アニメーションを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {ANIMATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ANIMATION_OPTIONS.find((o) => o.value === carouselSettings.announcementBarAnimation)?.description}
                </p>
              </div>

              {/* 自動再生 */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="autoPlay" className="font-medium">
                    自動切り替え
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    有効にすると、設定した間隔でお知らせが自動的に切り替わります
                  </p>
                </div>
                <Switch
                  id="autoPlay"
                  checked={carouselSettings.announcementBarAutoPlay}
                  onCheckedChange={(checked) =>
                    setCarouselSettings({ ...carouselSettings, announcementBarAutoPlay: checked })
                  }
                  disabled={isPending}
                />
              </div>

              {/* 切り替え間隔（自動再生有効時のみ） */}
              {carouselSettings.announcementBarAutoPlay && (
                <div className="space-y-2">
                  <Label htmlFor="duration">切り替え間隔（秒）</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={1}
                    max={30}
                    step={0.5}
                    value={durationSeconds}
                    onChange={(e) => {
                      const seconds = parseFloat(e.target.value)
                      const validSeconds = isNaN(seconds) ? 5 : Math.max(1, Math.min(30, seconds))
                      setCarouselSettings({
                        ...carouselSettings,
                        announcementBarDuration: Math.round(validSeconds * 1000),
                      })
                    }}
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    1〜30秒の間で設定できます（推奨: 5秒）
                  </p>
                </div>
              )}

              {/* ホバー時一時停止 */}
              {carouselSettings.announcementBarAutoPlay && (
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="pauseOnHover" className="font-medium">
                      ホバー時に一時停止
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      マウスを乗せている間は自動切り替えを一時停止します
                    </p>
                  </div>
                  <Switch
                    id="pauseOnHover"
                    checked={carouselSettings.announcementBarPauseOnHover}
                    onCheckedChange={(checked) =>
                      setCarouselSettings({ ...carouselSettings, announcementBarPauseOnHover: checked })
                    }
                    disabled={isPending}
                  />
                </div>
              )}

              {/* 矢印ボタン表示 */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="showArrows" className="font-medium">
                    矢印ボタンを表示
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    手動でお知らせを切り替えるための矢印ボタンを表示します
                  </p>
                </div>
                <Switch
                  id="showArrows"
                  checked={carouselSettings.announcementBarShowArrows}
                  onCheckedChange={(checked) =>
                    setCarouselSettings({ ...carouselSettings, announcementBarShowArrows: checked })
                  }
                  disabled={isPending}
                />
              </div>

              {/* インジケーター表示 */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="showIndicator" className="font-medium">
                    インジケーターを表示
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    現在のお知らせ番号を表示します（例: 1/3）
                  </p>
                </div>
                <Switch
                  id="showIndicator"
                  checked={carouselSettings.announcementBarShowIndicator}
                  onCheckedChange={(checked) =>
                    setCarouselSettings({ ...carouselSettings, announcementBarShowIndicator: checked })
                  }
                  disabled={isPending}
                />
              </div>

              <Button onClick={handleSaveCarouselSettings} disabled={isPending}>
                {isPending ? '保存中...' : 'デザイン・カルーセル設定を保存'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
                <p className="text-xs text-muted-foreground">
                  ※ 色は「デザイン・カルーセル設定」で統一設定できます
                </p>
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
