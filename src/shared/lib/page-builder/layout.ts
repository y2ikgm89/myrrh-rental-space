import type {
  PageBuilderBreakpoint,
  PageBuilderLayoutBox,
  PageBuilderLayoutOverride,
  PageBuilderNode,
  PageBuilderResponsiveLayout,
} from "./schema";

type CreatePageBuilderLayoutBoxInput = {
  x?: number;
  y?: number;
  width: PageBuilderLayoutBox["width"];
  height: PageBuilderLayoutBox["height"];
  rotate?: number;
  zIndex?: number;
};

type PageBuilderOverrideBreakpoint = Exclude<PageBuilderBreakpoint, "desktop">;

type CreatePageBuilderResponsiveLayoutOverrides = Partial<
  Record<PageBuilderOverrideBreakpoint, PageBuilderLayoutOverride>
>;

function mergePageBuilderLayoutBox(
  base: PageBuilderLayoutBox,
  override: PageBuilderLayoutOverride | undefined,
): PageBuilderLayoutBox {
  return {
    x: override?.x ?? base.x,
    y: override?.y ?? base.y,
    width: override?.width ?? base.width,
    height: override?.height ?? base.height,
    rotate: override?.rotate ?? base.rotate,
    zIndex: override?.zIndex ?? base.zIndex,
  };
}

function sanitizePageBuilderLayoutOverride(
  override: PageBuilderLayoutOverride | undefined,
): PageBuilderLayoutOverride | undefined {
  if (!override) {
    return undefined;
  }

  const cleaned: PageBuilderLayoutOverride = {};

  if (override.x !== undefined) {
    cleaned.x = override.x;
  }
  if (override.y !== undefined) {
    cleaned.y = override.y;
  }
  if (override.width !== undefined) {
    cleaned.width = override.width;
  }
  if (override.height !== undefined) {
    cleaned.height = override.height;
  }
  if (override.rotate !== undefined) {
    cleaned.rotate = override.rotate;
  }
  if (override.zIndex !== undefined) {
    cleaned.zIndex = override.zIndex;
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function createPageBuilderLayoutOverride(
  base: PageBuilderLayoutBox,
  next: PageBuilderLayoutBox,
): PageBuilderLayoutOverride | undefined {
  const override: PageBuilderLayoutOverride = {};

  if (next.x !== base.x) {
    override.x = next.x;
  }
  if (next.y !== base.y) {
    override.y = next.y;
  }
  if (next.width !== base.width) {
    override.width = next.width;
  }
  if (next.height !== base.height) {
    override.height = next.height;
  }
  if (next.rotate !== base.rotate) {
    override.rotate = next.rotate;
  }
  if (next.zIndex !== base.zIndex) {
    override.zIndex = next.zIndex;
  }

  return Object.keys(override).length > 0 ? override : undefined;
}

function normalizePageBuilderResponsiveLayout(
  layout: PageBuilderResponsiveLayout,
): void {
  const base = layout.base;
  const tabletResolved = mergePageBuilderLayoutBox(
    base,
    sanitizePageBuilderLayoutOverride(layout.overrides.tablet),
  );
  const tabletOverride = createPageBuilderLayoutOverride(base, tabletResolved);

  if (tabletOverride) {
    layout.overrides.tablet = tabletOverride;
  } else {
    delete layout.overrides.tablet;
  }

  const mobileResolved = mergePageBuilderLayoutBox(
    tabletResolved,
    sanitizePageBuilderLayoutOverride(layout.overrides.mobile),
  );
  const mobileOverride = createPageBuilderLayoutOverride(
    tabletResolved,
    mobileResolved,
  );

  if (mobileOverride) {
    layout.overrides.mobile = mobileOverride;
  } else {
    delete layout.overrides.mobile;
  }
}

export function createPageBuilderLayoutBox({
  x = 0,
  y = 0,
  width,
  height,
  rotate = 0,
  zIndex = 0,
}: CreatePageBuilderLayoutBoxInput): PageBuilderLayoutBox {
  return {
    x,
    y,
    width,
    height,
    rotate,
    zIndex,
  };
}

export function arePageBuilderLayoutBoxesEqual(
  left: PageBuilderLayoutBox,
  right: PageBuilderLayoutBox,
): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.rotate === right.rotate &&
    left.zIndex === right.zIndex
  );
}

export function createPageBuilderResponsiveLayout(
  base: PageBuilderLayoutBox,
  overrides?: CreatePageBuilderResponsiveLayoutOverrides,
): PageBuilderResponsiveLayout {
  const layout: PageBuilderResponsiveLayout = {
    base,
    overrides: {
      ...(overrides?.tablet ? { tablet: overrides.tablet } : {}),
      ...(overrides?.mobile ? { mobile: overrides.mobile } : {}),
    },
  };

  normalizePageBuilderResponsiveLayout(layout);
  return layout;
}

export function resolvePageBuilderNodeLayoutBox(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
): PageBuilderLayoutBox {
  if (breakpoint === "desktop") {
    return node.layout.base;
  }

  const tabletResolved = mergePageBuilderLayoutBox(
    node.layout.base,
    node.layout.overrides.tablet,
  );

  if (breakpoint === "tablet") {
    return tabletResolved;
  }

  return mergePageBuilderLayoutBox(
    tabletResolved,
    node.layout.overrides.mobile,
  );
}

export function hasPageBuilderNodeLayoutOverride(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
): boolean {
  if (breakpoint === "desktop") {
    return false;
  }

  return breakpoint === "tablet"
    ? node.layout.overrides.tablet !== undefined
    : node.layout.overrides.mobile !== undefined;
}

export function clearPageBuilderNodeLayoutOverride(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
): void {
  if (breakpoint === "desktop") {
    return;
  }

  if (breakpoint === "tablet") {
    delete node.layout.overrides.tablet;
  } else {
    delete node.layout.overrides.mobile;
  }

  normalizePageBuilderResponsiveLayout(node.layout);
}

export function setPageBuilderNodeLayoutBox(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
  nextBox: PageBuilderLayoutBox,
): void {
  if (breakpoint === "desktop") {
    node.layout.base = nextBox;
    normalizePageBuilderResponsiveLayout(node.layout);
    return;
  }

  if (breakpoint === "tablet") {
    node.layout.overrides.tablet = createPageBuilderLayoutOverride(
      node.layout.base,
      nextBox,
    );
    normalizePageBuilderResponsiveLayout(node.layout);
    return;
  }

  node.layout.overrides.mobile = createPageBuilderLayoutOverride(
    resolvePageBuilderNodeLayoutBox(node, "tablet"),
    nextBox,
  );
  normalizePageBuilderResponsiveLayout(node.layout);
}

export function mutatePageBuilderNodeLayoutBox(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
  mutate: (box: PageBuilderLayoutBox) => void,
): PageBuilderLayoutBox {
  const nextBox = {
    ...resolvePageBuilderNodeLayoutBox(node, breakpoint),
  };

  mutate(nextBox);
  setPageBuilderNodeLayoutBox(node, breakpoint, nextBox);

  return nextBox;
}
