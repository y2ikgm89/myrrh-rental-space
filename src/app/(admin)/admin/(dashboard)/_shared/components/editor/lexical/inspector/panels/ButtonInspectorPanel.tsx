/**
 * Button Inspector Panel
 *
 * @description ButtonNodeのプロパティ編集パネル (Phase 5: rich label tokens 対応版)
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isButtonNode,
  type ButtonNode,
  BUTTON_VARIANTS,
  BUTTON_SIZES,
  BUTTON_ALIGNMENTS,
  isButtonVariant,
  isButtonSize,
  isButtonAlignment,
  buttonLabelState,
  buttonHrefState,
  buttonVariantState,
  buttonSizeState,
  buttonAlignmentState,
  buttonColorState,
  buttonOpenInNewTabState,
} from "../../nodes/ButtonNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label, Switch } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { PortableTextInlineEditor } from "@/admin/components/portable-text/inline-editor/PortableTextInlineEditor";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
import { type PortableTextSpan } from "@/shared/lib/portable-text";
import { type AccentColor } from "../../config/accent-colors";
import {
  BUTTON_VARIANT_LABELS,
  BUTTON_SIZE_LABELS,
  BUTTON_ALIGNMENT_LABELS,
} from "../../config/node-labels";

// =============================================================================
// Types
// =============================================================================

type ButtonInspectorPanelProps = {
  nodeKey: string;
  node: ButtonNode;
};

// =============================================================================
// Component
// =============================================================================

export function ButtonInspectorPanel({
  nodeKey,
  node,
}: ButtonInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isButtonNode);

  const { label, href, variant, size, alignment, color, openInNewTab } = editor
    .getEditorState()
    .read(() => ({
      label: $getState(node, buttonLabelState),
      href: $getState(node, buttonHrefState),
      variant: $getState(node, buttonVariantState),
      size: $getState(node, buttonSizeState),
      alignment: $getState(node, buttonAlignmentState),
      color: $getState(node, buttonColorState),
      openInNewTab: $getState(node, buttonOpenInNewTabState),
    }));

  const handleLabelChange = (value: PortableTextSpan[]) =>
    updateNode((n) => {
      $setState(n, buttonLabelState, value);
    });

  const handleHrefChange = (value: string) =>
    updateNode((n) => {
      $setState(n, buttonHrefState, value);
    });

  const handleVariantChange = (value: string) => {
    if (isButtonVariant(value)) {
      updateNode((n) => {
        $setState(n, buttonVariantState, value);
      });
    }
  };

  const handleSizeChange = (value: string) => {
    if (isButtonSize(value)) {
      updateNode((n) => {
        $setState(n, buttonSizeState, value);
      });
    }
  };

  const handleAlignmentChange = (value: string) => {
    if (isButtonAlignment(value)) {
      updateNode((n) => {
        $setState(n, buttonAlignmentState, value);
      });
    }
  };

  const handleColorChange = (value: AccentColor) =>
    updateNode((n) => {
      $setState(n, buttonColorState, value);
    });

  const handleOpenInNewTabChange = (value: boolean) =>
    updateNode((n) => {
      $setState(n, buttonOpenInNewTabState, value);
    });

  return (
    <div>
      <InspectorHeader title="ボタン" />

      <InspectorFields title="基本設定">
        <div className="space-y-2">
          <Label htmlFor="inspector-button-label" className="text-xs">
            テキスト
          </Label>
          <PortableTextInlineEditor
            id="inspector-button-label"
            value={label}
            onChange={handleLabelChange}
            aria-label="ボタンテキスト（テキスト + アイコン混在可）"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-button-href" className="text-xs">
            リンク先URL
          </Label>
          <Input
            id="inspector-button-href"
            value={href}
            onChange={(e) => handleHrefChange(e.target.value)}
            placeholder="https://example.com"
            className="h-8 text-sm"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label
            htmlFor="inspector-button-new-tab"
            className="text-xs cursor-pointer"
          >
            新しいタブで開く
          </Label>
          <Switch
            id="inspector-button-new-tab"
            checked={openInNewTab}
            onCheckedChange={handleOpenInNewTabChange}
          />
        </div>
      </InspectorFields>

      <InspectorFields title="スタイル">
        <div className="space-y-2">
          <Label className="text-xs">スタイル</Label>
          <Select value={variant} onValueChange={handleVariantChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUTTON_VARIANTS.map((v) => (
                <SelectItem key={v} value={v}>
                  {BUTTON_VARIANT_LABELS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">サイズ</Label>
          <Select value={size} onValueChange={handleSizeChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUTTON_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {BUTTON_SIZE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">配置</Label>
          <Select value={alignment} onValueChange={handleAlignmentChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUTTON_ALIGNMENTS.map((a) => (
                <SelectItem key={a} value={a}>
                  {BUTTON_ALIGNMENT_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">アクセントカラー</Label>
          <ColorSwatchPicker value={color} onChange={handleColorChange} />
        </div>
      </InspectorFields>
    </div>
  );
}
