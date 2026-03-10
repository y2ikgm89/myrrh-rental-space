/**
 * 共有型定義エクスポート
 */

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
} from "./prisma";

// Layout types
export { type LayoutConfig, type ContentWidth } from "./layout";

// Preview types
export {
  type PostPreviewData,
  type NewsPreviewData,
  type PreviewData,
  PREVIEW_EXPIRY_MS,
  PREVIEW_STORAGE_PREFIX,
  getPreviewStorageKey,
  isPreviewDataValid,
  PostPreviewContainerSchema,
  NewsPreviewContainerSchema,
  PreviewContainerSchema,
} from "./preview";
