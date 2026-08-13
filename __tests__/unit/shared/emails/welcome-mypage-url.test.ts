/**
 * ウェルカムメールの遷移先 URL レンダリングテスト
 *
 * バグ: テンプレートが受け取った URL に `/mypage` を継ぎ足していた
 * (`const mypageUrl = `${loginUrl}/mypage``) が、production の呼び出し側
 * (`shared/domain/customers/link.ts`) は既に `${getAppUrl()}/mypage` を
 * 渡していたため、実際に送られるボタンの href は `/mypage/mypage` になり
 * 404 に着地していた。fixture だけがサイトルート (`https://example.com`) を
 * 渡していたのでプレビューと registry のテスト送信は正しく見え、
 * 本番の新規登録メールだけが壊れていた。
 *
 * テンプレートは URL を組み立てず、受け取った値をそのまま href にする。
 * ここでは **呼び出し側と同じ「/mypage で終わる URL」** を渡して、
 * 継ぎ足しが復活したら落ちる形にしている。
 */
import { describe, test, expect } from "bun:test";
import { render } from "@react-email/render";
import { WelcomeEmail } from "@/shared/emails/welcome";
import { welcomeFixture } from "@/shared/emails/welcome.fixture";

const CALLER_SHAPED_URL = "https://rental-space.example/mypage";

describe("WelcomeEmail の遷移先 URL", () => {
  test("受け取った URL をそのまま href にする（パスを継ぎ足さない）", async () => {
    const html = await render(
      WelcomeEmail({ ...welcomeFixture, mypageUrl: CALLER_SHAPED_URL }),
    );

    expect(html).toContain(`href="${CALLER_SHAPED_URL}"`);
    expect(html).not.toContain("/mypage/mypage");
  });

  test("ボタンが機能しない場合の fallback テキストも同じ URL を出す", async () => {
    const text = await render(
      WelcomeEmail({ ...welcomeFixture, mypageUrl: CALLER_SHAPED_URL }),
      { plainText: true },
    );

    expect(text).toContain(CALLER_SHAPED_URL);
    expect(text).not.toContain("/mypage/mypage");
  });
});
