/**
 * Button Plugin
 *
 * @description ボタン/CTAの挿入を提供するプラグイン
 *
 * Phase 5 (rich label tokens) 対応版:
 * - label は PortableTextSpan[] (PortableTextInlineEditor)
 * - variant: primary / secondary / ghost / link / editorial (5 種、公開 Button Primitive と一致)
 * - AccentColor (10色) で bronze 以外の accent 指定可能
 * - WCAG 2.5.5 Enhanced (44px 以上) は lexical-content.css で保証
 */

"use client";

import { useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createButtonNode,
  isButtonVariant,
  isButtonSize,
  isButtonAlignment,
  type ButtonVariant,
  type ButtonSize,
  type ButtonAlignment,
  BUTTON_VARIANTS,
  BUTTON_SIZES,
  BUTTON_ALIGNMENTS,
} from "../nodes/ButtonNode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Switch,
} from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { PortableTextInlineEditor } from "@/admin/components/portable-text/inline-editor/PortableTextInlineEditor";
import { ColorSwatchPicker } from "../inspector/ColorSwatchPicker";
import {
  createSpan,
  spansToPlainText,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";
import { type AccentColor } from "../config/accent-colors";
import {
  BUTTON_VARIANT_LABELS,
  BUTTON_SIZE_LABELS,
  BUTTON_ALIGNMENT_LABELS,
} from "../config/node-labels";

// =============================================================================
// Types
// =============================================================================

type ButtonPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

function createDefaultLabel(): PortableTextSpan[] {
  return [createSpan("ボタン")];
}

// =============================================================================
// Component
// =============================================================================

export function ButtonPlugin({ isOpen, onClose }: ButtonPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [label, setLabel] = useState<PortableTextSpan[]>(() =>
    createDefaultLabel(),
  );
  const [href, setHref] = useState("");
  const [variant, setVariant] = useState<ButtonVariant>("editorial");
  const [size, setSize] = useState<ButtonSize>("md");
  const [alignment, setAlignment] = useState<ButtonAlignment>("center");
  const [color, setColor] = useState<AccentColor>("default");
  const [openInNewTab, setOpenInNewTab] = useState(false);

  const resetForm = () => {
    setLabel(createDefaultLabel());
    setHref("");
    setVariant("editorial");
    setSize("md");
    setAlignment("center");
    setColor("default");
    setOpenInNewTab(false);
  };

  const handleInsert = () => {
    if (!isValid) return;

    editor.update(() => {
      const buttonNode = $createButtonNode({
        label,
        href: href.trim(),
        variant,
        size,
        alignment,
        color,
        openInNewTab,
      });
      $insertNodeToNearestRoot(buttonNode);
    });

    resetForm();
    onClose();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isValid =
    spansToPlainText(label).trim().length > 0 && href.trim() !== "";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>ボタンを挿入</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* ラベル (rich label tokens) */}
          <div className="space-y-2">
            <Label htmlFor="button-label">ボタンテキスト</Label>
            <PortableTextInlineEditor
              id="button-label"
              value={label}
              onChange={setLabel}
              aria-label="ボタンテキスト（テキスト + アイコン混在可）"
            />
            <p className="text-xs text-muted-foreground">
              テキストにアイコンを混在できます。アイコンは「アイコン挿入」ボタンから追加してください。
            </p>
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="button-href">リンク先URL</Label>
            <Input
              id="button-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://example.com"
              type="url"
            />
          </div>

          {/* スタイル */}
          <div className="space-y-2">
            <Label>スタイル</Label>
            <Select
              value={variant}
              onValueChange={(value) => {
                if (isButtonVariant(value)) setVariant(value);
              }}
            >
              <SelectTrigger>
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

          {/* サイズ */}
          <div className="space-y-2">
            <Label>サイズ</Label>
            <Select
              value={size}
              onValueChange={(value) => {
                if (isButtonSize(value)) setSize(value);
              }}
            >
              <SelectTrigger>
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

          {/* 配置 */}
          <div className="space-y-2">
            <Label>配置</Label>
            <Select
              value={alignment}
              onValueChange={(value) => {
                if (isButtonAlignment(value)) setAlignment(value);
              }}
            >
              <SelectTrigger>
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

          {/* AccentColor */}
          <div className="space-y-2">
            <Label>アクセントカラー</Label>
            <ColorSwatchPicker value={color} onChange={setColor} />
          </div>

          {/* 新しいタブで開く */}
          <div className="flex items-center justify-between">
            <Label htmlFor="button-new-tab" className="cursor-pointer">
              新しいタブで開く
            </Label>
            <Switch
              id="button-new-tab"
              checked={openInNewTab}
              onCheckedChange={setOpenInNewTab}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleInsert} disabled={!isValid}>
            挿入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
