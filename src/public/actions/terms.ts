'use server'

import { createHash } from 'crypto'
import { prisma } from '@/shared/lib/prisma'
import { cache } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { TermsStatus } from '@/shared/generated/prisma/enums'
import {
  recordTermsAgreementSchema,
  type RecordTermsAgreementInput,
  type TermsWithVersion,
} from '@/shared/lib/validations/terms'
import { createSuccess, createFailure, type ActionResult } from '@/shared/types/server-actions'

/**
 * 値をSHA-256でハッシュ化（IPアドレスの匿名化用）
 */
function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * スペースに紐づく規約を取得（公開用）
 *
 * Next.js 16 PPR対応: キャッシュ可能な関数
 */
export const getTermsForSpace = cache(async (spaceId: string): Promise<TermsWithVersion | null> => {
  'use cache'
  cacheLife('hours')
  cacheTag('terms', `space-terms-${spaceId}`)

  const space = await prisma.space.findUnique({
    where: { id: spaceId, isPublished: true, isActive: true },
    select: {
      termsId: true,
      terms: {
        select: {
          id: true,
          type: true,
          title: true,
          slug: true,
          isActive: true,
          versions: {
            where: {
              isCurrentVersion: true,
              status: TermsStatus.PUBLISHED,
            },
            take: 1,
            select: {
              id: true,
              version: true,
              content: true,
              publishedAt: true,
            },
          },
        },
      },
    },
  })

  // 規約が設定されていない or 無効 or 公開バージョンがない場合はnull
  if (!space?.terms || !space.terms.isActive || !space.terms.versions[0]) {
    return null
  }

  return {
    id: space.terms.id,
    type: space.terms.type,
    title: space.terms.title,
    slug: space.terms.slug,
    isActive: space.terms.isActive,
    currentVersion: {
      id: space.terms.versions[0].id,
      version: space.terms.versions[0].version,
      content: space.terms.versions[0].content,
      publishedAt: space.terms.versions[0].publishedAt!,
    },
  }
})

/**
 * 規約同意を記録
 *
 * 予約作成時に呼び出される
 */
export async function recordTermsAgreement(
  input: RecordTermsAgreementInput
): Promise<ActionResult<{ agreementId: string }>> {
  const validation = recordTermsAgreementSchema.safeParse(input)
  if (!validation.success) {
    return createFailure(validation.error.issues[0].message)
  }

  // 規約とバージョンの存在確認
  const version = await prisma.termsVersion.findUnique({
    where: { id: validation.data.versionId },
    select: {
      termsId: true,
      status: true,
    },
  })

  if (!version) {
    return createFailure('規約バージョンが見つかりません')
  }

  if (version.status !== TermsStatus.PUBLISHED) {
    return createFailure('無効な規約バージョンです')
  }

  if (version.termsId !== validation.data.termsId) {
    return createFailure('規約IDとバージョンIDが一致しません')
  }

  const agreement = await prisma.termsAgreement.create({
    data: {
      termsId: validation.data.termsId,
      versionId: validation.data.versionId,
      reservationId: validation.data.reservationId,
      userId: validation.data.userId,
      guestName: validation.data.guestName,
      guestEmail: validation.data.guestEmail,
      ipAddress: validation.data.ipAddress ? hashValue(validation.data.ipAddress) : undefined,
      userAgent: validation.data.userAgent?.slice(0, 500), // 長すぎる場合は切り詰め
    },
  })

  return createSuccess('規約同意を記録しました', { agreementId: agreement.id })
}

/**
 * 予約に紐づく規約同意記録を取得
 */
export async function getTermsAgreementsForReservation(reservationId: string) {
  const agreements = await prisma.termsAgreement.findMany({
    where: { reservationId },
    include: {
      terms: {
        select: {
          title: true,
          type: true,
        },
      },
      version: {
        select: {
          version: true,
        },
      },
    },
    orderBy: { agreedAt: 'desc' },
  })

  return agreements
}
