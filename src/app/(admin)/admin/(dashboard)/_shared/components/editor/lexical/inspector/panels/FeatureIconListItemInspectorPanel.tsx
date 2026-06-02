/**
 * FeatureIconListItem Inspector Panel
 *
 * @description FeatureIconItemNode のプロパティ編集パネル。
 * Tabler Icons の curation list から IconPickerField で選択する。
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isFeatureIconItemNode,
  type FeatureIconItemNode,
  featureIconItemNameState,
} from "../../nodes/FeatureIconListNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Label } from "@/admin/components/ui";
import { IconPickerField } from "@/admin/components/icon-picker/IconPickerField";

type FeatureIconListItemInspectorPanelProps = {
  nodeKey: string;
  node: FeatureIconItemNode;
};

export function FeatureIconListItemInspectorPanel({
  nodeKey,
  node,
}: FeatureIconListItemInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isFeatureIconItemNode);

  const iconName = editor.read(() => $getState(node, featureIconItemNameState));

  const handleIconNameChange = (value: string) => {
    updateNode((n) => {
      $setState(n, featureIconItemNameState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="特徴アイコンアイテム" />

      <InspectorSection title="アイコン">
        <div className="space-y-2">
          <Label className="text-xs">アイコン</Label>
          <IconPickerField value={iconName} onChange={handleIconNameChange} />
        </div>
      </InspectorSection>
    </div>
  );
}
