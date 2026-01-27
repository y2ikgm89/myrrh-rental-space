'use server'

import { prisma } from '@/shared/lib/prisma'
import { PostStatus } from '@/shared/generated/prisma/enums'
import { cacheLife, cacheTag } from 'next/cache'
import { sidebarWidgetsSchema, type SidebarWidgets } from '@/shared/lib/validations/sidebar'

// =============================================================================
// Types
// =============================================================================

export type SidebarRecentPost = {
  id: string
  title: string
  slug: string
  publishedAt: Date
  thumbnailUrl: string
}

export type SidebarPopularPost = {
  id: string
  title: string
  slug: string
  viewCount: number
  thumbnailUrl: string
}

export type SidebarCategory = {
  id: string
  name: string
  slug: string
  postCount: number
}

export type SidebarTag = {
  name: string
  slug: string
  postCount: number
}

export type SidebarData = {
  recentPosts: SidebarRecentPost[]
  popularPosts: SidebarPopularPost[]
  categories: SidebarCategory[]
  tags: SidebarTag[]
}

export type SidebarFullData = {
  enabled: boolean
  widgets: SidebarWidgets
  data: SidebarData
}

// =============================================================================
// Actions
// =============================================================================

/**
 * サイドバーデータを一括取得（キャッシュ付き）
 * 公開ページ用・認証不要
 */
export async function getSidebarData(): Promise<SidebarData> {
  'use cache'
  cacheLife('minutes')
  cacheTag('sidebar-data')

  // サイドバー設定を取得
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      sidebarRecentCount: true,
      sidebarPopularCount: true,
    },
  })

  const recentCount = settings?.sidebarRecentCount ?? 5
  const popularCount = settings?.sidebarPopularCount ?? 5

  // 全クエリを並列実行（パフォーマンス最適化）
  const [recentPosts, popularPosts, categories, tags, publishedPosts] = await Promise.all([
    // 新着記事
    prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        publishedAt: true,
        thumbnailUrl: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: recentCount,
    }),
    // 人気記事
    prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        viewCount: true,
        thumbnailUrl: true,
      },
      orderBy: {
        viewCount: 'desc',
      },
      take: popularCount,
    }),
    // カテゴリー一覧 + 記事数
    prisma.postCategory.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        order: true,
        _count: {
          select: {
            posts: {
              where: {
                status: PostStatus.PUBLISHED,
                publishedAt: { not: null },
              },
            },
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    }),
    // タグ一覧
    prisma.postTag.findMany({
      select: {
        name: true,
        slug: true,
      },
    }),
    // 公開済み記事のタグ（カウント用）
    prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: {
        tags: true,
      },
    }),
  ])

  // タグごとの記事数をカウント
  const tagCountMap = new Map<string, number>()
  for (const post of publishedPosts) {
    // Prisma JsonValueは unknown 型なので Array.isArray で型ガード
    const postTags = post.tags
    if (Array.isArray(postTags)) {
      for (const tag of postTags) {
        if (typeof tag === 'string') {
          tagCountMap.set(tag, (tagCountMap.get(tag) ?? 0) + 1)
        }
      }
    }
  }

  // タグ一覧にカウントを付与
  // blogPost.tags が slug/name どちらで保存されていても対応
  const tagsWithCount = tags.map((tag) => ({
    name: tag.name,
    slug: tag.slug,
    postCount: tagCountMap.get(tag.slug) ?? tagCountMap.get(tag.name) ?? 0,
  }))

  // 記事数が0のタグを除外してソート（記事数降順）
  const filteredTags = tagsWithCount
    .filter((tag) => tag.postCount > 0)
    .sort((a, b) => b.postCount - a.postCount)

  return {
    recentPosts: recentPosts.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      publishedAt: post.publishedAt!,
      thumbnailUrl: post.thumbnailUrl,
    })),
    popularPosts: popularPosts.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      viewCount: post.viewCount,
      thumbnailUrl: post.thumbnailUrl,
    })),
    categories: categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      postCount: cat._count.posts,
    })),
    tags: filteredTags,
  }
}

/**
 * サイドバー設定を取得（公開ページ用）
 */
