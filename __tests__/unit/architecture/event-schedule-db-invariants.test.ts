import { describe, expect, test } from "bun:test";

import {
  readAllMigrationSql,
  readDatabaseInvariants,
} from "../../support/prisma-sources";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const BASELINE_MIGRATION = join(
  ROOT,
  "prisma",
  "migrations",
  "00000000000000_init",
  "migration.sql",
);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("event schedule DB invariants", () => {
  test("Event.scheduleMode is explicit and deadline uses slot-compatible timestamp type", () => {
    const schema = read(SCHEMA);

    expect(schema).toMatch(/\bscheduleMode\s+EventScheduleMode\b/u);
    expect(schema).not.toMatch(
      /\bscheduleMode\s+EventScheduleMode\s+@default\b/u,
    );
    expect(schema).toMatch(
      /\bregistrationDeadline\s+DateTime\?\s+(?:@map\("\w+"\)\s+)?@db\.Timestamptz\(6\)/u,
    );
    // 空白で pin すると `prisma format` の列揃え直しだけで落ちる（実際に落ちた）。
    // `@map` も同じ理由で任意にしてある — 守りたいのは「slotId が EventTimeSlot.id と
    // 同じ uuid 型」であって、桁揃えでも物理名でもない。
    expect(schema).toMatch(
      /\bslotId\s+String\s+(?:@map\("\w+"\)\s+)?@db\.Uuid\b/u,
    );
  });

  test("scheduleMode に DB 既定値を置かない（作成時に必ず明示させる）", () => {
    // 既定値を置くと「指定し忘れ」が SINGLE_OCCURRENCE として通り、スロット数の
    // 不変条件と食い違ったイベントが黙って作られる。
    const migration = readAllMigrationSql();

    expect(migration).toContain('"scheduleMode" "EventScheduleMode" NOT NULL');
    expect(migration).not.toContain(
      '"scheduleMode" "EventScheduleMode" NOT NULL DEFAULT',
    );
    expect(migration).toContain('"registrationDeadline" TIMESTAMPTZ(6)');
  });

  test("スロットの値域と scheduleMode 整合が DB 側で強制される", () => {
    // Prisma DSL では CHECK も CONSTRAINT TRIGGER も表現できないので baseline の
    // 手書き不変条件が SSoT。名前は pg_get_* が出す**クォート無し**の正規形。
    const invariants = readDatabaseInvariants();

    expect(invariants).toContain(
      'CONSTRAINT "event_time_slots_capacity_positive"',
    );
    expect(invariants).toContain('CONSTRAINT "event_time_slots_time_order"');
    expect(invariants).toContain(
      'CONSTRAINT "event_registrations_quantity_positive"',
    );
    expect(invariants).toContain(
      "CREATE CONSTRAINT TRIGGER events_schedule_integrity_check",
    );
    expect(invariants).toContain(
      "CREATE CONSTRAINT TRIGGER event_time_slots_schedule_integrity_check",
    );
    // 遅延させないと「Event を作ってから slot を足す」通常の書込順が必ず落ちる。
    expect(invariants).toContain("DEFERRABLE INITIALLY DEFERRED");
  });
});
