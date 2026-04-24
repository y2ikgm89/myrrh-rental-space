import type {
  PageBuilderBreakpoint,
  PageBuilderDocument,
  PageBuilderLayoutBox,
  PageBuilderNode,
} from "./schema";
import {
  createPageBuilderResponsiveLayout,
  resolvePageBuilderNodeLayoutBox,
  setPageBuilderNodeLayoutBox,
} from "./layout";
import { resolvePageBuilderNodeHidden } from "./visibility";

export type PageBuilderNodeIdFactory = (
  type: PageBuilderNode["type"],
  sourceId: string,
) => string;

export type PageBuilderCanvasAlignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

export type PageBuilderCanvasDistribution = "horizontal" | "vertical";

const PAGE_BUILDER_MIN_LAYOUT_COORDINATE = -4000;
const PAGE_BUILDER_MAX_LAYOUT_COORDINATE = 4000;
const PAGE_BUILDER_MIN_LAYOUT_DIMENSION = 1;
const PAGE_BUILDER_MAX_LAYOUT_DIMENSION = 4000;
export function clampPageBuilderLayoutCoordinate(value: number): number {
  return Math.min(
    PAGE_BUILDER_MAX_LAYOUT_COORDINATE,
    Math.max(PAGE_BUILDER_MIN_LAYOUT_COORDINATE, Math.round(value)),
  );
}

export function clampPageBuilderLayoutDimension(value: number): number {
  return Math.min(
    PAGE_BUILDER_MAX_LAYOUT_DIMENSION,
    Math.max(PAGE_BUILDER_MIN_LAYOUT_DIMENSION, Math.round(value)),
  );
}

export function isPageBuilderNodeAbsoluteChild(
  document: PageBuilderDocument,
  nodeId: string,
): boolean {
  const node = document.nodes[nodeId];
  if (!node || node.parentId === null) {
    return false;
  }

  const parent = document.nodes[node.parentId];
  return parent?.layoutMode === "absolute";
}

export function canDragPageBuilderNodeOnCanvas(
  document: PageBuilderDocument,
  nodeId: string,
  breakpoint: PageBuilderBreakpoint,
): boolean {
  const node = document.nodes[nodeId];
  if (
    !node ||
    node.parentId === null ||
    resolvePageBuilderNodeHidden(node, breakpoint) ||
    node.locked
  ) {
    return false;
  }

  return isPageBuilderNodeAbsoluteChild(document, nodeId);
}

export function canResizePageBuilderNodeOnCanvas(
  document: PageBuilderDocument,
  nodeId: string,
  breakpoint: keyof PageBuilderDocument["breakpoints"],
): boolean {
  if (!canDragPageBuilderNodeOnCanvas(document, nodeId, breakpoint)) {
    return false;
  }

  const node = document.nodes[nodeId];
  if (!node) {
    return false;
  }

  const box = resolvePageBuilderNodeLayoutBox(node, breakpoint);
  return typeof box.width === "number" && typeof box.height === "number";
}

export function canDragPageBuilderNodesOnCanvas(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
  breakpoint: PageBuilderBreakpoint,
): boolean {
  const parentId = getCommonEditableAbsoluteParentId(document, nodeIds, 1);
  if (parentId === null) {
    return false;
  }

  const orderedNodeIds = getPageBuilderNodesInParentOrder(
    document,
    parentId,
    nodeIds,
  );
  if (orderedNodeIds.length === 0) {
    return false;
  }

  return orderedNodeIds.every((nodeId) =>
    canDragPageBuilderNodeOnCanvas(document, nodeId, breakpoint),
  );
}

export function nudgePageBuilderNodeOnCanvas(
  document: PageBuilderDocument,
  nodeId: string,
  breakpoint: PageBuilderBreakpoint,
  deltaX: number,
  deltaY: number,
): PageBuilderLayoutBox | null {
  if (!canDragPageBuilderNodeOnCanvas(document, nodeId, breakpoint)) {
    return null;
  }

  const node = document.nodes[nodeId];
  if (!node) {
    return null;
  }

  const box = resolvePageBuilderNodeLayoutBox(node, breakpoint);
  return {
    ...box,
    x: clampPageBuilderLayoutCoordinate(box.x + deltaX),
    y: clampPageBuilderLayoutCoordinate(box.y + deltaY),
  };
}

