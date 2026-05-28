import type {
  BlockedDateScope,
  BlockedDateType,
} from "@/shared/lib/validations/enums/helpers";

/**
 * 臨時休業 / 急な休み（BlockedDate）の表示用データ。
 *
 * `startDate` / `endDate` は `@db.Date`（UTC 深夜保持）を `formatJstDateOnly()` で
 * `"YYYY-MM-DD"`（JST カレンダー日付）に変換した文字列。
 * `createdAt` / `updatedAt` は ISO 8601 文字列。
 * `scope` / `type` は型ガードで narrow 済みの union。
 */
export type BlockedDateData = {
  readonly id: string;
  readonly scope: BlockedDateScope;
  readonly spaceId: string | null;
  readonly locationId: string | null;
  /** "YYYY-MM-DD"（JST カレンダー日付） */
  readonly startDate: string;
  /** "YYYY-MM-DD"（JST カレンダー日付） */
  readonly endDate: string;
  readonly reason: string | null;
  readonly type: BlockedDateType;
  readonly createdBy: string;
  /** ISO 8601 */
  readonly createdAt: string;
  /** ISO 8601 */
  readonly updatedAt: string;
};
