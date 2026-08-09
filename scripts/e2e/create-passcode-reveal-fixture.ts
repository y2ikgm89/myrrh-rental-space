import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
import { spaceFixtures } from "../../e2e/fixtures/test-data";
import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

process.env["ENCRYPTION_KEY"] = process.env["ENCRYPTION_KEY"] || "0".repeat(64);

// `crypto.ts`（経由する env/encryption.ts）と `issue-passcode.ts` は
// `import "server-only"` を持つ。`server-only` パッケージは webpack エイリアス無しで
// 読み込まれると常に throw する実装のため（Next.js のバンドラー内でのみ no-op 化される）、
// bun test の preload（`__tests__/setup.ts`）と同じ意図で `Bun.plugin` により
// このスクリプトの実行時だけ `server-only` を no-op モジュールに差し替える。
Bun.plugin({
  name: "stub-server-only",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});

// `crypto.ts` は `@/shared/lib/env/server.ts`(serverEnv) を module load 時に
// Zod パースするため、上記の env 上書き後に動的 import する。
const { encrypt } = await import("@/shared/lib/crypto");
const { PASSCODE_CRYPTO_PURPOSE } =
  await import("@/shared/domain/smart-lock/issue-passcode");

const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";
const E2E_PASSCODE = "654321";
const FIXTURE_MARKER = "[E2E] passcode reveal fixture";

/**
 * 時刻は**実行時の実時刻を基準に相対で作る**（絶対日付を焼き込まない）。
 *
 * 解錠番号の表示可否は `customer-passcode-queries.ts` の
 * `isWithinStoredPasscodeWindow({ now, startTime, endTime })` が
 * **サーバーの実時刻**で判定する。`E2E_FIXED_NOW_ISO` はサーバー全体の時計を
 * 差し替える仕組みではなく、`EventCalendarSection` /
 * `ReservationFormSection` の 2 コンポーネントだけが読む値なので、
 * このゲートには効かない。
 *
 * 旧実装は `2026-08-01T00:45Z`〜`03:15Z` を焼き込んでおり、実時刻がその
 * 2 時間半に入る 1 日以外は必ず `outside_window` になって
 * 「解錠番号を表示」ボタンが描画されなかった（実測: CI run 30622036713）。
 *
 * 相対配置は旧定数の幾何をそのまま保つ:
 * now-75min 〜 now+75min の window / 予約開始は now-60min。
 */
