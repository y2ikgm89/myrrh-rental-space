/**
 * 共有型定義エクスポート
 */

// JSON fields
export {
  type TimeSlot,
  type DayOfWeek,
  type BusinessHours,
  DAYS_OF_WEEK,
  isBusinessHours,
  parseBusinessHours,
} from './json-fields'

// Prisma types
export {
  LayoutWidth,
  type SpaceWhereInput,
  type ReservationWhereInput,
  type PostWhereInput,
  type PostCategoryWhereInput,
  type PostCommentWhereInput,
  type CustomerWhereInput,
  type InquiryWhereInput,
  type NewsWhereInput,
  type UserWhereInput,
  type PageWhereInput,
} from './prisma'

// Layout types
export {
  type LayoutConfig,
  DEFAULT_LAYOUT_CONFIG,
} from './layout'

// Server action types
export {
  type ActionResult,
  type ActionSuccess,
  type ActionFailure,
  createSuccess,
  createFailure,
  isActionSuccess,
  isActionFailure,
} from './server-actions'

// Preview types
export {
  type PostPreviewData,
  type NewsPreviewData,
  type PagePreviewData,
  type PreviewData,
  PREVIEW_EXPIRY_MS,
  PREVIEW_STORAGE_PREFIX,
  getPreviewStorageKey,
  isPreviewDataValid,
  PostPreviewContainerSchema,
  NewsPreviewContainerSchema,
  PagePreviewContainerSchema,
  PreviewContainerSchema,
} from './preview'
