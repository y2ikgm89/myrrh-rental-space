/**
 * ページコンテンツタイプ設定
 *
 * PageInlineEditorで使用する完全な設定
 * - フォームスキーマ
 * - Server Actions
 * - データ変換
 * - サイドパネル設定
 */

import { z } from 'zod'
import { format } from 'date-fns'
import { updatePage } from '@/admin/actions/page'
import { isValidLayoutWidth, type LayoutWidth } from '@/shared/lib/validations/enums'
import type { PageData } from '@/admin/lib/validations/page'
import type { PagePreviewData } from '@/shared/types'
import type { ContentTypeConfig } from './types'
import {
  TitleSlugFields,
  SEOFields,
  OGPFields,
  UnifiedPublishFields,
  LayoutFields,
} from '../side-panel'

// =============================================================================
// Types
// =============================================================================

/** Page用フォームデータ型 */
type PageFormData = {
  title: string
  description: string
  content: string
  metaDescription: string
  metaKeywords: string
  ogpTitle: string
  ogpDescription: string
  ogpImageUrl: string
  isPublished: boolean
  publishedAt: string
  contentWidth: string
  contentWidthCustom: string
  showSidebar: boolean | null
}

/** Page用送信ペイロード型 */
type PageSubmitPayload = {
  title: string
  description?: string
  content: string
  metaDescription?: string
  metaKeywords?: string
  ogpTitle?: string
  ogpDescription?: string
  ogpImageUrl?: string
  isPublished: boolean
  publishedAt?: Date
  contentWidth?: LayoutWidth
  contentWidthCustom?: number
  showSidebar?: boolean | null
}

// =============================================================================
// Schema
// =============================================================================

const pageFormSchema = z.object({
  title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内です' }),
  description: z.string().max(500, { error: '説明は500文字以内です' }).default(''),
  content: z.string().min(1, { error: 'コンテンツは必須です' }).max(500000, { error: 'コンテンツは500,000文字以内です' }),
  metaDescription: z.string().max(160, { error: 'メタディスクリプションは160文字以内です' }).default(''),
  metaKeywords: z.string().max(200, { error: 'メタキーワードは200文字以内です' }).default(''),
  ogpTitle: z.string().max(100, { error: 'OGPタイトルは100文字以内です' }).default(''),
  ogpDescription: z.string().max(200, { error: 'OGP説明は200文字以内です' }).default(''),
  ogpImageUrl: z.union([z.string().url({ error: '有効なURLを入力してください' }), z.literal('')]).default(''),
  isPublished: z.boolean(),
  publishedAt: z.string().default(''),
  contentWidth: z.string().default(''),
  contentWidthCustom: z.string().default(''),
  showSidebar: z.boolean().nullable(),
})

// =============================================================================
// Transforms
// =============================================================================

/** DBデータ → フォームデータ */
function toFormData(data?: PageData): PageFormData {
  if (!data) {
    return {
      title: '',
      description: '',
      content: '',
      metaDescription: '',
      metaKeywords: '',
      ogpTitle: '',
      ogpDescription: '',
      ogpImageUrl: '',
      isPublished: false,
      publishedAt: '',
      contentWidth: '',
      contentWidthCustom: '',
      showSidebar: null,
    }
  }

  return {
    title: data.title,
    description: data.description ?? '',
    content: data.content,
    metaDescription: data.metaDescription ?? '',
    metaKeywords: data.metaKeywords ?? '',
    ogpTitle: data.ogpTitle ?? '',
    ogpDescription: data.ogpDescription ?? '',
    ogpImageUrl: data.ogpImageUrl ?? '',
    isPublished: data.isPublished,
    publishedAt: data.publishedAt
      ? format(new Date(data.publishedAt), "yyyy-MM-dd'T'HH:mm")
      : '',
    contentWidth: data.contentWidth ?? '',
    contentWidthCustom: data.contentWidthCustom?.toString() ?? '',
    showSidebar: data.showSidebar,
  }
}

