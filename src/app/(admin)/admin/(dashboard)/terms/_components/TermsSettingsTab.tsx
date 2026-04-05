"use client";

/**
 * 設定タブ
 *
 * タイトル・スラッグ・規約タイプ・テンプレート選択
 */

import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { useWatch } from "react-hook-form";
import {
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsContent,
} from "@/admin/components/ui";
import { TERMS_TYPES, parseTermsType } from "@/shared/lib/validations/terms";
import {
  getTemplatesForType,
  type TermsTemplate,
} from "@/shared/lib/terms-templates";
import type { TermsFormData } from "./terms-helpers";

interface TermsSettingsTabProps {
  mode: "create" | "edit";
  isPending: boolean;
  control: Control<TermsFormData>;
  register: UseFormRegister<TermsFormData>;
  errors: FieldErrors<TermsFormData>;
  onTypeChange: (type: string) => void;
  onTemplateChange: (templateId: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function TermsSettingsTab({
  mode,
  isPending,
  control,
  register: formRegister,
  errors,
  onTypeChange,
  onTemplateChange,
}: TermsSettingsTabProps) {
  const slug = useWatch({ control, name: "slug" });
  const selectedTypeRaw = useWatch({ control, name: "type" });
  const selectedTemplate = useWatch({ control, name: "selectedTemplate" });

  const selectedType = parseTermsType(selectedTypeRaw);
  const templates: TermsTemplate[] = selectedType
    ? getTemplatesForType(selectedType)
    : [];

  return (
    <TabsContent value="settings" className="mt-4 space-y-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">タイトル *</Label>
          <Input
            id="title"
            placeholder="規約のタイトル"
            {...formRegister("title")}
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-xs text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">スラッグ *</Label>
          <Input
            id="slug"
            placeholder="terms-of-use"
            {...formRegister("slug")}
            disabled={isPending}
          />
          {errors.slug && (
            <p className="text-xs text-destructive">{errors.slug.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            URLに使用されます: /terms/{slug || "slug"}
          </p>
        </div>

        <div className="space-y-2">
          <Label>規約タイプ</Label>
          {mode === "edit" ? (
            <p className="text-sm text-muted-foreground">
              {TERMS_TYPES.find((t) => t.value === selectedTypeRaw)?.label ??
                selectedTypeRaw}
            </p>
          ) : (
            <Select
              value={selectedType ?? ""}
              onValueChange={(v) => onTypeChange(v)}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="規約タイプを選択" />
              </SelectTrigger>
              <SelectContent>
                {TERMS_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {errors.type && (
            <p className="text-xs text-destructive">{errors.type.message}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="requiredAtReservation"
            {...formRegister("requiredAtReservation")}
            disabled={isPending}
          />
          <Label htmlFor="requiredAtReservation" className="font-normal">
            予約フォームで同意必須
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="showInFooter"
            {...formRegister("showInFooter")}
            disabled={isPending}
          />
          <Label htmlFor="showInFooter" className="font-normal">
            フッターにリンク表示
          </Label>
        </div>
      </div>

      {/* テンプレート選択（create モードのみ） */}
      {mode === "create" && selectedType && templates.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <Label>テンプレートから作成</Label>
          <Select
            value={selectedTemplate || ""}
            onValueChange={onTemplateChange}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="テンプレートを選択..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blank">空白から作成</SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTemplate && selectedTemplate !== "blank" && (
            <p className="text-xs text-muted-foreground">
              {templates.find((t) => t.id === selectedTemplate)?.description}
            </p>
          )}
        </div>
      )}

      <div className="border-t pt-4">
        <p className="text-xs text-muted-foreground">
          ショートカット: Ctrl/Cmd + S で保存
        </p>
      </div>
    </TabsContent>
  );
}
