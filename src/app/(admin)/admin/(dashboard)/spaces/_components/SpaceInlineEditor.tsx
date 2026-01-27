'use client'

/**
 * スペースインラインエディター
 *
 * InlineEditorLayoutを使用したスペース編集UI
 * 新規作成・編集の両方に対応
 *
 * 統一サイドパネル対応 (3タブ構成: 基本 / SEO・OGP / 公開)
 */

import Image from 'next/image'
import { useState, useTransition, useId } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ImagePlus, GripVertical, HelpCircle } from 'lucide-react'
import dynamic from 'next/dynamic'
import {
  EditorHeader,
  useFullscreenMode,
  useKeyboardShortcuts,
  useBeforeUnload,
  SIDE_PANEL_WIDTH,
} from '@/admin/components/editor/inline'
import { SidePanelShell } from '@/admin/components/editor/inline/SidePanelShell'
import { SEOFields, OGPFields, UnifiedPublishFields } from '@/admin/components/editor/inline/side-panel'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  CSS,
  type DragEndEvent,
} from '@/admin/components/ui'
import {
  createSpace,
  updateSpace,
  deleteSpace,
  toggleSpacePublished,
} from '@/admin/actions/space'
import { cn } from '@/shared/lib/utils'
import {
  useSingleMediaPicker,
  useMultipleMediaPicker,
} from '@/admin/hooks/use-media-picker'
import { logger } from '@/shared/lib/logger'
import {
  calculateTaxIncludedPrice,
  getTaxRate,
  getTaxRateLabel,
  getTaxRateTypeOrDefault,
  getSpaceDiscountTypeOrDefault,
  getDurationDiscountOverrideOrDefault,
  type TaxSettings,
  DEFAULT_TAX_SETTINGS,
} from '@/shared/lib/pricing'
import type { SpaceWithStats } from '@/admin/lib/validations/space'

const RichTextEditor = dynamic(
  () => import('@/admin/components/editor').then((mod) => ({ default: mod.RichTextEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] flex items-center justify-center border rounded-lg bg-muted/50">
        <div className="animate-pulse text-muted-foreground">エディタを読み込み中...</div>
      </div>
    ),
  }
)

// =============================================================================
// Constants
// =============================================================================

/**
 * Select.Item は空文字列を value として許可しないため、
 * 「なし」選択用の特別な値を定義
 */
const SELECT_NONE_VALUE = '__none__'

// =============================================================================
// Schema
// =============================================================================

const discountTypeSchema = z.enum(['none', 'percentage', 'fixed'])
const durationDiscountOverrideSchema = z.enum(['inherit', 'enabled', 'disabled'])
const taxRateTypeSchema = z.enum(['standard', 'reduced'])

const slugSchema = z
  .string()
  .min(1, 'スラッグを入力してください')
  .max(100, 'スラッグは100文字以内で入力してください')
  .regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ使用可能です')

const formSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1, '名前を入力してください').max(100, '名前は100文字以内で入力してください'),
  description: z.string().min(1, '説明を入力してください').min(10, '説明は10文字以上で入力してください'),
  address: z.string().min(1, '住所を入力してください'),
  access: z.string().max(500, 'アクセス情報は500文字以内で入力してください').optional(),
  capacity: z.number().int('整数を入力してください').min(1, '定員は1以上で入力してください').max(1000, '定員は1000以下で入力してください'),
  area: z.number().positive('正の数を入力してください').max(10000, '面積は10000以下で入力してください').optional(),
  hourlyPrice: z.number().min(0, '時間料金は0以上で入力してください').max(1000000, '時間料金は1000000以下で入力してください'),
  dailyPrice: z.number().min(0, '日額料金は0以上で入力してください').max(10000000, '日額料金は10000000以下で入力してください').optional(),
  mainImageUrl: z.string().min(1, 'メイン画像URLを入力してください').url('有効なURLを入力してください'),
  imageUrls: z.array(z.string().url('有効なURLを入力してください')).max(10, '画像は最大10枚までです'),
  facilities: z.array(z.string().min(1).max(50)),
  isPublished: z.boolean(),
  termsId: z.string().uuid('利用規約IDが無効です').optional(),
  locationId: z.string().uuid('場所IDが無効です').optional(),
  categoryId: z.string().uuid('カテゴリーIDが無効です').optional(),
  // 割引設定
  discountType: discountTypeSchema,
  discountValue: z.number().min(0, '割引値は0以上で入力してください').max(1000000, '割引値は1000000以下で入力してください').optional().nullable(),
  durationDiscountOverride: durationDiscountOverrideSchema,
  // 税率設定
  taxRateType: taxRateTypeSchema,
  // SEO フィールド
  metaDescription: z.string().optional(),
  metaKeywords: z.string().optional(),
  // OGP フィールド
  ogpTitle: z.string().optional(),
  ogpDescription: z.string().optional(),
  ogpImageUrl: z.string().optional(),
  // 公開設定
  publishedAt: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

