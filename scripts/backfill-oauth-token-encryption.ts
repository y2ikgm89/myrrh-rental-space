/**
 * legacy OAuth token 一括 backfill スクリプト
 *
 * Better Auth が `Account` テーブルに直書きした平文の Google OAuth token
 * (`accessToken` / `refreshToken`) を一括で at-rest 暗号化する。
 *
 * read 時の遅延移行 (`reEncryptLegacyOAuthToken`) は OAuth account を実際に
 * アクセスしたタイミングでしか発火しないため、非アクティブなアカウントの平文 token は
 * 永久に残る。本スクリプトは lazy migration を補完する one-time backfill で、
 * 業界標準の「lazy + one-time backfill」完全化パターンを実現する。
 *
 * 使用方法:
 *   bun scripts/backfill-oauth-token-encryption.ts            # 実移行
 *   bun scripts/backfill-oauth-token-encryption.ts --dry-run  # 残量集計のみ (書込なし)
 *
 * scope: `providerId = "google"` の account のみ (encryptOAuthToken の
 *        purpose=`oauth-google` と整合)。冪等 — 既に暗号化済みの値は skip する。
 */

import { encryptOAuthToken, isEncrypted } from "@/shared/lib/crypto";
import { withScript } from "./_shared/script-prisma";

const isDryRun = process.argv.slice(2).includes("--dry-run");

type PlaintextField = "accessToken" | "refreshToken";

/** 平文 (= 非暗号化) かつ非 null のフィールドを列挙する。 */
function plaintextFields(account: {
  accessToken: string | null;
  refreshToken: string | null;
}): PlaintextField[] {
  const fields: PlaintextField[] = [];
  if (account.accessToken && !isEncrypted(account.accessToken)) {
    fields.push("accessToken");
  }
  if (account.refreshToken && !isEncrypted(account.refreshToken)) {
    fields.push("refreshToken");
  }
  return fields;
}

await withScript("backfill-oauth-token-encryption", async (prisma) => {
  const accounts = await prisma.account.findMany({
    where: { providerId: "google" },
    select: { id: true, accessToken: true, refreshToken: true },
  });

  let plaintextAccessTokens = 0;
  let plaintextRefreshTokens = 0;
  let migratedAccounts = 0;

  for (const account of accounts) {
    const fields = plaintextFields(account);
    if (fields.length === 0) continue;

    if (fields.includes("accessToken")) plaintextAccessTokens++;
    if (fields.includes("refreshToken")) plaintextRefreshTokens++;

    if (isDryRun) continue;

    const data: { accessToken?: string; refreshToken?: string } = {};
    if (fields.includes("accessToken") && account.accessToken) {
      data.accessToken = encryptOAuthToken(account.accessToken);
    }
    if (fields.includes("refreshToken") && account.refreshToken) {
      data.refreshToken = encryptOAuthToken(account.refreshToken);
    }
    await prisma.account.update({ where: { id: account.id }, data });
    migratedAccounts++;
  }

  console.log("");
  console.log(isDryRun ? "🔍 Dry-run (書込なし)" : "🔐 Backfill 実行");
  console.log(`   Google OAuth account 総数: ${accounts.length}`);
  console.log(`   平文 accessToken:          ${plaintextAccessTokens}`);
  console.log(`   平文 refreshToken:         ${plaintextRefreshTokens}`);
  if (!isDryRun) {
    console.log(`   再暗号化した account:      ${migratedAccounts}`);
  }
  console.log("");
});
