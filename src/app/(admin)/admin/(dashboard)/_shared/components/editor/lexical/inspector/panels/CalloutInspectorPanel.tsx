/**
 * Callout Inspector Panel
 *
 * @description CalloutNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isCalloutNode,
  type CalloutNode,
  CALLOUT_TYPES,
  calloutTypeState,
  isCalloutType,
} from "../../nodes/CalloutNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Label } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { CALLOUT_TYPE_LABELS } from "../../config/node-labels";

// =============================================================================
// Types
// =============================================================================

type CalloutInspectorPanelProps = {
  nodeKey: string;
  node: CalloutNode;
};

// =============================================================================
// Component
// =============================================================================

export function CalloutInspectorPanel({
  nodeKey,
  node,
}: CalloutInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isCalloutNode);

  const calloutType = editor.read(() => $getState(node, calloutTypeState));

  const handleTypeChange = (value: string) => {
    if (isCalloutType(value)) {
      updateNode((n) => {
        $setState(n, calloutTypeState, value);
      });
    }
  };

  return (
    <div>
      <InspectorHeader title="コールアウト" />

      <InspectorSection title="スタイル">
        <div className="space-y-2">
          <Label className="text-xs">種類</Label>
          <Select value={calloutType} onValueChange={handleTypeChange}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALLOUT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {CALLOUT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </InspectorSection>
    </div>
  );
}
