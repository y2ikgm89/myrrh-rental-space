import { describe, test, expect } from "bun:test";
import { generateUniqueSlug } from "@/shared/lib/slug";

describe("generateUniqueSlug", () => {
  describe("正常系", () => {
    test("使用中でなければ基本スラッグをそのまま返す", () => {
      const used = new Set<string>();
      expect(generateUniqueSlug("Hello World", used)).toBe("hello-world");
    });

    test("使用中のスラッグには -1 を付番する", () => {
      const used = new Set<string>(["hello"]);
      expect(generateUniqueSlug("Hello", used)).toBe("hello-1");
    });

    test("日本語のみの連続見出しは used.size ベースで自動採番される（衝突なし）", () => {
      const used = new Set<string>();
      const a = generateUniqueSlug("見出し", used);
      used.add(a);
      const b = generateUniqueSlug("見出し", used);
      used.add(b);
      const c = generateUniqueSlug("見出し", used);
      used.add(c);
      // フォールバックは `section-${used.size + 1}` なので位置に基づきユニーク化される
      expect([a, b, c]).toEqual(["section-1", "section-2", "section-3"]);
    });

    test("英語の連続重複も -1, -2 と付番する", () => {
      const used = new Set<string>();
      const a = generateUniqueSlug("Intro", used);
      used.add(a);
      const b = generateUniqueSlug("Intro", used);
      used.add(b);
      expect([a, b]).toEqual(["intro", "intro-1"]);
    });

    test("日本語のみの見出しは deterministic なフォールバックを返す（ランダムなし）", () => {
      const used = new Set<string>();
      const first = generateUniqueSlug("見出しタイトル", used);
      const second = generateUniqueSlug("別の見出し", used);
      expect(first).toBe("section-1");
      expect(second).toBe("section-1"); // used に追加されてないので同じ（呼び出し側の責務）
    });

    test("fallbackPrefix を使う", () => {
      const used = new Set<string>();
      expect(generateUniqueSlug("漢字", used, "heading")).toBe("heading-1");
    });

    test("使用中の fallback があれば次の番号を使う", () => {
      const used = new Set<string>(["section-1"]);
      expect(generateUniqueSlug("見出し", used)).toBe("section-2");
    });

    test("ASCII と非 ASCII 混在は ASCII 部分のみ残す", () => {
      const used = new Set<string>();
      expect(generateUniqueSlug("Hello 世界", used)).toBe("hello");
    });

    test("maxLength で切り詰める", () => {
      const used = new Set<string>();
      expect(generateUniqueSlug("a".repeat(100), used, "section", 20)).toBe(
        "a".repeat(20),
      );
    });
  });

  describe("スラッグ一意性", () => {
    test("同じテキストを別の Set 状態で呼ぶと独立に番号付けされる", () => {
      const a = generateUniqueSlug("Title", new Set<string>());
      const b = generateUniqueSlug("Title", new Set<string>(["title"]));
      expect(a).toBe("title");
      expect(b).toBe("title-1");
    });
  });
});
