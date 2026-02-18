'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { TermsStatus, TermsType } from '@/shared/generated/prisma/enums'
import {
  createTermsSchema,
  updateTermsSchema,
  createTermsVersionSchema,
  updateTermsVersionSchema,
  updateTermsSeoSchema,
  getTermsTypeDefaults,
  type CreateTermsInput,
  type UpdateTermsInput,
  type CreateTermsVersionInput,
  type UpdateTermsVersionInput,
  type UpdateTermsSeoInput,
  type TermsWithVersion,
  type TermsDetail,
  type TermsVersionDetail,
  type SiteWideTermsSeo,
} from '@/shared/lib/validations/terms'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { renderEditorStateToHtmlLazy } from '@/admin/lib/lazy-renderer'
import { purgeTermsCache } from '@/shared/lib/cloudflare'
import { fireAndForget } from '@/shared/lib/async-utils'
import { ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'

// =============================================================================
// Terms CRUD
// =============================================================================

/**
 * 全規約一覧を取得（管理画面用）
 */
export const getTermsList = withPermission<[], TermsWithVersion[]>('terms', 'read')(
  async (_user): Promise<ActionResult<TermsWithVersion[]>> => {
    const terms = await prisma.terms.findMany({
      include: {
        versions: {
          where: { isCurrentVersion: true },
          take: 1,
          select: {
            id: true,
            version: true,
            contentHtml: true,
            contentJson: true,
            publishedAt: true,
          },
        },
        _count: {
          select: {
            spaces: true,
            agreements: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = terms.map((t) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      slug: t.slug,
      isActive: t.isActive,
      currentVersion: t.versions[0]
        ? {
            id: t.versions[0].id,
            version: t.versions[0].version,
            contentHtml: t.versions[0].contentHtml,
            contentJson: t.versions[0].contentJson,
            publishedAt: t.versions[0].publishedAt!,
          }
        : null,
    }))

    return createSuccess('規約一覧を取得しました', result)
  }
)

/**
 * アクティブな規約一覧を取得（ドロップダウン用）
 */
export async function getActiveTermsForSelect(): Promise<
  { id: string; title: string; type: string }[]
> {
  const terms = await prisma.terms.findMany({
    where: {
      isActive: true,
      versions: {
        some: {
          isCurrentVersion: true,
          status: TermsStatus.PUBLISHED,
        },
      },
    },
    select: {
      id: true,
      title: true,
      type: true,
    },
    orderBy: { title: 'asc' },
  })

  return terms
}

/**
 * 規約タイプからデフォルトのタイトル・スラッグを取得（重複回避付き）
 */
export async function getDefaultsForTermsType(
  type: string
): Promise<{ title: string; slug: string } | null> {
  const defaults = getTermsTypeDefaults(type)
  if (!defaults) return null

  // まず基本スラッグが使用可能かチェック
  const existing = await prisma.terms.findUnique({
    where: { slug: defaults.slug },
    select: { id: true },
  })

  if (!existing) {
    return defaults
  }

  // 重複がある場合、同じプレフィックスのスラッグを検索
  const similarTerms = await prisma.terms.findMany({
    where: {
      slug: { startsWith: defaults.slug },
    },
    select: { slug: true },
  })

  // 使用中の番号を収集
  const usedNumbers = new Set<number>([1])
  for (const term of similarTerms) {
    const match = term.slug.match(new RegExp(`^${RegExp.escape(defaults.slug)}-(\\d+)$`))
    if (match?.[1]) {
      usedNumbers.add(parseInt(match[1], 10))
    }
  }

  // 最小の空き番号を見つける
  let suffix = 2
  while (usedNumbers.has(suffix)) {
    suffix++
  }

  return {
    title: `${defaults.title} ${suffix}`,
    slug: `${defaults.slug}-${suffix}`,
  }
}

/**
 * 規約詳細を取得
 */
export const getTermsById = withPermission<[string], TermsDetail | null>('terms', 'read')(
  async (_user, id): Promise<ActionResult<TermsDetail | null>> => {
    const terms = await prisma.terms.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            publishedAt: true,
            isCurrentVersion: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            spaces: true,
            agreements: true,
          },
        },
      },
    })

    if (!terms) {
      return createSuccess('規約が見つかりませんでした', null)
    }

    return createSuccess('規約詳細を取得しました', terms)
  }
)

