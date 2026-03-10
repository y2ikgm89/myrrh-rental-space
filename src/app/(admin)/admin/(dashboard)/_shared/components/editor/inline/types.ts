/**
 * インラインエディター型定義
 */

import type { ReactNode } from "react";
import type {
  FieldError,
  FieldErrors,
  FieldValues,
  UseFormRegister,
  UseFormSetValue,
  Control,
  Path,
  FieldPathByValue,
} from "react-hook-form";
import type { PostStatus } from "@/shared/db/enums";

// =============================================================================
// 共有フィールド型（複数エディターで共通のフィールド）
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
 * 公開設定フィールド（isPublished方式）
 */
export type PublishFormFields = {
  isPublished: boolean;
  publishedAt?: string;
};

/**
 * 投稿公開設定フィールド（status方式）
 */
export type PostPublishFormFields = {
  status: PostStatus;
  publishedAt?: string;
};

// =============================================================================
// 型安全ユーティリティ
// =============================================================================

/**
 * FieldErrorからメッセージを安全に取得
 */
export function getErrorMessage(
  error: FieldError | undefined,
): string | undefined {
  if (!error) return undefined;
  if (typeof error.message === "string") return error.message;
  return undefined;
}

/**
 * オブジェクトかどうかを判定する型ガード
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * FieldErrorかどうかを判定する型ガード
 */
function isFieldError(value: unknown): value is FieldError {
  if (!isRecord(value)) return false;
  return "type" in value && typeof value["type"] === "string";
}

/**
 * FieldErrorsから特定フィールドのエラーを取得
 */
export function getFieldError<T extends FieldValues>(
  errors: FieldErrors<T>,
  name: Path<T>,
): FieldError | undefined {
  // Path<T>はネストされたパスも含むが、ここではトップレベルのみ対応
  const segments = name.split(".");
  let current: unknown = errors;

  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }

  if (isFieldError(current)) {
    return current;
  }
  return undefined;
}

// =============================================================================
// エディターフォームデータ型
// =============================================================================

/**
 * エディターヘッダープロパティ
 */
export type EditorHeaderProps = {
  title: string;
  slug: string;
  isDirty: boolean;
  isPending: boolean;
  onSave: () => void;
  onBack: () => void;
  /** サイドパネル開閉状態（省略時は設定ボタン非表示） */
  isSidePanelOpen?: boolean;
  /** サイドパネル切り替えコールバック（省略時は設定ボタン非表示） */
  onToggleSidePanel?: () => void;
  /** プレビューコールバック（省略時はプレビューボタン非表示） */
  onPreview?: () => void;
  extraActions?: ReactNode | undefined;
  /** 公開/非公開ボタンの表示（status方式: PostStatus, isPublished方式: boolean） */
  publishActions?:
    | {
        status: PostStatus | boolean;
        onPublish: () => void;
        onUnpublish: () => void;
      }
    | undefined;
  /** コメントボタンの表示 */
  showCommentButton?: boolean;
  /** コメントパネルの開閉状態 */
  isCommentPanelOpen?: boolean;
  /** コメントパネル切り替えコールバック */
  onToggleCommentPanel?: () => void;
  /** コメント数（バッジ表示用） */
  commentCount?: number;
};

/**
 * サイドパネルセクションプロパティ（ジェネリック）
 *
 * @template T - フォームデータ型（FieldValuesを継承）
 */
export type SidePanelSectionProps<T extends FieldValues = FieldValues> = {
  register: UseFormRegister<T>;
  control: Control<T>;
  errors: FieldErrors<T>;
  setValue?: UseFormSetValue<T>;
  disabled?: boolean;
};

// =============================================================================
// フィールドコンポーネント用Props（型安全版）
// =============================================================================

/**
 * SEOフィールド用プロパティ
 * フィールド名をPath<T>として受け取ることで型安全性を確保
 */
export type SEOFieldsProps<T extends FieldValues> = {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  disabled?: boolean;
  /** フィールド名マッピング */
  fields: {
    metaDescription: Path<T>;
    metaKeywords: Path<T>;
  };
};

/**
 * OGPフィールド用プロパティ
 */
export type OGPFieldsProps<T extends FieldValues> = {
  register: UseFormRegister<T>;
  control: Control<T>;
  errors: FieldErrors<T>;
  setValue: UseFormSetValue<T>;
  disabled?: boolean;
  /** フィールド名マッピング */
  fields: {
    ogpTitle: FieldPathByValue<T, string | null | undefined>;
    ogpDescription: FieldPathByValue<T, string | null | undefined>;
    ogpImageUrl: FieldPathByValue<T, string | null | undefined>;
  };
};

// =============================================================================
// フィールド名定数（型安全なマッピング用）
// =============================================================================

/** PostEditorFormData用のSEOフィールド名 */
export const POST_SEO_FIELDS = {
  metaDescription: "metaDescription",
  metaKeywords: "metaKeywords",
} as const satisfies { [K in keyof SEOFormFields]-?: Path<PostEditorFormData> };

/** PostEditorFormData用のOGPフィールド名 */
export const POST_OGP_FIELDS = {
  ogpTitle: "ogpTitle",
  ogpDescription: "ogpDescription",
  ogpImageUrl: "ogpImageUrl",
} as const satisfies { [K in keyof OGPFormFields]-?: Path<PostEditorFormData> };

