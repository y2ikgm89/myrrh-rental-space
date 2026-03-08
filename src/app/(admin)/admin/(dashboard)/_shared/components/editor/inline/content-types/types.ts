/**
 * 統一ContentEditor型定義
 *
 * 設定駆動型アーキテクチャで、各コンテンツタイプの設定オブジェクトで
 * エディタの挙動を制御する。
 */

import type { ComponentType } from "react";
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
import type { ActionResult } from "@/admin/types/server-actions";

// =============================================================================
// コンテンツタイプID
// =============================================================================

export type ContentTypeId = "post" | "news" | "page";

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
// サイドパネル設定
// =============================================================================

/**
 * サイドパネルセクション定義
 */
export type SectionDefinition = {
  /** セクションタイトル */
  title: string;
  /** フィールドコンポーネント */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  /** コンポーネントに渡す追加Props */
  props?: Record<string, unknown>;
};

/**
 * サイドパネルタブ定義
 */
export type TabDefinition = {
  /** タブID */
  id: string;
  /** タブラベル */
  label: string;
  /** タブ内のセクション */
  sections: SectionDefinition[];
};

/**
 * サイドパネル設定
 */
export type SidePanelConfig = {
  /** パネルタイトル */
  title: string;
  /** パネル幅 */
  width: "default" | "narrow";
  /** タブ定義 */
  tabs: TabDefinition[];
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
export type PublishActionResult =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
    };

/**
 * コンテンツタイプのServer Actions
 */
export type ContentActions<TSubmitPayload> = {
  /** 新規作成 */
  create?: (payload: TSubmitPayload) => Promise<ActionResult<{ id: string }>>;
  /** 更新 */
  update: (id: string, payload: TSubmitPayload) => Promise<ActionResult>;
  /** 削除 */
  delete?: (id: string) => Promise<ActionResult>;
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
 * タグオプション
 */
export type TagOption = {
  id: string;
  name: string;
  slug: string;
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
  sidePanel: SidePanelConfig;
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
> = {
  /** コンテンツタイプ設定 */
  config: ContentTypeConfig<TData, TFormData, TPreviewData, TSubmitPayload>;
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
export type UnifiedSidePanelProps<T extends FieldValues = FieldValues> = {
  /** 開閉状態 */
  isOpen: boolean;
  /** 閉じる時のコールバック */
  onClose: () => void;
  /** サイドパネル設定 */
  config: SidePanelConfig;
  /** react-hook-form register */
  register: UseFormRegister<T>;
  /** react-hook-form control */
  control: Control<T>;
  /** フォームエラー */
  errors: FieldErrors<T>;
  /** setValue関数 */
  setValue: UseFormSetValue<T>;
  /** getValues関数 */
  getValues?: UseFormGetValues<T>;
  /** 無効化フラグ */
  disabled?: boolean;
  /** 追加Props（コンテンツタイプ固有のデータ） */
  extraProps?: Record<string, unknown>;
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

// =============================================================================
// RHF setValue ヘルパー
// =============================================================================

/**
 * React Hook Form の setValue で string 値をセットする
 *
 * ジェネリックコンポーネントで setValue(path, stringValue) を呼ぶ際、
 * TypeScript は string が PathValue<T, Path<T>> を満たすことを証明できない。
 * JSON.parse が返す any 型を利用してジェネリック境界を橋渡しする。
 */
export function setFieldString<T extends FieldValues>(
  setValue: UseFormSetValue<T>,
  name: string,
  value: string,
  options?: { shouldDirty?: boolean; shouldValidate?: boolean },
): void {
  // JSON.parse(JSON.stringify(x)) returns `any` → PathValue<T, Path<T>> に暗黙代入可能
  setValue(
    JSON.parse(JSON.stringify(name)),
    JSON.parse(JSON.stringify(value)),
    options,
  );
}