/** フォームデータ → 送信ペイロード */
function toSubmitPayload(formData: PageFormData): PageSubmitPayload {
  return {
    title: formData.title,
    description: formData.description || undefined,
    content: formData.content,
    metaDescription: formData.metaDescription || undefined,
    metaKeywords: formData.metaKeywords || undefined,
    ogpTitle: formData.ogpTitle || undefined,
    ogpDescription: formData.ogpDescription || undefined,
    ogpImageUrl: formData.ogpImageUrl || undefined,
    isPublished: formData.isPublished,
    publishedAt: formData.publishedAt ? new Date(formData.publishedAt) : undefined,
    contentWidth: isValidLayoutWidth(formData.contentWidth) ? formData.contentWidth : undefined,
    contentWidthCustom: formData.contentWidthCustom
      ? parseInt(formData.contentWidthCustom, 10)
      : undefined,
    showSidebar: formData.showSidebar,
  }
}

/** フォームデータ → プレビューデータ */
function toPreviewData(formData: PageFormData, data?: PageData): PagePreviewData {
  return {
    title: formData.title || '無題',
    slug: data?.slug ?? 'preview',
    description: formData.description || null,
    content: formData.content || '',
    showSidebar: formData.showSidebar ?? false,
  }
}

// =============================================================================
// フィールド名定数
// =============================================================================

const SEO_FIELDS = {
  metaDescription: 'metaDescription',
  metaKeywords: 'metaKeywords',
} as const

const OGP_FIELDS = {
  ogpTitle: 'ogpTitle',
  ogpDescription: 'ogpDescription',
  ogpImageUrl: 'ogpImageUrl',
} as const

// =============================================================================
// Config
// =============================================================================

/**
 * Page用の更新アクションラッパー
 * updatePageはslugを引数に取るが、ContentActionsはidを期待するため変換
 */
const updatePageById = async (id: string, payload: PageSubmitPayload) => {
  // PageDataからslugを取得するため、idをslugとして扱う
  // 注意: Pageの場合、実際にはslugを渡す必要がある
  return updatePage(id, payload)
}

export const pageConfig: ContentTypeConfig<
  PageData,
  PageFormData,
  PagePreviewData,
  PageSubmitPayload
> = {
  // 基本情報
  id: 'page',
  label: 'ページ',
  listPath: '/admin/pages',
  slugPrefix: '',
  previewBasePath: '/p',

  // スキーマ
  formSchema: pageFormSchema,

  // 機能フラグ
  features: {
    create: false,  // Pageは新規作成なし（編集のみ）
    delete: false,  // Pageは削除なし
    publish: false, // Pageは公開/非公開ボタンなし（フォームで直接制御）
    comments: true,
  },

  // 公開制御
  publishControl: {
    type: 'isPublished',
  },

  // データ変換
  transforms: {
    toFormData,
    toSubmitPayload,
    toPreviewData,
  },

  // Server Actions
  actions: {
    update: updatePageById,
  },

  // サイドパネル
  sidePanel: {
    title: 'ページ設定',
    width: 'default',
    tabs: [
      {
        id: 'basic',
        label: '基本',
        sections: [
          {
            title: '基本情報',
            component: TitleSlugFields,
            props: {
              fields: { title: 'title' },
              titlePlaceholder: 'ページのタイトル',
              // slugは編集不可（読み取り専用で表示）
              readOnlySlug: true,
            },
          },
        ],
      },
      {
        id: 'seo',
        label: 'SEO・OGP',
        sections: [
          {
            title: 'SEO設定',
            component: SEOFields,
            props: {
              fields: SEO_FIELDS,
            },
          },
          {
            title: 'OGP設定',
            component: OGPFields,
            props: {
              fields: OGP_FIELDS,
            },
          },
        ],
      },
      {
        id: 'publish',
        label: '公開',
        sections: [
          {
            title: '公開設定',
            component: UnifiedPublishFields,
            props: {
              controlType: 'isPublished',
              fields: {
                publishedAt: 'publishedAt',
              },
            },
          },
          {
            title: 'レイアウト',
            component: LayoutFields,
            props: {},
          },
        ],
      },
    ],
  },
}