export function movePageBuilderNodesOnCanvas(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
  breakpoint: PageBuilderBreakpoint,
  deltaX: number,
  deltaY: number,
): readonly string[] {
  if (!canDragPageBuilderNodesOnCanvas(document, nodeIds, breakpoint)) {
    return [];
  }

  const parentId = getCommonEditableAbsoluteParentId(document, nodeIds, 1);
  if (parentId === null) {
    return [];
  }

  const orderedNodeIds = getPageBuilderNodesInParentOrder(
    document,
    parentId,
    nodeIds,
  );

  for (const nodeId of orderedNodeIds) {
    const node = document.nodes[nodeId];
    if (!node) {
      return [];
    }

    const box = resolvePageBuilderNodeLayoutBox(node, breakpoint);
    setPageBuilderNodeLayoutBox(node, breakpoint, {
      ...box,
      x: clampPageBuilderLayoutCoordinate(box.x + deltaX),
      y: clampPageBuilderLayoutCoordinate(box.y + deltaY),
    });
  }

  return orderedNodeIds;
}

function clampAlignedPageBuilderCoordinate(
  value: number,
  parentSize: number,
  nodeSize: number,
): number {
  const maxCoordinate = Math.max(0, parentSize - nodeSize);
  const boundedValue = Math.min(maxCoordinate, Math.max(0, value));
  return clampPageBuilderLayoutCoordinate(boundedValue);
}

export function alignPageBuilderNodeOnCanvas(
  document: PageBuilderDocument,
  nodeId: string,
  breakpoint: PageBuilderBreakpoint,
  alignment: PageBuilderCanvasAlignment,
): PageBuilderLayoutBox | null {
  if (!canDragPageBuilderNodeOnCanvas(document, nodeId, breakpoint)) {
    return null;
  }

  const node = document.nodes[nodeId];
  if (!node || node.parentId === null) {
    return null;
  }

  const parent = document.nodes[node.parentId];
  if (!parent) {
    return null;
  }

  const nodeBox = resolvePageBuilderNodeLayoutBox(node, breakpoint);
  const parentBox = resolvePageBuilderNodeLayoutBox(parent, breakpoint);

  if (alignment === "left" || alignment === "center" || alignment === "right") {
    if (alignment === "left") {
      return {
        ...nodeBox,
        x: clampPageBuilderLayoutCoordinate(0),
      };
    }

    if (
      typeof nodeBox.width !== "number" ||
      typeof parentBox.width !== "number"
    ) {
      return null;
    }

    const x =
      alignment === "center"
        ? (parentBox.width - nodeBox.width) / 2
        : parentBox.width - nodeBox.width;

    return {
      ...nodeBox,
      x: clampAlignedPageBuilderCoordinate(x, parentBox.width, nodeBox.width),
    };
  }

  if (alignment === "top") {
    return {
      ...nodeBox,
      y: clampPageBuilderLayoutCoordinate(0),
    };
  }

  if (
    typeof nodeBox.height !== "number" ||
    typeof parentBox.height !== "number"
  ) {
    return null;
  }

  const y =
    alignment === "middle"
      ? (parentBox.height - nodeBox.height) / 2
      : parentBox.height - nodeBox.height;

  return {
    ...nodeBox,
    y: clampAlignedPageBuilderCoordinate(y, parentBox.height, nodeBox.height),
  };
}

function getUniquePageBuilderNodeIds(
  nodeIds: readonly string[],
): readonly string[] {
  return [...new Set(nodeIds)];
}

function getCommonEditableAbsoluteParentId(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
  minimumCount: number,
): string | null {
  const uniqueNodeIds = getUniquePageBuilderNodeIds(nodeIds);
  if (uniqueNodeIds.length < minimumCount) {
    return null;
  }

  let parentId: string | null = null;

  for (const nodeId of uniqueNodeIds) {
    const node = document.nodes[nodeId];
    if (!node || node.parentId === null || node.locked) {
      return null;
    }

    if (parentId === null) {
      parentId = node.parentId;
    } else if (node.parentId !== parentId) {
      return null;
    }
  }

  if (parentId === null) {
    return null;
  }

  const parent = document.nodes[parentId];
  if (!parent || parent.locked || parent.layoutMode !== "absolute") {
    return null;
  }

  return parentId;
}

function getPageBuilderNodesInParentOrder(
  document: PageBuilderDocument,
  parentId: string,
  nodeIds: readonly string[],
): readonly string[] {
  const uniqueNodeIds = new Set(getUniquePageBuilderNodeIds(nodeIds));
  return (
    document.nodes[parentId]?.children.filter((childId) =>
      uniqueNodeIds.has(childId),
    ) ?? []
  );
}

