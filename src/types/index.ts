/**
 * 共通型定義の再エクスポート
 */

export {
  type ActionResult,
  type ActionSuccess,
  type ActionFailure,
  type AuditUser,
  createSuccess,
  createFailure,
  isActionSuccess,
  isActionFailure,
  withAuth,
  withPermission,
  withReadPermission,
  withRole,
} from './server-actions'

export {
  type SpaceWhereInput,
  type ReservationWhereInput,
  type BlogPostWhereInput,
  type CustomerWhereInput,
  type InquiryWhereInput,
  type NewsWhereInput,
  type BlogCategoryWhereInput,
  type UserWhereInput,
  type PageWhereInput,
  type BlogCommentWhereInput,
} from './prisma'
