'use server'

/**
 * ホームページヒーロー管理用Server Actions
 *
 * トップページのヒーローセクション編集用
 */

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import {
  updateHomepageHeroSchema,
  type UpdateHomepageHeroInput,
  type HomepageHeroData,
  type PageActionResult,
} from '@/lib/validations/page'

/**
 * デフォルトのヒーローデータ
 */
const DEFAULT_HERO: Omit<HomepageHeroData, 'id' | 'createdAt' | 'updatedAt'> = {
  title: '理想のスペースを、あなたに。',
  subtitle: 'ビジネスからプライベートまで、あらゆるシーンに対応するレンタルスペース',
  ctaPrimaryText: 'スペースを探す',
  ctaPrimaryUrl: '/spaces',
  ctaSecondaryText: 'お問い合わせ',
  ctaSecondaryUrl: '/contact',
  backgroundImageUrl: null,
  isActive: true,
}

/**
 * ホームページヒーロー取得
 *
 * 存在しない場合はデフォルト値で作成
 */
export async function getHomepageHero(): Promise<HomepageHeroData> {
  let hero = await prisma.homepageHero.findUnique({
    where: { id: 'singleton' },
  })

  // 存在しない場合は作成
  if (!hero) {
    hero = await prisma.homepageHero.create({
      data: {
        id: 'singleton',
        ...DEFAULT_HERO,
      },
    })
  }

  return hero
}

/**
 * ホームページヒーロー更新
 */
export async function updateHomepageHero(
  input: UpdateHomepageHeroInput
): Promise<PageActionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'ログインが必要です' }
  }

  // バリデーション
  const parsed = updateHomepageHeroSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const error of parsed.error.issues) {
      const field = error.path.join('.')
      if (!fieldErrors[field]) {
        fieldErrors[field] = []
      }
      fieldErrors[field].push(error.message)
    }
    return {
      success: false,
      error: 'バリデーションエラー',
      fieldErrors,
    }
  }

  try {
    // upsertで存在しない場合は作成
    await prisma.homepageHero.upsert({
      where: { id: 'singleton' },
      update: {
        title: parsed.data.title,
        subtitle: parsed.data.subtitle || null,
        ctaPrimaryText: parsed.data.ctaPrimaryText,
        ctaPrimaryUrl: parsed.data.ctaPrimaryUrl,
        ctaSecondaryText: parsed.data.ctaSecondaryText || null,
        ctaSecondaryUrl: parsed.data.ctaSecondaryUrl || null,
        backgroundImageUrl: parsed.data.backgroundImageUrl || null,
        isActive: parsed.data.isActive,
      },
      create: {
        id: 'singleton',
        title: parsed.data.title,
        subtitle: parsed.data.subtitle || null,
        ctaPrimaryText: parsed.data.ctaPrimaryText,
        ctaPrimaryUrl: parsed.data.ctaPrimaryUrl,
        ctaSecondaryText: parsed.data.ctaSecondaryText || null,
        ctaSecondaryUrl: parsed.data.ctaSecondaryUrl || null,
        backgroundImageUrl: parsed.data.backgroundImageUrl || null,
        isActive: parsed.data.isActive,
      },
    })

    // キャッシュ無効化
    revalidatePath('/')
    revalidatePath('/admin/pages/homepage')

    return { success: true, message: 'ヒーローセクションを更新しました' }
  } catch (error) {
    console.error('ヒーロー更新エラー:', error)
    return { success: false, error: 'ヒーローの更新中にエラーが発生しました' }
  }
}
