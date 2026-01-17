'use client'

/**
 * セクションエディタ
 *
 * 各セクションタイプに応じた設定フォームを表示
 */

import Image from 'next/image'
import { useState, useTransition } from 'react'
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
  Switch,
  Textarea,
} from '@/components/admin/ui'
import { ArrowLeft, Save, ImagePlus } from 'lucide-react'
import { useSingleMediaPicker } from '@/hooks/use-media-picker'
import {
  updateHomepageSection,
  type HomepageSectionData,
} from '@/actions/admin/homepage-settings'
import {
  HomepageSectionType,
  sectionTypeLabels,
  heroConfigSchema,
  spaceListConfigSchema,
  newsConfigSchema,
  blogConfigSchema,
  faqConfigSchema,
  ctaConfigSchema,
  customConfigSchema,
  defaultSectionConfigs,
  isHeroConfig,
  isSpaceListConfig,
  isNewsConfig,
  isBlogConfig,
  isFaqConfig,
  isCtaConfig,
  isCustomConfig,
  type HeroConfig,
  type SpaceListConfig,
  type NewsConfig,
  type BlogConfig,
  type FaqConfig,
  type CtaConfig,
  type CustomConfig,
  type SpaceListConfigInput,
  type NewsConfigInput,
  type BlogConfigInput,
  type FaqConfigInput,
} from '@/lib/validations/homepage-section'
import dynamic from 'next/dynamic'
import { EDITOR_PROSE_CLASSES } from '@/lib/styles/prose'

