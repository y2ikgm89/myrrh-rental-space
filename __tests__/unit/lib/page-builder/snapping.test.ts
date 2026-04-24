import { describe, expect, test } from "bun:test";
import {
  createPageBuilderSnapGridOffsets,
  isPageBuilderSnappingEnabled,
  snapPageBuilderRect,
} from "@/shared/lib/page-builder/snapping";

describe("page-builder snapping", () => {
  test("move は最も近い guide に x / y を吸着する", () => {
    const result = snapPageBuilderRect(
      {
        left: 96,
        top: 54,
        width: 100,
        height: 80,
      },
      {
        vertical: [100, 300],
        horizontal: [50, 200],
      },
      "move",
    );

    expect(result.deltaX).toBe(4);
    expect(result.deltaY).toBe(-4);
    expect(result.rect.left).toBe(100);
    expect(result.rect.top).toBe(50);
    expect(result.guides).toEqual([
      { orientation: "vertical", offset: 100 },
      { orientation: "horizontal", offset: 50 },
    ]);
  });

  test("move は threshold 外では吸着しない", () => {
    const result = snapPageBuilderRect(
      {
        left: 112,
        top: 64,
        width: 100,
        height: 80,
      },
      {
        vertical: [100],
        horizontal: [50],
      },
      "move",
    );

    expect(result.deltaX).toBe(0);
    expect(result.deltaY).toBe(0);
    expect(result.guides).toEqual([]);
  });

  test("resize は right / bottom edge を guide に吸着する", () => {
    const result = snapPageBuilderRect(
      {
        left: 20,
        top: 40,
        width: 177,
        height: 158,
      },
      {
        vertical: [200],
        horizontal: [200],
      },
      "resize",
    );

    expect(result.deltaX).toBe(3);
    expect(result.deltaY).toBe(2);
    expect(result.rect.width).toBe(180);
    expect(result.rect.height).toBe(160);
    expect(result.guides).toEqual([
      { orientation: "vertical", offset: 200 },
      { orientation: "horizontal", offset: 200 },
    ]);
  });

  test("isPageBuilderSnappingEnabled は Shift 押下中だけ吸着を無効化する", () => {
    expect(isPageBuilderSnappingEnabled({ shiftKey: false })).toBe(true);
    expect(isPageBuilderSnappingEnabled({ shiftKey: true })).toBe(false);
  });

  test("createPageBuilderSnapGridOffsets は 8px グリッドと終端を候補にする", () => {
    expect(createPageBuilderSnapGridOffsets(25)).toEqual([0, 8, 16, 24, 25]);
    expect(createPageBuilderSnapGridOffsets(32)).toEqual([0, 8, 16, 24, 32]);
    expect(createPageBuilderSnapGridOffsets(-10)).toEqual([0]);
  });
});
