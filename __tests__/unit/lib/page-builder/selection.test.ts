import { describe, expect, test } from "bun:test";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";
import {
  createPageBuilderSelectionRectFromPoints,
  doPageBuilderSelectionRectsIntersect,
  resolvePageBuilderMarqueeSelection,
} from "@/shared/lib/page-builder/selection";

describe("page-builder selection", () => {
  test("createPageBuilderSelectionRectFromPoints は逆方向 drag でも矩形へ正規化する", () => {
    expect(createPageBuilderSelectionRectFromPoints(180, 120, 40, 20)).toEqual({
      left: 40,
      top: 20,
      width: 140,
      height: 100,
    });
  });

  test("doPageBuilderSelectionRectsIntersect は交差する矩形だけ true を返す", () => {
    expect(
      doPageBuilderSelectionRectsIntersect(
        { left: 10, top: 10, width: 100, height: 80 },
        { left: 90, top: 60, width: 40, height: 40 },
      ),
    ).toBe(true);

    expect(
      doPageBuilderSelectionRectsIntersect(
        { left: 10, top: 10, width: 100, height: 80 },
        { left: 120, top: 10, width: 40, height: 40 },
      ),
    ).toBe(false);
  });

  test("resolvePageBuilderMarqueeSelection は範囲内の leaf node を選択する", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    const selectedNodeIds = resolvePageBuilderMarqueeSelection({
      document,
      rect: { left: 0, top: 0, width: 220, height: 140 },
      candidates: [
        {
          nodeId: "frame-main",
          rect: { left: 0, top: 0, width: 500, height: 300 },
        },
        {
          nodeId: "text-title",
          rect: { left: 24, top: 24, width: 180, height: 60 },
        },
        {
          nodeId: "button-primary",
          rect: { left: 320, top: 220, width: 140, height: 48 },
        },
      ],
      additive: false,
      startSelectedNodeIds: ["root"],
    });

    expect(selectedNodeIds).toEqual(["text-title"]);
  });

  test("resolvePageBuilderMarqueeSelection は additive selection で既存選択を維持して追加する", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    const selectedNodeIds = resolvePageBuilderMarqueeSelection({
      document,
      rect: { left: 300, top: 200, width: 220, height: 120 },
      candidates: [
        {
          nodeId: "button-primary",
          rect: { left: 320, top: 220, width: 140, height: 48 },
        },
      ],
      additive: true,
      startSelectedNodeIds: ["text-title"],
    });

    expect(selectedNodeIds).toEqual(["text-title", "button-primary"]);
  });

  test("resolvePageBuilderMarqueeSelection は tiny drag と空選択を root に戻す", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    expect(
      resolvePageBuilderMarqueeSelection({
        document,
        rect: { left: 0, top: 0, width: 2, height: 2 },
        candidates: [],
        additive: false,
        startSelectedNodeIds: ["text-title"],
      }),
    ).toEqual(["root"]);

    expect(
      resolvePageBuilderMarqueeSelection({
        document,
        rect: { left: 900, top: 900, width: 80, height: 80 },
        candidates: [
          {
            nodeId: "text-title",
            rect: { left: 24, top: 24, width: 180, height: 60 },
          },
        ],
        additive: true,
        startSelectedNodeIds: ["text-title"],
      }),
    ).toEqual(["text-title"]);
  });
});