// =============================================================================
// Types
// =============================================================================

type TermsOption = {
  id: string
  title: string
  type: string
}

type LocationOption = {
  id: string
  name: string
  address: string
}

type CategoryOption = {
  id: string
  name: string
  icon: string | null
  color: string | null
}

type SpaceInlineEditorProps = {
  space?: SpaceWithStats
  mode?: 'create' | 'edit'
  availableTerms?: TermsOption[]
  availableLocations?: LocationOption[]
  availableCategories?: CategoryOption[]
  taxSettings?: TaxSettings
}

// =============================================================================
// Sortable Image Item
// =============================================================================

type SortableImageItemProps = {
  id: string
  url: string
  index: number
  onRemove: (index: number) => void
  disabled?: boolean
}

function SortableImageItem({ id, url, index, onRemove, disabled }: SortableImageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded border p-2',
        isDragging && 'z-50 bg-muted/80 shadow-lg'
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <Image
        src={url}
        alt={`画像${index + 1}`}
        width={40}
        height={40}
        className="rounded object-cover"
        style={{ width: 40, height: 40 }}
      />
      <span className="flex-1 truncate text-sm">{url}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={disabled}
      >
        削除
      </Button>
    </div>
  )
}

// =============================================================================
// Component
// =============================================================================

export function SpaceInlineEditor({
  space,
  mode = 'edit',
  availableTerms = [],
  availableLocations = [],
  availableCategories = [],
  taxSettings = DEFAULT_TAX_SETTINGS,
}: SpaceInlineEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [hasEditorChanges, setHasEditorChanges] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>(space?.imageUrls || [])
  const [facilities, setFacilities] = useState<string[]>(space?.facilities || [])
  const [newFacility, setNewFacility] = useState('')
  const dndContextId = useId()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: space
      ? {
          slug: space.slug,
          name: space.name,
          description: space.description,
          address: space.address,
          access: space.access ?? '',
          capacity: space.capacity,
          area: space.area ?? undefined,
          hourlyPrice: space.hourlyPrice,
          dailyPrice: space.dailyPrice ?? undefined,
          mainImageUrl: space.mainImageUrl,
          imageUrls: space.imageUrls,
          facilities: space.facilities,
          isPublished: space.isPublished,
          termsId: space.termsId ?? undefined,
          locationId: space.locationId ?? undefined,
          categoryId: space.categoryId ?? undefined,
          // 割引設定
          discountType: space.discountType ?? 'none',
          discountValue: space.discountValue ?? undefined,
          durationDiscountOverride: space.durationDiscountOverride ?? 'inherit',
          // 税率設定
          taxRateType: getTaxRateTypeOrDefault(space.taxRateType),
          // SEO フィールド
          metaDescription: space.metaDescription ?? '',
          metaKeywords: space.metaKeywords ?? '',
          // OGP フィールド
          ogpTitle: space.ogpTitle ?? '',
          ogpDescription: space.ogpDescription ?? '',
          ogpImageUrl: space.ogpImageUrl ?? '',
        }
      : {
          slug: '',
          name: '',
          description: '',
          address: '',
          access: '',
          capacity: 10,
          area: undefined,
          hourlyPrice: 0,
          dailyPrice: undefined,
          mainImageUrl: '',
          imageUrls: [],
          facilities: [],
          isPublished: false,
          termsId: undefined,
          locationId: undefined,
          categoryId: undefined,
          // 割引設定
          discountType: 'none',
          discountValue: undefined,
          durationDiscountOverride: 'inherit',
          // 税率設定
          taxRateType: 'standard',
          // SEO フィールド
          metaDescription: '',
          metaKeywords: '',
          // OGP フィールド
          ogpTitle: '',
          ogpDescription: '',
          ogpImageUrl: '',
        },
  })

  const name = useWatch({ control, name: 'name' })
  const isPublished = useWatch({ control, name: 'isPublished' })
  const termsId = useWatch({ control, name: 'termsId' })
  const locationId = useWatch({ control, name: 'locationId' })
  const categoryId = useWatch({ control, name: 'categoryId' })
  const mainImageUrl = useWatch({ control, name: 'mainImageUrl' })
  const description = useWatch({ control, name: 'description' })
  const discountType = useWatch({ control, name: 'discountType' })
  const discountValue = useWatch({ control, name: 'discountValue' })
  const durationDiscountOverride = useWatch({ control, name: 'durationDiscountOverride' })
  const taxRateType = useWatch({ control, name: 'taxRateType' })
  const hourlyPrice = useWatch({ control, name: 'hourlyPrice' })
  const dailyPrice = useWatch({ control, name: 'dailyPrice' })

  // 割引後価格を計算
  const calculateDiscountedPrice = (price: number): number => {
    if (!price || discountType === 'none' || !discountValue) return price
    if (discountType === 'percentage') return Math.round(price * (1 - discountValue / 100))
    if (discountType === 'fixed') return Math.max(0, price - discountValue)
    return price
  }

  const discountedHourlyPrice = calculateDiscountedPrice(hourlyPrice || 0)
  const discountedDailyPrice = dailyPrice ? calculateDiscountedPrice(dailyPrice) : null
  const hasDiscount = discountType !== 'none' && discountValue && discountValue > 0

  // 税込価格計算
  const currentTaxRate = getTaxRate(taxRateType, taxSettings)
  const taxIncludedHourlyPrice = calculateTaxIncludedPrice(hourlyPrice || 0, currentTaxRate)
  const taxIncludedDailyPrice = dailyPrice ? calculateTaxIncludedPrice(dailyPrice, currentTaxRate) : null
  const discountedTaxIncludedHourlyPrice = calculateTaxIncludedPrice(discountedHourlyPrice, currentTaxRate)
  const discountedTaxIncludedDailyPrice = discountedDailyPrice !== null
    ? calculateTaxIncludedPrice(discountedDailyPrice, currentTaxRate)
    : null

  // メイン画像用メディアピッカー
  const mainImagePicker = useSingleMediaPicker({
    defaultUsage: 'SPACE',
    onSelect: (media) => {
      if (media.length > 0) {
        setValue('mainImageUrl', media[0].url, { shouldDirty: true })
      }
    },
  })

  // 追加画像用メディアピッカー
  const additionalImagesPicker = useMultipleMediaPicker({
    defaultUsage: 'SPACE',
    maxSelections: 10 - imageUrls.length,
    onSelect: (media) => {
      if (media.length > 0) {
        const newUrls = media.map((m) => m.url)
        setImageUrls((prev) => [...prev, ...newUrls].slice(0, 10))
        setHasEditorChanges(true)
      }
    },
  })

  // D&D Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDescriptionChange = (html: string) => {
    setValue('description', html, { shouldDirty: true })
    setHasEditorChanges(true)
  }

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const payload = {
          slug: data.slug,
          name: data.name,
          description: data.description,
          address: data.address,
          capacity: data.capacity,
          hourlyPrice: data.hourlyPrice,
          mainImageUrl: data.mainImageUrl,
          imageUrls,
          facilities,
          isPublished: data.isPublished ?? false,
          access: data.access || undefined,
          area: data.area || undefined,
          dailyPrice: data.dailyPrice || undefined,
          termsId: data.termsId || undefined,
          locationId: data.locationId || undefined,
          categoryId: data.categoryId || undefined,
          // 割引設定
          discountType: data.discountType ?? 'none',
          discountValue: data.discountType !== 'none' ? data.discountValue ?? null : null,
          durationDiscountOverride: data.durationDiscountOverride ?? 'inherit',
          // 税率設定
          taxRateType: data.taxRateType ?? 'standard',
          // SEO フィールド
          metaDescription: data.metaDescription || null,
          metaKeywords: data.metaKeywords || null,
          // OGP フィールド
          ogpTitle: data.ogpTitle || null,
          ogpDescription: data.ogpDescription || null,
          ogpImageUrl: data.ogpImageUrl || null,
        }

        if (mode === 'create') {
          const result = await createSpace(payload)
          if (result.success) {
            toast.success('スペースを作成しました')
            router.push(`/admin/spaces/${result.data.id}`)
          } else {
            toast.error(result.error)
          }
        } else if (space) {
          const result = await updateSpace(space.id, payload)
          if (result.success) {
            reset(data)
            setHasEditorChanges(false)
            router.refresh()
            toast.success('スペースを保存しました')
          } else {
            toast.error(result.error)
          }
        }
      } catch (error) {
        logger.error('保存中にエラーが発生しました', { error: error instanceof Error ? error.message : String(error) })
        toast.error('保存中にエラーが発生しました')
      }
    })
  }

  const handleSave = () => {
    if (isPending) return
    handleSubmit(onSubmit)()
  }

  const handlePublish = () => {
    if (!space || isPending) return
    startTransition(async () => {
      const result = await toggleSpacePublished(space.id)
      if (result.success) {
        toast.success(result.message)
        setValue('isPublished', true)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleUnpublish = () => {
    if (!space || isPending) return
    startTransition(async () => {
      const result = await toggleSpacePublished(space.id)
      if (result.success) {
        toast.success(result.message)
        setValue('isPublished', false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handlePreview = () => {
    if (mode === 'create') {
      toast.info('スペースを作成後にプレビューできます')
      return
    }
    const isUnsaved = isDirty || hasEditorChanges
    if (isUnsaved) {
      toast.info('プレビューには保存済みのコンテンツが表示されます')
    }
    if (space) {
      window.open(`/spaces/${space.slug}`, '_blank')
    }
  }

  const handleBack = () => {
    const isUnsaved = isDirty || hasEditorChanges
    if (isUnsaved && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/spaces')
  }

  const handleToggleSidePanel = () => {
    setIsSidePanelOpen((prev) => !prev)
  }

  const handleCloseSidePanel = () => {
    setIsSidePanelOpen(false)
  }

  const handleDelete = () => {
    if (!space) return
    startTransition(async () => {
      try {
        const result = await deleteSpace(space.id)
        if (result.success) {
          toast.success('スペースを削除しました')
          router.push('/admin/spaces')
        } else {
          toast.error(result.error)
        }
      } catch (error) {
        logger.error('削除中にエラーが発生しました', { error: error instanceof Error ? error.message : String(error) })
        toast.error('削除中にエラーが発生しました')
      }
    })
  }

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index))
    setHasEditorChanges(true)
  }

  const handleImageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = imageUrls.findIndex((_, i) => `image-${i}` === active.id)
    const newIndex = imageUrls.findIndex((_, i) => `image-${i}` === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    setImageUrls(arrayMove(imageUrls, oldIndex, newIndex))
    setHasEditorChanges(true)
  }

  const addFacility = () => {
    if (newFacility && !facilities.includes(newFacility)) {
      setFacilities([...facilities, newFacility])
      setNewFacility('')
      setHasEditorChanges(true)
    }
  }

  const removeFacility = (index: number) => {
    setFacilities(facilities.filter((_, i) => i !== index))
    setHasEditorChanges(true)
  }

  useFullscreenMode()
  useKeyboardShortcuts({ onSave: handleSave })
  useBeforeUnload({ isDirty: isDirty || hasEditorChanges })

  const isFormDirty = isDirty || hasEditorChanges

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="h-screen flex pt-14">
      <div
        className="flex flex-1 flex-col overflow-hidden transition-[margin] duration-300"
        style={{ marginRight: isSidePanelOpen ? `${SIDE_PANEL_WIDTH.default}px` : '0' }}
      >
          <EditorHeader
            title={name || '新規スペース'}
            slug={space ? `spaces/${space.id}` : 'spaces/new'}
            isDirty={isFormDirty}
            isPending={isPending}
            isSidePanelOpen={isSidePanelOpen}
            onToggleSidePanel={handleToggleSidePanel}
            onSave={handleSave}
            onPreview={handlePreview}
            onBack={handleBack}
            publishActions={
              mode === 'edit' && space
                ? {
                    status: isPublished,
                    onPublish: handlePublish,
                    onUnpublish: handleUnpublish,
                  }
                : undefined
            }
            extraActions={
              mode === 'edit' && space ? (
                <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={isPending}
                    >
                      削除
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>スペースを削除しますか？</DialogTitle>
                      <DialogDescription>
                        この操作は取り消せません。本当に削除してもよろしいですか？
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsDeleteDialogOpen(false)}
                        disabled={isPending}
                      >
                        キャンセル
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isPending}
                      >
                        {isPending ? '削除中...' : '削除'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : undefined
            }
          />

          {/* Main Content Area */}
          <div className="flex-1 overflow-auto p-4 space-y-6">
            {/* 基本情報 */}
            <Card>
              <CardHeader>
                <CardTitle>基本情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">スペース名 *</Label>
                  <Input
                    id="name"
                    {...register('name')}
                    placeholder="例: 会議室A"
                    disabled={isPending}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">スラッグ *</Label>
                  <Input
                    id="slug"
                    {...register('slug')}
                    placeholder="例: meeting-room-a"
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    URLに使用されます（小文字英数字とハイフンのみ）
                  </p>
                  {errors.slug && (
                    <p className="text-sm text-destructive">{errors.slug.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">説明 *</Label>
                  <RichTextEditor
                    content={description || ''}
                    onChange={handleDescriptionChange}
                    placeholder="スペースの説明を入力..."
                    height="200px"
                    disabled={isPending}
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive">{errors.description.message}</p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="address">住所 *</Label>
                    <Input
                      id="address"
                      {...register('address')}
                      placeholder="例: 東京都渋谷区..."
                      disabled={isPending}
                    />
                    {errors.address && (
                      <p className="text-sm text-destructive">{errors.address.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="access">アクセス</Label>
                    <Input
                      id="access"
                      {...register('access')}
                      placeholder="例: 渋谷駅から徒歩5分"
                      disabled={isPending}
                    />
                    {errors.access && (
                      <p className="text-sm text-destructive">{errors.access.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="capacity">定員（人数）*</Label>
                    <Input
                      id="capacity"
                      type="number"
                      {...register('capacity', { valueAsNumber: true })}
                      placeholder="10"
                      disabled={isPending}
                    />
                    {errors.capacity && (
                      <p className="text-sm text-destructive">{errors.capacity.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="area">面積（m2）</Label>
                    <Input
                      id="area"
                      type="number"
                      step="0.01"
                      {...register('area', {
                        setValueAs: (v: string) => (v === '' ? null : Number(v)),
                      })}
                      placeholder="50"
                      disabled={isPending}
                    />
                    {errors.area && (
                      <p className="text-sm text-destructive">{errors.area.message}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 料金設定 */}
            <Card>
              <CardHeader>
                <CardTitle>料金設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 基本料金 */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-muted-foreground">基本料金</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="hourlyPrice">時間料金（円/時間）*</Label>
                      <Input
                        id="hourlyPrice"
                        type="number"
                        {...register('hourlyPrice', { valueAsNumber: true })}
                        placeholder="5000"
                        disabled={isPending}
                      />
                      {errors.hourlyPrice && (
                        <p className="text-sm text-destructive">{errors.hourlyPrice.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dailyPrice">日額料金（円/日）</Label>
                      <Input
                        id="dailyPrice"
                        type="number"
                        {...register('dailyPrice', {
                          setValueAs: (v: string) => (v === '' ? null : Number(v)),
                        })}
                        placeholder="30000"
                        disabled={isPending}
                      />
                      {errors.dailyPrice && (
                        <p className="text-sm text-destructive">{errors.dailyPrice.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 割引設定 */}
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-medium text-muted-foreground">割引設定</h4>

                  {/* 固定割引 */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">固定割引</Label>
                    <div className="flex flex-wrap items-center gap-3">
                      <Select
                        value={discountType}
                        onValueChange={(value) => {
                          const validated = getSpaceDiscountTypeOrDefault(value, 'none')
                          setValue('discountType', validated, {
                            shouldDirty: true,
                          })
                        }}
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">なし</SelectItem>
                          <SelectItem value="percentage">パーセント割引</SelectItem>
                          <SelectItem value="fixed">定額割引</SelectItem>
                        </SelectContent>
                      </Select>

                      {discountType === 'percentage' && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            {...register('discountValue', {
                              setValueAs: (v: string) => (v === '' ? null : Number(v)),
                            })}
                            placeholder="10"
                            className="w-20"
                            disabled={isPending}
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      )}

                      {discountType === 'fixed' && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            {...register('discountValue', {
                              setValueAs: (v: string) => (v === '' ? null : Number(v)),
                            })}
                            placeholder="500"
                            className="w-24"
                            disabled={isPending}
                          />
                          <span className="text-sm text-muted-foreground">円</span>
                        </div>
                      )}
                    </div>
                    {errors.discountValue && (
                      <p className="text-sm text-destructive">{errors.discountValue.message}</p>
                    )}
                  </div>

                  {/* 長時間割引 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">長時間割引</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>
                              グローバル設定で長時間割引が有効な場合でも、このスペースで個別に有効/無効を設定できます。
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select
                      value={durationDiscountOverride}
                      onValueChange={(value) => {
                        const validated = getDurationDiscountOverrideOrDefault(value, 'inherit')
                        setValue('durationDiscountOverride', validated, { shouldDirty: true })
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full sm:max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">グローバル設定に従う</SelectItem>
                        <SelectItem value="enabled">このスペースは常に有効</SelectItem>
                        <SelectItem value="disabled">このスペースは無効</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 税率設定 */}
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-medium text-muted-foreground">税率設定</h4>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">適用税率</Label>
                    <Select
                      value={taxRateType}
                      onValueChange={(value) => {
                        const validated = getTaxRateTypeOrDefault(value)
                        setValue('taxRateType', validated, { shouldDirty: true })
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full sm:max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">
                          標準税率（{taxSettings.standardRate}%）
                        </SelectItem>
                        <SelectItem value="reduced">
                          軽減税率（{taxSettings.reducedRate}%）
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      このスペースに適用する消費税率を選択します
                    </p>
                  </div>
                </div>

                {/* 料金プレビュー */}
                {hourlyPrice > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">
                      料金プレビュー
                      <span className="font-normal ml-2">
                        （{getTaxRateLabel(taxRateType, currentTaxRate)}）
                      </span>
                    </h4>
                    <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                      {/* 時間料金 */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">時間料金</span>
                          <div className="text-right">
                            {hasDiscount ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-xs text-muted-foreground line-through">
                                  ¥{hourlyPrice.toLocaleString()}（税抜）
                                </span>
                                <span className="text-sm">
                                  ¥{discountedHourlyPrice.toLocaleString()}（税抜）
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm">
                                ¥{hourlyPrice.toLocaleString()}（税抜）
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground"></span>
                          <span className="text-sm font-semibold text-primary">
                            ¥{(hasDiscount ? discountedTaxIncludedHourlyPrice : taxIncludedHourlyPrice).toLocaleString()}（税込）
                          </span>
                        </div>
                      </div>

                      {/* 日額料金 */}
                      {dailyPrice && (
                        <div className="space-y-1 pt-2 border-t border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">日額料金</span>
                            <div className="text-right">
                              {hasDiscount && discountedDailyPrice !== null ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="text-xs text-muted-foreground line-through">
                                    ¥{dailyPrice.toLocaleString()}（税抜）
                                  </span>
                                  <span className="text-sm">
                                    ¥{discountedDailyPrice.toLocaleString()}（税抜）
                                  </span>
                                </div>
                              ) : (
                                <span className="text-sm">
                                  ¥{dailyPrice.toLocaleString()}（税抜）
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground"></span>
                            <span className="text-sm font-semibold text-primary">
                              ¥{(discountedTaxIncludedDailyPrice ?? taxIncludedDailyPrice ?? 0).toLocaleString()}（税込）
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 割引情報 */}
                      {hasDiscount && (
                        <div className="pt-2 border-t border-border/50">
                          <p className="text-xs text-muted-foreground">
                            固定割引: {discountType === 'percentage' ? `${discountValue}% OFF` : `¥${discountValue?.toLocaleString()}引`}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 画像設定 */}
            <Card>
              <CardHeader>
                <CardTitle>画像設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* メイン画像 */}
                <div className="space-y-2">
                  <Label>メイン画像 *</Label>
                  <div className="flex items-start gap-4">
                    {mainImageUrl ? (
                      <div className="relative h-24 w-24 overflow-hidden rounded-lg border">
                        <Image
                          src={mainImageUrl}
                          alt="メイン画像"
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed bg-muted">
                        <ImagePlus className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => mainImagePicker.openPicker()}
                        disabled={isPending}
                      >
                        <ImagePlus className="mr-2 h-4 w-4" />
                        画像を選択
                      </Button>
                      {mainImageUrl && (
                        <p className="truncate text-sm text-muted-foreground">{mainImageUrl}</p>
                      )}
                    </div>
                  </div>
                  {errors.mainImageUrl && (
                    <p className="text-sm text-destructive">{errors.mainImageUrl.message}</p>
                  )}
                </div>

                {/* 追加画像 */}
                <div className="space-y-2">
                  <Label>追加画像（最大10枚）</Label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => additionalImagesPicker.openPicker()}
                    disabled={isPending || imageUrls.length >= 10}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />
                    画像を追加
                  </Button>
                  {imageUrls.length > 0 && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {imageUrls.length} / 10 枚選択中 ・ ドラッグ&ドロップで順序を変更できます
                      </p>
                      <DndContext
                        id={dndContextId}
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleImageDragEnd}
                      >
                        <SortableContext
                          items={imageUrls.map((_, i) => `image-${i}`)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="mt-2 space-y-2">
                            {imageUrls.map((url, index) => (
                              <SortableImageItem
                                key={`image-${index}`}
                                id={`image-${index}`}
                                url={url}
                                index={index}
                                onRemove={removeImageUrl}
                                disabled={isPending}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 設備 */}
            <Card>
              <CardHeader>
                <CardTitle>設備・アメニティ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={newFacility}
                    onChange={(e) => setNewFacility(e.target.value)}
                    placeholder="例: WiFi、プロジェクター"
                    disabled={isPending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addFacility()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addFacility}
                    disabled={isPending}
                  >
                    追加
                  </Button>
                </div>
                {facilities.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {facilities.map((facility, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
                      >
                        {facility}
                        <button
                          type="button"
                          onClick={() => removeFacility(index)}
                          disabled={isPending}
                          className="ml-1 text-muted-foreground hover:text-foreground"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 場所・カテゴリー設定 */}
            {(availableLocations.length > 0 || availableCategories.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>場所・カテゴリー設定</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {availableLocations.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="locationId">場所（建物・施設）</Label>
                      <Select
                        value={locationId || SELECT_NONE_VALUE}
                        onValueChange={(value) => setValue('locationId', value === SELECT_NONE_VALUE ? undefined : value, { shouldDirty: true })}
                        disabled={isPending}
                      >
                        <SelectTrigger id="locationId">
                          <SelectValue placeholder="場所を選択（任意）" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SELECT_NONE_VALUE}>なし</SelectItem>
                          {availableLocations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name}（{loc.address}）
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        スペースが所属する建物・施設を選択します
                      </p>
                    </div>
                  )}
                  {availableCategories.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="categoryId">カテゴリー（用途）</Label>
                      <Select
                        value={categoryId || SELECT_NONE_VALUE}
                        onValueChange={(value) => setValue('categoryId', value === SELECT_NONE_VALUE ? undefined : value, { shouldDirty: true })}
                        disabled={isPending}
                      >
                        <SelectTrigger id="categoryId">
                          <SelectValue placeholder="カテゴリーを選択（任意）" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SELECT_NONE_VALUE}>なし</SelectItem>
                          {availableCategories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.icon && <span className="mr-1">{cat.icon}</span>}
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        スペースの用途（会議室、スタジオなど）を選択します
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 利用規約設定 */}
            {availableTerms.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>利用規約設定</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="termsId">適用する利用規約</Label>
                    <Select
                      value={termsId || SELECT_NONE_VALUE}
                      onValueChange={(value) => setValue('termsId', value === SELECT_NONE_VALUE ? undefined : value, { shouldDirty: true })}
                      disabled={isPending}
                    >
                      <SelectTrigger id="termsId">
                        <SelectValue placeholder="規約を選択（任意）" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_NONE_VALUE}>なし（規約同意不要）</SelectItem>
                        {availableTerms.map((term) => (
                          <SelectItem key={term.id} value={term.id}>
                            {term.title}（{term.type}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      規約を設定すると、予約時に顧客が規約に同意する必要があります
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

      <SidePanelShell
        isOpen={isSidePanelOpen}
        onClose={handleCloseSidePanel}
        title="スペース設定"
      >
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">SEO設定</CardTitle>
            </CardHeader>
            <CardContent>
              <SEOFields
                register={register}
                errors={errors}
                disabled={isPending}
                fields={{
                  metaDescription: 'metaDescription',
                  metaKeywords: 'metaKeywords',
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">OGP設定</CardTitle>
            </CardHeader>
            <CardContent>
              <OGPFields
                register={register}
                errors={errors}
                disabled={isPending}
                fields={{
                  ogpTitle: 'ogpTitle',
                  ogpDescription: 'ogpDescription',
                  ogpImageUrl: 'ogpImageUrl',
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">公開設定</CardTitle>
            </CardHeader>
            <CardContent>
              <UnifiedPublishFields
                register={register}
                control={control}
                errors={errors}
                setValue={setValue}
                getValues={getValues}
                disabled={isPending}
                controlType="isPublished"
                fields={{
                  publishedAt: 'publishedAt',
                }}
                isPublishedValue={isPublished}
                onIsPublishedChange={(value: boolean) => setValue('isPublished', value, { shouldDirty: true })}
              />
            </CardContent>
          </Card>
        </div>
      </SidePanelShell>

      {/* メディアピッカーダイアログ */}
      <mainImagePicker.MediaPicker />
      <additionalImagesPicker.MediaPicker />
    </form>
  )
}