const LexicalEditor = dynamic(
  () => import('@/components/admin/editor/lexical/LexicalEditor').then((mod) => ({ default: mod.LexicalEditor })),
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

interface SectionEditorProps {
  section: HomepageSectionData
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
  } = useForm<HeroConfig>({
    resolver: zodResolver(heroConfigSchema),
    defaultValues: config,
  })

  const backgroundImageUrl = useWatch({ control, name: 'backgroundImageUrl' })

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
          <Label htmlFor="hero-title">タイトル</Label>
          <Input
            id="hero-title"
            {...register('title')}
            placeholder="理想のスペースを、あなたに。"
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
                <>
                  <p className="truncate text-xs text-muted-foreground">
                    {backgroundImageUrl}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setValue('backgroundImageUrl', '')}
                    disabled={isPending}
                  >
                    削除
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="hero-cta-primary-text">メインボタンテキスト</Label>
            <Input
              id="hero-cta-primary-text"
              {...register('ctaPrimary.text')}
              placeholder="スペースを探す"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-cta-primary-url">メインボタンURL</Label>
            <Input
              id="hero-cta-primary-url"
              {...register('ctaPrimary.url')}
              placeholder="/spaces"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="hero-cta-secondary-text">サブボタンテキスト（任意）</Label>
            <Input
              id="hero-cta-secondary-text"
              {...register('ctaSecondary.text')}
              placeholder="お問い合わせ"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-cta-secondary-url">サブボタンURL（任意）</Label>
            <Input
              id="hero-cta-secondary-url"
              {...register('ctaSecondary.url')}
              placeholder="/contact"
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>

      {/* メディアピッカーダイアログ */}
      <bgPicker.MediaPicker />
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
    formState: { errors },
  } = useForm<SpaceListConfigInput, unknown, SpaceListConfig>({
    resolver: zodResolver(spaceListConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="space-max">最大表示件数</Label>
          <Input
            id="space-max"
            type="number"
            min={1}
            max={12}
            {...register('maxItems', { valueAsNumber: true })}
            disabled={isPending}
          />
          {errors.maxItems && (
            <p className="text-sm text-destructive">{errors.maxItems.message}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="space-published"
            {...register('showOnlyPublished')}
            disabled={isPending}
          />
          <Label htmlFor="space-published">公開済みスペースのみ表示</Label>
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
// News Config Form
// =============================================================================

function NewsConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: NewsConfig
  onSave: (config: NewsConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewsConfigInput, unknown, NewsConfig>({
    resolver: zodResolver(newsConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="news-title">セクションタイトル</Label>
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
            max={10}
            {...register('maxItems', { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="news-view-all"
            {...register('showViewAllLink')}
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
// Blog Config Form
// =============================================================================

function BlogConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: BlogConfig
  onSave: (config: BlogConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BlogConfigInput, unknown, BlogConfig>({
    resolver: zodResolver(blogConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="blog-title">セクションタイトル</Label>
          <Input
            id="blog-title"
            {...register('title')}
            placeholder="最新の記事"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="blog-max">表示件数</Label>
          <Input
            id="blog-max"
            type="number"
            min={1}
            max={10}
            {...register('maxItems', { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="blog-view-all"
            {...register('showViewAllLink')}
            disabled={isPending}
          />
          <Label htmlFor="blog-view-all">「すべて見る」リンクを表示</Label>
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
// FAQ Config Form
// =============================================================================

function FaqConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: FaqConfig
  onSave: (config: FaqConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FaqConfigInput, unknown, FaqConfig>({
    resolver: zodResolver(faqConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="faq-title">セクションタイトル</Label>
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
          <Label htmlFor="faq-category">FAQカテゴリID（任意）</Label>
          <Input
            id="faq-category"
            {...register('categoryId')}
            placeholder="特定カテゴリのFAQを表示する場合"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            空欄の場合はカスタムFAQ項目を使用
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="faq-max">最大表示件数</Label>
          <Input
            id="faq-max"
            type="number"
            min={1}
            max={20}
            {...register('maxItems', { valueAsNumber: true })}
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
    formState: { errors },
  } = useForm<CtaConfig>({
    resolver: zodResolver(ctaConfigSchema),
    defaultValues: config,
  })

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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cta-primary-text">メインボタンテキスト</Label>
            <Input
              id="cta-primary-text"
              {...register('ctaPrimary.text')}
              placeholder="予約する"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta-primary-url">メインボタンURL</Label>
            <Input
              id="cta-primary-url"
              {...register('ctaPrimary.url')}
              placeholder="/reservation"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cta-secondary-text">サブボタンテキスト（任意）</Label>
            <Input
              id="cta-secondary-text"
              {...register('ctaSecondary.text')}
              placeholder="お問い合わせ"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta-secondary-url">サブボタンURL（任意）</Label>
            <Input
              id="cta-secondary-url"
              {...register('ctaSecondary.url')}
              placeholder="/contact"
              disabled={isPending}
            />
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
  } = useForm<CustomConfig>({
    resolver: zodResolver(customConfigSchema),
    defaultValues: config,
  })

  const handleFormSubmit = (formData: CustomConfig) => {
    onSave(formData, editorContent)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="custom-class">追加CSSクラス（任意）</Label>
          <Input
            id="custom-class"
            {...register('containerClass')}
            placeholder="bg-muted py-12"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            セクションコンテナに追加するTailwindクラス
          </p>
        </div>

        <div className="space-y-2">
          <Label>コンテンツ</Label>
          <LexicalEditor
            content={content || ''}
            onChange={setEditorContent}
            placeholder="セクションのコンテンツを入力..."
            className={EDITOR_PROSE_CLASSES}
            minHeight="300px"
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
// Main Component
// =============================================================================

export function SectionEditor({ section, onBack, onSave }: SectionEditorProps) {
  const [isPending, startTransition] = useTransition()
  const label = sectionTypeLabels[section.type]

  const handleConfigSave = (config: Record<string, unknown>, content?: string) => {
    startTransition(async () => {
      const result = await updateHomepageSection(section.id, {
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

    // 型ガードでconfig検証、失敗時はデフォルト値を使用
    const getValidConfig = <T,>(
      validator: (c: unknown) => c is T,
      type: HomepageSectionType
    ): T => {
      if (validator(config)) return config
      return defaultSectionConfigs[type] as T
    }

    switch (section.type) {
      case HomepageSectionType.HERO:
        return (
          <HeroConfigForm
            config={getValidConfig(isHeroConfig, HomepageSectionType.HERO)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case HomepageSectionType.SPACE_LIST:
        return (
          <SpaceListConfigForm
            config={getValidConfig(isSpaceListConfig, HomepageSectionType.SPACE_LIST)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case HomepageSectionType.NEWS:
        return (
          <NewsConfigForm
            config={getValidConfig(isNewsConfig, HomepageSectionType.NEWS)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case HomepageSectionType.BLOG:
        return (
          <BlogConfigForm
            config={getValidConfig(isBlogConfig, HomepageSectionType.BLOG)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case HomepageSectionType.FAQ:
        return (
          <FaqConfigForm
            config={getValidConfig(isFaqConfig, HomepageSectionType.FAQ)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case HomepageSectionType.CTA:
        return (
          <CtaConfigForm
            config={getValidConfig(isCtaConfig, HomepageSectionType.CTA)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case HomepageSectionType.CUSTOM:
        return (
          <CustomConfigForm
            config={getValidConfig(isCustomConfig, HomepageSectionType.CUSTOM)}
            content={section.content}
            onSave={(c, content) => handleConfigSave(c, content)}
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
  title: z.string().max(100, 'タイトルは100文字以内です').optional(),
})

type TitleFormData = z.infer<typeof titleSchema>

function TitleForm({
  section,
  isPending,
  onSave,
}: {
  section: HomepageSectionData
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
      const result = await updateHomepageSection(section.id, {
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