/**
 * 規約を作成
 */
export const createTerms = withPermission<[CreateTermsInput], { id: string }>('terms', 'create')(
  async (_user, input): Promise<ActionResult<{ id: string }>> => {
    const validation = createTermsSchema.safeParse(input)
    if (!validation.success) {
      return createValidationError(validation.error)
    }

    // slug重複チェック
    const existing = await prisma.terms.findUnique({
      where: { slug: validation.data.slug },
      select: { id: true },
    })

    if (existing) {
      return createFailure('このスラッグは既に使用されています')
    }

    const terms = await prisma.terms.create({
      data: validation.data,
    })

    updateTag(CACHE_TAGS.TERMS)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgeTermsCache(), { operation: 'purgeTermsCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('規約を作成しました', { id: terms.id })
  }
)

/**
 * 規約+バージョンを同時に作成（InlineEditor用）
 */
export const createTermsWithVersion = withPermission<
  [CreateTermsInput & { contentJson: string }],
  { id: string; versionId: string }
>('terms', 'create')(
  async (user, input): Promise<ActionResult<{ id: string; versionId: string }>> => {
    const { contentJson, ...termsInput } = input

    const validation = createTermsSchema.safeParse(termsInput)
    if (!validation.success) {
      return createValidationError(validation.error)
    }

    if (!contentJson.trim()) {
      return createFailure('コンテンツを入力してください')
    }

    // slug重複チェック
    const existing = await prisma.terms.findUnique({
      where: { slug: validation.data.slug },
      select: { id: true },
    })

    if (existing) {
      return createFailure('このスラッグは既に使用されています')
    }

    // JSON → HTML 変換
    const contentHtml = await renderEditorStateToHtmlLazy(contentJson)

    // トランザクションで規約とバージョンを同時作成
    const result = await prisma.$transaction(async (tx) => {
      const terms = await tx.terms.create({
        data: validation.data,
      })

      const version = await tx.termsVersion.create({
        data: {
          termsId: terms.id,
          contentJson: JSON.parse(contentJson),
          contentHtml,
          version: 1,
          status: TermsStatus.DRAFT,
          createdBy: user.id,
        },
      })

      return { id: terms.id, versionId: version.id }
    })

    updateTag(CACHE_TAGS.TERMS)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgeTermsCache(), { operation: 'purgeTermsCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('規約を作成しました', result)
  }
)

/**
 * 規約を更新
 */
export const updateTerms = withPermission<[string, UpdateTermsInput]>('terms', 'update')(
  async (_user, id, input): Promise<ActionResult<void>> => {
    const validation = updateTermsSchema.safeParse(input)
    if (!validation.success) {
      return createValidationError(validation.error)
    }

    // slug重複チェック（自分以外）
    if (validation.data.slug) {
      const existing = await prisma.terms.findFirst({
        where: {
          slug: validation.data.slug,
          id: { not: id },
        },
        select: { id: true },
      })

      if (existing) {
        return createFailure('このスラッグは既に使用されています')
      }
    }

    await prisma.terms.update({
      where: { id },
      data: validation.data,
    })

    updateTag(CACHE_TAGS.TERMS)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgeTermsCache(), { operation: 'purgeTermsCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('規約を更新しました')
  }
)

/**
 * 規約を削除
 */
export const deleteTerms = withPermission<[string]>('terms', 'delete')(
  async (_user, id): Promise<ActionResult<void>> => {
    // 使用中チェック
    const spacesCount = await prisma.space.count({
      where: { termsId: id },
    })

    if (spacesCount > 0) {
      return createFailure(
        `この規約は ${spacesCount} 件のスペースで使用されているため削除できません`
      )
    }

    await prisma.terms.delete({ where: { id } })

    updateTag(CACHE_TAGS.TERMS)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgeTermsCache(), { operation: 'purgeTermsCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('規約を削除しました')
  }
)

/**
 * 規約の有効/無効を切り替え
 */
export const toggleTermsActive = withPermission<[string]>('terms', 'update')(
  async (_user, id): Promise<ActionResult<void>> => {
    const terms = await prisma.terms.findUnique({
      where: { id },
      select: { isActive: true },
    })

    if (!terms) {
      return createFailure('規約が見つかりません')
    }

    await prisma.terms.update({
      where: { id },
      data: { isActive: !terms.isActive },
    })

    updateTag(CACHE_TAGS.TERMS)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgeTermsCache(), { operation: 'purgeTermsCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess(terms.isActive ? '規約を無効にしました' : '規約を有効にしました')
  }
)

// =============================================================================
// Terms Version Management
// =============================================================================

/**
 * 規約バージョン詳細を取得
 */
export const getTermsVersionById = withPermission<[string], TermsVersionDetail | null>(
  'terms',
  'read'
)(async (_user, versionId): Promise<ActionResult<TermsVersionDetail | null>> => {
  const version = await prisma.termsVersion.findUnique({
    where: { id: versionId },
  })

  return createSuccess('バージョン詳細を取得しました', version)
})

/**
 * 新しいバージョンを作成（DRAFT）
 */
export const createTermsVersion = withPermission<
  [CreateTermsVersionInput],
  { id: string; version: number }
>('terms', 'create')(
  async (user, input): Promise<ActionResult<{ id: string; version: number }>> => {
    const validation = createTermsVersionSchema.safeParse(input)
    if (!validation.success) {
      return createValidationError(validation.error)
    }

    // 最新バージョン番号を取得
    const latestVersion = await prisma.termsVersion.findFirst({
      where: { termsId: validation.data.termsId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })

    const nextVersion = (latestVersion?.version ?? 0) + 1

    // JSON → HTML 変換
    const contentHtml = await renderEditorStateToHtmlLazy(validation.data.contentJson)

    const version = await prisma.termsVersion.create({
      data: {
        termsId: validation.data.termsId,
        contentJson: JSON.parse(validation.data.contentJson),
        contentHtml,
        version: nextVersion,
        status: TermsStatus.DRAFT,
        createdBy: user.id,
      },
    })

    updateTag(CACHE_TAGS.TERMS)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgeTermsCache(), { operation: 'purgeTermsCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess(`バージョン ${nextVersion} を作成しました`, {
      id: version.id,
      version: version.version,
    })
  }
)

/**
 * バージョンを更新（DRAFTのみ）
 */
export const updateTermsVersion = withPermission<[string, UpdateTermsVersionInput]>(
  'terms',
  'update'
)(async (_user, versionId, input): Promise<ActionResult<void>> => {
  const validation = updateTermsVersionSchema.safeParse(input)
  if (!validation.success) {
    return createValidationError(validation.error)
  }

  const version = await prisma.termsVersion.findUnique({
    where: { id: versionId },
    select: { status: true },
  })

  if (!version) {
    return createFailure('バージョンが見つかりません')
  }

  if (version.status !== TermsStatus.DRAFT) {
    return createFailure('公開済みのバージョンは編集できません')
  }

  // JSON → HTML 変換
  const contentHtml = await renderEditorStateToHtmlLazy(validation.data.contentJson)

  await prisma.termsVersion.update({
    where: { id: versionId },
    data: {
      contentJson: JSON.parse(validation.data.contentJson),
      contentHtml,
    },
  })

  updateTag(CACHE_TAGS.TERMS)

  return createSuccess('バージョンを更新しました')
})

/**
 * バージョンを公開
 */
export const publishTermsVersion = withPermission<[string]>('terms', 'update')(
  async (user, versionId): Promise<ActionResult<void>> => {
    const version = await prisma.termsVersion.findUnique({
      where: { id: versionId },
      select: { termsId: true, status: true },
    })

    if (!version) {
      return createFailure('バージョンが見つかりません')
    }

    if (version.status === TermsStatus.PUBLISHED) {
      return createFailure('このバージョンは既に公開されています')
    }

    await prisma.$transaction(async (tx) => {
      // 既存の isCurrentVersion をすべて false に
      await tx.termsVersion.updateMany({
        where: {
          termsId: version.termsId,
          isCurrentVersion: true,
        },
        data: { isCurrentVersion: false },
      })

      // 対象バージョンを公開
      await tx.termsVersion.update({
        where: { id: versionId },
        data: {
          status: TermsStatus.PUBLISHED,
          isCurrentVersion: true,
          publishedAt: new Date(),
          publishedBy: user.id,
        },
      })
    })

    updateTag(CACHE_TAGS.TERMS)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgeTermsCache(), { operation: 'purgeTermsCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('バージョンを公開しました')
  }
)

/**
 * バージョンをアーカイブ
 */
export const archiveTermsVersion = withPermission<[string]>('terms', 'update')(
  async (_user, versionId): Promise<ActionResult<void>> => {
    const version = await prisma.termsVersion.findUnique({
      where: { id: versionId },
      select: { isCurrentVersion: true },
    })

    if (!version) {
      return createFailure('バージョンが見つかりません')
    }

    if (version.isCurrentVersion) {
      return createFailure('現在有効なバージョンはアーカイブできません')
    }

    await prisma.termsVersion.update({
      where: { id: versionId },
      data: { status: TermsStatus.ARCHIVED },
    })

    updateTag(CACHE_TAGS.TERMS)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgeTermsCache(), { operation: 'purgeTermsCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('バージョンをアーカイブしました')
  }
)

/**
 * バージョンを削除（DRAFTのみ）
 */
export const deleteTermsVersion = withPermission<[string]>('terms', 'delete')(
  async (_user, versionId): Promise<ActionResult<void>> => {
    const version = await prisma.termsVersion.findUnique({
      where: { id: versionId },
      select: { status: true },
    })

    if (!version) {
      return createFailure('バージョンが見つかりません')
    }

    if (version.status !== TermsStatus.DRAFT) {
      return createFailure('公開済みまたはアーカイブ済みのバージョンは削除できません')
    }

    await prisma.termsVersion.delete({ where: { id: versionId } })

    updateTag(CACHE_TAGS.TERMS)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgeTermsCache(), { operation: 'purgeTermsCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('バージョンを削除しました')
  }
)

// =============================================================================
// Site-Wide Terms SEO Management
// =============================================================================

/**
 * サイト全体規約のSEO情報を取得（利用規約ページ用）
 */
export const getSiteWideTermsSeo = withPermission<[], SiteWideTermsSeo | null>('terms', 'read')(
  async (_user): Promise<ActionResult<SiteWideTermsSeo | null>> => {
    const terms = await prisma.terms.findFirst({
      where: {
        type: TermsType.TERMS_OF_USE,
        isSiteWide: true,
      },
      select: {
        id: true,
        title: true,
        metaDescription: true,
        metaKeywords: true,
        ogpTitle: true,
        ogpDescription: true,
        ogpImageUrl: true,
      },
    })

    return createSuccess('SEO情報を取得しました', terms)
  }
)

/**
 * サイト全体規約のSEO情報を更新
 */
export const updateSiteWideTermsSeo = withPermission<[UpdateTermsSeoInput]>('terms', 'update')(
  async (_user, input): Promise<ActionResult<void>> => {
    const validation = updateTermsSeoSchema.safeParse(input)
    if (!validation.success) {
      return createValidationError(validation.error)
    }

    const terms = await prisma.terms.findFirst({
      where: {
        type: TermsType.TERMS_OF_USE,
        isSiteWide: true,
      },
      select: { id: true },
    })

    if (!terms) {
      return createFailure('サイト全体の利用規約が見つかりません')
    }

    await prisma.terms.update({
      where: { id: terms.id },
      data: {
        metaDescription: validation.data.metaDescription || null,
        metaKeywords: validation.data.metaKeywords || null,
        ogpTitle: validation.data.ogpTitle || null,
        ogpDescription: validation.data.ogpDescription || null,
        ogpImageUrl: validation.data.ogpImageUrl || null,
      },
    })

    updateTag(CACHE_TAGS.TERMS)

    // Cloudflare CDN キャッシュパージ
    fireAndForget(purgeTermsCache(), { operation: 'purgeTermsCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('SEO設定を更新しました')
  }
)
