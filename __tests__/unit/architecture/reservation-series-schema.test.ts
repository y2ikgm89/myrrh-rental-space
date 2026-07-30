import { describe, expect, test } from "bun:test";
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

  test("partial UNIQUE index が migration に存在 (Codex #3599414660 fix)", async () => {
    const { readdirSync } = await import("node:fs");
    const migrationsDir = join(process.cwd(), "prisma/migrations");
    const dirs = readdirSync(migrationsDir).filter((d) =>
      d.endsWith("_add_reservation_series"),
    );
    expect(dirs.length).toBe(1);
    const sql = await readFile(
      join(migrationsDir, dirs[0]!, "migration.sql"),
      "utf8",
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "reservation_series_space_dtstart_active_unique"',
    );
    expect(sql).toContain('WHERE "deletedAt" IS NULL');
  });

  test("ReservationSeries に @@index 4 個宣言", async () => {
    const schema = await readFile(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    const seriesBlock = schema.match(
      /model ReservationSeries \{[\s\S]*?@@map\("reservation_series"\)\s*\}/,
    );
    expect(seriesBlock).not.toBeNull();
    const indexCount = (seriesBlock![0].match(/@@index\(/g) ?? []).length;
    expect(indexCount).toBe(4);
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
