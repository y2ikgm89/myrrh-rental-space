/**
 * エンティティ ID のパラメータ検証。**形式ではなくモデル名で選ぶ。**
 *
 * ## なぜモデル名で引くのか
 *
 * このリポジトリの ID は 3 形式が混在する（`prisma/schema.prisma` の `@default`）:
 * ほとんどのモデルが `uuid(7)`、イベント系 4 モデルと `SpaceRatePlan` が `cuid()`、
 * `EventTimeSlot` だけが `cuid(2)`。呼び出し側が「どの形式か」を選ぶ設計だと、
 * **形式を知らない開発者が必ず間違える**。実際に本番へ出た:
 *
 * - #904 — マイページのキャンセルが `z.uuid()` で申込 ID を検証しており、
 *   **実在する申込 ID を全て拒否**していた（cuid なので uuid 検証に通らない）
 * - #1747 — `TermsAgreement.resourceId` が `@db.Uuid` だったため、規約に同意した
 *   イベント申込が P2007 で必ず失敗し、**公開の申込フォームが丸ごと壊れていた**
 * - 20260726030000 — 同じ理由で `AdminNotification.resourceId` を uuid → varchar へ
 *   広げる migration が必要になった
 *
 * 開発者が確実に知っているのは形式ではなく**どのモデルを指す ID か**なので、
 * 入口をそちらに寄せてある。形式の正しさは
 * `__tests__/unit/architecture/entity-id-format-binding.test.ts` が
 * `prisma/schema.prisma` と突き合わせて機械強制する（下の宣言がずれたら落ちる）。
 *
 * エラーメッセージも同じ理由でモデル単位に固定する。以前は同じモデルに対して
 * 「チケット」「イベントチケット」のように呼び出し側ごとに揺れていた。
 */

import { z } from "zod";

export type EntityIdFormat = "uuid" | "cuid" | "cuid2";

interface EntityIdSpec {
  /** `prisma/schema.prisma` の `@id @default(...)` と一致していること（gate が強制）。 */
  readonly format: EntityIdFormat;
  /** エラーメッセージ用の表示名。`${label}IDが不正です` になる。 */
  readonly label: string;
}

/**
 * ID 検証が必要になったモデルを登録する SSoT。
 *
 * 新しいモデルの ID を検証したくなったらここへ足す。`format` を間違えても
 * gate が `prisma/schema.prisma` と突き合わせて落とすので、勘で書いてよい。
 * **`cuid` / `cuid2` のモデルは登録が必須**（未登録だと gate が落ちる）。
 */
export const ENTITY_ID_SPECS = {
  Event: { format: "cuid", label: "イベント" },
  EventRegistration: { format: "cuid", label: "イベント参加申込" },
  EventTicket: { format: "cuid", label: "イベントチケット" },
  EventTimeSlot: { format: "cuid2", label: "イベントタイムスロット" },
  SpaceRatePlan: { format: "cuid", label: "料金プラン" },
} as const satisfies Record<string, EntityIdSpec>;

export type EntityIdModel = keyof typeof ENTITY_ID_SPECS;

/**
 * 指定モデルの ID を検証する Zod スキーマを返す。
 *
 * @param model Prisma のモデル名（`prisma/schema.prisma` の `model X {`）
 */
export function entityIdSchema(model: EntityIdModel) {
  const spec: EntityIdSpec = ENTITY_ID_SPECS[model];
  const error = `${spec.label}IDが不正です`;

  switch (spec.format) {
    case "uuid":
      return z.uuid({ error });
    case "cuid":
      return z.cuid({ error });
    case "cuid2":
      return z.cuid2({ error });
  }
}
