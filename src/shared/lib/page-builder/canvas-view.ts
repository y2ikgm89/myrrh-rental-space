export const PAGE_BUILDER_CANVAS_DEFAULT_ZOOM = 100;
export const PAGE_BUILDER_CANVAS_MIN_ZOOM = 50;
export const PAGE_BUILDER_CANVAS_MAX_ZOOM = 200;
export const PAGE_BUILDER_CANVAS_ZOOM_STEP = 25;
export const PAGE_BUILDER_CANVAS_ZOOM_OPTIONS = [
  50, 75, 100, 125, 150, 175, 200,
] as const;

export type PageBuilderCanvasMeasurementLabelInput = number | "hug" | "fill";

export function clampPageBuilderCanvasZoom(value: number): number {
  return Math.min(
    PAGE_BUILDER_CANVAS_MAX_ZOOM,
    Math.max(PAGE_BUILDER_CANVAS_MIN_ZOOM, Math.round(value)),
  );
}

export function getPageBuilderCanvasScale(zoom: number): number {
  return clampPageBuilderCanvasZoom(zoom) / 100;
}

export function scalePageBuilderCanvasMeasurement(
  value: number,
  zoom: number,
): number {
  return value * getPageBuilderCanvasScale(zoom);
}

export function unscalePageBuilderCanvasMeasurement(
  value: number,
  zoom: number,
): number {
  return value / getPageBuilderCanvasScale(zoom);
}

export function stepPageBuilderCanvasZoom(
  currentZoom: number,
  direction: -1 | 1,
): number {
  return clampPageBuilderCanvasZoom(
    currentZoom + direction * PAGE_BUILDER_CANVAS_ZOOM_STEP,
  );
}

export function formatPageBuilderCanvasCoordinateLabel(value: number): string {
  return `${Math.round(value)}px`;
}

export function formatPageBuilderCanvasMeasurementLabel(
  value: PageBuilderCanvasMeasurementLabelInput,
): string {
  return typeof value === "number" ? `${Math.round(value)}px` : value;
}
