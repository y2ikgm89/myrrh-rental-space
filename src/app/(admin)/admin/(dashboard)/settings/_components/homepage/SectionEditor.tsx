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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui'
import { DesignPanel } from './DesignPanel'
import { ArrowLeft, Save, ImagePlus, Plus, Trash2, GripVertical } from 'lucide-react'
import { useSingleMediaPicker } from '@/admin/hooks/use-media-picker'
import {
  updateHomepageSection,
  type HomepageSectionData,
} from '@/admin/actions/homepage-settings'
import {
  SectionType,
  sectionTypeLabels,
  heroConfigSchema,
  heroParallaxConfigSchema,
  conceptConfigSchema,
  spaceShowcaseConfigSchema,
  featuresConfigSchema,
  spaceListConfigSchema,
  newsListConfigSchema,
  postListConfigSchema,
  faqListConfigSchema,
  ctaConfigSchema,
  customConfigSchema,
  instagramConfigSchema,
  testimonialConfigSchema,
  galleryConfigSchema,
  contactFormConfigSchema,
  mapConfigSchema,
  embedConfigSchema,
  getHeroConfig,
  getHeroParallaxConfig,
  getConceptConfig,
  getSpaceShowcaseConfig,
  getFeaturesConfig,
  getSpaceListConfig,
  getNewsListConfig,
  getPostListConfig,
  getFaqListConfig,
  getCtaConfig,
  getCustomConfig,
  getInstagramConfig,
  getTestimonialConfig,
  getGalleryConfig,
  getContactFormConfig,
  getMapConfig,
  getEmbedConfig,
  type HeroConfig,
  type HeroParallaxConfig,
  type ConceptConfig,
  type SpaceShowcaseConfig,
  type FeaturesConfig,
  type SpaceListConfig,
  type NewsListConfig,
  type PostListConfig,
  type FaqListConfig,
  type CtaConfig,
  type CustomConfig,
  type InstagramConfig,
  type TestimonialConfig,
  type GalleryConfig,
  type ContactFormConfig,
  type MapConfig,
  type EmbedConfig,
  type HeroConfigInput,
  type HeroParallaxConfigInput,
  type ConceptConfigInput,
  type SpaceShowcaseConfigInput,
  type FeaturesConfigInput,
  type SpaceListConfigInput,
  type NewsListConfigInput,
  type PostListConfigInput,
  type FaqListConfigInput,
  type CtaConfigInput,
  type CustomConfigInput,
  type InstagramConfigInput,
  type TestimonialConfigInput,
  type GalleryConfigInput,
  type ContactFormConfigInput,
  type MapConfigInput,
  type EmbedConfigInput,
  type CTAButtonItem,
  parseContentPosition,
  parseHeroParallaxHeight,
  parseOverlayStyle,
  parseConceptLayout,
  parseImageAspect,
  parseCardStyle,
  parseShowcaseImageAspect,
  parseFeaturesLayout,
  parseGapSize,
  parseSpaceImageAspect,
  parseContainerWidth,
  parseFaqInitialOpen,
  parsePostImageAspect,
  parseHeroVariant,
  parseHeroHeight,
  parseCtaVariant,
  parseTestimonialVariant,
  parseTestimonialLayout,
  parseGalleryLayout,
  parseGalleryImageAspect,
  parseGalleryGap,
  parseGalleryHoverEffect,
  parseContactFormVariant,
  parseBorderRadius,
  parseMapHeight,
  parseEmbedAspectRatio,
  parseMaxWidth,
  parseFaqVariant,
  parseSpaceLayout,
  parseNewsLayout,
  parsePostLayout,
} from '@/admin/lib/validations/homepage-section'
import {
  contentPositionLabels,
  heroParallaxHeightLabels,
  overlayStyleLabels,
  conceptLayoutLabels,
  imageAspectLabels,
  cardStyleLabels,
  featuresLayoutLabels,
  gapSizeLabels,
  containerWidthLabels,
  faqInitialOpenLabels,
  heroVariantLabels,
  heroHeightLabels,
  showcaseImageAspectLabels,
  spaceImageAspectLabels,
  postImageAspectLabels,
  testimonialVariantLabels,
  testimonialLayoutLabels,
  galleryLayoutLabels,
  galleryImageAspectLabels,
  galleryGapLabels,
  galleryHoverEffectLabels,
  contactFormVariantLabels,
  borderRadiusLabels,
  mapHeightLabels,
  embedAspectRatioLabels,
  maxWidthLabels,
  ctaVariantLabels,
  spaceLayoutLabels,
  newsLayoutLabels,
  postLayoutLabels,
  faqVariantLabels,
} from '@/shared/lib/validations/section-options'
import { keysOf } from '@/shared/lib/serialize'
import { CTAButtonEditor } from '@/shared/components/cta-button-editor'
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

