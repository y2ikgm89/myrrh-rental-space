import { test, expect, type Page } from "@playwright/test";

/**
 * Phase B.1: admin が ONLINE + MANUAL（手入力）+ 会議 URL で event を作成し、
 * 公開ページで開催形態表示・URL 非表示・JSON-LD（eventAttendanceMode /
 * VirtualLocation）を検証する golden path E2E。
 *
 * 実装参照:
 * - admin フォーム: EventForm.tsx / EventLocationSpaceSelector.tsx / event-form-schema.ts
 * - 公開ページ: (public)/events/[slug]/page.tsx, event-info-panel.tsx, event-json-ld.tsx
 *
 * strict-mode violation 回避に関する注意:
 * - イベント詳細ページの `application/ld+json` script は 1 本ではない。
 *   (public) root layout の Organization+WebSite `@graph`、ArticleLayout
 *   breadcrumb の BreadcrumbList、ページ自身の Event の計 3 本が同時に存在するため、
 *   `"@type": "Event"` を持つ script を明示的に特定してから parse する。
 * - EventInfoPanel は sidebar（lg+）/ mobile（<lg）の 2 variant が常に同時に
 *   DOM mount される（ArticleLayout の toc / mobileToc、CSS で片方のみ表示）。
 *   「開催場所」欄のテキストは両 variant に重複するため `.filter({ visible: true })`
 *   で実際に表示されている方だけに絞り込む。
 */

// events.spec.ts の ADMIN_EVENT_ROUTE_TIMEOUT と同値。管理画面イベント関連の
// route 遷移で広く使われている値に揃える。
const EVENT_SUBMIT_TIMEOUT = 20000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** ページ上の複数 JSON-LD script から `"@type": "Event"` のものを抽出する。 */
async function findEventJsonLd(
  page: Page,
): Promise<Record<string, unknown> | null> {
  const jsonLdTexts = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();

  for (const text of jsonLdTexts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    if (isRecord(parsed) && parsed["@type"] === "Event") {
      return parsed;
    }
  }
  return null;
}

test.describe("Phase B.1: online event admin flow", () => {
  test("admin が ONLINE + MANUAL + URL で event 作成 → 公開ページに JSON-LD 出力、URL は非表示", async ({
    page,
  }) => {
    // slug は @unique 制約あり + ensureUniqueSlug が衝突時に無言で `-2` 等へ
    // rename するため、CI retry（最大2回）で同一 slug を再送すると「作成したつもりの
    // slug」と「実際の slug」がずれ得る。毎回一意な値にして回避する。
    const uniqueSuffix = Date.now();
    // タイトルは意図的に「オンライン開催」を含めない: breadcrumb の aria-current="page"
    // span と H1 見出しにも同じ文字列が出力されるため、含めると venue display の
    // 「オンライン開催」テキストアサーションと strict-mode で衝突する（実測確認済み）。
    const title = `E2E テストイベント ${String(uniqueSuffix)}`;
    const slug = `online-event-e2e-${String(uniqueSuffix)}`;
    const meetingUrl = "https://meet.google.com/e2e-test";

    await page.goto("/admin/events/new");

    const eventCreateForm = page.locator("form#event-create");
    await expect(eventCreateForm).toBeVisible();

    // ---- 基本情報タブ（初期表示） ----
    await eventCreateForm
      .getByRole("textbox", { name: "タイトル", exact: true })
      .fill(title);
    await page.getByLabel("スラッグ").fill(slug);
    // 単一開催（デフォルト）の開催枠 1 件に日時を入力する。
    await page.getByLabel("開始日時").fill("2099-08-01T10:00");
    await page.getByLabel("終了日時").fill("2099-08-01T12:00");

    // ---- 会場タブ: 開催形態 ONLINE + 発行方法 MANUAL + 会議 URL ----
    await page.getByRole("tab", { name: "会場" }).click();
    await page.getByRole("radio", { name: "オンラインのみ" }).click();
    await page
      .getByRole("radio", { name: "手入力 (Zoom / Teams / 独自 URL)" })
      .click();
    await page.getByLabel("会議 URL").fill(meetingUrl);

    // ---- 参加費・定員タブ: デフォルト区分 1 件に区分名のみ入力（他は初期値のまま有効） ----
    await page.getByRole("tab", { name: "参加費・定員" }).click();
    await page.getByLabel("区分名").fill("一般");

    // ---- 本文・公開タブ: ステータスを公開中に ----
    await page.getByRole("tab", { name: "本文・公開" }).click();
    await page.getByLabel("ステータス").click();
    await page.getByRole("option", { name: "公開中" }).click();

    await page.getByRole("button", { name: "作成" }).click();

    // createEventAction は成功時に一覧ページへ redirect する（詳細ページへは遷移しない）。
    await expect(page).toHaveURL(/\/admin\/events$/u, {
      timeout: EVENT_SUBMIT_TIMEOUT,
    });

    // ---- 公開ページ ----
    await page.goto(`/events/${slug}`);

    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();

    await expect(
      page.getByText("オンライン開催").filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText("参加 URL は登録完了時にメールでお送りします")
        .filter({ visible: true }),
    ).toBeVisible();
    // 会議 URL 本体は登録完了メール限定のため公開 JSX には一切出力されない。
    await expect(page.getByText(meetingUrl)).not.toBeVisible();

    // ---- JSON-LD 検証 ----
    const eventJsonLd = await findEventJsonLd(page);
    if (eventJsonLd === null) {
      throw new Error(
        'Event JSON-LD script (script[type="application/ld+json"] with "@type": "Event") was not found on the page',
      );
    }
    expect(eventJsonLd["eventAttendanceMode"]).toBe(
      "OnlineEventAttendanceMode",
    );

    const location = eventJsonLd["location"];
    if (!isRecord(location)) {
      throw new Error("Event JSON-LD location is not an object");
    }
    expect(location["@type"]).toBe("VirtualLocation");
    expect(location["url"]).toBeUndefined();
  });
});