/** PostEditorFormData用の公開設定フィールド名 */
export const POST_PUBLISH_FIELDS = {
  status: "status",
  publishedAt: "publishedAt",
} as const satisfies {
  [K in keyof PostPublishFormFields]-?: Path<PostEditorFormData>;
};

/**
 * インラインエディターレイアウトプロパティ
 */
export type InlineEditorLayoutProps = {
  children: ReactNode;
  /** サイドパネルの開閉状態（デスクトップでのマージン調整用） */
  isSidePanelOpen?: boolean;
  /** サイドパネルの幅タイプ（デフォルト: 420px、narrow: 384px） */
  sidePanelWidth?: "default" | "narrow";
};

/**
 * 投稿編集用フォームデータ
 */
export type PostEditorFormData = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  thumbnailUrl: string;
  categoryId: string;
  tags?: string;
  contentWidth?: string;
  contentWidthCustom?: string;
} & SEOFormFields &
  OGPFormFields &
  PostPublishFormFields;

/**
 * 投稿カテゴリオプション
 */
export type PostCategoryOption = {
  id: string;
  name: string;
};

/**
 * ニュース編集用フォームデータ
 * Note: status方式からisPublished方式に移行
 */
export type NewsEditorFormData = {
  title: string;
  content: string;
  contentWidth?: string;
  contentWidthCustom?: string;
} & SEOFormFields &
  OGPFormFields &
  PublishFormFields;

/** NewsEditorFormData用のSEOフィールド名 */
export const NEWS_SEO_FIELDS = {
  metaDescription: "metaDescription",
  metaKeywords: "metaKeywords",
} as const satisfies { [K in keyof SEOFormFields]-?: Path<NewsEditorFormData> };

/** NewsEditorFormData用のOGPフィールド名 */
export const NEWS_OGP_FIELDS = {
  ogpTitle: "ogpTitle",
  ogpDescription: "ogpDescription",
  ogpImageUrl: "ogpImageUrl",
} as const satisfies { [K in keyof OGPFormFields]-?: Path<NewsEditorFormData> };

/** NewsEditorFormData用の公開設定フィールド名 */
export const NEWS_PUBLISH_FIELDS = {
  isPublished: "isPublished",
  publishedAt: "publishedAt",
} as const satisfies {
  [K in keyof PublishFormFields]-?: Path<NewsEditorFormData>;
};

/**
 * スペース編集用フォームデータ
 */
export type SpaceEditorFormData = {
  name: string;
  description: string;
  address: string;
  access?: string;
  capacity: number;
  area?: number;
  hourlyPrice: number;
  dailyPrice?: number;
  mainImageUrl: string;
  imageUrls: string[];
  facilities: string[];
  categoryId?: string;
  locationId?: string;
  termsId?: string;
  contentWidth?: string;
  contentWidthCustom?: string;
} & SEOFormFields &
  OGPFormFields &
  PublishFormFields;

/** SpaceEditorFormData用のSEOフィールド名 */
export const SPACE_SEO_FIELDS = {
  metaDescription: "metaDescription",
  metaKeywords: "metaKeywords",
} as const satisfies {
  [K in keyof SEOFormFields]-?: Path<SpaceEditorFormData>;
};

/** SpaceEditorFormData用のOGPフィールド名 */
export const SPACE_OGP_FIELDS = {
  ogpTitle: "ogpTitle",
  ogpDescription: "ogpDescription",
  ogpImageUrl: "ogpImageUrl",
} as const satisfies {
  [K in keyof OGPFormFields]-?: Path<SpaceEditorFormData>;
};

/** SpaceEditorFormData用の公開設定フィールド名 */
export const SPACE_PUBLISH_FIELDS = {
  isPublished: "isPublished",
  publishedAt: "publishedAt",
} as const satisfies {
  [K in keyof PublishFormFields]-?: Path<SpaceEditorFormData>;
};

/**
 * FAQ編集用フォームデータ
 */
export type FaqEditorFormData = {
  question: string;
  answerJson: string;
  categoryId: string;
  order: number;
} & SEOFormFields &
  OGPFormFields &
  PublishFormFields;

/** FaqEditorFormData用のSEOフィールド名 */
export const FAQ_SEO_FIELDS = {
  metaDescription: "metaDescription",
  metaKeywords: "metaKeywords",
} as const satisfies { [K in keyof SEOFormFields]-?: Path<FaqEditorFormData> };

/** FaqEditorFormData用のOGPフィールド名 */
export const FAQ_OGP_FIELDS = {
  ogpTitle: "ogpTitle",
  ogpDescription: "ogpDescription",
  ogpImageUrl: "ogpImageUrl",
} as const satisfies { [K in keyof OGPFormFields]-?: Path<FaqEditorFormData> };

/** FaqEditorFormData用の公開設定フィールド名 */
export const FAQ_PUBLISH_FIELDS = {
  isPublished: "isPublished",
  publishedAt: "publishedAt",
} as const satisfies {
  [K in keyof PublishFormFields]-?: Path<FaqEditorFormData>;
};

/**
 * カテゴリオプション（汎用）
 */
export type CategoryOption = {
  id: string;
  name: string;
};
