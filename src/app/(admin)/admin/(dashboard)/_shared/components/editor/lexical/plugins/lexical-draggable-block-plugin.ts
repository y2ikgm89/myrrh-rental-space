/**
 * Lexical `DraggableBlockPlugin` のフォーク（@lexical/react 0.43.0 の LexicalDraggableBlockPlugin をベース）。
 *
 * - ContentEditable の左右パディング（`editor-layout-constants`）とドロップラインを整合。
 * - unitless `line-height`（`prose` / `leading-relaxed`）でもドラッグハンドルがブロックの先頭行に追従するよう `getBlockLineHeightPx` を使用。
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * SPDX-License-Identifier: MIT
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { eventFiles } from "@lexical/rich-text";
import {
  calculateZoomLevel,
  mergeRegister,
  isHTMLElement,
} from "@lexical/utils";
import {
  type LexicalEditor,
  type LexicalNode,
  DRAGOVER_COMMAND,
  COMMAND_PRIORITY_LOW,
  DROP_COMMAND,
  COMMAND_PRIORITY_HIGH,
  BLUR_COMMAND,
  $getSelection,
  $getNodeByKey,
  $getNearestNodeFromDOMNode,
  $onUpdate,
  $getRoot,
} from "lexical";
import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { jsxs, Fragment, jsx } from "react/jsx-runtime";

import {
  EDITOR_PADDING_LEFT,
  EDITOR_PADDING_RIGHT,
} from "../editor-layout-constants";

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const CAN_USE_DOM =
  typeof window !== "undefined" &&
  typeof window.document !== "undefined" &&
  typeof window.document.createElement !== "undefined";

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const IS_FIREFOX =
  CAN_USE_DOM && /^(?!.*Seamonkey)(?=.*Firefox).*/i.test(navigator.userAgent);

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
class Point {
  private _x: number;
  private _y: number;
  constructor(x: number, y: number) {
    this._x = x;
    this._y = y;
  }
  get x() {
    return this._x;
  }
  get y() {
    return this._y;
  }
  equals({ x, y }: { x: number; y: number }) {
    return this.x === x && this.y === y;
  }
  calcDeltaXTo({ x }: { x: number }) {
    return this.x - x;
  }
  calcDeltaYTo({ y }: { y: number }) {
    return this.y - y;
  }
  calcHorizontalDistanceTo(point: Point) {
    return Math.abs(this.calcDeltaXTo(point));
  }
  calcVerticalDistance(point: Point) {
    return Math.abs(this.calcDeltaYTo(point));
  }
  calcDistanceTo(point: Point) {
    return Math.sqrt(
      Math.pow(this.calcDeltaXTo(point), 2) +
        Math.pow(this.calcDeltaYTo(point), 2),
    );
  }
}

type PointContainment = {
  reason: {
    isOnBottomSide: boolean;
    isOnLeftSide: boolean;
    isOnRightSide: boolean;
    isOnTopSide: boolean;
  };
  result: boolean;
};

