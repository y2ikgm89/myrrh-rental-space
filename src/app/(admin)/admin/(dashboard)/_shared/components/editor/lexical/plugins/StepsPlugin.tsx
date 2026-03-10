/**
 * Steps Plugin
 *
 * @description ステップリストの挿入を提供するプラグイン
 *
 * ダイアログでステップ数とスタイルを選択し、Steps構造を挿入
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getSelection,
  $getState,
  $isRangeSelection,
  $setState,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  mergeRegister,
} from "lexical";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createStepsContainerNode,
  $isStepsContainerNode,
  isStepsStyle,
  isStepsShape,
  isStepsFill,
  StepsContainerNode,
  startNumberState,
  STEPS_STYLES,
  STEPS_SHAPES,
  STEPS_FILLS,
  type StepsStyle,
  type StepsShape,
  type StepsFill,
} from "../nodes/StepsContainerNode";
import {
  $createStepItemNode,
  $isStepItemNode,
  StepItemNode,
  stepNumberState,
} from "../nodes/StepItemNode";
import {
  $createStepTitleNode,
  StepTitleNode,
  $isStepTitleNode,
} from "../nodes/StepTitleNode";
import {
  $createStepContentNode,
  StepContentNode,
} from "../nodes/StepContentNode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
} from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import {
  STEPS_STYLE_LABELS,
  STEPS_SHAPE_LABELS,
  STEPS_FILL_LABELS,
} from "../config/node-labels";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_STEP_COUNT = 2;

// =============================================================================
// Utilities
// =============================================================================

/**
 * 矢印キーでSteps境界を脱出
 */
function $onEscape(direction: "up" | "down"): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const node = selection.anchor.getNode();
  let stepsNode: StepsContainerNode | null = null;
  let current = node.getParent();

  while (current) {
    if ($isStepsContainerNode(current)) {
      stepsNode = current;
      break;
    }
    current = current.getParent();
  }

  if (!stepsNode) return false;

  const isAtStart = selection.anchor.offset === 0;
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize();

  if ((direction === "up" && isAtStart) || (direction === "down" && isAtEnd)) {
    const paragraph = $createParagraphNode();
    if (direction === "up") {
      stepsNode.insertBefore(paragraph);
    } else {
      stepsNode.insertAfter(paragraph);
    }
    paragraph.select();
    return true;
  }

  return false;
}

/**
 * 全StepItemNodeのstepNumberをstartNumberから連番に再設定
 */
export function $renumberSteps(container: StepsContainerNode): void {
  const start = $getState(container, startNumberState);
  const children = container.getChildren();
  let num = start;
  for (const child of children) {
    if ($isStepItemNode(child)) {
      $setState(child, stepNumberState, num);
      num++;
    }
  }
}

/**
 * 末尾にステップを追加し、新規StepItemNodeを返す
 */
export function $addStep(container: StepsContainerNode): StepItemNode {
  const count = container.getChildren().filter($isStepItemNode).length;
  const start = $getState(container, startNumberState);
  const _stepNumber = start + count;
  const stepItem = $createStepItemNode(1); // $renumberStepsで即座に再設定

  const titleNode = $createStepTitleNode();
  const titleParagraph = $createParagraphNode();
  titleNode.append(titleParagraph);

  const contentNode = $createStepContentNode();
  const contentParagraph = $createParagraphNode();
  contentNode.append(contentParagraph);

  stepItem.append(titleNode);
  stepItem.append(contentNode);
  container.append(stepItem);
  $renumberSteps(container);
  return stepItem;
}

/**
 * 0-based indexでステップを削除。最小1つ保証
 */
export function $removeStep(
  container: StepsContainerNode,
  index: number,
): boolean {
  const items = container.getChildren().filter($isStepItemNode);
  if (items.length <= 1) return false;
  const target = items[index];
  if (!target) return false;
  target.remove();
  $renumberSteps(container);
  return true;
}

export function $reorderStep(
  container: StepsContainerNode,
  fromIndex: number,
  toIndex: number,
): void {
  if (fromIndex === toIndex) return;
  const items = container.getChildren().filter($isStepItemNode);
  const movedItem = items[fromIndex];
  const targetItem = items[toIndex];
  if (!movedItem || !targetItem) return;

  if (fromIndex < toIndex) {
    targetItem.insertAfter(movedItem);
  } else {
    targetItem.insertBefore(movedItem);
  }
  $renumberSteps(container);
}

// =============================================================================
// Types
// =============================================================================

type StepsPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Style-dependent option visibility helpers
// =============================================================================

function showShape(style: StepsStyle): boolean {
  return style === "numbered" || style === "small";
}

function showLabel(style: StepsStyle): boolean {
  return style === "big" || style === "numbered";
}

function showFill(style: StepsStyle): boolean {
  return style === "small";
}

function showStartNumber(style: StepsStyle): boolean {
  return style === "numbered" || style === "big" || style === "small";
}

// =============================================================================
// Component
// =============================================================================

