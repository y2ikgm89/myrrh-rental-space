import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { primeAdminRequestContext } from "../helpers/admin-auth";
import { uniqueEmail } from "../fixtures";

/**
 * イベント参加申込 - capacity=1 の TOCTOU 直列化検証 (E2E-P2-03)
 *
 * ## シナリオ
 *
 * 空の capacity=1 イベントに対して、独立した 3 コンテキスト（unique IP + unique
 * email）から同時に参加申込フォームを送信し、
 * `pg_advisory_xact_lock(728350, hashtext(eventId))` が read-before-write の
 * TOCTOU race を直列化することを検証する。
 *
 * 期待挙動 (SSoT: `src/shared/domain/events/registration-commands.ts` +
 * `.claude/rules/business-domain.md` 予約・イベント定員セクション):
 *
 * 1. ちょうど 1 件のリクエストが CONFIRMED として成功し、UI に
 *    「お申し込みを受け付けました」が表示される
 * 2. 残り 2 件は「このタイムスロットは満員です」DomainError を受け、
 *    フォーム内 role=alert に「満員」文言が表示される
 * 3. DB を再検証し、対象 event の CONFIRMED 申込が正確に 1 件・
 *    quantity 合計 1 であることを確認する
 *
 * ## 設計注記
 *
 * - fixture (`scripts/e2e/create-toctou-capacity-one-fixture.ts`) が capacity=1
 *   の空 event を都度その場作成する（seed の `waitlist-test` は既に埋まっており
 *   TOCTOU 検証に使えないため）。同 script が `count <eventId>` サブコマンドで
 *   post-hoc の DB 集計も返す
 * - 独立 IP は `primeAdminRequestContext(context)` (`e2e/helpers/admin-auth.ts`)
 *   で `x-forwarded-for` を context 単位に割り当てる。同一 IP 3 連発は
 *   `eventRegistrationSubmitRateLimiter` に阻まれ TOCTOU 以外の理由で失敗する
 * - bot heuristic (`checkBotHeuristics`) の MIN_FORM_FILL_TIME_MS=3000 を守るため、
 *   全 page が form mount してから submit までに 3.1s 以上の間隔を空ける
 * - Turnstile は E2E で「always passes」テストキー
 *   (`playwright.config.ts` の `NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA"` /
 *   `TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA"`) が
 *   環境変数に注入されており、実 widget が成功トークンを hidden input へ書き込む
 *   のを `expect(turnstileToken input).not.toHaveValue("")` で待つ
 * - `test.describe.configure({ retries: 0 })`: 「1 件だけ勝つ」strict 契約は
 *   retry で緑になる状況を許容しない。retry で fixture 再作成しても、初回失敗の
 *   原因が「実は 2 件成功していた」だった場合、その時点でバグとして落ちる必要がある
 */

const execFileAsync = promisify(execFile);

const CONCURRENT_ATTEMPTS = 3;
// `checkBotHeuristics` の MIN_FORM_FILL_TIME_MS (=3000ms、action-helpers.ts) を
// 上回るバッファ。form mount から submit までにこの時間を確保する。
const FORM_FILL_MIN_MS = 3100;

interface ToctouFixture {
  readonly eventSlug: string;
  readonly eventId: string;
  readonly ticketId: string;
  readonly slotId: string;
}

interface CountResult {
  readonly eventId: string;
  readonly confirmedCount: number;
  readonly confirmedSumQuantity: number;
  readonly totalCount: number;
}

const workspaceRoot = path.join(__dirname, "..", "..", "..");
const fixtureScriptPath = path.join(
  workspaceRoot,
  "scripts",
  "e2e",
  "create-toctou-capacity-one-fixture.ts",
);

