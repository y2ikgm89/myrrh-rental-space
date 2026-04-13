"use client";

/**
 * 規約設定フィールド
 *
 * タイトル・スラッグ・規約タイプ表示・予約必須・フッター表示
 * TabsContent のラップは呼び出し側で行う（create モードでは Tabs なしで使用するため）
 */

import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Checkbox, Input, Label } from "@/admin/components/ui";
import { TERMS_TYPES } from "@/shared/lib/validations/terms";
import type { TermsFormData } from "./terms-helpers";

interface TermsSettingsFieldsProps {
  isPending: boolean;
  control: Control<TermsFormData>;
  register: UseFormRegister<TermsFormData>;
  errors: FieldErrors<TermsFormData>;
}

export function TermsSettingsFields({
  isPending,
  control,
  register: formRegister,
  errors,
}: TermsSettingsFieldsProps) {
  const slug = useWatch({ control, name: "slug" });
  const selectedTypeRaw = useWatch({ control, name: "type" });

  return (
    <div className="space-y-4">
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
          <p className="text-sm text-muted-foreground">
            {TERMS_TYPES.find((t) => t.value === selectedTypeRaw)?.label ??
              selectedTypeRaw}
          </p>
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

      <div className="border-t pt-4">
        <p className="text-xs text-muted-foreground">
          ショートカット: Ctrl/Cmd + S で保存
        </p>
      </div>
    </div>
  );
}
