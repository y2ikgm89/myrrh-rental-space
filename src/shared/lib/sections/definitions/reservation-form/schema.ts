import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

/**
 * 予約フォームセクション設定
 *
 * 既存の `reservation/_components/reservation-form.tsx` を Section に内包する。
 * Configurable 項目は以下:
 *
 * - `defaultSpaceId`: URL `?spaceId=` 未指定時の事前選択スペース ID
 * - `skipStep1`: スペース選択ステップ (Step 1) 省略フラグ（form 側未対応 — 将来対応）
 * - `enableCoupon`: クーポン適用機能の有効化フラグ（form 側未対応 — 将来対応）
 * - `requireLogin`: 未ログイン時 `/login` へリダイレクトする
 */
export const reservationFormConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Reserve",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.portableTextInline("見出し", {
    subGroup: "text",
  }),
  description: field.portableTextBlock("説明文", {
    subGroup: "text",
  }),
  defaultSpaceId: field.text("デフォルトスペース ID", {
    maxLength: 64,
    subGroup: "other",
    helpText: "URL ?spaceId= が未指定のとき初期選択するスペース ID（任意）",
  }),
  skipStep1: field.boolean("スペース選択ステップ (Step 1) を省略する", {
    default: false,
    helpText:
      "true の場合、defaultSpaceId が未指定でも Step 1 をスキップする想定（form 側対応は次フェーズ）",
  }),
  enableCoupon: field.boolean("クーポン適用を有効化する", {
    default: true,
    helpText:
      "予約金額にクーポンコードを適用可能にする（form 側対応は次フェーズ）",
  }),
  requireLogin: field.boolean("予約にログインを必須にする", {
    default: false,
    helpText: "true のとき未ログイン顧客は /login へリダイレクトされる",
  }),
  layout: sectionLayoutSchema,
});

export type ReservationFormConfig = z.infer<typeof reservationFormConfigSchema>;
