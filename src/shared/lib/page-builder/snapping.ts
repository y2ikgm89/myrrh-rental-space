export type PageBuilderSnapMode = "move" | "resize";

export type PageBuilderSnapModifierState = {
  readonly shiftKey: boolean;
};

export const PAGE_BUILDER_SNAP_GRID_SIZE = 8;

export type PageBuilderSnapGuide = {
  readonly orientation: "vertical" | "horizontal";
  readonly offset: number;
};

export type PageBuilderSnapRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export type PageBuilderSnapCandidates = {
  readonly vertical: readonly number[];
  readonly horizontal: readonly number[];
};

type SnapTarget = {
  readonly value: number;
};

type SnapMatch = {
  readonly adjustment: number;
  readonly candidate: number;
};

const PAGE_BUILDER_SNAP_THRESHOLD = 6;

export function isPageBuilderSnappingEnabled(
  modifiers: PageBuilderSnapModifierState,
): boolean {
  return !modifiers.shiftKey;
}

export function createPageBuilderSnapGridOffsets(
  size: number,
  gridSize = PAGE_BUILDER_SNAP_GRID_SIZE,
): number[] {
  const normalizedSize = Math.max(0, Math.round(size));
  const normalizedGridSize = Math.max(1, Math.round(gridSize));
  const offsets: number[] = [];

  for (let offset = 0; offset <= normalizedSize; offset += normalizedGridSize) {
    offsets.push(offset);
  }

  if (!offsets.includes(normalizedSize)) {
    offsets.push(normalizedSize);
  }

  return offsets;
}

function findBestSnapMatch(
  targets: readonly SnapTarget[],
  candidates: readonly number[],
  threshold: number,
): SnapMatch | null {
  let bestMatch: SnapMatch | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - target.value);
      if (distance > threshold || distance >= bestDistance) {
        continue;
      }

      bestDistance = distance;
      bestMatch = {
        adjustment: candidate - target.value,
        candidate,
      };
    }
  }

  return bestMatch;
}

function createHorizontalTargets(
  rect: PageBuilderSnapRect,
  mode: PageBuilderSnapMode,
): readonly SnapTarget[] {
  if (mode === "resize") {
    return [{ value: rect.left + rect.width }];
  }

  return [
    { value: rect.left },
    { value: rect.left + rect.width / 2 },
    { value: rect.left + rect.width },
  ];
}

function createVerticalTargets(
  rect: PageBuilderSnapRect,
  mode: PageBuilderSnapMode,
): readonly SnapTarget[] {
  if (mode === "resize") {
    return [{ value: rect.top + rect.height }];
  }

  return [
    { value: rect.top },
    { value: rect.top + rect.height / 2 },
    { value: rect.top + rect.height },
  ];
}

export function snapPageBuilderRect(
  rect: PageBuilderSnapRect,
  candidates: PageBuilderSnapCandidates,
  mode: PageBuilderSnapMode,
  threshold = PAGE_BUILDER_SNAP_THRESHOLD,
): {
  rect: PageBuilderSnapRect;
  guides: readonly PageBuilderSnapGuide[];
  deltaX: number;
  deltaY: number;
} {
  const horizontalMatch = findBestSnapMatch(
    createHorizontalTargets(rect, mode),
    candidates.vertical,
    threshold,
  );
  const verticalMatch = findBestSnapMatch(
    createVerticalTargets(rect, mode),
    candidates.horizontal,
    threshold,
  );

  const deltaX = horizontalMatch?.adjustment ?? 0;
  const deltaY = verticalMatch?.adjustment ?? 0;

  const snappedRect =
    mode === "resize"
      ? {
          left: rect.left,
          top: rect.top,
          width: rect.width + deltaX,
          height: rect.height + deltaY,
        }
      : {
          left: rect.left + deltaX,
          top: rect.top + deltaY,
          width: rect.width,
          height: rect.height,
        };

  const guides: PageBuilderSnapGuide[] = [];
  if (horizontalMatch) {
    guides.push({
      orientation: "vertical",
      offset: horizontalMatch.candidate,
    });
  }
  if (verticalMatch) {
    guides.push({
      orientation: "horizontal",
      offset: verticalMatch.candidate,
    });
  }

  return {
    rect: snappedRect,
    guides,
    deltaX,
    deltaY,
  };
}
