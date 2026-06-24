/**
 * Event slug の URL-safe 監査 one-shot script
 *
 * `event-form-schema.ts` に SLUG_REGEX validation を適用したことで、新規・編集時の
 * 不正 slug は弾かれる。本 script は **既存 row** に URL-unsafe な slug が混入していないかを
 * 可視化するための監査用（書込は一切行わない・dry-run only）。
 *
 * 違反検出時の対応:
 * - sitemap は `encodeURIComponent` で防御済のため crawler 影響なし
 * - admin UI から手動で slug を整える（URL リダイレクト不要 — 308 redirect 配線は未要件）
 * - 監査結果を本 script の output として記録し、後続の data fix PR の根拠に使う
 *
 * 使用方法:
 *   bun scripts/audit-event-slugs.ts
 *
 * 出力: 違反 row があれば exit code 1（CI/手動チェックでゲートにできる）
 */

import { SLUG_REGEX } from "@/shared/lib/validations/params";
import { withScript } from "./_shared/script-prisma";

let violationCount = 0;

await withScript("audit-event-slugs", async (prisma) => {
  // deletedAt: null で soft-delete 除外 — 監査対象は live row のみ
  const events = await prisma.event.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📊 total live events: ${events.length}`);
  console.log(`🔍 slug pattern: ${SLUG_REGEX.source}\n`);

  for (const event of events) {
    if (SLUG_REGEX.test(event.slug)) continue;
    violationCount++;
    console.log(
      `❌ id=${event.id} status=${event.status} slug=${JSON.stringify(event.slug)} title=${JSON.stringify(event.title)}`,
    );
  }

  if (violationCount === 0) {
    console.log("✅ 全 event slug が SLUG_REGEX に準拠");
    return;
  }

  console.log(
    `\n⚠️  ${violationCount} / ${events.length} の event slug が SLUG_REGEX 不準拠`,
  );
});

if (violationCount > 0) {
  process.exit(1);
}
