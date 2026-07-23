"use client";

/**
 * FaqItemTemplateSelect
 *
 * FAQ質問追加ダイアログの雛形選択UI。EmailTemplatesSection と同じ
 * グループ化 Select パターン（SelectGroup/SelectLabel）。選択結果を
 * onSelect で親に渡すだけの提示専用コンポーネント（自身は状態を持たない）。
 */

import { useId } from "react";
import {
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { Z_INDEX } from "@/admin/lib/styles/z-index";
import {
  FAQ_ITEM_TEMPLATE_GROUPS,
  FAQ_ITEM_TEMPLATES,
  resolveFaqItemTemplateById,
  type FaqItemTemplate,
} from "./faq-item-templates";

type FaqItemTemplateSelectProps = {
  readonly onSelect: (template: FaqItemTemplate) => void;
  readonly disabled?: boolean;
};

export function FaqItemTemplateSelect({
  onSelect,
  disabled,
}: FaqItemTemplateSelectProps) {
  const selectId = useId();

  const handleValueChange = (value: string) => {
    const template = resolveFaqItemTemplateById(value);
    if (template) {
      onSelect(template);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={selectId}>雛形から選ぶ（任意）</Label>
      <Select onValueChange={handleValueChange} disabled={disabled ?? false}>
        <SelectTrigger id={selectId} className="w-full">
          <SelectValue placeholder="雛形を選択..." />
        </SelectTrigger>
        {/* SelectContent は body へ Portal されるため、既定の Z_INDEX.dropdown (25) では
            Dialog (90) の Portal の背後に隠れる。このダイアログ内でのみ dialog より上に持ち上げる */}
        <SelectContent style={{ zIndex: Z_INDEX.dialog + 1 }}>
          {FAQ_ITEM_TEMPLATE_GROUPS.map((group) => {
            const items = FAQ_ITEM_TEMPLATES.filter(
              (template) => template.group === group,
            );
            if (items.length === 0) return null;
            return (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {items.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.question}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        選択すると質問・回答欄の内容を上書きします。
      </p>
    </div>
  );
}
