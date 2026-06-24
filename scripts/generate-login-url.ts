/**
 * 管理画面ログインURL生成スクリプト
 *
 * Admin Gate で保護されたログインページにアクセスするための
 * 署名付きワンタイムトークンを生成します。
 *
 * 使用方法:
 *   bun scripts/generate-login-url.ts
 *
 * 用途:
 *   - 初回セットアップ後のログインURL取得
 *   - ロックアウト時の復旧
 *   - 新スタッフへのログインURL発行
 */

import { createAdminGateToken } from "@/shared/lib/admin-login-gate";
import { withScript } from "./_shared/script-prisma";

await withScript("generate-login-url", async (prisma) => {
  const { token, expiresAt } = await createAdminGateToken();

  await prisma.loginToken.create({
    data: { token, expiresAt },
  });

  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
  const loginUrl = `${baseUrl}/admin/login?token=${token}`;

  console.log("");
  console.log("🔑 管理画面ログインURL（30日間有効・ワンタイム）:");
  console.log(`   ${loginUrl}`);
  console.log("");
  console.log(`   有効期限: ${expiresAt.toISOString()}`);
  console.log("");
});