function createUniquePageBuilderNodeId(
  document: PageBuilderDocument,
  type: PageBuilderNode["type"],
  sourceId: string,
  createId: PageBuilderNodeIdFactory,
): string {
  let nextId = createId(type, sourceId);
  while (document.nodes[nextId]) {
    nextId = createId(type, sourceId);
  }
  return nextId;
}

function getNumericPageBuilderLayoutBox(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
): PageBuilderLayoutBox | null {
  const box = resolvePageBuilderNodeLayoutBox(node, breakpoint);
  if (typeof box.width !== "number" || typeof box.height !== "number") {
    return null;
  }

  return box;
}

function getPageBuilderSelectionBounds(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
  breakpoint: PageBuilderBreakpoint,
): PageBuilderLayoutBox | null {
  let left: number | null = null;
  let top: number | null = null;
  let right: number | null = null;
  let bottom: number | null = null;
  let zIndex: number | null = null;

  for (const nodeId of nodeIds) {
    const node = document.nodes[nodeId];
    if (!node) {
      return null;
    }

    const box = getNumericPageBuilderLayoutBox(node, breakpoint);
    if (
      !box ||
      typeof box.width !== "number" ||
      typeof box.height !== "number"
    ) {
      return null;
    }

    left = left === null ? box.x : Math.min(left, box.x);
    top = top === null ? box.y : Math.min(top, box.y);
    right =
      right === null ? box.x + box.width : Math.max(right, box.x + box.width);
    bottom =
      bottom === null
        ? box.y + box.height
        : Math.max(bottom, box.y + box.height);
    zIndex = zIndex === null ? box.zIndex : Math.min(zIndex, box.zIndex);
  }

  if (left === null || top === null || right === null || bottom === null) {
    return null;
  }

  return {
    x: clampPageBuilderLayoutCoordinate(left),
    y: clampPageBuilderLayoutCoordinate(top),
    width: clampPageBuilderLayoutDimension(right - left),
    height: clampPageBuilderLayoutDimension(bottom - top),
    rotate: 0,
    zIndex: zIndex ?? 0,
  };
}

function applyRelativeChildLayout(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
  groupBox: PageBuilderLayoutBox,
): void {
  const box = resolvePageBuilderNodeLayoutBox(node, breakpoint);
  setPageBuilderNodeLayoutBox(node, breakpoint, {
    ...box,
    x: clampPageBuilderLayoutCoordinate(box.x - groupBox.x),
    y: clampPageBuilderLayoutCoordinate(box.y - groupBox.y),
  });
}

function applyAbsoluteChildLayout(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
  groupBox: PageBuilderLayoutBox,
): void {
  const box = resolvePageBuilderNodeLayoutBox(node, breakpoint);
  setPageBuilderNodeLayoutBox(node, breakpoint, {
    ...box,
    x: clampPageBuilderLayoutCoordinate(groupBox.x + box.x),
    y: clampPageBuilderLayoutCoordinate(groupBox.y + box.y),
  });
}

function setResponsiveGroupLayout(
  node: PageBuilderNode,
  desktopBox: PageBuilderLayoutBox,
  tabletBox: PageBuilderLayoutBox,
  mobileBox: PageBuilderLayoutBox,
): void {
  node.layout = createPageBuilderResponsiveLayout(desktopBox);
  setPageBuilderNodeLayoutBox(node, "tablet", tabletBox);
  setPageBuilderNodeLayoutBox(node, "mobile", mobileBox);
}

