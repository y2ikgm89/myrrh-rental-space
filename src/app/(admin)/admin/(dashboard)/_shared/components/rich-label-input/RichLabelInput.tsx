"use client";

/**
 * RichLabelInput — token 配列ベースのボタンラベルエディタ
 *
 * 業界 reference: Sanity Portable Text の token data model + JVM Rich Text Icons の
 * ツールバーピッカー UX。
 *
 * 機能:
 * - contenteditable に text segment + icon chip を inline 配置
 * - ツールバー「アイコン挿入」ボタン → IconPickerDialog → カーソル位置に icon token 挿入
 * - icon chip クリックで削除（差し替えは削除→再挿入）
 * - input イベントで serialize → onChange(tokens)
 *
 * a11y:
 * - role="textbox" + aria-multiline="false" + aria-label
 * - icon chip は role="img" + aria-label
 * - ツールバーボタン min-h-11 min-w-11 (WCAG 2.5.5 Enhanced)
 */

import { useEffect, useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { IconPickerDialog } from "@/admin/components/icon-picker/IconPickerDialog";
import {
  ICON_CHIP_CLASS_NAME,
  ICON_DATA_ATTR,
  KEY_DATA_ATTR,
  applyTokens,
  serializeNodes,
} from "./serialize-tokens";
import {
  createIconToken,
  type ButtonLabelToken,
} from "@/shared/lib/sections/definitions/_shared/button-label";

interface RichLabelInputProps {
  readonly value: ButtonLabelToken[];
  readonly onChange: (tokens: ButtonLabelToken[]) => void;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-label"?: string;
}

export function RichLabelInput({
  value,
  onChange,
  disabled = false,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel = "ボタンラベル",
}: RichLabelInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const lastValueRef = useRef<ButtonLabelToken[]>(value);

  // value prop → DOM 同期（外部更新時のみ。内部編集は serialize 経由で onChange）
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    if (lastValueRef.current === value) return;
    applyTokens(root, value, document);
    lastValueRef.current = value;
  }, [value]);

  const handleInput = () => {
    const root = editorRef.current;
    if (!root) return;
    const tokens = serializeNodes(root);
    lastValueRef.current = tokens;
    onChange(tokens);
  };

  const insertIconAtCaret = (iconName: string) => {
    const root = editorRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
      // selection なし or editor 外 → 末尾に追加して onChange
      const next: ButtonLabelToken[] = [...value, createIconToken(iconName)];
      onChange(next);
      return;
    }
    const range = sel.getRangeAt(0);
    const newToken = createIconToken(iconName);
    const span = document.createElement("span");
    span.setAttribute(ICON_DATA_ATTR, newToken.name);
    span.setAttribute(KEY_DATA_ATTR, newToken._key);
    span.setAttribute("contenteditable", "false");
    span.setAttribute("role", "img");
    span.setAttribute("aria-label", newToken.name);
    span.className = ICON_CHIP_CLASS_NAME;
    span.textContent = newToken.name;
    range.deleteContents();
    range.insertNode(span);
    // caret を span 直後へ
    range.setStartAfter(span);
    range.setEndAfter(span);
    sel.removeAllRanges();
    sel.addRange(range);
    handleInput();
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const iconSpan = target.closest(`[${ICON_DATA_ATTR}]`);
    if (!iconSpan || !editorRef.current?.contains(iconSpan)) return;
    iconSpan.parentNode?.removeChild(iconSpan);
    handleInput();
  };

  return (
    <div className="space-y-2">
      <div
        ref={editorRef}
        id={id}
        role="textbox"
        contentEditable={!disabled}
        suppressContentEditableWarning
        aria-multiline="false"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-disabled={disabled}
        onInput={handleInput}
        onClick={handleEditorClick}
        className="min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-primary"
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIconDialogOpen(true)}
          disabled={disabled}
          aria-label="アイコンを挿入"
        >
          <IconPlus className="mr-1 h-4 w-4" aria-hidden="true" />
          アイコン挿入
        </Button>
        <span className="text-xs text-muted-foreground">
          カーソル位置にアイコンを挿入できます
        </span>
      </div>
      <IconPickerDialog
        open={iconDialogOpen}
        onOpenChange={setIconDialogOpen}
        value=""
        onConfirm={(name) => {
          if (name) insertIconAtCaret(name);
        }}
      />
    </div>
  );
}
