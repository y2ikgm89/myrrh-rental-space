/**
 * Steps Inspector Panel
 *
 * @description StepsContainerNodeのプロパティ編集パネル
 */

"use client";

import { $getNodeByKey, $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  SortableInspectorList,
  type SortableInspectorItem,
} from "../SortableInspectorList";
import {
  $isStepsContainerNode,
  type StepsContainerNode,
  STEPS_STYLES,
  STEPS_SHAPES,
  STEPS_FILLS,
  isStepsStyle,
  isStepsShape,
  isStepsFill,
  stepsStyleState,
  stepsLabelState,
  stepsShapeState,
  startNumberState,
  stepsFillState,
  stepsColorState,
} from "../../nodes/StepsContainerNode";
import { type AccentColor } from "../../config/accent-colors";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
import { $isStepItemNode } from "../../nodes/StepItemNode";
import { $isStepTitleNode } from "../../nodes/StepTitleNode";
import {
  $addStep,
  $removeStep,
  $renumberSteps,
  $reorderStep,
} from "../../plugins/StepsPlugin";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label } from "@/admin/components/ui";
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
} from "../../config/node-labels";

const MAX_STEPS = 10;
const MIN_STEPS = 1;

type StepItemInfo = {
  key: string;
  titleText: string;
};

type StepsInspectorPanelProps = {
  nodeKey: string;
  node: StepsContainerNode;
};

export function StepsInspectorPanel({
  nodeKey,
  node,
}: StepsInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isStepsContainerNode);

  const {
    stepsStyle,
    stepsLabel,
    stepsShape,
    startNumber,
    stepsFill,
    stepsColor,
    stepItems,
  } = editor.read(() => {
    const style = $getState(node, stepsStyleState);
    const label = $getState(node, stepsLabelState);
    const shape = $getState(node, stepsShapeState);
    const start = $getState(node, startNumberState);
    const fill = $getState(node, stepsFillState);
    const color = $getState(node, stepsColorState);
    const items: StepItemInfo[] = [];
    const children = node.getChildren();
    for (const child of children) {
      if ($isStepItemNode(child)) {
        const titleNode = child.getChildren().find($isStepTitleNode);
        items.push({
          key: child.getKey(),
          titleText: titleNode ? titleNode.getTextContent() : "",
        });
      }
    }
    return {
      stepsStyle: style,
      stepsLabel: label,
      stepsShape: shape,
      startNumber: start,
      stepsFill: fill,
      stepsColor: color,
      stepItems: items,
    };
  });

  const canRemove = stepItems.length > MIN_STEPS;
  const canAdd = stepItems.length < MAX_STEPS;

  // Style-dependent visibility
  const showShape = stepsStyle === "numbered" || stepsStyle === "small";
  const showLabel = stepsStyle === "big" || stepsStyle === "numbered";
  const showFill = stepsStyle === "small";
  const showStartNumber =
    stepsStyle === "numbered" || stepsStyle === "big" || stepsStyle === "small";

  const handleStyleChange = (value: string) => {
    if (isStepsStyle(value)) {
      updateNode((n) => {
        $setState(n, stepsStyleState, value);
      });
    }
  };

  const handleLabelChange = (value: string) => {
    updateNode((n) => {
      $setState(n, stepsLabelState, value);
    });
  };

  const handleShapeChange = (value: string) => {
    if (isStepsShape(value)) {
      updateNode((n) => {
        $setState(n, stepsShapeState, value);
      });
    }
  };

  const handleFillChange = (value: string) => {
    if (isStepsFill(value)) {
      updateNode((n) => {
        $setState(n, stepsFillState, value);
      });
    }
  };

  const handleColorChange = (color: AccentColor) => {
    updateNode((n) => {
      $setState(n, stepsColorState, color);
    });
  };

  const handleStartNumberChange = (value: number) => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey);
      if (!$isStepsContainerNode(container)) return;
      $setState(container, startNumberState, value);
      $renumberSteps(container);
    });
  };

  const handleAddStep = () => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey);
      if (!$isStepsContainerNode(container)) return;
      const stepItem = $addStep(container);
      const titleNode = stepItem.getChildren().find($isStepTitleNode);
      if (titleNode) {
        const paragraph = titleNode.getChildAtIndex(0);
        if (paragraph) {
          paragraph.selectEnd();
        }
      }
    });
  };

  const handleRemoveStep = (id: string) => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey);
      if (!$isStepsContainerNode(container)) return;
      const items = container.getChildren().filter($isStepItemNode);
      const index = items.findIndex((item) => item.getKey() === id);
      if (index !== -1) $removeStep(container, index);
    });
  };

  const handleReorderStep = (fromIndex: number, toIndex: number) => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey);
      if (!$isStepsContainerNode(container)) return;
      $reorderStep(container, fromIndex, toIndex);
    });
  };

  const sortableItems: SortableInspectorItem[] = stepItems.map((item) => ({
    id: item.key,
    label: item.titleText,
  }));

  return (
    <div>
      <InspectorHeader title="ステップ" />

      <InspectorFields title="スタイル">
        <div className="space-y-2">
          <Label className="text-xs">表示スタイル</Label>
          <Select value={stepsStyle} onValueChange={handleStyleChange}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STEPS_STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {STEPS_STYLE_LABELS[style]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showLabel && (
          <div className="space-y-2">
            <Label className="text-xs">ラベルテキスト</Label>
            <Input
              value={stepsLabel}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="STEP"
              className="text-sm"
            />
          </div>
        )}

        {showShape && (
          <div className="space-y-2">
            <Label className="text-xs">バッジ形状</Label>
            <Select value={stepsShape} onValueChange={handleShapeChange}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STEPS_SHAPES.map((shape) => (
                  <SelectItem key={shape} value={shape}>
                    {STEPS_SHAPE_LABELS[shape]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showFill && (
          <div className="space-y-2">
            <Label className="text-xs">塗りつぶし</Label>
            <Select value={stepsFill} onValueChange={handleFillChange}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STEPS_FILLS.map((fill) => (
                  <SelectItem key={fill} value={fill}>
                    {STEPS_FILL_LABELS[fill]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showStartNumber && (
          <div className="space-y-2">
            <Label className="text-xs">開始番号</Label>
            <Input
              type="number"
              value={startNumber}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v >= 1) handleStartNumberChange(v);
              }}
              min={1}
              className="text-sm w-20"
            />
          </div>
        )}

        <ColorSwatchPicker
          value={stepsColor}
          onChange={handleColorChange}
          label="アクセントカラー"
        />
      </InspectorFields>

      <InspectorSection title={`アイテム (${stepItems.length})`}>
        <SortableInspectorList
          items={sortableItems}
          onReorder={handleReorderStep}
          onRemove={handleRemoveStep}
          onAdd={handleAddStep}
          canAdd={canAdd}
          canRemove={canRemove}
          addLabel="ステップを追加"
          maxMessage="最大10ステップまでです"
          minMessage="最低1つのステップが必要です"
        />
      </InspectorSection>
    </div>
  );
}
