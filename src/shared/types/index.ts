/**
 * 共有型定義エクスポート
 */

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
