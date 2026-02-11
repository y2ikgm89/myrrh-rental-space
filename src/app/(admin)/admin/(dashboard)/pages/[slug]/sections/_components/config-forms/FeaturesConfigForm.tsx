'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/admin/components/ui'
import { Plus, Trash2 } from 'lucide-react'
import {
  featuresConfigSchema,
  getFeaturesConfig,
  parseFeaturesLayout,
  type FeaturesConfig,
  type FeaturesConfigInput,
} from '@/shared/lib/validations/section'
import { featuresLayoutLabels } from '@/shared/lib/validations/section-options'
import { keysOf } from '@/shared/lib/serialize'
import { FormActions, type ConfigFormProps } from './shared'

export default function FeaturesConfigForm({ section, onSave, isPending, onDirtyChange }: ConfigFormProps) {
  const config = getFeaturesConfig(section.config)

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isDirty },
  } = useForm<FeaturesConfigInput, unknown, FeaturesConfig>({
    resolver: zodResolver(featuresConfigSchema),
    defaultValues: config,
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  return (
    <form onSubmit={handleSubmit((data) => onSave({ config: data }))} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="features-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="features-section-label"
            {...register('sectionLabel')}
            placeholder="例: Features"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="features-title">タイトル</Label>
          <Input
            id="features-title"
            {...register('title')}
            placeholder="Features"
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="features-layout">レイアウト</Label>
            <Select
              defaultValue={config.layout}
              onValueChange={(v) => setValue('layout', parseFeaturesLayout(v))}
              disabled={isPending}
            >
              <SelectTrigger id="features-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(featuresLayoutLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {featuresLayoutLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="features-columns">カラム数</Label>
            <Input
              id="features-columns"
              type="number"
              min={1}
              max={4}
              {...register('columns', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>特徴アイテム</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({
                icon: '',
                title: '',
                description: '',
              })}
              disabled={isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              追加
            </Button>
          </div>
          {fields.length === 0 && (
            <div className="flex items-center justify-center py-8 border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground">特徴アイテムが追加されていません</p>
            </div>
          )}
          {fields.map((field, index) => (
            <Card key={field.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">#{index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>タイトル</Label>
                    <Input
                      {...register(`items.${index}.title`)}
                      placeholder="特徴のタイトル"
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>アイコン（任意）</Label>
                    <Input
                      {...register(`items.${index}.icon`)}
                      placeholder="例: Wifi, Clock, Shield"
                      disabled={isPending}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>説明（任意）</Label>
                  <Textarea
                    {...register(`items.${index}.description`)}
                    placeholder="特徴の説明文を入力..."
                    rows={2}
                    disabled={isPending}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <FormActions isDirty={isDirty} isPending={isPending} onDirtyChange={onDirtyChange} />
    </form>
  )
}
