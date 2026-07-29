import { hashPassword } from "better-auth/crypto";
import { Role, CustomerStatus } from "@generated/prisma/enums";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

/**
 * E2E fixture: BLACKLIST 状態でログイン可能な独立顧客ユーザーを 1 件作成する。
 *
 * `e2e/authenticated/customer/blacklist-reservation-block.spec.ts` から
 * `execFile("bun", [thisScript], { env: process.env })` で呼ばれ、
 * 標準出力に `{ email, password, userId, customerId }` の JSON を返す。
 *
 * ## なぜ dev-customer を流用しないか
 *
 * `chromium-customer` project は複数の spec が dev-customer の REGULAR 状態を
 * 前提に並列実行される。`test.describe.serial` はファイル内でしか直列化しない
 * ため、dev-customer の status を BLACKLIST に flip すると他の customer spec が
 * BLACKLIST 状態で /mypage を叩き flake する。並列汚染を避けるため、専用の
 * 独立 User + credential Account + Customer(BLACKLIST) を毎テスト run で作成する。
 *
 * ## 作成する内容
 *
 * - `User(role: CUSTOMER, emailVerified: true)`
 * - `Account(providerId: "credential", password: hashed)` … Better Auth
 *   `emailAndPassword` は E2E opt-in (playwright.config webServer env) で有効
 * - `Customer(userId, status: BLACKLIST, isActive: false)` … `MypageAuthGate` の
 *   `isCustomerActiveForMypage` 判定を確実に false 化する 2 段構え
 *
 * ## email / password の一意性
 *
 * 実行毎に `Date.now()` + `Math.random()` で一意 email を生成するため、fixture の
 * 再実行や並列 spec 実行で collision しない。テスト側は afterAll で cleanup する。
 */

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

interface BlacklistTestUserFixture {
  readonly email: string;
  readonly password: string;
  readonly userId: string;
  readonly customerId: string;
}

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const email = `e2e-blacklist-${unique}@example.com`;
    const password = "blacklist-e2e-password-01234567";
    const name = "E2E ブラックリスト太郎";

    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: Role.CUSTOMER,
        emailVerified: true,
      },
      select: { id: true },
    });

    const hashedPassword = await hashPassword(password);

    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: hashedPassword,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        userId: user.id,
        email,
        emailCanonical: normalizeEmailForIdentity(email),
        lastName: "ブラックリスト",
        firstName: "太郎",
        status: CustomerStatus.BLACKLIST,
        // BLACKLIST + isActive=false の両方を落として `isCustomerActiveForMypage`
        // の SSoT 判定を確実に false にする。実運用でも管理側の
        // `bulkSetStatusCustomersCommand` は BLACKLIST 化と同時に isActive=false を
        // set するため実データと同じ状態を再現している。
        isActive: false,
      },
      select: { id: true },
    });

    const fixture: BlacklistTestUserFixture = {
      email,
      password,
      userId: user.id,
      customerId: customer.id,
    };

    console.log(JSON.stringify(fixture));
  } finally {
    await disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    "create-blacklist-test-user failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
