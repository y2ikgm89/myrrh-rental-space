/**
 * 設定ダイアログ定義のエクスポート
 *
 * Post / News インラインエディタの設定ダイアログ用 SidePanelDefinition と関連型。
 */

// 型定義
export type {
  CategoryOption,
  TagOption,
  SidePanelDefinition,
  SidePanelTabDefinition,
  SidePanelSectionDefinition,
  SidePanelRenderContext,
  SidePanelInjectedProps,
  PostSidePanelExtra,
  NewsSidePanelExtra,
  SEOFormFields,
  OGPFormFields,
  BooleanPublishFormFields,
  StatusPublishFormFields,
  LayoutFormFields,
  ContentBaseFormFields,
} from "./types";

// 設定ダイアログ定義
export { postSettingsPanel } from "./post";
export { newsSettingsPanel } from "./news";
