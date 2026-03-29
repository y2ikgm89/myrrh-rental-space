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

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createAdminGateToken } from "@/shared/lib/admin-login-gate";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("❌ DATABASE_URL が設定されていません");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const { token, expiresAt } = await createAdminGateToken();

  await prisma.loginToken.create({
    data: { token, expiresAt },
  });

  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] || "http://localhost:3000";
  const loginUrl = `${baseUrl}/admin/login?token=${token}`;

  console.log("");
  console.log("🔑 管理画面ログインURL（30日間有効・ワンタイム）:");
  console.log(`   ${loginUrl}`);
  console.log("");
  console.log(`   有効期限: ${expiresAt.toISOString()}`);
  console.log("");

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error("❌ エラー:", error);
  process.exit(1);
});
