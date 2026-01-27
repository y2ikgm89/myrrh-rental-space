/**
 * Prisma型エイリアス
 *
 * タイポ防止とIDE補完を有効にするための型定義
 */

import type { Prisma } from '@/shared/generated/prisma/client'

// Re-export LayoutWidth from Prisma generated enums
export { LayoutWidth } from '@/shared/generated/prisma/enums'

/**
 * Where Input Types
 *
 * Prismaクエリのwhere句で使用する型
 * Record<string, unknown>の代わりにこれらを使用する
 *
 * @example
 * const where: SpaceWhereInput = {
 *   isActive: true,
 *   isPublished: true,
 * }
 */
export type SpaceWhereInput = Prisma.SpaceWhereInput
export type ReservationWhereInput = Prisma.ReservationWhereInput
export type PostWhereInput = Prisma.PostWhereInput
export type PostCategoryWhereInput = Prisma.PostCategoryWhereInput
export type PostCommentWhereInput = Prisma.PostCommentWhereInput
export type CustomerWhereInput = Prisma.CustomerWhereInput
export type InquiryWhereInput = Prisma.InquiryWhereInput
export type NewsWhereInput = Prisma.NewsWhereInput
export type UserWhereInput = Prisma.UserWhereInput
export type PageWhereInput = Prisma.PageWhereInput
