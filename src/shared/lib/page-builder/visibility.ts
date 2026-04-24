import type {
  PageBuilderBreakpoint,
  PageBuilderNode,
  PageBuilderResponsiveVisibility,
} from "./schema";

type PageBuilderOverrideBreakpoint = Exclude<PageBuilderBreakpoint, "desktop">;

type CreatePageBuilderResponsiveVisibilityOverrides = Partial<
  Record<PageBuilderOverrideBreakpoint, boolean>
>;

function normalizePageBuilderResponsiveVisibility(
  visibility: PageBuilderResponsiveVisibility,
): void {
  const tabletHidden = visibility.overrides.tablet ?? visibility.base;
  if (tabletHidden === visibility.base) {
    delete visibility.overrides.tablet;
  } else {
    visibility.overrides.tablet = tabletHidden;
  }

  const mobileHidden = visibility.overrides.mobile ?? tabletHidden;
  if (mobileHidden === tabletHidden) {
    delete visibility.overrides.mobile;
  } else {
    visibility.overrides.mobile = mobileHidden;
  }
}

export function createPageBuilderResponsiveVisibility(
  base = false,
  overrides?: CreatePageBuilderResponsiveVisibilityOverrides,
): PageBuilderResponsiveVisibility {
  const visibility: PageBuilderResponsiveVisibility = {
    base,
    overrides: {
      ...(overrides?.tablet !== undefined ? { tablet: overrides.tablet } : {}),
      ...(overrides?.mobile !== undefined ? { mobile: overrides.mobile } : {}),
    },
  };

  normalizePageBuilderResponsiveVisibility(visibility);
  return visibility;
}

export function resolvePageBuilderNodeHidden(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
): boolean {
  if (breakpoint === "desktop") {
    return node.visibility.base;
  }

  const tabletHidden = node.visibility.overrides.tablet ?? node.visibility.base;
  if (breakpoint === "tablet") {
    return tabletHidden;
  }

  return node.visibility.overrides.mobile ?? tabletHidden;
}

export function hasPageBuilderNodeVisibilityOverride(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
): boolean {
  if (breakpoint === "desktop") {
    return false;
  }

  return breakpoint === "tablet"
    ? node.visibility.overrides.tablet !== undefined
    : node.visibility.overrides.mobile !== undefined;
}

export function clearPageBuilderNodeVisibilityOverride(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
): void {
  if (breakpoint === "desktop") {
    return;
  }

  if (breakpoint === "tablet") {
    delete node.visibility.overrides.tablet;
  } else {
    delete node.visibility.overrides.mobile;
  }

  normalizePageBuilderResponsiveVisibility(node.visibility);
}

export function setPageBuilderNodeHidden(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
  hidden: boolean,
): void {
  if (breakpoint === "desktop") {
    node.visibility.base = hidden;
    normalizePageBuilderResponsiveVisibility(node.visibility);
    return;
  }

  if (breakpoint === "tablet") {
    node.visibility.overrides.tablet = hidden;
    normalizePageBuilderResponsiveVisibility(node.visibility);
    return;
  }

  node.visibility.overrides.mobile = hidden;
  normalizePageBuilderResponsiveVisibility(node.visibility);
}

export function togglePageBuilderNodeHidden(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
): boolean {
  const nextHidden = !resolvePageBuilderNodeHidden(node, breakpoint);
  setPageBuilderNodeHidden(node, breakpoint, nextHidden);
  return nextHidden;
}
