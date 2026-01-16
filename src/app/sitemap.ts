/**
 * 動的サイトマップ生成
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { BlogPostStatus, NewsStatus } from '@/generated/prisma/client/enums'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 静的ページ
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/spaces`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/news`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  // スペースページ（公開中のみ）
  const spaces = await prisma.space.findMany({
    where: {
      isPublished: true,
      isActive: true,
    },
    select: {
      id: true,
      updatedAt: true,
    },
  })

  const spacePages: MetadataRoute.Sitemap = spaces.map((space) => ({
    url: `${BASE_URL}/spaces/${space.id}`,
    lastModified: space.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  // ニュースページ（公開中のみ）
  const news = await prisma.news.findMany({
    where: {
      status: NewsStatus.PUBLISHED,
    },
    select: {
      id: true,
      updatedAt: true,
    },
  })

  const newsPages: MetadataRoute.Sitemap = news.map((item) => ({
    url: `${BASE_URL}/news/${item.id}`,
    lastModified: item.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  // ブログ記事（公開中のみ）
  const blogPosts = await prisma.blogPost.findMany({
    where: {
      status: BlogPostStatus.PUBLISHED,
    },
    select: {
      slug: true,
      updatedAt: true,
    },
  })

  const blogPages: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticPages, ...spacePages, ...newsPages, ...blogPages]
}