export async function getSidebarSettings(): Promise<{
  enabled: boolean
  widgets: SidebarWidgets
}> {
  'use cache'
  cacheLife('hours')
  cacheTag('sidebar-settings')

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      sidebarEnabled: true,
      sidebarWidgets: true,
    },
  })

  // デフォルト値を設定
  const defaultWidgets: SidebarWidgets = {
    search: true,
    recent: true,
    popular: true,
    categories: true,
    tags: true,
  }

  // sidebarWidgets をZodスキーマでパース（安全な型変換）
  const parseResult = sidebarWidgetsSchema.safeParse(settings?.sidebarWidgets)
  const widgets: SidebarWidgets = parseResult.success
    ? { ...defaultWidgets, ...parseResult.data }
    : defaultWidgets

  return {
    enabled: settings?.sidebarEnabled ?? true,
    widgets,
  }
}

/**
 * サイドバーの設定とデータを一括取得（最適化版）
 *
 * getSidebarSettings() と getSidebarData() を1回のDB呼び出しで取得
 * 公開ページ用・認証不要
 */
export async function getSidebarFullData(): Promise<SidebarFullData> {
  'use cache'
  cacheLife('minutes')
  cacheTag('sidebar-data', 'sidebar-settings')

  // サイドバー設定を一括取得（1回のDBクエリ）
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      sidebarEnabled: true,
      sidebarWidgets: true,
      sidebarRecentCount: true,
      sidebarPopularCount: true,
    },
  })

  // デフォルト値を設定
  const defaultWidgets: SidebarWidgets = {
    search: true,
    recent: true,
    popular: true,
    categories: true,
    tags: true,
  }

  const parseResult = sidebarWidgetsSchema.safeParse(settings?.sidebarWidgets)
  const widgets: SidebarWidgets = parseResult.success
    ? { ...defaultWidgets, ...parseResult.data }
    : defaultWidgets

  const enabled = settings?.sidebarEnabled ?? true

  // サイドバーが無効な場合は空データを返す
  if (!enabled) {
    return {
      enabled: false,
      widgets,
      data: {
        recentPosts: [],
        popularPosts: [],
        categories: [],
        tags: [],
      },
    }
  }

  const recentCount = settings?.sidebarRecentCount ?? 5
  const popularCount = settings?.sidebarPopularCount ?? 5

  // 全クエリを並列実行（パフォーマンス最適化）
  const [recentPosts, popularPosts, categories, tags, publishedPosts] = await Promise.all([
    // 新着記事
    prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        publishedAt: true,
        thumbnailUrl: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: recentCount,
    }),
    // 人気記事
    prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        viewCount: true,
        thumbnailUrl: true,
      },
      orderBy: {
        viewCount: 'desc',
      },
      take: popularCount,
    }),
    // カテゴリー一覧 + 記事数
    prisma.postCategory.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        order: true,
        _count: {
          select: {
            posts: {
              where: {
                status: PostStatus.PUBLISHED,
                publishedAt: { not: null },
              },
            },
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    }),
    // タグ一覧
    prisma.postTag.findMany({
      select: {
        name: true,
        slug: true,
      },
    }),
    // 公開済み記事のタグ（カウント用）
    prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: {
        tags: true,
      },
    }),
  ])

  // タグごとの記事数をカウント
  const tagCountMap = new Map<string, number>()
  for (const post of publishedPosts) {
    const postTags = post.tags
    if (Array.isArray(postTags)) {
      for (const tag of postTags) {
        if (typeof tag === 'string') {
          tagCountMap.set(tag, (tagCountMap.get(tag) ?? 0) + 1)
        }
      }
    }
  }

  // タグ一覧にカウントを付与
  const tagsWithCount = tags.map((tag) => ({
    name: tag.name,
    slug: tag.slug,
    postCount: tagCountMap.get(tag.slug) ?? tagCountMap.get(tag.name) ?? 0,
  }))

  // 記事数が0のタグを除外してソート
  const filteredTags = tagsWithCount
    .filter((tag) => tag.postCount > 0)
    .sort((a, b) => b.postCount - a.postCount)

  return {
    enabled,
    widgets,
    data: {
      recentPosts: recentPosts.map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        publishedAt: post.publishedAt!,
        thumbnailUrl: post.thumbnailUrl,
      })),
      popularPosts: popularPosts.map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        viewCount: post.viewCount,
        thumbnailUrl: post.thumbnailUrl,
      })),
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        postCount: cat._count.posts,
      })),
      tags: filteredTags,
    },
  }
}
