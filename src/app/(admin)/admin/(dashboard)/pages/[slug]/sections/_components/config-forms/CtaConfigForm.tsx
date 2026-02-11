'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/admin/components/ui'
import { CTAButtonEditor } from '@/shared/components/cta-button-editor'
import {
  ctaConfigSchema,
  getCtaConfig,
  parseCtaVariant,
  type CtaConfig,
  type CtaConfigInput,
  type CTAButtonItem,
} from '@/shared/lib/validations/section'
import { FormActions, type ConfigFormProps } from './shared'

export default function CtaConfigForm({ section, onSave, isPending, onDirtyChange }: ConfigFormProps) {
  const config = getCtaConfig(section.config)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<CtaConfigInput, unknown, CtaConfig>({
    resolver: zodResolver(ctaConfigSchema),
    defaultValues: config,
  })

  const [buttons, setButtons] = useState<CTAButtonItem[]>(config.buttons)
  const handleButtonsChange = (newButtons: CTAButtonItem[]) => {
    setButtons(newButtons)
    setValue('buttons', newButtons)
  }

  return (
    <form onSubmit={handleSubmit((data) => onSave({ config: data }))} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cta-section-label">セクションラベル（英語装飾）</Label>
          <Input id="cta-section-label" {...register('sectionLabel')} placeholder="例: Ready to Begin?" disabled={isPending} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cta-title">タイトル</Label>
          <Input id="cta-title" {...register('title')} placeholder="ご予約・お問い合わせ" disabled={isPending} />
          {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cta-description">説明（任意）</Label>
          <Textarea id="cta-description" {...register('description')} placeholder="説明文を入力" rows={2} disabled={isPending} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cta-variant">バリエーション</Label>
          <Select defaultValue={config.variant} onValueChange={(v) => setValue('variant', parseCtaVariant(v))} disabled={isPending}>
            <SelectTrigger id="cta-variant"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">デフォルト</SelectItem>
              <SelectItem value="centered">中央揃え</SelectItem>
              <SelectItem value="split">分割</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>ボタン</Label>
          <CTAButtonEditor buttons={buttons} onChange={handleButtonsChange} disabled={isPending} />
        </div>
      </div>

      <FormActions isDirty={isDirty} isPending={isPending} onDirtyChange={onDirtyChange} />
    </form>
  )
}
