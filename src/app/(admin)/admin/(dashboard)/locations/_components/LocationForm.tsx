'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition, useId } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ImagePlus } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  Textarea,
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
  locationFormSchema,
  defaultLocationFormValues,
  type LocationFormInput,
  type LocationWithStats,
} from '@/admin/lib/validations/location'
import { createLocation, updateLocation } from '@/admin/actions/location'
import { cn } from '@/shared/lib/utils'
import {
  useSingleMediaPicker,
  useMultipleMediaPicker,
} from '@/admin/hooks/use-media-picker'

type LocationFormProps = {
  location?: LocationWithStats
  mode: 'create' | 'edit'
}

// =============================================================================
// Drag Handle
// =============================================================================

function DragHandle({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-8 w-8 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground',
        'active:cursor-grabbing',
        className
      )}
      aria-label="ドラッグして並び替え"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M4 8h16M4 16h16" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
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
      <div {...attributes} {...listeners}>
        <DragHandle />
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
// Main Component
// =============================================================================

export function LocationForm({ location, mode }: LocationFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [imageUrls, setImageUrls] = useState<string[]>(location?.imageUrls || [])
  // SSR対応のDndContext ID（hydration mismatch防止）
  const dndContextId = useId()

  // メイン画像用メディアピッカー（単一選択）
  const mainImagePicker = useSingleMediaPicker({
    defaultUsage: 'SPACE',
    onSelect: (media) => {
      const selected = media[0]
      if (selected) {
        setValue('imageUrl', selected.url)
      }
    },
  })

  // 追加画像用メディアピッカー（複数選択）
  const additionalImagesPicker = useMultipleMediaPicker({
    defaultUsage: 'SPACE',
    maxSelections: 10 - imageUrls.length,
    onSelect: (media) => {
      if (media.length > 0) {
        const newUrls = media.map((m) => m.url)
        setImageUrls((prev) => [...prev, ...newUrls].slice(0, 10))
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

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    control,
  } = useForm<LocationFormInput>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: location
      ? {
          name: location.name,
          description: location.description || '',
          address: location.address,
          access: location.access || '',
          imageUrl: location.imageUrl,
          imageUrls: location.imageUrls,
          businessHours: location.businessHours,
          sortOrder: location.sortOrder,
          isPublished: location.isPublished,
        }
      : defaultLocationFormValues,
  })

  const isPublished = useWatch({ control, name: 'isPublished' })
  const imageUrl = useWatch({ control, name: 'imageUrl' })

  const onSubmit = async (data: LocationFormInput) => {
    startTransition(async () => {
      const submitData = {
        name: data.name,
        description: data.description || '',
        address: data.address,
        access: data.access || '',
        imageUrl: data.imageUrl,
        imageUrls,
        businessHours: data.businessHours,
        sortOrder: data.sortOrder,
        isPublished: data.isPublished ?? false,
      }

      if (mode === 'create') {
        const result = await createLocation(submitData)
        if (result.success) {
          router.push(`/admin/locations/${result.data.id}`)
        } else {
          toast.error(result.error)
        }
      } else if (location) {
        const result = await updateLocation(location.id, submitData)
        if (result.success) {
          router.push('/admin/locations')
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index))
  }

  const handleImageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = imageUrls.findIndex((_, i) => `image-${i}` === active.id)
    const newIndex = imageUrls.findIndex((_, i) => `image-${i}` === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    setImageUrls(arrayMove(imageUrls, oldIndex, newIndex))
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">場所名 *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="例: Myrrhビル"
              disabled={isPending}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">説明</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="建物・施設の説明を入力..."
              rows={4}
              disabled={isPending}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'description-error' : undefined}
            />
            {errors.description && (
              <p id="description-error" className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">住所 *</Label>
            <Input
              id="address"
              {...register('address')}
              placeholder="例: 東京都渋谷区..."
              disabled={isPending}
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? 'address-error' : undefined}
            />
            {errors.address && (
              <p id="address-error" className="text-xs text-destructive">
                {errors.address.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="access">アクセス</Label>
            <Textarea
              id="access"
              {...register('access')}
              placeholder="例: 渋谷駅から徒歩5分&#10;地下鉄A出口すぐ"
              rows={3}
              disabled={isPending}
              aria-invalid={!!errors.access}
              aria-describedby={errors.access ? 'access-error' : undefined}
            />
            {errors.access && (
              <p id="access-error" className="text-xs text-destructive">
                {errors.access.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sortOrder">並び順</Label>
            <Input
              id="sortOrder"
              type="number"
              {...register('sortOrder', { valueAsNumber: true })}
              placeholder="0"
              disabled={isPending}
              aria-invalid={!!errors.sortOrder}
              aria-describedby={errors.sortOrder ? 'sortOrder-error' : 'sortOrder-hint'}
            />
            <p id="sortOrder-hint" className="text-sm text-muted-foreground">
              数値が小さいほど先頭に表示されます
            </p>
            {errors.sortOrder && (
              <p id="sortOrder-error" className="text-xs text-destructive">
                {errors.sortOrder.message}
              </p>
            )}
          </div>
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
            <Label>建物画像 *</Label>
            <div className="flex items-start gap-4">
              {imageUrl ? (
                <div className="relative h-24 w-24 overflow-hidden rounded-lg border">
                  <Image
                    src={imageUrl}
                    alt="建物画像"
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
                {imageUrl && (
                  <p className="truncate text-sm text-muted-foreground">
                    {imageUrl}
                  </p>
                )}
              </div>
            </div>
            {errors.imageUrl && (
              <p className="text-xs text-destructive">
                {errors.imageUrl.message}
              </p>
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

      {/* 公開設定 */}
      <Card>
        <CardHeader>
          <CardTitle>公開設定</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Switch
              checked={isPublished}
              onCheckedChange={(checked) => setValue('isPublished', checked)}
              disabled={isPending}
            />
            <div>
              <p className="font-medium">
                {isPublished ? '公開中' : '非公開'}
              </p>
              <p className="text-sm text-muted-foreground">
                {isPublished
                  ? 'この場所は公開ページに表示されます'
                  : 'この場所は公開ページに表示されません'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ボタン */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? mode === 'create'
              ? '作成中...'
              : '更新中...'
            : mode === 'create'
              ? '作成'
              : '更新'}
        </Button>
      </div>

      {/* メディアピッカーダイアログ */}
      <mainImagePicker.MediaPicker />
      <additionalImagesPicker.MediaPicker />
    </form>
  )
}
