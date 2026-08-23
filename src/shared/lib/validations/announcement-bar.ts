/**
 * お知らせバー カルーセル設定の SSoT（client-safe）。
 *
 * ## なぜ 1 箇所に集めるのか（監査 A-18）
 *
 * 同じ 14 フィールドの形が 5 箇所にあった:
 *
 * 1. write 検証用 zod（`admin/_shared/actions/settings/schemas/announcement-bar.ts`）
 * 2. read 型付け用 zod（`shared/domain/settings/announcement-bar.ts`）— **同名・本文同一**
 * 3. 管理 UI の TS 型（色を非 null 化した別定義）
 * 4. 公開レンダラの TS 型（prefix 無しで命名規約が別）
 * 5. DB マッピング（`mapCarouselDtoToDb`）
 *
 * カルーセルに設定を 1 つ足すと、admin write スキーマだけ直した場合は
 * domain command の引数型が余剰プロパティを型検査に掛けないので DB へ書かれず、
 * domain だけ直した場合は `safeParse` が strip する。**どちらも保存成功の toast が出て
 * 再読込すると値が戻る**（保存できない設定項目が無言で 1 つ増える）。
 *
 * ここが zod スキーマの唯一の定義で、read / write / UI 型はすべてここから派生する。
 * この module は client component（設定フォーム）からも import されるため
 * server-only なものを持ち込まない。
 */

import { z } from "zod";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@/shared/lib/validations/enums/prisma-types";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/u;

export const announcementBarCarouselSettingsSchema = z.object({
  announcementBarAnimation: z.enum(AnnouncementBarAnimation),
  announcementBarDuration: z.number().int().min(1000).max(30000),
  announcementBarAutoPlay: z.boolean(),
  announcementBarPauseOnHover: z.boolean(),
  announcementBarShowArrows: z.boolean(),
  announcementBarShowIndicator: z.boolean(),
  announcementBarDesignStyle: z.enum(AnnouncementBarDesignStyle),
  announcementBarBgColor: z.string().regex(HEX_COLOR).nullable(),
  announcementBarTextColor: z.string().regex(HEX_COLOR).nullable(),
  announcementBarStripeColor: z.string().regex(HEX_COLOR).nullable(),
  announcementBarStripeAnimation: z.boolean(),
  announcementBarGradientAnimation: z.boolean(),
  announcementBarGlassAnimation: z.boolean(),
  announcementBarSticky: z.boolean(),
});

export type AnnouncementBarCarouselSettingsInput = z.infer<
  typeof announcementBarCarouselSettingsSchema
>;

/**
 * 色入力は `<input type="color">` が空文字を扱えないため、フォーム側だけ非 null にする。
 * **差分はこの 3 キーだけ**なので、ここだけを列挙して残りは spread で通す。
 * 設定項目が増えても両変換に手を入れる必要は無い。
 */
type CarouselColorKey =
  | "announcementBarBgColor"
  | "announcementBarTextColor"
  | "announcementBarStripeColor";

export type CarouselFormValues = Omit<
  AnnouncementBarCarouselSettingsInput,
  CarouselColorKey
> &
  Record<CarouselColorKey, string>;

/** 保存値 → フォーム値（色の `null` を空文字へ）。 */
export function toCarouselFormValues(
  input: AnnouncementBarCarouselSettingsInput,
): CarouselFormValues {
  return {
    ...input,
    announcementBarBgColor: input.announcementBarBgColor ?? "",
    announcementBarTextColor: input.announcementBarTextColor ?? "",
    announcementBarStripeColor: input.announcementBarStripeColor ?? "",
  };
}

/** フォーム値 → 保存値（色の空文字を `null` へ）。 */
export function fromCarouselFormValues(
  values: CarouselFormValues,
): AnnouncementBarCarouselSettingsInput {
  return {
    ...values,
    announcementBarBgColor: values.announcementBarBgColor || null,
    announcementBarTextColor: values.announcementBarTextColor || null,
    announcementBarStripeColor: values.announcementBarStripeColor || null,
  };
}

/**
 * 公開レンダラ側の設定型。`announcementBar` prefix を落とした命名で、
 * **キー集合はスキーマから導出する**（型なので追加を検知できる）。
 */
type StripAnnouncementBarPrefix<K extends string> =
  K extends `announcementBar${infer Rest}` ? Uncapitalize<Rest> : K;

export type PublicCarouselSettings = {
  [
    K in keyof AnnouncementBarCarouselSettingsInput as StripAnnouncementBarPrefix<
      K & string
    >
  ]: AnnouncementBarCarouselSettingsInput[K];
};

/**
 * 保存値 → 公開レンダラ値。
 *
 * 14 キーを書き写しているのはここ 1 箇所だけで、戻り値型がスキーマ由来なので
 * 設定を足すと**この関数が型エラーになる**（以前は公開側の型も手書きだったため、
 * 足しても誰も気付かなかった）。
 */
export function toPublicCarouselSettings(
  input: AnnouncementBarCarouselSettingsInput,
): PublicCarouselSettings {
  return {
    animation: input.announcementBarAnimation,
    duration: input.announcementBarDuration,
    autoPlay: input.announcementBarAutoPlay,
    pauseOnHover: input.announcementBarPauseOnHover,
    showArrows: input.announcementBarShowArrows,
    showIndicator: input.announcementBarShowIndicator,
    designStyle: input.announcementBarDesignStyle,
    bgColor: input.announcementBarBgColor,
    textColor: input.announcementBarTextColor,
    stripeColor: input.announcementBarStripeColor,
    stripeAnimation: input.announcementBarStripeAnimation,
    gradientAnimation: input.announcementBarGradientAnimation,
    glassAnimation: input.announcementBarGlassAnimation,
    sticky: input.announcementBarSticky,
  };
}
