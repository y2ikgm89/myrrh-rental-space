'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input, Label, Switch, Textarea } from '@/admin/components/ui'
import {
  contactFormConfigSchema,
  getContactFormConfig,
  type ContactFormConfig,
  type ContactFormConfigInput,
} from '@/shared/lib/validations/section'
import { FormActions, type ConfigFormProps } from './shared'

export default function ContactFormConfigForm({ section, onSave, isPending, onDirtyChange }: ConfigFormProps) {
  const config = getContactFormConfig(section.config)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ContactFormConfigInput, unknown, ContactFormConfig>({
    resolver: zodResolver(contactFormConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit((data) => onSave({ config: data }))} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="contact-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="contact-section-label"
            {...register('sectionLabel')}
            placeholder="例: Contact"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-title">タイトル</Label>
          <Input
            id="contact-title"
            {...register('title')}
            placeholder="お問い合わせ"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-description">説明（任意）</Label>
          <Textarea
            id="contact-description"
            {...register('description')}
            placeholder="お気軽にお問い合わせください"
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label>表示フィールド</Label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch
                id="contact-name"
                checked={config.showNameField}
                onCheckedChange={(checked) => setValue('showNameField', checked)}
                disabled={isPending}
              />
              <Label htmlFor="contact-name">名前フィールド</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="contact-phone"
                checked={config.showPhoneField}
                onCheckedChange={(checked) => setValue('showPhoneField', checked)}
                disabled={isPending}
              />
              <Label htmlFor="contact-phone">電話番号フィールド</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="contact-subject"
                checked={config.showSubjectField}
                onCheckedChange={(checked) => setValue('showSubjectField', checked)}
                disabled={isPending}
              />
              <Label htmlFor="contact-subject">件名フィールド</Label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-submit">送信ボタンテキスト</Label>
          <Input
            id="contact-submit"
            {...register('submitButtonText')}
            placeholder="送信する"
            disabled={isPending}
          />
        </div>
      </div>

      <FormActions isDirty={isDirty} isPending={isPending} onDirtyChange={onDirtyChange} />
    </form>
  )
}