export function groupPageBuilderNodesOnCanvas(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
  breakpoint: PageBuilderBreakpoint,
  createId: PageBuilderNodeIdFactory = defaultCreatePageBuilderNodeId,
): string | null {
  const parentId = getCommonEditableAbsoluteParentId(document, nodeIds, 2);
  if (parentId === null) {
    return null;
  }

  const orderedNodeIds = getPageBuilderNodesInParentOrder(
    document,
    parentId,
    nodeIds,
  );
  if (orderedNodeIds.length < 2) {
    return null;
  }

  const desktopBox = getPageBuilderSelectionBounds(
    document,
    orderedNodeIds,
    "desktop",
  );
  const tabletBox = getPageBuilderSelectionBounds(
    document,
    orderedNodeIds,
    "tablet",
  );
  const mobileBox = getPageBuilderSelectionBounds(
    document,
    orderedNodeIds,
    "mobile",
  );
  if (!desktopBox || !tabletBox || !mobileBox) {
    return null;
  }

  const parent = document.nodes[parentId];
  if (!parent) {
    return null;
  }

  const groupId = createUniquePageBuilderNodeId(
    document,
    "frame",
    `group-${breakpoint}`,
    createId,
  );
  const groupNode: PageBuilderNode = {
    id: groupId,
    type: "frame",
    parentId,
    children: [...orderedNodeIds],
    locked: false,
    visibility: {
      base: false,
      overrides: {},
    },
    name: "Group",
    layoutMode: "absolute",
    style: {},
    layout: createPageBuilderResponsiveLayout(desktopBox),
    content: {},
  };
  setResponsiveGroupLayout(groupNode, desktopBox, tabletBox, mobileBox);

  const selectedNodeIds = new Set(orderedNodeIds);
  const nextParentChildren: string[] = [];
  let insertedGroup = false;

  for (const childId of parent.children) {
    if (!selectedNodeIds.has(childId)) {
      nextParentChildren.push(childId);
      continue;
    }

    if (!insertedGroup) {
      nextParentChildren.push(groupId);
      insertedGroup = true;
    }
  }

  if (!insertedGroup) {
    return null;
  }

  document.nodes[groupId] = groupNode;
  parent.children = nextParentChildren;

  for (const childId of orderedNodeIds) {
    const child = document.nodes[childId];
    if (!child) {
      return null;
    }

    child.parentId = groupId;
    applyRelativeChildLayout(child, "desktop", desktopBox);
    applyRelativeChildLayout(child, "tablet", tabletBox);
    applyRelativeChildLayout(child, "mobile", mobileBox);
  }

  return groupId;
}

export function ungroupPageBuilderNodeOnCanvas(
  document: PageBuilderDocument,
  groupNodeId: string,
): readonly string[] {
  const groupNode = document.nodes[groupNodeId];
  if (
    !groupNode ||
    groupNode.parentId === null ||
    groupNode.locked ||
    groupNode.children.length === 0 ||
    groupNode.layoutMode !== "absolute"
  ) {
    return [];
  }

  const parent = document.nodes[groupNode.parentId];
  if (!parent || parent.locked || parent.layoutMode !== "absolute") {
    return [];
  }

  const desktopBox = resolvePageBuilderNodeLayoutBox(groupNode, "desktop");
  const tabletBox = resolvePageBuilderNodeLayoutBox(groupNode, "tablet");
  const mobileBox = resolvePageBuilderNodeLayoutBox(groupNode, "mobile");
  const childIds = [...groupNode.children];

  for (const childId of childIds) {
    const child = document.nodes[childId];
    if (!child || child.locked) {
      return [];
    }
  }

  const groupIndex = parent.children.indexOf(groupNodeId);
  if (groupIndex < 0) {
    return [];
  }

  parent.children.splice(groupIndex, 1, ...childIds);

  for (const childId of childIds) {
    const child = document.nodes[childId];
    if (!child) {
      return [];
    }

    child.parentId = parent.id;
    applyAbsoluteChildLayout(child, "desktop", desktopBox);
    applyAbsoluteChildLayout(child, "tablet", tabletBox);
    applyAbsoluteChildLayout(child, "mobile", mobileBox);
  }

  delete document.nodes[groupNodeId];
  return childIds;
}

