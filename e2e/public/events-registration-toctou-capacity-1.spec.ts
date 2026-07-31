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

// このファイルは `e2e/public/` 配下 = repo root から 2 階層。`..` を 3 つ重ねると
// root の 1 つ上を指し、fixture script が `Module not found` になる（CI で長期潜伏した）。
const workspaceRoot = path.join(__dirname, "..", "..");
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

/**
 * 「お申し込み」セクション。
 *
 * `#event-register` の CSS セレクタは使わない: React streaming は完了した Suspense
 * boundary の HTML を hidden な staging container へ流し込んでから in-place に
 * 差し替えるため、差し替え待ちの間は同じ id を持つ section が DOM 上に 2 つ存在する
 * （CI run 30602667260 で実際に strict-mode violation として観測）。role locator は
 * a11y ツリー非公開の要素を除外するので、常に表示中の 1 本だけを掴む。
 */
function registrationSection(page: Page) {
  return page.getByRole("region", { name: "お申し込み" });
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

  const registerSection = registrationSection(page);
  await expect(registerSection).toBeVisible({ timeout: 15_000 });

  const nameInput = registerSection.getByLabel("お名前");
  const emailInput = registerSection.getByLabel("メールアドレス");
  const submitButton = registerSection.getByRole("button", {
    name: "申し込む",
  });

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

/**
 * 失敗時に「実際に何が描画されていたか」をメッセージへ載せるための診断ヘルパー。
 * role locator でスコープするので streaming 中の hidden staging copy は拾わない。
 */
async function describeMainContent(page: Page): Promise<string> {
  // 診断は決して throw しない。main landmark すら取れない状態（遷移中・
  // context クローズ間際など）で例外を投げると、本来報告すべき「success でも
  // sold-out でもなかった」という事実がヘルパー自身の TimeoutError に
  // すり替わってしまう。
  try {
    // `textContent` ではなく `innerText`。`<main>` の先頭には ArticleLayout が置く
    // JSON-LD (`<script type="application/ld+json">`) があり、`textContent` は
    // script の中身まで拾うため 300 文字の予算を JSON-LD だけで食い潰す
    // （実測 run 30670065962: 報告された "main の実内容" が JSON-LD の途中で切れ、
    // 肝心の可視テキストが 1 文字も出なかった）。`innerText` は描画されたテキスト
    // だけを返すので script / 非表示要素は入らない。
    const text = await page.getByRole("main").innerText({ timeout: 5_000 });
    return text.replace(/\s+/gu, " ").trim().slice(0, 300);
  } catch {
    return `(main landmark を取得できず url=${page.url()})`;
  }
}

async function classifyOutcome(page: Page): Promise<"success" | "sold-out"> {
  const registerSection = registrationSection(page);
  const success = page.getByRole("heading", {
    name: "お申し込みを受け付けました",
  });
  const soldOut = registerSection
    .getByRole("alert")
    .filter({ hasText: /満員/u });

  // どちらか一方が visible になるまで待つ。Turnstile → server action → UI 更新
  // の往復に最大数秒かかるため 30 秒を上限に置く。
  //
  // success / sold-out のどちらでもない「第三の状態」に落ちうる:
  // Server Action が DomainError 以外を投げると error boundary
  // (`events/[slug]/error.tsx`) がページごと差し替わり、申込セクション自体が
  // DOM から消える。素の `.or()` 待機だとこれが「element(s) not found」の
  // 30 秒タイムアウトにしか見えず、原因が spec なのかアプリなのか判別できない
  // (CI run 30631140902 の切り分けには artifact の ARIA スナップショットを
  // 掘る必要があった)。失敗時は main の実テキストを添えてログだけで判る形にする。
  try {
    await expect(success.or(soldOut)).toBeVisible({ timeout: 30_000 });
  } catch (cause) {
    throw new Error(
      "申込結果が success (お申し込みを受け付けました) にも sold-out (満員 alert) にも " +
        `ならなかった。main の実内容: ${await describeMainContent(page)}`,
      { cause },
    );
  }

  if (await success.isVisible()) return "success";
  return "sold-out";
}

test.describe("イベント参加申込 - capacity=1 TOCTOU (E2E-P2-03)", () => {
  // 既定の 30s では足りない。spec 自身の内部待機だけで超過する:
  //   prepareAttempt × 3（各: goto + セクション可視化 15s + Turnstile token 15s +
  //   submit 有効化 15s）→ bot heuristic の FORM_FILL_MIN_MS 3.1s →
  //   3 並列 submit の classifyOutcome 30s
  // 実測 (CI run 30621350538) では本体を抜ける前に 30s を使い切り、
  // `finally` の context.close で `Test ended` になっていた。
  //
  // retries: 0 は維持する（「1 件だけ勝つ」strict 契約は retry で緑にしない）。
  test.describe.configure({ retries: 0, timeout: 120_000 });

  test("同時申込 3 件のうち正確に 1 件のみが CONFIRMED になる", async ({
    browser,
  }) => {
    // page.clock は使わない: Server Action の Date.now() (bot heuristic +
    // registrationDeadline チェック) はサーバー側の実時刻を参照するため、
    // ブラウザ側だけ clock 凍結しても意味が無い。E2E_FIXED_NOW_ISO (2026-07-04) は
    // fixture の枠 (2027-04-20) より過去のため deadline チェックは自動でパスする。

    const fixture = await createFixture();
    const prepared: PreparedAttempt[] = [];
    let lastPreparedAt = 0;

    try {
      for (let i = 0; i < CONCURRENT_ATTEMPTS; i++) {
        const attempt = await prepareAttempt(browser, fixture, i);
        prepared.push(attempt);
        lastPreparedAt = Date.now();
      }

      // bot heuristic (MIN_FORM_FILL_TIME_MS=3000ms) を満たすまで待機。
      // page.waitForTimeout は banned のため Node.js の setTimeout で sleep する。
      //
      // 基準は「最後に用意したページ」でなければならない。閾値はサーバーが
      // `Date.now() - formRenderedAt` で測り、`formRenderedAt` は各ページの
      // client mount 時刻 (`useState(() => Date.now())`、event-registration-form.tsx) の
      // ため、3 本のうち最も新しいページが最短の fill 時間になる。
      // 以前は「最初の attempt の開始時刻」を基準にしており、3 本を直列に用意する
      // 時点でその経過は必ず 3.1s を超えるため **この待機は常にスキップされていた**。
      // prepareAttempt の戻り時刻は必ず formRenderedAt より後なので、そこから
      // FORM_FILL_MIN_MS 待てば全ページが閾値を超えることを保証できる。
      const elapsedSinceLastPrepared = Date.now() - lastPreparedAt;
      if (elapsedSinceLastPrepared < FORM_FILL_MIN_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, FORM_FILL_MIN_MS - elapsedSinceLastPrepared),
        );
      }

      // 全 context の submit を Promise.all で並列発火。
      // pg_advisory_xact_lock(728350, hashtext(eventId)) が入りエントリを直列化し、
      // 1 番目だけが残枠 1 を消費、他は DomainError "このタイムスロットは満員です"。
      await Promise.all(
        prepared.map(({ page }) =>
          registrationSection(page)
            .getByRole("button", { name: "申し込む" })
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
