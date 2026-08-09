import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
} from "../../fixtures/e2e-test";
import { urls } from "../../fixtures";

/**
 * BLACKLIST 顧客の予約・イベント申込・マイページ遮断 E2E (E2E-P2-01)
 *
 * ## 4-stage blacklist blocking の概要
 *
 * 予約荒らし対策として、`CustomerStatus.BLACKLIST` の顧客は以下 4 経路で新規の
 * ライフサイクルアクションが遮断される (`project_blacklist-customer-reservation-block-2026-07-11`
 * memo と PR #937 / #1223 での確定仕様):
 *
 * 1. **Stage A (MypageAuthGate / MYPAGE-AUTH-02, PR #1223)** — ログイン済み
 *    BLACKLIST 顧客の `/mypage` 全 route への到達を SC 層 (`MypageAuthGate`) で
 *    redirect ブロックし、mypage 経由の全 Server Action (キャンセル / プロフィール
 *    更新 / 領収書 DL 等) を read-time で遮断する。
 * 2. **Stage B (公開予約 / PR #937 前段)** — 未ログインゲストと同じメールで
 *    `createPublicReservationCommand` を叩いた際、tx 内の
 *    `ensureCustomerNotBlacklisted({ customerId, email })` が userId=null の guest
 *    Customer を email 一致で検索して BLACKLIST を拒否する。
 * 3. **Stage C (イベント申込 / PR #937 後段)** — `createEventRegistrationCommand`
 *    の advisory lock 直後で同じガードが customerId + email 両経路をチェック。
 * 4. **Stage D (server action 層 assertion / PR #937 後段の関連)** —
 *    `assertCustomerActive` が予約 / mypage 側の全 Server Action で
 *    `getCustomerByUserId` 直後に呼ばれ、TOCTOU で status が BLACKLIST に flip した
 *    ケースも execute 前に throw する (`OAUTH-BETTER-AUTH-01` 保護)。
 *
 * ## この spec のカバー範囲
 *
 * **Stage A の end-to-end** (BLACKLIST 顧客のログイン後 mypage 遷移が
 * `/login?error=account_suspended` に redirect され、`SuspendedNotice` が
 * 「アカウントが停止されています」を表示する) を実 SC 描画 + Better Auth
 * session cookie 経由で検証する。/mypage 直下だけでなく sub-route
 * (`/mypage/settings`, `/mypage/inquiries`) も同一 layout gate 配下にあるため
 * 併せて確認する (`MypageAuthGate` は layout レベルで全 route に効くので、
 * gate 済みの route を 1 件でもすり抜けたら architecture が壊れている sanity check)。
 *
 * Stage B / C / D の Server Action ガード自体は以下のテストが実 DB / モック
 * 両方でカバー済み:
 *   - `__tests__/unit/domain/customers/guard.test.ts`
 *   - `__tests__/unit/domain/customers/bulk-status-commands.test.ts`
 *   - `__tests__/integration/domain/reservations/blacklist-guard.test.ts`
 *   - `__tests__/unit/domain/events/registration-commands.test.ts`
 * E2E は上位層 (server-rendered UI + Better Auth session) の real integration に
 * 集中させる分担 (`e2e/authenticated/customer/waitlist.spec.ts` が
 * `registerWaitlistEntryCommand` を実 DB 統合テストに委ねているのと同型)。
 *
 * ## dev-customer を使わない理由
 *
 * `chromium-customer` project は fullyParallel=true (`playwright.config.ts`) で
 * 複数 spec が dev-customer の REGULAR + isActive=true 状態を前提に並列実行される。
 * `test.describe.serial` はファイル内でしか直列化しないため、dev-customer の
 * status を BLACKLIST に flip すると他 spec が flake する。fixture script で
 * spec 独立の一意 email/password を持つ BLACKLIST User + Customer を作成し、
 * `test.use({ storageState: ... })` で dev-customer の共有 storageState を無効化
 * → Better Auth REST endpoint (`/api/customer-auth/sign-in/email`) で当該 User に
 * ログイン → session cookie 込みで /mypage をつつく。
 *
 * ## 参照
 * - `src/app/(public)/mypage/layout.tsx` MypageAuthGate
 * - `src/shared/domain/customers/guard.ts` isCustomerActiveForMypage
 * - `src/app/(public)/login/_components/suspended-notice.tsx`
 */

