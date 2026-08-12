/**
 * 管理画面の予約フォーム / 一覧フィルターが、非公開スペースを見分けられる形で
 * 出すことの回帰テスト。
 *
 * 候補一覧は `isActive` だけで絞る（管理画面は非公開スペースへの電話予約入力を
 * 許容する。`getSpacesForReservationQuery` の JSDoc）。印が無いと公開中の
 * スペースと区別できず、公開されているつもりで予約を入れられる。
 */
import { describe, expect, test } from "bun:test";

import { spaceOptionLabel } from "@/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-helpers";

describe("spaceOptionLabel", () => {
  test("非公開スペースには印を付ける", () => {
    expect(spaceOptionLabel({ name: "会議室A", isPublished: false })).toBe(
      "会議室A（非公開）",
    );
  });

  test("公開スペースは名前だけ", () => {
    expect(spaceOptionLabel({ name: "会議室A", isPublished: true })).toBe(
      "会議室A",
    );
  });
});
