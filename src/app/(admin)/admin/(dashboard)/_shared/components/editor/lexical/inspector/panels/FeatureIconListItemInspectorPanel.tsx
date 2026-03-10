/**
 * FeatureIconListItem Inspector Panel
 *
 * @description FeatureIconItemNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isFeatureIconItemNode,
  type FeatureIconItemNode,
  type IconLibrary,
  ICON_LIBRARIES,
  featureIconItemNameState,
  featureIconItemLibraryState,
} from "../../nodes/FeatureIconListNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label } from "@/admin/components/ui";
import { RadioGroup, RadioGroupItem } from "@/admin/components/ui/radio-group";

// =============================================================================
// Constants
// =============================================================================

const LIBRARY_LABELS: Record<IconLibrary, string> = {
  lucide: "Lucide",
  "simple-icons": "Simple Icons",
};

// =============================================================================
// Types
// =============================================================================

type FeatureIconListItemInspectorPanelProps = {
  nodeKey: string;
  node: FeatureIconItemNode;
};

// =============================================================================
// Component
// =============================================================================

export function FeatureIconListItemInspectorPanel({
  nodeKey,
  node,
}: FeatureIconListItemInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isFeatureIconItemNode);

  const { iconName, iconLibrary } = editor.getEditorState().read(() => ({
    iconName: $getState(node, featureIconItemNameState),
    iconLibrary: $getState(node, featureIconItemLibraryState),
  }));

  const handleIconNameChange = (value: string) => {
    updateNode((n) => {
      $setState(n, featureIconItemNameState, value);
    });
  };

  const handleIconLibraryChange = (value: string) => {
    if (value === "lucide" || value === "simple-icons") {
      updateNode((n) => {
        $setState(n, featureIconItemLibraryState, value);
      });
    }
  };

  return (
    <div>
      <InspectorHeader title="特徴アイコンアイテム" />

      <InspectorSection title="アイコン設定">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">アイコンライブラリ</Label>
            <RadioGroup
              value={iconLibrary}
              onValueChange={handleIconLibraryChange}
              className="flex gap-3"
            >
              {ICON_LIBRARIES.map((lib) => (
                <div key={lib} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={lib}
                    id={`inspector-feature-icon-library-${lib}`}
                  />
                  <Label
                    htmlFor={`inspector-feature-icon-library-${lib}`}
                    className="text-xs font-normal cursor-pointer"
                  >
                    {LIBRARY_LABELS[lib]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">アイコン名</Label>
            <Input
              value={iconName}
              onChange={(e) => handleIconNameChange(e.target.value)}
              placeholder="Wifi"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  );
}
