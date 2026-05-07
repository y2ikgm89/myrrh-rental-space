"use client";

/**
 * Feature Module ON/OFF 切替フォーム
 *
 * Sanity / Stripe Capabilities 流の declarative composition pattern。
 * 9 module の boolean を一括 PATCH。`requires` 依存元が OFF の module は
 * Switch を disabled 化（保存値は実 UI 入力を保持し、runtime 解決で fail-closed）。
 */

import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateFeatureModulesSettings } from "@/admin/actions/settings";
import { featureModulesSettingsSchema } from "@/admin/actions/settings/schemas/basic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { useWatch } from "react-hook-form";
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
  const { form, isPending, onSubmit } = useFormAction(
    featureModulesSettingsSchema,
    (data) => updateFeatureModulesSettings(data),
    {
      defaultValues: initialValues,
      refresh: true,
      successMessage: "機能モジュールを保存しました",
    },
  );

  // 全 module の現在値を監視（依存先 OFF の表示判定に使う）
  const watched = useWatch({ control: form.control });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
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
              // 依存元 module のいずれかが OFF なら自身も実質 OFF
              const requiredDisabled = mod.requires.some(
                (req) => watched[req] === false,
              );
              const lockedReason =
                requiredDisabled && mod.requires.length > 0
                  ? mod.requires
                      .filter((req) => watched[req] === false)
                      .map((req) => `「${labelFor(moduleDefs, req)}」`)
                      .join(" + ")
                  : null;

              return (
                <FormField
                  key={mod.id}
                  control={form.control}
                  name={mod.id}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-start justify-between rounded-lg border p-4">
                        <div className="space-y-1">
                          <FormLabel className="font-medium">
                            {mod.label}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {mod.description}
                          </p>
                          {mod.publicRoutes.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium">影響ルート:</span>{" "}
                              {mod.publicRoutes.join(", ")}
                            </p>
                          )}
                          {lockedReason && (
                            <p className="text-xs text-warning">
                              {lockedReason}
                              が無効のため、保存しても自動的に OFF
                              として扱われます
                            </p>
                          )}
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isPending}
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              );
            })}
            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

function labelFor(defs: readonly ModuleDef[], id: FeatureModule): string {
  return defs.find((d) => d.id === id)?.label ?? id;
}
