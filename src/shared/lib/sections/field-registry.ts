// src/shared/lib/sections/field-registry.ts
//
// Zod 4 公式 z.registry<FieldMeta>() ベースのフィールドメタデータ基盤。
// 管理画面の AutoSectionForm はこのレジストリを読み取ってフォームを自動生成する。
//
// ADR 0018: .describe(JSON.stringify()) 廃止 → z.registry<FieldMeta>() 採用

import { z } from "zod";

import type { FieldType } from "./types";

// ─────────────────────────────────────────────────────────────
// FieldMeta インターフェース
// ─────────────────────────────────────────────────────────────

export interface FieldMeta {
  readonly fieldType: FieldType;
  readonly label: string;
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly suffix?: string;
  readonly group: "content" | "design" | "advanced";
}

// ─────────────────────────────────────────────────────────────
// Registry シングルトン
// ─────────────────────────────────────────────────────────────

export const fieldRegistry = z.registry<FieldMeta>();

// ─────────────────────────────────────────────────────────────
// Helper オプション型
// ─────────────────────────────────────────────────────────────

interface TextOpts {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
  readonly group?: FieldMeta["group"];
}

interface TextareaOpts {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
  readonly group?: FieldMeta["group"];
}

interface NumberOpts {
  readonly min?: number;
  readonly max?: number;
  readonly suffix?: string;
  readonly helpText?: string;
  readonly default?: number;
  readonly group?: FieldMeta["group"];
}

interface BooleanOpts {
  readonly helpText?: string;
  readonly default?: boolean;
  readonly group?: FieldMeta["group"];
}

interface SelectOpts<T extends string> {
  readonly options: readonly T[];
  readonly default: NoInfer<T>;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly group?: FieldMeta["group"];
}

interface StringFieldOpts {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
  readonly group?: FieldMeta["group"];
}

interface ArrayItem {
  readonly [key: string]: z.ZodType;
}

interface ArrayOpts<TItem extends ArrayItem> {
  readonly fields: TItem;
  readonly helpText?: string;
  readonly group?: FieldMeta["group"];
}

// ─────────────────────────────────────────────────────────────
// Field ヘルパー
// ─────────────────────────────────────────────────────────────

export const field = {
  /** 単一行テキスト入力 */
  text(label: string, opts?: TextOpts) {
    return z
      .string()
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "text",
        label,
        group: opts?.group ?? "content",
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /** 複数行テキスト入力 */
  textarea(label: string, opts?: TextareaOpts) {
    return z
      .string()
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "textarea",
        label,
        group: opts?.group ?? "content",
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      });
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
    return base.default(opts?.default ?? 0).register(fieldRegistry, {
      fieldType: "number",
      label,
      group: opts?.group ?? "content",
      ...(opts?.suffix !== undefined && { suffix: opts.suffix }),
      ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
    });
  },

  /** チェックボックス / トグル */
  boolean(label: string, opts?: BooleanOpts) {
    return z
      .boolean()
      .default(opts?.default ?? false)
      .register(fieldRegistry, {
        fieldType: "boolean",
        label,
        group: opts?.group ?? "content",
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /**
   * セレクトボックス（文字列 enum）
   * `NoInfer<T>` で default の型推論が options 配列から行われる。
   */
  select<T extends string>(label: string, opts: SelectOpts<T>) {
    return z
      .enum(opts.options as [T, ...T[]])
      .default(opts.default)
      .register(fieldRegistry, {
        fieldType: "select",
        label,
        group: opts.group ?? "content",
        ...(opts.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /** カラーピッカー（hex 文字列） */
  color(label: string, opts?: StringFieldOpts) {
    return z
      .string()
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "color",
        label,
        group: opts?.group ?? "content",
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /** 画像 URL 入力 */
  image(label: string, opts?: StringFieldOpts) {
    return z
      .string()
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "image",
        label,
        group: opts?.group ?? "content",
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /**
   * URL 入力（有効な URL または空文字列を許容）
   *
   * `z.string().url()` は空文字を拒否するため、空文字列は `z.literal("")` で別途許可する。
   */
  url(label: string, opts?: StringFieldOpts) {
    return z
      .string()
      .url()
      .or(z.literal(""))
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "url",
        label,
        group: opts?.group ?? "content",
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /** アイコン名入力（Tabler Icons 等） */
  icon(label: string, opts?: StringFieldOpts) {
    return z
      .string()
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "icon",
        label,
        group: opts?.group ?? "content",
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /**
   * オブジェクト配列（繰り返しフィールド）
   *
   * `fields` に各アイテムのフィールド定義を渡す。
   * デフォルトは空配列 `[]`。
   */
  array<TItem extends ArrayItem>(label: string, opts: ArrayOpts<TItem>) {
    const itemSchema = z.object(opts.fields);
    return z
      .array(itemSchema)
      .default([])
      .register(fieldRegistry, {
        fieldType: "array",
        label,
        group: opts.group ?? "content",
        ...(opts.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /**
   * オブジェクトグループ（ネストされたフィールド群）
   *
   * 関連するフィールドをひとつのオブジェクトにまとめる。
   */
  group<TFields extends { readonly [key: string]: z.ZodType }>(
    label: string,
    fields: TFields,
    opts?: { readonly helpText?: string; readonly group?: FieldMeta["group"] },
  ) {
    return z.object(fields).register(fieldRegistry, {
      fieldType: "group",
      label,
      group: opts?.group ?? "content",
      ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
    });
  },
} as const;
