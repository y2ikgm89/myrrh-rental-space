/**
 * payment ON × Stripe 未設定のときに、支払手段がゼロにならないことの検証。
 *
 * == なぜ要るのか ==
 *
 * 決済ゲートは「業務層（`isFeatureEnabled("payment")`）」と「技術層（Stripe
 * credentials）」の 2 層に分かれており、UI は必ず両方を見る
 * `isOnlinePaymentAvailable()` を使う契約になっている。
 *
 * ところが振込先の表示判定だけが**業務層しか見ていなかった**（監査 F-133）。
 * feature は ON だが credentials が未設定（連携の設定途中、鍵ローテーションで
 * 暗号文を消した直後）のとき:
 *
 * - 決済ボタンは `isOnlinePaymentAvailable()` が false になって消える
 * - 振込先も「payment が ON だから」で消える
 * - → **UNPAID の予約詳細に支払手段が 1 つも出ない。** メールにも載らない
 *
 * 運用者からは「payment は ON なのだから Checkout で払えるはず」に見えるので
 * 気づけない。
 *
 * == 何を mock し、何を通すか ==
 *
 * 差し替えるのは**入力側の 2 層だけ**（feature フラグと credentials の読み取り）。
 * `isOnlinePaymentAvailable()` の合成と `shouldShowTransferAccounts` の判定、
 * および active 口座の集計（実 DB）は本物を通す。**欠陥は「どちらの層を見るか」に
 * あった**ので、そこを mock すると何も確かめられない。
 *
 * credentials は Settings 行そのものを消す形にしない — 共有 test-db なので他の
 * 直列テストを壊す。読み取りだけを差し替える。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
}));

// 2 層を独立に動かせるようにする。差し替えるのは**入力側の 2 つ**だけで、
// 「どちらの層を見て振込先を出すか」という判定そのものは本物を通す。
//
// 技術層は Settings 行そのものを消す形にはしない — 共有 test-db なので他の
// 直列テストを壊す。読み取りだけを差し替える。
let featurePaymentEnabled = true;
const stripeCredentialsConfigured = false;

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: (feature: string) =>
    Promise.resolve(feature === "payment" ? featurePaymentEnabled : true),
}));

const actualIntegration =
  await import("@/shared/domain/settings/queries/integration");
mock.module("@/shared/domain/settings/queries/integration", () => ({
  ...actualIntegration,
  getStripeCredentialCiphertext: () =>
    Promise.resolve(
      stripeCredentialsConfigured
        ? { stripeSecretKey: "enc:sk", stripeWebhookSecret: "enc:whsec" }
        : null,
    ),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type TransferModule =
  typeof import("@/shared/domain/settings/transfer-account-queries");

let prisma: PrismaModule["prisma"];
let resolveTransferAccountsForCustomerDisplay: TransferModule["resolveTransferAccountsForCustomerDisplay"];

let nextSortOrder = 7_000_000 + Math.floor(Math.random() * 100_000);

async function createActiveTransferAccount(): Promise<{
  id: string;
  cleanup: () => Promise<void>;
}> {
  const suffix = crypto.randomUUID();
  const row = await prisma.transferAccount.create({
    data: {
      label: `振込先 ${suffix}`,
      bankName: "テスト銀行",
      branchName: "本店",
      accountType: "ORDINARY",
      accountNumber: "1234567",
      accountHolderName: "カ）テスト",
      sortOrder: nextSortOrder++,
      isActive: true,
    },
    select: { id: true },
  });
  return {
    id: row.id,
    cleanup: async () => {
      await prisma.transferAccount.deleteMany({ where: { id: row.id } });
    },
  };
}

describeMaybe("payment ON × Stripe 未設定でも振込先を出す", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ resolveTransferAccountsForCustomerDisplay } =
      await import("@/shared/domain/settings/transfer-account-queries"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("feature ON でも credentials が無ければ UNPAID に振込先を出す", async () => {
    featurePaymentEnabled = true;
    const account = await createActiveTransferAccount();

    try {
      const result = await resolveTransferAccountsForCustomerDisplay({
        paymentStatus: "UNPAID",
      });

      // ここが null だと、決済ボタンも消えているので支払手段がゼロになる。
      expect(result).not.toBeNull();
      expect(result?.accounts.length).toBeGreaterThan(0);
    } finally {
      await account.cleanup();
    }
  });

  test("支払い済みなら出さない", async () => {
    featurePaymentEnabled = true;
    const account = await createActiveTransferAccount();

    try {
      const result = await resolveTransferAccountsForCustomerDisplay({
        paymentStatus: "PAID",
      });
      expect(result).toBeNull();
    } finally {
      await account.cleanup();
    }
  });

  test("feature OFF でも UNPAID なら出す（従来どおり）", async () => {
    featurePaymentEnabled = false;
    const account = await createActiveTransferAccount();

    try {
      const result = await resolveTransferAccountsForCustomerDisplay({
        paymentStatus: "UNPAID",
      });
      expect(result).not.toBeNull();
    } finally {
      featurePaymentEnabled = true;
      await account.cleanup();
    }
  });
});
