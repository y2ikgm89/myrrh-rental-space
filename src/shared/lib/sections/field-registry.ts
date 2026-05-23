// src/shared/lib/sections/field-registry.ts
//
// Zod 4 公式 z.registry<FieldMeta>() ベースのフィールドメタデータ基盤。
// 管理画面の AutoSectionForm はこのレジストリを読み取ってフォームを自動生成する。
//
// ADR 0018: .describe(JSON.stringify()) 廃止 → z.registry<FieldMeta>() 採用

import { z } from "zod";

import {
  createBlockArraySchema,
  createSpanArraySchema,
} from "@/shared/lib/portable-text";
import type { FieldType, MediaAcceptType } from "./types";

// ─────────────────────────────────────────────────────────────
// FieldMeta インターフェース
// ─────────────────────────────────────────────────────────────

/**
 * AutoSectionForm の content グループ内でフィールドを意味別に分類するためのサブグループ。
 * design / advanced グループでは無視される（content グループ内のみ意味を持つ）。
 */
export type FieldSubGroup = "text" | "image" | "button" | "other";

/**
 * 動的 select の取得元ソース識別子。
 * AutoSectionForm が `dynamicOptions[source]` から options を取得する。
 */
export type DynamicSelectSource =
  | "postCategories"
  | "faqCategories"
  | "locations";

export interface FieldMeta {
  readonly fieldType: FieldType;
  readonly label: string;
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly suffix?: string;
  readonly group: "content" | "design" | "advanced";
  readonly subGroup?: FieldSubGroup;
  readonly dynamicSelectSource?: DynamicSelectSource;
  /**
   * text / textarea / url / number 入力欄の左端に表示する curation icon 名。
   * 例: "IconLink"（URL）/ "IconMail"（メール）/ "IconSearch"（検索）。
   * SR は併記 label のみ読み上げる（icon は装飾、`aria-hidden`）。
   */
  readonly leadingIcon?: string;
  /** 入力欄の右端に表示する curation icon 名（バリデーション status 等）。 */
  readonly trailingIcon?: string;
  /**
   * `field.media` 専用 — 許容するメディアカテゴリ。
   * MediaPickerDialog / AutoMediaField がプレビュー描画 / MIME filter に使用。
   */
  readonly mediaAccept?: MediaAcceptType;
}

// ─────────────────────────────────────────────────────────────
// Registry シングルトン
// ─────────────────────────────────────────────────────────────

export const fieldRegistry = z.registry<FieldMeta>();

// ─────────────────────────────────────────────────────────────
// Helper オプション型
// ─────────────────────────────────────────────────────────────

interface StringConstraints {
  readonly minLength?: number;
  readonly maxLength?: number;
}

interface CommonFieldOpts {
  readonly group?: FieldMeta["group"];
  readonly subGroup?: FieldSubGroup;
  /**
   * Input adornment（left）— curation icon 名。
   * 対応: text / url / number。textarea / boolean / select / image / icon は非対応（silent ignore）。
   */
  readonly leadingIcon?: string;
  /**
   * Input adornment（right）— curation icon 名。
   * 対応: text / url / number。textarea / boolean / select / image / icon は非対応（silent ignore）。
   */
  readonly trailingIcon?: string;
}

interface TextOpts extends StringConstraints, CommonFieldOpts {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
}

interface TextareaOpts extends StringConstraints, CommonFieldOpts {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
}

interface NumberOpts extends CommonFieldOpts {
  readonly min?: number;
  readonly max?: number;
  readonly suffix?: string;
  readonly helpText?: string;
  readonly default?: number;
}

interface BooleanOpts extends CommonFieldOpts {
  readonly helpText?: string;
  readonly default?: boolean;
}

interface SelectOpts<T extends string> extends CommonFieldOpts {
  readonly options: readonly T[];
  readonly default: NoInfer<T>;
  readonly helpText?: string;
  readonly placeholder?: string;
}

interface StringFieldOpts extends StringConstraints, CommonFieldOpts {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
}

interface MediaFieldOpts extends StringConstraints, CommonFieldOpts {
  readonly accept: MediaAcceptType;
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
}

/** string 制約を z.string() に適用する境界ヘルパー */
function applyStringConstraints(
  schema: z.ZodString,
  constraints: StringConstraints,
): z.ZodString {
  let s = schema;
  if (constraints.minLength !== undefined) s = s.min(constraints.minLength);
  if (constraints.maxLength !== undefined) s = s.max(constraints.maxLength);
  return s;
}

interface ArrayItem {
  readonly [key: string]: z.ZodType;
}

interface ArrayOpts<TItem extends ArrayItem> extends CommonFieldOpts {
  readonly fields: TItem;
  readonly helpText?: string;
  readonly min?: number;
  readonly max?: number;
}

interface DynamicSelectOpts {
  readonly source: DynamicSelectSource;
  readonly group?: FieldMeta["group"];
  readonly subGroup?: FieldSubGroup;
  readonly helpText?: string;
}

