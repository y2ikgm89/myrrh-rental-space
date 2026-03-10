/**
 * Button Plugin
 *
 * @description ボタン/CTAの挿入を提供するプラグイン
 *
 * ダイアログでテキスト、URL、スタイルを設定し、Buttonノードを挿入
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

// =============================================================================
// Component
// =============================================================================

export function ButtonPlugin({ isOpen, onClose }: ButtonPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [text, setText] = useState("ボタン");
  const [href, setHref] = useState("");
  const [variant, setVariant] = useState<ButtonVariant>("primary");
  const [size, setSize] = useState<ButtonSize>("md");
  const [alignment, setAlignment] = useState<ButtonAlignment>("center");
  const [openInNewTab, setOpenInNewTab] = useState(false);

  const resetForm = () => {
    setText("ボタン");
    setHref("");
    setVariant("primary");
    setSize("md");
    setAlignment("center");
    setOpenInNewTab(false);
  };

  const handleInsert = () => {
    if (!text.trim() || !href.trim()) return;

    editor.update(() => {
      const buttonNode = $createButtonNode({
        text: text.trim(),
        href: href.trim(),
        variant,
        size,
        alignment,
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

  const isValid = text.trim() !== "" && href.trim() !== "";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>ボタンを挿入</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* テキスト */}
          <div className="space-y-2">
            <Label htmlFor="button-text">ボタンテキスト</Label>
            <Input
              id="button-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ボタンに表示するテキスト"
            />
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
