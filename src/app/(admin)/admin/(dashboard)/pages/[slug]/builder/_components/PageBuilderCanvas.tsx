"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { Badge } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import {
  formatPageBuilderCanvasCoordinateLabel,
  formatPageBuilderCanvasMeasurementLabel,
  getPageBuilderCanvasScale,
  scalePageBuilderCanvasMeasurement,
  unscalePageBuilderCanvasMeasurement,
} from "@/shared/lib/page-builder/canvas-view";
import {
  arePageBuilderLayoutBoxesEqual,
  resolvePageBuilderNodeLayoutBox,
} from "@/shared/lib/page-builder/layout";
import type { PageBuilderResolvedMediaMap } from "@/shared/lib/page-builder/media";
import {
  canDragPageBuilderNodesOnCanvas,
  canDragPageBuilderNodeOnCanvas,
  canResizePageBuilderNodeOnCanvas,
  clampPageBuilderLayoutCoordinate,
  clampPageBuilderLayoutDimension,
} from "@/shared/lib/page-builder/document-operations";
import {
  createPageBuilderSnapGridOffsets,
  isPageBuilderSnappingEnabled,
  PAGE_BUILDER_SNAP_GRID_SIZE,
  snapPageBuilderRect,
  type PageBuilderSnapCandidates,
  type PageBuilderSnapGuide,
} from "@/shared/lib/page-builder/snapping";
import type {
  PageBuilderBreakpoint,
  PageBuilderDocument,
  PageBuilderLayoutBox,
} from "@/shared/lib/page-builder/schema";
import {
  createPageBuilderSelectionRectFromPoints,
  resolvePageBuilderMarqueeSelection,
  type PageBuilderSelectionCandidate,
  type PageBuilderSelectionRect,
} from "@/shared/lib/page-builder/selection";
import {
  FreeformPageRenderer,
  type FreeformPageBuilderLayoutPreview,
  type FreeformPageBuilderNodeSelectOptions,
} from "@/shared/page-builder/renderer/FreeformPageRenderer";

type PageBuilderCanvasProps = {
  document: PageBuilderDocument;
  media?: PageBuilderResolvedMediaMap;
  breakpoint: PageBuilderBreakpoint;
  breakpointWidth: number;
  selectedNodeId: string;
  selectedNodeIds: readonly string[];
  interactionDisabled: boolean;
  layoutPreviews: readonly FreeformPageBuilderLayoutPreview[];
  zoom: number;
  showGrid: boolean;
  onNodeSelect: (
    nodeId: string,
    options?: FreeformPageBuilderNodeSelectOptions,
  ) => void;
  onNodesSelect: (nodeIds: readonly string[]) => void;
  onLayoutPreviewChange: (
    previews: readonly FreeformPageBuilderLayoutPreview[],
  ) => void;
  onCommitLayout: (commit: PageBuilderCanvasLayoutCommit) => void;
};

export type PageBuilderCanvasLayoutCommit = {
  box: PageBuilderLayoutBox;
  deltaX?: number;
  deltaY?: number;
  mode: "move" | "duplicate" | "resize" | "multi-move" | "multi-duplicate";
};

type CanvasInteractionState = {
  kind: "move" | "resize";
  duplicateOnCommit: boolean;
  isMultiSelection: boolean;
  startClientX: number;
  startClientY: number;
  startBox: PageBuilderLayoutBox;
  startNodeBoxes: readonly FreeformPageBuilderLayoutPreview[];
  startRect: PageBuilderSelectionRect | null;
  snapCandidates: PageBuilderSnapCandidates;
  snappingEnabled: boolean;
  latestBox: PageBuilderLayoutBox;
  latestPreviews: readonly FreeformPageBuilderLayoutPreview[];
  latestDeltaX: number;
  latestDeltaY: number;
  latestGuides: readonly PageBuilderSnapGuide[];
};

type MarqueeSelectionState = {
  additive: boolean;
  startSelectedNodeIds: readonly string[];
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

function createEmptySnapCandidates(): PageBuilderSnapCandidates {
  return {
    vertical: [],
    horizontal: [],
  };
}

function dedupeSnapOffsets(values: readonly number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value)))];
}

function isElementTarget(target: EventTarget | null): target is Element {
  return target instanceof Element;
}

