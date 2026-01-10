'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
  Label,
  Switch,
} from '@/components/admin/ui'
import {
  spaceFormSchema,
  defaultSpaceFormValues,
  type SpaceFormInput,
  type SpaceWithStats,
} from '@/lib/validations/space'
import { createSpace, updateSpace } from '@/actions/admin/space'

type SpaceFormProps = {
  space?: SpaceWithStats
  mode: 'create' | 'edit'
}

export function SpaceForm({ space, mode }: SpaceFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [imageUrls, setImageUrls] = useState<string[]>(space?.imageUrls || [])
  const [facilities, setFacilities] = useState<string[]>(space?.facilities || [])
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newFacility, setNewFacility] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    control,
  } = useForm<SpaceFormInput>({
    resolver: zodResolver(spaceFormSchema),
    defaultValues: space
      ? {
          name: space.name,
          description: space.description,
          address: space.address,
          access: space.access || '',
          capacity: space.capacity,
          area: space.area,
          hourlyPrice: space.hourlyPrice,
          dailyPrice: space.dailyPrice,
          mainImageUrl: space.mainImageUrl,
          imageUrls: space.imageUrls,
          facilities: space.facilities,
          isPublished: space.isPublished,
        }
      : defaultSpaceFormValues,
  })

  const isPublished = useWatch({ control, name: 'isPublished' })

  const onSubmit = async (data: SpaceFormInput) => {
    startTransition(async () => {
      // imageUrlsとfacilitiesを追加
      const submitData = {
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
      }

      if (mode === 'create') {
        const result = await createSpace(submitData)
        if (result.success) {
          router.push(`/admin/spaces/${result.data.id}`)
        } else {
          alert(result.error)
        }
      } else if (space) {
        const result = await updateSpace(space.id, submitData)
        if (result.success) {
          router.push('/admin/spaces')
        } else {
          alert(result.error)
        }
      }
    })
  }

  const addImageUrl = () => {
    if (newImageUrl && imageUrls.length < 10) {
      try {
        new URL(newImageUrl)
        setImageUrls([...imageUrls, newImageUrl])
        setNewImageUrl('')
      } catch {
        alert('有効なURLを入力してください')
      }
    }
  }

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index))
  }

  const addFacility = () => {
    if (newFacility && !facilities.includes(newFacility)) {
      setFacilities([...facilities, newFacility])
      setNewFacility('')
    }
  }

  const removeFacility = (index: number) => {
    setFacilities(facilities.filter((_, i) => i !== index))
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
            <Label htmlFor="description">説明 *</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="スペースの説明を入力..."
              rows={5}
              disabled={isPending}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
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
                <p className="text-sm text-destructive">
                  {errors.address.message}
                </p>
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
                <p className="text-sm text-destructive">
                  {errors.access.message}
                </p>
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
                <p className="text-sm text-destructive">
                  {errors.capacity.message}
                </p>
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
        <CardContent className="space-y-4">
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
                <p className="text-sm text-destructive">
                  {errors.hourlyPrice.message}
                </p>
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
                <p className="text-sm text-destructive">
                  {errors.dailyPrice.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 画像設定 */}
      <Card>
        <CardHeader>
          <CardTitle>画像設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mainImageUrl">メイン画像URL *</Label>
            <Input
              id="mainImageUrl"
              {...register('mainImageUrl')}
              placeholder="https://example.com/image.jpg"
              disabled={isPending}
            />
            {errors.mainImageUrl && (
              <p className="text-sm text-destructive">
                {errors.mainImageUrl.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>追加画像URL（最大10枚）</Label>
            <div className="flex gap-2">
              <Input
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                disabled={isPending || imageUrls.length >= 10}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addImageUrl}
                disabled={isPending || imageUrls.length >= 10}
              >
                追加
              </Button>
            </div>
            {imageUrls.length > 0 && (
              <div className="mt-2 space-y-2">
                {imageUrls.map((url, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded border p-2"
                  >
                    <Image
                      src={url}
                      alt={`画像${index + 1}`}
                      width={40}
                      height={40}
                      className="rounded object-cover"
                    />
                    <span className="flex-1 truncate text-sm">{url}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeImageUrl(index)}
                      disabled={isPending}
                    >
                      削除
                    </Button>
                  </div>
                ))}
              </div>
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
                  ? 'このスペースは公開ページに表示されます'
                  : 'このスペースは公開ページに表示されません'}
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
            ? '保存中...'
            : mode === 'create'
              ? '作成する'
              : '更新する'}
        </Button>
      </div>
    </form>
  )
}