interface PortableTextInlineOpts {
  readonly group?: FieldMeta["group"];
  readonly subGroup?: FieldSubGroup;
  readonly helpText?: string;
  readonly placeholder?: string;
}

interface PortableTextBlockOpts {
  readonly group?: FieldMeta["group"];
  readonly subGroup?: FieldSubGroup;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly maxBlocks?: number;
}

// ─────────────────────────────────────────────────────────────
// Field ヘルパー
// ─────────────────────────────────────────────────────────────

export const field = {
  /** 単一行テキスト入力 */
  text(label: string, opts?: TextOpts) {
    return applyStringConstraints(z.string(), opts ?? {})
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "text",
        label,
        group: opts?.group ?? "content",
        ...(opts?.subGroup !== undefined && { subGroup: opts.subGroup }),
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
        ...(opts?.leadingIcon !== undefined && {
          leadingIcon: opts.leadingIcon,
        }),
        ...(opts?.trailingIcon !== undefined && {
          trailingIcon: opts.trailingIcon,
        }),
      });
  },

  /** 複数行テキスト入力 */
  textarea(label: string, opts?: TextareaOpts) {
    return applyStringConstraints(z.string(), opts ?? {})
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "textarea",
        label,
        group: opts?.group ?? "content",
        ...(opts?.subGroup !== undefined && { subGroup: opts.subGroup }),
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
        ...(opts?.leadingIcon !== undefined && {
          leadingIcon: opts.leadingIcon,
        }),
        ...(opts?.trailingIcon !== undefined && {
          trailingIcon: opts.trailingIcon,
        }),
      });
  },

  /**
   * 数値入力（min / max バリデーション付き）
   *
   * FormData transit (conform) / object literal (RHF / test) 両対応:
   * - number 値はそのまま通過
   * - string ("123" / "1.5") は Number() で coerce
   * - undefined / "" / null は default 適用に委譲
   */
  number(label: string, opts?: NumberOpts) {
    let base = z.number();
    if (opts?.min !== undefined) {
      base = base.min(opts.min);
    }
    if (opts?.max !== undefined) {
      base = base.max(opts.max);
    }
    return z
      .preprocess((v) => {
        if (v === undefined || v === "" || v === null) return undefined;
        if (typeof v === "number") return v;
        const parsed = Number(v);
        return Number.isFinite(parsed) ? parsed : v;
      }, base)
      .default(opts?.default ?? 0)
      .register(fieldRegistry, {
        fieldType: "number",
        label,
        group: opts?.group ?? "content",
        ...(opts?.subGroup !== undefined && { subGroup: opts.subGroup }),
        ...(opts?.suffix !== undefined && { suffix: opts.suffix }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
        ...(opts?.leadingIcon !== undefined && {
          leadingIcon: opts.leadingIcon,
        }),
        ...(opts?.trailingIcon !== undefined && {
          trailingIcon: opts.trailingIcon,
        }),
      });
  },

  /**
   * チェックボックス / トグル
   *
   * FormData transit (conform) / object literal (RHF / test) 両対応:
   * - boolean 値はそのまま通過
   * - "on" / "true" → true、それ以外の string → false
   * - undefined → default 適用に委譲
   */
  boolean(label: string, opts?: BooleanOpts) {
    return z
      .preprocess((v) => {
        if (v === undefined) return undefined;
        if (typeof v === "boolean") return v;
        return v === "on" || v === "true";
      }, z.boolean())
      .default(opts?.default ?? false)
      .register(fieldRegistry, {
        fieldType: "boolean",
        label,
        group: opts?.group ?? "content",
        ...(opts?.subGroup !== undefined && { subGroup: opts.subGroup }),
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
        ...(opts.subGroup !== undefined && { subGroup: opts.subGroup }),
        ...(opts.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /** カラーピッカー（hex 文字列） */
  color(label: string, opts?: StringFieldOpts) {
    return applyStringConstraints(z.string(), opts ?? {})
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "color",
        label,
        group: opts?.group ?? "content",
        ...(opts?.subGroup !== undefined && { subGroup: opts.subGroup }),
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /** 画像選択（MediaPicker ダイアログ — `AutoImageField` で描画） */
  image(label: string, opts?: StringFieldOpts) {
    return applyStringConstraints(z.string(), opts ?? {})
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "image",
        label,
        group: opts?.group ?? "content",
        ...(opts?.subGroup !== undefined && { subGroup: opts.subGroup }),
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /**
   * メディア選択（一般化版 — 画像/動画/音声/文書をカテゴリ別に許可）
   *
   * `accept` で MediaPickerDialog の Library tab filter / Upload tab `<input accept>` /
   * URL tab placeholder / AutoMediaField プレビュー variant を切り替える。
   *
   * - `accept: "image"` → JPEG/PNG/WebP/GIF
   * - `accept: "video"` → MP4/WebM、URL タブで YouTube/Vimeo 埋込 URL も許容
   * - `accept: "audio"` → MP3/WAV
   * - `accept: "file"` → PDF
   * - `accept: "any"` → 全カテゴリ（汎用 picker）
   */
  media(label: string, opts: MediaFieldOpts) {
    return applyStringConstraints(z.string(), opts)
      .default(opts.default ?? "")
      .register(fieldRegistry, {
        fieldType: "media",
        label,
        group: opts.group ?? "content",
        mediaAccept: opts.accept,
        ...(opts.subGroup !== undefined && { subGroup: opts.subGroup }),
        ...(opts.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /**
   * URL 入力（有効な URL または空文字列を許容）
   *
   * `z.string().url()` は空文字を拒否するため、空文字列は `z.literal("")` で別途許可する。
   */
  url(label: string, opts?: StringFieldOpts) {
    return applyStringConstraints(z.string().url(), opts ?? {})
      .or(z.literal(""))
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "url",
        label,
        group: opts?.group ?? "content",
        ...(opts?.subGroup !== undefined && { subGroup: opts.subGroup }),
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
        // url field のデフォルト leading icon は IconLink（明示指定で上書き可）
        leadingIcon: opts?.leadingIcon ?? "IconLink",
        ...(opts?.trailingIcon !== undefined && {
          trailingIcon: opts.trailingIcon,
        }),
      });
  },

  /** アイコン名入力（Tabler Icons 等） */
  icon(label: string, opts?: StringFieldOpts) {
    return applyStringConstraints(z.string(), opts ?? {})
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "icon",
        label,
        group: opts?.group ?? "content",
        ...(opts?.subGroup !== undefined && { subGroup: opts.subGroup }),
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
   * デフォルトは空配列 `[]` — `safeParse({})` 成立契約に従い、`.default()` は
   * `.min()` / `.max()` 検証を skip するため空配列の fallback は常に通る。
   * `min` / `max` は実 input が渡された場合の admin write-side 検証に使う。
   */
  array<TItem extends ArrayItem>(label: string, opts: ArrayOpts<TItem>) {
    const itemSchema = z.object(opts.fields);
    let arr = z.array(itemSchema);
    if (opts.min !== undefined) {
      arr = arr.min(opts.min, {
        error: `${label}は${opts.min}件以上必要です`,
      });
    }
    if (opts.max !== undefined) {
      arr = arr.max(opts.max, {
        error: `${label}は${opts.max}件までです`,
      });
    }
    return arr.default([]).register(fieldRegistry, {
      fieldType: "array",
      label,
      group: opts.group ?? "content",
      ...(opts.subGroup !== undefined && { subGroup: opts.subGroup }),
      ...(opts.helpText !== undefined && { helpText: opts.helpText }),
    });
  },

  /**
   * 動的 select（DB 由来 options）
   *
   * AutoSectionForm が `dynamicOptions[source]` から options を取得して描画する。
   * UUID 文字列または空文字列（指定なし）を許容、default は空文字列。
   */
  dynamicSelect(label: string, opts: DynamicSelectOpts) {
    return z
      .string()
      .uuid()
      .or(z.literal(""))
      .default("")
      .register(fieldRegistry, {
        fieldType: "select",
        label,
        group: opts.group ?? "content",
        dynamicSelectSource: opts.source,
        ...(opts.subGroup !== undefined && { subGroup: opts.subGroup }),
        ...(opts.helpText !== undefined && { helpText: opts.helpText }),
      });
  },

  /**
   * Portable Text インライン（PortableTextSpan[] — テキスト + アイコンの混在配列）
   *
   * Sanity Portable Text 互換のインラインスパンモデル。
   * `safeParse({})` で空配列にフォールバック（field defaults 契約）。
   */
  portableTextInline(label: string, opts?: PortableTextInlineOpts) {
    return createSpanArraySchema().register(fieldRegistry, {
      fieldType: "portable-text-inline",
      label,
      group: opts?.group ?? "content",
      ...(opts?.subGroup !== undefined && { subGroup: opts.subGroup }),
      ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      ...(opts?.placeholder !== undefined && {
        placeholder: opts.placeholder,
      }),
    });
  },

  /**
   * Portable Text ブロック（PortableTextBlock[] — 段落 + アイコン inline の混在配列）
   *
   * Sanity Portable Text 互換のブロック配列モデル。各 block は paragraph を 1 つ表し、
   * children に PortableTextSpan[] を持つ（text node + iconInline span の混在）。
   * `safeParse({})` で空配列にフォールバック（field defaults 契約）。
   */
  portableTextBlock(label: string, opts?: PortableTextBlockOpts) {
    const schema = createBlockArraySchema(
      opts?.maxBlocks !== undefined ? { maxBlocks: opts.maxBlocks } : undefined,
    );
    return schema.register(fieldRegistry, {
      fieldType: "portable-text-block",
      label,
      group: opts?.group ?? "content",
      subGroup: opts?.subGroup ?? "text",
      ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      ...(opts?.placeholder !== undefined && {
        placeholder: opts.placeholder,
      }),
    });
  },
} as const;
