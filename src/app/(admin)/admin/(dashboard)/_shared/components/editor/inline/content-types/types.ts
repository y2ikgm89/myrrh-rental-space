/**
 * 統一ContentEditor型定義
 *
 * 設定駆動型アーキテクチャで、各コンテンツタイプの設定オブジェクトで
 * エディタの挙動を制御する。
 */

import type { ReactNode } from "react";
import type { ZodSchema } from "zod";
import type {
  FieldValues,
  UseFormRegister,
  Control,
  FieldErrors,
  UseFormSetValue,
  UseFormGetValues,
} from "react-hook-form";
import type { PostStatus } from "@/shared/db/enums";
import type { MutationResult } from "@/shared/lib/mutation-result";

// =============================================================================
// コンテンツタイプID
// =============================================================================

/** インライン `content-types` で登録済みの種別のみ（固定ページは別管理画面） */
export type ContentTypeId = "post" | "news";

// =============================================================================
// 公開方式の型
// =============================================================================

/**
 * status方式の公開制御設定
 */
export type StatusPublishControl = {
  type: "status";
  statusEnum: typeof PostStatus;
};

/**
 * isPublished方式の公開制御設定
 */
export type BooleanPublishControl = {
  type: "isPublished";
};

/**
 * 公開制御設定
 */
export type PublishControl = StatusPublishControl | BooleanPublishControl;

// =============================================================================
// フィールドコンポーネントのProps型
// =============================================================================

/**
 * 汎用フィールドコンポーネントProps
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
 * 投稿エディタのサイドパネルにのみ渡す追加データ（フォーム外のオプション・派生状態）
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
 * お知らせエディタのサイドパネルにのみ渡す追加データ
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
  width: "default" | "narrow";
  tabs: readonly SidePanelTabDefinition<TForm, TExtra>[];
};

// =============================================================================
// 機能フラグ
// =============================================================================

/**
 * コンテンツタイプの機能フラグ
 */
export type ContentFeatures = {
  /** 新規作成機能 */
  create: boolean;
  /** 削除機能 */
  delete: boolean;
  /** 公開/非公開機能 */
  publish: boolean;
  /** コメント機能 */
  comments: boolean;
};

// =============================================================================
// Server Actions型
// =============================================================================

/**
 * 公開/非公開アクションの結果型
 */
export type PublishActionResult = MutationResult<{ version: number } | null>;

/**
 * コンテンツタイプのServer Actions
 */
export type ContentActions<TSubmitPayload> = {
  /** 新規作成 */
  create?: (payload: TSubmitPayload) => Promise<MutationResult<{ id: string }>>;
  /** 更新 */
  update: (id: string, payload: TSubmitPayload) => Promise<MutationResult>;
  /** 削除 */
  delete?: (id: string) => Promise<MutationResult>;
  /** 公開 */
  publish?: (id: string) => Promise<PublishActionResult>;
  /** 非公開 */
  unpublish?: (id: string) => Promise<PublishActionResult>;
};

// =============================================================================
// データ変換型
// =============================================================================

/**
 * データ変換関数群
 */
export type ContentTransforms<TData, TFormData, TPreviewData, TSubmitPayload> =
  {
    /** DBデータ → フォームデータ */
    toFormData: (data?: TData) => TFormData;
    /** フォームデータ → 送信ペイロード */
    toSubmitPayload: (formData: TFormData) => TSubmitPayload;
    /** フォームデータ → プレビューデータ */
    toPreviewData: (
      formData: TFormData,
      data?: TData,
      extraData?: ContentEditorExtraData,
    ) => TPreviewData;
  };

// =============================================================================
// 追加データ型（コンテンツタイプ固有）
// =============================================================================

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
 * ContentEditorに渡す追加データ
 */
export type ContentEditorExtraData = {
  /** カテゴリ一覧（Post用） */
  categories?: CategoryOption[];
  /** タグ一覧（Post用） */
  tags?: TagOption[];
  /** カテゴリ作成コールバック */
  onCreateCategory?: (name: string) => Promise<CategoryOption | null>;
  /** タグ作成コールバック */
  onCreateTag?: (name: string) => Promise<TagOption | null>;
};

// =============================================================================
// 統合設定型
// =============================================================================