export function StepsPlugin({ isOpen, onClose }: StepsPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [selectedStyle, setSelectedStyle] = useState<StepsStyle>("numbered");
  const [stepsLabel, setStepsLabel] = useState("STEP");
  const [shape, setShape] = useState<StepsShape>("circle");
  const [fill, setFill] = useState<StepsFill>("filled");
  const [startNum, setStartNum] = useState(1);

  // リスナー登録（mergeRegisterで統一）
  useEffect(() => {
    return mergeRegister(
      // 矢印キーリスナー
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape("up"),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape("down"),
        COMMAND_PRIORITY_LOW,
      ),
      // 構造検証トランスフォーマー: StepsContainer
      editor.registerNodeTransform(StepsContainerNode, (node) => {
        const children = node.getChildren();
        // StepItemNode以外の子は除去
        for (const child of children) {
          if (!(child instanceof StepItemNode)) {
            child.remove();
          }
        }
        // 少なくとも1つのStepItemが必要
        if (node.getChildren().length === 0) {
          const stepItem = $createStepItemNode(1);
          const titleNode = $createStepTitleNode();
          const titleParagraph = $createParagraphNode();
          titleNode.append(titleParagraph);

          const contentNode = $createStepContentNode();
          const contentParagraph = $createParagraphNode();
          contentNode.append(contentParagraph);

          stepItem.append(titleNode);
          stepItem.append(contentNode);
          node.append(stepItem);
        }
      }),
      // StepItemNodeの構造検証
      editor.registerNodeTransform(StepItemNode, (node) => {
        const children = node.getChildren();
        const hasTitle = children.some(
          (child) => child instanceof StepTitleNode,
        );
        const hasContent = children.some(
          (child) => child instanceof StepContentNode,
        );

        if (!hasTitle) {
          const titleNode = $createStepTitleNode();
          const paragraph = $createParagraphNode();
          titleNode.append(paragraph);
          node.append(titleNode);
        }
        if (!hasContent) {
          const contentNode = $createStepContentNode();
          const paragraph = $createParagraphNode();
          contentNode.append(paragraph);
          node.append(contentNode);
        }
      }),
      // StepTitleNodeの構造検証
      editor.registerNodeTransform(StepTitleNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode();
          node.append(paragraph);
        }
      }),
      // StepContentNodeの構造検証
      editor.registerNodeTransform(StepContentNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode();
          node.append(paragraph);
        }
      }),
    );
  }, [editor]);

  const resetForm = () => {
    setSelectedStyle("numbered");
    setStepsLabel("STEP");
    setShape("circle");
    setFill("filled");
    setStartNum(1);
  };

  const handleInsert = () => {
    editor.update(() => {
      const stepsContainer = $createStepsContainerNode({
        style: selectedStyle,
        label: stepsLabel,
        shape,
        startNumber: startNum,
        fill,
      });

      for (let i = 0; i < DEFAULT_STEP_COUNT; i++) {
        const num = startNum + i;
        const stepItem = $createStepItemNode(num);

        // タイトル（CSSプレースホルダー表示）
        const titleNode = $createStepTitleNode();
        const titleParagraph = $createParagraphNode();
        titleNode.append(titleParagraph);

        // コンテンツ（CSSプレースホルダー表示）
        const contentNode = $createStepContentNode();
        const contentParagraph = $createParagraphNode();
        contentNode.append(contentParagraph);

        stepItem.append(titleNode);
        stepItem.append(contentNode);
        stepsContainer.append(stepItem);
      }

      $insertNodeToNearestRoot(stepsContainer);

      // 最初のステップのタイトルを選択
      const firstItem = stepsContainer.getChildAtIndex(0);
      if (firstItem instanceof StepItemNode) {
        const titleNode = firstItem.getChildren().find($isStepTitleNode);
        if (titleNode) {
          const paragraph = titleNode.getChildAtIndex(0);
          if (paragraph) {
            paragraph.selectEnd();
          }
        }
      }
    });

    resetForm();
    onClose();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>ステップを挿入</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {/* スタイル選択 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">スタイル</Label>
            <Select
              value={selectedStyle}
              onValueChange={(v) => {
                if (isStepsStyle(v)) setSelectedStyle(v);
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STEPS_STYLES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STEPS_STYLE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* スタイル依存オプション */}
          {showLabel(selectedStyle) && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">ラベルテキスト</Label>
              <Input
                value={stepsLabel}
                onChange={(e) => setStepsLabel(e.target.value)}
                placeholder="STEP"
                className="h-8 text-sm"
              />
            </div>
          )}

          {showShape(selectedStyle) && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">バッジ形状</Label>
              <Select
                value={shape}
                onValueChange={(v) => {
                  if (isStepsShape(v)) setShape(v);
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEPS_SHAPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STEPS_SHAPE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showFill(selectedStyle) && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">塗りつぶし</Label>
              <Select
                value={fill}
                onValueChange={(v) => {
                  if (isStepsFill(v)) setFill(v);
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEPS_FILLS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STEPS_FILL_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showStartNumber(selectedStyle) && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">開始番号</Label>
              <Input
                type="number"
                value={startNum}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isFinite(v) && v >= 1) setStartNum(v);
                }}
                min={1}
                className="h-8 text-sm w-20"
              />
            </div>
          )}

          {/* プレビュー — 実際の data 属性 HTML + lexical-content.css でレンダリング */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-2">プレビュー</div>
            <div
              data-steps="true"
              data-steps-style={selectedStyle}
              data-steps-label={stepsLabel}
              data-steps-shape={shape}
              data-steps-start={String(startNum)}
              data-steps-fill={fill}
              ref={(el) =>
                el?.style.setProperty("--step-label", `"${stepsLabel}"`)
              }
            >
              {[0, 1].map((i) => (
                <div key={i} data-step={String(startNum + i)}>
                  <h4 data-step-title="true">ステップ {startNum + i}</h4>
                  <div data-step-content="true">説明文</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleInsert}>
            挿入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
