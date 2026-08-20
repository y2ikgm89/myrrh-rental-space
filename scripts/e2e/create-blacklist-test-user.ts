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
 * 再実行や並列 spec 実行で collision しない。
 *
 * ## 後始末
 *
 * **入口で前回分を purge する**（`EMAIL_PREFIX` 一致）。以前この JSDoc は
 * 「テスト側は afterAll で cleanup する」と書いていたが、
 * `blacklist-reservation-block.spec.ts` にその hook は無く、実行のたびに
 * User + credential Account + Customer が 1 組ずつ残り続けていた。
 *
 * spec 側に `afterAll` を足す形は採らない — 本体が timeout すると page も
 * context も閉じられ、hook は走っても仕事ができない
 * （run 30672479398）。入口 purge なら
 * timeout しても次回に回収される。
 *
 * **ただし purge は「古い行」だけを対象にする。** `playwright.config.ts` は
 * `fullyParallel: true` / CI で `workers: 2` なので、1 つの describe の 3 テストが
 * 別 worker に分かれうる。`beforeAll` は **worker ごとに 1 回**走るため、後発 worker の
 * 入口 purge が先発 worker の**生きている fixture**（User / Account / Session /
 * Customer）を消してしまう。消された側はサインインやリダイレクトで落ちる。
 *
 * prefix だけで狙うとこれが防げない。かといって worker 固有の prefix にすると
 * 「別 worker が落とした残骸」を誰も回収しなくなる。作成から一定時間が経った行
 * だけを消せば、同時実行中の行には構造的に触れず、残骸は次回以降に回収される。
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

/** この fixture が作る User の email prefix。入口 purge のキー。 */
const EMAIL_PREFIX = "e2e-blacklist-";

/**
 * 入口 purge の対象にする「古さ」。
 *
 * 同時実行中の worker が作った行は生後数秒〜数十秒なので、この閾値を超えない。
 * 一方 spec 全体（3 テスト）の実測は数十秒で、describe の timeout も分単位。
 * 30 分は「並列の生きた行」と「前回 run の残骸」を確実に分ける幅であり、
 * 残骸は次回 run で必ず回収される。
 */
const PURGE_AGE_MS = 30 * 60 * 1000;

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    // 前回分を先に片付ける（入口 purge）。prefix に加えて **createdAt が古いこと**を
    // 要求する。prefix だけだと、並列 worker が今まさに使っている行を消してしまう。
    const stale = await prisma.user.findMany({
      where: {
        email: { startsWith: EMAIL_PREFIX },
        createdAt: { lt: new Date(Date.now() - PURGE_AGE_MS) },
      },
      select: { id: true },
    });
    if (stale.length > 0) {
      const staleIds = stale.map((u) => u.id);
      // Customer.userId は `onDelete: SetNull` ではなく明示的に消す
      // （匿名化済みでない fixture 行を残さない）。
      await prisma.customer.deleteMany({ where: { userId: { in: staleIds } } });
      await prisma.account.deleteMany({ where: { userId: { in: staleIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: staleIds } } });
      await prisma.user.deleteMany({ where: { id: { in: staleIds } } });
    }

    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const email = `${EMAIL_PREFIX}${unique}@example.com`;
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
        issuer: "local:credential",
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
