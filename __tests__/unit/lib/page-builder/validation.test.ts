import { describe, expect, test } from "bun:test";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";
import {
  createPageBuilderLayoutBox,
  createPageBuilderResponsiveLayout,
} from "@/shared/lib/page-builder/layout";
import {
  getFirstPageBuilderValidationNodeId,
  getPageBuilderNodeFieldError,
  getPageBuilderNodeValidationIssues,
  validatePageBuilderDocument,
} from "@/shared/lib/page-builder/validation";
import { createPageBuilderResponsiveVisibility } from "@/shared/lib/page-builder/visibility";

describe("page-builder validation", () => {
  test("button URL の validation issue を node / field 単位で引ける", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const button = document.nodes["button-primary"];

    if (!button || button.type !== "button") {
      throw new Error("button-primary is missing");
    }

    button.content.url = "javascript:alert(1)";

    const validation = validatePageBuilderDocument(document);

    expect(validation.isValid).toBe(false);
    expect(validation.issueCount).toBe(1);
    expect(getFirstPageBuilderValidationNodeId(validation)).toBe(
      "button-primary",
    );
    expect(
      getPageBuilderNodeFieldError(validation, "button-primary", [
        "content",
        "url",
      ]),
    ).toBe("有効なURLまたはパス（/で始まる）を入力してください");
    expect(
      getPageBuilderNodeValidationIssues(validation, "button-primary"),
    ).toHaveLength(1);
    expect(validation.documentIssues).toHaveLength(0);
  });

  test("document-level issue は node issue と分離される", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    document.rootId = "";

    const validation = validatePageBuilderDocument(document);

    expect(validation.isValid).toBe(false);
    expect(validation.documentIssues).toHaveLength(1);
    expect(getFirstPageBuilderValidationNodeId(validation)).toBeNull();
  });

  test("embed URL の validation issue を selected node 向けに引ける", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];

    if (!frame || frame.type !== "frame") {
      throw new Error("frame-main is missing");
    }

    frame.children.push("embed-invalid");
    document.nodes["embed-invalid"] = {
      id: "embed-invalid",
      type: "embed",
      parentId: frame.id,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Embed",
      layoutMode: "stack",
      style: {},
      layout: createPageBuilderResponsiveLayout(
        createPageBuilderLayoutBox({
          width: "fill",
          height: 220,
        }),
      ),
      content: {
        provider: "youtube",
        url: "https://example.com/not-youtube",
      },
    };

    const validation = validatePageBuilderDocument(document);

    expect(validation.isValid).toBe(false);
    expect(
      getPageBuilderNodeFieldError(validation, "embed-invalid", [
        "content",
        "url",
      ]),
    ).toBe("YouTube の watch / share / embed URL を入力してください");
  });
});