async function createFixture(): Promise<ToctouFixture> {
  const { stdout } = await execFileAsync("bun", [fixtureScriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as ToctouFixture;
}

async function countRegistrations(eventId: string): Promise<CountResult> {
  const { stdout } = await execFileAsync(
    "bun",
    [fixtureScriptPath, "count", eventId],
    { cwd: workspaceRoot, env: process.env },
  );
  return JSON.parse(stdout.trim()) as CountResult;
}

interface PreparedAttempt {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly email: string;
}

async function prepareAttempt(
  browser: Browser,
  fixture: ToctouFixture,
  index: number,
): Promise<PreparedAttempt> {
  const context = await browser.newContext();
  await primeAdminRequestContext(context);

  const page = await context.newPage();
  await page.goto(`/events/${fixture.eventSlug}`);

  const registerSection = page.locator("#event-register");
  await expect(registerSection).toBeVisible({ timeout: 15_000 });

  const nameInput = registerSection.getByLabel("お名前").first();
  const emailInput = registerSection.getByLabel("メールアドレス").first();
  const submitButton = registerSection
    .getByRole("button", { name: "申し込む" })
    .first();

  await expect(nameInput).toBeEditable();
  await expect(emailInput).toBeEditable();

  const email = uniqueEmail(`e2e-toctou-${String(index + 1)}`);
  await nameInput.fill(`E2E TOCTOU 参加者 ${String(index + 1)}`);
  await expect(nameInput).toHaveValue(`E2E TOCTOU 参加者 ${String(index + 1)}`);
  await emailInput.fill(email);
  await expect(emailInput).toHaveValue(email);

  // 必須規約 (EVENT_REGISTRATION scope) を全て同意する。seed に該当規約が無ければ
  // 0 件で pass、あればすべて check する。
  const consentCheckboxes = registerSection.getByRole("checkbox");
  const consentCount = await consentCheckboxes.count();
  for (let i = 0; i < consentCount; i++) {
    const box = consentCheckboxes.nth(i);
    await expect(box).toBeEnabled();
    await box.check();
    await expect(box).toBeChecked();
  }

  // Turnstile 実 widget (test key) の onSuccess が hidden input を埋めるのを待つ。
  const turnstileTokenInput = page.locator('input[name="turnstileToken"]');
  await expect(turnstileTokenInput).not.toHaveValue("", { timeout: 15_000 });

  // すべての前提が揃うと送信ボタンが有効化される。
  await expect(submitButton).toBeEnabled({ timeout: 15_000 });

  return { context, page, email };
}

async function classifyOutcome(page: Page): Promise<"success" | "sold-out"> {
  const registerSection = page.locator("#event-register");
  const success = page.getByRole("heading", {
    name: "お申し込みを受け付けました",
  });
  const soldOut = registerSection
    .getByRole("alert")
    .filter({ hasText: /満員/u });

  // どちらか一方が visible になるまで待つ。Turnstile → server action → UI 更新
  // の往復に最大数秒かかるため 30 秒を上限に置く。
  await expect(success.or(soldOut)).toBeVisible({ timeout: 30_000 });

  if (await success.isVisible()) return "success";
  return "sold-out";
}

test.describe("イベント参加申込 - capacity=1 TOCTOU (E2E-P2-03)", () => {
  test.describe.configure({ retries: 0 });

  test("同時申込 3 件のうち正確に 1 件のみが CONFIRMED になる", async ({
    browser,
  }) => {
    // page.clock は使わない: Server Action の Date.now() (bot heuristic +
    // registrationDeadline チェック) はサーバー側の実時刻を参照するため、
    // ブラウザ側だけ clock 凍結しても意味が無い。E2E_FIXED_NOW_ISO (2026-07-04) は
    // fixture の枠 (2027-04-20) より過去のため deadline チェックは自動でパスする。

    const fixture = await createFixture();
    const prepared: PreparedAttempt[] = [];
    let earliestPreparedAt = Number.POSITIVE_INFINITY;

    try {
      for (let i = 0; i < CONCURRENT_ATTEMPTS; i++) {
        const t0 = Date.now();
        const attempt = await prepareAttempt(browser, fixture, i);
        prepared.push(attempt);
        earliestPreparedAt = Math.min(earliestPreparedAt, t0);
      }

      // bot heuristic (MIN_FORM_FILL_TIME_MS=3000ms) を満たすまで待機。
      // page.waitForTimeout は banned のため Node.js の setTimeout で sleep する。
      const elapsedSinceEarliest = Date.now() - earliestPreparedAt;
      if (elapsedSinceEarliest < FORM_FILL_MIN_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, FORM_FILL_MIN_MS - elapsedSinceEarliest),
        );
      }

      // 全 context の submit を Promise.all で並列発火。
      // pg_advisory_xact_lock(728350, hashtext(eventId)) が入りエントリを直列化し、
      // 1 番目だけが残枠 1 を消費、他は DomainError "このタイムスロットは満員です"。
      await Promise.all(
        prepared.map(({ page }) =>
          page
            .locator("#event-register")
            .getByRole("button", { name: "申し込む" })
            .first()
            .click(),
        ),
      );

      const outcomes = await Promise.all(
        prepared.map(({ page }) => classifyOutcome(page)),
      );

      const successCount = outcomes.filter((o) => o === "success").length;
      const soldOutCount = outcomes.filter((o) => o === "sold-out").length;

      expect(successCount).toBe(1);
      expect(soldOutCount).toBe(CONCURRENT_ATTEMPTS - 1);

      // DB レベルの再検証: capacity=1 に対して CONFIRMED は正確に 1 件・
      // quantity 合計 1 で、他の申込は create すら成立しない
      // (registration-commands.ts の残枠チェックが DomainError を throw する)。
      const dbState = await countRegistrations(fixture.eventId);
      expect(dbState.confirmedCount).toBe(1);
      expect(dbState.confirmedSumQuantity).toBe(1);
      expect(dbState.totalCount).toBe(1);
    } finally {
      await Promise.all(prepared.map(({ context }) => context.close()));
    }
  });
});
