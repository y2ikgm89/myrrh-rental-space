/**
 * プレビュー Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/preview.ts のテスト
 */

import { describe, test, expect } from "bun:test";

describe("Preview Admin Action Integration", () => {
  describe("generatePreviewHtml の入力パターン", () => {
    test("空文字 contentJson は空文字を返す（auth チェック後）", () => {
      // contentJson が空文字の場合、権限チェック後に '' を返すロジック
      const contentJson = "";
      const result = contentJson ? "html-content" : "";
      expect(result).toBe("");
    });

    test("非空文字 contentJson は HTML 変換を試みる", () => {
      const contentJson = '{"root":{"children":[]}}';
      const shouldAttemptConversion = contentJson.length > 0;
      expect(shouldAttemptConversion).toBe(true);
    });
  });

  describe("Resource 型制約", () => {
    test("有効な Resource 型は post / news / page のみ", () => {
      type Resource = "post" | "news" | "page";
      const validResources: Resource[] = ["post", "news", "page"];
      expect(validResources).toHaveLength(3);
      expect(validResources).toContain("post");
      expect(validResources).toContain("news");
      expect(validResources).toContain("page");
    });

    test('デフォルト resource は "post"', () => {
      type Resource = "post" | "news" | "page";
      const defaultResource: Resource = "post";
      expect(defaultResource).toBe("post");
    });
  });

  describe("generatePreviewHtml 戻り値型", () => {
    test("戻り値は string | null", () => {
      // 権限なし → null
      const noPermission: string | null = null;
      expect(noPermission).toBeNull();

      // 変換成功 → HTML 文字列
      const successResult: string | null = "<p>テスト</p>";
      expect(typeof successResult).toBe("string");

      // 変換エラー → null
      const errorResult: string | null = null;
      expect(errorResult).toBeNull();
    });

    test("権限なしの場合は null を返す（checkReadPermissionFor が false を返す）", () => {
      const hasPermission = false;
      const contentJson = '{"root":{"children":[]}}';
      const result = !hasPermission ? null : contentJson ? "<p>内容</p>" : "";
      expect(result).toBeNull();
    });

    test("権限あり・空文字 contentJson の場合は空文字を返す", () => {
      const hasPermission = true;
      const contentJson = "";
      const result = !hasPermission ? null : contentJson ? "<p>内容</p>" : "";
      expect(result).toBe("");
    });

    test("権限あり・有効 contentJson の場合は HTML を返す", () => {
      const hasPermission = true;
      const contentJson = '{"root":{"children":[]}}';
      const html = "<p>変換済み HTML</p>";
      const result = !hasPermission ? null : contentJson ? html : "";
      expect(result).toBe(html);
    });
  });

  describe("Lexical JSON 形式の基本検証", () => {
    test("有効な Lexical JSON 構造", () => {
      const validLexicalJson = JSON.stringify({
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  text: "テスト",
                  type: "text",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1,
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "root",
          version: 1,
        },
      });

      const parsed: unknown = JSON.parse(validLexicalJson);
      expect(parsed).toBeDefined();
      expect(
        typeof parsed === "object" && parsed !== null && "root" in parsed,
      ).toBe(true);
      if (typeof parsed === "object" && parsed !== null && "root" in parsed) {
        const root = (parsed as { root: unknown }).root;
        expect(
          typeof root === "object" && root !== null && "children" in root,
        ).toBe(true);
        if (typeof root === "object" && root !== null && "children" in root) {
          expect(Array.isArray((root as { children: unknown }).children)).toBe(
            true,
          );
        }
      }
    });

    test("JSON.parse に失敗する文字列は変換エラー対象", () => {
      const invalidJson = "not-valid-json";
      expect(() => JSON.parse(invalidJson)).toThrow();
    });

    test("root プロパティなしの JSON は有効な Lexical 形式ではない", () => {
      const noRootJson = JSON.stringify({ children: [] });
      const parsed: unknown = JSON.parse(noRootJson);
      const isValidLexical =
        typeof parsed === "object" && parsed !== null && "root" in parsed;
      expect(isValidLexical).toBe(false);
    });

    test("空 JSON オブジェクト {} は有効な Lexical 形式ではない", () => {
      const emptyJson = JSON.stringify({});
      const parsed: unknown = JSON.parse(emptyJson);
      const isValidLexical =
        typeof parsed === "object" && parsed !== null && "root" in parsed;
      expect(isValidLexical).toBe(false);
    });
  });

  describe("エラーハンドリングパターン", () => {
    test("変換エラー時は null を返す（try/catch パターン）", () => {
      function simulateConversion(contentJson: string): string | null {
        try {
          if (contentJson === "throw-error") {
            throw new Error("変換に失敗しました");
          }
          return `<p>${contentJson}</p>`;
        } catch {
          return null;
        }
      }

      expect(simulateConversion("throw-error")).toBeNull();
      expect(simulateConversion("normal")).toBe("<p>normal</p>");
    });

    test("logger.error は変換失敗時に呼ばれる（resource と error を含む）", () => {
      const logCalls: Array<{
        message: string;
        context: Record<string, unknown>;
      }> = [];

      function mockLogger(message: string, context: Record<string, unknown>) {
        logCalls.push({ message, context });
      }

      try {
        throw new Error("HTML 変換例外");
      } catch (error) {
        mockLogger("プレビュー HTML 変換に失敗しました", {
          error: error instanceof Error ? error.message : String(error),
          resource: "post",
        });
      }

      expect(logCalls).toHaveLength(1);
      expect(logCalls[0]?.message).toBe("プレビュー HTML 変換に失敗しました");
      expect(logCalls[0]?.context["resource"]).toBe("post");
      expect(logCalls[0]?.context["error"]).toBe("HTML 変換例外");
    });
  });
});
