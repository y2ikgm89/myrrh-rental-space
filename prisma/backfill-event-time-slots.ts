/**
 * バックフィル: 既存 Event ごとに EventTimeSlot を 1 件作成し、
 * EventRegistration.slotId をそのスロットに紐づける。
 *
 * 実行タイミング:
 *   `bun run db:migrate --name add_event_time_slots` 適用後、
 *   PR-3（slotId NOT NULL 化 migration）適用前に 1 回だけ実行する。
 *
 * 実行コマンド:
 *   bun prisma/backfill-event-time-slots.ts
 *
 * 冪等性: 既に EventTimeSlot が存在するイベントはスキップする。
 */

// Bun runtime が .env / .env.local を自動読み込みするため dotenv は不要。
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createAppPrismaClient } from "@/shared/db/create-app-prisma-client";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL が設定されていません");

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const base = new PrismaClient({ adapter });
const prisma = createAppPrismaClient(base);

async function main() {
  console.log("=== EventTimeSlot バックフィル開始 ===");

  const events = await prisma.event.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      capacity: true,
      slots: { select: { id: true } },
      registrations: {
        where: { slotId: null },
        select: { id: true },
      },
    },
  });

  console.log(`対象イベント: ${String(events.length)} 件`);

  let slotCreated = 0;
  let regLinked = 0;
  let skipped = 0;

  for (const event of events) {
    if (event.slots.length > 0) {
      console.log(`  SKIP [${event.id}] ${event.title} (スロット既存)`);
      skipped++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // 既存の startTime/endTime を使ってデフォルトスロットを 1 件作成
      const slot = await tx.eventTimeSlot.create({
        data: {
          eventId: event.id,
          startAt: event.startTime,
          endAt: event.endTime,
          // capacity は Event.capacity が null なら 0 をセット（後で管理画面から設定）
          capacity: event.capacity ?? 0,
        },
        select: { id: true },
      });
      slotCreated++;

      // 既存の EventRegistration.slotId を紐づけ
      if (event.registrations.length > 0) {
        await tx.eventRegistration.updateMany({
          where: { eventId: event.id, slotId: null },
          data: { slotId: slot.id },
        });
        regLinked += event.registrations.length;
      }

      console.log(
        `  OK  [${event.id}] ${event.title} → slot ${slot.id}, reg ${String(event.registrations.length)} 件リンク`,
      );
    });
  }

  console.log("");
  console.log("=== 完了 ===");
  console.log(`  スロット作成: ${String(slotCreated)} 件`);
  console.log(`  申込リンク:   ${String(regLinked)} 件`);
  console.log(`  スキップ:     ${String(skipped)} 件`);
  console.log("");
  console.log("次のステップ:");
  console.log("  1. bun run type-check でエラーなしを確認");
  console.log("  2. PR-3 の app 層変更をマージ");
  console.log(
    "  3. bun run db:migrate --name set_slot_id_not_null で NOT NULL migration を適用",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => base.$disconnect());
