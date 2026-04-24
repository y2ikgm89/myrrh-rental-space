import { describe, expect, test } from "bun:test";
import {
  clampPageBuilderCanvasZoom,
  formatPageBuilderCanvasCoordinateLabel,
  formatPageBuilderCanvasMeasurementLabel,
  getPageBuilderCanvasScale,
  scalePageBuilderCanvasMeasurement,
  stepPageBuilderCanvasZoom,
  unscalePageBuilderCanvasMeasurement,
} from "@/shared/lib/page-builder/canvas-view";

describe("page-builder canvas view", () => {
  test("clampPageBuilderCanvasZoom は許容範囲に丸める", () => {
    expect(clampPageBuilderCanvasZoom(20)).toBe(50);
    expect(clampPageBuilderCanvasZoom(124.6)).toBe(125);
    expect(clampPageBuilderCanvasZoom(500)).toBe(200);
  });

  test("getPageBuilderCanvasScale / scale / unscale は同じ倍率で変換する", () => {
    expect(getPageBuilderCanvasScale(125)).toBe(1.25);
    expect(scalePageBuilderCanvasMeasurement(320, 125)).toBe(400);
    expect(unscalePageBuilderCanvasMeasurement(400, 125)).toBe(320);
  });

  test("stepPageBuilderCanvasZoom は 25% 単位で拡大縮小する", () => {
    expect(stepPageBuilderCanvasZoom(100, 1)).toBe(125);
    expect(stepPageBuilderCanvasZoom(100, -1)).toBe(75);
    expect(stepPageBuilderCanvasZoom(50, -1)).toBe(50);
    expect(stepPageBuilderCanvasZoom(200, 1)).toBe(200);
  });

  test("formatPageBuilderCanvas*Label は canvas 表示用に丸めて単位を付ける", () => {
    expect(formatPageBuilderCanvasCoordinateLabel(12.4)).toBe("12px");
    expect(formatPageBuilderCanvasCoordinateLabel(12.5)).toBe("13px");
    expect(formatPageBuilderCanvasMeasurementLabel(240.6)).toBe("241px");
    expect(formatPageBuilderCanvasMeasurementLabel("hug")).toBe("hug");
    expect(formatPageBuilderCanvasMeasurementLabel("fill")).toBe("fill");
  });
});
