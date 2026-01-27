/**
 * コンテンツタイプ設定のエクスポート
 *
 * Post/News/Pageエディタの統一設定
 */

// 型定義
export type {
  // 基本型
  ContentTypeId,
  ContentTypeConfig,
  ContentEditorProps,
  ContentEditorExtraData,
  CategoryOption,
  TagOption,

  // サイドパネル型
  SidePanelConfig,
  TabDefinition,
  SectionDefinition,
  FieldComponentProps,
  UnifiedSidePanelProps,

  // 公開制御型
  PublishControl,
  StatusPublishControl,
  BooleanPublishControl,

  // フォームフィールド型
  SEOFormFields,
  OGPFormFields,
  BooleanPublishFormFields,
  StatusPublishFormFields,
  LayoutFormFields,
  ContentBaseFormFields,

  // Server Actions型
  ContentActions,
  PublishActionResult,

  // データ変換型
  ContentTransforms,
  ContentFeatures,
} from './types'

// 型ガード
export {
  isStatusPublishControl,
  isBooleanPublishControl,
} from './types'

// コンテンツタイプ設定
export { postConfig } from './post'
export { newsConfig } from './news'
export { pageConfig } from './page'