export function distributePageBuilderNodesOnCanvas(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
  breakpoint: PageBuilderBreakpoint,
  distribution: PageBuilderCanvasDistribution,
): boolean {
  const parentId = getCommonEditableAbsoluteParentId(document, nodeIds, 3);
  if (parentId === null) {
    return false;
  }

  const orderedNodeIds = getPageBuilderNodesInParentOrder(
    document,
    parentId,
    nodeIds,
  );
  if (orderedNodeIds.length < 3) {
    return false;
  }

  const nodeBoxes = orderedNodeIds
    .map((nodeId) => {
      const node = document.nodes[nodeId];
      const box = node
        ? getNumericPageBuilderLayoutBox(node, breakpoint)
        : null;
      return node && box ? { node, box } : null;
    })
    .filter((entry) => entry !== null);

  if (nodeBoxes.length !== orderedNodeIds.length) {
    return false;
  }

  const sortedNodeBoxes = nodeBoxes.toSorted((left, right) =>
    distribution === "horizontal"
      ? left.box.x - right.box.x
      : left.box.y - right.box.y,
  );
  const firstEntry = sortedNodeBoxes[0];
  const lastEntry = sortedNodeBoxes[sortedNodeBoxes.length - 1];
  if (!firstEntry || !lastEntry) {
    return false;
  }

  const totalSize = sortedNodeBoxes.reduce((sum, entry) => {
    if (
      typeof entry.box.width !== "number" ||
      typeof entry.box.height !== "number"
    ) {
      return sum;
    }

    return (
      sum + (distribution === "horizontal" ? entry.box.width : entry.box.height)
    );
  }, 0);
  const firstStart =
    distribution === "horizontal" ? firstEntry.box.x : firstEntry.box.y;
  const lastSize =
    distribution === "horizontal" ? lastEntry.box.width : lastEntry.box.height;
  if (typeof lastSize !== "number") {
    return false;
  }

  const lastEnd =
    (distribution === "horizontal" ? lastEntry.box.x : lastEntry.box.y) +
    lastSize;
  const gap = (lastEnd - firstStart - totalSize) / (sortedNodeBoxes.length - 1);
  let cursor = firstStart;

  for (const entry of sortedNodeBoxes) {
    const size =
      distribution === "horizontal" ? entry.box.width : entry.box.height;
    if (typeof size !== "number") {
      return false;
    }

    setPageBuilderNodeLayoutBox(entry.node, breakpoint, {
      ...entry.box,
      x:
        distribution === "horizontal"
          ? clampPageBuilderLayoutCoordinate(cursor)
          : entry.box.x,
      y:
        distribution === "vertical"
          ? clampPageBuilderLayoutCoordinate(cursor)
          : entry.box.y,
    });
    cursor += size + gap;
  }

  return true;
}

export function clonePageBuilderDocument(
  document: PageBuilderDocument,
): PageBuilderDocument {
  return structuredClone(document);
}

export function collectPageBuilderNodeIds(
  document: PageBuilderDocument,
  nodeId: string,
): string[] {
  const node = document.nodes[nodeId];
  if (!node) {
    return [];
  }

  const childIds = node.children.flatMap((childId) =>
    collectPageBuilderNodeIds(document, childId),
  );

  return [nodeId, ...childIds];
}

export function removePageBuilderNode(
  document: PageBuilderDocument,
  nodeId: string,
): string | null {
  const node = document.nodes[nodeId];
  if (!node || node.parentId === null || node.locked) {
    return null;
  }

  const parent = document.nodes[node.parentId];
  if (!parent) {
    return null;
  }

  parent.children = parent.children.filter((childId) => childId !== nodeId);

  for (const id of collectPageBuilderNodeIds(document, nodeId)) {
    delete document.nodes[id];
  }

  return parent.id;
}

export function movePageBuilderNodeWithinParent(
  document: PageBuilderDocument,
  nodeId: string,
  offset: -1 | 1,
): boolean {
  const node = document.nodes[nodeId];
  if (!node || node.parentId === null || node.locked) {
    return false;
  }

  const parent = document.nodes[node.parentId];
  if (!parent) {
    return false;
  }

  const currentIndex = parent.children.indexOf(nodeId);
  const nextIndex = currentIndex + offset;

  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    nextIndex >= parent.children.length
  ) {
    return false;
  }

  const reordered = [...parent.children];
  reordered.splice(currentIndex, 1);
  reordered.splice(nextIndex, 0, nodeId);
  parent.children = reordered;

  return true;
}

export function reorderPageBuilderNodeWithinParent(
  document: PageBuilderDocument,
  nodeId: string,
  overNodeId: string,
): boolean {
  const node = document.nodes[nodeId];
  const overNode = document.nodes[overNodeId];

  if (
    !node ||
    !overNode ||
    node.parentId === null ||
    node.locked ||
    node.parentId !== overNode.parentId
  ) {
    return false;
  }

  const parent = document.nodes[node.parentId];
  if (!parent) {
    return false;
  }

  const currentIndex = parent.children.indexOf(nodeId);
  const nextIndex = parent.children.indexOf(overNodeId);

  if (currentIndex < 0 || nextIndex < 0 || currentIndex === nextIndex) {
    return false;
  }

  const reordered = [...parent.children];
  reordered.splice(currentIndex, 1);
  reordered.splice(nextIndex, 0, nodeId);
  parent.children = reordered;

  return true;
}

