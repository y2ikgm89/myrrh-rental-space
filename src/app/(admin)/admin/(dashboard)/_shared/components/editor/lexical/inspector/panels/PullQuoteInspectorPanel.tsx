/**
 * PullQuote Inspector Panel
 *
 * @description PullQuoteNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isPullQuoteNode,
  type PullQuoteNode,
  PULL_QUOTE_STYLES,
  isPullQuoteStyle,
  quoteStyleState,
  pullQuoteColorState,
  $pullQuoteHasCitation,
  $addPullQuoteCitation,
  $removePullQuoteCitation,
} from "../../nodes/PullQuoteNode";
import { type AccentColor } from "../../config/accent-colors";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
import { Label, Switch } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { PULL_QUOTE_STYLE_LABELS } from "../../config/node-labels";

type PullQuoteInspectorPanelProps = {
  nodeKey: string;
  node: PullQuoteNode;
};

export function PullQuoteInspectorPanel({
  nodeKey,
  node,
}: PullQuoteInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isPullQuoteNode);

  const { quoteStyle, quoteColor, hasCitation } = editor.read(() => ({
    quoteStyle: $getState(node, quoteStyleState),
    quoteColor: $getState(node, pullQuoteColorState),
    hasCitation: $pullQuoteHasCitation(node),
  }));

  const handleStyleChange = (value: string) => {
    if (isPullQuoteStyle(value)) {
      updateNode((n) => {
        $setState(n, quoteStyleState, value);
      });
    }
  };

  const handleColorChange = (color: AccentColor) => {
    updateNode((n) => {
      $setState(n, pullQuoteColorState, color);
    });
  };

  const handleCitationToggle = (checked: boolean) => {
    updateNode((n) => {
      if (checked) $addPullQuoteCitation(n);
      else $removePullQuoteCitation(n);
    });
  };

  return (
    <div>
      <InspectorHeader title="プルクォート" />

      <InspectorFields title="スタイル">
        <div className="space-y-2">
          <Label className="text-xs">表示スタイル</Label>
          <Select value={quoteStyle} onValueChange={handleStyleChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PULL_QUOTE_STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {PULL_QUOTE_STYLE_LABELS[style]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ColorSwatchPicker
          value={quoteColor}
          onChange={handleColorChange}
          label="アクセントカラー"
        />
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="inspector-pull-quote-citation" className="text-xs">
            引用元（出典）を表示
          </Label>
          <Switch
            id="inspector-pull-quote-citation"
            checked={hasCitation}
            onCheckedChange={handleCitationToggle}
          />
        </div>
      </InspectorFields>
    </div>
  );
}
