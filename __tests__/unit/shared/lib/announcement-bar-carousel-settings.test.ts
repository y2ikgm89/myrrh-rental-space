/**
 * お知らせバー カルーセル設定の SSoT が経路をまたいで一致すること（監査 A-18）。
 *
 * ## なぜ
 *
 * 同じ 14 フィールドの形が write 用 zod / read 用 zod / 管理 UI 型 / 公開レンダラ型 /
 * DB マッピングの 5 箇所に独立して書かれていた。設定を 1 つ足したとき、
 * write スキーマだけ直すと domain command の引数型が余剰プロパティを検査しないので
 * DB へ書かれず、domain だけ直すと `safeParse` が strip する。**どちらも保存成功の
 * toast が出て再読込すると値が戻る**。
 *
 * zod スキーマを 1 本にしたので write / read の乖離は型で塞がったが、
 * 「公開レンダラ側へ運び忘れる」だけは変換関数の中身の問題として残る。
 * ここではその 1 点と、フォーム値との往復を固定する。
 */

import { describe, expect, test } from "bun:test";

import {
  announcementBarCarouselSettingsSchema,
  fromCarouselFormValues,
  toCarouselFormValues,
  toPublicCarouselSettings,
  type AnnouncementBarCarouselSettingsInput,
} from "@/shared/lib/validations/announcement-bar";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@/shared/lib/validations/enums/prisma-types";

const SAVED: AnnouncementBarCarouselSettingsInput = {
  announcementBarAnimation: AnnouncementBarAnimation.FADE,
  announcementBarDuration: 5000,
  announcementBarAutoPlay: true,
  announcementBarPauseOnHover: true,
  announcementBarShowArrows: false,
  announcementBarShowIndicator: true,
  announcementBarDesignStyle: AnnouncementBarDesignStyle.SOLID,
  announcementBarBgColor: null,
  announcementBarTextColor: "#FFFFFF",
  announcementBarStripeColor: null,
  announcementBarStripeAnimation: false,
  announcementBarGradientAnimation: true,
  announcementBarGlassAnimation: false,
  announcementBarSticky: true,
};

describe("カルーセル設定の SSoT", () => {
  test("公開レンダラ値はスキーマの全項目を運ぶ", () => {
    // 設定を足して `toPublicCarouselSettings` に書き忘れると、ここで件数が割れる。
    const schemaKeys = Object.keys(
      announcementBarCarouselSettingsSchema.shape,
    ).sort();
    const publicKeys = Object.keys(toPublicCarouselSettings(SAVED)).sort();

    expect({ schema: schemaKeys.length, public: publicKeys.length }).toEqual({
      schema: 14,
      public: 14,
    });
    expect(
      publicKeys.map(
        (key) => `announcementBar${key[0]?.toUpperCase()}${key.slice(1)}`,
      ),
    ).toEqual(schemaKeys);
  });

  test("フォーム値との往復で保存値が変わらない（色の null は空文字を経由して戻る）", () => {
    const form = toCarouselFormValues(SAVED);

    expect({
      bg: form.announcementBarBgColor,
      text: form.announcementBarTextColor,
    }).toEqual({ bg: "", text: "#FFFFFF" });

    expect(fromCarouselFormValues(form)).toEqual(SAVED);
  });
});
