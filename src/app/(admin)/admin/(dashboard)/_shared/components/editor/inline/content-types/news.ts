/**
 * お知らせコンテンツタイプ設定
 *
 * NewsInlineEditorで使用する完全な設定
 * - フォームスキーマ
 * - Server Actions
 * - データ変換
 * - サイドパネル設定
 */

import { format } from 'date-fns'
import { newsFormSchema, type NewsFormData, type NewsData } from '@/admin/lib/validations/news'
import {
  createNews,
  updateNews,
  deleteNews,
  publishNews,
  unpublishNews,
} from '@/admin/actions/news'
import { isValidLayoutWidth, type LayoutWidth } from '@/shared/lib/validations/enums'
import type { NewsPreviewData } from '@/shared/types'
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

/** News用送信ペイロード型 */
type NewsSubmitPayload = {
  slug: string
  title: string
  content: string
  contentWidth: LayoutWidth | null
  contentWidthCustom: number | null
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  ogpImageUrl: string | null
}

// =============================================================================
// Transforms
// =============================================================================

/** DBデータ → フォームデータ */
function toFormData(data?: NewsData): NewsFormData {
  if (!data) {
    return {
      slug: '',
      title: '',
      content: '',
      isPublished: false,
      publishedAt: '',
      contentWidth: '',
      contentWidthCustom: '',
      metaDescription: '',
      metaKeywords: '',
      ogpTitle: '',
      ogpDescription: '',
      ogpImageUrl: '',
    }
  }

  return {
    slug: data.slug,
    title: data.title,
    content: data.content,
    isPublished: data.isPublished,
    publishedAt: data.publishedAt
      ? format(new Date(data.publishedAt), "yyyy-MM-dd'T'HH:mm")
      : '',
    contentWidth: data.contentWidth ?? '',
    contentWidthCustom: data.contentWidthCustom?.toString() ?? '',
    metaDescription: data.metaDescription ?? '',
    metaKeywords: data.metaKeywords ?? '',
    ogpTitle: data.ogpTitle ?? '',
    ogpDescription: data.ogpDescription ?? '',
    ogpImageUrl: data.ogpImageUrl ?? '',
  }
}

/** フォームデータ → 送信ペイロード */
function toSubmitPayload(formData: NewsFormData): NewsSubmitPayload {
  return {
    slug: formData.slug,
    title: formData.title,
    content: formData.content,
    contentWidth: isValidLayoutWidth(formData.contentWidth) ? formData.contentWidth : null,
    contentWidthCustom: formData.contentWidthCustom
      ? parseInt(formData.contentWidthCustom, 10)
      : null,
    metaDescription: formData.metaDescription || null,
    metaKeywords: formData.metaKeywords || null,
    ogpTitle: formData.ogpTitle || null,
    ogpDescription: formData.ogpDescription || null,
    ogpImageUrl: formData.ogpImageUrl || null,
  }
}

/** フォームデータ → プレビューデータ */
function toPreviewData(formData: NewsFormData): NewsPreviewData {
  return {
    title: formData.title || '無題',
    slug: formData.slug || 'preview-new',
    content: formData.content || '',
    publishedAt: formData.publishedAt || null,
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

export const newsConfig: ContentTypeConfig<
  NewsData,
  NewsFormData,
  NewsPreviewData,
  NewsSubmitPayload
> = {
  // 基本情報
  id: 'news',
  label: 'お知らせ',
  listPath: '/admin/news',
  slugPrefix: 'news/',
  previewBasePath: '/news',

  // スキーマ
  formSchema: newsFormSchema,

  // 機能フラグ
  features: {
    create: true,
    delete: true,
    publish: true,
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
    create: createNews,
    update: updateNews,
    delete: deleteNews,
    publish: publishNews,
    unpublish: unpublishNews,
  },

  // サイドパネル
  sidePanel: {
    title: 'お知らせ設定',
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
              fields: { title: 'title', slug: 'slug' },
              slugPreviewPath: '/news',
              titlePlaceholder: 'お知らせのタイトル',
              slugPlaceholder: 'news-slug',
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