function defaultCreatePageBuilderNodeId(type: PageBuilderNode["type"]): string {
  return `${type}-${crypto.randomUUID()}`;
}

function duplicateNodeSubtree(
  document: PageBuilderDocument,
  sourceNodeId: string,
  parentId: string | null,
  createId: PageBuilderNodeIdFactory,
): string | null {
  const source = document.nodes[sourceNodeId];
  if (!source) {
    return null;
  }

  let duplicatedId = createId(source.type, sourceNodeId);
  while (document.nodes[duplicatedId]) {
    duplicatedId = createId(source.type, sourceNodeId);
  }

  const duplicatedNode = structuredClone(source);
  duplicatedNode.id = duplicatedId;
  duplicatedNode.parentId = parentId;
  duplicatedNode.children = [];

  document.nodes[duplicatedId] = duplicatedNode;

  for (const childId of source.children) {
    const duplicatedChildId = duplicateNodeSubtree(
      document,
      childId,
      duplicatedId,
      createId,
    );
    if (duplicatedChildId) {
      duplicatedNode.children.push(duplicatedChildId);
    }
  }

  return duplicatedId;
}

export function duplicatePageBuilderNode(
  document: PageBuilderDocument,
  nodeId: string,
  createId: PageBuilderNodeIdFactory = defaultCreatePageBuilderNodeId,
): string | null {
  const source = document.nodes[nodeId];
  if (!source || source.parentId === null || source.locked) {
    return null;
  }

  const parent = document.nodes[source.parentId];
  if (!parent) {
    return null;
  }

  const duplicatedId = duplicateNodeSubtree(
    document,
    nodeId,
    source.parentId,
    createId,
  );

  if (!duplicatedId) {
    return null;
  }

  const sourceIndex = parent.children.indexOf(nodeId);
  if (sourceIndex < 0) {
    parent.children.push(duplicatedId);
  } else {
    parent.children.splice(sourceIndex + 1, 0, duplicatedId);
  }

  return duplicatedId;
}

export function duplicatePageBuilderNodeWithLayout(
  document: PageBuilderDocument,
  nodeId: string,
  breakpoint: PageBuilderBreakpoint,
  nextBox: PageBuilderLayoutBox,
  createId: PageBuilderNodeIdFactory = defaultCreatePageBuilderNodeId,
): string | null {
  const duplicatedId = duplicatePageBuilderNode(document, nodeId, createId);
  if (!duplicatedId) {
    return null;
  }

  const duplicatedNode = document.nodes[duplicatedId];
  if (!duplicatedNode) {
    return null;
  }

  setPageBuilderNodeLayoutBox(duplicatedNode, breakpoint, nextBox);
  return duplicatedId;
}

export function duplicatePageBuilderNodesWithOffset(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
  breakpoint: PageBuilderBreakpoint,
  deltaX: number,
  deltaY: number,
  createId: PageBuilderNodeIdFactory = defaultCreatePageBuilderNodeId,
): readonly string[] {
  const parentId = getCommonEditableAbsoluteParentId(document, nodeIds, 1);
  if (parentId === null) {
    return [];
  }

  const parent = document.nodes[parentId];
  if (!parent) {
    return [];
  }

  const orderedNodeIds = getPageBuilderNodesInParentOrder(
    document,
    parentId,
    nodeIds,
  );
  if (orderedNodeIds.length === 0) {
    return [];
  }

  const selectedNodeIds = new Set(orderedNodeIds);
  const duplicatedNodeIds: string[] = [];
  const nextParentChildren: string[] = [];

  for (const childId of parent.children) {
    nextParentChildren.push(childId);

    if (!selectedNodeIds.has(childId)) {
      continue;
    }

    const duplicatedId = duplicateNodeSubtree(
      document,
      childId,
      parentId,
      createId,
    );
    if (!duplicatedId) {
      return [];
    }

    const duplicatedNode = document.nodes[duplicatedId];
    if (!duplicatedNode) {
      return [];
    }

    const box = resolvePageBuilderNodeLayoutBox(duplicatedNode, breakpoint);
    setPageBuilderNodeLayoutBox(duplicatedNode, breakpoint, {
      ...box,
      x: clampPageBuilderLayoutCoordinate(box.x + deltaX),
      y: clampPageBuilderLayoutCoordinate(box.y + deltaY),
    });

    duplicatedNodeIds.push(duplicatedId);
    nextParentChildren.push(duplicatedId);
  }

  parent.children = nextParentChildren;
  return duplicatedNodeIds;
}
