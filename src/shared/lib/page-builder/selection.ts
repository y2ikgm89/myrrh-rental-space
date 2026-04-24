import type { PageBuilderDocument } from "./schema";

export type PageBuilderSelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PageBuilderSelectionCandidate = {
  nodeId: string;
  rect: PageBuilderSelectionRect;
};

export function createPageBuilderSelectionRectFromPoints(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): PageBuilderSelectionRect {
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const right = Math.max(startX, currentX);
  const bottom = Math.max(startY, currentY);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export function doPageBuilderSelectionRectsIntersect(
  a: PageBuilderSelectionRect,
  b: PageBuilderSelectionRect,
): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

function hasSelectedDescendant(
  document: PageBuilderDocument,
  nodeId: string,
  selectedNodeIdSet: ReadonlySet<string>,
): boolean {
  const node = document.nodes[nodeId];
  if (!node) {
    return false;
  }

  for (const childId of node.children) {
    if (
      selectedNodeIdSet.has(childId) ||
      hasSelectedDescendant(document, childId, selectedNodeIdSet)
    ) {
      return true;
    }
  }

  return false;
}

function uniqueValidNodeIds(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
): string[] {
  const seenNodeIds = new Set<string>();
  const validNodeIds: string[] = [];

  for (const nodeId of nodeIds) {
    if (!document.nodes[nodeId] || seenNodeIds.has(nodeId)) {
      continue;
    }

    seenNodeIds.add(nodeId);
    validNodeIds.push(nodeId);
  }

  return validNodeIds;
}

export function resolvePageBuilderMarqueeSelection({
  document,
  rect,
  candidates,
  additive,
  startSelectedNodeIds,
  minimumSelectionSize = 4,
}: {
  document: PageBuilderDocument;
  rect: PageBuilderSelectionRect;
  candidates: readonly PageBuilderSelectionCandidate[];
  additive: boolean;
  startSelectedNodeIds: readonly string[];
  minimumSelectionSize?: number;
}): readonly string[] {
  if (rect.width < minimumSelectionSize && rect.height < minimumSelectionSize) {
    return additive
      ? uniqueValidNodeIds(document, startSelectedNodeIds)
      : [document.rootId];
  }

  const hitNodeIds: string[] = [];
  const seenHitNodeIds = new Set<string>();

  for (const candidate of candidates) {
    if (
      candidate.nodeId === document.rootId ||
      !document.nodes[candidate.nodeId] ||
      seenHitNodeIds.has(candidate.nodeId)
    ) {
      continue;
    }

    if (doPageBuilderSelectionRectsIntersect(rect, candidate.rect)) {
      seenHitNodeIds.add(candidate.nodeId);
      hitNodeIds.push(candidate.nodeId);
    }
  }

  const hitNodeIdSet = new Set(hitNodeIds);
  const leafHitNodeIds = hitNodeIds.filter(
    (nodeId) => !hasSelectedDescendant(document, nodeId, hitNodeIdSet),
  );

  if (leafHitNodeIds.length === 0) {
    return additive
      ? uniqueValidNodeIds(document, startSelectedNodeIds)
      : [document.rootId];
  }

  if (!additive) {
    return leafHitNodeIds;
  }

  const mergedNodeIds = uniqueValidNodeIds(
    document,
    startSelectedNodeIds,
  ).filter((nodeId) => nodeId !== document.rootId);
  for (const nodeId of leafHitNodeIds) {
    if (!mergedNodeIds.includes(nodeId)) {
      mergedNodeIds.push(nodeId);
    }
  }

  return mergedNodeIds.length > 0 ? mergedNodeIds : [document.rootId];
}
