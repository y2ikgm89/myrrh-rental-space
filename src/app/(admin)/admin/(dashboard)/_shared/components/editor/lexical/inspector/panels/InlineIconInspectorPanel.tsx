/**
 * Inline Icon Inspector Panel
 *
 * @description InlineIconNode のプロパティ編集パネル。
 * FeatureIconListItemInspectorPanel と同様に curated Tabler icon を
 * IconPickerField で選択・差し替えする。
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isInlineIconNode,
  type InlineIconNode,
  inlineIconNameState,
} from "../../nodes/InlineIconNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Label } from "@/admin/components/ui";
import { IconPickerField } from "@/admin/components/icon-picker/IconPickerField";

// =============================================================================
// Types
// =============================================================================

type InlineIconInspectorPanelProps = {
  nodeKey: string;
  node: InlineIconNode;
};

// =============================================================================
// Component
// =============================================================================

export function InlineIconInspectorPanel({
  nodeKey,
  node,
}: InlineIconInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isInlineIconNode);

  const iconName = editor.read(() => $getState(node, inlineIconNameState));

  const handleIconNameChange = (value: string) => {
    updateNode((n) => {
      $setState(n, inlineIconNameState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="インラインアイコン" />

      <InspectorSection title="アイコン">
        <div className="space-y-2">
          <Label className="text-xs">アイコン</Label>
          <IconPickerField value={iconName} onChange={handleIconNameChange} />
        </div>
      </InspectorSection>
    </div>
  );
}
