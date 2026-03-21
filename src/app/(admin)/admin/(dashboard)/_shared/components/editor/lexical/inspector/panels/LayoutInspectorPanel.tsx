/**
 * Layout Inspector Panel
 *
 * @description LayoutContainerNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isLayoutContainerNode,
  type LayoutContainerNode,
  templateColumnsNarrowState,
  templateColumnsState,
} from "../../nodes/LayoutContainerNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Label } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import {
  LAYOUT_BREAKPOINT_MAX_PX,
  LAYOUT_NARROW_TEMPLATES,
  LAYOUT_TEMPLATES,
} from "../../config/layout-templates";

type LayoutInspectorPanelProps = {
  nodeKey: string;
  node: LayoutContainerNode;
};

export function LayoutInspectorPanel({
  nodeKey,
  node,
}: LayoutInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isLayoutContainerNode);

  const { templateColumns, templateColumnsNarrow } = editor
    .getEditorState()
    .read(() => ({
      templateColumns: $getState(node, templateColumnsState),
      templateColumnsNarrow: $getState(node, templateColumnsNarrowState),
    }));

  const handleWideChange = (value: string) => {
    updateNode((n) => {
      $setState(n, templateColumnsState, value);
    });
  };

  const handleNarrowChange = (value: string) => {
    updateNode((n) => {
      $setState(n, templateColumnsNarrowState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="カラムレイアウト" />

      <InspectorFields title="レイアウト">
        <div className="space-y-2">
          <Label className="text-xs">広い画面の列</Label>
          <Select value={templateColumns} onValueChange={handleWideChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_TEMPLATES.map((template) => (
                <SelectItem
                  key={template.value}
                  value={template.value}
                  title={template.description}
                  textValue={template.label}
                >
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground font-mono text-xs">
            {templateColumns}
          </p>
          <p className="text-muted-foreground text-xs leading-snug">
            列を減らすと、右端の列の内容はその左隣の列（新しい最終列）にまとまります。
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">
            狭い画面の列（〜{LAYOUT_BREAKPOINT_MAX_PX}px）
          </Label>
          <Select
            value={templateColumnsNarrow}
            onValueChange={handleNarrowChange}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_NARROW_TEMPLATES.map((template) => (
                <SelectItem
                  key={template.value}
                  value={template.value}
                  title={template.description}
                  textValue={template.label}
                >
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground font-mono text-xs">
            --lexical-layout-mobile: {templateColumnsNarrow}
          </p>
        </div>
      </InspectorFields>
    </div>
  );
}