/**
 * コンテンツタイプ設定
 *
 * @template TData - DBエンティティ型（PostData等）
 * @template TFormData - フォームデータ型
 * @template TPreviewData - プレビューデータ型
 * @template TSubmitPayload - Server Actions送信ペイロード型
 */
export type ContentTypeConfig<
  TData extends { id: string },
  TFormData extends FieldValues,
  TPreviewData,
  TSubmitPayload = unknown,
  TSideExtra extends Record<string, unknown> = Record<string, never>,
> = {
  // === 基本情報 ===
  /** コンテンツタイプID */
  id: ContentTypeId;
  /** 表示ラベル */
  label: string;
  /** 一覧ページパス */
  listPath: string;
  /** スラッグプレフィックス（URL表示用） */
  slugPrefix: string;
  /** プレビューベースパス */
  previewBasePath: string;

  // === スキーマ ===
  /** フォームバリデーションスキーマ */
  formSchema: ZodSchema<TFormData>;

  // === 機能フラグ ===
  /** 有効な機能 */
  features: ContentFeatures;

  // === 公開制御 ===
  /** 公開方式設定 */
  publishControl: PublishControl;

  // === データ変換 ===
  /** データ変換関数群 */
  transforms: ContentTransforms<TData, TFormData, TPreviewData, TSubmitPayload>;

  // === Server Actions ===
  /** CRUD操作 */
  actions: ContentActions<TSubmitPayload>;

  // === サイドパネル ===
  /** サイドパネル設定 */
  sidePanel: SidePanelDefinition<TFormData, TSideExtra>;
};

// =============================================================================
// ContentEditorコンポーネントProps
// =============================================================================

/**
 * ContentEditorコンポーネントのProps
 */
export type ContentEditorProps<
  TData extends { id: string },
  TFormData extends FieldValues,
  TPreviewData,
  TSubmitPayload = unknown,
  TSideExtra extends Record<string, unknown> = Record<string, never>,
> = {
  /** コンテンツタイプ設定 */
  config: ContentTypeConfig<
    TData,
    TFormData,
    TPreviewData,
    TSubmitPayload,
    TSideExtra
  >;
  /** 編集対象データ（編集モード時） */
  data?: TData;
  /** 編集モード */
  mode?: "create" | "edit";
  /** 追加データ（カテゴリ、タグ等） */
  extraData?: ContentEditorExtraData;
};

// =============================================================================
// UnifiedSidePanelのProps型
// =============================================================================

/**
 * 統一サイドパネルのProps
 */
export type UnifiedSidePanelProps<
  TForm extends FieldValues,
  TExtra extends Record<string, unknown> = Record<string, never>,
> = {
  isOpen: boolean;
  onClose: () => void;
  config: SidePanelDefinition<TForm, TExtra>;
  register: UseFormRegister<TForm>;
  control: Control<TForm>;
  errors: FieldErrors<TForm>;
  setValue: UseFormSetValue<TForm>;
  getValues: UseFormGetValues<TForm>;
  disabled?: boolean;
  /** コンテンツ種別固有（カテゴリ一覧・公開トグル用の派生値など） */
  extraProps: TExtra;
};

// =============================================================================
// フォームフィールド共通型
// =============================================================================

/**
 * SEO関連フィールド
 */
export type SEOFormFields = {
  metaDescription?: string;
  metaKeywords?: string;
};

/**
 * OGP関連フィールド
 */
export type OGPFormFields = {
  ogpTitle?: string;
  ogpDescription?: string;
  ogpImageUrl?: string;
};

/**
 * isPublished方式の公開設定フィールド
 */
export type BooleanPublishFormFields = {
  isPublished: boolean;
  publishedAt?: string;
};

/**
 * status方式の公開設定フィールド
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

// =============================================================================
// 型ガード
// =============================================================================

/**
 * status方式の公開制御かどうかを判定
 */
export function isStatusPublishControl(
  control: PublishControl,
): control is StatusPublishControl {
  return control.type === "status";
}

/**
 * isPublished方式の公開制御かどうかを判定
 */
export function isBooleanPublishControl(
  control: PublishControl,
): control is BooleanPublishControl {
  return control.type === "isPublished";
}
