// src/shared/lib/sections/field-helpers.ts
//
// フィールドヘルパー — Zod スキーマに FieldMeta を .describe() で埋め込む。
// 管理画面の AutoSectionForm はこのメタデータを読み取ってフォームを自動生成する。
//
// ⚠️ withMeta 内の `as T` は許可例外（type-safety.md §keysOf/entriesOf 境界ヘルパーパターン）

import { z } from "zod";

import type { FieldMeta, FieldType } from "./types";

// ─────────────────────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────────────────────

/**
 * Zod スキーマに FieldMeta を JSON エンコードして埋め込む境界ヘルパー。
 *
 * `as T` の型アサーションは、`.describe()` の戻り値型が `ZodType & { description: string }`
 * のような交差型になるため、呼び出し元に透過的な型を返すために必要。
 * type-safety.md §keysOf/entriesOf と同じ「境界ヘルパー」パターン — 呼び出し側で `as` 不要。
 */
function withMeta<T extends z.ZodType>(schema: T, meta: FieldMeta): T {
  return schema.describe(JSON.stringify(meta)) as T;
}

// ─────────────────────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────────────────────

/**
 * Zod スキーマの `.description` から FieldMeta を抽出する。
 * `.describe()` されていないスキーマは `undefined` を返す。
 */
export function extractFieldMeta(schema: z.ZodType): FieldMeta | undefined {
  const { description } = schema;
  if (!description) return undefined;
  try {
    const parsed: unknown = JSON.parse(description);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("fieldType" in parsed) ||
      !("label" in parsed)
    ) {
      return undefined;
    }
    return parsed as FieldMeta;
  } catch {
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────
// フィールドヘルパー
// ─────────────────────────────────────────────────────────────

interface TextOpts {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
}

interface TextareaOpts {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
}

interface NumberOpts {
  readonly min?: number;
  readonly max?: number;
  readonly suffix?: string;
  readonly helpText?: string;
  readonly default?: number;
}

interface BooleanOpts {
  readonly helpText?: string;
  readonly default?: boolean;
}

interface SelectOpts<T extends string> {
  readonly options: readonly T[];
  readonly default: NoInfer<T>;
  readonly helpText?: string;
  readonly placeholder?: string;
}

interface StringFieldOpts {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
}

interface ArrayItem {
  readonly [key: string]: z.ZodType;
}

interface ArrayOpts<TItem extends ArrayItem> {
  readonly fields: TItem;
  readonly helpText?: string;
}

function buildMeta(
  fieldType: FieldType,
  label: string,
  opts?: {
    placeholder: string | undefined;
    suffix: string | undefined;
    helpText: string | undefined;
  },
): FieldMeta {
  return {
    fieldType,
    label,
    ...(opts?.placeholder !== undefined && { placeholder: opts.placeholder }),
    ...(opts?.suffix !== undefined && { suffix: opts.suffix }),
    ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
  };
}

export const field = {
  /** 単一行テキスト入力 */
  text(label: string, opts?: TextOpts) {
    const schema = z.string().default(opts?.default ?? "");
    return withMeta(
      schema,
      buildMeta("text", label, {
        placeholder: opts?.placeholder,
        suffix: undefined,
        helpText: opts?.helpText,
      }),
    );
  },

  /** 複数行テキスト入力 */
  textarea(label: string, opts?: TextareaOpts) {
    const schema = z.string().default(opts?.default ?? "");
    return withMeta(
      schema,
      buildMeta("textarea", label, {
        placeholder: opts?.placeholder,
        suffix: undefined,
        helpText: opts?.helpText,
      }),
    );
  },

  /** 数値入力（min / max バリデーション付き） */
  number(label: string, opts?: NumberOpts) {
    let base = z.number();
    if (opts?.min !== undefined) {
      base = base.min(opts.min);
    }
    if (opts?.max !== undefined) {
      base = base.max(opts.max);
    }
    const schema = base.default(opts?.default ?? 0);
    return withMeta(
      schema,
      buildMeta("number", label, {
        placeholder: undefined,
        suffix: opts?.suffix,
        helpText: opts?.helpText,
      }),
    );
  },

  /** チェックボックス / トグル */
  boolean(label: string, opts?: BooleanOpts) {
    const schema = z.boolean().default(opts?.default ?? false);
    return withMeta(
      schema,
      buildMeta("boolean", label, {
        placeholder: undefined,
        suffix: undefined,
        helpText: opts?.helpText,
      }),
    );
  },

  /**
   * セレクトボックス（文字列 enum）
   * `NoInfer<T>` で default の型推論が options 配列から行われる。
   */
  select<T extends string>(label: string, opts: SelectOpts<T>) {
    const schema = z.enum(opts.options as [T, ...T[]]).default(opts.default);
    return withMeta(
      schema,
      buildMeta("select", label, {
        placeholder: opts.placeholder,
        suffix: undefined,
        helpText: opts.helpText,
      }),
    );
  },

  /** カラーピッカー（hex 文字列） */
  color(label: string, opts?: StringFieldOpts) {
    const schema = z.string().default(opts?.default ?? "");
    return withMeta(
      schema,
      buildMeta("color", label, {
        placeholder: opts?.placeholder,
        suffix: undefined,
        helpText: opts?.helpText,
      }),
    );
  },

  /** 画像 URL 入力 */
  image(label: string, opts?: StringFieldOpts) {
    const schema = z.string().default(opts?.default ?? "");
    return withMeta(
      schema,
      buildMeta("image", label, {
        placeholder: opts?.placeholder,
        suffix: undefined,
        helpText: opts?.helpText,
      }),
    );
  },

  /**
   * URL 入力（有効な URL または空文字列を許容）
   *
   * `z.string().url()` は空文字を拒否するため、空文字列は `z.literal("")` で別途許可する。
   */
  url(label: string, opts?: StringFieldOpts) {
    const schema = z
      .string()
      .url()
      .or(z.literal(""))
      .default(opts?.default ?? "");
    return withMeta(
      schema,
      buildMeta("url", label, {
        placeholder: opts?.placeholder,
        suffix: undefined,
        helpText: opts?.helpText,
      }),
    );
  },

  /** アイコン名入力（Tabler Icons 等） */
  icon(label: string, opts?: StringFieldOpts) {
    const schema = z.string().default(opts?.default ?? "");
    return withMeta(
      schema,
      buildMeta("icon", label, {
        placeholder: opts?.placeholder,
        suffix: undefined,
        helpText: opts?.helpText,
      }),
    );
  },

  /**
   * オブジェクト配列（繰り返しフィールド）
   *
   * `fields` に各アイテムのフィールド定義を渡す。
   * デフォルトは空配列 `[]`。
   */
  array<TItem extends ArrayItem>(label: string, opts: ArrayOpts<TItem>) {
    const itemSchema = z.object(opts.fields);
    const schema = z.array(itemSchema).default([]);
    return withMeta(
      schema,
      buildMeta("array", label, {
        placeholder: undefined,
        suffix: undefined,
        helpText: opts.helpText,
      }),
    );
  },

  /**
   * オブジェクトグループ（ネストされたフィールド群）
   *
   * 関連するフィールドをひとつのオブジェクトにまとめる。
   */
  group<TFields extends { readonly [key: string]: z.ZodType }>(
    label: string,
    fields: TFields,
  ) {
    const schema = z.object(fields);
    return withMeta(schema, buildMeta("group", label));
  },
} as const;
