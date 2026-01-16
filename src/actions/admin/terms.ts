'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath, revalidateTag } from 'next/cache'
import { TermsStatus } from '@/generated/prisma/client/enums'
import {
  createTermsSchema,
  updateTermsSchema,
  createTermsVersionSchema,
  updateTermsVersionSchema,
  type CreateTermsInput,
  type UpdateTermsInput,
  type CreateTermsVersionInput,
  type UpdateTermsVersionInput,
  type TermsWithVersion,
  type TermsDetail,
  type TermsVersionDetail,
} from '@/lib/validations/terms'
import { createSuccess, createFailure, withPermission, type ActionResult } from '@/types'

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
            content: true,
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
            content: t.versions[0].content,
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
      return createFailure(validation.error.issues[0].message)
    }

    // slug重複チェック
    const existing = await prisma.terms.findUnique({
      where: { slug: validation.data.slug },
    })

    if (existing) {
      return createFailure('このスラッグは既に使用されています')
    }

    const terms = await prisma.terms.create({
      data: validation.data,
    })

    revalidatePath('/admin/settings')
    revalidateTag('terms', { expire: 0 })

    return createSuccess('規約を作成しました', { id: terms.id })
  }
)

/**
 * 規約を更新
 */
export const updateTerms = withPermission<[string, UpdateTermsInput]>('terms', 'update')(
  async (_user, id, input): Promise<ActionResult<void>> => {
    const validation = updateTermsSchema.safeParse(input)
    if (!validation.success) {
      return createFailure(validation.error.issues[0].message)
    }

    // slug重複チェック（自分以外）
    if (validation.data.slug) {
      const existing = await prisma.terms.findFirst({
        where: {
          slug: validation.data.slug,
          id: { not: id },
        },
      })

      if (existing) {
        return createFailure('このスラッグは既に使用されています')
      }
    }

    await prisma.terms.update({
      where: { id },
      data: validation.data,
    })

    revalidatePath('/admin/settings')
    revalidateTag('terms', { expire: 0 })

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

    revalidatePath('/admin/settings')
    revalidateTag('terms', { expire: 0 })

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

    revalidatePath('/admin/settings')
    revalidateTag('terms', { expire: 0 })

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
      return createFailure(validation.error.issues[0].message)
    }

    // 最新バージョン番号を取得
    const latestVersion = await prisma.termsVersion.findFirst({
      where: { termsId: validation.data.termsId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })

    const nextVersion = (latestVersion?.version ?? 0) + 1

    const version = await prisma.termsVersion.create({
      data: {
        termsId: validation.data.termsId,
        content: validation.data.content,
        version: nextVersion,
        status: TermsStatus.DRAFT,
        createdBy: user.id,
      },
    })

    revalidatePath('/admin/settings')
    revalidateTag('terms', { expire: 0 })

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
    return createFailure(validation.error.issues[0].message)
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

  await prisma.termsVersion.update({
    where: { id: versionId },
    data: { content: validation.data.content },
  })

  revalidatePath('/admin/settings')
  revalidateTag('terms', { expire: 0 })

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

    revalidatePath('/admin/settings')
    revalidateTag('terms', { expire: 0 })

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

    revalidatePath('/admin/settings')
    revalidateTag('terms', { expire: 0 })

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

    revalidatePath('/admin/settings')
    revalidateTag('terms', { expire: 0 })

    return createSuccess('バージョンを削除しました')
  }
)