const MINUTE_MS = 60 * 1000;
const E2E_NOW = new Date();
const PASSCODE_START = new Date(E2E_NOW.getTime() - 75 * MINUTE_MS);
const PASSCODE_END = new Date(E2E_NOW.getTime() + 75 * MINUTE_MS);
const RESERVATION_START = new Date(E2E_NOW.getTime() - 60 * MINUTE_MS);
const RESERVATION_END = new Date(E2E_NOW.getTime() + 60 * MINUTE_MS);

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    // seed は同じメールで会員（userId あり）と merge fixture 用のゲスト（userId null）の
    // 2 行を作る。`userId` で絞らないと任意の順でゲスト行を掴み、その run だけ落ちる。
    const customer = await prisma.customer.findFirstOrThrow({
      where: { email: DEV_CUSTOMER_EMAIL, userId: { not: null } },
      select: { id: true },
    });

    // SwitchBot の有効化は **seed の宣言**（`seedSettings`）が持つ。ここで
    // singleton を書き換えると復元されず、seed が作れる状態と DB が恒久的に
    // 食い違う（E2E のグローバル状態は必ず復元する規約）。
    // 無効なままなら `getPasscodeRevealState` が `unavailable` を返すので、
    // 分かりにくい失敗にならないよう明示的に落とす。
    const switchbot = await prisma.settingsSwitchbot.findUnique({
      where: { id: "singleton" },
      select: { switchbotEnabled: true },
    });
    if (!switchbot?.switchbotEnabled) {
      throw new Error(
        "[passcode-reveal fixture] SwitchBot が無効です。dev seed（seedSettings）が走っているか確認してください",
      );
    }

    // 専有スペースを slug で引く。**探索しない。**
    //
    // 予約は DB の EXCLUDE 制約 `reservations_no_active_time_overlap_excl`
    // （spaceId = かつ `tsrange(startTime, endTime, '[)')` が overlap、
    // status ∈ {PENDING, CONFIRMED} かつ deletedAt IS NULL）で重複を弾かれる。
    // 旧実装は「今の時刻の窓が空いている公開スペース」を探していたが、seed の
    // デモ当日予約が 3 スペースすべてを塞ぐ時間帯があり（実測 16:00〜18:00 UTC、
    // CI run 30708064822）、そこに当たると fixture 生成ごと落ちていた。
    //
    // このスペースは seed の `DEMO_RESERVATION_SPACE_SLUGS` に含まれないので、
    // 実行時刻がどこであっても窓は必ず空いている。所有分割の規約と slug の一致は
    // `__tests__/unit/architecture/e2e-fixture-space-ownership.test.ts` が強制する。
    const space = await prisma.space.findFirst({
      where: {
        slug: spaceFixtures.passcodeRevealSpaceSlug,
        isActive: true,
      },
      select: { id: true, name: true, smartLockDeviceId: true },
    });

    if (!space) {
      throw new Error(
        `[passcode-reveal fixture] 専有スペース "${spaceFixtures.passcodeRevealSpaceSlug}" がありません。dev seed（seedE2EFixtureSpace）が走っているか確認してください`,
      );
    }

    // Pad デバイスも seed が用意する。ここで作り足すと、失敗時に
    // 「デバイスだけ残る」中途半端な状態を作りうるので作らない。
    const deviceId = space.smartLockDeviceId;
    if (!deviceId) {
      throw new Error(
        `[passcode-reveal fixture] 専有スペースに Pad デバイスが紐づいていません。dev seed（seedE2EFixtureSpace）を再実行してください`,
      );
    }

    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    // 予約は固定時刻（clock 凍結と揃える必要がある）に作るため、前回実行分が
    // 残っていると DB の EXCLUDE 制約
    // `reservations_no_active_time_overlap_excl` に衝突して fixture 作成が落ちる
    // （run 30595374008 の実失敗）。marker 付きの旧 fixture を先に片付けて冪等にする。
    const stale = await prisma.reservation.findMany({
      where: {
        customerId: customer.id,
        spaceId: space.id,
        notes: { startsWith: FIXTURE_MARKER },
      },
      select: { id: true },
    });
    if (stale.length > 0) {
      const staleIds = stale.map((r) => r.id);
      await prisma.smartLockPasscode.deleteMany({
        where: { reservationId: { in: staleIds } },
      });
      await prisma.reservation.deleteMany({ where: { id: { in: staleIds } } });
    }

    const totalPrice = 6000;
    const taxRate = 10;
    const taxAmount = Math.round((totalPrice * taxRate) / 100);

    const reservation = await prisma.reservation.create({
      data: {
        spaceId: space.id,
        customerId: customer.id,
        startTime: RESERVATION_START,
        endTime: RESERVATION_END,
        basePrice: totalPrice,
        totalPrice,
        taxRateType: "STANDARD",
        taxRate,
        taxAmount,
        totalPriceWithTax: totalPrice + taxAmount,
        rateBreakdownJson: asPrismaInputJsonValue(
          {
            schemaVersion: 1,
            segments: [],
            totalHours: 0,
            totalBasePrice: 0,
            holidayFlags: {},
          },
          "fixture rateBreakdownJson が不正です",
        ),
        status: "CONFIRMED",
        paymentStatus: "PAID",
        notes: `${FIXTURE_MARKER} ${unique}`,
      },
      select: { id: true },
    });

    const passcodeCiphertext = encrypt(E2E_PASSCODE, {
      purpose: PASSCODE_CRYPTO_PURPOSE,
    });

    await prisma.smartLockPasscode.create({
      data: {
        reservationId: reservation.id,
        deviceId,
        status: "CONFIRMED",
        passcodeCiphertext,
        switchbotKeyId: `e2e-key-${unique}`,
        startTime: PASSCODE_START,
        endTime: PASSCODE_END,
        confirmedAt: E2E_NOW,
      },
    });

    console.log(
      JSON.stringify({
        reservationId: reservation.id,
        spaceName: space.name,
        passcode: E2E_PASSCODE,
        fixedNowIso: E2E_NOW.toISOString(),
      }),
    );
  } finally {
    await disconnect();
  }
}

try {
  await main();
  // Playwright 側は `execFile` の解決を待つ。メール送信の detached promise や
  // pg pool のハンドルが残るとイベントループが空にならず、プロセスが終了せず
  // spec が丸ごとタイムアウトする（run 30595374008 の waitlist-offer-confirm は
  // 90 s 上限でもこれ）。stdout は書き終わっているので明示的に終了する。
  process.exit(0);
} catch (error) {
  console.error(
    "❌ create-passcode-reveal-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
