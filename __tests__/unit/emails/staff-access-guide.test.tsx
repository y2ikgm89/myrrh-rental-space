import { describe, expect, test } from "bun:test";
import { render } from "@react-email/render";
import { StaffAccessGuideEmail } from "@/shared/emails/staff-access-guide";
import { staffAccessGuideFixture } from "@/shared/emails/staff-access-guide.fixture";

describe("StaffAccessGuideEmail", () => {
  test("renders admin URL and no password/setup token language", async () => {
    const html = await render(
      <StaffAccessGuideEmail {...staffAccessGuideFixture} />,
    );

    expect(html).toContain("https://admin.example.com/admin");
    expect(html).toContain("staff@example.com");
    expect(html).not.toContain("パスワードを設定");
    expect(html).not.toContain("/setup/");
    expect(html).toContain("Googleアカウント");
  });
});