const execFileAsync = promisify(execFile);

interface BlacklistTestUserFixture {
  readonly email: string;
  readonly password: string;
  readonly userId: string;
  readonly customerId: string;
}

async function createBlacklistTestUser(): Promise<BlacklistTestUserFixture> {
  const workspaceRoot = path.join(__dirname, "..", "..", "..");
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-blacklist-test-user.ts",
  );

  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });

  return JSON.parse(stdout.trim()) as BlacklistTestUserFixture;
}

/**
 * Better Auth `/api/customer-auth/sign-in/email` にサーバー側から POST し、
 * その Set-Cookie を browser context に注入する。
 * `emailAndPassword.enabled` は E2E webServer env (`NEXT_PUBLIC_ENABLE_E2E_LOGIN=1`)
 * で真になるので、fresh User に対しても credential login が通る
 * (`src/shared/lib/customer-auth.ts` L109-113)。
 */
async function signInBlacklistUser(
  requestContext: APIRequestContext,
  context: BrowserContext,
  credentials: { email: string; password: string },
): Promise<void> {
  const response = await requestContext.post(
    "/api/customer-auth/sign-in/email",
    {
      data: {
        email: credentials.email,
        password: credentials.password,
      },
      failOnStatusCode: false,
    },
  );
  expect(
    response.ok(),
    `sign-in/email must succeed to establish session (status ${response.status().toString()})`,
  ).toBe(true);

  // request context の cookie を browser context に転写する。Playwright の
  // APIRequestContext は自前で cookie jar を持つため、page.goto に session cookie
  // を反映させるには browserContext.addCookies が必要。
  const cookies = await requestContext.storageState();
  await context.addCookies(cookies.cookies);
}

// dev-customer の共有 storageState を無効化して独立 BLACKLIST User で挙動を検証する。
// (顧客テストは既定で storageState 適用済みのため、明示的に空へ上書きする)
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Stage A: BLACKLIST customer /mypage layout gate", () => {
  let fixture: BlacklistTestUserFixture;

  test.beforeAll(async () => {
    fixture = await createBlacklistTestUser();
  });

  test("`/mypage` は `/login?error=account_suspended` にリダイレクトされる", async ({
    page,
    context,
    request,
  }) => {
    await signInBlacklistUser(request, context, fixture);

    await page.goto(urls.mypage);

    await expect(page).toHaveURL(/\/login\?error=account_suspended/u);

    // SuspendedNotice (`role="alert"`) が停止メッセージを表示していることを確認。
    // `LoginPage` の分岐が壊れて通常の error banner にフォールバックすると
    // ログアウトボタンが出ずユーザーが詰むので、SuspendedNotice 固有の UX を確認する。
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /アカウントが停止されています/u }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ログアウトする/u }),
    ).toBeVisible();
  });

  test("`/mypage/settings` も layout gate で redirect される", async ({
    page,
    context,
    request,
  }) => {
    await signInBlacklistUser(request, context, fixture);

    await page.goto(urls.mypageProfile);

    await expect(page).toHaveURL(/\/login\?error=account_suspended/u);
  });

  test("`/mypage/inquiries` も layout gate で redirect される", async ({
    page,
    context,
    request,
  }) => {
    await signInBlacklistUser(request, context, fixture);

    await page.goto(urls.mypageInquiries);

    await expect(page).toHaveURL(/\/login\?error=account_suspended/u);
  });
});
