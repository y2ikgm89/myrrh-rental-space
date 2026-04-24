import { describe, expect, test } from "bun:test";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";
import {
  clearPageBuilderNodeVisibilityOverride,
  hasPageBuilderNodeVisibilityOverride,
  resolvePageBuilderNodeHidden,
  setPageBuilderNodeHidden,
  togglePageBuilderNodeHidden,
} from "@/shared/lib/page-builder/visibility";
import { parsePageBuilderDocument } from "@/shared/lib/page-builder/schema";

describe("page-builder visibility", () => {
  test("tablet / mobile visibility override は継承元との差分だけを保持する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const title = document.nodes["text-title"];

    if (!title || title.type !== "text") {
      throw new Error("text-title is missing");
    }

    setPageBuilderNodeHidden(title, "tablet", true);

    expect(hasPageBuilderNodeVisibilityOverride(title, "tablet")).toBe(true);
    expect(title.visibility.overrides.tablet).toBe(true);

    togglePageBuilderNodeHidden(title, "mobile");

    expect(hasPageBuilderNodeVisibilityOverride(title, "mobile")).toBe(true);
    expect(title.visibility.overrides.mobile).toBe(false);
    expect(resolvePageBuilderNodeHidden(title, "tablet")).toBe(true);
    expect(resolvePageBuilderNodeHidden(title, "mobile")).toBe(false);

    clearPageBuilderNodeVisibilityOverride(title, "tablet");

    expect(hasPageBuilderNodeVisibilityOverride(title, "tablet")).toBe(false);
    expect(resolvePageBuilderNodeHidden(title, "tablet")).toBe(false);
    expect(resolvePageBuilderNodeHidden(title, "mobile")).toBe(false);
  });

  test("parsePageBuilderDocument は schemaVersion 2 を拒否する", () => {
    const currentDocument = createDefaultPageBuilderDocument("テスト");
    const legacyDocument = {
      ...currentDocument,
      schemaVersion: 2,
    };

    expect(() => parsePageBuilderDocument(legacyDocument)).toThrow(
      "ページビルダードキュメントが不正です",
    );
  });
});
