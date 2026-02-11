'use client'

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
import {
  embedConfigSchema,
  getEmbedConfig,
  parseEmbedAspectRatio,
  parseMaxWidth,
  type EmbedConfig,
  type EmbedConfigInput,
} from '@/shared/lib/validations/section'
import { FormActions, type ConfigFormProps } from './shared'

export default function EmbedConfigForm({ section, onSave, isPending, onDirtyChange }: ConfigFormProps) {
  const config = getEmbedConfig(section.config)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { isDirty },
  } = useForm<EmbedConfigInput, unknown, EmbedConfig>({
    resolver: zodResolver(embedConfigSchema),
    defaultValues: config,
  })

  const handleFormSave = handleSubmit((data) => {
    onSave({ config: data })
  })

  return (
    <form onSubmit={handleFormSave} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="embed-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="embed-section-label"
            {...register('sectionLabel')}
            placeholder="例: Media"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-title">タイトル（任意）</Label>
          <Input
            id="embed-title"
            {...register('title')}
            placeholder="埋め込みコンテンツ"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-url">埋め込みURL（任意）</Label>
          <Input
            id="embed-url"
            {...register('embedUrl')}
            placeholder="https://www.youtube.com/embed/..."
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">YouTube、Vimeo等の埋め込みURL</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-code">埋め込みコード（任意）</Label>
          <Textarea
            id="embed-code"
            {...register('embedCode')}
            placeholder="<iframe ...></iframe>"
            rows={4}
            disabled={isPending}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            URLの代わりにHTMLコードを直接指定できます
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="embed-aspect">アスペクト比</Label>
            <Select
              defaultValue={config.aspectRatio}
              onValueChange={(v) => setValue('aspectRatio', parseEmbedAspectRatio(v))}
              disabled={isPending}
            >
              <SelectTrigger id="embed-aspect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9（ワイド）</SelectItem>
                <SelectItem value="4:3">4:3（スタンダード）</SelectItem>
                <SelectItem value="1:1">1:1（正方形）</SelectItem>
                <SelectItem value="auto">自動</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="embed-max-width">最大幅</Label>
            <Select
              defaultValue={config.maxWidth}
              onValueChange={(v) => setValue('maxWidth', parseMaxWidth(v))}
              disabled={isPending}
            >
              <SelectTrigger id="embed-max-width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">小 (640px)</SelectItem>
                <SelectItem value="md">中 (768px)</SelectItem>
                <SelectItem value="lg">大 (1024px)</SelectItem>
                <SelectItem value="xl">特大 (1280px)</SelectItem>
                <SelectItem value="full">全幅</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <FormActions isDirty={isDirty} isPending={isPending} onDirtyChange={onDirtyChange} />
    </form>
  )
}
