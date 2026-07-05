/**
 * 共通ボタン配列スキーマ factory
 *
 * Section schema 共通の buttons[] 表現 SSoT。
 * cta / hero / hero-parallax が利用する。
 *
 * label は PortableTextSpan[] モデル（テキスト + アイコン混在）。
 * fieldRegistry.register 経由で AutoSectionForm が編集 UI を自動生成。
 */

import { fieldRegistry, field } from "../../field-registry";
import {
  createInternalAppRouteSchema,
  ctaButtonVariants,
  ctaButtonSizes,
  optionalHexColorSchema,
} from "@/shared/lib/validations/cta-and-url";

/**
 * Section schema 共通の buttons array スキーマ。
 *
 * - URL は内部 app route のみ許容（next/link 互換）
 * - 同一 URL のボタンは複数登録不可（React key 衝突防止）
 *
 * `field.array` の戻り値は ZodArray、`refine` 後は ZodEffects になるが
 * registry 登録は array helper 内で完結しているため AutoSectionForm から
 * fieldRegistry.get(arraySchema) は失敗しない (refine は外側で wrapping のみ)。
 */
export function createButtonsArraySchema(label = "ボタン") {
  return field
    .array(label, {
      subGroup: "button",
      strict: true,
      fields: {
        label: field.portableTextInline("ボタンの文字", {
          subGroup: "text",
          helpText:
            "テキストとアイコンを組み合わせてラベルを作成できます。テキストのみでも可。",
        }),
        url: createInternalAppRouteSchema(500).register(fieldRegistry, {
          fieldType: "url",
          label: "リンク先 URL",
          group: "content",
        }),
        variant: field.select("ボタンの種類", {
          options: ctaButtonVariants,
          default: "primary",
        }),
        size: field.select("ボタンの大きさ", {
          options: ctaButtonSizes,
          default: "lg",
        }),
        openInNewTab: field.boolean("新しいタブで開く"),
        backgroundColor: optionalHexColorSchema.register(fieldRegistry, {
          fieldType: "color",
          label: "背景色（カスタム）",
          group: "content",
          helpText: "未設定の場合は variant 既定色",
        }),
        textColor: optionalHexColorSchema.register(fieldRegistry, {
          fieldType: "color",
          label: "文字色（カスタム）",
          group: "content",
          helpText: "未設定の場合は variant 既定色",
        }),
      },
    })
    .refine((arr) => new Set(arr.map((b) => b.url)).size === arr.length, {
      error: "同じURLのボタンを複数登録することはできません",
    });
}
