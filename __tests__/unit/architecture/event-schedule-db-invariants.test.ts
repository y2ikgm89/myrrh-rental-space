import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const SCHEDULE_MODE_MIGRATION = join(
  ROOT,
  "prisma",
  "migrations",
  "20260628120000_add_event_schedule_mode",
  "migration.sql",
);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("event schedule DB invariants", () => {
  test("Event.scheduleMode is explicit and deadline uses slot-compatible timestamp type", () => {
    const schema = read(SCHEMA);

    expect(schema).toContain("scheduleMode          EventScheduleMode");
    expect(schema).not.toContain(
      "scheduleMode          EventScheduleMode @default",
    );
    expect(schema).toContain(
      "registrationDeadline  DateTime?   @db.Timestamptz(6)",
    );
    expect(schema).toContain("slotId      String             @db.VarChar(30)");
  });

  test("schedule migration backfills once and then enforces DB-level invariants", () => {
    const migration = read(SCHEDULE_MODE_MIGRATION);

    expect(migration).toContain(
      'ADD COLUMN "scheduleMode" "EventScheduleMode";',
    );
    expect(migration).not.toContain(
      'ADD COLUMN "scheduleMode" "EventScheduleMode" NOT NULL DEFAULT',
    );
    expect(migration).toContain('ALTER COLUMN "scheduleMode" SET NOT NULL;');
    expect(migration).toContain(
      'ALTER COLUMN "registrationDeadline" TYPE TIMESTAMPTZ(6)',
    );
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
