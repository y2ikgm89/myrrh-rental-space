/**
 * 投稿コンテンツタイプ設定
 *
 * PostInlineEditorで使用する完全な設定
 * - フォームスキーマ
 * - Server Actions
 * - データ変換
 * - サイドパネル設定
 */

import { format } from 'date-fns'
import { PostStatus } from '@/shared/generated/prisma/enums'
import { postFormSchema, type PostFormData, type PostData } from '@/admin/lib/validations/post'
import {
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
} from '@/admin/actions/post'
import { isValidLayoutWidth } from '@/shared/lib/validations/enums'
import type { PostPreviewData } from '@/shared/types'
import { SEO_FIELD_NAMES, OGP_FIELD_NAMES, type ContentTypeConfig, type ContentEditorExtraData } from './types'
import {
  TitleSlugFields,
  ExcerptFields,
  CategoryFields,
  PostTagFields,
  ImageFields,
  SEOFields,
  OGPFields,
  UnifiedPublishFields,
  LayoutFields,
} from '../side-panel'

// =============================================================================
// Types
// =============================================================================

/** Post用送信ペイロード型 */
type PostSubmitPayload = {
  title: string
  slug: string
  excerpt: string
  contentJson: string
  thumbnailUrl: string
  ogpImageUrl: string | null
  categoryId: string
  tags: string[]
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  contentWidth: 'XS' | 'SM' | 'MD' | 'LG' | 'XL' | 'FULL' | 'CUSTOM' | null
  contentWidthCustom: number | null
}

// =============================================================================
// Transforms
// =============================================================================

/** DBデータ → フォームデータ */
function toFormData(data?: PostData): PostFormData {
  if (!data) {
    return {
      title: '',
      slug: '',
      excerpt: '',
      contentJson: '',
      thumbnailUrl: '/images/placeholder.jpg',
      ogpImageUrl: '',
      categoryId: '',
      tags: '',
      metaDescription: '',
      metaKeywords: '',
      ogpTitle: '',
      ogpDescription: '',
      status: PostStatus.DRAFT,
      publishedAt: '',
      contentWidth: '',
      contentWidthCustom: '',
    }
  }

  return {
    title: data.title,
    slug: data.slug,
    excerpt: data.excerpt,
    contentJson: data.contentJson ? JSON.stringify(data.contentJson) : '',
    thumbnailUrl: data.thumbnailUrl,
    ogpImageUrl: data.ogpImageUrl ?? '',
    categoryId: data.categoryId,
    tags: data.postTags?.map((t) => t.name).join(', ') ?? '',
    metaDescription: data.metaDescription ?? '',
    metaKeywords: data.metaKeywords ?? '',
    ogpTitle: data.ogpTitle ?? '',
    ogpDescription: data.ogpDescription ?? '',
    status: data.status,
    publishedAt: data.publishedAt
      ? format(new Date(data.publishedAt), "yyyy-MM-dd'T'HH:mm")
      : '',
    contentWidth: data.contentWidth ?? '',
    contentWidthCustom: data.contentWidthCustom?.toString() ?? '',
  }
}

/** フォームデータ → 送信ペイロード */
function toSubmitPayload(formData: PostFormData): PostSubmitPayload {
  const tags = formData.tags
    ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : []

  return {
    title: formData.title,
    slug: formData.slug,
    excerpt: formData.excerpt,
    contentJson: formData.contentJson,
    thumbnailUrl: formData.thumbnailUrl,
    ogpImageUrl: formData.ogpImageUrl || null,
    categoryId: formData.categoryId,
    tags,
    metaDescription: formData.metaDescription || null,
    metaKeywords: formData.metaKeywords || null,
    ogpTitle: formData.ogpTitle || null,
    ogpDescription: formData.ogpDescription || null,
    contentWidth:
      formData.contentWidth && isValidLayoutWidth(formData.contentWidth)
        ? formData.contentWidth
        : null,
    contentWidthCustom: formData.contentWidthCustom
      ? parseInt(formData.contentWidthCustom, 10)
      : null,
  }
}

/** フォームデータ → プレビューデータ */
function toPreviewData(
  formData: PostFormData,
  _data?: PostData,
  extraData?: ContentEditorExtraData
): PostPreviewData {
  const tags = formData.tags
    ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : []

  const selectedCategory = extraData?.categories?.find(
    (c) => c.id === formData.categoryId
  )

  return {
    title: formData.title || '無題',
    slug: formData.slug || 'preview-new',
    excerpt: formData.excerpt || '',
    content: formData.contentJson || '',
    thumbnailUrl: formData.thumbnailUrl || '/images/placeholder.jpg',
    publishedAt: formData.publishedAt || null,
    tags,
    category: {
      name: selectedCategory?.name || 'カテゴリなし',
      slug: selectedCategory?.slug || 'uncategorized',
    },
  }
}

// =============================================================================
// Config
// =============================================================================

export const postConfig: ContentTypeConfig<
  PostData,
  PostFormData,
  PostPreviewData,
  PostSubmitPayload
> = {
  // 基本情報
  id: 'post',
  label: '投稿',
  listPath: '/admin/posts',
  slugPrefix: 'posts/',
  previewBasePath: '/posts',

  // スキーマ
  formSchema: postFormSchema,

  // 機能フラグ
  features: {
    create: true,
    delete: true,
    publish: true,
    comments: true,
  },

  // 公開制御
  publishControl: {
    type: 'status',
    statusEnum: PostStatus,
  },

  // データ変換
  transforms: {
    toFormData,
    toSubmitPayload,
    toPreviewData,
  },

  // Server Actions
  actions: {
    create: createPost,
    update: updatePost,
    delete: deletePost,
    publish: publishPost,
    unpublish: unpublishPost,
  },

  // サイドパネル
  sidePanel: {
    title: '記事設定',
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
              slugPreviewPath: '/posts',
              titlePlaceholder: '記事のタイトル',
              slugPlaceholder: 'article-slug',
            },
          },
          {
            title: '抜粋',
            component: ExcerptFields,
            props: {
              fields: { excerpt: 'excerpt' },
              label: '抜粋',
              placeholder: '記事の抜粋（一覧ページに表示）',
              helpText: '500文字以内',
            },
          },
          {
            title: 'カテゴリ',
            component: CategoryFields,
            props: {
              fields: { categoryId: 'categoryId' },
              label: 'カテゴリ',
            },
          },
          {
            title: 'タグ',
            component: PostTagFields,
            props: {
              fields: { tags: 'tags' },
            },
          },
          {
            title: '画像',
            component: ImageFields,
            props: {},
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
              fields: SEO_FIELD_NAMES,
            },
          },
          {
            title: 'OGP設定',
            component: OGPFields,
            props: {
              fields: OGP_FIELD_NAMES,
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
              controlType: 'status',
              fields: {
                publishedAt: 'publishedAt',
                status: 'status',
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
