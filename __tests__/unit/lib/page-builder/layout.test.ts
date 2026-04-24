import { describe, expect, test } from "bun:test";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";
import {
  arePageBuilderLayoutBoxesEqual,
  clearPageBuilderNodeLayoutOverride,
  hasPageBuilderNodeLayoutOverride,
  resolvePageBuilderNodeLayoutBox,
  setPageBuilderNodeLayoutBox,
} from "@/shared/lib/page-builder/layout";
import { parsePageBuilderDocument } from "@/shared/lib/page-builder/schema";

describe("page-builder layout", () => {
  test("arePageBuilderLayoutBoxesEqual は座標とサイズ差分を比較する", () => {
    expect(
      arePageBuilderLayoutBoxesEqual(
        {
          x: 10,
          y: 20,
          width: 320,
          height: 160,
          rotate: 0,
          zIndex: 2,
        },
        {
          x: 10,
          y: 20,
          width: 320,
          height: 160,
          rotate: 0,
          zIndex: 2,
        },
      ),
    ).toBe(true);

    expect(
      arePageBuilderLayoutBoxesEqual(
        {
          x: 10,
          y: 20,
          width: 320,
          height: 160,
          rotate: 0,
          zIndex: 2,
        },
        {
          x: 11,
          y: 20,
          width: 320,
          height: 160,
          rotate: 0,
          zIndex: 2,
        },
      ),
    ).toBe(false);
  });

  test("tablet / mobile override は継承元との差分だけを保持する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const title = document.nodes["text-title"];

    if (!title || title.type !== "text") {
      throw new Error("text-title is missing");
    }

    setPageBuilderNodeLayoutBox(title, "tablet", {
      ...resolvePageBuilderNodeLayoutBox(title, "tablet"),
      x: 48,
      width: 320,
    });

    expect(hasPageBuilderNodeLayoutOverride(title, "tablet")).toBe(true);
    expect(title.layout.overrides.tablet).toEqual({
      x: 48,
      width: 320,
    });

    setPageBuilderNodeLayoutBox(title, "mobile", {
      ...resolvePageBuilderNodeLayoutBox(title, "mobile"),
      y: 96,
    });

    expect(hasPageBuilderNodeLayoutOverride(title, "mobile")).toBe(true);
    expect(title.layout.overrides.mobile).toEqual({
      y: 96,
    });
    expect(resolvePageBuilderNodeLayoutBox(title, "mobile")).toEqual({
      x: 48,
      y: 96,
      width: 320,
      height: "hug",
      rotate: 0,
      zIndex: 0,
    });

    clearPageBuilderNodeLayoutOverride(title, "tablet");

    expect(hasPageBuilderNodeLayoutOverride(title, "tablet")).toBe(false);
    expect(resolvePageBuilderNodeLayoutBox(title, "tablet")).toEqual({
      x: 0,
      y: 0,
      width: "fill",
      height: "hug",
      rotate: 0,
      zIndex: 0,
    });
    expect(resolvePageBuilderNodeLayoutBox(title, "mobile")).toEqual({
      x: 0,
      y: 96,
      width: "fill",
      height: "hug",
      rotate: 0,
      zIndex: 0,
    });
  });

  test("parsePageBuilderDocument は schemaVersion 1 を拒否する", () => {
    const currentDocument = createDefaultPageBuilderDocument("テスト");
    const legacyDocument = {
      ...currentDocument,
      schemaVersion: 1,
    };

    expect(() => parsePageBuilderDocument(legacyDocument)).toThrow(
      "ページビルダードキュメントが不正です",
    );
  });
});