function isPoint(x: unknown): x is Point {
  return x instanceof Point;
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
class Rectangle {
  private _left: number;
  private _top: number;
  private _right: number;
  private _bottom: number;
  constructor(left: number, top: number, right: number, bottom: number) {
    const [physicTop, physicBottom] =
      top <= bottom ? [top, bottom] : [bottom, top];
    const [physicLeft, physicRight] =
      left <= right ? [left, right] : [right, left];
    this._top = physicTop;
    this._right = physicRight;
    this._left = physicLeft;
    this._bottom = physicBottom;
  }
  get top() {
    return this._top;
  }
  get right() {
    return this._right;
  }
  get bottom() {
    return this._bottom;
  }
  get left() {
    return this._left;
  }
  get width() {
    return Math.abs(this._left - this._right);
  }
  get height() {
    return Math.abs(this._bottom - this._top);
  }
  equals({
    top,
    left,
    bottom,
    right,
  }: {
    top: number;
    left: number;
    bottom: number;
    right: number;
  }) {
    return (
      top === this._top &&
      bottom === this._bottom &&
      left === this._left &&
      right === this._right
    );
  }
  contains(target: Point): PointContainment;
  contains(target: Rectangle): boolean;
  contains(target: Point | Rectangle): PointContainment | boolean {
    if (isPoint(target)) {
      const { x, y } = target;
      const isOnTopSide = y < this._top;
      const isOnBottomSide = y > this._bottom;
      const isOnLeftSide = x < this._left;
      const isOnRightSide = x > this._right;
      const result =
        !isOnTopSide && !isOnBottomSide && !isOnLeftSide && !isOnRightSide;
      return {
        reason: {
          isOnBottomSide,
          isOnLeftSide,
          isOnRightSide,
          isOnTopSide,
        },
        result,
      };
    }
    const { top, left, bottom, right } = target;
    return (
      top >= this._top &&
      top <= this._bottom &&
      bottom >= this._top &&
      bottom <= this._bottom &&
      left >= this._left &&
      left <= this._right &&
      right >= this._left &&
      right <= this._right
    );
  }
  intersectsWith(rect: Rectangle) {
    const { left: x1, top: y1, width: w1, height: h1 } = rect;
    const { left: x2, top: y2, width: w2, height: h2 } = this;
    const maxX = x1 + w1 >= x2 + w2 ? x1 + w1 : x2 + w2;
    const maxY = y1 + h1 >= y2 + h2 ? y1 + h1 : y2 + h2;
    const minX = x1 <= x2 ? x1 : x2;
    const minY = y1 <= y2 ? y1 : y2;
    return maxX - minX <= w1 + w2 && maxY - minY <= h1 + h2;
  }
  generateNewRect({
    left = this.left,
    top = this.top,
    right = this.right,
    bottom = this.bottom,
  }: {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
  }) {
    return new Rectangle(left, top, right, bottom);
  }
  static fromLTRB(left: number, top: number, right: number, bottom: number) {
    return new Rectangle(left, top, right, bottom);
  }
  static fromLWTH(left: number, width: number, top: number, height: number) {
    return new Rectangle(left, top, left + width, top + height);
  }
  static fromPoints(startPoint: Point, endPoint: Point) {
    const { y: top, x: left } = startPoint;
    const { y: bottom, x: right } = endPoint;
    return Rectangle.fromLTRB(left, top, right, bottom);
  }
  static fromDOM(dom: Element) {
    const { top, width, left, height } = dom.getBoundingClientRect();
    return Rectangle.fromLWTH(left, width, top, height);
  }
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const SPACE = 4;
const TARGET_LINE_HALF_HEIGHT = 2;
const DRAG_DATA_FORMAT = "application/x-lexical-drag-block";

/**
 * Lexical 原版は `parseInt(lineHeight, 10)` のため、`1.625` のような unitless 値が `1` と解釈されハンドルが縦にずれる。
 */
function getBlockLineHeightPx(elem: HTMLElement, targetRect: DOMRect): number {
  const style = window.getComputedStyle(elem);
  const lh = style.lineHeight;
  if (lh === "normal") {
    const fontSize = parseFloat(style.fontSize);
    return Number.isNaN(fontSize) ? targetRect.height : fontSize * 1.2;
  }
  if (lh.endsWith("px")) {
    return parseFloat(lh);
  }
  const fontSize = parseFloat(style.fontSize);
  const ratio = parseFloat(lh);
  if (!Number.isNaN(ratio) && !Number.isNaN(fontSize)) {
    return fontSize * ratio;
  }
  return targetRect.bottom - targetRect.top;
}
const Downward = 1;
const Upward = -1;
const Indeterminate = 0;
let prevIndex = Infinity;
function getCurrentIndex(keysLength: number) {
  if (keysLength === 0) {
    return Infinity;
  }
  if (prevIndex >= 0 && prevIndex < keysLength) {
    return prevIndex;
  }
  return Math.floor(keysLength / 2);
}
function getTopLevelNodeKeys(editor: LexicalEditor): string[] {
  return editor.read(() => $getRoot().getChildrenKeys());
}
function getCollapsedMargins(elem: HTMLElement) {
  const getMargin = (
    element: Element | null,
    margin: "marginTop" | "marginBottom",
  ) => (element ? parseFloat(window.getComputedStyle(element)[margin]) : 0);
  const { marginTop, marginBottom } = window.getComputedStyle(elem);
  const prevElemSiblingMarginBottom = getMargin(
    elem.previousElementSibling,
    "marginBottom",
  );
  const nextElemSiblingMarginTop = getMargin(
    elem.nextElementSibling,
    "marginTop",
  );
  const collapsedTopMargin = Math.max(
    parseFloat(marginTop),
    prevElemSiblingMarginBottom,
  );
  const collapsedBottomMargin = Math.max(
    parseFloat(marginBottom),
    nextElemSiblingMarginTop,
  );
  return {
    marginBottom: collapsedBottomMargin,
    marginTop: collapsedTopMargin,
  };
}
function getBlockElement(
  anchorElem: HTMLElement,
  editor: LexicalEditor,
  event: MouseEvent,
  useEdgeAsDefault = false,
): HTMLElement | null {
  const anchorElementRect = anchorElem.getBoundingClientRect();
  const topLevelNodeKeys = getTopLevelNodeKeys(editor);
  let blockElem: HTMLElement | null = null;
  editor.read(() => {
    if (useEdgeAsDefault) {
      const firstKey = topLevelNodeKeys[0];
      const lastKey = topLevelNodeKeys[topLevelNodeKeys.length - 1];
      if (firstKey === undefined || lastKey === undefined) {
        return;
      }
      const [firstNode, lastNode] = [
        editor.getElementByKey(firstKey),
        editor.getElementByKey(lastKey),
      ];
      const [firstNodeRect, lastNodeRect] = [
        firstNode != null ? firstNode.getBoundingClientRect() : undefined,
        lastNode != null ? lastNode.getBoundingClientRect() : undefined,
      ];
      if (firstNodeRect && lastNodeRect) {
        const firstNodeZoom = calculateZoomLevel(firstNode);
        const lastNodeZoom = calculateZoomLevel(lastNode);
        if (event.y / firstNodeZoom < firstNodeRect.top) {
          blockElem = firstNode;
        } else if (event.y / lastNodeZoom > lastNodeRect.bottom) {
          blockElem = lastNode;
        }
        if (blockElem) {
          return;
        }
      }
    }
    let index = getCurrentIndex(topLevelNodeKeys.length);
    let direction = Indeterminate;
    while (index >= 0 && index < topLevelNodeKeys.length) {
      const key = topLevelNodeKeys[index];
      if (key === undefined) {
        break;
      }
      const elem = editor.getElementByKey(key);
      if (elem === null) {
        break;
      }
      const zoom = calculateZoomLevel(elem);
      const point = new Point(event.x / zoom, event.y / zoom);
      const domRect = Rectangle.fromDOM(elem);
      const { marginTop, marginBottom } = getCollapsedMargins(elem);
      const rect = domRect.generateNewRect({
        bottom: domRect.bottom + marginBottom,
        left: anchorElementRect.left,
        right: anchorElementRect.right,
        top: domRect.top - marginTop,
      });
      const containment = rect.contains(point);
      if (typeof containment !== "object") {
        break;
      }
      const {
        result,
        reason: { isOnTopSide, isOnBottomSide },
      } = containment;
      if (result) {
        blockElem = elem;
        prevIndex = index;
        break;
      }
      if (direction === Indeterminate) {
        if (isOnTopSide) {
          direction = Upward;
        } else if (isOnBottomSide) {
          direction = Downward;
        } else {
          // stop search block element
          direction = Infinity;
        }
      }
      index += direction;
    }
  });
  return blockElem;
}
function setMenuPosition(
  targetElem: HTMLElement | null,
  floatingElem: HTMLElement,
  anchorElem: HTMLElement,
  zoomLevel: number,
) {
  if (!targetElem) {
    floatingElem.style.display = "none";
    return;
  }
  const targetRect = targetElem.getBoundingClientRect();
  const floatingElemRect = floatingElem.getBoundingClientRect();
  const anchorElementRect = anchorElem.getBoundingClientRect();
  const targetCalculateHeight = getBlockLineHeightPx(targetElem, targetRect);
  const top =
    (targetRect.top +
      (targetCalculateHeight -
        (floatingElemRect.height || targetCalculateHeight)) /
        2 -
      anchorElementRect.top +
      anchorElem.scrollTop) /
    zoomLevel;
  const left = SPACE;
  floatingElem.style.display = "flex";
  floatingElem.style.opacity = "1";
  floatingElem.style.transform = `translate(${left}px, ${top}px)`;
}
function setDragImage(
  dataTransfer: DataTransfer,
  draggableBlockElem: HTMLElement,
) {
  const { transform } = draggableBlockElem.style;

  // Remove dragImage borders
  draggableBlockElem.style.transform = "translateZ(0)";
  dataTransfer.setDragImage(draggableBlockElem, 0, 0);
  setTimeout(() => {
    draggableBlockElem.style.transform = transform;
  });
}
function setTargetLine(
  targetLineElem: HTMLElement,
  targetBlockElem: HTMLElement,
  mouseY: number,
  anchorElem: HTMLElement,
) {
  const { top: targetBlockElemTop, height: targetBlockElemHeight } =
    targetBlockElem.getBoundingClientRect();
  const { top: anchorTop, width: anchorWidth } =
    anchorElem.getBoundingClientRect();
  const { marginTop, marginBottom } = getCollapsedMargins(targetBlockElem);
  let lineTop = targetBlockElemTop;
  if (mouseY >= targetBlockElemTop) {
    lineTop += targetBlockElemHeight + marginBottom / 2;
  } else {
    lineTop -= marginTop / 2;
  }
  const top =
    lineTop - anchorTop - TARGET_LINE_HALF_HEIGHT + anchorElem.scrollTop;
  const leftInset = EDITOR_PADDING_LEFT - SPACE;
  const rightInset = EDITOR_PADDING_RIGHT - SPACE;
  targetLineElem.style.transform = `translate(${leftInset}px, ${top}px)`;
  targetLineElem.style.width = `${anchorWidth - leftInset - rightInset}px`;
  targetLineElem.style.opacity = ".4";
}
function hideTargetLine(targetLineElem: HTMLElement | null) {
  if (targetLineElem) {
    targetLineElem.style.opacity = "0";
    targetLineElem.style.transform = "translate(-10000px, -10000px)";
  }
}
function useDraggableBlockMenu(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  menuRef: RefObject<HTMLElement | null>,
  targetLineRef: RefObject<HTMLElement | null>,
  isEditable: boolean,
  menuComponent: ReactNode,
  targetLineComponent: ReactNode,
  isOnMenu: (element: HTMLElement) => boolean,
  onElementChanged: ((elem: HTMLElement | null) => void) | undefined,
) {
  const scrollerElem = anchorElem.parentElement;
  const isDraggingBlockRef = useRef(false);
  const [draggableBlockElem, setDraggableBlockElemState] =
    useState<HTMLElement | null>(null);
  // React Compiler 1.0 との二重メモ化（意図的例外）。
  // onElementChanged prop の参照同一性要求が upstream で残っているため。
  // @lexical/react 次回 upgrade 時に upstream の DraggableBlockPlugin_EXPERIMENTAL と
  // 差分マージし、useCallback が upstream で除去されていれば本フォークも追随削除する。
  const setDraggableBlockElem = useCallback(
    (elem: HTMLElement | null) => {
      setDraggableBlockElemState(elem);
      if (onElementChanged) {
        onElementChanged(elem);
      }
    },
    [onElementChanged],
  );
  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const target = event.target;
      if (!isHTMLElement(target)) {
        setDraggableBlockElem(null);
        return;
      }
      if (isOnMenu(target)) {
        return;
      }
      const _draggableBlockElem = getBlockElement(anchorElem, editor, event);
      setDraggableBlockElem(_draggableBlockElem);
    }
    function onMouseLeave() {
      setDraggableBlockElem(null);
    }
    if (scrollerElem != null) {
      scrollerElem.addEventListener("mousemove", onMouseMove);
      scrollerElem.addEventListener("mouseleave", onMouseLeave);
    }
    return () => {
      if (scrollerElem != null) {
        scrollerElem.removeEventListener("mousemove", onMouseMove);
        scrollerElem.removeEventListener("mouseleave", onMouseLeave);
      }
    };
  }, [scrollerElem, anchorElem, editor, isOnMenu, setDraggableBlockElem]);
  useEffect(() => {
    const rootCandidate = document.getElementsByClassName(
      "ContentEditable__root",
    )[0];
    const zoomRoot =
      rootCandidate instanceof Element ? rootCandidate : anchorElem;
    const zoomLevel = calculateZoomLevel(zoomRoot, true);
    if (menuRef.current) {
      setMenuPosition(
        draggableBlockElem,
        menuRef.current,
        anchorElem,
        zoomLevel,
      );
    }
  }, [anchorElem, draggableBlockElem, menuRef]);
  useEffect(() => {
    function onDragover(event: DragEvent) {
      if (!isDraggingBlockRef.current) {
        return false;
      }
      const [isFileTransfer] = eventFiles(event);
      if (isFileTransfer) {
        return false;
      }
      const { pageY, target } = event;
      if (!isHTMLElement(target)) {
        return false;
      }
      const targetBlockElem = getBlockElement(anchorElem, editor, event, true);
      const targetLineElem = targetLineRef.current;
      if (targetBlockElem === null || targetLineElem === null) {
        return false;
      }
      setTargetLine(
        targetLineElem,
        targetBlockElem,
        pageY / calculateZoomLevel(target),
        anchorElem,
      );
      // Prevent default event to be able to trigger onDrop events
      event.preventDefault();
      return true;
    }
    function $onDrop(event: DragEvent) {
      if (!isDraggingBlockRef.current) {
        return false;
      }
      const [isFileTransfer] = eventFiles(event);
      if (isFileTransfer) {
        return false;
      }
      const { target, dataTransfer, pageY } = event;
      const dragData =
        dataTransfer != null ? dataTransfer.getData(DRAG_DATA_FORMAT) : "";
      const draggedNode: LexicalNode | null = $getNodeByKey(dragData);
      if (!draggedNode) {
        return false;
      }
      if (!isHTMLElement(target)) {
        return false;
      }
      const targetBlockElem = getBlockElement(anchorElem, editor, event, true);
      if (!targetBlockElem) {
        return false;
      }
      const targetNode = $getNearestNodeFromDOMNode(targetBlockElem);
      if (!targetNode) {
        return false;
      }
      if (targetNode === draggedNode) {
        // Firefox-specific fix: Even when no move occurs, restore focus to ensure cursor visibility
        if (IS_FIREFOX) {
          editor.focus();
        }
        return true;
      }
      const targetBlockElemTop = targetBlockElem.getBoundingClientRect().top;
      if (pageY / calculateZoomLevel(target) >= targetBlockElemTop) {
        targetNode.insertAfter(draggedNode);
      } else {
        targetNode.insertBefore(draggedNode);
      }
      setDraggableBlockElem(null);

      // Firefox-specific fix: Use editor.focus() after drop to properly restore
      // both focus and selection. This ensures cursor visibility immediately.
      if (IS_FIREFOX) {
        // Using $onUpdate ensures this happens after the current update cycle finishes
        $onUpdate(() => {
          editor.focus();
        });
      }
      return true;
    }
    return mergeRegister(
      editor.registerCommand(
        DRAGOVER_COMMAND,
        (event) => {
          return onDragover(event);
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          return $onDrop(event);
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [anchorElem, editor, targetLineRef, setDraggableBlockElem]);

  // Firefox-specific: Prevent blur when clicking on drag handle to maintain cursor visibility.
  // Firefox fires blur before dragstart, causing focus loss. We detect this by checking if
  // the blur's relatedTarget is on the menu using isOnMenu, then restore focus synchronously.
  useEffect(() => {
    if (!IS_FIREFOX || !isEditable) {
      return;
    }
    return mergeRegister(
      editor.registerRootListener(
        (
          rootElement: HTMLElement | null,
          prevRootElement: HTMLElement | null,
        ) => {
          function onBlur(event: FocusEvent) {
            const relatedTarget = event.relatedTarget;
            if (
              relatedTarget &&
              relatedTarget instanceof HTMLElement &&
              isOnMenu(relatedTarget)
            ) {
              // Blur is caused by clicking on drag handle - restore focus immediately
              // to prevent cursor from disappearing. This must be synchronous to work.
              if (rootElement) {
                rootElement.focus({
                  preventScroll: true,
                });
                // Force selection update to ensure cursor is visible
                editor.update(() => {
                  const selection = $getSelection();
                  if (selection !== null && !selection.dirty) {
                    selection.dirty = true;
                  }
                });
              }
              // Prevent the event from propagating to LexicalEvents handler
              event.stopImmediatePropagation();
            }
          }
          if (rootElement) {
            rootElement.addEventListener("blur", onBlur, true);
          }
          if (prevRootElement) {
            prevRootElement.removeEventListener("blur", onBlur, true);
          }
        },
      ),
      // Intercept BLUR_COMMAND if focus is on the menu (fallback in case event propagation wasn't stopped)
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          const rootElement = editor.getRootElement();
          const activeElement = document.activeElement;
          if (
            rootElement &&
            activeElement &&
            activeElement instanceof HTMLElement &&
            isOnMenu(activeElement)
          ) {
            // Focus is on menu - restore to root and prevent blur command
            rootElement.focus({
              preventScroll: true,
            });
            editor.update(() => {
              const selection = $getSelection();
              if (selection !== null && !selection.dirty) {
                selection.dirty = true;
              }
            });
            return true; // Prevent command from propagating
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, isEditable, isOnMenu]);
  function onDragStart(event: DragEvent) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer || !draggableBlockElem) {
      return;
    }
    setDragImage(dataTransfer, draggableBlockElem);
    let nodeKey = "";
    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(draggableBlockElem);
      if (node) {
        nodeKey = node.getKey();
      }
    });
    isDraggingBlockRef.current = true;
    dataTransfer.setData(DRAG_DATA_FORMAT, nodeKey);

    // Firefox-specific: Restore focus synchronously after drag starts to prevent cursor loss.
    // The blur handler should have already restored focus, but we do it here as a fallback
    // and to ensure selection is properly maintained during drag.
    if (IS_FIREFOX) {
      const rootElement = editor.getRootElement();
      if (rootElement !== null && document.activeElement !== rootElement) {
        // Restore focus synchronously - don't use requestAnimationFrame as blur already happened
        // and we need immediate focus restoration to maintain cursor visibility
        rootElement.focus({
          preventScroll: true,
        });
        // Force selection update to ensure cursor is visible
        editor.update(() => {
          const selection = $getSelection();
          if (selection !== null && !selection.dirty) {
            selection.dirty = true;
          }
        });
      }
    }
  }
  function onDragEnd() {
    isDraggingBlockRef.current = false;
    hideTargetLine(targetLineRef.current);

    // Firefox-specific fix: Use editor.focus() to properly restore both focus and
    // selection after drag ends. This ensures cursor visibility immediately.
    if (IS_FIREFOX) {
      // editor.focus() handles both focus restoration and selection update properly
      editor.focus();
    }
  }
  return /*#__PURE__*/ createPortal(
    /*#__PURE__*/ jsxs(Fragment, {
      children: [
        /*#__PURE__*/ jsx("div", {
          draggable: true,
          onDragStart: onDragStart,
          onDragEnd: onDragEnd,
          children: isEditable && menuComponent,
        }),
        targetLineComponent,
      ],
    }),
    anchorElem,
  );
}
type DraggableBlockPluginExperimentalProps = {
  anchorElem?: HTMLElement;
  menuRef: RefObject<HTMLElement | null>;
  targetLineRef: RefObject<HTMLElement | null>;
  menuComponent: ReactNode;
  targetLineComponent: ReactNode;
  isOnMenu: (element: HTMLElement) => boolean;
  onElementChanged?: (element: HTMLElement | null) => void;
};

function DraggableBlockPlugin_EXPERIMENTAL({
  anchorElem = document.body,
  menuRef,
  targetLineRef,
  menuComponent,
  targetLineComponent,
  isOnMenu,
  onElementChanged,
}: DraggableBlockPluginExperimentalProps) {
  const [editor] = useLexicalComposerContext();
  return useDraggableBlockMenu(
    editor,
    anchorElem,
    menuRef,
    targetLineRef,
    editor.isEditable(),
    menuComponent,
    targetLineComponent,
    isOnMenu,
    onElementChanged,
  );
}

export { DraggableBlockPlugin_EXPERIMENTAL };