interface SectionEditorProps {
  section: HomepageSectionData
  onBack: () => void
  onSave: () => void
  /** false にするとエディタ内蔵ヘッダーを非表示（専用ページで使用） */
  showHeader?: boolean
}

// =============================================================================
// Hero Parallax Config Form
// =============================================================================

function HeroParallaxConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: HeroParallaxConfig
  onSave: (config: HeroParallaxConfig) => void
  isPending: boolean
}) {
  const [buttons, setButtons] = useState<CTAButtonItem[]>(config.buttons)

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<HeroParallaxConfigInput, unknown, HeroParallaxConfig>({
    resolver: zodResolver(heroParallaxConfigSchema),
    defaultValues: config,
  })

  const backgroundImageUrl = useWatch({ control, name: 'backgroundImageUrl' })

  const bgPicker = useSingleMediaPicker({
    defaultUsage: 'GENERAL',
    onSelect: (media) => {
      const selected = media[0]
      if (selected) {
        setValue('backgroundImageUrl', selected.url)
      }
    },
  })

  const handleButtonsChange = (newButtons: CTAButtonItem[]) => {
    setButtons(newButtons)
    setValue('buttons', newButtons)
  }

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="hero-parallax-tagline">タグライン</Label>
          <Input
            id="hero-parallax-tagline"
            {...register('tagline')}
            placeholder="Luxury Rental Space"
            disabled={isPending}
          />
          {errors.tagline && (
            <p className="text-sm text-destructive">{errors.tagline.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-parallax-title">タイトル</Label>
          <Input
            id="hero-parallax-title"
            {...register('title')}
            placeholder="洗練された空間で 特別なひとときを"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-parallax-subtitle">サブタイトル</Label>
          <Textarea
            id="hero-parallax-subtitle"
            {...register('subtitle')}
            placeholder="厳選されたレンタルスペースが、あなたの大切な瞬間を彩ります。"
            rows={2}
            disabled={isPending}
          />
          {errors.subtitle && (
            <p className="text-sm text-destructive">{errors.subtitle.message}</p>
          )}
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

        <div className="space-y-2">
          <Label>ボタン</Label>
          <CTAButtonEditor
            buttons={buttons}
            onChange={handleButtonsChange}
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="hero-parallax-position">コンテンツ配置</Label>
            <Select
              defaultValue={config.contentPosition}
              onValueChange={(v) => setValue('contentPosition', parseContentPosition(v))}
              disabled={isPending}
            >
              <SelectTrigger id="hero-parallax-position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(contentPositionLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {contentPositionLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hero-parallax-height">セクション高さ</Label>
            <Select
              defaultValue={config.height}
              onValueChange={(v) => setValue('height', parseHeroParallaxHeight(v))}
              disabled={isPending}
            >
              <SelectTrigger id="hero-parallax-height">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(heroParallaxHeightLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {heroParallaxHeightLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hero-parallax-overlay-style">オーバーレイスタイル</Label>
            <Select
              defaultValue={config.overlayStyle}
              onValueChange={(v) => setValue('overlayStyle', parseOverlayStyle(v))}
              disabled={isPending}
            >
              <SelectTrigger id="hero-parallax-overlay-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(overlayStyleLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {overlayStyleLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-parallax-speed">パララックス速度</Label>
          <Input
            id="hero-parallax-speed"
            type="number"
            step={0.1}
            min={0}
            max={1}
            {...register('parallaxSpeed', { valueAsNumber: true })}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            0（効果なし）〜 1（最大）
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="hero-parallax-overlay"
            {...register('overlayGradient')}
            disabled={isPending}
          />
          <Label htmlFor="hero-parallax-overlay">オーバーレイグラデーション</Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="hero-parallax-scroll"
            {...register('scrollIndicator')}
            disabled={isPending}
          />
          <Label htmlFor="hero-parallax-scroll">スクロールインジケーター</Label>
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
// Concept Config Form
// =============================================================================

function ConceptConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: ConceptConfig
  onSave: (config: ConceptConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<ConceptConfigInput, unknown, ConceptConfig>({
    resolver: zodResolver(conceptConfigSchema),
    defaultValues: config,
  })

  const imageUrl = useWatch({ control, name: 'imageUrl' })
  const imagePosition = useWatch({ control, name: 'imagePosition' })
  const textAlign = useWatch({ control, name: 'textAlign' })

  const imgPicker = useSingleMediaPicker({
    defaultUsage: 'GENERAL',
    onSelect: (media) => {
      const selected = media[0]
      if (selected) {
        setValue('imageUrl', selected.url)
      }
    },
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="concept-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="concept-section-label"
            {...register('sectionLabel')}
            placeholder="Our Philosophy"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="concept-heading">見出し</Label>
          <Input
            id="concept-heading"
            {...register('heading')}
            placeholder="空間が、体験を変える"
            disabled={isPending}
          />
          {errors.heading && (
            <p className="text-sm text-destructive">{errors.heading.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="concept-body">本文</Label>
          <Textarea
            id="concept-body"
            {...register('body')}
            placeholder="コンセプトの本文を入力..."
            rows={5}
            disabled={isPending}
          />
          {errors.body && (
            <p className="text-sm text-destructive">{errors.body.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>画像（任意）</Label>
          <div className="flex items-start gap-3">
            {imageUrl ? (
              <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg border">
                <Image
                  src={imageUrl}
                  alt="コンセプト画像"
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
                onClick={() => imgPicker.openPicker()}
                disabled={isPending}
              >
                <ImagePlus className="mr-1 h-3 w-3" />
                画像を選択
              </Button>
              {imageUrl && (
                <>
                  <p className="truncate text-xs text-muted-foreground">
                    {imageUrl}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setValue('imageUrl', '')}
                    disabled={isPending}
                  >
                    削除
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>画像位置</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="left"
                checked={imagePosition === 'left'}
                onChange={() => setValue('imagePosition', 'left')}
                disabled={isPending}
              />
              左
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="right"
                checked={imagePosition === 'right'}
                onChange={() => setValue('imagePosition', 'right')}
                disabled={isPending}
              />
              右
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>テキスト配置</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="left"
                checked={textAlign === 'left'}
                onChange={() => setValue('textAlign', 'left')}
                disabled={isPending}
              />
              左寄せ
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="center"
                checked={textAlign === 'center'}
                onChange={() => setValue('textAlign', 'center')}
                disabled={isPending}
              />
              中央
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="right"
                checked={textAlign === 'right'}
                onChange={() => setValue('textAlign', 'right')}
                disabled={isPending}
              />
              右寄せ
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="concept-layout">レイアウト</Label>
            <Select
              defaultValue={config.layout}
              onValueChange={(v) => setValue('layout', parseConceptLayout(v))}
              disabled={isPending}
            >
              <SelectTrigger id="concept-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(conceptLayoutLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {conceptLayoutLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="concept-image-aspect">画像アスペクト比</Label>
            <Select
              defaultValue={config.imageAspect}
              onValueChange={(v) => setValue('imageAspect', parseImageAspect(v))}
              disabled={isPending}
            >
              <SelectTrigger id="concept-image-aspect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(imageAspectLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {imageAspectLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>

      {/* メディアピッカーダイアログ */}
      <imgPicker.MediaPicker />
    </form>
  )
}

// =============================================================================
// Space Showcase Config Form
// =============================================================================

function SpaceShowcaseConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: SpaceShowcaseConfig
  onSave: (config: SpaceShowcaseConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SpaceShowcaseConfigInput, unknown, SpaceShowcaseConfig>({
    resolver: zodResolver(spaceShowcaseConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="showcase-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="showcase-section-label"
            {...register('sectionLabel')}
            placeholder="Spaces"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="showcase-title">タイトル</Label>
          <Input
            id="showcase-title"
            {...register('title')}
            placeholder="Our Spaces"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="showcase-max">最大表示件数</Label>
          <Input
            id="showcase-max"
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
            id="showcase-published"
            {...register('showOnlyPublished')}
            disabled={isPending}
          />
          <Label htmlFor="showcase-published">公開済みスペースのみ表示</Label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="showcase-columns">カラム数</Label>
            <Input
              id="showcase-columns"
              type="number"
              min={2}
              max={4}
              {...register('columns', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="showcase-card-style">カードスタイル</Label>
            <Select
              defaultValue={config.cardStyle}
              onValueChange={(v) => setValue('cardStyle', parseCardStyle(v))}
              disabled={isPending}
            >
              <SelectTrigger id="showcase-card-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(cardStyleLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {cardStyleLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="showcase-image-aspect">画像アスペクト比</Label>
            <Select
              defaultValue={config.imageAspect}
              onValueChange={(v) => setValue('imageAspect', parseShowcaseImageAspect(v))}
              disabled={isPending}
            >
              <SelectTrigger id="showcase-image-aspect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(showcaseImageAspectLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {showcaseImageAspectLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
// Features Config Form
// =============================================================================

const featureIconOptions = [
  { value: 'clock', label: '時計' },
  { value: 'shield', label: 'シールド' },
  { value: 'sparkles', label: 'スパークル' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'star', label: 'スター' },
  { value: 'heart', label: 'ハート' },
  { value: 'zap', label: '電撃' },
  { value: 'check', label: 'チェック' },
] as const

function FeaturesConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: FeaturesConfig
  onSave: (config: FeaturesConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<FeaturesConfigInput, unknown, FeaturesConfig>({
    resolver: zodResolver(featuresConfigSchema),
    defaultValues: config,
  })

  const items = useWatch({ control, name: 'items' }) ?? []

  const addItem = () => {
    const newItems = [...items, { icon: 'sparkles', title: '', description: '' }]
    setValue('items', newItems)
  }

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index)
    setValue('items', newItems)
  }

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="features-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="features-section-label"
            {...register('sectionLabel')}
            placeholder="Features"
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
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>特徴アイテム</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              disabled={isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              追加
            </Button>
          </div>

          {items.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
              アイテムがありません。「追加」ボタンで特徴を追加してください。
            </p>
          )}

          {items.map((item, index) => (
            <div
              key={index}
              className="rounded-lg border p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">アイテム {index + 1}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(index)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label>アイコン</Label>
                <Select
                  value={item.icon ?? 'sparkles'}
                  onValueChange={(val) => {
                    const newItems = [...items]
                    const current = newItems[index]
                    if (current) {
                      newItems[index] = { ...current, icon: val }
                      setValue('items', newItems)
                    }
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {featureIconOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>タイトル</Label>
                <Input
                  {...register(`items.${index}.title`)}
                  placeholder="特徴のタイトル"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label>説明</Label>
                <Textarea
                  {...register(`items.${index}.description`)}
                  placeholder="特徴の説明"
                  rows={2}
                  disabled={isPending}
                />
              </div>
            </div>
          ))}
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
  const [buttons, setButtons] = useState<CTAButtonItem[]>(config.buttons)

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
  const variant = useWatch({ control, name: 'variant' })
  const overlay = useWatch({ control, name: 'overlay' })

  const bgPicker = useSingleMediaPicker({
    defaultUsage: 'GENERAL',
    onSelect: (media) => {
      const selected = media[0]
      if (selected) {
        setValue('backgroundImageUrl', selected.url)
      }
    },
  })

  const handleButtonsChange = (newButtons: CTAButtonItem[]) => {
    setButtons(newButtons)
    setValue('buttons', newButtons)
  }

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
            <Label htmlFor="hero-variant">バリエーション</Label>
            <Select
              defaultValue={config.variant}
              onValueChange={(v) => setValue('variant', parseHeroVariant(v))}
              disabled={isPending}
            >
              <SelectTrigger id="hero-variant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(heroVariantLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {heroVariantLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                {keysOf(heroHeightLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {heroHeightLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="hero-overlay"
            checked={overlay}
            onCheckedChange={(checked) => setValue('overlay', checked)}
            disabled={isPending}
          />
          <Label htmlFor="hero-overlay">オーバーレイ</Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-overlay-opacity">オーバーレイ不透明度（%）</Label>
          <Input
            id="hero-overlay-opacity"
            type="number"
            min={0}
            max={100}
            {...register('overlayOpacity', { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        {variant === 'video' && (
          <div className="space-y-2">
            <Label htmlFor="hero-video-url">動画URL</Label>
            <Input
              id="hero-video-url"
              {...register('videoUrl')}
              placeholder="https://example.com/video.mp4"
              disabled={isPending}
            />
          </div>
        )}

        {variant === 'parallax' && (
          <div className="space-y-2">
            <Label htmlFor="hero-parallax-speed-inline">パララックス速度</Label>
            <Input
              id="hero-parallax-speed-inline"
              type="number"
              step={0.1}
              min={0}
              max={1}
              {...register('parallaxSpeed', { valueAsNumber: true })}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              0（効果なし）〜 1（最大）
            </p>
          </div>
        )}

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
    setValue,
    control,
    formState: { errors },
  } = useForm<SpaceListConfigInput, unknown, SpaceListConfig>({
    resolver: zodResolver(spaceListConfigSchema),
    defaultValues: config,
  })

  const showViewAllLink = useWatch({ control, name: 'showViewAllLink' })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="space-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="space-section-label"
            {...register('sectionLabel')}
            placeholder="例: Spaces"
            disabled={isPending}
          />
        </div>

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

        <div className="flex items-center gap-2">
          <Switch
            id="space-view-all"
            checked={showViewAllLink}
            onCheckedChange={(checked) => setValue('showViewAllLink', checked)}
            disabled={isPending}
          />
          <Label htmlFor="space-view-all">「すべて見る」リンクを表示</Label>
        </div>

        {showViewAllLink && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="space-view-all-text">「全て見る」テキスト</Label>
              <Input
                id="space-view-all-text"
                {...register('viewAllText')}
                placeholder="全てのスペースを見る"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="space-view-all-url">「全て見る」リンク先</Label>
              <Input
                id="space-view-all-url"
                {...register('viewAllUrl')}
                placeholder="/spaces"
                disabled={isPending}
              />
            </div>
          </div>
        )}

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
              {keysOf(spaceLayoutLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {spaceLayoutLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="space-card-style">カードスタイル</Label>
            <Select
              defaultValue={config.cardStyle}
              onValueChange={(v) => setValue('cardStyle', parseCardStyle(v))}
              disabled={isPending}
            >
              <SelectTrigger id="space-card-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(cardStyleLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {cardStyleLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-image-aspect">画像アスペクト比</Label>
            <Select
              defaultValue={config.imageAspect}
              onValueChange={(v) => setValue('imageAspect', parseSpaceImageAspect(v))}
              disabled={isPending}
            >
              <SelectTrigger id="space-image-aspect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(spaceImageAspectLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {spaceImageAspectLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
// News Config Form
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
    control,
    formState: { errors },
  } = useForm<NewsListConfigInput, unknown, NewsListConfig>({
    resolver: zodResolver(newsListConfigSchema),
    defaultValues: config,
  })

  const showViewAllLink = useWatch({ control, name: 'showViewAllLink' })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="news-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="news-section-label"
            {...register('sectionLabel')}
            placeholder="例: News"
            disabled={isPending}
          />
        </div>

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
              {keysOf(newsLayoutLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {newsLayoutLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="news-columns">カラム数（カードレイアウト時）</Label>
          <Input
            id="news-columns"
            type="number"
            min={2}
            max={4}
            {...register('columns', { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="news-view-all"
            checked={showViewAllLink}
            onCheckedChange={(checked) => setValue('showViewAllLink', checked)}
            disabled={isPending}
          />
          <Label htmlFor="news-view-all">「すべて見る」リンクを表示</Label>
        </div>

        {showViewAllLink && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="news-view-all-text">「全て見る」テキスト</Label>
              <Input
                id="news-view-all-text"
                {...register('viewAllText')}
                placeholder="全てのお知らせ"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="news-view-all-url">「全て見る」リンク先</Label>
              <Input
                id="news-view-all-url"
                {...register('viewAllUrl')}
                placeholder="/news"
                disabled={isPending}
              />
            </div>
          </div>
        )}
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  )
}

// =============================================================================
// Posts Config Form
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
    control,
    formState: { errors },
  } = useForm<PostListConfigInput, unknown, PostListConfig>({
    resolver: zodResolver(postListConfigSchema),
    defaultValues: config,
  })

  const showViewAllLink = useWatch({ control, name: 'showViewAllLink' })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="posts-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="posts-section-label"
            {...register('sectionLabel')}
            placeholder="例: Blog"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="posts-title">セクションタイトル</Label>
          <Input
            id="posts-title"
            {...register('title')}
            placeholder="最新の記事"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="posts-max">表示件数</Label>
          <Input
            id="posts-max"
            type="number"
            min={1}
            max={20}
            {...register('maxItems', { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="posts-layout">レイアウト</Label>
          <Select
            defaultValue={config.layout}
            onValueChange={(v) => setValue('layout', parsePostLayout(v))}
            disabled={isPending}
          >
            <SelectTrigger id="posts-layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(postLayoutLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {postLayoutLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="posts-columns">カラム数</Label>
          <Input
            id="posts-columns"
            type="number"
            min={1}
            max={4}
            {...register('columns', { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="posts-image-aspect">画像アスペクト比</Label>
          <Select
            defaultValue={config.imageAspect}
            onValueChange={(v) => setValue('imageAspect', parsePostImageAspect(v))}
            disabled={isPending}
          >
            <SelectTrigger id="posts-image-aspect">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(postImageAspectLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {postImageAspectLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="posts-view-all"
            checked={showViewAllLink}
            onCheckedChange={(checked) => setValue('showViewAllLink', checked)}
            disabled={isPending}
          />
          <Label htmlFor="posts-view-all">「すべて見る」リンクを表示</Label>
        </div>

        {showViewAllLink && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="posts-view-all-text">「全て見る」テキスト</Label>
              <Input
                id="posts-view-all-text"
                {...register('viewAllText')}
                placeholder="全ての記事"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="posts-view-all-url">「全て見る」リンク先</Label>
              <Input
                id="posts-view-all-url"
                {...register('viewAllUrl')}
                placeholder="/posts"
                disabled={isPending}
              />
            </div>
          </div>
        )}
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
    control,
    formState: { errors },
  } = useForm<FaqListConfigInput, unknown, FaqListConfig>({
    resolver: zodResolver(faqListConfigSchema),
    defaultValues: config,
  })

  const showViewAllLink = useWatch({ control, name: 'showViewAllLink' })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="faq-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="faq-section-label"
            {...register('sectionLabel')}
            placeholder="例: FAQ"
            disabled={isPending}
          />
        </div>

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
            max={50}
            {...register('maxItems', { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="faq-variant">バリエーション</Label>
          <Select
            defaultValue={config.variant}
            onValueChange={(v) => setValue('variant', parseFaqVariant(v))}
            disabled={isPending}
          >
            <SelectTrigger id="faq-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(faqVariantLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {faqVariantLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="faq-container-width">コンテナ幅</Label>
            <Select
              defaultValue={config.containerWidth}
              onValueChange={(v) => setValue('containerWidth', parseContainerWidth(v))}
              disabled={isPending}
            >
              <SelectTrigger id="faq-container-width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(containerWidthLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {containerWidthLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="faq-initial-open">初期開閉状態</Label>
            <Select
              defaultValue={config.initialOpen}
              onValueChange={(v) => setValue('initialOpen', parseFaqInitialOpen(v))}
              disabled={isPending}
            >
              <SelectTrigger id="faq-initial-open">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(faqInitialOpenLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {faqInitialOpenLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="faq-view-all"
            checked={showViewAllLink}
            onCheckedChange={(checked) => setValue('showViewAllLink', checked)}
            disabled={isPending}
          />
          <Label htmlFor="faq-view-all">「すべて見る」リンクを表示</Label>
        </div>

        {showViewAllLink && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="faq-view-all-text">「全て見る」テキスト</Label>
              <Input
                id="faq-view-all-text"
                {...register('viewAllText')}
                placeholder="全てのFAQ"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="faq-view-all-url">「全て見る」リンク先</Label>
              <Input
                id="faq-view-all-url"
                {...register('viewAllUrl')}
                placeholder="/faq"
                disabled={isPending}
              />
            </div>
          </div>
        )}
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
  const [buttons, setButtons] = useState<CTAButtonItem[]>(config.buttons)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CtaConfigInput, unknown, CtaConfig>({
    resolver: zodResolver(ctaConfigSchema),
    defaultValues: config,
  })

  const handleButtonsChange = (newButtons: CTAButtonItem[]) => {
    setButtons(newButtons)
    setValue('buttons', newButtons)
  }

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cta-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="cta-section-label"
            {...register('sectionLabel')}
            placeholder="例: Ready to Begin?"
            disabled={isPending}
          />
        </div>

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
              {keysOf(ctaVariantLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {ctaVariantLabels[key]}
                </SelectItem>
              ))}
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
        <div className="space-y-2">
          <Label htmlFor="custom-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="custom-section-label"
            {...register('sectionLabel')}
            placeholder="例: Contents"
            disabled={isPending}
          />
        </div>

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
            height="300px"
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
// Instagram Config Form
// =============================================================================

function InstagramConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: InstagramConfig
  onSave: (config: InstagramConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<InstagramConfigInput, unknown, InstagramConfig>({
    resolver: zodResolver(instagramConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="instagram-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="instagram-section-label"
            {...register('sectionLabel')}
            placeholder="例: Follow Us"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="instagram-title">セクションタイトル</Label>
          <Input
            id="instagram-title"
            {...register('title')}
            placeholder="Instagram"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="instagram-columns">カラム数</Label>
            <Input
              id="instagram-columns"
              type="number"
              min={3}
              max={6}
              {...register('columns', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instagram-count">表示件数</Label>
            <Input
              id="instagram-count"
              type="number"
              min={6}
              max={12}
              {...register('count', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instagram-gap">ギャップ</Label>
            <Select
              defaultValue={config.gap}
              onValueChange={(v) => setValue('gap', parseGapSize(v))}
              disabled={isPending}
            >
              <SelectTrigger id="instagram-gap">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(gapSizeLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {gapSizeLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
// Testimonial Config Form
// =============================================================================

function TestimonialConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: TestimonialConfig
  onSave: (config: TestimonialConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<TestimonialConfigInput, unknown, TestimonialConfig>({
    resolver: zodResolver(testimonialConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="testimonial-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="testimonial-section-label"
            {...register('sectionLabel')}
            placeholder="Testimonials"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="testimonial-title">タイトル</Label>
          <Input
            id="testimonial-title"
            {...register('title')}
            placeholder="お客様の声"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="testimonial-variant">バリエーション</Label>
            <Select
              defaultValue={config.variant}
              onValueChange={(v) => setValue('variant', parseTestimonialVariant(v))}
              disabled={isPending}
            >
              <SelectTrigger id="testimonial-variant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(testimonialVariantLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {testimonialVariantLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="testimonial-layout">レイアウト</Label>
            <Select
              defaultValue={config.layout}
              onValueChange={(v) => setValue('layout', parseTestimonialLayout(v))}
              disabled={isPending}
            >
              <SelectTrigger id="testimonial-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(testimonialLayoutLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {testimonialLayoutLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
// Gallery Config Form
// =============================================================================

function GalleryConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: GalleryConfig
  onSave: (config: GalleryConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<GalleryConfigInput, unknown, GalleryConfig>({
    resolver: zodResolver(galleryConfigSchema),
    defaultValues: config,
  })

  const enableLightbox = useWatch({ control, name: 'enableLightbox' })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gallery-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="gallery-section-label"
            {...register('sectionLabel')}
            placeholder="Gallery"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gallery-title">タイトル</Label>
          <Input
            id="gallery-title"
            {...register('title')}
            placeholder="ギャラリー"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gallery-layout">レイアウト</Label>
            <Select
              defaultValue={config.layout}
              onValueChange={(v) => setValue('layout', parseGalleryLayout(v))}
              disabled={isPending}
            >
              <SelectTrigger id="gallery-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(galleryLayoutLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {galleryLayoutLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gallery-columns">カラム数</Label>
            <Input
              id="gallery-columns"
              type="number"
              min={1}
              max={6}
              {...register('columns', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gallery-gap">ギャップ</Label>
            <Select
              defaultValue={config.gap}
              onValueChange={(v) => setValue('gap', parseGalleryGap(v))}
              disabled={isPending}
            >
              <SelectTrigger id="gallery-gap">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(galleryGapLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {galleryGapLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gallery-image-aspect">画像アスペクト比</Label>
            <Select
              defaultValue={config.imageAspect}
              onValueChange={(v) => setValue('imageAspect', parseGalleryImageAspect(v))}
              disabled={isPending}
            >
              <SelectTrigger id="gallery-image-aspect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(galleryImageAspectLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {galleryImageAspectLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gallery-hover-effect">ホバーエフェクト</Label>
          <Select
            defaultValue={config.hoverEffect}
            onValueChange={(v) => setValue('hoverEffect', parseGalleryHoverEffect(v))}
            disabled={isPending}
          >
            <SelectTrigger id="gallery-hover-effect">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(galleryHoverEffectLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {galleryHoverEffectLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="gallery-lightbox"
            checked={enableLightbox}
            onCheckedChange={(checked) => setValue('enableLightbox', checked)}
            disabled={isPending}
          />
          <Label htmlFor="gallery-lightbox">ライトボックスを有効化</Label>
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
    control,
    formState: { errors },
  } = useForm<ContactFormConfigInput, unknown, ContactFormConfig>({
    resolver: zodResolver(contactFormConfigSchema),
    defaultValues: config,
  })

  const showNameField = useWatch({ control, name: 'showNameField' })
  const showPhoneField = useWatch({ control, name: 'showPhoneField' })
  const showSubjectField = useWatch({ control, name: 'showSubjectField' })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="contact-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="contact-section-label"
            {...register('sectionLabel')}
            placeholder="Contact"
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
          <Label htmlFor="contact-variant">バリエーション</Label>
          <Select
            defaultValue={config.variant}
            onValueChange={(v) => setValue('variant', parseContactFormVariant(v))}
            disabled={isPending}
          >
            <SelectTrigger id="contact-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(contactFormVariantLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {contactFormVariantLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-submit-text">送信ボタンテキスト</Label>
          <Input
            id="contact-submit-text"
            {...register('submitButtonText')}
            placeholder="送信する"
            disabled={isPending}
          />
        </div>

        <div className="space-y-3">
          <Label>表示フィールド</Label>
          <div className="flex items-center gap-2">
            <Switch
              id="contact-show-name"
              checked={showNameField}
              onCheckedChange={(checked) => setValue('showNameField', checked)}
              disabled={isPending}
            />
            <Label htmlFor="contact-show-name">名前フィールドを表示</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="contact-show-phone"
              checked={showPhoneField}
              onCheckedChange={(checked) => setValue('showPhoneField', checked)}
              disabled={isPending}
            />
            <Label htmlFor="contact-show-phone">電話番号フィールドを表示</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="contact-show-subject"
              checked={showSubjectField}
              onCheckedChange={(checked) => setValue('showSubjectField', checked)}
              disabled={isPending}
            />
            <Label htmlFor="contact-show-subject">件名フィールドを表示</Label>
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
// Map Config Form
// =============================================================================

function MapConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: MapConfig
  onSave: (config: MapConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<MapConfigInput, unknown, MapConfig>({
    resolver: zodResolver(mapConfigSchema),
    defaultValues: config,
  })

  const showAddressBelow = useWatch({ control, name: 'showAddressBelow' })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="map-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="map-section-label"
            {...register('sectionLabel')}
            placeholder="Location"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="map-title">タイトル</Label>
          <Input
            id="map-title"
            {...register('title')}
            placeholder="アクセス"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="map-address">住所</Label>
          <Input
            id="map-address"
            {...register('address')}
            placeholder="東京都渋谷区..."
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="map-latitude">緯度</Label>
            <Input
              id="map-latitude"
              type="number"
              step={0.000001}
              {...register('latitude', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="map-longitude">経度</Label>
            <Input
              id="map-longitude"
              type="number"
              step={0.000001}
              {...register('longitude', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="map-zoom">ズームレベル</Label>
            <Input
              id="map-zoom"
              type="number"
              min={1}
              max={20}
              {...register('zoom', { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="map-height">高さ</Label>
            <Select
              defaultValue={config.height}
              onValueChange={(v) => setValue('height', parseMapHeight(v))}
              disabled={isPending}
            >
              <SelectTrigger id="map-height">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(mapHeightLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {mapHeightLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="map-border-radius">角丸</Label>
            <Select
              defaultValue={config.borderRadius}
              onValueChange={(v) => setValue('borderRadius', parseBorderRadius(v))}
              disabled={isPending}
            >
              <SelectTrigger id="map-border-radius">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(borderRadiusLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {borderRadiusLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="map-show-address"
            checked={showAddressBelow}
            onCheckedChange={(checked) => setValue('showAddressBelow', checked)}
            disabled={isPending}
          />
          <Label htmlFor="map-show-address">住所を地図の下に表示</Label>
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
// Embed Config Form
// =============================================================================

function EmbedConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: EmbedConfig
  onSave: (config: EmbedConfig) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<EmbedConfigInput, unknown, EmbedConfig>({
    resolver: zodResolver(embedConfigSchema),
    defaultValues: config,
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="embed-section-label">セクションラベル（英語装飾）</Label>
          <Input
            id="embed-section-label"
            {...register('sectionLabel')}
            placeholder="Media"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-title">タイトル</Label>
          <Input
            id="embed-title"
            {...register('title')}
            placeholder="動画"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-url">埋め込みURL</Label>
          <Input
            id="embed-url"
            type="url"
            {...register('embedUrl')}
            placeholder="https://www.youtube.com/embed/..."
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="embed-aspect-ratio">アスペクト比</Label>
            <Select
              defaultValue={config.aspectRatio}
              onValueChange={(v) => setValue('aspectRatio', parseEmbedAspectRatio(v))}
              disabled={isPending}
            >
              <SelectTrigger id="embed-aspect-ratio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(embedAspectRatioLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {embedAspectRatioLabels[key]}
                  </SelectItem>
                ))}
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
                {keysOf(maxWidthLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {maxWidthLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="embed-border-radius">角丸</Label>
            <Select
              defaultValue={config.borderRadius}
              onValueChange={(v) => setValue('borderRadius', parseBorderRadius(v))}
              disabled={isPending}
            >
              <SelectTrigger id="embed-border-radius">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(borderRadiusLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {borderRadiusLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
// Main Component
// =============================================================================

export function SectionEditor({ section, onBack, onSave, showHeader = true }: SectionEditorProps) {
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

    switch (section.type) {
      case SectionType.HERO:
        return (
          <HeroConfigForm
            config={getHeroConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.HERO_PARALLAX:
        return (
          <HeroParallaxConfigForm
            config={getHeroParallaxConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.CONCEPT:
        return (
          <ConceptConfigForm
            config={getConceptConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.SPACE_SHOWCASE:
        return (
          <SpaceShowcaseConfigForm
            config={getSpaceShowcaseConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.FEATURES:
        return (
          <FeaturesConfigForm
            config={getFeaturesConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.SPACE_LIST:
        return (
          <SpaceListConfigForm
            config={getSpaceListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.NEWS_LIST:
        return (
          <NewsListConfigForm
            config={getNewsListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.POST_LIST:
        return (
          <PostListConfigForm
            config={getPostListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.FAQ_LIST:
        return (
          <FaqListConfigForm
            config={getFaqListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.CTA:
        return (
          <CtaConfigForm
            config={getCtaConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.CUSTOM:
        return (
          <CustomConfigForm
            config={getCustomConfig(config)}
            content={section.content}
            onSave={(c, content) => handleConfigSave(c, content)}
            isPending={isPending}
          />
        )
      case SectionType.INSTAGRAM:
        return (
          <InstagramConfigForm
            config={getInstagramConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.TESTIMONIAL:
        return (
          <TestimonialConfigForm
            config={getTestimonialConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.GALLERY:
        return (
          <GalleryConfigForm
            config={getGalleryConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.CONTACT_FORM:
        return (
          <ContactFormConfigForm
            config={getContactFormConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.MAP:
        return (
          <MapConfigForm
            config={getMapConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        )
      case SectionType.EMBED:
        return (
          <EmbedConfigForm
            config={getEmbedConfig(config)}
            onSave={(c) => handleConfigSave(c)}
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
      {showHeader && (
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
      )}

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

      {/* Content & Design Tabs */}
      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">コンテンツ</TabsTrigger>
          <TabsTrigger value="design">デザイン</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle>セクション設定</CardTitle>
              <CardDescription>{label}固有の設定</CardDescription>
            </CardHeader>
            <CardContent>{renderConfigForm()}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="design">
          <Card>
            <CardHeader>
              <CardTitle>デザイン設定</CardTitle>
              <CardDescription>余白・背景・テキストスタイリング・レイアウト</CardDescription>
            </CardHeader>
            <CardContent>
              <DesignPanel section={section} onSave={onSave} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
