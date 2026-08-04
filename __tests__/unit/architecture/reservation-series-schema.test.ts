import { describe, expect, test } from "bun:test";

import { readAllMigrationSql } from "../../support/prisma-sources";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("ReservationSeries schema invariants", () => {
  test("Reservation.couponId は nullable (Codex #3599414656 fix)", async () => {
    const schema = await readFile(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    // model スコープを指定せず全文 match すると、より手前にある
    // ReservationSeries.couponId（同じく nullable）と偶然一致し、Reservation 側が
    // non-null に退行しても検知できない（Phase C 監査で判明）。
    // Reservation モデルブロックを明示的に切り出してから検証する。
    const reservationBlock = schema.match(
      /model Reservation \{[\s\S]*?@@map\("reservations"\)\s*\}/,
    );
    expect(reservationBlock).not.toBeNull();
    expect(reservationBlock![0]).toMatch(/couponId\s+String\?\s+@db\.Uuid/);
  });

  test("partial UNIQUE index が migration 履歴に存在 (Codex #3599414660 fix)", () => {
    // **どの migration が作ったかは見ない。** 履歴を 1 本の baseline へ畳むと
    // 名指しのディレクトリは消えるが、この索引は畳んだ先にも必ず存在する。
    const sql = readAllMigrationSql();

    expect(sql).toContain(
      'CREATE UNIQUE INDEX "reservation_series_space_dtstart_active_unique"',
    );
    // 生成 DDL は述語を括弧で包む（手書き migration は包んでいなかった）。
    expect(sql).toMatch(/WHERE \(?"deletedAt" IS NULL\)?/u);
  });

  test("ReservationSeries の索引宣言が揃っている", async () => {
    const schema = await readFile(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    const seriesBlock = schema.match(
      /model ReservationSeries \{[\s\S]*?@@map\("reservation_series"\)\s*\}/,
    );
    expect(seriesBlock).not.toBeNull();

    // 以前は「@@index が 4 個」という個数だけを見ていたため、**正当な索引の追加でも
    // 落ちる**（FK 索引カバレッジの補完で 2 本増えた時点で赤くなった）一方、
    // どれか 1 本を別のものに差し替えても気づけなかった。守りたいのは個数ではなく
    // 「この列の索引が存在すること」なので、対象を名指しする。
    const missing = [
      "@@index([spaceId, dtstart])",
      "@@index([customerId])",
      "@@index([createdAt])",
      "@@index([deletedAt])",
    ].filter((declaration) => !seriesBlock![0].includes(declaration));

    expect(missing).toEqual([]);
  });

  test("TermsScope に RESERVATION_SERIES 追加済", async () => {
    const schema = await readFile(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    expect(schema).toMatch(
      /enum TermsScope\s*\{[\s\S]*?RESERVATION_SERIES[\s\S]*?\}/,
    );
  });
});
