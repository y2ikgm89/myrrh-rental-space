import type { EventTicket } from "@generated/prisma/client";

/**
 * EventTicket チケット種別の型 SSoT。
 *
 * 管理フォーム / ドメインコマンド / 公開表示の各レイヤー型を Prisma 生成型
 * `EventTicket` からの `Pick` 派生で一元化し、フィールド追加時のドリフトを防ぐ。
 */

/**
 * EventTicket の編集対象フィールド（`id` / `eventId` / timestamps を除く）。
 */
export type EventTicketWritableFields = Readonly<
  Pick<
    EventTicket,
    | "name"
    | "description"
    | "price"
    | "capacity"
    | "unitSize"
    | "sortOrder"
    | "isAvailable"
  >
>;

/**
 * 管理フォームのチケットドラフト兼ドメインコマンドの書き込み入力。
 *
 * 既存チケットは `id` を持ち（update 時の diff/upsert に利用）、新規追加分は省略する。
 */
export type EventTicketInput = EventTicketWritableFields & {
  readonly id?: string;
};

/**
 * 公開イベント詳細パネル（EventInfoPanel）のチケット表示サマリー。
 */
export type EventTicketSummary = Readonly<
  Pick<
    EventTicket,
    | "id"
    | "name"
    | "description"
    | "price"
    | "capacity"
    | "unitSize"
    | "sortOrder"
  >
>;

/**
 * 公開申込フォーム（EventRegistrationForm）のチケット選択肢（必要最小限）。
 */
export type EventTicketOption = Readonly<
  Pick<EventTicket, "id" | "name" | "price" | "unitSize">
>;

/**
 * 新規チケットドラフトの初期値を生成する。
 */
export function createDefaultTicket(sortOrder: number): EventTicketInput {
  return {
    name: "",
    description: null,
    price: 0,
    capacity: null,
    unitSize: 1,
    sortOrder,
    isAvailable: true,
  };
}
