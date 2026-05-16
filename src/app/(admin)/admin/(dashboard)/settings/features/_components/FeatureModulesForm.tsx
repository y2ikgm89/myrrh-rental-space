"use client";

/**
 * Feature Module ON/OFF 切替フォーム — Phase 1 Task 6 conform 移行
 *
 * Sanity / Stripe Capabilities 流の declarative composition pattern。
 * 9 module の boolean を一括 PATCH。`requires` 依存元が OFF の module は
 * Switch を disabled 化（保存値は実 UI 入力を保持し、runtime 解決で fail-closed）。
 *
 * `useFormAction` (RHF) → `useActionState` + `useForm` (@conform-to/react)
 * clean break 移行。9 module の boolean Switch は `useInputControl` + hidden
 * input で "on" / "" sync、`z.boolean()` で `parseWithZod` 自動 coerce。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FieldMetadata } from "@conform-to/react";
import { getFormProps, useForm, useInputControl } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import { updateFeatureModulesSettings } from "@/admin/actions/settings";
import { featureModulesSettingsSchema } from "@/admin/actions/settings/schemas/basic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import type { FeatureModule } from "@/shared/lib/features/registry";

interface ModuleDef {
  readonly id: FeatureModule;
  readonly label: string;
  readonly description: string;
  readonly requires: readonly FeatureModule[];
  readonly publicRoutes: readonly string[];
}

interface FeatureModulesFormProps {
  readonly initialValues: Record<FeatureModule, boolean>;
  readonly moduleDefs: readonly ModuleDef[];
}

export function FeatureModulesForm({
  initialValues,
  moduleDefs,
}: FeatureModulesFormProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateFeatureModulesSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "feature-modules-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: featureModulesSettingsSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: Object.fromEntries(
      moduleDefs.map((mod) => [mod.id, initialValues[mod.id] ? "on" : ""]),
    ),
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("機能モジュールを保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>機能モジュール ON/OFF</CardTitle>
          <CardDescription>
            OFF にした機能は公開ページが 404
            になり、ナビゲーション・サイトマップ・関連 cron
            ジョブから自動除外されます。データベース上の既存データは保持されます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {moduleDefs.map((mod) => {
            const field = fields[mod.id];
            if (!field) return null;
            return (
              <ModuleSwitchRow
                key={mod.id}
                mod={mod}
                moduleDefs={moduleDefs}
                field={field}
                isPending={isPending}
              />
            );
          })}
          <div className="flex justify-end pt-2">
            <SubmitButton
              isPending={isPending}
              label="保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

/**
 * 1 module 分の Switch 行 — `useInputControl` で per-module state を持つ。
 * useInputControl は Hook のため map() 内で直接呼べず、sub-component に
 * 切り出して各行で個別に呼ぶ canonical pattern。
 */
function ModuleSwitchRow({
  mod,
  moduleDefs,
  field,
  isPending,
}: {
  readonly mod: ModuleDef;
  readonly moduleDefs: readonly ModuleDef[];
  readonly field: FieldMetadata<string>;
  readonly isPending: boolean;
}) {
  const control = useInputControl(field);
  const isOn = control.value === "on";

  return (
    <div className="flex items-start justify-between rounded-lg border p-4">
      <div className="space-y-1">
        <label htmlFor={field.id} className="cursor-pointer font-medium">
          {mod.label}
        </label>
        <p className="text-xs text-muted-foreground">{mod.description}</p>
        {mod.publicRoutes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">影響ルート:</span>{" "}
            {mod.publicRoutes.join(", ")}
          </p>
        )}
        {mod.requires.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">依存:</span>{" "}
            {mod.requires
              .map((req) => `「${labelFor(moduleDefs, req)}」`)
              .join(" + ")}
            （OFF にすると本機能も自動的に OFF として扱われます）
          </p>
        )}
        {field.errors && (
          <p id={field.errorId} className="text-xs text-destructive">
            {field.errors.join(", ")}
          </p>
        )}
      </div>
      <Switch
        id={field.id}
        checked={isOn}
        onCheckedChange={(checked) => control.change(checked ? "on" : "")}
        onBlur={control.blur}
        disabled={isPending}
      />
      <input type="hidden" name={field.name} value={control.value ?? ""} />
    </div>
  );
}

function labelFor(defs: readonly ModuleDef[], id: FeatureModule): string {
  return defs.find((d) => d.id === id)?.label ?? id;
}
