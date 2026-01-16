'use client'

/**
 * 規約作成・編集フォーム
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
} from '@/components/admin/ui'
import { createTerms, updateTerms } from '@/actions/admin/terms'
import { TERMS_TYPES, type TermsDetail } from '@/lib/validations/terms'
import { TermsType } from '@/generated/prisma/client/enums'

interface TermsFormProps {
  terms?: TermsDetail
}

export function TermsForm({ terms }: TermsFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState<{
    title: string
    slug: string
    type: TermsType
    isActive: boolean
  }>({
    title: terms?.title ?? '',
    slug: terms?.slug ?? '',
    type: terms?.type ?? TermsType.TERMS_OF_USE,
    isActive: terms?.isActive ?? true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEditing = !!terms

  // slugを自動生成
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
  }

  const handleTitleChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      title: value,
      // 編集時はslugを自動更新しない
      ...(isEditing ? {} : { slug: generateSlug(value) }),
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    startTransition(async () => {
      if (isEditing) {
        // 更新
        const result = await updateTerms(terms.id, {
          title: formData.title,
          slug: formData.slug,
          type: formData.type,
          isActive: formData.isActive,
        })

        if (result.success) {
          toast.success(result.message)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      } else {
        // 新規作成
        const result = await createTerms({
          title: formData.title,
          slug: formData.slug,
          type: formData.type,
          isActive: formData.isActive,
        })

        if (result.success) {
          toast.success(result.message)
          router.push(`/admin/terms/${result.data.id}`)
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? '規約情報を編集' : '規約情報'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">タイトル *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="例: レンタルスペース利用規約"
              required
              disabled={isPending}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">スラッグ *</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, slug: e.target.value }))
              }
              placeholder="例: rental-terms"
              required
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              URLやシステム内部で使用される識別子です。半角英数字とハイフンのみ使用可能。
            </p>
            {errors.slug && (
              <p className="text-sm text-destructive">{errors.slug}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">規約タイプ *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, type: value as TermsType }))
              }
              disabled={isPending}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="タイプを選択" />
              </SelectTrigger>
              <SelectContent>
                {TERMS_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              規約の種類を選択します。種類によって表示場所や用途が変わります。
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isActive: checked === true }))
              }
              disabled={isPending}
            />
            <Label htmlFor="isActive" className="cursor-pointer">
              この規約を有効にする
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            無効な規約はスペースに紐づけることができません。
          </p>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? '保存中...' : isEditing ? '更新' : '作成'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isPending}
            >
              キャンセル
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
