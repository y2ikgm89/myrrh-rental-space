/**
 * エンティティ ID のパラメータ検証。**形式ではなくモデル名で選ぶ。**
 *
 * ## ID は 1 形式に統一されている
 *
 * `prisma/schema.prisma` の主キーは全モデルが `@default(uuid(7)) @db.Uuid` か、
 * 単一行モデルの `@default("singleton")` のどちらか。この不変条件は
 * `__tests__/unit/architecture/entity-id-format-binding.test.ts` が schema を
 * 直接読んで強制する（cuid のモデルを 1 つでも足すと落ちる）。
 *
 * ## なぜモデル名で引くのか
 *
 * 2026-08-04 の統一より前は uuid / cuid / cuid2 の 3 形式が混在し、呼び出し側が
 * 「どの形式か」を選ぶ設計だった。開発者が知らない情報を要求する形なので、
 * **繰り返し本番に出た**:
 *
 * - #904 — マイページのキャンセルが cuid の申込 ID を `z.uuid()` で検証しており、
 *   実在する申込 ID を全て拒否していた
 * - #1747 — `TermsAgreement.resourceId` が `@db.Uuid` で、規約同意付きの
 *   イベント申込が P2007 で必ず失敗していた（公開フォームが丸ごと壊れていた）
 * - 同じ理由で `AdminNotification.resourceId` を uuid → varchar へ
 *   広げる migration が必要になった
 *
 * 形式が 1 つになった今も入口をモデル名に寄せたままにするのは、**エラーメッセージを
 * モデル単位に固定する**ため。以前は同じ `EventTicket` に「チケット」「イベントチケット」の
 * 2 通りがあった。
 */

import { z } from "zod";

/**
 * ID 検証が必要になったモデルの表示名。`${label}IDが不正です` になる。
 *
 * 新しいモデルの ID を検証したくなったらここへ足す。モデル名が
 * `prisma/schema.prisma` に実在することは gate が確かめる。
 */
export const ENTITY_ID_LABELS = {
  Event: "イベント",
  EventRegistration: "イベント参加申込",
  EventTicket: "イベントチケット",
  EventTimeSlot: "イベントタイムスロット",
  SpaceRatePlan: "料金プラン",
} as const satisfies Record<string, string>;

export type EntityIdModel = keyof typeof ENTITY_ID_LABELS;

/**
 * 指定モデルの ID を検証する Zod スキーマを返す。
 *
 * @param model Prisma のモデル名（`prisma/schema.prisma` の `model X {`）
 */
export function entityIdSchema(model: EntityIdModel) {
  return z.uuid({ error: `${ENTITY_ID_LABELS[model]}IDが不正です` });
}
