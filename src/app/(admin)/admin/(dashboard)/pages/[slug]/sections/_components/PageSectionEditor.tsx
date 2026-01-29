'use client'

/**
 * ページセクションエディタ
 *
 * 各セクションタイプに応じた設定フォームを表示
 */

import Image from 'next/image'
import { useState, useCallback, useTransition } from 'react'
import { toast } from 'sonner'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@/admin/components/ui'
import { ArrowLeft, Save, ImagePlus } from 'lucide-react'
import { useSingleMediaPicker } from '@/admin/hooks/use-media-picker'
import type { CTAButtonItem } from '@/shared/lib/validations/page-section'
import { CTAButtonEditor } from '@/shared/components/cta-button-editor'
import {
  updatePageSection,
  type PageSectionData,
} from '@/admin/actions/page-section'
import {
  PageSectionType,
  sectionTypeLabels,
  heroConfigSchema,
  customConfigSchema,
  contactFormConfigSchema,
  faqListConfigSchema,
  spaceListConfigSchema,
  newsListConfigSchema,
  postListConfigSchema,
  ctaConfigSchema,
  getHeroConfig,
  getCustomConfig,
  getContactFormConfig,
  getFaqListConfig,
  getSpaceListConfig,
  getNewsListConfig,
  getPostListConfig,
  getCtaConfig,
  getGalleryConfig,
  getTestimonialConfig,
  getMapConfig,
  getEmbedConfig,
  parseHeroHeight,
  parseMaxWidth,
  parsePadding,
  parseSpaceLayout,
  parseNewsLayout,
  parsePostLayout,
  parseCtaVariant,
  type HeroConfig,
  type CustomConfig,
  type ContactFormConfig,
  type FaqListConfig,
  type SpaceListConfig,
  type NewsListConfig,
  type PostListConfig,
  type CtaConfig,
  type GalleryConfig,
  type TestimonialConfig,
  type MapConfig,
  type EmbedConfig,
  type HeroConfigInput,
  type CustomConfigInput,
  type ContactFormConfigInput,
  type SpaceListConfigInput,
  type NewsListConfigInput,
  type PostListConfigInput,
  type FaqListConfigInput,
  type CtaConfigInput,
} from '@/shared/lib/validations/page-section'
import dynamic from 'next/dynamic'
import { EDITOR_PROSE_CLASSES } from '@/shared/lib/styles/prose'

const LexicalEditor = dynamic(
  () => import('@/admin/components/editor/lexical/LexicalEditor').then((mod) => ({ default: mod.LexicalEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] flex items-center justify-center border rounded-lg bg-muted/50">
        <div className="animate-pulse text-muted-foreground">エディタを読み込み中...</div>
      </div>
    ),
  }
)

// =============================================================================
// Props
// =============================================================================

interface PageSectionEditorProps {
  section: PageSectionData
  onBack: () => void
  onSave: () => void
}

// =============================================================================
// Hero Config Form
// =============================================================================

function HeroConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: HeroConfig
  onSave: (config: HeroConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<HeroConfigInput, unknown, HeroConfig>({
    resolver: zodResolver(heroConfigSchema),
    defaultValues: config,
  })

  const backgroundImageUrl = useWatch({ control, name: 'backgroundImageUrl' })

  const [buttons, setButtons] = useState<CTAButtonItem[]>(config.buttons)
  const handleButtonsChange = useCallback((newButtons: CTAButtonItem[]) => {
    setButtons(newButtons)
    setValue('buttons', newButtons)
  }, [setValue])

  const bgPicker = useSingleMediaPicker({
    defaultUsage: 'GENERAL',
    onSelect: (media) => {
      if (media.length > 0) {
        setValue('backgroundImageUrl', media[0].url)
      }
    },
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="hero-title">タイトル（任意）</Label>
          <Input
            id="hero-title"
            {...register('title')}
            placeholder="ページのメインタイトル"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-subtitle">サブタイトル（任意）</Label>
          <Textarea
            id="hero-subtitle"
            {...register('subtitle')}
            placeholder="サブタイトルを入力"
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label>背景画像（任意）</Label>
          <div className="flex items-start gap-3">
            {backgroundImageUrl ? (
              <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg border">
                <Image
                  src={backgroundImageUrl}
                  alt="背景画像"
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-20 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => bgPicker.openPicker()}
                disabled={isPending}
              >
                <ImagePlus className="mr-1 h-3 w-3" />
                画像を選択
              </Button>
              {backgroundImageUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setValue('backgroundImageUrl', '')}
                  disabled={isPending}
                >
                  削除
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="hero-height">高さ</Label>
            <Select
              defaultValue={config.height}
              onValueChange={(v) => setValue('height', parseHeroHeight(v))}
              disabled={isPending}
            >
              <SelectTrigger id="hero-height">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">小</SelectItem>
                <SelectItem value="md">中</SelectItem>
                <SelectItem value="lg">大</SelectItem>
                <SelectItem value="full">全画面</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hero-overlay-opacity">オーバーレイ透過度</Label>
            <Input
              id="hero-overlay-opacity"
              type="number"
              min={0}
              max={100}
              {...register('overlayOpacity', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="hero-overlay"
            checked={config.overlay}
            onCheckedChange={(checked) => setValue('overlay', checked)}
            disabled={isPending}
          />
          <Label htmlFor="hero-overlay">オーバーレイを表示</Label>
        </div>

        <div className="space-y-2">
          <Label>ボタン</Label>
          <CTAButtonEditor
            buttons={buttons}
            onChange={handleButtonsChange}
            disabled={isPending}
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>

      <bgPicker.MediaPicker />
    </form>
  )
}

// =============================================================================
// Custom Config Form (with Lexical Editor)
// =============================================================================

function CustomConfigForm({
  config,
  content,
  onSave,
  isPending,
}: {
  config: CustomConfig
  content: string | null
  onSave: (config: CustomConfig, content: string) => void
  isPending: boolean
}) {
  const [editorContent, setEditorContent] = useState(content || '')

  const {
    register,
    handleSubmit,
    setValue,
  } = useForm<CustomConfigInput, unknown, CustomConfig>({
    resolver: zodResolver(customConfigSchema),
    defaultValues: config,
  })

  const handleFormSubmit = (formData: CustomConfig) => {
    onSave(formData, editorContent)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="custom-max-width">最大幅</Label>
            <Select
              defaultValue={config.maxWidth}
              onValueChange={(v) => setValue('maxWidth', parseMaxWidth(v))}
              disabled={isPending}
            >
              <SelectTrigger id="custom-max-width">
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

          <div className="space-y-2">
            <Label htmlFor="custom-padding">パディング</Label>
            <Select
              defaultValue={config.padding}
              onValueChange={(v) => setValue('padding', parsePadding(v))}
              disabled={isPending}
            >
              <SelectTrigger id="custom-padding">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">なし</SelectItem>
                <SelectItem value="sm">小</SelectItem>
                <SelectItem value="md">中</SelectItem>
                <SelectItem value="lg">大</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom-class">追加CSSクラス（任意）</Label>
          <Input
            id="custom-class"
            {...register('containerClass')}
            placeholder="bg-muted"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label>コンテンツ</Label>
          <LexicalEditor
            content={content || ''}
            onChange={setEditorContent}
            placeholder="セクションのコンテンツを入力..."
            className={EDITOR_PROSE_CLASSES}
            height="400px"
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  )
}

// =============================================================================
// ContactForm Config Form
// =============================================================================

function ContactFormConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: ContactFormConfig
  onSave: (config: ContactFormConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ContactFormConfigInput, unknown, ContactFormConfig>({
    resolver: zodResolver(contactFormConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
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

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  )
}

// =============================================================================
// SpaceList Config Form
// =============================================================================

function SpaceListConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: SpaceListConfig
  onSave: (config: SpaceListConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SpaceListConfigInput, unknown, SpaceListConfig>({
    resolver: zodResolver(spaceListConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="space-title">タイトル</Label>
          <Input
            id="space-title"
            {...register('title')}
            placeholder="スペース一覧"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="space-max">最大表示件数</Label>
            <Input
              id="space-max"
              type="number"
              min={1}
              max={24}
              {...register('maxItems', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-columns">カラム数</Label>
            <Input
              id="space-columns"
              type="number"
              min={1}
              max={4}
              {...register('columns', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="space-layout">レイアウト</Label>
          <Select
            defaultValue={config.layout}
            onValueChange={(v) => setValue('layout', parseSpaceLayout(v))}
            disabled={isPending}
          >
            <SelectTrigger id="space-layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">グリッド</SelectItem>
              <SelectItem value="list">リスト</SelectItem>
              <SelectItem value="carousel">カルーセル</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id="space-published"
              checked={config.showOnlyPublished}
              onCheckedChange={(checked) => setValue('showOnlyPublished', checked)}
              disabled={isPending}
            />
            <Label htmlFor="space-published">公開済みのみ表示</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="space-view-all"
              checked={config.showViewAllLink}
              onCheckedChange={(checked) => setValue('showViewAllLink', checked)}
              disabled={isPending}
            />
            <Label htmlFor="space-view-all">「すべて見る」リンクを表示</Label>
          </div>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  )
}

// =============================================================================
// NewsList Config Form
// =============================================================================

function NewsListConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: NewsListConfig
  onSave: (config: NewsListConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<NewsListConfigInput, unknown, NewsListConfig>({
    resolver: zodResolver(newsListConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="news-title">タイトル</Label>
          <Input
            id="news-title"
            {...register('title')}
            placeholder="お知らせ"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="news-max">表示件数</Label>
          <Input
            id="news-max"
            type="number"
            min={1}
            max={20}
            {...register('maxItems', { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="news-layout">レイアウト</Label>
          <Select
            defaultValue={config.layout}
            onValueChange={(v) => setValue('layout', parseNewsLayout(v))}
            disabled={isPending}
          >
            <SelectTrigger id="news-layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="list">リスト</SelectItem>
              <SelectItem value="card">カード</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="news-view-all"
            checked={config.showViewAllLink}
            onCheckedChange={(checked) => setValue('showViewAllLink', checked)}
            disabled={isPending}
          />
          <Label htmlFor="news-view-all">「すべて見る」リンクを表示</Label>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  )
}

// =============================================================================
// PostList Config Form
// =============================================================================

function PostListConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: PostListConfig
  onSave: (config: PostListConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PostListConfigInput, unknown, PostListConfig>({
    resolver: zodResolver(postListConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="post-title">タイトル</Label>
          <Input
            id="post-title"
            {...register('title')}
            placeholder="最新の記事"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="post-max">表示件数</Label>
            <Input
              id="post-max"
              type="number"
              min={1}
              max={20}
              {...register('maxItems', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="post-columns">カラム数</Label>
            <Input
              id="post-columns"
              type="number"
              min={1}
              max={4}
              {...register('columns', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="post-layout">レイアウト</Label>
          <Select
            defaultValue={config.layout}
            onValueChange={(v) => setValue('layout', parsePostLayout(v))}
            disabled={isPending}
          >
            <SelectTrigger id="post-layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">グリッド</SelectItem>
              <SelectItem value="list">リスト</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="post-view-all"
            checked={config.showViewAllLink}
            onCheckedChange={(checked) => setValue('showViewAllLink', checked)}
            disabled={isPending}
          />
          <Label htmlFor="post-view-all">「すべて見る」リンクを表示</Label>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  )
}

// =============================================================================
// FaqList Config Form
// =============================================================================

function FaqListConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: FaqListConfig
  onSave: (config: FaqListConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FaqListConfigInput, unknown, FaqListConfig>({
    resolver: zodResolver(faqListConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="faq-title">タイトル</Label>
          <Input
            id="faq-title"
            {...register('title')}
            placeholder="よくあるご質問"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="faq-max">最大表示件数</Label>
          <Input
            id="faq-max"
            type="number"
            min={1}
            max={50}
            {...register('maxItems', { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="faq-view-all"
            checked={config.showViewAllLink}
            onCheckedChange={(checked) => setValue('showViewAllLink', checked)}
            disabled={isPending}
          />
          <Label htmlFor="faq-view-all">「すべて見る」リンクを表示</Label>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  )
}

// =============================================================================
// CTA Config Form
// =============================================================================

function CtaConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: CtaConfig
  onSave: (config: CtaConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CtaConfigInput, unknown, CtaConfig>({
    resolver: zodResolver(ctaConfigSchema),
    defaultValues: config,
  })

  const [buttons, setButtons] = useState<CTAButtonItem[]>(config.buttons)
  const handleButtonsChange = useCallback((newButtons: CTAButtonItem[]) => {
    setButtons(newButtons)
    setValue('buttons', newButtons)
  }, [setValue])

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cta-title">タイトル</Label>
          <Input
            id="cta-title"
            {...register('title')}
            placeholder="ご予約・お問い合わせ"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cta-description">説明（任意）</Label>
          <Textarea
            id="cta-description"
            {...register('description')}
            placeholder="説明文を入力"
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cta-variant">バリエーション</Label>
          <Select
            defaultValue={config.variant}
            onValueChange={(v) => setValue('variant', parseCtaVariant(v))}
            disabled={isPending}
          >
            <SelectTrigger id="cta-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">デフォルト</SelectItem>
              <SelectItem value="centered">中央揃え</SelectItem>
              <SelectItem value="split">分割</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>ボタン</Label>
          <CTAButtonEditor
            buttons={buttons}
            onChange={handleButtonsChange}
            disabled={isPending}
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  )
}

// =============================================================================
// Simple Config Forms (Gallery, Testimonial, Map, Embed)
// =============================================================================

function SimpleConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: GalleryConfig | TestimonialConfig | MapConfig | EmbedConfig
  onSave: (config: Record<string, unknown>) => void
  isPending: boolean
}) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        このセクションタイプの詳細設定は今後追加予定です。
      </p>
      <Button onClick={() => onSave(config)} disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        保存
      </Button>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function PageSectionEditor({ section, onBack, onSave }: PageSectionEditorProps) {
  const [isPending, startTransition] = useTransition()
  const label = sectionTypeLabels[section.type]

  const handleConfigSave = (config: Record<string, unknown>, content?: string) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, {
        config,
        content,
      })
      if (result.success) {
        toast.success(result.message)
        onSave()
      } else {
        toast.error(result.error)
      }
    })
  }

  const renderConfigForm = () => {
    const { config } = section

    switch (section.type) {
      case PageSectionType.HERO:
        return (
          <HeroConfigForm
            config={getHeroConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case PageSectionType.CUSTOM:
        return (
          <CustomConfigForm
            config={getCustomConfig(config)}
            content={section.content}
            onSave={(c, content) => handleConfigSave(c, content)}
            isPending={isPending}
          />
        )
      case PageSectionType.CONTACT_FORM:
        return (
          <ContactFormConfigForm
            config={getContactFormConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case PageSectionType.SPACE_LIST:
        return (
          <SpaceListConfigForm
            config={getSpaceListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case PageSectionType.NEWS_LIST:
        return (
          <NewsListConfigForm
            config={getNewsListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case PageSectionType.POST_LIST:
        return (
          <PostListConfigForm
            config={getPostListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case PageSectionType.FAQ_LIST:
        return (
          <FaqListConfigForm
            config={getFaqListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case PageSectionType.CTA:
        return (
          <CtaConfigForm
            config={getCtaConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case PageSectionType.GALLERY:
        return (
          <SimpleConfigForm
            config={getGalleryConfig(config)}
            onSave={handleConfigSave}
            isPending={isPending}
          />
        )
      case PageSectionType.TESTIMONIAL:
        return (
          <SimpleConfigForm
            config={getTestimonialConfig(config)}
            onSave={handleConfigSave}
            isPending={isPending}
          />
        )
      case PageSectionType.MAP:
        return (
          <SimpleConfigForm
            config={getMapConfig(config)}
            onSave={handleConfigSave}
            isPending={isPending}
          />
        )
      case PageSectionType.EMBED:
        return (
          <SimpleConfigForm
            config={getEmbedConfig(config)}
            onSave={handleConfigSave}
            isPending={isPending}
          />
        )
      default:
        return (
          <p className="text-muted-foreground">
            このセクションタイプは編集できません
          </p>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          戻る
        </Button>
        <div>
          <h3 className="text-lg font-medium">{section.title || label}の設定</h3>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>

      {/* Title Edit */}
      <Card>
        <CardHeader>
          <CardTitle>セクション情報</CardTitle>
          <CardDescription>セクションの基本情報</CardDescription>
        </CardHeader>
        <CardContent>
          <TitleForm section={section} isPending={isPending} onSave={onSave} />
        </CardContent>
      </Card>

      {/* Config Form */}
      <Card>
        <CardHeader>
          <CardTitle>セクション設定</CardTitle>
          <CardDescription>{label}固有の設定</CardDescription>
        </CardHeader>
        <CardContent>{renderConfigForm()}</CardContent>
      </Card>
    </div>
  )
}

// =============================================================================
// Title Form
// =============================================================================

const titleSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).optional(),
})

type TitleFormData = z.infer<typeof titleSchema>

function TitleForm({
  section,
  isPending,
  onSave,
}: {
  section: PageSectionData
  isPending: boolean
  onSave: () => void
}) {
  const [isUpdating, startTransition] = useTransition()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TitleFormData>({
    resolver: zodResolver(titleSchema),
    defaultValues: { title: section.title || '' },
  })

  const handleTitleSave = (data: TitleFormData) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, {
        title: data.title || undefined,
      })
      if (result.success) {
        toast.success('タイトルを更新しました')
        onSave()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(handleTitleSave)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="section-title">カスタムタイトル（任意）</Label>
        <Input
          id="section-title"
          {...register('title')}
          placeholder={sectionTypeLabels[section.type]}
          disabled={isPending || isUpdating}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          空欄の場合はデフォルトのタイトルが使用されます
        </p>
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={isPending || isUpdating}>
        タイトルを保存
      </Button>
    </form>
  )
}
