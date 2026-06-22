/*
  Warnings:

  - You are about to drop the column `faviconUrl` on the `settings` table. All the data in the column will be lost.

*/
-- AlterTable
-- squawk-ignore ban-drop-column
-- 理由: PR #699 (expand step) で Settings.faviconUrl への全 read/write 参照
-- (layout / domain / admin UI / Zod / action / seed / tests) を撤去済。本 PR (contract)
-- が本番反映される時点で旧コードが本番から消えており、列 DROP しても誰も参照しない
-- (.claude/rules/migrations.md 「列削除」 official two-PR pattern 準拠)。pre-release
-- 段階のため big-bang も例外条件で許容範囲。
ALTER TABLE "settings" DROP COLUMN "faviconUrl";
