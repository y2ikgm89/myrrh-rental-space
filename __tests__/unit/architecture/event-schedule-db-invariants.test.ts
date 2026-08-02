import { describe, expect, test } from "bun:test";
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
      /\bregistrationDeadline\s+DateTime\?\s+@db\.Timestamptz\(6\)/u,
    );
    // 空白で pin すると `prisma format` の列揃え直しだけで落ちる（実際に落ちた）。
    // 守りたいのは「slotId が EventTimeSlot.id の cuid と同じ VarChar(30)」であって
    // 桁揃えではないので、隣の assertion と同じく空白非依存の正規表現で書く。
    expect(schema).toMatch(/\bslotId\s+String\s+@db\.VarChar\(30\)/u);
  });

  test("baseline migration enforces DB-level schedule invariants", () => {
    const migration = read(BASELINE_MIGRATION);

    expect(migration).toContain('"scheduleMode" "EventScheduleMode" NOT NULL');
    expect(migration).not.toContain(
      '"scheduleMode" "EventScheduleMode" NOT NULL DEFAULT',
    );
    expect(migration).toContain('"registrationDeadline" TIMESTAMPTZ(6)');
    expect(migration).toContain(
      'CONSTRAINT "event_time_slots_capacity_positive"',
    );
    expect(migration).toContain('CONSTRAINT "event_time_slots_time_order"');
    expect(migration).toContain(
      'CONSTRAINT "event_registrations_quantity_positive"',
    );
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "events_schedule_integrity_check"',
    );
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "event_time_slots_schedule_integrity_check"',
    );
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
  });
});