function clampCanvasPoint(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

function getCanvasPointFromClient(
  surface: HTMLElement,
  clientX: number,
  clientY: number,
  zoom: number,
): { x: number; y: number } {
  const surfaceRect = surface.getBoundingClientRect();
  return {
    x: clampCanvasPoint(
      unscalePageBuilderCanvasMeasurement(clientX - surfaceRect.left, zoom),
      surface.offsetWidth,
    ),
    y: clampCanvasPoint(
      unscalePageBuilderCanvasMeasurement(clientY - surfaceRect.top, zoom),
      surface.offsetHeight,
    ),
  };
}

function measureSnapCandidates(
  surface: HTMLElement,
  selectedNodeIds: readonly string[],
  zoom: number,
): PageBuilderSnapCandidates {
  const canvasScale = getPageBuilderCanvasScale(zoom);
  const surfaceRect = surface.getBoundingClientRect();
  const selectedNodeIdSet = new Set(selectedNodeIds);

  const surfaceWidth = surfaceRect.width / canvasScale;
  const surfaceHeight = surfaceRect.height / canvasScale;
  const vertical = [
    ...createPageBuilderSnapGridOffsets(surfaceWidth),
    surfaceWidth / 2,
  ];
  const horizontal = [
    ...createPageBuilderSnapGridOffsets(surfaceHeight),
    surfaceHeight / 2,
  ];

  const elements = surface.querySelectorAll<HTMLElement>(
    "[data-page-builder-node-id]",
  );
  for (const element of elements) {
    const elementNodeId = element.dataset["pageBuilderNodeId"];
    if (
      (elementNodeId && selectedNodeIdSet.has(elementNodeId)) ||
      element.offsetWidth === 0 ||
      element.offsetHeight === 0
    ) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    const left = unscalePageBuilderCanvasMeasurement(
      rect.left - surfaceRect.left,
      zoom,
    );
    const top = unscalePageBuilderCanvasMeasurement(
      rect.top - surfaceRect.top,
      zoom,
    );
    const right = unscalePageBuilderCanvasMeasurement(
      rect.right - surfaceRect.left,
      zoom,
    );
    const bottom = unscalePageBuilderCanvasMeasurement(
      rect.bottom - surfaceRect.top,
      zoom,
    );
    const width = unscalePageBuilderCanvasMeasurement(rect.width, zoom);
    const height = unscalePageBuilderCanvasMeasurement(rect.height, zoom);

    vertical.push(left, left + width / 2, right);
    horizontal.push(top, top + height / 2, bottom);
  }

  return {
    vertical: dedupeSnapOffsets(vertical),
    horizontal: dedupeSnapOffsets(horizontal),
  };
}

export function PageBuilderCanvas({
  document,
  media,
  breakpoint,
  breakpointWidth,
  selectedNodeId,
  selectedNodeIds,
  interactionDisabled,
  layoutPreviews,
  zoom,
  showGrid,
  onNodeSelect,
  onNodesSelect,
  onLayoutPreviewChange,
  onCommitLayout,
}: PageBuilderCanvasProps): ReactElement {
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const measurementRafRef = useRef<number | null>(null);
  const interactionStateRef = useRef<CanvasInteractionState | null>(null);
  const marqueeSelectionRef = useRef<MarqueeSelectionState | null>(null);
  const latestPointerRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  );
  const [selectionRect, setSelectionRect] =
    useState<PageBuilderSelectionRect | null>(null);
  const [surfaceHeight, setSurfaceHeight] = useState<number | null>(null);
  const [snapGuides, setSnapGuides] = useState<readonly PageBuilderSnapGuide[]>(
    [],
  );
  const [interactionState, setInteractionState] =
    useState<CanvasInteractionState | null>(null);
  const [marqueeSelection, setMarqueeSelection] =
    useState<MarqueeSelectionState | null>(null);

  const rootNode = document.nodes[document.rootId];
  if (!rootNode) {
    throw new Error("page builder root node is missing");
  }

  const selectedNode = document.nodes[selectedNodeId] ?? rootNode;
  const selectedLayoutPreview =
    layoutPreviews.find((preview) => preview.nodeId === selectedNode.id) ??
    null;
  const selectedBox =
    selectedLayoutPreview?.box ??
    resolvePageBuilderNodeLayoutBox(selectedNode, breakpoint);
  const activeSelectionBox = interactionState?.latestBox ?? selectedBox;
  const isMultiSelection = selectedNodeIds.length > 1;
  const canDragSelectedNode =
    !interactionDisabled &&
    (isMultiSelection
      ? canDragPageBuilderNodesOnCanvas(document, selectedNodeIds, breakpoint)
      : canDragPageBuilderNodeOnCanvas(document, selectedNode.id, breakpoint));
  const canResizeSelectedNode =
    !interactionDisabled &&
    !isMultiSelection &&
    canResizePageBuilderNodeOnCanvas(document, selectedNode.id, breakpoint);
  const canvasScale = getPageBuilderCanvasScale(zoom);
  const scaledCanvasWidth = scalePageBuilderCanvasMeasurement(
    breakpointWidth,
    zoom,
  );
  const scaledSurfaceHeight =
    surfaceHeight === null
      ? undefined
      : `${scalePageBuilderCanvasMeasurement(surfaceHeight, zoom)}px`;
  const majorGridSize = PAGE_BUILDER_SNAP_GRID_SIZE * 5;
  const marqueeRect = marqueeSelection
    ? createPageBuilderSelectionRectFromPoints(
        marqueeSelection.startX,
        marqueeSelection.startY,
        marqueeSelection.currentX,
        marqueeSelection.currentY,
      )
    : null;

  function computeInteractionResult(
    state: CanvasInteractionState,
    clientX: number,
    clientY: number,
  ): {
    box: PageBuilderLayoutBox;
    previews: readonly FreeformPageBuilderLayoutPreview[];
    deltaX: number;
    deltaY: number;
    guides: readonly PageBuilderSnapGuide[];
  } {
    const deltaX = unscalePageBuilderCanvasMeasurement(
      clientX - state.startClientX,
      zoom,
    );
    const deltaY = unscalePageBuilderCanvasMeasurement(
      clientY - state.startClientY,
      zoom,
    );

    if (state.kind === "resize") {
      const tentativeWidth =
        typeof state.startBox.width === "number"
          ? clampPageBuilderLayoutDimension(state.startBox.width + deltaX)
          : state.startBox.width;
      const tentativeHeight =
        typeof state.startBox.height === "number"
          ? clampPageBuilderLayoutDimension(state.startBox.height + deltaY)
          : state.startBox.height;

      if (
        state.startRect === null ||
        typeof tentativeWidth !== "number" ||
        typeof tentativeHeight !== "number" ||
        !state.snappingEnabled
      ) {
        return {
          box: {
            ...state.startBox,
            width: tentativeWidth,
            height: tentativeHeight,
          },
          previews: [
            {
              nodeId: selectedNode.id,
              box: {
                ...state.startBox,
                width: tentativeWidth,
                height: tentativeHeight,
              },
            },
          ],
          deltaX: 0,
          deltaY: 0,
          guides: [],
        };
      }

      const snapped = snapPageBuilderRect(
        {
          left: state.startRect.left,
          top: state.startRect.top,
          width: tentativeWidth,
          height: tentativeHeight,
        },
        state.snapCandidates,
        "resize",
      );

      return {
        box: {
          ...state.startBox,
          width: clampPageBuilderLayoutDimension(snapped.rect.width),
          height: clampPageBuilderLayoutDimension(snapped.rect.height),
        },
        previews: [
          {
            nodeId: selectedNode.id,
            box: {
              ...state.startBox,
              width: clampPageBuilderLayoutDimension(snapped.rect.width),
              height: clampPageBuilderLayoutDimension(snapped.rect.height),
            },
          },
        ],
        deltaX: 0,
        deltaY: 0,
        guides: snapped.guides,
      };
    }

    const tentativeBox = {
      ...state.startBox,
      x: clampPageBuilderLayoutCoordinate(state.startBox.x + deltaX),
      y: clampPageBuilderLayoutCoordinate(state.startBox.y + deltaY),
    };

    if (state.startRect === null) {
      return {
        box: tentativeBox,
        previews: state.startNodeBoxes.map((entry) => ({
          nodeId: entry.nodeId,
          box: {
            ...entry.box,
            x: clampPageBuilderLayoutCoordinate(entry.box.x + deltaX),
            y: clampPageBuilderLayoutCoordinate(entry.box.y + deltaY),
          },
        })),
        deltaX,
        deltaY,
        guides: [],
      };
    }

    if (!state.snappingEnabled) {
      return {
        box: tentativeBox,
        previews: state.startNodeBoxes.map((entry) => ({
          nodeId: entry.nodeId,
          box: {
            ...entry.box,
            x: clampPageBuilderLayoutCoordinate(entry.box.x + deltaX),
            y: clampPageBuilderLayoutCoordinate(entry.box.y + deltaY),
          },
        })),
        deltaX,
        deltaY,
        guides: [],
      };
    }

    const snapped = snapPageBuilderRect(
      {
        left: state.startRect.left + deltaX,
        top: state.startRect.top + deltaY,
        width: state.startRect.width,
        height: state.startRect.height,
      },
      state.snapCandidates,
      "move",
    );

    return {
      box: {
        ...tentativeBox,
        x: clampPageBuilderLayoutCoordinate(
          state.startBox.x + deltaX + snapped.deltaX,
        ),
        y: clampPageBuilderLayoutCoordinate(
          state.startBox.y + deltaY + snapped.deltaY,
        ),
      },
      previews: state.startNodeBoxes.map((entry) => ({
        nodeId: entry.nodeId,
        box: {
          ...entry.box,
          x: clampPageBuilderLayoutCoordinate(
            entry.box.x + deltaX + snapped.deltaX,
          ),
          y: clampPageBuilderLayoutCoordinate(
            entry.box.y + deltaY + snapped.deltaY,
          ),
        },
      })),
      deltaX: deltaX + snapped.deltaX,
      deltaY: deltaY + snapped.deltaY,
      guides: snapped.guides,
    };
  }

  const measureSelectionRect = useEffectEvent(() => {
    const surface = canvasSurfaceRef.current;
    if (!surface) {
      setSelectionRect(null);
      setSurfaceHeight(null);
      return;
    }

    setSurfaceHeight(surface.offsetHeight);

    const selectedElements = selectedNodeIds
      .map((nodeId) =>
        surface.querySelector<HTMLElement>(
          `[data-page-builder-node-id="${nodeId}"]`,
        ),
      )
      .filter((element) => element !== null);

    if (selectedElements.length === 0) {
      setSelectionRect(null);
      return;
    }

    const surfaceRect = surface.getBoundingClientRect();
    const elementRects = selectedElements.map((element) =>
      element.getBoundingClientRect(),
    );
    const left = Math.min(...elementRects.map((rect) => rect.left));
    const top = Math.min(...elementRects.map((rect) => rect.top));
    const right = Math.max(...elementRects.map((rect) => rect.right));
    const bottom = Math.max(...elementRects.map((rect) => rect.bottom));

    setSelectionRect({
      left: unscalePageBuilderCanvasMeasurement(left - surfaceRect.left, zoom),
      top: unscalePageBuilderCanvasMeasurement(top - surfaceRect.top, zoom),
      width: unscalePageBuilderCanvasMeasurement(right - left, zoom),
      height: unscalePageBuilderCanvasMeasurement(bottom - top, zoom),
    });
  });

  const scheduleSelectionRectMeasurement = useEffectEvent(() => {
    if (measurementRafRef.current !== null) {
      return;
    }

    measurementRafRef.current = window.requestAnimationFrame(() => {
      measurementRafRef.current = null;
      measureSelectionRect();
    });
  });

  const flushInteractionPreview = useEffectEvent(() => {
    const currentInteractionState = interactionStateRef.current;
    const latestPointer = latestPointerRef.current;
    if (!currentInteractionState || !latestPointer) {
      return;
    }

    const nextResult = computeInteractionResult(
      currentInteractionState,
      latestPointer.clientX,
      latestPointer.clientY,
    );

    if (
      arePageBuilderLayoutBoxesEqual(
        currentInteractionState.latestBox,
        nextResult.box,
      ) &&
      currentInteractionState.latestGuides.length ===
        nextResult.guides.length &&
      currentInteractionState.latestGuides.every(
        (guide, index) =>
          guide.orientation === nextResult.guides[index]?.orientation &&
          guide.offset === nextResult.guides[index]?.offset,
      )
    ) {
      return;
    }

    const nextInteractionState = {
      ...currentInteractionState,
      latestBox: nextResult.box,
      latestPreviews: nextResult.previews,
      latestDeltaX: nextResult.deltaX,
      latestDeltaY: nextResult.deltaY,
      latestGuides: nextResult.guides,
    };

    interactionStateRef.current = nextInteractionState;
    setInteractionState(nextInteractionState);
    setSnapGuides(nextResult.guides);
    onLayoutPreviewChange(nextResult.previews);
  });

  const scheduleInteractionPreview = useEffectEvent(() => {
    if (rafRef.current !== null) {
      return;
    }

    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      flushInteractionPreview();
    });
  });

  const stopInteraction = useEffectEvent(
    (
      clientX: number | null,
      clientY: number | null,
      commit: boolean,
      snappingEnabled: boolean | null,
    ) => {
      const currentInteractionState = interactionStateRef.current;
      if (!currentInteractionState) {
        return;
      }

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const finalInteractionState =
        snappingEnabled === null ||
        currentInteractionState.snappingEnabled === snappingEnabled
          ? currentInteractionState
          : {
              ...currentInteractionState,
              snappingEnabled,
            };

      const finalResult =
        clientX === null || clientY === null
          ? {
              box: finalInteractionState.latestBox,
              previews: finalInteractionState.latestPreviews,
              deltaX: finalInteractionState.latestDeltaX,
              deltaY: finalInteractionState.latestDeltaY,
              guides: finalInteractionState.latestGuides,
            }
          : computeInteractionResult(finalInteractionState, clientX, clientY);

      interactionStateRef.current = null;
      latestPointerRef.current = null;
      setInteractionState(null);
      setSnapGuides([]);

      if (
        commit &&
        !arePageBuilderLayoutBoxesEqual(
          currentInteractionState.startBox,
          finalResult.box,
        )
      ) {
        onCommitLayout({
          box: finalResult.box,
          mode:
            currentInteractionState.kind === "move" &&
            currentInteractionState.duplicateOnCommit
              ? currentInteractionState.isMultiSelection
                ? "multi-duplicate"
                : "duplicate"
              : currentInteractionState.kind === "move" &&
                  currentInteractionState.isMultiSelection
                ? "multi-move"
                : currentInteractionState.kind,
          deltaX: finalResult.deltaX,
          deltaY: finalResult.deltaY,
        });
      }

      onLayoutPreviewChange([]);
    },
  );

  const handleWindowPointerMove = useEffectEvent((event: PointerEvent) => {
    const currentInteractionState = interactionStateRef.current;
    const snappingEnabled = isPageBuilderSnappingEnabled(event);

    if (
      currentInteractionState &&
      currentInteractionState.snappingEnabled !== snappingEnabled
    ) {
      const nextInteractionState = {
        ...currentInteractionState,
        snappingEnabled,
      };
      interactionStateRef.current = nextInteractionState;
      setInteractionState(nextInteractionState);
    }

    latestPointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    scheduleInteractionPreview();
  });

  const handleWindowPointerUp = useEffectEvent((event: PointerEvent) => {
    stopInteraction(
      event.clientX,
      event.clientY,
      true,
      isPageBuilderSnappingEnabled(event),
    );
  });

  const handleWindowPointerCancel = useEffectEvent(() => {
    stopInteraction(null, null, false, null);
  });

  const handleWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      stopInteraction(null, null, false, null);
      if (marqueeSelectionRef.current) {
        marqueeSelectionRef.current = null;
        setMarqueeSelection(null);
      }
    }
  });

  function resolveMarqueeSelectedNodeIds(
    state: MarqueeSelectionState,
  ): readonly string[] {
    const surface = canvasSurfaceRef.current;
    if (!surface) {
      return state.startSelectedNodeIds;
    }

    const marquee = createPageBuilderSelectionRectFromPoints(
      state.startX,
      state.startY,
      state.currentX,
      state.currentY,
    );

    const surfaceRect = surface.getBoundingClientRect();
    const candidates: PageBuilderSelectionCandidate[] = [];
    const elements = surface.querySelectorAll<HTMLElement>(
      "[data-page-builder-node-id]",
    );

    for (const element of elements) {
      const nodeId = element.dataset["pageBuilderNodeId"];
      if (
        !nodeId ||
        nodeId === document.rootId ||
        !document.nodes[nodeId] ||
        element.offsetWidth === 0 ||
        element.offsetHeight === 0
      ) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      candidates.push({
        nodeId,
        rect: {
          left: unscalePageBuilderCanvasMeasurement(
            rect.left - surfaceRect.left,
            zoom,
          ),
          top: unscalePageBuilderCanvasMeasurement(
            rect.top - surfaceRect.top,
            zoom,
          ),
          width: unscalePageBuilderCanvasMeasurement(rect.width, zoom),
          height: unscalePageBuilderCanvasMeasurement(rect.height, zoom),
        },
      });
    }

    return resolvePageBuilderMarqueeSelection({
      document,
      rect: marquee,
      candidates,
      additive: state.additive,
      startSelectedNodeIds: state.startSelectedNodeIds,
    });
  }

  const updateMarqueeSelection = useEffectEvent(
    (clientX: number, clientY: number) => {
      const currentMarqueeSelection = marqueeSelectionRef.current;
      const surface = canvasSurfaceRef.current;
      if (!currentMarqueeSelection || !surface) {
        return;
      }

      const point = getCanvasPointFromClient(surface, clientX, clientY, zoom);
      const nextMarqueeSelection = {
        ...currentMarqueeSelection,
        currentX: point.x,
        currentY: point.y,
      };
      marqueeSelectionRef.current = nextMarqueeSelection;
      setMarqueeSelection(nextMarqueeSelection);
    },
  );

  const stopMarqueeSelection = useEffectEvent(
    (clientX: number | null, clientY: number | null, commit: boolean) => {
      const currentMarqueeSelection = marqueeSelectionRef.current;
      if (!currentMarqueeSelection) {
        return;
      }

      const surface = canvasSurfaceRef.current;
      let finalMarqueeSelection = currentMarqueeSelection;
      if (clientX !== null && clientY !== null && surface) {
        const point = getCanvasPointFromClient(surface, clientX, clientY, zoom);
        finalMarqueeSelection = {
          ...currentMarqueeSelection,
          currentX: point.x,
          currentY: point.y,
        };
      }

      marqueeSelectionRef.current = null;
      setMarqueeSelection(null);

      if (commit) {
        onNodesSelect(resolveMarqueeSelectedNodeIds(finalMarqueeSelection));
      }
    },
  );

  const handleWindowMarqueePointerMove = useEffectEvent(
    (event: PointerEvent) => {
      updateMarqueeSelection(event.clientX, event.clientY);
    },
  );

  const handleWindowMarqueePointerUp = useEffectEvent((event: PointerEvent) => {
    stopMarqueeSelection(event.clientX, event.clientY, true);
  });

  const handleWindowMarqueePointerCancel = useEffectEvent(() => {
    stopMarqueeSelection(null, null, false);
  });

  useEffect(() => {
    scheduleSelectionRectMeasurement();
    const surface = canvasSurfaceRef.current;
    const selectedElements = selectedNodeIds
      .map(
        (nodeId) =>
          surface?.querySelector<HTMLElement>(
            `[data-page-builder-node-id="${nodeId}"]`,
          ) ?? null,
      )
      .filter((element) => element !== null);

    if (!surface || selectedElements.length === 0) {
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleSelectionRectMeasurement();
    });
    observer.observe(surface);
    for (const element of selectedElements) {
      observer.observe(element);
    }
    window.addEventListener("resize", scheduleSelectionRectMeasurement);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleSelectionRectMeasurement);
      if (measurementRafRef.current !== null) {
        window.cancelAnimationFrame(measurementRafRef.current);
        measurementRafRef.current = null;
      }
    };
  }, [
    document,
    selectedNode.id,
    selectedNodeIds,
    breakpoint,
    layoutPreviews,
    zoom,
  ]);

  useEffect(() => {
    if (!interactionState) {
      return;
    }

    window.addEventListener("pointermove", handleWindowPointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
      window.removeEventListener("keydown", handleWindowKeyDown);

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [interactionState]);

  useEffect(() => {
    if (!marqueeSelection) {
      return;
    }

    window.addEventListener("pointermove", handleWindowMarqueePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", handleWindowMarqueePointerUp);
    window.addEventListener("pointercancel", handleWindowMarqueePointerCancel);
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("pointermove", handleWindowMarqueePointerMove);
      window.removeEventListener("pointerup", handleWindowMarqueePointerUp);
      window.removeEventListener(
        "pointercancel",
        handleWindowMarqueePointerCancel,
      );
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [marqueeSelection]);

  function startInteraction(
    kind: CanvasInteractionState["kind"],
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    if (
      (kind === "move" && !canDragSelectedNode) ||
      (kind === "resize" && !canResizeSelectedNode)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startBox =
      isMultiSelection && selectionRect
        ? {
            x: clampPageBuilderLayoutCoordinate(selectionRect.left),
            y: clampPageBuilderLayoutCoordinate(selectionRect.top),
            width: clampPageBuilderLayoutDimension(selectionRect.width),
            height: clampPageBuilderLayoutDimension(selectionRect.height),
            rotate: 0,
            zIndex: selectedBox.zIndex,
          }
        : { ...selectedBox };
    const startNodeBoxes = selectedNodeIds
      .map((nodeId) => {
        const node = document.nodes[nodeId];
        return node
          ? {
              nodeId,
              box: resolvePageBuilderNodeLayoutBox(node, breakpoint),
            }
          : null;
      })
      .filter((entry) => entry !== null);
    const nextStartRect =
      selectionRect === null
        ? null
        : {
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
          };
    const surface = canvasSurfaceRef.current;
    const nextDragState = {
      kind,
      duplicateOnCommit: kind === "move" && event.altKey,
      isMultiSelection,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox,
      startNodeBoxes,
      startRect: nextStartRect,
      snapCandidates:
        surface && nextStartRect
          ? measureSnapCandidates(surface, selectedNodeIds, zoom)
          : createEmptySnapCandidates(),
      snappingEnabled: isPageBuilderSnappingEnabled(event),
      latestBox: startBox,
      latestPreviews: startNodeBoxes,
      latestDeltaX: 0,
      latestDeltaY: 0,
      latestGuides: [],
    };

    interactionStateRef.current = nextDragState;
    latestPointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    setInteractionState(nextDragState);
    setSnapGuides([]);
    onLayoutPreviewChange(startNodeBoxes);
  }

  function startMarqueeSelection(
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    if (
      interactionDisabled ||
      event.button !== 0 ||
      interactionStateRef.current
    ) {
      return;
    }

    if (
      isElementTarget(event.target) &&
      event.target.closest(
        "[data-page-builder-node-id],button,a,input,textarea,select,[role='button']",
      )
    ) {
      return;
    }

    const surface = canvasSurfaceRef.current;
    if (!surface) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getCanvasPointFromClient(
      surface,
      event.clientX,
      event.clientY,
      zoom,
    );
    const nextMarqueeSelection = {
      additive: event.metaKey || event.ctrlKey || event.shiftKey,
      startSelectedNodeIds: selectedNodeIds,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    };

    marqueeSelectionRef.current = nextMarqueeSelection;
    setMarqueeSelection(nextMarqueeSelection);
  }

  return (
    <div className="h-full min-h-[620px] overflow-auto p-6">
      <div
        className="mx-auto"
        style={{
          width: `${scaledCanvasWidth}px`,
          height: scaledSurfaceHeight,
        }}
      >
        <div
          style={{
            width: `${breakpointWidth}px`,
            transform: `scale(${canvasScale})`,
            transformOrigin: "top left",
          }}
        >
          <div
            ref={canvasSurfaceRef}
            className="relative bg-white shadow-[0_18px_60px_rgba(15,23,42,0.12)] ring-1 ring-slate-200"
            onPointerDown={startMarqueeSelection}
          >
            <FreeformPageRenderer
              document={document}
              media={media}
              breakpoint={breakpoint}
              selectedNodeId={selectedNode.id}
              selectedNodeIds={selectedNodeIds}
              onNodeSelect={onNodeSelect}
              layoutPreviews={layoutPreviews}
            />

            {showGrid ? (
              <div
                className="pointer-events-none absolute inset-0 z-10 opacity-70 mix-blend-multiply"
                style={{
                  backgroundImage: [
                    "linear-gradient(to right, rgba(37,99,235,0.08) 1px, transparent 1px)",
                    "linear-gradient(to bottom, rgba(37,99,235,0.08) 1px, transparent 1px)",
                    "linear-gradient(to right, rgba(37,99,235,0.15) 1px, transparent 1px)",
                    "linear-gradient(to bottom, rgba(37,99,235,0.15) 1px, transparent 1px)",
                  ].join(","),
                  backgroundSize: [
                    `${PAGE_BUILDER_SNAP_GRID_SIZE}px ${PAGE_BUILDER_SNAP_GRID_SIZE}px`,
                    `${PAGE_BUILDER_SNAP_GRID_SIZE}px ${PAGE_BUILDER_SNAP_GRID_SIZE}px`,
                    `${majorGridSize}px ${majorGridSize}px`,
                    `${majorGridSize}px ${majorGridSize}px`,
                  ].join(","),
                }}
              />
            ) : null}

            {selectionRect ? (
              <div className="pointer-events-none absolute inset-0 z-20">
                {snapGuides.map((guide) => (
                  <div
                    key={`${guide.orientation}:${guide.offset}`}
                    className={cn(
                      "absolute bg-blue-500/80",
                      guide.orientation === "vertical"
                        ? "top-0 bottom-0 w-px"
                        : "left-0 right-0 h-px",
                    )}
                    style={
                      guide.orientation === "vertical"
                        ? { left: `${guide.offset}px` }
                        : { top: `${guide.offset}px` }
                    }
                  />
                ))}
                <div
                  className={cn(
                    "absolute",
                    interactionState?.kind === "move"
                      ? "cursor-grabbing"
                      : undefined,
                  )}
                  style={{
                    left: `${selectionRect.left}px`,
                    top: `${selectionRect.top}px`,
                    width: `${selectionRect.width}px`,
                    height: `${selectionRect.height}px`,
                    outline: "2px solid rgb(37 99 235)",
                    outlineOffset: "2px",
                  }}
                >
                  <div
                    className="absolute left-0 top-0 flex items-center gap-2"
                    style={{ transform: "translateY(calc(-100% - 6px))" }}
                  >
                    <Badge variant="default">{selectedNode.name}</Badge>
                    {interactionState?.kind === "move" &&
                    interactionState.duplicateOnCommit ? (
                      <Badge variant="secondary">複製</Badge>
                    ) : null}
                    {canDragSelectedNode ? (
                      <button
                        type="button"
                        className={cn(
                          "pointer-events-auto inline-flex h-7 touch-none items-center rounded-md border border-blue-500/30 bg-white px-2 text-[11px] font-medium text-slate-950 shadow-sm",
                          interactionState?.kind === "move"
                            ? "cursor-grabbing"
                            : "cursor-grab",
                        )}
                        onPointerDown={(event) =>
                          startInteraction("move", event)
                        }
                      >
                        移動
                      </button>
                    ) : null}
                  </div>
                  {canResizeSelectedNode ? (
                    <button
                      type="button"
                      className="pointer-events-auto absolute -bottom-2 -right-2 h-4 w-4 touch-none rounded-full border border-blue-500 bg-white shadow-sm cursor-se-resize"
                      aria-label="ドラッグしてサイズ変更"
                      onPointerDown={(event) =>
                        startInteraction("resize", event)
                      }
                    />
                  ) : null}
                  <div className="absolute left-2 top-full mt-2 rounded-md border border-slate-950/10 bg-slate-950/90 px-2 py-1 font-mono text-[11px] leading-none text-white shadow-lg">
                    X{" "}
                    {formatPageBuilderCanvasCoordinateLabel(
                      activeSelectionBox.x,
                    )}{" "}
                    Y{" "}
                    {formatPageBuilderCanvasCoordinateLabel(
                      activeSelectionBox.y,
                    )}{" "}
                    W{" "}
                    {formatPageBuilderCanvasMeasurementLabel(
                      activeSelectionBox.width,
                    )}{" "}
                    H{" "}
                    {formatPageBuilderCanvasMeasurementLabel(
                      activeSelectionBox.height,
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {marqueeRect ? (
              <div className="pointer-events-none absolute inset-0 z-30">
                <div
                  className="absolute rounded-md border border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(255,255,255,0.9)_inset]"
                  style={{
                    left: `${marqueeRect.left}px`,
                    top: `${marqueeRect.top}px`,
                    width: `${marqueeRect.width}px`,
                    height: `${marqueeRect.height}px`,
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
