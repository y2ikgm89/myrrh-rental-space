/**
 * Collapsible Inspector Panel
 *
 * @description CollapsibleContainerNodeのプロパティ編集パネル
 * 3-tier構造: Container → Item → Title + Content
 */

"use client";

import { $getNodeByKey, $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  SortableInspectorList,
  type SortableInspectorItem,
} from "../SortableInspectorList";
import {
  $isCollapsibleContainerNode,
  type CollapsibleContainerNode,
  COLLAPSIBLE_STYLES,
  collapsibleStyleState,
  collapsibleColorState,
  isCollapsibleStyle,
} from "../../nodes/CollapsibleContainerNode";
import { type AccentColor } from "../../config/accent-colors";
import { $isCollapsibleItemNode } from "../../nodes/CollapsibleItemNode";
import { $isCollapsibleTitleNode } from "../../nodes/CollapsibleTitleNode";
import {
  $addCollapsibleItem,
  $removeCollapsibleItem,
  $reorderCollapsibleItem,
} from "../../plugins/CollapsiblePlugin";
import { COLLAPSIBLE_STYLE_LABELS } from "../../config/node-labels";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Label } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";

const MAX_ITEMS = 10;
const MIN_ITEMS = 1;

type CollapsibleItemInfo = {
  key: string;
  titleText: string;
};

type CollapsibleInspectorPanelProps = {
  nodeKey: string;
  node: CollapsibleContainerNode;
};

export function CollapsibleInspectorPanel({
  nodeKey,
  node,
}: CollapsibleInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isCollapsibleContainerNode);

  const { currentStyle, currentColor, collapsibleItems } = editor
    .getEditorState()
    .read(() => {
      const style = $getState(node, collapsibleStyleState);
      const color = $getState(node, collapsibleColorState);
      const items: CollapsibleItemInfo[] = [];
      const children = node.getChildren();

      for (const child of children) {
        if ($isCollapsibleItemNode(child)) {
          const titleNode = child.getChildren().find($isCollapsibleTitleNode);
          items.push({
            key: child.getKey(),
            titleText: titleNode ? titleNode.getTextContent() : "",
          });
        }
      }

      return {
        currentStyle: style,
        currentColor: color,
        collapsibleItems: items,
      };
    });

  const canRemove = collapsibleItems.length > MIN_ITEMS;
  const canAdd = collapsibleItems.length < MAX_ITEMS;

  const handleStyleChange = (value: string) => {
    if (isCollapsibleStyle(value)) {
      updateNode((n) => {
        $setState(n, collapsibleStyleState, value);
      });
    }
  };

  const handleColorChange = (color: AccentColor) => {
    updateNode((n) => {
      $setState(n, collapsibleColorState, color);
    });
  };

  const handleAddCollapsible = () => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey);
      if (!$isCollapsibleContainerNode(container)) return;
      $addCollapsibleItem(container);
    });
  };

  const handleRemoveCollapsible = (id: string) => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey);
      if (!$isCollapsibleContainerNode(container)) return;
      const items = container.getChildren().filter($isCollapsibleItemNode);
      const index = items.findIndex((item) => item.getKey() === id);
      if (index !== -1) $removeCollapsibleItem(container, index);
    });
  };

  const handleReorderCollapsible = (fromIndex: number, toIndex: number) => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey);
      if (!$isCollapsibleContainerNode(container)) return;
      $reorderCollapsibleItem(container, fromIndex, toIndex);
    });
  };

  const sortableItems: SortableInspectorItem[] = collapsibleItems.map(
    (item) => ({
      id: item.key,
      label: item.titleText,
    }),
  );

  return (
    <div>
      <InspectorHeader title="折りたたみ" />

      <InspectorSection title="スタイル">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">種類</Label>
            <Select value={currentStyle} onValueChange={handleStyleChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLAPSIBLE_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {COLLAPSIBLE_STYLE_LABELS[style]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ColorSwatchPicker
            value={currentColor}
            onChange={handleColorChange}
            label="アクセントカラー"
          />
        </div>
      </InspectorSection>

      <InspectorSection title={`アイテム (${collapsibleItems.length})`}>
        <SortableInspectorList
          items={sortableItems}
          onReorder={handleReorderCollapsible}
          onRemove={handleRemoveCollapsible}
          onAdd={handleAddCollapsible}
          canAdd={canAdd}
          canRemove={canRemove}
          addLabel="折りたたみを追加"
          maxMessage="最大10個までです"
          minMessage="最低1つの折りたたみが必要です"
        />
      </InspectorSection>
    </div>
  );
}
