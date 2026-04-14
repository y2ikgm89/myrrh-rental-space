/**
 * インライン記事エディタ サイドパネル型定義
 *
 * 記事設定（メタデータ・分類・SEO 等）は SettingsDialog で表示する。
 * 本ファイルはダイアログのタブ・セクション・render コンテキストの型を提供する。
 */

import type { ReactNode } from "react";
import type {
  FieldValues,
  UseFormRegister,
  Control,
  FieldErrors,
  UseFormSetValue,
  UseFormGetValues,
} from "react-hook-form";
import type { PostStatus } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// フィールドコンポーネントの Props 型
// =============================================================================

/**
 * 汎用フィールドコンポーネント Props
 */
export type FieldComponentProps<T extends FieldValues> = {
  register: UseFormRegister<T>;
  control: Control<T>;
  errors: FieldErrors<T>;
  setValue: UseFormSetValue<T>;
  getValues?: UseFormGetValues<T>;
  disabled?: boolean;
};

// =============================================================================
// サイドパネル設定（コンテンツ種別ごとに TForm / TExtra を束ねる）
// =============================================================================

/**
 * サイドパネルが RHF に注入する共通プロパティ（getValues は必須）
 */
export type SidePanelInjectedProps<T extends FieldValues> = {
  register: UseFormRegister<T>;
  control: Control<T>;
  errors: FieldErrors<T>;
  setValue: UseFormSetValue<T>;
  getValues: UseFormGetValues<T>;
  disabled?: boolean;
};

/**
 * カテゴリオプション
 */
export type CategoryOption = {
  id: string;
  name: string;
  slug?: string;
};

/**
 * タグオプション（エディターフックのタグ一覧と整合。slug は未取得時に欠ける）
 */
export type TagOption = {
  id: string;
  name: string;
  slug?: string;
  _count?: { posts: number };
};

/**
 * 投稿エディタの設定ダイアログにのみ渡す追加データ
 */
export type PostSidePanelExtra = {
  categories: readonly CategoryOption[];
  availableTags: readonly TagOption[];
  onCreateCategory: (name: string) => Promise<CategoryOption | null>;
  onCreateTag: (name: string) => Promise<TagOption | null>;
  statusValue: PostStatus;
  onStatusChange: (value: PostStatus) => void;
};

/**
 * お知らせエディタの設定ダイアログにのみ渡す追加データ
 */
export type NewsSidePanelExtra = {
  isPublishedValue: boolean;
  onIsPublishedChange: (value: boolean) => void;
};

/**
 * セクション `render` に渡すコンテキスト（RHF + コンテンツ種別固有の extra）
 */
export type SidePanelRenderContext<
  TForm extends FieldValues,
  TExtra extends Record<string, unknown>,
> = SidePanelInjectedProps<TForm> & TExtra;

export type SidePanelSectionDefinition<
  TForm extends FieldValues,
  TExtra extends Record<string, unknown>,
> = {
  title: string;
  render: (ctx: SidePanelRenderContext<TForm, TExtra>) => ReactNode;
};

export type SidePanelTabDefinition<
  TForm extends FieldValues,
  TExtra extends Record<string, unknown>,
> = {
  id: string;
  label: string;
  sections: readonly SidePanelSectionDefinition<TForm, TExtra>[];
};

/**
 * サイドパネル設定（タブ配下は `render(ctx)` で型安全に記述）
 */
export type SidePanelDefinition<
  TForm extends FieldValues,
  TExtra extends Record<string, unknown> = Record<string, never>,
> = {
  title: string;
  description?: string;
  tabStorageKey?: string;
  /** ダイアログ採用後は未使用だが、既存の content-types 設定との互換のため保持 */
  width: "default" | "narrow";
  tabs: readonly SidePanelTabDefinition<TForm, TExtra>[];
};

// =============================================================================
// フォームフィールド共通型
// =============================================================================

/**
 * SEO 関連フィールド
 */
export type SEOFormFields = {
  metaDescription?: string;
  metaKeywords?: string;
};

/**
 * OGP 関連フィールド
 */
export type OGPFormFields = {
  ogpTitle?: string;
  ogpDescription?: string;
  ogpImageUrl?: string;
};

/**
 * isPublished 方式の公開設定フィールド
 */
export type BooleanPublishFormFields = {
  isPublished: boolean;
  publishedAt?: string;
};

/**
 * status 方式の公開設定フィールド
 */
export type StatusPublishFormFields = {
  status: PostStatus;
  publishedAt?: string;
};

/**
 * レイアウト設定フィールド
 */
export type LayoutFormFields = {
  contentWidth?: string;
  contentWidthCustom?: string;
};

/**
 * コンテンツ基本フィールド
 */
export type ContentBaseFormFields = {
  title: string;
  contentJson: string;
};

// =============================================================================
// サイドパネル共通フィールド名定数
// =============================================================================

/** SEO フィールド名（SEOFields コンポーネント用） */
export const SEO_FIELD_NAMES = {
  metaDescription: "metaDescription",
  metaKeywords: "metaKeywords",
} as const;

/** OGP フィールド名（OGPFields コンポーネント用） */
export const OGP_FIELD_NAMES = {
  ogpTitle: "ogpTitle",
  ogpDescription: "ogpDescription",
  ogpImageUrl: "ogpImageUrl",
} as const;

// =============================================================================
// サイドパネル render 用ユーティリティ
// =============================================================================

/**
 * exactOptionalPropertyTypes 下で `disabled={undefined}` を渡さないためのスプレッド用オブジェクト
 */
export function spreadOptionalDisabled(ctx: {
  disabled?: boolean;
}): { disabled: boolean } | Record<string, never> {
  return ctx.disabled !== undefined ? { disabled: ctx.disabled } : {};
}
