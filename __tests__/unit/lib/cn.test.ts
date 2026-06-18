import { describe, test, expect } from "bun:test";
import { cn } from "@/shared/lib/cn";

/**
 * cn() はカスタム font-size トークン（`--text-*`）を tailwind-merge に登録している。
 * 未登録だと tailwind-merge がこれらを text-color と誤分類し、色 utility や
 * 互いと衝突させて黙って drop する（SectionLabel の `text-eyebrow ... text-accent` が
 * 毎 render で text-eyebrow を失っていた回帰）。
 */
describe("cn — custom font-size tokens", () => {
  test("カスタム font-size と色 utility は独立して両方保持される", () => {
    // 回帰の核心：以前は text-eyebrow が text-accent と衝突して消えていた。
    const result = cn("text-eyebrow uppercase text-accent");
    expect(result).toContain("text-eyebrow");
    expect(result).toContain("text-accent");
    expect(result).toContain("uppercase");
  });

  test("カスタム font-size 同士は衝突解決され後勝ちになる", () => {
    // text-h3 と text-2xl は両方 font-size → 後者が勝つ。
    expect(cn("text-h3", "text-2xl")).toBe("text-2xl");
    // カスタム同士でも後勝ち。
    expect(cn("text-page-hero", "text-hero")).toBe("text-hero");
  });

  test("カスタム font-size と背景色など別グループは共存する", () => {
    const result = cn("text-page-hero", "text-background");
    expect(result).toContain("text-page-hero");
    expect(result).toContain("text-background");
  });

  test("text-rating（色トークン）は色として扱われ font-size と衝突しない", () => {
    const result = cn("text-eyebrow", "text-rating");
    expect(result).toContain("text-eyebrow");
    expect(result).toContain("text-rating");
  });

  test("通常の Tailwind utility のマージは従来どおり機能する", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("flex", "hidden")).toBe("hidden");
  });
});
